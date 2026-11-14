import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('overlay.py')
CONFIGURE = Path(__file__).with_name('configure.cjs')


class DeploymentTests(unittest.TestCase):
    def test_overlay_backup_conflict_and_restore(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); bundle = root / 'bundle'; site = root / 'site'; backup = root / 'backup'
            for directory in [bundle, site, backup]: directory.mkdir()
            (site / 'old.ts').write_text('original')
            (bundle / 'old.ts').write_text('fixed')
            (bundle / 'new.ts').write_text('new')
            digest = lambda value: hashlib.sha256(value.encode()).hexdigest()
            manifest = {'files': [{'path': 'old.ts', 'before': digest('original'), 'after': digest('fixed')},
                                  {'path': 'new.ts', 'before': None, 'after': digest('new')}]}
            (bundle / 'restore-manifest.json').write_text(json.dumps(manifest))
            def run(mode, src=bundle, *extra, okay=True):
                result = subprocess.run(['python3', str(SCRIPT), mode, str(src), str(site), *map(str, extra)], capture_output=True)
                self.assertEqual(result.returncode == 0, okay, result.stderr.decode())
            run('check'); run('backup', bundle, backup); run('apply')
            self.assertEqual((site / 'old.ts').read_text(), 'fixed')
            run('check')  # Idempotent overlay.
            run('restore', backup)
            self.assertEqual((site / 'old.ts').read_text(), 'original')
            self.assertFalse((site / 'new.ts').exists())
            (site / 'old.ts').write_text('newer-user-edit')
            run('check', okay=False)
            self.assertEqual((site / 'old.ts').read_text(), 'newer-user-edit')
            (site / 'old.ts').unlink(); (site / 'old.ts').symlink_to(root / 'outside')
            run('check', okay=False)

    def test_configuration_preserves_mfa_and_reuses_worker_secret(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); site = root / 'site'; output = root / 'generated'
            module = site / 'node_modules/@next/env'; module.mkdir(parents=True)
            (module / 'index.js').write_text('exports.loadEnvConfig=()=>({});')
            prior = root / 'worker.env'; prior.write_text('MODERATION_SHARED_SECRET=' + 'p' * 48 + '\n')
            values = dict(os.environ, FIREBASE_ADMIN_PROJECT_ID='demo-strova', NEXT_PUBLIC_FIREBASE_PROJECT_ID='demo-strova',
                          FIREBASE_ADMIN_CLIENT_EMAIL='test@example.invalid', FIREBASE_ADMIN_PRIVATE_KEY='test-key',
                          STROVA_MFA_ENCRYPTION_KEY='existing-mfa-must-not-change', YANDEX_S3_BUCKET='strova-test',
                          LOCAL_MODERATION_SECRET='s' * 48, MODERATION_ALLOWED_MEDIA_HOSTS='')
            result = subprocess.run(['node', str(CONFIGURE), str(site), str(output), str(prior)], env=values, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            generated = (output / 'website.env').read_text()
            self.assertIn('LOCAL_MODERATION_SECRET=' + 'p' * 48, generated)
            self.assertIn('strova-test.storage.yandexcloud.net', generated)
            self.assertNotIn('existing-mfa', generated)
            self.assertNotIn('p' * 48, result.stdout.decode())
            self.assertEqual((output / 'website.env').stat().st_mode & 0o777, 0o600)
            values['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] = 'wrong-project'
            result = subprocess.run(['node', str(CONFIGURE), str(site), str(output)], env=values, capture_output=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == '__main__':
    unittest.main()
