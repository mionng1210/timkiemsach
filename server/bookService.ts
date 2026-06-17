import sql from 'mssql';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';


dotenv.config();

const config: sql.config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '12345678aA',
  server: process.env.DB_SERVER === 'localhost' ? '127.0.0.1' : (process.env.DB_SERVER || '127.0.0.1'),
  database: process.env.DB_DATABASE || 'timkiemsach',
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true' ? true : false,
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  }
};

const globalPool = new sql.ConnectionPool(config);
const poolConnect = globalPool.connect().then(() => {
  console.log('✅ Connected to SQL Server');
}).catch((err) => {
  console.error('❌ SQL Server connection failed:', err);
});

// Prepare query helper for translation from PG style to SQL Server style
function prepareMssqlQuery(queryText: string, params: any[], request: sql.Request): string {
  let mssqlQuery = queryText;

  // 1. Chuyển đổi $1, $2... -> @p1, @p2...
  for (let i = 0; i < params.length; i++) {
    const paramName = `p${i + 1}`;
    mssqlQuery = mssqlQuery.replace(new RegExp(`\\$${i + 1}\\b`, 'g'), `@${paramName}`);
    request.input(paramName, params[i]);
  }

  // 2. Chuyển ILIKE -> LIKE
  mssqlQuery = mssqlQuery.replace(/\bILIKE\b/gi, 'LIKE');

  // 3. Chuyển TRUE/FALSE -> 1/0 cho BIT columns trong so sánh
  mssqlQuery = mssqlQuery.replace(/=\s*FALSE\b/gi, '= 0')
    .replace(/=\s*TRUE\b/gi, '= 1')
    .replace(/\bis_deleted\s+IS\s+FALSE\b/gi, 'is_deleted = 0')
    .replace(/\bis_deleted\s+IS\s+TRUE\b/gi, 'is_deleted = 1');

  return mssqlQuery;
}

export class MSSQLClient {
  private transaction: sql.Transaction;
  private hasBegun = false;

  constructor() {
    this.transaction = new sql.Transaction(globalPool);
  }

  async query(text: string, params: any[] = []) {
    const trimmed = text.trim().toUpperCase();
    if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      if (trimmed === 'BEGIN') {
        await this.transaction.begin();
        this.hasBegun = true;
      } else if (trimmed === 'COMMIT') {
        await this.transaction.commit();
        this.hasBegun = false;
      } else if (trimmed === 'ROLLBACK') {
        await this.transaction.rollback();
        this.hasBegun = false;
      }
      return { rows: [] };
    }

    if (!this.hasBegun) {
      const request = new sql.Request(globalPool);
      const query = prepareMssqlQuery(text, params, request);
      const res = await request.query(query);
      return { rows: res.recordset || [] };
    } else {
      const request = new sql.Request(this.transaction);
      const query = prepareMssqlQuery(text, params, request);
      const res = await request.query(query);
      return { rows: res.recordset || [] };
    }
  }

  async connect() {
    return this;
  }

  async release() {
    // Tự động giải phóng bởi mssql
  }
}

