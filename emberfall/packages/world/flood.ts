// Waterline as state. Only the architect can raise or lower it. Every change is recorded as a flood layer, so floods stack.
// Raising the level submerges land; lowering it exposes older ground. Pure functions: each returns a new state.

import { WATERLINE, breaksSurface, LODESTONE, type Lodestone } from "./compass.ts";

export type Role = "architect" | "player";
export type FloodRecord = { id: string; tick: number; from: number; to: number; by: string };
// Ground and structures that a rising flood drowned. They stay as wreckage for diving until they are salvaged.
export type Wreck = { id: string; floodId: string; bottom: number; top: number; salvaged: boolean; lost?: string[] };
export type LevelState = { tick: number; waterline: number; floods: FloodRecord[]; wrecks: Wreck[] };

// Floor and top of the tank, metres above the tank floor.
export const MIN_WATERLINE = 0;
export const MAX_WATERLINE = 120;

export function initialLevel(waterline = WATERLINE): LevelState {
  return { tick: 0, waterline, floods: [], wrecks: [] };
}

// Architect command: move the waterline to `to` at time `tick`. Returns the same state when nothing changes.
export function setWaterline(
  s: LevelState,
  to: number,
  actor: string,
  role: Role,
  tick: number,
): LevelState {
  if (role !== "architect") throw new Error("only the architect can change the waterline");
  if (!Number.isFinite(to) || to < MIN_WATERLINE || to > MAX_WATERLINE)
    throw new Error(`waterline must be between ${MIN_WATERLINE} and ${MAX_WATERLINE} m`);
  if (!Number.isInteger(tick) || tick < s.tick) throw new Error("time does not run backwards");
  if (to === s.waterline) return { ...s, tick };
  const record: FloodRecord = {
    id: `flood-${s.floods.length + 1}`,
    tick,
    from: s.waterline,
    to,
    by: actor,
  };
  // A rising flood drowns the band between the old and new levels. That band becomes wreckage.
  const wrecks =
    to > s.waterline
      ? [...s.wrecks, { id: `wreck-${record.id}`, floodId: record.id, bottom: s.waterline, top: to, salvaged: false }]
      : s.wrecks;
  return { tick, waterline: to, floods: [...s.floods, record], wrecks };
}

// Wreckage can be dived only while water still covers some of it: the waterline must be above the wreck's bottom.
export const diveable = (w: Wreck, s: LevelState) => !w.salvaged && s.waterline > w.bottom;

// Dive and salvage one wreck. A wreck is taken once; the record stays so the history is never rewritten.
export function salvageWreck(s: LevelState, wreckId: string, actor: string): LevelState {
  const wreck = s.wrecks.find((w) => w.id === wreckId);
  if (!wreck) throw new Error(`unknown wreck ${wreckId}`);
  if (wreck.salvaged) throw new Error("this wreck has already been salvaged");
  if (!diveable(wreck, s)) throw new Error("this wreck is above the water and cannot be dived");
  return { ...s, wrecks: s.wrecks.map((w) => (w.id === wreckId ? { ...w, salvaged: true } : w)) };
}

// Land is any ground that stands above the waterline.
export const isLandAt = (height: number, s: LevelState) => height > s.waterline;

// Whether the lodestone's top is above the water at this level.
export const pillarAboveWater = (s: LevelState, rock: Lodestone = LODESTONE) =>
  breaksSurface({ ...rock }, s.waterline);

// Which way the most recent change went, or null before any flood.
export function lastDirection(s: LevelState): "rising" | "receding" | null {
  const last = s.floods.at(-1);
  if (!last) return null;
  return last.to > last.from ? "rising" : "receding";
}

// Objects in the world. Only ships survive a flood: anything else whose ground the water covers is lost.
export type ObjectKind = "ship" | "craft" | "village" | "colony" | "structure";
export type WorldObject = { id: string; kind: ObjectKind; elevation: number };

export const survivesFlood = (kind: ObjectKind) => kind === "ship";

// Architect flood that also drowns objects. Non-ship objects below the new level are removed and listed on the wreck
// record; ships stay and float at the new waterline. Lowering the level restores nothing.
export function floodWorld(
  s: LevelState,
  objects: WorldObject[],
  to: number,
  actor: string,
  role: Role,
  tick: number,
): { level: LevelState; objects: WorldObject[]; lost: WorldObject[] } {
  const level = setWaterline(s, to, actor, role, tick);
  const lost: WorldObject[] = [];
  const kept: WorldObject[] = [];
  for (const o of objects) {
    if (survivesFlood(o.kind)) kept.push({ ...o, elevation: Math.max(o.elevation, to) });
    else if (to > s.waterline && o.elevation < to) lost.push(o);
    else kept.push(o);
  }
  if (lost.length && level.wrecks.length) {
    const wreck = level.wrecks[level.wrecks.length - 1];
    level.wrecks[level.wrecks.length - 1] = { ...wreck, lost: lost.map((o) => o.id) };
  }
  return { level, objects: kept, lost };
}
