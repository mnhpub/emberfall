import type { State } from '../../packages/game-core';
import type { SharedView } from '../../packages/authority/protocol';
import { FERRY } from '../../packages/vessels';
import PlacedObjects from './PlacedObjects';

export default function SharedScene({actor,view,state}:{actor:string;view:SharedView;state:State}) {
  return <>
    <PlacedObjects state={state} objects={view.placements.filter(p=>p.actor!==actor)} />
    {view.players.filter(p=>p.actor!==actor).map(p=><group key={p.actor} name={`crew-${p.actor}`} position={[p.position.x,p.mode==='ferry'?FERRY.deckHeight+0.65:0.65,p.position.z]}>
      <mesh castShadow><capsuleGeometry args={[0.3,0.65,4,8]}/><meshStandardMaterial color="#72a9cd"/></mesh>
      <mesh position={[0,0.75,0]}><sphereGeometry args={[0.23,8,8]}/><meshStandardMaterial color="#e8c98c"/></mesh>
      {p.mode==='ship' && <mesh position={[0,-0.45,0]}><boxGeometry args={[1.8,0.55,3.8]}/><meshStandardMaterial color="#6a5039"/></mesh>}
    </group>)}
  </>;
}
