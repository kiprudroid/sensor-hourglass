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
  try { c.set(hex); } catch { c.set('#D7B06A'); }
  return c;
}

function SandBulb({
  simRef,
  sandColor,
  which,
}: {
  simRef: React.RefObject<HourglassSim>;
  sandColor: string;
  which: 'upper' | 'lower';
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const size = 32;
  const profile = useMemo(() => createGlassProfile(0.003), []);

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, size, size);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [size]);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(sandColor),
        roughness: 0.85,
        metalness: 0.02,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // eslint-disable-next-line react-hooks/immutability -- R3F: mutate geometry buffer in frame loop
  useFrame(() => {
    const sim = simRef.current;
    const mesh = meshRef.current;
    if (!sim || !mesh) return;
    material.color.copy(hexToColor(sandColor));
    const hf = sim.hf;
    const pos = geometry.attributes.position;
    if (!pos) return;
    const arr = pos.array as Float32Array;
    const data = which === 'upper' ? hf.upper : hf.lower;
    // Build a smooth top surface inside the bulb.
    let maxH = 0;
    for (let i = 0; i < data.length; i += 1) if (data[i] > maxH) maxH = data[i];
    const scaleH = 0.05 / Math.max(1, maxH * 0.8 + 10);
    const vertsPerSide = size + 1;
    const bulbBase = which === 'upper' ? 0.006 : -profile.halfHeight + 0.004;
    const bulbTop = which === 'upper' ? profile.halfHeight - 0.004 : -0.006;
    for (let iz = 0; iz < vertsPerSide; iz += 1) {
      for (let ix = 0; ix < vertsPerSide; ix += 1) {
        const vi = iz * vertsPerSide + ix;
        const nx = (ix / size) * 2 - 1;
        const nz = (iz / size) * 2 - 1;
        const r2 = nx * nx + nz * nz;
        const sx = Math.min(size - 1, Math.floor((ix / size) * size));
        const sz = Math.min(size - 1, Math.floor((iz / size) * size));
        const cell = sz * size + sx;
        const h = data[cell] || 0;
        const fill = Math.min(1, h * scaleH * 1.8);
        let y = bulbBase + (bulbTop - bulbBase) * fill;
        if (which === 'lower') y = bulbBase + (-bulbBase - 0.006) * fill;
        const maxR = Math.max(0, profile.radiusAt(y) - 0.0025);
        const rr = Math.sqrt(r2);
        const k = rr > 1 ? 1 / rr : 1;
        const x = nx * k * maxR;
        const z = nz * k * maxR;
        // eslint-disable-next-line react-hooks/immutability -- R3F buffer mutation
        arr[vi * 3] = x;
        arr[vi * 3 + 1] = y;
        arr[vi * 3 + 2] = z;
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />;
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
        opacity={0.18}
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
  const wood = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a3523', roughness: 0.75, metalness: 0.05 }), []);
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9d8b70', roughness: 0.35, metalness: 0.8 }), []);
  return (
    <group>
      <mesh position={[0, 0.102, 0]} material={wood}>
        <cylinderGeometry args={[0.042, 0.046, 0.012, 32]} />
      </mesh>
      <mesh position={[0, -0.102, 0]} material={wood}>
        <cylinderGeometry args={[0.046, 0.042, 0.012, 32]} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
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

function SceneContents({ simRef, sandColor }: { simRef: React.RefObject<HourglassSim>; sandColor: string }) {
  return (
    <>
      <color attach="background" args={[COLORS.background]} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#dfe8d8', '#1a2218', 0.45]} />
      <directionalLight position={[0.2, 0.5, 0.5]} intensity={1.3} />
      <directionalLight position={[-0.3, 0.2, -0.4]} intensity={0.35} color="#c9d6ff" />
      <group scale={1.7}>
        <SandBulb simRef={simRef} sandColor={sandColor} which="upper" />
        <SandBulb simRef={simRef} sandColor={sandColor} which="lower" />
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
