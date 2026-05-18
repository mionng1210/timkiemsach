import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const { Pool, types } = pg;
// Parse PostgreSQL 'numeric' type (OID 1700) as float
types.setTypeParser(1700, (val) => parseFloat(val));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ===== Types =====
export interface ShelfRow {
  shelfId: number;
  code: string;        // VD: "10a"
  deweyStart: number;
  deweyEnd: number;
  campus: string;       // "Sai Gon" | "Thu Duc"
  rackNumber: number;   // Số kệ, VD: 10
  letter: string;       // Ký tự vị trí, VD: "a"
  bay: number;          // Bay 1-3
  face: number;         // Face 1 (trước) hoặc 2 (sau)
  positionX?: number;   // Tọa độ X tùy chỉnh
  positionZ?: number;   // Tọa độ Z tùy chỉnh
}

export interface RackInfo {
  rackNumber: number;
  shelves: ShelfRow[];
  bays: number[];
}

export interface CampusData {
  campus: string;
  racks: RackInfo[];
  totalShelves: number;
}

export interface SearchResult {
  shelf: ShelfRow;
  campus: string;
}

// ===== API Handlers =====

// Lấy layout kệ theo campus
export async function getRackLayout(campus: string): Promise<RackInfo[]> {
  try {
    const res = await pool.query(`
      SELECT s.id as "shelfId", s.code, s.dewey_start as "deweyStart", s.dewey_end as "deweyEnd", 
             c.name as campus, s.rack_number as "rackNumber", s.letter, s.bay, s.face,
             s.position_x as "positionX", s.position_z as "positionZ"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND s.is_deleted = FALSE
      ORDER BY s.rack_number, s.letter
    `, [campus]);

    const shelves: ShelfRow[] = res.rows;
    const rackMap = new Map<number, ShelfRow[]>();

    for (const s of shelves) {
      if (!rackMap.has(s.rackNumber)) rackMap.set(s.rackNumber, []);
      rackMap.get(s.rackNumber)!.push(s);
    }

    return [...rackMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rackNumber, shelfList]) => {
        const uniqueBays = [...new Set(shelfList.map(s => s.bay))].sort((a, b) => a - b);
        return {
          rackNumber,
          shelves: shelfList,
          bays: uniqueBays,
        };
      });
  } catch (err) {
    console.error('Error getting rack layout:', err);
    return [];
  }
}

// Lấy danh sách campus
export async function getCampuses(): Promise<{ name: string; rackCount: number; shelfCount: number }[]> {
  try {
    const res = await pool.query(`
      SELECT c.name, 
             COUNT(DISTINCT s.rack_number) as "rackCount", 
             COUNT(s.id) as "shelfCount"
      FROM campuses c
      LEFT JOIN shelves s ON c.id = s.campus_id AND s.is_deleted = FALSE
      GROUP BY c.id, c.name
    `);
    return res.rows.map(r => ({
      name: r.name,
      rackCount: parseInt(r.rackCount),
      shelfCount: parseInt(r.shelfCount),
    }));
  } catch (err) {
    console.error('Error getting campuses:', err);
    return [];
  }
}

// Tìm kiếm theo Dewey number
export async function searchByDewey(deweyNumber: number, campusName?: string): Promise<SearchResult[]> {
  try {
    let query = `
      SELECT s.id as "shelfId", s.code, s.dewey_start as "deweyStart", s.dewey_end as "deweyEnd", 
             c.name as campus, s.rack_number as "rackNumber", s.letter, s.bay, s.face,
             s.position_x as "positionX", s.position_z as "positionZ"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE $1 >= s.dewey_start AND $1 <= s.dewey_end AND s.is_deleted = FALSE
    `;
    const params: any[] = [deweyNumber];

    if (campusName) {
      query += ` AND LOWER(c.name) = LOWER($2)`;
      params.push(campusName);
    }

    const res = await pool.query(query, params);
    return res.rows.map(s => ({ shelf: s, campus: s.campus }));
  } catch (err) {
    console.error('Error searching by dewey:', err);
    return [];
  }
}

// Tìm kiếm theo code (VD: "10a")
export async function searchByCode(code: string, campusName?: string): Promise<SearchResult[]> {
  try {
    let query = `
      SELECT s.id as "shelfId", s.code, s.dewey_start as "deweyStart", s.dewey_end as "deweyEnd", 
             c.name as campus, s.rack_number as "rackNumber", s.letter, s.bay, s.face,
             s.position_x as "positionX", s.position_z as "positionZ"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE s.code ILIKE $1 AND s.is_deleted = FALSE
    `;
    const params: any[] = [`%${code.trim()}%`];

    if (campusName) {
      query += ` AND LOWER(c.name) = LOWER($2)`;
      params.push(campusName);
    }

    const res = await pool.query(query, params);
    return res.rows.map(s => ({ shelf: s, campus: s.campus }));
  } catch (err) {
    console.error('Error searching by code:', err);
    return [];
  }
}

