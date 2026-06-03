import dotenv from 'dotenv';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { recalculateUShapeLabels, pool } from './bookService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      -- Create campuses table
      IF OBJECT_ID('campuses', 'U') IS NULL
      BEGIN
        CREATE TABLE campuses (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL
        );
      END;

      -- Create admins table
      IF OBJECT_ID('admins', 'U') IS NULL
      BEGIN
        CREATE TABLE admins (
          id INT IDENTITY(1,1) PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL
        );
      END;

      -- Create shelves table
      IF OBJECT_ID('shelves', 'U') IS NULL
      BEGIN
        CREATE TABLE shelves (
          id INT IDENTITY(1,1) PRIMARY KEY,
          campus_id INT FOREIGN KEY REFERENCES campuses(id) ON DELETE CASCADE,
          rack_number INT NOT NULL,
          letter CHAR(1) NOT NULL,
          code VARCHAR(10) NOT NULL,
          dewey_start DECIMAL(10, 3) NOT NULL,
          dewey_end DECIMAL(10, 3) NOT NULL,
          bay INT NOT NULL,
          face INT NOT NULL,
          position_x DECIMAL(10, 2),
          position_z DECIMAL(10, 2),
          is_deleted BIT DEFAULT 0,
          original_letter CHAR(1),
          original_code VARCHAR(10),
          original_dewey_start DECIMAL(10, 3),
          original_dewey_end DECIMAL(10, 3),
          hidden_at DATETIMEOFFSET
        );
      END;

      -- Thêm cột nếu bảng đã tồn tại nhưng thiếu
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'original_letter')
      BEGIN
        ALTER TABLE shelves ADD original_letter CHAR(1) NULL;
      END;

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'original_code')
      BEGIN
        ALTER TABLE shelves ADD original_code VARCHAR(10) NULL;
      END;

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'original_dewey_start')
      BEGIN
        ALTER TABLE shelves ADD original_dewey_start DECIMAL(10, 3) NULL;
      END;

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'original_dewey_end')
      BEGIN
        ALTER TABLE shelves ADD original_dewey_end DECIMAL(10, 3) NULL;
      END;

      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'hidden_at')
      BEGIN
        ALTER TABLE shelves ADD hidden_at DATETIMEOFFSET NULL;
      END;

      -- Xóa constraint nếu tồn tại
      IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'shelves_campus_id_code_key')
      BEGIN
        ALTER TABLE shelves DROP CONSTRAINT shelves_campus_id_code_key;
      END;

      -- Tạo Filtered Index tương đương Partial Index của Postgres
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'unique_active_shelf_idx' AND object_id = OBJECT_ID('shelves'))
      BEGIN
        CREATE UNIQUE INDEX unique_active_shelf_idx ON shelves (campus_id, code) WHERE is_deleted = 0;
      END;
    `);
    console.log('✅ Tables created.');

    // 1.5. Seed admin account if none exist
    const adminCheck = await client.query('SELECT id FROM admins');
    if (adminCheck.rows.length === 0) {
      console.log('👤 Seeding default admin account...');
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(adminPass, 10);
      await client.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [adminUser, passwordHash]
      );
      console.log(`👤 Admin account seeded (username: ${adminUser}).`);
    }

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
      let campusId: number;
      const checkRes = await client.query('SELECT id FROM campuses WHERE name = $1', [campus]);
      if (checkRes.rows.length > 0) {
        campusId = checkRes.rows[0].id;
      } else {
        const insertRes = await client.query('INSERT INTO campuses (name) OUTPUT INSERTED.id VALUES ($1)', [campus]);
        campusId = insertRes.rows[0].id;
      }

      // RESET/BACKUP: Đặt lại toàn bộ kệ của cơ sở này về ẩn để khôi phục chuẩn
      console.log(`🔄 Performing full reset for ${campus} campus...`);
      await client.query(
        'UPDATE shelves SET is_deleted = 1, dewey_start = 0, dewey_end = 0 WHERE campus_id = $1',
        [campusId]
      );

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
            'SELECT TOP 1 id FROM shelves WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4',
            [campusId, raw.rackNumber, bay, face]
          );

          if (existingByPos.rows.length > 0) {
            // Nếu tồn tại vị trí -> Cập nhật thông tin Excel vào dòng đó
            await client.query(
              `UPDATE shelves SET 
                letter = $1, code = $2, dewey_start = $3, dewey_end = $4, 
                position_x = $5, position_z = $6, is_deleted = 0,
                original_letter = $1, original_code = $2,
                original_dewey_start = $3, original_dewey_end = $4
               WHERE id = $7`,
              [raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, positionX, positionZ, existingByPos.rows[0].id]
            );
          } else {
            // Kiểm tra theo mã code cũ (nếu có)
            const existingByCode = await client.query(
              'SELECT TOP 1 id FROM shelves WHERE campus_id = $1 AND code = $2',
              [campusId, raw.code]
            );

            if (existingByCode.rows.length > 0) {
              await client.query(
                `UPDATE shelves SET 
                  rack_number = $1, letter = $2, code = $3, dewey_start = $4, dewey_end = $5, 
                  bay = $6, face = $7, position_x = $8, position_z = $9, is_deleted = 0,
                  original_letter = $2, original_code = $3,
                  original_dewey_start = $4, original_dewey_end = $5
                 WHERE id = $10`,
                [raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face, positionX, positionZ, existingByCode.rows[0].id]
              );
            } else {
              // Nếu chưa có bất kỳ cái nào -> Insert mới
              await client.query(
                `INSERT INTO shelves (campus_id, rack_number, letter, code, dewey_start, dewey_end, bay, face, position_x, position_z, is_deleted, original_letter, original_code, original_dewey_start, original_dewey_end)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $3, $4, $5, $6)`,
                [campusId, raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face, positionX, positionZ]
              );
            }
          }
        }
      }

      // Thu thập và tính toán lại nhãn U-Shape/Z-Shape cho toàn bộ kệ
      const racksToRecalculate = new Set<number>();
      for (const [, raws] of rawMap) {
        for (const raw of raws) {
          racksToRecalculate.add(raw.rackNumber);
        }
      }

      console.log(`⚙️ Recalculating dynamic labels & Dewey ranges for ${campus}...`);
      for (const rackNumber of racksToRecalculate) {
        await recalculateUShapeLabels(campusId, rackNumber);
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
