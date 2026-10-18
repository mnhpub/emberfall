# Emberfall complete project — v0.9.0

Source snapshot: c530397119b0aa11d45e24468ffcb963998068e7

The emberfall/ directory contains all tracked source, tests, CI, configuration,
documentation, DXF fixture, the production web build in dist/, a converted sample
asset under build/assets/, and the complete stacked Git history as
build/emberfall-v0.9.bundle. No Git submodules are declared in this snapshot.

Start development (Node 24, Python 3.11+):
  cd emberfall
  make bootstrap
  make dev

Validation:
  make check test build asset-smoke
  npx playwright install chromium
  make test-browser test-authority test-colonies

Restore all local branches/history into a separate checkout:
  git clone emberfall/build/emberfall-v0.9.bundle emberfall-history
  cd emberfall-history
  git checkout codex/regional-contributions

Read README.md and docs/HANDOFF.md first. See docs/PR_QUEUE.md for merge order,
docs/VALIDATION_0.9.md for verification and docs/RUNBOOK.md for operation.
101 automated tests and all three browser suites passed before packaging.

Dependencies, virtual environments, browser binaries, credentials, runtime state
and machine caches are excluded. Restore dependencies with make bootstrap.
Cloud resource IDs/configuration still require operator setup. Native release
builds and official regional seasons remain unverified/open. This archive is the
complete current project snapshot, not a claim of v1.0 production readiness.
