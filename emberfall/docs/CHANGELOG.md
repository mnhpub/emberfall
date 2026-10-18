# 0.8.0 — finite colony production and shipment contracts

- Four bounded production recipes with finite reserves, labor and focus pacing.
- Explicit one-time contract progress, settlers and production unlocks.
- Atomic carried contributions and colony stock release into owned cargo.
- In-place economy migration that preserves prior fulfillment without bonus replay.
- Real browser two-way voyage, production, lost acknowledgement and restart proof.

# 0.7.0 — shared colony rooms, crew and cargo consent

- Separate room authority with common finite resources, colonies and one ferry.
- Private character records, public crew/structure projections and owner collision checks.
- Expiring exclusive helm leases and reconnecting deck-local passengers.
- Accepted cross-player custody, condition/provenance, common capacities and demand.
- Two-client actual workerd/SQLite browser checks including restart and crew sailing.

# 0.6.0 — private authority and reconnect foundation

- Signed short-lived actor/room credentials and an operator issuance utility.
- Transactional authoritative game snapshots, bounded command schemas and ordering.
- Persistent client outbox, retry after lost acknowledgement, conflict reconciliation.
- Opt-in 3D online play isolated from local saves; shared co-op remains pending.
- Authority tests and a real local Worker/SQLite browser smoke target.

# 0.5.0 — large ferry and moving frames

- 160m four-masted offshore ferry with original placeholder steel/timber geometry.
- Persistent vessel pose, sail state, speed and one passenger reference frame.
- Deck bounds, mast/cabin collision, gangway boarding, helm and coasting controls.
- Offshore pier/shuttle and expanded ocean; legacy village and trade routes remain.
- Independent 96-unit ferry custody endpoint with stopped-vessel handling checks.
- Vessel overview camera, State v4 migration and transform/navigation tests.
- No multiplayer or hydrodynamics claim; details in FERRY.md.

# 0.4.0 — dock cargo and demand-backed deliveries

- Local custody aggregate: stable lots/root provenance, warehouses, ship and crates.
- Quantity-conserving partial transfers, capacity/range checks and unassigned reclaim.
- Order reservations, source/destination constraints, consumed deliveries and local points.
- Accepted cargo events, revision checks, persistent receipt deduplication and replay.
- Immediate device commit with rollback on save failure; v1/v2 saves migrate to v3.
- Two-way river trade and additional test/browser coverage.
- Movement avoids cloning the economic journal each frame.

# 0.3.0 — world objects and professions

- Four starting professions with one owned starter tool and duplicate-choice guard.
- Shared catalog, material/treatment/connection vocabulary and stable item IDs.
- Finite salvage, crafting costs, station proximity and profession requirements.
- Equipment slots, wardrobe/backpack visuals, axe/pick harvesting and tool wear.
- Placeable workbench, forge, crate and shelter with land/overlap/range checks.
- Working forge recipe; packing; conservative placed-object movement collision.
- Read models for inventory and recipes; versioned economic command/event adapter
  with optimistic revision checks and event replay, not durable persistence.
- Existing voyage save migration from State v1 to v2.
- Chromium smoke, additional core tests and ordered PR documentation.

# 0.2.0 session changes

- Replaced the active land demo with maritime/river/colony placeholder gameplay.
- Added pure shared command transitions and versioned browser persistence.
- Finite resources, movement boundaries, proximity checks, ship damage/repair,
  cooldown-based beast encounter, wreck cargo and one-time delivery.
- Two colony ledgers, granite pyramid tiers/gold apex and downstream field.
- DXF upload/review/local preview through a loopback processing service.
- Limited geometry refinement, GLB writer and hashes/quality reports.
- Optional Blender post-process and Python Worker coordinator scaffolds.
- Correct room identifier parsing and stale-presence counting/deletion.
- Persistent APIs disabled by default; single-operator staging auth/ownership
  gate, actual bounded body reads and display-name type validation.
- npm lockfile, resolved unavailable dependency, Make targets, backend type-check,
  tests, CI and explicit handoff/operations/acceptance documents.
- Tauri version/commands updated to npm; native runtime remains unverified.

No deployment, production authentication, cloud synchronization, server-authoritative
multiplayer, full CAD import, full mesh LOD pipeline or native release completed.

## 0.9.0

Rebuildable shared-room delivery standings by player, profession and receiving colony; duplicate/conflict checks and deterministic tied ranks. Explicit preview eligibility. No official regional season or payments.
