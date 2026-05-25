import { useState, useEffect, useRef } from 'react';
import type { SearchResult } from '../types';

interface SidebarProps {
  onResultSelect: (result: SearchResult) => void;
  selectedResult: SearchResult | null;
  campus: string;
  onCampusChange: (campus: string) => void;
}

export default function Sidebar({ onResultSelect, selectedResult, campus, onCampusChange }: SidebarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        if (campus) params.set('campus', campus);
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, campus]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">📚</div>
          <div>
            <h1>Tìm <span>Sách</span></h1>
            <p>Hệ thống kệ 3D</p>
          </div>
        </div>

        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            id="search-input"
            type="text"
            placeholder="Nhập ký hiệu Dewey (VD: 343.070) hoặc mã kệ (VD: 10a)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="campus-filter">
          <button className={`campus-btn ${campus === 'Thu Duc' ? 'active' : ''}`} onClick={() => onCampusChange('Thu Duc')}>
            🌳 Thủ Đức
          </button>
          <button className={`campus-btn ${campus === 'Sai Gon' ? 'active' : ''}`} onClick={() => onCampusChange('Sai Gon')}>
            🏙️ Sài Gòn
          </button>
        </div>
      </div>

      <div className="results-section">
        {query.trim() && (
          <div className="results-count">
            {loading ? 'Đang tìm kiếm...' : `${results.length} kết quả`}
          </div>
        )}

        {loading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="book-card" style={{ pointerEvents: 'none' }}>
            <div className="shimmer" style={{ height: 16, width: '80%', marginBottom: 12 }} />
            <div className="shimmer" style={{ height: 12, width: '50%' }} />
          </div>
        ))}

        {!loading && results.map((r, i) => {
          const s = r.shelf;
          const isActive =
            selectedResult?.shelf.shelfId === s.shelfId &&
            selectedResult?.campus === r.campus;

          return (
            <div
              key={`${s.shelfId}-${r.campus}-${i}`}
              className={`book-card ${isActive ? 'active' : ''}`}
              onClick={() => onResultSelect(r)}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <div className="book-title">
                Dãy kệ {s.code.toUpperCase()}
              </div>
              <div className="book-subtitle">
                Dewey: {s.deweyStart.toFixed(3)} → {s.deweyEnd.toFixed(3)}
              </div>
              <div className="book-meta">
                <span className="book-badge badge-shelf">🗄️ Kệ {s.rackNumber}</span>
                <span className="book-badge badge-campus">
                  {r.campus === 'Sai Gon' ? '🏙️' : '🌳'} {r.campus}
                </span>
                <span className="book-badge badge-call">
                  Bay {s.bay} · Mặt {s.face === 1 ? 'Trước' : 'Sau'}
                </span>
              </div>
            </div>
          );
        })}

        {!loading && !query.trim() && (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <h3>Tìm kiếm sách</h3>
            <p>Nhập ký hiệu Dewey (VD: 343.070) hoặc mã dãy kệ (VD: 10a) để xem vị trí trên kệ 3D</p>
          </div>
        )}

        {!loading && query.trim() && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3>Không tìm thấy</h3>
            <p>Thử tìm kiếm với từ khóa khác hoặc đổi cơ sở</p>
          </div>
        )}
      </div>
    </aside>
  );
}
