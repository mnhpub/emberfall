import importlib.util, json, struct, tempfile, unittest
from pathlib import Path
import ezdxf
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pipeline',ROOT/'pipelines/dxf_pipeline.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Assets(unittest.TestCase):
 def test_fixture_valid_glb_and_budget(self):
  with tempfile.TemporaryDirectory() as t:
   r=module.process(ROOT/'fixtures/ship-panel.dxf',t);b=(Path(t)/'model.glb').read_bytes()
   magic,version,size=struct.unpack('<4sII',b[:12]);self.assertEqual((magic,version,size),(b'glTF',2,len(b)));self.assertEqual(r['triangles'],16)
   n,kind=struct.unpack('<I4s',b[12:20]);g=json.loads(b[20:20+n]);self.assertEqual(g['accessors'][1]['count'],48)
 def test_reject_unsupported_open_curve_selfintersect_and_units(self):
  for points,closed,units in [([(0,0),(1,0),(0,1)],False,6),([(0,0,1),(1,0,0),(0,1,0)],True,6),([(0,0),(1,1),(0,1),(1,0)],True,6), ([(0,0),(1,0),(0,1)],True,1)]:
   with self.subTest(points=points),tempfile.TemporaryDirectory() as t:
    d=ezdxf.new();d.header['$INSUNITS']=units;d.modelspace().add_lwpolyline(points,format='xyb' if len(points[0])==3 else 'xy',close=closed);p=Path(t)/'bad.dxf';d.saveas(p)
    with self.assertRaises(ValueError):module.process(p,Path(t)/'out')
 def test_duplicate_repair(self):
  with tempfile.TemporaryDirectory() as t:
   d=ezdxf.new();d.header['$INSUNITS']=6;d.modelspace().add_lwpolyline([(0,0),(1,0),(1,0),(1,1),(0,1)],close=True);p=Path(t)/'dup.dxf';d.saveas(p)
   self.assertTrue(module.process(p,Path(t)/'out')['repairs'])
if __name__=='__main__':unittest.main()
