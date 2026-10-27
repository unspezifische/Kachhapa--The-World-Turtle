"""Exercise installation and rollback of the MTG Socket.IO systemd unit."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class MtgServiceDeploymentTests(unittest.TestCase):
    def run_helper(self, fail_restart=False, valid=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = root / 'mtg-backend.service.new'
            units = root / 'units'
            units.mkdir()
            active = units / 'mtg-backend.service'
            active.write_text('previous unit\n')
            service = (ROOT / 'MtG-webapp/backend/mtg-backend.service').read_text()
            candidate.write_text(service if valid else service.replace('--workers 1', '--workers 4'))
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            for name in ('grep', 'cp', 'mv', 'rm', 'install'):
                (bin_dir / name).symlink_to(shutil.which(name))
            # Install into a temp directory without attempting ownership changes.
            (bin_dir / 'install').unlink()
            (bin_dir / 'install').write_text('#!/bin/sh\nwhile [ "$#" -gt 2 ]; do shift; done\n/bin/cp "$1" "$2"\n')
            (bin_dir / 'runuser').write_text('#!/bin/sh\necho dependency-import >> "$CALL_LOG"\n')
            (bin_dir / 'systemctl').write_text(
                '#!/bin/sh\necho "$*" >> "$CALL_LOG"\n'
                'if [ "$1" = restart ] && [ "${FAIL_RESTART:-}" = 1 ] && [ ! -e "$FAILED_ONCE" ]; then\n'
                '  : > "$FAILED_ONCE"; exit 1\nfi\n')
            for name in ('install', 'runuser', 'systemctl'):
                (bin_dir / name).chmod(0o755)
            source = (ROOT / 'scripts/kachhapa-deploy-root').read_text()
            source = source[:source.index('\ncase "${1:-}" in')]
            source = source.replace('/home/ijohnson/mtg-backend.service.new', str(candidate))
            source = source.replace('/etc/systemd/system/mtg-backend.service', str(active))
            log = root / 'calls'
            result = subprocess.run([shutil.which('bash'), '-c', source + '\ninstall_mtg_service\n'],
                env=dict(os.environ, PATH=str(bin_dir), CALL_LOG=str(log),
                         FAIL_RESTART='1' if fail_restart else '0', FAILED_ONCE=str(root / 'failed')),
                capture_output=True, text=True)
            return result, active.read_text(), service, log.read_text() if log.exists() else ''

    def test_installs_single_worker_unit_and_reloads_systemd(self):
        result, actual, expected, calls = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(actual, expected)
        self.assertIn('dependency-import\ndaemon-reload\nrestart mtg-backend\nis-active --quiet mtg-backend', calls)

    def test_failed_restart_restores_previous_unit_and_reloads(self):
        result, actual, _, calls = self.run_helper(fail_restart=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(actual, 'previous unit\n')
        self.assertEqual(calls.count('daemon-reload'), 2)
        self.assertIn('previous unit was restored', result.stderr)

    def test_multiworker_candidate_is_rejected_before_installation(self):
        result, actual, _, calls = self.run_helper(valid=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(actual, 'previous unit\n')
        self.assertEqual(calls, '')


if __name__ == '__main__':
    unittest.main()
