# Validation — private authority 0.6.0

Verified locally: **58 Node tests and 4 Python tests**, client/Worker type checks,
Python syntax, production web build and DXF conversion smoke. See
CHECK_OUTPUT_0.6.txt and BROWSER_OUTPUT_0.6.txt. The final additional capacity test
was rerun with the full Node suite; the combined capture identifies this rerun.

The 16 new authority tests exercise signed credentials, expiry, scope and tamper
rejection; disabled configuration; denied origins; actor/room isolation and header
spoofing; command and nested cargo validation; duplicate and conflicting sequences;
transaction rollback; competing commands; reconstruction after instance eviction;
server-timed movement; body limits; cargo debit/journal atomicity; a response lost
after commit; persistent intent recovery; storage failure before send; explicit
conflict reconciliation; rate limits; and aggregate-capacity failure without receipt
or state loss. Existing expedition, object, vessel and logistics tests stay enabled.

The existing Chromium gameplay regression passes: profession/crafting/equipment,
DXF inspection/preview, cargo transfer and local quota rollback, offshore shuttle,
ferry boarding/deck walking, helm/sails, coasting and local reload. No page errors.

The new `make test-authority` starts **actual local Wrangler/workerd with SQLite
Durable Object storage**, a Vite client and Chromium. It issues an ephemeral signed
credential; joins through the game UI; selects a different online profession;
commits gathering while intentionally dropping its acknowledgement; observes one
resource after retry; checks that tokens are absent from localStorage; restores
the distinct local character; restarts the Worker process against the same SQLite
directory; verifies persisted online profession/inventory; reconnects through the
UI; and checks for page errors. It passed. The successful screenshot
`build/screenshots/authority-reconnect.png` was inspected locally.

Wrangler initially failed in this sandbox's network-interface auto-detection.
Explicit loopback and inspector ports avoid that probe without bypassing the
sandbox. The first browser run then exposed an unbound native-fetch call; the
client transport was corrected and the actual integration passed afterward.
The smoke uses ports 8787/5190/9231 and deletes its temporary configuration,
credential and database directory after completion. No cloud account is contacted
for provisioning or deployment.

Scope limits: authoritative expeditions are private to each actor/room. This is
not shared multiplayer, shared ferry control, cross-player trade, public identity
onboarding, refresh/revocation, regional ranking, a capacity/cost benchmark, cloud
backup/restore proof, native build proof or v1.0 acceptance. Movement is capped,
server-timed and unpredicted; idle time is discarded. At 120,000 aggregate bytes or
the domain journal boundary, further writes fail closed pending archival tooling.
The web bundle still triggers Vite's size warning. Blender and cloud asset queues
remain separate unfinished work. Queue item 05 is explicitly partial.
