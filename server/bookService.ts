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

export async function ensureShelfMetadataColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE shelves ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ
  `);
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
      SELECT s.id, 
             COALESCE(s.original_dewey_start, s.dewey_start) as "deweyStart", 
             COALESCE(s.original_dewey_end, s.dewey_end) as "deweyEnd", 
             COALESCE(s.original_code, s.code) as "code",
             s.is_deleted as "isDeleted"
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

export async function lookupShelfByCode(campusName: string, code: string) {
  try {
    const res = await pool.query(`
      SELECT s.id, 
             COALESCE(s.dewey_start, s.original_dewey_start) as "deweyStart", 
             COALESCE(s.dewey_end, s.original_dewey_end) as "deweyEnd", 
             COALESCE(s.original_code, s.code) as "code",
             s.is_deleted as "isDeleted",
             s.hidden_at as "hiddenAt"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND (LOWER(s.original_code) = LOWER($2) OR LOWER(s.code) = LOWER($2))
      ORDER BY s.is_deleted DESC, s.hidden_at DESC NULLS LAST, s.id DESC
      LIMIT 1
    `, [campusName, code]);

    if (res.rows.length > 0) return res.rows[0];
    return null;
  } catch (err) {
    console.error('Error looking up shelf by code:', err);
    return null;
  }
}

async function getRackOriginalMaxBay(campusId: number, rackNumber: number, campusName: string): Promise<number> {
  const isThuDuc = campusName.toLowerCase().includes('thu duc');
  if (isThuDuc) return 6; // Thu Duc is always 6 bays

  // Sai Gon: find maximum original_letter
  const res = await pool.query(`
    SELECT original_letter 
    FROM shelves
    WHERE campus_id = $1 AND rack_number = $2 AND original_letter IS NOT NULL
  `, [campusId, rackNumber]);

  if (res.rows.length === 0) {
    return 6; // Default fallback
  }

  let maxIdx = 0;
  for (const row of res.rows) {
    const idx = row.original_letter.trim().toLowerCase().charCodeAt(0) - 97;
    if (idx > maxIdx) maxIdx = idx;
  }

  const totalPositions = maxIdx + 1;
  return Math.ceil(totalPositions / 2);
}

function getPristineLetter(campusName: string, bay: number, face: number, maxBay: number): string {
  const isThuDuc = campusName.toLowerCase().includes('thu duc');
  if (isThuDuc) {
    if (face === 2) {
      return String.fromCharCode(96 + bay).toLowerCase(); // a-f
    } else {
      return String.fromCharCode(96 + 6 + bay).toLowerCase(); // g-l
    }
  } else {
    // Sai Gon
    const totalPositions = maxBay * 2;
    if (face === 1) {
      return String.fromCharCode(96 + bay).toLowerCase(); // a-f
    } else {
      return String.fromCharCode(96 + totalPositions - bay + 1).toLowerCase(); // g-l
    }
  }
}

export async function recalculateUShapeLabels(campusId: number, rackNumber: number): Promise<void> {
  try {
    // Get campus name
    const campusRes = await pool.query('SELECT name FROM campuses WHERE id = $1', [campusId]);
    if (campusRes.rows.length === 0) return;
    const campusName = campusRes.rows[0].name;

    const currentMaxBay = await getRackOriginalMaxBay(campusId, rackNumber, campusName);

    // 1. Reset original_letter = NULL for dummy/seeded shelves that were never imported
    await pool.query(`
      UPDATE shelves 
      SET original_letter = NULL, original_code = NULL 
      WHERE campus_id = $1 AND rack_number = $2 AND code = '' AND (original_dewey_start = 0 OR original_dewey_start IS NULL)
    `, [campusId, rackNumber]);

    // 2. Snapshot display dewey map TRƯỚC KHI thay đổi bất kỳ thứ gì
    //    Lấy từ các kệ ĐANG HIỂN THỊ (active, có code hợp lệ — không phải temp code)
    const displayRes = await pool.query(`
      SELECT LOWER(TRIM(letter)) as "letter",
             dewey_start as "deweyStart",
             dewey_end as "deweyEnd"
      FROM shelves
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
        AND code NOT LIKE 'T_%'
        AND letter IS NOT NULL AND TRIM(letter) != ''
    `, [campusId, rackNumber]);

    const displayDeweyMap = new Map<string, { deweyStart: number, deweyEnd: number }>();
    for (const row of displayRes.rows) {
      if (row.letter) {
        displayDeweyMap.set(row.letter, {
          deweyStart: Number(row.deweyStart || 0),
          deweyEnd: Number(row.deweyEnd || 0)
        });
      }
    }

    // 3. Fallback dewey map từ các kệ ĐÃ XÓA (dùng hidden_at để ưu tiên bản gần nhất)
    //    Chỉ lấy kệ đã từng được hiển thị (hidden_at IS NOT NULL — loại bỏ kệ seed chưa bao giờ bật)
    const fallbackRes = await pool.query(`
      SELECT DISTINCT ON (LOWER(TRIM(letter)))
             LOWER(TRIM(letter)) as "letter",
             original_dewey_start as "deweyStart",
             original_dewey_end as "deweyEnd"
      FROM shelves
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = TRUE
        AND hidden_at IS NOT NULL
        AND letter IS NOT NULL AND TRIM(letter) != ''
      ORDER BY LOWER(TRIM(letter)), hidden_at DESC NULLS LAST
    `, [campusId, rackNumber]);

    const fallbackDeweyMap = new Map<string, { deweyStart: number, deweyEnd: number }>();
    for (const row of fallbackRes.rows) {
      if (row.letter && !displayDeweyMap.has(row.letter)) {
        fallbackDeweyMap.set(row.letter, {
          deweyStart: Number(row.deweyStart || 0),
          deweyEnd: Number(row.deweyEnd || 0)
        });
      }
    }

    // 4. Self-healing: Ensure all shelves have correct original_letter matching physical coordinates
    const allShelves = await pool.query(`
      SELECT id, bay, face, dewey_start, dewey_end, original_letter
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND (original_letter IS NOT NULL OR is_deleted = FALSE)
    `, [campusId, rackNumber]);

    for (const r of allShelves.rows) {
      const pristineLetter = getPristineLetter(campusName, r.bay, r.face, currentMaxBay);
      if (r.original_letter !== pristineLetter) {
        await pool.query(`
          UPDATE shelves 
          SET original_letter = $1::char(1), 
              original_code = rack_number::text || $1::text,
              original_dewey_start = COALESCE(original_dewey_start, dewey_start, 0),
              original_dewey_end = COALESCE(original_dewey_end, dewey_end, 0)
          WHERE id = $2
        `, [pristineLetter, r.id]);
      }
    }

    // 5. Get all active shelves (kèm code và dewey hiện tại để phân biệt temp vs real)
    const res = await pool.query(`
      SELECT id, bay, face, original_letter, code,
             dewey_start as "deweyStart", dewey_end as "deweyEnd"
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    const shelves = res.rows;
    if (shelves.length === 0) return;

    // Determine unique bays and map them to 1..N
    const uniqueBays = [...new Set(shelves.map(s => s.bay))].sort((a, b) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    // Calculate charIdx for each shelf and sort the shelves by charIdx
    const shelvesWithCharIdx = shelves.map(s => {
      const bayIdx = bayToIndex.get(s.bay) || 1;
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
        const letterChar = String.fromCharCode(96 + s.charIdx).toLowerCase(); // 'a', 'b', 'c'...
        const letter = letterChar.toUpperCase(); // 'A', 'B'...
        const newCode = `${rackNumber}${letterChar}`;

        // Ưu tiên: displayMap (dữ liệu đang hiển thị) > fallbackMap (dữ liệu kệ đã xóa) > own (kệ mới) > mặc định 0
        let dewey = displayDeweyMap.get(letterChar) || fallbackDeweyMap.get(letterChar);
        if (!dewey) {
          if (s.code && s.code.startsWith('T_')) {
            // Kệ mới vừa được thêm bởi addShelf — dùng giá trị Dewey từ form nhập
            dewey = { deweyStart: Number(s.deweyStart || 0), deweyEnd: Number(s.deweyEnd || 0) };
          } else {
            dewey = { deweyStart: 0, deweyEnd: 0 };
          }
        }

        await pool.query(`
          UPDATE shelves 
          SET code = $1, letter = $2, dewey_start = $3, dewey_end = $4,
              original_code = $1, original_dewey_start = $3, original_dewey_end = $4,
              hidden_at = NULL
          WHERE id = $5
        `, [newCode, letter, dewey.deweyStart, dewey.deweyEnd, s.id]);
      }
    }

    // Lưu dữ liệu Dewey "mồ côi" — các vị trí display từng có dữ liệu
    // nhưng không còn trong layout mới (vì N giảm). Lưu vào seed shelves
    // (chưa bao giờ bật) để fallbackDeweyMap tìm lại khi bay được bật lại.
    // KHÔNG tái sử dụng deleted shelf thật vì sẽ ghi đè original_dewey của chúng.
    const usedLetters = new Set<string>();
    for (const s of shelvesWithCharIdx) {
      if (s.charIdx > 0) usedLetters.add(String.fromCharCode(96 + s.charIdx));
    }

    for (const [letter, dewey] of displayDeweyMap.entries()) {
      if (usedLetters.has(letter)) continue; // Đã gán cho active shelf, bỏ qua
      if (dewey.deweyStart === 0 && dewey.deweyEnd === 0) continue; // Không cần lưu zero

      // Ưu tiên 1: tìm deleted shelf đã có letter trùng → chỉ cập nhật dewey
      const matchRes = await pool.query(`
        UPDATE shelves 
        SET original_dewey_start = $1, original_dewey_end = $2, dewey_start = $1, dewey_end = $2
        WHERE id = (
          SELECT id FROM shelves 
          WHERE campus_id = $3 AND rack_number = $4 AND is_deleted = TRUE AND hidden_at IS NOT NULL
            AND LOWER(TRIM(letter)) = $5
          ORDER BY hidden_at DESC NULLS LAST LIMIT 1
        ) RETURNING id
      `, [dewey.deweyStart, dewey.deweyEnd, campusId, rackNumber, letter]);

      if (matchRes.rows.length === 0) {
        // Ưu tiên 2: dùng seed shelf (chưa từng bật, code rỗng) — an toàn, không ghi đè kệ đã xóa thật
        await pool.query(`
          UPDATE shelves 
          SET letter = $1, dewey_start = $2, dewey_end = $3,
              original_dewey_start = $2, original_dewey_end = $3,
              hidden_at = NOW()
          WHERE id = (
            SELECT id FROM shelves 
            WHERE campus_id = $4 AND rack_number = $5 AND is_deleted = TRUE
              AND (code = '' OR code IS NULL) AND hidden_at IS NULL
            ORDER BY id ASC LIMIT 1
          )
        `, [letter.toUpperCase(), dewey.deweyStart, dewey.deweyEnd, campusId, rackNumber]);
      }
    }
  } catch (err) {
    console.error('Error recalculating U-shape labels:', err);
  }
}

