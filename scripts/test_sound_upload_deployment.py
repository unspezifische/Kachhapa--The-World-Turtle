import importlib.util
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    'sound_upload_deployment', ROOT / 'scripts/check-sound-upload-deployment.py')
CHECKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKS)


class SoundUploadDeploymentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = (ROOT / 'kachhapa-sound-worker.service').read_text()
        cls.compose = (ROOT / 'docker-compose.yaml').read_text()
        cls.root_helper = (ROOT / 'scripts/kachhapa-deploy-root').read_text()
        cls.sudoers = (ROOT / 'scripts/kachhapa-publish.sudoers').read_text()
        cls.publisher = (ROOT / 'publish.sh').read_text()
        with tempfile.TemporaryDirectory() as directory:
            rendered = Path(directory) / 'nginx.conf'
            subprocess.run(
                ['bash', 'scripts/render-nginx-config.sh', 'raspberrypii.local', str(rendered), 'nginx.conf'],
                cwd=ROOT, check=True, capture_output=True, text=True)
            cls.nginx = rendered.read_text()

    def test_queue_worker_and_proxy_contract(self):
        CHECKS.validate(self.worker, self.nginx, self.compose)

    def test_missing_low_priority_setting_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Nice=10'):
            CHECKS.validate(self.worker.replace('Nice=10', 'Nice=0'), self.nginx, self.compose)

    def test_short_upload_timeout_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'client_body_timeout'):
            CHECKS.validate(self.worker, self.nginx.replace('client_body_timeout 3600s;', 'client_body_timeout 60s;', 1), self.compose)

    def test_publish_preflight_detects_an_outdated_root_helper(self):
        self.assertIn('capabilities)', self.root_helper)
        self.assertIn('kachhapa-deploy-root capabilities', self.sudoers)
        self.assertIn('predates the sound-worker deployment operation', self.publisher)
        self.assertIn('configure-publish-sudo.sh $target_host_short', self.publisher)

    def test_publish_preflight_allows_an_omitted_tailscale_argument(self):
        self.assertIn('tailscale_ip=${9:-}', self.publisher)
        completed = subprocess.run(
            ['bash', '-uc', 'tailscale_ip=${9:-}; test -z "$tailscale_ip"',
             'remote-preflight', '1', '2', '3', '4', '5', '6', '7', '8'],
            check=False, capture_output=True, text=True,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)

    def test_raw_ip_uses_root_app_on_both_pi_profiles(self):
        for hostname in ('raspberrypi.local', 'raspberrypii.local'):
            with self.subTest(hostname=hostname), tempfile.TemporaryDirectory() as directory:
                rendered = Path(directory) / 'nginx.conf'
                subprocess.run(['bash', 'scripts/render-nginx-config.sh', hostname,
                                str(rendered), 'nginx.conf'], cwd=ROOT, check=True)
                config = rendered.read_text()
                defaults = re.findall(r'listen\s+80\s+default_server\s*;\s*server_name\s+([^;]+);', config)
                self.assertEqual(defaults, ['app.' + hostname])

    def test_runtime_conversion_and_missing_package_repair(self):
        for missing in (False, True):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as directory:
                bin_dir = Path(directory)
                # An isolated PATH prevents tests from invoking the real apt.
                for name in ('mktemp', 'rm', 'grep'):
                    (bin_dir / name).symlink_to(shutil.which(name))
                scripts = {
                    'file': 'exit 0',
                    'ffmpeg': 'echo ffmpeg >> "$CHECK_LOG"; exit "${ENCODE_STATUS:-0}"',
                    'ffprobe': 'echo ffprobe >> "$CHECK_LOG"; echo mp3',
                }
                for name, body in scripts.items():
                    path = bin_dir / name
                    path.write_text('#!/bin/sh\n' + body + '\n')
                    path.chmod(0o755)
                if missing:
                    (bin_dir / 'ffmpeg').rename(bin_dir / 'encoder')
                apt = bin_dir / 'apt-get'
                apt.write_text('#!/bin/sh\necho "apt $*" >> "$CHECK_LOG"\n'
                               'if [ "$1" = install ]; then /bin/cp "$TEST_BIN/encoder" "$TEST_BIN/ffmpeg"; fi\n')
                apt.chmod(0o755)
                log = bin_dir / 'calls'
                env = dict(os.environ, PATH=directory, CHECK_LOG=str(log), TEST_BIN=directory)
                result = subprocess.run([shutil.which('bash'), 'scripts/kachhapa-deploy-root', 'runtime-deps'],
                                        cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                calls = log.read_text()
                self.assertIn('ffmpeg\nffprobe\n', calls)
                self.assertEqual('apt install -y ffmpeg' in calls, missing)
                if not missing:
                    self.assertNotIn('apt ', calls)
                env['ENCODE_STATUS'] = '1'
                result = subprocess.run([shutil.which('bash'), 'scripts/kachhapa-deploy-root', 'runtime-deps'],
                                        cwd=ROOT, env=env, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('runtime check failed', result.stderr)


if __name__ == '__main__':
    unittest.main()
