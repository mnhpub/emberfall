# Pull request queue and merge order

The user merges PRs. Agents must not merge automatically. Publish dependent work
as stacked branches; document the parent branch in each PR. After a parent merges,
retarget the next PR to main and verify its diff/CI before merging.

No GitHub PR number is assigned until creation succeeds. Planned rows below are
work packages, not claims of implemented features or published PRs.

| Order | PR | Branch / intended parent | Scope | State |
| --- | --- | --- | --- | --- |
| 01 | Not yet created | codex/maritime-handoff-v0.2 / main | Tested 0.2 slice, DXF path, backend fixes, Make/CI, docs | Local commits ready; remote publication awaiting successful authenticated write |
| 02 | Not yet created | codex/professions-items / 01 | Shared object catalog, professions, equipment, crafting, placement and event/projection contracts | Implemented locally; publication pending |
| 03 | Not yet created | codex/dock-cargo / 02 | Cargo custody aggregate, manifests, transfers, reservations, deliveries and local event journal | Validated locally: 36 tests and Chromium smoke pass; publication pending |
| 04 | Not yet created | codex/ferry-reference-frames / 03 | 160m offshore ferry, deck/cabin walking, helm/coasting, cargo endpoint and save migration | Validated locally: 46 tests and Chromium smoke; publication pending |
| 05a | Not yet created | codex/world-authority / 04 | Signed private actor/room authority, command sequence and reconnect foundation | v0.6 validated locally; publication pending |
| 05b | Not yet created | codex/shared-world / 05a | Common room resources/colonies, crew leases, consent-based custody, public projections and reconnect | v0.7: 78 automated tests and both browser suites pass locally; deployed/identity acceptance remains open |
| 06 | Not yet created | codex/colony-contracts / 05b | Finite village production, fixed shipment contracts, stock custody, completion and migration | v0.8: 95 automated tests and three browser suites pass locally; publication pending |
| 07 | Not yet created | codex/regional-contributions / 06 | Accepted-delivery facts, deduplication and room-preview player/profession/colony standings | v0.9: 101 automated tests and three browser suites pass; publication blocked |
| 08 | Planned | codex/cloud-asset-publication / 07 | Private uploads, isolated processor, queue recovery, review and publication | Not started |
| 09 | Planned | codex/release-acceptance / 08 | Native builds, capacity measurements, staging operation, rollback/restore and receiver acceptance | Not started |

## Local branch history

01: c599cfc bootstrap + 92a9b88 queue documentation.
02: b709d72 on codex/professions-items, branched from 92a9b88. Includes 0.3 object/profession
implementation and hybrid event contracts. 25 automated tests and Chromium smoke
pass. No remote PR numbers yet.

03: codex/dock-cargo branches from 28add18 (02). Version 0.4.0; 36 tests,
Chromium handling/save-failure smoke and web build pass. No remote PR number yet.

04: codex/ferry-reference-frames branches from 6947dc1 (03). Version 0.5.0;
46 automated tests and extended Chromium smoke. No remote PR number yet.

05a: codex/world-authority branches from 9ac8ed8 (04). Version 0.6.0 private
authority foundation: 62 automated tests, existing gameplay browser regression and
real local Worker/SQLite reconnect smoke pass. See AUTHORITY.md and VALIDATION_0.6.md.
Shared-world behavior is added by 05b; identity-provider acceptance remains pending.
No remote PR number assigned.

05b: codex/shared-world branches from 4c0d18d (05a). Version 0.7.0; 74 Node +
4 Python tests, original gameplay Chromium smoke, and expanded actual local
workerd/SQLite two-player cargo/crew/restart/reconnect smoke pass. See
SHARED_WORLD.md and VALIDATION_0.7.md. No remote PR number assigned.

06: codex/colony-contracts branches from a7aab48 (05b). Version 0.8.0; 91 Node +
4 Python tests and three browser suites. The new actual workerd/SQLite browser
round trip completes both contracts, produces/loads finite output, retries a lost
stock-release acknowledgement and verifies restart recovery. See
COLONY_ECONOMY.md and VALIDATION_0.8.md. No remote PR number assigned.

## Gate for every published PR

Record actual PR URL/number, commit, parent, implemented behavior, validation and
limitations here. Keep CI green; do not embed credentials or generated dependencies.
No payment implementation until commercial entitlements and pricing are approved.

## First feature acceptance after bootstrap

A new player chooses shipwright, fisher, provisioner or transport as a starting
profession. Everyone can collect a loose bolt; profession changes identification
and recipe capability rather than imposing a pickup ban. Item instances retain
material, specification, condition, quantity and ownership. Save migration keeps
existing local progress. Later authoritative servers reuse the same catalog.

## Private-authority publication attempt — 2026-10-17

05a implementation commit: `bac89a1` on `codex/world-authority`, stacked on
`9ac8ed8` (04). CLI push failed because HTTPS Git credentials were unavailable;
the GitHub connector branch-write attempt returned 403, “Resource not accessible
by integration.” No remote branch or PR was created by this attempt. Merge order
is now 01 → 02 → 03 → 04 → 05a → 05b; deployed identity and operational
acceptance remain outstanding. A local Git bundle can transfer the complete
stack while authenticated remote publication is unavailable.

## Shared-world publication attempt — 2026-10-17

05b implementation commit: `962bd50` on `codex/shared-world`, parent `4c0d18d`
(05a). CLI push again failed because HTTPS Git credentials were unavailable. The
GitHub connector branch-write attempt returned 403, “Resource not accessible by
integration.” No remote branch or PR was created. Merge order is
01 → 02 → 03 → 04 → 05a → 05b → 06 → 07 → 08 → 09.
The local Git bundle includes all stacked branches and complete history.

Next implementation: queue 06, colony production/contracts, building on the common
demand/custody foundation. Public identity, archival, measured capacity and deployed
recovery remain handoff/release gates; local multiplayer proof does not waive them.

## Colony-contract publication attempt — 2026-10-17

06 implementation commit: `d496e19` on `codex/colony-contracts`, parent `a7aab48`
(05b). CLI push failed because HTTPS Git credentials were unavailable. The GitHub
connector branch-write attempt returned 403, “Resource not accessible by
integration.” No remote branch or PR was created by this attempt. Merge order:
01 → 02 → 03 → 04 → 05a → 05b → 06 → 07 → 08 → 09.
The v0.8 Git bundle contains the complete local branch stack.

Next implementation is queue 07: auditable regional contribution projections,
without treating client/local scores or manually reset rooms as official rankings.
Public identity, archival, measured capacity and deployed recovery remain release
gates. No monetization or payment implementation was added.

## Contribution-preview publication attempt — 2026-10-18

07: `codex/regional-contributions`, parent `5358fad` (06). Implements bounded
room-preview accepted-delivery projections, not official regional seasons.
CLI push failed because HTTPS Git credentials are unavailable; connector branch
creation returned 403, “Resource not accessible by integration.” No remote branch
or PR was created. Merge order remains 01 → 02 → 03 → 04 → 05a → 05b → 06 →
07 → 08 → 09. See PR_07.md, CONTRIBUTIONS.md and VALIDATION_0.9.md.

Next: queue 08, isolated cloud asset processing/publication. Blender runs in an
isolated processor; Python Workers handle orchestration, not native Blender.
Official regional eligibility and release acceptance remain open gates.

07 implementation commit: `87e583b`. All 97 Node + 4 Python tests and all three Chromium suites pass. The final colony browser check confirms rendered transport standings and identical 100-point projections after retry and workerd restart.
