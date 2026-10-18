# Python intake scaffold

Not deployed or runtime-tested. Syntax checked only. This is a private staging
metadata coordinator, not an upload server or completed cloud pipeline.

A trusted gateway authenticates users, bounds uploads, computes/verifies SHA-256,
and stores immutable source objects at `quarantine/{owner}/{sha256}.dxf` in R2.
Then it POSTs `{ownerId,sourceSha256,profile:"convex-panel-v1"}` to `/jobs` with
the private `INTAKE_TOKEN`. This scaffold checks metadata and source existence,
then sends a deterministic job envelope to a Queue. It trusts the gateway's
owner assertion; do not expose its token to a game client.

Provision R2 and the queue; establish a pinned `workers-py`/uv environment and
validate using pywrangler before enabling a private route. No speculative SDK
lockfile is supplied. See official Python Workers docs:
https://developers.cloudflare.com/workers/languages/python/

Missing: upload gateway, durable job ledger, consumer/compute adapter, hash
verification at execution, leases, retry/DLQ management, result callback,
approval authorization and immutable publication. Consumers must deduplicate the
job ID and independently verify source bytes; a queue message is not proof of a
completed or unique job. Do not substitute an arbitrary executable URL in a job.
