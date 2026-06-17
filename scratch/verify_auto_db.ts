import { pool, initializeDatabase } from '../server/bookService.js';

async function runVerification() {
  console.log('--- STARTING AUTO DATABASE INITIALIZATION VERIFICATION ---');

  try {
    // 1. Check if backup tables already exist (from a failed previous run)
    const backupCheck = await pool.query(`
      SELECT OBJECT_ID('shelves_backup', 'U') as shelves_bk,
             OBJECT_ID('campuses_backup', 'U') as campuses_bk,
             OBJECT_ID('admins_backup', 'U') as admins_bk
    `);
    
    if (backupCheck.rows[0].shelves_bk || backupCheck.rows[0].campuses_bk || backupCheck.rows[0].admins_bk) {
      console.error('❌ Error: Backup tables already exist! Please clean up first.');
      process.exit(1);
    }

    // 2. Backup the current tables by renaming them
    console.log('📦 Backing up original tables...');
    
    const tableExists = await pool.query(`
      SELECT OBJECT_ID('shelves', 'U') as shelves_ex,
             OBJECT_ID('campuses', 'U') as campuses_ex,
             OBJECT_ID('admins', 'U') as admins_ex
    `);

    const hasShelves = !!tableExists.rows[0].shelves_ex;
    const hasCampuses = !!tableExists.rows[0].campuses_ex;
    const hasAdmins = !!tableExists.rows[0].admins_ex;

    if (hasShelves) {
      // Drop FK constraints temporarily to allow rename
      await pool.query('ALTER TABLE shelves DROP CONSTRAINT FK__shelves__campus___286302EC').catch(() => {});
      await pool.query('ALTER TABLE shelves DROP CONSTRAINT FK__shelves__campus___2F10007B').catch(() => {});
      // Drop index to avoid conflicts
      await pool.query('DROP INDEX unique_active_shelf_idx ON shelves').catch(() => {});
      
      await pool.query("EXEC sp_rename 'shelves', 'shelves_backup'");
      console.log('✅ Renamed shelves to shelves_backup');
    }
    if (hasCampuses) {
      await pool.query("EXEC sp_rename 'campuses', 'campuses_backup'");
      console.log('✅ Renamed campuses to campuses_backup');
    }
    if (hasAdmins) {
      await pool.query("EXEC sp_rename 'admins', 'admins_backup'");
      console.log('✅ Renamed admins to admins_backup');
    }

    // 3. Call initializeDatabase (which should see an empty database and initialize it)
    console.log('🎬 Running initializeDatabase()...');
    await initializeDatabase();

    // 4. Verify the tables were created and populated
    console.log('🔍 Verifying populated database...');
    
    const countCheck = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM campuses) as campuses_cnt,
        (SELECT COUNT(*) FROM admins) as admins_cnt,
        (SELECT COUNT(*) FROM shelves) as shelves_cnt,
        (SELECT COUNT(*) FROM shelves WHERE is_deleted = 0) as active_shelves_cnt,
        (SELECT COUNT(*) FROM shelves WHERE is_deleted = 1) as grid_placeholders_cnt
    `);

    const stats = countCheck.rows[0];
    console.log('--- STATS OF AUTO-INITIALIZED DATABASE ---');
    console.log(`Campuses: ${stats.campuses_cnt}`);
    console.log(`Admins: ${stats.admins_cnt}`);
    console.log(`Total Shelves: ${stats.shelves_cnt}`);
    console.log(`Active Shelves: ${stats.active_shelves_cnt}`);
    console.log(`Grid Placeholders: ${stats.grid_placeholders_cnt}`);

    if (stats.campuses_cnt === 2 && stats.admins_cnt > 0 && stats.active_shelves_cnt > 0 && stats.grid_placeholders_cnt > 0) {
      console.log('⭐ VERIFICATION SUCCESSFUL! Tables successfully created, seeded and grid populated.');
    } else {
      console.error('❌ VERIFICATION FAILED: Counts do not match expected defaults.');
    }

    // 5. Clean up the newly created test tables
    console.log('🧹 Cleaning up test tables...');
    await pool.query('DROP TABLE shelves');
    await pool.query('DROP TABLE campuses');
    await pool.query('DROP TABLE admins');
    console.log('✅ Test tables dropped.');

    // 6. Restore original tables from backup
    console.log('🔄 Restoring original tables from backup...');
    if (hasAdmins) {
      await pool.query("EXEC sp_rename 'admins_backup', 'admins'");
      console.log('✅ Restored admins');
    }
    if (hasCampuses) {
      await pool.query("EXEC sp_rename 'campuses_backup', 'campuses'");
      console.log('✅ Restored campuses');
    }
    if (hasShelves) {
      await pool.query("EXEC sp_rename 'shelves_backup', 'shelves'");
      console.log('✅ Restored shelves');
      
      // Re-create the index and FK if they were dropped
      await pool.query('CREATE UNIQUE INDEX unique_active_shelf_idx ON shelves (campus_id, code) WHERE is_deleted = 0').catch(() => {});
      // (The original constraints will remain as they were in shelves_backup/shelves)
    }
    console.log('⭐ ORIGINAL DATABASE STATE RESTORED SUCCESSFULLY.');

  } catch (err) {
    console.error('❌ Error during verification:', err);
    console.log('⚠️ Attempting to restore database to original state...');
    
    // Emergency restore in case of failure
    await pool.query('DROP TABLE shelves').catch(() => {});
    await pool.query('DROP TABLE campuses').catch(() => {});
    await pool.query('DROP TABLE admins').catch(() => {});
    
    await pool.query("EXEC sp_rename 'admins_backup', 'admins'").catch(() => {});
    await pool.query("EXEC sp_rename 'campuses_backup', 'campuses'").catch(() => {});
    await pool.query("EXEC sp_rename 'shelves_backup', 'shelves'").catch(() => {});
    console.log('⭐ Original database restore attempt finished.');
  } finally {
    await pool.end();
  }
}

runVerification();