// Giả lập đối tượng pool của pg
export const pool = {
  connect: async () => {
    await poolConnect;
    return new MSSQLClient();
  },
  query: async (text: string, params: any[] = []) => {
    await poolConnect;
    const request = new sql.Request(globalPool);
    const query = prepareMssqlQuery(text, params, request);
    const res = await request.query(query);
    return { rows: res.recordset || [] };
  },
  end: async () => {
    await globalPool.close();
  }
};

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
  color?: string;       // Màu sắc mặt kệ đầu dãy
  hiddenFloors?: number[]; // Mảng các tầng bị ẩn (ví dụ: [2, 4])
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
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'hidden_at')
    BEGIN
      ALTER TABLE shelves ADD hidden_at DATETIMEOFFSET NULL;
    END
  `);
  await pool.query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'color')
    BEGIN
      ALTER TABLE shelves ADD color VARCHAR(7) NULL;
    END
  `);
  await pool.query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('shelves') AND name = 'hidden_floors')
    BEGIN
      ALTER TABLE shelves ADD hidden_floors VARCHAR(255) NULL;
    END
  `);
}

// ===== API Handlers =====

// Lấy layout kệ theo campus
export async function getRackLayout(campus: string): Promise<RackInfo[]> {
  try {
    const res = await pool.query(`
      SELECT s.id as "shelfId", s.code, s.dewey_start as "deweyStart", s.dewey_end as "deweyEnd", 
             c.name as campus, s.rack_number as "rackNumber", s.letter, s.bay, s.face,
             s.position_x as "positionX", s.position_z as "positionZ", s.color as "color",
             s.hidden_floors as "hiddenFloorsStr"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND s.is_deleted = FALSE
      ORDER BY s.rack_number, s.letter
    `, [campus]);

    const shelves: ShelfRow[] = res.rows.map(r => {
      let hiddenFloors: number[] = [6, 7, 8, 9];
      if (r.hiddenFloorsStr !== null && r.hiddenFloorsStr !== undefined) {
        try { hiddenFloors = JSON.parse(r.hiddenFloorsStr); } catch(e) {}
      }
      return { ...r, hiddenFloors };
    });
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
             s.position_x as "positionX", s.position_z as "positionZ", s.color as "color",
             s.hidden_floors as "hiddenFloorsStr"
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
    return res.rows.map(s => {
      let hiddenFloors: number[] = [6, 7, 8, 9];
      if (s.hiddenFloorsStr !== null && s.hiddenFloorsStr !== undefined) {
        try { hiddenFloors = JSON.parse(s.hiddenFloorsStr); } catch(e) {}
      }
      return { shelf: { ...s, hiddenFloors }, campus: s.campus };
    });
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
             s.position_x as "positionX", s.position_z as "positionZ", s.color as "color",
             s.hidden_floors as "hiddenFloorsStr"
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
    return res.rows.map(s => {
      let hiddenFloors: number[] = [6, 7, 8, 9];
      if (s.hiddenFloorsStr !== null && s.hiddenFloorsStr !== undefined) {
        try { hiddenFloors = JSON.parse(s.hiddenFloorsStr); } catch(e) {}
      }
      return { shelf: { ...s, hiddenFloors }, campus: s.campus };
    });
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
      SELECT TOP 1 s.id, 
             COALESCE(s.original_dewey_start, s.dewey_start) as "deweyStart", 
             COALESCE(s.original_dewey_end, s.dewey_end) as "deweyEnd", 
             COALESCE(s.original_code, s.code) as "code",
             s.is_deleted as "isDeleted",
             s.color as "color"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND s.rack_number = $2 AND s.bay = $3 AND s.face = $4
      ORDER BY s.is_deleted ASC, s.hidden_at DESC, s.id DESC
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
      SELECT TOP 1 s.id, 
             COALESCE(s.dewey_start, s.original_dewey_start) as "deweyStart", 
             COALESCE(s.dewey_end, s.original_dewey_end) as "deweyEnd", 
             COALESCE(s.original_code, s.code) as "code",
             s.is_deleted as "isDeleted",
             s.hidden_at as "hiddenAt",
             s.color as "color"
      FROM shelves s
      JOIN campuses c ON s.campus_id = c.id
      WHERE LOWER(c.name) = LOWER($1) AND (LOWER(s.original_code) = LOWER($2) OR LOWER(s.code) = LOWER($2))
      ORDER BY s.is_deleted DESC, s.hidden_at DESC, s.id DESC
    `, [campusName, code]);

    if (res.rows.length > 0) return res.rows[0];
    return null;
  } catch (err) {
    console.error('Error looking up shelf by code:', err);
    return null;
  }
}

