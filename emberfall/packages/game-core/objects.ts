import { crateOccupied } from './logistics.ts';
import { craftBlockers } from "./projections.ts";
import {
  CATALOG,
  PROFESSIONS,
  RECIPES,
  SALVAGE,
  definition,
  itemCount,
  type ItemId,
  type ItemInstance,
  type PlacedObject,
  type Profession,
  type Slot,
} from "./catalog.ts";
import type { State } from "./index.ts";
export type ObjectState = {
  profession: Profession | null;
  items: ItemInstance[];
  equipment: Partial<Record<Slot, string>>;
  placed: PlacedObject[];
  salvage: Record<string, number>;
  nextItemId: number;
};
export type ObjectCommand =
  | { type: "choose-profession"; profession: Profession }
  | { type: "collect"; id: string }
  | { type: "craft"; recipe: string }
  | { type: "equip"; instanceId: string }
  | { type: "unequip"; slot: Slot }
  | { type: "place"; instanceId: string; x: number; z: number }
  | { type: "pack"; instanceId: string };
export function initialObjects(): ObjectState {
  return {
    profession: null,
    items: [],
    equipment: {},
    placed: [],
    salvage: Object.fromEntries(
      Object.entries(SALVAGE).map(([id, n]) => [id, n.quantity]),
    ),
    nextItemId: 1,
  };
}
const placedIds = (s: State) => new Set(s.placed.map((p) => p.instanceId));
function grant(s: State, id: ItemId, quantity: number) {
  s.items.push({
    id: `item-${s.nextItemId++}`,
    definitionId: id,
    ownerId: "local-player",
    quantity,
    condition: 100,
  });
}
function consume(s: State, id: ItemId, quantity: number) {
  const placed = placedIds(s);
  for (const item of s.items) {
    if (item.definitionId !== id || placed.has(item.id)) continue;
    const used = Math.min(item.quantity, quantity);
    item.quantity -= used;
    quantity -= used;
    if (!quantity) break;
  }
  s.items = s.items.filter((i) => i.quantity > 0);
}
export function equipped(s: State, slot: Slot) {
  return s.items.find((i) => i.id === s.equipment[slot]);
}
export function collides(s: State, x: number, z: number, padding = 0.35) {
  return s.placed.some((p) => {
    const i = s.items.find((i) => i.id === p.instanceId)!;
    const f = definition(i.definitionId).footprint!;
    return (
      Math.abs(x - p.x) < f[0] / 2 + padding &&
      Math.abs(z - p.z) < f[1] / 2 + padding
    );
  });
}
function validPlacement(s: State, id: ItemId, x: number, z: number): boolean {
  const f = definition(id).footprint;
  if (!f || ![x, z].every(Number.isFinite)) return false;
  const [w, d] = f;
  if (
    Math.abs(x) + w / 2 > 24 ||
    z - d / 2 < -30 ||
    z + d / 2 > 17 ||
    Math.abs(x) - w / 2 <= 4
  )
    return false;
  if (
    Math.abs(s.position.x - x) < w / 2 + 0.5 &&
    Math.abs(s.position.z - z) < d / 2 + 0.5
  )
    return false;
  if (
    s.placed.some((p) => {
      const i = s.items.find((i) => i.id === p.instanceId)!;
      const other = definition(i.definitionId).footprint!;
      return (
        Math.abs(p.x - x) < (other[0] + w) / 2 + 0.3 &&
        Math.abs(p.z - z) < (other[1] + d) / 2 + 0.3
      );
    })
  )
    return false;
  // Reserve colony buildings/pyramids and the dock. Placement cannot intersect them.
  const occupied = [
    ...s.colonies.flatMap((c) => [
      { x: c.x, z: c.z - 4, w: 5, d: 5 },
      { x: c.x, z: c.z + 2, w: 9, d: 3 },
    ]),
    { x: -5, z: 13, w: 6, d: 2 },
  ];
  return !occupied.some(
    (p) =>
      Math.abs(p.x - x) < (p.w + w) / 2 + 0.3 &&
      Math.abs(p.z - z) < (p.d + d) / 2 + 0.3,
  );
}
export function objectTransition(s: State, c: ObjectCommand): State {
  const say = (m: string) => {
    s.message = m;
    return s;
  };
  if (c.type === "choose-profession") {
    if (s.profession)
      return say(
        "Starting profession already selected. Cross-training comes later.",
      );
    if (!Object.hasOwn(PROFESSIONS, c.profession))
      return say("Unknown profession.");
    s.profession = c.profession;
    const starter = PROFESSIONS[c.profession].starter;
    grant(s, starter, 1);
    s.equipment.hand = s.items.at(-1)!.id;
    return say(
      `${PROFESSIONS[c.profession].name}: starter tool equipped. Explore the yard for supplies.`,
    );
  }
  if (c.type === "collect") {
    const n = Object.hasOwn(SALVAGE, c.id) ? SALVAGE[c.id] : undefined;
    if (
      !n ||
      s.mode !== "foot" ||
      Math.hypot(s.position.x - n.x, s.position.z - n.z) > 4
    )
      return say("Approach the salvage pile ashore.");
    if (!s.salvage[c.id]) return say("Salvage pile depleted.");
    if (s.items.length >= 200) return say("Instance limit reached.");
    s.salvage[c.id]--;
    grant(s, n.item, 1);
    const relevant =
      s.profession && definition(n.item).relevant?.includes(s.profession);
    return say(
      `Collected ${definition(n.item).name}.${relevant ? " Your trade recognizes its purpose." : ""}`,
    );
  }
  if (c.type === "craft") {
    const blockers = craftBlockers(s, c.recipe);
    if (blockers.length) return say(blockers[0]);
    const r = RECIPES[c.recipe];
    for (const [k, n] of Object.entries(r.resources ?? {}))
      s.inventory[k as "wood" | "stone"] -= n!;
    for (const [k, n] of Object.entries(r.components ?? {}))
      consume(s, k as ItemId, n!);
    grant(s, r.output, r.quantity);
    return say(`${r.quantity} ${r.name} crafted.`);
  }
  if (c.type === "unequip") {
    if (!["hand", "body", "back"].includes(c.slot))
      return say("Unknown equipment slot.");
    delete s.equipment[c.slot];
    return say("Equipment removed.");
  }
  const item = s.items.find((i) => i.id === c.instanceId);
  if (!item) return say("Item not found.");
  if (c.type === "equip") {
    const slot = definition(item.definitionId).slot;
    if (!slot || item.condition <= 0 || placedIds(s).has(item.id))
      return say("This item cannot be equipped.");
    s.equipment[slot] = item.id;
    return say(`${definition(item.definitionId).name} equipped.`);
  }
  if (c.type === "place") {
    if (s.placed.length >= 100) return say("Placed object limit reached.");
    if (!s.profession || s.mode !== "foot")
      return say("Choose a profession and place objects ashore.");
    if (!definition(item.definitionId).footprint || placedIds(s).has(item.id))
      return say("Object is not available for placement.");
    if (
      Math.hypot(c.x - s.position.x, c.z - s.position.z) > 6 ||
      !validPlacement(s, item.definitionId, c.x, c.z)
    )
      return say(
        "Place within six metres on clear land, away from buildings, dock and other objects.",
      );
    if (
      equipped(s, "hand")?.definitionId !== "hammer" ||
      equipped(s, "hand")!.condition <= 0
    )
      return say("Equip a sound hammer to place objects.");
    s.placed.push({ instanceId: item.id, x: c.x, z: c.z });
    return say(`${definition(item.definitionId).name} placed.`);
  }
  if (c.type === "pack") {
    if(crateOccupied(s,item.id))return say("Empty this crate before packing it.");
    const p = s.placed.find((p) => p.instanceId === item.id);
    if (
      !p ||
      s.mode !== "foot" ||
      Math.hypot(p.x - s.position.x, p.z - s.position.z) > 5
    )
      return say("Approach the placed object to pack it.");
    s.placed = s.placed.filter((p) => p.instanceId !== item.id);
    return say("Packed into inventory.");
  }
  return say("Unknown object command.");
}
export function validateObjects(v: ObjectState): void {
  const int = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
  if (
    !v ||
    !(v.profession === null || Object.hasOwn(PROFESSIONS, v.profession)) ||
    !Array.isArray(v.items) ||
    v.items.length > 200 ||
    !Array.isArray(v.placed) ||
    v.placed.length > 100 ||
    !v.equipment ||
    !v.salvage ||
    !int(v.nextItemId, 1, 1e9)
  )
    throw new Error("Invalid object state");
  const ids = new Set<string>();
  for (const i of v.items) {
    if (
      !i ||
      typeof i.id !== "string" ||
      !/^item-[1-9][0-9]*$/.test(i.id) ||
      Number(i.id.slice(5)) >= v.nextItemId ||
      ids.has(i.id) ||
      !Object.hasOwn(CATALOG, i.definitionId) ||
      i.ownerId !== "local-player" ||
      !int(i.quantity, 1, 1000) ||
      !int(i.condition, 0, 100)
    )
      throw new Error("Invalid item");
    ids.add(i.id);
    if (definition(i.definitionId).family !== "component" && i.quantity !== 1)
      throw new Error("Nonstackable instance");
  }
  const placed = new Set<string>();
  for (const p of v.placed) {
    const i = v.items.find((i) => i.id === p?.instanceId);
    if (
      !i ||
      !definition(i.definitionId).footprint ||
      placed.has(i.id) ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.z) ||
      Math.abs(p.x) > 24 ||
      p.z < -30 ||
      p.z > 17
    )
      throw new Error("Invalid placed object");
    placed.add(i.id);
  }
  for (const [slot, id] of Object.entries(v.equipment)) {
    const i = v.items.find((i) => i.id === id);
    if (
      !i ||
      definition(i.definitionId).slot !== slot ||
      placed.has(i.id) ||
      i.condition <= 0
    )
      throw new Error("Invalid equipment");
  }
  for (const [id, n] of Object.entries(SALVAGE))
    if (!int(v.salvage[id], 0, n.quantity)) throw new Error("Invalid salvage");
}
