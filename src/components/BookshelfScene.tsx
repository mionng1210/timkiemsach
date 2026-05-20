import { useMemo, useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { RackInfo, ShelfInfo } from '../types';
import HighlightMarker from './HighlightMarker';

export interface PathWaypoint {
  pos: THREE.Vector3;
  msg: string;
}

interface BookshelfSceneProps {
  racks: RackInfo[];
  campus: string;
  highlightRack: number | null;
  highlightBay: number | null;
  highlightFace: number | null;
  startRackNumber?: number | null;
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  onPathCalculated?: (waypoints: PathWaypoint[] | null) => void;
  isAdminMode?: boolean;
  onAddRackAt?: (x: number, z: number) => void;
}

const ROW_SPACING_Z = 4.0;    // Khoảng cách giữa các kệ (tăng lên để có lối đi rộng hơn)

const sideGeo = new THREE.BoxGeometry(0.1, 5, 1);
const floorGeo = new THREE.BoxGeometry(3, 0.1, 1);
const dividerGeo = new THREE.BoxGeometry(3, 0.05, 0.5);
// Vùng click ẩn cho mỗi mặt bay (trước/sau)
const clickGeo = new THREE.BoxGeometry(3, 5, 0.4);
const clickMat = new THREE.MeshBasicMaterial({ visible: false });

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

// Fallback mặc định (dùng cho rack không xác định)
const woodMat = new THREE.MeshLambertMaterial({ color: '#6b4226' });
const woodMatHL = new THREE.MeshLambertMaterial({
  color: '#b08030',
  emissive: '#3a2500',
  emissiveIntensity: 0.5,
});
const woodMatHover = new THREE.MeshLambertMaterial({
  color: '#8b6030',
  emissive: '#1a1000',
  emissiveIntensity: 0.3,
});

// Bay với click zones cho mặt trước và mặt sau
function Bay({
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

  // Tìm thông tin sách cho mặt trước và mặt sau của khoang này
  const face1Shelf = shelves.find(s => s.bay === bayIndex && s.face === 1);
  const face2Shelf = shelves.find(s => s.bay === bayIndex && s.face === 2);

  const activeIdx = bayIdx !== undefined ? bayIdx : bayIndex;

  const getLabel = (idx: number, face: number) => {
    if (campus === 'Thu Duc') {
      // Thủ Đức: Dạng Z-shape song song
      if (face === 2) {
        return String.fromCharCode(64 + idx);
      } else {
        return String.fromCharCode(64 + totalBays + idx);
      }
    } else {
      // Sài Gòn: Bắt đầu từ mặt trước Bay 1 (face 1) - Dạng U-shape
      if (face === 1) {
        return String.fromCharCode(64 + idx);
      } else {
        return String.fromCharCode(64 + (2 * totalBays - idx + 1));
      }
    }
  };

  const displayCode1 = face1Shelf ? face1Shelf.code.toUpperCase() : `${rackNumber}${getLabel(activeIdx, 1)}`;
  const displayCode2 = face2Shelf ? face2Shelf.code.toUpperCase() : `${rackNumber}${getLabel(activeIdx, 2)}`;

  return (
    <group position={[offsetX, 0, 0]}>
      {/* Kệ vật lý */}
      <mesh geometry={sideGeo} material={activeIdx === 1 ? mat : woodMat} position={[0.13, 2.5, -0.49]} />
      <mesh geometry={sideGeo} material={woodMat} position={[3.17, 2.5, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 0.1, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 1.0, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 2.0, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 3.0, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 4.0, -0.49]} />
      <mesh geometry={floorGeo} material={woodMat} position={[1.67, 5.0, -0.49]} />
      <mesh geometry={dividerGeo} material={woodMat} position={[1.67, 0.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={woodMat} position={[1.67, 1.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={woodMat} position={[1.67, 2.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={woodMat} position={[1.67, 3.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={woodMat} position={[1.67, 4.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Biển báo tên dãy mặt trước (Face 1) */}
      {face1Shelf && (
        <group position={[1.67, 5.0, 0.015]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[0.9, 0.5]} />
            <meshBasicMaterial color="#4f46e5" />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <planeGeometry args={[0.84, 0.44]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Text position={[0, 0, 0.015]} fontSize={0.2} color="#1e1b4b" fontWeight="700" anchorX="center" anchorY="middle" letterSpacing={0.05}>
            {displayCode1}
          </Text>
        </group>
      )}

      {/* Biển báo tên dãy mặt sau (Face 2) */}
      {face2Shelf && (
        <group position={[1.67, 5.0, -0.995]} rotation={[0, Math.PI, 0]}>
          <mesh position={[0, 0, 0]}>
            <planeGeometry args={[0.9, 0.5]} />
            <meshBasicMaterial color="#4f46e5" />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <planeGeometry args={[0.84, 0.44]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <Text position={[0, 0, 0.015]} fontSize={0.2} color="#1e1b4b" fontWeight="700" anchorX="center" anchorY="middle" letterSpacing={0.05}>
            {displayCode2}
          </Text>
        </group>
      )}

      {/* Tem dán Dewey mặt trước (Face 1: hướng +Z) */}
      {face1Shelf && (
        <group position={[1.67, 2.05, 0.015]}>
          <mesh>
            <planeGeometry args={[1.6, 0.3]} />
            <meshBasicMaterial color="#3498db" />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <planeGeometry args={[1.54, 0.24]} />
            <meshBasicMaterial color="white" />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.13} color="#2c3e50" fontWeight="600" anchorX="center" anchorY="middle">
            {`${face1Shelf.deweyStart.toFixed(3)} – ${face1Shelf.deweyEnd.toFixed(3)}`}
          </Text>
        </group>
      )}

      {/* Tem dán Dewey mặt sau (Face 2: hướng -Z) */}
      {face2Shelf && (
        <group position={[1.67, 2.05, -0.995]} rotation={[0, Math.PI, 0]}>
          <mesh>
            <planeGeometry args={[1.6, 0.3]} />
            <meshBasicMaterial color="#3498db" />
          </mesh>
          <mesh position={[0, 0, 0.005]}>
            <planeGeometry args={[1.54, 0.24]} />
            <meshBasicMaterial color="white" />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.13} color="#2c3e50" fontWeight="600" anchorX="center" anchorY="middle">
            {`${face2Shelf.deweyStart.toFixed(3)} – ${face2Shelf.deweyEnd.toFixed(3)}`}
          </Text>
        </group>
      )}

      {/* Click zone mặt trước (face=1) */}
      {(face1Shelf || isAdminMode) && (
        <mesh
          geometry={clickGeo}
          material={clickMat}
          position={[1.65, 2.5, -0.1]}
          onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 1); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        />
      )}
      {/* Click zone mặt sau (face=2) */}
      {(face2Shelf || isAdminMode) && (
        <mesh
          geometry={clickGeo}
          material={clickMat}
          position={[1.65, 2.5, -0.88]}
          onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 2); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { document.body.style.cursor = 'default'; }}
        />
      )}
    </group>
  );
}

function Rack({
  rackNumber,
  isHighlighted,
  bays,
  shelves,
  onBayClick,
  campus,
  isAdminMode,
}: {
  rackNumber: number;
  isHighlighted: boolean;
  bays: number[];
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  campus: string;
  isAdminMode?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const mats = getRackMats(rackNumber);
  const mat = isHighlighted ? mats.hl : hovered ? mats.hover : mats.normal;

  const face1Shelves = shelves.filter(s => s.face === 1);
  const face2Shelves = shelves.filter(s => s.face === 2);
  const code1 = face1Shelves.length > 0 ? face1Shelves[0].code.toUpperCase() : '';
  const code2 = face2Shelves.length > 0 ? face2Shelves[0].code.toUpperCase() : '';

  const minBay = bays.length > 0 ? Math.min(...bays) : 1;
  const maxBay = bays.length > 0 ? Math.max(...bays) : 5;
  const centerBay = (minBay + maxBay) / 2;
  const labelXMin = (minBay - 1) * 3 + 0.05;
  const labelXMax = (maxBay - 1) * 3 + 3.25;

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {bays.map((b, i) => (
        <Bay key={b} bayIndex={b} bayIdx={i + 1} totalBays={bays.length} mat={mat} rackNumber={rackNumber} shelves={shelves} onBayClick={onBayClick} campus={campus} isAdminMode={isAdminMode} />
      ))}

      {/* Nhãn số kệ ở đầu dãy (Trái) */}
      <group position={[labelXMin, 4.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <circleGeometry args={[0.19, 32]} />
          <meshBasicMaterial color="#4f46e5" />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <circleGeometry args={[0.16, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.16} color="#1e1b4b" fontWeight="800" anchorX="center" anchorY="middle">
          {`${rackNumber}`}
        </Text>
      </group>

      {/* Nhãn số kệ ở cuối dãy (Phải) */}
      <group position={[labelXMax, 4.5, -0.5]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <circleGeometry args={[0.19, 32]} />
          <meshBasicMaterial color="#4f46e5" />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <circleGeometry args={[0.16, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.16} color="#1e1b4b" fontWeight="800" anchorX="center" anchorY="middle">
          {`${rackNumber}`}
        </Text>
      </group>
    </group>
  );
}


function LowDisplayRack({ position, length = 6 }: { position: [number, number, number], length?: number }) {
  return (
    <group position={position}>
      {/* Thân kệ gỗ thấp (Brown) */}
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[1.2, 1.2, length]} />
        <meshLambertMaterial color="#a67c52" />
      </mesh>
      {/* Tấm lưng kệ (White) */}
      <mesh position={[0.56, 0.6, 0]}>
        <boxGeometry args={[0.1, 1.1, length - 0.2]} />
        <meshLambertMaterial color="#f5f6fa" />
      </mesh>
      {/* Các tầng kệ chưng bày */}
      {[0.2, 0.55, 0.9].map((y, i) => (
        <mesh key={i} position={[0.2, y, 0]}>
          <boxGeometry args={[0.7, 0.05, length - 0.2]} />
          <meshLambertMaterial color="#dcdde1" />
        </mesh>
      ))}
      {/* Khung chứng nhận trên kệ - Lặp lại dọc theo chiều dài nếu cần */}
      {[-(length / 4), (length / 4)].map((zOff, i) => (
        <group key={i} position={[0.2, 1.4, zOff]} rotation={[0, -0.3, 0]}>
          <mesh>
            <boxGeometry args={[0.05, 0.4, 0.6]} />
            <meshLambertMaterial color="#f1c40f" />
          </mesh>
          <mesh position={[0.03, 0, 0]}>
            <planeGeometry args={[0.5, 0.3]} />
            <meshBasicMaterial color="white" />
          </mesh>
        </group>
      ))}
    </group>
  );
}


function LibrarianDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Mặt bàn dài khớp với 2 hàng bàn ghế (độ dài 18) */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[18, 0.1, 2]} />
        <meshLambertMaterial color="#8b4513" />
      </mesh>
      {/* Chân bàn */}
      <mesh position={[-8.8, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.8, 1.8]} />
        <meshLambertMaterial color="#5d2e0a" />
      </mesh>
      <mesh position={[8.8, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.8, 1.8]} />
        <meshLambertMaterial color="#5d2e0a" />
      </mesh>
      {/* Thêm chân giữa */}
      <mesh position={[-3, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.8, 1.8]} />
        <meshLambertMaterial color="#5d2e0a" />
      </mesh>
      <mesh position={[3, 0.4, 0]}>
        <boxGeometry args={[0.2, 0.8, 1.8]} />
        <meshLambertMaterial color="#5d2e0a" />
      </mesh>
      {/* 4 Ghế thủ thư */}
      {[-6, -2, 2, 6].map((xOffset, idx) => (
        <mesh key={idx} position={[xOffset, 0.45, 1.2]}>
          <boxGeometry args={[0.8, 0.9, 0.8]} />
          <meshLambertMaterial color="#2c3e50" />
        </mesh>
      ))}
      {/* Biển hiệu */}
      <group position={[0, 1.2, 1.05]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[6, 0.6, 0.1]} />
          <meshBasicMaterial color="#34495e" />
        </mesh>
        <Text
          position={[0, 0, 0.06]}
          fontSize={0.35}
          color="white"
          fontWeight="bold"
          anchorX="center"
          anchorY="middle"
        >
          QUẦY THỦ THƯ
        </Text>
      </group>
    </group>
  );
}

function EntranceArea({ position, isDouble = false }: { position: [number, number, number], isDouble?: boolean }) {
  return (
    <group position={position}>
      {/* Khung cửa */}
      <mesh position={[isDouble ? -1.5 : 0, 2.5, 0]}>
        <boxGeometry args={[3, 5, 0.2]} />
        <meshLambertMaterial color="#d1d8e0" transparent opacity={0.4} />
      </mesh>
      {isDouble && (
        <mesh position={[1.5, 2.5, 0]}>
          <boxGeometry args={[3, 5, 0.2]} />
          <meshLambertMaterial color="#d1d8e0" transparent opacity={0.4} />
        </mesh>
      )}

      {/* Khung viền cửa */}
      <mesh position={[isDouble ? -3.0 : -1.5, 2.5, 0.05]}>
        <boxGeometry args={[0.2, 5, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      <mesh position={[isDouble ? 3.0 : 1.5, 2.5, 0.05]}>
        <boxGeometry args={[0.2, 5, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      <mesh position={[0, 5, 0.05]}>
        <boxGeometry args={[isDouble ? 6.2 : 3.2, 0.2, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      {/* Nhãn lối ra vào */}
      <group position={[0, 5.5, 0]}>
        <Text
          fontSize={isDouble ? 0.8 : 0.6}
          color="#e67e22"
          fontWeight="bold"
          anchorX="center"
        >
          CỬA RA VÀO
        </Text>
      </group>
    </group>
  );
}

function AdminGrid({ onAddRackAt, visible, racks, campus }: { onAddRackAt?: (x: number, z: number) => void, visible: boolean, racks: RackInfo[], campus: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hoverPos, setHoverPos] = useState<[number, number] | null>(null);

  const instances = useMemo(() => {
    const data = [];

    // Grid settings: 10 bays (x: 0 to 27), 50 rows (z)
    const numBays = 10;
    const numRows = 50;

    // We use the same Z formula as the sequential racks to stay aligned with the library floor
    // Thu Duc has 13 sequential racks (1-13), center is 6.5
    // Sai Gon has 12 sequential racks (2-13), center is 6.0
    const zOffset = campus === 'Thu Duc' ? 6.5 : 17.0;

    for (let col = 0; col < numBays; col++) {
      for (let row = 0; row < numRows; row++) {
        const cx = col * 3.0;
        // Thủ Đức: Z tăng dần (theo hướng vào sâu thư viện)
        // Sài Gòn: Z giảm dần
        const cz = campus === 'Thu Duc'
          ? (row - zOffset) * 4.0
          : -(row - zOffset) * 4.0;

        data.push({ cx, cz, col, row });
      }
    }

    return data;
  }, []);

  const total = instances.length;

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
  }, [instances]);

  // Khi bật visible, cần tính lại bounding sphere để raycasting hoạt động
  useEffect(() => {
    if (visible && meshRef.current) {
      meshRef.current.computeBoundingSphere();
    }
  }, [visible]);

  return (
    <group visible={visible}>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, total]}
        frustumCulled={false}
        onClick={(e) => {
          if (!visible) return;
          e.stopPropagation();
          if (e.instanceId !== undefined) {
            const inst = instances[e.instanceId];
            onAddRackAt?.(inst.cx, inst.cz);
          }
        }}
        onPointerMove={(e) => {
          if (!visible) return;
          e.stopPropagation();
          if (e.instanceId !== undefined) {
            const inst = instances[e.instanceId];
            setHoverPos([inst.cx, inst.cz]);
            document.body.style.cursor = 'pointer';
          }
        }}
        onPointerOut={() => {
          if (!visible) return;
          setHoverPos(null);
          document.body.style.cursor = 'default';
        }}
      >
        <planeGeometry args={[3.0, 1.0]} />
        <meshBasicMaterial
          color="#3498db"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </instancedMesh>

      {/* Ô highlight khi hover */}
      {hoverPos && visible && (
        <mesh position={[hoverPos[0] + 1.65, 0.06, hoverPos[1] - 0.49]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.0, 1.0]} />
          <meshBasicMaterial color="#4caf50" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// Dùng InstancedMesh thuần Three.js để render toàn bộ bàn ghế trong 3 draw calls duy nhất
function FurnitureInstances({
  aislePositions,
  wallRowPositions,
}: {
  aislePositions: [number, number, number][];
  wallRowPositions: [number, number, number][];
}) {
  const tableHRef = useRef<THREE.InstancedMesh>(null);
  const tableVRef = useRef<THREE.InstancedMesh>(null);
  const chairRef = useRef<THREE.InstancedMesh>(null);

  // Tính tổng số instance cần thiết
  const chairOffsets = [-2.8, 0, 2.8];
  const aisleChairsPerSet = chairOffsets.length * 2; // 2 hàng mỗi bộ
  const wallChairsPerSet = chairOffsets.length;       // 1 hàng mỗi bộ
  const totalTables = aislePositions.length + wallRowPositions.length;
  const totalChairs = aislePositions.length * aisleChairsPerSet + wallRowPositions.length * wallChairsPerSet;

  useEffect(() => {
    const mat = new THREE.Matrix4();
    const dummy = new THREE.Object3D();

    // --- Bàn ngang (aislePositions) + Bàn dọc (wallRowPositions) ---
    // Bàn ngang (tableH): chỉ aislePositions
    if (tableHRef.current) {
      aislePositions.forEach((pos, i) => {
        dummy.position.set(pos[0], pos[1] + 0.75, pos[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tableHRef.current!.setMatrixAt(i, dummy.matrix);
      });
      tableHRef.current.instanceMatrix.needsUpdate = true;
    }

    // Bàn dọc (tableV): chỉ wallRowPositions
    if (tableVRef.current) {
      wallRowPositions.forEach((pos, i) => {
        dummy.position.set(pos[0], pos[1] + 0.75, pos[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        tableVRef.current!.setMatrixAt(i, dummy.matrix);
      });
      tableVRef.current.instanceMatrix.needsUpdate = true;
    }

    // --- Ghế ---
    if (chairRef.current) {
      let ci = 0;
      aislePositions.forEach((pos) => {
        chairOffsets.forEach((xOff) => {
          dummy.position.set(pos[0] + xOff, pos[1] + 0.4, pos[2] + 0.85);
          dummy.updateMatrix();
          chairRef.current!.setMatrixAt(ci++, dummy.matrix);
          dummy.position.set(pos[0] + xOff, pos[1] + 0.4, pos[2] - 0.85);
          dummy.updateMatrix();
          chairRef.current!.setMatrixAt(ci++, dummy.matrix);
        });
      });
      wallRowPositions.forEach((pos) => {
        chairOffsets.forEach((zOff) => {
          dummy.position.set(pos[0] + 0.85, pos[1] + 0.4, pos[2] + zOff);
          dummy.updateMatrix();
          chairRef.current!.setMatrixAt(ci++, dummy.matrix);
        });
      });
      chairRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [aislePositions, wallRowPositions]);

  if (totalTables === 0) return null;

  return (
    <>
      <instancedMesh ref={tableHRef} args={[undefined, undefined, aislePositions.length]}>
        <boxGeometry args={[8, 0.05, 1.2]} />
        <meshLambertMaterial color="#8b4513" />
      </instancedMesh>
      <instancedMesh ref={tableVRef} args={[undefined, undefined, wallRowPositions.length]}>
        <boxGeometry args={[1.2, 0.05, 8]} />
        <meshLambertMaterial color="#8b4513" />
      </instancedMesh>
      <instancedMesh ref={chairRef} args={[undefined, undefined, totalChairs]}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshLambertMaterial color="#2c3e50" />
      </instancedMesh>
    </>
  );
}

export default function BookshelfScene({
  racks,
  campus,
  highlightRack,
  highlightBay,
  highlightFace,
  startRackNumber,
  onBayClick,
  onPathCalculated,
  isAdminMode,
  onAddRackAt,
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

  const markerPos = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    // Check custom shelves first
    const customShelf = customShelves.find(s => s.rackNumber === highlightRack && s.bay === highlightBay && s.face === highlightFace);
    if (customShelf) {
      const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
      return new THREE.Vector3(customShelf.positionX! + 1.65, 2.5, customShelf.positionZ! + faceLocalZ);
    }

    const rp = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!rp) return null;
    const bayLocalX = (highlightBay - 1) * 3 + 1.65;
    const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
    return new THREE.Vector3(rp.x + bayLocalX, 2.5, rp.z + faceLocalZ);
  }, [highlightRack, highlightBay, highlightFace, rackPositions, customShelves, campus]);

  // Tìm vị trí kệ số 2 để đặt các khu vực chức năng (chỉ cho Sài Gòn)
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
      // Thủ Đức Campus: "ngang hàng với dãy 10 nhưng khoảng cách bằng 2,5 bộ bàn ghế"
      const rack1 = rackPositions.find(r => r.rackNumber === 1);
      const rack13 = rackPositions.find(r => r.rackNumber === 13);
      if (!rack1 || !rack13) return null;

      return {
        deskPos: [-40.5, 0, -22] as [number, number, number],
        entrancePos: [-40.5, 0, 26] as [number, number, number],
        rack1Pos: null,
        aislePositions: [
          // Khu vực giữa kệ và quầy (8 bộ)
          [-11, 0, 16] as [number, number, number], [-23, 0, 16] as [number, number, number],
          [-11, 0, 8] as [number, number, number], [-23, 0, 8] as [number, number, number],
          [-11, 0, -4] as [number, number, number], [-23, 0, -4] as [number, number, number],
          [-11, 0, -12] as [number, number, number], [-23, 0, -12] as [number, number, number],

          // Khu vực phía bên trái quầy thủ thư (16 bộ)
          [-58, 0, 16] as [number, number, number], [-70, 0, 16] as [number, number, number], [-82, 0, 16] as [number, number, number], [-94, 0, 16] as [number, number, number],
          [-58, 0, 8] as [number, number, number], [-70, 0, 8] as [number, number, number], [-82, 0, 8] as [number, number, number], [-94, 0, 8] as [number, number, number],
          [-58, 0, -4] as [number, number, number], [-70, 0, -4] as [number, number, number], [-82, 0, -4] as [number, number, number], [-94, 0, -4] as [number, number, number],
          [-58, 0, -12] as [number, number, number], [-70, 0, -12] as [number, number, number], [-82, 0, -12] as [number, number, number], [-94, 0, -12] as [number, number, number]
        ],
        wallRowPositions: [],
        lowRackPositions: [
          { pos: [-3, 0, 12], length: 16 },
          { pos: [-3, 0, -8], length: 16 }
        ]
      };
    }
  }, [campus, rackPositions]);

  // Tạo đường dẫn tới kệ đang được highlight
  const pathWaypoints = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    let aisleZ: number;
    let shelfX: number;

    // Check if it's a custom shelf first
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

    // Tìm vị trí kệ xuất phát (nếu có)
    const startRack = (startRackNumber != null)
      ? rackPositions.find(r => r.rackNumber === startRackNumber)
      : null;

    if (campus === 'Sai Gon') {
      const rack2 = rackPositions.find(r => r.rackNumber === 2);
      if (!rack2) return null;
      const frontOfDeskZ = rack2.z + 7.3; // Giảm độ lệch detour xuống 1/3
      const mainCorridorX = -1.5;

      const path: PathWaypoint[] = [];

      // Tìm kệ xuất phát
      let startRackForSaiGon = (startRackNumber != null && startRackNumber > 0)
        ? rackPositions.find(r => r.rackNumber === startRackNumber)
        : null;

      // Đặc biệt cho Sài Gòn: Kệ 1 không nằm trong rackPositions chính
      let startAisleZ = 0;
      if (startRackNumber === 1 && features?.rack1Pos) {
        startAisleZ = features.rack1Pos[2] + 2.0; // Aisle của kệ 1
      } else if (startRackForSaiGon) {
        startAisleZ = startRackForSaiGon.z + 2.0;
      }

      if (startRackNumber === -1) {
        // Từ quầy thủ thư: bắt đầu ngay tại hành lang trước quầy
        path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, frontOfDeskZ), msg: 'Xuất phát từ quầy thủ thư' });
      } else if (startRackNumber === 1 || startRackForSaiGon) {
        // Bắt đầu từ kệ checkpoint (bao gồm kệ 1)
        path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, startAisleZ), msg: `Bắt đầu từ lối đi kệ số ${startRackNumber}` });
      } else {
        // Bắt đầu từ cửa ra vào
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
      // Thu Duc
      const rack13 = rackPositions.find(r => r.rackNumber === 13);
      if (!rack13) return null;
      const bookshelfEntryX = -1.5; // Hành lang sát các kệ sách
      const libraryGapZ = 2; // Khoảng trống giữa 2 khối bàn ghế

      const path: PathWaypoint[] = [];

      if (startRackNumber === -1) {
        // Từ quầy thủ thư Thủ Đức
        const deskX = features?.deskPos ? features.deskPos[0] : -40.5;
        const deskZ = features?.deskPos ? features.deskPos[2] : -22;

        path.push({ pos: new THREE.Vector3(deskX, 0.05, deskZ), msg: 'Xuất phát từ quầy thủ thư' });
        path.push({ pos: new THREE.Vector3(deskX, 0.05, libraryGapZ), msg: 'Đi thẳng dọc theo hành lang chính' });
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, libraryGapZ), msg: 'Rẽ vào hành lang giữa kệ và bàn ghế' });
      } else if (startRack) {
        // Bắt đầu từ kệ checkpoint
        const startAisleZ = startRack.z + 2.0;
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, startAisleZ), msg: `Bắt đầu từ lối đi kệ số ${startRackNumber}` });
      } else {
        // Bắt đầu từ cửa ra vào (entrance)
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
  }, [campus, highlightRack, highlightBay, highlightFace, rackPositions, startRackNumber, sequentialRacks, customShelves]);

  // Thông báo cho component cha về đường dẫn mới
  useEffect(() => {
    if (onPathCalculated) {
      onPathCalculated(pathWaypoints);
    }
  }, [pathWaypoints, onPathCalculated]);

  return (
    <group>
      {rackPositions.map((rp) => {
        const hasCustomPos = rp.shelves.some(s => s.positionX != null && s.positionZ != null);
        if (hasCustomPos) return null;
        return (
          <group key={rp.rackNumber} position={[rp.x, 0, rp.z]}>
            <Rack
              rackNumber={rp.rackNumber}
              isHighlighted={rp.rackNumber === highlightRack}
              bays={rp.bays}
              shelves={rp.shelves}
              onBayClick={onBayClick}
              campus={campus}
              isAdminMode={isAdminMode}
            />
          </group>
        );
      })}
      {features && (
        <>
          {features.rack1Pos && (
            <group position={features.rack1Pos}>
              <Rack
                rackNumber={1}
                isHighlighted={false}
                bays={[1, 2, 3, 4, 5]}
                shelves={[]}
                campus={campus}
              />
            </group>
          )}

          {features.deskPos && <LibrarianDesk position={features.deskPos} />}
          <EntranceArea position={features.entrancePos} isDouble={campus === 'Thu Duc'} />

          {campus === 'Thu Duc' && features.lowRackPositions && features.lowRackPositions.map((item: any, i) => (
            <LowDisplayRack key={i} position={item.pos} length={item.length} />
          ))}

          {/* Toàn bộ bàn ghế — chỉ 3 draw calls nhờ InstancedMesh */}
          <FurnitureInstances
            key={`furniture-${features.aislePositions.length}-${features.wallRowPositions.length}`}
            aislePositions={features.aislePositions}
            wallRowPositions={features.wallRowPositions}
          />

          {/* Đường dẫn tới kệ sách */}
          {pathWaypoints && (
            <Line
              points={pathWaypoints.map(p => p.pos)}
              color="#3498db"
              lineWidth={4}
              dashed={true}
              dashSize={0.5}
              dashScale={1}
              gapSize={0.2}
            />
          )}
        </>
      )}

      {/* Render custom shelves added via Admin grid */}
      {customBays.map((cbay) => {
        const isThuDuc = campus === 'Thu Duc';
        const rack = racks.find(r => r.rackNumber === cbay.rackNumber);
        const rackBays = rack?.shelves
          .map(s => s.bay)
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .sort((a, b) => a - b) ?? [];
        const bayIdx = rackBays.indexOf(cbay.bay) + 1;
        return (
          <group key={`cbay-${cbay.rackNumber}-${cbay.bay}`} position={[cbay.positionX, 0, cbay.positionZ]}>
            <group position={[1.65, 0, -0.49]}>
              <group position={[-1.65, 0, 0.49]}>
                <Bay
                  bayIndex={cbay.bay}
                  bayIdx={bayIdx || undefined}
                  totalBays={rack?.bays.length || 1}
                  mat={highlightRack === cbay.rackNumber && highlightBay === cbay.bay ? getRackMats(cbay.rackNumber).hl : getRackMats(cbay.rackNumber).normal}
                  rackNumber={cbay.rackNumber}
                  shelves={cbay.shelves}
                  campus={campus}
                  isAdminMode={isAdminMode}
                  onBayClick={onBayClick}
                  overrideOffsetX={0}
                />

                {/* Hiển thị nhãn số kệ nếu là khoang đầu tiên đang có trong dãy */}
                {bayIdx === 1 && (
                  <group position={[0.05, 4.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
                    <mesh>
                      <circleGeometry args={[0.28, 32]} />
                      <meshBasicMaterial color="#4f46e5" />
                    </mesh>
                    <mesh position={[0, 0, 0.005]}>
                      <circleGeometry args={[0.24, 32]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                    <Text
                      position={[0, 0, 0.01]}
                      fontSize={0.24}
                      color="#1e1b4b"
                      fontWeight="800"
                      anchorX="center"
                      anchorY="middle"
                    >
                      {`${cbay.rackNumber}`}
                    </Text>
                  </group>
                )}
              </group>
            </group>
          </group>
        );
      })}

      {/* Grid mode overlay for building */}
      <AdminGrid visible={!!isAdminMode} onAddRackAt={onAddRackAt} racks={racks} campus={campus} />

      {markerPos && <HighlightMarker position={markerPos} />}
    </group>
  );
}
