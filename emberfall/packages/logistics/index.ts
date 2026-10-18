/** One local custody authority: quantities, reservations, manifests and receipts. */
export const GOODS = [
  "wood",
  "stone",
  "gold",
  "food",
  "bolt",
  "cloth",
  "iron",
] as const;
export type Good = (typeof GOODS)[number];
export const DOCKS = {
  haven: { name: "Ember Haven dock", x: -7, z: 13, warehouse: "haven-store" },
  aurum: { name: "Aurum river dock", x: 7, z: -19, warehouse: "aurum-store" },
} as const;
export type Endpoint =
  | "haven-store"
  | "aurum-store"
  | "ship"
  | "ferry"
  | `crate:${string}`;
export type Lot = {
  id: string;
  rootId: string;
  good: Good;
  quantity: number;
  condition: number;
  ownerId: "local-player";
  origin: "haven" | "aurum";
  destination?: "haven" | "aurum";
  custodian: Endpoint;
  orderId?: string;
  shipped: boolean;
  provenance?: { actor:string; rootId:string; room:string };
};
export type Order = {
  id: string;
  source: "haven" | "aurum";
  destination: "haven" | "aurum";
  good: Good;
  required: number;
  fulfilled: number;
  rewardPerUnit: number;
};
export type CargoCommand =
  | { type: "deposit"; good: Good; quantity: number; dock: "haven" | "aurum" }
  | { type: "transfer"; lotId: string; quantity: number; to: Endpoint }
  | { type: "consign"; lotId: string; quantity: number; orderId: string }
  | { type: "fulfill"; lotId: string; quantity: number }
  | { type: "withdraw"; lotId: string; quantity: number };
export type Envelope = {
  commandId: string;
  expectedRevision: number;
  command: CargoCommand;
};
export type CargoEvent = {
  schemaVersion: 1;
  sequence: number;
  commandId: string;
  request: string;
  type:
    | "StockWithdrawn"
    | "StockDeposited"
    | "CargoTransferred"
    | "CargoConsigned"
    | "CargoReleased"
    | "CargoAccepted"
    | "ColonyStockReleased"
    | "OrderFulfilled";
  removed: string[];
  upserted: Lot[];
  nextLotId: number;
  order?: Order;
  reputationDelta: number;
  inventoryDebit?: { good: Good; quantity: number };
  inventoryCredit?: { good: Good; quantity: number; condition: number };
  colonyCredit?: { colony: "haven" | "aurum"; good: Good; quantity: number };
  colonyDebit?: { colony:"haven"|"aurum";good:Good;quantity:number };
};
export type Receipt = { commandId: string; request: string; sequence: number };
export type Logistics = {
  revision: number;
  nextLotId: number;
  lots: Lot[];
  orders: Order[];
  reputation: number;
  events: CargoEvent[];
  receipts: Receipt[];
};
export function initialLogistics(): Logistics {
  return {
    revision: 0,
    nextLotId: 1,
    lots: [],
    orders: [
      {
        id: "aurum-timber",
        source: "haven",
        destination: "aurum",
        good: "wood",
        required: 6,
        fulfilled: 0,
        rewardPerUnit: 10,
      },
      {
        id: "haven-provisions",
        source: "aurum",
        destination: "haven",
        good: "food",
        required: 4,
        fulfilled: 0,
        rewardPerUnit: 10,
      },
    ],
    reputation: 0,
    events: [],
    receipts: [],
  };
}
export type Context = {
  actor: { x: number; z: number };
  ship: { x: number; z: number };
  ferry?: { x: number; z: number; speed?: number };
  available: Record<Good, number>;
  conditions?: Partial<Record<Good, number>>;
  crates: { id: string; x: number; z: number; capacity: number }[];
};
const known = (x: unknown): x is Good =>
  typeof x === "string" && (GOODS as readonly string[]).includes(x);
