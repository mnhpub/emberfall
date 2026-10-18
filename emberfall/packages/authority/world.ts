import { projectContributions } from '../contributions/index.ts';
import { initialState, restore, transition, type State } from '../game-core/index.ts';
import { definition } from '../game-core/catalog.ts';
import { FERRY, localToWorld, type Ferry } from '../vessels/index.ts';
import { DOCKS, initialLogistics, reduceCargo, type CargoEvent } from '../logistics/index.ts';
import { initialEconomy, projectEconomy, produce, settleContracts, validateEconomy, isColonyIntent, hasEconomySpace, appendEconomy, COLONY_GOODS, RECIPES, type Economy, type ContractTotal, type ColonyIntent } from '../colonies/index.ts';
import { acceptCustody } from './custody.ts';
import { isCustodyIntent, type CargoOffer, type GameIntent, type Intent, type PublicPlacement, type SharedView, type Snapshot } from './protocol.ts';

const commonKeys=['tick','nodes','salvage','colonies','beast','recovered','delivered'] as const;
type Common=Pick<State,typeof commonKeys[number]>;
export type Character=Omit<State,keyof Common|'ferry'> & {passenger:Ferry['passenger']};
export type PlayerRecord={actor:string;sequence:number;lastAt:number;seenAt:number;character:Character;receipt?:{commandId:string;fingerprint:string}};
export type Handoff={offerId:string;sender:string;recipient:string;sourceLot:string;receivedLot:string;quantity:number;at:number};
export type World=Common & {schema:1;room:string;revision:number;lastAt:number;tickMs:number;
  ferry:Omit<Ferry,'passenger'>;helm:{actor:string;expiresAt:number}|null;
  controls:{throttle:number;turn:number;until:number};members:string[];offers:CargoOffer[];nextOffer:number;handoffs:Handoff[];economy:Economy};
export type Players=Map<string,PlayerRecord>;
export const ROOM_CAPACITY=8;
export const HELM_LEASE_MS=5000;
export const ACTIVE_MS=45000;
export const OFFER_MS=120000;

