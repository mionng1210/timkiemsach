import { useMemo } from 'react';
import * as THREE from 'three';
import type { RackInfo } from '../types';
import HighlightMarker from './HighlightMarker';

interface BookshelfSceneProps {
  racks: RackInfo[];
  highlightRack: number | null;
  highlightBay: number | null;
  highlightFace: number | null;
}

// Layout thư viện: các dãy kệ song song đi sâu vào trong
const RACKS_PER_COLUMN = 5;   // Số kệ mỗi dãy (đi sâu vào trong theo Z)
const COLUMN_SPACING_X = 10;  // Khoảng cách giữa các dãy (trục X - lối đi)
const ROW_SPACING_Z = 2.5;    // Khoảng cách giữa các kệ trong cùng 1 dãy (trục Z)

// Tái sử dụng geometry (tạo 1 lần)
const sideGeo = new THREE.BoxGeometry(0.1, 5, 1);
const floorGeo = new THREE.BoxGeometry(3, 0.1, 1);
const dividerGeo = new THREE.BoxGeometry(3, 0.05, 0.5);

const woodMat = new THREE.MeshLambertMaterial({ color: '#6b4226' });
const woodMatHL = new THREE.MeshLambertMaterial({
  color: '#b08030',
  emissive: '#3a2500',
  emissiveIntensity: 0.5,
});

// Component 1 Bay
function Bay({ bayIndex, mat }: { bayIndex: number; mat: THREE.Material }) {
  const offsetX = (bayIndex - 2) * 3;
  return (
    <group position={[offsetX, 0, 0]}>
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
    </group>
  );
}

// Component 1 Rack hoàn chỉnh (3 Bay)
function Rack({ isHighlighted }: { isHighlighted: boolean }) {
  const mat = isHighlighted ? woodMatHL : woodMat;
  return (
    <group>
      <Bay bayIndex={1} mat={mat} />
      <Bay bayIndex={2} mat={mat} />
      <Bay bayIndex={3} mat={mat} />
    </group>
  );
}

export default function BookshelfScene({
  racks,
  highlightRack,
  highlightBay,
  highlightFace,
}: BookshelfSceneProps) {
  // Sắp xếp kệ theo rackNumber, rồi xếp thành dãy song song
  // Mỗi dãy (column) chạy dọc theo trục Z (đi sâu vào trong)
  // Các dãy cách nhau theo trục X (lối đi giữa các dãy)
  const rackPositions = useMemo(() => {
    const sorted = [...racks].sort((a, b) => a.rackNumber - b.rackNumber);
    return sorted.map((rack, index) => {
      const col = Math.floor(index / RACKS_PER_COLUMN); // Dãy nào (X)
      const row = index % RACKS_PER_COLUMN;              // Vị trí trong dãy (Z)
      const totalCols = Math.ceil(sorted.length / RACKS_PER_COLUMN);
      return {
        rackNumber: rack.rackNumber,
        x: (col - (totalCols - 1) / 2) * COLUMN_SPACING_X,
        z: -row * ROW_SPACING_Z,
      };
    });
  }, [racks]);

  // Tính vị trí highlight marker
  const markerPos = useMemo(() => {
    if (highlightRack === null || highlightBay === null || highlightFace === null) return null;

    const rp = rackPositions.find((r) => r.rackNumber === highlightRack);
    if (!rp) return null;

    // Bay group offset + nội bộ Bay center (Side_L=0.13, Side_R=3.17 → center=1.65)
    const bayLocalX = (highlightBay - 2) * 3 + 1.65;
    // Geometry center Z=-0.49, shelf depth ~1 unit → front=0, back=-0.98
    const faceLocalZ = highlightFace === 1 ? 0.0 : -0.98;

    return new THREE.Vector3(rp.x + bayLocalX, 2.5, rp.z + faceLocalZ);
  }, [highlightRack, highlightBay, highlightFace, rackPositions]);

  return (
    <group>
      {rackPositions.map((rp) => (
        <group key={rp.rackNumber} position={[rp.x, 0, rp.z]}>
          <Rack isHighlighted={rp.rackNumber === highlightRack} />
        </group>
      ))}

      {markerPos && <HighlightMarker position={markerPos} />}
    </group>
  );
}
