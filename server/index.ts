import express from 'express';
import cors from 'cors';
import { searchByDewey, searchByCode, getRackLayout, getCampuses } from './bookService.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// API lấy danh sách campus + thông tin tổng quan
app.get('/api/campuses', (_req, res) => {
  const campuses = getCampuses();
  return res.json({ campuses });
});

// API lấy layout kệ cho 1 campus (để FE render 3D)
app.get('/api/racks', (req, res) => {
  const campus = (req.query.campus as string) || '';
  if (!campus) return res.status(400).json({ error: 'campus is required' });

  const racks = getRackLayout(campus);
  return res.json({ campus, racks });
});

// API tìm kiếm sách theo Dewey number hoặc code
app.get('/api/search', (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const campus = (req.query.campus as string) || '';

    if (!q.trim()) return res.json({ results: [] });

    // Kiểm tra nếu query là số thập phân → tìm theo Dewey
    const deweyNum = parseFloat(q);
    if (!isNaN(deweyNum) && deweyNum > 0) {
      const results = searchByDewey(deweyNum, campus || undefined);
      return res.json({ results, query: q, type: 'dewey' });
    }

    // Nếu không phải số → tìm theo code (VD: "10a")
    const results = searchByCode(q, campus || undefined);
    return res.json({ results, query: q, type: 'code' });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
