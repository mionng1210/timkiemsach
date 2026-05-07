import { Canvas } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import { Suspense, useEffect, useState } from 'react';
import BookshelfScene from './BookshelfScene';
import type { SearchResult, RackInfo, ShelfInfo } from '../types';

interface ViewerPanelProps {
  selectedResult: SearchResult | null;
  campus: string;
  onBayClick?: (shelf: ShelfInfo) => void;
}

export default function ViewerPanel({ selectedResult, campus, onBayClick }: ViewerPanelProps) {
  const [racks, setRacks] = useState<RackInfo[]>([]);

  // Fetch rack layout khi đổi campus
  useEffect(() => {
    async function fetchRacks() {
      try {
        const res = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res.json();
        setRacks(data.racks || []);
      } catch {
        setRacks([]);
      }
    }
    fetchRacks();
  }, [campus]);

  const shelf = selectedResult?.shelf ?? null;

  const handleSceneBayClick = (rackNumber: number, bay: number, face: number) => {
    const rack = racks.find((r) => r.rackNumber === rackNumber);
    if (!rack) return;
    const clickedShelf = rack.shelves.find((s) => s.bay === bay && s.face === face);
    if (clickedShelf && onBayClick) {
      onBayClick(clickedShelf);
    }
  };

  return (
    <div className="viewer-panel">
      <Canvas
        className="viewer-canvas"
        camera={{ position: [20, 30, 20], fov: 50 }}
        shadows
      >
        <color attach="background" args={['#0a0e1a']} />
        <fog attach="fog" args={['#0a0e1a', 50, 200]} />

        <ambientLight intensity={0.4} />
        <directionalLight position={[15, 20, 10]} intensity={1} castShadow />
        <directionalLight position={[-10, 15, -10]} intensity={0.3} />

        <Suspense fallback={null}>
          <BookshelfScene
            racks={racks}
            highlightRack={shelf?.rackNumber ?? null}
            highlightBay={shelf?.bay ?? null}
            highlightFace={shelf?.face ?? null}
            onBayClick={handleSceneBayClick}
          />
        </Suspense>

        {/* Sàn nhà */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[500, 500]} />
          <meshStandardMaterial color="#0d1220" />
        </mesh>

        <MapControls
          makeDefault
          target={[0, 0, 0]}
          minDistance={3}
          maxDistance={150}
          maxPolarAngle={Math.PI / 2.1}
          enableDamping
          dampingFactor={0.08}
          panSpeed={1.5}
        />
      </Canvas>

      {/* Info overlay */}
      {selectedResult && (
        <div className="viewer-info-overlay">
          <div className="info-card">
            <div className="info-card-title">Vị trí sách</div>
            <div className="info-row">
              <span className="info-label">Dãy kệ</span>
              <span className="info-value highlight">{shelf!.code.toUpperCase()}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Kệ số</span>
              <span className="info-value">{shelf!.rackNumber}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Khoang (Bay)</span>
              <span className="info-value">Bay {shelf!.bay}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Mặt kệ</span>
              <span className="info-value">
                {shelf!.face === 1 ? '🔵 Mặt trước' : '🟠 Mặt sau'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Dewey</span>
              <span className="info-value">
                {shelf!.deweyStart.toFixed(3)} → {shelf!.deweyEnd.toFixed(3)}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Cơ sở</span>
              <span className="info-value">{selectedResult.campus}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bay label at bottom */}
      {selectedResult && (
        <div className="bay-label-3d">
          <div className="bay-number">Kệ {shelf!.rackNumber}</div>
          <div className="bay-desc">
            <strong>Bay {shelf!.bay} · Mặt {shelf!.face === 1 ? 'Trước' : 'Sau'}</strong>
            <br />
            Dãy {shelf!.code.toUpperCase()}
          </div>
        </div>
      )}

      {/* Rack count indicator */}
      <div className="rack-counter">
        🏗️ {racks.length} kệ — {campus === 'Thu Duc' ? '🌳 Thủ Đức' : '🏙️ Sài Gòn'}
      </div>

      {!selectedResult && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div className="empty-state-icon">🏗️</div>
          <h3>Chọn một kệ sách</h3>
          <p>Tìm kiếm bên trái và chọn kệ để xem vị trí trên mô hình 3D</p>
        </div>
      )}
    </div>
  );
}
