import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Html, Sky, Sparkles, Text } from '@react-three/drei';
import * as THREE from 'three';

export type ResourceKind = 'wood' | 'stone' | 'shard';
export type ResourceNode = { id: string; kind: ResourceKind; x: number; z: number; amount: number };

const initialNodes: ResourceNode[] = [
  { id: 'tree-1', kind: 'wood', x: -4, z: -3, amount: 3 },
  { id: 'tree-2', kind: 'wood', x: 4, z: -5, amount: 3 },
  { id: 'rock-1', kind: 'stone', x: 3, z: 2, amount: 4 },
  { id: 'rock-2', kind: 'stone', x: -6, z: 4, amount: 4 },
  { id: 'shard-1', kind: 'shard', x: 0, z: -9, amount: 2 },
];

function Ground() {
  const patches = useMemo(() => Array.from({ length: 80 }, (_, i) => ({
    x: Math.sin(i * 12.9898) * 13,
    z: Math.cos(i * 7.233) * 13,
    scale: 0.25 + ((i * 7) % 10) / 18,
  })), []);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
      <planeGeometry args={[200, 200, 1, 1]} /><meshStandardMaterial color="#263c32" roughness={1} />
    </mesh>
    {patches.map((p, i) => <mesh key={i} position={[p.x, -0.04, p.z]} rotation={[-Math.PI / 2, 0, i]}>
      <circleGeometry args={[p.scale, 5]} /><meshStandardMaterial color={i % 3 === 0 ? '#40513a' : '#304638'} roughness={1} />
    </mesh>)}
    {Array.from({ length: 24 }, (_, i) => <mesh key={`stone-${i}`} position={[Math.sin(i * 9) * 18, 0.12, Math.cos(i * 5) * 18]} rotation={[0, i, 0]} castShadow>
      <dodecahedronGeometry args={[0.4 + (i % 4) * 0.15, 0]} /><meshStandardMaterial color="#4d5c50" flatShading />
    </mesh>)}
  </>;
}

function Tree({ x, z, onHarvest }: { x: number; z: number; onHarvest: () => void }) {
  const [hit, setHit] = useState(false);
  return <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); setHit(true); onHarvest(); }}>
    <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.16, 0.24, 1.8, 6]} /><meshStandardMaterial color="#60462e" /></mesh>
    <mesh position={[0, 2.15, 0]} castShadow><coneGeometry args={[1.05, 2.3, 7]} /><meshStandardMaterial color={hit ? '#4e6743' : '#355a43'} flatShading /></mesh>
    <mesh position={[0, 2.9, 0]} castShadow><coneGeometry args={[0.72, 1.7, 7]} /><meshStandardMaterial color="#476c4b" flatShading /></mesh>
    <Billboard position={[0, 3.8, 0]}><Text fontSize={0.18} color="#d5ddc9" outlineWidth={0.025} outlineColor="#18251e">{hit ? 'Harvested' : 'E · Wood'}</Text></Billboard>
  </group>;
}

function Rock({ x, z, onHarvest }: { x: number; z: number; onHarvest: () => void }) {
  const [hit, setHit] = useState(false);
  return <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); setHit(true); onHarvest(); }}>
    <mesh position={[0, 0.35, 0]} rotation={[0.2, 0.5, 0.1]} castShadow><dodecahedronGeometry args={[0.65, 0]} /><meshStandardMaterial color="#68766d" flatShading /></mesh>
    <Billboard position={[0, 1.25, 0]}><Text fontSize={0.17} color="#d5ddc9" outlineWidth={0.025} outlineColor="#18251e">{hit ? 'Chipped' : 'E · Stone'}</Text></Billboard>
  </group>;
}

function Shard({ x, z, onHarvest }: { x: number; z: number; onHarvest: () => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const [hit, setHit] = useState(false);
  useFrame(({ clock }) => { if (mesh.current) { mesh.current.rotation.y += 0.006; mesh.current.position.y = 0.9 + Math.sin(clock.elapsedTime * 1.5) * 0.12; } });
  return <group position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); setHit(true); onHarvest(); }}>
    <mesh ref={mesh} position={[0, 0.9, 0]} castShadow><octahedronGeometry args={[0.48, 0]} /><meshStandardMaterial color="#7ed5b6" emissive="#286d5c" emissiveIntensity={1.4} roughness={0.25} /></mesh>
    <Sparkles count={12} scale={1.7} size={2.5} speed={0.3} color="#9fffe0" />
    <Billboard position={[0, 1.8, 0]}><Text fontSize={0.17} color="#c7fff0" outlineWidth={0.025} outlineColor="#18251e">{hit ? 'Gathered' : 'E · Ember shard'}</Text></Billboard>
  </group>;
}