function endpoint(ctx: Context, id: Endpoint) {
  if (id === "ship") return { ...ctx.ship, capacity: 24, speed: 0 };
  if (id === "ferry")
    return ctx.ferry
      ? { ...ctx.ferry, capacity: 96, speed: ctx.ferry.speed ?? 0 }
      : undefined;
  if (id === "haven-store") return { ...DOCKS.haven, capacity: 128, speed: 0 };
  if (id === "aurum-store") return { ...DOCKS.aurum, capacity: 128, speed: 0 };
  const crate = ctx.crates.find((c) => `crate:${c.id}` === id);
  return crate ? { ...crate, speed: 0 } : undefined;
}
const near = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z) <= 6;
export function usage(s: Logistics, id: Endpoint) {
  return s.lots
    .filter((l) => l.custodian === id)
    .reduce((n, l) => n + l.quantity, 0);
}
export function reduceCargo(s: Logistics, event: CargoEvent): Logistics {
  if (event.schemaVersion !== 1 || event.sequence !== s.revision + 1)
    throw new Error("Cargo event sequence mismatch");
  const lots = new Map(s.lots.map((l) => [l.id, structuredClone(l)]));
  for (const id of event.removed) lots.delete(id);
  for (const l of event.upserted) lots.set(l.id, structuredClone(l));
  return {
    ...structuredClone(s),
    revision: event.sequence,
    nextLotId: event.nextLotId,
    lots: [...lots.values()],
    orders: s.orders.map((o) =>
      event.order?.id === o.id
        ? structuredClone(event.order)
        : structuredClone(o),
    ),
    reputation: s.reputation + event.reputationDelta,
    events: [...s.events, structuredClone(event)],
    receipts: [
      ...s.receipts,
      {
        commandId: event.commandId,
        request: event.request,
        sequence: event.sequence,
      },
    ],
  };
}
export function execute(
  s: Logistics,
  envelope: Envelope,
  ctx: Context,
): {
  state: Logistics;
  event?: CargoEvent;
  duplicate?: boolean;
  error?: string;
} {
  const reject = (error: string) => ({ state: s, error });
  const c = envelope.command;
  if (
    typeof envelope.commandId !== "string" ||
    !envelope.commandId ||
    envelope.commandId.length > 100 ||
    !Number.isSafeInteger(envelope.expectedRevision)
  )
    return reject("Invalid command identity.");
  // Canonical tuple fingerprint: reused IDs with different payloads are rejected.
  let payload: unknown[];
  switch (c.type) {
    case "deposit":
      payload = [c.type, c.good, c.quantity, c.dock];
      break;
    case "transfer":
      payload = [c.type, c.lotId, c.quantity, c.to];
      break;
    case "consign":
      payload = [c.type, c.lotId, c.quantity, c.orderId];
      break;
    case "withdraw":
    case "fulfill":
      payload = [c.type, c.lotId, c.quantity];
      break;
    default:
      return reject("Unknown cargo command.");
  }
  const request = JSON.stringify(payload);
  const receipt = s.receipts.find((r) => r.commandId === envelope.commandId);
  if (receipt)
    return receipt.request === request
      ? { state: s, duplicate: true }
      : reject("Command ID reused with different payload.");
  if (envelope.expectedRevision !== s.revision)
    return reject("Cargo revision conflict. Refresh before retrying.");
  if (s.events.length >= 512)
    return reject(
      "Cargo ledger full. Archival is required before further handling.",
    );
  if (!Number.isSafeInteger(c.quantity) || c.quantity < 1 || c.quantity > 128)
    return reject("Quantity must be a whole number from 1 to 128.");
  const event: CargoEvent = {
    schemaVersion: 1,
    sequence: s.revision + 1,
    commandId: envelope.commandId,
    request,
    type: "CargoTransferred",
    removed: [],
    upserted: [],
    nextLotId: s.nextLotId,
    reputationDelta: 0,
  };
  const allocate = () => `lot-${event.nextLotId++}`;
  if (c.type === "deposit") {
    if (!known(c.good) || !Object.hasOwn(DOCKS, c.dock))
      return reject("Unknown good or dock.");
    const dock = DOCKS[c.dock];
    if (!near(ctx.actor, dock))
      return reject("Approach the selected warehouse.");
    if (
      !Number.isSafeInteger(ctx.available[c.good]) ||
      ctx.available[c.good] < c.quantity
    )
      return reject("Not enough carried supplies.");
    if (usage(s, dock.warehouse) + c.quantity > 128)
      return reject("Warehouse capacity exceeded.");
    const condition = ctx.conditions?.[c.good] ?? 100;
    if (!Number.isInteger(condition) || condition < 0 || condition > 100)
      return reject("Invalid supply condition.");
    const id = allocate();
    event.type = "StockDeposited";
    event.inventoryDebit = { good: c.good, quantity: c.quantity };
    event.upserted = [
      {
        id,
        rootId: id,
        good: c.good,
        quantity: c.quantity,
        condition: ctx.conditions?.[c.good] ?? 100,
        ownerId: "local-player",
        origin: c.dock,
        custodian: dock.warehouse,
        shipped: false,
      },
    ];
  } else {
    const lot = s.lots.find((l) => l.id === c.lotId);
    if (!lot || lot.ownerId !== "local-player" || lot.quantity < c.quantity)
      return reject("Cargo unavailable or insufficient quantity.");
    const source = endpoint(ctx, lot.custodian);
    if (!source || !near(ctx.actor, source))
      return reject("Approach the cargo custodian.");
    if (source.speed >= 0.1)
      return reject("Stop the vessel before handling cargo.");
    const partial = c.quantity < lot.quantity;
    const changed: Lot = {
      ...lot,
      id: partial ? allocate() : lot.id,
      quantity: c.quantity,
    };
    if (partial)
      event.upserted.push({ ...lot, quantity: lot.quantity - c.quantity });
    else event.removed.push(lot.id);
    if (c.type === "withdraw") {
      if (lot.orderId)
        return reject("Consigned supplies must complete their work order.");
      if (ctx.available[lot.good] + c.quantity > 100000)
        return reject("Carried supply limit exceeded.");
      event.type = "StockWithdrawn";
      event.inventoryCredit = {
        good: lot.good,
        quantity: c.quantity,
        condition: lot.condition,
      };
    } else if (c.type === "transfer") {
      const target = endpoint(ctx, c.to);
      if (target && target.speed >= 0.1)
        return reject("Stop the destination vessel before handling cargo.");
      if (c.to === lot.custodian || !target)
        return reject("Choose a different valid custodian.");
      if (!near(ctx.actor, target) || !near(source, target))
        return reject(
          "Both custodians must be within six metres for handoff. Sail to the dock first.",
        );
      if (usage(s, c.to) + c.quantity > target.capacity)
        return reject("Destination capacity exceeded.");
      changed.custodian = c.to;
      changed.shipped = lot.shipped || c.to === "ship" || c.to === "ferry";
      event.upserted.push(changed);
    } else if (c.type === "consign") {
      const order = s.orders.find((o) => o.id === c.orderId);
      if (
        !order ||
        lot.orderId ||
        lot.custodian !== DOCKS[order.source].warehouse ||
        lot.origin !== order.source ||
        lot.good !== order.good ||
        lot.condition < 50
      )
        return reject(
          "Order needs suitable unassigned cargo at its source warehouse.",
        );
      const reserved = s.lots
        .filter((l) => l.orderId === order.id)
        .reduce((n, l) => n + l.quantity, 0);
      if (order.fulfilled + reserved + c.quantity > order.required)
        return reject("Order demand is already fulfilled or reserved.");
      event.type = "CargoConsigned";
      changed.orderId = order.id;
      changed.destination = order.destination;
      event.upserted.push(changed);
    } else {
      const order = s.orders.find((o) => o.id === lot.orderId);
      if (
        !order ||
        lot.custodian !== DOCKS[order.destination].warehouse ||
        lot.destination !== order.destination ||
        lot.origin !== order.source ||
        lot.good !== order.good ||
        !lot.shipped ||
        lot.condition < 50 ||
        order.fulfilled + c.quantity > order.required
      )
        return reject(
          "Deliver consigned cargo by ship to its destination warehouse first.",
        );
      event.type = "OrderFulfilled";
      event.order = { ...order, fulfilled: order.fulfilled + c.quantity };
      event.reputationDelta = c.quantity * order.rewardPerUnit;
      event.colonyCredit = {
        colony: order.destination,
        good: lot.good,
        quantity: c.quantity,
      };
    }
  }
  if (
    s.lots.length -
      event.removed.length +
      event.upserted.filter((l) => !s.lots.some((a) => a.id === l.id)).length >
    256
  )
    return reject("Cargo lot limit reached.");
  return { state: reduceCargo(s, event), event };
}
export function replay(events: CargoEvent[]): Logistics {
  return events.reduce(reduceCargo, initialLogistics());
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;
export function validateLogistics(s: Logistics, ctx: Context): void {
  if (
    !s ||
    !Array.isArray(s.events) ||
    s.events.length > 512 ||
    !Array.isArray(s.receipts) ||
    !Array.isArray(s.lots) ||
    s.lots.length > 256 ||
    !Number.isSafeInteger(s.revision) ||
    s.revision !== s.events.length
  )
    throw new Error("Invalid cargo ledger");
  const ids = new Set<string>();
  for (const lot of s.lots) {
    if (
      !lot ||
      !/^lot-[1-9][0-9]*$/.test(lot.id) ||
      ids.has(lot.id) ||
      !known(lot.good) ||
      !Number.isSafeInteger(lot.quantity) ||
      lot.quantity < 1 ||
      lot.quantity > 128 ||
      !Number.isInteger(lot.condition) ||
      lot.condition < 0 ||
      lot.condition > 100 ||
      lot.ownerId !== "local-player" ||
      !Object.hasOwn(DOCKS, lot.origin) ||
      typeof lot.shipped !== "boolean" ||
      !endpoint(ctx, lot.custodian) ||
      !/^lot-[1-9][0-9]*$/.test(lot.rootId)
      || (lot.provenance !== undefined && (!lot.provenance || !/^[a-zA-Z0-9_-]{8,80}$/.test(lot.provenance.actor) || !/^lot-[1-9][0-9]*$/.test(lot.provenance.rootId) || !/^[a-zA-Z0-9_-]{1,64}$/.test(lot.provenance.room)))
    )
      throw new Error("Invalid cargo lot");
    ids.add(lot.id);
  }
  for (const id of new Set(s.lots.map((l) => l.custodian))) {
    if (usage(s, id) > endpoint(ctx, id)!.capacity)
      throw new Error("Cargo capacity exceeded");
  }
  const rebuilt = replay(s.events);
  if (JSON.stringify(canonical(rebuilt)) !== JSON.stringify(canonical(s)))
    throw new Error("Cargo ledger does not match its projection");
  if (
    !Number.isSafeInteger(s.nextLotId) ||
    s.nextLotId < 1 ||
    s.nextLotId > 1000000 ||
    s.lots.some(
      (l) =>
        Number(l.id.slice(4)) >= s.nextLotId ||
        Number(l.rootId.slice(4)) >= s.nextLotId,
    )
  )
    throw new Error("Invalid cargo identity sequence");
  const definitions = initialLogistics().orders;
  for (const o of s.orders) {
    const d = definitions.find((d) => d.id === o.id);
    if (
      !d ||
      o.source !== d.source ||
      o.destination !== d.destination ||
      o.good !== d.good ||
      o.required !== d.required ||
      o.rewardPerUnit !== d.rewardPerUnit ||
      !Number.isInteger(o.fulfilled) ||
      o.fulfilled < 0 ||
      o.fulfilled > o.required
    )
      throw new Error("Invalid order");
  }
  if (
    s.orders.length !== definitions.length ||
    new Set(s.orders.map((o) => o.id)).size !== definitions.length ||
    s.reputation !==
      s.orders.reduce((n, o) => n + o.fulfilled * o.rewardPerUnit, 0)
  )
    throw new Error("Invalid contribution total");
  for (const l of s.lots) {
    if (l.orderId) {
      const o = s.orders.find((o) => o.id === l.orderId);
      if (
        !o ||
        l.destination !== o.destination ||
        l.origin !== o.source ||
        l.good !== o.good
      )
        throw new Error("Invalid consignment");
    } else if (l.destination) throw new Error("Unassigned destination");
  }
  for (const o of s.orders)
    if (
      o.fulfilled +
        s.lots
          .filter((l) => l.orderId === o.id)
          .reduce((n, l) => n + l.quantity, 0) >
      o.required
    )
      throw new Error("Over-reserved order");
  const commands = new Set<string>();
  for (const e of s.events) {
    if (
      !e.commandId ||
      commands.has(e.commandId) ||
      !Number.isSafeInteger(e.nextLotId) ||
      e.nextLotId < 1
    )
      throw new Error("Invalid cargo event");
    commands.add(e.commandId);
  }
}
