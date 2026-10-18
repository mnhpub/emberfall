import {
  initialFerry,
  validateFerry,
  isLand,
  isWater,
  inWorld,
  insideHull,
  type Ferry,
} from "../vessels/index.ts";
import { ferryTransition, walkFerry, type FerryCommand } from "./ferry.ts";
import {
  initialLogistics,
  cargoTransition,
  cargoContext,
  type LogisticsCommand,
} from "./logistics.ts";
import { validateLogistics, type Logistics } from "../logistics/index.ts";
import {
  initialObjects,
  objectTransition,
  validateObjects,
  collides,
  equipped,
  type ObjectState,
  type ObjectCommand,
} from "./objects.ts";
export type Stock = {
  wood: number;
  stone: number;
  gold: number;
  food: number;
  relic: number;
};
export type Colony = {
  id: string;
  name: string;
  x: number;
  z: number;
  population: number;
  pyramid: number;
  active: boolean;
  stock: Stock;
};
export type State = ObjectState & {
  version: 4;
  ferry: Ferry;
  logistics: Logistics;
  tick: number;
  mode: "foot" | "ship" | "ferry";
  position: { x: number; z: number };
  ship: { x: number; z: number; hull: number; cargo: Stock };
  inventory: Stock;
  nodes: Record<string, number>;
  colonies: Colony[];
  beast: { hp: number; cooldown: number };
  recovered: boolean;
  delivered: boolean;
  message: string;
};
export const NODE_POSITIONS: Record<
  string,
  { x: number; z: number; kind: "wood" | "stone" | "gold" }
> = {
  timber: { x: -9, z: 10, kind: "wood" },
  quarry: { x: -13, z: 7, kind: "stone" },
  gold: { x: -7, z: 6, kind: "gold" },
};
const stock = (): Stock => ({ wood: 0, stone: 0, gold: 0, food: 0, relic: 0 });
export function initialState(): State {
  return {
    ...initialObjects(),
    version: 4,
    ferry: initialFerry(),
    logistics: initialLogistics(),
    tick: 0,
    mode: "foot",
    position: { x: -8, z: 13 },
    ship: { x: -3, z: 13, hull: 100, cargo: stock() },
    inventory: { ...stock(), food: 8 },
    nodes: { timber: 40, quarry: 32, gold: 3 },
    colonies: [
      {
        id: "haven",
        name: "Ember Haven",
        x: -10,
        z: 13,
        population: 8,
        pyramid: 0,
        active: false,
        stock: stock(),
      },
      {
        id: "aurum",
        name: "Aurum Colony",
        x: 10,
        z: -19,
        population: 16,
        pyramid: 3,
        active: true,
        stock: { ...stock(), food: 25 },
      },
    ],
    beast: { hp: 60, cooldown: 0 },
    recovered: false,
    delivered: false,
    message:
      "Gather timber and granite ashore. Board at the dock, then sail north to the wreck.",
  };
}
export type Command =
  | ObjectCommand
  | LogisticsCommand
  | FerryCommand
  | { type: "move"; dx: number; dz: number; dt: number }
  | { type: "tick" }
  | { type: "gather"; id: string }
  | { type: "board" | "repair" | "build" | "recover" | "attack" | "deliver" };
