import {
  FERRY,
  PIER,
  atPier,
  clearWater,
  deckBlocked,
  inWorld,
  isLand,
  localToWorld,
  onDeck,
  separation,
} from "../vessels/index.ts";
import type { State } from "./index.ts";
export type FerryCommand =
  | {
      type:
        | "ferry-shuttle"
        | "ferry-board"
        | "ferry-exit"
        | "ferry-helm"
        | "ferry-sails";
    }
  | { type: "ferry-step"; dt: number; throttle: number; turn: number };
export function ferryTransition(s: State, c: FerryCommand): State {
  const say = (message: string) => {
    s.message = message;
    return s;
  };
  const f = s.ferry;
  if (c.type === "ferry-shuttle") {
    if (s.mode !== "foot") return say("Use the shuttle ashore.");
    if (separation(s.position, { x: -7, z: 13 }) <= 7) s.position = { ...PIER };
    else if (separation(s.position, PIER) <= 7) s.position = { x: -8, z: 13 };
    else
      return say(
        "Approach the Haven dock or offshore ferry pier for the shuttle.",
      );
    return say(
      "Shuttle arrived. E boards your skiff; the Ferry board button uses the large vessel.",
    );
  }
  if (c.type === "ferry-board") {
    if (s.mode === "ferry") return say("Already aboard the ferry.");
    if (f.speed >= 0.1)
      return say(
        `Endurance is under way at ${f.speed.toFixed(1)} m/s. Stop her before boarding.`,
      );
    const gap = separation(s.position, localToWorld(FERRY.boarding, f.pose));
    if (gap > 4)
      return say(
        `Walk to the Endurance gangway to board, ${Math.round(gap)} m away. Pier or skiff alongside works.`,
      );
    f.passenger = { local: { ...FERRY.gangway }, station: "deck" };
    s.mode = "ferry";
    s.position = localToWorld(f.passenger.local, f.pose);
    return say(
      "Aboard Endurance. Walk the deck; reach the aft helm at local 0,35 and press H.",
    );
  }
  if (c.type === "ferry-exit") {
    if (
      s.mode !== "ferry" ||
      !f.passenger ||
      f.passenger.station !== "deck" ||
      f.speed >= 0.1 ||
      separation(f.passenger.local, FERRY.gangway) > 3
    )
      return say("Stop, leave the helm and walk to the port gangway (−9,0).");
    if (atPier(f)) {
      s.mode = "foot";
      s.position = { ...PIER };
    } else if (separation(s.ship, localToWorld(FERRY.boarding, f.pose)) <= 4) {
      s.mode = "ship";
      s.position = { x: s.ship.x, z: s.ship.z };
    } else
      return say(
        "No pier or skiff alongside. Disembarking into open water is unavailable.",
      );
    f.passenger = null;
    return say("Disembarked safely.");
  }
  if (c.type === "ferry-helm") {
    if (s.mode !== "ferry" || !f.passenger)
      return say(
        "You are not aboard Endurance yet. Stand at the gangway and press Board Endurance ferry, then H.",
      );
    if (f.passenger.station === "helm") {
      f.passenger.station = "deck";
      return say(
        "Helm released. The ferry keeps moving; S brakes while at the helm.",
      );
    }
    if (separation(f.passenger.local, FERRY.helm) > 3) {
      const metres = Math.round(separation(f.passenger.local, FERRY.helm));
      return say(
        f.passenger.local.z < FERRY.helm.z
          ? `Helm is ${metres} m aft. Hold S to walk aft to the wheel, then press H.`
          : `Helm is ${metres} m forward. Hold W to walk back to the wheel, then press H.`,
      );
    }
    f.passenger.local = { ...FERRY.helm };
    f.passenger.station = "helm";
    s.position = localToWorld(f.passenger.local, f.pose);
    return say(
      "At helm. Set sails, W accelerates, S slows, A/D steer. H releases helm.",
    );
  }
  if (c.type === "ferry-sails") {
    if (s.mode !== "ferry" || f.passenger?.station !== "helm")
      return say("Take the helm to change sail configuration.");
    f.sails = f.sails === "set" ? "furled" : "set";
    return say(
      f.sails === "set"
        ? "Canvas set. W gathers way."
        : "Sails furled. Vessel slowing.",
    );
  }
  if (c.type !== "ferry-step") return say("Unknown ferry command.");
  if (![c.dt, c.throttle, c.turn].every(Number.isFinite) || c.dt <= 0) return s;
  const dt = Math.min(0.1, c.dt),
    helm = s.mode === "ferry" && f.passenger?.station === "helm";
  const throttle = helm ? Math.max(-1, Math.min(1, c.throttle)) : 0;
  const turn = helm ? Math.max(-1, Math.min(1, c.turn)) : 0;
  f.speed = Math.max(
    0,
    Math.min(
      12,
      f.speed +
        (f.sails === "set" ? Math.max(0, throttle) * 2 : 0) * dt -
        (throttle < 0 ? 5 : f.sails === "furled" ? 2 : 0.15) * dt,
    ),
  );
  const heading = Math.atan2(
    Math.sin(f.pose.heading + turn * 0.16 * dt * (f.speed / 12)),
    Math.cos(f.pose.heading + turn * 0.16 * dt * (f.speed / 12)),
  );
  const next = {
    x: f.pose.x - Math.sin(heading) * f.speed * dt,
    z: f.pose.z - Math.cos(heading) * f.speed * dt,
    heading,
  };
  if (clearWater(next) && !skiffCollision(s, next)) {
    f.pose = next;
  } else {
    f.speed = 0;
    s.message =
      "Ferry stopped: land, world boundary or skiff obstructs the hull.";
  }
  if (f.passenger) s.position = localToWorld(f.passenger.local, f.pose);
  return s;
}
function skiffCollision(s: State, pose: State["ferry"]["pose"]) {
  const c = Math.cos(pose.heading),
    sn = Math.sin(pose.heading),
    x = s.ship.x - pose.x,
    z = s.ship.z - pose.z;
  return Math.abs(c * x - sn * z) < 12 && Math.abs(sn * x + c * z) < 82;
}
export function walkFerry(s: State, dx: number, dz: number, dt: number): State {
  const p = s.ferry.passenger;
  if (!p || p.station === "helm" || ![dx, dz, dt].every(Number.isFinite))
    return s;
  const len = Math.hypot(dx, dz);
  if (!len) return s;
  const step = Math.max(0, Math.min(0.1, dt)) * 4;
  // Player input is vessel-local on deck. Reference-frame transforms remain exact.
  const next = {
    x: p.local.x + (dx / len) * step,
    z: p.local.z + (dz / len) * step,
  };
  if (onDeck(next) && !deckBlocked(next)) {
    p.local = next;
    s.position = localToWorld(next, s.ferry.pose);
  }
  return s;
}
