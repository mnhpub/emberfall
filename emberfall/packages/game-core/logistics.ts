import { FERRY, localToWorld } from "../vessels/index.ts";
import {
  execute,
  initialLogistics,
  usage,
  type Good,
  type Envelope,
  type Logistics,
  type Context,
} from "../logistics/index.ts";
import { definition, itemCount, type ItemId } from "./catalog.ts";
import type { State } from "./index.ts";
export type LogisticsCommand = { type: "cargo"; envelope: Envelope };
export { initialLogistics };
export function cargoContext(s: State): Context {
  const available = {
    wood: s.inventory.wood,
    stone: s.inventory.stone,
    gold: s.inventory.gold,
    food: s.inventory.food,
    bolt: itemCount(s.items, "bolt"),
    cloth: itemCount(s.items, "cloth"),
    iron: itemCount(s.items, "iron"),
  };
  return {
    actor: s.position,
    ship: s.ship,
    ferry: {
      ...localToWorld(FERRY.gangway, s.ferry.pose),
      speed: s.ferry.speed,
    },
    available,
    conditions: Object.fromEntries(
      ["bolt", "cloth", "iron"].map((g) => [
        g,
        Math.min(
          100,
          ...s.items
            .filter((i) => i.definitionId === g)
            .map((i) => i.condition),
        ),
      ]),
    ),
    crates: s.placed
      .filter(
        (p) =>
          s.items.find((i) => i.id === p.instanceId)?.definitionId === "crate",
      )
      .map((p) => ({
        id: p.instanceId,
        x: p.x,
        z: p.z,
        capacity: definition("crate").capacity!,
      })),
  };
}
export function cargoTransition(s: State, envelope: Envelope): State {
  if (!s.profession) {
    s.message = "Choose a profession before handling cargo.";
    return s;
  }
  const result = execute(s.logistics, envelope, cargoContext(s));
  if (result.error) {
    s.message = result.error;
    return s;
  }
  if (result.duplicate) {
    s.message = "Command already applied. Cargo was not moved twice.";
    return s;
  }
  const e = result.event!;
  if (
    e.colonyCredit &&
    ["wood", "stone", "gold", "food"].includes(e.colonyCredit.good)
  ) {
    const balance = s.colonies.find((c) => c.id === e.colonyCredit!.colony)!
      .stock[e.colonyCredit.good as "wood" | "stone" | "gold" | "food"];
    if (balance + e.colonyCredit.quantity > 100000) {
      s.message = "Destination stock limit reached.";
      return s;
    }
  }
  if (
    e.inventoryCredit &&
    !["wood", "stone", "gold", "food"].includes(e.inventoryCredit.good) &&
    s.items.length >= 200
  ) {
    s.message = "Carried item limit reached.";
    return s;
  }
  // Both the carried debit and custody append occur in the same cloned snapshot.
  // Durability belongs to the offline save or enclosing authority transaction.
  if (e.inventoryDebit) {
    const { good, quantity } = e.inventoryDebit;
    if (["wood", "stone", "gold", "food"].includes(good))
      s.inventory[good as "wood" | "stone" | "gold" | "food"] -= quantity;
    else {
      let remaining = quantity;
      for (const item of s.items) {
        if (item.definitionId !== good) continue;
        const debit = Math.min(remaining, item.quantity);
        item.quantity -= debit;
        remaining -= debit;
        if (!remaining) break;
      }
      s.items = s.items.filter((i) => i.quantity > 0);
    }
  }
  if (e.inventoryCredit) {
    const { good, quantity, condition } = e.inventoryCredit;
    if (["wood", "stone", "gold", "food"].includes(good))
      s.inventory[good as "wood" | "stone" | "gold" | "food"] += quantity;
    else
      s.items.push({
        id: `item-${s.nextItemId++}`,
        definitionId: good as ItemId,
        ownerId: "local-player",
        quantity,
        condition,
      });
  }
  if (e.colonyCredit) {
    const c = s.colonies.find((c) => c.id === e.colonyCredit!.colony)!;
    const { good, quantity } = e.colonyCredit;
    if (["wood", "stone", "gold", "food"].includes(good))
      c.stock[good as "wood" | "stone" | "gold" | "food"] += quantity;
  }
  s.logistics = result.state;
  s.message =
    e.type === "OrderFulfilled"
      ? `Delivery accepted. +${e.reputationDelta} local contribution points.`
      : `${e.type}: ${envelope.command.quantity} units recorded.`;
  return s;
}
export function crateOccupied(s: State, id: string) {
  return usage(s.logistics, `crate:${id}`) > 0;
}
