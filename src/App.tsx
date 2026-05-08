import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ViewerPanel from './components/ViewerPanel';
import GuideOverlay from './components/GuideOverlay';
import type { SearchResult, ShelfInfo } from './types';

export default function App() {
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [campus, setCampus] = useState('Thu Duc');
  const [mobileView, setMobileView] = useState<'sidebar' | '3d'>('sidebar');
  const [isGuideMode, setIsGuideMode] = useState(false);

  const handleResultSelect = useCallback((result: SearchResult) => {
    setSelectedResult(result);
    setCampus(result.campus);
    // Tự động chuyển sang 3D khi chọn kết quả trên mobile
    setMobileView('3d');
  }, []);

  const handleCampusChange = useCallback((newCampus: string) => {
    setCampus(newCampus);
    setSelectedResult(null);
  }, []);

  // Khi click vào 1 bay cụ thể trên 3D
  const handleBayClick = useCallback((shelf: ShelfInfo) => {
    setSelectedResult({ shelf, campus });
  }, [campus]);

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
        onBayClick={handleBayClick}
        onGuideModeChange={setIsGuideMode}
      />
      <GuideOverlay />

      {/* Nút chuyển đổi giữa Sidebar và 3D trên mobile */}
      {!isGuideMode && (
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
