import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { issueSession } from '../worker/session.ts';

const dir=await mkdtemp(join(tmpdir(),'emberfall-colonies-')),secret=crypto.randomUUID()+crypto.randomUUID(),config=join(dir,'wrangler.toml');
await writeFile(config,`name="emberfall-colony-smoke"
main=${JSON.stringify(resolve('worker/index.ts'))}
compatibility_date="2026-10-17"
compatibility_flags=["nodejs_compat"]
[vars]
CLIENT_ORIGIN="http://127.0.0.1:5192"
[[durable_objects.bindings]]
name="SHARED_WORLDS"
class_name="SharedWorld"
[[migrations]]
tag="v1"
new_sqlite_classes=["SharedWorld"]
`);
await writeFile(join(dir,'.dev.vars'),`AUTHORITY_SIGNING_KEY=${JSON.stringify(secret)}\n`,{mode:0o600});
const children:ReturnType<typeof spawn>[]=[];let logs='',browser,page;
function startWorker(){const p=spawn('npx',['wrangler','dev','--local','--config',config,'--ip','127.0.0.1','--port','8787','--inspector-port','9232','--persist-to',join(dir,'state')],{stdio:'pipe',detached:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});children.push(p);p.stdout?.on('data',v=>{logs+=String(v).replaceAll(secret,'[redacted]');});p.stderr?.on('data',v=>{logs+=String(v).replaceAll(secret,'[redacted]');});return p;}
function stop(p:ReturnType<typeof spawn>){if(p.pid){try{process.kill(-p.pid,'SIGTERM');}catch{}}p.stdout?.destroy();p.stderr?.destroy();p.stdin?.destroy();p.unref();}
async function ready(url:string,headers?:Record<string,string>){for(let n=0;n<160;n++){try{if((await fetch(url,{headers})).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Service failed to start: '+url);}
try {
  let worker=startWorker();const token=await issueSession(secret,'player_001','haven');
  const read=async()=>await (await fetch('http://127.0.0.1:8787/api/world/haven/snapshot',{headers:{authorization:'Bearer '+token}})).json() as any;
  await ready('http://127.0.0.1:8787/api/world/haven/snapshot',{authorization:'Bearer '+token});
  const web=spawn('npm',['run','dev','--','--port','5192','--strictPort'],{stdio:'pipe',detached:true});children.push(web);web.stdout?.on('data',()=>{});web.stderr?.on('data',()=>{});await ready('http://127.0.0.1:5192');
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  page=await browser.newPage({viewport:{width:1440,height:960}});page.setDefaultTimeout(25000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const wait=async(test:(s:any)=>boolean,description:string)=>{for(let n=0;n<400;n++){const s=await read();if(test(s))return s;await new Promise(r=>setTimeout(r,100));}throw new Error('Colony condition timed out: '+description);};
  const lot=(s:any,id:string)=>s.state.logistics.lots.find((l:any)=>l.id===id);
  const openDock=async(q:number)=>{await page.getByRole('button',{name:'L · Dock ledger & cargo'}).click();await page.getByLabel('Cargo quantity').fill(String(q));};
  const closeDock=()=>page.getByRole('button',{name:'Close dock ledger'}).click();
  const action=async(id:string,label:string,test:(s:any)=>boolean)=>{await page.locator(`[data-lot-id="${id}"]`).getByRole('button',{name:label,exact:true}).click();return wait(test,label);};
  const move=async(key:string,test:(s:any)=>boolean)=>{await page.keyboard.down(key);try{return await wait(test,key);}finally{await page.keyboard.up(key);}};
  await page.goto('http://127.0.0.1:5192');await page.getByRole('button',{name:/Shipwright/}).click();await page.getByText('Online expeditions · preview',{exact:true}).click();await page.getByLabel('Authority mode').selectOption('shared');await page.getByLabel('Authority access token').fill(token);await page.getByRole('button',{name:'Connect to expedition',exact:true}).click();await page.getByRole('button',{name:/Transport/}).click();
  await wait(s=>s.state.profession==='transport','profession');
  for(let n=1;n<=6;n++){await page.getByRole('button',{name:'Gather wood',exact:true}).click();await wait(s=>s.state.inventory.wood>=n,'gather');}
  await openDock(6);await page.getByRole('button',{name:'Deposit carried supplies'}).click();await wait(s=>lot(s,'lot-1')?.quantity===6,'deposit');
  await action('lot-1','Assign 6 to aurum-timber',s=>lot(s,'lot-1')?.orderId==='aurum-timber');
  await action('lot-1','Transfer 6',s=>lot(s,'lot-1')?.custodian==='ship');await closeDock();
  await page.getByRole('button',{name:'E · Board / disembark',exact:true}).click();await wait(s=>s.state.mode==='ship','board');
  await move('KeyD',s=>s.state.position.x>=2.8);await move('KeyW',s=>s.state.position.z<=-18.8);
  await openDock(6);await page.getByLabel('Transfer destination').selectOption('aurum-store');await action('lot-1','Transfer 6',s=>lot(s,'lot-1')?.custodian==='aurum-store');
  await action('lot-1','Fulfill 6 at destination',s=>s.shared.economy.contracts.find((c:any)=>c.id==='aurum-timber').status==='completed');await closeDock();
  await page.getByText('Colony production & contracts',{exact:true}).click();await page.getByTestId('contract-aurum-timber').filter({hasText:'completed'}).waitFor();await page.getByLabel('Production colony').selectOption('aurum');
  await page.getByRole('button',{name:'Prioritize Granite quarry',exact:true}).click();await wait(s=>s.shared.economy.colonies.find((c:any)=>c.id==='aurum').focus==='granite','production focus');
  await page.getByLabel('Colony supply').selectOption('food');await page.getByLabel('Colony quantity').fill('4');await page.getByRole('button',{name:'Load colony stock into cargo'}).click();await wait(s=>lot(s,'lot-2')?.quantity===4,'colony food load');
  await openDock(4);await action('lot-2','Assign 4 to haven-provisions',s=>lot(s,'lot-2')?.orderId==='haven-provisions');await page.getByLabel('Transfer destination').selectOption('ship');await action('lot-2','Transfer 4',s=>lot(s,'lot-2')?.custodian==='ship');await closeDock();
  await move('KeyA',s=>s.state.position.x<=-2.8);await move('KeyS',s=>s.state.position.z>=12.8);
  await openDock(4);await page.getByLabel('Transfer destination').selectOption('haven-store');await action('lot-2','Transfer 4',s=>lot(s,'lot-2')?.custodian==='haven-store');await action('lot-2','Fulfill 4 at destination',s=>s.shared.economy.contracts.find((c:any)=>c.id==='haven-provisions').status==='completed');await closeDock();
  await page.getByTestId('contract-haven-provisions').filter({hasText:'completed'}).waitFor();
  const produced=await wait(s=>s.shared.economy.colonies.find((c:any)=>c.id==='haven').jobs.find((j:any)=>j.id==='forestry').batches>=1,'unlocked forestry output');
  assert.equal(produced.state.colonies[0].population,10);assert.equal(produced.state.colonies[1].population,18);assert.equal(produced.state.logistics.reputation,100);
  assert.equal(produced.shared.contributions.total,100);assert.equal(produced.shared.contributions.professions[0].id,'transport');
  await page.getByText('Contribution standings · room preview',{exact:true}).click();await page.getByText(/Rank 1 · transport · 100 points/).waitFor();
  let dropped=false;await page.route('**/api/world/haven/command',async route=>{const c=route.request().postDataJSON()?.command;if(!dropped && c?.type==='colony-load' && c.colony==='haven' && c.good==='wood'){dropped=true;await route.fetch();await route.abort('connectionreset');}else await route.continue();});
  await page.getByLabel('Production colony').selectOption('haven');await page.getByLabel('Colony supply').selectOption('wood');await page.getByLabel('Colony quantity').fill('2');await page.getByRole('button',{name:'Load colony stock into cargo'}).click();await wait(s=>lot(s,'lot-3')?.quantity===2,'produced wood load');
  await page.getByText('SHARED COLONY ROOM · Authority connected',{exact:false}).waitFor();await openDock(2);await page.locator('[data-lot-id="lot-3"]').waitFor();await closeDock();
  assert.equal(dropped,true);const loaded=await read();assert.equal(loaded.state.logistics.events.filter((e:any)=>e.type==='ColonyStockReleased').length,2);assert.equal(loaded.shared.economy.contracts.filter((c:any)=>c.status==='completed').length,2);
  await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/colony-contracts.png'});
  await page.getByRole('button',{name:'Return to local save'}).click();await page.waitForTimeout(250);const before=await read();const exited=new Promise<void>(r=>worker.once('exit',()=>r()));stop(worker);await exited;worker=startWorker();await ready('http://127.0.0.1:8787/api/world/haven/snapshot',{authorization:'Bearer '+token});const after=await read();
  assert.deepEqual(after.shared.contributions,before.shared.contributions);assert.equal(after.shared.contributions.total,100);assert.deepEqual(after.state.logistics,before.state.logistics);assert.deepEqual(after.shared.economy.colonies,before.shared.economy.colonies);assert.deepEqual(after.shared.economy.contracts,before.shared.economy.contracts);assert.deepEqual(errors,[]);
  console.log('PASS: actual browser gathering and two-way ship voyage, both one-time colony contracts, NPC stock release, production focus, unlocked finite forestry, lost stock-release acknowledgement without duplication, and workerd/SQLite restart recovery.');
} catch(e){if(page && !page.isClosed()){await mkdir('build/screenshots',{recursive:true});await page.screenshot({path:'build/screenshots/colony-failure.png'});console.error('Browser alerts:',await page.getByRole('alert').allTextContents());}console.error(logs.slice(-5000));throw e;}
finally{await browser?.close();for(const p of children)stop(p);await rm(dir,{recursive:true,force:true});}
