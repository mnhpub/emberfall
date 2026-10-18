# World: geography, navigation, settlements and trade

Status: design. The compass and bounds are implemented in `packages/world/compass.ts`.
The river network is in `packages/waterway`. Everything else is design only.

## 1. Geography

- The world is an **aquarium**: a large rectangular tank, filled with water to a waterline. Its footprint is a parameter (`WORLD` in `compass.ts`, currently ±10 km). The walls are the limit of the known world.
- Water is the default. Almost the whole surface is navigable water, and land exists only where something breaks the surface.
- A very large black rock, the **lodestone**, stands at the centre (0, 0) as a tall pillar pointing up from the tank floor. It is the only source of magnetism. Its height is 60 m against a waterline of 40 m (`LODESTONE`, `WATERLINE`), so the top stands clear of the water as a dark island.
- Seen from above the pillar is a point. Navigation stays two-dimensional on the surface, and the height only decides whether the pillar is land.
- Coordinates are metres on the surface. `x` runs east–west and `z` north–south, with +z as north. Height above the tank floor is a separate `y` axis, used only for the pillar and the waterline.

## 2. Terrain

| Class | Passable by | Notes |
| --- | --- | --- |
| Water | Craft, ships | The default. Depth matters: a ship needs more water than its draught. |
| Shallows | Craft only | Near the base of the pillar and along the walls, where the floor rises. |
| Land | Foot, cart | Only above the waterline: the top of the lodestone and any islands. Hosts villages and colonies. |
| Shore | Foot and craft | Where land meets water. Landing points, and where cargo changes hands. |
| Wall | Nobody | The tank edge. Impassable. |

Depth is a property of the water, not a separate terrain class. A ship grounds in shallows and cannot cross them.

## 3. Hydrology

- **River:** a navigable reach in the waterway graph. In the aquarium, rivers are channels of deeper water through the shallows. It has a current and a length, and it carries ships.
- **Stream:** a small tributary reach. It can be crossed by craft in a fair current but does not carry a ship, and it feeds a river at a junction.
- A river that is closed (flood, silt, or a broken lock) becomes a reach with `open: false` and holds its cargo (see `DOMAIN_MODEL_RIVER.md`).
- Rivers and streams form the directed graph in `packages/waterway`. Water flows downhill from upstream to downstream.

## 4. Settlements

- **Village:** a small upstream settlement. It produces raw goods, needs food to stay populated, and has no recipes of its own. It can be founded on land next to a river or stream.
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
- Whether the lodestone's deviation should also depend on the ship's own iron, so that each ship's needle differs.
- Whether a craft can cross the open sea, or only rivers and streams.
- Whether the compass chart is an item to craft and carry, or a skill of the navigator's profession.
- The exact definition of a self-sustaining colony's cycle length.
