import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MapControls, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import BookshelfScene, { type PathWaypoint } from './BookshelfScene';
import type { SearchResult, RackInfo, ShelfInfo, CustomFeature } from '../types';

const authFetch = (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('adminToken');
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
};

interface ViewerPanelProps {
  selectedResult: SearchResult | null;
  campus: string;
  onBayClick?: (shelf: ShelfInfo) => void;
  onGuideModeChange?: (isGuideMode: boolean) => void;
  onClearResult?: () => void;
  onEditingChange?: (isEditing: boolean) => void;
  isExternalGuided?: boolean;
  bookId?: string;
  onExitExternalGuide?: (bookId: string) => void;
}

export default function ViewerPanel({
  selectedResult,
  campus,
  onBayClick,
  onGuideModeChange,
  onClearResult,
  onEditingChange,
  isExternalGuided = false,
  bookId = '1',
  onExitExternalGuide
}: ViewerPanelProps) {
  const [racks, setRacks] = useState<RackInfo[]>([]);
  const [features, setFeatures] = useState<CustomFeature[]>([]);
  const [guideWaypoints, setGuideWaypoints] = useState<PathWaypoint[] | null>(null);
  const [isGuideMode, setIsGuideMode] = useState(false);
  const [currentGuideStep, setCurrentGuideStep] = useState(0);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [userStartRack, setUserStartRack] = useState<number | null>(null);
  const [isPathOverview, setIsPathOverview] = useState(false);
  const [isInfoCardCollapsed, setIsInfoCardCollapsed] = useState(false);
  const [isOverviewCollapsed, setIsOverviewCollapsed] = useState(false);

  const significantSteps = useMemo(() => {
    if (!guideWaypoints || guideWaypoints.length === 0) return [];
    const MIN_DIST = 10.0;
    const steps = [0];

    for (let i = 1; i < guideWaypoints.length - 2; i++) {
      const nextDist = guideWaypoints[i].pos.distanceTo(guideWaypoints[i + 1].pos);
      if (nextDist >= MIN_DIST) {
        steps.push(i);
      }
    }

    if (guideWaypoints.length > 2) {
      if (!steps.includes(guideWaypoints.length - 2)) {
        steps.push(guideWaypoints.length - 2);
      }
    }

    if (guideWaypoints.length > 1) {
      if (!steps.includes(guideWaypoints.length - 1)) {
        steps.push(guideWaypoints.length - 1);
      }
    }

    return steps.sort((a, b) => a - b);
  }, [guideWaypoints]);

  const currentSigIndex = useMemo(() => {
    let idx = significantSteps.indexOf(currentGuideStep);
    if (idx === -1) {
      idx = significantSteps.findIndex(s => s >= currentGuideStep);
      if (idx === -1) idx = significantSteps.length - 1;
    }
    return Math.max(0, idx);
  }, [significantSteps, currentGuideStep]);

  // Authentication state — luôn yêu cầu đăng nhập lại khi tải trang
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Position of a new shelf being added
  const [addingShelfPos, setAddingShelfPos] = useState<{ x: number, z: number, rackNumber?: number, bay?: number, face?: number } | null>(null);
  const [formRackNumber, setFormRackNumber] = useState<number>(10);
  const [formBay, setFormBay] = useState<number>(1);
  const [selectedFloors, setSelectedFloors] = useState<number[]>([]);

  // Update form states when addingShelfPos changes
  useEffect(() => {
    if (addingShelfPos) {
      setFormRackNumber(addingShelfPos.rackNumber ?? 10);
      setFormBay(addingShelfPos.bay ?? 1);
      setSelectedFloors([]); // Reset selected floors when adding is initialized
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
    setCurrentGuideStep(0);
    setGuideWaypoints(null);
    setShowStartPicker(false);
    setUserStartRack(null);
    setIsInfoCardCollapsed(false);
    setIsOverviewCollapsed(false);

    // Reset focus khi đổi campus hoặc search result
    setFocusRack(selectedResult?.shelf?.rackNumber ?? null);
    setFocusBay(selectedResult?.shelf?.bay ?? null);
    setFocusFace(selectedResult?.shelf?.face ?? null);

    if (isExternalGuided && selectedResult) {
      // Ở chế độ dẫn đường ngoài, tự động hiển thị bảng chọn xuất phát
      setShowStartPicker(true);
      setIsPathOverview(false);
      setIsGuideMode(false);
      onGuideModeChange?.(true);
    } else {
      setIsGuideMode(false);
      setIsPathOverview(false);
      onGuideModeChange?.(false);
    }
  }, [selectedResult, campus, onGuideModeChange, isExternalGuided]);

  // Fetch rack layout khi đổi campus
  useEffect(() => {
    let active = true;
    async function fetchRacks() {
      try {
        const res = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res.json();

        const featureRes = await fetch(`/api/features?campus=${encodeURIComponent(campus)}`);
        const featureData = await featureRes.json();

        if (active) {
          setRacks(data.racks || []);
          setFeatures(featureData.features || []);
        }
      } catch {
        if (active) {
          setRacks([]);
          setFeatures([]);
        }
      }
    }
    fetchRacks();
    return () => {
      active = false;
    };
  }, [campus]);

  // Tự động mở modal đăng nhập khi truy cập /admin
  useEffect(() => {
    if (window.location.pathname === '/admin' && !isLoggedIn) {
      setShowLoginModal(true);
    }
  }, [isLoggedIn]);

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

  const clearFocus = () => {
    setFocusRack(null);
    setFocusBay(null);
    setFocusFace(null);
    onClearResult?.();
  };

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminSubMode, setAdminSubMode] = useState<'menu' | 'add' | 'manage' | 'features' | 'hidden' | null>(null);
  const [editingShelf, setEditingShelf] = useState<ShelfInfo | null>(null);
  const [editingFeature, setEditingFeature] = useState<CustomFeature | null>(null);
  const [prefilledDewey, setPrefilledDewey] = useState<{
    s1: string, e1: string, s2: string, e2: string, c1: string, c2: string
  }>({ s1: '0.000', e1: '0.000', s2: '0.000', e2: '0.000', c1: '', c2: '' });

  useEffect(() => {
    if (campus !== 'Thu Duc' && adminSubMode === 'features') {
      setAdminSubMode('menu');
      setEditingFeature(null);
    }
  }, [campus, adminSubMode]);

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
      const c2 = String.fromCharCode(96 + currentPos);
      const c1 = String.fromCharCode(96 + N + currentPos);
      return { code1: `${rNum}${c1}`, code2: `${rNum}${c2}` };
    } else {
      const c1 = String.fromCharCode(96 + currentPos);
      const c2 = String.fromCharCode(96 + (2 * N - currentPos + 1));
      return { code1: `${rNum}${c1}`, code2: `${rNum}${c2}` };
    }
  }, [addingShelfPos, racks, campus, formRackNumber, formBay]);

  // Tự động tìm kiếm dữ liệu cũ khi click vào một ô trống để "Thêm kệ"
  useEffect(() => {
    if (addingShelfPos) {
      const fetchOldData = async () => {
        try {
          const lookupByCode = async (code: string) => {
            if (!code) return null;
            const res = await authFetch(`/api/admin/shelves/lookupByCode?campus=${encodeURIComponent(campus)}&code=${encodeURIComponent(code)}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data && !data.error ? data : null;
          };

          const d1 = await lookupByCode(suggestedCodes.code1);
          const d2 = await lookupByCode(suggestedCodes.code2);

          setPrefilledDewey({
            s1: (d1 && !d1.error && d1.deweyStart != null) ? Number(d1.deweyStart).toFixed(3) : '0.000',
            e1: (d1 && !d1.error && d1.deweyEnd != null) ? Number(d1.deweyEnd).toFixed(3) : '0.000',
            s2: (d2 && !d2.error && d2.deweyStart != null) ? Number(d2.deweyStart).toFixed(3) : '0.000',
            e2: (d2 && !d2.error && d2.deweyEnd != null) ? Number(d2.deweyEnd).toFixed(3) : '0.000',
            c1: suggestedCodes.code1,
            c2: suggestedCodes.code2
          });
        } catch (e) {
          console.error('Lỗi khi tra cứu dữ liệu kệ cũ:', e);
        }
      };
      fetchOldData();
    }
  }, [addingShelfPos, campus, formRackNumber, formBay, suggestedCodes]);

  useEffect(() => {
    const isMenuOpen = isAdminMode && adminSubMode !== 'hidden' && adminSubMode !== null;

    // Toggle class on body to securely hide mobile toggle button via CSS
    if (isMenuOpen) {
      document.body.classList.add('admin-mode-active');
    } else {
      document.body.classList.remove('admin-mode-active');
    }

    const isEditingOrAdding = editingShelf !== null || addingShelfPos !== null;
    onEditingChange?.(isMenuOpen || isEditingOrAdding);

    // Cleanup class on unmount
    return () => {
      document.body.classList.remove('admin-mode-active');
    };
  }, [editingShelf, addingShelfPos, isAdminMode, adminSubMode, onEditingChange]);

  const handleUpdateDewey = async (id: number, deweyStart: number, deweyEnd: number, color?: string) => {
    if (deweyStart > deweyEnd) {
      alert('Lỗi: Dewey Start phải nhỏ hơn hoặc bằng Dewey End!');
      return;
    }
    try {
      const res = await authFetch(`/api/admin/shelves/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deweyStart, deweyEnd, color }),
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

  const handleToggleFloor = async (shelfId: number, floor: number) => {
    try {
      const res = await authFetch(`/api/admin/shelves/${shelfId}/toggle-floor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor })
      });
      if (res.ok) {
        const res2 = await fetch(`/api/racks?campus=${encodeURIComponent(campus)}`);
        const data = await res2.json();
        setRacks(data.racks || []);

        // Cập nhật lại editingShelf để UI phản hồi ngay
        const updatedShelf = (data.racks || []).flatMap((r: any) => r.shelves).find((s: any) => s.shelfId === shelfId);
        if (updatedShelf) setEditingShelf(updatedShelf);
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

    // Calculate hidden floors
    const active = selectedFloors.length === 0 ? [1, 2, 3, 4, 5] : selectedFloors;
    const hiddenFloors = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(f => !active.includes(f));

    let successCount = 0;
    let attemptCount = 0;

    const addFace = async (code: string, face: number, dStart: number, dEnd: number) => {
      if (!code || !code.trim()) return; // Bỏ qua nếu mã dãy trống
      attemptCount++;
      try {
        const res = await authFetch(`/api/admin/shelves`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rackNumber, code, bay, face, deweyStart: dStart, deweyEnd: dEnd, campus,
            positionX: addingShelfPos.x, positionZ: addingShelfPos.z, hiddenFloors
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
      const res = await authFetch(`/api/admin/shelves/${id}`, { method: 'DELETE' });
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
      const res = await authFetch(`/api/admin/racks/${rackNumber}/bays/${bay}?campus=${encodeURIComponent(campus)}`, { method: 'DELETE' });
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

  const handleSceneBayClick = useCallback((rackNumber: number, bay: number, face: number) => {
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

    if (!isAdminMode && focusRack !== null) {
      return;
    }

    // Toggle: click vào kệ đang focus → reset hoàn toàn (chỉ áp dụng cho Admin)
    if (focusRack === rackNumber && focusBay === bay && focusFace === face) {
      if (isAdminMode) {
        clearFocus();
      }
      return;
    }

    // Click kệ khác → chuyển focus
    setFocusRack(rackNumber);
    setFocusBay(bay);
    setFocusFace(face);

    if (clickedShelf && onBayClick) {
      onBayClick(clickedShelf);
    }
  }, [racks, isAdminMode, adminSubMode, campus, focusRack, focusBay, focusFace, onBayClick]);

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
  const maxZ = useMemo(() => {
    if (racks.length === 0) return 40;
    const ROW_SPACING_Z = 4.0;
    const sorted = [...racks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    const totalRacks = sorted.length;
    const zValues = sorted.map((rack, index) => {
      const firstShelf = rack.shelves.find(s => s.positionZ != null);
      return Number(firstShelf?.positionZ ?? -(index - totalRacks / 2) * ROW_SPACING_Z);
    });
    return Math.max(...zValues);
  }, [racks, campus]);

  const maxCells = useMemo(() => {
    if (!editingFeature) return 1;

    // Tọa độ bắt đầu vật lý của khối
    const zStart = editingFeature.pos_z - editingFeature.length / 2;

    // Tính số lượng ô tối đa theo giới hạn sàn (Z tối đa của sàn là maxZ + 1.0)
    const maxZLimit = maxZ + 1.0;
    const N_max_grid = Math.max(1, Math.floor((maxZLimit - zStart) / 2.0));

    // Tìm vật cản phía trước (các khối khác cùng cột X và có điểm bắt đầu > zStart)
    const obstacles = features.filter(f => {
      if (f.id === editingFeature.id) return false;
      // Cùng cột X (khoảng cách X < 2.0)
      const sameCol = Math.abs(f.pos_x - editingFeature.pos_x) < 2.0;
      // Ở phía trước (Z bắt đầu của vật cản lớn hơn zStart)
      const obstacleStart = f.pos_z - f.length / 2;
      return sameCol && obstacleStart > zStart;
    });

    let N_max = N_max_grid;
    obstacles.forEach(f => {
      const obstacleStart = f.pos_z - f.length / 2;
      const limit = Math.floor((obstacleStart - zStart) / 2.0);
      if (limit > 0 && limit < N_max) {
        N_max = limit;
      }
    });

    return Math.max(1, N_max);
  }, [editingFeature, features, maxZ]);

  return (
    <div className="viewer-panel">
      {!isExternalGuided && (
        <div className="viewer-top-bar">
          <div className="rack-counter">
            🏗️ {racks.length} kệ — {campus === 'Thu Duc' ? '🌳 Thủ Đức' : '🏙️ Sài Gòn'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isAdminMode && (
              <button
                className="admin-toggle-btn"
                onClick={() => {
                  if (adminSubMode !== 'menu') {
                    setAdminSubMode('menu');
                    setEditingShelf(null);
                    setAddingShelfPos(null);
                    setEditingFeature(null);
                  } else {
                    setAdminSubMode('hidden');
                    setEditingShelf(null);
                    setAddingShelfPos(null);
                    setEditingFeature(null);
                  }
                }}
              >
                {adminSubMode !== 'menu' ? '👁️ Hiện Menu' : '👁️‍🗨️ Ẩn Menu'}
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
                  // Tắt admin mode: Đăng xuất luôn và quay về mock.html
                  localStorage.removeItem('isAdmin');
                  localStorage.removeItem('adminToken');
                  setIsLoggedIn(false);
                  setAdminSubMode(null);
                  setIsAdminMode(false);
                  setEditingShelf(null);
                  setAddingShelfPos(null);
                  window.location.href = `/mock.html?book=${bookId}`;
                } else {
                  setAdminSubMode('menu');
                  setIsAdminMode(true);
                  setEditingShelf(null);
                  setAddingShelfPos(null);
                  setEditingFeature(null);
                }
              }}
            >
              {isAdminMode ? '🔓 Admin Mode: ON' : '🔒 Admin Mode: OFF'}
            </button>
          </div>
        </div>
      )}

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
          if (isAdminMode) {
            clearFocus();
          }
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
            customFeatures={features}
            campus={campus}
            highlightRack={focusRack}
            highlightBay={focusBay}
            highlightFace={focusFace}
            startRackNumber={userStartRack}
            onBayClick={handleSceneBayClick}
            onPathCalculated={setGuideWaypoints}
            isAdminMode={isAdminMode}
            adminSubMode={adminSubMode}
            editingFeatureId={editingFeature?.id || null}
            onFeatureClick={(featureId) => {
              if (adminSubMode === 'features') {
                const feat = features.find(f => f.id === featureId);
                if (feat) setEditingFeature(feat);
              }
            }}
            onAddFeatureAt={(x, z) => {
              if (adminSubMode === 'features') {
                setEditingFeature({
                  id: 0,
                  campus_id: 0,
                  type: 'low_rack',
                  pos_x: x,
                  pos_z: z + 7, // Để Z đầu = z - 1 (vừa khít mép kệ ngoài cùng)
                  length: 16,
                  width: 1.2,
                  rotation: 0
                });
              }
            }}
            onAddRackAt={(x, z) => {
              // Tính số Rack mặc định dựa trên toạ độ Z chuẩn
              let suggestedRack = 10;
              if (campus === 'Thu Duc') {
                suggestedRack = Math.round(z / 4.0 + 7.5);
              } else {
                suggestedRack = Math.round(-z / 4.0 + 18.0);
              }
              suggestedRack = Math.max(1, suggestedRack);

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

        {!isGuideMode && focusShelfPos && <FocusManager target={focusShelfPos} isPathView={true} campus={campus} highlightFace={focusFace} />}
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
            {campus === 'Thu Duc' && (
              <button className="admin-menu-btn" onClick={() => { setAdminSubMode('features'); setAddingShelfPos(null); setEditingShelf(null); }}>
                <span className="admin-menu-icon">🟫</span>
                <div>
                  <strong>Quản lý khối 3D</strong>
                  <small>Thêm/Sửa các khối màu nâu</small>
                </div>
              </button>
            )}
          </div>
        </div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
          </div>

          <div className="admin-form-group">
            <label>Màu mặt kệ đầu dãy:</label>
            <input
              type="color"
              defaultValue={editingShelf.color || '#ffe94a'}
              id="shelfColor"
              style={{
                width: '100%',
                height: '38px',
                padding: '2px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: 'transparent'
              }}
            />
          </div>

          <div className="admin-form-group">
            <label>Quản lý Tầng (Ẩn/Hiện Tầng Sách):</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px', marginTop: '5px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(floorNum => {
                const isHidden = editingShelf.hiddenFloors?.includes(floorNum);
                return (
                  <button
                    key={floorNum}
                    onClick={() => handleToggleFloor(editingShelf.shelfId, floorNum)}
                    style={{
                      padding: '4px 5px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: isHidden ? '#ef4444' : '#10b981',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Ngăn {floorNum}: {isHidden ? 'Đã Ẩn' : 'Hiện'}
                  </button>
                );
              })}
            </div>
            <small style={{ display: 'block', marginTop: '5px', color: 'var(--text-secondary)' }}>
              Lưu ý: Ngăn sách được ẩn độc lập cho mỗi mặt kệ.
            </small>
          </div>

          <div className="admin-actions">
            <button className="admin-btn update" onClick={() => {
              const start = parseFloat((document.getElementById('deweyStart') as HTMLInputElement).value);
              const end = parseFloat((document.getElementById('deweyEnd') as HTMLInputElement).value);
              const color = (document.getElementById('shelfColor') as HTMLInputElement).value;
              handleUpdateDewey(editingShelf.shelfId, start, end, color);
            }}>
              Lưu thay đổi
            </button>
            <button className="admin-btn delete-bay" onClick={() => handleDeleteBay(editingShelf.rackNumber, editingShelf.bay)}>
              Xóa cả kệ
            </button>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="admin-form-group">
              <label>Số Rack:</label>
              <input
                type="number"
                id="addRackNumber"
                value={formRackNumber}
                readOnly={true}
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
          </div>

          <div className="admin-form-group">
            <label>Chọn các tầng muốn tạo (Mặc định: 1 đến 5):</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(f => {
                const isSelected = selectedFloors.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedFloors(selectedFloors.filter(x => x !== f));
                      } else {
                        setSelectedFloors([...selectedFloors, f].sort((a, b) => a - b));
                      }
                    }}
                    style={{
                      padding: '4px 5px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: isSelected ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    T {f}
                  </button>
                );
              })}
            </div>
            <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-secondary)' }}>
              Mẹo: Chọn các tầng mong muốn (vd: 1, 3, 4). Nếu không chọn tầng nào, hệ thống sẽ tạo đủ 5 tầng đầu tiên.
            </small>
          </div>

          {campus === 'Thu Duc' ? (
            <>
              {/* Thu Đức (Z-shape): Face 2 (Mặt sau) có letter thấp hơn, hiển thị trước */}
              <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#f59e0b', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt sau (2) - {suggestedCodes.code2.toUpperCase()}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="admin-form-group">
                  <label>Dewey Start:</label>
                  <input type="text" id="addDeweyStart2" key={`s2-${formRackNumber}-${formBay}-${prefilledDewey.s2}`} defaultValue={prefilledDewey.s2} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
                <div className="admin-form-group">
                  <label>Dewey End:</label>
                  <input type="text" id="addDeweyEnd2" key={`e2-${formRackNumber}-${formBay}-${prefilledDewey.e2}`} defaultValue={prefilledDewey.e2} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
              </div>

              <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#3b82f6', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt trước (1) - {suggestedCodes.code1.toUpperCase()}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="admin-form-group">
                  <label>Dewey Start:</label>
                  <input type="text" id="addDeweyStart1" key={`s1-${formRackNumber}-${formBay}-${prefilledDewey.s1}`} defaultValue={prefilledDewey.s1} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
                <div className="admin-form-group">
                  <label>Dewey End:</label>
                  <input type="text" id="addDeweyEnd1" key={`e1-${formRackNumber}-${formBay}-${prefilledDewey.e1}`} defaultValue={prefilledDewey.e1} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Sài Gòn (U-shape): Face 1 (Mặt trước) có letter thấp hơn, hiển thị trước */}
              <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt trước (1) - {suggestedCodes.code1.toUpperCase()}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="admin-form-group">
                  <label>Dewey Start:</label>
                  <input type="text" id="addDeweyStart1" key={`s1-${formRackNumber}-${formBay}-${prefilledDewey.s1}`} defaultValue={prefilledDewey.s1} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
                <div className="admin-form-group">
                  <label>Dewey End:</label>
                  <input type="text" id="addDeweyEnd1" key={`e1-${formRackNumber}-${formBay}-${prefilledDewey.e1}`} defaultValue={prefilledDewey.e1} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
              </div>

              <div style={{ marginTop: '10px', marginBottom: '5px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #ccc', paddingBottom: '3px' }}>Mặt sau (2) - {suggestedCodes.code2.toUpperCase()}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="admin-form-group">
                  <label>Dewey Start:</label>
                  <input type="text" id="addDeweyStart2" key={`s2-${formRackNumber}-${formBay}-${prefilledDewey.s2}`} defaultValue={prefilledDewey.s2} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
                <div className="admin-form-group">
                  <label>Dewey End:</label>
                  <input type="text" id="addDeweyEnd2" key={`e2-${formRackNumber}-${formBay}-${prefilledDewey.e2}`} defaultValue={prefilledDewey.e2} readOnly={true} style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
                </div>
              </div>
            </>
          )}

          <div className="admin-actions">
            <button className="admin-btn update" style={{ backgroundColor: '#10b981', color: 'white' }} onClick={handleAddShelf}>
              Thêm kệ
            </button>
            <button className="admin-btn cancel" onClick={() => setAddingShelfPos(null)}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {selectedResult && !isGuideMode && !isPathOverview && !(isAdminMode && adminSubMode === 'manage') && !(isMobile && isAdminMode && adminSubMode === 'menu') && !showStartPicker && (
        <div className="viewer-info-overlay">
          {isInfoCardCollapsed ? (
            <div className="info-card">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px', marginTop: '-8px', marginRight: '-8px' }}>
                <button
                  onClick={() => setIsInfoCardCollapsed(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    padding: 0,
                    transition: 'all 0.2s'
                  }}
                  title="Mở rộng cửa sổ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"/>
                  </svg>
                </button>
              </div>
              <div>
                {guideWaypoints ? (
                  <button
                    className="start-guide-btn-inline"
                    onClick={() => { setUserStartRack(null); setShowStartPicker(true); }}
                  >
                    <span>🚶‍♂️</span> Tìm đường đi
                  </button>
                ) : (
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px', width: '100%', textAlign: 'center' }}>
                    📍 Kệ {shelf!.rackNumber} - {shelf!.face === 1 ? 'Mặt trước' : 'Mặt sau'}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="info-card">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '6px', marginTop: '-8px', marginRight: '-8px' }}>
                <button
                  onClick={() => setIsInfoCardCollapsed(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    padding: 0,
                    transition: 'all 0.2s'
                  }}
                  title="Thu gọn cửa sổ (Chỉ hiện nút Tìm đường đi)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M.172 15.828a.5.5 0 0 0 .707 0l4.096-4.096V14.5a.5.5 0 1 0 1 0v-3.975a.5.5 0 0 0-.5-.5H1.5a.5.5 0 0 0 0 1h2.768L.172 15.121a.5.5 0 0 0 0 .707zM15.828.172a.5.5 0 0 0-.707 0l-4.096 4.096V1.5a.5.5 0 1 0-1 0v3.975a.5.5 0 0 0 .5.5H14.5a.5.5 0 0 0 0-1h-2.768L15.828.879a.5.5 0 0 0 0-.707z"/>
                  </svg>
                </button>
              </div>

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
          )}
        </div>
      )}


      {isAdminMode && adminSubMode === 'features' && editingFeature && (
        <div
          className="admin-shelf-panel"
          key={`feature-${editingFeature.id}-${editingFeature.pos_x}-${editingFeature.pos_z}-${editingFeature.length}`}
        >
          <h3>🟫 {editingFeature.id ? 'Sửa Khối' : 'Thêm Khối Mới'}</h3>
          <div className="admin-form-group">
            <label>Loại (type):</label>
            <input type="text" id="featType" defaultValue={editingFeature.type} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="admin-form-group">
              <label>Toạ độ X:</label>
              <input type="number" id="featX" defaultValue={editingFeature.pos_x} step="0.5" readOnly style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }} />
            </div>
            <div className="admin-form-group">
              <label>Toạ độ Z (bắt đầu):</label>
              <input
                type="number"
                id="featZ"
                defaultValue={editingFeature.pos_z - editingFeature.length / 2}
                readOnly
                style={{ backgroundColor: 'rgba(0,0,0,0.1)', cursor: 'not-allowed' }}
              />
            </div>
          </div>
          <div className="admin-form-group">
            <label>Chiều dài (số ô):</label>
            <select
              id="featLengthCells"
              defaultValue={Math.round(editingFeature.length / 2.0)}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                color: 'var(--text-primary)',
                fontSize: '12px'
              }}
            >
              {(() => {
                const currentCells = Math.round(editingFeature.length / 2.0);
                const optionsCount = Math.max(maxCells, currentCells);
                return Array.from({ length: optionsCount }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} ô ({(i + 1) * 2}m)
                  </option>
                ));
              })()}
            </select>
          </div>
          <div className="admin-actions">
            <button className="admin-btn update" onClick={async () => {
              const type = (document.getElementById('featType') as HTMLInputElement).value;
              const posX = parseFloat((document.getElementById('featX') as HTMLInputElement).value);
              const zStart = parseFloat((document.getElementById('featZ') as HTMLInputElement).value);
              const cellSelect = document.getElementById('featLengthCells') as HTMLSelectElement;
              const cellCount = parseInt(cellSelect.value) || 1;

              // Tính toán lại chiều dài và tâm Z mới
              const length = cellCount * 2.0;
              const posZ = zStart + cellCount * 1.0;

              // Kiểm tra đè lấp phía Client
              const isOverlapping = features.some(f => {
                if (f.id === editingFeature.id) return false;
                // Cùng cột (khoảng cách X < 2.0)
                const sameCol = Math.abs(f.pos_x - posX) < 2.0;
                // Đè lấp Z
                const overlapZ = Math.abs(f.pos_z - posZ) < (f.length + length) / 2;
                return sameCol && overlapZ;
              });

              if (isOverlapping) {
                alert('Không thể lưu: Vị trí này đè lên một khối khác đã có!');
                return;
              }

              const payload = { campus, type, posX, posZ, length, width: 1.2, rotation: 0 };
              let saveRes;
              if (editingFeature.id) {
                saveRes = await authFetch(`/api/admin/features/${editingFeature.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              } else {
                saveRes = await authFetch(`/api/admin/features`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
              }

              if (!saveRes.ok) {
                const errData = await saveRes.json().catch(() => ({}));
                alert(errData.error || 'Lỗi khi lưu khối 3D!');
                return;
              }

              const res = await fetch(`/api/features?campus=${encodeURIComponent(campus)}`);
              const data = await res.json();
              setFeatures(data.features || []);
              setEditingFeature(null);
            }}>
              Lưu
            </button>
            {editingFeature.id !== 0 && (
              <button className="admin-btn delete-shelf" onClick={async () => {
                if (!confirm('Xoá khối này?')) return;
                await authFetch(`/api/admin/features/${editingFeature.id}`, { method: 'DELETE' });
                const res = await fetch(`/api/features?campus=${encodeURIComponent(campus)}`);
                const data = await res.json();
                setFeatures(data.features || []);
                setEditingFeature(null);
              }}>Xoá</button>
            )}
            <button className="admin-btn cancel" onClick={() => setEditingFeature(null)}>Đóng</button>
          </div>
        </div>
      )}

      {selectedResult && !isGuideMode && !isPathOverview && !(isAdminMode && adminSubMode === 'manage') && !showStartPicker && (
        <div className="bay-label-3d">
          <div className="bay-number">Kệ {shelf!.rackNumber}</div>
          <div className="bay-desc">
            <strong>Bay {shelf!.bay} · Mặt {shelf!.face === 1 ? 'Trước' : 'Sau'}</strong>
            <br />
            Dãy {shelf!.code.toUpperCase()}
          </div>
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
              <button
                className="guide-btn guide-btn-exit"
                onClick={() => {
                  if (isExternalGuided) {
                    onExitExternalGuide?.(bookId);
                  } else {
                    setShowStartPicker(false);
                  }
                }}
              >
                Huỷ
              </button>
              <button
                className="start-guide-btn-inline"
                style={{ marginTop: 0, flex: 1 }}
                onClick={() => {
                  setShowStartPicker(false);
                  setIsPathOverview(true);
                  setIsOverviewCollapsed(false);
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
            Bước {currentSigIndex + 1} / {significantSteps.length}
            <div className="guide-step-msg">
              {guideWaypoints[currentGuideStep].msg}
            </div>
          </div>
          <div className="guide-nav-btns">
            <button
              className="guide-btn guide-btn-back"
              onClick={() => {
                const nextSigIdx = Math.max(0, currentSigIndex - 1);
                setCurrentGuideStep(significantSteps[nextSigIdx]);
              }}
              disabled={currentSigIndex === 0}
            >
              ⬅️ Lùi lại
            </button>
            <button
              className="guide-btn guide-btn-next"
              onClick={() => {
                const nextSigIdx = Math.min(significantSteps.length - 1, currentSigIndex + 1);
                setCurrentGuideStep(significantSteps[nextSigIdx]);
              }}
              disabled={currentSigIndex === significantSteps.length - 1}
            >
              Đi tiếp ➡️
            </button>
          </div>
          <button
            className="guide-btn guide-btn-exit"
            onClick={() => {
              if (isExternalGuided) {
                onExitExternalGuide?.(bookId);
              } else {
                setIsGuideMode(false);
                onGuideModeChange?.(false);
              }
            }}
          >
            ❌ Thoát hướng dẫn
          </button>
        </div>
      )}

      {isPathOverview && guideWaypoints && (
        <div className="overview-controls-overlay">
          {isOverviewCollapsed ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: '-8px', marginRight: '-8px' }}>
                <button
                  onClick={() => setIsOverviewCollapsed(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    padding: 0,
                    transition: 'all 0.2s'
                  }}
                  title="Mở rộng cửa sổ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 .707 0l4.096-4.096V4.5a.5.5 0 1 0 1 0V.525a.5.5 0 0 0-.5-.5H11.5a.5.5 0 0 0 0 1h2.768l-4.096 4.096a.5.5 0 0 0 0 .707z"/>
                  </svg>
                </button>
              </div>
              <button
                className="start-guide-btn-inline"
                style={{ marginTop: 0, width: '100%' }}
                onClick={() => {
                  setIsPathOverview(false);
                  setIsGuideMode(true);
                  setCurrentGuideStep(0);
                }}
              >
                🚶‍♂️ Bắt đầu di chuyển
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0, marginTop: '-8px', marginRight: '-8px' }}>
                <button
                  onClick={() => setIsOverviewCollapsed(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    width: '28px',
                    height: '28px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    padding: 0,
                    transition: 'all 0.2s'
                  }}
                  title="Thu gọn cửa sổ (Chỉ hiện nút Bắt đầu di chuyển)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M.172 15.828a.5.5 0 0 0 .707 0l4.096-4.096V14.5a.5.5 0 1 0 1 0v-3.975a.5.5 0 0 0-.5-.5H1.5a.5.5 0 0 0 0 1h2.768L.172 15.121a.5.5 0 0 0 0 .707zM15.828.172a.5.5 0 0 0-.707 0l-4.096 4.096V1.5a.5.5 0 1 0-1 0v3.975a.5.5 0 0 0 .5.5H14.5a.5.5 0 0 0 0-1h-2.768L15.828.879a.5.5 0 0 0 0-.707z"/>
                  </svg>
                </button>
              </div>
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
                  style={{ marginTop: 0, flex: 1, padding: '10px' }}
                  onClick={() => {
                    setIsPathOverview(false);
                    onGuideModeChange?.(false);
                    setShowStartPicker(true);
                  }}
                >
                  Thoát
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {showLoginModal && (
        <div className="guide-overlay" style={{ zIndex: 9999 }}>
          <div className="guide-modal" style={{ maxWidth: '400px', padding: '30px', textAlign: 'center' }}>
            <button className="guide-close" onClick={() => {
              setShowLoginModal(false);
              setLoginError('');
              if (window.location.pathname === '/admin') {
                window.location.href = `/mock.html?book=${bookId}`;
              }
            }}>×</button>
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
                  const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                  });
                  const data = await res.json();
                  if (data.success) {
                    localStorage.setItem('isAdmin', 'true');
                    localStorage.setItem('adminToken', data.token);
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

  useFrame((_, delta) => {
    if (!waypoints || waypoints.length === 0) return;

    const WALK_SPEED = 16;
    const stepDiff = currentStep - lerpStepRef.current;
    const walkDir = Math.sign(stepDiff);

    // 1. Calculate desired look direction BEFORE moving
    const lsForDir = lerpStepRef.current;
    const loIdxD = Math.max(0, Math.min(waypoints.length - 1, Math.floor(lsForDir)));
    const hiIdxD = Math.max(0, Math.min(waypoints.length - 1, Math.ceil(lsForDir)));
    const tForDir = lsForDir - loIdxD;

    let dirX: number = 0, dirZ: number = 0;
    if (loIdxD === hiIdxD) {
      const nextIdx = Math.min(waypoints.length - 1, hiIdxD + 1);
      dirX = waypoints[nextIdx].pos.x - waypoints[hiIdxD].pos.x;
      dirZ = waypoints[nextIdx].pos.z - waypoints[hiIdxD].pos.z;
    } else if (tForDir > 0.92 && hiIdxD + 1 < waypoints.length) {
      dirX = waypoints[hiIdxD + 1].pos.x - waypoints[hiIdxD].pos.x;
      dirZ = waypoints[hiIdxD + 1].pos.z - waypoints[hiIdxD].pos.z;
    } else {
      dirX = waypoints[hiIdxD].pos.x - waypoints[loIdxD].pos.x;
      dirZ = waypoints[hiIdxD].pos.z - waypoints[loIdxD].pos.z;
    }

    // 2. Pause logic
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    if (camDir.lengthSq() > 0.001) camDir.normalize();

    let allowMove = true;
    const isAtCorner = Math.abs(lsForDir - Math.round(lsForDir)) < 0.005;
    const isBoundary = Math.round(lsForDir) === 0 || Math.round(lsForDir) >= waypoints.length - 2;
    if (isAtCorner && !isBoundary && Math.abs(stepDiff) > 0.005) {
      const targetDir = new THREE.Vector3(dirX, 0, dirZ);
      if (targetDir.lengthSq() > 0.001) {
        targetDir.normalize();
        if (camDir.angleTo(targetDir) > 0.15) {
          allowMove = false;
        }
      }
    }

    // 3. Move logic
    if (allowMove) {
      if (Math.abs(stepDiff) < 0.005) {
        lerpStepRef.current = currentStep;
      } else {
        const actualFrom = Math.max(0, Math.min(waypoints.length - 1, Math.floor(lerpStepRef.current)));
        const actualToIdx = Math.max(0, Math.min(waypoints.length - 1, Math.ceil(lerpStepRef.current)));
        const actualTo = actualToIdx === actualFrom ? Math.min(waypoints.length - 1, actualFrom + 1) : actualToIdx;
        const dxTo = waypoints[actualTo].pos.x - waypoints[actualFrom].pos.x;
        const dzTo = waypoints[actualTo].pos.z - waypoints[actualFrom].pos.z;
        const segDist = Math.sqrt(dxTo * dxTo + dzTo * dzTo);

        const stepRate = segDist > 0.1 ? WALK_SPEED / segDist : WALK_SPEED;
        let nextStep = lerpStepRef.current + walkDir * Math.min(Math.abs(stepDiff), stepRate * delta);

        if (walkDir > 0) {
          const nextInt = Math.floor(nextStep);
          if (nextInt > Math.floor(lerpStepRef.current) && nextInt < currentStep) nextStep = nextInt;
        } else {
          const nextInt = Math.ceil(nextStep);
          if (nextInt < Math.ceil(lerpStepRef.current) && nextInt > currentStep) nextStep = nextInt;
        }
        lerpStepRef.current = nextStep;
      }
    }

    // 4. Update Positions
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
        tp.x -= 0.7; tp.y = 2.5;
        const pushBackDir = Math.sign(tp.z - finalLookAt.z);
        tp.z += pushBackDir * 1.2;
      }
    }

    const lp = lookAtPos.current;
    if (walkDir >= 0 && ls >= waypoints.length - 2.2) {
      lp.lerp(finalLookAt, 0.4);
    } else {
      const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (dirLen > 0.01) {
        const targetX = tp.x + (dirX / dirLen) * 15;
        const targetZ = tp.z + (dirZ / dirLen) * 15;
        lp.x += (targetX - lp.x) * 0.1;
        lp.y = 3.5;
        lp.z += (targetZ - lp.z) * 0.1;
      }
    }

    if (ls >= waypoints.length - 1 - 0.05) lp.copy(finalLookAt);

    // Zoom nhanh từ overview xuống bước 1, bám sát tp khi đi bộ
    const moveDist = camera.position.distanceTo(tp);
    if (moveDist > 5) {
      // Zoom nhanh từ góc nhìn tổng quát xuống
      camera.position.lerp(tp, 0.07);
    } else {
      // Bám sát tp — tốc độ cố định đã được xử lý ở step interpolation
      camera.position.lerp(tp, 0.4);
    }

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
