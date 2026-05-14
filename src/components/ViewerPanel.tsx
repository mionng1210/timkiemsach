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
  onEditingChange?: (isEditing: boolean) => void;
}

export default function ViewerPanel({ selectedResult, campus, onBayClick, onGuideModeChange, onClearResult, onEditingChange }: ViewerPanelProps) {
  const [racks, setRacks] = useState<RackInfo[]>([]);
  const [guideWaypoints, setGuideWaypoints] = useState<PathWaypoint[] | null>(null);
  const [isGuideMode, setIsGuideMode] = useState(false);
  const [currentGuideStep, setCurrentGuideStep] = useState(0);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [userStartRack, setUserStartRack] = useState<number | null>(null);
  const [isPathOverview, setIsPathOverview] = useState(false);

  // Position of a new shelf being added
  const [addingShelfPos, setAddingShelfPos] = useState<{ x: number, z: number, rackNumber?: number, bay?: number, face?: number } | null>(null);

  // Draggable Admin Panel state
  const [adminPanelPos, setAdminPanelPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

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

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [editingShelf, setEditingShelf] = useState<ShelfInfo | null>(null);

  useEffect(() => {
    onEditingChange?.(editingShelf !== null || addingShelfPos !== null);
  }, [editingShelf, addingShelfPos, onEditingChange]);

  const handleUpdateDewey = async (id: number, deweyStart: number, deweyEnd: number) => {
    try {
      const res = await fetch(`/api/admin/shelves/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deweyStart, deweyEnd }),
      });
      if (res.ok) {
        // Refresh racks
        const res2 = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res2.json();
        setRacks(data.racks || []);
        setEditingShelf(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddShelf = async () => {
    if (!addingShelfPos) return;

    const rackNumber = parseInt((document.getElementById('addRackNumber') as HTMLInputElement).value);
    const bay = parseInt((document.getElementById('addBay') as HTMLInputElement).value);

    // Dữ liệu Mặt trước (Face 1)
    const code1 = (document.getElementById('addCode1') as HTMLInputElement).value;
    const deweyStart1 = parseFloat((document.getElementById('addDeweyStart1') as HTMLInputElement).value);
    const deweyEnd1 = parseFloat((document.getElementById('addDeweyEnd1') as HTMLInputElement).value);

    // Dữ liệu Mặt sau (Face 2)
    const code2 = (document.getElementById('addCode2') as HTMLInputElement).value;
    const deweyStart2 = parseFloat((document.getElementById('addDeweyStart2') as HTMLInputElement).value);
    const deweyEnd2 = parseFloat((document.getElementById('addDeweyEnd2') as HTMLInputElement).value);

    let successCount = 0;
    let attemptCount = 0;

    const addFace = async (code: string, face: number, dStart: number, dEnd: number) => {
      if (!code || !code.trim()) return; // Bỏ qua nếu mã dãy trống
      attemptCount++;
      try {
        const res = await fetch(`/api/admin/shelves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rackNumber, code, bay, face, deweyStart: dStart, deweyEnd: dEnd, campus,
            positionX: addingShelfPos.x, positionZ: addingShelfPos.z
          }),
        });
        if (res.ok) successCount++;
      } catch (err) {
        console.error(err);
      }
    };

    // Tạo các mặt có thông tin
    await addFace(code1, 1, deweyStart1, deweyEnd1);
    await addFace(code2, 2, deweyStart2, deweyEnd2);

    if (attemptCount === 0) {
      alert('Vui lòng nhập Mã dãy cho ít nhất một mặt kệ!');
      return;
    }

    if (successCount === attemptCount) {
      // Refresh racks
      const res2 = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
      const data = await res2.json();
      setRacks(data.racks || []);
      setAddingShelfPos(null);
    } else {
      alert('Có lỗi xảy ra khi thêm kệ! Một số mặt có thể chưa được thêm.');
    }
  };

  const handleDeleteShelf = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa kệ này?')) return;
    try {
      const res = await fetch(`/api/admin/shelves/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const res2 = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res2.json();
        setRacks(data.racks || []);
        clearFocus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteBay = async (rackNumber: number, bay: number) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa TOÀN BỘ dãy (bay) ${bay} của kệ ${rackNumber}?`)) return;
    try {
      const res = await fetch(`/api/admin/racks/${rackNumber}/bays/${bay}?campus=${encodeURIComponent(campus)}`, { method: 'DELETE' });
      if (res.ok) {
        const res2 = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res2.json();
        setRacks(data.racks || []);
        clearFocus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSceneBayClick = (rackNumber: number, bay: number, face: number) => {
    const rack = racks.find((r) => r.rackNumber === rackNumber);
    if (!rack) return;
    const clickedShelf = rack.shelves.find((s) => s.bay === bay && s.face === face);

    if (isAdminMode) {
      setFocusRack(rackNumber);
      setFocusBay(bay);
      setFocusFace(face);
      if (clickedShelf) {
        setEditingShelf(clickedShelf);
        setAddingShelfPos(null);
      } else {
        // Tìm kệ đối diện để lấy toạ độ X, Z chính xác
        const oppositeFace = face === 1 ? 2 : 1;
        const oppositeShelf = rack.shelves.find((s) => s.bay === bay && s.face === oppositeFace);
        
        let px = 0; let pz = 0;
        if (oppositeShelf && oppositeShelf.positionX != null && oppositeShelf.positionZ != null) {
          px = oppositeShelf.positionX;
          pz = oppositeShelf.positionZ;
        } else {
          // Tính toán vị trí cho kệ tuần tự (sequential)
          const sorted = [...racks].sort((a, b) => {
            if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
            return a.rackNumber - b.rackNumber;
          });
          const index = sorted.findIndex((r) => r.rackNumber === rackNumber);
          px = campus === 'Thu Duc' ? -4.5 : 0;
          pz = -(index - sorted.length / 2) * 4.0;
        }

        setAddingShelfPos({ x: px, z: pz, rackNumber, bay, face });
        setEditingShelf(null);
      }
      return;
    }

    // Toggle: click vào kệ đang focus → reset hoàn toàn
    if (focusRack === rackNumber && focusBay === bay && focusFace === face) {
      clearFocus();
      return;
    }

    // Click kệ khác → chuyển focus
    setFocusRack(rackNumber);
    setFocusBay(bay);
    setFocusFace(face);

    if (clickedShelf && onBayClick) {
      onBayClick(clickedShelf);
    }
  };

  const handleDragMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    const panel = (e.currentTarget as HTMLElement).closest('.admin-shelf-panel');
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    setIsDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new position relative to the viewport
      // But we'll use it as 'left' and 'top' which are relative to the viewer-panel container
      const container = document.querySelector('.viewer-panel');
      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      let newX = e.clientX - containerRect.left - dragOffset.current.x;
      let newY = e.clientY - containerRect.top - dragOffset.current.y;

      // Optional: boundary checks
      newX = Math.max(0, Math.min(newX, containerRect.width - 320));
      newY = Math.max(0, Math.min(newY, containerRect.height - 400));

      setAdminPanelPos({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Reset admin panel position when a new shelf or adding position is selected
  useEffect(() => {
    if (editingShelf || addingShelfPos) {
      // Initial position: top 80px, right 24px (relative to container)
      const container = document.querySelector('.viewer-panel');
      if (container) {
        const rect = container.getBoundingClientRect();
        setAdminPanelPos({ x: rect.width - 320 - 24, y: 80 });
      }
    }
  }, [editingShelf, addingShelfPos]);

  return (
    <div className="viewer-panel">
      <div className="viewer-top-bar">
        <div className="rack-counter">
          🏗️ {racks.length} kệ — {campus === 'Thu Duc' ? '🌳 Thủ Đức' : '🏙️ Sài Gòn'}
        </div>
        <button
          className={`admin-toggle-btn ${isAdminMode ? 'active' : ''}`}
          onClick={() => {
            setIsAdminMode(!isAdminMode);
            setEditingShelf(null);
            setAddingShelfPos(null);
          }}
        >
          {isAdminMode ? '🔓 Admin Mode: ON' : '🔒 Admin Mode: OFF'}
        </button>
      </div>

      <Canvas
        key={campus}
        className="viewer-canvas"
        camera={{ position: campus === 'Sai Gon' ? [-34.6, 20, 30] : [-60, 25, 150], fov: 65 }}
        shadows
        onPointerMissed={() => {
          clearFocus();
          setEditingShelf(null);
          setAddingShelfPos(null);
        }}
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
            isAdminMode={isAdminMode}
            onAddRackAt={(x, z) => {
              // Tìm kiếm các kệ lân cận để gợi ý số Rack và số Bay
              let suggestedRack = 10;
              let suggestedBay = 1;
              
              // Lấy tất cả shelves có toạ độ X, Z (custom shelves)
              const customShelves = racks.flatMap(r => r.shelves).filter(s => s.positionX != null && s.positionZ != null);
              
              // 1. Dò tìm kệ trên cùng trục Z
              const sameZShelves = customShelves.filter(s => Math.abs(s.positionZ! - z) < 0.1);
              
              if (sameZShelves.length > 0) {
                // Tìm kệ gần nhất theo trục X
                const closest = sameZShelves.reduce((prev, curr) => 
                  Math.abs(curr.positionX! - x) < Math.abs(prev.positionX! - x) ? curr : prev
                );
                
                suggestedRack = closest.rackNumber;
                
                // Tính toán số Bay dựa trên khoảng cách (mỗi Bay cách nhau 3 đơn vị)
                const distX = x - closest.positionX!;
                const bayDiff = Math.round(distX / 3.0);
                suggestedBay = closest.bay + bayDiff;
              }

              // Đảm bảo số bay không âm
              if (suggestedBay < 1) suggestedBay = 1;

              setAddingShelfPos({ 
                x, 
                z, 
                rackNumber: suggestedRack, 
                bay: suggestedBay, 
                face: 1 
              });
              setEditingShelf(null);
            }}
          />
        </Suspense>

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
          <planeGeometry args={[500, 500]} />
          <meshStandardMaterial color="#f8f9fa" />
        </mesh>

        <mesh position={[100, 15, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[600, 60]} />
          <meshStandardMaterial color="#f1f3f5" />
        </mesh>

        {!isGuideMode && (
          isMobile ? (
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

      {isAdminMode && editingShelf && (
        <div
          className="admin-shelf-panel"
          key={editingShelf.shelfId}
          style={{
            left: isMobile ? 0 : adminPanelPos.x,
            top: isMobile ? 'auto' : adminPanelPos.y,
            bottom: isMobile ? 0 : 'auto',
            right: isMobile ? 0 : 'auto',
            position: isMobile ? 'fixed' : 'absolute'
          }}
        >
          <h3 style={{ cursor: 'move', userSelect: 'none' }} onMouseDown={isMobile ? undefined : handleDragMouseDown}>
            🔧 Quản lý Kệ {editingShelf.rackNumber}
          </h3>
          <p>Mã kệ: <strong>{editingShelf.code.toUpperCase()}</strong> | Bay: {editingShelf.bay} | Mặt: {editingShelf.face === 1 ? 'Trước' : 'Sau'}</p>

          <div className="admin-form-group">
            <label>Dewey Start:</label>
            <input
              type="text"
              defaultValue={editingShelf.deweyStart.toFixed(3)}
              id="deweyStart"
            />
          </div>
          <div className="admin-form-group">
            <label>Dewey End:</label>
            <input
              type="text"
              defaultValue={editingShelf.deweyEnd.toFixed(3)}
              id="deweyEnd"
            />
          </div>

          <div className="admin-actions">
            <button className="admin-btn update" onClick={() => {
              const start = parseFloat((document.getElementById('deweyStart') as HTMLInputElement).value);
              const end = parseFloat((document.getElementById('deweyEnd') as HTMLInputElement).value);
              handleUpdateDewey(editingShelf.shelfId, start, end);
            }}>
              Lưu thay đổi
            </button>
            <div className="admin-actions-row">
              <button className="admin-btn delete-shelf" onClick={() => handleDeleteShelf(editingShelf.shelfId)}>
                Xóa ô này
              </button>
              <button className="admin-btn delete-bay" onClick={() => handleDeleteBay(editingShelf.rackNumber, editingShelf.bay)}>
                Xóa cả dãy
              </button>
            </div>
            <button className="admin-btn cancel" onClick={() => setEditingShelf(null)}>
              Đóng
            </button>
          </div>
        </div>
      )}

      {isAdminMode && addingShelfPos && (
        <div
          className="admin-shelf-panel"
          key={`add-${addingShelfPos.x}-${addingShelfPos.z}-${addingShelfPos.rackNumber}-${addingShelfPos.bay}-${addingShelfPos.face}`}
          style={{
            left: isMobile ? 0 : adminPanelPos.x,
            top: isMobile ? 'auto' : adminPanelPos.y,
            bottom: isMobile ? 0 : 'auto',
            right: isMobile ? 0 : 'auto',
            position: isMobile ? 'fixed' : 'absolute'
          }}
        >
          <h3 style={{ cursor: 'move', userSelect: 'none' }} onMouseDown={isMobile ? undefined : handleDragMouseDown}>
            ➕ Thêm Kệ Mới
          </h3>
          <p>Tại tọa độ: X={addingShelfPos.x.toFixed(1)}, Z={addingShelfPos.z.toFixed(1)}</p>

          <div className="admin-form-group">
            <label>Số Rack (VD: 10):</label>
            <input type="number" id="addRackNumber" defaultValue={addingShelfPos.rackNumber ?? 10} />
          </div>
          <div className="admin-form-group">
            <label>Khoang (Bay):</label>
            <input 
              type="number" 
              id="addBay" 
              defaultValue={addingShelfPos.bay ?? 1} 
              disabled={(addingShelfPos.bay ?? 1) > 1}
              style={(addingShelfPos.bay ?? 1) > 1 ? { 
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                color: 'rgba(232, 236, 244, 0.4)',
                cursor: 'not-allowed',
                border: '1px solid var(--border)',
                fontWeight: 'bold',
                opacity: 1
              } : {}}
            />
          </div>

          <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt trước (1)</div>
          <div className="admin-form-group">
            <label>Mã dãy:</label>
            <input type="text" id="addCode1" defaultValue={addingShelfPos.face === 1 || !addingShelfPos.face ? `${addingShelfPos.rackNumber ?? 10}a` : ""} placeholder="Bỏ trống nếu không tạo" />
          </div>
          <div className="admin-form-group">
            <label>Dewey Start:</label>
            <input type="text" id="addDeweyStart1" defaultValue="0.000" />
          </div>
          <div className="admin-form-group">
            <label>Dewey End:</label>
            <input type="text" id="addDeweyEnd1" defaultValue="999.999" />
          </div>

          <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt sau (2)</div>
          <div className="admin-form-group">
            <label>Mã dãy:</label>
            <input type="text" id="addCode2" defaultValue={addingShelfPos.face === 2 ? `${addingShelfPos.rackNumber ?? 10}b` : (addingShelfPos.face === undefined ? `${addingShelfPos.rackNumber ?? 10}b` : "")} placeholder="Bỏ trống nếu không tạo" />
          </div>
          <div className="admin-form-group">
            <label>Dewey Start:</label>
            <input type="text" id="addDeweyStart2" defaultValue="0.000" />
          </div>
          <div className="admin-form-group">
            <label>Dewey End:</label>
            <input type="text" id="addDeweyEnd2" defaultValue="999.999" />
          </div>

          <div className="admin-actions">
            <button className="admin-btn update" onClick={handleAddShelf}>
              Thêm kệ
            </button>
            <button className="admin-btn cancel" onClick={() => setAddingShelfPos(null)}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {selectedResult && !isGuideMode && !isPathOverview && (
        <div className="viewer-info-overlay">
          <div className="info-card">
            <div className="info-card-header">
              <div className="info-card-title">Vị trí sách</div>
              <div className="info-campus-badge">{selectedResult.campus}</div>
            </div>

            <div className="info-stats-grid">
              <div className="stat-item">
                <span className="stat-label">Dãy</span>
                <span className="stat-value highlight">{shelf!.code.toUpperCase()}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Kệ</span>
                <span className="stat-value">{shelf!.rackNumber}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Khoang</span>
                <span className="stat-value">{shelf!.bay}</span>
              </div>
            </div>

            <div className="info-details-row">
              <div className="detail-item">
                <span className="detail-icon">{shelf!.face === 1 ? '🔵' : '🟠'}</span>
                {shelf!.face === 1 ? 'Mặt trước' : 'Mặt sau'}
              </div>
              <div className="detail-item dewey">
                <span>Dewey:</span> {shelf!.deweyStart.toFixed(3)} – {shelf!.deweyEnd.toFixed(3)}
              </div>
            </div>

            {guideWaypoints && (
              <button
                className="start-guide-btn-inline"
                onClick={() => { setUserStartRack(null); setShowStartPicker(true); }}
              >
                <span>🚶‍♂️</span> Tìm đường đi
              </button>
            )}
          </div>
        </div>
      )}

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


      {!selectedResult && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div className="empty-state-icon">🏗️</div>
          <h3>Chọn một kệ sách</h3>
          <p>Tìm kiếm bên trái và chọn kệ để xem vị trí trên mô hình 3D</p>
        </div>
      )}

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

              <button
                className={`start-picker-entrance${userStartRack === -1 ? ' selected' : ''}`}
                onClick={() => setUserStartRack(-1)}
              >
                📋 Quầy thủ thư
              </button>

              <div className="start-picker-grid">
                {(() => {
                  const displayRacks = [...racks];
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
  const lerpStepRef = useRef(currentStep);
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
    lerpStepRef.current += (currentStep - lerpStepRef.current) * 0.03;
    const ls = lerpStepRef.current;
    const loIdx = Math.max(0, Math.min(waypoints.length - 1, Math.floor(ls)));
    const hiIdx = Math.max(0, Math.min(waypoints.length - 1, Math.ceil(ls)));
    const t = ls - loIdx;
    const posLo = waypoints[loIdx].pos;
    const posHi = waypoints[hiIdx].pos;
    const tp = targetPos.current;
    tp.set(posLo.x + (posHi.x - posLo.x) * t, 3.5, posLo.z + (posHi.z - posLo.z) * t);

    if (ls >= waypoints.length - 2) {
      const blend = Math.max(0, ls - (waypoints.length - 2));
      if (campus === 'Thu Duc') tp.x -= 1.5 * blend;
    }

    if (ls >= waypoints.length - 1 - 0.01) {
      tp.y = 2.8;
      if (campus === 'Sai Gon') {
        tp.x -= 0.7; tp.y = 2.5;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 1.2;
      } else {
        tp.x = finalLookAt.x - 1.5; tp.y = 2.8;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 0.8;
      }
    }

    const lp = lookAtPos.current;
    if (ls >= waypoints.length - 2.2) lp.lerp(finalLookAt, 0.4);
    else if (loIdx !== hiIdx) lp.set(waypoints[hiIdx].pos.x, 3.5, waypoints[hiIdx].pos.z);
    else if (hiIdx + 1 < waypoints.length) lp.set(waypoints[hiIdx + 1].pos.x, 3.5, waypoints[hiIdx + 1].pos.z);
    else lp.copy(finalLookAt);

    if (ls >= waypoints.length - 1 - 0.05) lp.copy(finalLookAt);

    camera.position.lerp(tp, 0.07);
    const savedQuat = camera.quaternion.clone();
    camera.lookAt(lp);
    targetQuat.current.copy(camera.quaternion);
    camera.quaternion.copy(savedQuat);
    camera.quaternion.slerp(targetQuat.current, 0.07);

    const cam = camera as any;
    if (cam.fov !== undefined && Math.abs(cam.fov - 85) > 0.1) {
      cam.fov += (85 - cam.fov) * 0.08;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function PathOverviewCamera({ waypoints }: { waypoints: PathWaypoint[] }) {
  const { camera } = useThree();
  const targetCamPos = useMemo(() => new THREE.Vector3(), []);
  const targetCenter = useMemo(() => new THREE.Vector3(), []);
  const targetQuat = useRef(new THREE.Quaternion(0, 0, 0, 1));
  useEffect(() => {
    if (!waypoints || waypoints.length === 0) return;
    const box = new THREE.Box3();
    waypoints.forEach(wp => box.expandByPoint(wp.pos));
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.z, 25);
    targetCamPos.set(center.x - maxDim * 0.8, maxDim * 0.9 + 15, center.z + maxDim * 0.8);
    targetCenter.set(center.x, 0, center.z);
  }, [waypoints, targetCamPos, targetCenter]);
  useFrame(() => {
    camera.position.lerp(targetCamPos, 0.05);
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
  useEffect(() => {
    setIsFocusing(true);
    if (campus === 'Thu Duc' && !isPathView) targetCamPos.set(-45, 25, 45);
    else if (campus === 'Thu Duc') {
      const zOffset = highlightFace === 2 ? -10 : 10;
      targetCamPos.set(target.x - 3, 8, target.z + zOffset);
    } else if (campus === 'Sai Gon' && !isPathView) targetCamPos.set(-34.6, 20, 30);
    else {
      const zOffset = highlightFace === 2 ? -8 : 8;
      targetCamPos.set(target.x - 5, 8, target.z + zOffset);
    }
  }, [target, isPathView, targetCamPos, campus, highlightFace]);
  useEffect(() => {
    if (!controls) return;
    const stopFocus = () => setIsFocusing(false);
    (controls as any).addEventListener('start', stopFocus);
    return () => (controls as any).removeEventListener('start', stopFocus);
  }, [controls]);
  useFrame(() => {
    if (controls && isFocusing) {
      let effectiveTarget = (campus === 'Thu Duc' && !isPathView) ? new THREE.Vector3(-10, 0, 10) : (campus === 'Sai Gon' && !isPathView) ? new THREE.Vector3(0, 0, 0) : target;
      const distance = (controls as any).target.distanceTo(effectiveTarget);
      const camDistance = camera.position.distanceTo(targetCamPos);
      if (distance < 0.1 && camDistance < 0.5) setIsFocusing(false);
      else {
        (controls as any).target.lerp(effectiveTarget, 0.07);
        camera.position.lerp(targetCamPos, 0.07);
        (controls as any).update();
      }
    }
  });
  return null;
}