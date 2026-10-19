// The night sky over the aquarium. Stars are fixed in the sky (no time of night yet), so a navigator can use the
// same constellation at any point on the voyage. Azimuths are radians clockwise from +z (north); altitudes are radians
// above the horizon. A star with altitude above zero is visible.

export type Star = { name: string; azimuth: number; altitude: number; magnitude: number };

const deg = (d: number) => (d * Math.PI) / 180;

// The Anvil: six stars with the pointer star at north, so a sextant sighting on it gives a true heading.
export const ANVIL = {
  name: "The Anvil",
  stars: [
    { name: "Pointer", azimuth: deg(0), altitude: deg(38), magnitude: 1.2 },
    { name: "Hammer", azimuth: deg(35), altitude: deg(52), magnitude: 2.0 },
    { name: "Tongs", azimuth: deg(70), altitude: deg(31), magnitude: 2.4 },
    { name: "Face", azimuth: deg(120), altitude: deg(24), magnitude: 2.1 },
    { name: "Horn", azimuth: deg(200), altitude: deg(27), magnitude: 1.7 },
    { name: "Hearth", azimuth: deg(285), altitude: deg(44), magnitude: 2.6 },
  ] as Star[],
  // Pairs of star indices joined into the constellation's outline.
  links: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
  ] as [number, number][],
};

export const visibleStars = (c = ANVIL) => c.stars.filter((s) => s.altitude > 0);

// A point on a sky dome of the given radius, in world axes: y is up, x and z lie on the water.
export function starPosition(star: Star, radius: number): { x: number; y: number; z: number } {
  return {
    x: radius * Math.cos(star.altitude) * Math.sin(star.azimuth),
    y: radius * Math.sin(star.altitude),
    z: radius * Math.cos(star.altitude) * Math.cos(star.azimuth),
  };
}

// A sextant sighting on a named star gives the true heading of that star: its azimuth, independent of the compass.
export function trueHeadingFromStar(name: string, c = ANVIL): number {
  const star = c.stars.find((s) => s.name === name);
  if (!star) throw new Error(`unknown star ${name}`);
  if (star.altitude <= 0) throw new Error(`${name} is below the horizon`);
  return star.azimuth;
}
