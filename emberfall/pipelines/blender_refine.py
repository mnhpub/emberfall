"""Optional isolated Blender post-process. Input must be a trusted pipeline GLB.
blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python pipelines/blender_refine.py -- input.glb output.glb
Not wired to a cloud executor. Run inside a sandbox with CPU/memory/time/network limits.
"""
import sys
from pathlib import Path
import bpy
args=sys.argv[sys.argv.index('--')+1:]
if len(args)!=2: raise ValueError('Expected input.glb output.glb')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(Path(args[0]).resolve()))
for obj in list(bpy.context.scene.objects):
    if obj.type!='MESH': continue
    if len(obj.data.polygons)>100000: raise ValueError('Mesh face budget exceeded')
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    weld=obj.modifiers.new('Weld within 10 micrometres','WELD');weld.merge_threshold=0.00001
    bpy.ops.object.modifier_apply(modifier=weld.name)
    tri=obj.modifiers.new('Triangulate','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
    obj.select_set(False)
bpy.ops.export_scene.gltf(filepath=str(Path(args[1]).resolve()),export_format='GLB')
