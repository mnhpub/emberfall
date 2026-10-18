import { authorityJson } from './authority.ts';
import { canonical, parseEnvelope, type RequestEnvelope } from '../packages/authority/protocol.ts';
import { applyWorldIntent, ensureEconomy, initialPlayer, initialWorld, projectWorld, ROOM_CAPACITY, type PlayerRecord, type Players, type World } from '../packages/authority/world.ts';

const byteSize=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v)).length;
export class SharedWorld {
  private ctx:DurableObjectState;
  constructor(ctx:DurableObjectState) {this.ctx=ctx;}
  async fetch(request:Request):Promise<Response> {
    const actor=request.headers.get('x-authority-actor'),room=request.headers.get('x-authority-room');
    if(!actor || !/^[a-zA-Z0-9_-]{8,80}$/.test(actor) || !room || !/^[a-zA-Z0-9_-]{1,64}$/.test(room))return authorityJson({error:'Missing verified scope'},403);
    const path=new URL(request.url).pathname;
    if(!(path==='/snapshot' && request.method==='GET') && !(path==='/command' && request.method==='POST'))return authorityJson({error:'Not found'},404);
    let input:RequestEnvelope|undefined;
    if(request.method==='POST') {
      const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
      if(reader)while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>8192){await reader.cancel();return authorityJson({error:'Command exceeds 8 KiB'},413);}chunks.push(p.value);}
      const bytes=new Uint8Array(size);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.length;}
      try{input=parseEnvelope(JSON.parse(new TextDecoder().decode(bytes)),true);}catch{return authorityJson({error:'Invalid shared-world envelope'},400);}
    }
    return this.ctx.storage.transaction(async txn=>{
      const now=Date.now(),stored=await txn.get<World>('world');
      const world=stored??initialWorld(room,now);
      const priorWorld=JSON.stringify(stored);
      if(world.schema!==1 || world.room!==room)return authorityJson({error:'World schema or identity mismatch'},409);
      if(!world.members.includes(actor) && world.members.length>=ROOM_CAPACITY)return authorityJson({error:'Room has reached its eight-character capacity'},403);
      const players:Players=new Map(),priorPlayers=new Map<string,string>();
      for(const member of world.members){const p=await txn.get<PlayerRecord>('player:'+member);if(!p || p.actor!==member)throw new Error('Missing or corrupt world member');players.set(member,p);priorPlayers.set(member,JSON.stringify(p));}
      if(!players.has(actor)) {players.set(actor,initialPlayer(actor,now));world.members.push(actor);world.revision++;}
      const p=players.get(actor)!;
      try {ensureEconomy(world,players);}catch{return authorityJson({error:'Unsupported or corrupt colony economy'},409);}
      const snapshot=()=>projectWorld(world,players,actor,now);
      if(input) {
        const fingerprint=canonical(input);
        if(input.sequence===p.sequence && p.receipt?.commandId===input.commandId && p.receipt.fingerprint===fingerprint)return authorityJson({...snapshot(),duplicate:true});
        if(input.sequence!==p.sequence+1 || p.receipt?.commandId===input.commandId)return authorityJson({error:'Sequence conflict; reconcile before further commands',snapshot:snapshot()},409);
        if(now-p.lastAt<75)return authorityJson({error:'Commands are limited to one per 75 ms'},429);
        try {applyWorldIntent(world,players,actor,input.command,now);}
        catch {return authorityJson({error:'Command would violate world invariants'},422);}
        p.sequence=input.sequence;p.receipt={commandId:input.commandId,fingerprint};
      } else p.seenAt=now;
      // Separate bounded values; all writes occur only after validation and capacity checks.
      if(byteSize(world)>120000 || [...players.values()].some(p=>byteSize(p)>120000))return authorityJson({error:'World capacity reached; archival required'},507);
      if(JSON.stringify(world)!==priorWorld)await txn.put('world',world);
      for(const record of players.values())if(JSON.stringify(record)!==priorPlayers.get(record.actor))await txn.put('player:'+record.actor,record);
      return authorityJson(snapshot());
    });
  }
}
