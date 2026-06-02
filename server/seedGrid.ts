import dotenv from 'dotenv';
import { pool } from './bookService.js';

dotenv.config();

async function seedGrid() {
  console.log('--- Bắt đầu tạo Grid Shelves ---');

  try {
    const campusesRes = await pool.query('SELECT id, name FROM campuses');
    const campuses = campusesRes.rows;

    const numBays = 10;
    const numRows = 50;

    for (const campus of campuses) {
      console.log(`\nĐang xử lý cơ sở: ${campus.name} (ID: ${campus.id})`);
      const zOffset = campus.name === 'Thu Duc' ? 6.5 : 17.0;

      let insertedCount = 0;
      let skippedCount = 0;

      for (let rackIdx = 0; rackIdx < numRows; rackIdx++) {
        // Rack Number = rackIdx + 1 (1 to 50)
        const rackNumber = rackIdx + 1;

        for (let bayIdx = 0; bayIdx < numBays; bayIdx++) {
          // Bay = bayIdx + 1 (1 to 10)
          const bay = bayIdx + 1;

          // Tính tọa độ như trong BookshelfScene.tsx
          const positionX = bayIdx * 3.0;
          const positionZ = campus.name === 'Thu Duc'
            ? (rackIdx - zOffset) * 4.0
            : -(rackIdx - zOffset) * 4.0;

          // Mỗi Bay có 2 mặt (Face 1 và Face 2)
          for (const face of [1, 2]) {
            // Kiểm tra xem vị trí này đã có kệ chưa
            const checkRes = await pool.query(
              'SELECT id FROM shelves WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4',
              [campus.id, rackNumber, bay, face]
            );

            if (checkRes.rows.length === 0) {
              // Chưa có -> Tạo kệ ẩn (is_deleted = TRUE)
              await pool.query(`
                INSERT INTO shelves (code, dewey_start, dewey_end, campus_id, rack_number, letter, bay, face, position_x, position_z, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
              `, [
                '', // code trống
                0,  // dewey_start
                0,  // dewey_end
                campus.id,
                rackNumber,
                'A', // letter mặc định
                bay,
                face,
                positionX,
                positionZ
              ]);
              insertedCount++;
            } else {
              // Đã có (có thể do user tạo trước đó) -> Bỏ qua để không xóa dữ liệu
              skippedCount++;
              
              // (Tùy chọn) Cập nhật lại tọa độ nếu kệ cũ bị sai tọa độ
              // await pool.query(`UPDATE shelves SET position_x = $1, position_z = $2 WHERE id = $3`, [positionX, positionZ, checkRes.rows[0].id]);
            }
          }
        }
      }

      console.log(`[${campus.name}] Đã tạo thêm: ${insertedCount} kệ ẩn.`);
      console.log(`[${campus.name}] Đã bỏ qua (đã có dữ liệu): ${skippedCount} kệ.`);
    }

    console.log('\n--- Hoàn tất ---');
  } catch (error) {
    console.error('Lỗi khi seed grid:', error);
  } finally {
    await pool.end();
  }
}

seedGrid();
