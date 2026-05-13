import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
}

export interface RackInfo {
  rackNumber: number;
  shelves: ShelfRow[];
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

// ===== Thuật toán U-Shape =====
function letterToBayFace(letter: string): { bay: number; face: number } {
  const idx = letter.toLowerCase().charCodeAt(0) - 97; // a=0, b=1, ... f=5
  if (idx < 0 || idx > 5) return { bay: 1, face: 1 };
  if (idx < 3) {
    return { face: 1, bay: idx + 1 };  // a→Bay1, b→Bay2, c→Bay3
  } else {
    return { face: 2, bay: 6 - idx };  // d→Bay3, e→Bay2, f→Bay1
  }
}

// ===== Cache =====
let cachedCampuses: CampusData[] | null = null;

function loadData(): CampusData[] {
  if (cachedCampuses) return cachedCampuses;

  const dataDir = path.resolve(__dirname, '..');
  const files = [
    { file: 'Thu Duc Campus.xlsx', campus: 'Thu Duc' },
    { file: 'Sai Gon Campus.xlsx', campus: 'Sai Gon' },
  ];

  const campuses: CampusData[] = [];

  for (const { file, campus } of files) {
    const filePath = path.join(dataDir, file);
    try {
      const wb = XLSX.readFile(filePath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);

      const shelves: ShelfRow[] = [];

      for (const row of rows) {
        const code = String(row['Code'] || '').trim().toLowerCase();
        const deweyStart = Number(row['DeweyStart'] || 0);
        const deweyEnd = Number(row['DeweyEnd'] || 0);
        const shelfId = Number(row['ShelfId'] || 0);

        if (!code) continue;

        // Parse "10a" → rackNumber=10, letter="a"
        const match = code.match(/^(\d+)([a-f])$/i);
        if (!match) continue;

        const rackNumber = parseInt(match[1], 10);
        const letter = match[2].toLowerCase();
        const { bay, face } = letterToBayFace(letter);

        shelves.push({
          shelfId,
          code,
          deweyStart,
          deweyEnd,
          campus,
          rackNumber,
          letter,
          bay,
          face,
        });
      }

      // Nhóm theo rack number
      const rackMap = new Map<number, ShelfRow[]>();
      for (const s of shelves) {
        if (!rackMap.has(s.rackNumber)) rackMap.set(s.rackNumber, []);
        rackMap.get(s.rackNumber)!.push(s);
      }

      const racks: RackInfo[] = [...rackMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rackNumber, shelfList]) => ({
          rackNumber,
          shelves: shelfList.sort((a, b) => a.letter.localeCompare(b.letter)),
        }));

      campuses.push({ campus, racks, totalShelves: shelves.length });
    } catch (err) {
      console.error(`Error reading ${file}:`, err);
    }
  }

  cachedCampuses = campuses;
  const totalRacks = campuses.reduce((s, c) => s + c.racks.length, 0);
  console.log(`📚 Loaded data: ${campuses.map(c => `${c.campus}(${c.racks.length} racks)`).join(', ')} — Total: ${totalRacks} racks`);
  return campuses;
}

// ===== API Handlers =====

// Lấy layout kệ theo campus
export function getRackLayout(campus: string): RackInfo[] {
  const data = loadData();
  const found = data.find(c => c.campus.toLowerCase() === campus.toLowerCase());
  return found ? found.racks : [];
}

// Lấy danh sách campus
export function getCampuses(): { name: string; rackCount: number; shelfCount: number }[] {
  const data = loadData();
  return data.map(c => ({
    name: c.campus,
    rackCount: c.racks.length,
    shelfCount: c.totalShelves,
  }));
}

// Tìm kiếm theo Dewey number
export function searchByDewey(deweyNumber: number, campus?: string): SearchResult[] {
  const data = loadData();
  const results: SearchResult[] = [];

  for (const c of data) {
    if (campus && c.campus.toLowerCase() !== campus.toLowerCase()) continue;

    for (const rack of c.racks) {
      for (const shelf of rack.shelves) {
        if (deweyNumber >= shelf.deweyStart && deweyNumber <= shelf.deweyEnd) {
          results.push({ shelf, campus: c.campus });
        }
      }
    }
  }

  return results;
}

// Tìm kiếm theo code (VD: "10a")
export function searchByCode(code: string, campus?: string): SearchResult[] {
  const data = loadData();
  const q = code.toLowerCase().trim();
  const results: SearchResult[] = [];

  for (const c of data) {
    if (campus && c.campus.toLowerCase() !== campus.toLowerCase()) continue;

    for (const rack of c.racks) {
      for (const shelf of rack.shelves) {
        if (shelf.code.includes(q)) {
          results.push({ shelf, campus: c.campus });
        }
      }
    }
  }

  return results;
}
