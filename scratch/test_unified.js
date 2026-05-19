import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sortUPath = (a, b) => {
  if (a.face !== b.face) {
    return a.face - b.face; // Face 1 first, then Face 2
  }
  if (a.face === 1) {
    return a.bay - b.bay; // Face 1: ascending bay
  } else {
    return b.bay - a.bay; // Face 2: descending bay
  }
};

const sortZPath = (a, b) => {
  if (a.face !== b.face) {
    return b.face - a.face; // Face 2 first, then Face 1
  }
  return a.bay - b.bay; // Both faces: ascending bay
};

async function main() {
  try {
    const campusId = 2; // Let's test Sai Gon
    const rackNumber = 17; // The user's example rack 17
    const campusName = 'Sai Gon';

    // 1. Get all active shelves in this rack
    const res = await pool.query(`
      SELECT id, bay, face, original_letter
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    const shelves = res.rows;
    console.log(`Active shelves for ${campusName} Rack ${rackNumber}:`, shelves);

    // Load ALL original ranges
    const origRes = await pool.query(`
      SELECT original_letter as "letter", 
             original_dewey_start as "deweyStart", 
             original_dewey_end as "deweyEnd",
             face,
             bay
      FROM shelves
      WHERE campus_id = $1 AND rack_number = $2 AND original_letter IS NOT NULL
    `, [campusId, rackNumber]);

    const isThuDuc = campusName.toLowerCase().includes('thu duc');
    const pathSortFn = isThuDuc ? sortZPath : sortUPath;

    const origRanges = origRes.rows
      .map(r => ({
        letter: r.letter.toUpperCase().trim(),
        deweyStart: Number(r.deweyStart),
        deweyEnd: Number(r.deweyEnd),
        face: r.face,
        bay: r.bay
      }))
      .sort(pathSortFn);

    console.log('Original ranges in path order:', origRanges.map(r => ({ letter: r.letter, range: `${r.deweyStart} - ${r.deweyEnd}`, face: r.face, bay: r.bay })));

    const uniqueBays = [...new Set(shelves.map(s => s.bay))].sort((a, b) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    const shelvesWithCharIdx = shelves.map(s => {
      const bayIdx = bayToIndex.get(s.bay);
      let charIdx = 0;

      if (campusName === 'Sai Gon') {
        if (s.face === 1) {
          charIdx = bayIdx;
        } else {
          charIdx = 2 * N - bayIdx + 1;
        }
      } else {
        if (s.face === 2) {
          charIdx = bayIdx;
        } else {
          charIdx = N + bayIdx;
        }
      }
      return { ...s, charIdx };
    }).sort((a, b) => a.charIdx - b.charIdx);

    console.log('shelvesWithCharIdx sorted by charIdx:', shelvesWithCharIdx.map(s => ({ id: s.id, bay: s.bay, face: s.face, charIdx: s.charIdx })));

    for (let idx = 0; idx < shelvesWithCharIdx.length; idx++) {
      const s = shelvesWithCharIdx[idx];
      const dewey = origRanges[idx] || { deweyStart: 0, deweyEnd: 0 };
      const letter = String.fromCharCode(96 + s.charIdx).toUpperCase();
      console.log(`Shelf ID ${s.id} (Bay ${s.bay} Face ${s.face}) -> New Letter: ${letter}, mapped to dewey range: ${dewey.deweyStart} - ${dewey.deweyEnd}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
