"""Environment-backed application settings for the Fleet360 foundation."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppSettings:
    app_env: str = "development"
    app_port: int = 8000
    data_dir: str = "src/data"

    @classmethod
    def from_environment(cls) -> "AppSettings":
        port_value = os.getenv("APP_PORT", str(cls.app_port))
        try:
            app_port = int(port_value)
        except ValueError as exc:
            raise ValueError("APP_PORT must be an integer") from exc
        if not 1 <= app_port <= 65535:
            raise ValueError("APP_PORT must be between 1 and 65535")
        return cls(
            app_env=os.getenv("APP_ENV", cls.app_env),
            app_port=app_port,
            data_dir=os.getenv("FLEET360_DATA_DIR", cls.data_dir),
        )