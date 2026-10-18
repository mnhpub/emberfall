"""Cloudflare Python Worker staging scaffold; NOT cloud-runtime verified.
Accepts job metadata for objects already uploaded by a trusted gateway.
It does not parse DXF or execute Blender. No public upload or publication route.
"""
import json, re
from urllib.parse import urlparse
from workers import WorkerEntrypoint, Response

def reply(data, status=200):
    return Response(json.dumps(data),status=status,headers={'content-type':'application/json','cache-control':'no-store'})
class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path=urlparse(request.url).path
        if path=='/health': return reply({'status':'scaffold','cloudRuntimeVerified':False})
        token=getattr(self.env,'INTAKE_TOKEN',None)
        if not token: return reply({'error':'Intake disabled'},503)
        if request.headers.get('authorization')!=f'Bearer {token}':return reply({'error':'Unauthorized'},401)
        if path!='/jobs' or request.method!='POST':return reply({'error':'Not found'},404)
        # Metadata only, strict declared length. Gateway must also enforce actual body limit.
        length=request.headers.get('content-length')
        if not length or not length.isdigit() or not 0<int(length)<=4096:return reply({'error':'Bounded metadata length required'},413)
        raw=await request.text()
        if len(raw.encode())>4096:return reply({'error':'Metadata too large'},413)
        try:
            body=json.loads(raw)
            if not isinstance(body,dict): raise ValueError('Expected object')
            digest=body.get('sourceSha256','');owner=body.get('ownerId','')
            if not isinstance(digest,str) or not re.fullmatch('[0-9a-f]{64}',digest):raise ValueError('Invalid source hash')
            if not isinstance(owner,str) or not re.fullmatch('[A-Za-z0-9_-]{8,80}',owner):raise ValueError('Invalid owner')
            if body.get('profile')!='convex-panel-v1':raise ValueError('Unsupported profile')
        except (ValueError,TypeError) as exc:return reply({'error':str(exc)},400)
        # Stable identity permits consumers to deduplicate; delivery remains at least once.
        job_id=f'{owner}-{digest}-convex-panel-v1'
        key=f'quarantine/{owner}/{digest}.dxf'
        obj=await self.env.SOURCES.head(key)
        if obj is None:return reply({'error':'Source object missing'},404)
        if obj.size>2*1024*1024:return reply({'error':'Source exceeds profile budget'},413)
        job={'schemaVersion':1,'jobId':job_id,'ownerId':owner,'sourceKey':key,'sourceSha256':digest,'profile':'convex-panel-v1'}
        await self.env.ASSET_JOBS.send(json.dumps(job))
        return reply({'jobId':job_id,'status':'queued'},202)
