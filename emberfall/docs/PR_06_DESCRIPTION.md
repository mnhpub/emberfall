# Bounded colony production and one-time shipment contracts (0.8.0)

Base: `codex/shared-world` at `a7aab48`. Merge after queue item 05b.
No remote PR number is assigned until publication succeeds.

Shared colonies previously received scripted resources regardless of supply or
reserves. This change replaces those increments with four finite batch recipes,
population labor, priority and atomic input/output/capacity checks. The two existing
shipment orders now expose contract phases and grant one recorded settler/unlock
benefit on completion. Carried contributions and colony stock releases do not earn
shipping credit. A release debits common stock and creates an owned custody lot
inside the existing room transaction.

The game adds colony/contract controls and public read models. Older shared rooms
receive a versioned economy baseline while preserving stock and fulfillment; prior
completed contracts do not receive their new benefit again. New clients reject an
incompatible older shared server before displaying its view. Private mode stays
separate.

Validation: 91 Node + 4 Python tests, type checks, Python syntax, web build and DXF
smoke; all earlier browser regressions; and a new real local workerd/SQLite browser
scenario covering both ship voyages/contracts, production, a lost stock-release
acknowledgement and restart recovery. See VALIDATION_0.8.md for evidence.

This is a bounded shared-room preview: two fixed contracts, finite reserves,
no autonomous demand/market/worker NPCs, and no official regional ranking. Audit
capacity fails closed pending archival; public identity, moderation, production
capacity/cost and deployed recovery remain handoff gates. Server rollout must
precede the new client. No new namespace/class migration is needed for this data
extension, but review COLONY_ECONOMY.md before applying it to an existing room.
