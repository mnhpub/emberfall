# Shared colony world, crew control and accepted cargo handoffs (0.7.0)

Base: `codex/world-authority` at `4c0d18d`. Merge after queue item 05a.
No remote PR exists until authenticated publication succeeds.

Private expeditions previously gave each actor independent resources and a ferry.
A separate SharedWorld namespace now serializes common resources, colonies, beast
state and one crewed ferry. Actor records preserve inventory/equipment ownership,
independent command sequences and private cargo journals. The existing private
namespace remains intact.

The game can join shared rooms, display crew/structures and offer cargo for explicit
recipient acceptance. A handoff preserves quantities, condition and provenance,
and commits both custody journals with its room offer and acknowledgement. Room
capacities and work-order reservations span all owners. Exclusive expiring helm
leases and deck-local attachments support crew reconnect without competing control.

Validation includes common last-resource contention, transaction rollback on a
non-caller write, consent/conservation and a cross-player consigned voyage. Existing
checks remain enabled. Real local workerd/SQLite and two browser contexts verify
shared depletion, a dropped acceptance acknowledgement, restart recovery, keyboard
deck walking, competing helm requests, sailing, lease expiry and reconnect aboard.
See VALIDATION_0.7.md for captured evidence and counts.

This remains a bounded preview: eight admitted persistent characters, manual
signed room membership, no background simulation/prediction, archival tooling,
production cost/capacity proof or staging deployment. Inspect SHARED_WORLD.md and
the v3-shared-world namespace migration before infrastructure rollout.
