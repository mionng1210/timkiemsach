import { getRackLayout } from './server/bookService.js';

const thuducRacks = getRackLayout('Thu Duc');
console.log('--- THU DUC RACK LAYOUT ---');
thuducRacks.slice(0, 3).forEach(rack => {
  console.log(`\nKệ ${rack.rackNumber}: bays=[${rack.bays.join(',')}]`);
  rack.shelves.forEach(s => {
    console.log(`  Letter: ${s.letter.toUpperCase()} -> Bay: ${s.bay}, Face: ${s.face === 1 ? 'Front' : 'Back'}`);
  });
});

const saigonRacks = getRackLayout('Sai Gon');
console.log('\n--- SAI GON RACK LAYOUT (Verification) ---');
saigonRacks.slice(0, 1).forEach(rack => {
  console.log(`Kệ ${rack.rackNumber}: bays=[${rack.bays.join(',')}]`);
  rack.shelves.forEach(s => {
    console.log(`  Letter: ${s.letter.toUpperCase()} -> Bay: ${s.bay}, Face: ${s.face === 1 ? 'Front' : 'Back'}`);
  });
});
