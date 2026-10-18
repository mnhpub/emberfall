# Validation evidence — 2026-10-17

Environment: Node 24.19.0, Python 3.12, Linux. Scope: local source/build checks.
Commands below were executed; see CHECK_OUTPUT.txt for captured output.

| Check | Result |
| --- | --- |
| npm install / lock resolution | Passed after replacing unavailable original Cloudflare types version |
| npm ci --ignore-scripts | Passed, lockfile replay checked |
| make check | Client and Worker TypeScript passed; Python syntax passed |
| make test | 12 Node tests and 4 Python tests passed |
| make build | Vite production web build passed |
| make asset-smoke | DXF fixture -> GLB/report passed (16 triangles) |
| Wrangler deploy --dry-run | Bundled Worker and displayed binding configuration; no deployment |
| HTTP intake smoke | Valid DXF upload and GLB fetch passed; malformed input rejected |
| Browser interaction / visual inspection | NOT VERIFIED: no browser installed; Chromium download failed with invalid archive |
| Blender script | Syntax only; Blender unavailable |
| Python Worker | Syntax only; workers SDK/cloud bindings not executed |
| D1 migration against cloud | Not executed |
| Native Linux/macOS packaging | Not executed |
| GitHub Actions | Workflow supplied; not run remotely |
| Production/receiver acceptance | Not executed |

Node coverage: resource depletion/range, immutable transitions, construction
costs/field, movement boundaries, combat cooldown, damage/repair, one-time cargo
delivery, save roundtrip/corruption, valid generated states, full expedition via
commands, fail-closed API gate, room isolation, stale presence deletion, ownership,
invalid displayName, and actual oversized-body rejection.

Python coverage: GLB chunk structure/counts, supported geometry, open/curved/
self-intersecting/unit rejection, duplicate repair, HTTP upload/fetch, malformed
input, wrong media type, and untrusted Origin rejection. These do not substitute
for a full glTF validator or geometry stress/fuzz corpus.

Known build warning: the main Three.js bundle exceeds Vite's 500kB warning
threshold (about 1.17MB uncompressed). Measure target-device performance and split
loading paths before production. No frame-rate or memory guarantee is asserted.

No visual screenshot was generated successfully. The scene is basic placeholder
geometry, not a claim of finished Enshrouded-level fidelity or gameplay depth.
