import { useMemo, useState, useEffect, useRef } from 'react';
import { Text, Line, Merged } from '@react-three/drei';
import * as THREE from 'three';
import type { RackInfo, ShelfInfo } from '../types';
import HighlightMarker from './HighlightMarker';

export interface PathWaypoint {
  pos: THREE.Vector3;
  msg: string;
}

interface BookshelfSceneProps {
  racks: RackInfo[];
  customFeatures?: import('../types').CustomFeature[];
  campus: string;
  highlightRack: number | null;
  highlightBay: number | null;
  highlightFace: number | null;
  startRackNumber?: number | null;
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  onPathCalculated?: (waypoints: PathWaypoint[] | null) => void;
  isAdminMode?: boolean;
  adminSubMode?: string | null;
  onAddRackAt?: (x: number, z: number) => void;
  onAddFeatureAt?: (x: number, z: number) => void;
  onFeatureClick?: (id: number) => void;
}

const ROW_SPACING_Z = 4.0;

// Shared Geometries
const sideSegmentGeo = new THREE.BoxGeometry(0.1, 1, 1);
const floorGeo = new THREE.BoxGeometry(3, 0.1, 1);
const dividerGeo = new THREE.BoxGeometry(3, 0.05, 0.5);
const clickMat = new THREE.MeshBasicMaterial({ visible: false });

// Shared geometries and materials for labels to prevent GC churn
const shelfBgGeo = new THREE.PlaneGeometry(0.9, 0.5);
const shelfBgMat = new THREE.MeshBasicMaterial({ color: '#4f46e5' });
const shelfFgGeo = new THREE.PlaneGeometry(0.84, 0.44);
const shelfFgMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

const deweyBgGeo = new THREE.PlaneGeometry(1.6, 0.3);
const deweyBgMat = new THREE.MeshBasicMaterial({ color: '#3498db' });
const deweyFgGeo = new THREE.PlaneGeometry(1.54, 0.24);
const deweyFgMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

const rackLabelBgGeo = new THREE.CircleGeometry(0.19, 32);
const rackLabelBgMat = new THREE.MeshBasicMaterial({ color: '#4f46e5' });
const rackLabelFgGeo = new THREE.CircleGeometry(0.16, 32);
const rackLabelFgMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

const cbayLabelBgGeo = new THREE.CircleGeometry(0.28, 32);
const cbayLabelFgGeo = new THREE.CircleGeometry(0.24, 32);

const clickGeos = Array.from({ length: 10 }).map((_, i) => new THREE.BoxGeometry(3, i, 0.4));

// Bảng màu xoay vòng cho các kệ: vàng → xanh lá → cam → xanh dương
const RACK_COLORS = [
  { base: '#ffe94a', hl: '#fff68a', hover: '#fff05f', emissive: '#806600' },  // Vàng
  { base: '#42ff8f', hl: '#8affbd', hover: '#63ffa3', emissive: '#005c2c' },  // Xanh lá
  { base: '#ffad33', hl: '#ffd084', hover: '#ffbd55', emissive: '#7a3500' },  // Cam
  { base: '#4aa3ff', hl: '#91c9ff', hover: '#6bb5ff', emissive: '#004080' },  // Xanh dương
];

const rackMatsCache = new Map<number, { normal: THREE.Material, hl: THREE.Material, hover: THREE.Material }>();

function getRackMats(rackNumber: number) {
  if (rackMatsCache.has(rackNumber)) return rackMatsCache.get(rackNumber)!;
  const palette = RACK_COLORS[(rackNumber - 1) % RACK_COLORS.length];
  const mats = {
    normal: new THREE.MeshLambertMaterial({ color: palette.base, emissive: palette.emissive, emissiveIntensity: 0.22 }),
    hl: new THREE.MeshLambertMaterial({ color: palette.hl, emissive: palette.emissive, emissiveIntensity: 0.65 }),
    hover: new THREE.MeshLambertMaterial({ color: palette.hover, emissive: palette.emissive, emissiveIntensity: 0.35 }),
  };
  rackMatsCache.set(rackNumber, mats);
  return mats;
}

// Fallback mặc định
const woodMat = new THREE.MeshLambertMaterial({ color: '#6b4226' });

