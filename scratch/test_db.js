import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
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

async function test() {
  try {
    const res = await fetch('http://localhost:3001/api/racks?campus=Sai%20Gon');
    const data = await res.json();
    console.log("SERVER RETURNED CAMPUS:", data.campus);
    console.log("SERVER RACKS COUNT:", data.racks.length);
    console.log("FIRST RACK SHELVES:", data.racks[0]?.shelves.map(s => ({ code: s.code, deweyStart: s.deweyStart, deweyEnd: s.deweyEnd })));
  } catch (err) {
    console.error('ERROR:', err);
  }
}

test();
