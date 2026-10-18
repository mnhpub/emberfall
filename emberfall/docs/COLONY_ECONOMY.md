# Colony production and contracts — 0.8.0

Shared colony rooms now have a bounded production economy. The two existing
shipment orders become explicit colony contracts with progress, reservations,
in-transit quantities, completion records and one-time benefits. This slice uses
two fixed contract templates; automatic recurring demand, pricing and an open
market are not implemented.

Private/offline expeditions retain their previous scripted colony behavior.
Shared rooms replace those scripted food/stone/gold increments with the production
rules below. No client save or client-supplied yield enters authoritative state.

## Production catalog

One cycle is ten active authoritative room ticks. Each colony can run at most one
batch of a given job per cycle, with at most `floor(population / 8)` successful
jobs, capped at three. The chosen focus gets first consideration; blocked jobs
leave labor available to the next eligible job. Focus changes require proximity
to the colony warehouse and are limited to once per ten active ticks.

| Job | Colony | Inputs per batch | Output per batch | Finite reserve debit | Unlock |
| --- | --- | --- | --- | --- | --- |
| Managed timber camp | Haven | 1 food | 2 wood | 2 of 40 timber units | Haven provisioning contract |
| River gardens | Aurum | 1 wood | 4 food | 1 of 24 harvest charges | Available initially |
| Granite quarry | Aurum | 1 food | 2 stone | 2 of 64 granite units | Available initially |
| Gold washing | Aurum | 2 food | 1 gold | 1 of 4 gold units | Aurum timber contract and active gold apex |

These are abstract prototype recipe/handling units, not physical mass calculations.
The finite reserves are separate from the original gatherable world nodes. Input,
reserve, labor or output-capacity shortages skip the entire batch without partial
consumption. Stocks remain whole nonnegative units capped at 100,000 per good.
Production cannot reset or replenish reserves, multiply when another player joins,
run twice at a cycle boundary or catch up disconnected time. Additional inputs can
keep eligible jobs supplied but cannot revive exhausted reserves.

Production represents population labor as a batch budget; there are no rendered
worker NPCs, pathfinding, wages, individual job assignments, residential maintenance,
famine/death, facility construction or autonomous colony expansion in this slice.
The apex requirement is a fictional gameplay rule, not water-treatment physics.

## Contract lifecycle and benefits

`aurum-timber` requires six Haven-origin wood shipped to Aurum. Completion adds
two Aurum settlers and unlocks gold washing. `haven-provisions` requires four
Aurum-origin food shipped to Haven. Completion adds two Haven settlers and unlocks
the managed timber camp. Existing custody rules enforce source, quality,
reservation, shipping and destination before accepting supplies.

Progress is derived from all character cargo journals in the room. The projection
shows open, reserved, in-transit, partial or completed status. Reservation plus
fulfillment remains bounded by actual room demand. Consented handoffs preserve
source/condition and reservations. The captain completing a shipment gets the
existing delivery contribution points; the common colony receives the supplies.
Contributing carried supplies, claiming colony stock and running production grant
no additional delivery points.

On final fulfillment, the same transaction appends one `ContractCompleted` audit
record and stores the completion actor/tick before granting the settlers. Repeated
or lost acknowledgements cannot grant a second benefit. Population remains within
the shared state bounds. Contracts are not regenerated after completion. Official
regional/seasonal leaderboards remain queue item 07.

## Warehouse commands and projections

Open **Colony production & contracts** in a shared room. Inspect contract progress,
colony stocks, reserves, job inputs/outputs, batch totals and blockers. Approach the
chosen colony warehouse within six metres, choose a profession, and use:

- `colony-contribute`: transfer 1–32 carried wood/stone/gold/food into common stock.
  The character debit, colony credit and audit record commit together. This does
  not satisfy a shipping contract or grant delivery credit.
- `colony-load`: release 1–32 common-stock units into a new owned lot at that
  warehouse. The common-stock debit, `ColonyStockReleased` custody event, lot and
  audit record commit together. Stock is not placed in carried inventory. Use
  the dock ledger to consign, load a vessel, transfer, fulfill or reclaim it.
- `colony-focus`: select a catalog job belonging to that colony. It changes
  scheduling priority, never production timing, yields or reserve balances.

Both stock commands enforce current balances and room-wide warehouse capacity.
Claiming the last unit is serialized across actors. All members with a profession
may handle common stock; there is no allocation quota, mayor role or moderation
policy yet. Cargo in personal/reserved lots is separate from common colony stock;
production does not consume it. Components and relics are not colony stock goods.

## Persistence, audit and migration

`world.economy.version = 1` is added to the existing SharedWorld record. No new
Durable Object class or namespace migration is required beyond the existing v3
shared-world binding. A room without the economy field receives the new finite
reserve catalog and a production baseline at its current tick in a transaction.
Current stocks, resource nodes, characters, cargo, contributions and fulfillment
are retained. Fully completed older contracts are marked imported with no new
settlers or completion credit. Partial older contracts stay open and earn their
benefit only when their final units are delivered after the upgrade.

New clients require economy-view version 1 before publishing a shared snapshot.
Deploy the compatible server before the new client. An unknown/corrupt economy
version fails closed; it is not silently reset. Private mode remains compatible.
Future changes to recipe/reserve semantics require explicit economy-version
migration because audit validation uses the immutable version-1 recipe catalog.

A bounded audit records production batches, focus changes, contributions, colony
stock releases and contract completions. Validation checks event order, unique
job/cycle batches, reserve/counter reconciliation, focus pacing and completion
identity. This audit is not a complete replay of all colony stock history: cargo
journals separately record deliveries/custody, and a migration checkpoint retains
prior stock. Movement and ordinary world state remain snapshots.

The audit reserves two slots for the two contract benefits. At 254 ordinary audit
records, further production, focus changes and stock handling pause; the two
one-time completions may still bring the audit to 256. Existing cargo journal,
lot, room and serialized-value limits also remain in force. No provenance or
receipt is dropped to make space. Archival, quotas, retention and operator
maintenance remain required before public operation. Reaching an audit boundary
is intentional fail-closed behavior, not automatic expedition reset.

The existing room transaction commits the economy, common stocks, changed
characters and caller receipt together. A character-write failure after the common
stock debit rolls back everything. See VALIDATION_0.8.md for actual browser and
local workerd/SQLite proof, including a full two-way contract voyage, production,
lost stock-release acknowledgement and restart recovery. No cloud deployment,
eight-player load result or receiving-team sign-off is claimed.
