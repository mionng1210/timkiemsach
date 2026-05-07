import { useMemo, useState } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { RackInfo } from '../types';
import HighlightMarker from './HighlightMarker';

interface BookshelfSceneProps {
  racks: RackInfo[];
  highlightRack: number | null;
  highlightBay: number | null;
  highlightFace: number | null;
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
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
  onBayClick,
}: {
  bayIndex: number;
  mat: THREE.Material;
  rackNumber: number;
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
}) {
  const offsetX = (bayIndex - 2) * 3;
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
  onBayClick,
}: {
  rackNumber: number;
  isHighlighted: boolean;
  bays: number[];
  onBayClick?: (rackNumber: number, bay: number, face: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const mat = isHighlighted ? woodMatHL : hovered ? woodMatHover : woodMat;

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {bays.map((b) => (
        <Bay key={b} bayIndex={b} mat={mat} rackNumber={rackNumber} onBayClick={onBayClick} />
      ))}

      {/* Nhãn số kệ ở đầu dãy (phía ngoài) - Hình tròn xanh biển, số trắng */}
      <group position={[-2.95, 4.5, -0.5]} rotation={[0, -Math.PI / 2, 0]}>
        {/* Tấm bảng nền hình tròn */}
        <mesh>
          <circleGeometry args={[0.25, 32]} />
          <meshBasicMaterial color="#3b82f6" />
        </mesh>
        {/* Chữ số kệ */}
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.25}
          color="white"
          fontWeight="bold"
          anchorX="center"
          anchorY="middle"
        >
          {`${rackNumber}`}
        </Text>
      </group>
    </group>
  );
}

export default function BookshelfScene({
  racks,
  highlightRack,
  highlightBay,
  highlightFace,
  onBayClick,
}: BookshelfSceneProps) {
  const rackPositions = useMemo(() => {
    const sorted = [...racks].sort((a, b) => a.rackNumber - b.rackNumber);
    return sorted.map((rack, index) => {
      const totalRacks = sorted.length;
      return {
        rackNumber: rack.rackNumber,
        bays: rack.bays,
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

  return (
    <group>
      {rackPositions.map((rp) => (
        <group key={rp.rackNumber} position={[rp.x, 0, rp.z]}>
          <Rack
            rackNumber={rp.rackNumber}
            isHighlighted={rp.rackNumber === highlightRack}
            bays={rp.bays}
            onBayClick={onBayClick}
          />
        </group>
      ))}
      {markerPos && <HighlightMarker position={markerPos} />}
    </group>
  );
}
