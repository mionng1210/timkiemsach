import pg from 'pg';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

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
      DROP TABLE IF EXISTS shelves;
      DROP TABLE IF EXISTS campuses;

      CREATE TABLE campuses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );

      CREATE TABLE shelves (
        id SERIAL PRIMARY KEY,
        campus_id INTEGER REFERENCES campuses(id) ON DELETE CASCADE,
        rack_number INTEGER NOT NULL,
        letter CHAR(1) NOT NULL,
        code VARCHAR(10) NOT NULL,
        dewey_start DECIMAL(10, 3) NOT NULL,
        dewey_end DECIMAL(10, 3) NOT NULL,
        bay INTEGER NOT NULL,
        face INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        UNIQUE(campus_id, code)
      );
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

          await client.query(
            `INSERT INTO shelves (campus_id, rack_number, letter, code, dewey_start, dewey_end, bay, face)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (campus_id, code) DO NOTHING`,
            [campusId, raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face]
          );
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
