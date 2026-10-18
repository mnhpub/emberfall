/** Metres, yaw about +Y, vessel bow points along local -Z. No hydrodynamic claim. */
export type Point = { x: number; z: number };
export type Pose = Point & { heading: number };
export type Ferry = {
  id: "endurance-ferry";
  pose: Pose;
  speed: number;
  sails: "furled" | "set";
  passenger: null | { local: Point; station: "deck" | "helm" };
};
export const FERRY = {
  length: 160,
  beam: 21,
  deckHeight: 4.3,
  helm: { x: 0, z: 35 },
  gangway: { x: -9, z: 0 },
  boarding: { x: -12, z: 0 },
  masts: [-50, -17, 18, 50],
} as const;
export const PIER = { x: 106, z: 180 };
export const initialFerry = (): Ferry => ({
  id: "endurance-ferry",
  pose: { x: 120, z: 180, heading: 0 },
  speed: 0,
  sails: "furled",
  passenger: null,
});
export function localToWorld(p: Point, pose: Pose): Point {
  const c = Math.cos(pose.heading),
    s = Math.sin(pose.heading);
  return { x: pose.x + c * p.x + s * p.z, z: pose.z - s * p.x + c * p.z };
}
export function worldToLocal(p: Point, pose: Pose): Point {
  const x = p.x - pose.x,
    z = p.z - pose.z,
    c = Math.cos(pose.heading),
    s = Math.sin(pose.heading);
  return { x: c * x - s * z, z: s * x + c * z };
}
export const separation = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const isLand = (p: Point) =>
  (Math.abs(p.x) > 4 && Math.abs(p.x) <= 24 && p.z >= -30 && p.z <= 17) ||
  (p.x >= 80 && p.x <= 107 && p.z >= 170 && p.z <= 190);
export const inWorld = (p: Point) =>
  Math.abs(p.x) <= 500 && Math.abs(p.z) <= 500;
export const isWater = (p: Point) => inWorld(p) && !isLand(p);
export const deckHalfWidth = (z: number) =>
  z < -66
    ? (9 * (80 + z)) / 14
    : z < -48
      ? 9 + ((z + 66) / 18) * 1.5
      : z > 50
        ? 10.5 - (z - 50) * 0.1
        : 10.5;
export function onDeck(p: Point) {
  return (
    Math.abs(p.x) <= Math.min(9.5, deckHalfWidth(p.z) - 0.7) &&
    Math.abs(p.z) <= 72
  );
}
export function deckBlocked(p: Point) {
  return (
    FERRY.masts.some((z) => Math.hypot(p.x, p.z - z) < 1.1) ||
    (Math.abs(Math.abs(p.x) - 6) < 0.65 && p.z > 52.4 && p.z < 70.6) ||
    (Math.abs(p.x) < 6.65 && Math.abs(p.z - 70) < 0.65) ||
    (Math.abs(p.x) > 1.1 && Math.abs(p.x) < 6.65 && Math.abs(p.z - 53) < 0.65)
  );
}
export function insideHull(p: Point, pose: Pose, padding = 0) {
  const q = worldToLocal(p, pose);
  return (
    Math.abs(q.x) < FERRY.beam / 2 + padding &&
    Math.abs(q.z) < FERRY.length / 2 + padding
  );
}
export function clearWater(pose: Pose) {
  // Sample each rectangular footprint edge at <=2m, plus interior grid points.
  for (let z = -80; z <= 80; z += 2)
    for (const x of [-10.5, 0, 10.5])
      if (!isWater(localToWorld({ x, z }, pose))) return false;
  for (let x = -10.5; x <= 10.5; x += 1.5)
    for (const z of [-80, 0, 80])
      if (!isWater(localToWorld({ x, z }, pose))) return false;
  return true;
}
export const atPier = (f: Ferry) =>
  separation(f.pose, { x: 120, z: 180 }) <= 1.5 &&
  Math.abs(Math.atan2(Math.sin(f.pose.heading), Math.cos(f.pose.heading))) <
    0.03 &&
  f.speed < 0.1;
export function validateFerry(f: Ferry, mode: string, position: Point) {
  if (
    !f ||
    f.id !== "endurance-ferry" ||
    !f.pose ||
    ![f.pose.x, f.pose.z, f.pose.heading, f.speed].every(Number.isFinite) ||
    Math.abs(f.pose.heading) > Math.PI ||
    f.speed < 0 ||
    f.speed > 12 ||
    !["furled", "set"].includes(f.sails) ||
    !clearWater(f.pose)
  )
    throw new Error("Invalid ferry");
  if (mode === "ferry") {
    const p = f.passenger;
    if (
      !p ||
      !p.local ||
      !onDeck(p.local) ||
      deckBlocked(p.local) ||
      !["deck", "helm"].includes(p.station) ||
      separation(localToWorld(p.local, f.pose), position) > 0.001 ||
      (p.station === "helm" && separation(p.local, FERRY.helm) > 0.001)
    )
      throw new Error("Invalid ferry attachment");
  } else if (f.passenger) throw new Error("Unexpected ferry passenger");
}
