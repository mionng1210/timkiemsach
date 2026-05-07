import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useState } from 'react';
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

  const targetPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(0, 0, 0);

    const sorted = [...racks].sort((a, b) => a.rackNumber - b.rackNumber);
    const index = sorted.findIndex((r) => r.rackNumber === shelf.rackNumber);
    if (index === -1) return new THREE.Vector3(0, 0, 0);

    const x = (shelf.bay - 2) * 3 + 1.65;
    const y = 2.5;
    const z = -(index - sorted.length / 2) * 4.0; // ROW_SPACING_Z = 4.0
    return new THREE.Vector3(x, y, z);
  }, [shelf, racks]);

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
        camera={{ position: [-80, 50, 0], fov: 40 }}
        shadows
      >
        <color attach="background" args={['#ffffff']} />
        <fog attach="fog" args={['#ffffff', 100, 300]} />

        <ambientLight intensity={0.7} />
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
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>

        {/* Tường phía sau */}
        <mesh position={[6.2, 15, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[600, 60]} />
          <meshStandardMaterial color="#f1f3f5" />
        </mesh>

        <MapControls
          makeDefault
          minDistance={10}
          maxDistance={200}
          minPolarAngle={1.01}
          maxPolarAngle={1.01}
          enableDamping
          dampingFactor={0.08}
          panSpeed={2}
        />

        <FocusManager target={targetPos} />
        <CameraLimits />
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

function FocusManager({ target }: { target: THREE.Vector3 }) {
  const { controls } = useThree();
  const [isFocusing, setIsFocusing] = useState(false);

  // Khi mục tiêu thay đổi, kích hoạt trạng thái focus
  useEffect(() => {
    setIsFocusing(true);
  }, [target]);

  // Nếu người dùng bắt đầu tương tác, ngừng tự động focus để tránh "giằng co"
  useEffect(() => {
    if (!controls) return;
    const stopFocus = () => setIsFocusing(false);
    (controls as any).addEventListener('start', stopFocus);
    return () => (controls as any).removeEventListener('start', stopFocus);
  }, [controls]);

  useFrame(() => {
    if (controls && isFocusing) {
      const distance = (controls as any).target.distanceTo(target);
      // Khi đã đến rất gần (0.05 đơn vị), dừng focus
      if (distance < 0.05) {
        setIsFocusing(false);
      } else {
        (controls as any).target.lerp(target, 0.1);
        (controls as any).update();
      }
    }
  });

  return null;
}

function CameraLimits() {
  const { camera, controls } = useThree();
  useFrame(() => {
    // Giới hạn camera không cho đi xuyên qua tường (x = 6.2)
    // Để một khoảng cách an toàn (margin) là 5.5
    if (camera.position.x > 5.5) {
      camera.position.x = 5.5;
    }

    // Đồng thời giới hạn cả điểm nhìn (target) để tránh kéo quá đà
    if (controls && (controls as any).target.x > 6.0) {
      (controls as any).target.x = 6.0;
      (controls as any).update();
    }
  });
  return null;
}

