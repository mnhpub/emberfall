import { transition, type State, type Stock } from "../game-core/index.ts";
import type { ObjectCommand, ObjectState } from "../game-core/objects.ts";
/** Contract adapter and replayable economic projection; no durable event store yet. */
export type EconomicSnapshot = ObjectState & {
  inventory: Stock;
  revision: number;
};
export type CommandEnvelope = {
  commandId: string;
  actorId: "local-player";
  expectedRevision: number;
  command: ObjectCommand;
};
export type EconomicEvent = {
  schemaVersion: 1;
  aggregateId: "character:local-player";
  sequence: number;
  commandId: string;
  actorId: "local-player";
  type:
    | "ProfessionChosen"
    | "SalvageCollected"
    | "ItemCrafted"
    | "EquipmentChanged"
    | "ObjectPlaced"
    | "ObjectPacked";
  data: {
    itemsAdded: ObjectState["items"];
    itemsChanged: ObjectState["items"];
    itemsRemoved: string[];
    profession: ObjectState["profession"];
    equipment: ObjectState["equipment"];
    placed: ObjectState["placed"];
    salvage: ObjectState["salvage"];
    nextItemId: number;
    inventory: Stock;
  };
};
export const economicSnapshot = (s: State, revision = 0): EconomicSnapshot =>
  structuredClone({
    profession: s.profession,
    items: s.items,
    equipment: s.equipment,
    placed: s.placed,
    salvage: s.salvage,
    nextItemId: s.nextItemId,
    inventory: s.inventory,
    revision,
  });
export function decide(
  s: State,
  envelope: CommandEnvelope,
  revision: number,
): { event?: EconomicEvent; next: State; error?: string } {
  if (
    envelope.actorId !== "local-player" ||
    !envelope.commandId ||
    envelope.commandId.length > 100 ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    envelope.expectedRevision !== revision
  )
    return { next: s, error: "Actor, command identity or revision mismatch" };
  const next = transition(s, envelope.command);
  const before = economicSnapshot(s, revision);
  const after = economicSnapshot(next, revision);
  if (JSON.stringify(before) === JSON.stringify(after))
    return { next, error: next.message };
  const types: Record<ObjectCommand["type"], EconomicEvent["type"]> = {
    "choose-profession": "ProfessionChosen",
    collect: "SalvageCollected",
    craft: "ItemCrafted",
    equip: "EquipmentChanged",
    unequip: "EquipmentChanged",
    place: "ObjectPlaced",
    pack: "ObjectPacked",
  };
  const old = new Map(s.items.map((i) => [i.id, i]));
  const event: EconomicEvent = {
    schemaVersion: 1,
    aggregateId: "character:local-player",
    sequence: revision + 1,
    commandId: envelope.commandId,
    actorId: envelope.actorId,
    type: types[envelope.command.type],
    data: structuredClone({
      itemsAdded: next.items.filter((i) => !old.has(i.id)),
      itemsChanged: next.items.filter(
        (i) =>
          old.has(i.id) && JSON.stringify(old.get(i.id)) !== JSON.stringify(i),
      ),
      itemsRemoved: s.items
        .filter((i) => !next.items.some((n) => n.id === i.id))
        .map((i) => i.id),
      profession: next.profession,
      equipment: next.equipment,
      placed: next.placed,
      salvage: next.salvage,
      nextItemId: next.nextItemId,
      inventory: next.inventory,
    }),
  };
  return { event, next };
}
export function project(
  snapshot: EconomicSnapshot,
  event: EconomicEvent,
): EconomicSnapshot {
  if (
    event.schemaVersion !== 1 ||
    event.sequence !== snapshot.revision + 1 ||
    event.aggregateId !== "character:local-player"
  )
    throw new Error("Event sequence or schema mismatch");
  const items = new Map(snapshot.items.map((i) => [i.id, structuredClone(i)]));
  for (const id of event.data.itemsRemoved) items.delete(id);
  for (const item of [...event.data.itemsChanged, ...event.data.itemsAdded])
    items.set(item.id, structuredClone(item));
  return structuredClone({
    profession: event.data.profession,
    items: [...items.values()],
    equipment: event.data.equipment,
    placed: event.data.placed,
    salvage: event.data.salvage,
    nextItemId: event.data.nextItemId,
    inventory: event.data.inventory,
    revision: event.sequence,
  });
}
