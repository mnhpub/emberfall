import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { WorldRoom } from '../worker/index.ts';
function environment(){
 const rooms=new Map<string,WorldRoom>();const stores=new Map<string,Map<string,unknown>>();
 const env:any={SESSION_TOKEN:'test-only',PLAYER_ID:'player_001',DB:{},WORLD_ROOMS:{idFromName:(name:string)=>name,get:(id:string)=>({fetch:async(req:Request)=>{
  if(!rooms.has(id)){const values=new Map<string,unknown>();stores.set(id,values);const storage={get:async(k:string)=>values.get(k),put:async(k:string,v:unknown)=>values.set(k,v),delete:async(k:string)=>values.delete(k),list:async({prefix}:{prefix:string})=>new Map([...values].filter(([k])=>k.startsWith(prefix)))};rooms.set(id,new WorldRoom({storage} as any));}
  return rooms.get(id)!.fetch(req);
 }})}};return {env,stores};
}
const request=(path:string,body?:unknown,token='test-only')=>new Request(`https://example.test${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('persistent endpoints fail closed without staging credentials',async()=>{const {env}=environment();delete env.SESSION_TOKEN;assert.equal((await worker.fetch(request('/api/save'),env)).status,503);});
test('requests require authentication and saves require ownership',async()=>{const {env}=environment();assert.equal((await worker.fetch(request('/api/save',undefined,'bad'),env)).status,401);assert.equal((await worker.fetch(request('/api/save',{playerId:'someone_else',save:{}}),env)).status,403);});
test('room reads and writes share identity and other rooms are isolated',async()=>{const {env}=environment();const r=await worker.fetch(request('/api/room/alpha/presence',{playerId:'player_001',x:1,z:2}),env);assert.equal(r.status,200);assert.equal((await (await worker.fetch(request('/api/room/alpha/state'),env)).json() as any).players,1);assert.equal((await (await worker.fetch(request('/api/room/beta/state'),env)).json() as any).players,0);});
test('presence ownership, malformed routes and stale cleanup',async()=>{const {env,stores}=environment();assert.equal((await worker.fetch(request('/api/room/alpha/presence',{playerId:'someone_else'}),env)).status,403);assert.equal((await worker.fetch(request('/api/room/alpha/extra/state'),env)).status,400);await worker.fetch(request('/api/room/alpha/state'),env);stores.get('alpha')!.set('player:old',{seenAt:0,x:0,z:0});assert.equal((await (await worker.fetch(request('/api/room/alpha/state'),env)).json() as any).players,0);assert.equal(stores.get('alpha')!.size,0);});
test('invalid display names and oversized actual bodies are rejected',async()=>{const {env}=environment();assert.equal((await worker.fetch(request('/api/profile',{playerId:'player_001',displayName:123}),env)).status,400);assert.equal((await worker.fetch(request('/api/save',{payload:'x'.repeat(66000)}),env)).status,413);});
