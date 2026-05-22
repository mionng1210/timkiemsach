
/**
 * Demonstrates the critical data mismatch bug in recalculateUShapeLabels.
 * When a bay is deleted, other bays shift their labels, 
 * but keep the Dewey ranges associated with the LETTERS, 
 * effectively moving data to different physical locations.
 */

function simulateRecalculate(campusName: string, shelves: any[], displayDeweyMap: Map<string, any>) {
    console.log(`--- Simulating for ${campusName} ---`);
    const uniqueBays = [...new Set(shelves.map(s => s.bay))].sort((a, b) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    const results = shelves.map(s => {
      const bayIdx = bayToIndex.get(s.bay) || 1;
      let charIdx = 0;
      if (campusName === 'Sai Gon') {
        if (s.face === 1) charIdx = bayIdx;
        else charIdx = 2 * N - bayIdx + 1;
      } else {
        if (s.face === 2) charIdx = bayIdx;
        else charIdx = N + bayIdx;
      }
      
      const letterChar = String.fromCharCode(96 + charIdx).toLowerCase();
      const dewey = displayDeweyMap.get(letterChar) || { start: 0, end: 0 };
      
      return { id: s.id, bay: s.bay, face: s.face, newLetter: letterChar, dewey };
    }).sort((a, b) => a.id - b.id);

    results.forEach(r => {
        console.log(`Shelf ID ${r.id} (Bay ${r.bay} Face ${r.face}) -> Label ${r.newLetter}, Dewey: ${r.dewey.start}-${r.dewey.end}`);
    });
}

// Initial state: 3 bays (a-f)
const initialShelves = [
    { id: 1, bay: 1, face: 1 }, // a
    { id: 2, bay: 2, face: 1 }, // b
    { id: 3, bay: 3, face: 1 }, // c
    { id: 4, bay: 3, face: 2 }, // d
    { id: 5, bay: 2, face: 2 }, // e
    { id: 6, bay: 1, face: 2 }, // f
];

const initialDewey = new Map([
    ['a', { start: 100, end: 110 }],
    ['b', { start: 110, end: 120 }],
    ['c', { start: 120, end: 130 }],
    ['d', { start: 130, end: 140 }],
    ['e', { start: 140, end: 150 }],
    ['f', { start: 150, end: 160 }],
]);

console.log('BEFORE DELETING BAY 2:');
simulateRecalculate('Sai Gon', initialShelves, initialDewey);

// After deleting bay 2
const afterDeleteShelves = [
    { id: 1, bay: 1, face: 1 },
    { id: 3, bay: 3, face: 1 },
    { id: 4, bay: 3, face: 2 },
    { id: 6, bay: 1, face: 2 },
];

console.log('\nAFTER DELETING BAY 2 (Physical Bay 3 shifts labels):');
simulateRecalculate('Sai Gon', afterDeleteShelves, initialDewey);
