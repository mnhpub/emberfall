// Waterline as state. Only the architect can raise or lower it. Every change is recorded as a flood layer, so floods stack.
// Raising the level submerges land; lowering it exposes older ground. Pure functions: each returns a new state.

import { WATERLINE, breaksSurface, LODESTONE, type Lodestone } from "./compass.ts";

export type Role = "architect" | "player";
export type FloodRecord = { id: string; tick: number; from: number; to: number; by: string };
export type LevelState = { tick: number; waterline: number; floods: FloodRecord[] };

// Floor and top of the tank, metres above the tank floor.
export const MIN_WATERLINE = 0;
export const MAX_WATERLINE = 120;

export function initialLevel(waterline = WATERLINE): LevelState {
  return { tick: 0, waterline, floods: [] };
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
  return { tick, waterline: to, floods: [...s.floods, record] };
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
