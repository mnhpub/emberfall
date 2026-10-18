# Private expedition authority — 0.6.0

0.7 update: this document describes the retained private-expedition path.
SHARED_WORLD.md documents the additional shared room namespace, common resources,
crew leases and consent-based cross-player custody. Private behavior below remains
unchanged; shared-world absence statements describe 0.6 only.

This is the first online authority slice. A signed player joins a private
expedition in a room, plays through the existing 3D client, and reconnects to
server progress. **Players in the same named room do not yet share a world.**
The namespace key is the JSON tuple `[room, actor]`; it deliberately isolates
inventories, nodes, colonies, skiffs, ferries, placements and logistics. The
`local-player` domain owner is interpreted within that private aggregate. Do not
use these private contributions as a regional competitive leaderboard.

## Trust and API

`GET /api/authority/:room/snapshot` initializes or returns a server-created
snapshot. `POST /api/authority/:room/command` accepts protocol-v1 envelopes:

```json
{"sequence":1,"commandId":"request-001","command":{"type":"choose-profession","profession":"shipwright"}}
```

The response contains `protocol`, verified `actor`, `room`, `sequence` and the
version-4 game state. Client save import, inventory writes, player selection,
client ticks, client dt, unknown properties and unrecognized commands are denied.
Nested cargo commands receive the same shape validation before domain validation.
Actual streamed command bodies are limited to 8 KiB. Origins must equal the
configured `CLIENT_ORIGIN` or request origin. No cross-origin CORS grant is made
by this route; the Vite `/api` proxy is the local browser entry point.

A manually provisioned HS256 session names one actor and room, with a fixed
issuer/audience and a lifetime of at most one hour (default 15 minutes). Signature,
identity, room and timestamps are checked on every request. Actor headers supplied
by callers are discarded before dispatch. Missing namespace/key fails closed.
There is no public token mint endpoint, registration, social login, refresh token,
self-service membership, per-token revocation or identity provider integration.
Signing-key rotation invalidates all outstanding credentials. Access tokens remain
in client memory; never put the signing secret in `VITE_` variables or the browser.
Legacy `/api/save`, `/api/profile`, `/api/room` retain their separate staging gate;
they cannot change the authority namespace and are not production APIs.

## Commit and reconnect rules

Each actor/room aggregate is stored under `session` in a SQLite-backed Durable
Object. Storage transactions read the current snapshot and atomically write the
next snapshot plus the most recent receipt. There are no external calls inside
the transaction. Durable Object storage semantics are documented at
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/.

Sequence must increase by exactly one. An identical retry of the latest accepted
envelope returns its acknowledgement without executing again. Canonical JSON
fingerprints ignore property order. Reusing that receipt with changed content,
skipping a sequence, or retrying an older sequence returns 409 and does not mutate
state. Sequence is the durable ordering/idempotency boundary; command IDs are not
an unlimited global deduplication index. Multiple devices must reconcile conflicts,
not increment a failed command's sequence and automatically resubmit it.

The browser persists one pending envelope per actor/room **before** sending it.
A response lost after commit is recovered with the same sequence and command ID,
including across page reloads after the player re-enters a valid token. Network
errors retry with capped backoff; 429 retries later. 401/409/other rejected commands
pause and retain the envelope. The explicit “Reload server progress · discard
pending action” action loads the current authoritative snapshot and abandons the
pending intent. It never applies that intent again automatically. A single UI action
may wait in memory behind an in-flight movement frame; it becomes recoverable only
when written to the outbox before sending. It has no effect if the page closes first.
Use one browser tab per actor/room; multi-tab client outbox coordination is pending.

Joining first saves and freezes the local game. Online snapshots never replace
that local-save key. Returning to local play restores the pre-connection state;
online progress remains server-side. Connection failure restores local play.
Outbox storage failure pauses before a new command is sent. Leaving online mode
keeps an unresolved outbox entry for later recovery.

## Simulation and capacity

The client sends input frames at approximately 10 Hz without local prediction.
The server limits new commands to one per 75 ms and derives movement/ferry steps
from server elapsed time capped at 100 ms per accepted command. Idle/disconnected
time is discarded; game ticks accumulate from that capped active time. No catch-up
reward, server alarm simulation, smooth interpolation, fixed-step multiplayer,
latency SLO or sustained-cost benchmark is claimed. Movement currently writes a
snapshot per command; this is an intentionally bounded correctness prototype,
not an efficient high-player-count design. Cargo events remain in the domain
journal; movement is not appended as economic events.

Every resulting state passes the shared restore/invariant checks before commit.
The serialized aggregate is capped at 120,000 bytes; larger writes return 507
without changing state. The existing cargo journal also stops at 512 events.
Neither boundary discards receipts to make room. Archival/checkpoint migration,
operator recovery tooling, retention policy and backup/restore exercises remain
release blockers. Room-wide admission control and account provisioning limits
also need infrastructure policy before a public issuer is enabled.

## Operator setup

1. Review a staging Wrangler config with the `AUTHORITY_SESSIONS` binding,
   `AuthoritySession` export and `v2-authority` SQLite class migration. Existing
   `WorldRoom` migration remains intact. Replace D1 placeholders when using the
   full legacy config; the isolated smoke generates its own local-only config.
2. Generate a cryptographically random secret of at least 32 bytes. Install it as
   `AUTHORITY_SIGNING_KEY` using Wrangler secrets for the chosen environment.
   For local development only, use ignored `.dev.vars`. Configure the exact web
   origin as `CLIENT_ORIGIN`; serve the API through that origin.
3. In an operator environment holding the same secret, run
   `npm run session:issue -- player_001 haven 900`. The utility reads
   `AUTHORITY_SIGNING_KEY` from its environment and prints a short-lived bearer
   credential. Supply it only to the intended player. The signing key stays with
   the operator. Issuance is an explicit admin grant of room access.
4. Start the Worker and Vite. Open “Private online expedition · preview”, enter
   the room and issued access token, and connect. A fresh authoritative expedition
   requires a fresh profession choice. Use “Return to local save” for offline play.
5. Run `make test-authority` for the isolated local runtime/browser check and the
   normal verification targets before staging rollout. It uses an ephemeral key,
   temporary SQLite directory and loopback ports 8787/5190/9231. No cloud resources
   or production credentials are used. It removes its temporary state on exit.

Do not mark queue item 05 or v1.0 accepted until shared-world resources, ferry/helm
ownership, cross-player cargo custody, identity-provider membership and a deployed
recovery exercise have been implemented and verified. Private authority is a
reviewable foundation for that work, not evidence of co-op readiness.
