import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import BookshelfScene, { type PathWaypoint } from './BookshelfScene';
import type { SearchResult, RackInfo, ShelfInfo } from '../types';

interface ViewerPanelProps {
  selectedResult: SearchResult | null;
  campus: string;
  onBayClick?: (shelf: ShelfInfo) => void;
  onGuideModeChange?: (isGuideMode: boolean) => void;
}

export default function ViewerPanel({ selectedResult, campus, onBayClick, onGuideModeChange }: ViewerPanelProps) {
  const [racks, setRacks] = useState<RackInfo[]>([]);
  const [guideWaypoints, setGuideWaypoints] = useState<PathWaypoint[] | null>(null);
  const [isGuideMode, setIsGuideMode] = useState(false);
  const [currentGuideStep, setCurrentGuideStep] = useState(0);

  // Reset guide khi chọn kệ khác hoặc đổi campus
  useEffect(() => {
    setIsGuideMode(false);
    onGuideModeChange?.(false);
    setCurrentGuideStep(0);
    setGuideWaypoints(null);
  }, [selectedResult, campus, onGuideModeChange]);

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

  const shelfPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(-15, 0, -30);
    const sorted = [...racks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    const index = sorted.findIndex((r) => r.rackNumber === shelf.rackNumber);
    if (index === -1) return new THREE.Vector3(0, 0, 0);

    const x = campus === 'Thu Duc' ? (2 - shelf.bay) * 3 + 1.65 : (shelf.bay - 2) * 3 + 1.65;
    const y = 2.5;
    const z = -(index - sorted.length / 2) * 4.0; // ROW_SPACING_Z = 4.0
    return new THREE.Vector3(x, y, z);
  }, [shelf, racks]);

  const targetPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(-15, 0, -30);

    if (campus === 'Sai Gon') {
      const sorted = [...racks].sort((a, b) => a.rackNumber - b.rackNumber);
      // Đặt mục tiêu ở giữa không gian từ cửa ra vào tới kệ sách để dễ nhìn đường đi
      const rack2Index = sorted.findIndex((r) => r.rackNumber === 2);
      const rack2Z = rack2Index !== -1 ? -(rack2Index - sorted.length / 2) * 4.0 : 0;
      const startZ = rack2Z + 10;
      const startX = -34.6;

      return new THREE.Vector3((startX + shelfPos.x) / 2, shelfPos.y, (startZ + shelfPos.z) / 2);
    }

    return shelfPos;
  }, [shelf, racks, campus, shelfPos]);

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
        camera={{ position: [-60, 25, 150], fov: 65 }}
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
            campus={campus}
            highlightRack={shelf?.rackNumber ?? null}
            highlightBay={shelf?.bay ?? null}
            highlightFace={shelf?.face ?? null}
            onBayClick={handleSceneBayClick}
            onPathCalculated={setGuideWaypoints}
          />
        </Suspense>

        {/* Sàn nhà */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[500, 500]} />
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>

        {/* Tường phía sau - Dời ra xa để không che bàn ghế bên trái */}
        <mesh position={[100, 15, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[600, 60]} />
          <meshStandardMaterial color="#f1f3f5" />
        </mesh>

        {!isGuideMode && (
          <MapControls
            makeDefault
            minDistance={10}
            maxDistance={300}
            minPolarAngle={0.2}
            maxPolarAngle={1.5}
            enableDamping
            dampingFactor={0.08}
            panSpeed={2}
          />
        )}

        {!isGuideMode && <FocusManager target={targetPos} isPathView={!!shelf} campus={campus} highlightFace={shelf?.face ?? null} />}
        {isGuideMode && guideWaypoints && (
          <FirstPersonCamera
            waypoints={guideWaypoints}
            currentStep={currentGuideStep}
            finalLookAt={shelfPos}
          />
        )}
      </Canvas>

      {/* Info overlay */}
      {selectedResult && !isGuideMode && (
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

            {/* Start Guide Button inside Info Card */}
            {guideWaypoints && (
              <button
                className="start-guide-btn-inline"
                onClick={() => { setIsGuideMode(true); onGuideModeChange?.(true); setCurrentGuideStep(0); }}
              >
                <span>🚶‍♂️</span> Bắt đầu hướng dẫn đi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bay label at bottom */}
      {selectedResult && !isGuideMode && (
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

      {/* Guide UI Overlays */}

      {isGuideMode && guideWaypoints && (
        <div className="guide-controls-overlay">
          <div className="guide-step-info">
            Bước {currentGuideStep + 1} / {guideWaypoints.length}
            <div className="guide-step-msg">
              {guideWaypoints[currentGuideStep].msg}
            </div>
          </div>
          <div className="guide-nav-btns">
            <button
              className="guide-btn guide-btn-back"
              onClick={() => setCurrentGuideStep(Math.max(0, currentGuideStep - 1))}
              disabled={currentGuideStep === 0}
            >
              ⬅️ Lùi lại
            </button>
            <button
              className="guide-btn guide-btn-next"
              onClick={() => setCurrentGuideStep(Math.min(guideWaypoints.length - 1, currentGuideStep + 1))}
              disabled={currentGuideStep === guideWaypoints.length - 1}
            >
              Đi tiếp ➡️
            </button>
          </div>
          <button
            className="guide-btn guide-btn-exit"
            onClick={() => { setIsGuideMode(false); onGuideModeChange?.(false); }}
          >
            ❌ Thoát hướng dẫn
          </button>
        </div>
      )}
    </div>
  );
}

function FirstPersonCamera({
  waypoints,
  currentStep,
  finalLookAt
}: {
  waypoints: PathWaypoint[];
  currentStep: number;
  finalLookAt: THREE.Vector3;
}) {
  const { camera } = useThree();
  const lerpStepRef = useRef(currentStep); // float, converges toward currentStep mỗi frame
  const targetPos = useRef(new THREE.Vector3());
  const lookAtPos = useRef(new THREE.Vector3());
  const targetQuat = useRef(new THREE.Quaternion());
  const origFovRef = useRef<number>((camera as any).fov ?? 40);

  useEffect(() => {
    origFovRef.current = (camera as any).fov ?? 40;
    return () => {
      (camera as any).fov = origFovRef.current;
      camera.updateProjectionMatrix();
    };
  }, [camera]);

  useFrame(() => {
    if (!waypoints || waypoints.length === 0) return;

    // Lerp lerpStepRef về currentStep — đây là mấu chốt làm cả tiến lẫn lùi đều mượt
    lerpStepRef.current += (currentStep - lerpStepRef.current) * 0.08;
    const ls = lerpStepRef.current;

    // Nội suy vị trí giữa 2 waypoints liền kề dựa trên ls (float)
    const loIdx = Math.max(0, Math.min(waypoints.length - 1, Math.floor(ls)));
    const hiIdx = Math.max(0, Math.min(waypoints.length - 1, Math.ceil(ls)));
    const t = ls - loIdx; // 0..1 giữa 2 waypoints

    const posLo = waypoints[loIdx].pos;
    const posHi = waypoints[hiIdx].pos;

    const tp = targetPos.current;
    tp.set(
      posLo.x + (posHi.x - posLo.x) * t,
      3.5,
      posLo.z + (posHi.z - posLo.z) * t
    );

    // Điều chỉnh cao độ / lùi ra ở gần bước cuối
    if (ls >= waypoints.length - 2) {
      const blend = Math.max(0, ls - (waypoints.length - 2)); // 0..1
      tp.x -= 1.3 * blend;
    }
    if (ls >= waypoints.length - 1 - 0.01) {
      tp.y = 2.5;
      const pushBackDir = Math.sign(tp.z - finalLookAt.z);
      tp.z += pushBackDir * 1.0;
    }

    // lookAt: nhìn về waypoint tiếp theo theo hướng di chuyển
    const lookIdx = Math.min(waypoints.length - 1, hiIdx + 1);
    const lp = lookAtPos.current;
    if (lookIdx < waypoints.length) {
      lp.set(waypoints[lookIdx].pos.x, 3.5, waypoints[lookIdx].pos.z);
    } else {
      lp.copy(finalLookAt);
    }
    if (ls >= waypoints.length - 1 - 0.1) {
      lp.copy(finalLookAt);
    }

    // Lerp vị trí camera
    camera.position.lerp(tp, 0.07);

    // Lerp rotation mượt
    const savedQuat = camera.quaternion.clone();
    camera.lookAt(lp);
    targetQuat.current.copy(camera.quaternion);
    camera.quaternion.copy(savedQuat);
    camera.quaternion.slerp(targetQuat.current, 0.07);

    // Lerp FOV 40 → 85
    const cam = camera as any;
    if (cam.fov !== undefined && Math.abs(cam.fov - 85) > 0.1) {
      cam.fov += (85 - cam.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}


function FocusManager({ target, isPathView, campus, highlightFace }: { target: THREE.Vector3, isPathView: boolean, campus: string, highlightFace: number | null }) {
  const { controls, camera } = useThree();
  const [isFocusing, setIsFocusing] = useState(false);
  const targetCamPos = useMemo(() => new THREE.Vector3(), []);

  // Khi mục tiêu thay đổi, kích hoạt trạng thái focus
  useEffect(() => {
    setIsFocusing(true);
    if (isPathView) {
      if (campus === 'Thu Duc') {
        // Góc nhìn rộng cố định nhưng gần hơn một chút để thấy rõ chi tiết
        targetCamPos.set(-60, 30, 70);
      } else {
        // Sài Gòn: Kệ xếp dọc nên zoom từ góc chéo
        targetCamPos.set(target.x - 10, 20, target.z + 20);
      }
    }
  }, [target, isPathView, targetCamPos, campus]);

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
      const camDistance = isPathView ? camera.position.distanceTo(targetCamPos) : 0;

      // Khi đã đến rất gần, dừng focus
      if (distance < 0.1 && camDistance < 1.0) {
        setIsFocusing(false);
      } else {
        if (campus === 'Thu Duc') {
          // Thủ Đức: Luôn về góc nhìn rộng cố định bao quát toàn sảnh (như screenshot 10:23 AM)
          const roomCenter = new THREE.Vector3(-25, 0, 30);
          (controls as any).target.lerp(roomCenter, 0.05);
          camera.position.lerp(targetCamPos, 0.05);
        } else {
          // Sài Gòn: Zoom vào từng kệ
          (controls as any).target.lerp(target, 0.05);
          if (isPathView) {
            camera.position.lerp(targetCamPos, 0.05);
          }
        }
        (controls as any).update();
      }
    }
  });

  return null;
}