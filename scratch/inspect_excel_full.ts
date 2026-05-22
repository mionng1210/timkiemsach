import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function inspectCampus(fileName: string) {
  const dataDir = path.resolve(__dirname, '..');
  const filePath = path.join(dataDir, fileName);
  
  console.log(`\n--- Inspecting ${fileName} ---`);
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  const letters = new Set<string>();
  const rackLetters = new Map<number, Set<string>>();
  const invalidCodes: string[] = [];

  for (const row of rows) {
    const code = String(row['Code'] || '').trim().toLowerCase();
    if (!code) continue;
    const match = code.match(/^(\d+)([a-l])$/i);
    if (!match) {
      invalidCodes.push(code);
      continue;
    }
    const rackNumber = parseInt(match[1], 10);
    const letter = match[2].toLowerCase();
    letters.add(letter);

    if (!rackLetters.has(rackNumber)) {
      rackLetters.set(rackNumber, new Set());
    }
    rackLetters.get(rackNumber)!.add(letter);
  }

  console.log('All unique letters:', Array.from(letters).sort());
  if (invalidCodes.length > 0) {
    console.log('Invalid codes found:', invalidCodes);
  } else {
    console.log('No invalid codes found.');
  }

  // Check for gaps in letters per rack
  for (const [rack, lettersSet] of rackLetters.entries()) {
    const sortedLetters = Array.from(lettersSet).sort();
    const maxLetter = sortedLetters[sortedLetters.length - 1];
    const maxIdx = maxLetter.charCodeAt(0) - 97;
    
    if (sortedLetters.length !== maxIdx + 1) {
        // Find missing letters
        const missing = [];
        for (let i = 0; i <= maxIdx; i++) {
            const l = String.fromCharCode(97 + i);
            if (!lettersSet.has(l)) {
                missing.push(l);
            }
        }
        if (missing.length > 0) {
            console.log(`Rack ${rack} has missing letters: ${missing.join(', ')} (Has ${sortedLetters.join(', ')})`);
        }
    }
  }
}

async function main() {
  await inspectCampus('Thu Duc Campus.xlsx');
  await inspectCampus('Sai Gon Campus.xlsx');
}

main();
