import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import BookshelfScene, { type PathWaypoint } from './BookshelfScene';
import type { SearchResult, RackInfo, ShelfInfo } from '../types';

interface ViewerPanelProps {
  selectedResult: SearchResult | null;
  campus: string;
  onBayClick?: (shelf: ShelfInfo) => void;
  onGuideModeChange?: (isGuideMode: boolean) => void;
  onClearResult?: () => void;
}

export default function ViewerPanel({ selectedResult, campus, onBayClick, onGuideModeChange, onClearResult }: ViewerPanelProps) {
  const [racks, setRacks] = useState<RackInfo[]>([]);
  const [guideWaypoints, setGuideWaypoints] = useState<PathWaypoint[] | null>(null);
  const [isGuideMode, setIsGuideMode] = useState(false);
  const [currentGuideStep, setCurrentGuideStep] = useState(0);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [userStartRack, setUserStartRack] = useState<number | null>(null);
  const [isPathOverview, setIsPathOverview] = useState(false);

  // Detect touch device (mobile/tablet)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  // Track kệ đang được focus (có thể từ search result hoặc click trực tiếp trên 3D)
  const [focusRack, setFocusRack] = useState<number | null>(null);
  const [focusBay, setFocusBay] = useState<number | null>(null);
  const [focusFace, setFocusFace] = useState<number | null>(null);

  // Reset guide khi chọn kệ khác hoặc đổi campus
  useEffect(() => {
    setIsGuideMode(false);
    setIsPathOverview(false);
    onGuideModeChange?.(false);
    setCurrentGuideStep(0);
    setGuideWaypoints(null);
    setShowStartPicker(false);
    setUserStartRack(null);
    // Reset focus khi đổi campus hoặc search result
    setFocusRack(selectedResult?.shelf?.rackNumber ?? null);
    setFocusBay(selectedResult?.shelf?.bay ?? null);
    setFocusFace(selectedResult?.shelf?.face ?? null);
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

  // Sync focusRack/Bay/Face với shelf từ search result
  useEffect(() => {
    if (shelf) {
      setFocusRack(shelf.rackNumber);
      setFocusBay(shelf.bay);
      setFocusFace(shelf.face);
    }
  }, [shelf]);

  // Tính vị trí 3D của kệ đang focus (dùng focusRack/Bay/Face)
  const focusShelfPos = useMemo(() => {
    if (focusRack === null || focusBay === null || focusFace === null || racks.length === 0) return null;
    const sorted = [...racks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    const index = sorted.findIndex((r) => r.rackNumber === focusRack);
    if (index === -1) return null;

    const x = campus === 'Thu Duc'
      ? -4.5 + (focusBay - 3.5) * 3 + 1.65
      : (focusBay - 2) * 3 + 1.65;
    const y = 2.5;
    const z = -(index - sorted.length / 2) * 4.0;
    return new THREE.Vector3(x, y, z);
  }, [focusRack, focusBay, focusFace, racks, campus]);

  const shelfPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(-15, 0, -30);
    const sorted = [...racks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    const index = sorted.findIndex((r) => r.rackNumber === shelf.rackNumber);
    if (index === -1) return new THREE.Vector3(0, 0, 0);

    const x = campus === 'Thu Duc'
      ? -4.5 + (shelf.bay - 3.5) * 3 + 1.65
      : (shelf.bay - 2) * 3 + 1.65;
    const y = 2.5;
    const z = -(index - sorted.length / 2) * 4.0; // ROW_SPACING_Z = 4.0
    return new THREE.Vector3(x, y, z);
  }, [shelf, racks, campus]);

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

    if (campus === 'Thu Duc') {
      // Góc nhìn tổng quan từ cửa thang máy cho Thủ Đức để thấy toàn bộ đường đi
      return new THREE.Vector3(-45, 25, 45);
    }

    return shelfPos;
  }, [shelf, racks, campus, shelfPos]);

  const clearFocus = () => {
    setFocusRack(null);
    setFocusBay(null);
    setFocusFace(null);
    onClearResult?.();
  };

  const handleSceneBayClick = (rackNumber: number, bay: number, face: number) => {
    // Toggle: click vào kệ đang focus → reset hoàn toàn
    if (focusRack === rackNumber && focusBay === bay && focusFace === face) {
      clearFocus();
      return;
    }

    // Click kệ khác → chuyển focus
    setFocusRack(rackNumber);
    setFocusBay(bay);
    setFocusFace(face);

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
        key={campus}
        className="viewer-canvas"
        camera={{ position: campus === 'Sai Gon' ? [-34.6, 20, 30] : [-60, 25, 150], fov: 65 }}
        shadows
        onPointerMissed={clearFocus}
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
            highlightRack={focusRack}
            highlightBay={focusBay}
            highlightFace={focusFace}
            startRackNumber={userStartRack}
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
          isMobile ? (
            // Mobile: OrbitControls — 1 ngón pan, 2 ngón xoay + zoom
            <OrbitControls
              makeDefault
              minDistance={10}
              maxDistance={300}
              minPolarAngle={0.1}
              maxPolarAngle={Math.PI - 0.1}
              enableDamping
              dampingFactor={0.08}
              enablePan={true}
              panSpeed={1.5}
              rotateSpeed={0.8}
              zoomSpeed={1.2}
              touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
            />
          ) : (
            // Desktop: MapControls — chuột trái pan, chuột phải xoay
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
          )
        )}

        {!isGuideMode && <FocusManager target={focusShelfPos ?? targetPos} isPathView={focusShelfPos !== null} campus={campus} highlightFace={focusFace} />}
        {isGuideMode && guideWaypoints && (
          <FirstPersonCamera
            waypoints={guideWaypoints}
            currentStep={currentGuideStep}
            finalLookAt={shelfPos}
            campus={campus}
          />
        )}
        {isPathOverview && guideWaypoints && (
          <PathOverviewCamera waypoints={guideWaypoints} />
        )}
      </Canvas>

      {/* Info overlay */}
      {selectedResult && !isGuideMode && !isPathOverview && (
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

            {/* Nút mở picker checkpoint */}
            {guideWaypoints && (
              <button
                className="start-guide-btn-inline"
                onClick={() => { setUserStartRack(null); setShowStartPicker(true); }}
              >
                <span>🚶‍♂️</span> Bắt đầu hướng dẫn đi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bay label at bottom */}
      {selectedResult && !isGuideMode && !isPathOverview && (
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

      {/* Checkpoint Picker */}
      {showStartPicker && (
        <div className="start-picker-overlay">
          <div className="start-picker-card">
            <div className="start-picker-title">📍 Bạn đang đứng ở đâu?</div>
            <p className="start-picker-sub">Chọn vị trí xuất phát để tính đường đi chính xác</p>

            <div className="start-picker-options">
              <button
                className={`start-picker-entrance${userStartRack === null ? ' selected' : ''}`}
                onClick={() => setUserStartRack(null)}
              >
                🚪 {campus === 'Thu Duc' ? 'Thang máy / Cửa vào' : 'Cửa ra vào'}
              </button>

              {/* Bàn thủ thư — Hiện cho cả 2 cơ sở */}
              <button
                className={`start-picker-entrance${userStartRack === -1 ? ' selected' : ''}`}
                onClick={() => setUserStartRack(-1)}
              >
                📋 Quầy thủ thư
              </button>

              <div className="start-picker-grid">
                {(() => {
                  const displayRacks = [...racks];
                  // Nếu là Sài Gòn và thiếu kệ 1 trong danh sách, thêm vào
                  if (campus === 'Sai Gon' && !displayRacks.find(r => r.rackNumber === 1)) {
                    displayRacks.push({ rackNumber: 1, bays: [1, 2, 3, 4, 5], shelves: [] });
                  }
                  
                  return displayRacks
                    .sort((a, b) => a.rackNumber - b.rackNumber)
                    .filter(r => r.rackNumber !== focusRack)
                    .map(r => (
                      <button
                        key={r.rackNumber}
                        className={`start-picker-rack${userStartRack === r.rackNumber ? ' selected' : ''}`}
                        onClick={() => setUserStartRack(r.rackNumber)}
                      >
                        Kệ {r.rackNumber}
                      </button>
                    ));
                })()}
              </div>
            </div>

            <div className="start-picker-actions">
              <button className="guide-btn guide-btn-exit" onClick={() => setShowStartPicker(false)}>
                Huỷ
              </button>
              <button
                className="start-guide-btn-inline"
                style={{ marginTop: 0, flex: 1 }}
                onClick={() => {
                  setShowStartPicker(false);
                  setIsPathOverview(true);
                  onGuideModeChange?.(true);
                }}
              >
                🚶‍♂️ Bắt đầu đi
              </button>
            </div>
          </div>
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

      {/* Path Overview Overlay */}
      {isPathOverview && guideWaypoints && (
        <div className="overview-controls-overlay">
          <div className="drag-handle"></div>
          <div className="overview-header">
            <div className="overview-icon">📍</div>
            <div className="overview-title">Tổng quát đường đi</div>
          </div>
          <div className="overview-msg">
            Hệ thống đã tính toán đường đi tối ưu cho bạn. Nhấn nút bên dưới để bắt đầu di chuyển.
          </div>
          <div className="overview-actions">
            <button 
              className="start-guide-btn-inline" 
              style={{ marginTop: 0, flex: 1 }}
              onClick={() => {
                setIsPathOverview(false);
                setIsGuideMode(true);
                setCurrentGuideStep(0);
              }}
            >
              🚶‍♂️ Bắt đầu di chuyển
            </button>
            <button 
              className="guide-btn guide-btn-exit" 
              style={{ width: 'auto', padding: '0 20px' }}
              onClick={() => { 
                setIsPathOverview(false); 
                setShowStartPicker(true); 
              }}
            >
              Thoát
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FirstPersonCamera({
  waypoints,
  currentStep,
  finalLookAt,
  campus
}: {
  waypoints: PathWaypoint[];
  currentStep: number;
  finalLookAt: THREE.Vector3;
  campus: string;
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
    lerpStepRef.current += (currentStep - lerpStepRef.current) * 0.03;
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
      if (campus === 'Thu Duc') {
        // Thu Duc: Lùi nhẹ theo X sớm hơn để bao quát
        tp.x -= 1.5 * blend;
      }
    }

    if (ls >= waypoints.length - 1 - 0.01) {
      tp.y = 2.8;
      if (campus === 'Sai Gon') {
        tp.x -= 0.7;
        tp.y = 2.5;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 1.2;
      } else {
        // Thu Duc: Zoom chéo nhưng gần hơn nữa để tránh vướng tuyệt đối (aisle hẹp)
        tp.x = finalLookAt.x - 1.5;
        tp.y = 2.8;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 0.8;
      }
    }

    // lookAt: nhìn về phía cuối của đoạn thẳng hiện tại để luôn nhìn thẳng theo đường line.
    const lookIdx = hiIdx;
    const lp = lookAtPos.current;

    if (ls >= waypoints.length - 2.2) {
      // Giai đoạn cuối: hướng thẳng vào khoang sách nhanh hơn
      lp.lerp(finalLookAt, 0.4);
    } else if (loIdx !== hiIdx) {
      // Nhìn về phía cuối đoạn đường đang đi, giữ độ cao ngang tầm mắt
      lp.set(waypoints[hiIdx].pos.x, 3.5, waypoints[hiIdx].pos.z);
    } else if (lookIdx + 1 < waypoints.length) {
      // Nếu đang đứng yên tại waypoint, nhìn về điểm tiếp theo
      lp.set(waypoints[lookIdx + 1].pos.x, 3.5, waypoints[lookIdx + 1].pos.z);
    } else {
      lp.copy(finalLookAt);
    }

    if (ls >= waypoints.length - 1 - 0.05) {
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

function PathOverviewCamera({
  waypoints
}: {
  waypoints: PathWaypoint[];
}) {
  const { camera } = useThree();
  const targetCamPos = useMemo(() => new THREE.Vector3(), []);
  const targetCenter = useMemo(() => new THREE.Vector3(), []);
  const targetQuat = useRef(new THREE.Quaternion(0, 0, 0, 1));

  useEffect(() => {
    if (!waypoints || waypoints.length === 0) return;

    const box = new THREE.Box3();
    waypoints.forEach(wp => box.expandByPoint(wp.pos));

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.z, 25);
    
    // Position camera high and back to see everything
    targetCamPos.set(center.x - maxDim * 0.8, maxDim * 0.9 + 15, center.z + maxDim * 0.8);
    targetCenter.set(center.x, 0, center.z); // Nhìn vào tâm ở mặt đất
  }, [waypoints, targetCamPos, targetCenter]);

  useFrame(() => {
    // Lerp position
    camera.position.lerp(targetCamPos, 0.05);
    
    // Lerp rotation
    const savedQuat = camera.quaternion.clone();
    camera.lookAt(targetCenter);
    targetQuat.current.copy(camera.quaternion);
    camera.quaternion.copy(savedQuat);
    camera.quaternion.slerp(targetQuat.current, 0.05);
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
    if (campus === 'Thu Duc' && !isPathView) {
      // Thủ Đức Overview: Camera ở thang máy
      targetCamPos.set(-45, 25, 45);
    } else if (campus === 'Thu Duc') {
      // Thủ Đức: Zoom sát kệ từ phía mặt trước hoặc sau
      const zOffset = highlightFace === 2 ? -10 : 10;
      targetCamPos.set(target.x - 3, 8, target.z + zOffset);
    } else if (campus === 'Sai Gon' && !isPathView) {
      // Sài Gòn Overview: Camera nhìn từ cửa ra vào
      targetCamPos.set(-34.6, 20, 30);
    } else {
      // Sài Gòn: Zoom sát kệ từ phía mặt tương ứng
      const zOffset = highlightFace === 2 ? -8 : 8;
      targetCamPos.set(target.x - 5, 8, target.z + zOffset);
    }
  }, [target, isPathView, targetCamPos, campus, highlightFace]);

  // Nếu người dùng bắt đầu tương tác, ngừng tự động focus
  useEffect(() => {
    if (!controls) return;
    const stopFocus = () => setIsFocusing(false);
    (controls as any).addEventListener('start', stopFocus);
    return () => (controls as any).removeEventListener('start', stopFocus);
  }, [controls]);

  useFrame(() => {
    if (controls && isFocusing) {
      // Tính effective target để nhìn vào
      let effectiveTarget: THREE.Vector3;
      if (campus === 'Thu Duc' && !isPathView) {
        effectiveTarget = new THREE.Vector3(-10, 0, 10);
      } else if (campus === 'Sai Gon' && !isPathView) {
        // Overview Sài Gòn: nhìn vào giữa khu vực kệ
        effectiveTarget = new THREE.Vector3(0, 0, 0);
      } else {
        effectiveTarget = target;
      }

      const distance = (controls as any).target.distanceTo(effectiveTarget);
      const camDistance = camera.position.distanceTo(targetCamPos);

      if (distance < 0.1 && camDistance < 0.5) {
        setIsFocusing(false);
      } else {
        (controls as any).target.lerp(effectiveTarget, 0.07);
        camera.position.lerp(targetCamPos, 0.07);
        (controls as any).update();
      }
    }
  });

  return null;
}