export const distance = (
  a: { x: number; z: number },
  b: { x: number; z: number },
) => Math.hypot(a.x - b.x, a.z - b.z);
export function transition(previous: State, command: Command): State {
  const s =
    command.type === "move" || command.type === "ferry-step"
      ? {
          ...previous,
          position: { ...previous.position },
          ship: { ...previous.ship },
          ferry: {
            ...previous.ferry,
            pose: { ...previous.ferry.pose },
            passenger: previous.ferry.passenger
              ? {
                  ...previous.ferry.passenger,
                  local: { ...previous.ferry.passenger.local },
                }
              : null,
          },
        }
      : structuredClone(previous);
  if (command.type.startsWith("ferry-"))
    return ferryTransition(s, command as FerryCommand);
  if (command.type === "cargo") return cargoTransition(s, command.envelope);
  if (
    [
      "choose-profession",
      "collect",
      "craft",
      "equip",
      "unequip",
      "place",
      "pack",
    ].includes(command.type)
  )
    return objectTransition(s, command as ObjectCommand);
  const say = (message: string) => {
    s.message = message;
    return s;
  };
  if (command.type === "move") {
    if (![command.dx, command.dz, command.dt].every(Number.isFinite))
      return previous;
    if (s.mode === "ferry")
      return walkFerry(s, command.dx, command.dz, command.dt);
    if (s.mode === "ship" && s.ship.hull <= 0)
      return say("Hull disabled. Repair with two timber.");
    const length = Math.hypot(command.dx, command.dz);
    if (!length) return previous;
    const step =
      Math.min(0.1, Math.max(0, command.dt)) * (s.mode === "ship" ? 6 : 4);
    const x = Math.max(
      -500,
      Math.min(500, s.position.x + (command.dx / length) * step),
    );
    const z = Math.max(
      -500,
      Math.min(500, s.position.z + (command.dz / length) * step),
    );
    if (
      (s.mode === "foot" && (!isLand({ x, z }) || collides(s, x, z))) ||
      (s.mode === "ship" &&
        (!isWater({ x, z }) || insideHull({ x, z }, s.ferry.pose, 1.8)))
    )
      return previous;
    s.position = { x, z };
    if (s.mode === "ship") {
      s.ship.x = x;
      s.ship.z = z;
    }
    return s;
  }
  if (command.type === "gather") {
    const node = Object.hasOwn(NODE_POSITIONS, command.id)
      ? NODE_POSITIONS[command.id]
      : undefined;
    if (!node || s.mode !== "foot" || distance(s.position, node) > 4)
      return say("Walk within four metres of the resource.");
    if (!(s.nodes[command.id] > 0)) return say("This resource is depleted.");
    const tool = equipped(s, "hand");
    const bonus =
      tool &&
      tool.condition > 0 &&
      ((node.kind === "wood" && tool.definitionId === "axe") ||
        (node.kind === "stone" && tool.definitionId === "pick"))
        ? 1
        : 0;
    const amount = Math.min(s.nodes[command.id], 1 + bonus);
    s.nodes[command.id] -= amount;
    s.inventory[node.kind] += amount;
    if (bonus && tool) {
      tool.condition--;
      if (!tool.condition) delete s.equipment.hand;
    }
    return say(`Gathered ${node.kind}.`);
  }
  if (command.type === "board") {
    if (s.mode === "ferry") return say("Use Ferry exit at the port gangway.");
    if (s.mode === "foot") {
      if (distance(s.position, s.ship) > 7)
        return say("Approach your vessel to board.");
      s.mode = "ship";
      s.position = { x: s.ship.x, z: s.ship.z };
      return say(
        "Aboard. WASD to sail; Space to defend against the river beast.",
      );
    }
    const landing = { x: s.ship.x < 0 ? -5.5 : 5.5, z: s.ship.z };
    const pierLanding = { x: 106, z: 180 };
    const target =
      Math.hypot(s.ship.x - pierLanding.x, s.ship.z - pierLanding.z) <= 7
        ? pierLanding
        : landing;
    if (
      Math.hypot(target.x - s.ship.x, target.z - s.ship.z) > 7 ||
      !isLand(target) ||
      collides(s, target.x, target.z)
    )
      return say("Approach a riverbank or offshore pier before disembarking.");
    s.mode = "foot";
    s.position = target;
    return say("Disembarked on the riverbank.");
  }
  if (command.type === "repair") {
    if (distance(s.position, s.ship) > 7)
      return say("Approach your ship to repair.");
    if (s.inventory.wood < 2) return say("Repairs need two timber.");
    if (s.ship.hull === 100) return say("Hull already sound.");
    s.inventory.wood -= 2;
    s.ship.hull = Math.min(100, s.ship.hull + 35);
    return say("Hull repaired.");
  }
  if (command.type === "build") {
    const c = s.colonies[0];
    if (s.mode !== "foot" || distance(s.position, c) > 7)
      return say("Build from Ember Haven ashore.");
    if (c.active) return say("Your gold apex is already active.");
    const kind = c.pyramid < 3 ? "stone" : "gold";
    const cost = kind === "stone" ? 3 : 1;
    if (s.inventory[kind] < cost)
      return say(`Construction needs ${cost} ${kind}.`);
    s.inventory[kind] -= cost;
    if (kind === "gold") c.active = true;
    else c.pyramid++;
    return say(
      c.active
        ? "Gold apex activated. Its fictional field now joins the watershed."
        : `Granite pyramid stage ${c.pyramid}/3 constructed.`,
    );
  }
  if (command.type === "recover") {
    if (s.mode !== "ship" || distance(s.position, { x: 0, z: -25 }) > 5)
      return say("Sail to the northern wreck to recover its relic.");
    if (s.recovered) return say("Wreck already salvaged.");
    s.recovered = true;
    s.ship.cargo.relic = 1;
    return say("Relic secured in ship cargo. Return to Ember Haven.");
  }
  if (command.type === "deliver") {
    if (
      distance(s.ship, { x: -3, z: 13 }) > 5 ||
      distance(s.position, s.ship) > 7
    )
      return say("Return with your vessel to the home dock.");
    if (!s.ship.cargo.relic) return say("Recover the wreck relic first.");
    s.ship.cargo.relic = 0;
    s.delivered = true;
    s.colonies[0].population += 2;
    return say("Expedition complete. Two settlers have joined Ember Haven.");
  }
  if (command.type === "attack") {
    if (s.mode !== "ship" || distance(s.position, { x: 0, z: -10 }) > 6)
      return say("No beast within weapon range.");
    if (s.beast.cooldown > 0) return say("Weapon recovering.");
    s.beast.hp = Math.max(0, s.beast.hp - 15);
    s.beast.cooldown = 2;
    return say(
      s.beast.hp === 0
        ? "River beast subdued. Passage is safe."
        : "Hit! Keep clear while the weapon recovers.",
    );
  }
  if (command.type !== "tick") return say("Unknown command.");
  s.tick++;
  s.beast.cooldown = Math.max(0, s.beast.cooldown - 1);
  if (
    s.mode === "ship" &&
    s.beast.hp > 0 &&
    distance(s.position, { x: 0, z: -10 }) < 6
  )
    s.ship.hull = Math.max(0, s.ship.hull - 5);
  if (s.tick % 10 === 0)
    for (const c of s.colonies) {
      c.stock.food = Math.max(
        0,
        c.stock.food + (c.active ? 3 : 1) - Math.ceil(c.population / 8),
      );
      if (c.id === "aurum") {
        c.stock.stone++;
        c.stock.gold += s.tick % 30 === 0 ? 1 : 0;
      }
    }
  return s;
}
export function waterField(s: State, z: number): number {
  return s.colonies.filter((c) => c.active && z >= c.z).reduce((n) => n + 1, 0);
}
export function restore(value: unknown): State {
  // Only accept the exact versioned shape and bounded numeric values; no trusted client authority implied.
  if (!value || typeof value !== "object") throw new Error("Invalid save");
  const incoming = structuredClone(value) as Record<string, unknown>;
  const oldVersion = incoming.version;
  if (oldVersion === 1) Object.assign(incoming, initialObjects());
  if (oldVersion === 1 || oldVersion === 2)
    incoming.logistics = initialLogistics();
  if (oldVersion === 1 || oldVersion === 2 || oldVersion === 3) {
    incoming.ferry = initialFerry();
    incoming.version = 4;
  }
  const v = incoming as State;
  const base = initialState();
  if (
    v.version !== 4 ||
    !["foot", "ship", "ferry"].includes(v.mode) ||
    typeof v.recovered !== "boolean" ||
    typeof v.delivered !== "boolean" ||
    typeof v.message !== "string" ||
    v.message.length > 500
  )
    throw new Error("Unsupported save");
  const finite = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const checkStock = (a: Stock) =>
    a &&
    Object.keys(stock()).every(
      (k) =>
        finite(a[k as keyof Stock], 0, 100000) &&
        Number.isInteger(a[k as keyof Stock]),
    );
  if (
    !finite(v.tick, 0, 1e9) ||
    !Number.isInteger(v.tick) ||
    !v.position ||
    !v.ship ||
    !finite(v.position.x, -500, 500) ||
    !finite(v.position.z, -500, 500) ||
    !finite(v.ship.x, -500, 500) ||
    !finite(v.ship.z, -500, 500) ||
    !finite(v.ship.hull, 0, 100) ||
    !checkStock(v.inventory) ||
    !checkStock(v.ship.cargo) ||
    !v.nodes ||
    !Object.keys(base.nodes).every(
      (k) =>
        finite(v.nodes[k], 0, base.nodes[k]) && Number.isInteger(v.nodes[k]),
    ) ||
    !v.beast ||
    !finite(v.beast.hp, 0, 60) ||
    !finite(v.beast.cooldown, 0, 2) ||
    !Array.isArray(v.colonies) ||
    v.colonies.length !== 2
  )
    throw new Error("Corrupt save");
  v.colonies.forEach((c, i) => {
    if (
      c.id !== base.colonies[i].id ||
      c.x !== base.colonies[i].x ||
      c.z !== base.colonies[i].z ||
      typeof c.active !== "boolean" ||
      !finite(c.pyramid, 0, 3) ||
      !Number.isInteger(c.pyramid) ||
      !finite(c.population, 1, 1000) ||
      !checkStock(c.stock)
    )
      throw new Error("Corrupt colony");
  });
  validateFerry(v.ferry, v.mode, v.position);
  validateObjects(v);
  validateLogistics(v.logistics, cargoContext(v));
  return structuredClone(v);
}
