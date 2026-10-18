# Private expedition authority and reconnect foundation (0.6.0)

Base: `codex/ferry-reference-frames` at `9ac8ed8`. Merge after queue item 04.
No remote PR number is assigned until creation succeeds.

The current staging API only tracks presence and trusts a shared configured player.
This change adds a separate authority namespace with signed, short-lived actor/room
credentials. Validated game intents create transactional private snapshots and
ordered receipts; callers cannot upload inventory or choose another actor.

The existing 3D client can opt into a private online expedition while preserving
its separate local save. An outbox records pending commands before transmission;
retrying a response lost after commit acknowledges the prior effect. Conflicts
pause until explicit reconciliation. Operator credential issuance, migration,
limits and remaining readiness gates are documented in AUTHORITY.md.

Validation: 58 Node + 4 Python tests; type checks, Python syntax, web build and
DXF smoke; existing gameplay Chromium regression; actual local Wrangler/SQLite
browser check including dropped acknowledgement, process restart and reconnect.
CI now invokes the additional local authority smoke. No staging deployment or
remote CI result is claimed.

This is deliberately a private authority foundation. Actors in one named room
still have isolated worlds. Shared resources, ferry ownership, cross-player cargo,
identity-provider membership, retention/recovery and deployed acceptance remain
open under queue item 05. The prior legacy staging routes are preserved separately.