async function getRackOriginalMaxBay(campusId: number, rackNumber: number, campusName: string, client?: MSSQLClient): Promise<number> {
  const db = client || pool;
  const isThuDuc = campusName.toLowerCase().includes('thu duc');
  if (isThuDuc) return 6; // Thu Duc is always 6 bays

  // Sai Gon: find maximum original_letter
  const res = await db.query(`
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

export async function recalculateUShapeLabels(campusId: number, rackNumber: number, client?: MSSQLClient): Promise<void> {
  const db = client || pool;
  try {
    // Get campus name
    const campusRes = await db.query('SELECT name FROM campuses WHERE id = $1', [campusId]);
    if (campusRes.rows.length === 0) return;
    const campusName = campusRes.rows[0].name;

    const currentMaxBay = await getRackOriginalMaxBay(campusId, rackNumber, campusName, client);

    // 1. Reset original_letter = NULL for dummy/seeded shelves that were never imported
    await db.query(`
      UPDATE shelves 
      SET original_letter = NULL, original_code = NULL 
      WHERE campus_id = $1 AND rack_number = $2 AND code = '' AND (original_dewey_start = 0 OR original_dewey_start IS NULL)
    `, [campusId, rackNumber]);

    // 2. Snapshot display dewey map TRƯỚC KHI thay đổi bất kỳ thứ gì
    //    Lấy từ các kệ ĐANG HIỂN THỊ (active, có code hợp lệ — không phải temp code)
    const displayRes = await db.query(`
      SELECT LOWER(LTRIM(RTRIM(letter))) as "letter",
             dewey_start as "deweyStart",
             dewey_end as "deweyEnd"
      FROM shelves
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
        AND code NOT LIKE 'T_%'
        AND letter IS NOT NULL AND LTRIM(RTRIM(letter)) != ''
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
    const fallbackRes = await db.query(`
      WITH CTE AS (
        SELECT LOWER(LTRIM(RTRIM(letter))) as "letter",
               original_dewey_start as "deweyStart",
               original_dewey_end as "deweyEnd",
               ROW_NUMBER() OVER (PARTITION BY LOWER(LTRIM(RTRIM(letter))) ORDER BY hidden_at DESC) as rn
        FROM shelves
        WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = TRUE
          AND hidden_at IS NOT NULL
          AND letter IS NOT NULL AND LTRIM(RTRIM(letter)) != ''
      )
      SELECT letter, deweyStart, deweyEnd
      FROM CTE
      WHERE rn = 1
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
    const allShelves = await db.query(`
      SELECT id, bay, face, dewey_start, dewey_end, original_letter
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND (original_letter IS NOT NULL OR is_deleted = FALSE)
    `, [campusId, rackNumber]);

    for (const r of allShelves.rows) {
      const pristineLetter = getPristineLetter(campusName, r.bay, r.face, currentMaxBay);
      if (r.original_letter !== pristineLetter) {
        await db.query(`
          UPDATE shelves 
          SET original_letter = CAST($1 AS CHAR(1)), 
              original_code = CAST(rack_number AS VARCHAR(10)) + CAST($1 AS VARCHAR(10)),
              original_dewey_start = COALESCE(original_dewey_start, dewey_start, 0),
              original_dewey_end = COALESCE(original_dewey_end, dewey_end, 0)
          WHERE id = $2
        `, [pristineLetter, r.id]);
      }
    }

    // 5. Get all active shelves (kèm code và dewey hiện tại để phân biệt temp vs real)
    const res = await db.query(`
      SELECT id, bay, face, original_letter, code,
             dewey_start as "deweyStart", dewey_end as "deweyEnd"
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    const shelves: any[] = res.rows;
    if (shelves.length === 0) return;

    // Determine unique bays and map them to 1..N
    const uniqueBays = [...new Set(shelves.map((s: any) => s.bay))].sort((a: any, b: any) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    // Calculate charIdx for each shelf and sort the shelves by charIdx
    const shelvesWithCharIdx = shelves.map((s: any) => {
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
    }).sort((a: any, b: any) => a.charIdx - b.charIdx);

    // Bước quan trọng: Tạm thời đổi mã code thành giá trị duy nhất (tạm thời) 
    // để tránh lỗi Unique Constraint khi cập nhật các mã chữ cái mới (ví dụ: a thành b, b thành a)
    await db.query(`
      UPDATE shelves 
      SET code = 'T_' + CAST(id AS VARCHAR(10)) 
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

        await db.query(`
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
      const matchRes = await db.query(`
        UPDATE shelves 
        SET original_dewey_start = $1, original_dewey_end = $2, dewey_start = $1, dewey_end = $2
        OUTPUT INSERTED.id
        WHERE id = (
          SELECT TOP 1 id FROM shelves 
          WHERE campus_id = $3 AND rack_number = $4 AND is_deleted = TRUE AND hidden_at IS NOT NULL
            AND LOWER(LTRIM(RTRIM(letter))) = $5
          ORDER BY hidden_at DESC
        )
      `, [dewey.deweyStart, dewey.deweyEnd, campusId, rackNumber, letter]);

      if (matchRes.rows.length === 0) {
        // Ưu tiên 2: dùng seed shelf (chưa từng bật, code rỗng) — an toàn, không ghi đè kệ đã xóa thật
        await db.query(`
          UPDATE shelves 
          SET letter = $1, dewey_start = $2, dewey_end = $3,
              original_dewey_start = $2, original_dewey_end = $3,
              hidden_at = GETDATE()
          WHERE id = (
            SELECT TOP 1 id FROM shelves 
            WHERE campus_id = $4 AND rack_number = $5 AND is_deleted = TRUE
              AND (code = '' OR code IS NULL) AND hidden_at IS NULL
            ORDER BY id ASC
          )
        `, [letter.toUpperCase(), dewey.deweyStart, dewey.deweyEnd, campusId, rackNumber]);
      }
    }
  } catch (err) {
    console.error('Error recalculating U-shape labels:', err);
  }
}

export async function updateShelf(id: number, data: Partial<ShelfRow>): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deweyStartVal = (data.deweyStart !== undefined && data.deweyStart !== null && !isNaN(Number(data.deweyStart))) ? Number(data.deweyStart) : undefined;
    const deweyEndVal = (data.deweyEnd !== undefined && data.deweyEnd !== null && !isNaN(Number(data.deweyEnd))) ? Number(data.deweyEnd) : undefined;

    // Lấy thông tin campus, rack
    const infoRes = await client.query(
      'SELECT campus_id as "campusId", rack_number as "rackNumber" FROM shelves WHERE id = $1',
      [id]
    );
    if (infoRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
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
      await client.query(`
        UPDATE shelves SET ${fields.join(', ')} WHERE id = $${i}
      `, values);
    }

    if (data.color !== undefined) {
      await client.query(`
        UPDATE shelves 
        SET color = $1 
        WHERE campus_id = (SELECT campus_id FROM shelves WHERE id = $2) 
          AND rack_number = (SELECT rack_number FROM shelves WHERE id = $2)
      `, [data.color, id]);
    }

    if (campusId && rackNumber) {
      await recalculateUShapeLabels(campusId, rackNumber, client);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating shelf:', err);
    return false;
  } finally {
    client.release();
  }
}

export async function deleteShelf(id: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lấy thông tin rack để recalculate trước khi xóa
    const infoRes = await client.query('SELECT campus_id, rack_number FROM shelves WHERE id = $1', [id]);

    await client.query(`
      UPDATE shelves 
      SET is_deleted = 1,
          original_code = code,
          original_dewey_start = dewey_start,
          original_dewey_end = dewey_end,
          hidden_at = GETDATE()
      WHERE id = $1
    `, [id]);

    if (infoRes.rows.length > 0) {
      const { campus_id, rack_number } = infoRes.rows[0];
      await recalculateUShapeLabels(campus_id, rack_number, client);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting shelf:', err);
    return false;
  } finally {
    client.release();
  }
}

export async function deleteBay(campusName: string, rackNumber: number, bay: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campusRes = await client.query('SELECT id FROM campuses WHERE LOWER(name) = LOWER($1)', [campusName]);
    if (campusRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const campusId = campusRes.rows[0].id;

    await client.query(`
      UPDATE shelves 
      SET is_deleted = 1,
          original_code = code,
          original_dewey_start = dewey_start,
          original_dewey_end = dewey_end,
          hidden_at = GETDATE()
      WHERE campus_id = $1 AND rack_number = $2 AND bay = $3
    `, [campusId, rackNumber, bay]);

    await recalculateUShapeLabels(campusId, rackNumber, client);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting bay:', err);
    return false;
  } finally {
    client.release();
  }
}

export async function toggleHiddenFloor(shelfId: number, floorNumber: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT hidden_floors, campus_id, rack_number, bay FROM shelves WHERE id = $1', [shelfId]);
    if (res.rows.length === 0) return false;

    const { campus_id, rack_number, bay } = res.rows[0];
    let hiddenFloors: number[] = [6, 7, 8, 9];
    const hiddenStr = res.rows[0].hidden_floors;
    if (hiddenStr !== null && hiddenStr !== undefined) {
      try { hiddenFloors = JSON.parse(hiddenStr); } catch(e) {}
    }

    const idx = hiddenFloors.indexOf(floorNumber);
    if (idx >= 0) {
      hiddenFloors.splice(idx, 1);
    } else {
      hiddenFloors.push(floorNumber);
    }

    const newHiddenStr = JSON.stringify(hiddenFloors);
    // Đồng bộ ẩn/hiện tầng cho cả 2 mặt của ngăn kệ
    await client.query(
      'UPDATE shelves SET hidden_floors = $1 WHERE campus_id = $2 AND rack_number = $3 AND bay = $4',
      [newHiddenStr, campus_id, rack_number, bay]
    );
    return true;
  } catch (err) {
    console.error('Error toggling hidden floor:', err);
    return false;
  } finally {
    client.release();
  }
}

