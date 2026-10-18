import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { SharedWorld } from '../worker/shared-world.ts';
import { issueSession } from '../worker/session.ts';
import { AuthorityClient } from '../packages/authority/client.ts';
import { applyWorldIntent, initialWorld, initialPlayer, compose, character, projectWorld, HELM_LEASE_MS, OFFER_MS, type Players } from '../packages/authority/world.ts';
import { initialState, restore, transition, type State } from '../packages/game-core/index.ts';
import type { Intent } from '../packages/authority/protocol.ts';
import { localToWorld } from '../packages/vessels/index.ts';

const A='player_001',B='player_002',C='player_003';
const idle={type:'frame' as const,dx:0,dz:0,throttle:0,turn:0};
function fixture() {
  let now=1700000000000;const world=initialWorld('haven',now),players:Players=new Map();
  for(const actor of [A,B]){world.members.push(actor);players.set(actor,initialPlayer(actor,now));}
  const run=(actor:string,c:Intent,dt=100)=>{now+=dt;applyWorldIntent(world,players,actor,c,now);return compose(world,players.get(actor)!);};
  const state=(actor:string)=>compose(world,players.get(actor)!);
  const cargo=(actor:string,command:any)=>run(actor,{type:'cargo',envelope:{commandId:'cargo-'+(players.get(actor)!.character.logistics.revision+1),expectedRevision:players.get(actor)!.character.logistics.revision,command}});
  const choose=()=>{run(A,{type:'choose-profession',profession:'shipwright'});run(B,{type:'choose-profession',profession:'transport'});};
  const walk=(actor:string,x:number,z:number,local=false)=>{
    for(let n=0;n<2000;n++){const s=state(actor),p=local?s.ferry.passenger!.local:s.position;const dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<0.3)return;run(actor,{...idle,dx:Math.abs(dx)>0.2?Math.sign(dx):0,dz:Math.abs(dz)>0.2?Math.sign(dz):0});}
    throw new Error('Could not walk to target');
  };
  const deck=(actor:string)=>{run(actor,{type:'ferry-shuttle'});run(actor,{type:'ferry-board'});};
  const helmWalk=(actor:string)=>{walk(actor,3,0,true);walk(actor,3,35,true);walk(actor,0,35,true);};
  return {world,players,run,state,cargo,choose,walk,deck,helmWalk,now:()=>now};
}

