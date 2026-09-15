"""Fleet360 backend — repository (read-only, file-backed)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class Fleet360Repository:
    """Loads the fleet operations JSON dataset once and exposes typed query methods."""

    def __init__(self, data_path: str | Path | None = None) -> None:
        path = Path(data_path) if data_path else Path(__file__).parent / "data" / "fleet360.json"
        with path.open(encoding="utf-8") as fh:
            self._data: dict[str, Any] = json.load(fh)

    # ------------------------------------------------------------------
    # Shipments
    # ------------------------------------------------------------------
    def get_shipments(self) -> list[dict[str, Any]]:
        return list(self._data["shipments"])

    def get_shipment(self, shipment_id: str) -> dict[str, Any] | None:
        return next((s for s in self.get_shipments() if s["shipment_id"] == shipment_id), None)

    def get_active_shipments(self) -> list[dict[str, Any]]:
        return [s for s in self.get_shipments() if s["status"] in {"planned", "in_transit", "delayed"}]

    # ------------------------------------------------------------------
    # Fleet
    # ------------------------------------------------------------------
    def get_fleet(self) -> list[dict[str, Any]]:
        return list(self._data["fleet"])

    def get_vehicle(self, vehicle_id: str) -> dict[str, Any] | None:
        return next((v for v in self.get_fleet() if v["vehicle_id"] == vehicle_id), None)

    def get_idle_vehicles(self) -> list[dict[str, Any]]:
        return [v for v in self.get_fleet() if v["status"] == "idle"]

    # ------------------------------------------------------------------
    # Disruptions
    # ------------------------------------------------------------------
    def get_disruptions(self) -> list[dict[str, Any]]:
        return list(self._data["disruptions"])

    def get_disruption(self, disruption_id: str) -> dict[str, Any] | None:
        return next((d for d in self.get_disruptions() if d["disruption_id"] == disruption_id), None)

    def get_active_disruptions(self) -> list[dict[str, Any]]:
        return [d for d in self.get_disruptions() if d["status"] == "active"]

    # ------------------------------------------------------------------
    # Geopolitical events
    # ------------------------------------------------------------------
    def get_geopolitical_events(self) -> list[dict[str, Any]]:
        return list(self._data["geopolitical_events"])

    def get_geopolitical_event(self, event_id: str) -> dict[str, Any] | None:
        return next((e for e in self.get_geopolitical_events() if e["event_id"] == event_id), None)

    def get_active_geopolitical_events(self) -> list[dict[str, Any]]:
        return [e for e in self.get_geopolitical_events() if e["status"] == "active"]

    # ------------------------------------------------------------------
    # Temperature logs
    # ------------------------------------------------------------------
    def get_temperature_logs(self, shipment_id: str) -> list[dict[str, Any]]:
        return [t for t in self._data["temperature_logs"] if t["shipment_id"] == shipment_id]

    def get_all_temperature_logs(self) -> list[dict[str, Any]]:
        return list(self._data["temperature_logs"])

    # ------------------------------------------------------------------
    # Reference data
    # ------------------------------------------------------------------
    def get_carriers(self) -> list[dict[str, Any]]:
        return list(self._data["carriers"])

    def get_carrier(self, carrier_id: str) -> dict[str, Any] | None:
        return next((c for c in self.get_carriers() if c["carrier_id"] == carrier_id), None)

    def get_locations(self) -> dict[str, dict[str, float]]:
        return dict(self._data["locations"])

    def get_alternative_routes(self) -> dict[str, list[str]]:
        return dict(self._data["alternative_routes"])