export async function addShelf(data: Partial<ShelfRow> & { hiddenFloors?: number[] }): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { code, deweyStart, deweyEnd, campus, rackNumber, letter, bay, face, positionX, positionZ, hiddenFloors } = data;
    const campusNameStr = campus || '';

    // Sanitization & Fallback to prevent NOT NULL constraint violation on dewey_start/dewey_end
    const cleanDeweyStart = (deweyStart === null || deweyStart === undefined || isNaN(Number(deweyStart))) ? 0.0 : Number(deweyStart);
    const cleanDeweyEnd = (deweyEnd === null || deweyEnd === undefined || isNaN(Number(deweyEnd))) ? 0.0 : Number(deweyEnd);

    // Lấy campus_id từ name
    const campusRes = await client.query('SELECT id FROM campuses WHERE LOWER(name) = LOWER($1)', [campusNameStr]);
    if (campusRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    const campusId = campusRes.rows[0].id;

    const currentMaxBay = await getRackOriginalMaxBay(campusId, rackNumber as number, campusNameStr, client);
    const maxBay = Math.max(currentMaxBay, bay as number);

    // Tìm kiếm vị trí kệ đã được "tạo sẵn" (pre-allocated) theo tọa độ/vị trí
    const existingRes = await client.query(
      `SELECT TOP 1 id, code, hidden_at FROM shelves 
       WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4 
       ORDER BY is_deleted ASC, hidden_at DESC`,
      [campusId, rackNumber, bay, face]
    );

    // Tạo một mã tạm thời duy nhất (tối đa 10 ký tự) để tránh xung đột Unique Constraint 
    // trước khi hàm recalculateUShapeLabels tính toán lại mã chuẩn
    const tempCode = `T_${Math.random().toString(36).substring(2, 9)}`;
    const pristineLetter = getPristineLetter(campusNameStr, bay as number, face as number, maxBay);

    // Serialize hiddenFloors to string
    const finalHiddenFloors = Array.isArray(hiddenFloors) ? hiddenFloors : [6, 7, 8, 9];
    const hiddenFloorsStr = JSON.stringify(finalHiddenFloors);

    if (existingRes.rows.length > 0 && (!existingRes.rows[0].code || existingRes.rows[0].code === '')) {
      // Nếu là kệ ẩn do script seedGrid tạo (code rỗng, chưa có lịch sử dữ liệu thật), ta chỉ việc "Bật" nó lên
      const shelfId = existingRes.rows[0].id;
      const finalStart = cleanDeweyStart;
      const finalEnd = cleanDeweyEnd;

      await client.query(`
        UPDATE shelves 
        SET code = $1, dewey_start = $2, dewey_end = $3, letter = $4, 
            position_x = $5, position_z = $6, is_deleted = 0,
            hidden_at = NULL,
            original_letter = $7, original_code = $8,
            original_dewey_start = $9, original_dewey_end = $10,
            hidden_floors = $12
        WHERE id = $11
      `, [tempCode, finalStart, finalEnd, letter || 'A', positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`, finalStart, finalEnd, shelfId, hiddenFloorsStr]);
    } else {
      // Nếu vị trí này chưa có (chưa chạy seed), HOẶC vị trí này đã có kệ từng hoạt động (để bảo toàn lịch sử kệ cũ), 
      // thì insert mới hoàn toàn một dòng kệ.
      await client.query(`
        INSERT INTO shelves (code, dewey_start, dewey_end, campus_id, rack_number, letter, bay, face, position_x, position_z, is_deleted, original_letter, original_code, original_dewey_start, original_dewey_end, hidden_floors)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $2, $3, $13)
      `, [tempCode, cleanDeweyStart, cleanDeweyEnd, campusId, rackNumber, letter || 'A', bay, face, positionX, positionZ, pristineLetter, `${rackNumber}${pristineLetter}`, hiddenFloorsStr]);
    }

    // Đồng bộ ẩn/hiện tầng cho cả 2 mặt của ngăn kệ
    await client.query(
      'UPDATE shelves SET hidden_floors = $1 WHERE campus_id = $2 AND rack_number = $3 AND bay = $4',
      [hiddenFloorsStr, campusId, rackNumber, bay]
    );

    if (campusId && rackNumber) {
      await recalculateUShapeLabels(campusId, rackNumber as number, client);
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error adding shelf:', err);
    return false;
  } finally {
    client.release();
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

// Helper functions for Excel migration (equivalent to server/migrate.ts)
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

// Hàm tự động tạo bảng, nạp excel, seed grid, seed admin
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🚀 Checking database state and initializing tables...');

    // 1. Tạo các bảng cơ sở dữ liệu nếu chưa tồn tại
    await pool.query(`
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
    `);

    // Đồng bộ hóa các cột metadata nếu bảng đã tồn tại trước đó nhưng thiếu cột
    await ensureShelfMetadataColumns();

    await pool.query(`
      IF OBJECT_ID('custom_features', 'U') IS NULL
      BEGIN
        CREATE TABLE custom_features (
          id INT IDENTITY(1,1) PRIMARY KEY,
          campus_id INT FOREIGN KEY REFERENCES campuses(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          pos_x DECIMAL(10, 2) NOT NULL,
          pos_z DECIMAL(10, 2) NOT NULL,
          length DECIMAL(10, 2) NOT NULL,
          width DECIMAL(10, 2),
          rotation DECIMAL(10, 2)
        );
      END;

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

      -- Xóa constraint cũ nếu tồn tại
      IF EXISTS (SELECT * FROM sys.key_constraints WHERE name = 'shelves_campus_id_code_key')
      BEGIN
        ALTER TABLE shelves DROP CONSTRAINT shelves_campus_id_code_key;
      END;

      -- Tạo Filtered Index
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'unique_active_shelf_idx' AND object_id = OBJECT_ID('shelves'))
      BEGIN
        CREATE UNIQUE INDEX unique_active_shelf_idx ON shelves (campus_id, code) WHERE is_deleted = 0;
      END;
    `);

    // 2. Tạo tài khoản admin mặc định nếu chưa có
    const adminCheck = await pool.query('SELECT id FROM admins');
    if (adminCheck.rows.length === 0) {
      console.log('👤 Seeding default admin account...');
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
      const passwordHash = await bcrypt.hash(adminPass, 10);
      await pool.query(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [adminUser, passwordHash]
      );
      console.log(`👤 Admin account seeded (username: ${adminUser}).`);
    }

    // 3. Kiểm tra xem đã có dữ liệu kệ nào chưa. Nếu chưa có bất kỳ kệ nào, thực hiện nạp dữ liệu từ Excel và sinh Grid.
    const shelfCheck = await pool.query('SELECT COUNT(*) as cnt FROM shelves');
    const totalShelvesCount = parseInt(shelfCheck.rows[0].cnt);

    if (totalShelvesCount === 0) {
      console.log('📁 Database is empty. Starting auto-initialization...');

      // A. Đảm bảo 2 cơ sở (campuses) đã được tạo và lấy ID
      const campusIds: { [key: string]: number } = {};
      const campusesNames = ['Thu Duc', 'Sai Gon'];
      
      for (const name of campusesNames) {
        const checkRes = await pool.query('SELECT id FROM campuses WHERE name = $1', [name]);
        if (checkRes.rows.length > 0) {
          campusIds[name] = checkRes.rows[0].id;
        } else {
          const insertRes = await pool.query('INSERT INTO campuses (name) OUTPUT INSERTED.id VALUES ($1)', [name]);
          campusIds[name] = insertRes.rows[0].id;
        }
      }

      // B. Sinh toàn bộ lưới kệ ẩn (seedGrid) cho cả 2 cơ sở trước để có sẵn các vị trí vật lý
      console.log('🔌 Seeding Grid Shelves placeholders first...');
      const numBays = 10;
      const numRows = 50;

      for (const name of campusesNames) {
        const campusId = campusIds[name];
        console.log(`Populating empty grid placeholders for campus: ${name}`);
        const zOffset = name === 'Thu Duc' ? 6.5 : 17.0;

        let insertedCount = 0;
        for (let rackIdx = 0; rackIdx < numRows; rackIdx++) {
          const rackNumber = rackIdx + 1;

          for (let bayIdx = 0; bayIdx < numBays; bayIdx++) {
            const bay = bayIdx + 1;
            const positionX = bayIdx * 3.0;
            const positionZ = name === 'Thu Duc'
              ? (rackIdx - zOffset) * 4.0
              : -(rackIdx - zOffset) * 4.0;

            for (const face of [1, 2]) {
              await pool.query(`
                INSERT INTO shelves (code, dewey_start, dewey_end, campus_id, rack_number, letter, bay, face, position_x, position_z, is_deleted)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
              `, ['', 0, 0, campusId, rackNumber, 'A', bay, face, positionX, positionZ]);
              insertedCount++;
            }
          }
        }
        console.log(`[${name}] Added ${insertedCount} empty grid placeholders.`);
      }

      // C. Nạp dữ liệu hoạt động thực tế từ các file Excel đè lên các placeholders
      console.log('📁 Running Excel migration to update active shelves...');
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const dataDir = path.resolve(__dirname, '..');

      const files = [
        { file: 'Thu Duc Campus.xlsx', campus: 'Thu Duc' },
        { file: 'Sai Gon Campus.xlsx', campus: 'Sai Gon' },
      ];

      for (const { file, campus } of files) {
        const filePath = path.join(dataDir, file);
        console.log(`Reading active layout from ${file}...`);
        
        let wb;
        try {
          wb = XLSX.readFile(filePath);
        } catch (e) {
          console.error(`⚠️ Could not read excel file at ${filePath}. Skipping.`, e);
          continue;
        }

        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        const campusId = campusIds[campus];
        const zOffset = campus === 'Thu Duc' ? 6.5 : 17.0;

        // Nhóm kệ theo rack để xử lý U-Shape
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

            const positionX = (bay - 1) * 3.0;
            const positionZ = (campus === 'Thu Duc')
              ? (raw.rackNumber - 1 - zOffset) * 4.0
              : -(raw.rackNumber - 1 - zOffset) * 4.0;

            // Tìm kệ đã có sẵn tại vị trí này để update
            const existingByPos = await pool.query(
              'SELECT TOP 1 id FROM shelves WHERE campus_id = $1 AND rack_number = $2 AND bay = $3 AND face = $4',
              [campusId, raw.rackNumber, bay, face]
            );

            if (existingByPos.rows.length > 0) {
              await pool.query(
                `UPDATE shelves SET 
                  letter = $1, code = $2, dewey_start = $3, dewey_end = $4, 
                  position_x = $5, position_z = $6, is_deleted = 0,
                  original_letter = $1, original_code = $2,
                  original_dewey_start = $3, original_dewey_end = $4
                 WHERE id = $7`,
                [raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, positionX, positionZ, existingByPos.rows[0].id]
              );
            } else {
              // Fallback insert nếu vì lý do nào đó không tìm thấy placeholder
              await pool.query(
                `INSERT INTO shelves (campus_id, rack_number, letter, code, dewey_start, dewey_end, bay, face, position_x, position_z, is_deleted, original_letter, original_code, original_dewey_start, original_dewey_end)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $3, $4, $5, $6)`,
                [campusId, raw.rackNumber, raw.letter, raw.code, raw.deweyStart, raw.deweyEnd, bay, face, positionX, positionZ]
              );
            }
          }
        }

        // Tính toán lại nhãn U-Shape/Z-Shape cho các kệ vừa update
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

        console.log(`✅ Migrated active shelves for ${campus}.`);
      }

      console.log('🎉 Database initialization complete!');
    } else {
      console.log('✅ Database already populated. Skipping import & grid seed.');
    }
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
  }
}

// ===== CUSTOM FEATURES =====
export async function getCustomFeatures(campusName: string) {
  try {
    const res = await pool.query(`
      SELECT f.* 
      FROM custom_features f
      JOIN campuses c ON f.campus_id = c.id
      WHERE c.name = $1
    `, [campusName]);
    return res.rows;
  } catch (err) {
    console.error('getCustomFeatures error:', err);
    return [];
  }
}

export async function addCustomFeature(data: any) {
  const { campus, type, posX, posZ, length, width, rotation } = data;
  try {
    const campusRes = await pool.query('SELECT id FROM campuses WHERE name = $1', [campus]);
    if (campusRes.rows.length === 0) return false;
    const campusId = campusRes.rows[0].id;

    await pool.query(`
      INSERT INTO custom_features (campus_id, type, pos_x, pos_z, length, width, rotation)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [campusId, type, posX, posZ, length, width || 1.2, rotation || 0]);
    return true;
  } catch (err) {
    console.error('addCustomFeature error:', err);
    return false;
  }
}

export async function updateCustomFeature(id: number, data: any) {
  const { posX, posZ, length, width, rotation } = data;
  try {
    await pool.query(`
      UPDATE custom_features
      SET pos_x = $1, pos_z = $2, length = $3, width = $4, rotation = $5
      WHERE id = $6
    `, [posX, posZ, length, width || 1.2, rotation || 0, id]);
    return true;
  } catch (err) {
    console.error('updateCustomFeature error:', err);
    return false;
  }
}

export async function deleteCustomFeature(id: number) {
  try {
    await pool.query('DELETE FROM custom_features WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error('deleteCustomFeature error:', err);
    return false;
  }
}
