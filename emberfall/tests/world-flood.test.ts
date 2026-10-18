import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLevel, setWaterline, isLandAt, pillarAboveWater, lastDirection, MAX_WATERLINE } from '../packages/world/flood.ts';
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
