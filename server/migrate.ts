import pg from 'pg';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function letterToBayFace(letter: string, maxLetter: string): { bay: number; face: number } {
  const idx = letter.toLowerCase().charCodeAt(0) - 97; // a=0, b=1, ...
  const maxIdx = maxLetter.toLowerCase().charCodeAt(0) - 97;
  const totalPositions = maxIdx + 1; // f→6, d→4, b→2
  const half = totalPositions / 2;

  if (idx < half) {
    return { face: 1, bay: idx + 1 };                // Mặt trước: a→B1, b→B2, c→B3
  } else {
    return { face: 2, bay: totalPositions - idx };    // Mặt sau (U ngược)
  }
}

function getBayFaceForThuDuc(letter: string): { bay: number; face: number } {
  const code = letter.toLowerCase().charCodeAt(0);
  if (code >= 97 && code <= 102) { // a-f
    return { face: 2, bay: code - 96 }; // a=1, b=2, ..., f=6 (Mặt sau)
  } else if (code >= 103 && code <= 108) { // g-l
    return { face: 1, bay: code - 102 }; // g=1, h=2, ..., l=6 (Mặt trước)
  }
  return { face: 1, bay: 1 };
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting migration...');

    // 1. Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS campuses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shelves (
        id SERIAL PRIMARY KEY,
        campus_id INTEGER REFERENCES campuses(id) ON DELETE CASCADE,
        rack_number INTEGER NOT NULL,
        letter CHAR(1) NOT NULL,
        code VARCHAR(10) NOT NULL,
        dewey_start DECIMAL(10, 3) NOT NULL,
        dewey_end DECIMAL(10, 3) NOT NULL,
        bay INTEGER NOT NULL,
        face INTEGER NOT NULL,
        position_x DECIMAL(10, 2),
        position_z DECIMAL(10, 2),
        is_deleted BOOLEAN DEFAULT FALSE
      );

      -- Chuyển Unique Constraint sang Partial Index để hỗ trợ soft-delete
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shelves_campus_id_code_key') THEN
          ALTER TABLE shelves DROP CONSTRAINT shelves_campus_id_code_key;
        END IF;
      END $$;

      CREATE UNIQUE INDEX IF NOT EXISTS unique_active_shelf_idx ON shelves (campus_id, code) WHERE is_deleted = FALSE;
    `);
    console.log('✅ Tables created.');

    const dataDir = path.resolve(__dirname, '..');
    const files = [
      { file: 'Thu Duc Campus.xlsx', campus: 'Thu Duc' },
      { file: 'Sai Gon Campus.xlsx', campus: 'Sai Gon' },
    ];

    for (const { file, campus } of files) {
      const filePath = path.join(dataDir, file);
      console.log(`Reading ${file}...`);
      
      const wb = XLSX.readFile(filePath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      // Insert campus
      const campusRes = await client.query(
        'INSERT INTO campuses (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [campus]
      );
      const campusId = campusRes.rows[0].id;
      const zOffset = campus === 'Thu Duc' ? 6.5 : 17.0;

      // Group by rack for U-Shape logic
      const rawMap = new Map<number, any[]>();
      for (const row of rows) {
        const code = String(row['Code'] || '').trim().toLowerCase();
        const deweyStart = Number(row['DeweyStart'] || 0);
        const deweyEnd = Number(row['DeweyEnd'] || 0);

        if (!code) continue;
        const match = code.match(/^(\d+)([a-l])$/i);
        if (!match) continue;

        const rackNumber = parseInt(match[1], 10);
        const letter = match[2].toLowerCase();

        if (!rawMap.has(rackNumber)) rawMap.set(rackNumber, []);
        rawMap.get(rackNumber)!.push({ code, deweyStart, deweyEnd, rackNumber, letter });
      }

      for (const [, raws] of rawMap) {
        const maxLetter = raws.reduce((max, r) => r.letter > max ? r.letter : max, 'a');
        for (const raw of raws) {
          const { bay, face } = (campus === 'Thu Duc')
            ? getBayFaceForThuDuc(raw.letter)
            : letterToBayFace(raw.letter, maxLetter);

          // Tính tọa độ mặc định
          const positionX = (bay - 1) * 3.0;
          const positionZ = (campus === 'Thu Duc')
            ? (raw.rackNumber - 1 - zOffset) * 4.0
            : -(raw.rackNumber - 1 - zOffset) * 4.0;

          // Kiểm tra xem kệ này đã tồn tại theo vị trí (rack, bay, face) chưa
          // Điều này giúp match với các kệ trống đã tạo bởi seedGrid
          const existingByPos = await client.query(
            'SELECT id FROM shelves WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4 LIMIT 1',
            [campusId, raw.rackNumber, bay, face]
          );

          if (existingByPos.rows.length > 0) {
            // Nếu tồn tại vị trí -> Cập nhật thông tin Excel vào dòng đó
            await client.query(
              `UPDATE shelves SET 
                letter = $1, code = $2, dewey_start = $3, dewey_end = $4, 
                position_x = $5, position_z = $6, is_deleted = FALSE 
               WHERE id = $7`,
              [raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, positionX, positionZ, existingByPos.rows[0].id]
            );
          } else {
            // Kiểm tra theo mã code cũ (nếu có)
            const existingByCode = await client.query(
              'SELECT id FROM shelves WHERE campus_id = $1 AND code = $2 LIMIT 1',
              [campusId, raw.code]
            );

            if (existingByCode.rows.length > 0) {
              await client.query(
                `UPDATE shelves SET 
                  rack_number = $1, letter = $2, code = $3, dewey_start = $4, dewey_end = $5, 
                  bay = $6, face = $7, position_x = $8, position_z = $9, is_deleted = FALSE 
                 WHERE id = $10`,
                [raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face, positionX, positionZ, existingByCode.rows[0].id]
              );
            } else {
              // Nếu chưa có bất kỳ cái nào -> Insert mới
              await client.query(
                `INSERT INTO shelves (campus_id, rack_number, letter, code, dewey_start, dewey_end, bay, face, position_x, position_z, is_deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)`,
                [campusId, raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face, positionX, positionZ]
              );
            }
          }
        }
      }
      console.log(`✅ Migrated ${campus}.`);
    }

    console.log('🎉 Migration finished successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