// Components using raw meshes with cached materials
function Bay({
  SideWood,
  FloorWood,
  DividerWood,
  bayIndex,
  bayIdx,
  totalBays,
  mat,
  rackNumber,
  shelves,
  onBayClick,
  campus,
  isAdminMode,
  overrideOffsetX,
}: {
  SideWood?: any;
  FloorWood?: any;
  DividerWood?: any;
  bayIndex: number;
  bayIdx?: number;
  totalBays: number;
  mat: THREE.Material;
  rackNumber: number;
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  campus: string;
  isAdminMode?: boolean;
  overrideOffsetX?: number;
}) {
  const offsetX = overrideOffsetX !== undefined ? overrideOffsetX : (bayIndex - 1) * 3;

  const face1Shelf = shelves.find(s => s.bay === bayIndex && s.face === 1);
  const face2Shelf = shelves.find(s => s.bay === bayIndex && s.face === 2);
  const activeIdx = bayIdx !== undefined ? bayIdx : bayIndex;

  const getLabel = (idx: number, face: number) => {
    if (campus === 'Thu Duc') {
      return face === 2 ? String.fromCharCode(64 + idx) : String.fromCharCode(64 + totalBays + idx);
    } else {
      return face === 1 ? String.fromCharCode(64 + idx) : String.fromCharCode(64 + (2 * totalBays - idx + 1));
    }
  };

  const displayCode1 = face1Shelf ? face1Shelf.code.toUpperCase() : `${rackNumber}${getLabel(activeIdx, 1)}`;
  const displayCode2 = face2Shelf ? face2Shelf.code.toUpperCase() : `${rackNumber}${getLabel(activeIdx, 2)}`;

  // Kết hợp mảng các tầng bị ẩn: Tầng bị ẩn vật lý nếu nó ẩn ở ít nhất một mặt đang hoạt động
  const hiddenFloors = useMemo(() => {
    const set = new Set<number>();
    for (let f = 1; f <= 9; f++) {
      const isHidden1 = face1Shelf ? (face1Shelf.hiddenFloors || []).includes(f) : false;
      const isHidden2 = face2Shelf ? (face2Shelf.hiddenFloors || []).includes(f) : false;
      
      const activeFacesCount = (face1Shelf ? 1 : 0) + (face2Shelf ? 1 : 0);
      if (activeFacesCount === 0) {
        set.add(f);
      } else {
        const shouldHide = (face1Shelf && isHidden1) || (face2Shelf && isHidden2);
        if (shouldHide) {
          set.add(f);
        }
      }
    }
    return set;
  }, [face1Shelf, face2Shelf]);

  // Tìm tầng cao nhất đang hoạt động cho khung vật lý chung (để render các cột gỗ dọc)
  const maxActiveFloor = useMemo(() => {
    let maxF = 0;
    for (let f = 1; f <= 9; f++) {
      if (!hiddenFloors.has(f)) {
        maxF = f;
      }
    }
    return maxF || 5; // Mặc định 5 tầng nếu không tìm thấy
  }, [hiddenFloors]);

  // Tìm tầng cao nhất hoạt động cho từng mặt riêng biệt (để định vị click zone và nhãn)
  const maxActiveFloor1 = useMemo(() => {
    if (!face1Shelf) return 0;
    const hFloors = face1Shelf.hiddenFloors || [];
    const hiddenSet = new Set(hFloors);
    let maxF = 0;
    for (let f = 1; f <= 9; f++) {
      if (!hiddenSet.has(f)) maxF = f;
    }
    return maxF || 5;
  }, [face1Shelf]);

  const maxActiveFloor2 = useMemo(() => {
    if (!face2Shelf) return 0;
    const hFloors = face2Shelf.hiddenFloors || [];
    const hiddenSet = new Set(hFloors);
    let maxF = 0;
    for (let f = 1; f <= 9; f++) {
      if (!hiddenSet.has(f)) maxF = f;
    }
    return maxF || 5;
  }, [face2Shelf]);

  // Tạo danh sách ván sàn tương ứng dựa trên cấu trúc vật lý chung
  const boards = useMemo(() => {
    const arr = [0.1];
    for (let f = 1; f <= maxActiveFloor; f++) {
      arr.push(f);
    }
    return arr;
  }, [maxActiveFloor]);

  return (
    <group position={[offsetX, 0, 0]}>
      {/* Sides segmented into up to 9 pieces */}
      {Array.from({ length: 9 }).map((_, i) => {
        const floorNum = i + 1;
        if (hiddenFloors.has(floorNum)) return null;
        const y = floorNum - 0.5;
        return (
          <group key={`sides-${i}`}>
            {activeIdx === 1 ? (
              <mesh geometry={sideSegmentGeo} material={mat} position={[0.13, y, -0.49]} />
            ) : (
              SideWood ? <SideWood position={[0.13, y, -0.49]} /> : <mesh geometry={sideSegmentGeo} material={woodMat} position={[0.13, y, -0.49]} />
            )}
            {SideWood ? <SideWood position={[3.17, y, -0.49]} /> : <mesh geometry={sideSegmentGeo} material={woodMat} position={[3.17, y, -0.49]} />}
          </group>
        );
      })}
      
      {/* Floors (boards) */}
      {boards.map((y, i) => {
        const k = i + 1; // Board number 1 to (maxActiveFloor + 1)
        const compBelow = k - 1; // Compartment below (1 to maxActiveFloor)
        const compAbove = k;     // Compartment above (1 to maxActiveFloor)
        
        // Mặc định coi các tầng ngoài phạm vi là "đã ẩn" (không cần ván)
        let compBelowHidden = true;
        if (compBelow >= 1 && compBelow <= maxActiveFloor) {
          compBelowHidden = hiddenFloors.has(compBelow);
        }
        
        let compAboveHidden = true;
        if (compAbove >= 1 && compAbove <= maxActiveFloor) {
          compAboveHidden = hiddenFloors.has(compAbove);
        }
        
        // Một tấm ván chỉ bị ẩn khi CẢ HAI ngăn (trên và dưới nó) đều bị ẩn
        if (compBelowHidden && compAboveHidden) return null;

        return FloorWood ? <FloorWood key={`floor-${k}`} position={[1.67, y, -0.49]} /> : <mesh key={`floor-${k}`} geometry={floorGeo} material={woodMat} position={[1.67, y, -0.49]} />;
      })}

      {/* Dividers 1 to maxActiveFloor */}
      {Array.from({ length: maxActiveFloor }).map((_, i) => {
        const floorNum = i + 1;
        if (hiddenFloors.has(floorNum)) return null;
        const y = floorNum - 0.7;
        return DividerWood ? <DividerWood key={`divider-${i}`} position={[1.67, y, -0.49]} rotation={[Math.PI / 2, 0, 0]} /> : <mesh key={`divider-${i}`} geometry={dividerGeo} material={woodMat} position={[1.67, y, -0.49]} rotation={[Math.PI / 2, 0, 0]} />;
      })}

      {/* Biển báo và Tem (Giữ nguyên vì Text không instance dễ dàng) */}
      {face1Shelf && (
        <group position={[1.67, maxActiveFloor1, 0.015]}>
          <mesh geometry={shelfBgGeo} material={shelfBgMat} position={[0, 0, 0]} />
          <mesh geometry={shelfFgGeo} material={shelfFgMat} position={[0, 0, 0.005]} />
          <Text position={[0, 0, 0.015]} fontSize={0.2} color="#1e1b4b" fontWeight="700" anchorX="center" anchorY="middle" letterSpacing={0.05}>
            {displayCode1}
          </Text>
        </group>
      )}

      {face2Shelf && (
        <group position={[1.67, maxActiveFloor2, -0.995]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={shelfBgGeo} material={shelfBgMat} position={[0, 0, 0]} />
          <mesh geometry={shelfFgGeo} material={shelfFgMat} position={[0, 0, 0.005]} />
          <Text position={[0, 0, 0.015]} fontSize={0.2} color="#1e1b4b" fontWeight="700" anchorX="center" anchorY="middle" letterSpacing={0.05}>
            {displayCode2}
          </Text>
        </group>
      )}

      {face1Shelf && (
        <group position={[1.67, (maxActiveFloor1 / 2.0) - 0.45, 0.015]}>
          <mesh geometry={deweyBgGeo} material={deweyBgMat} />
          <mesh geometry={deweyFgGeo} material={deweyFgMat} position={[0, 0, 0.005]} />
          <Text position={[0, 0, 0.01]} fontSize={0.13} color="#2c3e50" fontWeight="600" anchorX="center" anchorY="middle">
            {`${face1Shelf.deweyStart.toFixed(3)} – ${face1Shelf.deweyEnd.toFixed(3)}`}
          </Text>
        </group>
      )}

      {face2Shelf && (
        <group position={[1.67, (maxActiveFloor2 / 2.0) - 0.45, -0.995]} rotation={[0, Math.PI, 0]}>
          <mesh geometry={deweyBgGeo} material={deweyBgMat} />
          <mesh geometry={deweyFgGeo} material={deweyFgMat} position={[0, 0, 0.005]} />
          <Text position={[0, 0, 0.01]} fontSize={0.13} color="#2c3e50" fontWeight="600" anchorX="center" anchorY="middle">
            {`${face2Shelf.deweyStart.toFixed(3)} – ${face2Shelf.deweyEnd.toFixed(3)}`}
          </Text>
        </group>
      )}

      {/* Click zones */}
      {(face1Shelf || isAdminMode) && (
        <mesh material={clickMat} position={[1.65, maxActiveFloor1 / 2, -0.1]}
          geometry={clickGeos[Math.min(9, Math.round(maxActiveFloor1))] || clickGeos[5]}
          onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 1); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        />
      )}
      {(face2Shelf || isAdminMode) && (
        <mesh material={clickMat} position={[1.65, maxActiveFloor2 / 2, -0.88]}
          geometry={clickGeos[Math.min(9, Math.round(maxActiveFloor2))] || clickGeos[5]}
          onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 2); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        />
      )}
    </group>
  );
}

