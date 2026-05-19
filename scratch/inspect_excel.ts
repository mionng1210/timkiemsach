import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const dataDir = path.resolve(__dirname, '..');
  const filePath = path.join(dataDir, 'Thu Duc Campus.xlsx');
  
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  const letters = new Set<string>();
  const rackLetters = new Map<number, Set<string>>();

  for (const row of rows) {
    const code = String(row['Code'] || '').trim().toLowerCase();
    if (!code) continue;
    const match = code.match(/^(\d+)([a-l])$/i);
    if (!match) {
      console.log('Unmatched code:', code);
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

  console.log('All unique letters in Thu Duc:', Array.from(letters).sort());
  console.log('Letters per Rack for first 3 racks:');
  for (const r of [1, 2, 3]) {
    console.log(`Rack ${r}:`, Array.from(rackLetters.get(r) || []).sort());
  }
}

main();
