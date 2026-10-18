import type { Colony } from '../game-core/index.ts';
import { initialLogistics } from '../logistics/index.ts';

export const COLONY_GOODS=['wood','stone','gold','food'] as const;
export type ColonyGood=typeof COLONY_GOODS[number];
export type ColonyId='haven'|'aurum';
export type ContractId='aurum-timber'|'haven-provisions';
export type Stock=Record<ColonyGood,number>;
const stock=():Stock=>({wood:0,stone:0,gold:0,food:0});
export const RECIPES={
  forestry:{colony:'haven',name:'Managed timber camp',input:{food:1},output:{wood:2},reserve:{wood:2},contract:'haven-provisions'},
  provisions:{colony:'aurum',name:'River gardens',input:{wood:1},output:{food:4},reserve:{food:1}},
  granite:{colony:'aurum',name:'Granite quarry',input:{food:1},output:{stone:2},reserve:{stone:2}},
  'gold-wash':{colony:'aurum',name:'Gold washing',input:{food:2},output:{gold:1},reserve:{gold:1},contract:'aurum-timber'},
} as const;
export type RecipeId=keyof typeof RECIPES;
type Recipe={colony:ColonyId;name:string;input:Partial<Stock>;output:Partial<Stock>;reserve:Partial<Stock>;contract?:ContractId};
export const RECIPE_IDS=Object.keys(RECIPES) as RecipeId[];
const RESERVES:Record<ColonyId,Stock>={haven:{...stock(),wood:40},aurum:{...stock(),stone:64,food:24,gold:4}};
export type Completion={tick:number;actor:string|null;imported:boolean};
type EventBase={schema:1;sequence:number;tick:number};
export type EconomyEvent=EventBase & (
  | {type:'ProductionBatch';colony:ColonyId;recipe:RecipeId}
  | {type:'StockContributed';colony:ColonyId;good:ColonyGood;quantity:number;actor:string}
  | {type:'ColonyStockReleased';colony:ColonyId;good:ColonyGood;quantity:number;actor:string;lotId:string}
  | {type:'FocusChanged';colony:ColonyId;recipe:RecipeId;actor:string}
  | {type:'ContractCompleted';contract:ContractId;actor:string;settlers:2}
);
export type Economy={version:1;lastCycleTick:number;reserves:Record<ColonyId,Stock>;focus:Record<ColonyId,RecipeId>;
  batches:Record<RecipeId,number>;completed:Partial<Record<ContractId,Completion>>;events:EconomyEvent[]};
export type ContractTotal={id:string;required:number;fulfilled:number;reserved:number;inTransit:number};
export type ColonyIntent=
  | {type:'colony-contribute';colony:ColonyId;good:ColonyGood;quantity:number}
  | {type:'colony-load';colony:ColonyId;good:ColonyGood;quantity:number}
  | {type:'colony-focus';colony:ColonyId;recipe:RecipeId};
export type EconomyView={version:1;cycleEveryTicks:10;nextCycleTick:number;journalFull:boolean;
  colonies:{id:ColonyId;name:string;population:number;stock:Stock;reserves:Stock;focus:RecipeId;
    jobs:{id:RecipeId;name:string;input:Partial<Stock>;output:Partial<Stock>;reserve:Partial<Stock>;batches:number;blocker:string|null}[]}[];
  contracts:(ContractTotal & {title:string;good:ColonyGood;source:ColonyId;destination:ColonyId;status:'open'|'reserved'|'in-transit'|'partial'|'completed';benefit:string;completion:Completion|null})[];
  recent:EconomyEvent[]};
