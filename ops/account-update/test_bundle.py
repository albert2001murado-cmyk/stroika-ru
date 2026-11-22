import hashlib,json,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
HELPER=Path(__file__).with_name('bundle.py')
class BundleTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.src=self.root/'source';self.app=self.root/'app';self.backup=self.root/'backup'
  self.src.mkdir();self.app.mkdir();(self.src/'code').mkdir();(self.app/'code').mkdir();(self.src/'code/existing.ts').write_text('new');(self.src/'code/new.ts').write_text('added');(self.app/'code/existing.ts').write_text('old')
  digest=lambda value:hashlib.sha256(value.encode()).hexdigest()
  self.manifest={'files':[{'path':'code/existing.ts','before':digest('old'),'after':digest('new')},{'path':'code/new.ts','before':None,'after':digest('added')}]}
  (self.src/'account-update-manifest.json').write_text(json.dumps(self.manifest))
 def tearDown(self):self.temp.cleanup()
 def run_tool(self,mode,src=None,target=None,*extra):return subprocess.run([sys.executable,str(HELPER),mode,str(src or self.src),str(target or self.app),*map(str,extra)],capture_output=True,text=True)
 def test_unknown_edit_is_not_overwritten(self):
  (self.app/'code/existing.ts').write_text('user edit');self.assertNotEqual(self.run_tool('check').returncode,0);self.assertEqual((self.app/'code/existing.ts').read_text(),'user edit')
 def test_apply_and_restore_previous_files(self):
  self.assertEqual(self.run_tool('check').returncode,0);self.assertEqual(self.run_tool('backup',None,None,self.backup).returncode,0);self.assertEqual(self.run_tool('apply').returncode,0);self.assertEqual((self.app/'code/new.ts').read_text(),'added')
  self.assertEqual(self.run_tool('restore',self.backup).returncode,0);self.assertEqual((self.app/'code/existing.ts').read_text(),'old');self.assertFalse((self.app/'code/new.ts').exists())
 def test_identical_installed_release_can_be_applied_again(self):
  self.assertEqual(self.run_tool('apply').returncode,0);self.assertEqual(self.run_tool('check').returncode,0)
 def test_corrupt_payload_is_rejected_before_apply(self):
  (self.src/'code/new.ts').write_text('damaged');self.assertNotEqual(self.run_tool('check').returncode,0);self.assertEqual((self.app/'code/existing.ts').read_text(),'old')
 def test_symlink_destination_is_rejected(self):
  (self.app/'code/existing.ts').unlink();(self.app/'code/existing.ts').symlink_to(self.root/'outside');self.assertNotEqual(self.run_tool('check').returncode,0)
if __name__=='__main__':unittest.main()
