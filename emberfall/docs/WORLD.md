# World: geography, navigation, settlements and trade

Status: design. The compass and bounds are implemented in `packages/world/compass.ts`.
The river network is in `packages/waterway`. Everything else is design only.

## 1. Geography

- The world is an **aquarium**: a large rectangular tank, filled with water to a waterline. Its footprint is a parameter (`WORLD` in `compass.ts`, currently ±10 km). The walls are the limit of the known world.
- The terrain is **stacked floods**. Each flood laid down a layer of ground, and the surface you see is the latest layer that has risen above the water. Older layers lie beneath, and the oldest is the pre-flood world. Water is the default, and land is any layer exposed above the current waterline.
- A very large black rock, the **lodestone**, stands at the centre (0, 0) as a tall pillar pointing up from the tank floor. It is the only source of magnetism. Its height is 60 m against a waterline of 40 m (`LODESTONE`, `WATERLINE`), so the top stands clear of the water as a dark island.
- Seen from above the pillar is a point. Navigation stays two-dimensional on the surface, and the height only decides whether the pillar is land.
- Space is Cartesian. The origin (0, 0) is the lodestone, and the tank is centred on it. Coordinates are metres on the surface. `x` runs east–west and `z` north–south, with +z as north. Height above the tank floor is a separate `y` axis, used only for the pillar and the waterline.

## 2. Terrain

| Class | Passable by | Notes |
| --- | --- | --- |
| Water | Craft, ships | The default. Depth matters: a ship needs more water than its draught. |
| Shallows | Craft only | Near the base of the pillar and along the walls, where the floor rises. |
| Land | Foot, cart | Any layer exposed above the current waterline. Pre-flood ground is land that a receding flood has uncovered; it may hold ruins and relics. Hosts villages and colonies. |
| Drowned ground | Craft, ships (carefully) | An older layer still under water. Shallow, and it may hide pre-flood ruins that can be reached by diving or salvage. |
| Shore | Foot and craft | Where land meets water. Landing points, and where cargo changes hands. |
| Wall | Nobody | The tank edge. Impassable. |

Depth is a property of the water, not a separate terrain class. A ship grounds in shallows and cannot cross them.

### Floods and the waterline

- The waterline is state, not a constant. Only the **architect** can raise or lower it.
- Each change is a recorded flood layer: from which level, to which, when, and by whom. Floods stack in order.
- Raising the waterline submerges land and can drown the pillar; lowering it exposes older ground again.
- **Wreckage:** a rising flood turns the ground it drowns into wreckage. Former land and whatever stood on it stay on the tank floor as a wreck record, covering the band between the old and new levels.
- A wreck can be **dived** only while water still covers some of it. Players can salvage each wreck once. Lowering the waterline leaves it above water as ruin, which can no longer be dived.
- Wreckage is where drowned pre-flood layers become salvage. Dive finds are the source of older relics.
- The architect's authority is a role check in the command, not a player choice. Players can only act on the world at the level it is set.
- Model: `packages/world/flood.ts` (`setWaterline`, `diveable`, `salvageWreck`, `isLandAt`, `pillarAboveWater`). Levels run from 0 to 120 m.

## 3. Hydrology

- **River:** a navigable reach in the waterway graph. In the aquarium, rivers are channels of deeper water through the shallows. It has a current and a length, and it carries ships.
- **Stream:** a small tributary reach. It can be crossed by craft in a fair current but does not carry a ship, and it feeds a river at a junction.
- A river that is closed (flood, silt, or a broken lock) becomes a reach with `open: false` and holds its cargo (see `DOMAIN_MODEL_RIVER.md`).
- Rivers and streams form the directed graph in `packages/waterway`. Water flows downhill from upstream to downstream.

## 4. Settlements

- **Village:** a small upstream settlement. It produces raw goods, needs food to stay populated, and has no recipes of its own. It can be founded on land next to a river or stream.
- **Greece:** the planned meeting place for alliances and important conversations. It lies on the far side of the lodestone from Ember Haven, so players sail past the rock and steer by the compass to reach it. The placeholder position is (1800, -2400) (`GREECE_PLANNED` in `src/App.tsx`).
- **Colony:** a larger settlement with recipes, reserves, contracts and a focus (see `COLONY_ECONOMY.md`). Colonies are the production centres of the river.
- **Self-sustaining colony:** a colony whose production covers its own consumption over one full cycle. It keeps its reserves above zero through the cycle, and it can export a surplus without drawing down its reserves. It does not need cargo from elsewhere to keep its population fed.

## 5. Vessels

- **Ship:** a large vessel, crewed, with a hull, sails and a helm. Only ships carry the full cargo hold and can cross the main river.
- **Craft:** a small boat, such as a skiff or coracle. It carries little, needs one crew member, and can use streams.

## 6. Navigation and the compass

- Every ship carries a compass that points to the lodestone, but the needle deflects by a local **deviation**. The deviation turns around the rock and fades with distance.
- The reading is the true bearing to the rock plus that deviation. Near the rock the reading can be far from true; far from it, the needle points true.
- Navigators correct for the deviation with a chart of reference points. That is a planned mechanic, not implemented yet.
- Model: `deviation(p) = A · sin(2φ) · e^(−r/L)`, where `r` is the distance from the rock, `φ` is the bearing from the rock, `A` is the amplitude (0.5 rad) and `L` is the falloff (2000 m). These are tunable.

## 7. Trade

- **Barter:** goods are exchanged directly for other goods, with no currency. An offer names what it gives and what it wants, and a counter-offer is a new offer.
- Offers are cargo commitments. Goods in an offer are reserved and cannot be spent elsewhere until the offer is accepted, cancelled, or expires. This matches the cargo offer rules already in the shared world.
- Settlements post standing wants (what they need) and standing offers (what they can spare). A barter closes when both sides' goods reach the destination.

## 8. Open questions

- The map's real size, and how much of it is mountain, land, and water.
- Depth of the open water away from the walls, and how far the shallows reach around the pillar.
- How many flood layers the tank holds, how far apart they are in height, and which one is the pre-flood surface.
- Whether the waterline rises and falls within an era, or only moves between layers.
- Who the architect is in the fiction and in play: a designer tool, an in-world role, or a player class with its own authority.
- Whether a flood can be undone without losing the colonies it drowned.
- How Plato's pre-flood knowledge is reached: by exposing older ground, by salvage on drowned layers, or both.
- Whether the lodestone's deviation should also depend on the ship's own iron, so that each ship's needle differs.
- Whether a craft can cross the open sea, or only rivers and streams.
- Whether the compass chart is an item to craft and carry, or a skill of the navigator's profession.
- The exact definition of a self-sustaining colony's cycle length.
