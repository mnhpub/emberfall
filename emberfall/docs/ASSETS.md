# Asset profile and refinement

## Executable profile: convex-panel-v1

- Input <=2 MiB; DXF parsed by ezdxf 1.4.4, not filename checks alone.
- Metres (`$INSUNITS=6`), XY plane, zero elevation, default extrusion direction.
- 1–64 closed LWPOLYLINE entities, <=256 source vertices per entity.
- Straight edges only; absolute coordinates <=100 metres, finite numbers only.
- Strictly convex simple boundaries; unsupported/open/curved/nonconvex entities
  fail the job. Collinear vertices are rejected rather than guessed away.
- Adjacent duplicate points are removed at 1e-7 metre tolerance.
- Reverse clockwise outlines, triangulate, extrude 0.25m, rotate into glTF Y-up.
- Maximum 4096 output triangles. GLB contains one material and a position mesh.
- Source/output SHA-256, geometry counts, repairs and bounds in report.json.

This is an operational first polygon refinement profile, NOT a general hull
reconstruction, curved-surface tessellator, retopology engine or LOD generator.
No collision mesh is exported; bounds can seed a later box collider. The sample
panel has 5 source vertices, 10 output vertices and 16 triangles.

`make asset-smoke` creates `build/assets/ship-panel/model.glb` and report.json.
`make asset-server` enables uploads through Vite dev; outputs are job-specific
under ignored `build/jobs/`. Upload selection is a local developer action.
Approving the preview only places that model in the current client scene.

## Optional Blender refinement

`pipelines/blender_refine.py` imports a pipeline-generated GLB, applies a tiny
weld modifier and triangulation, then exports GLB. It has NOT been executed in
this session because Blender is not installed. No decimation or LOD claim.

Run only in isolated compute with memory/CPU/disk limits and a wall-clock timeout:

```sh
blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python pipelines/blender_refine.py -- input.glb output.glb
```

Pin and validate the Blender version before enabling it in a release pipeline.
Do not accept uploaded .blend scripts or an arbitrary executable from a job.

## Required production additions

Actual bounded streaming at the upload gateway; private object lifecycle;
immutable source hash verification at execution; resource-isolated workers;
retry leases and dead-letter handling; durable job status; authenticated review;
atomic publication; manifests; error previews; LOD, normals and collision checks;
hull-specific dimensional tolerances; removal of expired sources; performance
benchmarks. Do not expose the loopback server as a substitute.

Reference documentation consulted:
- https://developers.cloudflare.com/workers/languages/python/
- https://docs.blender.org/manual/en/4.0/advanced/command_line/arguments.html
