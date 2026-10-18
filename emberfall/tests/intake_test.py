import importlib.util,json,tempfile,threading,unittest,urllib.request,urllib.error
from pathlib import Path
from http.server import HTTPServer
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('intake',ROOT/'pipelines/local_intake.py');intake=importlib.util.module_from_spec(spec);spec.loader.exec_module(intake)
class Intake(unittest.TestCase):
 def test_upload_fetch_and_reject(self):
  with tempfile.TemporaryDirectory() as directory:
   intake.JOBS=Path(directory);server=HTTPServer(('127.0.0.1',0),intake.Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));base=f'http://127.0.0.1:{server.server_port}'
   try:
    req=urllib.request.Request(base+'/asset-api/upload',data=(ROOT/'fixtures/ship-panel.dxf').read_bytes(),headers={'Content-Type':'application/dxf'})
    with opener.open(req) as r:report=json.load(r)
    self.assertEqual(report['status'],'review-ready')
    with opener.open(base+report['previewUrl']) as r:self.assertEqual(r.read()[:4],b'glTF')
    for data,headers,status in [(b'garbage',{'Content-Type':'application/dxf'},422),(b'a',{'Content-Type':'text/plain'},415),(b'a',{'Content-Type':'application/dxf','Origin':'https://untrusted.test'},403)]:
     with self.assertRaises(urllib.error.HTTPError) as e:opener.open(urllib.request.Request(base+'/asset-api/upload',data=data,headers=headers))
     self.assertEqual(e.exception.code,status)
   finally:server.shutdown();server.server_close();thread.join()
if __name__=='__main__':unittest.main()