// ===== Admin CRUD Operations =====

// Tìm kệ theo vị trí (kể cả đã xóa) để lấy thông tin Dewey cũ
export async function lookupShelf(campusName: string, rackNumber: number, bay: number, face: number) {
  try {
    const res = await pool.query(`
      SELECT s.id, s.dewey_start as "deweyStart", s.dewey_end as "deweyEnd", s.is_deleted as "isDeleted"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND s.rack_number = $2 AND s.bay = $3 AND s.face = $4
    `, [campusName, rackNumber, bay, face]);

    if (res.rows.length > 0) return res.rows[0];
    return null;
  } catch (err) {
    console.error('Error looking up shelf:', err);
    return null;
  }
}

function getPristineLetter(campusName: string, bay: number, face: number): string {
  const isThuDuc = campusName.toLowerCase().includes('thu duc');
  if (isThuDuc) {
    if (face === 2) {
      return String.fromCharCode(96 + bay).toLowerCase(); // a-f
    } else {
      return String.fromCharCode(96 + 6 + bay).toLowerCase(); // g-l
    }
  } else {
    // Sai Gon
    if (face === 1) {
      return String.fromCharCode(96 + bay).toLowerCase(); // a-f
    } else {
      return String.fromCharCode(96 + 12 - bay + 1).toLowerCase(); // g-l
    }
  }
}

