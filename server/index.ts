import express from 'express';
import cors from 'cors';
import { 
  searchByDewey, 
  searchByCode, 
  getRackLayout, 
  getCampuses,
  updateShelf,
  deleteShelf,
  deleteBay
} from './bookService.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// API lấy danh sách campus + thông tin tổng quan
app.get('/api/campuses', async (_req, res) => {
  const campuses = await getCampuses();
  return res.json({ campuses });
});

// API lấy layout kệ cho 1 campus (để FE render 3D)
app.get('/api/racks', async (req, res) => {
  const campus = (req.query.campus as string) || '';
  if (!campus) return res.status(400).json({ error: 'campus is required' });

  const racks = await getRackLayout(campus);
  return res.json({ campus, racks });
});

// API tìm kiếm sách theo Dewey number hoặc code
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const campus = (req.query.campus as string) || '';

    if (!q.trim()) return res.json({ results: [] });

    // Kiểm tra nếu query là số thập phân → tìm theo Dewey
    const deweyNum = parseFloat(q);
    if (!isNaN(deweyNum) && deweyNum > 0) {
      const results = await searchByDewey(deweyNum, campus || undefined);
      return res.json({ results, query: q, type: 'dewey' });
    }

    // Nếu không phải số → tìm theo code (VD: "10a")
    const results = await searchByCode(q, campus || undefined);
    return res.json({ results, query: q, type: 'code' });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Admin APIs =====

// Cập nhật dải Dewey của 1 shelf
app.put('/api/admin/shelves/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { deweyStart, deweyEnd } = req.body;
  
  const success = await updateShelf(id, { deweyStart, deweyEnd });
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to update shelf' });
});

// Xóa 1 shelf cụ thể
app.delete('/api/admin/shelves/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await deleteShelf(id);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to delete shelf' });
});

// Xóa cả 1 bay (dãy)
app.delete('/api/admin/racks/:rackNumber/bays/:bay', async (req, res) => {
  const campus = (req.query.campus as string) || '';
  const rackNumber = parseInt(req.params.rackNumber);
  const bay = parseInt(req.params.bay);

  if (!campus) return res.status(400).json({ error: 'campus is required' });

  const success = await deleteBay(campus, rackNumber, bay);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to delete bay' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
