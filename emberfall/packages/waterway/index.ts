// River network: a directed graph of settlements and junctions joined by reaches.
// Topology is immutable reference data. Reach status and current are the only state, and they change through pure functions.
// Water flows along each reach in the direction of its sign: positive current runs from `from` to `to`.

export type NodeKind = "settlement" | "junction";
export type WaterNode = { id: string; kind: NodeKind; name: string };
export type Reach = { id: string; from: string; to: string; length: number; current: number };
export type Waterway = { nodes: WaterNode[]; reaches: Reach[] };

export type ReachState = { open: boolean; closedUntilTick: number | null; current: number };
export type WaterwayState = { tick: number; reaches: Record<string, ReachState> };

// Boat speed through still water, m/s. A reach whose current opposes the boat by more than this cannot be climbed.
export const BOAT_SPEED = 4;
const MIN_SPEED = 0.5;

export function initialWaterwayState(w: Waterway): WaterwayState {
  return {
    tick: 0,
    reaches: Object.fromEntries(
      w.reaches.map((r) => [r.id, { open: true, closedUntilTick: null, current: r.current }]),
    ),
  };
}

// Returns every problem found. An empty list means the topology is sound.
export function validateWaterway(w: Waterway): string[] {
  const problems: string[] = [];
  const nodes = new Set<string>();
  for (const n of w.nodes) {
    if (nodes.has(n.id)) problems.push(`duplicate node ${n.id}`);
    nodes.add(n.id);
  }
  const reaches = new Set<string>();
  const pairs = new Set<string>();
  for (const r of w.reaches) {
    if (reaches.has(r.id)) problems.push(`duplicate reach ${r.id}`);
    reaches.add(r.id);
    if (!nodes.has(r.from) || !nodes.has(r.to)) problems.push(`reach ${r.id} ends at an unknown node`);
    if (r.from === r.to) problems.push(`reach ${r.id} loops back on itself`);
    if (!(Number.isFinite(r.length) && r.length > 0)) problems.push(`reach ${r.id} has a non-positive length`);
    if (!Number.isFinite(r.current)) problems.push(`reach ${r.id} has a non-finite current`);
    const pair = [r.from, r.to].sort().join("|");
    if (pairs.has(pair)) problems.push(`two reaches join ${pair}`);
    pairs.add(pair);
  }
  // Water runs downhill, so the flow graph must have no cycle.
  const flows = new Map<string, string[]>();
  for (const r of w.reaches) {
    const [a, b] = r.current >= 0 ? [r.from, r.to] : [r.to, r.from];
    flows.set(a, [...(flows.get(a) ?? []), b]);
  }
  const state = new Map<string, number>(); // 1 = on the current path, 2 = done
  const visit = (n: string): boolean => {
    if (state.get(n) === 1) return true;
    if (state.get(n) === 2) return false;
    state.set(n, 1);
    for (const next of flows.get(n) ?? []) if (visit(next)) return true;
    state.set(n, 2);
    return false;
  };
  if ([...nodes].some((n) => visit(n))) problems.push("the flow of water forms a cycle");
  return problems;
}

function reachBetween(w: Waterway, a: string, b: string): Reach | undefined {
  return w.reaches.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));
}

// Seconds to travel one reach from `a` to `b`, or null when it is closed or cannot be climbed against its current.
export function travelSeconds(w: Waterway, s: WaterwayState, a: string, b: string): number | null {
  const r = reachBetween(w, a, b);
  if (!r) return null;
  const status = s.reaches[r.id];
  if (!status || !status.open) return null;
  const along = r.from === a ? status.current : -status.current; // water speed in the direction of travel
  const speed = BOAT_SPEED + along;
  if (speed < MIN_SPEED) return null;
  return r.length / speed;
}

export type Route = { nodes: string[]; seconds: number };

// Fastest open route. Dijkstra over a small graph, so a simple scan for the nearest unvisited node is enough.
export function route(w: Waterway, s: WaterwayState, from: string, to: string): Route | null {
  if (from === to) return { nodes: [from], seconds: 0 };
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, string>();
  const done = new Set<string>();
  while (true) {
    let current: string | null = null;
    for (const [n, d] of dist) if (!done.has(n) && (current === null || d < dist.get(current)!)) current = n;
    if (current === null) return null;
    if (current === to) break;
    done.add(current);
    for (const r of w.reaches) {
      const next = r.from === current ? r.to : r.to === current ? r.from : null;
      if (next === null || done.has(next)) continue;
      const t = travelSeconds(w, s, current, next);
      if (t === null) continue;
      const candidate = dist.get(current)! + t;
      if (candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        prev.set(next, current);
      }
    }
  }
  const nodes = [to];
  while (nodes[0] !== from) nodes.unshift(prev.get(nodes[0])!);
  return { nodes, seconds: dist.get(to)! };
}

