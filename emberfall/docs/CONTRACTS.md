# Contracts

## Colony contracts and authority additions

COLONY_ECONOMY.md defines versioned production state, stock commands, colony
contract projections and one-time benefits. SHARED_WORLD.md defines the signed
room protocol, per-actor command sequence and atomic cross-character custody.
Game-state save version remains 4; shared snapshots additionally require economy
view version 1 for the 0.8 client.

## Current game state v4

FERRY.md documents persistent vessel/passenger poses and v1/v2/v3 migration.
LOGISTICS.md documents the cargo aggregate, envelopes, events, receipts, manifests
and v1/v2 migration. Economic character contracts remain separate from custody.

### Original simulation contract

`packages/game-core/index.ts` exports State, Command, transition, initialState,
restore, and waterField. State carries player mode/position, ship hull/cargo,
finite nodes, colonies, beast cooldown/health and expedition flags. `restore`
rejects unsupported versions and out-of-budget state. It is local corruption
screening, not server authorization or complete adversarial schema validation.

Commands: move, tick, gather, board, repair, build, recover, attack, deliver.
Commands validate proximity, resources, movement surface and cooldown in the core.
Production must execute commands under an authenticated room authority and add
sequence numbers, tick budgets, replay prevention and server timestamps.

## Local development intake

POST `/asset-api/upload`: raw application/dxf, Content-Length 1..2097152 bytes.
Returns 200 with report/jobId/previewUrl on success, 422 on geometry rejection,
413 on size violation, 415 on content-type mismatch. No browser filename becomes
a filesystem path. Jobs use random server IDs and subprocess timeout 20 seconds.
GET `/asset-api/jobs/{32-hex-id}/model.glb` or `/report.json` reads that result.
No cloud durability, ownership, publication or resource-sandbox guarantee.

## Target queue envelope (producer scaffold supplied)

```json
{
  "schemaVersion": 1,
  "jobId": "OWNER-SHA256-convex-panel-v1",
  "ownerId": "trusted_gateway_actor",
  "sourceKey": "quarantine/OWNER/SHA256.dxf",
  "sourceSha256": "64 lowercase hexadecimal characters",
  "profile": "convex-panel-v1"
}
```

Producer validates metadata and source existence; execution must verify bytes
and deduplicate. Job ID is deterministic; repeated enqueue is still possible.
No consumer, lease store or completion callback is implemented.

## Target lifecycle

received -> validated -> queued -> processing -> review-ready -> published.
Rejected, failed and cancelled are explicit terminal states for an attempt.
Retries require bounded attempts and lease ownership. Publication must atomically
point a versioned manifest at fully uploaded immutable results. The local tool
implements only received -> processing -> review-ready/rejected; no production
state-machine enforcement is claimed.

## Legacy staging API

Bearer SESSION_TOKEN plus configured PLAYER_ID restrict access to one operator.
Profile/save POSTs must use the configured player ID; GETs derive it from config.
Room presence derives a verified player header at the gateway; state and presence
share the same room object. Unknown nested room paths fail validation.
This API's PlayerSave schema is NOT the new State schema. Do not connect it
without explicit migration and revision handling.
