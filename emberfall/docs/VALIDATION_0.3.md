# Validation — object/profession slice 0.3.0

Executed 2026-10-17 on Linux, Node 24.19.0, Python 3.12.

- Client and Worker TypeScript checks passed; Python syntax checks passed.
- **21 Node tests + 4 Python tests passed.**
- Production Vite web build and DXF -> GLB smoke passed.
- Chromium 134 smoke passed: initial profession, inventory, clothing/backpack
  crafting and equipping, local DXF preview, autosave/reload and no page errors.
- Screenshots were inspected locally for workshop and placeholder scene layout.
- Version 1 voyage saves migrate to State v2 with balances and progress retained.
- Economic adapter tests verify optimistic revision conflicts, ordered replay,
  component debits, item outputs and equipment projections. Not a durable store.

Evidence: CHECK_OUTPUT_0.3.txt and BROWSER_OUTPUT_0.3.txt.
Browser script uses a deterministic station fixture; core tests separately perform
full gathering/crafting/placement via commands. This is not a real multiplayer test.
Browser test installs a pinned test-only Playwright and Chromium; software GL is
used for this environment. No production frame-rate claim.

## Remaining limitations

No cloud deployment, real-user sessions, authoritative multiplayer, cross-owner
transactions, durable event append/outbox, big-ferry interiors, LOD pipeline,
Blender execution or native packaging verification. Container contents, equipment
capacity, fishing/cooking and machinery simulation are future slices. The forge
is an immediate recipe, not a machine-process engine. Character snapshot still
contains placed-object references; production aggregate split remains planned.

The main web bundle is approximately 1.19MB uncompressed and triggers Vite's
500kB warning. Test target-device performance and split loading before release.
GitHub publication is blocked by integration HTTP 403; no actual PR numbers or
remote CI success are claimed. See PR_QUEUE.md for the merge order.

## Run browser verification

```sh
npm ci
npx playwright install chromium
make test-browser
```

Python geometry dependencies must be available (make bootstrap creates .venv).
The test starts isolated Vite at port 5189 and intake at 8790. That intake accepts
only its configured loopback origin via EMBERFALL_DEV_ORIGIN. Default developer
origin remains port 5173. Both ports must be free. Linux/macOS child processes are
stopped on success/failure. Windows is outside the current supported platform set.
