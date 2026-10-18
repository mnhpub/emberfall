import { useState } from 'react';
import type { State } from '../../packages/game-core';
import { DOCKS } from '../../packages/logistics';
import { COLONY_GOODS, type ColonyGood, type ColonyId, type ColonyIntent, type EconomyView } from '../../packages/colonies';

export default function ColonyPanel({state,economy,dispatch}:{state:State;economy:EconomyView;dispatch:(c:ColonyIntent)=>void}) {
  const [colony,setColony]=useState<ColonyId>('haven'),[good,setGood]=useState<ColonyGood>('wood'),[quantity,setQuantity]=useState(1);
  const selected=economy.colonies.find(c=>c.id===colony)!;
  const near=(id:ColonyId)=>Math.hypot(state.position.x-DOCKS[id].x,state.position.z-DOCKS[id].z)<=6 && !!state.profession;
  const valid=Number.isInteger(quantity) && quantity>=1 && quantity<=32;
  return <details><summary>Colony production & contracts</summary>
    <p>Production consumes supplies and finite local reserves. Shipments complete each colony contract once.</p>
    {economy.contracts.map(c=><section key={c.id} data-testid={`contract-${c.id}`}>
      <h4>{c.title}</h4><p>{c.required} {c.good} · {c.source} → {c.destination}<br />{c.fulfilled}/{c.required} delivered · {c.reserved} reserved · {c.inTransit} in transit<br /><b>{c.status}</b> · {c.benefit}</p>
      {c.completion?.imported && <p>Completed before this version; no additional reward granted.</p>}
    </section>)}
    <h4>Colony stores</h4>
    <label>Colony <select aria-label="Production colony" value={colony} onChange={e=>setColony(e.target.value as ColonyId)}>{economy.colonies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <p data-testid="colony-stores">{COLONY_GOODS.map(g=>`${g}: ${selected.stock[g]}`).join(' · ')}</p>
    <label>Supplies <select aria-label="Colony supply" value={good} onChange={e=>setGood(e.target.value as ColonyGood)}>{COLONY_GOODS.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
    <label>Quantity <input aria-label="Colony quantity" type="number" min="1" max="32" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
    <button disabled={!valid || !near(colony) || state.inventory[good]<quantity || economy.journalFull} onClick={()=>dispatch({type:'colony-contribute',colony,good,quantity})}>Contribute carried supplies</button>
    <button disabled={!valid || !near(colony) || selected.stock[good]<quantity || economy.journalFull} onClick={()=>dispatch({type:'colony-load',colony,good,quantity})}>Load colony stock into cargo</button>
    {!near(colony) && <p>Approach this colony’s warehouse to handle supplies or change production focus.</p>}
    <h4>{selected.name} production</h4>
    <p>Available reserves · {COLONY_GOODS.map(g=>`${g}: ${selected.reserves[g]}`).join(' · ')}</p>
    {selected.jobs.map(j=><section key={j.id} data-testid={`production-${j.id}`}>
      <b>{j.name}</b><p>{Object.entries(j.input).map(([g,n])=>`${n} ${g}`).join(', ')} → {Object.entries(j.output).map(([g,n])=>`${n} ${g}`).join(', ')}<br />{j.batches} {j.batches===1?'batch':'batches'} · {j.blocker??'Ready for the next production cycle'}</p>
      <button disabled={!near(colony) || selected.focus===j.id || economy.journalFull} onClick={()=>dispatch({type:'colony-focus',colony,recipe:j.id})}>{selected.focus===j.id?'Priority selected':`Prioritize ${j.name}`}</button>
    </section>)}
    <p>One batch per job per cycle; labor limits how many jobs can run.</p>
    {economy.journalFull && <p>Production paused pending colony record maintenance.</p>}
  </details>;
}
