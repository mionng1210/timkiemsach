import { useState, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ViewerPanel from './components/ViewerPanel';
import GuideOverlay from './components/GuideOverlay';
import type { SearchResult, ShelfInfo } from './types';

export default function App() {
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  
  // Khởi tạo state trực tiếp từ URL để tránh tình trạng render sai cơ sở ban đầu
  const [route, setRoute] = useState<'admin' | 'guided'>(() => {
    return window.location.pathname === '/admin' ? 'admin' : 'guided';
  });

  const [campus, setCampus] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('campus') || 'Thu Duc';
  });

  const [bookId, setBookId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('book') || '1';
  });

  const [mobileView, setMobileView] = useState<'sidebar' | '3d'>('sidebar');
  const [isGuideMode, setIsGuideMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Quản lý tải dữ liệu kệ dựa trên URL khi vào luồng dẫn đường
  useEffect(() => {
    if (route === 'admin') return;

    const params = new URLSearchParams(window.location.search);
    const dewey = params.get('dewey');
    const campusParam = params.get('campus');
    const codeParam = params.get('code');

    if (!dewey || !campusParam) {
      // Chuyển hướng sang mock.html nếu thiếu tham số dẫn đường ở trang chủ
      window.location.href = '/mock.html' + window.location.search;
      return;
    }

    // Tìm kiếm kệ khớp Dewey và Cơ sở
    const fetchGuidedShelf = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(dewey)}&campus=${encodeURIComponent(campusParam)}`);
        const data = await res.json();
        const results: SearchResult[] = data.results || [];
        
        if (results.length > 0) {
          let target = results[0];
          // Nếu trùng dewey, chọn theo code (mã dãy kệ hiển thị trên trang mock)
          if (codeParam) {
            const matchedCode = results.find(
              r => r.shelf.code.toLowerCase() === codeParam.toLowerCase()
            );
            if (matchedCode) {
              target = matchedCode;
            }
          }
          setSelectedResult(target);
          setCampus(target.campus);
        }
      } catch (e) {
        console.error('Lỗi khi lấy vị trí kệ dẫn đường:', e);
      }
    };

    fetchGuidedShelf();
  }, [route]);

  const handleResultSelect = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setCampus(result.campus);
    setMobileView('3d');
  }, []);

  const handleCampusChange = useCallback((newCampus: string) => {
    setCampus(newCampus);
    setSelectedResult(null);
  }, []);

  const handleBayClick = useCallback((shelf: ShelfInfo) => {
    setSelectedResult({ shelf, campus });
  }, [campus]);

  // Luồng giao diện Admin đầy đủ
  if (route === 'admin') {
    return (
      <div className={`app-layout mobile-view-${mobileView}`}>
        <Sidebar
          onResultSelect={handleResultSelect}
          selectedResult={selectedResult}
          campus={campus}
          onCampusChange={handleCampusChange}
        />
        <ViewerPanel
          selectedResult={selectedResult}
          campus={campus}
          bookId={bookId}
          onBayClick={handleBayClick}
          onGuideModeChange={setIsGuideMode}
          onEditingChange={setIsEditing}
          onClearResult={() => setSelectedResult(null)}
        />
        <GuideOverlay />

        {!isGuideMode && !isEditing && (
          <button
            className="mobile-toggle-btn"
            onClick={() => setMobileView(mobileView === 'sidebar' ? '3d' : 'sidebar')}
            aria-label={mobileView === 'sidebar' ? 'Xem mô hình 3D' : 'Tìm kiếm sách'}
          >
            {mobileView === 'sidebar' ? '🏗️ Xem 3D' : '🔍 Tìm kiếm'}
          </button>
        )}
      </div>
    );
  }

  // Luồng dẫn đường trực tiếp từ web thư viện (ẩn Sidebar, ẩn thanh điều khiển admin)
  return (
    <div className="app-layout user-guided-layout">
      <ViewerPanel
        selectedResult={selectedResult}
        campus={campus}
        isExternalGuided={true}
        bookId={bookId}
        onExitExternalGuide={(id) => {
          window.location.href = `/mock.html?book=${id}`;
        }}
        onClearResult={() => setSelectedResult(null)}
      />
      <GuideOverlay />
    </div>
  );
}