test('room resources, colonies and salvage are common while inventory and equipment stay private',()=>{
  const f=fixture();f.choose();f.run(A,{type:'gather',id:'timber'});
  assert.equal(f.state(B).nodes.timber,39);assert.equal(f.state(A).inventory.wood,1);assert.equal(f.state(B).inventory.wood,0);
  assert.equal(f.state(A).equipment.hand,'item-1');assert.equal(f.state(B).items[0].definitionId,'cargo-hook');
  const peer=projectWorld(f.world,f.players,B,f.now()).shared!.players.find(p=>p.actor===A)!;assert.equal(Object.hasOwn(peer,'inventory'),false);
});
test('shared time does not run twice when two players send in the same wall-clock interval',()=>{
  const f=fixture();for(let i=0;i<10;i++){f.run(A,idle,100);f.run(B,idle,0);}assert.equal(f.world.tick,1);
  f.run(B,idle,3600000);assert.equal(f.world.tick,1);
});
test('only one helmsman controls a common ferry and every passenger follows its reference frame',()=>{
  const f=fixture();f.choose();f.deck(A);f.helmWalk(A);f.deck(B);f.helmWalk(B);
  f.run(A,{type:'ferry-helm'});const rejected=f.run(B,{type:'ferry-helm'});assert.match(rejected.message,/already held/);assert.equal(f.world.helm?.actor,A);
  f.run(A,{type:'ferry-sails'});f.run(B,{...idle,throttle:1,turn:1});assert.equal(f.world.ferry.speed,0);
  const initial=f.world.ferry.pose.z;
  for(let i=0;i<8;i++){f.run(A,{...idle,throttle:1});f.run(B,{...idle,turn:1},0);}
  assert.ok(f.world.ferry.pose.z<initial);assert.equal(f.world.ferry.pose.heading,0);
  for(const actor of [A,B]){const s=f.state(actor);assert.deepEqual(s.position,localToWorld(s.ferry.passenger!.local,s.ferry.pose));restore(s);}
  f.run(A,{type:'ferry-helm'});assert.equal(f.world.helm,null);assert.equal(f.state(A).ferry.passenger!.station,'deck');
});
test('disconnected helm lease expires, furls sails and allows another passenger to acquire control',()=>{
  const f=fixture();f.deck(A);f.helmWalk(A);f.deck(B);f.helmWalk(B);f.run(A,{type:'ferry-helm'});f.run(A,{type:'ferry-sails'});
  f.run(B,idle,HELM_LEASE_MS+1);assert.equal(f.world.helm,null);assert.equal(f.world.ferry.sails,'furled');assert.equal(f.state(A).ferry.passenger!.station,'deck');
  f.run(B,{type:'ferry-helm'});assert.equal(f.world.helm?.actor,B);
});
test('custody requires consent, reserves the source lot and conserves partial quantities and provenance',()=>{
  const f=fixture();f.choose();for(let i=0;i<4;i++)f.run(A,{type:'gather',id:'timber'});
  f.cargo(A,{type:'deposit',good:'wood',quantity:4,dock:'haven'});
  f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:2});assert.equal(f.state(B).logistics.lots.length,0);
  const refused=f.cargo(A,{type:'withdraw',lotId:'lot-1',quantity:1});assert.match(refused.message,/reserved/);assert.equal(f.state(A).inventory.wood,0);
  f.run(B,{type:'cargo-accept',offerId:'offer-1'});
  assert.equal(f.state(A).logistics.lots[0].quantity,2);const lot=f.state(B).logistics.lots[0];assert.equal(lot.quantity,2);assert.equal(lot.condition,100);assert.equal(lot.origin,'haven');assert.deepEqual(lot.provenance,{actor:A,rootId:'lot-1',room:'haven'});
  assert.equal(f.world.handoffs.length,1);assert.equal(f.world.offers.length,0);
  f.run(B,{type:'cargo-accept',offerId:'offer-1'});assert.equal(f.world.handoffs.length,1);
  for(const actor of [A,B])restore(f.state(actor));
});
test('wrong recipient, expiry, movement away and cancellation cannot transfer offered cargo',()=>{
  const f=fixture();f.choose();f.run(A,{type:'gather',id:'timber'});f.cargo(A,{type:'deposit',good:'wood',quantity:1,dock:'haven'});
  f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});f.run(A,{type:'cargo-accept',offerId:'offer-1'});assert.equal(f.world.handoffs.length,0);
  f.run(B,{type:'cargo-cancel',offerId:'offer-1'});assert.equal(f.world.offers.length,0);
  f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});f.run(B,{type:'cargo-accept',offerId:'offer-2'},OFFER_MS+1);assert.equal(f.world.handoffs.length,0);
  f.run(B,idle);f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});f.walk(B,-21,13);const s=f.run(B,{type:'cargo-accept',offerId:'offer-3'});assert.match(s.message,/remain beside/);assert.equal(f.state(A).logistics.lots[0].quantity,1);
});
test('room demand reservations are bounded across owners and remain bounded after a consigned handoff',()=>{
  const f=fixture();f.choose();for(const actor of [A,B]){for(let i=0;i<6;i++)f.run(actor,{type:'gather',id:'timber'});f.cargo(actor,{type:'deposit',good:'wood',quantity:6,dock:'haven'});}
  f.cargo(A,{type:'consign',lotId:'lot-1',quantity:6,orderId:'aurum-timber'});
  assert.match(f.cargo(B,{type:'consign',lotId:'lot-1',quantity:1,orderId:'aurum-timber'}).message,/Room demand/);
  f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:2});f.run(B,{type:'cargo-accept',offerId:'offer-1'});
  const reserved=[...f.players.values()].flatMap(p=>p.character.logistics.lots).filter(l=>l.orderId==='aurum-timber').reduce((n,l)=>n+l.quantity,0);assert.equal(reserved,6);restore(f.state(B));
});
test('handoff preserves worn component condition through withdrawal and later handoffs',()=>{
  const f=fixture();f.choose();
  // Controlled historical condition fixture: normal deposit, release, acceptance and reclaim paths follow.
  const p=f.players.get(A)!;p.character.items.push({id:'item-2',definitionId:'bolt',ownerId:'local-player',quantity:2,condition:31});p.character.nextItemId=3;
  f.cargo(A,{type:'deposit',good:'bolt',quantity:2,dock:'haven'});f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});f.run(B,{type:'cargo-accept',offerId:'offer-1'});
  assert.equal(f.state(B).logistics.lots[0].condition,31);f.cargo(B,{type:'withdraw',lotId:'lot-1',quantity:1});assert.equal(f.state(B).items.find(i=>i.definitionId==='bolt')!.condition,31);
});
test('foreign structures remain owned and block placement and foot movement',()=>{
  const f=fixture();f.choose();
  // A validated placed-workbench fixture avoids duplicating the recipe suite here.
  const p=f.players.get(A)!;p.character.items.push({id:'item-2',definitionId:'workbench',ownerId:'local-player',quantity:1,condition:100});p.character.nextItemId=3;p.character.placed.push({instanceId:'item-2',x:-18,z:10});
  restore(f.state(A));const before=f.state(A).placed.length;
  f.run(B,{type:'pack',instanceId:'item-2'});assert.equal(f.state(A).placed.length,before);
  f.walk(B,-18,13);
  const builder=f.players.get(B)!;builder.character.items.push({id:'item-2',definitionId:'hammer',ownerId:'local-player',quantity:1,condition:100},{id:'item-3',definitionId:'workbench',ownerId:'local-player',quantity:1,condition:100});builder.character.nextItemId=4;
  f.run(B,{type:'equip',instanceId:'item-2'});
  assert.match(f.run(B,{type:'place',instanceId:'item-3',x:-18,z:10}).message,/structure occupies/);assert.equal(f.state(B).placed.length,0);
  f.run(B,{type:'place',instanceId:'item-3',x:-21,z:10});assert.equal(f.state(B).placed.length,1);
  for(let i=0;i<10;i++)f.run(B,{...idle,dz:-1});assert.ok(f.state(B).position.z>11);
  const publicObjects=projectWorld(f.world,f.players,B,f.now()).shared!.placements;assert.equal(publicObjects[0].actor,A);assert.equal(Object.hasOwn(publicObjects[0],'items'),false);
});

