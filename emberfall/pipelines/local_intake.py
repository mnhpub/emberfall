#!/usr/bin/env python3
"""Loopback-only developer intake. Never deploy this HTTP server publicly."""
import json, os, re, subprocess, sys, uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
DEV_ORIGIN=os.environ.get('EMBERFALL_DEV_ORIGIN','http://127.0.0.1:5173')
if not re.fullmatch(r'http://(localhost|127\.0\.0\.1):[0-9]{1,5}',DEV_ORIGIN): raise ValueError('Development origin must be loopback HTTP with an explicit port')
ALLOWED_ORIGINS={None,DEV_ORIGIN,DEV_ORIGIN.replace('127.0.0.1','localhost')}
ROOT=Path(__file__).resolve().parents[1];JOBS=ROOT/'build/jobs';JOBS.mkdir(parents=True,exist_ok=True)
class Handler(BaseHTTPRequestHandler):
 def reply(self,status,data,kind='application/json'):
  raw=json.dumps(data).encode() if kind=='application/json' else data
  self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
 def do_POST(self):
  if self.path!='/asset-api/upload':return self.reply(404,{'error':'Not found'})
  if self.headers.get('Origin') not in ALLOWED_ORIGINS:return self.reply(403,{'error':'Origin rejected'})
  if self.headers.get('Content-Type','').split(';')[0]!='application/dxf':return self.reply(415,{'error':'Expected application/dxf'})
  try:size=int(self.headers.get('Content-Length','0'))
  except ValueError:return self.reply(400,{'error':'Invalid length'})
  if not 0<size<=2*1024*1024:return self.reply(413,{'error':'Upload must be 1 byte to 2 MiB'})
  job=uuid.uuid4().hex;folder=JOBS/job;folder.mkdir();source=folder/'source.dxf';raw=self.rfile.read(size)
  if len(raw)!=size:return self.reply(400,{'error':'Incomplete upload'})
  source.write_bytes(raw)
  try:
   result=subprocess.run([sys.executable,str(ROOT/'pipelines/dxf_pipeline.py'),str(source),'--out',str(folder)],capture_output=True,text=True,timeout=20)
   if result.returncode:raise ValueError(result.stderr[-1500:])
   report=json.loads((folder/'report.json').read_text());report['jobId']=job;report['previewUrl']=f'/asset-api/jobs/{job}/model.glb';return self.reply(200,report)
  except (ValueError,subprocess.TimeoutExpired) as exc:
   report={'jobId':job,'status':'rejected','error':str(exc)};(folder/'report.json').write_text(json.dumps(report));return self.reply(422,report)
 def do_GET(self):
  m=re.fullmatch(r'/asset-api/jobs/([0-9a-f]{32})/(model.glb|report.json)',self.path)
  if not m:return self.reply(404,{'error':'Not found'})
  p=JOBS/m[1]/m[2]
  if not p.is_file():return self.reply(404,{'error':'Not found'})
  return self.reply(200,p.read_bytes(),'model/gltf-binary' if m[2].endswith('.glb') else 'application/json; charset=utf-8')
if __name__=='__main__':
 print('Development asset intake: http://127.0.0.1:8790',flush=True)
 server=HTTPServer(('127.0.0.1',8790),Handler);server.timeout=20
 server.serve_forever()
