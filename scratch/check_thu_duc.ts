import pg from 'pg';
import dotenv from 'dotenv';

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
    console.log('Thu Duc Rack 1 Shelves:');
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
