import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restore } from '../packages/game-core/index.ts';
import { initialLogistics } from '../packages/logistics/index.ts';
import { initialEconomy, produce, settleContracts, validateEconomy, productionBlocker, appendEconomy, type ContractTotal } from '../packages/colonies/index.ts';
import { applyWorldIntent, initialWorld, initialPlayer, compose, ensureEconomy, contractTotals, projectWorld, type Players } from '../packages/authority/world.ts';
import { parseEnvelope, type Intent } from '../packages/authority/protocol.ts';
import worker from '../worker/index.ts';
import { SharedWorld } from '../worker/shared-world.ts';
import { issueSession } from '../worker/session.ts';
import { AuthorityClient } from '../packages/authority/client.ts';

const A='player_001',B='player_002';
const idle={type:'frame' as const,dx:0,dz:0,turn:0,throttle:0};
const totals=(complete=false):ContractTotal[]=>initialLogistics().orders.map(o=>({id:o.id,required:o.required,fulfilled:complete?o.required:0,reserved:0,inTransit:0}));
test('production consumes exact inputs and finite reserves, honors locks and runs once per cycle',()=>{
  const colonies=initialState().colonies,e=initialEconomy();produce(e,colonies,10);
  assert.equal(colonies[1].stock.food,24);assert.equal(colonies[1].stock.stone,2);assert.equal(e.reserves.aurum.stone,62);assert.equal(e.batches.granite,1);
  assert.match(productionBlocker(e,colonies[0],'forestry')!,/haven-provisions/);assert.match(productionBlocker(e,colonies[1],'gold-wash')!,/aurum-timber/);
  const after=structuredClone({e,colonies});produce(e,colonies,10);assert.deepEqual({e,colonies},after);validateEconomy(e,10,totals());
});
test('input and output shortages are atomic; priority uses bounded settler labor',()=>{
  const colonies=initialState().colonies,e=initialEconomy();colonies[1].population=8;colonies[1].stock.wood=1;e.focus.aurum='granite';
  produce(e,colonies,10);assert.equal(e.batches.granite,1);assert.equal(e.batches.provisions,0);assert.equal(colonies[1].stock.wood,1);
  colonies[1].stock.stone=100000;colonies[1].stock.wood=0;const food=colonies[1].stock.food,reserve=e.reserves.aurum.stone;
  produce(e,colonies,20);assert.equal(colonies[1].stock.food,food);assert.equal(e.reserves.aurum.stone,reserve);
});
test('all preview production reserves exhaust without replenishment or unbounded output',()=>{
  const colonies=initialState().colonies,e=initialEconomy(0,totals(true));for(const c of colonies){c.stock.food=1000;c.stock.wood=1000;}
  for(let tick=10;tick<=1000;tick+=10)produce(e,colonies,tick);
  assert.deepEqual(e.batches,{forestry:20,provisions:24,granite:32,'gold-wash':4});
  assert.deepEqual(e.reserves,{haven:{wood:0,stone:0,gold:0,food:0},aurum:{wood:0,stone:0,gold:0,food:0}});
  assert.equal(colonies[0].stock.wood,1040);assert.equal(colonies[0].stock.food,980);assert.equal(colonies[1].stock.food,1056);assert.equal(colonies[1].stock.wood,976);assert.equal(colonies[1].stock.stone,64);assert.equal(colonies[1].stock.gold,4);
  const events=e.events.length;produce(e,colonies,1010);assert.equal(e.events.length,events);validateEconomy(e,1010,totals(true));
});
test('audit capacity pauses production and reserves room for both one-time contract benefits',()=>{
  const colonies=initialState().colonies,e=initialEconomy();for(let i=0;i<254;i++)appendEconomy(e,{type:'FocusChanged',actor:A,colony:'aurum',recipe:'granite',tick:i*10});
  const stock=structuredClone(colonies);produce(e,colonies,2540);assert.deepEqual(colonies,stock);settleContracts(e,colonies,totals(true),A,2540);
  assert.equal(e.events.length,256);assert.equal(colonies[0].population,10);assert.equal(colonies[1].population,18);
  settleContracts(e,colonies,totals(true),B,2540);assert.equal(e.events.length,256);validateEconomy(e,2540,totals(true));
});
test('economy validation detects reserve corruption, duplicate batches and changed completion identity',()=>{
  const colonies=initialState().colonies,e=initialEconomy();produce(e,colonies,10);const corrupt=structuredClone(e);corrupt.reserves.aurum.stone++;assert.throws(()=>validateEconomy(corrupt,10,totals()));
  const duplicate=structuredClone(e);duplicate.events.push({...duplicate.events[0],sequence:2});duplicate.batches.granite++;duplicate.reserves.aurum.stone-=2;assert.throws(()=>validateEconomy(duplicate,10,totals()));
  settleContracts(e,colonies,totals(true),A,10);e.completed['aurum-timber']!.actor=B;assert.throws(()=>validateEconomy(e,10,totals(true)));
});
test('colony protocol rejects private-mode commands, client yields, unknown recipes and invalid quantities',()=>{
  for(const command of [{type:'colony-load',colony:'haven',good:'relic',quantity:1},{type:'colony-contribute',colony:'haven',good:'food',quantity:-1},{type:'colony-load',colony:'aurum',good:'gold',quantity:33},{type:'colony-focus',colony:'haven',recipe:'granite'},{type:'colony-focus',colony:'aurum',recipe:'__proto__'},{type:'colony-load',colony:'aurum',good:'food',quantity:1,yield:999}])assert.throws(()=>parseEnvelope({sequence:1,commandId:'bad',command},true));
  const envelope={sequence:1,commandId:'valid',command:{type:'colony-load',colony:'aurum',good:'food',quantity:4}};assert.throws(()=>parseEnvelope(envelope));assert.doesNotThrow(()=>parseEnvelope(envelope,true));
});
function fixture(){let now=1700000000000;const world=initialWorld('haven',now),players:Players=new Map();for(const actor of [A,B]){world.members.push(actor);players.set(actor,initialPlayer(actor,now));}
 const run=(actor:string,c:Intent,dt=100)=>{now+=dt;applyWorldIntent(world,players,actor,c,now);players.get(actor)!.sequence++;return compose(world,players.get(actor)!);};
 const state=(actor=A)=>compose(world,players.get(actor)!);
 const cargo=(actor:string,command:any)=>run(actor,{type:'cargo',envelope:{commandId:crypto.randomUUID(),expectedRevision:state(actor).logistics.revision,command}});
 const walk=(actor:string,x:number,z:number)=>{for(let i=0;i<2000;i++){const p=state(actor).position,dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)<0.3)return;run(actor,{...idle,dx:Math.abs(dx)>0.2?Math.sign(dx):0,dz:Math.abs(dz)>0.2?Math.sign(dz):0});}throw new Error('Navigation failed');};
 const choose=()=>{run(A,{type:'choose-profession',profession:'transport'});run(B,{type:'choose-profession',profession:'shipwright'});};
 const outbound=(delivered=6)=>{for(let i=0;i<6;i++)run(A,{type:'gather',id:'timber'});cargo(A,{type:'deposit',good:'wood',quantity:6,dock:'haven'});cargo(A,{type:'consign',lotId:'lot-1',quantity:6,orderId:'aurum-timber'});cargo(A,{type:'transfer',lotId:'lot-1',quantity:6,to:'ship'});run(A,{type:'board'});walk(A,3,-19);cargo(A,{type:'transfer',lotId:'lot-1',quantity:6,to:'aurum-store'});cargo(A,{type:'fulfill',lotId:'lot-1',quantity:delivered});};
 const homebound=()=>{run(A,{type:'colony-load',colony:'aurum',good:'food',quantity:4});cargo(A,{type:'consign',lotId:'lot-2',quantity:4,orderId:'haven-provisions'});cargo(A,{type:'transfer',lotId:'lot-2',quantity:4,to:'ship'});walk(A,-3,13);cargo(A,{type:'transfer',lotId:'lot-2',quantity:4,to:'haven-store'});cargo(A,{type:'fulfill',lotId:'lot-2',quantity:4});};
 return{world,players,run,state,cargo,walk,choose,outbound,homebound,now:()=>now};}
