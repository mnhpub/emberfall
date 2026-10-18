import { initialState, restore, transition, type State } from '../packages/game-core/index.ts';
import { canonical, parseEnvelope, isCustodyIntent, type Snapshot } from '../packages/authority/protocol.ts';
import { verifySession } from './session.ts';
import { isColonyIntent } from '../packages/colonies/index.ts';

export interface AuthorityEnv { AUTHORITY_SESSIONS?: DurableObjectNamespace; SHARED_WORLDS?: DurableObjectNamespace; AUTHORITY_SIGNING_KEY?: string; CLIENT_ORIGIN?: string }
type RecordState = Snapshot & { lastAt: number; tickMs: number; receipt?: { commandId: string; fingerprint: string } };
export const authorityJson=(data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function authorityRoute(request: Request, env: AuthorityEnv): Promise<Response> {
  const url=new URL(request.url);
  const match=/^\/api\/(?:authority|world)\/([a-zA-Z0-9_-]{1,64})\/(snapshot|command)$/.exec(url.pathname);
  if (!match) return authorityJson({error:'Invalid authority route'},404);
  if (request.method!==(match[2]==='snapshot'?'GET':'POST')) return authorityJson({error:'Method not allowed'},405);
  if (request.headers.has('origin') && request.headers.get('origin')!==(env.CLIENT_ORIGIN || url.origin)) return authorityJson({error:'Origin denied'},403);
  const shared=url.pathname.startsWith('/api/world/');
  const namespace=shared?env.SHARED_WORLDS:env.AUTHORITY_SESSIONS;
  if (!namespace || !env.AUTHORITY_SIGNING_KEY || new TextEncoder().encode(env.AUTHORITY_SIGNING_KEY).length<32) return authorityJson({error:'Authority is not configured'},503);
  const token=request.headers.get('authorization');
  let claims;
  try { claims=await verifySession(token?.startsWith('Bearer ')?token.slice(7):'',env.AUTHORITY_SIGNING_KEY,match[1]); }
  catch { return authorityJson({error:'Invalid or expired session'},401); }
  // JSON tuple prevents collisions between actor and room names containing separators.
  const id=namespace.idFromName(shared?match[1]:JSON.stringify([match[1],claims.sub]));
  const headers=new Headers({'x-authority-actor':claims.sub,'x-authority-room':match[1]});
  if (request.method==='POST') headers.set('content-type','application/json');
  return namespace.get(id).fetch(new Request('https://authority/'+match[2],{method:request.method,headers,body:request.body,redirect:'manual',...(request.body?{duplex:'half'}:{})} as RequestInit));
}

export class AuthoritySession {
  private ctx: DurableObjectState;
  constructor(ctx: DurableObjectState) {this.ctx=ctx;}
  async fetch(request: Request): Promise<Response> {
    const actor=request.headers.get('x-authority-actor'), room=request.headers.get('x-authority-room');
    if (!actor || !room) return authorityJson({error:'Missing verified identity'},403);
    const path=new URL(request.url).pathname;
    if (!(request.method==='GET' && path==='/snapshot') && !(request.method==='POST' && path==='/command')) return authorityJson({error:'Not found'},404);
    let input: ReturnType<typeof parseEnvelope> | undefined;
    if (request.method==='POST') {
      const reader=request.body?.getReader(); let size=0; const chunks: Uint8Array[]=[];
      if (reader) while(true) { const p=await reader.read(); if(p.done) break; size+=p.value.byteLength; if(size>8192) {await reader.cancel(); return authorityJson({error:'Command exceeds 8 KiB'},413);} chunks.push(p.value); }
      const bytes=new Uint8Array(size); let offset=0; for(const c of chunks) {bytes.set(c,offset);offset+=c.length;}
      try {input=parseEnvelope(JSON.parse(new TextDecoder().decode(bytes)));} catch {return authorityJson({error:'Invalid command envelope'},400);}
    }
    // No external calls inside a transaction: retries recompute entirely from durable state.
    return this.ctx.storage.transaction(async txn => {
      const now=Date.now();
      const previous=await txn.get<RecordState>('session');
      const record=previous ?? {protocol:1 as const,actor,room,sequence:0,state:initialState(),lastAt:now,tickMs:0};
      if(record.actor!==actor || record.room!==room) return authorityJson({error:'Identity mismatch'},403);
      const snapshot=(r: RecordState): Snapshot=>({protocol:1,actor:r.actor,room:r.room,sequence:r.sequence,state:r.state});
      if(!input) {if(!previous) await txn.put('session',record); return authorityJson(snapshot(record));}
      const fingerprint=canonical(input);
      if(input.sequence===record.sequence && record.receipt?.commandId===input.commandId && record.receipt.fingerprint===fingerprint) return authorityJson({...snapshot(record),duplicate:true});
      if(input.sequence!==record.sequence+1 || record.receipt?.commandId===input.commandId) return authorityJson({error:'Sequence conflict; reconcile before further commands',snapshot:snapshot(record)},409);
      if(now-record.lastAt<75) return authorityJson({error:'Commands are limited to one per 75 ms'},429);
      const elapsed=Math.min(100,Math.max(0,now-record.lastAt));
      let state=record.state;
      let tickMs=record.tickMs+elapsed;
      if(tickMs>=1000) {state=transition(state,{type:'tick'}); tickMs-=1000;}
      const c=input.command;
      if(isCustodyIntent(c) || isColonyIntent(c)) return authorityJson({error:'Shared-world command required'},400);
      // Caller supplies intent only. Client dt, snapshots, inventory and ticks are rejected.
      state=transition(state,{type:'ferry-step',dt:elapsed/1000,throttle:c.type==='frame'?c.throttle:0,turn:c.type==='frame'?c.turn:0});
      state=c.type==='frame'?transition(state,{type:'move',dx:c.dx,dz:c.dz,dt:elapsed/1000}):transition(state,c);
      try { state=restore(state); } catch {return authorityJson({error:'Command would violate state invariants'},422);}
      const next: RecordState={...record,state,tickMs,lastAt:now,sequence:input.sequence,receipt:{commandId:input.commandId,fingerprint}};
      if(new TextEncoder().encode(JSON.stringify(next)).length>120000) return authorityJson({error:'Session capacity reached; archive required'},507);
      await txn.put('session',next);
      return authorityJson(snapshot(next));
    });
  }
}
