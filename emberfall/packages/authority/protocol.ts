import type { ContributionView } from '../contributions/index.ts';
import type { Command, State } from '../game-core/index.ts';
import { GOODS, type Good, type Endpoint } from '../logistics/index.ts';
import type { ItemId } from '../game-core/catalog.ts';
import { COLONY_GOODS, RECIPES, type ColonyIntent, type EconomyView } from '../colonies/index.ts';

export type Frame = { type: 'frame'; dx: number; dz: number; throttle: number; turn: number };
export type GameIntent = Exclude<Command, {type:'move'} | {type:'tick'} | {type:'ferry-step'}> | Frame;
export type CustodyIntent =
  | { type:'cargo-offer'; lotId:string; quantity:number; recipient:string }
  | { type:'cargo-accept'; offerId:string }
  | { type:'cargo-cancel'; offerId:string };
export type Intent = GameIntent | CustodyIntent | ColonyIntent;
export const isCustodyIntent = (c:Intent): c is CustodyIntent => c.type==='cargo-offer' || c.type==='cargo-accept' || c.type==='cargo-cancel';
export type AuthorityMode = 'private' | 'shared';
export type Peer = { actor:string; position:{x:number;z:number}; mode:State['mode']; profession:State['profession'] };
export type PublicPlacement = { actor:string; instanceId:string; definitionId:ItemId; x:number; z:number };
export type CargoOffer = { id:string; sender:string; recipient:string; lotId:string; quantity:number; good:Good; condition:number; custodian:Endpoint; orderId?:string; expiresAt:number };
export type SharedView = { revision:number; players:Peer[]; placements:PublicPlacement[]; helmActor:string|null; offers:CargoOffer[];
  orders:{id:string;required:number;fulfilled:number;reserved:number;inTransit:number}[];freight:{haven:number;aurum:number;ferry:number};economy:EconomyView;contributions:ContributionView };
export type RequestEnvelope = { sequence: number; commandId: string; command: Intent };
export type Snapshot = { protocol: 1; actor: string; room: string; sequence: number; state: State; authority?:AuthorityMode; shared?:SharedView };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_:-]{1,80}$/.test(v);
const integer = (v: unknown, min=0, max=1e9) => Number.isSafeInteger(v) && (v as number)>=min && (v as number)<=max;
const exact = (v: Record<string,unknown>, keys: string[]) => Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const point = (v: unknown) => typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=500;
export function parseEnvelope(value: unknown, allowShared=false): RequestEnvelope {
  if (!object(value) || !exact(value,['sequence','commandId','command']) || !integer(value.sequence,1) || !text(value.commandId) || !object(value.command)) throw new Error('Invalid envelope');
  const c=value.command; let valid=false;
  if (['board','repair','build','recover','attack','deliver','ferry-shuttle','ferry-board','ferry-exit','ferry-helm','ferry-sails'].includes(c.type as string)) valid=exact(c,['type']);
  if (c.type==='frame') valid=exact(c,['type','dx','dz','throttle','turn']) && ['dx','dz','throttle','turn'].every(k=>typeof c[k]==='number' && Number.isFinite(c[k]) && Math.abs(c[k] as number)<=1);
  if (c.type==='choose-profession') valid=exact(c,['type','profession']) && ['shipwright','fisher','provisioner','transport'].includes(c.profession as string);
  if (['gather','collect'].includes(c.type as string)) valid=exact(c,['type','id']) && text(c.id);
  if (c.type==='craft') valid=exact(c,['type','recipe']) && text(c.recipe);
  if (['equip','pack'].includes(c.type as string)) valid=exact(c,['type','instanceId']) && text(c.instanceId);
  if (c.type==='unequip') valid=exact(c,['type','slot']) && ['hand','body','back'].includes(c.slot as string);
  if (c.type==='place') valid=exact(c,['type','instanceId','x','z']) && text(c.instanceId) && point(c.x) && point(c.z);
  if (allowShared && c.type==='cargo-offer') valid=exact(c,['type','lotId','quantity','recipient']) && text(c.lotId) && integer(c.quantity,1,128) && typeof c.recipient==='string' && /^[a-zA-Z0-9_-]{8,80}$/.test(c.recipient);
  if (allowShared && ['cargo-accept','cargo-cancel'].includes(c.type as string)) valid=exact(c,['type','offerId']) && typeof c.offerId==='string' && /^offer-[1-9][0-9]{0,8}$/.test(c.offerId);
  if(allowShared && ['colony-contribute','colony-load'].includes(c.type as string))valid=exact(c,['type','colony','good','quantity']) && ['haven','aurum'].includes(c.colony as string) && COLONY_GOODS.includes(c.good as typeof COLONY_GOODS[number]) && integer(c.quantity,1,32);
  if(allowShared && c.type==='colony-focus')valid=exact(c,['type','colony','recipe']) && ['haven','aurum'].includes(c.colony as string) && typeof c.recipe==='string' && Object.hasOwn(RECIPES,c.recipe) && RECIPES[c.recipe as keyof typeof RECIPES].colony===c.colony;
  if (c.type==='cargo' && exact(c,['type','envelope']) && object(c.envelope)) {
    const e=c.envelope;
    if (exact(e,['commandId','expectedRevision','command']) && text(e.commandId) && integer(e.expectedRevision) && object(e.command)) {
      const a=e.command; const qty=integer(a.quantity,1,128);
      if (a.type==='deposit') valid=qty && exact(a,['type','good','quantity','dock']) && GOODS.includes(a.good as typeof GOODS[number]) && ['haven','aurum'].includes(a.dock as string);
      if (['withdraw','fulfill'].includes(a.type as string)) valid=qty && exact(a,['type','lotId','quantity']) && text(a.lotId);
      if (a.type==='consign') valid=qty && exact(a,['type','lotId','quantity','orderId']) && text(a.lotId) && text(a.orderId);
      if (a.type==='transfer') valid=qty && exact(a,['type','lotId','quantity','to']) && text(a.lotId) && typeof a.to==='string' && (/^crate:item-[1-9][0-9]{0,8}$/.test(a.to) || ['haven-store','aurum-store','ship','ferry'].includes(a.to));
    }
  }
  if (!valid) throw new Error('Invalid command');
  return value as unknown as RequestEnvelope;
}

// Stable hashing across JSON property order, including nested cargo commands.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (object(value)) return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
