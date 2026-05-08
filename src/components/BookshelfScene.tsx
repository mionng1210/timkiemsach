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
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
  onPathCalculated?: (waypoints: PathWaypoint[] | null) => void;
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
}: {
  bayIndex: number;
  mat: THREE.Material;
  rackNumber: number;
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
}) {
  const offsetX = (bayIndex - 2) * 3;

  // Tìm thông tin sách cho mặt trước và mặt sau của khoang này
  const face1Shelf = shelves.find(s => s.bay === bayIndex && s.face === 1);
  const face2Shelf = shelves.find(s => s.bay === bayIndex && s.face === 2);

  const displayCode1 = face1Shelf ? face1Shelf.code.toUpperCase() : `BAY ${bayIndex}`;
  const displayCode2 = face2Shelf ? face2Shelf.code.toUpperCase() : `BAY ${bayIndex}`;

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

      {/* Biển báo tên dãy mặt trước (Face 1) dán vào mép kệ trên cùng */}
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

      {/* Biển báo tên dãy mặt sau (Face 2) dán vào mép kệ trên cùng */}
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
}: {
  rackNumber: number;
  isHighlighted: boolean;
  bays: number[];
  shelves: ShelfInfo[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
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

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {bays.map((b) => (
        <Bay key={b} bayIndex={b} mat={mat} rackNumber={rackNumber} shelves={shelves} onBayClick={onBayClick} />
      ))}

      {/* Nhãn số kệ ở đầu dãy (phía ngoài) - Hình tròn xanh biển, số trắng */}
      <group position={[-2.95, 4.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
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
      <group position={[0, 1.2, 0]}>
        <mesh position={[0, 0, -0.9]} rotation={[0, 0, 0]}>
          <boxGeometry args={[3, 0.5, 0.1]} />
          <meshBasicMaterial color="#34495e" />
        </mesh>
        <Text
          position={[0, 0, -0.84]}
          fontSize={0.3}
          color="white"
          anchorX="center"
          anchorY="middle"
        >
          QUẦY THỦ THƯ
        </Text>
      </group>
    </group>
  );
}

function EntranceArea({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Khung cửa */}
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[3, 5, 0.2]} />
        <meshLambertMaterial color="#d1d8e0" transparent opacity={0.4} />
      </mesh>
      {/* Khung viền cửa */}
      <mesh position={[-1.5, 2.5, 0.05]}>
        <boxGeometry args={[0.2, 5, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      <mesh position={[1.5, 2.5, 0.05]}>
        <boxGeometry args={[0.2, 5, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      <mesh position={[0, 5, 0.05]}>
        <boxGeometry args={[3.2, 0.2, 0.3]} />
        <meshLambertMaterial color="#4b6584" />
      </mesh>
      {/* Nhãn lối ra vào */}
      <group position={[0, 5.5, 0]}>
        <Text
          fontSize={0.6}
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
  onBayClick,
  onPathCalculated,
}: BookshelfSceneProps) {
  const rackPositions = useMemo(() => {
    const sorted = [...racks].sort((a, b) => a.rackNumber - b.rackNumber);
    return sorted.map((rack, index) => {
      const totalRacks = sorted.length;
      return {
        rackNumber: rack.rackNumber,
        bays: rack.bays,
        shelves: rack.shelves,
        x: 0,
        z: -(index - totalRacks / 2) * ROW_SPACING_Z,
      };
    });
  }, [racks]);

  const markerPos = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;
    const rp = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!rp) return null;
    const bayLocalX = (highlightBay - 2) * 3 + 1.65;
    const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;
    return new THREE.Vector3(rp.x + bayLocalX, 2.5, rp.z + faceLocalZ);
  }, [highlightRack, highlightBay, highlightFace, rackPositions]);

  // Tìm vị trí kệ số 2 để đặt các khu vực chức năng (chỉ cho Sài Gòn)
  const features = useMemo(() => {
    if (campus !== 'Sai Gon') return null;
    const rack2 = rackPositions.find(r => r.rackNumber === 2);
    if (!rack2) return null;

    // Tính toán các lối đi, bao gồm cả lối đi giữa kệ 1 và kệ 2
    const aisleZs = [
      rack2.z + 2, // Lối đi giữa kệ 1 và kệ 2
      ...rackPositions.slice(0, -1).map((rp, i) => (rp.z + rackPositions[i + 1].z) / 2)
    ];

    // Khoảng cách giảm 1/5 của bàn 10 là 2 đơn vị. 
    // Chúng ta đặt 2 hàng bàn ghế cách nhau 2 đơn vị.
    return {
      deskPos: [-15, 0, rack2.z + 10] as [number, number, number],
      entrancePos: [-34.6, 0, rack2.z + 10] as [number, number, number],
      rack1Pos: [0, 0, rack2.z + 4] as [number, number, number],
      aislePositions: aisleZs.flatMap(z => [
        [-20, 0, z] as [number, number, number], // Hàng bên trái
        [-10, 0, z] as [number, number, number]  // Hàng bên phải
      ]),
      // Hàng bàn ghế sát tường, cách thêm 2 đơn vị (1/5 kích thước cũ)
      wallRowPositions: aisleZs.map(z => [-34.6, 0, z] as [number, number, number])
    };
  }, [campus, rackPositions]);

  // Tạo đường dẫn (path) từ cửa ra vào tới kệ đang được highlight
  const pathWaypoints = useMemo(() => {
    if (campus !== 'Sai Gon' || highlightRack === null || highlightBay === null || highlightFace === null) return null;

    const rack2 = rackPositions.find(r => r.rackNumber === 2);
    if (!rack2) return null;

    const targetRack = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!targetRack) return null;

    // Lối đi trước mặt kệ: face 1 ở phía +Z, face 2 ở phía -Z
    // Vì mặt Face 2 (z = -0.88) nằm sát lối đi hơn so với Face 1 (z = -0.1), ta cần lùi điểm dừng của Face 2 ra xa hơn (-3.0 thay vì -2.0) để camera không bị sát quá.
    const aisleZ = highlightFace === 1 ? targetRack.z + 2.0 : targetRack.z - 3.0;
    const shelfX = targetRack.x + (highlightBay - 2) * 3 + 1.65;

    const startX = -34.6;
    const startZ = rack2.z + 10;

    // Z để đi trước mặt quầy thủ thư
    const frontOfDeskZ = rack2.z + 7.5;
    // Hành lang chính giữa dãy kệ (x=0 tới -3) và dãy bàn học (x=-10 tới -6)
    const mainCorridorX = -4.5;

    const path: PathWaypoint[] = [];
    path.push({ pos: new THREE.Vector3(startX, 0.05, startZ), msg: 'Cửa ra vào' });
    path.push({ pos: new THREE.Vector3(startX, 0.05, frontOfDeskZ), msg: 'Tiến vào sảnh chính' });
    path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, frontOfDeskZ), msg: 'Tránh quầy thủ thư, rẽ vào hành lang' });

    let racksPassed = 0;
    const sortedByZ = [...rackPositions].sort((a, b) => b.z - a.z); // Giảm dần theo Z
    for (const rack of sortedByZ) {
      if (rack.z < frontOfDeskZ && rack.z > aisleZ) {
        racksPassed++;
        if (racksPassed % 2 === 0) {
          path.push({
            pos: new THREE.Vector3(mainCorridorX, 0.05, rack.z),
            msg: `Đang đi ngang qua kệ số ${rack.rackNumber - 1} và ${rack.rackNumber}`
          });
        }
      }
    }

    path.push({ pos: new THREE.Vector3(mainCorridorX, 0.05, aisleZ), msg: `Tới lối đi của kệ số ${highlightRack}` });
    path.push({ pos: new THREE.Vector3(shelfX, 0.05, aisleZ), msg: `Tới vị trí sách cần tìm!` });

    return path;
  }, [campus, highlightRack, highlightBay, highlightFace, rackPositions]);

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
          />
        </group>
      ))}
      {features && (
        <>
          {/* Kệ số 1 - Kệ tĩnh không có dữ liệu */}
          <group position={features.rack1Pos}>
            <Rack
              rackNumber={1}
              isHighlighted={false}
              bays={[1, 2, 3, 4, 5]}
              shelves={[]}
            />
          </group>

          <LibrarianDesk position={features.deskPos} />
          <EntranceArea position={features.entrancePos} />

          {/* Toàn bộ bàn ghế — chỉ 3 draw calls nhờ InstancedMesh */}
          <FurnitureInstances
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
      {markerPos && <HighlightMarker position={markerPos} />}
    </group>
  );
}
