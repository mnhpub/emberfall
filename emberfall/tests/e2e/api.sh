#!/usr/bin/env bash
# Curl contract suite against a real local Worker (workerd + Durable Objects).
# Starts its own Worker with throwaway secrets; never touches staging or production.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${API_PORT:-8795}"
BASE="http://127.0.0.1:${PORT}"
CLIENT_ORIGIN="http://127.0.0.1:5190"
PLAYER="player_001"
OTHER="player_002"
command -v jq >/dev/null || { echo "jq is required"; exit 1; }
curl -s -m 1 -o /dev/null "${BASE}/api/health" && { echo "Port ${PORT} already in use"; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/emberfall-api-XXXXXX")"
WORKER_PID=""
cleanup() {
  if [ -n "${WORKER_PID}" ]; then kill -TERM -- "-${WORKER_PID}" 2>/dev/null || true; fi
  rm -rf "${WORK}"
}
trap cleanup EXIT

STAGING_TOKEN="$(node -e 'console.log(crypto.randomUUID()+crypto.randomUUID())')"
SIGNING_KEY="$(node -e 'console.log(crypto.randomUUID()+crypto.randomUUID())')"
cat > "${WORK}/wrangler.toml" <<EOF
name = "emberfall-api-curl"
main = "${ROOT}/worker/index.ts"
compatibility_date = "2026-10-17"
compatibility_flags = ["nodejs_compat"]

[vars]
CLIENT_ORIGIN = "${CLIENT_ORIGIN}"

[[durable_objects.bindings]]
name = "WORLD_ROOMS"
class_name = "WorldRoom"

[[durable_objects.bindings]]
name = "AUTHORITY_SESSIONS"
class_name = "AuthoritySession"

[[durable_objects.bindings]]
name = "SHARED_WORLDS"
class_name = "SharedWorld"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["WorldRoom", "AuthoritySession", "SharedWorld"]
EOF
printf 'SESSION_TOKEN="%s"\nPLAYER_ID="%s"\nAUTHORITY_SIGNING_KEY="%s"\n' \
  "${STAGING_TOKEN}" "${PLAYER}" "${SIGNING_KEY}" > "${WORK}/.dev.vars"
chmod 600 "${WORK}/.dev.vars"

# Own process group so cleanup also stops workerd.
set -m
(cd "${ROOT}" && WRANGLER_SEND_METRICS=false exec npx wrangler dev --local \
  --config "${WORK}/wrangler.toml" --ip 127.0.0.1 --port "${PORT}" \
  --inspector-port 9241 --persist-to "${WORK}/state") > "${WORK}/worker.log" 2>&1 &
WORKER_PID=$!
set +m

for _ in $(seq 1 160); do
  curl -sf -m 2 -o /dev/null "${BASE}/api/health" && break
  sleep 0.25
done
curl -sf -m 2 -o /dev/null "${BASE}/api/health" || { cat "${WORK}/worker.log"; echo "Worker did not start"; exit 1; }

mint() { AUTHORITY_SIGNING_KEY="${SIGNING_KEY}" node --experimental-strip-types "${ROOT}/scripts/issue-session.ts" "$1" "$2" "${3:-900}" 2>/dev/null; }
TOKEN="$(mint "${PLAYER}" haven)"
OTHER_TOKEN="$(mint "${OTHER}" haven)"
ROOM_TOKEN="$(mint "${PLAYER}" otherroom)"
FOREIGN_TOKEN="$(AUTHORITY_SIGNING_KEY=wrong-key-wrong-key-wrong-key-wrong-key node --experimental-strip-types "${ROOT}/scripts/issue-session.ts" "${PLAYER}" haven 2>/dev/null)"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

# call METHOD_AND_ARGS... -> sets STATUS, writes body to $WORK/body, headers to $WORK/headers
call() {
  STATUS="$(curl -sS -m 10 -o "${WORK}/body" -D "${WORK}/headers" -w '%{http_code}' "$@")" || STATUS=000
}
expect_status() { # name expected
  if [ "${STATUS}" = "$2" ]; then pass "$1"; else fail "$1 (expected HTTP $2, got ${STATUS}: $(head -c 200 "${WORK}/body"))"; fi
}
expect_json() { # name jq-filter
  if jq -e "$2" "${WORK}/body" >/dev/null 2>&1; then pass "$1"; else fail "$1 (body: $(head -c 300 "${WORK}/body"))"; fi
}
expect_header() { # name header-regex
  if grep -qiE "^$2" "${WORK}/headers"; then pass "$1"; else fail "$1 (headers: $(grep -iE '^(content-type|access-control)' "${WORK}/headers" | tr '\r\n' '  '))"; fi
}

echo "Health and CORS"
call "${BASE}/api/health"
expect_status "health returns 200" 200
expect_header "health is JSON" 'content-type: application/json'
expect_json "health reports emberfall-api ok" '.status == "ok" and .service == "emberfall-api"'
call -X OPTIONS "${BASE}/api/health"
expect_status "preflight returns 200" 200
expect_header "preflight allows authorization header" 'access-control-allow-headers: content-type,authorization'

echo "Staging gate (persistent API)"
call "${BASE}/api/save"
expect_status "save without credentials is rejected" 401
call -H "authorization: Bearer not-the-token" "${BASE}/api/save"
expect_status "save with wrong bearer is rejected" 401
expect_json "rejection body is a generic error" '.error == "Unauthorized"'
call "${BASE}/api/nope"
expect_status "unknown route without credentials is 401, not 404" 401
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/nope"
expect_status "unknown route with credentials is 404" 404
head -c 70000 /dev/zero | tr '\0' 'a' > "${WORK}/large.json"
call -X POST -H "authorization: Bearer ${STAGING_TOKEN}" -H 'content-type: application/json' \
  --data-binary "@${WORK}/large.json" "${BASE}/api/save"
expect_status "oversized body is rejected with 413" 413

echo "Room presence (staging credentials)"
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/room/alpha/state"
expect_status "empty room state readable" 200
expect_json "empty room has zero players" '.players == 0 and .room == "active"'
call -X POST -H "authorization: Bearer ${STAGING_TOKEN}" -H 'content-type: application/json' \
  -d "{\"playerId\":\"${PLAYER}\",\"x\":1,\"z\":2}" "${BASE}/api/room/alpha/presence"
expect_status "presence heartbeat accepted for owner" 200
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/room/alpha/state"
expect_json "heartbeat is visible to the room" '.players == 1'
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/room/beta/state"
expect_json "other rooms are isolated" '.players == 0'
call -X POST -H "authorization: Bearer ${STAGING_TOKEN}" -H 'content-type: application/json' \
  -d "{\"playerId\":\"${OTHER}\",\"x\":0,\"z\":0}" "${BASE}/api/room/alpha/presence"
expect_status "presence for a different player is refused" 403
call -X POST -H "authorization: Bearer ${STAGING_TOKEN}" -H 'content-type: application/json' \
  -d '{"playerId":"short"}' "${BASE}/api/room/alpha/presence"
expect_status "invalid playerId is refused" 400
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/room/alpha/extra/state"
expect_status "malformed room route is refused" 400
call -H "authorization: Bearer ${STAGING_TOKEN}" "${BASE}/api/room/bad.id/state"
expect_status "invalid room id is refused" 400

echo "Authority (signed per-player sessions)"
call "${BASE}/api/authority/haven/snapshot"
expect_status "snapshot without token is 401" 401
call -H "authorization: Bearer ${FOREIGN_TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_status "token signed with another key is 401" 401
call -H "authorization: Bearer ${ROOM_TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_status "token scoped to another room is 401" 401
call -H "authorization: Bearer ${TOKEN}" -H "origin: http://evil.example" "${BASE}/api/authority/haven/snapshot"
expect_status "foreign origin is 403" 403
call -H "authorization: Bearer ${TOKEN}" -H "origin: ${CLIENT_ORIGIN}" "${BASE}/api/authority/haven/snapshot"
expect_status "client origin is allowed" 200
call -X POST -H "authorization: Bearer ${TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_status "POST to snapshot is 405" 405
call -H "authorization: Bearer ${TOKEN}" "${BASE}/api/authority/haven/unknown"
expect_status "unknown authority path is 404" 404
call -H "authorization: Bearer ${TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_json "fresh session snapshot starts at sequence 0" '.protocol == 1 and .actor == "player_001" and .room == "haven" and .sequence == 0'
expect_header "authority responses are not cacheable JSON" 'cache-control: no-store'

CMD1='{"sequence":1,"commandId":"cmd-curl-1","command":{"type":"choose-profession","profession":"fisher"}}'
sleep 0.2 # clear the Worker's 75 ms per-command rate window after the snapshot read
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' -d "${CMD1}" "${BASE}/api/authority/haven/command"
expect_status "valid command is committed" 200
expect_json "command advances sequence and profession" '.sequence == 1 and .state.profession == "fisher"'
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' -d "${CMD1}" "${BASE}/api/authority/haven/command"
expect_status "identical retry is accepted" 200
expect_json "identical retry is flagged duplicate and not reapplied" '.duplicate == true and .sequence == 1'
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d '{"sequence":5,"commandId":"cmd-curl-skip","command":{"type":"choose-profession","profession":"transport"}}' \
  "${BASE}/api/authority/haven/command"
expect_status "skipped sequence is a conflict" 409
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d '{"sequence":2,"commandId":"cmd-curl-1","command":{"type":"choose-profession","profession":"transport"}}' \
  "${BASE}/api/authority/haven/command"
expect_status "reused commandId with new sequence is a conflict" 409
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d '{"sequence":2,"commandId":"cmd-curl-2","command":{"type":"choose-profession","profession":"fisher","inventory":{"wood":9999}}}' \
  "${BASE}/api/authority/haven/command"
expect_status "client-supplied inventory is rejected" 400
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' \
  -d '{"sequence":2,"commandId":"cmd-curl-3"}' "${BASE}/api/authority/haven/command"
expect_status "envelope without command is rejected" 400
PADDED="{\"sequence\":2,\"commandId\":\"cmd-curl-big\",\"command\":{\"type\":\"choose-profession\",\"profession\":\"fisher\"},\"pad\":\"$(head -c 9000 /dev/zero | tr '\0' 'x')\"}"
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' -d "${PADDED}" "${BASE}/api/authority/haven/command"
expect_status "command over 8 KiB is rejected with 413" 413
call -X POST -H "authorization: Bearer ${TOKEN}" -H 'content-type: application/json' -d 'not json' "${BASE}/api/authority/haven/command"
expect_status "malformed JSON command is rejected" 400

call -H "authorization: Bearer ${OTHER_TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_status "second player gets their own session" 200
expect_json "second player's session is independent" '.actor == "player_002" and .sequence == 0 and .state.profession != "fisher"'
call -H "authorization: Bearer ${TOKEN}" "${BASE}/api/authority/haven/snapshot"
expect_json "first player's committed state is durable across reads" '.sequence == 1 and .state.profession == "fisher"'

echo
echo "API: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ]