function common(s:Common):Common {return Object.fromEntries(commonKeys.map(k=>[k,structuredClone(s[k])])) as Common;}
export function initialWorld(room:string,now:number):World {
  const s=initialState();const {passenger:_,...ferry}=s.ferry;
  return {...common(s),schema:1,room,revision:0,lastAt:now,tickMs:0,ferry,helm:null,controls:{throttle:0,turn:0,until:0},members:[],offers:[],nextOffer:1,handoffs:[],economy:initialEconomy()};
}
export function contractTotals(players:Players):ContractTotal[] {
  const lots=[...players.values()].flatMap(p=>p.character.logistics.lots);
  return initialLogistics().orders.map(o=>({id:o.id,required:o.required,
    fulfilled:[...players.values()].reduce((n,p)=>n+(p.character.logistics.orders.find(a=>a.id===o.id)?.fulfilled??0),0),
    reserved:lots.filter(l=>l.orderId===o.id).reduce((n,l)=>n+l.quantity,0),
    inTransit:lots.filter(l=>l.orderId===o.id && l.shipped && l.custodian!==DOCKS[o.destination].warehouse).reduce((n,l)=>n+l.quantity,0)}));
}
/** Upgrade 0.7 rooms in place. Preserve stock/fulfillment and do not replay historical rewards. */
export function ensureEconomy(world:World,players:Players) {
  if(world.economy===undefined)world.economy=initialEconomy(world.tick,contractTotals(players));
  validateEconomy(world.economy,world.tick,contractTotals(players));
  projectContributions(world.room,[...players.values()].map(p=>({actor:p.actor,profession:p.character.profession,logistics:p.character.logistics})));
}
export function character(s:State):Character {
  const {ferry,...rest}=structuredClone(s);for(const k of commonKeys) delete (rest as Partial<State>)[k];
  return {...rest,passenger:ferry.passenger} as Character;
}
export function initialPlayer(actor:string,now:number):PlayerRecord {return {actor,sequence:0,lastAt:now,seenAt:now,character:character(initialState())};}
export function compose(world:World,p:PlayerRecord):State {
  const {passenger,...own}=structuredClone(p.character);
  const attachment=passenger?{...passenger,station:world.helm?.actor===p.actor?'helm' as const:'deck' as const}:null;
  return {...own,...common(world),ferry:{...structuredClone(world.ferry),passenger:attachment},
    position:attachment?localToWorld(attachment.local,world.ferry.pose):own.position};
}
function saveState(world:World,p:PlayerRecord,s:State) {Object.assign(world,common(s));const {passenger:_,...ferry}=s.ferry;world.ferry=structuredClone(ferry);p.character=character(s);}
export function placements(players:Players):PublicPlacement[] {
  return [...players.values()].flatMap(p=>p.character.placed.map(o=>({actor:p.actor,...o,definitionId:p.character.items.find(i=>i.id===o.instanceId)!.definitionId})));
}
export function projectWorld(world:World,players:Players,actor:string,now:number):Snapshot {
  const p=players.get(actor)!;
  const view={...world,helm:world.helm && world.helm.expiresAt>now?world.helm:null};
  const shared:SharedView={revision:world.revision,
    players:[...players.values()].filter(p=>p.actor===actor || now-p.seenAt<ACTIVE_MS).map(p=>{const s=compose(view,p);return {actor:p.actor,position:s.position,mode:s.mode,profession:s.profession};}),
    placements:placements(players),helmActor:world.helm && world.helm.expiresAt>now?world.helm.actor:null,
    offers:world.offers.filter(o=>o.expiresAt>now && (o.sender===actor || o.recipient===actor)),
    contributions:projectContributions(world.room,[...players.values()].map(p=>({actor:p.actor,profession:p.character.profession,logistics:p.character.logistics}))),
    orders:contractTotals(players),economy:projectEconomy(world.economy,world.colonies,contractTotals(players),world.tick),
    freight:{haven:0,aurum:0,ferry:0}};
  for(const lot of [...players.values()].flatMap(p=>p.character.logistics.lots)) {
    if(lot.custodian==='haven-store')shared.freight.haven+=lot.quantity;
    if(lot.custodian==='aurum-store')shared.freight.aurum+=lot.quantity;
    if(lot.custodian==='ferry')shared.freight.ferry+=lot.quantity;
  }
  return {protocol:1,authority:'shared',actor,room:world.room,sequence:p.sequence,state:compose(view,p),shared};
}
function positionNear(a:{x:number;z:number},b:{x:number;z:number},range=6) {return Math.hypot(a.x-b.x,a.z-b.z)<=range;}
function overlapsForeign(players:Players,actor:string,x:number,z:number,w=0.7,d=0.7) {
  return placements(players).some(o=>{if(o.actor===actor)return false;const f=definition(o.definitionId).footprint!;return Math.abs(x-o.x)<(w+f[0])/2+0.3 && Math.abs(z-o.z)<(d+f[1])/2+0.3;});
}
function commonCustodian(world:World,id:string) {
  if(id==='haven-store')return DOCKS.haven;
  if(id==='aurum-store')return DOCKS.aurum;
  if(id==='ferry' && world.ferry.speed<0.1)return localToWorld(FERRY.gangway,world.ferry.pose);
  return null;
}
function cancelStale(world:World,players:Players,now:number) {
  world.offers=world.offers.filter(o=>o.expiresAt>now);
  if(world.helm && world.helm.expiresAt<=now) {
    const owner=players.get(world.helm.actor);
    if(owner?.character.passenger)owner.character.passenger.station='deck';
    world.helm=null;world.controls={throttle:0,turn:0,until:0};world.ferry.sails='furled';
  }
}
/** Shared time is based on the room clock, never summed from player clocks. No idle catch-up. */
function advanceWorld(world:World,players:Players,actor:string,intent:Intent,now:number) {
  cancelStale(world,players,now);
  const dt=Math.min(100,Math.max(0,now-world.lastAt));world.lastAt=now;world.tickMs+=dt;
  if(world.helm?.actor===actor) {
    world.helm.expiresAt=now+HELM_LEASE_MS;
    if(intent.type==='frame')world.controls={throttle:intent.throttle,turn:intent.turn,until:now+350};
  }
  const driver=players.get(world.helm?.actor??actor)!;
  let s=compose(world,driver);
  const before=structuredClone(world.ferry);
  const controls=world.controls.until>=now?world.controls:{throttle:0,turn:0};
  s=transition(s,{type:'ferry-step',dt:dt/1000,...controls});
  const hit=[...players.values()].some(p=>{
    const ship=p.character.ship,pose=s.ferry.pose,x=ship.x-pose.x,z=ship.z-pose.z,c=Math.cos(pose.heading),sn=Math.sin(pose.heading);
    return Math.abs(c*x-sn*z)<12 && Math.abs(sn*x+c*z)<82;
  });
  if(hit) {s.ferry={...before,speed:0,passenger:s.ferry.passenger};if(s.ferry.passenger)s.position=localToWorld(s.ferry.passenger.local,before.pose);}
  saveState(world,driver,s);
  if(world.tickMs>=1000) {
    const clockState=compose(world,driver);clockState.mode='foot';clockState.ferry.passenger=null;
    const ticked=transition(clockState,{type:'tick'});
    // Shared production replaces the old unbounded scripted colony increments.
    ticked.colonies=world.colonies;Object.assign(world,common(ticked));world.tickMs-=1000;
    produce(world.economy,world.colonies,world.tick);
    for(const p of players.values())if(p.character.mode==='ship' && world.beast.hp>0 && positionNear(p.character.position,{x:0,z:-10},6))p.character.ship.hull=Math.max(0,p.character.ship.hull-5);
  }
}
function custodyIntent(world:World,players:Players,actor:string,c:Intent,now:number):string {
  const p=players.get(actor)!;
  if(c.type==='cargo-cancel') {
    const offer=world.offers.find(o=>o.id===c.offerId);
    if(!offer || (offer.sender!==actor && offer.recipient!==actor))return 'No pending offer belongs to you.';
    world.offers=world.offers.filter(o=>o.id!==c.offerId);return 'Cargo offer cancelled.';
  }
  if(c.type==='cargo-offer') {
    const recipient=players.get(c.recipient),lot=p.character.logistics.lots.find(l=>l.id===c.lotId);
    if(!p.character.profession || !recipient?.character.profession || recipient.actor===actor || now-recipient.seenAt>=ACTIVE_MS)return 'Choose a nearby active recipient with a profession.';
    if(!lot || lot.quantity<c.quantity)return 'Owned cargo unavailable.';
    if(world.offers.some(o=>o.sender===actor))return 'Finish or cancel your existing offer first.';
    if(world.offers.length>=16)return 'Room offer capacity reached.';
    const at=commonCustodian(world,lot.custodian);
    if(!at || !positionNear(compose(world,p).position,at) || !positionNear(compose(world,recipient).position,at))return 'Both players must approach the same warehouse or stopped ferry gangway.';
    const id=`offer-${world.nextOffer++}`;
    world.offers.push({id,sender:actor,recipient:c.recipient,lotId:c.lotId,quantity:c.quantity,good:lot.good,condition:lot.condition,custodian:lot.custodian,...(lot.orderId?{orderId:lot.orderId}:{}),expiresAt:now+OFFER_MS});
    return 'Cargo offered. Recipient must accept before custody changes.';
  }
  if(c.type==='cargo-accept') {
    const offer=world.offers.find(o=>o.id===c.offerId && o.recipient===actor);
    if(!offer)return 'No pending offer is addressed to you.';
    const sender=players.get(offer.sender)!,lot=sender.character.logistics.lots.find(l=>l.id===offer.lotId);
    const at=lot?commonCustodian(world,lot.custodian):null;
    if(!at || !positionNear(compose(world,sender).position,at) || !positionNear(compose(world,p).position,at))return 'Both players must remain beside the cargo custodian.';
    if(world.handoffs.length>=512)return 'Room custody journal full; archival required.';
    try {
      const moved=acceptCustody(sender.character.logistics,p.character.logistics,offer,world.room);
      sender.character.logistics=moved.sender;p.character.logistics=moved.recipient;
      world.handoffs.push({offerId:offer.id,sender:offer.sender,recipient:actor,sourceLot:offer.lotId,receivedLot:moved.receivedId,quantity:offer.quantity,at:now});
      world.offers=world.offers.filter(o=>o.id!==offer.id);
      sender.character.message='Cargo custody transferred after recipient acceptance.';
      return 'Cargo accepted. Condition and source provenance preserved.';
    } catch(e) {return e instanceof Error?e.message:'Cargo acceptance failed.';}
  }
  throw new Error('Unknown custody command');
}
function gameplayIntent(world:World,players:Players,p:PlayerRecord,c:GameIntent,elapsed:number,now:number):State {
  const before=compose(world,p);
  const reject=(message:string)=>({...before,message});
  if(c.type==='ferry-helm' && world.helm && world.helm.actor!==p.actor)return reject('The ferry helm is already held by another player.');
  if(c.type==='cargo') {
    const command=c.envelope.command;
    if(command.type!=='deposit' && world.offers.some(o=>o.sender===p.actor && o.lotId===command.lotId))return reject('Offered cargo is reserved until accepted, cancelled or expired.');
    if(command.type==='consign') {
      const order=initialLogistics().orders.find(o=>o.id===command.orderId);
      if(order) {
        const committed=[...players.values()].reduce((n,p)=>n+(p.character.logistics.orders.find(o=>o.id===order.id)?.fulfilled??0)+p.character.logistics.lots.filter(l=>l.orderId===order.id).reduce((n,l)=>n+l.quantity,0),0);
        if(committed+command.quantity>order.required)return reject('Room demand is already fulfilled or reserved.');
      }
    }
  }
  let next=c.type==='frame'?transition(before,{type:'move',dx:c.dx,dz:c.dz,dt:elapsed/1000}):transition(before,c);
  if(c.type!=='frame' && next.mode==='foot' && (next.position.x!==before.position.x || next.position.z!==before.position.z) && overlapsForeign(players,p.actor,next.position.x,next.position.z))return reject('Another player’s structure blocks the landing.');
  if(c.type==='frame' && next.mode==='foot' && overlapsForeign(players,p.actor,next.position.x,next.position.z)) {next.position=before.position;next.message='Another player’s structure blocks the path.';}
  if(c.type==='place') {
    const item=before.items.find(i=>i.id===c.instanceId),f=item?definition(item.definitionId).footprint:undefined;
    if(f && overlapsForeign(players,p.actor,c.x,c.z,f[0],f[1]))return reject('Another player’s structure occupies that land.');
    if(f && [...players.values()].some(other=>other.actor!==p.actor && now-other.seenAt<ACTIVE_MS && other.character.mode==='foot' && positionNear({x:c.x,z:c.z},other.character.position,Math.hypot(...f)/2+0.5)))return reject('A player is standing in the construction area.');
  }
  if(c.type==='cargo') {
    const totals=new Map<string,number>();
    for(const owner of players.values())for(const l of (owner.actor===p.actor?next.logistics:owner.character.logistics).lots)if(['haven-store','aurum-store','ferry'].includes(l.custodian))totals.set(l.custodian,(totals.get(l.custodian)??0)+l.quantity);
    if([...totals].some(([id,qty])=>qty>(id==='ferry'?96:128)))return reject('Shared custodian capacity exceeded.');
  }
  if(c.type==='ferry-helm') {
    if(next.ferry.passenger?.station==='helm')world.helm={actor:p.actor,expiresAt:now+HELM_LEASE_MS};
    else if(world.helm?.actor===p.actor) {world.helm=null;world.controls={throttle:0,turn:0,until:0};}
  }
  return next;
}
function colonyIntent(world:World,players:Players,p:PlayerRecord,c:ColonyIntent):string {
  const s=compose(world,p),colony=world.colonies.find(a=>a.id===c.colony)!;
  if(!colony)return 'Unknown colony.';
  if(!s.profession || !positionNear(s.position,DOCKS[c.colony]))return 'Choose a profession and approach the colony warehouse.';
  if(!hasEconomySpace(world.economy))return 'Colony audit capacity reached; archival required.';
  if(c.type==='colony-focus') {
    if(!Object.hasOwn(RECIPES,c.recipe) || RECIPES[c.recipe].colony!==c.colony)return 'Unknown production focus.';
    if(world.economy.focus[c.colony]===c.recipe)return 'Production focus is already selected.';
    const last=world.economy.events.slice().reverse().find(e=>e.type==='FocusChanged' && e.colony===c.colony);
    if(last && world.tick-last.tick<10)return 'Production focus can change once per production cycle.';
    world.economy.focus[c.colony]=c.recipe;appendEconomy(world.economy,{type:'FocusChanged',actor:p.actor,colony:c.colony,recipe:c.recipe,tick:world.tick});
    return 'Colony production focus updated.';
  }
  if(!COLONY_GOODS.includes(c.good) || !Number.isSafeInteger(c.quantity) || c.quantity<1 || c.quantity>32)return 'Choose a whole quantity from 1 to 32.';
  if(c.type==='colony-contribute') {
    if(s.inventory[c.good]<c.quantity)return 'Not enough carried supplies to contribute.';
    if(colony.stock[c.good]+c.quantity>100000)return 'Colony stock capacity exceeded.';
    p.character.inventory[c.good]-=c.quantity;colony.stock[c.good]+=c.quantity;
    appendEconomy(world.economy,{type:'StockContributed',actor:p.actor,colony:c.colony,good:c.good,quantity:c.quantity,tick:world.tick});
    return 'Supplies contributed to colony production. No delivery credit awarded.';
  }
  if(colony.stock[c.good]<c.quantity)return 'Colony stock is insufficient.';
  const warehouse=DOCKS[c.colony].warehouse;
  const stored=[...players.values()].flatMap(p=>p.character.logistics.lots).filter(l=>l.custodian===warehouse).reduce((n,l)=>n+l.quantity,0);
  if(stored+c.quantity>128)return 'Shared warehouse capacity exceeded.';
  const ledger=p.character.logistics;
  if(ledger.events.length>=512 || ledger.lots.length>=256)return 'Cargo journal or lot capacity reached.';
  const id=`lot-${ledger.nextLotId}`;
  const event:CargoEvent={schemaVersion:1,sequence:ledger.revision+1,commandId:`colony-load:${p.sequence+1}`,request:JSON.stringify([c.type,c.colony,c.good,c.quantity]),type:'ColonyStockReleased',removed:[],
    upserted:[{id,rootId:id,good:c.good,quantity:c.quantity,condition:100,ownerId:'local-player',origin:c.colony,custodian:warehouse,shipped:false}],nextLotId:ledger.nextLotId+1,reputationDelta:0,colonyDebit:{colony:c.colony,good:c.good,quantity:c.quantity}};
  if(ledger.receipts.some(r=>r.commandId===event.commandId))return 'Cargo command identity conflict.';
  p.character.logistics=reduceCargo(ledger,event);colony.stock[c.good]-=c.quantity;
  appendEconomy(world.economy,{type:'ColonyStockReleased',actor:p.actor,colony:c.colony,good:c.good,quantity:c.quantity,lotId:id,tick:world.tick});
  return 'Colony stock released into your warehouse cargo lot.';
}
/** All arguments are transaction-local drafts. Persist only after every invariant passes. */
export function applyWorldIntent(world:World,players:Players,actor:string,c:Intent,now:number) {
  const p=players.get(actor)!;
  ensureEconomy(world,players);
  const elapsed=Math.min(100,Math.max(0,now-p.lastAt));
  advanceWorld(world,players,actor,c,now);
  if(isColonyIntent(c))p.character.message=colonyIntent(world,players,p,c);
  else if(isCustodyIntent(c))p.character.message=custodyIntent(world,players,actor,c,now);
  else saveState(world,p,gameplayIntent(world,players,p,c,elapsed,now));
  settleContracts(world.economy,world.colonies,contractTotals(players),actor,world.tick);
  p.lastAt=now;p.seenAt=now;world.revision++;
  // Includes the non-caller record on custody handoff, and all passenger projections.
  for(const record of players.values()) restore(compose(world,record));
  validateEconomy(world.economy,world.tick,contractTotals(players));
  projectContributions(world.room,[...players.values()].map(p=>({actor:p.actor,profession:p.character.profession,logistics:p.character.logistics})));
}
