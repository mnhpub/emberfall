#!/usr/bin/env python3
"""Bounded DXF profile: closed convex straight LWPOLYLINE panels, metres only.
Produces a deterministic GLB without requiring Blender; never runs source scripts.
Unsupported geometry is rejected, never silently dropped. See docs/ASSETS.md.
"""
import argparse, hashlib, json, math, struct
from pathlib import Path
import ezdxf
MAX_BYTES=2*1024*1024
MAX_ENTITIES=64
MAX_VERTICES=256

def process(source, destination):
    source=Path(source); out=Path(destination)
    if source.stat().st_size>MAX_BYTES: raise ValueError('Input exceeds 2 MiB')
    raw=source.read_bytes()
    if len(raw)>MAX_BYTES: raise ValueError('Input exceeds 2 MiB')
    doc=ezdxf.readfile(source)
    if doc.header.get('$INSUNITS')!=6: raise ValueError('DXF units must be metres (INSUNITS=6)')
    entities=list(doc.modelspace())
    if not 1<=len(entities)<=MAX_ENTITIES: raise ValueError('Entity budget exceeded or empty input')
    vertices=[];faces=[]; repairs=[]; original=0
    for entity in entities:
        if entity.dxftype()!='LWPOLYLINE' or not entity.closed: raise ValueError('Only closed LWPOLYLINE entities supported')
        if tuple(entity.dxf.extrusion)!=(0,0,1) or entity.dxf.elevation!=0: raise ValueError('Only XY plane outlines at elevation zero supported')
        points=list(entity.get_points('xyb')); original+=len(points)
        if len(points)>MAX_VERTICES: raise ValueError('Vertex budget exceeded')
        clean=[]
        for x,y,bulge in points:
            if bulge!=0: raise ValueError('Curved segments require the future Blender tessellation profile')
            if not all(math.isfinite(v) and abs(v)<=100 for v in (x,y)): raise ValueError('Nonfinite or out-of-bounds coordinate')
            if not clean or math.dist(clean[-1],(x,y))>1e-7: clean.append((x,y))
            else: repairs.append('removed adjacent duplicate vertex')
        if len(clean)>1 and math.dist(clean[0],clean[-1])<=1e-7: clean.pop();repairs.append('removed closing duplicate')
        n=len(clean)
        if n<3: raise ValueError('Degenerate outline')
        cross=lambda a,b,c:(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])
        turns=[cross(clean[i],clean[(i+1)%n],clean[(i+2)%n]) for i in range(n)]
        if all(t<0 for t in turns): clean.reverse()
        elif not all(t>1e-9 for t in turns): raise ValueError('Outline must be strictly convex, without collinear vertices')
        # A convex boundary must contain every other vertex on its interior side.
        for i in range(n):
            a,b=clean[i],clean[(i+1)%n]
            if any((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) < -1e-9 for p in clean): raise ValueError('Self intersection or nonconvex ordering')
        offset=len(vertices)
        vertices.extend((x,y,z) for z in (0,0.25) for x,y in clean)
        for i in range(1,n-1): faces.extend([(offset,offset+i+1,offset+i),(offset+n,offset+n+i,offset+n+i+1)])
        for i in range(n):
            j=(i+1)%n;faces.extend([(offset+i,offset+j,offset+n+j),(offset+i,offset+n+j,offset+n+i)])
    if len(faces)>4096: raise ValueError('Triangle budget exceeded')
    # Z-up CAD -> Y-up glTF; winding retained by a proper rotation.
    positions=[(x,z,-y) for x,y,z in vertices]
    vb=b''.join(struct.pack('<3f',*v) for v in positions);ib=b''.join(struct.pack('<3I',*f) for f in faces);binary=vb+ib
    gltf={'asset':{'version':'2.0','generator':'Emberfall convex-panel-v1'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
      'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1,'material':0}]}],
      'materials':[{'pbrMetallicRoughness':{'baseColorFactor':[0.48,0.45,0.4,1],'metallicFactor':0,'roughnessFactor':0.85}}],
      'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(vb),'target':34962},{'buffer':0,'byteOffset':len(vb),'byteLength':len(ib),'target':34963}],
      'accessors':[{'bufferView':0,'componentType':5126,'count':len(positions),'type':'VEC3','min':[min(v[i] for v in positions) for i in range(3)],'max':[max(v[i] for v in positions) for i in range(3)]},{'bufferView':1,'componentType':5125,'count':len(faces)*3,'type':'SCALAR'}]}
    js=json.dumps(gltf,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    glb=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    report={'schemaVersion':1,'profile':'convex-panel-v1','sourceSha256':hashlib.sha256(raw).hexdigest(),'outputSha256':hashlib.sha256(glb).hexdigest(),'units':'metres','sourceVertices':original,'outputVertices':len(vertices),'triangles':len(faces),'repairs':repairs,'status':'review-ready','automaticPublication':False,'limitations':['fixed 0.25m extrusion','no LOD, hull lofting, curved segments or automatic decimation','bounds only; no collision mesh exported'],'bounds':gltf['accessors'][0]}
    out.mkdir(parents=True,exist_ok=True);(out/'model.glb').write_bytes(glb);(out/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    return report
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--out',required=True);a=p.parse_args()
    try: print(json.dumps(process(a.source,a.out)))
    except Exception as exc: p.exit(1,f'Asset rejected: {exc}\n')
