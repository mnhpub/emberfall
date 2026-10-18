# Add large ferry reference frames and walkable deck

Base: codex/dock-cargo (6947dc1). Merge after queue items 01–03.
No remote PR number is assigned until publication succeeds.

Adds a 160m four-masted offshore ferry with deck-relative walking, a cutaway
cabin, gangway/pier/skiff boarding, a proximity-gated helm, set/furled sails,
coasting and conservative collision. A passenger follows translation and yaw
without world-space drift. Adds an independent ferry cargo endpoint and preserves
legacy trade gameplay and saved progress through State v4 migration.

Sailing and geometry are local placeholders; no hydrodynamics, final rig design,
multiplayer crew authority, network reconnect or multi-deck physics is claimed.
See FERRY.md and VALIDATION_0.5.md for evidence and limitations.