export async function updateShelf(id: number, data: Partial<ShelfRow>): Promise<boolean> {
  try {
    const deweyStartVal = (data.deweyStart !== undefined && data.deweyStart !== null && !isNaN(Number(data.deweyStart))) ? Number(data.deweyStart) : undefined;
    const deweyEndVal = (data.deweyEnd !== undefined && data.deweyEnd !== null && !isNaN(Number(data.deweyEnd))) ? Number(data.deweyEnd) : undefined;

    // Lấy thông tin campus, rack
    const infoRes = await pool.query(
      'SELECT campus_id as "campusId", rack_number as "rackNumber" FROM shelves WHERE id = $1',
      [id]
    );
    if (infoRes.rows.length === 0) return false;
    const { campusId, rackNumber } = infoRes.rows[0];

    // Cập nhật dewey trực tiếp trên kệ — recalculate sẽ snapshot giá trị này
    // qua displayDeweyMap và gán lại cho đúng vị trí display letter
    const fields: string[] = [];
    const values: any[] = [];
    let i = 1;

    if (deweyStartVal !== undefined) {
      fields.push(`dewey_start = $${i}`);
      values.push(deweyStartVal);
      i++;
    }
    if (deweyEndVal !== undefined) {
      fields.push(`dewey_end = $${i}`);
      values.push(deweyEndVal);
      i++;
    }

    if (fields.length > 0) {
      values.push(id);
      await pool.query(`
        UPDATE shelves SET ${fields.join(', ')} WHERE id = $${i}
      `, values);
    }

    if (campusId && rackNumber) {
      await recalculateUShapeLabels(campusId, rackNumber);
    }
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

    await pool.query(`
      UPDATE shelves 
      SET is_deleted = TRUE,
          original_code = code,
          original_dewey_start = dewey_start,
          original_dewey_end = dewey_end,
          hidden_at = NOW()
      WHERE id = $1
    `, [id]);

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
      UPDATE shelves 
      SET is_deleted = TRUE,
          original_code = code,
          original_dewey_start = dewey_start,
          original_dewey_end = dewey_end,
          hidden_at = NOW()
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

    // Sanitization & Fallback to prevent NOT NULL constraint violation on dewey_start/dewey_end
    const cleanDeweyStart = (deweyStart === null || deweyStart === undefined || isNaN(Number(deweyStart))) ? 0.0 : Number(deweyStart);
    const cleanDeweyEnd = (deweyEnd === null || deweyEnd === undefined || isNaN(Number(deweyEnd))) ? 0.0 : Number(deweyEnd);

    // Lấy campus_id từ name
    const campusRes = await pool.query('SELECT id FROM campuses WHERE LOWER(name) = LOWER($1)', [campusNameStr]);
    if (campusRes.rows.length === 0) return false;
    const campusId = campusRes.rows[0].id;

    const currentMaxBay = await getRackOriginalMaxBay(campusId, rackNumber as number, campusNameStr);
    const maxBay = Math.max(currentMaxBay, bay as number);

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
      const finalStart = cleanDeweyStart;
      const finalEnd = cleanDeweyEnd;

      const pristineLetter = getPristineLetter(campusNameStr, bay as number, face as number, maxBay);
      await pool.query(`
        UPDATE shelves 
        SET code = $1, dewey_start = $2, dewey_end = $3, letter = $4, 
            position_x = $5, position_z = $6, is_deleted = FALSE,
            hidden_at = NULL,
            original_letter = $7, original_code = $8,
            original_dewey_start = $9, original_dewey_end = $10
        WHERE id = $11
      `, [tempCode, finalStart, finalEnd, letter || 'A', positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`, finalStart, finalEnd, shelfId]);
    } else {
      // Dự phòng: Nếu vì lý do nào đó vị trí này chưa có (chưa chạy seed), thì insert mới hoàn toàn
      const pristineLetter = getPristineLetter(campusNameStr, bay as number, face as number, maxBay);
      await pool.query(`
        INSERT INTO shelves (code, dewey_start, dewey_end, campus_id, rack_number, letter, bay, face, position_x, position_z, is_deleted, original_letter, original_code, original_dewey_start, original_dewey_end)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, FALSE, $11, $12, $2, $3)
      `, [tempCode, cleanDeweyStart, cleanDeweyEnd, campusId, rackNumber, letter || 'A', bay, face, positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`]);
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
