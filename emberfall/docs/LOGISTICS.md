# Dock cargo and demand-backed trade — 0.4.0

0.8 update: colony stock release appends `ColonyStockReleased` with a common
stock debit and a new owned warehouse lot in one room transaction. Contributions
and production do not grant delivery credit; COLONY_ECONOMY.md covers contract
completion, reserve limits and migration.

0.6 update: AUTHORITY.md describes reuse of this aggregate inside a private
actor/room Durable Object. Online inventory, journal and receipt changes commit
together. Shared cross-player custody remains unimplemented. The local workflow
and tests below still apply to offline play.

## Play

Press L or open Dock ledger & cargo. The ledger provides quantity, carried-supply,
warehouse and transfer controls plus manifests, work orders and recent events.

1. Choose a profession and gather 6 timber at Haven.
2. At Haven dock (-7,13), select wood, quantity 6, and deposit.
3. Assign the lot to aurum-timber; transfer it to the ship.
4. Board, sail north to z=-19, then approach the east bank at x=3.
5. Open the ledger; choose Aurum warehouse, transfer 6, then fulfill 6.
6. Deposit 4 carried food at Aurum, assign haven-provisions, load the ship,
   return to the western Haven dock and unload/fulfill.

The initial food is the player's existing provision stock, not free warehouse
production. Warehouses start empty. A delivery consumes cargo and credits the
receiving colony stock plus bounded local contribution points. Total accepted
demand is fixed at 6 timber and 4 food; moving goods in circles earns nothing.
Official leaderboards and multiplayer scores are not connected.

Unassigned supplies can be reclaimed into inventory near the custodian. Consigned
supplies cannot be reclaimed to bypass reservations. Placed crates accept 12 units
and cannot be packed with contents. Tools and wardrobe are not cargo goods yet.

## Aggregate and invariants

packages/logistics owns local lots, orders, revisions, events and command receipts.
A lot retains ID, root provenance, quantity, good, owner, condition, first-deposit
origin, optional destination/order, ship-handling flag and current custodian.
Partial operations retain the original remainder and allocate a new lot with the
same root. A lot has exactly one custodian; manifests derive from current lots.

Supported goods: wood, stone, gold, food, bolts, canvas and metal stock. Capacity is
abstract handling units, not a realistic mass/volume/load-plan model: warehouses
128, prototype ship 24, crate 12. Actor and both endpoints must be within 6m for a
handoff; warehouses cannot teleport goods across the watershed. First-deposit
origin is NOT proof of the material's production site; future production lots
must supply that provenance before competitive scoring.

Component deposits conservatively retain the lowest condition among matching
carried components; reclaim preserves that condition. There is no quality upgrade
from storage. Resource counters themselves have no per-unit condition model.

Orders reserve existing suitable cargo at their source warehouse and cannot be
overbooked. Fulfillment requires the right good, source, destination warehouse,
condition >=50 and recorded ship handling. Cargo is consumed; partial fulfillment
updates remaining demand. Retries cannot consume or reward twice.

## Commands, events and projections

Envelope: commandId, expectedRevision, command. Commands: deposit, withdraw,
transfer, consign and fulfill. Events: StockDeposited, StockWithdrawn,
CargoTransferred, CargoConsigned and OrderFulfilled.

execute() checks receipts before revision conflicts: exact retry returns the
stored acceptance without a second change, while the same ID/different normalized
payload fails. New commands must match the current revision. Rejected commands
append nothing. reduceCargo()/replay() rebuild custody, orders and local points.
Receipts and events persist in the same versioned device snapshot as effects.

The core adapter applies carried debits/credits and colony credits together with
the custody event to one cloned State. The browser writes that complete snapshot
synchronously before accepting a cargo change; quota/unavailable-storage failure
rolls back to the prior state. This is one-device commit containment, not a
cross-device database transaction. Other gameplay still uses periodic autosave.
Only the cargo subdomain is replayable from this stream; it is not whole-world
replay or an official anti-cheat authority.

## Bounds and recovery

Maximum 256 live lots and 512 accepted cargo events per local expedition. Receipts
are never evicted silently. At the event limit, new operations fail closed while
old command retries remain recognizable. Production requires durable storage,
snapshots, archival and a defined deduplication lifetime; no compaction is supplied.
Current recovery is restore the full device snapshot; inspect recent events and
raw export before resetting. Invalid ledger/projection consistency fails restore.
No claim of cryptographic tamper evidence: users can edit device saves.

State v1/v2 saves migrate to v3, retaining voyage, materials, colony and object
progress while creating an empty custody ledger. Existing progress is not claimed
as past shipments. The legacy ship.cargo.relic quest remains separate from freight;
its quantity does not count toward the freight handling limit yet.

## Deferred production work

Authenticated actors and custody permissions; server storage/transaction adapter;
command receipts/outbox in a durable transaction; network reconnect and stream
catch-up; cross-authority escrow; cancel/release reservations; theft/damage/spoilage;
production provenance; labor and dynamic demand; mass/volume limits; custody for
individual equipment and passengers; regional score publication and reversals.
No cloud economy or production event store has been deployed.
