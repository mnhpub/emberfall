import { boardBlocker, helmBlocker } from '../packages/game-core/ferry.ts';
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FERRY,
  initialFerry,
  localToWorld,
  worldToLocal,
  onDeck,
  deckBlocked,
  clearWater,
  atPier,
  separation,
} from "../packages/vessels/index.ts";
import {
  initialState,
  transition,
  restore,
  type State,
} from "../packages/game-core/index.ts";
import { cargoContext } from "../packages/game-core/logistics.ts";
import { execute, usage } from "../packages/logistics/index.ts";
function board() {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  s = transition(s, { type: "ferry-shuttle" });
  s = transition(s, { type: "ferry-board" });
  assert.equal(s.mode, "ferry");
  return s;
}
function walk(s: State, x: number, z: number) {
  for (
    let n = 0;
    n < 1500 &&
    Math.hypot(s.ferry.passenger!.local.x - x, s.ferry.passenger!.local.z - z) >
      0.25;
    n++
  )
    s = transition(s, {
      type: "move",
      dx: x - s.ferry.passenger!.local.x,
      dz: z - s.ferry.passenger!.local.z,
      dt: 0.05,
    });
  assert.ok(
    Math.hypot(s.ferry.passenger!.local.x - x, s.ferry.passenger!.local.z - z) <
      0.26,
  );
  return s;
}
function helm() {
  let s = board();
  s = walk(s, 3, 0);
  s = walk(s, 3, 35);
  s = walk(s, 0, 35);
  s = transition(s, { type: "ferry-helm" });
  assert.equal(s.ferry.passenger!.station, "helm");
  return s;
}
test("local/world transforms round-trip across headings and translations", () => {
  for (const heading of [-Math.PI, -1.2, 0, 0.8, Math.PI])
    for (const local of [
      { x: -9, z: 0 },
      { x: 3, z: 35 },
      { x: 0, z: -71 },
    ]) {
      const pose = { x: 120, z: 180, heading };
      assert.ok(
        separation(worldToLocal(localToWorld(local, pose), pose), local) <
          1e-10,
      );
    }
});
test("shuttle, board, deck movement and pier exit use persistent attachments", () => {
  const before = initialState();
  let s = transition(before, { type: "ferry-board" });
  assert.equal(s.mode, "foot");
  s = board();
  assert.deepEqual(s.ferry.passenger!.local, FERRY.gangway);
  assert.deepEqual(s.position, localToWorld(FERRY.gangway, s.ferry.pose));
  s = walk(s, -5, 0);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(s))), s);
  s = walk(s, -9, 0);
  s = transition(s, { type: "ferry-exit" });
  assert.equal(s.mode, "foot");
  assert.equal(s.ferry.passenger, null);
  assert.ok(atPier(s.ferry));
  s = transition(s, { type: "ferry-shuttle" });
  assert.ok(separation(s.position, { x: -8, z: 13 }) < 1e-10);
  assert.deepEqual(before, initialState());
});
test("deck bounds taper with hull, mast collisions and cabin doorway match geometry", () => {
  assert.ok(onDeck({ x: 0, z: -71 }));
  assert.ok(!onDeck({ x: 9, z: -71 }));
  assert.ok(!onDeck({ x: 9, z: 71 }));
  assert.ok(!onDeck({ x: 0, z: 74 }));
  assert.ok(deckBlocked({ x: 0, z: 18 }));
  assert.ok(!deckBlocked({ x: 0, z: 53 }));
  assert.ok(deckBlocked({ x: 4, z: 53 }));
  assert.ok(deckBlocked({ x: 6, z: 60 }));
  assert.ok(!deckBlocked({ x: 0, z: 60 }));
  let s = board();
  s = walk(s, 3, 0);
  s = walk(s, 3, 40);
  s = walk(s, 3, 52);
  s = walk(s, 0, 52);
  s = walk(s, 0, 61);
  assert.ok(s.ferry.passenger!.local.z > 60);
  assert.deepEqual(restore(s), s);
});
test("helm requires proximity, furled sails do not propel and passengers follow translation/yaw", () => {
  let s = board();
  s = transition(s, { type: "ferry-helm" });
  assert.equal(s.ferry.passenger!.station, "deck");
  s = helm();
  s = transition(s, { type: "ferry-step", dt: 0.1, throttle: 1, turn: 0 });
  assert.equal(s.ferry.speed, 0);
  s = transition(s, { type: "ferry-sails" });
  for (let n = 0; n < 40; n++)
    s = transition(s, { type: "ferry-step", dt: 0.1, throttle: 1, turn: 0 });
  assert.ok(s.ferry.speed > 5);
  const z = s.ferry.pose.z;
  for (let n = 0; n < 20; n++)
    s = transition(s, { type: "ferry-step", dt: 0.1, throttle: 0, turn: 1 });
  assert.ok(s.ferry.pose.z < z);
  assert.ok(s.ferry.pose.heading > 0);
  assert.ok(
    separation(s.position, localToWorld(FERRY.helm, s.ferry.pose)) < 1e-10,
  );
  s = transition(s, { type: "ferry-helm" });
  const pose = structuredClone(s.ferry.pose);
  s = transition(s, { type: "move", dx: 1, dz: 0, dt: 0.1 });
  const local = structuredClone(s.ferry.passenger!.local);
  s = transition(s, { type: "ferry-step", dt: 0.1, throttle: 1, turn: -1 });
  assert.deepEqual(s.ferry.passenger!.local, local);
  assert.equal(s.ferry.pose.heading, pose.heading);
  assert.ok(separation(s.ferry.pose, pose) > 0);
  assert.deepEqual(restore(s), s);
});
test("unsafe exits, moving boarding and control without helm fail safely", () => {
  let s = board();
  s.ferry.pose.z = 300;
  s.position = localToWorld(s.ferry.passenger!.local, s.ferry.pose);
  s = transition(s, { type: "ferry-exit" });
  assert.equal(s.mode, "ferry");
  s = transition(s, { type: "board" });
  assert.equal(s.mode, "ferry");
  s = transition(s, { type: "ferry-step", dt: 0.1, throttle: 1, turn: 1 });
  assert.equal(s.ferry.speed, 0);
  s = transition(s, { type: "ferry-sails" });
  assert.equal(s.ferry.sails, "furled");
  s.ship.x = 107.5;
  s.ship.z = 300;
  s = transition(s, { type: "ferry-exit" });
  assert.equal(s.mode, "ship");
  assert.equal(s.ferry.passenger, null);
  s = transition(s, { type: "ferry-board" });
  assert.equal(s.mode, "ferry");
  assert.deepEqual(restore(s), s);
  s = initialState();
  s.position = { x: 106, z: 180 };
  s.ferry.speed = 1;
  s = transition(s, { type: "ferry-board" });
  assert.equal(s.mode, "foot");
});
test("conservative hull cannot enter narrow river or leave world; dt is bounded", () => {
  assert.ok(clearWater(initialFerry().pose));
  assert.ok(!clearWater({ x: 0, z: 0, heading: 0 }));
  let s = initialState();
  s.ferry.pose = { x: 419, z: 300, heading: -Math.PI / 2 };
  s.ferry.speed = 12;
  s.ferry.sails = "set";
  const pose = structuredClone(s.ferry.pose);
  s = transition(s, { type: "ferry-step", dt: 100, throttle: 0, turn: 0 });
  assert.deepEqual(s.ferry.pose, pose);
  assert.equal(s.ferry.speed, 0);
  assert.deepEqual(
    transition(s, { type: "ferry-step", dt: NaN, throttle: 1, turn: 1 }),
    s,
  );
});
test("legacy migration retains cargo ledger; malformed ferry attachments are rejected", () => {
  for (const version of [1, 2, 3]) {
    const old: any = initialState();
    old.version = version;
    delete old.ferry;
    const s = restore(old);
    assert.equal(s.version, 4);
    assert.deepEqual(s.ferry, initialFerry());
  }
  let stored = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  stored.inventory.wood = 6;
  stored = transition(stored, {
    type: "cargo",
    envelope: {
      commandId: "migration-cargo",
      expectedRevision: 0,
      command: { type: "deposit", good: "wood", quantity: 6, dock: "haven" },
    },
  });
  const oldCargo: any = structuredClone(stored);
  oldCargo.version = 3;
  delete oldCargo.ferry;
  const migrated = restore(oldCargo);
  assert.deepEqual(migrated.logistics, stored.logistics);
  assert.equal(migrated.inventory.wood, 0);
  const s = board();
  const bad = structuredClone(s);
  bad.position.x += 1;
  assert.throws(() => restore(bad));
  const bad2 = structuredClone(s);
  bad2.ferry.passenger!.local = { x: 20, z: 0 };
  assert.throws(() => restore(bad2));
  const bad3 = structuredClone(s);
  bad3.ferry.speed = Infinity;
  assert.throws(() => restore(bad3));
});
test("skiff cargo can transfer to ferry gangway, keeping lot identity and capacity", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  s.inventory.wood = 6;
  let e = execute(
    s.logistics,
    {
      commandId: "deposit",
      expectedRevision: 0,
      command: { type: "deposit", good: "wood", quantity: 6, dock: "haven" },
    },
    cargoContext(s),
  );
  s.logistics = e.state;
  e = execute(
    s.logistics,
    {
      commandId: "load",
      expectedRevision: 1,
      command: { type: "transfer", lotId: "lot-1", quantity: 6, to: "ship" },
    },
    cargoContext(s),
  );
  s.logistics = e.state;
  s.ship.x = 107.5;
  s.ship.z = 180;
  s.position = { x: 107.5, z: 180 };
  s.mode = "ship";
  const r = execute(
    s.logistics,
    {
      commandId: "lighter",
      expectedRevision: 2,
      command: { type: "transfer", lotId: "lot-1", quantity: 6, to: "ferry" },
    },
    cargoContext(s),
  );
  assert.ok(r.event, r.error);
  assert.equal(usage(r.state, "ferry"), 6);
  assert.equal(usage(r.state, "ship"), 0);
  assert.equal(r.state.lots[0].id, "lot-1");
  s.logistics = r.state;
  assert.deepEqual(restore(s), s);
});
test("skiff reaches offshore gangway via open sea without teleporting through land", () => {
  let s = transition(initialState(), { type: "board" });
  const go = (x: number, z: number) => {
    for (
      let n = 0;
      n < 6000 && Math.hypot(s.position.x - x, s.position.z - z) > 0.25;
      n++
    )
      s = transition(s, {
        type: "move",
        dx: x - s.position.x,
        dz: z - s.position.z,
        dt: 0.1,
      });
    assert.ok(
      Math.hypot(s.position.x - x, s.position.z - z) < 0.26,
      `${x},${z}: ${JSON.stringify(s.position)}`,
    );
  };
  go(-3, 150);
  go(107.5, 150);
  go(107.5, 180);
  s = transition(s, { type: "ferry-board" });
  assert.equal(s.mode, "ferry");
  s = transition(s, { type: "ferry-exit" });
  assert.equal(s.mode, "foot");
  assert.deepEqual(s.position, { x: 106, z: 180 });
  assert.deepEqual(restore(s), s);
});
test("moving ferry refuses cargo handoff and stopped endpoint accepts it", () => {
  let s = initialState();
  s.ship.x = 107.5;
  s.ship.z = 180;
  s.position = { x: 107.5, z: 180 };
  s.ferry.speed = 1;
  const ctx = cargoContext(s);
  ctx.available.wood = 6;
  // A real cargo lot is deposited at Haven, loaded on the skiff, then brought offshore.
  let h = initialState();
  let r = execute(
    h.logistics,
    {
      commandId: "d",
      expectedRevision: 0,
      command: { type: "deposit", good: "wood", quantity: 6, dock: "haven" },
    },
    {
      ...cargoContext(h),
      available: { ...cargoContext(h).available, wood: 6 },
    },
  );
  r = execute(
    r.state,
    {
      commandId: "l",
      expectedRevision: 1,
      command: { type: "transfer", lotId: "lot-1", quantity: 6, to: "ship" },
    },
    cargoContext(h),
  );
  const env = {
    commandId: "handoff",
    expectedRevision: 2,
    command: { type: "transfer", lotId: "lot-1", quantity: 6, to: "ferry" },
  } as const;
  assert.match(execute(r.state, env, ctx).error!, /Stop/);
  s.ferry.speed = 0;
  assert.ok(execute(r.state, env, cargoContext(s)).event);
});
test('failed boarding explains why, and a helm press afterwards does not hide that reason', () => {
  let s = transition(initialState(), { type: 'choose-profession', profession: 'fisher' });
  s = transition(s, { type: 'ferry-board' });
  assert.match(s.message, /Walk to the Endurance gangway to board, \d+ m away/);
  s = transition(s, { type: 'ferry-helm' });
  assert.equal(s.mode, 'foot');
  assert.match(s.message, /not aboard Endurance yet/);
  assert.doesNotMatch(s.message, /Board the ferry first/);
});
test('boarding while the ferry is under way names the speed instead of a vague approach', () => {
  let s = transition(initialState(), { type: 'choose-profession', profession: 'fisher' });
  s.position = localToWorld(FERRY.boarding, s.ferry.pose);
  s.ferry.speed = 2;
  s = transition(s, { type: 'ferry-board' });
  assert.match(s.message, /under way at 2\.0 m\/s/);
});

test('boarding and helm blockers name the reason, and clear once the action is possible', () => {
  let s = transition(initialState(), { type: 'choose-profession', profession: 'fisher' });
  assert.match(boardBlocker(s)!, /Walk to the Endurance gangway/);
  assert.match(helmBlocker(s)!, /not aboard Endurance yet/);
  const dock = localToWorld(FERRY.boarding, s.ferry.pose);
  s = { ...s, position: { x: dock.x, z: dock.z } };
  assert.equal(boardBlocker(s), null);
  s = transition(s, { type: 'ferry-board' });
  assert.match(boardBlocker(s)!, /Already aboard/);
  assert.match(helmBlocker(s)!, /^Helm is \d+ m aft/);
  s = { ...s, ferry: { ...s.ferry, passenger: { local: { x: 0, z: 34 }, station: 'deck' as const } } };
  assert.equal(helmBlocker(s), null, 'within reach of the wheel the helm can be taken');
});
