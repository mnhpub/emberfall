# Add dock cargo custody and demand-backed river deliveries

Base: codex/professions-items (28add18). Merge only after queue items 01 and 02.
No GitHub PR number assigned until publication succeeds.

Players can deposit gathered supplies at warehouses, reserve cargo against a
source/destination work order, load their vessel, sail to the other colony,
unload and fulfill. Unassigned goods can be reclaimed; occupied crates cannot
be packed. Partial lots retain root provenance and quantities are conserved.

The local custody aggregate validates capacity, proximity and revision, records
accepted events and command receipts, and rejects changed-payload retries.
Fulfillment consumes cargo and credits colony stock/local points once. Accepted
cargo changes synchronously save the complete device snapshot; a failed device
write rolls back the command. Earlier saves migrate to State v3.

Validation: 32 Node + 4 Python tests; TypeScript checks; web build; DXF smoke;
Chromium profession/workshop/upload/cargo/reload and quota-failure smoke.

Limitations: one-device snapshot-backed journal, not a deployed multiplayer event
store. Fixed two-order demand, abstract handling capacity, 256 lots/512 events,
no compaction/cancellation, production provenance or official leaderboard scores.
See LOGISTICS.md and VALIDATION_0.4.md for operational limits and evidence.
