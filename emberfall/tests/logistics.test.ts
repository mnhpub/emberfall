import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialLogistics,
  execute,
  replay,
  usage,
  type Context,
  type Logistics,
  type CargoCommand,
  type Endpoint,
} from "../packages/logistics/index.ts";
import {
  initialState,
  transition,
  restore,
  type State,
} from "../packages/game-core/index.ts";
const context = (): Context => ({
  actor: { x: -7, z: 13 },
  ship: { x: -3, z: 13 },
  available: {
    wood: 100,
    stone: 100,
    food: 100,
    gold: 100,
    bolt: 100,
    cloth: 100,
    iron: 100,
  },
  crates: [{ id: "item-1", x: -10, z: 13, capacity: 12 }],
});
function apply(
  s: Logistics,
  ctx: Context,
  command: CargoCommand,
  id = `command-${s.revision}`,
) {
  const result = execute(
    s,
    { commandId: id, expectedRevision: s.revision, command },
    ctx,
  );
  assert.ok(result.event, result.error);
  return result.state;
}
test("deposit and partial transfer conserve cargo, identity and provenance", () => {
  let s = initialLogistics(),
    ctx = context();
  s = apply(s, ctx, {
    type: "deposit",
    good: "wood",
    quantity: 10,
    dock: "haven",
  });
  const root = s.lots[0].id;
  s = apply(s, ctx, { type: "transfer", lotId: root, quantity: 4, to: "ship" });
  assert.equal(usage(s, "ship"), 4);
  assert.equal(usage(s, "haven-store"), 6);
  assert.equal(
    s.lots.reduce((n, l) => n + l.quantity, 0),
    10,
  );
  assert.ok(s.lots.every((l) => l.rootId === root && l.origin === "haven"));
  assert.deepEqual(replay(s.events), s);
});
test("same command retry returns receipt before stale revision check; changed payload conflicts", () => {
  const ctx = context();
  let s = initialLogistics();
  const envelope = {
    commandId: "stable-id",
    expectedRevision: 0,
    command: { type: "deposit", good: "wood", quantity: 4, dock: "haven" },
  } as const;
  s = execute(s, envelope, ctx).state;
  const duplicate = execute(s, envelope, ctx);
  assert.ok(duplicate.duplicate);
  assert.deepEqual(duplicate.state, s);
  assert.equal(duplicate.state.revision, 1);
  assert.match(
    execute(
      s,
      { ...envelope, command: { ...envelope.command, quantity: 5 } },
      ctx,
    ).error!,
    /reused/,
  );
  assert.match(
    execute(s, { ...envelope, commandId: "another" }, ctx).error!,
    /revision/,
  );
});
test("invalid quantity, unavailable stock, range, capacity and self-transfer are atomic rejections", () => {
  let s = initialLogistics(),
    ctx = context();
  for (const quantity of [0, -1, 1.5, NaN, 129])
    assert.equal(
      execute(
        s,
        {
          commandId: "bad",
          expectedRevision: 0,
          command: { type: "deposit", good: "wood", quantity, dock: "haven" },
        },
        ctx,
      ).state,
      s,
    );
  ctx.available.wood = 0;
  assert.ok(
    execute(
      s,
      {
        commandId: "bad",
        expectedRevision: 0,
        command: { type: "deposit", good: "wood", quantity: 1, dock: "haven" },
      },
      ctx,
    ).error,
  );
  ctx.available.wood = 100;
  s = apply(s, ctx, {
    type: "deposit",
    good: "wood",
    quantity: 30,
    dock: "haven",
  });
  const id = s.lots[0].id;
  for (const [quantity, to] of [
    [25, "ship"],
    [13, "crate:item-1"],
    [1, "haven-store"],
    [1, "aurum-store"],
    [1, "crate:missing"],
  ] as [number, Endpoint][]) {
    const result = execute(
      s,
      {
        commandId: "invalid",
        expectedRevision: s.revision,
        command: { type: "transfer", lotId: id, quantity, to },
      },
      ctx,
    );
    assert.ok(result.error);
    assert.equal(result.state, s);
  }
  ctx.actor = { x: 20, z: -20 };
  assert.ok(
    execute(
      s,
      {
        commandId: "far",
        expectedRevision: s.revision,
        command: { type: "transfer", lotId: id, quantity: 1, to: "ship" },
      },
      ctx,
    ).error,
  );
});
test("reservations cannot exceed demand; delivery consumes cargo and credits once", () => {
  let s = initialLogistics(),
    ctx = context();
  s = apply(s, ctx, {
    type: "deposit",
    good: "wood",
    quantity: 10,
    dock: "haven",
  });
  s = apply(s, ctx, {
    type: "consign",
    lotId: s.lots[0].id,
    quantity: 6,
    orderId: "aurum-timber",
  });
  const assigned = s.lots.find((l) => l.orderId)!;
  const remaining = s.lots.find((l) => !l.orderId)!;
  assert.ok(
    execute(
      s,
      {
        commandId: "overbook",
        expectedRevision: s.revision,
        command: {
          type: "consign",
          lotId: remaining.id,
          quantity: 1,
          orderId: "aurum-timber",
        },
      },
      ctx,
    ).error,
  );
  assert.ok(
    execute(
      s,
      {
        commandId: "early",
        expectedRevision: s.revision,
        command: { type: "fulfill", lotId: assigned.id, quantity: 6 },
      },
      ctx,
    ).error,
  );
  s = apply(s, ctx, {
    type: "transfer",
    lotId: assigned.id,
    quantity: 6,
    to: "ship",
  });
  ctx.ship = { x: 3, z: -19 };
  ctx.actor = { x: 3, z: -19 };
  s = apply(s, ctx, {
    type: "transfer",
    lotId: assigned.id,
    quantity: 6,
    to: "aurum-store",
  });
  const envelope = {
    commandId: "complete",
    expectedRevision: s.revision,
    command: { type: "fulfill", lotId: assigned.id, quantity: 6 },
  } as const;
  const result = execute(s, envelope, ctx);
  assert.ok(result.event);
  s = result.state;
  assert.equal(s.reputation, 60);
  assert.equal(s.orders[0].fulfilled, 6);
  assert.equal(usage(s, "aurum-store"), 0);
  assert.equal(
    s.lots.reduce((n, l) => n + l.quantity, 0),
    4,
  );
  assert.ok(execute(s, envelope, ctx).duplicate);
  assert.equal(
    execute(
      s,
      { ...envelope, commandId: "again", expectedRevision: s.revision },
      ctx,
    ).event,
    undefined,
  );
  assert.deepEqual(replay(s.events), s);
});
test("local state applies inventory debit and colony credit once, preserving old saves", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  s.inventory.wood = 8;
  const send = (command: CargoCommand, id?: string) => {
    s = transition(s, {
      type: "cargo",
      envelope: {
        commandId: id ?? `cmd-${s.logistics.revision}`,
        expectedRevision: s.logistics.revision,
        command,
      },
    });
  };
  send(
    { type: "deposit", good: "wood", quantity: 6, dock: "haven" },
    "deposit",
  );
  assert.equal(s.inventory.wood, 2);
  send(
    { type: "deposit", good: "wood", quantity: 6, dock: "haven" },
    "deposit",
  );
  assert.equal(s.inventory.wood, 2);
  send({
    type: "consign",
    lotId: "lot-1",
    quantity: 6,
    orderId: "aurum-timber",
  });
  send({ type: "transfer", lotId: "lot-1", quantity: 6, to: "ship" });
  s.position = { x: 3, z: -19 };
  s.ship.x = 3;
  s.ship.z = -19;
  send({ type: "transfer", lotId: "lot-1", quantity: 6, to: "aurum-store" });
  send({ type: "fulfill", lotId: "lot-1", quantity: 6 }, "fulfill");
  assert.equal(s.colonies[1].stock.wood, 6);
  send({ type: "fulfill", lotId: "lot-1", quantity: 6 }, "fulfill");
  assert.equal(s.colonies[1].stock.wood, 6);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(s))), s);
  for (const version of [1, 2]) {
    const old: any = structuredClone(s);
    old.version = version;
    delete old.logistics;
    const migrated = restore(old);
    assert.equal(migrated.inventory.wood, 2);
    assert.equal(migrated.logistics.lots.length, 0);
    assert.equal(migrated.version, 4);
  }
  const reordered = structuredClone(s);
  reordered.logistics = Object.fromEntries(
    Object.entries(s.logistics).reverse(),
  ) as Logistics;
  assert.deepEqual(restore(reordered).logistics, s.logistics);
  const broken = structuredClone(s);
  broken.logistics.reputation++;
  assert.throws(() => restore(broken));
});
test("occupied crates cannot be packed; packing an empty crate succeeds", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  s.position = { x: -11, z: 13 };
  s.inventory.wood = 4;
  s.items.push({
    id: `item-${s.nextItemId++}`,
    definitionId: "crate",
    ownerId: "local-player",
    quantity: 1,
    condition: 100,
  });
  const id = s.items.at(-1)!.id;
  s.placed.push({ instanceId: id, x: -10, z: 11 });
  const send = (command: CargoCommand) => {
    s = transition(s, {
      type: "cargo",
      envelope: {
        commandId: `cmd-${s.logistics.revision}`,
        expectedRevision: s.logistics.revision,
        command,
      },
    });
  };
  send({ type: "deposit", good: "wood", quantity: 4, dock: "haven" });
  send({ type: "transfer", lotId: "lot-1", quantity: 4, to: `crate:${id}` });
  assert.equal(usage(s.logistics, `crate:${id}`), 4);
  s = transition(s, { type: "pack", instanceId: id });
  assert.equal(s.placed.length, 1);
  send({ type: "transfer", lotId: "lot-1", quantity: 4, to: "haven-store" });
  s = transition(s, { type: "pack", instanceId: id });
  assert.equal(s.placed.length, 0);
});
test("full voyage through public commands fulfills demand, no position edits", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  const go = (x: number, z: number) => {
    for (
      let n = 0;
      n < 2000 && Math.hypot(s.position.x - x, s.position.z - z) > 0.3;
      n++
    )
      s = transition(s, {
        type: "move",
        dx: x - s.position.x,
        dz: z - s.position.z,
        dt: 0.05,
      });
    assert.ok(Math.hypot(s.position.x - x, s.position.z - z) < 0.31);
  };
  const send = (command: CargoCommand) => {
    const before = s.logistics.revision;
    s = transition(s, {
      type: "cargo",
      envelope: {
        commandId: `voyage-${before}`,
        expectedRevision: before,
        command,
      },
    });
    assert.equal(s.logistics.revision, before + 1, s.message);
  };
  for (let n = 0; n < 6; n++)
    s = transition(s, { type: "gather", id: "timber" });
  send({ type: "deposit", good: "wood", quantity: 6, dock: "haven" });
  send({
    type: "consign",
    lotId: "lot-1",
    quantity: 6,
    orderId: "aurum-timber",
  });
  send({ type: "transfer", lotId: "lot-1", quantity: 6, to: "ship" });
  s = transition(s, { type: "board" });
  go(-3, -19);
  go(3, -19);
  send({ type: "transfer", lotId: "lot-1", quantity: 6, to: "aurum-store" });
  send({ type: "fulfill", lotId: "lot-1", quantity: 6 });
  send({ type: "deposit", good: "food", quantity: 4, dock: "aurum" });
  const food = s.logistics.lots[0];
  send({
    type: "consign",
    lotId: food.id,
    quantity: 4,
    orderId: "haven-provisions",
  });
  send({ type: "transfer", lotId: food.id, quantity: 4, to: "ship" });
  go(-3, -19);
  go(-3, 13);
  send({ type: "transfer", lotId: food.id, quantity: 4, to: "haven-store" });
  send({ type: "fulfill", lotId: food.id, quantity: 4 });
  assert.equal(s.logistics.reputation, 100);
  assert.equal(s.colonies[0].stock.food, 4);
  assert.deepEqual(restore(s), s);
});
test("randomized bounded partial handoffs preserve quantities and replay", () => {
  let s = initialLogistics(),
    ctx = context();
  s = apply(s, ctx, {
    type: "deposit",
    good: "wood",
    quantity: 20,
    dock: "haven",
  });
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed;
  };
  const endpoints: Endpoint[] = ["ship", "haven-store", "crate:item-1"];
  for (let n = 0; n < 200; n++) {
    const lot = s.lots[rand() % s.lots.length];
    const result = execute(
      s,
      {
        commandId: `random-${n}`,
        expectedRevision: s.revision,
        command: {
          type: "transfer",
          lotId: lot.id,
          quantity: 1 + (rand() % (lot.quantity + 2)),
          to: endpoints[rand() % 3],
        },
      },
      ctx,
    );
    s = result.state;
    assert.equal(
      s.lots.reduce((n, l) => n + l.quantity, 0),
      20,
    );
    assert.ok(s.lots.every((l) => l.quantity > 0));
  }
  assert.deepEqual(replay(s.events), s);
});
test("bounded ledger fails closed without evicting idempotency receipts", () => {
  let s = initialLogistics(),
    ctx = context();
  s = apply(
    s,
    ctx,
    { type: "deposit", good: "wood", quantity: 1, dock: "haven" },
    "first",
  );
  for (let n = 1; n < 512; n++)
    s = apply(
      s,
      ctx,
      {
        type: "transfer",
        lotId: "lot-1",
        quantity: 1,
        to: n % 2 ? "ship" : "haven-store",
      },
      `loop-${n}`,
    );
  const result = execute(
    s,
    {
      commandId: "overflow",
      expectedRevision: s.revision,
      command: {
        type: "transfer",
        lotId: "lot-1",
        quantity: 1,
        to: "haven-store",
      },
    },
    ctx,
  );
  assert.match(result.error!, /ledger full/);
  assert.equal(result.state, s);
  assert.ok(
    execute(
      s,
      {
        commandId: "first",
        expectedRevision: 0,
        command: { type: "deposit", good: "wood", quantity: 1, dock: "haven" },
      },
      ctx,
    ).duplicate,
  );
});
test("reclaim returns unassigned supplies once and reserved supplies cannot bypass demand", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "transport",
  });
  s.inventory.wood = 8;
  const send = (command: CargoCommand, id?: string) => {
    s = transition(s, {
      type: "cargo",
      envelope: {
        commandId: id ?? `reclaim-${s.logistics.revision}`,
        expectedRevision: s.logistics.revision,
        command,
      },
    });
  };
  send({ type: "deposit", good: "wood", quantity: 8, dock: "haven" });
  send({ type: "withdraw", lotId: "lot-1", quantity: 2 }, "withdraw");
  assert.equal(s.inventory.wood, 2);
  assert.equal(s.logistics.lots[0].quantity, 6);
  send({ type: "withdraw", lotId: "lot-1", quantity: 2 }, "withdraw");
  assert.equal(s.inventory.wood, 2);
  send({
    type: "consign",
    lotId: "lot-1",
    quantity: 6,
    orderId: "aurum-timber",
  });
  const revision = s.logistics.revision;
  send({ type: "withdraw", lotId: "lot-1", quantity: 1 });
  assert.equal(s.logistics.revision, revision);
  assert.equal(s.inventory.wood, 2);
  assert.deepEqual(restore(s), s);
});
test("component storage and reclaim conserve quantities and do not repair condition", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  for (let n = 0; n < 4; n++)
    s = transition(s, { type: "collect", id: "yard-bolts" });
  s.items
    .filter((i) => i.definitionId === "bolt")
    .forEach((i) => (i.condition = 65));
  const send = (command: CargoCommand) => {
    const revision = s.logistics.revision;
    s = transition(s, {
      type: "cargo",
      envelope: {
        commandId: `components-${revision}`,
        expectedRevision: revision,
        command,
      },
    });
    assert.equal(s.logistics.revision, revision + 1, s.message);
  };
  send({ type: "deposit", good: "bolt", quantity: 3, dock: "haven" });
  assert.equal(s.logistics.lots[0].condition, 65);
  send({ type: "withdraw", lotId: "lot-1", quantity: 2 });
  assert.equal(
    s.items
      .filter((i) => i.definitionId === "bolt")
      .reduce((n, i) => n + i.quantity, 0),
    3,
  );
  assert.equal(s.logistics.lots[0].quantity, 1);
  assert.ok(
    s.items
      .filter((i) => i.definitionId === "bolt")
      .every((i) => i.condition === 65),
  );
  assert.deepEqual(restore(s), s);
});
