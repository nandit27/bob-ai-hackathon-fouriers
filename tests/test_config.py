import os
import unittest
from unittest.mock import patch

from src.fleet360.config import AppSettings


class ConfigurationTests(unittest.TestCase):
    def test_environment_values_are_loaded(self) -> None:
        with patch.dict(
            os.environ,
            {
                "APP_ENV": "test",
                "APP_PORT": "8100",
                "FLEET360_DATA_DIR": "fixtures",
            },
            clear=False,
        ):
            settings = AppSettings.from_environment()

        self.assertEqual(settings.app_env, "test")
        self.assertEqual(settings.app_port, 8100)
        self.assertEqual(settings.data_dir, "fixtures")

    def test_invalid_port_is_rejected(self) -> None:
        with patch.dict(os.environ, {"APP_PORT": "not-a-port"}, clear=False):
            with self.assertRaises(ValueError):
                AppSettings.from_environment()


if __name__ == "__main__":
    unittest.main()