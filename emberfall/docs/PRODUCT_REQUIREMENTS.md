# Accepted direction and implementation backlog

This records decisions made after the 0.2.0 local slice. These are requirements,
not claims that the features are already implemented.

## Experience

Enshrouded-inspired original survival action RPG, experienced as a character.
SimCity-like colony production and development run beneath the inhabited world.
Rivers join villages, cities and colonies; docks visibly connect sea and land.
Pyramids are massive granite structures with gold apexes; water ionization is a
fictional game mechanic, not a claim about real-world physics.

## Inhabited ferry

Approximately 160m, four masts, ketch-inspired sail arrangement pending rigging
specification. Acts as a shared ferry and inhabited world entity. Small boat in
0.2.0 is only a movement prototype. Required: local ship coordinates, moving-deck
collision, boarding/exit transforms, crew permissions, passengers/cargo, persistent
identity, reconnect and cross-region transfer of attached entities.

Sail propulsion is the default. Players must construct a functioning diesel
system to obtain powered propulsion: engine components, fuel delivery, cooling,
lubrication, transmission, shaft and propeller. This progression is planned;
no complete engine simulator is promised for the first release without scope approval.

## Material and object model

Separate material, surface treatment, fastening and assembly. Examples: welded
steel hull/frames; timber decks/joinery; selected pitch/tar sealing; varnished
brightwork; waxed hemp sailcloth; brass instruments/fittings; stainless fasteners.
Not every surface receives every treatment. Models require metre scale, origins,
attachment points, visual/collision variants and versioned metadata. Fish,
shrimp, nets, tools, food, cargo and ship fittings belong in the extensible catalog.

## Professions and economy

Choose an initial profession; allow later learning. Sea roles include sailing,
navigation, fishing, salvage and transport; land roles include farming, quarrying,
metalworking, carpentry, weaving and warehousing. Shipwrights and dockworkers bridge
them. Everyone may collect a bolt; profession skill changes identification,
quality assessment and useful recipes. Salvage spawns should have plausible origins.

Cargo retains identity, quantity, owner, condition, origin and destination through
production -> village store -> dock -> ship -> dock -> consuming workshop/site.
Transfers must be atomic and retry-safe under server authority. Actual destination
demand and stock consumption underpin contracts; shipping the same crate in a loop
must not create rewards. Dock boards expose orders and regional projects.

## Regional leaderboards and monetization proposal

In-game watershed/coast/colony regions, profession-specific boards, separate
individual/crew/colony standings and seasonal versus lifetime records. Suggested
categories: provisioning, craftsmanship, navigation, exploration, stewardship,
defense/rescue. Rank verified useful work, with deduplication, reversal handling,
anti-collusion checks and auditable score events. No local-client official scores.

Proposal, not approved commercial configuration: base purchase, cosmetic catalog,
optional supporter presentation and eventual hosted worlds. Avoid paid competitive
advantages, productive materials, rank multipliers or paywalled scored contracts.
Prices, entitlements, payment provider, taxes and refund policies remain undecided.
No payment integration is included.

## Ordered implementation slices

1. Profession catalog, versioned items/materials and recipe dependencies.
2. Dock/warehouse/cargo ledger with atomic ownership transfers and work orders.
3. Shared-vessel reference frames and a scale-correct ferry collision fixture.
4. Authenticated room authority, save revisions and reconnect protocol.
5. Production/demand simulation and cross-colony shipment completion.
6. Authoritative contribution ledger and regional seasonal projections.
7. Published asset workflow, runtime verification, performance and recovery proof.

Use docs/HANDOFF.md for mandatory acceptance. Confirm large-vessel interior scope,
room population and release platforms before committing to a v1.0 date.