test('public-command two-colony voyage completes contracts once, unlocks production and loads its finite output',()=>{
  const f=fixture();f.choose();f.outbound();assert.equal(f.world.colonies[1].population,18);assert.equal(f.state().logistics.reputation,60);assert.equal(f.world.economy.completed['aurum-timber']!.actor,A);
  f.homebound();assert.equal(f.world.colonies[0].population,10);assert.equal(f.state().logistics.reputation,100);
  const scores=projectWorld(f.world,f.players,A,f.now()).shared!.contributions;assert.equal(scores.total,100);assert.equal(scores.players[0].id,A);assert.equal(scores.professions[0].id,'transport');assert.deepEqual(scores.colonies.map(r=>[r.id,r.points]),[['aurum',60],['haven',40]]);
  const deadline=Math.floor(f.world.tick/10)*10+10;while(f.world.tick<deadline)f.run(A,idle);
  assert.equal(f.world.economy.batches.forestry,1);const before=f.world.colonies[0].stock.wood;
  f.run(A,{type:'colony-load',colony:'haven',good:'wood',quantity:2});const lot=f.state().logistics.lots.find(l=>l.id==='lot-3')!;assert.equal(lot.quantity,2);assert.equal(lot.origin,'haven');assert.equal(lot.custodian,'haven-store');assert.equal(f.world.colonies[0].stock.wood,before-2);
  f.cargo(A,{type:'fulfill',lotId:'lot-2',quantity:4});assert.equal(f.world.colonies[0].population,10);assert.equal(f.world.economy.events.filter(e=>e.type==='ContractCompleted').length,2);assert.equal(f.state().logistics.reputation,100);restore(f.state());
});
test('contributions debit carried supplies with no delivery credit and remote stock loading is refused',()=>{
  const f=fixture();f.choose();const before=f.state().inventory.food;f.run(A,{type:'colony-contribute',colony:'haven',good:'food',quantity:3});assert.equal(f.state().inventory.food,before-3);assert.equal(f.world.colonies[0].stock.food,3);assert.equal(f.state().logistics.reputation,0);
  const denied=f.run(A,{type:'colony-load',colony:'aurum',good:'food',quantity:4});assert.match(denied.message,/approach/);assert.equal(denied.logistics.lots.length,0);
  f.run(B,{type:'colony-load',colony:'haven',good:'food',quantity:2});assert.equal(f.world.colonies[0].stock.food,1);assert.equal(f.state(B).logistics.lots[0].quantity,2);assert.equal(f.state(B).logistics.reputation,0);restore(f.state(B));
});
test('legacy room economy migration preserves stock and previous completions without granting settlers again',()=>{
  const f=fixture();f.choose();f.outbound();f.homebound();f.world.colonies[0].population=8;f.world.colonies[1].population=16;const before=structuredClone(f.world.colonies);delete (f.world as any).economy;
  ensureEconomy(f.world,f.players);assert.deepEqual(f.world.colonies,before);assert.equal(f.world.economy.completed['aurum-timber']!.imported,true);assert.equal(f.world.economy.events.length,0);
  f.run(A,idle);assert.equal(f.world.colonies[0].population,8);assert.equal(f.world.colonies[1].population,16);assert.equal(f.world.economy.events.filter(e=>e.type==='ContractCompleted').length,0);
});
test('changing production focus is local, auditable and does not reset reserves or production time',()=>{
  const f=fixture();f.choose();assert.match(f.run(A,{type:'colony-focus',colony:'aurum',recipe:'granite'}).message,/approach/);f.run(A,{type:'board'});f.walk(A,3,-19);
  const before=structuredClone(f.world.economy.reserves),cycle=f.world.economy.lastCycleTick;f.run(A,{type:'colony-focus',colony:'aurum',recipe:'granite'});
  assert.equal(f.world.economy.focus.aurum,'granite');assert.deepEqual(f.world.economy.reserves,before);assert.equal(f.world.economy.lastCycleTick,cycle);assert.equal(f.world.economy.events.at(-1)!.type,'FocusChanged');assert.match(f.run(A,{type:'colony-focus',colony:'aurum',recipe:'provisions'}).message,/once per production cycle/);assert.equal(f.world.economy.focus.aurum,'granite');
});
function service(t:any){let now=1700000000000;t.mock.method(Date,'now',()=>now);const secret='colony-test-key-at-least-thirty-two-bytes';const stores=new Map<string,Map<string,unknown>>(),rooms=new Map<string,SharedWorld>();let tail=Promise.resolve(),fail='';
 const env:any={AUTHORITY_SIGNING_KEY:secret,SHARED_WORLDS:{idFromName:(id:string)=>id,get:(id:string)=>({fetch:(request:Request)=>{if(!stores.has(id))stores.set(id,new Map());if(!rooms.has(id))rooms.set(id,new SharedWorld({storage:{transaction:(fn:any)=>{const next=tail.then(async()=>{const draft=structuredClone(stores.get(id)!);const result=await fn({get:async(k:string)=>structuredClone(draft.get(k)),put:async(k:string,v:unknown)=>{if(k===fail)throw new Error('injected persistence failure');draft.set(k,structuredClone(v));}});stores.set(id,draft);return result;});tail=next.catch(()=>{});return next;}}} as any));return rooms.get(id)!.fetch(request);}})}};
 const call=async(actor=A,body?:unknown)=>{now+=100;const token=await issueSession(secret,actor,'haven');return worker.fetch(new Request(`https://game.test/api/world/haven/${body?'command':'snapshot'}`,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})}),env);};
 const read=async(actor=A)=>await (await call(actor)).json() as any;
 const send=async(actor:string,command:Intent)=>{const before=await read(actor),envelope={sequence:before.sequence+1,commandId:crypto.randomUUID(),command};const r=await call(actor,envelope);assert.equal(r.status,200);return{snapshot:await r.json() as any,envelope};};return{call,read,send,stores,rooms,fail:(key:string)=>fail=key};}
