"""File-backed data access for the synthetic Fleet360 POC dataset."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class Fleet360Repository:
    """Read-only repository that keeps file access out of agents and APIs."""

    def __init__(self, data_path: str | Path | None = None) -> None:
        self.data_path = Path(data_path) if data_path else Path(__file__).parents[1] / "data" / "fleet360_demo.json"
        with self.data_path.open(encoding="utf-8") as data_file:
            self._data: dict[str, Any] = json.load(data_file)

    def get_shipments(self) -> list[dict[str, Any]]:
        return list(self._data["shipments"])

    def get_shipment(self, shipment_id: str) -> dict[str, Any] | None:
        return next((item for item in self.get_shipments() if item["shipment_id"] == shipment_id), None)

    def get_active_shipments(self) -> list[dict[str, Any]]:
        return [item for item in self.get_shipments() if item["status"] in {"planned", "in_transit", "delayed"}]

    def get_fleet(self) -> list[dict[str, Any]]:
        return list(self._data["fleet"])

    def get_vehicle(self, vehicle_id: str) -> dict[str, Any] | None:
        return next((item for item in self.get_fleet() if item["vehicle_id"] == vehicle_id), None)

    def get_idle_vehicles(self) -> list[dict[str, Any]]:
        return [item for item in self.get_fleet() if item["status"] == "idle"]

    def get_disruptions(self) -> list[dict[str, Any]]:
        return list(self._data["disruptions"])

    def get_active_disruptions(self) -> list[dict[str, Any]]:
        return [item for item in self.get_disruptions() if item["status"] == "active"]

    def get_disruption(self, disruption_id: str) -> dict[str, Any] | None:
        return next((item for item in self.get_disruptions() if item["disruption_id"] == disruption_id), None)

    def get_temperature_logs(self, shipment_id: str) -> list[dict[str, Any]]:
        return [item for item in self._data["temperature_logs"] if item["shipment_id"] == shipment_id]


repository = Fleet360Repository()


def get_shipments() -> list[dict[str, Any]]:
    return repository.get_shipments()


def get_shipment(shipment_id: str) -> dict[str, Any] | None:
    return repository.get_shipment(shipment_id)


def get_active_shipments() -> list[dict[str, Any]]:
    return repository.get_active_shipments()


def get_fleet() -> list[dict[str, Any]]:
    return repository.get_fleet()


def get_vehicle(vehicle_id: str) -> dict[str, Any] | None:
    return repository.get_vehicle(vehicle_id)


def get_idle_vehicles() -> list[dict[str, Any]]:
    return repository.get_idle_vehicles()


def get_disruptions() -> list[dict[str, Any]]:
    return repository.get_disruptions()


def get_active_disruptions() -> list[dict[str, Any]]:
    return repository.get_active_disruptions()


def get_disruption(disruption_id: str) -> dict[str, Any] | None:
    return repository.get_disruption(disruption_id)


def get_temperature_logs(shipment_id: str) -> list[dict[str, Any]]:
    return repository.get_temperature_logs(shipment_id)
