import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LODESTONE, WATERLINE, WORLD, angularGap, breaksSurface, compassReading, deviation, inBounds, trueBearing } from '../packages/world/compass.ts';

const around = (radius: number, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return { x: radius * Math.cos(a), z: radius * Math.sin(a) };
  });

test('on the rock there is no bearing, and the deviation is zero', () => {
  assert.equal(trueBearing({ x: 0, z: 0 }), null);
  assert.equal(compassReading({ x: 0, z: 0 }), null);
  assert.equal(deviation({ x: 0, z: 0 }), 0);
});

test('a ship due south of the rock sees it due north, and the bearing is measured from +z', () => {
  const south = { x: 0, z: -100 };
  assert.ok(angularGap(trueBearing(south)!, 0) < 1e-9);
  const east = { x: -100, z: 0 };
  assert.ok(angularGap(trueBearing(east)!, Math.PI / 2) < 1e-9);
});

test('deviation is zero on the four axes and strongest on the diagonals, with opposite signs', () => {
  const r = 500;
  const at = (deg: number) => deviation({ x: r * Math.cos((deg * Math.PI) / 180), z: r * Math.sin((deg * Math.PI) / 180) });
  for (const deg of [0, 90, 180, 270]) assert.ok(Math.abs(at(deg)) < 1e-9, `axis ${deg} should not deflect`);
  assert.ok(at(45) > 0 && at(225) > 0, 'one diagonal deflects positively');
  assert.ok(at(135) < 0 && at(315) < 0, 'the other diagonal deflects negatively');
});

test('the needle shifts as the ship moves around the rock, and the shift is the deviation', () => {
  const ring = around(500, 16);
  const readings = ring.map((p) => compassReading(p)!);
  const distinct = new Set(readings.map((h) => h.toFixed(6)));
  assert.ok(distinct.size > 8, 'readings should vary around the rock');
  for (const p of ring) {
    const gap = angularGap(compassReading(p)!, trueBearing(p)!);
    assert.ok(Math.abs(gap - Math.abs(deviation(p))) < 1e-9, 'the gap from true is the local deviation');
  }
});

test('deviation never exceeds its amplitude and fades with distance until the needle points true', () => {
  for (const p of around(50, 64)) assert.ok(Math.abs(deviation(p)) <= LODESTONE.amplitude + 1e-12);
  const distant = around(40000, 8).map((p) => Math.abs(deviation(p)));
  assert.ok(Math.max(...distant) < 1e-6, 'far away the needle is true');
  assert.ok(Math.abs(deviation({ x: 300, z: 300 })) > Math.abs(deviation({ x: 3000, z: 3000 })), 'closer is stronger');
});

test('readings always lie in [0, 2π) and the gap measure is symmetric and at most π', () => {
  for (const p of around(800, 32)) {
    const h = compassReading(p)!;
    assert.ok(h >= 0 && h < 2 * Math.PI);
  }
  assert.ok(Math.abs(angularGap(0.1, 6.2) - angularGap(6.2, 0.1)) < 1e-12);
  assert.ok(angularGap(0, Math.PI) <= Math.PI + 1e-12);
});

test('the world is a bounded flat rectangle', () => {
  assert.equal(inBounds({ x: 0, z: 0 }), true);
  assert.equal(inBounds({ x: WORLD.maxX, z: WORLD.minZ }), true);
  assert.equal(inBounds({ x: WORLD.maxX + 1, z: 0 }), false);
  assert.equal(inBounds({ x: 0, z: WORLD.minZ - 1 }), false);
});

test('the pillar pierces the water only when it is taller than the waterline', () => {
  assert.equal(breaksSurface(LODESTONE, WATERLINE), LODESTONE.height > WATERLINE);
  assert.equal(breaksSurface({ ...LODESTONE, height: WATERLINE - 1 }, WATERLINE), false, 'submerged pillar is not land');
  assert.equal(breaksSurface({ ...LODESTONE, height: WATERLINE + 5 }, WATERLINE), true, 'tall pillar stands out of the water');
});
