import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, restore, waterField, type State } from '../packages/game-core/index.ts';
test('finite gathering, range checks and immutable transitions',()=>{
 let s=initialState();const original=structuredClone(s);s=transition(s,{type:'gather',id:'timber'});assert.equal(s.inventory.wood,1);assert.deepEqual(original,initialState());
 for(let i=0;i<100;i++)s=transition(s,{type:'gather',id:'timber'});assert.equal(s.inventory.wood,initialState().nodes.timber);assert.equal(s.nodes.timber,0);
 assert.equal(transition(s,{type:'gather',id:'quarry'}).inventory.stone,0);
});
test('pyramid consumes granite and gold and propagates downstream',()=>{
 let s=initialState();s.inventory.stone=9;s.inventory.gold=1;for(let i=0;i<4;i++)s=transition(s,{type:'build'});
 assert.equal(s.colonies[0].active,true);assert.equal(s.inventory.stone,0);assert.equal(s.inventory.gold,0);assert.equal(waterField(s,16),2);assert.equal(waterField(s,-25),0);
});
test('movement cannot cross banks and ignores nonfinite commands',()=>{
 let s=initialState();for(let i=0;i<100;i++)s=transition(s,{type:'move',dx:1,dz:0,dt:0.1});assert.ok(s.position.x<-4);
 assert.deepEqual(transition(s,{type:'move',dx:Infinity,dz:0,dt:1}),s);
});
test('boarding, combat cooldown, damage, repair, salvage and delivery',()=>{
 let s=transition(initialState(),{type:'board'});assert.equal(s.mode,'ship');
 s.position={x:0,z:-10};s.ship.x=0;s.ship.z=-10;
 s=transition(s,{type:'tick'});assert.equal(s.ship.hull,95);
 s=transition(s,{type:'attack'});assert.equal(s.beast.hp,45);assert.equal(transition(s,{type:'attack'}).beast.hp,45);
 s.inventory.wood=2;s=transition(s,{type:'repair'});assert.equal(s.ship.hull,100);assert.equal(s.inventory.wood,0);
 s.position={x:0,z:-25};s=transition(s,{type:'recover'});assert.equal(s.ship.cargo.relic,1);
 s.ship.x=-3;s.ship.z=13;s.position={x:-3,z:13};s=transition(s,{type:'deliver'});assert.equal(s.delivered,true);assert.equal(s.colonies[0].population,10);
 assert.equal(transition(s,{type:'deliver'}).colonies[0].population,10);
});
test('saves roundtrip and reject malformed values',()=>{
 assert.deepEqual(restore(JSON.parse(JSON.stringify(initialState()))),initialState());
 for(const v of [null,{}, {...initialState(),version:99},{...initialState(),ship:null},{...initialState(),inventory:{wood:-1}}])assert.throws(()=>restore(v));
});
test('all generated gameplay states restore',()=>{
 let s:State=transition(initialState(),{type:'board'});for(let i=0;i<150;i++)s=transition(s,{type:'move',dx:1,dz:1,dt:0.1});assert.deepEqual(restore(s),s);
});
test('complete expedition and construction through public commands without position edits',()=>{
 let s=initialState();
 const go=(x:number,z:number)=>{for(let i=0;i<2000&&Math.hypot(s.position.x-x,s.position.z-z)>0.35;i++){s=transition(s,{type:'move',dx:x-s.position.x,dz:z-s.position.z,dt:0.05});}assert.ok(Math.hypot(s.position.x-x,s.position.z-z)<0.36,`Cannot reach ${x},${z}`);};
 go(-9,10);for(let i=0;i<4;i++)s=transition(s,{type:'gather',id:'timber'});
 go(-13,7);for(let i=0;i<9;i++)s=transition(s,{type:'gather',id:'quarry'});
 go(-7,6);s=transition(s,{type:'gather',id:'gold'});
 go(-8,13);for(let i=0;i<4;i++)s=transition(s,{type:'build'});assert.ok(s.colonies[0].active);
 s=transition(s,{type:'board'});assert.equal(s.mode,'ship');
 go(-3,-10);for(let i=0;i<4;i++){s=transition(s,{type:'attack'});s=transition(s,{type:'tick'});s=transition(s,{type:'tick'});}assert.equal(s.beast.hp,0);
 go(-3,-25);s=transition(s,{type:'recover'});go(-3,13);s=transition(s,{type:'deliver'});assert.ok(s.delivered);assert.deepEqual(restore(JSON.parse(JSON.stringify(s))),s);
});
