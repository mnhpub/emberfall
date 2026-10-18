# Validation — large ferry/reference frames 0.5.0

Local verification: 42 Node tests and 4 Python tests, client/Worker type checks,
Python syntax, production web build and DXF conversion smoke. Captured output is
in CHECK_OUTPUT_0.5.txt. Browser evidence is in BROWSER_OUTPUT_0.5.txt.

Vessel coverage includes transform round trips, tapered deck bounds, masts and
cabin doorway, public-command boarding/walking/helm/sailing/coasting/pier exit,
reference-frame persistence, unsafe exits, moving boarding/handling rejection,
world/river clearance and invalid dt. Legacy save migrations and malformed ferry
attachments are checked. Skiff reaches the offshore gangway through public
movement commands; cargo lots transfer without changing identity or provenance.
All earlier profession, crafting, expedition and trade tests remain enabled.

Chromium smoke: profession/workshop, DXF preview, cargo/quota rollback, shuttle,
ferry boarding, actual keyboard deck walking, overview camera, helm/sail input,
release/coasting and save reload. Helm fixture is built through core commands;
keyboard acceleration waits for measured saved speed, not a fixed frame count.
The overview and following camera screenshots were inspected locally. Initial
camera position uses the restored player location to avoid a distant reload view.

No cloud deployment, remote CI, native packaging, real-player session, multiplayer
crew/authority, network reconnect, hydrodynamic/seakeeping, Blender execution,
full CAD hull import, authored character animation or capacity benchmark is claimed.
The fixture is a scale reference and reference-frame foundation, not finished art
or a construction-ready vessel. Main web bundle remains above Vite's warning size.

GitHub publication is still conditional on successful authenticated write access;
see PR_QUEUE.md. Local acceptance does not imply receiver or v1.0 acceptance.
