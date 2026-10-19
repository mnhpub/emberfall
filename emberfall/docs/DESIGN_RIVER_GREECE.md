# Design: river network and the Greek colony

Status: draft for review. No code is implemented by this document.

## 1. Where things stand

- The river is a single axis, `z`. Colonies sit at fixed positions along it. `waterField(s, z)` counts the active colonies at or downstream of a point, so "river field" is a downstream count, not a route.
- Colonies are hard-coded as two fixed IDs, `haven` and `aurum`, with fixed recipes, reserves, and contracts (`packages/colonies/index.ts`).
- Saves are validated against exactly two colonies at fixed IDs and positions (`restore()` in `packages/game-core/index.ts`). Any new colony needs a save version bump and a migration, the same pattern used for versions 1 to 4.
- `docs/ARCHITECTURE.md` lists branching tributaries, flooding, and rainfall as out of scope. This design moves them into scope, so that document needs updating when this is built.

## 2. The river network

The aggregates, commands, events, and projections for this design are in `DOMAIN_MODEL_RIVER.md`.

**Model.** A directed graph. Nodes are settlements (villages and colonies) and junctions. Edges are river reaches, each with a length, a current (m/s), and a navigable depth. Flow runs from upstream to downstream. Tributaries are edges that join the main channel at a junction.

**Settlements.**
- Upstream villages supply raw goods (timber, stone, gold, food) and draw finished goods.
- Downstream colonies process and export.
- The Greek colony sits on a tributary, so its goods reach the main river only through a junction.

**How it plays.**
- Ferry and skiff travel is cheaper downstream and dearer upstream. Current sets the speed, and the ferry's sails and throttle act against it.
- Cargo moves along a route. A lot can wait at a junction, and it has to be picked up or handed off there. This replaces the single custody handoff for the ferry today.
- Flooding is an event on a reach: it closes the reach for some ticks, and cargo on it is held rather than lost.

**Data.** Settlements and reaches are static data, versioned with the save. The route table is derived from the graph at load, not stored, so it cannot drift from the map.

**Tests.** Routing returns the shortest navigable path. Current direction matches the graph. A closed reach reroutes or holds cargo. Restoring an old save still yields the same graph.

## 3. The Greek colony

**Placement.** On a tributary off the main river, between an upstream village and the downstream colony. Its goods reach the main river only at its junction.

**Architecture (procedural, in code).**
- Doric and Ionic columns, a stoa with a colonnade, and a small temple, all built from primitives like the existing ferry and pyramid meshes.
- The layout follows a Greek agora: the stoa encloses the open square, and the temple sits above it.
- Level of detail is capped so the colony stays readable on a phone.

**Economy.**
- Greek production uses the stone and timber the river already brings in.
- Its recipes are unlocked by research (section 4), so the colony starts small and grows as knowledge is recovered.
- It keeps the existing contract pattern: one-time contracts with the downstream colony.

## 4. Plato and pre-flood knowledge (research unlocks)

- **Source.** Recovered writings, starting with the dialogues. Each one is found as a relic at a settlement or on a salvage run.
- **Unlocks.** Each writing unlocks one recipe or building. Examples: a water-clock that improves ferry timing, an aqueduct recipe for the Greek colony, a mapping recipe that shows reaches and junctions.
- **Lore.** Each unlock reveals a short fragment about the pre-flood world. Fragments are text, and they carry no mechanical effect of their own.
- **Persistence.** Unlocks are part of the shared economy state, so they survive reloads and reconnects.
- **Open.** Exact list of writings, and whether any unlock is gated behind a contract.

## 5. Save and migration

- Bump the save version. Add the new colonies and reaches to the schema, and migrate existing saves by appending the new settlements with default empty state. Existing `haven` and `aurum` state must not change.
- Test that a version-4 save restores unchanged and that a new save round-trips.

## 6. Phases

1. **Spec review.** You review this document. Decisions in section 7 are settled here.
2. **River graph.** Graph data, routing, current, and reach tests in `packages/`. No UI change yet.
3. **Save migration.** Version bump and migration with round-trip tests.
4. **Greek colony.** Procedural architecture, recipes, and the junction handoff.
5. **Research.** Writings, unlocks, and lore fragments.
6. **Polish.** Flooding events and UI for routes and cargo waiting at junctions.

Each phase ships with tests and passes `make test-robust` before the next starts.

## 7. Open decisions

- Exact map geometry: where the tributary branches, and the length of each reach.
- Whether cargo can be left at a junction indefinitely, or expires.
- Whether the research writings are free to find or must be earned through contracts.
- Whether the Greek colony is playable solo or only in a shared room.
