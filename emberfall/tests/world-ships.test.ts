import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialLevel, floodWorld, survivesFlood, type WorldObject } from '../packages/world/flood.ts';

const world: WorldObject[] = [
  { id: 'ship-1', kind: 'ship', elevation: 0 },
  { id: 'craft-1', kind: 'craft', elevation: 0 },
  { id: 'village-1', kind: 'village', elevation: 25 },
  { id: 'colony-1', kind: 'colony', elevation: 35 },
  { id: 'hill-structure', kind: 'structure', elevation: 90 },
];

test('only ships survive a flood', () => {
  assert.equal(survivesFlood('ship'), true);
  for (const k of ['craft', 'village', 'colony', 'structure'] as const) assert.equal(survivesFlood(k), false);
});

test('a flood removes drowned objects, records them as wreckage, and keeps the ships afloat', () => {
  const r = floodWorld(initialLevel(20), world, 50, 'architect_1', 'architect', 1);
  assert.deepEqual(r.lost.map((o) => o.id).sort(), ['colony-1', 'craft-1', 'village-1']);
  assert.deepEqual(r.objects.map((o) => o.id).sort(), ['hill-structure', 'ship-1']);
  assert.equal(r.objects.find((o) => o.id === 'ship-1')!.elevation, 50, 'the ship floats at the new waterline');
  assert.deepEqual([...r.level.wrecks.at(-1)!.lost!].sort(), ['colony-1', 'craft-1', 'village-1']);
});

test('lowering the waterline restores nothing', () => {
  const up = floodWorld(initialLevel(20), world, 50, 'architect_1', 'architect', 1);
  const down = floodWorld(up.level, up.objects, 10, 'architect_1', 'architect', 2);
  assert.deepEqual(down.objects.map((o) => o.id).sort(), ['hill-structure', 'ship-1']);
  assert.equal(down.lost.length, 0);
});

test('a flood is refused for non-architects', () => {
  assert.throws(() => floodWorld(initialLevel(20), world, 50, 'player_001', 'player', 1), /only the architect/);
});
