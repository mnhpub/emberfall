import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANVIL, visibleStars, starPosition, trueHeadingFromStar } from '../packages/world/sky.ts';

test('every star of the constellation is above the horizon', () => {
  assert.equal(visibleStars().length, ANVIL.stars.length);
  for (const s of ANVIL.stars) assert.ok(s.altitude > 0 && s.altitude < Math.PI / 2);
});

test('stars project onto the sky dome above the water at the given radius', () => {
  for (const s of ANVIL.stars) {
    const p = starPosition(s, 3000);
    assert.ok(Math.abs(Math.hypot(p.x, p.y, p.z) - 3000) < 1e-6);
    assert.ok(p.y > 0, `${s.name} is above the water`);
  }
});

test('the pointer star marks true north, so a sighting on it gives a true heading of zero', () => {
  assert.equal(trueHeadingFromStar('Pointer'), 0);
  assert.ok(Math.abs(trueHeadingFromStar('Hearth') - (285 * Math.PI) / 180) < 1e-12);
  assert.throws(() => trueHeadingFromStar('Nowhere'), /unknown star/);
});

test('constellation outline links only valid stars', () => {
  for (const [a, b] of ANVIL.links) {
    assert.ok(a >= 0 && a < ANVIL.stars.length && b >= 0 && b < ANVIL.stars.length);
    assert.notEqual(a, b);
  }
});
