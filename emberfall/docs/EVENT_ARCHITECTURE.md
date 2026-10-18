# Hybrid command / event / projection architecture

Current authority/custody is documented in SHARED_WORLD.md. COLONY_ECONOMY.md
adds a bounded production/contract audit and transactional colony-stock release.
Signed actor/room access, persistent outboxes and cross-owner consent now work
locally. Public identity, full-world replay and deployed operation remain open.

The character adapter below is the original 0.3 prototype; its separate event
stream still does not capture every gameplay action.

## Original character adapter

- CATALOG / RECIPES / PROFESSIONS are immutable reference definitions.
- State v2 holds the local character, items, balances, equipment and placed refs.
- ObjectCommand describes intention; objectTransition validates the action.
- packages/protocol/economy.ts wraps economic commands with actor, command ID and
  expected revision, emitting named economic events with replayable deltas.
- EconomicSnapshot and project() rebuild the economic view at a sequence.
- inventoryProjection, recipeProjection and craftBlockers supply UI read models.
- UI currently calls local transition directly and saves snapshots. It does NOT
  append every action through the protocol adapter. Revisions in adapter tests
  are caller-supplied; no persisted deduplication or concurrent-writer guarantee.

The local event adapter covers profession, collection, crafting, equipment,
placement and packing. Gather wear, legacy material collection, combat, colony
production and ship actions are not yet covered by that economic stream. Do not
claim whole-world replay from the provided events.

## Target aggregate boundaries

| Aggregate | Invariants | Examples of commands/events |
| --- | --- | --- |
| Character inventory | Item ownership, balances, valid slots, recipe debits | CraftItem -> ItemCrafted; EquipItem -> EquipmentChanged |
| World object | Placement, condition, operator permission, active job | PlaceObject -> ObjectPlaced; StartMachine -> ProductionStarted |
| Cargo custody | Exactly one custodian, bounded quantity, no duplicate transfer | TransferCargo -> CargoTransferred |
| Vessel | Hull, equipment sockets, crew roles, passenger attachment | BoardVessel -> PassengerBoarded |
| Colony work order | Demand, reservation, fulfillment and reward once | FulfillOrder -> OrderFulfilled |
| Seasonal contribution | Accepted economic fact, attribution, reversal | RecordContribution -> ContributionRecorded |

These are proposed production roots. Current placed objects still belong to the
local character snapshot; splitting them requires a transfer protocol, not simply
putting two writes into unrelated Durable Objects.

## Command envelope

commandId, authenticated actorId, aggregateId, expectedRevision, command schema
version, correlationId/causationId and payload. Only a trusted gateway derives
actor/permissions. Local actor is deliberately fixed to local-player.

Server path: authenticate -> locate authority -> load version -> deduplicate
command -> validate -> decide events -> atomically append events, update snapshot
and insert outbox records -> acknowledge. Rejected commands append no economic
success event. A duplicate command returns its recorded outcome, not a second debit.
Version conflicts trigger a fresh read; never blind retry a stale decision.

## Storage design

One bounded authority can use SQLite-backed Durable Object storage for its event
stream, snapshot, command receipts and outbox in one local transaction. CF supports
storage transactions; this does not supply distributed transactions across objects.

Suggested local tables (design, not applied migration):
- events(aggregate_id, sequence, event_id, command_id, type, schema_version, data)
- snapshots(aggregate_id, revision, schema_version, data)
- command_receipts(actor_id, command_id, request_hash, outcome)
- outbox(event_id, destination, payload, attempts, delivered_at)

Unique (aggregate_id,sequence), event_id, and receipt keys. Match reused command
IDs against the original request hash. Persist only accepted, schema-validated
events. Publisher delivers at least once; consumers deduplicate by event ID and
advance checkpoints after applying projections atomically.

Reference: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

## Transfers

Prefer a single cargo-custody authority for a shipment's ownership transition.
If two authorities must participate, use reservation/escrow with transfer ID,
source acknowledgement, destination acceptance and explicit compensation/recovery.
Keep goods unavailable while in transit; never announce completion after only one
side commits. Test crashes and retries at every boundary before enabling trade.

## Projections

Inventory, equipment, available recipes, station status, dock manifests, colony
stock, seasonal boards and asset review queues are read models. Inventory decisions
must consult authoritative state, not a stale leaderboard or warehouse view.
Regional leaderboard updates consume verified fulfillment events, deduplicate,
and process reversals. Personal/crew/colony scores remain separate projections.

## Transient simulation

Do not append every rendered frame. Keep camera, wave and animation state local.
Server movement/combat may run transiently at a measured tick rate; checkpoint
positions and record consequential changes at explicit boundaries. Define maximum
lost progress before promising recovery objectives. Event schema upgrades and
snapshot migration are separate from application version numbers.
