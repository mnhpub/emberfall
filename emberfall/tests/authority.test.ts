import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import { AuthoritySession } from '../worker/authority.ts';
import { issueSession, verifySession } from '../worker/session.ts';
import { AuthorityClient } from '../packages/authority/client.ts';
import { parseEnvelope } from '../packages/authority/protocol.ts';

const secret='test-only-secret-with-at-least-32-bytes';
function setup(t:any) {
  let clock=1700000000000; t.mock.method(Date,'now',()=>clock);
  const stores=new Map<string,Map<string,unknown>>();const rooms=new Map<string,AuthoritySession>();
  let fail=false; let tail=Promise.resolve();
  const env:any={AUTHORITY_SIGNING_KEY:secret,AUTHORITY_SESSIONS:{idFromName:(id:string)=>id,get:(id:string)=>({fetch:(r:Request)=>{
    if(!rooms.has(id)) {
      if(!stores.has(id))stores.set(id,new Map());
      const storage={transaction:(fn:any)=>{
        const run=tail.then(async()=>{const draft=structuredClone(stores.get(id)!);const result=await fn({get:async(k:string)=>draft.get(k),put:async(k:string,v:unknown)=>{if(fail)throw new Error('disk unavailable');draft.set(k,structuredClone(v));}});stores.set(id,draft);return result;});
        tail=run.catch(()=>{});return run;
      }};
      rooms.set(id,new AuthoritySession({storage} as any));
    }
    return rooms.get(id)!.fetch(r);
  }})}};
  const token=(actor='player_001',room='haven')=>issueSession(secret,actor,room);
  const call=async(path='snapshot',body?:unknown,actor='player_001',room='haven',headers:Record<string,string>={})=>{
    const auth=await token(actor,room); clock+=100;
    return worker.fetch(new Request(`https://game.test/api/authority/${room}/${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${auth}`,...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
  };
  const cmd=(sequence:number,command:unknown,commandId='request-'+sequence)=>({sequence,commandId,command});
  const transport:typeof fetch=async(input:any,init:any)=>{clock+=100;return worker.fetch(new Request('https://game.test'+input,init),env);};
  return {env,stores,rooms,call,cmd,token,transport,advance:(ms:number)=>clock+=ms,fail:(value:boolean)=>fail=value};
}
const data=async(r:Response)=>await r.json() as any;
const memory=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};};

