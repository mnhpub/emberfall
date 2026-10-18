import { useState } from 'react';
import type { State } from '../../packages/game-core';
import type { CustodyIntent, SharedView } from '../../packages/authority/protocol';
import type { ColonyIntent } from '../../packages/colonies';
import ColonyPanel from './ColonyPanel';

export default function SharedRoomPanel({actor,view,state,dispatch}:{actor:string;view:SharedView;state:State;dispatch:(c:CustodyIntent|ColonyIntent)=>void}) {
  const [recipient,setRecipient]=useState(''),[lotId,setLotId]=useState(''),[quantity,setQuantity]=useState(1);
  const others=view.players.filter(p=>p.actor!==actor && p.profession);
  const lots=state.logistics.lots.filter(l=>['haven-store','aurum-store','ferry'].includes(l.custodian));
  return <section aria-label="Shared colony room">
    <h3>Colony crew</h3>
    <p data-testid="room-roster">{view.players.length} active players · {view.players.map(p=>p.actor===actor?'You':p.actor).join(', ')}</p>
    <p>Ferry helm: {view.helmActor===actor?'You':view.helmActor??'available'}</p>
    <p data-testid="shared-timber">Timber remaining: {state.nodes.timber}</p>
    <p>Warehouse freight · Haven {view.freight.haven}/128 · Aurum {view.freight.aurum}/128</p>
    {view.orders.map(o=><p key={o.id}>{o.id}: {o.fulfilled}/{o.required} delivered · {o.reserved} reserved</p>)}
    {view.contributions && <details><summary>Contribution standings · room preview</summary>
      <p>Room {view.contributions.room} · {view.contributions.season} · {view.contributions.total} points. Official regional rankings are not connected.</p>
      {(['players','professions','colonies'] as const).map(group=><section key={group}><h4>{group}</h4><ol>{view.contributions[group].map(row=><li key={row.id}>Rank {row.rank} · {row.id===actor?'You':row.id} · {row.points} points · {row.quantity} delivered</li>)}</ol></section>)}
      <p>Only accepted contract deliveries score. Profession attribution uses the character’s fixed starting profession. Preview rooms can be reset and are not combined.</p>
    </details>}
    <ColonyPanel state={state} economy={view.economy} dispatch={dispatch}/>
    <details><summary>Offer cargo to another player</summary>
      <p>Unload at a warehouse or stopped ferry gangway. Both players must remain nearby until acceptance.</p>
      <form onSubmit={e=>{e.preventDefault();dispatch({type:'cargo-offer',lotId,recipient,quantity});}}>
        <label>Cargo <select aria-label="Offered cargo lot" value={lotId} onChange={e=>setLotId(e.target.value)} required><option value="">Choose cargo</option>{lots.map(l=><option key={l.id} value={l.id}>{l.id} · {l.quantity} {l.good} · {l.condition}% · {l.custodian}</option>)}</select></label>
        <label>Recipient <select aria-label="Cargo recipient" value={recipient} onChange={e=>setRecipient(e.target.value)} required><option value="">Choose recipient</option>{others.map(p=><option key={p.actor} value={p.actor}>{p.actor}</option>)}</select></label>
        <label>Quantity <input aria-label="Offer quantity" type="number" min="1" max={lots.find(l=>l.id===lotId)?.quantity??1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))} required /></label>
        <button>Offer cargo</button>
      </form>
    </details>
    {view.offers.map(o=><section key={o.id} aria-label={`Cargo offer ${o.id}`}>
      <p>{o.quantity} {o.good} · condition {o.condition}% · {o.custodian}<br />{o.sender===actor?`To ${o.recipient}`:`From ${o.sender}`}{o.orderId?` · reserved for ${o.orderId}`:''}</p>
      {o.recipient===actor && <button onClick={()=>dispatch({type:'cargo-accept',offerId:o.id})}>Accept {o.id}</button>}
      <button onClick={()=>dispatch({type:'cargo-cancel',offerId:o.id})}>Cancel {o.id}</button>
    </section>)}
  </section>;
}
