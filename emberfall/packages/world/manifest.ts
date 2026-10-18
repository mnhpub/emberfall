// Ships and their manifests. A manifest lists the souls aboard. Provisions are measured in ration-days: each soul eats one
// ration per day. Endurance is how many days the provisions last for the souls aboard.

export type Soul = { id: string; name: string };
export type Ship = { id: string; manifest: Soul[]; provisions: number };

export const RATION_PER_SOUL_PER_DAY = 1;

export const enduranceDays = (ship: Ship) => {
  const souls = ship.manifest.length;
  if (souls === 0) return Infinity;
  return Math.floor(ship.provisions / (souls * RATION_PER_SOUL_PER_DAY));
};

export function embark(ship: Ship, soul: Soul): Ship {
  if (ship.manifest.some((s) => s.id === soul.id)) throw new Error(`${soul.name} is already on the manifest`);
  return { ...ship, manifest: [...ship.manifest, soul] };
}

// Sail for `days`. Each day the crew eats; when provisions run short, the least provisioned souls go first.
// Returns the ship, the souls lost to hunger, and the days actually sailed before the ship could not feed its crew.
export function sail(ship: Ship, days: number): { ship: Ship; lost: Soul[]; daysSailed: number } {
  if (!Number.isInteger(days) || days < 0) throw new Error("days must be a whole number, zero or more");
  let current: Ship = { ...ship, manifest: [...ship.manifest] };
  const lost: Soul[] = [];
  let daysSailed = 0;
  for (let day = 0; day < days && current.manifest.length > 0; day++) {
    const need = current.manifest.length * RATION_PER_SOUL_PER_DAY;
    if (current.provisions >= need) {
      current = { ...current, provisions: current.provisions - need };
    } else {
      const short = need - current.provisions;
      const starve = Math.min(current.manifest.length, Math.ceil(short / RATION_PER_SOUL_PER_DAY));
      lost.push(...current.manifest.slice(-starve));
      current = { ...current, manifest: current.manifest.slice(0, current.manifest.length - starve), provisions: 0 };
    }
    daysSailed = day + 1;
  }
  return { ship: current, lost, daysSailed };
}

// Projection for the dock ledger: what a ship carries and how long it can stay at sea.
export type DockLedger = { shipId: string; souls: string[]; provisions: number; enduranceDays: number | null };
export function dockLedger(ship: Ship): DockLedger {
  const endurance = enduranceDays(ship);
  return {
    shipId: ship.id,
    souls: ship.manifest.map((s) => s.name),
    provisions: ship.provisions,
    enduranceDays: Number.isFinite(endurance) ? endurance : null,
  };
}