function service(t:any) {
  let now=1700000000000;t.mock.method(Date,'now',()=>now);const secret='shared-test-key-with-at-least-32-bytes';
  const stores=new Map<string,Map<string,unknown>>(),instances=new Map<string,SharedWorld>();let tail=Promise.resolve();let failKey='';
  const env:any={AUTHORITY_SIGNING_KEY:secret,SHARED_WORLDS:{idFromName:(id:string)=>id,get:(id:string)=>({fetch:(r:Request)=>{
    if(!stores.has(id))stores.set(id,new Map());
    if(!instances.has(id))instances.set(id,new SharedWorld({storage:{transaction:(fn:any)=>{
      const pending=tail.then(async()=>{const draft=structuredClone(stores.get(id)!);const out=await fn({get:async(k:string)=>structuredClone(draft.get(k)),put:async(k:string,v:unknown)=>{if(k===failKey)throw new Error('injected write failure');draft.set(k,structuredClone(v));}});stores.set(id,draft);return out;});tail=pending.catch(()=>{});return pending;
    }}} as any));return instances.get(id)!.fetch(r);
  }})}};
  const token=(actor=A,room='haven')=>issueSession(secret,actor,room);
  const call=async(actor=A,body?:unknown,room='haven')=>{now+=100;const credential=await token(actor,room);return worker.fetch(new Request(`https://game.test/api/world/${room}/${body?'command':'snapshot'}`,{method:body?'POST':'GET',headers:{authorization:'Bearer '+credential},...(body?{body:JSON.stringify(body)}:{})}),env);};
  const read=async(actor=A,room='haven')=>await (await call(actor,undefined,room)).json() as any;
  const send=async(actor:string,command:Intent)=>{const s=await read(actor);const envelope={sequence:s.sequence+1,commandId:crypto.randomUUID(),command};const response=await call(actor,envelope);assert.equal(response.status,200);return {snapshot:await response.json() as any,envelope};};
  const transport:typeof fetch=async(input:any,init:any)=>{now+=100;return worker.fetch(new Request('https://game.test'+input,init),env);};
  return {env,stores,instances,call,read,send,token,transport,fail:(key:string)=>failKey=key};
}
test('HTTP authority shares last resources atomically, isolates rooms and never exposes another inventory',async t=>{
  const e=service(t);await e.read(A);await e.read(B);
  for(let i=0;i<39;i++)await e.send(A,{type:'gather',id:'timber'});
  const a=await e.read(A),b=await e.read(B);
  await Promise.all([e.call(A,{sequence:a.sequence+1,commandId:'race-a',command:{type:'gather',id:'timber'}}),e.call(B,{sequence:b.sequence+1,commandId:'race-b',command:{type:'gather',id:'timber'}})]);
  const finalA=await e.read(A),finalB=await e.read(B);assert.equal(finalA.state.nodes.timber,0);assert.equal(finalB.state.nodes.timber,0);assert.equal(finalA.state.inventory.wood+finalB.state.inventory.wood,40);
  assert.equal((await e.read(A,'aurum')).state.nodes.timber,40);assert.equal(Object.hasOwn(finalB.shared.players.find((p:any)=>p.actor===A),'inventory'),false);
});
test('HTTP handoff commits both journals and survives lost acknowledgements and room eviction',async t=>{
  const e=service(t);for(const actor of [A,B])await e.send(actor,{type:'choose-profession',profession:'transport'});
  await e.send(A,{type:'gather',id:'timber'});await e.send(A,{type:'cargo',envelope:{commandId:'deposit',expectedRevision:0,command:{type:'deposit',good:'wood',quantity:1,dock:'haven'}}});
  await e.send(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});const accepted=await e.send(B,{type:'cargo-accept',offerId:'offer-1'});
  const retry=await e.call(B,accepted.envelope);assert.equal((await retry.json() as any).duplicate,true);e.instances.clear();
  assert.equal((await e.read(A)).state.logistics.lots.length,0);const receiver=await e.read(B);assert.equal(receiver.state.logistics.lots[0].quantity,1);assert.equal(receiver.state.logistics.events.filter((e:any)=>e.type==='CargoAccepted').length,1);
});
test('failure on a non-caller storage write rolls back both players, offer and acknowledgement',async t=>{
  const e=service(t);for(const actor of [A,B])await e.send(actor,{type:'choose-profession',profession:'transport'});
  await e.send(A,{type:'gather',id:'timber'});await e.send(A,{type:'cargo',envelope:{commandId:'deposit',expectedRevision:0,command:{type:'deposit',good:'wood',quantity:1,dock:'haven'}}});await e.send(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:1});
  const b=await e.read(B),request={sequence:b.sequence+1,commandId:'accept-atomic',command:{type:'cargo-accept',offerId:'offer-1'}};
  e.fail('player:'+A);await assert.rejects(e.call(B,request));e.fail('');
  assert.equal((await e.read(A)).state.logistics.lots[0].quantity,1);assert.equal((await e.read(B)).sequence,b.sequence);assert.equal((await e.read(B)).shared.offers.length,1);
  assert.equal((await e.call(B,request)).status,200);assert.equal((await e.read(B)).state.logistics.lots[0].quantity,1);
});
test('admission is bounded and credentials cannot join a different room',async t=>{
  const e=service(t);for(let i=1;i<=8;i++)assert.equal((await e.call('player_'+String(i).padStart(3,'0'))).status,200);
  assert.equal((await e.call('player_009')).status,403);
  const credential=await e.token(A,'haven');const denied=await worker.fetch(new Request('https://game.test/api/world/aurum/snapshot',{headers:{authorization:'Bearer '+credential}}),e.env);assert.equal(denied.status,401);
});
test('consigned supplies pass to another captain, reach a shared colony and earn completion once',()=>{
  const f=fixture();f.choose();for(let i=0;i<6;i++)f.run(A,{type:'gather',id:'timber'});
  f.cargo(A,{type:'deposit',good:'wood',quantity:6,dock:'haven'});f.cargo(A,{type:'consign',lotId:'lot-1',quantity:6,orderId:'aurum-timber'});
  f.run(A,{type:'cargo-offer',lotId:'lot-1',quantity:2,recipient:B});f.run(B,{type:'cargo-accept',offerId:'offer-1'});
  f.cargo(B,{type:'transfer',lotId:'lot-1',quantity:2,to:'ship'});f.run(B,{type:'board'});f.walk(B,3,-19);
  f.cargo(B,{type:'transfer',lotId:'lot-1',quantity:2,to:'aurum-store'});f.cargo(B,{type:'fulfill',lotId:'lot-1',quantity:2});
  assert.equal(f.state(A).colonies[1].stock.wood,2);assert.equal(f.state(B).logistics.reputation,20);assert.equal(f.state(B).logistics.lots.length,0);
  f.cargo(B,{type:'fulfill',lotId:'lot-1',quantity:2});assert.equal(f.state(A).colonies[1].stock.wood,2);assert.equal(f.state(B).logistics.reputation,20);restore(f.state(B));
});
test('warehouse capacity is shared across owners and an accepted handoff does not create extra space or goods',()=>{
  const f=fixture();f.choose();for(const p of f.players.values())p.character.inventory.food=100;
  f.cargo(A,{type:'deposit',good:'food',quantity:100,dock:'haven'});
  const blocked=f.cargo(B,{type:'deposit',good:'food',quantity:29,dock:'haven'});assert.match(blocked.message,/Shared custodian capacity/);assert.equal(blocked.inventory.food,100);assert.equal(blocked.logistics.revision,0);
  f.cargo(B,{type:'deposit',good:'food',quantity:28,dock:'haven'});f.run(A,{type:'cargo-offer',recipient:B,lotId:'lot-1',quantity:20});f.run(B,{type:'cargo-accept',offerId:'offer-1'});
  const view=projectWorld(f.world,f.players,B,f.now()).shared!;assert.equal(view.freight.haven,128);assert.equal(f.state(A).logistics.lots[0].quantity,80);assert.equal(f.state(B).logistics.lots.reduce((n,l)=>n+l.quantity,0),48);
});
test('shared clients have distinct outboxes from private play and accept other actors world updates',async t=>{
  const e=service(t),values=new Map<string,string>();const privateKey='emberfall.authority.pending:haven:'+A;
  values.set(privateKey,JSON.stringify({sequence:1,commandId:'old-private',command:{type:'gather',id:'timber'}}));
  const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  let view:any;
  const a=new AuthorityClient('haven',await e.token(A),store,s=>view=s,()=>{},e.transport,'shared');
  const b=new AuthorityClient('haven',await e.token(B),store,()=>{},()=>{},e.transport,'shared');
  await a.connect();await b.connect();assert.equal(a.pending,undefined);assert.equal(view.state.inventory.wood,0);
  await a.send({type:'gather',id:'timber'});await b.send({type:'gather',id:'timber'});await a.send(idle);
  assert.equal(view.state.nodes.timber,38);assert.equal(view.state.inventory.wood,1);assert.equal(view.shared.players.length,2);assert.equal(view.sequence,2);assert.ok(values.has(privateKey));assert.equal(values.size,1);
});
