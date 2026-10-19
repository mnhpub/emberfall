# Domain model: river network, settlements, cargo and research

Status: design. Extends the aggregate table in `EVENT_ARCHITECTURE.md` and the
river plan in `DESIGN_RIVER_GREECE.md`. Nothing here is implemented yet.

## 1. Bounded contexts

| Context | Owns | Talks to |
| --- | --- | --- |
| Waterway | Reach status (open, closed by flood), current, junction topology | Logistics (routes), Vessel (current) |
| Logistics | Cargo lots, custody, transfers, junction holds | Waterway (routes), Settlement (stock) |
| Settlement | Stock, reserves, population, focus, recipes in use | Logistics (cargo in and out), Research (unlocks) |
| Research | Recovered writings, unlocked recipes and buildings, lore fragments | Settlement (recipe availability) |
| Vessel | Hull, crew, passenger attachment, ferry helm | Waterway (current), Logistics (ferry hold) |

The graph itself (settlements, junctions, reach geometry) is immutable reference
data, like `CATALOG` and `RECIPES`. Only the state on top of it is an aggregate.

## 2. Aggregates

Each aggregate has one owner, one identity, and a revision used for optimistic
concurrency. Each maps to one authority (Durable Object) so its transaction stays
local.

### Reach (Waterway)
- Identity: `reachId`.
- State: `status` (`open` | `closed`), `closedUntilTick`, `current` (m/s, signed
  along the reach).
- Invariants:
  - A closed reach accepts no vessel entry and no cargo departure.
  - Cargo already on a closed reach is held, never removed.
  - `closedUntilTick` is set only while `status` is `closed`.
- Commands: `CloseReach`, `ReopenReach`, `SetCurrent`.
- Events: `ReachClosed`, `ReachReopened`, `CurrentChanged`.

### Settlement (Settlement)
- Identity: `settlementId` (village or colony).
- State: `stock` per good, `reserves` per good, `population`, `focus`, `unlocked`
  recipe set (copied from Research as facts, not read live).
- Invariants:
  - Stock is never negative and never drops below its reserve through a recipe.
  - Only one focus at a time.
  - Recipes run only if their unlock event has been recorded.
  - Population stays within the settlement's capacity.
- Commands: `ContributeStock`, `LoadStock`, `SetFocus`, `StartBatch`,
  `ApplyUnlock`.
- Events: `StockContributed`, `StockReleased`, `FocusChanged`, `BatchProduced`,
  `RecipeEnabled`.

### CargoLot (Logistics)
- Identity: `lotId`.
- State: `quantity`, `good`, `custodian` (a vessel, a settlement, or a junction),
  `transfer` (`none` or a pending transfer with `transferId`, source, destination).
- Invariants:
  - Exactly one custodian at any time.
  - Quantity is conserved across every transfer.
  - A lot in transfer is not counted in any settlement's available stock.
  - A transfer completes once; a repeated `transferId` returns the recorded outcome.
- Commands: `DepositAtJunction`, `BeginTransfer`, `AcceptTransfer`,
  `CancelTransfer`, `ReleaseToSettlement`.
- Events: `CargoDeposited`, `TransferBegun`, `TransferAccepted`,
  `TransferCancelled`, `CargoReleased`.

### Junction hold (Logistics)
- Identity: `junctionId`. The aggregate is the set of lots held at that junction.
- Invariants: a held lot is in custody of that junction and no other; capacity is
  bounded; a lot leaves only through `BeginTransfer`.
- Commands: `DepositAtJunction` (creates a hold), `BeginTransfer` (removes from hold).
- This is a small aggregate and exists so that holds are capacity-checked in one
  place rather than summed across lots.

### ResearchArchive (Research)
- Identity: `archiveId` (per player in a private expedition, per room in a shared
  colony).
- State: `recovered` writings, `unlocks` granted, `fragments` revealed.
- Invariants:
  - A writing unlocks at most once.
  - A fragment is revealed once and carries no mechanical effect.
  - An unlock is recorded only after its writing is recovered.
