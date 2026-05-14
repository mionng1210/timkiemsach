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
  mat,
  rackNumber,
  shelves,
  onBayClick,
  campus,
  isAdminMode,
  overrideOffsetX,
}: {
  bayIndex: number;
  mat: THREE.Material;
  rackNumber: number;
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  campus: string;
  isAdminMode?: boolean;
  overrideOffsetX?: number;
}) {
  const offsetX = overrideOffsetX !== undefined ? overrideOffsetX : (campus === 'Thu Duc' ? (bayIndex - 3.5) * 3 : (bayIndex - 2) * 3);

  // Tìm thông tin sách cho mặt trước và mặt sau của khoang này
  const face1Shelf = shelves.find(s => s.bay === bayIndex && s.face === 1);
  const face2Shelf = shelves.find(s => s.bay === bayIndex && s.face === 2);

  const getThuDucLabel = (idx: number, face: number) => {
    if (face === 1) {
      // Mặt trước: 1(Trái)->A, ..., 6(Phải)->F
      return String.fromCharCode(64 + idx);
    } else {
      // Mặt sau (U-shape): 6(Phải mặt trước = Trái mặt sau)->G, ..., 1(Trái mặt trước = Phải mặt sau)->L
      return String.fromCharCode(64 + (13 - idx));
    }
  };

  const displayCode1 = face1Shelf ? face1Shelf.code.toUpperCase() : (campus === 'Thu Duc' ? getThuDucLabel(bayIndex, 1) : `BAY ${bayIndex}`);
  const displayCode2 = face2Shelf ? face2Shelf.code.toUpperCase() : (campus === 'Thu Duc' ? getThuDucLabel(bayIndex, 2) : `BAY ${bayIndex}`);

  return (
    <group position={[offsetX, 0, 0]}>
      {/* Kệ vật lý */}
      <mesh geometry={sideGeo} material={mat} position={[0.13, 2.5, -0.49]} />
      <mesh geometry={sideGeo} material={mat} position={[3.17, 2.5, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 0.1, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 1.0, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 2.0, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 3.0, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 4.0, -0.49]} />
      <mesh geometry={floorGeo} material={mat} position={[1.67, 5.0, -0.49]} />
      <mesh geometry={dividerGeo} material={mat} position={[1.67, 0.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={mat} position={[1.67, 1.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={mat} position={[1.67, 2.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={mat} position={[1.67, 3.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={dividerGeo} material={mat} position={[1.67, 4.3, -0.49]} rotation={[Math.PI / 2, 0, 0]} />

      {/* Biển báo tên dãy mặt trước (Face 1) */}
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

      {/* Biển báo tên dãy mặt sau (Face 2) */}
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
      <mesh
        geometry={clickGeo}
        material={clickMat}
        position={[1.65, 2.5, -0.1]}
        onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 1); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      />
      {/* Click zone mặt sau (face=2) */}
      <mesh
        geometry={clickGeo}
        material={clickMat}
        position={[1.65, 2.5, -0.88]}
        onClick={(e) => { e.stopPropagation(); onBayClick?.(rackNumber, bayIndex, 2); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'default'; }}
      />
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
  const mat = isHighlighted ? woodMatHL : hovered ? woodMatHover : woodMat;

  const face1Shelves = shelves.filter(s => s.face === 1);
  const face2Shelves = shelves.filter(s => s.face === 2);
  const code1 = face1Shelves.length > 0 ? face1Shelves[0].code.toUpperCase() : '';
  const code2 = face2Shelves.length > 0 ? face2Shelves[0].code.toUpperCase() : '';

  const minBay = bays.length > 0 ? Math.min(...bays) : 1;
  const maxBay = bays.length > 0 ? Math.max(...bays) : 5;
  const centerBay = (minBay + maxBay) / 2;
  const centerX = (centerBay - 2) * 3 + 1.65;

  const labelX = campus === 'Thu Duc' ? -7.45 : -2.95;

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {bays.map((b) => (
        <Bay key={b} bayIndex={b} mat={mat} rackNumber={rackNumber} shelves={shelves} onBayClick={onBayClick} campus={campus} isAdminMode={isAdminMode} />
      ))}

      {/* Nhãn số kệ ở đầu dãy (phía ngoài) - Hình tròn xanh biển, số trắng */}
      <group position={[labelX, 4.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Tấm bảng nền hình tròn */}
        <mesh>
          <circleGeometry args={[0.28, 32]} />
          <meshBasicMaterial color="#4f46e5" />
        </mesh>
        <mesh position={[0, 0, 0.005]}>
          <circleGeometry args={[0.24, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Chữ số kệ */}
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.24}
          color="#1e1b4b"
          fontWeight="800"
          anchorX="center"
          anchorY="middle"
        >
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

function AdminGridCell({ cx, cz, onClick }: { cx: number, cz: number, onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <mesh
      position={[cx + 1.65, 0.05, cz - 0.49]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <planeGeometry args={[3.0, 1.0]} />
      <meshBasicMaterial
        color={hovered ? "#4caf50" : "#3498db"}
        transparent
        opacity={hovered ? 0.6 : 0.15}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
      {/* Viền cho ô grid */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(3.0, 1.0)]} />
        <lineBasicMaterial color={hovered ? "#2e7d32" : "#2980b9"} opacity={0.4} transparent />
      </lineSegments>
    </mesh>
  );
}

function AdminGrid({ onAddRackAt }: { onAddRackAt?: (x: number, z: number) => void }) {
  const cols = Array.from({ length: 30 }, (_, i) => i - 22); // -22 to 7 (cx: -66 to 21)
  const rows = Array.from({ length: 40 }, (_, i) => i - 20); // -20 to 19 (cz: -40 to 38)

  return (
    <group position={[0, 0.01, 0]}>
      {cols.map(col => (
        rows.map(row => {
          const cx = col * 3;
          const cz = row * 2;
          return (
            <AdminGridCell key={`${col}-${row}`} cx={cx} cz={cz} onClick={() => onAddRackAt?.(cx, cz)} />
          );
        })
      ))}
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
      <instancedMesh ref={tableHRef} args={[undefined, undefined, aislePositions.length]} frustumCulled={false}>
        <boxGeometry args={[8, 0.05, 1.2]} />
        <meshLambertMaterial color="#8b4513" />
      </instancedMesh>
      <instancedMesh ref={tableVRef} args={[undefined, undefined, wallRowPositions.length]} frustumCulled={false}>
        <boxGeometry args={[1.2, 0.05, 8]} />
        <meshLambertMaterial color="#8b4513" />
      </instancedMesh>
      <instancedMesh ref={chairRef} args={[undefined, undefined, totalChairs]} frustumCulled={false}>
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
    const sorted = [...sequentialRacks].sort((a, b) => {
      if (campus === 'Thu Duc') return b.rackNumber - a.rackNumber;
      return a.rackNumber - b.rackNumber;
    });
    return sorted.map((rack, index) => {
      const totalRacks = sorted.length;
      return {
        rackNumber: rack.rackNumber,
        bays: rack.bays,
        shelves: rack.shelves,
        x: campus === 'Thu Duc' ? -4.5 : 0,
        z: -(index - totalRacks / 2) * ROW_SPACING_Z,
      };
    });
  }, [sequentialRacks, campus]);

  const markerPos = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;
    const rp = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!rp) return null;
    const bayLocalX = campus === 'Thu Duc' ? (highlightBay - 3.5) * 3 + 1.65 : (highlightBay - 2) * 3 + 1.65;
    const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
    return new THREE.Vector3(rp.x + bayLocalX, 2.5, rp.z + faceLocalZ);
  }, [highlightRack, highlightBay, highlightFace, rackPositions]);

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
        deskPos: [-15, 0, rack2.z + 10] as [number, number, number],
        entrancePos: [-34.6, 0, rack2.z + 10] as [number, number, number],
        rack1Pos: [0, 0, rack2.z + 4] as [number, number, number],
        aislePositions: aisleZs.flatMap(z => [
          [-20, 0, z] as [number, number, number],
          [-10, 0, z] as [number, number, number]
        ]),
        wallRowPositions: aisleZs.map(z => [-34.6, 0, z] as [number, number, number])
      };
    } else {
      // Thủ Đức Campus: "ngang hàng với dãy 10 nhưng khoảng cách bằng 2,5 bộ bàn ghế"
      const rack1 = rackPositions.find(r => r.rackNumber === 1);
      const rack13 = rackPositions.find(r => r.rackNumber === 13);
      if (!rack1 || !rack13) return null;

      return {
        deskPos: [-52.5, 0, rack1.z] as [number, number, number],
        entrancePos: [-52.5, 0, rack13.z] as [number, number, number],
        rack1Pos: null,
        aislePositions: [
          // Khu vực giữa kệ và quầy (8 bộ)
          [-23, 0, 24] as [number, number, number], [-35, 0, 24] as [number, number, number],
          [-23, 0, 18] as [number, number, number], [-35, 0, 18] as [number, number, number],
          [-23, 0, -8] as [number, number, number], [-35, 0, -8] as [number, number, number],
          [-23, 0, -16] as [number, number, number], [-35, 0, -16] as [number, number, number],

          // Khu vực phía bên trái quầy thủ thư (16 bộ) - Căn đối khoảng cách 17.5m từ quầy
          [-70, 0, 24] as [number, number, number], [-82, 0, 24] as [number, number, number], [-94, 0, 24] as [number, number, number], [-106, 0, 24] as [number, number, number],
          [-70, 0, 18] as [number, number, number], [-82, 0, 18] as [number, number, number], [-94, 0, 18] as [number, number, number], [-106, 0, 18] as [number, number, number],
          [-70, 0, -8] as [number, number, number], [-82, 0, -8] as [number, number, number], [-94, 0, -8] as [number, number, number], [-106, 0, -8] as [number, number, number],
          [-70, 0, -16] as [number, number, number], [-82, 0, -16] as [number, number, number], [-94, 0, -16] as [number, number, number], [-106, 0, -16] as [number, number, number]
        ],
        wallRowPositions: [],
        lowRackPositions: [
          { pos: [-15, 0, (30 + 14) / 2], length: 16 },
          { pos: [-15, 0, (6 - 26) / 2], length: 32 }
        ]
      };
    }
  }, [campus, rackPositions]);

  // Tạo đường dẫn tới kệ đang được highlight
  const pathWaypoints = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    // Check if it's a custom shelf first
    const customShelf = customShelves.find(s => s.rackNumber === highlightRack && s.bay === highlightBay && s.face === highlightFace);
    if (customShelf) {
      let aisleZ = highlightFace === 1 ? customShelf.positionZ! + 2.0 : customShelf.positionZ! - 3.0;

      // Ở Thủ Đức, kệ custom được xoay 180 độ nên mặt trước và mặt sau ngược hướng
      if (campus === 'Thu Duc') {
        aisleZ = highlightFace === 1 ? customShelf.positionZ! - 3.0 : customShelf.positionZ! + 2.0;
      }

      const shelfX = customShelf.positionX!;

      const path: PathWaypoint[] = [];
      path.push({ pos: new THREE.Vector3(0, 0.05, 0), msg: 'Xuất phát' }); // Placeholder start
      path.push({ pos: new THREE.Vector3(shelfX, 0.05, aisleZ), msg: `Tới kệ tùy chỉnh` });
      return path;
    }

    const targetRack = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!targetRack) return null;

    const aisleZ = highlightFace === 1 ? targetRack.z + 2.0 : targetRack.z - 3.0;
    const shelfX = targetRack.x + (campus === 'Thu Duc' ? (highlightBay - 3.5) * 3 + 1.65 : (highlightBay - 2) * 3 + 1.65);

    // Tìm vị trí kệ xuất phát (nếu có)
    const startRack = (startRackNumber != null)
      ? rackPositions.find(r => r.rackNumber === startRackNumber)
      : null;

    if (campus === 'Sai Gon') {
      const rack2 = rackPositions.find(r => r.rackNumber === 2);
      if (!rack2) return null;
      const frontOfDeskZ = rack2.z + 7.5;
      const mainCorridorX = -4.5;

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
        const startX = -34.6;
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
      const bookshelfEntryX = -13.5;
      const libraryGapZ = 10;

      const path: PathWaypoint[] = [];

      if (startRackNumber === -1) {
        // Từ quầy thủ thư Thủ Đức
        const deskX = features?.deskPos ? features.deskPos[0] : -52.5;
        const deskZ = features?.deskPos ? features.deskPos[2] : 0;

        path.push({ pos: new THREE.Vector3(deskX, 0.05, deskZ), msg: 'Xuất phát từ quầy thủ thư' });
        path.push({ pos: new THREE.Vector3(deskX, 0.05, libraryGapZ), msg: 'Đi thẳng dọc theo hành lang chính' });
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, libraryGapZ), msg: 'Rẽ vào giữa 2 thanh chắn trước kệ' });
      } else if (startRack) {
        // Bắt đầu từ kệ checkpoint
        const startAisleZ = startRack.z + 2.0;
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, startAisleZ), msg: `Bắt đầu từ lối đi kệ số ${startRackNumber}` });
      } else {
        // Bắt đầu từ thang máy
        const startX = -52.5;
        const startZ = rack13.z;
        path.push({ pos: new THREE.Vector3(startX, 0.05, startZ), msg: 'Bắt đầu từ thang máy' });
        path.push({ pos: new THREE.Vector3(startX, 0.05, libraryGapZ), msg: 'Bước ra khỏi thang máy và đi thẳng' });
        path.push({ pos: new THREE.Vector3(bookshelfEntryX, 0.05, libraryGapZ), msg: 'Rẽ vào sảnh kệ sách' });
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
      {rackPositions.map((rp) => (
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
      ))}
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
        return (
          <group key={`cbay-${cbay.rackNumber}-${cbay.bay}`} position={[cbay.positionX, 0, cbay.positionZ]}>
            <group position={[1.65, 0, -0.49]} rotation={[0, isThuDuc ? Math.PI : 0, 0]}>
              <group position={[-1.65, 0, 0.49]}>
                <Bay
                  bayIndex={cbay.bay}
                  mat={highlightRack === cbay.rackNumber && highlightBay === cbay.bay ? woodMatHL : woodMat}
                  rackNumber={cbay.rackNumber}
                  shelves={cbay.shelves}
                  campus={campus}
                  isAdminMode={isAdminMode}
                  onBayClick={onBayClick}
                  overrideOffsetX={0}
                />

                {/* Hiển thị nhãn số kệ nếu là khoang đầu tiên (bay === 1) */}
                {cbay.bay === 1 && (
                  <group position={[isThuDuc ? 3.25 : 0.05, 4.5, -0.5]} rotation={[0, isThuDuc ? Math.PI / 2 : -Math.PI / 2, 0]}>
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
      {isAdminMode && <AdminGrid onAddRackAt={onAddRackAt} />}

      {markerPos && <HighlightMarker position={markerPos} />}
    </group>
  );
}
