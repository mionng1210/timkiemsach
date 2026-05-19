import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const campusId = 1; // Thu Duc
    const rackNumber = 1;
    const campusName = 'Thu Duc';

    // 1. Get all active shelves in this rack
    const res = await pool.query(`
      SELECT id, bay, face, original_letter
      FROM shelves 
      WHERE campus_id = $1 AND rack_number = $2 AND is_deleted = FALSE
    `, [campusId, rackNumber]);

    const shelves = res.rows;
    console.log('Active shelves from DB:', shelves);

    // Load ALL original ranges
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

    console.log('origRangesByFace[1] (Face 1):', origRangesByFace[1]);

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

    const face1Shelves = shelvesWithCharIdx.filter(x => x.face === 1);
    const activeShelvesOnFace = [...face1Shelves].sort((a, b) => a.bay - b.bay);
    console.log('activeShelvesOnFace (Face 1):', activeShelvesOnFace.map(s => ({ id: s.id, bay: s.bay })));

    for (const s of face1Shelves) {
      const idxOnFace = activeShelvesOnFace.findIndex(x => x.id === s.id);
      const dewey = origRangesByFace[1][idxOnFace];
      console.log(`Shelf ID ${s.id} (Bay ${s.bay}): mapped to index ${idxOnFace}, dewey range: ${dewey.deweyStart} - ${dewey.deweyEnd}`);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