test('HTTP stock release retries and room eviction do not duplicate cargo or colony debit',async t=>{
  const e=service(t);await e.send(A,{type:'choose-profession',profession:'transport'});await e.send(A,{type:'colony-contribute',colony:'haven',good:'food',quantity:4});const first=await e.send(A,{type:'colony-load',colony:'haven',good:'food',quantity:3});
  assert.equal((await (await e.call(A,first.envelope)).json() as any).duplicate,true);e.rooms.clear();const after=await e.read();assert.equal(after.state.colonies[0].stock.food,1);assert.equal(after.state.logistics.lots[0].quantity,3);assert.equal(after.state.logistics.events.filter((v:any)=>v.type==='ColonyStockReleased').length,1);assert.equal(after.shared.economy.recent.filter((v:any)=>v.type==='ColonyStockReleased').length,1);
});
test('competing HTTP stock releases conserve the last colony unit across owners',async t=>{
  const e=service(t);for(const actor of[A,B])await e.send(actor,{type:'choose-profession',profession:'transport'});await e.send(A,{type:'colony-contribute',colony:'haven',good:'food',quantity:1});const a=await e.read(A),b=await e.read(B);
  await Promise.all([e.call(A,{sequence:a.sequence+1,commandId:'race-a',command:{type:'colony-load',colony:'haven',good:'food',quantity:1}}),e.call(B,{sequence:b.sequence+1,commandId:'race-b',command:{type:'colony-load',colony:'haven',good:'food',quantity:1}})]);
  const x=await e.read(A),y=await e.read(B);assert.equal(x.state.colonies[0].stock.food,0);assert.equal([...x.state.logistics.lots,...y.state.logistics.lots].reduce((n,l)=>n+l.quantity,0),1);
});
test('failure after world debit rolls back colony stock, audit and character cargo together',async t=>{
  const e=service(t);await e.send(A,{type:'choose-profession',profession:'transport'});await e.send(A,{type:'colony-contribute',colony:'haven',good:'food',quantity:2});const before=await e.read();const command={sequence:before.sequence+1,commandId:'atomic-load',command:{type:'colony-load',colony:'haven',good:'food',quantity:2}};
  e.fail('player:'+A);await assert.rejects(e.call(A,command));e.fail('');const failed=await e.read();assert.equal(failed.sequence,before.sequence);assert.equal(failed.state.colonies[0].stock.food,2);assert.equal(failed.state.logistics.lots.length,0);assert.deepEqual(failed.shared.economy.recent,before.shared.economy.recent);
  assert.equal((await e.call(A,command)).status,200);assert.equal((await e.read()).state.logistics.lots[0].quantity,2);
});
test('loading an old stored world migrates once; an unknown economy version fails closed',async t=>{
  const e=service(t);await e.read();const store=e.stores.get('haven')!,world=store.get('world') as any;delete world.economy;store.set('world',world);e.rooms.clear();assert.equal((await e.read()).shared.economy.cycleEveryTicks,10);assert.equal((store.get('world') as any).economy,undefined);
  const persisted=e.stores.get('haven')!;assert.equal((persisted.get('world') as any).economy.version,1);(persisted.get('world') as any).economy.version=999;assert.equal((await e.call()).status,409);assert.equal((e.stores.get('haven')!.get('world') as any).economy.version,999);
});
test('partial legacy fulfillment remains open on migration and earns the benefit only on its final delivery',()=>{
  const f=fixture();f.choose();f.outbound(4);assert.equal(f.world.colonies[1].population,16);delete (f.world as any).economy;ensureEconomy(f.world,f.players);
  assert.equal(f.world.economy.completed['aurum-timber'],undefined);f.cargo(A,{type:'fulfill',lotId:'lot-1',quantity:2});assert.equal(f.world.colonies[1].population,18);assert.equal(f.world.economy.completed['aurum-timber']!.imported,false);
  f.cargo(A,{type:'fulfill',lotId:'lot-1',quantity:2});assert.equal(f.world.colonies[1].population,18);assert.equal(f.world.economy.events.filter(e=>e.type==='ContractCompleted').length,1);
});
test('colony stock release respects the warehouse capacity shared by every owner',()=>{
  const f=fixture();f.choose();f.world.colonies[0].stock.food=200;
  for(let i=0;i<4;i++)f.run(A,{type:'colony-load',colony:'haven',good:'food',quantity:32});
  const denied=f.run(B,{type:'colony-load',colony:'haven',good:'food',quantity:1});assert.match(denied.message,/warehouse capacity/);assert.equal(f.world.colonies[0].stock.food,72);assert.equal(f.state(B).logistics.lots.length,0);assert.equal(f.state(A).logistics.lots.reduce((n,l)=>n+l.quantity,0),128);
});
test('new clients refuse an older shared server before publishing an incompatible colony view',async()=>{
  let published=false;const transport:typeof fetch=async()=>new Response(JSON.stringify({protocol:1,authority:'shared',actor:A,room:'haven',sequence:0,state:initialState(),shared:{revision:0,players:[],placements:[],helmActor:null,offers:[],orders:[],freight:{haven:0,aurum:0,ferry:0}}}),{headers:{'content-type':'application/json'}});
  const client=new AuthorityClient('haven','test-token',{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},()=>{published=true;},()=>{},transport,'shared');
  await assert.rejects(client.connect(),/Colony server update required/);assert.equal(published,false);assert.equal(client.snapshot,undefined);
});
