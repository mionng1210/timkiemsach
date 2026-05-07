import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HighlightMarkerProps {
  position: THREE.Vector3;
}

export default function HighlightMarker({ position }: HighlightMarkerProps) {
  const boxRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();

    // Pulse highlight box opacity
    if (boxRef.current) {
      const mat = boxRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.2 + Math.sin(t * 2.5) * 0.1;
    }

    // Bounce arrow up and down
    if (arrowRef.current) {
      arrowRef.current.position.y = position.y + 3.2 + Math.sin(t * 3) * 0.3;
      arrowRef.current.position.x = position.x;
      arrowRef.current.position.z = position.z;
    }
  });

  return (
    <group>
      {/* Khối highlight bán trong suốt */}
      <mesh ref={boxRef} position={position}>
        <boxGeometry args={[3.0, 4.8, 0.6]} />
        <meshStandardMaterial
          color="#4a7dff"
          transparent
          opacity={0.25}
          emissive="#4a7dff"
          emissiveIntensity={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Viền wireframe */}
      <mesh position={position}>
        <boxGeometry args={[3.05, 4.85, 0.65]} />
        <meshBasicMaterial color="#4a7dff" wireframe transparent opacity={0.5} />
      </mesh>

      {/* Mũi tên chỉ xuống */}
      <group ref={arrowRef}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.35, 0.7, 8]} />
          <meshStandardMaterial color="#f5b731" emissive="#f5b731" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 8]} />
          <meshStandardMaterial color="#f5b731" emissive="#f5b731" emissiveIntensity={0.6} />
        </mesh>
      </group>

      {/* Đèn điểm tại vị trí highlight */}
      <pointLight position={[position.x, position.y, position.z + 2]} color="#4a7dff" intensity={3} distance={8} />
    </group>
  );
}