export const isColonyIntent=(c:{type:string}):c is ColonyIntent=>c.type==='colony-contribute'||c.type==='colony-load'||c.type==='colony-focus';
export function initialEconomy(tick=0,totals:ContractTotal[]=[]):Economy {
  const completed:Economy['completed']={};
  for(const o of totals)if(o.fulfilled>=o.required && ['aurum-timber','haven-provisions'].includes(o.id))completed[o.id as ContractId]={tick,actor:null,imported:true};
  return {version:1,lastCycleTick:Math.floor(tick/10)*10,reserves:structuredClone(RESERVES),focus:{haven:'forestry',aurum:'provisions'},batches:{forestry:0,provisions:0,granite:0,'gold-wash':0},completed,events:[]};
}
// Reserve two audit slots for the two one-time contract benefits.
export const hasEconomySpace=(e:Economy)=>e.events.length<254;
type NewEvent<T>=T extends unknown?Omit<T,'schema'|'sequence'>:never;
export function appendEconomy(e:Economy,event:NewEvent<EconomyEvent>) {
  if(e.events.length>=256)throw new Error('Colony audit journal is full');
  e.events.push({...event,schema:1,sequence:e.events.length+1} as EconomyEvent);
}
export function productionBlocker(e:Economy,colony:Colony,id:RecipeId):string|null {
  const r:Recipe=RECIPES[id];
  if(r.colony!==colony.id)return 'Different colony';
  if(!hasEconomySpace(e))return 'Audit capacity reached';
  if(colony.population<8)return 'Needs eight settlers';
  if(r.contract && !e.completed[r.contract])return `Complete ${r.contract}`;
  if(id==='gold-wash' && !colony.active)return 'Activate the gold apex';
  for(const [g,n]of Object.entries(r.reserve))if(e.reserves[r.colony][g as ColonyGood]<n)return `Reserve depleted: ${g}`;
  for(const [g,n]of Object.entries(r.input))if(colony.stock[g as ColonyGood]<n)return `Needs ${n} ${g}`;
  for(const [g,n]of Object.entries(r.output))if(colony.stock[g as ColonyGood]-(r.input[g as ColonyGood]??0)+n>100000)return `Storage full: ${g}`;
  return null;
}
export function produce(e:Economy,colonies:Colony[],tick:number) {
  if(tick%10!==0 || tick<=e.lastCycleTick)return;
  e.lastCycleTick=tick;
  for(const colony of colonies) {
    const id=colony.id as ColonyId,ordered=[e.focus[id],...RECIPE_IDS.filter(r=>r!==e.focus[id])];
    let labor=Math.min(3,Math.floor(colony.population/8));
    for(const recipe of ordered) {
      if(!labor || productionBlocker(e,colony,recipe))continue;
      const r:Recipe=RECIPES[recipe];
      for(const [g,n]of Object.entries(r.input))colony.stock[g as ColonyGood]-=n;
      for(const [g,n]of Object.entries(r.output))colony.stock[g as ColonyGood]+=n;
      for(const [g,n]of Object.entries(r.reserve))e.reserves[id][g as ColonyGood]-=n;
      e.batches[recipe]++;labor--;
      appendEconomy(e,{type:'ProductionBatch',colony:id,recipe,tick});
    }
  }
}
export function settleContracts(e:Economy,colonies:Colony[],totals:ContractTotal[],actor:string,tick:number) {
  for(const order of initialLogistics().orders) {
    const id=order.id as ContractId,total=totals.find(o=>o.id===id);
    if(e.completed[id] || !total || total.fulfilled<order.required)continue;
    const colony=colonies.find(c=>c.id===order.destination)!;
    if(colony.population+2>1000)throw new Error('Contract would exceed population capacity');
    appendEconomy(e,{type:'ContractCompleted',contract:id,actor,settlers:2,tick});
    e.completed[id]={tick,actor,imported:false};colony.population+=2;
  }
}
export function projectEconomy(e:Economy,colonies:Colony[],totals:ContractTotal[],tick:number):EconomyView {
  return {version:1,cycleEveryTicks:10,nextCycleTick:Math.floor(tick/10)*10+10,journalFull:!hasEconomySpace(e),
    colonies:colonies.map(c=>{const id=c.id as ColonyId;return {id,name:c.name,population:c.population,
      stock:Object.fromEntries(COLONY_GOODS.map(g=>[g,c.stock[g]])) as Stock,reserves:structuredClone(e.reserves[id]),focus:e.focus[id],
      jobs:RECIPE_IDS.filter(r=>RECIPES[r].colony===id).map(r=>({...RECIPES[r],id:r,batches:e.batches[r],blocker:productionBlocker(e,c,r)}))};}),
    contracts:totals.map(o=>({...o,good:initialLogistics().orders.find(d=>d.id===o.id)!.good as ColonyGood,source:initialLogistics().orders.find(d=>d.id===o.id)!.source,destination:initialLogistics().orders.find(d=>d.id===o.id)!.destination,title:o.id==='aurum-timber'?'Aurum timber works':'Haven provisioning station',
      status:o.fulfilled>=o.required?'completed':o.fulfilled>0?'partial':o.inTransit>0?'in-transit':o.reserved>0?'reserved':'open',
      benefit:o.id==='aurum-timber'?'+2 settlers; unlock gold washing':'+2 settlers; unlock managed timber',completion:e.completed[o.id as ContractId]??null})),
    recent:structuredClone(e.events.slice(-8))};
}
export function validateEconomy(e:Economy,tick:number,totals:ContractTotal[]) {
  const int=(n:unknown,max:number)=>Number.isSafeInteger(n) && (n as number)>=0 && (n as number)<=max;
  if(!e || e.version!==1 || !int(e.lastCycleTick,tick) || e.lastCycleTick%10!==0 || !Array.isArray(e.events) || e.events.length>256 || !e.reserves || !e.focus || !e.batches || !e.completed)throw new Error('Invalid colony economy');
  const remaining=structuredClone(RESERVES),counts={forestry:0,provisions:0,granite:0,'gold-wash':0};
  const completions=new Map<string,{actor:string;tick:number}>(),production=new Set<string>();
  const focuses=new Map<ColonyId,number>();
  let priorTick=0;
  for(const [i,event]of e.events.entries()) {
    if(event.schema!==1 || event.sequence!==i+1 || !int(event.tick,tick) || event.tick<priorTick)throw new Error('Invalid colony event');
    priorTick=event.tick;
    if(event.type==='ProductionBatch') {
      if(!RECIPE_IDS.includes(event.recipe) || RECIPES[event.recipe].colony!==event.colony || event.tick%10!==0 || event.tick>e.lastCycleTick || production.has(`${event.tick}:${event.recipe}`))throw new Error('Invalid production event');
      production.add(`${event.tick}:${event.recipe}`);
      counts[event.recipe]++;for(const [g,n]of Object.entries(RECIPES[event.recipe].reserve))remaining[event.colony][g as ColonyGood]-=n;
    } else {
      if(!/^[a-zA-Z0-9_-]{8,80}$/.test(event.actor))throw new Error('Invalid colony actor');
      if(event.type==='ContractCompleted') {if(completions.has(event.contract) || !['aurum-timber','haven-provisions'].includes(event.contract) || event.settlers!==2)throw new Error('Duplicate or invalid contract benefit');completions.set(event.contract,{actor:event.actor,tick:event.tick});}
      else if(event.type==='FocusChanged') {if(!RECIPE_IDS.includes(event.recipe) || RECIPES[event.recipe].colony!==event.colony || event.tick-(focuses.get(event.colony)??-10)<10)throw new Error('Invalid focus');focuses.set(event.colony,event.tick);}
      else if(event.type==='StockContributed' || event.type==='ColonyStockReleased') {if(!COLONY_GOODS.includes(event.good) || !['haven','aurum'].includes(event.colony) || !int(event.quantity,32) || event.quantity<1 || (event.type==='ColonyStockReleased' && !/^lot-[1-9][0-9]*$/.test(event.lotId)))throw new Error('Invalid colony stock event');}
      else throw new Error('Unknown colony event');
    }
  }
  for(const id of ['haven','aurum'] as const) {
    if(!e.reserves[id] || !RECIPE_IDS.includes(e.focus[id]) || RECIPES[e.focus[id]].colony!==id)throw new Error('Invalid colony focus');
    for(const g of COLONY_GOODS)if(!int(e.reserves[id][g],RESERVES[id][g]) || e.reserves[id][g]!==remaining[id][g])throw new Error('Colony reserve does not match production');
  }
  for(const r of RECIPE_IDS)if(!int(e.batches[r],64) || counts[r]!==e.batches[r])throw new Error('Invalid production count');
  for(const [id,c]of Object.entries(e.completed)) {
    const total=totals.find(t=>t.id===id);
    if(!c || !total || total.fulfilled<total.required || !int(c.tick,tick) || typeof c.imported!=='boolean' || (c.imported?(c.actor!==null || completions.has(id)):(!c.actor || completions.get(id)?.actor!==c.actor || completions.get(id)?.tick!==c.tick)))throw new Error('Invalid contract completion');
  }
  if([...completions.keys()].some(id=>!e.completed[id as ContractId]))throw new Error('Missing contract completion');
}
