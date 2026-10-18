SHELL := /bin/sh
.DEFAULT_GOAL := help
.PHONY: help bootstrap dev check test build asset-smoke asset-server worker-dev deploy clean test-browser
help: ## Show supported operations
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "%-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
bootstrap: ## Install locked JS and Python dependencies (Node 24, Python 3.11+)
	npm ci
	python3 -m venv .venv
	.venv/bin/python -m pip install -r pipelines/requirements.txt
dev: ## Start Vite; run asset-server separately for local DXF upload
	npm run dev
check: ## Type-check client and Worker, compile Python modules
	npm run check
	python3 -m py_compile pipelines/dxf_pipeline.py pipelines/local_intake.py pipelines/blender_refine.py services/asset-intake/worker.py
test: ## Run simulation, Worker contract and geometry tests
	npm test
	$(PYTHON) -m unittest discover -s tests -p '*_test.py'
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python3)
build: ## Produce web distribution
	npm run build:web
asset-smoke: ## Validate and convert the fixture into GLB and a quality report
	$(PYTHON) pipelines/dxf_pipeline.py fixtures/ship-panel.dxf --out build/assets/ship-panel
asset-server: ## Run loopback-only development upload and processing service
	$(PYTHON) pipelines/local_intake.py
worker-dev: ## Start the Worker API locally
	npm run cf:dev
deploy: ## Deploy staging API only after explicit config (ENV=staging)
	@test "$(ENV)" = staging || { echo 'Only ENV=staging supported; production release is not ready'; exit 1; }
	@test "$(CONFIG)" != '' || { echo 'Set CONFIG to a reviewed staging Wrangler config'; exit 1; }
	npx wrangler deploy --config "$(CONFIG)"
clean: ## Remove generated web and asset output
	rm -rf dist build

test-browser: ## Chromium UI smoke (run npx playwright install chromium first)
	PYTHON=$(PYTHON) npm run test:browser

.PHONY: test-authority
test-authority: ## Real local Worker/SQLite and browser reconnect smoke
	npm run test:authority

.PHONY: test-colonies
test-colonies: ## Real local Worker and browser colony trade round trip
	npm run test:colonies

.PHONY: test-api
test-api: ## Curl contract suite: health, auth gate, room presence, signed authority commands
	bash tests/e2e/api.sh

.PHONY: test-intake
test-intake: ## Curl contract suite: DXF upload gates, GLB conversion, job lookup safety
	PYTHON=$(PYTHON) bash tests/e2e/intake.sh

.PHONY: test-ui
test-ui: ## Playwright robustness suite: boot, persistence, bad input, outage, bad token, phone layout
	PYTHON=$(PYTHON) node --experimental-strip-types --test tests/e2e/ui.e2e.ts

.PHONY: test-robust
test-robust: ## Every suite: unit, build, curl API/intake, Playwright UI and browser smokes
	$(MAKE) check test build asset-smoke test-api test-intake test-ui test-browser test-authority test-colonies
