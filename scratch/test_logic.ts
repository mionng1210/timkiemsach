
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

function simulateRecalculate(campusName: string, shelves: any[]) {
    console.log(`\nSimulating for ${campusName}`);
    const uniqueBays = [...new Set(shelves.map(s => s.bay))].sort((a, b) => a - b);
    const N = uniqueBays.length;
    const bayToIndex = new Map(uniqueBays.map((b, i) => [b, i + 1]));

    const shelvesWithCharIdx = shelves.map(s => {
      const bayIdx = bayToIndex.get(s.bay) || 1;
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

    for (let idx = 0; idx < shelvesWithCharIdx.length; idx++) {
      const s = shelvesWithCharIdx[idx];
      const letterChar = String.fromCharCode(96 + s.charIdx).toLowerCase();
      console.log(`Shelf ID: ${s.id}, Bay: ${s.bay}, Face: ${s.face} -> New Letter: ${letterChar}, CharIdx: ${s.charIdx}`);
    }
}

// Case 1: Thu Duc Rack 13 (missing 'i' which is face 1, bay 3)
// g-l are face 1, bay 1-6. i is 9th letter -> bay 3.
const thuDucShelves = [
    { id: 1, bay: 1, face: 2 }, // a
    { id: 2, bay: 2, face: 2 }, // b
    { id: 3, bay: 3, face: 2 }, // c
    { id: 4, bay: 4, face: 2 }, // d
    { id: 5, bay: 5, face: 2 }, // e
    { id: 6, bay: 6, face: 2 }, // f
    { id: 7, bay: 1, face: 1 }, // g
    { id: 8, bay: 2, face: 1 }, // h
    // { id: 9, bay: 3, face: 1 }, // i MISSING
    { id: 10, bay: 4, face: 1 }, // j
    { id: 11, bay: 5, face: 1 }, // k
    { id: 12, bay: 6, face: 1 }, // l
];

simulateRecalculate('Thu Duc', thuDucShelves);

// Case 2: Sai Gon Rack 1 (Full a-f)
const saiGonShelves = [
    { id: 1, bay: 1, face: 1 }, // a
    { id: 2, bay: 2, face: 1 }, // b
    { id: 3, bay: 3, face: 1 }, // c
    { id: 4, bay: 3, face: 2 }, // d
    { id: 5, bay: 2, face: 2 }, // e
    { id: 6, bay: 1, face: 2 }, // f
];

simulateRecalculate('Sai Gon', saiGonShelves);

// Case 3: Sai Gon Rack with missing bay 2
const saiGonGaps = [
    { id: 1, bay: 1, face: 1 }, // a
    // bay 2 missing
    { id: 3, bay: 3, face: 1 }, // c
    { id: 4, bay: 3, face: 2 }, // d
    // bay 2 missing
    { id: 6, bay: 1, face: 2 }, // f
];
// Case 4: Thu Duc with whole bay 3 missing
const thuDucWholeGap = [
    { id: 1, bay: 1, face: 2 }, // a
    { id: 2, bay: 2, face: 2 }, // b
    // bay 3 missing
    { id: 4, bay: 4, face: 2 }, // d
    { id: 5, bay: 5, face: 2 }, // e
    { id: 6, bay: 6, face: 2 }, // f
    { id: 7, bay: 1, face: 1 }, // g
    { id: 8, bay: 2, face: 1 }, // h
    // bay 3 missing
    { id: 10, bay: 4, face: 1 }, // j
    { id: 11, bay: 5, face: 1 }, // k
    { id: 12, bay: 6, face: 1 }, // l
];
simulateRecalculate('Thu Duc (Whole Gap)', thuDucWholeGap);
