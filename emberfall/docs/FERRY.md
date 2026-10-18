# Large ferry and moving reference frames — 0.5.0

## Implemented

Endurance is a 160m-long, 21m-beam, four-masted placeholder vessel with a steel
hull, timber deck, brass-toned fittings and set/furled canvas. This is a
ketch-inspired visual direction, not a finalized sail plan or engineering design.
The original Wayfarer skiff, cargo routes and village objects remain intact.

The ferry cannot fit the 8m prototype river. It starts offshore at (120,180),
alongside a small island/pier. World bounds are ±500m; the original coast and
river occupy the same coordinates. A free local shuttle connects Haven dock to
the offshore pier. This explicit convenience transfer is not vessel movement.
The skiff can also sail there via the open sea south of the village.

## Controls

Open the ferry controls on the right (scroll if necessary).

1. At Haven dock, click Shuttle: Haven ↔ ferry pier.
2. Click Board Endurance ferry. Boarded position is vessel-local (-9,0).
3. WASD/arrows walk on the moving deck. A conservative boundary follows the
   tapered hull; masts and cabin walls obstruct walking.
4. Walk to x=3,z=35 locally, then x=0,z=35, avoiding the mast at z=18.
5. H or Take ferry helm attaches you to the helm. Set sails; W gathers way,
   S brakes, A/D steer. There is no reverse engine propulsion.
6. H releases the helm. The ferry coasts independently while you walk.
7. The cabin's front doorway is (0,53). Approach via (3,52), then (0,52) to
   pass the mast at z=50. Its roof is omitted for a cutaway interior view.
8. To exit, stop and return to the port gangway (-9,0). The pier must be aligned,
   or the skiff must be alongside. Open-water disembarking is rejected.
9. Vessel overview shows the whole craft; Follow player restores the close view.
   Sails fade in deck view to keep the player visible. The follow camera rotates
   with the ship; overview keeps an external world view.

Heading zero points the bow north (world -Z). Position and heading in the panel
help return to the pier at (120,180), heading 0°. Dock alignment tolerance is
1.5m and about 1.7°; boarding/handling requires speed below 0.1m/s.

## Reference frames and collision

packages/vessels contains metre-based vessel geometry, rigid transforms and
walkable/blocked footprints. Local X is starboard, local -Z is forward. A yaw
rotation maps local to world; the inverse transform is tested across headings.
The attached passenger keeps a local pose; world position is derived whenever
local movement, ship translation or heading changes. Rendered actor height and
rotation use the same vessel frame.

The helm and deck are separate passenger stations. Only the helm can propel,
steer or change sails. Leaving it does not freeze the ship. Camera, animation
and simulation inputs are separate from persistent passenger identity.

Navigation uses a conservative 160×21m rectangular hull with sampled edges and
interior points against land/world bounds, plus skiff exclusion. A failed step
stops the vessel. This is not a swept rigid-body collision solver, grounding
model or validated navigation mesh. Player walking uses a tapered footprint,
mast discs and axis-aligned cabin walls; it has no stairs or multi-deck physics.

Sailing is kinematic: sails permit acceleration up to 12m/s, braking/furling
slows motion and turning depends on speed. No wind direction, trim, lift,
ballast, waves, buoyancy or seakeeping is simulated. Frame dt is capped at 0.1s;
there is no offline catch-up or authoritative network tick.

## Cargo and saves

The ferry adds a 96-unit custody endpoint at its port gangway; it is separate
from the skiff's 24 units. Stop alongside the skiff to hand cargo between them.
Existing lot IDs, roots, receipts and order constraints are retained. The large
hull cannot deliver directly inside the narrow river; use the skiff as a lighter.
No new warehouse or production freebies are created by visiting the pier.

State v4 stores the ferry pose, speed, sail state and one passenger attachment.
Valid v1/v2/v3 saves preserve prior progress and receive a fresh stopped ferry.
The original localStorage key remains unchanged. Invalid attachments, positions,
speeds or hull locations are rejected on restore. Cargo continues immediate
snapshot commits; walking/sailing use the existing periodic autosave.

This is a single-player reference-frame foundation. Multi-player crews,
authoritative ferry ownership/permissions, passenger reconnect/cross-region
handoff, physics, multiple deck levels, detailed rigging, authored DXF assets,
ship construction/damage and diesel machinery remain future work.
