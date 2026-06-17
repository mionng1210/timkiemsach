import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { 
  searchByDewey, 
  searchByCode, 
  getRackLayout, 
  getCampuses,
  updateShelf,
  deleteShelf,
  deleteBay,
  addShelf,
  loginAdmin,
  lookupShelf,
  lookupShelfByCode,
  initializeDatabase,
  toggleHiddenFloor,
  getCustomFeatures,
  addCustomFeature,
  updateCustomFeature,
  deleteCustomFeature
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

// API Đăng nhập Admin
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Thiếu username hoặc password' });
  }
  const isValid = await loginAdmin(username, password);
  if (isValid) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
    return res.json({ success: true, message: 'Đăng nhập thành công', username, token });
  } else {
    return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
});

// API lấy layout kệ cho 1 campus (để FE render 3D)
app.get('/api/racks', async (req, res) => {
  const campus = (req.query.campus as string) || '';
  if (!campus) return res.status(400).json({ error: 'campus is required' });

  const racks = await getRackLayout(campus);
  return res.json({ campus, racks });
});

// API lấy các custom_features (khối hiển thị 3D)
app.get('/api/features', async (req, res) => {
  const campus = (req.query.campus as string) || '';
  if (!campus) return res.status(400).json({ error: 'campus is required' });

  const features = await getCustomFeatures(campus);
  return res.json({ features });
});

// API tìm kiếm sách theo Dewey number hoặc code
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q as string) || '';
    const campus = (req.query.campus as string) || '';

    if (!q.trim()) return res.json({ results: [] });

    // Kiểm tra nếu query là số (có thể có dấu chấm) và không chứa ký tự khác → Ưu tiên tìm theo Dewey
    const isPureNumber = /^\d+(\.\d+)?$/.test(q.trim());
    
    if (isPureNumber) {
      const deweyNum = parseFloat(q);
      if (!isNaN(deweyNum)) {
        const deweyResults = await searchByDewey(deweyNum, campus || undefined);
        // Nếu tìm thấy theo Dewey thì trả về luôn
        if (deweyResults.length > 0) {
          return res.json({ results: deweyResults, query: q, type: 'dewey' });
        }
      }
    }

    // Nếu không phải số nguyên thủy hoặc không tìm thấy theo Dewey → tìm theo mã kệ (VD: "10a", "10A")
    const codeResults = await searchByCode(q, campus || undefined);
    return res.json({ results: codeResults, query: q, type: 'code' });
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Admin APIs =====

// Middleware xác thực JWT
const authenticateAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Thiếu token' });
    return;
  }
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Token không hợp lệ' });
    return;
  }
};

app.use('/api/admin', authenticateAdmin);

// Thêm mới kệ (có tùy chọn x, z)
app.post('/api/admin/shelves', async (req, res) => {
  const success = await addShelf(req.body);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to add shelf' });
});

// Cập nhật dải Dewey và màu sắc của 1 shelf
app.put('/api/admin/shelves/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { deweyStart, deweyEnd, color } = req.body;
  
  const success = await updateShelf(id, { deweyStart, deweyEnd, color });
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to update shelf' });
});

// Bật/tắt ẩn một tầng của kệ
app.post('/api/admin/shelves/:id/toggle-floor', async (req, res) => {
  const id = parseInt(req.params.id);
  const { floor } = req.body;
  if (!floor) return res.status(400).json({ error: 'floor is required' });
  const success = await toggleHiddenFloor(id, floor);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to toggle hidden floor' });
});

// Tra cứu thông tin kệ (kể cả đã xóa) để lấy dữ liệu Dewey cũ
app.get('/api/admin/shelves/lookup', async (req, res) => {
  const { campus, rackNumber, bay, face } = req.query;
  try {
    const data = await lookupShelf(
      campus as string, 
      parseInt(rackNumber as string), 
      parseInt(bay as string), 
      parseInt(face as string)
    );
    if (data) return res.json(data);
    return res.status(404).json({ error: 'Shelf not found' });
  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

// Tra cứu thông tin kệ theo code (Mã)
app.get('/api/admin/shelves/lookupByCode', async (req, res) => {
  const { campus, code } = req.query;
  try {
    const data = await lookupShelfByCode(campus as string, code as string);
    if (data) return res.json(data);
    return res.status(404).json({ error: 'Shelf not found' });
  } catch (err) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
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

// ===== Admin Custom Features =====
app.post('/api/admin/features', async (req, res) => {
  const success = await addCustomFeature(req.body);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to add custom feature' });
});

app.put('/api/admin/features/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await updateCustomFeature(id, req.body);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to update custom feature' });
});

app.delete('/api/admin/features/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const success = await deleteCustomFeature(id);
  if (success) return res.json({ success: true });
  return res.status(500).json({ error: 'Failed to delete custom feature' });
});

await initializeDatabase();

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
