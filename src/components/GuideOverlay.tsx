import { useState, useEffect } from 'react';

export default function GuideOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [controlMode, setControlMode] = useState<'touch' | 'mouse' | 'hybrid'>('mouse');

  // Tự động mở khi load lần đầu (kiểm tra localStorage) và nhận dạng thiết bị
  useEffect(() => {
    const coarse = window.matchMedia("(any-pointer: coarse)").matches || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const fine = window.matchMedia("(any-pointer: fine)").matches || window.matchMedia("(pointer: fine)").matches;

    if (coarse && fine) {
      setControlMode('hybrid');
    } else if (coarse) {
      setControlMode('touch');
    } else {
      setControlMode('mouse');
    }

    const hasSeenGuide = localStorage.getItem('hasSeenGuide_3d');
    if (!hasSeenGuide) {
      setIsOpen(true);
    }
  }, []);

  const closeGuide = () => {
    setIsOpen(false);
    localStorage.setItem('hasSeenGuide_3d', 'true');
  };

  if (!isOpen) {
    return (
      <button className="help-btn" onClick={() => setIsOpen(true)} title="Hướng dẫn điều khiển 3D">
        ❓
      </button>
    );
  }

  return (
    <div className="guide-overlay" onClick={closeGuide}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <button className="guide-close" onClick={closeGuide}>&times;</button>

        <div className="guide-header">
          <div className="guide-icon">🎮</div>
          <h2>Hướng dẫn điều khiển 3D</h2>
          <p>Làm quen với thao tác di chuyển và tương tác trên bản đồ thư viện</p>
        </div>

        <div className="guide-controls-info" style={{ marginBottom: '32px' }}>
          <h4>🗺️ Thao tác di chuyển góc nhìn</h4>
          
          {controlMode === 'hybrid' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  🖱️ Với chuột & bàn phím:
                </div>
                <div className="control-grid">
                  <div className="control-item"><span>🖱️</span> Chuột trái: Kéo để di chuyển</div>
                  <div className="control-item"><span>⌨️</span> Ctrl + Chuột: Kéo để xoay</div>
                  <div className="control-item"><span>🎡</span> Cuộn chuột: Phóng to / nhỏ</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                  👆 Với màn hình cảm ứng:
                </div>
                <div className="control-grid">
                  <div className="control-item"><span>👆</span> 1 ngón: Kéo để di chuyển</div>
                  <div className="control-item"><span>✌️</span> 2 ngón: Xoay bản đồ</div>
                  <div className="control-item"><span>🤏</span> Thu phóng: Phóng to / nhỏ</div>
                </div>
              </div>
            </div>
          ) : controlMode === 'touch' ? (
            <div className="control-grid">
              <div className="control-item"><span>👆</span> 1 ngón: Kéo để di chuyển</div>
              <div className="control-item"><span>✌️</span> 2 ngón: Xoay bản đồ</div>
              <div className="control-item"><span>🤏</span> Thu phóng: Phóng to / nhỏ</div>
            </div>
          ) : (
            <div className="control-grid">
              <div className="control-item"><span>🖱️</span> Chuột trái: Kéo để di chuyển</div>
              <div className="control-item"><span>⌨️</span> Ctrl + Chuột: Kéo để xoay</div>
              <div className="control-item"><span>🎡</span> Cuộn chuột: Phóng to / nhỏ</div>
            </div>
          )}
        </div>

        <button className="guide-start-btn" onClick={closeGuide}>
          Tôi đã hiểu, bắt đầu khám phá!
        </button>
      </div>
    </div>
  );
}
