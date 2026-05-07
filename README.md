# 📚 Tìm Kiếm Sách - Hệ Thống Kệ 3D

Ứng dụng web giúp tìm kiếm vị trí sách trên kệ thư viện và hiển thị trực quan bằng mô hình 3D.

![preview](https://img.shields.io/badge/stack-React%20%2B%20Three.js%20%2B%20Express-blue)

## ✨ Tính năng

- 🔍 **Tìm kiếm theo ký hiệu Dewey** (VD: `343.070`) hoặc **mã dãy kệ** (VD: `10a`)
- 🏗️ **Mô hình kệ sách 3D** — Hiển thị toàn bộ kệ của thư viện, nhân bản từ dữ liệu Excel
- 🎯 **Highlight vị trí chính xác** — Khối sáng + mũi tên chỉ đúng Bay và Mặt kệ
- 🏙️ **2 Cơ sở** — Chuyển đổi giữa Thủ Đức và Sài Gòn
- 🖱️ **Tương tác 3D tự do** — Kéo lướt, xoay, zoom

## 🗂️ Cấu trúc thư mục

```
timkiemsach/
├── server/                    # Backend (Express + xlsx)
│   ├── index.ts               # API server (port 3001)
│   └── bookService.ts         # Đọc Excel, thuật toán U-Shape, tìm kiếm
│
├── src/                       # Frontend (React + Three.js)
│   ├── main.tsx               # Entry point
│   ├── App.tsx                # Layout chính
│   ├── index.css              # Design system (Dark mode)
│   ├── types.ts               # TypeScript interfaces
│   └── components/
│       ├── Sidebar.tsx        # Thanh tìm kiếm + kết quả
│       ├── ViewerPanel.tsx    # Canvas 3D + thông tin overlay
│       ├── BookshelfScene.tsx # Render kệ sách + layout thư viện
│       └── HighlightMarker.tsx# Hiệu ứng highlight (glow + mũi tên)
│
├── public/
│   └── thietkekesach.gltf     # Mô hình 3D kệ sách
│
├── Sai Gon Campus.xlsx        # Dữ liệu kệ sách cơ sở Sài Gòn
├── Thu Duc Campus.xlsx        # Dữ liệu kệ sách cơ sở Thủ Đức
├── thietkekesach.gltf         # Mô hình 3D gốc
└── setup.bat                  # Script cài đặt tự động
```

## 🧠 Thuật toán U-Shape

Mỗi kệ vật lý (Rack) có **3 khoang (Bay)** và **2 mặt**, tạo thành 6 dãy được đánh ký tự A–F theo vòng chữ U:

| Ký tự | Bay | Mặt    |
|-------|-----|--------|
| A     | 1   | Trước  |
| B     | 2   | Trước  |
| C     | 3   | Trước  |
| D     | 3   | Sau    |
| E     | 2   | Sau    |
| F     | 1   | Sau    |

## 🚀 Cài đặt & Chạy

### Yêu cầu
- [Node.js](https://nodejs.org/) >= 18

### Bước 1: Cài đặt
```bash
# Clone repo
git clone <repo-url>
cd timkiemsach

# Chạy script cài đặt (Windows)
setup.bat

# Hoặc cài thủ công
mkdir public
copy thietkekesach.gltf public\
npm install
```

### Bước 2: Chạy
```bash
npm run dev
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## 📡 API Endpoints

| Method | Endpoint        | Mô tả                                   |
|--------|-----------------|------------------------------------------|
| GET    | `/api/search`   | Tìm kiếm theo Dewey hoặc mã kệ         |
| GET    | `/api/racks`    | Lấy layout kệ theo campus (cho 3D)      |
| GET    | `/api/campuses` | Danh sách cơ sở + thống kê              |

### Ví dụ
```
GET /api/search?q=343.070&campus=Thu Duc
GET /api/racks?campus=Sai Gon
```

## 📊 Dữ liệu Excel

Mỗi file Excel chứa các cột:

| Cột          | Mô tả                                    |
|--------------|-------------------------------------------|
| `ShelfId`    | ID duy nhất của dãy kệ                   |
| `Code`       | Mã dãy kệ (VD: `10a`, `4e`)             |
| `DeweyStart` | Ký hiệu Dewey bắt đầu của dãy           |
| `DeweyEnd`   | Ký hiệu Dewey kết thúc của dãy           |

## 🛠️ Tech Stack

- **Frontend**: React 19, Three.js, @react-three/fiber, @react-three/drei
- **Backend**: Express, xlsx
- **Build**: Vite, TypeScript
- **Styling**: Vanilla CSS (Dark mode)