export async function recalculateUShapeLabels(campusId: number, rackNumber: number): Promise<void> {
  try {
    // Get campus name
    const campusRes = await pool.query('SELECT name FROM campuses WHERE id = $1', [campusId]);
    if (campusRes.rows.length === 0) return;
    const campusName = campusRes.rows[0].name;

    // 1. Reset original_letter = NULL for dummy/seeded shelves that were never imported
    await pool.query(`
      UPDATE shelves 
      SET original_letter = NULL, original_code = NULL 
      WHERE campus_id = $1 AND rack_number = $2 AND code = '' AND (original_dewey_start = 0 OR original_dewey_start IS NULL)
    `, [campusId, rackNumber]);

    // 2. Self-healing database check: Ensure all active shelves have original_letter populated
    const nullLetterShelves = await pool.query(`
      SELECT id, bay, face, dewey_start, dewey_end 
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND original_letter IS NULL AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    for (const r of nullLetterShelves.rows) {
      const pristineLetter = getPristineLetter(campusName, r.bay, r.face);
      await pool.query(`
        UPDATE shelves 
        SET original_letter = $1::char(1), 
            original_code = rack_number::text || $1::text,
            original_dewey_start = COALESCE(original_dewey_start, dewey_start, 0),
            original_dewey_end = COALESCE(original_dewey_end, dewey_end, 0)
        WHERE id = $2
      `, [pristineLetter, r.id]);
    }

    // Get all active shelves in this rack
    const res = await pool.query(`
      SELECT id, bay, face, original_letter
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    const shelves = res.rows;
    if (shelves.length === 0) return;

    // Load ALL original ranges for this rack (both active and deleted)
    const origRes = await pool.query(`
      SELECT original_letter as "letter", 
             original_dewey_start as "deweyStart", 
             original_dewey_end as "deweyEnd",
             face
      FROM shelves
      WHERE campus_id = $1 AND rack_number = $2 AND original_letter IS NOT NULL
    `, [campusId, rackNumber]);

    const origRangesByFace = {
      1: origRes.rows.filter(r => r.face === 1 && r.letter)
        .map(r => ({ letter: r.letter.toUpperCase().trim(), deweyStart: Number(r.deweyStart), deweyEnd: Number(r.deweyEnd) }))
        .sort((a, b) => a.letter.localeCompare(b.letter)),
      2: origRes.rows.filter(r => r.face === 2 && r.letter)
        .map(r => ({ letter: r.letter.toUpperCase().trim(), deweyStart: Number(r.deweyStart), deweyEnd: Number(r.deweyEnd) }))
        .sort((a, b) => a.letter.localeCompare(b.letter)),
    };

    // Determine unique bays and map them to 1..N
    const uniqueBays = [...new Set(shelves.map(s => s.bay))].sort((a, b) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    // Calculate charIdx for each shelf and sort the shelves by charIdx
    const shelvesWithCharIdx = shelves.map(s => {
      const bayIdx = bayToIndex.get(s.bay)!;
      let charIdx = 0;

      if (campusName === 'Sai Gon') {
        // Sài Gòn: Bắt đầu từ Mặt trước Bay 1 (face 1) - Dạng U-shape
        if (s.face === 1) {
          charIdx = bayIdx;
        } else {
          charIdx = 2 * N - bayIdx + 1;
        }
      } else {
        // Thủ Đức: Dạng Z-shape (song song)
        // Mặt sau (face 2) bắt đầu từ Bay 1 -> Bay N: index 1 -> N
        // Mặt trước (face 1) bắt đầu từ Bay 1 -> Bay N: index N + 1 -> 2 * N
        if (s.face === 2) {
          charIdx = bayIdx;
        } else {
          charIdx = N + bayIdx;
        }
      }
      return { ...s, charIdx };
    }).sort((a, b) => a.charIdx - b.charIdx);

    // Bước quan trọng: Tạm thời đổi mã code thành giá trị duy nhất (tạm thời) 
    // để tránh lỗi Unique Constraint khi cập nhật các mã chữ cái mới (ví dụ: a thành b, b thành a)
    await pool.query(`
      UPDATE shelves 
      SET code = 'T_' || id 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    for (let idx = 0; idx < shelvesWithCharIdx.length; idx++) {
      const s = shelvesWithCharIdx[idx];
      if (s.charIdx > 0) {
        const letter = String.fromCharCode(96 + s.charIdx).toUpperCase(); // 'A', 'B'...
        const newCode = `${rackNumber}${letter.toLowerCase()}`;
        
        // Map face-by-face using index of active shelves on this face
        const activeShelvesOnFace = shelvesWithCharIdx
          .filter(x => x.face === s.face)
          .sort((a, b) => a.bay - b.bay);

        const idxOnFace = activeShelvesOnFace.findIndex(x => x.id === s.id);
        const faceRanges = origRangesByFace[s.face as 1 | 2] || [];
        const dewey = faceRanges[idxOnFace] || { deweyStart: 0, deweyEnd: 0 };

        await pool.query(`
          UPDATE shelves 
          SET code = $1, letter = $2, dewey_start = $3, dewey_end = $4 
          WHERE id = $5
        `, [newCode, letter, dewey.deweyStart, dewey.deweyEnd, s.id]);
      }
    }
  } catch (err) {
    console.error('Error recalculating U-shape labels:', err);
  }
}

export async function updateShelf(id: number, data: Partial<ShelfRow>): Promise<boolean> {
  try {
    // Lấy thông tin về campus, rack và letter hiện tại của kệ đang active
    const infoRes = await pool.query(
      'SELECT campus_id as "campusId", rack_number as "rackNumber", letter FROM shelves WHERE id = $1',
      [id]
    );
    if (infoRes.rows.length === 0) return false;
    const { campusId, rackNumber, letter } = infoRes.rows[0];

    // Cập nhật dải Dewey gốc dựa trên original_letter
    if (letter) {
      const origFields: string[] = [];
      const origValues: any[] = [];
      let i = 1;
      if (data.deweyStart !== undefined) {
        origFields.push(`dewey_start = $${i}, original_dewey_start = $${i}`);
        i++;
        origValues.push(data.deweyStart);
      }
      if (data.deweyEnd !== undefined) {
        origFields.push(`dewey_end = $${i}, original_dewey_end = $${i}`);
        i++;
        origValues.push(data.deweyEnd);
      }
      if (origFields.length > 0) {
        origValues.push(campusId, rackNumber, letter.toUpperCase());
        await pool.query(`
          UPDATE shelves 
          SET ${origFields.join(', ')} 
          WHERE campus_id = $${i++} AND rack_number = $${i++} AND UPPER(original_letter) = $${i}
        `, origValues);
      }
    }

    // Cập nhật dải Dewey trên kệ active hiện tại
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (data.deweyStart !== undefined) {
      fields.push(`dewey_start = $${i++}`);
      values.push(data.deweyStart);
    }
    if (data.deweyEnd !== undefined) {
      fields.push(`dewey_end = $${i++}`);
      values.push(data.deweyEnd);
    }

    if (fields.length === 0) return false;

    values.push(id);
    await pool.query(`
      UPDATE shelves SET ${fields.join(', ')} WHERE id = $${i}
    `, values);
    return true;
  } catch (err) {
    console.error('Error updating shelf:', err);
    return false;
  }
}

export async function deleteShelf(id: number): Promise<boolean> {
  try {
    // Lấy thông tin rack để recalculate trước khi xóa
    const infoRes = await pool.query('SELECT campus_id, rack_number FROM shelves WHERE id = $1', [id]);
    
    await pool.query('UPDATE shelves SET is_deleted = TRUE WHERE id = $1', [id]);

    if (infoRes.rows.length > 0) {
      const { campus_id, rack_number } = infoRes.rows[0];
      await recalculateUShapeLabels(campus_id, rack_number);
    }
    return true;
  } catch (err) {
    console.error('Error deleting shelf:', err);
    return false;
  }
}

export async function deleteBay(campusName: string, rackNumber: number, bay: number): Promise<boolean> {
  try {
    const campusRes = await pool.query('SELECT id FROM campuses WHERE LOWER(name) = LOWER($1)', [campusName]);
    if (campusRes.rows.length === 0) return false;
    const campusId = campusRes.rows[0].id;

    await pool.query(`
      UPDATE shelves SET is_deleted = TRUE
      WHERE campus_id = $1 AND rack_number = $2 AND bay = $3
    `, [campusId, rackNumber, bay]);

    await recalculateUShapeLabels(campusId, rackNumber);
    return true;
  } catch (err) {
    console.error('Error deleting bay:', err);
    return false;
  }
}

export async function addShelf(data: Partial<ShelfRow>): Promise<boolean> {
  try {
    const { code, deweyStart, deweyEnd, campus, rackNumber, letter, bay, face, positionX, positionZ } = data;
    const campusNameStr = campus || '';
    
    // Lấy campus_id từ name
    const campusRes = await pool.query('SELECT id FROM campuses WHERE LOWER(name) = LOWER($1)', [campusNameStr]);
    if (campusRes.rows.length === 0) return false;
    const campusId = campusRes.rows[0].id;

    // Tìm kiếm vị trí kệ đã được "tạo sẵn" (pre-allocated) theo tọa độ/vị trí
    const existingRes = await pool.query(
      'SELECT id FROM shelves WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4', 
      [campusId, rackNumber, bay, face]
    );

    // Tạo một mã tạm thời duy nhất (tối đa 10 ký tự) để tránh xung đột Unique Constraint 
    // trước khi hàm recalculateUShapeLabels tính toán lại mã chuẩn
    const tempCode = `T_${Math.random().toString(36).substring(2, 9)}`;

    if (existingRes.rows.length > 0) {
      // Nếu vị trí này đã có (thường là kệ ẩn do script seedGrid tạo), ta chỉ việc "Bật" nó lên
      const shelfId = existingRes.rows[0].id;
      const pristineLetter = getPristineLetter(campusNameStr, bay as number, face as number);
      await pool.query(`
        UPDATE shelves 
        SET code = $1, dewey_start = $2, dewey_end = $3, letter = $4, 
            position_x = $5, position_z = $6, is_deleted = FALSE,
            original_letter = $7, original_code = $8,
            original_dewey_start = $2, original_dewey_end = $3
        WHERE id = $9
      `, [tempCode, deweyStart, deweyEnd, letter || 'A', positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`, shelfId]);
    } else {
      // Dự phòng: Nếu vì lý do nào đó vị trí này chưa có (chưa chạy seed), thì insert mới hoàn toàn
      const pristineLetter = getPristineLetter(campusNameStr, bay as number, face as number);
      await pool.query(`
        INSERT INTO shelves (code, dewey_start, dewey_end, campus_id, rack_number, letter, bay, face, position_x, position_z, is_deleted, original_letter, original_code, original_dewey_start, original_dewey_end)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $12, $2, $3)
      `, [tempCode, deweyStart, deweyEnd, campusId, rackNumber, letter || 'A', bay, face, positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`]);
    }
    
    if (campusId && rackNumber) {
      await recalculateUShapeLabels(campusId, rackNumber as number);
    }

    return true;
  } catch (err) {
    console.error('Error adding shelf:', err);
    return false;
  }
}

// Xác thực đăng nhập Admin
export async function loginAdmin(username: string, passwordPlain: string): Promise<boolean> {
  try {
    const res = await pool.query('SELECT password_hash FROM admins WHERE username = $1', [username]);
    if (res.rows.length === 0) return false;
    const { password_hash } = res.rows[0];
    const match = await bcrypt.compare(passwordPlain, password_hash);
    return match;
  } catch (error) {
    console.error('Lỗi xác thực admin:', error);
    return false;
  }
}
