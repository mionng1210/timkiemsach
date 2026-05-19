import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const filePath = path.resolve(__dirname, '..', 'Thu Duc Campus.xlsx');
  
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  console.log('Thu Duc Excel Rack 1 rows:');
  const rack1Rows = rows.filter(row => {
    const code = String(row['Code'] || '').trim().toLowerCase();
    return code.startsWith('1') && !code.startsWith('10') && !code.startsWith('11') && !code.startsWith('12') && !code.startsWith('13');
  });
  console.log(JSON.stringify(rack1Rows, null, 2));
}

main();
