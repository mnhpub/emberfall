# Validation — dock economy 0.4.0

Local Linux verification; see CHECK_OUTPUT_0.4.txt and BROWSER_OUTPUT_0.4.txt.

- Client and Worker TypeScript, Python syntax and web build checked.
- 32 Node tests and 4 Python tests: 36 total automated tests.
- Cargo tests cover conservation, partial lots/root provenance, receipt retries,
  payload conflicts, stale revisions, quantity/range/capacity rejection, demand
  reservations, consumed fulfillment and one-time credits, occupied crates,
  reclaim, component condition, legacy migration and inconsistent-save rejection.
- A public-command test sails both delivery routes without position edits.
- 200 deterministic randomized partial handoff attempts preserve quantity.
- 512-event boundary test rejects new work without evicting retry receipts.
- Chromium smoke covers professions, crafting/equipment, DXF preview, cargo
  deposit/reserve/load and reload; simulated quota failure rolls back custody.
- Browser scenes/ledger were visually inspected. Browser tests use prepared local
  fixtures for UI handling; the separate command test verifies sailing routes.

No remote CI, native package, cloud deployment, multiplayer race/permission test,
Blender execution, performance capacity or receiving-team acceptance is claimed.
The cargo journal is local snapshot-backed data. It is editable and not suitable
for official scoring. The web bundle still exceeds Vite's 500kB warning threshold.
