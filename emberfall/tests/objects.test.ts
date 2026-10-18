import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  transition,
  restore,
  type State,
} from "../packages/game-core/index.ts";
import {
  CATALOG,
  PROFESSIONS,
  definition,
  itemCount,
} from "../packages/game-core/catalog.ts";
import {
  craftBlockers,
  inventoryProjection,
} from "../packages/game-core/projections.ts";
import {
  decide,
  project,
  economicSnapshot,
} from "../packages/protocol/economy.ts";
function go(s: State, x: number, z: number) {
  for (
    let i = 0;
    i < 2000 && Math.hypot(s.position.x - x, s.position.z - z) > 0.3;
    i++
  )
    s = transition(s, {
      type: "move",
      dx: x - s.position.x,
      dz: z - s.position.z,
      dt: 0.05,
    });
  assert.ok(Math.hypot(s.position.x - x, s.position.z - z) < 0.31);
  return s;
}
function collect(s: State, id: string, n: number) {
  for (let i = 0; i < n; i++) s = transition(s, { type: "collect", id });
  return s;
}
function gather(s: State, id: string, n: number) {
  for (let i = 0; i < n; i++) s = transition(s, { type: "gather", id });
  return s;
}
test("all starting professions grant one owned equipped starter; choice cannot duplicate tools", () => {
  for (const profession of Object.keys(
    PROFESSIONS,
  ) as (keyof typeof PROFESSIONS)[]) {
    let s = transition(initialState(), {
      type: "choose-profession",
      profession,
    });
    assert.equal(s.items.length, 1);
    assert.equal(s.items[0].definitionId, PROFESSIONS[profession].starter);
    assert.equal(s.equipment.hand, s.items[0].id);
    s = transition(s, { type: "choose-profession", profession });
    assert.equal(s.items.length, 1);
  }
});
test("every profession can pick up bolts; finite pile and distance enforced", () => {
  for (const profession of Object.keys(
    PROFESSIONS,
  ) as (keyof typeof PROFESSIONS)[]) {
    let s = transition(initialState(), {
      type: "choose-profession",
      profession,
    });
    s = collect(s, "yard-bolts", 20);
    assert.equal(itemCount(s.items, "bolt"), 8);
    assert.equal(s.salvage["yard-bolts"], 0);
    assert.equal(
      itemCount(
        transition(s, { type: "collect", id: "metal-offcuts" }).items,
        "iron",
      ),
      0,
    );
  }
});
test("failed crafting is atomic and unknown identifiers do not tick or crash", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "fisher",
  });
  const before = economicSnapshot(s);
  const next = transition(s, { type: "craft", recipe: "hammer" });
  assert.deepEqual(economicSnapshot(next), before);
  assert.match(next.message, /Need/);
  for (const id of ["__proto__", "constructor", "missing"]) {
    assert.doesNotThrow(() => transition(s, { type: "craft", recipe: id }));
    assert.doesNotThrow(() => transition(s, { type: "collect", id }));
    assert.doesNotThrow(() => transition(s, { type: "gather", id }));
  }
});
test("craft, place workbench, forge, operate, equip wardrobe and pack through public commands", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  s = collect(s, "yard-bolts", 6);
  s = go(s, -15, 11);
  s = collect(s, "canvas-bundle", 4);
  s = go(s, -15, 5);
  s = collect(s, "metal-offcuts", 7);
  s = go(s, -13, 7);
  s = gather(s, "quarry", 8);
  s = go(s, -9, 10);
  s = gather(s, "timber", 20);
  s = go(s, -18, 10);
  s = transition(s, { type: "craft", recipe: "workbench" });
  const bench = s.items.find((i) => i.definitionId === "workbench")!;
  s = transition(s, { type: "place", instanceId: bench.id, x: -20, z: 10 });
  assert.equal(s.placed.length, 1);
  const duplicate = transition(s, {
    type: "place",
    instanceId: bench.id,
    x: -20,
    z: 13,
  });
  assert.equal(duplicate.placed.length, 1);
  s = transition(s, { type: "craft", recipe: "forge" });
  const forge = s.items.find((i) => i.definitionId === "forge")!;
  s = transition(s, { type: "place", instanceId: forge.id, x: -18, z: 13 });
  assert.equal(s.placed.length, 2);
  const count = itemCount(s.items, "bolt");
  s = transition(s, { type: "craft", recipe: "bolts" });
  assert.equal(itemCount(s.items, "bolt"), count + 2);
  for (const recipe of [
    "work-clothes",
    "backpack",
    "axe",
    "pick",
    "crate",
    "shelter",
  ]) {
    s = transition(s, { type: "craft", recipe });
    assert.ok(
      s.items.some((i) => i.definitionId === recipe),
      `${recipe}: ${s.message}`,
    );
  }
  for (const id of ["work-clothes", "backpack", "axe"] as const) {
    const i = s.items.find((i) => i.definitionId === id)!;
    s = transition(s, { type: "equip", instanceId: i.id });
    assert.equal(s.equipment[definition(id).slot!], i.id);
  }
  s = transition(s, { type: "pack", instanceId: bench.id });
  assert.equal(s.placed.length, 1);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(s))), s);
});
test("placement respects water, overlap, reach, tool and movement collision", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  s.inventory.wood = 10;
  s.inventory.stone = 3;
  s.position = { x: -18, z: 10 };
  s = transition(s, { type: "craft", recipe: "workbench" });
  const id = s.items.at(-1)!.id;
  for (const [x, z] of [
    [0, 10],
    [-18, 24],
    [-23, -20],
    [-18, 10],
    [NaN, 11],
  ])
    assert.equal(
      transition(s, { type: "place", instanceId: id, x, z }).placed.length,
      0,
    );
  const noHammer = transition(s, { type: "unequip", slot: "hand" });
  assert.equal(
    transition(noHammer, { type: "place", instanceId: id, x: -20, z: 10 })
      .placed.length,
    0,
  );
  s = transition(s, { type: "place", instanceId: id, x: -20, z: 10 });
  assert.equal(s.placed.length, 1);
  const before = s.position;
  for (let i = 0; i < 100; i++)
    s = transition(s, { type: "move", dx: -1, dz: 0, dt: 0.05 });
  assert.ok(s.position.x > -18.7);
});
test("tool bonus consumes finite node stock and wears tool; components cannot be equipped", () => {
  let s = transition(initialState(), {
    type: "choose-profession",
    profession: "shipwright",
  });
  s.items.push({
    id: `item-${s.nextItemId++}`,
    definitionId: "axe",
    ownerId: "local-player",
    quantity: 1,
    condition: 1,
  });
  const axe = s.items.at(-1)!;
  s = transition(s, { type: "equip", instanceId: axe.id });
  const count = s.nodes.timber;
  s = transition(s, { type: "gather", id: "timber" });
  assert.equal(s.nodes.timber, count - 2);
  assert.equal(s.inventory.wood, 2);
  assert.equal(s.equipment.hand, undefined);
  s = collect(s, "yard-bolts", 1);
  s = transition(s, { type: "equip", instanceId: s.items.at(-1)!.id });
  assert.equal(s.equipment.hand, undefined);
});
test("legacy migration preserves voyage and balances; current saves reject invalid references", () => {
  const current = initialState();
  const { profession, items, equipment, placed, salvage, nextItemId, ...old } =
    current;
  old.version = 1 as any;
  old.inventory.wood = 7;
  old.ship.hull = 55;
  const migrated = restore(old);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.inventory.wood, 7);
  assert.equal(migrated.ship.hull, 55);
  assert.equal(migrated.profession, null);
  for (const bad of [
    { ...migrated, equipment: { hand: "missing" } },
    { ...migrated, items: [{ id: "item-1", definitionId: "nope" }] },
    { ...migrated, salvage: {} },
  ])
    assert.throws(() => restore(bad));
});
test("economic command contract checks revisions and events replay into projections", () => {
  const s = initialState();
  const before = economicSnapshot(s, 0);
  const result = decide(
    s,
    {
      commandId: "cmd-1",
      actorId: "local-player",
      expectedRevision: 0,
      command: { type: "choose-profession", profession: "shipwright" },
    },
    0,
  );
  assert.ok(result.event);
  assert.equal(result.event.type, "ProfessionChosen");
  assert.deepEqual(
    project(before, result.event),
    economicSnapshot(result.next, 1),
  );
  assert.throws(() => project(economicSnapshot(result.next, 1), result.event!));
  assert.equal(
    decide(
      result.next,
      {
        commandId: "cmd-2",
        actorId: "local-player",
        expectedRevision: 0,
        command: { type: "collect", id: "yard-bolts" },
      },
      1,
    ).event,
    undefined,
  );
  assert.deepEqual(
    inventoryProjection(result.next).find((i) => i.definitionId === "hammer")
      ?.carried,
    1,
  );
  assert.ok(craftBlockers(result.next, "axe").length > 0);
});
test("economic events replay component consumption and equipment changes in sequence", () => {
  let s = initialState();
  s.inventory.wood = 4;
  s.position = { x: -13, z: 8 };
  let revision = 0;
  let projection = economicSnapshot(s, revision);
  const commands: any[] = [
    { type: "choose-profession", profession: "fisher" },
    { type: "collect", id: "yard-bolts" },
    { type: "collect", id: "metal-offcuts" },
    { type: "craft", recipe: "hammer" },
  ];
  for (const command of commands) {
    const result = decide(
      s,
      {
        commandId: `command-${revision}`,
        actorId: "local-player",
        expectedRevision: revision,
        command,
      },
      revision,
    );
    assert.ok(result.event, result.next.message);
    projection = project(projection, result.event);
    revision++;
    s = result.next;
    assert.deepEqual(projection, economicSnapshot(s, revision));
  }
  assert.equal(itemCount(projection.items, "bolt"), 0);
  assert.equal(itemCount(projection.items, "iron"), 0);
  assert.equal(itemCount(projection.items, "hammer"), 1);
  const hammer = s.items.find((i) => i.definitionId === "hammer")!;
  const result = decide(
    s,
    {
      commandId: "equip-hammer",
      actorId: "local-player",
      expectedRevision: revision,
      command: { type: "equip", instanceId: hammer.id },
    },
    revision,
  );
  assert.ok(result.event);
  assert.equal(project(projection, result.event).equipment.hand, hammer.id);
});