- Commands: `RecoverWriting`, `RevealFragment`.
- Events: `WritingRecovered`, `RecipeUnlocked`, `FragmentRevealed`.
- Settlement learns of an unlock through its own `ApplyUnlock` command, which
  Research triggers. Research never writes Settlement state directly.

### Vessel (Vessel)
- Unchanged from the existing vessel model. It reads current from Waterway and
  never writes to it. Passenger attachment and helm lease stay here.

## 3. Commands

Every command carries the envelope from `EVENT_ARCHITECTURE.md`: `commandId`,
`actorId` (from the gateway), `aggregateId`, `expectedRevision`, and a schema
version. A command that fails validation appends no event.

Examples, grouped by aggregate:

- Reach: `CloseReach { reachId, untilTick, cause }`, `SetCurrent { reachId, current }`.
- Settlement: `StartBatch { settlementId, recipeId }`, `SetFocus { settlementId, recipeId }`.
- CargoLot: `BeginTransfer { lotId, transferId, to }`, `AcceptTransfer { transferId }`.
- ResearchArchive: `RecoverWriting { archiveId, writingId }`.

## 4. Events

Events are facts and are past tense. They carry the aggregate ID, the revision
they produce, and a causation ID that points at the command that caused them.
Only accepted events are persisted. Consumers deduplicate on event ID.

Two cross-context flows are sagas, not single transactions:

1. **Cargo to a settlement.** `BeginTransfer` (Logistics) → `TransferBegun` →
   the destination settlement's `AcceptTransfer` → `TransferAccepted` → the
   source lot is released. A cancel path returns the lot to its source. Goods are
   unavailable to settlements while the transfer is pending.
2. **Writing to a recipe.** `RecoverWriting` (Research) → `WritingRecovered` →
   `ApplyUnlock` (Settlement) → `RecipeEnabled`. If the second step fails, the
   recovery stays recorded and the unlock is retried; it is never lost.

## 5. Projections

Projections are read models rebuilt from events. Each one stores its checkpoint
(last applied event sequence) and applies its updates atomically with that
checkpoint.

| Projection | Built from | Serves |
| --- | --- | --- |
| RouteTable | Reach status and current, graph | Ferry planning, route ETAs |
| JunctionBoard | Junction hold, CargoDeposited, TransferBegun | Lots waiting at each junction |
| SettlementPanel | Settlement, BatchProduced, StockReleased | Stock, reserves, blockers |
| DownstreamField | Settlement positions, Reach status | Replaces `waterField`: counts settlements reachable downstream |
| ResearchLog | ResearchArchive events | Recovered writings and lore fragments |
| ManifestOfVessel | CargoLot custody, Vessel boarding | Ferry hold contents |

Rules:
- A projection never writes to an aggregate. Commands are the only way to change
  state.
- A projection can be dropped and rebuilt from the event stream.
- Projections are eventually consistent with the aggregates. The UI shows the
  revision it was built from, so a player never acts on a stale view silently.

## 6. Relation to current code

- `waterField(s, z)` is an ad-hoc projection over two colonies. `DownstreamField`
  replaces it when the network arrives.
- `ColonyId = 'haven' | 'aurum'` becomes a `settlementId` drawn from the graph.
- `restore()` currently requires exactly two colonies. A save migration moves it
  to the Settlement aggregate with state copied per settlement; existing haven and
  aurum state keeps its values.
- The economy's `ProductionBatch`, `ContractCompleted`, and related events map
  onto Settlement and CargoLot events. They are not renamed in the first phase.

## 7. Review checklist

- Each invariant names the aggregate that enforces it. No invariant spans two
  aggregates without a saga.
- No aggregate depends on another's live state. Cross-aggregate facts arrive as
  events.
- Reach and Settlement are small, so each fits one authority.
- Junction hold is kept separate from CargoLot so capacity is checked in one place.

## 8. Open questions

- Junction capacity: a fixed number of lots, or a volume limit?
- Whether a closed reach should hold cargo on the vessel or push it back to the
  last junction.
- Whether a shared-room expedition has one ResearchArchive for the room or one
  per crew member.
