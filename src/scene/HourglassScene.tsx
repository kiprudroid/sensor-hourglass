import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber/native';
import * as THREE from 'three';
import type { HourglassSim } from '../sim';
import type { Vec3 } from '../sim/types';
import { createGlassProfile } from '../sim/glassProfile';
import { COLORS } from '../theme/colors';

interface Props {
  simRef: React.RefObject<HourglassSim>;
  gravityRef: React.RefObject<{ gravity: Vec3 }>;
  virtualRef: React.RefObject<{ gravity: Vec3; update: (dt: number) => Vec3 }>;
  sandColor: string;
  sensorOk: boolean;
}

function hexToColor(hex: string): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(hex);
  } catch {
    c.set('#D7B06A');
  }
  return c;
}

type Bulb = 'upper' | 'lower';

function buildVolumeGeometry(size: number): THREE.BufferGeometry {
  const vertsPerSide = size + 1;
  const topCount = vertsPerSide * vertsPerSide;
  const bottomCount = topCount;
  // Top grid + bottom grid, connected by side strips.
  const total = topCount + bottomCount;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const indices: number[] = [];

  // Top grid indices
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = z * vertsPerSide + x;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Bottom grid indices (reverse winding)
  const off = topCount;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const a = off + z * vertsPerSide + x;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  // Sides: connect edge of top to edge of bottom
  const addSide = (topIdx: number[], bottomIdx: number[]) => {
    for (let i = 0; i < topIdx.length - 1; i += 1) {
      const t0 = topIdx[i];
      const t1 = topIdx[i + 1];
      const b0 = bottomIdx[i];
      const b1 = bottomIdx[i + 1];
      indices.push(t0, b0, t1, t1, b0, b1);
    }
  };
  const topEdge: number[] = [];
  const bottomEdge: number[] = [];
  // bottom row z=0
  for (let x = 0; x <= size; x += 1) { topEdge.push(x); bottomEdge.push(off + x); }
  addSide(topEdge, bottomEdge);
  topEdge.length = 0; bottomEdge.length = 0;
  // right x=size
  for (let z = 0; z <= size; z += 1) { topEdge.push(z * vertsPerSide + size); bottomEdge.push(off + z * vertsPerSide + size); }
  addSide(topEdge, bottomEdge);
  topEdge.length = 0; bottomEdge.length = 0;
  // top row z=size (reverse)
  for (let x = size; x >= 0; x -= 1) { topEdge.push(size * vertsPerSide + x); bottomEdge.push(off + size * vertsPerSide + x); }
  addSide(topEdge, bottomEdge);
  topEdge.length = 0; bottomEdge.length = 0;
  // left x=0 (reverse)
  for (let z = size; z >= 0; z -= 1) { topEdge.push(z * vertsPerSide); bottomEdge.push(off + z * vertsPerSide); }
  addSide(topEdge, bottomEdge);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
}

