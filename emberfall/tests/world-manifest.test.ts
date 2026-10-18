import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockLedger, embark, enduranceDays, sail, type Ship, type Soul } from '../packages/world/manifest.ts';

const soul = (id: string): Soul => ({ id, name: id });
const crew = (n: number): Soul[] => Array.from({ length: n }, (_, i) => soul(`s${i + 1}`));
const ship = (souls: number, provisions: number): Ship => ({ id: 'ship-1', manifest: crew(souls), provisions });

test('endurance is provisions divided by the souls aboard, in whole days', () => {
  assert.equal(enduranceDays(ship(4, 20)), 5);
  assert.equal(enduranceDays(ship(3, 20)), 6);
  assert.equal(enduranceDays(ship(0, 20)), Infinity, 'an empty ship needs no food');
});

test('embarking adds a soul once and refuses duplicates', () => {
  const s = embark(ship(1, 10), soul('new'));
  assert.deepEqual(s.manifest.map((x) => x.id), ['s1', 'new']);
  assert.throws(() => embark(s, soul('new')), /already on the manifest/);
});

test('sailing within endurance feeds everyone and loses nobody', () => {
  const r = sail(ship(4, 20), 5);
  assert.equal(r.lost.length, 0);
  assert.equal(r.daysSailed, 5);
  assert.equal(r.ship.provisions, 0);
  assert.equal(r.ship.manifest.length, 4);
});

test('sailing past endurance starves souls off the manifest until the crew is gone', () => {
  // 10 rations for 4 souls: days 1-2 are fed, day 3 starves two, day 4 starves the last two.
  const r = sail(ship(4, 10), 6);
  assert.equal(r.daysSailed, 4, 'the ship stops once its crew is gone');
  assert.equal(r.lost.length, 4);
  assert.equal(r.ship.manifest.length, 0);
  assert.equal(r.ship.provisions, 0);
});

test('the dock ledger lists the souls aboard, provisions and endurance; an empty ship has no endurance figure', () => {
  const l = dockLedger(ship(3, 20));
  assert.deepEqual(l, { shipId: 'ship-1', souls: ['s1', 's2', 's3'], provisions: 20, enduranceDays: 6 });
  assert.equal(dockLedger(ship(0, 5)).enduranceDays, null);
});

test('a ship with no crew left stops sailing and reports no days beyond it', () => {
  const r = sail(ship(2, 0), 10);
  assert.equal(r.ship.manifest.length, 0);
  assert.equal(r.lost.length, 2);
  assert.ok(r.daysSailed <= 10);
  assert.throws(() => sail(ship(1, 1), -1), /whole number/);
});