// Projection: travel time between every pair of settlements. Unreachable pairs are omitted.
export function routeTable(w: Waterway, s: WaterwayState): Record<string, Record<string, number>> {
  const settlements = w.nodes.filter((n) => n.kind === "settlement").map((n) => n.id);
  const table: Record<string, Record<string, number>> = {};
  for (const a of settlements) {
    table[a] = {};
    for (const b of settlements) {
      const r = route(w, s, a, b);
      if (r) table[a][b] = Math.round(r.seconds);
    }
  }
  return table;
}

// Projection: settlements that water from `nodeId` reaches on open reaches, following the current. Replaces the old waterField count.
export function downstreamSettlements(w: Waterway, s: WaterwayState, nodeId: string): string[] {
  const seen = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length) {
    const n = queue.shift()!;
    for (const r of w.reaches) {
      const status = s.reaches[r.id];
      if (!status?.open) continue;
      const [a, b] = status.current >= 0 ? [r.from, r.to] : [r.to, r.from];
      if (a === n && !seen.has(b)) {
        seen.add(b);
        queue.push(b);
      }
    }
  }
  return w.nodes
    .filter((n) => n.kind === "settlement" && n.id !== nodeId && seen.has(n.id))
    .map((n) => n.id);
}

// State transitions. Each returns a new state and leaves the input untouched.
export function closeReach(s: WaterwayState, reachId: string, untilTick: number): WaterwayState {
  const current = s.reaches[reachId];
  if (!current) throw new Error(`unknown reach ${reachId}`);
  if (!Number.isInteger(untilTick) || untilTick <= s.tick) throw new Error("a closure must end in the future");
  return { ...s, reaches: { ...s.reaches, [reachId]: { ...current, open: false, closedUntilTick: untilTick } } };
}

export function setCurrent(s: WaterwayState, reachId: string, current: number): WaterwayState {
  const existing = s.reaches[reachId];
  if (!existing) throw new Error(`unknown reach ${reachId}`);
  if (!Number.isFinite(current)) throw new Error("current must be finite");
  return { ...s, reaches: { ...s.reaches, [reachId]: { ...existing, current } } };
}

// Advances the clock and reopens every reach whose closure has ended.
export function advanceTo(s: WaterwayState, tick: number): WaterwayState {
  if (tick < s.tick) throw new Error("time does not run backwards");
  const reaches = Object.fromEntries(
    Object.entries(s.reaches).map(([id, r]) =>
      !r.open && r.closedUntilTick !== null && tick >= r.closedUntilTick
        ? [id, { ...r, open: true, closedUntilTick: null }]
        : [id, r],
    ),
  );
  return { tick, reaches };
}

// Reference network used by tests and the design spec. Not wired into the game yet.
export const SAMPLE_WATERWAY: Waterway = {
  nodes: [
    { id: "hollow-spring", kind: "settlement", name: "Hollow Spring (upstream village)" },
    { id: "north-bend", kind: "junction", name: "North bend" },
    { id: "haven", kind: "settlement", name: "Ember Haven" },
    { id: "greece-mouth", kind: "junction", name: "Greek tributary mouth" },
    { id: "greece", kind: "settlement", name: "Greek colony (planned)" },
    { id: "aurum", kind: "settlement", name: "Aurum" },
    { id: "delta", kind: "settlement", name: "Delta mouth (downstream)" },
  ],
  reaches: [
    { id: "spring-bend", from: "hollow-spring", to: "north-bend", length: 1200, current: 1.2 },
    { id: "bend-haven", from: "north-bend", to: "haven", length: 900, current: 1.0 },
    { id: "haven-mouth", from: "haven", to: "greece-mouth", length: 600, current: 0.9 },
    { id: "greece-tributary", from: "greece", to: "greece-mouth", length: 800, current: 0.6 },
    { id: "mouth-aurum", from: "greece-mouth", to: "aurum", length: 1100, current: 1.0 },
    { id: "aurum-delta", from: "aurum", to: "delta", length: 1500, current: 0.9 },
  ],
};
