# Emberfall — maritime and colony slice 0.9.0

An original character-driven survival RPG prototype inspired by the broad
survival-building genre: sail a watershed, gather resources, build a granite
pyramid with a gold apex, encounter a river beast, and salvage a wreck.
Pyramid effects on water are fictional mechanics, not physical claims.

**Status: tested local vertical slice; not v1.0, not production multiplayer.**
Start with [docs/HANDOFF.md](docs/HANDOFF.md) for readiness and remaining work.
See [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) for the ferry,
professions, dock economy and regional competition direction agreed afterward.

## Run

Prerequisites: Node **24**, Python **3.11+**, GNU Make. Desktop additionally needs
Rust and OS-specific Tauri build dependencies. Bun is not required.

```sh
make bootstrap
make check test build asset-smoke
make dev
# In a second terminal, for local DXF upload/preview:
make asset-server
```

Open http://127.0.0.1:5173. The development intake binds only to 127.0.0.1:8790;
Vite proxies `/asset-api`. Do not expose either development server publicly.
`make build` produces `dist/`; use `npm run preview` for a built-client preview.
Asset upload requires Vite dev and the local intake; production upload is not wired.

## Large ferry

Use the right-hand ferry controls to take the Haven shuttle offshore and board
Endurance: a 160m, four-masted vessel with a walkable deck and cutaway cabin.
Walk to the aft helm at local (0,35), press H, set sails and use WASD to sail.
H releases the helm; the vessel coasts while you walk. Stop and return to the
port gangway (-9,0) to exit beside the pier or skiff. Use Vessel overview to
inspect scale. This is a local kinematic reference-frame prototype.

See [docs/FERRY.md](docs/FERRY.md) and
[docs/VALIDATION_0.8.md](docs/VALIDATION_0.8.md).

## Dock cargo and trade

Press **L** or open **Dock ledger & cargo**. Gather six timber near Haven, deposit
it at Haven warehouse, assign it to the Aurum timber order, then transfer it to the
ship. Sail north to z=-19, approach the east bank (x=3), unload to Aurum warehouse
and fulfill. Deposit four carried food there for the return provisioning order.
Unassigned goods can be reclaimed to inventory. Placed crates accept cargo.

The cargo aggregate has append-only character events, command receipts, version
checks and bounded capacities. Offline cargo saves immediately and rolls back on
device-save failure. Shared rooms enforce accepted server custody and common demand.
Official regional rankings remain disconnected; see SHARED_WORLD.md.
See [docs/LOGISTICS.md](docs/LOGISTICS.md) and
[docs/VALIDATION_0.4.md](docs/VALIDATION_0.4.md).

## Colony production and contracts

Shared rooms offer **Colony production & contracts**: complete the timber and
provisioning voyages, unlock finite production, contribute supplies, choose a job
priority and release colony stock into owned warehouse cargo. Supplies and reserves
are consumed in bounded batches; completed contracts grant their benefit once.
See [docs/COLONY_ECONOMY.md](docs/COLONY_ECONOMY.md). Test the full browser-driven
round trip with `make test-colonies`. Offline/private scripts remain unchanged.

## Professions and world objects

Choose a starting trade, collect finite yard salvage, equip tools and clothes,
craft and place a workbench, forge, shelter and crate. Press I for the workshop.
See [docs/OBJECTS.md](docs/OBJECTS.md) and
[docs/EVENT_ARCHITECTURE.md](docs/EVENT_ARCHITECTURE.md) for implemented behavior
and aggregate/command/projection boundaries. Existing voyage saves migrate to v2.
Current evidence is in [docs/VALIDATION_0.3.md](docs/VALIDATION_0.3.md).
For browser tests: `npx playwright install chromium`, then `make test-browser`.

## Play

- WASD / arrows: move on land or sail aboard your vessel.
- Click the green timber, gray granite, or gold resource **while nearby**.
- E or the board button: board near the dock; disembark near a riverbank.
- Build three tiers for 3 granite each, then fit a 1-gold apex at Ember Haven.
- Sail north (W), defend with Space near the purple beast; attacks have cooldown.
- At the northern wreck use **Salvage wreck**, then return south to the home dock
  and **Deliver relic**. Two settlers join your colony.
- Repair near the vessel with 2 timber. Carry spare wood before departure.
- Session state autosaves every 3 seconds and on page hide; the UI reports errors.
  Resume uses the same browser origin. New expedition resets this local save.

## Local DXF path

Use the right-hand panel to upload `fixtures/ship-panel.dxf`. Inspect triangle and
repair counts, then approve its **local preview** to place the converted object
at the dock. This is not durable publication. Preview objects reset on reload.
The panel is hidden on narrow windows; use a desktop viewport at least 850px wide.
See [docs/ASSETS.md](docs/ASSETS.md) for the deliberately restricted DXF profile.

## Modules and commands

- `src/`: UI and local rendering; the older `src/game/world.tsx` is unused baseline code.
- `packages/game-core/`: shared pure transitions and versioned save validation.
- `worker/`: legacy profile/save and presence APIs, gated for private staging.
- `pipelines/`: tested DXF converter/local intake; optional unexecuted Blender script.
- `services/asset-intake/`: syntax-checked Cloudflare Python coordinator scaffold.
- `src-tauri/`: inherited Linux/macOS wrappers, not native-build verified here.
- `docs/`: architecture, acceptance, recovery, contracts and validation evidence.

`make help` lists operations. `npm run desktop:dev` / `desktop:build` use the same
web app. The current desktop path supports local gameplay; cloud endpoints and
asset-upload routing need packaged-runtime integration. No runtime Git submodules
are required; modules live in this repository. If external Git submodules are
introduced, pin SHAs and add recursive initialization to bootstrap and CI.

## Backend and deployment

No deployment was performed. The client deliberately uses local simulation and
local saves; it does not call the legacy cloud save API, whose schema differs.
Fixing that requires versioned persistence and per-user authentication, not a
browser-held shared staging secret.

`worker/index.ts` has corrected room routing and stale-presence cleanup.
The legacy profile/save/presence APIs return 503 without `SESSION_TOKEN` and
`PLAYER_ID`; they remain single-operator staging endpoints. Private/shared
authority routes instead use signed actor/room credentials and separate namespaces.
Health checks report bindings, not database connectivity. Public identity, token
refresh/revocation and deployed operational acceptance remain release gates.

Use reviewed environment-specific Wrangler configs. `wrangler.toml` is a template
with a placeholder D1 ID. `make deploy ENV=staging CONFIG=...` requires an explicit
config; production is intentionally unsupported. See docs/RUNBOOK.md.

## License

MIT for project source; third-party dependencies retain their own licenses.
No Enshrouded assets, maps, characters, or server/client protocol are included.

Choose a private expedition or shared colony room under **Online expeditions · preview**.
Signed sessions, common resources, ferry crews and consent-based cargo handoffs are
described in [docs/SHARED_WORLD.md](docs/SHARED_WORLD.md) and
[docs/AUTHORITY.md](docs/AUTHORITY.md). Both paths need a configured Worker and
operator-issued access token; the default remains offline play.

Version 0.9 adds [room contribution standings](docs/CONTRIBUTIONS.md) from accepted delivery journals. Official regional seasons remain a release gap.
