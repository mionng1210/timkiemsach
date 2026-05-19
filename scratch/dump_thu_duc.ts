import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT s.id, s.rack_number, s.letter, s.code, s.dewey_start, s.dewey_end, s.bay, s.face, s.is_deleted,
             s.original_letter, s.original_dewey_start, s.original_dewey_end
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE c.name = 'Thu Duc' AND s.rack_number = 1
      ORDER BY s.face, s.bay
    `);
    
    fs.writeFileSync('scratch_thu_duc_dump.json', JSON.stringify(res.rows, null, 2));
    console.log('Dumped successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
