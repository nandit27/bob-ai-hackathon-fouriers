"""
Fleet Redeployment Engine
Matches idle vehicles to disrupted / high-priority shipments
based on location proximity, capacity, and refrigeration requirements.
"""
from __future__ import annotations

import math
from typing import Any

from ..models.domain import RedeploymentMatch
from ..repository import Fleet360Repository


class RedeploymentEngine:
    """Score all idle vehicles against all at-risk shipments."""

    def __init__(self, repo: Fleet360Repository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_matches_for_shipment(self, shipment_id: str) -> list[RedeploymentMatch]:
        shipment = self._repo.get_shipment(shipment_id)
        if not shipment:
            return []
        idle      = self._repo.get_idle_vehicles()
        locations = self._repo.get_locations()
        matches   = [
            m for v in idle
            if (m := self._score(shipment, v, locations)) is not None
        ]
        return sorted(matches, key=lambda m: m.fit_score, reverse=True)

    def get_all_matches(self) -> dict[str, list[RedeploymentMatch]]:
        """Return best idle vehicle matches for every at-risk shipment."""
        at_risk = [
            s for s in self._repo.get_active_shipments()
            if s["status"] in {"delayed"} or s["priority"] in {"critical", "high"}
        ]
        return {s["shipment_id"]: self.get_matches_for_shipment(s["shipment_id"]) for s in at_risk}

    def get_best_match(self, shipment_id: str) -> RedeploymentMatch | None:
        matches = self.get_matches_for_shipment(shipment_id)
        return matches[0] if matches else None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _score(
        self,
        shipment: dict[str, Any],
        vehicle: dict[str, Any],
        locations: dict[str, dict[str, float]],
    ) -> RedeploymentMatch | None:
        # Hard constraints
        if vehicle["capacity"] < shipment["weight"]:
            return None
        if shipment.get("temperature_required") and not vehicle.get("refrigerated"):
            return None

        origin_loc  = locations.get(shipment["origin"])
        vehicle_loc = locations.get(vehicle["current_location"])
        if not origin_loc or not vehicle_loc:
            return None

        dist_km = _haversine(
            origin_loc["lat"], origin_loc["lng"],
            vehicle_loc["lat"], vehicle_loc["lng"],
        )

        # Fit score: combination of proximity (70%) + capacity headroom (20%) + fuel (10%)
        max_dist     = 1500.0
        prox_score   = max(0.0, 1.0 - dist_km / max_dist)
        cap_headroom = min(1.0, (vehicle["capacity"] - shipment["weight"]) / vehicle["capacity"])
        fuel_score   = vehicle.get("fuel_level", 50) / 100.0
        fit_score    = 0.70 * prox_score + 0.20 * cap_headroom + 0.10 * fuel_score

        return RedeploymentMatch(
            shipment_id=shipment["shipment_id"],
            vehicle_id=vehicle["vehicle_id"],
            vehicle_type=vehicle["vehicle_type"],
            vehicle_location=vehicle["current_location"],
            distance_km=dist_km,
            capacity_kg=vehicle["capacity"],
            refrigerated=bool(vehicle.get("refrigerated")),
            driver=vehicle.get("driver", ""),
            fit_score=fit_score,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