function Player({ position, setPosition, attacking }: { position: [number, number, number]; setPosition: (p: [number, number, number]) => void; attacking: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const [swing, setSwing] = useState(0);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const speed = 4.3 * Math.min(delta, 0.05);
    let dx = 0, dz = 0;
    if (keys.current.w || keys.current.arrowup) dz -= speed;
    if (keys.current.s || keys.current.arrowdown) dz += speed;
    if (keys.current.a || keys.current.arrowleft) dx -= speed;
    if (keys.current.d || keys.current.arrowright) dx += speed;
    if (dx || dz) {
      const len = Math.hypot(dx, dz); dx /= len; dz /= len;
      const nx = THREE.MathUtils.clamp(ref.current.position.x + dx * speed, -22, 22);
      const nz = THREE.MathUtils.clamp(ref.current.position.z + dz * speed, -22, 22);
      ref.current.position.x = nx; ref.current.position.z = nz;
      ref.current.rotation.y = Math.atan2(dx, dz);
      setPosition([nx, 0, nz]);
    }
    if (attacking && swing < 1) setSwing((v) => Math.min(1, v + delta * 5));
    else if (!attacking && swing !== 0) setSwing(0);
  });
  return <group ref={ref} position={position}>
    <mesh position={[0, 0.85, 0]} castShadow><capsuleGeometry args={[0.32, 0.75, 4, 8]} /><meshStandardMaterial color="#b8b8a0" roughness={0.8} /></mesh>
    <mesh position={[0, 1.55, 0]} castShadow><sphereGeometry args={[0.25, 10, 8]} /><meshStandardMaterial color="#c8ad8d" /></mesh>
    <mesh position={[0.34 + swing * 0.1, 0.88, 0.1]} rotation={[0, 0, -0.4 - swing * 1.8]} castShadow><boxGeometry args={[0.09, 0.85, 0.12]} /><meshStandardMaterial color="#aab8b2" metalness={0.65} roughness={0.3} /></mesh>
    <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.42, 0.46, 24]} /><meshBasicMaterial color="#b8d8b5" transparent opacity={0.55} /></mesh>
  </group>;
}

function Enemy({ x, z, onDefeat }: { x: number; z: number; onDefeat: () => void }) {
  const [hp, setHp] = useState(3);
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = Math.sin(clock.elapsedTime * 2 + x) * 0.06; });
  return <group ref={ref} position={[x, 0, z]} onClick={(e) => { e.stopPropagation(); if (hp <= 0) return; if (hp === 1) { setHp(0); onDefeat(); } else setHp((v) => v - 1); }}>
    {hp > 0 && <>
      <mesh position={[0, 0.7, 0]} castShadow><capsuleGeometry args={[0.36, 0.65, 4, 7]} /><meshStandardMaterial color="#694d61" emissive="#291728" emissiveIntensity={0.6} /></mesh>
      <mesh position={[0, 1.25, 0]}><sphereGeometry args={[0.28, 8, 8]} /><meshStandardMaterial color="#b96c71" emissive="#7a283d" emissiveIntensity={0.8} /></mesh>
      <Billboard position={[0, 1.8, 0]}><Text fontSize={0.16} color="#ffb2ac">{`Ashbound · ${hp}/3`}</Text></Billboard>
    </>}
  </group>;
}

export default function GameWorld({ onGather, onEnemyDefeated, attacking }: { onGather: (kind: ResourceKind) => void; onEnemyDefeated: () => void; attacking: boolean }) {
  const [position, setPosition] = useState<[number, number, number]>([0, 0, 4]);
  return <Canvas shadows camera={{ position: [0, 7, 12], fov: 48 }} onCreated={({ camera }) => { camera.lookAt(0, 0, 0); }}>
    <color attach="background" args={['#182821']} /><fog attach="fog" args={['#182821', 18, 52]} />
    <ambientLight intensity={0.8} /><directionalLight position={[8, 16, 7]} intensity={2.1} castShadow shadow-mapSize={[2048, 2048]} />
    <Sky sunPosition={[10, 8, 2]} turbidity={8} rayleigh={0.7} />
    <Ground />
    <group>
      <Tree x={-4} z={-3} onHarvest={() => onGather('wood')} /><Tree x={4} z={-5} onHarvest={() => onGather('wood')} />
      <Tree x={-8} z={-1} onHarvest={() => onGather('wood')} /><Tree x={7} z={6} onHarvest={() => onGather('wood')} />
      <Rock x={3} z={2} onHarvest={() => onGather('stone')} /><Rock x={-6} z={4} onHarvest={() => onGather('stone')} />
      <Shard x={0} z={-9} onHarvest={() => onGather('shard')} />
      <Enemy x={-2} z={-7} onDefeat={onEnemyDefeated} /><Enemy x={8} z={-1} onDefeat={onEnemyDefeated} />
      <mesh position={[0, 0.22, -12]} castShadow><cylinderGeometry args={[1.1, 1.35, 0.45, 7]} /><meshStandardMaterial color="#6d6550" /></mesh>
      <mesh position={[0, 1.3, -12]} castShadow><dodecahedronGeometry args={[0.65, 0]} /><meshStandardMaterial color="#82cdb2" emissive="#2b8069" emissiveIntensity={1.7} /></mesh>
      <Billboard position={[0, 2.4, -12]}><Text fontSize={0.28} color="#b7ffe5" outlineWidth={0.035} outlineColor="#12221b">THE FIRST EMBER</Text></Billboard>
    </group>
    <Player position={position} setPosition={setPosition} attacking={attacking} />
    <CameraFollow target={position} />
  </Canvas>;
}

function CameraFollow({ target }: { target: [number, number, number] }) {
  useFrame(({ camera }, delta) => {
    const desired = new THREE.Vector3(target[0], 7, target[2] + 10);
    camera.position.lerp(desired, 1 - Math.exp(-delta * 4));
    camera.lookAt(target[0], 0.6, target[2] - 1.5);
  });
  return null;
}
