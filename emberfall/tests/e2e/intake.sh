#!/usr/bin/env bash
# Curl contract suite for the loopback-only DXF intake service (pipelines/local_intake.py).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="http://127.0.0.1:8790"
DEV_ORIGIN="http://127.0.0.1:5195"
PYTHON_BIN="${PYTHON:-$([ -x "${ROOT}/.venv/bin/python" ] && echo "${ROOT}/.venv/bin/python" || echo python3)}"
case "${PYTHON_BIN}" in
  */*) [[ "${PYTHON_BIN}" = /* ]] || PYTHON_BIN="${ROOT}/${PYTHON_BIN}" ;; # the service runs from ROOT
esac
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
curl -s -m 1 -o /dev/null "${BASE}/asset-api/jobs/x" && { echo "Port 8790 already in use"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/emberfall-intake-XXXXXX")"
SERVER_PID=""
cleanup() {
  if [ -n "${SERVER_PID}" ]; then kill "${SERVER_PID}" 2>/dev/null || true; wait "${SERVER_PID}" 2>/dev/null || true; fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

(cd "${ROOT}" && EMBERFALL_DEV_ORIGIN="${DEV_ORIGIN}" exec "${PYTHON_BIN}" pipelines/local_intake.py) \
  > "${WORK}/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 60); do
  curl -s -m 2 -o /dev/null "${BASE}/asset-api/jobs/x" && break
  sleep 0.25
done
curl -s -m 2 -o /dev/null "${BASE}/asset-api/jobs/x" || { cat "${WORK}/server.log"; echo "Intake did not start"; exit 1; }

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
call() {
  STATUS="$(curl -sS -m 30 -o "${WORK}/body" -D "${WORK}/headers" -w '%{http_code}' "$@")" || STATUS=000
}
expect_status() {
  if [ "${STATUS}" = "$2" ]; then pass "$1"; else fail "$1 (expected HTTP $2, got ${STATUS}: $(head -c 200 "${WORK}/body"))"; fi
}
expect_json() {
  if jq -e "$2" "${WORK}/body" >/dev/null 2>&1; then pass "$1"; else fail "$1 (body: $(head -c 300 "${WORK}/body"))"; fi
}

DXF="${ROOT}/fixtures/ship-panel.dxf"
UPLOAD=(-X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' --data-binary "@${DXF}")

echo "Upload gate"
call -X POST -H "origin: http://evil.example" -H 'content-type: application/dxf' --data-binary "@${DXF}" "${BASE}/asset-api/upload"
expect_status "foreign origin is rejected" 403
call -X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: text/plain' --data-binary "@${DXF}" "${BASE}/asset-api/upload"
expect_status "non-DXF content type is rejected" 415
call -X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' -H 'content-length: 0' "${BASE}/asset-api/upload"
expect_status "empty upload is rejected" 413
head -c $((2 * 1024 * 1024 + 1)) /dev/zero > "${WORK}/too-big.dxf"
call -X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' --data-binary "@${WORK}/too-big.dxf" "${BASE}/asset-api/upload"
expect_status "upload over 2 MiB is rejected" 413
call -X PUT -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' --data-binary "@${DXF}" "${BASE}/asset-api/upload"
expect_status "non-POST upload method is not accepted" 501
call -X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' --data-binary "@${DXF}" "${BASE}/asset-api/other"
expect_status "unknown upload path is 404" 404

echo "Valid panel processing"
call "${UPLOAD[@]}" "${BASE}/asset-api/upload"
expect_status "valid DXF is converted" 200
expect_json "report is review-ready and never auto-published" '.status == "review-ready" and .automaticPublication == false and .triangles > 0'
JOB="$(jq -r '.jobId' "${WORK}/body")"
PREVIEW="$(jq -r '.previewUrl' "${WORK}/body")"
if [[ "${JOB}" =~ ^[0-9a-f]{32}$ ]]; then pass "job id is a 32-hex token"; else fail "job id malformed: ${JOB}"; fi
if [ "${PREVIEW}" = "/asset-api/jobs/${JOB}/model.glb" ]; then pass "preview URL points at the job"; else fail "preview URL mismatch: ${PREVIEW}"; fi

call "${BASE}${PREVIEW}"
expect_status "preview GLB is served" 200
if grep -qi '^content-type: model/gltf-binary' "${WORK}/headers"; then pass "preview has GLB media type"; else fail "preview media type wrong"; fi
if [ "$(head -c 4 "${WORK}/body")" = "glTF" ]; then pass "preview starts with glTF magic"; else fail "preview is not a GLB"; fi

call "${BASE}/asset-api/jobs/${JOB}/report.json"
expect_status "report is served" 200
expect_json "report matches the upload" '.status == "review-ready"'
if [ "$(jq -r '.sourceVertices' "${WORK}/body")" = "5" ]; then pass "report source geometry is the fixture"; else fail "report geometry differs"; fi

echo "Job lookup safety"
call "${BASE}/asset-api/jobs/00000000000000000000000000000000/model.glb"
expect_status "unknown job is 404" 404
call "${BASE}/asset-api/jobs/../../../etc/passwd"
expect_status "path traversal is 404" 404
call "${BASE}/asset-api/jobs/${JOB}/source.dxf"
expect_status "source file is not publicly served" 404
call "${BASE}/asset-api/upload"
expect_status "GET on upload is not an endpoint" 404

echo "Rejected panel"
printf 'THIS IS NOT A DXF FILE\n' > "${WORK}/garbage.dxf"
call -X POST -H "origin: ${DEV_ORIGIN}" -H 'content-type: application/dxf' --data-binary "@${WORK}/garbage.dxf" "${BASE}/asset-api/upload"
expect_status "invalid DXF is rejected with 422" 422
expect_json "rejection is reported as rejected" '.status == "rejected" and (.error | length > 0)'
REJECTED="$(jq -r '.jobId' "${WORK}/body")"
call "${BASE}/asset-api/jobs/${REJECTED}/model.glb"
expect_status "rejected job produces no GLB" 404

echo
echo "Intake: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
