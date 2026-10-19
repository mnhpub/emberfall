import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_WATERWAY,
  initialWaterwayState,
  validateWaterway,
  travelSeconds,
  route,
  routeTable,
  downstreamSettlements,
  closeReach,
  setCurrent,
  advanceTo,
  BOAT_SPEED,
  type Waterway,
} from '../packages/waterway/index.ts';

const W = SAMPLE_WATERWAY;
const S = initialWaterwayState(W);

test('the sample network is a sound directed graph', () => {
  assert.deepEqual(validateWaterway(W), []);
});

test('validation names each kind of broken topology', () => {
  const base = structuredClone(W) as Waterway;
  const cases: [string, Waterway, RegExp][] = [
    ['duplicate node', { ...base, nodes: [...base.nodes, base.nodes[0]] }, /duplicate node/],
    ['unknown endpoint', { ...base, reaches: [...base.reaches, { id: 'x', from: 'haven', to: 'nowhere', length: 10, current: 0 }] }, /unknown node/],
    ['self loop', { ...base, reaches: [...base.reaches, { id: 'x', from: 'haven', to: 'haven', length: 10, current: 0 }] }, /loops back/],
    ['zero length', { ...base, reaches: base.reaches.map((r, i) => (i === 0 ? { ...r, length: 0 } : r)) }, /non-positive length/],
    ['duplicate pair', { ...base, reaches: [...base.reaches, { id: 'x', from: 'aurum', to: 'greece-mouth', length: 10, current: 0 }] }, /two reaches join/],
    [
      'flow cycle',
      {
        nodes: [
          { id: 'a', kind: 'junction', name: 'a' },
          { id: 'b', kind: 'junction', name: 'b' },
          { id: 'c', kind: 'junction', name: 'c' },
        ],
        reaches: [
          { id: 'ab', from: 'a', to: 'b', length: 1, current: 1 },
          { id: 'bc', from: 'b', to: 'c', length: 1, current: 1 },
          { id: 'ca', from: 'c', to: 'a', length: 1, current: 1 },
        ],
      },
      /cycle/,
    ],
  ];
  for (const [name, w, pattern] of cases) assert.ok(validateWaterway(w).some((p) => pattern.test(p)), `${name} not caught`);
});

test('travel with the current is faster than against it', () => {
  const down = travelSeconds(W, S, 'haven', 'greece-mouth')!;
  const up = travelSeconds(W, S, 'greece-mouth', 'haven')!;
  assert.ok(down < up, `downstream ${down}s should beat upstream ${up}s`);
  const length = 600;
  assert.ok(Math.abs(down - length / (BOAT_SPEED + 0.9)) < 1e-9);
  assert.ok(Math.abs(up - length / (BOAT_SPEED - 0.9)) < 1e-9);
});

test('a current stronger than the boat cannot be climbed', () => {
  const strong = setCurrent(S, 'haven-mouth', BOAT_SPEED + 1);
  assert.equal(travelSeconds(W, strong, 'greece-mouth', 'haven'), null);
  assert.ok(travelSeconds(W, strong, 'haven', 'greece-mouth') !== null);
});

test('a closed reach is impassable in both directions and reopens when its closure ends', () => {
  const closed = closeReach(S, 'mouth-aurum', 10);
  assert.equal(travelSeconds(W, closed, 'greece-mouth', 'aurum'), null);
  assert.equal(travelSeconds(W, closed, 'aurum', 'greece-mouth'), null);
  assert.equal(route(W, closed, 'haven', 'aurum'), null, 'the only path to Aurum runs over the closed reach');
  assert.equal(advanceTo(closed, 9).reaches['mouth-aurum'].open, false);
  const reopened = advanceTo(closed, 10);
  assert.equal(reopened.reaches['mouth-aurum'].open, true);
  assert.ok(route(W, reopened, 'haven', 'aurum'));
});

test('routing picks the fastest open path and reports its reaches in order', () => {
  const r = route(W, S, 'hollow-spring', 'delta')!;
  assert.deepEqual(r.nodes, ['hollow-spring', 'north-bend', 'haven', 'greece-mouth', 'aurum', 'delta']);
  assert.ok(r.seconds > 0);
});

test('the Greek tributary is reachable from the main stem and feeds it at the mouth', () => {
  const r = route(W, S, 'greece', 'aurum')!;
  assert.deepEqual(r.nodes, ['greece', 'greece-mouth', 'aurum']);
});

test('downstream projection lists settlements the current carries water to, and no upstream ones', () => {
  assert.deepEqual(downstreamSettlements(W, S, 'haven'), ['aurum', 'delta']);
  assert.deepEqual(downstreamSettlements(W, S, 'greece'), ['aurum', 'delta']);
  assert.deepEqual(downstreamSettlements(W, S, 'delta'), []);
  const cut = closeReach(S, 'haven-mouth', 100);
  assert.deepEqual(downstreamSettlements(W, cut, 'haven'), [], 'a closed reach carries nothing downstream');
});

test('the route table covers every settlement pair it can, with downstream faster than upstream', () => {
  const table = routeTable(W, S);
  assert.equal(table['haven']['delta'] !== undefined, true);
  assert.ok(table['delta']['haven'] !== undefined, 'upstream travel against a weaker current is possible');
  assert.ok(table['haven']['delta'] < table['delta']['haven'], 'downstream is faster');
  for (const a of Object.keys(table)) assert.equal(table[a][a], 0);
});

test('state transitions do not mutate their input', () => {
  const before = structuredClone(S);
  closeReach(S, 'bend-haven', 5);
  setCurrent(S, 'bend-haven', 2);
  advanceTo(S, 3);
  assert.deepEqual(S, before);
});

test('closures must end in the future and time does not run backwards', () => {
  assert.throws(() => closeReach(S, 'bend-haven', 0), /future/);
  assert.throws(() => advanceTo(advanceTo(S, 5), 4), /backwards/);
  assert.throws(() => closeReach(S, 'missing', 9), /unknown reach/);
});
