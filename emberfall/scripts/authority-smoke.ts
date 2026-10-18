import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { issueSession } from '../worker/session.ts';

const dir=await mkdtemp(join(tmpdir(),'emberfall-authority-'));
const secret=crypto.randomUUID()+crypto.randomUUID();
const config=join(dir,'wrangler.toml');
await writeFile(config,`name="emberfall-authority-smoke"
main=${JSON.stringify(resolve('worker/index.ts'))}
compatibility_date="2026-10-17"
compatibility_flags=["nodejs_compat"]
[vars]
CLIENT_ORIGIN="http://127.0.0.1:5190"
[[durable_objects.bindings]]
name="AUTHORITY_SESSIONS"
class_name="AuthoritySession"
[[migrations]]
tag="v1"
new_sqlite_classes=["AuthoritySession","SharedWorld"]
[[durable_objects.bindings]]
name="SHARED_WORLDS"
class_name="SharedWorld"
`);
await writeFile(join(dir,'.dev.vars'),`AUTHORITY_SIGNING_KEY=${JSON.stringify(secret)}\n`,{mode:0o600});
const children: ReturnType<typeof spawn>[]=[];let browser;let page;let logs='';
function startWorker() {
  const p=spawn('npx',['wrangler','dev','--local','--config',config,'--port','8787','--ip','127.0.0.1','--inspector-port','9231','--persist-to',join(dir,'state')],{stdio:'pipe',detached:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});children.push(p);p.stdout?.on('data',v=>{logs+=String(v).replaceAll(secret,'[redacted]');});p.stderr?.on('data',v=>{logs+=String(v).replaceAll(secret,'[redacted]');});return p;
}
function stop(p: ReturnType<typeof spawn>) {if(p.pid){try{process.kill(-p.pid,'SIGTERM');}catch{}}p.stdout?.destroy();p.stderr?.destroy();p.stdin?.destroy();p.unref();}
async function ready(url:string,headers?:Record<string,string>) {for(let n=0;n<160;n++){try{const r=await fetch(url,{headers});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Service did not become ready: '+url);}
try {
  let worker=startWorker();
  const token=await issueSession(secret,'player_001','haven');
  await ready('http://127.0.0.1:8787/api/authority/haven/snapshot',{authorization:'Bearer '+token});
  const web=spawn('npm',['run','dev','--','--port','5190','--strictPort'],{stdio:'pipe',detached:true});children.push(web);web.stdout?.on('data',()=>{});web.stderr?.on('data',()=>{});
  await ready('http://127.0.0.1:5190');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(20000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5190');
  await page.getByRole('button',{name:/Shipwright/}).click();
  await page.getByText('Online expeditions · preview',{exact:true}).click();
  await page.getByLabel('Authority access token').fill(token);
  await page.getByRole('button',{name:'Connect to expedition',exact:true}).click();
  await page.getByRole('button',{name:/Fisher/}).click();
  await page.getByText('PRIVATE ONLINE EXPEDITION · Authority connected',{exact:false}).waitFor();
  // Lose an economic acknowledgement after the actual Worker has committed it.
  let lost=false;
  await page.route('**/api/authority/haven/command',async route=>{
    const command=route.request().postDataJSON()?.command;
    if(!lost && command?.type==='gather') {lost=true;await route.fetch();await route.abort('connectionreset');}else await route.continue();
  });
  await page.getByRole('button',{name:/Gather wood/}).click();
  await page.waitForFunction(()=>document.querySelector('.sea-panel')?.textContent?.includes('Timber 1'));
  assert.equal(lost,true);
  const read=async()=>await (await fetch('http://127.0.0.1:8787/api/authority/haven/snapshot',{headers:{authorization:'Bearer '+token}})).json() as any;
  assert.equal((await read()).state.inventory.wood,1);
  const keyValues=await page.evaluate(()=>Object.values(localStorage));assert.ok(keyValues.every(v=>!v.includes(token)));
  // Freeze browser client, restart the actual DO runtime, verify SQLite recovery.
  await page.getByRole('button',{name:'Return to local save'}).click();
  const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberfall.maritime.v1')!));assert.equal(local.profession,'shipwright');assert.equal(local.inventory.wood,0);
  const exited=new Promise<void>(r=>worker.once('exit',()=>r()));stop(worker);await exited;
  worker=startWorker();await ready('http://127.0.0.1:8787/api/authority/haven/snapshot',{authorization:'Bearer '+token});
  assert.equal((await read()).state.profession,'fisher');assert.equal((await read()).state.inventory.wood,1);
  await page.getByLabel('Authority access token').fill(token);await page.getByRole('button',{name:'Connect to expedition',exact:true}).click();
  await page.getByText('PRIVATE ONLINE EXPEDITION · Authority connected',{exact:false}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.sea-panel')?.textContent?.includes('Timber 1'));
  await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/authority-reconnect.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: real local Worker authentication, private online UI, lost economic acknowledgement, retry without duplication, isolated local save, SQLite recovery after runtime restart and reconnect.');
  await page.close();
  const a=await browser.newPage({viewport:{width:1440,height:960}}),b=await browser.newPage({viewport:{width:1440,height:960}});
  const tokenB=await issueSession(secret,'player_002','haven');
  const connectShared=async(p:typeof a,credential:string)=>{
    p.setDefaultTimeout(25000);p.on('pageerror',e=>errors.push(e.message));
    await p.goto('http://127.0.0.1:5190');await p.getByRole('button',{name:/Shipwright/}).click();
    await p.getByText('Online expeditions · preview',{exact:true}).click();await p.getByLabel('Authority mode').selectOption('shared');
    await p.getByLabel('Authority access token').fill(credential);await p.getByRole('button',{name:'Connect to expedition',exact:true}).click();
    await p.getByRole('button',{name:/Transport/}).click();
    await p.getByText('SHARED COLONY ROOM · Authority connected',{exact:false}).waitFor();
  };
  await connectShared(a,token);await connectShared(b,tokenB);
  await a.getByTestId('room-roster').filter({hasText:'2 active players'}).waitFor();
  await b.getByTestId('room-roster').filter({hasText:'2 active players'}).waitFor();
  await a.getByRole('button',{name:/Gather wood/}).click();
  await b.getByTestId('shared-timber').filter({hasText:'Timber remaining: 39'}).waitFor();
  assert.ok((await b.locator('.sea-panel').textContent())?.includes('Timber 0'));
  await a.getByRole('button',{name:'L · Dock ledger & cargo'}).click();await a.getByRole('button',{name:'Deposit carried supplies'}).click();
  await a.locator('[data-lot-id="lot-1"]').waitFor();await a.getByRole('button',{name:'Close dock ledger'}).click();
  await a.getByText('Offer cargo to another player',{exact:true}).click();await a.getByLabel('Offered cargo lot').selectOption('lot-1');await a.getByLabel('Cargo recipient').selectOption('player_002');
  await a.getByRole('button',{name:'Offer cargo',exact:true}).click();
  const offer=b.getByRole('button',{name:'Accept offer-1',exact:true});await offer.waitFor();
  let droppedAccept=false;
  await b.route('**/api/world/haven/command',async route=>{if(!droppedAccept && route.request().postDataJSON()?.command?.type==='cargo-accept'){droppedAccept=true;await route.fetch();await route.abort('connectionreset');}else await route.continue();});
  await offer.click();
  await b.getByRole('button',{name:'L · Dock ledger & cargo'}).click();
  await b.locator('[data-lot-id="lot-1"]').waitFor();
  const readShared=async(credential:string)=>await (await fetch('http://127.0.0.1:8787/api/world/haven/snapshot',{headers:{authorization:'Bearer '+credential}})).json() as any;
  for(let n=0;n<100;n++){const s=await readShared(tokenB);if(s.state.logistics.lots.length===1 && s.state.logistics.lots[0].quantity===1)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(droppedAccept,true);assert.equal((await readShared(token)).state.logistics.lots.length,0);
  const received=await readShared(tokenB);assert.equal(received.state.logistics.lots[0].quantity,1);assert.equal(received.state.logistics.events.filter((e:any)=>e.type==='CargoAccepted').length,1);
  await b.getByRole('button',{name:'Close dock ledger'}).click();
  await b.screenshot({path:'build/screenshots/shared-custody.png'});
  // Persist both sides, stop both clients, then restart actual workerd against SQLite.
  await a.getByRole('button',{name:'Return to local save'}).click();await b.getByRole('button',{name:'Return to local save'}).click();
  const sharedExited=new Promise<void>(r=>worker.once('exit',()=>r()));stop(worker);await sharedExited;
  worker=startWorker();await ready('http://127.0.0.1:8787/api/world/haven/snapshot',{authorization:'Bearer '+tokenB});
  assert.equal((await readShared(token)).state.logistics.lots.length,0);assert.equal((await readShared(tokenB)).state.logistics.lots[0].quantity,1);
  // Existing pages retain shared mode; reconnect without changing the offline character.
  await a.getByLabel('Authority access token').fill(token);await a.getByRole('button',{name:'Connect to expedition',exact:true}).click();
  await b.getByLabel('Authority access token').fill(tokenB);await b.getByRole('button',{name:'Connect to expedition',exact:true}).click();
  await b.getByTestId('room-roster').filter({hasText:'2 active players'}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: two shared-room browser clients, common resource depletion, isolated inventories, recipient consent, dropped handoff acknowledgement without duplication, atomic custody persistence across workerd restart and two-player reconnect.');
  const waitShared=async(credential:string,condition:(s:any)=>boolean,description:string)=>{
    for(let n=0;n<400;n++){const s=await readShared(credential);if(condition(s))return s;await new Promise(r=>setTimeout(r,100));}
    throw new Error('Shared ferry condition timed out: '+description);
  };
  const boardShared=async(p:typeof a,credential:string)=>{
    await p.getByRole('button',{name:'Shuttle: Haven ↔ ferry pier',exact:true}).click();
    await waitShared(credential,s=>s.state.position.x===106,'shuttle');
    await p.getByRole('button',{name:'Board Endurance ferry',exact:true}).click();
    await waitShared(credential,s=>s.state.mode==='ferry','board');
  };
  const walkSharedHelm=async(p:typeof a,credential:string)=>{
    for(const [key,condition] of [
      ['KeyD',(s:any)=>s.state.ferry.passenger.local.x>=2.8],
      ['KeyS',(s:any)=>s.state.ferry.passenger.local.z>=34.8],
      ['KeyA',(s:any)=>s.state.ferry.passenger.local.x<=0.2],
    ] as const){await p.keyboard.down(key);try{await waitShared(credential,condition,key);}finally{await p.keyboard.up(key);}}
  };
  await boardShared(a,token);await walkSharedHelm(a,token);
  await boardShared(b,tokenB);await walkSharedHelm(b,tokenB);
  await a.getByRole('button',{name:'H · Take ferry helm',exact:true}).click();await waitShared(token,s=>s.shared.helmActor==='player_001','first helm');
  await b.getByRole('button',{name:'H · Take ferry helm',exact:true}).click();await waitShared(tokenB,s=>s.state.message.includes('already held'),'second helm denied');
  await a.getByRole('button',{name:'Set / furl ferry sails',exact:true}).click();await waitShared(token,s=>s.state.ferry.sails==='set','sails');
  await a.keyboard.down('KeyW');try{await waitShared(token,s=>s.state.ferry.speed>=0.5 && s.state.ferry.pose.z<180,'acceleration');}finally{await a.keyboard.up('KeyW');}
  const sailedA=await readShared(token),sailedB=await readShared(tokenB);
  assert.ok(sailedB.state.ferry.pose.z<180);assert.ok(Math.abs(sailedA.state.ferry.pose.z-sailedB.state.ferry.pose.z)<2);
  await a.getByRole('button',{name:'Return to local save'}).click();
  await waitShared(tokenB,s=>s.shared.helmActor===null && s.state.ferry.sails==='furled','disconnected helm expiry');
  await b.getByRole('button',{name:'H · Take ferry helm',exact:true}).click();await waitShared(tokenB,s=>s.shared.helmActor==='player_002','helm takeover');
  await a.getByLabel('Authority access token').fill(token);await a.getByRole('button',{name:'Connect to expedition',exact:true}).click();
  await a.getByTestId('ferry-attachment').filter({hasText:'Walking deck'}).waitFor();
  const crewA=await readShared(token);assert.equal(crewA.state.mode,'ferry');assert.equal(crewA.shared.helmActor,'player_002');assert.equal(crewA.state.ferry.passenger.station,'deck');
  await a.screenshot({path:'build/screenshots/shared-ferry-crew.png'});assert.deepEqual(errors,[]);
  console.log('PASS: two authenticated crew walk using keyboard input, compete for one helm, sail the same ferry, release disconnected control by lease expiry, transfer helm ownership and reconnect aboard the moving reference frame.');


} catch(e) {if(page && !page.isClosed()){console.error('Browser alerts:',await page.getByRole('alert').allTextContents());await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/authority-failure.png'});}console.error(logs.slice(-6000));throw e;}
finally {await browser?.close();for(const p of children)stop(p);await rm(dir,{recursive:true,force:true});}
