# Contribution standings — v0.9

Shared rooms expose a rebuildable read projection of accepted `OrderFulfilled`
custody events. No new score command, score database or cross-room write exists.
The Worker supplies room identity, actor records and retained journals. The same
transaction that accepts a delivery persists its character journal and receipt;
standings are rebuilt on reads and checked before committing command drafts.
Offline and private-authority reputation never enters shared standings.

Each fact is identified by JSON tuple [room, actor, cargo event sequence]. Exact
repeats deduplicate; conflicting identity content rejects. Fixed order catalog
checks enforce destination, good, integral quantity, reward and aggregate demand.
Current room demand bounds points at 100. Custody acceptance, production, stock
release, contributions, gathering and crafting earn no standings points. Credit
belongs to the player fulfilling the delivery, even after another player supplied
or transported its materials. This is a delivery metric, not a measure of all work.

Tables aggregate players, fixed starting professions and receiving colonies. Ties
share competition rank (1,1,3); IDs break display ties deterministically. Missing
historical professions remain unattributed. Profession is immutable in current
characters: changing that rule requires event-time attribution before respecs.
No timestamp or historic profession is fabricated. Existing rooms rebuild directly
from their retained authoritative journals; no extra material, population or
reputation rewards are replayed. Storage schema and protocol remain unchanged.

`scope=room-preview`, `season=preview-1`, `official=false` are explicit. This is
one watershed room's preview, not an official regional season. Manual tokens,
room resets and actor creation are not governed enough for cross-room competition.
Before official rankings: public identity and account eligibility; immutable
region/season membership; reset exclusion; event-time attribution; archival and
rebuild verification; moderation and compensating corrections; season closure,
late-event and tie policy; privacy review of public actor IDs; measured capacity.
There is no operator reversal API, recurring market, season scheduler, prize,
payment, cross-room aggregation or paid score advantage in this release.
