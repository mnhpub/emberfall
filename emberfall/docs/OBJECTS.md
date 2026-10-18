# World objects, professions and crafting — 0.3.0

Implemented families: components, tools, wardrobe, containers, structures and a
simple machine. Natural resource nodes and vessels remain legacy scene/core
entities; creatures are encounter state. Full unification is future work.

Definitions carry material, mass, family, equipment slot, footprint, optional
capacity and profession relevance. Instances carry deterministic ID, owner,
quantity and condition; equipped and placed records reference that identity.
Material/treatment/connection vocabularies are separate. Specific treatments and
fastenings are not yet per-instance simulation. Asset geometry is placeholder.

## Demonstration

Choose shipwright (hammer), fisher (rod), provisioner (knife) or transport
(cargo hook). Choice is once per save; later skill learning is not implemented.
Every profession may collect bolts, canvas and metal stock from finite yard piles.
Read the on-screen directions; movement is WASD and I opens kit/workshop.

Gather timber and granite; collect metal, bolts and canvas; craft a workbench;
walk to clear western land around x=-18,z=10; equip a hammer; choose Place on land
and click within six metres. Placement rejects water, world bounds, village/dock
intersections, overlapping objects and a footprint covering the player.
Placed footprints obstruct foot movement. They are conservative boxes: the open
shelter cannot yet be walked through. Click recipes to craft near required stations.

A forge needs a workbench; a shipwright can use a placed forge to convert one
metal stock into two bolts. This is an immediate recipe abstraction, not a thermal
or manufacturing simulation. Craft axe/pick for finite-resource harvesting bonuses;
use wears them out. Other tools currently provide identity/equipment only.

Clothes change avatar color; backpack and hand equipment add placeholder meshes.
Backpacks have no capacity bonus yet. Crates have catalog capacity but no contents
or transfers. Pack nearby objects back into inventory. No fuel, building stages,
dismantling refunds, recipe time, protection stats, mass limits, fishing, cooking,
engine operation, multi-user ownership or trade yet.

## Saves

Keep localStorage key emberfall.maritime.v1 to discover existing saves. The JSON
payload is State version 2. Valid version 1 saves migrate by retaining voyage,
balances and colony progress, adding empty object state and no profession. Invalid
saves follow the previous visible fallback. Migration never grants salvage twice.
IDs, ownership, slots, finite salvage and quantity/condition ranges are checked.
This is local corruption screening, not a production authorization boundary.

See EVENT_ARCHITECTURE.md for aggregate and projection contracts and their limits.
