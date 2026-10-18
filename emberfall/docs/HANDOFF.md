# Infrastructure handoff — readiness at 0.9.0

See OBJECTS.md, LOGISTICS.md, FERRY.md, AUTHORITY.md, SHARED_WORLD.md, COLONY_ECONOMY.md and VALIDATION_0.8.md for current local slices.

## Release decision

**NOT v1.0; local prototype handoff candidate.** No cloud deployment, production
sign-off, native build success, performance SLO or receiver acceptance is claimed.

| Gate | Evidence/status | Remaining work |
| --- | --- | --- |
| Product baseline | Recorded in ARCHITECTURE.md | Product owner confirms exact release bounds |
| Shared simulation | Private/shared authority, common finite resources, crew leases and atomic handoffs | Deployed acceptance and measured behavior under load |
| Playable world | 3D web, two-client shared crew and keyboard deck/helm checks | Art, sound, sailing depth and network smoothing |
| Persistence | Local autosave; private authority sequence and recoverable outbox | Deployed migration, archival and recovery exercise |
| Colony simulation | Shared finite recipes/reserves, labor budget, contracts, stock custody and migration | Recurring demand, NPC facilities, market and autonomous growth |
| DXF conversion | Tested bounded profile and GLB export | General geometry, LOD, full quality gates |
| Upload workflow | Local preview path | Private cloud upload, approval, publication |
| Blender | Optional script supplied, syntax checked | Pinned container, execution proof and limits |
| Cloud API | Signed room membership, private/shared transactions and bounded inputs | Public issuer/refresh/revocation and deployed acceptance |
| Python Worker | Metadata producer scaffold, syntax only | SDK lock, runtime tests, queue consumer |
| Reproducible JS | package-lock.json + npm ci | Clean CI proof on receiving infrastructure |
| Native targets | Config and manual CI jobs | Cargo lock, build/test/sign/notarize per OS |
| Operations | Make targets + RUNBOOK.md | Provisioning, alerts, capacity and cost measurements |
| Recovery | Local procedures documented | Witnessed cloud rollback and restore |
| Acceptance | Automated checks recorded | Receiving infra team's recorded exercise |

## V1.0 acceptance (all required)

1. Character gathers/builds, boards a ship, navigates a river and sea, encounters
   a beast, salvages cargo and returns with durable consequences.
2. Second authenticated player joins the same authoritative world; independent
   rooms cannot read/change each other. Reconnect does not duplicate resources.
3. Supported DXF travels from private upload to inspection, refinement, review,
   immutable publication and runtime load; malformed inputs fail safely.
4. Clean checkout -> CI -> staging deployment uses documented commands and
   reviewed infrastructure configuration, with correlated job/request logs.
5. Operators demonstrate failed-job retry, application and asset rollback,
   data restore, declared capacity limits and an accepted cost envelope.
6. Linux/macOS packaged smoke tests pass if those platforms remain in v1.0 scope.
7. Owners and receivers record acceptance; unresolved blockers are not waived
   silently. All deferred features are explicit.

## Prioritized next work

P0: identity-provider membership, token refresh/revocation; measured room admission,
archival/checkpoint tools, deployed authority migration and recovery. Shared world,
ferry control and consent-based cargo ownership are now verified locally.
Queue 05a/05b provide authority; 06 adds tested finite production and contracts.
Operational acceptance and archival remain open.
P0: isolated Blender compute, source verification, queue leases/DLQ, durable job
ledger and authorized publication; production upload gateway.
P1: environment provisioning, private routing, alerts, backups and recovery proof.
P1: model loading errors, web bundle splitting, measured frame/network/compute
budgets, native builds and dependency/security review.
P2: wind, buoyancy, cooperative workshop access, NPC logistics, watersheds and art.

## Suggested ownership — assignments still required

Gameplay owns core/scene; asset engineering owns conversion and quality profiles;
platform owns identity and job protocol; infra owns compute, storage, environments
and observability. One named release owner maintains acceptance evidence.

## Confidence

High in repository structure and demonstrated local core/conversion behavior;
moderate in the target service boundaries; high in bounded two-client local
conservation/reconnect checks; unproven in multiplayer scale, Blender
runtime, packaged desktop and cloud operations. Passing mocks is not deployment proof.

Contribution standings are implemented as a bounded room preview; see CONTRIBUTIONS.md and VALIDATION_0.9.md. Official regional competition remains blocked on identity, eligibility, season governance and correction/archival operations.
