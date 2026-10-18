import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLevel, setWaterline, isLandAt, pillarAboveWater, lastDirection, MAX_WATERLINE, diveable, salvageWreck } from '../packages/world/flood.ts';
import { LODESTONE } from '../packages/world/compass.ts';

test('only the architect can change the waterline', () => {
  const s = initialLevel();
  assert.throws(() => setWaterline(s, 70, 'player_001', 'player', 1), /only the architect/);
  assert.equal(setWaterline(s, 70, 'architect_1', 'architect', 1).waterline, 70);
});

test('raising the waterline submerges the pillar; lowering it exposes the pillar again', () => {
  const s = initialLevel();
  assert.equal(pillarAboveWater(s), true, 'pillar stands clear at the default level');
  const flooded = setWaterline(s, 70, 'architect_1', 'architect', 1);
  assert.equal(pillarAboveWater(flooded), false, 'a 70 m flood covers the 60 m pillar');
  const receded = setWaterline(flooded, 20, 'architect_1', 'architect', 2);
  assert.equal(pillarAboveWater(receded), true);
  assert.equal(isLandAt(LODESTONE.height, receded), true);
});

test('land is ground above the waterline, and a flood moves that boundary', () => {
  const s = initialLevel(40);
  assert.equal(isLandAt(30, s), false);
  const up = setWaterline(s, 50, 'architect_1', 'architect', 1);
  assert.equal(isLandAt(30, up), false, 'a rising flood drowns ground that was land');
  const down = setWaterline(up, 20, 'architect_1', 'architect', 2);
  assert.equal(isLandAt(30, down), true, 'a receding flood exposes it');
});

test('every change is recorded, so floods stack in order with their direction', () => {
  let s = initialLevel(40);
  s = setWaterline(s, 70, 'architect_1', 'architect', 1);
  s = setWaterline(s, 30, 'architect_1', 'architect', 2);
  assert.deepEqual(s.floods.map((f) => [f.id, f.from, f.to, f.tick]), [['flood-1', 40, 70, 1], ['flood-2', 70, 30, 2]]);
  assert.equal(lastDirection(s), 'receding');
  assert.equal(lastDirection(initialLevel()), null);
});

test('a no-op keeps the history, and invalid levels or times are refused', () => {
  const s = initialLevel(40);
  const same = setWaterline(s, 40, 'architect_1', 'architect', 5);
  assert.equal(same.floods.length, 0);
  assert.throws(() => setWaterline(s, -1, 'architect_1', 'architect', 1), /between/);
  assert.throws(() => setWaterline(s, MAX_WATERLINE + 1, 'architect_1', 'architect', 1), /between/);
  assert.throws(() => setWaterline(advance(s, 9), 50, 'architect_1', 'architect', 4), /backwards/);
});

function advance(s: ReturnType<typeof initialLevel>, tick: number) {
  return { ...s, tick };
}

test('a rising flood leaves its drowned band as wreckage that can be dived while underwater', () => {
  let s = initialLevel(20);
  s = setWaterline(s, 50, 'architect_1', 'architect', 1);
  assert.equal(s.wrecks.length, 1);
  const wreck = s.wrecks[0];
  assert.deepEqual([wreck.bottom, wreck.top, wreck.floodId], [20, 50, 'flood-1']);
  assert.equal(diveable(wreck, s), true, 'the wreck is under the new water');
  s = salvageWreck(s, wreck.id, 'player_001');
  assert.equal(s.wrecks[0].salvaged, true);
});

test('a wreck cannot be dived once it is salvaged or once the water has receded below it', () => {
  let s = initialLevel(20);
  s = setWaterline(s, 50, 'architect_1', 'architect', 1);
  s = salvageWreck(s, s.wrecks[0].id, 'player_001');
  assert.throws(() => salvageWreck(s, s.wrecks[0].id, 'player_002'), /already been salvaged/);
  let t = setWaterline(initialLevel(20), 50, 'architect_1', 'architect', 1);
  const id = t.wrecks[0].id;
  t = setWaterline(t, 10, 'architect_1', 'architect', 2);
  assert.equal(t.wrecks.length, 1, 'receding keeps the history');
  assert.throws(() => salvageWreck(t, id, 'player_001'), /above the water/);
});

test('receding and no-op changes leave no wreckage; unknown wrecks are refused', () => {
  const s = setWaterline(initialLevel(40), 20, 'architect_1', 'architect', 1);
  assert.equal(s.wrecks.length, 0, 'lowering the level creates no wreck');
  assert.throws(() => salvageWreck(s, 'missing', 'player_001'), /unknown wreck/);
  assert.equal(setWaterline(initialLevel(40), 40, 'architect_1', 'architect', 2).wrecks.length, 0);
});
