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

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0.84, 0.69, 0.42];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

function SandPoints({
  simRef,
  sandColor,
}: {
  simRef: React.RefObject<HourglassSim>;
  sandColor: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const max = 4000;

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 6, 5), []);
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.95,
        metalness: 0.0,
        vertexColors: false,
      }),
    [],
  );

  useFrame(() => {
    const sim = simRef.current;
    const mesh = meshRef.current;
    if (!sim || !mesh) return;
    const [r, g, b] = hexToRgb(sandColor);
    color.setRGB(r, g, b);
    material.color.copy(color);
    const grains = sim.grains;
    let visible = 0;
    for (let i = 0; i < grains.count; i += 1) {
      if (grains.bulb[i] === 2) continue;
      const i3 = i * 3;
      const x = grains.pos[i3];
      const y = grains.pos[i3 + 1];
      const z = grains.pos[i3 + 2];
      const s = grains.radius[i] * 1.15;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(visible, dummy.matrix);
      visible += 1;
    }
    for (let i = visible; i < max; i += 1) {
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0.0001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = visible;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, max]} frustumCulled={false} />
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
  const wood = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4a3523',
        roughness: 0.75,
        metalness: 0.05,
      }),
    [],
  );
  const metal = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#9d8b70',
        roughness: 0.35,
        metalness: 0.8,
      }),
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
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#dfe8d8', '#1a2218', 0.45]} />
      <directionalLight position={[0.2, 0.5, 0.5]} intensity={1.4} />
      <directionalLight position={[-0.3, 0.2, -0.4]} intensity={0.45} color="#c9d6ff" />
      <group scale={1.7}>
        <SandPoints simRef={simRef} sandColor={sandColor} />
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
