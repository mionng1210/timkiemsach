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

  // Authentication state — luôn yêu cầu đăng nhập lại khi tải trang
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Position of a new shelf being added
  const [addingShelfPos, setAddingShelfPos] = useState<{ x: number, z: number, rackNumber?: number, bay?: number, face?: number } | null>(null);
  const [formRackNumber, setFormRackNumber] = useState<number>(10);
  const [formBay, setFormBay] = useState<number>(1);

  // Update form states when addingShelfPos changes
  useEffect(() => {
    if (addingShelfPos) {
      setFormRackNumber(addingShelfPos.rackNumber ?? 10);
      setFormBay(addingShelfPos.bay ?? 1);
    }
  }, [addingShelfPos]);

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

    // Check if it's a custom shelf
    const customShelf = racks.flatMap(r => r.shelves).find(s =>
      s.rackNumber === focusRack && s.bay === focusBay && s.face === focusFace &&
      s.positionX != null && s.positionZ != null
    );

    let x: number, y: number = 2.5, z: number;
    const faceZOffset = focusFace === 1 ? 0.0 : -0.98;

    if (customShelf) {
      x = customShelf.positionX! + 1.65;
      z = customShelf.positionZ! + faceZOffset;
    } else {
      const sequentialRacks = racks.filter(r => r.shelves.some(s => s.positionX == null));
      const sorted = [...sequentialRacks].sort((a, b) => {
        if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
        return a.rackNumber - b.rackNumber;
      });
      const index = sorted.findIndex((r) => r.rackNumber === focusRack);
      if (index === -1) return null;

      x = (focusBay - 1) * 3 + 1.65;
      z = -(index - sorted.length / 2) * 4.0 + faceZOffset;
    }

    return new THREE.Vector3(x, y, z);
  }, [focusRack, focusBay, focusFace, racks, campus]);

  const shelfPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(-15, 0, -30);

    const faceZOffset = shelf.face === 1 ? 0.0 : -0.98;

    if (shelf.positionX != null && shelf.positionZ != null) {
      return new THREE.Vector3(shelf.positionX + 1.65, 2.5, shelf.positionZ + faceZOffset);
    }

    const sequentialRacks = racks.filter(r => r.shelves.some(s => s.positionX == null));
    const sorted = [...sequentialRacks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    const index = sorted.findIndex((r) => r.rackNumber === shelf.rackNumber);
    if (index === -1) return new THREE.Vector3(0, 0, 0);

    const x = (shelf.bay - 1) * 3 + 1.65;
    const y = 2.5;
    const z = -(index - sorted.length / 2) * 4.0 + faceZOffset;
    return new THREE.Vector3(x, y, z);
  }, [shelf, racks, campus]);

  const targetPos = useMemo(() => {
    if (!shelf || racks.length === 0) return new THREE.Vector3(-15, 0, -30);

    if (campus === 'Sai Gon') {
      const sequentialRacks = racks.filter(r => r.shelves.some(s => s.positionX == null));
      const sorted = [...sequentialRacks].sort((a, b) => a.rackNumber - b.rackNumber);
      // Đặt mục tiêu ở giữa không gian từ cửa ra vào tới kệ sách để dễ nhìn đường đi
      const rack2Index = sorted.findIndex((r) => r.rackNumber === 2);
      const rack2Z = rack2Index !== -1 ? -(rack2Index - sorted.length / 2) * 4.0 : 0;
      const startZ = rack2Z + 10;
      const startX = -31.6;

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
  const [adminSubMode, setAdminSubMode] = useState<'menu' | 'add' | 'manage' | 'hidden' | null>(null);
  const [editingShelf, setEditingShelf] = useState<ShelfInfo | null>(null);
  const [prefilledDewey, setPrefilledDewey] = useState<{
    s1: string, e1: string, s2: string, e2: string
  }>({ s1: '0.000', e1: '999.999', s2: '0.000', e2: '999.999' });

  // Tự động tìm kiếm dữ liệu cũ khi click vào một ô trống để "Thêm kệ"
  useEffect(() => {
    if (addingShelfPos) {
      const fetchOldData = async () => {
        try {
          // Tra cứu mặt trước (1)
          const r1 = await fetch(`/api/admin/shelves/lookup?campus=${encodeURIComponent(campus)}&rackNumber=${addingShelfPos.rackNumber}&bay=${addingShelfPos.bay}&face=1`);
          const d1 = await r1.json();
          // Tra cứu mặt sau (2)
          const r2 = await fetch(`/api/admin/shelves/lookup?campus=${encodeURIComponent(campus)}&rackNumber=${addingShelfPos.rackNumber}&bay=${addingShelfPos.bay}&face=2`);
          const d2 = await r2.json();

          setPrefilledDewey({
            s1: (d1 && !d1.error && d1.deweyStart != null) ? Number(d1.deweyStart).toFixed(3) : '0.000',
            e1: (d1 && !d1.error && d1.deweyEnd != null) ? Number(d1.deweyEnd).toFixed(3) : '999.999',
            s2: (d2 && !d2.error && d2.deweyStart != null) ? Number(d2.deweyStart).toFixed(3) : '0.000',
            e2: (d2 && !d2.error && d2.deweyEnd != null) ? Number(d2.deweyEnd).toFixed(3) : '999.999'
          });
        } catch (e) {
          console.error('Lỗi khi tra cứu dữ liệu kệ cũ:', e);
        }
      };
      fetchOldData();
    }
  }, [addingShelfPos, campus]);

  useEffect(() => {
    const isMenuOpen = isAdminMode && adminSubMode !== 'hidden' && adminSubMode !== null;
    const isEditingOrAdding = editingShelf !== null || addingShelfPos !== null;
    onEditingChange?.(isMenuOpen || isEditingOrAdding);
  }, [editingShelf, addingShelfPos, isAdminMode, adminSubMode, onEditingChange]);

  const handleUpdateDewey = async (id: number, deweyStart: number, deweyEnd: number) => {
    if (deweyStart > deweyEnd) {
      alert('Lỗi: Dewey Start phải nhỏ hơn hoặc bằng Dewey End!');
      return;
    }
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

    const rackNumber = formRackNumber;
    const bay = formBay;

    const deweyStart1 = parseFloat((document.getElementById('addDeweyStart1') as HTMLInputElement).value);
    const deweyEnd1 = parseFloat((document.getElementById('addDeweyEnd1') as HTMLInputElement).value);

    // Dữ liệu Mặt sau (Face 2)
    const deweyStart2 = parseFloat((document.getElementById('addDeweyStart2') as HTMLInputElement).value);
    const deweyEnd2 = parseFloat((document.getElementById('addDeweyEnd2') as HTMLInputElement).value);

    // 1. Ràng buộc Bay phải dương và theo chuẩn toạ độ
    if (isNaN(bay) || bay <= 0) {
      alert('Số Bay phải là số nguyên dương (1, 2, 3...)!');
      return;
    }

    // Kiểm tra giới hạn phía trước (Bay 1 là giới hạn cuối cùng)
    const minX = -0.1;
    if (addingShelfPos.x < minX) {
      alert(`Vị trí này nằm ngoài phạm vi cho phép (phía trước Bay 1). Vui lòng chọn vị trí khác.`);
      return;
    }

    // 2. Kiểm tra Dewey Start, Dewey End có hợp lệ
    if (isNaN(deweyStart1) || isNaN(deweyEnd1) || isNaN(deweyStart2) || isNaN(deweyEnd2)) {
      alert('Lỗi: Giá trị Dewey Start và Dewey End phải là số hợp lệ và không được để trống!');
      return;
    }

    if (deweyStart1 > deweyEnd1 || deweyStart2 > deweyEnd2) {
      alert('Lỗi: Dewey Start phải nhỏ hơn hoặc bằng Dewey End!');
      return;
    }

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

    // Standardize: Face 1 is always Front, Face 2 is always Back
    const face1Val = 1;
    const face2Val = 2;

    // Tạo các mặt có thông tin theo U-shape
    await addFace(suggestedCodes.code1, face1Val, deweyStart1, deweyEnd1);
    await addFace(suggestedCodes.code2, face2Val, deweyStart2, deweyEnd2);

    if (attemptCount === 0) {
      alert('Vui lòng nhập ít nhất một mặt kệ!');
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

    if (isAdminMode && adminSubMode === 'manage') {
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
          px = 0;
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

  const suggestedCodes = useMemo(() => {
    if (!addingShelfPos) return { code1: '', code2: '' };
    const rNum = formRackNumber;
    const bIdx = formBay;

    const rack = racks.find(r => r.rackNumber === rNum);
    const existingBays = rack ? rack.bays : [];
    const allBays = [...new Set([...existingBays, bIdx])].sort((a, b) => a - b);
    const N = allBays.length;
    const currentPos = allBays.indexOf(bIdx) + 1;

    if (campus === 'Thu Duc') {
      // Thủ Đức: Bắt đầu từ mặt sau Bay 1 (c2)
      const c2 = String.fromCharCode(96 + currentPos);
      const c1 = String.fromCharCode(96 + (2 * N - currentPos + 1));
      return { code1: `${rNum}${c1}`, code2: `${rNum}${c2}` };
    } else {
      // Sài Gòn: Bắt đầu từ mặt trước Bay 1 (c1)
      const c1 = String.fromCharCode(96 + currentPos);
      const c2 = String.fromCharCode(96 + (2 * N - currentPos + 1));
      return { code1: `${rNum}${c1}`, code2: `${rNum}${c2}` };
    }
  }, [addingShelfPos, racks, campus]);

  return (
    <div className="viewer-panel">
      <div className="viewer-top-bar">
        <div className="rack-counter">
          🏗️ {racks.length} kệ — {campus === 'Thu Duc' ? '🌳 Thủ Đức' : '🏙️ Sài Gòn'}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdminMode && (
            <button
              className="admin-toggle-btn"
              onClick={() => {
                if (adminSubMode === 'hidden') {
                  setAdminSubMode('menu');
                } else {
                  setAdminSubMode('hidden');
                  setEditingShelf(null);
                  setAddingShelfPos(null);
                }
              }}
            >
              {adminSubMode === 'hidden' ? '👁️ Hiện Menu' : '👁️‍🗨️ Ẩn Menu'}
            </button>
          )}
          <button
            className={`admin-toggle-btn ${isAdminMode ? 'active' : ''}`}
            onClick={() => {
              if (!isAdminMode && !isLoggedIn) {
                setShowLoginModal(true);
                return;
              }
              if (isAdminMode) {
                // Tắt admin mode: Đăng xuất luôn
                localStorage.removeItem('isAdmin');
                setIsLoggedIn(false);
                setAdminSubMode(null);
              } else {
                setAdminSubMode('menu');
              }
              setIsAdminMode(!isAdminMode);
              setEditingShelf(null);
              setAddingShelfPos(null);
            }}
          >
            {isAdminMode ? '🔓 Admin Mode: ON' : '🔒 Admin Mode: OFF'}
          </button>
        </div>
      </div>

      <Canvas
        key={campus}
        className="viewer-canvas"
        camera={{ position: campus === 'Sai Gon' ? [-34.6, 20, 30] : [-60, 25, 150], fov: 65 }}
        shadows
        dpr={[1, 2]} // Giới hạn pixel ratio để tăng hiệu năng trên màn hình 4K
        performance={{ min: 0.5 }} // Cho phép Three.js giảm chất lượng khi lag
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
          stencil: false,
          depth: true
        }}
        onPointerMissed={() => {
          clearFocus();
          setEditingShelf(null);
          setAddingShelfPos(null);
        }}
      >
        <color attach="background" args={['#ffffff']} />
        <fog attach="fog" args={['#ffffff', 100, 300]} />

        <ambientLight intensity={0.7} />
        <directionalLight
          position={[15, 20, 10]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]} // Giới hạn độ phân giải shadow
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
        />
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
            isAdminMode={isAdminMode && adminSubMode === 'add'}
            onAddRackAt={(x, z) => {
              // Tìm kiếm các kệ lân cận để gợi ý số Rack và số Bay
              let suggestedRack = 10;
              let suggestedBay = 1;

              // Lấy tất cả shelves có toạ độ X, Z (custom shelves)
              const customShelves = racks.flatMap(r => r.shelves).filter(s => s.positionX != null && s.positionZ != null);

               // Tìm kệ cùng trục Z để lấy RackNumber
               const sameZShelves = customShelves.filter(s => Math.abs(s.positionZ! - z) < 0.1);
               if (sameZShelves.length > 0) {
                 suggestedRack = sameZShelves[0].rackNumber;
               }

               // 2. Tính số Bay mặc định dựa trên toạ độ X chuẩn
               // Thu Duc: x = -12 là bay 1, x = -9 là bay 2...
               // Sai Gon: x = -1.35 là bay 1, x = 1.65 là bay 2...
               const startX = 0;
               suggestedBay = Math.round((x - startX) / 3.0) + 1;

               // 3. Ràng buộc: Không cho tạo phía trước Bay 1
               if (suggestedBay < 1 || x < (startX - 0.1)) {
                 alert('Vị trí này nằm ngoài phạm vi cho phép (phía trước Bay 1). Vui lòng chọn vị trí khác.');
                 return;
               }

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
            highlightFace={focusFace}
          />
        )}
        {isPathOverview && guideWaypoints && (
          <PathOverviewCamera waypoints={guideWaypoints} />
        )}
      </Canvas>

      {/* Menu chọn chức năng Admin */}
      {isAdminMode && adminSubMode === 'menu' && (
        <div className="admin-menu-overlay">
          <div className="admin-menu-card">
            <h3>⚙️ Quản lý Kệ sách</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '15px' }}>Chọn chức năng bạn muốn thực hiện</p>
            <button className="admin-menu-btn" onClick={() => { setAdminSubMode('add'); setEditingShelf(null); }}>
              <span className="admin-menu-icon">➕</span>
              <div>
                <strong>Thêm kệ mới</strong>
                <small>Nhấn vào ô trống trên sàn để đặt kệ</small>
              </div>
            </button>
            <button className="admin-menu-btn" onClick={() => { setAdminSubMode('manage'); setAddingShelfPos(null); }}>
              <span className="admin-menu-icon">🔧</span>
              <div>
                <strong>Quản lý kệ hiện có</strong>
                <small>Nhấn vào kệ để sửa hoặc xóa</small>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Nút quay lại menu khi đang ở sub-mode */}
      {isAdminMode && adminSubMode && adminSubMode !== 'menu' && (
        <button
          className="admin-back-btn"
          onClick={() => { setAdminSubMode('menu'); setEditingShelf(null); setAddingShelfPos(null); }}
        >
          ← Quay lại menu
        </button>
      )}

      {isAdminMode && adminSubMode === 'manage' && editingShelf && (
        <div
          className="admin-shelf-panel"
          key={editingShelf.shelfId}
        >
          <h3>
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

      {isAdminMode && adminSubMode === 'add' && addingShelfPos && (
        <div
          className="admin-shelf-panel"
          key={`add-${addingShelfPos.x}-${addingShelfPos.z}-${addingShelfPos.rackNumber}-${addingShelfPos.bay}-${addingShelfPos.face}`}
        >
          <h3>
            ➕ Thêm Kệ Mới
          </h3>
          <p>Tại tọa độ: X={addingShelfPos.x.toFixed(1)}, Z={addingShelfPos.z.toFixed(1)}</p>

          <div className="admin-form-group">
            <label>Số Rack (VD: 10):</label>
            <input 
              type="number" 
              id="addRackNumber" 
              value={formRackNumber} 
              onChange={(e) => setFormRackNumber(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="admin-form-group">
            <label>Khoang (Bay):</label>
            <input
              type="number"
              id="addBay"
              value={formBay}
              onChange={(e) => setFormBay(parseInt(e.target.value) || 0)}
              disabled={true}
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                color: 'rgba(232, 236, 244, 0.4)',
                cursor: 'not-allowed',
                border: '1px solid var(--border)',
                fontWeight: 'bold',
                opacity: 1
              }}
            />
          </div>

          <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt trước (1)</div>
          <div className="admin-form-group">
            <label>Mã dãy (tự động):</label>
            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: '#6366f1', fontWeight: 'bold' }}>
              {suggestedCodes.code1.toUpperCase()}
              <input type="hidden" id="addCode1" value={suggestedCodes.code1} />
            </div>
          </div>
          <div className="admin-form-group">
            <label>Dewey Start:</label>
            <input type="text" id="addDeweyStart1" key={`s1-${prefilledDewey.s1}`} defaultValue={prefilledDewey.s1} />
          </div>
          <div className="admin-form-group">
            <label>Dewey End:</label>
            <input type="text" id="addDeweyEnd1" key={`e1-${prefilledDewey.e1}`} defaultValue={prefilledDewey.e1} />
          </div>

          <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt sau (2)</div>
          <div className="admin-form-group">
            <label>Mã dãy (tự động):</label>
            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: '#6366f1', fontWeight: 'bold' }}>
              {suggestedCodes.code2.toUpperCase()}
              <input type="hidden" id="addCode2" value={suggestedCodes.code2} />
            </div>
          </div>
          <div className="admin-form-group">
            <label>Dewey Start:</label>
            <input type="text" id="addDeweyStart2" key={`s2-${prefilledDewey.s2}`} defaultValue={prefilledDewey.s2} />
          </div>
          <div className="admin-form-group">
            <label>Dewey End:</label>
            <input type="text" id="addDeweyEnd2" key={`e2-${prefilledDewey.e2}`} defaultValue={prefilledDewey.e2} />
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
      {showLoginModal && (
        <div className="guide-overlay" style={{ zIndex: 9999 }}>
          <div className="guide-modal" style={{ maxWidth: '400px', padding: '30px', textAlign: 'center' }}>
            <button className="guide-close" onClick={() => { setShowLoginModal(false); setLoginError(''); }}>×</button>
            <div className="guide-icon" style={{ fontSize: '40px', marginBottom: '10px' }}>🔐</div>
            <h2 style={{ fontSize: '20px', marginBottom: '10px', color: 'var(--text-primary)' }}>Đăng nhập Admin</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '20px' }}>Vui lòng đăng nhập tài khoản để vào hệ thống quản lý.</p>

            <input
              type="text"
              id="adminUsernameInput"
              placeholder="Tên đăng nhập"
              style={{
                width: '100%', padding: '12px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', marginBottom: '10px', fontSize: '14px'
              }}
            />
            <input
              type="password"
              id="adminPasswordInput"
              placeholder="Mật khẩu"
              style={{
                width: '100%', padding: '12px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', marginBottom: '10px', fontSize: '14px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  document.getElementById('loginSubmitBtn')?.click();
                }
              }}
            />

            {loginError && <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '15px' }}>{loginError}</div>}

            <button
              id="loginSubmitBtn"
              className="guide-start-btn"
              style={{ marginTop: loginError ? '0' : '10px' }}
              onClick={async () => {
                const username = (document.getElementById('adminUsernameInput') as HTMLInputElement).value;
                const password = (document.getElementById('adminPasswordInput') as HTMLInputElement).value;
                if (!username || !password) {
                  setLoginError('Vui lòng nhập đầy đủ thông tin!');
                  return;
                }
                try {
                  const res = await fetch('http://localhost:3001/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                  });
                  const data = await res.json();
                  if (data.success) {
                    localStorage.setItem('isAdmin', 'true');
                    setIsLoggedIn(true);
                    setIsAdminMode(true);
                    setAdminSubMode('menu');
                    setShowLoginModal(false);
                    setLoginError('');
                  } else {
                    setLoginError(data.message || 'Sai thông tin đăng nhập!');
                  }
                } catch (error) {
                  console.error('Lỗi gọi API đăng nhập:', error);
                  setLoginError('Lỗi kết nối đến máy chủ!');
                }
              }}
            >
              Đăng nhập
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
  campus,
  highlightFace
}: {
  waypoints: PathWaypoint[];
  currentStep: number;
  finalLookAt: THREE.Vector3;
  campus: string;
  highlightFace: number | null;
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
        // Thu Duc
        tp.x -= 0.7; tp.y = 2.5;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 1.2;
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