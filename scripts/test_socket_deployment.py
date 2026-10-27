import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "socket_deployment", ROOT / "scripts/check-socket-deployment-config.py")
CHECKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKS)


class SocketDeploymentConfigTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = (ROOT / "kachhapa-backend.service").read_text()
        with tempfile.TemporaryDirectory() as directory:
            rendered = Path(directory) / "nginx.conf"
            subprocess.run(
                ["bash", "scripts/render-nginx-config.sh", "raspberrypii.local", str(rendered), "nginx.conf"],
                cwd=ROOT, check=True, capture_output=True, text=True)
            cls.nginx = rendered.read_text()

    def test_rendered_configuration_supports_polling_and_upgrade(self):
        CHECKS.validate_service(self.service)
        CHECKS.validate_nginx(self.nginx)

    def test_multiworker_service_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "exactly one worker"):
            CHECKS.validate_service(self.service.replace("-w 1", "-w 4"))

    def test_unconditional_upgrade_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Connection"):
            CHECKS.validate_nginx(self.nginx.replace(
                "proxy_set_header Connection $connection_upgrade;",
                'proxy_set_header Connection "Upgrade";'))

    def test_query_string_logging_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "query strings"):
            CHECKS.validate_nginx(self.nginx.replace(
                '"$request_method $uri $server_protocol"',
                '"$request_method $request_uri $server_protocol"', 1))


if __name__ == "__main__":
    unittest.main()
