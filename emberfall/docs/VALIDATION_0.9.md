# Validation — contribution preview 0.9.0

97 Node tests and 4 Python tests pass. Client/Worker type checks, Python syntax,
production Vite build and DXF fixture conversion pass. Bundle-size warning remains.
See CHECK_OUTPUT_0.9.txt.

Six projection tests cover empty eligibility, partial deliveries, deterministic
ties and order independence, exact duplicate/conflict behavior, invalid reward /
destination / quantity / aggregate demand, non-scoring custody events, missing
profession attribution, room identity separation and source immutability. The
existing authoritative two-contract voyage now asserts 100 total points, the
fulfilling actor/profession and receiving-colony totals (60 Aurum, 40 Haven).

All three Chromium browser suites pass locally. Browser validation results are recorded in BROWSER_OUTPUT_0.9.txt. The colony
suite now checks rendered profession standings and equality after a lost stock
release acknowledgement and actual local Worker/SQLite restart.

Not verified: deployed Cloudflare environment, public identity, official regional
eligibility or season rollover, native release builds, production capacity/cost,
operator correction/archival and infrastructure receiver acceptance. This is a
locally validated preview slice, not v1.0 readiness.
