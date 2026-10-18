# Operations and recovery

## Local startup

1. Node 24, Python 3.11+, Make installed; `make bootstrap`.
2. `make check test build asset-smoke`.
3. Terminal A `make dev`; terminal B `make asset-server`.
4. Open http://127.0.0.1:5173. Upload the supplied DXF fixture, review, approve.
5. Stop with Ctrl-C. Never port-forward the development intake publicly.

If geometry conversion fails, inspect the UI error and `build/jobs/ID/report.json`.
Fix source units/entities/shape; submit a new job. Originals stay in the local job
directory until removed. For a timeout, inspect the process and disk usage before
retrying. The local service is serial and not a throughput benchmark.

## Local save recovery

Save key `emberfall.maritime.v1` in browser localStorage is device/origin-specific.
Export its raw JSON through developer tools before reset or browser cleanup.
Invalid saves start a new session with a visible message; there is no previous
save version backup. New expedition is destructive only to that local slot.
Disconnected clients do not catch up world time. Connected background tabs may
keep a room active under the browser’s timer policy.

## Staging cloud provisioning — not executed

1. Review environment names, account and budget. Provision separate D1, R2 and
   room namespace via reviewed configs. Apply migrations on the staging DB.
2. Replace the template D1 placeholder in a private staging config.
3. Set SESSION_TOKEN via Wrangler secret input; configure nonsecret PLAYER_ID.
   Do not put either shared staging credential into the browser bundle.
4. Use `make deploy ENV=staging CONFIG=path/to/reviewed-config.toml` only when
   staging ownership and configuration are ready. The command does not provision
   resources or establish production readiness.
5. Verify missing/bad credentials fail; verify two room IDs stay separate.
6. Do not connect game saves to the legacy schema.

The Python intake scaffold separately requires R2 quarantine, queue, private
route and INTAKE_TOKEN. Do not deploy it until SDK/runtime and gateway tests pass.
Blender compute provider, image digest, resource limits and result protocol are
not selected/provisioned. Required adapter: fixed profile -> fixed executable,
verified source -> isolated process -> immutable output -> authenticated callback.

## Colony economy rollout (0.8)

Run `make test-colonies` with pinned Chromium available. The target performs a
fresh browser-driven two-way voyage, production and actual local SQLite restart.
The existing `make test-browser test-authority` targets remain required.

The existing SharedWorld namespace gains `economy.version = 1` transactionally;
there is no new class migration. Deploy the server before the 0.8 client. Preserve
a room backup and test migration on a copy: existing stock/fulfillment survives,
completed older contracts do not gain settlers again, and partial contracts remain
open. Unknown economy versions fail closed. COLONY_ECONOMY.md specifies finite
reserves and audit boundaries; do not delete/reset them as routine maintenance.
No production archival, deployed rollback or cloud restore procedure is certified.

## Production release gates

Public identity, token refresh/revocation, moderated room membership, measured
capacity, asset source/publication gates, metrics, alarms, retention/archival,
backups and deployed recovery still need completion. Signed room grants, client
routing, bounded authority and colony transactions have local proof only.
Suggested measurements: API error/latency, room occupancy/tick duration, queue age,
job retry/failure/time/memory, storage growth, asset load size and client frame time.
Thresholds and costs must come from measured workloads, not this document.

## Rollback / restore rehearsal — not yet performed

Retain previous application artifact and compatible config. Separate schema
migration from rollout; use expand/contract and rehearse old-version reads.
Retain published immutable asset versions and update manifest pointers atomically.
Back up D1/checkpoints and verify restoration into an isolated environment.
Record actual commands, resource identifiers, results and measured recovery time
when infrastructure exists. Do not claim a recovery objective before rehearsal.
