// Compass model for the flat world. The lodestone is a very large black rock at a fixed point. A ship's needle points
// at it, but the needle is deflected by the rock's field, so the reading changes as the ship moves around it.
//
// The world is an aquarium: a rectangular tank full of water with the lodestone a tall pillar standing in the middle.
// Seen from above the pillar is a point, so navigation stays two-dimensional on the surface.
// Conventions: positions are { x, z } in metres. Headings are radians clockwise from +z (north in the game's convention).
// A compass reading is the true bearing to the rock plus a deviation that depends on where the ship is.

export type Point = { x: number; z: number };

export type Lodestone = {
  at: Point;
  // Direction from the rock toward the far side, where the needle reverses. Greece lies this way from Ember Haven.
  farSide: Point;
  // Height of the pillar above the tank floor, metres. Water fills the tank to `waterline`.
  height: number;
  // Largest deviation near the rock, radians. Real compasses deflect by a few degrees; this is deliberately larger for play.
  amplitude: number;
  // Distance over which the deviation fades, metres.
  falloff: number;
};

export const LODESTONE: Lodestone = { at: { x: 0, z: 0 }, farSide: { x: 1800, z: -2400 }, height: 60, amplitude: 0.5, falloff: 2000 };

// Water fills the tank to this height above the floor. Anything taller than this is land above the surface.
export const WATERLINE = 40;
export const breaksSurface = (rock: Lodestone = LODESTONE, waterline = WATERLINE) => rock.height > waterline;

// Tank walls. The bounds are a parameter so the size can be tuned without touching the model.
export type WorldBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export const WORLD: WorldBounds = { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 };

export const inBounds = (p: Point, bounds: WorldBounds = WORLD) =>
  p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ;

const wrap = (a: number) => {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
};

// True bearing from `from` to the rock, or null when the ship sits on the rock and no bearing exists.
export function trueBearing(from: Point, rock: Lodestone = LODESTONE): number | null {
  const dx = rock.at.x - from.x;
  const dz = rock.at.z - from.z;
  if (Math.hypot(dx, dz) < 1e-9) return null;
  return wrap(Math.atan2(dx, dz));
}

// Deviation of the needle at `from`, radians. Depends on the bearing from the rock, so it turns around the rock, and it
// fades with distance so that far from the rock the needle points true. Sign flips across the rock's axes.
export function deviation(from: Point, rock: Lodestone = LODESTONE): number {
  const dx = from.x - rock.at.x;
  const dz = from.z - rock.at.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-9) return 0;
  const around = Math.atan2(dz, dx);
  return rock.amplitude * Math.sin(2 * around) * Math.exp(-r / rock.falloff);
}

// True on the far side of the lodestone, where the needle reverses. Past the rock toward the far side, the reading turns
// through 180 degrees, so a navigator cannot rely on the compass alone for the far voyage.
export function reversed(from: Point, rock: Lodestone = LODESTONE): boolean {
  const dx = from.x - rock.at.x;
  const dz = from.z - rock.at.z;
  return dx * (rock.farSide.x - rock.at.x) + dz * (rock.farSide.z - rock.at.z) > 0;
}

// What the compass shows: the bearing to the rock, shifted by the local deviation and by a half turn on the far side.
// Null on the rock itself.
export function compassReading(from: Point, rock: Lodestone = LODESTONE): number | null {
  const bearing = trueBearing(from, rock);
  if (bearing === null) return null;
  return wrap(bearing + deviation(from, rock) + (reversed(from, rock) ? Math.PI : 0));
}

// The sextant reads true bearings from the sky, so it is not affected by the rock's field or the reversal.
// Taking a fix is the navigator's only way back to a true heading on the far voyage.
export function sextantBearing(from: Point, rock: Lodestone = LODESTONE): number | null {
  return trueBearing(from, rock);
}

// Angle between two headings, in [0, π]. Used to report how far a compass is off true.
export function angularGap(a: number, b: number): number {
  const d = wrap(a - b);
  return d > Math.PI ? 2 * Math.PI - d : d;
}