function Rack({
  SideWood,
  FloorWood,
  DividerWood,
  rackNumber,
  isHighlighted,
  bays,
  shelves,
  onBayClick,
  campus,
  isAdminMode,
}: {
  SideWood?: any;
  FloorWood?: any;
  DividerWood?: any;
  rackNumber: number;
  isHighlighted: boolean;
  bays: number[];
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  campus: string;
  isAdminMode?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const mats = useMemo(() => {
    const dbColor = shelves.find(s => s.color)?.color;
    if (dbColor) {
      const colorObj = new THREE.Color(dbColor);
      const hlColor = colorObj.clone().multiplyScalar(1.2);
      const hoverColor = colorObj.clone().multiplyScalar(1.1);
      return {
        normal: new THREE.MeshLambertMaterial({ color: colorObj, emissive: colorObj, emissiveIntensity: 0.22 }),
        hl: new THREE.MeshLambertMaterial({ color: hlColor, emissive: colorObj, emissiveIntensity: 0.65 }),
        hover: new THREE.MeshLambertMaterial({ color: hoverColor, emissive: colorObj, emissiveIntensity: 0.35 }),
      };
    }
    return getRackMats(rackNumber);
  }, [shelves, rackNumber]);

  const mat = isHighlighted ? mats.hl : hovered ? mats.hover : mats.normal;

  const minBay = bays.length > 0 ? Math.min(...bays) : 1;
  const maxBay = bays.length > 0 ? Math.max(...bays) : 5;
  const labelXMin = (minBay - 1) * 3 + 0.05;
  const labelXMax = (maxBay - 1) * 3 + 3.25;

  const maxRackActiveFloor = useMemo(() => {
    let maxF = 0;
    shelves.forEach(s => {
      const hFloors = s.hiddenFloors || [];
      const hiddenSet = new Set(hFloors);
      for (let f = 1; f <= 9; f++) {
        if (!hiddenSet.has(f)) {
          if (f > maxF) maxF = f;
        }
      }
    });
    return maxF || 5;
  }, [shelves]);

  const labelY = maxRackActiveFloor - 0.5;

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {bays.map((b, i) => (
        <Bay key={b} SideWood={SideWood} FloorWood={FloorWood} DividerWood={DividerWood} bayIndex={b} bayIdx={i + 1} totalBays={bays.length} mat={mat} rackNumber={rackNumber} shelves={shelves} onBayClick={onBayClick} campus={campus} isAdminMode={isAdminMode} />
      ))}

      {/* Nhãn số kệ */}
      <group position={[labelXMin, labelY, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh geometry={rackLabelBgGeo} material={rackLabelBgMat} />
        <mesh position={[0, 0, 0.005]} geometry={rackLabelFgGeo} material={rackLabelFgMat} />
        <Text position={[0, 0, 0.01]} fontSize={0.16} color="#1e1b4b" fontWeight="800" anchorX="center" anchorY="middle">{`${rackNumber}`}</Text>
      </group>

      <group position={[labelXMax, labelY, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={rackLabelBgGeo} material={rackLabelBgMat} />
        <mesh position={[0, 0, 0.005]} geometry={rackLabelFgGeo} material={rackLabelFgMat} />
        <Text position={[0, 0, 0.01]} fontSize={0.16} color="#1e1b4b" fontWeight="800" anchorX="center" anchorY="middle">{`${rackNumber}`}</Text>
      </group>

    </group>
  );
}

// Giữ nguyên các thành phần nhỏ khác
function LowDisplayRack({ position, length = 6 }: { position: [number, number, number], length?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.2, 1.2, length]} /><meshLambertMaterial color="#a67c52" /></mesh>
      <mesh position={[0.56, 0.6, 0]}><boxGeometry args={[0.1, 1.1, length - 0.2]} /><meshLambertMaterial color="#f5f6fa" /></mesh>
      {[0.2, 0.55, 0.9].map((y, i) => (
        <mesh key={i} position={[0.2, y, 0]}><boxGeometry args={[0.7, 0.05, length - 0.2]} /><meshLambertMaterial color="#dcdde1" /></mesh>
      ))}
      {[-(length / 4), (length / 4)].map((zOff, i) => (
        <group key={i} position={[0.2, 1.4, zOff]} rotation={[0, -0.3, 0]}>
          <mesh><boxGeometry args={[0.05, 0.4, 0.6]} /><meshLambertMaterial color="#f1c40f" /></mesh>
          <mesh position={[0.03, 0, 0]}><planeGeometry args={[0.5, 0.3]} /><meshBasicMaterial color="white" /></mesh>
        </group>
      ))}
    </group>
  );
}

function LibrarianDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]}><boxGeometry args={[18, 0.1, 2]} /><meshLambertMaterial color="#8b4513" /></mesh>
      {[-8.8, 8.8, -3, 3].map((x, i) => (
        <mesh key={i} position={[x, 0.4, 0]}><boxGeometry args={[0.2, 0.8, 1.8]} /><meshLambertMaterial color="#5d2e0a" /></mesh>
      ))}
      {[-6, -2, 2, 6].map((x, i) => (
        <mesh key={i} position={[x, 0.45, 1.2]}><boxGeometry args={[0.8, 0.9, 0.8]} /><meshLambertMaterial color="#2c3e50" /></mesh>
      ))}
      <group position={[0, 1.2, 1.05]}>
        <mesh><boxGeometry args={[6, 0.6, 0.1]} /><meshBasicMaterial color="#34495e" /></mesh>
        <Text position={[0, 0, 0.06]} fontSize={0.35} color="white" fontWeight="bold" anchorX="center" anchorY="middle">QUẦY THỦ THƯ</Text>
      </group>
    </group>
  );
}

