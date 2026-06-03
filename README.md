# 📚 Tìm Kiếm Sách - Hệ Thống Kệ 3D

Ứng dụng web giúp tìm kiếm vị trí sách trên kệ thư viện trực quan bằng mô hình 3D, hỗ trợ quản trị viên chỉnh sửa, tùy biến kết cấu kệ sách linh hoạt.

![preview](https://img.shields.io/badge/stack-React%20%2B%20Three.js%20%2B%20Express%20%2B%20SQL%20Server-blue)

## ✨ Tính năng nổi bật

- 🔍 **Tìm kiếm sách thông minh**: Tìm theo ký hiệu số Dewey (VD: `343.070`) hoặc mã dãy kệ (VD: `10a`).
- 🗺️ **Vẽ đường đi (Pathfinding)**: Tự động chỉ dẫn đường đi tối ưu từ cổng vào hoặc quầy thủ thư đến đúng vị trí kệ sách trên bản đồ 3D.
- 🎯 **Highlight vị trí trực quan**: Hiển thị hộp sáng (Highlight Box) và mũi tên chuyển động chỉ chính xác Bay và Mặt kệ cần tìm.
- 🏙️ **Quản lý đa cơ sở**: Chuyển đổi linh hoạt giữa các cơ sở thư viện (VD: Thủ Đức và Sài Gòn).
- 🖱️ **Tương tác 3D mượt mà**: Hỗ trợ kéo lướt, xoay, zoom camera tự do bằng chuột hoặc cử chỉ.
- ⚙️ **Admin Control Panel**:
  - **Quản lý vị trí kệ**: Thêm kệ mới bằng lưới Grid ảo hoặc xóa các kệ hiện có.
  - **Tùy chỉnh màu sắc**: Thay đổi mã màu của vách đầu dãy kệ.
  - **Cấu hình tầng linh hoạt (Lên tới 9 tầng)**: 
    - Chọn tạo kệ với các tầng mong muốn (mặc định các kệ cũ sẽ hiển thị 5 tầng, ẩn các tầng 6-9).
    - Hỗ trợ ẩn/hiện độc lập từng tầng trong quản lý kệ sách.
    - **Đồng bộ tự động**: Tự động đồng bộ hóa trạng thái ẩn/hiện tầng của cả hai mặt Trước & Sau trong cùng một khoang để đảm bảo tính nhất quán về kết cấu vật lý.
    - **Tự động co giãn**: Khung highlight xanh và nhãn số hiệu kệ sẽ tự động điều chỉnh độ cao/vị trí tương ứng theo số tầng hoạt động hiện có.

## 🗂️ Cấu trúc thư mục

```
timkiemsach/
├── server/                    # Backend (Express + SQL Server)
│   ├── index.ts               # API server (port 3001)
│   └── bookService.ts         # Logic kết nối CSDL, thuật toán U-Shape, sắp xếp nhãn
│
├── src/                       # Frontend (React 19 + Three.js)
│   ├── main.tsx               # Entry point
│   ├── App.tsx                # Layout và điều phối chính
│   ├── index.css              # Design system (Dark mode)
│   ├── types.ts               # Định nghĩa TypeScript Interfaces
│   └── components/
│       ├── Sidebar.tsx        # Panel tìm kiếm, kết quả & đăng nhập admin
│       ├── ViewerPanel.tsx    # Bảng quản lý Admin & điều khiển 3D Canvas
│       ├── BookshelfScene.tsx # Dựng bản đồ 3D, tính toán kích thước & render kệ sách
│       └── HighlightMarker.tsx# Hiệu ứng highlight động tương thích chiều cao kệ
│
├── public/
│   └── thietkekesach.gltf     # Mô hình 3D kệ sách cơ bản
│
├── Sai Gon Campus.xlsx        # Dữ liệu kệ sách mẫu cơ sở Sài Gòn
├── Thu Duc Campus.xlsx        # Dữ liệu kệ sách mẫu cơ sở Thủ Đức
├── thietkekesach.gltf         # Mô hình 3D gốc
└── setup.bat                  # Script cài đặt tự động dependencies
```

## 🧠 Thuật toán U-Shape

Mỗi kệ vật lý (Rack) thường bao gồm nhiều **khoang (Bay)** và **2 mặt** (Trước/Sau). Các kệ được đánh ký tự từ A–F theo dạng vòng chữ U ziczac:

```
    Mặt Trước (Face 1)
┌───────┬───────┬───────┐
│   A   │   B   │   C   │
└───────┴───────┴───────┘
     ▲       ▲       ▲
  Bay 1   Bay 2   Bay 3
     ▼       ▼       ▼
┌───────┬───────┬───────┐
│   F   │   E   │   D   │
└───────┴───────┴───────┘
     Mặt Sau (Face 2)
```

## 🚀 Hướng dẫn cài đặt & Chạy ứng dụng

### Yêu cầu hệ thống
- [Node.js](https://nodejs.org/) >= 18
- Microsoft SQL Server (Đã cấu hình các bảng `campuses`, `shelves`, và `admins`).

### Cài đặt
1. Cài đặt các thư viện phụ thuộc:
   ```bash
   npm install
   ```
2. Cấu hình file `.env` ở thư mục gốc để kết nối cơ sở dữ liệu:
   ```env
   DB_USER=sa
   DB_PASSWORD=your_password
   DB_SERVER=localhost
   DB_DATABASE=timkiemsach
   PORT=3001
   JWT_SECRET=your_jwt_secret
   ```

### Chạy ứng dụng (Chế độ phát triển)
```bash
npm run dev
```
- **Frontend (Client)**: http://localhost:5173
- **Backend (API Server)**: http://localhost:3001

## 📡 API Endpoints

### Public APIs
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/campuses` | Lấy danh sách các cơ sở và thống kê kệ sách |
| GET | `/api/racks` | Lấy danh sách bố cục kệ sách 3D theo cơ sở |
| GET | `/api/search` | Tìm kiếm kệ sách theo số Dewey hoặc mã kệ |
| POST | `/api/login` | Đăng nhập tài khoản quản trị viên (Admin) |

### Admin APIs (Yêu cầu JWT Token ở Authorization Header)
| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/admin/shelves` | Tạo thêm kệ sách mới ở tọa độ tùy chọn |
| PUT | `/api/admin/shelves/:id` | Cập nhật dải Dewey và màu sơn đầu kệ của kệ sách |
| POST | `/api/admin/shelves/:id/toggle-floor` | Ẩn hoặc hiển thị một tầng của kệ sách (tự động đồng bộ 2 mặt) |
| GET | `/api/admin/shelves/lookup` | Tra cứu chi tiết một kệ theo vị trí cơ học |
| GET | `/api/admin/shelves/lookupByCode` | Tra cứu chi tiết kệ dựa vào mã kệ |
| DELETE | `/api/admin/shelves/:id` | Xóa một mặt kệ sách |
| DELETE | `/api/admin/racks/:rackNumber/bays/:bay` | Xóa toàn bộ một khoang kệ (cả 2 mặt trước/sau) |

## 🛠️ Công nghệ sử dụng

- **Frontend**: React 19, Three.js, `@react-three/fiber`, `@react-three/drei`
- **Backend**: Node.js, Express, `mssql` (SQL Server client)
- **Build Tool**: Vite, TypeScript
- **Styling**: Vanilla CSS, Dark mode theme
