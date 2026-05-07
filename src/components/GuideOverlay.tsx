import { useState, useEffect } from 'react';

export default function GuideOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  // Tự động mở khi load lần đầu (kiểm tra localStorage)
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('hasSeenGuide');
    if (!hasSeenGuide) {
      setIsOpen(true);
    }
  }, []);

  const closeGuide = () => {
    setIsOpen(false);
    localStorage.setItem('hasSeenGuide', 'true');
  };

  if (!isOpen) {
    return (
      <button className="help-btn" onClick={() => setIsOpen(true)} title="Hướng dẫn sử dụng">
        ❓
      </button>
    );
  }

  return (
    <div className="guide-overlay" onClick={closeGuide}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        <button className="guide-close" onClick={closeGuide}>&times;</button>

        <div className="guide-header">
          <div className="guide-icon">📚</div>
          <h2>Hướng dẫn tìm sách</h2>
          <p>Chỉ với 4 bước đơn giản để tìm thấy vị trí sách của bạn</p>
        </div>

        <div className="guide-steps">
          <div className="guide-step">
            <div className="step-num">1</div>
            <div className="step-content">
              <h4>Tìm kiếm sách</h4>
              <p>Nhập mã số Dewey vào ô tìm kiếm ở thanh bên trái.</p>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-num">2</div>
            <div className="step-content">
              <h4>Chọn kết quả</h4>
              <p>Nhấn vào quyển sách bạn tìm thấy. Camera sẽ tự động lướt đến kệ đó.</p>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-num">3</div>
            <div className="step-content">
              <h4>Nhìn mũi tên vàng</h4>
              <p>Một mũi tên vàng và vùng xanh sẽ nhấp nháy chỉ rõ vị trí chính xác.</p>
            </div>
          </div>

          <div className="guide-step">
            <div className="step-num">4</div>
            <div className="step-content">
              <h4>Xác định mặt kệ</h4>
              <p>Kiểm tra nhãn ở dưới để biết sách nằm ở <strong>Mặt Trước</strong> hay <strong>Mặt Sau</strong>.</p>
            </div>
          </div>
        </div>

        <button className="guide-start-btn" onClick={closeGuide}>
          Tôi đã hiểu, bắt đầu thôi!
        </button>
      </div>
    </div>
  );
}
