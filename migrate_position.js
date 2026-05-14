import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    console.log('Running migration: Adding position_x and position_z to shelves table...');
    await pool.query(`
      ALTER TABLE shelves 
      ADD COLUMN IF NOT EXISTS position_x NUMERIC, 
      ADD COLUMN IF NOT EXISTS position_z NUMERIC;
    `);
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrate();
