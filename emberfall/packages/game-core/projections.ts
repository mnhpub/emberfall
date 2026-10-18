import {
  CATALOG,
  RECIPES,
  definition,
  itemCount,
  type ItemId,
} from "./catalog.ts";
import type { State } from "./index.ts";
/** Read-only views; never authority for resource debits or ownership changes. */
export function inventoryProjection(s: State) {
  const placed = new Set(s.placed.map((p) => p.instanceId));
  return Object.keys(CATALOG).map((id) => ({
    definitionId: id as ItemId,
    name: definition(id as ItemId).name,
    carried: itemCount(s.items, id as ItemId, placed),
    placed: s.items.filter((i) => i.definitionId === id && placed.has(i.id))
      .length,
  }));
}
export function craftBlockers(s: State, recipeId: string): string[] {
  if (!Object.hasOwn(RECIPES, recipeId)) return ["Unknown recipe."];
  const r = RECIPES[recipeId];
  const errors: string[] = [];
  if (!s.profession) errors.push("Choose a starting profession first.");
  if (s.mode !== "foot") errors.push("Craft ashore.");
  if (r.profession && s.profession !== r.profession)
    errors.push(`Requires ${r.profession} knowledge.`);
  if (
    r.station &&
    !s.placed.some(
      (p) =>
        s.items.find((i) => i.id === p.instanceId)?.definitionId ===
          r.station && Math.hypot(p.x - s.position.x, p.z - s.position.z) <= 5,
    )
  )
    errors.push(`Approach a placed ${definition(r.station).name}.`);
  if (s.items.length >= 200) errors.push("Instance limit reached.");
  for (const [k, n] of Object.entries(r.resources ?? {}))
    if (s.inventory[k as "wood" | "stone"] < n!) errors.push(`Need ${n} ${k}.`);
  const excluded = new Set(s.placed.map((p) => p.instanceId));
  for (const [k, n] of Object.entries(r.components ?? {}))
    if (itemCount(s.items, k as ItemId, excluded) < n!)
      errors.push(`Need ${n} ${definition(k as ItemId).name}.`);
  return errors;
}
export function recipeProjection(s: State) {
  return Object.entries(RECIPES).map(([id, r]) => ({
    id,
    ...r,
    blockers: craftBlockers(s, id),
  }));
}