function EntranceArea({ position, isDouble = false }: { position: [number, number, number], isDouble?: boolean }) {
  return (
    <group position={position}>
      <mesh position={[isDouble ? -1.5 : 0, 2.5, 0]}><boxGeometry args={[3, 5, 0.2]} /><meshLambertMaterial color="#d1d8e0" transparent opacity={0.4} /></mesh>
      {isDouble && <mesh position={[1.5, 2.5, 0]}><boxGeometry args={[3, 5, 0.2]} /><meshLambertMaterial color="#d1d8e0" transparent opacity={0.4} /></mesh>}
      <mesh position={[isDouble ? -3.0 : -1.5, 2.5, 0.05]}><boxGeometry args={[0.2, 5, 0.3]} /><meshLambertMaterial color="#4b6584" /></mesh>
      <mesh position={[isDouble ? 3.0 : 1.5, 2.5, 0.05]}><boxGeometry args={[0.2, 5, 0.3]} /><meshLambertMaterial color="#4b6584" /></mesh>
      <mesh position={[0, 5, 0.05]}><boxGeometry args={[isDouble ? 6.2 : 3.2, 0.2, 0.3]} /><meshLambertMaterial color="#4b6584" /></mesh>
      <group position={[0, 5.5, 0]}><Text fontSize={isDouble ? 0.8 : 0.6} color="#e67e22" fontWeight="bold" anchorX="center">CỬA RA VÀO</Text></group>
    </group>
  );
}

