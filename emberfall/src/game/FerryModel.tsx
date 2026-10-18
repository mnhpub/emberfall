import { useMemo } from "react";
import * as THREE from "three";
import { FERRY, deckHalfWidth } from "../../packages/vessels";
export default function FerryModel({
  sails,
  cargoUnits,
  cutaway,
}: {
  sails: "furled" | "set";
  cargoUnits: number;
  cutaway: boolean;
}) {
  const outline = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -80);
    s.lineTo(9, -66);
    s.lineTo(10.5, -48);
    s.lineTo(10.5, 50);
    s.lineTo(7.5, 80);
    s.lineTo(-7.5, 80);
    s.lineTo(-10.5, 50);
    s.lineTo(-10.5, -48);
    s.lineTo(-9, -66);
    s.closePath();
    return s;
  }, []);
  const sail = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0, 28);
    s.lineTo(9, 23);
    s.lineTo(13, 0);
    s.closePath();
    return s;
  }, []);
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4, 0]} castShadow>
        <extrudeGeometry args={[outline, { depth: 6, bevelEnabled: false }]} />
        <meshStandardMaterial
          color="#263740"
          metalness={0.65}
          roughness={0.55}
        />
      </mesh>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, FERRY.deckHeight, 0]}
        receiveShadow
      >
        <shapeGeometry args={[outline]} />
        <meshStandardMaterial
          color="#a77d4c"
          side={THREE.DoubleSide}
          roughness={0.85}
        />
      </mesh>
      {Array.from({ length: 35 }, (_, i) => (
        <mesh key={i} position={[0, 4.32, -65 + i * 4]}>
          <boxGeometry
            args={[
              Math.max(0, 2 * (deckHalfWidth(-65 + i * 4) - 0.3)),
              0.025,
              0.045,
            ]}
          />
          <meshStandardMaterial color="#574832" />
        </mesh>
      ))}
      {FERRY.masts.map((z, i) => {
        const h = [44, 52, 48, 37][i];
        return (
          <group key={z} position={[0, FERRY.deckHeight, z]}>
            <mesh position={[0, h / 2, 0]} castShadow>
              <cylinderGeometry args={[0.3, 0.55, h, 10]} />
              <meshStandardMaterial color="#705031" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.6, 0]}>
              <cylinderGeometry args={[0.8, 0.8, 1.2, 12]} />
              <meshStandardMaterial
                color="#b39a5d"
                metalness={0.75}
                roughness={0.35}
              />
            </mesh>
            {sails === "set" ? (
              <mesh position={[0.6, 5, 0]} scale={[1, h / 40, 1]} castShadow>
                <shapeGeometry args={[sail]} />
                <meshStandardMaterial
                  transparent={cutaway}
                  opacity={cutaway ? 0.16 : 1}
                  depthWrite={!cutaway}
                  color="#ded0a4"
                  side={THREE.DoubleSide}
                  roughness={1}
                />
              </mesh>
            ) : (
              <mesh position={[6, 5, 0]}>
                <boxGeometry args={[12, 0.6, 0.7]} />
                <meshStandardMaterial color="#bfae84" />
              </mesh>
            )}
            <mesh position={[6, 4.7, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 13, 6]} />
              <meshStandardMaterial color="#705031" />
            </mesh>
          </group>
        );
      })}
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: 19 }, (_, i) => {
            const z = -70 + i * 7.8,
              x = side * (deckHalfWidth(z) - 0.3);
            return (
              <group key={i}>
                <mesh position={[x, 4.8, z]}>
                  <boxGeometry args={[0.09, 1.1, 0.09]} />
                  <meshStandardMaterial color="#b8a572" metalness={0.7} />
                </mesh>
                {i < 18 &&
                  (() => {
                    const nz = z + 7.8,
                      nx = side * (deckHalfWidth(nz) - 0.3);
                    return (
                      <mesh
                        position={[(x + nx) / 2, 5.35, (z + nz) / 2]}
                        rotation={[0, Math.atan2(nx - x, nz - z), 0]}
                      >
                        <boxGeometry
                          args={[0.08, 0.08, Math.hypot(nx - x, nz - z)]}
                        />
                        <meshStandardMaterial color="#c8cdd0" metalness={0.8} />
                      </mesh>
                    );
                  })()}
              </group>
            );
          })}
        </group>
      ))}
      <group position={[0, FERRY.deckHeight, 0]}>
        {/* A cutaway cabin with a real central doorway; wall footprint matches collision. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 6, 1.6, 61.5]}>
            <boxGeometry args={[0.4, 3.2, 17]} />
            <meshStandardMaterial color="#8b623f" />
          </mesh>
        ))}
        <mesh position={[0, 1.6, 70]}>
          <boxGeometry args={[12, 3.2, 0.4]} />
          <meshStandardMaterial color="#8b623f" />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 3.8, 1.6, 53]}>
            <boxGeometry args={[4.4, 3.2, 0.4]} />
            <meshStandardMaterial color="#8b623f" />
          </mesh>
        ))}
        <mesh position={[0, 0.8, 35]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.8, 0.08, 8, 16]} />
          <meshStandardMaterial color="#c9a754" metalness={0.75} />
        </mesh>
        <mesh position={[3, 0.5, 62]}>
          <boxGeometry args={[2, 1, 3]} />
          <meshStandardMaterial color="#46656a" />
        </mesh>
        <mesh position={[-11.5, -2, 0]} rotation={[0, 0, Math.atan2(4, 5)]}>
          <boxGeometry args={[6.4, 0.15, 2.2]} />
          <meshStandardMaterial color="#ae8d57" />
        </mesh>
        {Array.from(
          { length: Math.min(12, Math.ceil(cargoUnits / 8)) },
          (_, i) => (
            <mesh
              key={i}
              position={[5 + (i % 2) * 1.5, 0.65, -8 - Math.floor(i / 2) * 1.5]}
            >
              <boxGeometry args={[1.2, 1.3, 1.2]} />
              <meshStandardMaterial color="#a98b60" />
            </mesh>
          ),
        )}
      </group>
    </>
  );
}