test('signed sessions enforce audience, expiry, room, signature and maximum lifetime',async t=>{
  setup(t);const token=await issueSession(secret,'player_001','haven');
  assert.equal((await verifySession(token,secret,'haven')).sub,'player_001');
  await assert.rejects(verifySession(token,secret,'aurum'));
  await assert.rejects(verifySession(token+'x',secret,'haven'));
  await assert.rejects(verifySession(token,secret,'haven',1700000900));
  await assert.rejects(issueSession(secret,'player_001','haven',1700000000,3601));
  await assert.rejects(issueSession('short','player_001','haven'));
  const [h,p]=token.split('.');const signature=token.split('.')[2];
  const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p,'base64url').toString()),sub:'player_002'})).toString('base64url');
  await assert.rejects(verifySession(h+'.'+forged+'.'+signature,secret,'haven'));
});
test('authority is disabled by default and rejects wrong origin and room credentials',async t=>{
  const e=setup(t);delete e.env.AUTHORITY_SIGNING_KEY;assert.equal((await e.call()).status,503);e.env.AUTHORITY_SIGNING_KEY=secret;
  assert.equal((await e.call('snapshot',undefined,'player_001','haven',{origin:'https://evil.test'})).status,403);
  const token=await e.token();assert.equal((await worker.fetch(new Request('https://game.test/api/authority/aurum/snapshot',{headers:{authorization:'Bearer '+token}}),e.env)).status,401);
  assert.equal((await worker.fetch(new Request('https://game.test/api/authority/haven/snapshot'),e.env)).status,401);
});
test('server initializes private state; actor headers cannot select another player',async t=>{
  const e=setup(t);await e.call();await e.call('command',e.cmd(1,{type:'choose-profession',profession:'shipwright'}));
  const own=await data(await e.call('snapshot',undefined,'player_001','haven',{'x-authority-actor':'player_002'}));
  assert.equal(own.actor,'player_001');assert.equal(own.state.profession,'shipwright');
  assert.equal((await data(await e.call('snapshot',undefined,'player_002'))).state.profession,null);
  assert.equal((await data(await e.call('snapshot',undefined,'player_001','aurum'))).state.profession,null);
});
test('command parser rejects state injection, ticks, dt, unknown fields and malformed nested cargo',()=>{
  const bad=[{type:'tick'},{type:'move',dx:1,dz:0,dt:100},{type:'frame',dx:1,dz:0,turn:0,throttle:0,dt:5},{type:'gather',id:'timber',inventory:{wood:99}},{type:'place',instanceId:'item-1',x:NaN,z:1},{type:'cargo',envelope:{commandId:'c',expectedRevision:0,command:{type:'deposit',good:'wood',quantity:-1,dock:'haven'}}}];
  for(const command of bad)assert.throws(()=>parseEnvelope({sequence:1,commandId:'command-1',command}));
});
test('identical retries return latest receipt without reapplying; changed and stale payloads conflict',async t=>{
  const e=setup(t);await e.call();const c=e.cmd(1,{type:'gather',id:'timber'});
  const first=await data(await e.call('command',c));assert.equal(first.state.inventory.wood,1);
  const retry=await data(await e.call('command',c));assert.equal(retry.duplicate,true);assert.equal(retry.state.inventory.wood,1);
  assert.equal((await e.call('command',{...c,command:{type:'gather',id:'quarry'}})).status,409);
  await e.call('command',e.cmd(2,{type:'gather',id:'timber'}));
  assert.equal((await e.call('command',c)).status,409);
  assert.equal((await data(await e.call())).state.inventory.wood,2);
});
test('transaction failure commits neither state nor receipt and retry succeeds',async t=>{
  const e=setup(t);await e.call();const c=e.cmd(1,{type:'gather',id:'timber'});e.fail(true);
  await assert.rejects(e.call('command',c));e.fail(false);
  assert.equal((await data(await e.call())).sequence,0);
  assert.equal((await data(await e.call('command',c))).state.inventory.wood,1);
});
test('concurrent sequence claims produce one committed command',async t=>{
  const e=setup(t);await e.call();const results=await Promise.all([e.call('command',e.cmd(1,{type:'gather',id:'timber'},'a')),e.call('command',e.cmd(1,{type:'gather',id:'timber'},'b'))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await data(await e.call())).state.inventory.wood,1);
});
test('eviction and reconnect reconstruct durable state without local save import',async t=>{
  const e=setup(t);await e.call();await e.call('command',e.cmd(1,{type:'choose-profession',profession:'fisher'}));e.rooms.clear();
  const s=await data(await e.call());assert.equal(s.sequence,1);assert.equal(s.state.profession,'fisher');
  assert.equal((await e.call('command',{...e.cmd(2,{type:'gather',id:'timber'}),state:{inventory:{wood:999}}})).status,400);
});
test('movement uses capped server elapsed time and bodies are bounded by bytes',async t=>{
  const e=setup(t);const start=await data(await e.call());e.advance(3600000);
  const moved=await data(await e.call('command',e.cmd(1,{type:'frame',dx:0,dz:-1,turn:0,throttle:0})));
  assert.ok(Math.abs(moved.state.position.z-start.state.position.z-(-0.4))<1e-8);assert.equal(moved.state.tick,0);
  assert.equal((await e.call('command',{blob:'x'.repeat(8193)})).status,413);
});
test('cargo retry is atomic across inventory, ledger and command receipt',async t=>{
  const e=setup(t);await e.call();await e.call('command',e.cmd(1,{type:'choose-profession',profession:'transport'}));await e.call('command',e.cmd(2,{type:'gather',id:'timber'}));
  const c=e.cmd(3,{type:'cargo',envelope:{commandId:'cargo-1',expectedRevision:0,command:{type:'deposit',good:'wood',quantity:1,dock:'haven'}}});
  await e.call('command',c);await e.call('command',c);
  const s=(await data(await e.call())).state;assert.equal(s.inventory.wood,0);assert.equal(s.logistics.revision,1);assert.equal(s.logistics.lots[0].quantity,1);
});
test('client reconnect recovers a response lost after commit using persistent intent and no token storage',async t=>{
  const e=setup(t),store=memory(),token=await e.token();let drop=true;let snapshot:any;
  const transport:typeof fetch=async(input:any,init:any)=>{const r=await e.transport(input,init);if(init.method==='POST'&&drop){drop=false;throw new Error('connection reset after commit');}return r;};
  const c=new AuthorityClient('haven',token,store,s=>snapshot=s,()=>{},transport);await c.connect();await c.send({type:'gather',id:'timber'});
  assert.ok(c.pending);assert.ok([...store.values.values()].every(v=>!v.includes(token)));c.stop();
  const fresh=new AuthorityClient('haven',token,store,s=>snapshot=s,()=>{},e.transport);await fresh.connect();assert.equal(snapshot.state.inventory.wood,1);assert.equal(fresh.pending,undefined);assert.equal(store.values.size,0);
});
test('client fails closed before network mutation if outbox persistence fails',async t=>{
  const e=setup(t);const store=memory();const c=new AuthorityClient('haven',await e.token(),{...store,setItem:()=>{throw new Error('quota');}},()=>{},()=>{},e.transport);
  await c.connect();assert.equal(await c.send({type:'gather',id:'timber'}),false);assert.equal((await data(await e.call())).state.inventory.wood,0);
});
test('client retains conflicting action and pauses rather than rebasing economy automatically',async t=>{
  const e=setup(t),store=memory();let status='';const c=new AuthorityClient('haven',await e.token(),store,()=>{},s=>status=s,e.transport);await c.connect();
  await e.call('command',e.cmd(1,{type:'gather',id:'timber'},'other-device'));
  await c.send({type:'gather',id:'timber'});assert.ok(c.pending);assert.match(status,/conflict/);assert.equal(await c.send({type:'gather',id:'timber'}),false);
});
test('rate limit does not consume sequence and invalid origin receives no CORS grant',async t=>{
  const e=setup(t);await e.call();const token=await e.token();
  const response=await worker.fetch(new Request('https://game.test/api/authority/haven/command',{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify(e.cmd(1,{type:'gather',id:'timber'}))}),e.env);
  assert.equal(response.status,429);assert.equal((await data(await e.call())).sequence,0);
  const denied=await e.call('snapshot',undefined,'player_001','haven',{origin:'https://evil.test'});assert.equal(denied.status,403);assert.equal(denied.headers.get('access-control-allow-origin'),null);
});
test('explicit reconciliation abandons a conflicting action and resumes from server sequence',async t=>{
  const e=setup(t),store=memory();let snapshot:any;
  const client=new AuthorityClient('haven',await e.token(),store,s=>snapshot=s,()=>{},e.transport);await client.connect();
  await e.call('command',e.cmd(1,{type:'gather',id:'timber'},'other-device'));await client.send({type:'gather',id:'timber'});assert.ok(client.pending);
  await client.useServerProgress();assert.equal(client.pending,undefined);assert.equal(snapshot.state.inventory.wood,1);
  await client.send({type:'gather',id:'timber'});assert.equal(snapshot.state.inventory.wood,2);assert.equal(snapshot.sequence,2);
});
test('aggregate capacity fails closed without consuming a sequence or erasing the prior receipt',async t=>{
  const e=setup(t);await e.call();await e.call('command',e.cmd(1,{type:'choose-profession',profession:'transport'}));
  let sequence=2,revision=0,lotId='';let last:any;let blocked=false;
  for(let n=0;n<512;n++) {
    const action=n%2===0?{type:'deposit',good:'food',quantity:1,dock:'haven'}:{type:'withdraw',lotId,quantity:1};
    const response=await e.call('command',e.cmd(sequence,{type:'cargo',envelope:{commandId:'cap-'+n,expectedRevision:revision,command:action}}));
    if(response.status===507) {blocked=true;break;}
    assert.equal(response.status,200);last=await data(response);revision=last.state.logistics.revision;lotId=last.state.logistics.lots[0]?.id??'';sequence++;
  }
  assert.equal(blocked,true);const after=await data(await e.call());assert.equal(after.sequence,last.sequence);assert.deepEqual(after.state,last.state);
});