function AdminGrid({ onAddRackAt, visible, racks, campus }: { onAddRackAt?: (x: number, z: number) => void, visible: boolean, racks: RackInfo[], campus: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  const instances = useMemo(() => {
    const data = [];
    const numBays = 10;
    const numRows = 50;
    const zOffset = campus === 'Thu Duc' ? 6.5 : 17.0;

    for (let col = 0; col < numBays; col++) {
      for (let row = 0; row < numRows; row++) {
        const cx = col * 3.0;
        const cz = campus === 'Thu Duc' ? (row - zOffset) * 4.0 : -(row - zOffset) * 4.0;
        data.push({ cx, cz, col, row });
      }
    }
    return data;
  }, [campus]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    instances.forEach((inst, i) => {
      dummy.position.set(inst.cx + 1.65, 0.05, inst.cz - 0.49);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingSphere();
  }, [instances, visible, meshRef.current]);

  useEffect(() => {
    if (visible && meshRef.current) meshRef.current.computeBoundingSphere();
  }, [visible]);

  return (
    <group visible={visible}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]} frustumCulled={false}
        onClick={(e) => { if (!visible) return; e.stopPropagation(); if (e.instanceId !== undefined) onAddRackAt?.(instances[e.instanceId].cx, instances[e.instanceId].cz); }}
        onPointerMove={(e) => { if (!visible) return; e.stopPropagation(); if (e.instanceId !== undefined) { setHoverPos([instances[e.instanceId].cx, instances[e.instanceId].cz]); document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { if (!visible) return; setHoverPos(null); document.body.style.cursor = 'default'; }}
      >
        <planeGeometry args={[3.0, 1.0]} />
        <meshBasicMaterial color="#3498db" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      {hoverPos && visible && (
        <mesh position={[hoverPos[0] + 1.65, 0.06, hoverPos[1] - 0.49]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.0, 1.0]} /><meshBasicMaterial color="#4caf50" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function FeatureGrid({
  visible,
  campus,
  existingFeatures,
  isAdminMode,
  adminSubMode,
  onAddFeatureAt,
  onFeatureClick,
  rackPositions
}: {
  visible: boolean;
  campus: string;
  existingFeatures: any[];
  isAdminMode?: boolean;
  adminSubMode?: string | null;
  onAddFeatureAt?: (x: number, z: number) => void;
  onFeatureClick?: (id: number) => void;
  rackPositions?: { rackNumber: number, x: number, z: number }[];
}) {
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  const slots = useMemo(() => {
    if (!rackPositions || rackPositions.length === 0) return [];
    
    const zValues = rackPositions.map(rp => rp.z);
    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);
    
    const slotsArr = [];
    const fixedX = campus === 'Thu Duc' ? -3 : -12;
    
    for (let z = minZ; z <= maxZ; z += 2.0) {
      slotsArr.push({ x: fixedX, z: z });
    }
    return slotsArr;
  }, [campus, rackPositions]);

  const availableSlots = useMemo(() => {
    return slots.filter(s => !existingFeatures.some(f => 
      Math.abs(f.pos_x - s.x) < 2 && Math.abs(f.pos_z - s.z) < (f.length || 2) / 2
    ));
  }, [slots, existingFeatures]);

  return (
    <group>
      {existingFeatures.map((feat) => (
        <mesh
          key={`feat-${feat.id}`}
          position={[feat.pos_x, 0.6, feat.pos_z]}
          rotation={[0, feat.rotation || 0, 0]}
          castShadow receiveShadow
          onClick={(e) => {
            if (isAdminMode && adminSubMode === 'features') {
              e.stopPropagation();
              onFeatureClick?.(feat.id);
            }
          }}
          onPointerMove={(e) => {
            if (isAdminMode && adminSubMode === 'features') {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }
          }}
          onPointerOut={() => {
            if (isAdminMode && adminSubMode === 'features') {
              document.body.style.cursor = 'default';
            }
          }}
        >
          <boxGeometry args={[feat.width || 1.2, 1.2, feat.length]} />
          <meshLambertMaterial color="#8b4513" />
        </mesh>
      ))}
      {visible && availableSlots.map((slot, i) => (
        <mesh
          key={`f-slot-${i}`}
          position={[slot.x, 0.05, slot.z]}
          onClick={(e) => {
            e.stopPropagation();
            onAddFeatureAt?.(slot.x, slot.z);
          }}
          onPointerMove={(e) => {
            e.stopPropagation();
            setHoverPos([slot.x, slot.z]);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            setHoverPos(null);
            document.body.style.cursor = 'default';
          }}
        >
          <boxGeometry args={[1.2, 0.1, 1.9]} />
          <meshBasicMaterial
            color={hoverPos && hoverPos[0] === slot.x && hoverPos[1] === slot.z ? "#4caf50" : "#e67e22"}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function FurnitureInstances({ aislePositions, wallRowPositions }: { aislePositions: [number, number, number][], wallRowPositions: [number, number, number][] }) {
  const tableHRef = useRef<THREE.InstancedMesh>(null);
  const tableVRef = useRef<THREE.InstancedMesh>(null);
  const chairRef = useRef<THREE.InstancedMesh>(null);

  const chairOffsets = [-2.8, 0, 2.8];
  const totalChairs = aislePositions.length * 6 + wallRowPositions.length * 3;

  useEffect(() => {
    const dummy = new THREE.Object3D();
    if (tableHRef.current) {
      aislePositions.forEach((pos, i) => {
        dummy.position.set(pos[0], pos[1] + 0.75, pos[2]);
        dummy.updateMatrix();
        tableHRef.current!.setMatrixAt(i, dummy.matrix);
      });
      tableHRef.current.instanceMatrix.needsUpdate = true;
    }
    if (tableVRef.current) {
      wallRowPositions.forEach((pos, i) => {
        dummy.position.set(pos[0], pos[1] + 0.75, pos[2]);
        dummy.updateMatrix();
        tableVRef.current!.setMatrixAt(i, dummy.matrix);
      });
      tableVRef.current.instanceMatrix.needsUpdate = true;
    }
    if (chairRef.current) {
      let ci = 0;
      aislePositions.forEach((pos) => {
        chairOffsets.forEach((xOff) => {
          dummy.position.set(pos[0] + xOff, pos[1] + 0.4, pos[2] + 0.85); dummy.updateMatrix(); chairRef.current!.setMatrixAt(ci++, dummy.matrix);
          dummy.position.set(pos[0] + xOff, pos[1] + 0.4, pos[2] - 0.85); dummy.updateMatrix(); chairRef.current!.setMatrixAt(ci++, dummy.matrix);
        });
      });
      wallRowPositions.forEach((pos) => {
        chairOffsets.forEach((zOff) => {
          dummy.position.set(pos[0] + 0.85, pos[1] + 0.4, pos[2] + zOff); dummy.updateMatrix(); chairRef.current!.setMatrixAt(ci++, dummy.matrix);
        });
      });
      chairRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [aislePositions, wallRowPositions]);

  return (
    <>
      <instancedMesh ref={tableHRef} args={[undefined, undefined, aislePositions.length]}><boxGeometry args={[8, 0.05, 1.2]} /><meshLambertMaterial color="#8b4513" /></instancedMesh>
      <instancedMesh ref={tableVRef} args={[undefined, undefined, wallRowPositions.length]}><boxGeometry args={[1.2, 0.05, 8]} /><meshLambertMaterial color="#8b4513" /></instancedMesh>
      <instancedMesh ref={chairRef} args={[undefined, undefined, totalChairs]}><boxGeometry args={[0.6, 0.8, 0.6]} /><meshLambertMaterial color="#2c3e50" /></instancedMesh>
    </>
  );
}

function BookshelfMergedContainer({ children }: { children: (SideWood: any, FloorWood: any, DividerWood: any) => React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        // Fix for frustum culling making the instances disappear when the camera gets close
        if ((child as any).isInstancedMesh) {
          child.frustumCulled = false;
        }
      });
    }
  });

  const staticMeshes = useMemo(() => [
    new THREE.Mesh(sideSegmentGeo, woodMat),
    new THREE.Mesh(floorGeo, woodMat),
    new THREE.Mesh(dividerGeo, woodMat),
  ], []);

  return (
    <group ref={groupRef}>
      <Merged meshes={staticMeshes}>
        {(SideWood, FloorWood, DividerWood) => children(SideWood, FloorWood, DividerWood)}
      </Merged>
    </group>
  );
}

export default function BookshelfScene({
  racks,
  customFeatures = [],
  campus,
  highlightRack,
  highlightBay,
  highlightFace,
  startRackNumber,
  onBayClick,
  onPathCalculated,
  isAdminMode,
  adminSubMode,
  onAddRackAt,
  onAddFeatureAt,
  onFeatureClick,
}: BookshelfSceneProps) {

  const { sequentialRacks, customShelves, customBays } = useMemo(() => {
    const custom: ShelfInfo[] = [];
    const sequential: RackInfo[] = [];

    racks.forEach(rack => {
      const seqShelves = rack.shelves.filter(s => {
        if (s.positionX != null && s.positionZ != null) {
          custom.push(s);
          return false;
        }
        return true;
      });

      if (seqShelves.length > 0) {
        sequential.push({
          rackNumber: rack.rackNumber,
          shelves: seqShelves,
          bays: [...new Set(seqShelves.map(s => s.bay))].sort((a, b) => a - b)
        });
      }
    });

    const bayMap = new Map<string, { rackNumber: number, bay: number, positionX: number, positionZ: number, shelves: ShelfInfo[] }>();
    custom.forEach(s => {
      const key = `${s.rackNumber}-${s.bay}`;
      if (!bayMap.has(key)) {
        bayMap.set(key, { rackNumber: s.rackNumber, bay: s.bay, positionX: s.positionX!, positionZ: s.positionZ!, shelves: [] });
      }
      bayMap.get(key)!.shelves.push(s);
    });

    return { sequentialRacks: sequential, customShelves: custom, customBays: Array.from(bayMap.values()) };
  }, [racks]);

  const rackPositions = useMemo(() => {
    const sorted = [...racks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    return sorted.map((rack, index) => {
      const totalRacks = sorted.length;
      const firstShelf = rack.shelves.find(s => s.positionZ != null);
      const z = Number(firstShelf?.positionZ ?? -(index - totalRacks / 2) * ROW_SPACING_Z);
      return {
        rackNumber: rack.rackNumber,
        bays: [...new Set(rack.shelves.map(s => s.bay))].sort((a, b) => a - b),
        shelves: rack.shelves,
        x: 0,
        z: z,
      };
    });
  }, [racks, campus]);

  // Tìm kệ đang được highlight để tính chiều cao của nó
  const highlightShelfHeight = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return 4.8;
    
    const targetShelf = racks.flatMap(r => r.shelves).find(s => 
      s.rackNumber === highlightRack && s.bay === highlightBay && s.face === highlightFace
    );
    if (!targetShelf) return 4.8;

    const hFloors = targetShelf.hiddenFloors || [];
    const hiddenSet = new Set(hFloors);
    let maxF = 0;
    for (let f = 1; f <= 9; f++) {
      if (!hiddenSet.has(f)) {
        if (f > maxF) maxF = f;
      }
    }
    const finalMaxF = maxF || 5;
    // Chiều cao highlight box nên ngắn hơn chiều cao tổng một chút (giống 4.8 so với 5.0)
    return finalMaxF - 0.2;
  }, [highlightRack, highlightBay, highlightFace, racks]);

  const markerPos = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    // Chiều cao và tọa độ Y của marker tương ứng với maxActiveFloor
    const h = highlightShelfHeight + 0.2; // Làm tròn lại chiều cao thực tế
    const yVal = h / 2.0;

    // Check custom shelves first
    const customShelf = customShelves.find(s => s.rackNumber === highlightRack && s.bay === highlightBay && s.face === highlightFace);
    if (customShelf) {
      const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
      return new THREE.Vector3(customShelf.positionX! + 1.65, yVal, customShelf.positionZ! + faceLocalZ);
    }

    const rp = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!rp) return null;
    const bayLocalX = (highlightBay - 1) * 3 + 1.65;
    const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
    return new THREE.Vector3(rp.x + bayLocalX, yVal, rp.z + faceLocalZ);
  }, [highlightRack, highlightBay, highlightFace, rackPositions, customShelves, campus, highlightShelfHeight]);

  const features = useMemo(() => {
    if (campus !== 'Sai Gon' && campus !== 'Thu Duc') return null;

    if (campus === 'Sai Gon') {
      const rack2 = rackPositions.find(r => r.rackNumber === 2);
      if (!rack2) return null;

      const aisleZs = [
        rack2.z + 2,
        ...rackPositions.slice(0, -1).map((rp, i) => (rp.z + rackPositions[i + 1].z) / 2)
      ];

      return {
        deskPos: [-12, 0, rack2.z + 10] as [number, number, number],
        entrancePos: [-31.6, 0, rack2.z + 10] as [number, number, number],
        rack1Pos: [0, 0, rack2.z + 4] as [number, number, number],
        aislePositions: aisleZs.flatMap(z => [
          [-17, 0, z] as [number, number, number],
          [-7, 0, z] as [number, number, number]
        ]),
        wallRowPositions: aisleZs.map(z => [-31.6, 0, z] as [number, number, number])
      };
    } else {
      const rack1 = rackPositions.find(r => r.rackNumber === 1);
      const rack13 = rackPositions.find(r => r.rackNumber === 13);
      if (!rack1 || !rack13) return null;

      return {
        deskPos: [-40.5, 0, -22] as [number, number, number],
        entrancePos: [-40.5, 0, 26] as [number, number, number],
        rack1Pos: null,
        aislePositions: [
          [-11, 0, 16] as [number, number, number], [-23, 0, 16] as [number, number, number],
          [-11, 0, 8] as [number, number, number], [-23, 0, 8] as [number, number, number],
          [-11, 0, -4] as [number, number, number], [-23, 0, -4] as [number, number, number],
          [-11, 0, -12] as [number, number, number], [-23, 0, -12] as [number, number, number],

          [-58, 0, 16] as [number, number, number], [-70, 0, 16] as [number, number, number], [-82, 0, 16] as [number, number, number], [-94, 0, 16] as [number, number, number],
          [-58, 0, 8] as [number, number, number], [-70, 0, 8] as [number, number, number], [-82, 0, 8] as [number, number, number], [-94, 0, 8] as [number, number, number],
          [-58, 0, -4] as [number, number, number], [-70, 0, -4] as [number, number, number], [-82, 0, -4] as [number, number, number], [-94, 0, -4] as [number, number, number],
          [-58, 0, -12] as [number, number, number], [-70, 0, -12] as [number, number, number], [-82, 0, -12] as [number, number, number], [-94, 0, -12] as [number, number, number]
        ],
        wallRowPositions: [],
        lowRackPositions: [] // Now handled by customFeatures
      };
    }
  }, [campus, rackPositions]);

  const pathWaypoints = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    let aisleZ: number;
    let shelfX: number;

    const customShelf = customShelves.find(s => s.rackNumber === highlightRack && s.bay === highlightBay && s.face === highlightFace);
    if (customShelf) {
      aisleZ = highlightFace === 1 ? customShelf.positionZ! + 2.0 : customShelf.positionZ! - 3.0;
      shelfX = customShelf.positionX! + 1.65;
    } else {
      const targetRack = rackPositions.find((r) => r.rackNumber === highlightRack);
      if (!targetRack) return null;

      aisleZ = highlightFace === 1 ? targetRack.z + 2.0 : targetRack.z - 3.0;
      shelfX = targetRack.x + (highlightBay - 1) * 3 + 1.65;
    }

    const startRack = (startRackNumber != null)
      ? rackPositions.find(r => r.rackNumber === startRackNumber)
      : null;

    if (campus === 'Sai Gon') {
      const rack2 = rackPositions.find(r => r.rackNumber === 2);
      if (!rack2) return null;
      const frontOfDeskZ = rack2.z + 7.3;
      const mainCorridorX = -1.5;

      const path: PathWaypoint[] = [];

      let startRackForSaiGon = (startRackNumber != null && startRackNumber > 0)
        ? rackPositions.find(r => r.rackNumber === startRackNumber)
        : null;

      let startAisleZ = 0;
      if (startRackNumber === 1 && features?.rack1Pos) {
        startAisleZ = features.rack1Pos[2] + 2.0;
      } else if (startRackForSaiGon) {
        startAisleZ = startRackForSaiGon.z + 2.0;
      }

      if (startRackNumber === -1) {
        path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, frontOfDeskZ), msg: 'Xuất phát từ quầy thủ thư' });
      } else if (startRackNumber === 1 || startRackForSaiGon) {
        path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, startAisleZ), msg: `Bắt đầu từ lối đi kệ số ${startRackNumber}` });
      } else {
        const startX = -31.6;
        const startZ = rack2.z + 10;
        path.push({ pos: new THREE.Vector3(startX, 0.05, startZ), msg: 'Cửa ra vào' });
        path.push({ pos: new THREE.Vector3(startX, 0.05, frontOfDeskZ), msg: 'Tiến vào sảnh chính' });
        path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, frontOfDeskZ), msg: 'Tránh quầy thủ thư, rẽ vào hành lang' });
      }

      path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, aisleZ), msg: `Đi thẳng dọc hành lang tới kệ số ${highlightRack}` });
      path.push({ pos: new THREE.Vector3(shelfX, 0.05, aisleZ), msg: `Tới vị trí sách cần tìm!` });
      return path;
    } else {
      const rack13 = rackPositions.find(r => r.rackNumber === 13);
      if (!rack13) return null;
      const bookshelfEntryX = -1.5;
      
      let startZVal = 2; // Default
      if (startRackNumber === -1) {
        startZVal = features?.deskPos ? features.deskPos[2] : -22;
      } else {
        startZVal = features?.entrancePos ? features.entrancePos[2] : 26;
      }

      let libraryGapZ = aisleZ;
      const lowRacks = customFeatures.filter(f => f.type === 'low_rack');
      if (lowRacks.length > 0) {
        const ranges = lowRacks.map(f => {
          const halfLen = (f.length || 0) / 2;
          return { start: f.pos_z - halfLen, end: f.pos_z + halfLen };
        });
        ranges.sort((a, b) => a.start - b.start);
        const merged = [ranges[0]];
        for (let i = 1; i < ranges.length; i++) {
          const last = merged[merged.length - 1];
          if (ranges[i].start <= last.end + 0.1) {
            last.end = Math.max(last.end, ranges[i].end);
          } else {
            merged.push(ranges[i]);
          }
        }
        
        let candidates: number[] = [];
        if (merged.length > 1) {
          for (let i = 0; i < merged.length - 1; i++) {
            candidates.push((merged[i].end + merged[i+1].start) / 2);
          }
        } else {
          candidates = [startZVal, aisleZ];
          for (let i = 0; i < merged.length; i++) {
            candidates.push(merged[i].start - 1.0);
            candidates.push(merged[i].end + 1.0);
          }
        }
        
        candidates = candidates.filter(c => !merged.some(r => c >= r.start - 0.5 && c <= r.end + 0.5));
        
        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            const costA = Math.abs(a - startZVal) + Math.abs(a - aisleZ);
            const costB = Math.abs(b - startZVal) + Math.abs(b - aisleZ);
            if (Math.abs(costA - costB) < 0.1) {
              return Math.abs(a - aisleZ) - Math.abs(b - aisleZ);
            }
            return costA - costB;
          });
          libraryGapZ = candidates[0];
        }
      }

      const path: PathWaypoint[] = [];

      if (startRackNumber === -1) {
        const deskX = features?.deskPos ? features.deskPos[0] : -40.5;
        const deskZ = features?.deskPos ? features.deskPos[2] : -22;

        path.push({ pos: new THREE.Vector3(deskX, 0.05, deskZ), msg: 'Xuất phát từ quầy thủ thư' });
        path.push({ pos: new THREE.Vector3(deskX, 0.05, libraryGapZ), msg: 'Đi thẳng dọc theo hành lang chính' });
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, libraryGapZ), msg: 'Rẽ vào hành lang giữa kệ và bàn ghế' });
      } else if (startRack) {
        const startAisleZ = startRack.z + 2.0;
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, startAisleZ), msg: `Bắt đầu từ lối đi kệ số ${startRackNumber}` });
      } else {
        const startX = features?.entrancePos ? features.entrancePos[0] : -40.5;
        const startZ = features?.entrancePos ? features.entrancePos[2] : 26;
        path.push({ pos: new THREE.Vector3(startX, 0.05, startZ), msg: 'Bắt đầu từ cửa vào' });
        path.push({ pos: new THREE.Vector3(startX, 0.05, libraryGapZ), msg: 'Đi thẳng vào sảnh trung tâm' });
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, libraryGapZ), msg: 'Rẽ vào hành lang kệ sách' });
      }

      path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, aisleZ), msg: `Tới lối đi của kệ số ${highlightRack}` });
      path.push({ pos: new THREE.Vector3(shelfX, 0.05, aisleZ), msg: `Rẽ vào lối đi, tới vị trí sách!` });
      return path;
    }
  }, [campus, highlightRack, highlightBay, highlightFace, rackPositions, startRackNumber, sequentialRacks, customShelves, features, customFeatures]);

  useEffect(() => {
    if (onPathCalculated) {
      onPathCalculated(pathWaypoints);
    }
  }, [pathWaypoints, onPathCalculated]);

  return (
    <BookshelfMergedContainer>
      {(SideWood, FloorWood, DividerWood) => (
        <group>
          {rackPositions.map((rp) => {
            if (rp.shelves.some(s => s.positionX != null && s.positionZ != null)) return null;
            return (
              <group key={rp.rackNumber} position={[rp.x, 0, rp.z]}>
                <Rack SideWood={SideWood} FloorWood={FloorWood} DividerWood={DividerWood} rackNumber={rp.rackNumber} isHighlighted={rp.rackNumber === highlightRack} bays={rp.bays} shelves={rp.shelves} onBayClick={onBayClick} campus={campus} isAdminMode={isAdminMode} />
              </group>
            );
          })}

      {features && (
        <>
          {features.rack1Pos && (
            <group position={features.rack1Pos}>
              <Rack rackNumber={1} isHighlighted={false} bays={[1, 2, 3, 4, 5]} shelves={[]} campus={campus} />
            </group>
          )}
          {features.deskPos && <LibrarianDesk position={features.deskPos} />}
          <EntranceArea position={features.entrancePos} isDouble={campus === 'Thu Duc'} />
          {campus === 'Thu Duc' && features.lowRackPositions && features.lowRackPositions.map((item: any, i) => (
            <LowDisplayRack key={i} position={item.pos} length={item.length} />
          ))}
          <FurnitureInstances aislePositions={features.aislePositions} wallRowPositions={features.wallRowPositions} />
          {pathWaypoints && <Line points={pathWaypoints.map(p => p.pos)} color="#3498db" lineWidth={4} dashed={true} dashSize={0.5} dashScale={1} gapSize={0.2} />}
        </>
      )}

      {customBays.map((cbay) => {
        const rack = racks.find(r => r.rackNumber === cbay.rackNumber);
        const rackBays = rack?.shelves.map(s => s.bay).filter((v, idx, arr) => arr.indexOf(v) === idx).sort((a, b) => a - b) ?? [];
        const bayIdx = rackBays.indexOf(cbay.bay) + 1;
        
        const dbColor = rack?.shelves.find(s => s.color)?.color;
        let mats;
        if (dbColor) {
          const colorObj = new THREE.Color(dbColor);
          const hlColor = colorObj.clone().multiplyScalar(1.2);
          const hoverColor = colorObj.clone().multiplyScalar(1.1);
          mats = {
            normal: new THREE.MeshLambertMaterial({ color: colorObj, emissive: colorObj, emissiveIntensity: 0.22 }),
            hl: new THREE.MeshLambertMaterial({ color: hlColor, emissive: colorObj, emissiveIntensity: 0.65 }),
            hover: new THREE.MeshLambertMaterial({ color: hoverColor, emissive: colorObj, emissiveIntensity: 0.35 }),
          };
        } else {
          mats = getRackMats(cbay.rackNumber);
        }
        
        const mat = (highlightRack === cbay.rackNumber && highlightBay === cbay.bay) ? mats.hl : mats.normal;
        const maxCbayActiveFloor = (() => {
          let maxF = 0;
          cbay.shelves.forEach(s => {
            const hFloors = s.hiddenFloors || [];
            const hiddenSet = new Set(hFloors);
            for (let f = 1; f <= 9; f++) {
              if (!hiddenSet.has(f)) {
                if (f > maxF) maxF = f;
              }
            }
          });
          return maxF || 5;
        })();
        const cbayLabelY = maxCbayActiveFloor - 0.5;

        return (
          <group key={`cbay-${cbay.rackNumber}-${cbay.bay}`} position={[cbay.positionX, 0, cbay.positionZ]}>
            <group position={[1.65, 0, -0.49]}>
              <group position={[-1.65, 0, 0.49]}>
                <Bay SideWood={SideWood} FloorWood={FloorWood} DividerWood={DividerWood} bayIndex={cbay.bay} bayIdx={bayIdx || undefined} totalBays={rack?.bays.length || 1} mat={mat} rackNumber={cbay.rackNumber} shelves={cbay.shelves} campus={campus} isAdminMode={isAdminMode} onBayClick={onBayClick} overrideOffsetX={0} />
                {bayIdx === 1 && (
                  <group position={[0.05, cbayLabelY, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
                    <mesh geometry={cbayLabelBgGeo} material={rackLabelBgMat} />
                    <mesh position={[0, 0, 0.005]} geometry={cbayLabelFgGeo} material={rackLabelFgMat} />
                    <Text position={[0, 0, 0.01]} fontSize={0.24} color="#1e1b4b" fontWeight="800" anchorX="center" anchorY="middle">{`${cbay.rackNumber}`}</Text>
                  </group>
                )}
              </group>
            </group>
          </group>
        );
      })}

      {(!isAdminMode || adminSubMode === 'add') && (
        <AdminGrid visible={!!isAdminMode} onAddRackAt={onAddRackAt} racks={racks} campus={campus} />
      )}
      {campus === 'Thu Duc' && (
        <FeatureGrid visible={!!isAdminMode && adminSubMode === 'features'} campus={campus} existingFeatures={customFeatures} onAddFeatureAt={onAddFeatureAt} isAdminMode={isAdminMode} adminSubMode={adminSubMode} onFeatureClick={onFeatureClick} rackPositions={rackPositions} />
      )}
      {markerPos && <HighlightMarker position={markerPos} height={highlightShelfHeight} />}
        </group>
      )}
    </BookshelfMergedContainer>
  );
}
