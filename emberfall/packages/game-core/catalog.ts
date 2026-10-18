/** Shared land/sea definitions. Instances carry ownership and wear; definitions do not. */
export const PROFESSIONS = {
  shipwright: {
    name: "Shipwright",
    description: "Build fittings and operate the forge.",
    starter: "hammer",
  },
  fisher: {
    name: "Fisher",
    description: "Begin with fishing tackle; catches arrive in a later slice.",
    starter: "fishing-rod",
  },
  provisioner: {
    name: "Provisioner",
    description: "Prepare the settlement for expeditions.",
    starter: "knife",
  },
  transport: {
    name: "Transport",
    description: "Handle cargo between land and sea.",
    starter: "cargo-hook",
  },
} as const;
export type Profession = keyof typeof PROFESSIONS;
export type Slot = "hand" | "body" | "back";
export type Family =
  | "tool"
  | "wardrobe"
  | "container"
  | "structure"
  | "machine"
  | "component";
export type ItemDefinition = {
  name: string;
  family: Family;
  material: string;
  massKg: number;
  slot?: Slot;
  footprint?: [number, number];
  capacity?: number;
  relevant?: Profession[];
  specification?: string;
};
export const CATALOG = {
  bolt: {
    name: "Steel bolt",
    family: "component",
    material: "steel",
    massKg: 0.1,
    relevant: ["shipwright", "transport"],
    specification: "M12 × 80 mm; prototype fitting",
  },
  cloth: {
    name: "Hemp canvas",
    family: "component",
    material: "hemp",
    massKg: 0.3,
    relevant: ["shipwright", "provisioner"],
  },
  iron: {
    name: "Metal stock",
    family: "component",
    material: "steel",
    massKg: 1,
    relevant: ["shipwright"],
  },
  axe: {
    name: "Timber axe",
    family: "tool",
    material: "steel/timber",
    massKg: 1.5,
    slot: "hand",
  },
  pick: {
    name: "Quarry pick",
    family: "tool",
    material: "steel/timber",
    massKg: 2,
    slot: "hand",
  },
  hammer: {
    name: "Workshop hammer",
    family: "tool",
    material: "steel/timber",
    massKg: 1,
    slot: "hand",
  },
  "fishing-rod": {
    name: "Fishing rod",
    family: "tool",
    material: "timber/hemp",
    massKg: 0.8,
    slot: "hand",
  },
  knife: {
    name: "Provisioning knife",
    family: "tool",
    material: "steel/timber",
    massKg: 0.3,
    slot: "hand",
  },
  "cargo-hook": {
    name: "Cargo hook",
    family: "tool",
    material: "steel",
    massKg: 0.7,
    slot: "hand",
  },
  "work-clothes": {
    name: "Canvas work clothes",
    family: "wardrobe",
    material: "hemp",
    massKg: 1,
    slot: "body",
  },
  backpack: {
    name: "Canvas backpack",
    family: "wardrobe",
    material: "hemp/timber",
    massKg: 0.7,
    slot: "back",
  },
  crate: {
    name: "Timber crate",
    family: "container",
    material: "timber/steel",
    massKg: 3,
    footprint: [1.2, 1.2],
    capacity: 12,
  },
  workbench: {
    name: "Workbench",
    family: "structure",
    material: "timber",
    massKg: 15,
    footprint: [2, 1.2],
  },
  forge: {
    name: "Forge",
    family: "machine",
    material: "granite/steel",
    massKg: 60,
    footprint: [2, 2],
    relevant: ["shipwright"],
  },
  shelter: {
    name: "Timber shelter",
    family: "structure",
    material: "timber/granite",
    massKg: 100,
    footprint: [3, 3],
  },
} satisfies Record<string, ItemDefinition>;
export type ItemId = keyof typeof CATALOG;
export const definition = (id: ItemId): ItemDefinition => CATALOG[id];
export type ItemInstance = {
  id: string;
  definitionId: ItemId;
  ownerId: "local-player";
  quantity: number;
  condition: number;
};
export type PlacedObject = { instanceId: string; x: number; z: number };
export type Recipe = {
  name: string;
  output: ItemId;
  quantity: number;
  resources?: { wood?: number; stone?: number };
  components?: Partial<Record<ItemId, number>>;
  station?: "workbench" | "forge";
  profession?: Profession;
};
export const RECIPES: Record<string, Recipe> = {
  hammer: {
    name: "Workshop hammer",
    output: "hammer",
    quantity: 1,
    resources: { wood: 1 },
    components: { iron: 1, bolt: 1 },
  },
  workbench: {
    name: "Workbench",
    output: "workbench",
    quantity: 1,
    resources: { wood: 3, stone: 1 },
  },
  axe: {
    name: "Timber axe",
    output: "axe",
    quantity: 1,
    resources: { wood: 2 },
    components: { iron: 1, bolt: 1 },
    station: "workbench",
  },
  pick: {
    name: "Quarry pick",
    output: "pick",
    quantity: 1,
    resources: { wood: 2 },
    components: { iron: 2, bolt: 1 },
    station: "workbench",
  },
  "work-clothes": {
    name: "Canvas work clothes",
    output: "work-clothes",
    quantity: 1,
    components: { cloth: 2 },
  },
  backpack: {
    name: "Canvas backpack",
    output: "backpack",
    quantity: 1,
    resources: { wood: 1 },
    components: { cloth: 2 },
  },
  crate: {
    name: "Timber crate",
    output: "crate",
    quantity: 1,
    resources: { wood: 2 },
    components: { bolt: 1 },
  },
  forge: {
    name: "Forge",
    output: "forge",
    quantity: 1,
    resources: { stone: 4 },
    components: { iron: 2 },
    station: "workbench",
  },
  shelter: {
    name: "Timber shelter",
    output: "shelter",
    quantity: 1,
    resources: { wood: 4, stone: 2 },
    station: "workbench",
  },
  bolts: {
    name: "Forge bolts",
    output: "bolt",
    quantity: 2,
    components: { iron: 1 },
    station: "forge",
    profession: "shipwright",
  },
};
export const SALVAGE: Record<
  string,
  { x: number; z: number; item: ItemId; quantity: number }
> = {
  "yard-bolts": { x: -11, z: 11, item: "bolt", quantity: 8 },
  "canvas-bundle": { x: -15, z: 11, item: "cloth", quantity: 8 },
  "metal-offcuts": { x: -15, z: 5, item: "iron", quantity: 10 },
};
export const itemCount = (
  items: ItemInstance[],
  id: ItemId,
  excluded = new Set<string>(),
) =>
  items
    .filter((i) => i.definitionId === id && !excluded.has(i.id))
    .reduce((n, i) => n + i.quantity, 0);
/** Material vocabulary stays separate from finishes and fastening methods. */
export const MATERIALS = [
  "timber",
  "granite",
  "steel",
  "stainless-steel",
  "brass",
  "hemp",
] as const;
export const TREATMENTS = ["pitch-sealed", "varnished", "waxed"] as const;
export const CONNECTIONS = ["bolted", "welded", "lashed", "stitched"] as const;
