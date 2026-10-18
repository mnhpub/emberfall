import type { State } from "../../packages/game-core";
import type { PublicPlacement } from '../../packages/authority/protocol';
export default function PlacedObjects({ state,objects }: { state: State;objects?:PublicPlacement[] }) {
  return (
    <>
      {(objects??state.placed.map(p=>({...p,actor:'local-player',definitionId:state.items.find(i=>i.id===p.instanceId)!.definitionId}))).map((p) => {
        const i = {id:`${p.actor}:${p.instanceId}`,definitionId:p.definitionId};
        return (
          <group key={i.id} position={[p.x, 0, p.z]}>
            {i.definitionId === "workbench" ? (
              <>
                <mesh position={[0, 0.95, 0]} castShadow>
                  <boxGeometry args={[2, 0.2, 1.2]} />
                  <meshStandardMaterial color="#9c744d" />
                </mesh>
                {[-0.8, 0.8].flatMap((x) =>
                  [-0.4, 0.4].map((z) => (
                    <mesh key={`${x}${z}`} position={[x, 0.45, z]}>
                      <boxGeometry args={[0.15, 0.9, 0.15]} />
                      <meshStandardMaterial color="#61432c" />
                    </mesh>
                  )),
                )}
              </>
            ) : i.definitionId === "forge" ? (
              <>
                <mesh position={[0, 0.7, 0]} castShadow>
                  <boxGeometry args={[2, 1.4, 2]} />
                  <meshStandardMaterial color="#5b5a56" />
                </mesh>
                <mesh position={[0, 1.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[0.65, 10]} />
                  <meshStandardMaterial
                    color="#ff9c36"
                    emissive="#e76015"
                    emissiveIntensity={1.5}
                  />
                </mesh>
              </>
            ) : i.definitionId === "shelter" ? (
              <>
                <mesh position={[0, 0.1, 0]}>
                  <boxGeometry args={[3, 0.2, 3]} />
                  <meshStandardMaterial color="#7a6249" />
                </mesh>
                <mesh position={[0, 2.4, 0]} rotation={[0, Math.PI / 4, 0]}>
                  <coneGeometry args={[2.2, 1.4, 4]} />
                  <meshStandardMaterial color="#b59b69" />
                </mesh>
                {[-1.3, 1.3].flatMap((x) =>
                  [-1.3, 1.3].map((z) => (
                    <mesh key={`${x}${z}`} position={[x, 1, z]}>
                      <boxGeometry args={[0.15, 2, 0.15]} />
                      <meshStandardMaterial color="#6c4b30" />
                    </mesh>
                  )),
                )}
              </>
            ) : (
              <mesh position={[0, 0.6, 0]} castShadow>
                <boxGeometry args={[1.2, 1.2, 1.2]} />
                <meshStandardMaterial color="#a47c4e" />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}
