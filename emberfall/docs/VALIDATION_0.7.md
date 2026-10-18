# Validation — shared colony authority 0.7.0

Final local verification: **74 Node tests and 4 Python tests**; client/Worker type
checks, Python syntax, production web build, DXF conversion and both browser suites
pass. The web bundle still triggers Vite’s size warning.

The shared slice adds tests for common finite resources/private inventories,
public projections, non-multiplied room time, exclusive helm ownership, crew frame
transforms, lease expiry/takeover, cargo consent, cancellation/expiry/proximity,
partial handoff conservation, original provenance and condition, common demand,
shared warehouse capacity, ownership/collision boundaries, actor/room isolation,
last-resource contention, replay after a lost handoff acknowledgement, instance
reconstruction, non-caller write rollback, bounded admission, a public-command
cross-player consigned voyage/completion and distinct private/shared client outboxes.
The foreign-structure test also attempts an overlapping placement, checks denial,
and succeeds at a separate clear location before checking blocked walking. The
16-test shared suite was rerun after strengthening that assertion; its output is
appended to the check capture.

All earlier simulation, logistics, private authority, Worker and Python checks stay
enabled. CHECK_OUTPUT_0.7.txt records final counts and build/conversion evidence.

The existing gameplay Chromium regression passes profession/crafting/equipment,
DXF inspection, cargo/quota rollback and single-player ferry deck/helm/coasting/save
reload. BROWSER_OUTPUT_0.7.txt contains its output and the authority integration.

The expanded authority smoke uses **actual local Wrangler/workerd and SQLite**:

1. Private-mode authentication, lost gathering acknowledgement, one resulting
   resource, separate local save, real Worker restart and reconnect still pass.
2. Two isolated browser contexts enter the same shared room with different signed
   identities. Common timber decreases in both views while inventories remain
   separate. The sender deposits through the dock UI, offers through the crew UI,
   and the named recipient accepts. The test drops the acceptance response after
   commit; retry leaves one recipient lot and one acceptance event. Both custody
   records survive a process restart and both browsers reconnect.
3. Both authenticated characters shuttle offshore, board and walk the deck to
   the helm using actual keyboard input. One acquires control; the second is
   refused. The first sets sails and accelerates the common ferry, then disconnects.
   The lease expires, sails furl and the second passenger takes control. The first
   reconnects aboard as a deck passenger, preserving the vessel reference frame.

`build/screenshots/shared-custody.png` and `shared-ferry-crew.png` were inspected
locally. Integration uses ephemeral credentials and a temporary SQLite directory;
it does not provision or deploy cloud resources. CI already invokes this expanded
`make test-authority` target. No remote CI result is claimed.

Not certified: public identity/refresh/revocation, eight simultaneous players,
capacity or cost envelope, latency/jitter SLO, alarms/offline simulation, operator
archival/backup/restore or deployed recovery, native packages, Blender execution,
cloud asset publication, commercial entitlements or official rankings. Characters
and private boats can overlap. Workstations/crates remain owner-operated. Manual
signed actor/room grants are the current membership mechanism. V1.0 and receiving
team acceptance remain open.
