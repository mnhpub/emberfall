# Validation — colony production and contracts 0.8.0

Final local verification: **91 Node tests and 4 Python tests**; client/Worker type
checks, Python syntax, production web build and DXF conversion pass. See
CHECK_OUTPUT_0.8.txt. The existing Vite bundle-size warning remains.

Seventeen new colony tests cover exact recipe input/reserve/output changes,
contract unlocks, atomic batch blockers, labor/priority, exhaustion of all finite
reserves, duplicate-cycle prevention, reserved completion audit slots, corruption
detection, strict command shapes, a public-command two-contract voyage, contributions
without delivery points, warehouse stock release, full/partial legacy migration,
focus locality/pacing, response-loss retry, last-unit contention, transaction failure
and room reconstruction, common warehouse limits and refusal of an incompatible
older shared server before publishing its view. All prior 74 Node tests remain.

Three Chromium smoke suites pass against the relevant local services:

1. Existing gameplay regression: profession/equipment/crafting, DXF preview,
   cargo/quota rollback, ferry deck walking, helm/coasting and local-save reload.
2. Actual local workerd/SQLite private/shared authority: authentication and isolated
   progress; two-player depletion/custody with a lost acceptance response; process
   restart/reconnect; keyboard crew walking; competing helm requests; sailing;
   lease expiry/takeover and reconnect aboard the common ferry.
3. New `make test-colonies`: a fresh browser character gathers six timber, deposits
   and consigns it, boards a skiff and sails to Aurum using keyboard controls. The
   dock UI unloads/fulfills the first contract; the production panel changes job
   priority and releases colony food into owned cargo. The character consigns and
   ships provisions home, completes the second contract, waits for unlocked finite
   forestry, then loads its output. The test drops that stock-release response
   after commit, observes one resulting lot/event, returns to the separate local
   save, restarts actual workerd against the same SQLite directory, and verifies
   persisted stocks, production counters, contracts and cargo.

BROWSER_OUTPUT_0.8.txt captures the successful runs. The screenshot
`build/screenshots/colony-contracts.png` was inspected locally. The browser cache
was absent at session start; the pinned Chromium build was installed before these
successful runs. Tests use ephemeral keys, loopback-only services and temporary
SQLite directories. CI now invokes all three browser targets. No remote CI or
cloud deployment result is claimed.

The economy applies to shared rooms; private/offline colony scripts remain the
legacy prototype. Scope is four finite production jobs and two fixed one-time
contracts, not recurring demand generation, an open trade market, population
simulation, modeled worker facilities or official rankings. Public identity,
moderation/quotas, archival, measured capacity/cost, deployed migration/recovery,
Blender/cloud asset publication and native packaging remain acceptance gaps.
V1.0 and infrastructure receiver acceptance remain open.