function SandBody({
  simRef,
  sandColor,
  which,
}: {
  simRef: React.RefObject<HourglassSim>;
  sandColor: string;
  which: Bulb;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const size = 32;
  const profile = useMemo(() => createGlassProfile(0.003), []);
  const geometry = useMemo(() => buildVolumeGeometry(size), [size]);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(sandColor),
        roughness: 0.92,
        metalness: 0.0,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* eslint-disable react-hooks/immutability -- R3F geometry buffer mutation in frame loop */
  useFrame(() => {
    const sim = simRef.current;
    const mesh = meshRef.current;
    if (!sim || !mesh) return;
    material.color.copy(hexToColor(sandColor));

    const hf = sim.hf;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const data = which === 'upper' ? hf.upper : hf.lower;
    const vertsPerSide = size + 1;
    const topCount = vertsPerSide * vertsPerSide;

    // Fixed scale: fillUpper sets 0.72 as ~full upper bulb.
    const MAX_CELL = 0.72;

    for (let iz = 0; iz < vertsPerSide; iz += 1) {
      for (let ix = 0; ix < vertsPerSide; ix += 1) {
        const vi = iz * vertsPerSide + ix;
        const nx = (ix / size) * 2 - 1;
        const nz = (iz / size) * 2 - 1;
        const r2 = nx * nx + nz * nz;
        const sx = Math.min(size - 1, Math.floor((ix / size) * size));
        const sz = Math.min(size - 1, Math.floor((iz / size) * size));
        const cell = sz * size + sx;
        const hVal = hf.mask[cell] ? data[cell] : 0;
        const fill = Math.max(0, Math.min(1, hVal / MAX_CELL));

        // Bulb vertical range in glass-local coords.
        let baseY: number;
        let topY: number;
        if (which === 'upper') {
          baseY = 0.006;
          topY = profile.halfHeight - 0.006;
        } else {
          baseY = -profile.halfHeight + 0.006;
          topY = -0.006;
        }
        const surfY = baseY + (topY - baseY) * fill;
        const yAtR = (y: number) => Math.max(0, profile.radiusAt(y) - 0.0022);

        // Constrain xz to bulb radius at surface and bottom.
        const rr = Math.sqrt(r2);
        const k = rr > 0.0001 ? Math.min(1, 1 / Math.max(1, rr)) : 1;
        const inside = r2 <= 1.05;

        const rSurf = yAtR(surfY);
        const xSurf = nx * k * rSurf;
        const zSurf = nz * k * rSurf;
        const ySurf = inside ? surfY : baseY;

        const rBot = yAtR(baseY + 0.001);
        const xBot = nx * k * rBot;
        const zBot = nz * k * rBot;
        const yBot = baseY + 0.001;

        // top vertex
        arr[vi * 3] = xSurf;
        arr[vi * 3 + 1] = ySurf;
        arr[vi * 3 + 2] = zSurf;
        // bottom vertex
        const bi = (topCount + vi) * 3;
        arr[bi] = xBot;
        arr[bi + 1] = yBot;
        arr[bi + 2] = zBot;
      }
    }

    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });
  /* eslint-enable react-hooks/immutability */

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
}

function NeckStream({ simRef, sandColor }: { simRef: React.RefObject<HourglassSim>; sandColor: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: new THREE.Color(sandColor), roughness: 0.8 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useFrame(() => {
    const sim = simRef.current;
    if (!sim || !ref.current) return;
    mat.color.copy(hexToColor(sandColor));
    const g = sim.metrics.gravityMagnitude;
    const flow = sim.metrics.flowGrainsPerSecond;
    const visible = g > 0.5 && flow > 0.001;
    ref.current.visible = visible;
    const gy = sim.hf ? 1 : 1;
    void gy;
    // Scale stream by flow.
    const s = Math.min(1, flow / 50);
    ref.current.scale.set(0.002 + s * 0.002, 0.012, 0.002 + s * 0.002);
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]} material={mat}>
      <cylinderGeometry args={[1, 1.6, 1, 8]} />
    </mesh>
  );
}

function Glass() {
  const profile = useMemo(() => createGlassProfile(0.003), []);
  const geometry = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const y = -profile.halfHeight + (i / 80) * profile.halfHeight * 2;
      pts.push(new THREE.Vector2(profile.radiusAt(y) + 0.0012, y));
    }
    return new THREE.LatheGeometry(pts, 48);
  }, [profile]);
  return (
    <mesh geometry={geometry}>
      <meshPhysicalMaterial
        color="#dce8e0"
        transparent
        opacity={0.14}
        roughness={0.05}
        metalness={0}
        transmission={0}
        thickness={0.2}
        clearcoat={1}
        clearcoatRoughness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Frame() {
  const wood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4a3523', roughness: 0.75, metalness: 0.05 }),
    [],
  );
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9d8b70', roughness: 0.35, metalness: 0.8 }),
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.102, 0]} material={wood}>
        <cylinderGeometry args={[0.042, 0.046, 0.012, 32]} />
      </mesh>
      <mesh position={[0, -0.102, 0]} material={wood}>
        <cylinderGeometry args={[0.046, 0.042, 0.012, 32]} />
      </mesh>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x * 0.024, 0, z * 0.024]} material={metal}>
          <cylinderGeometry args={[0.0025, 0.0025, 0.2, 10]} />
        </mesh>
      ))}
      <mesh position={[0, -0.109, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.05, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
    </group>
  );
}

function SceneContents({
  simRef,
  sandColor,
}: {
  simRef: React.RefObject<HourglassSim>;
  sandColor: string;
}) {
  return (
    <>
      <color attach="background" args={[COLORS.background]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#dfe8d8', '#1a2218', 0.5]} />
      <directionalLight position={[0.2, 0.5, 0.5]} intensity={1.4} />
      <directionalLight position={[-0.3, 0.2, -0.4]} intensity={0.35} color="#c9d6ff" />
      <group scale={1.7}>
        <SandBody simRef={simRef} sandColor={sandColor} which="upper" />
        <SandBody simRef={simRef} sandColor={sandColor} which="lower" />
        <NeckStream simRef={simRef} sandColor={sandColor} />
        <Glass />
        <Frame />
      </group>
    </>
  );
}

export default function HourglassScene({ simRef, sandColor }: Props) {
  return (
    <View style={styles.container}>
      <Canvas
        camera={{ position: [0, 0, 0.72], fov: 35, near: 0.01, far: 10 }}
        gl={{ antialias: true, alpha: false }}
        onCreated={(state) => {
          state.gl.setClearColor(new THREE.Color(COLORS.background));
        }}
      >
        <SceneContents simRef={simRef} sandColor={sandColor} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.background },
});
