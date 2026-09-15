"""
Agent 1 — Weather Intelligence
Chain: disruption → affected shipments → deadline risk →
       alternative route → idle vehicle match → RecoveryRecommendation
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any

from ..models.domain import (
    AgentType, RecoveryRecommendation, RecommendationType,
    Severity, WeatherAssessment, WeatherShipmentImpact,
)
from ..repository import Fleet360Repository

_SEVERITY_RANK  = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
_DELAY_HOURS    = {"LOW": 2.0, "MEDIUM": 4.0, "HIGH": 8.0, "CRITICAL": 16.0}
_IMPACT_CUTOFF  = {"CRITICAL": 5, "HIGH": 3, "MEDIUM": 2}


class WeatherAgent:
    """Assess weather disruptions and produce per-shipment impact + recommendations."""

    def __init__(self, repo: Fleet360Repository) -> None:
        self._repo = repo

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def assess_all(self) -> list[WeatherAssessment]:
        return [
            a for d in self._repo.get_active_disruptions()
            if (a := self.assess(d["disruption_id"])) is not None
        ]

    def assess(self, disruption_id: str) -> WeatherAssessment | None:
        disruption = self._repo.get_disruption(disruption_id)
        if not disruption or disruption.get("status") != "active":
            return None

        now = _parse_dt(disruption["observed_at"])
        impacts = tuple(
            self._assess_shipment(s, disruption, now)
            for s in self._repo.get_active_shipments()
            if self._route_affected(s, disruption)
        )
        return WeatherAssessment(
            disruption_id=disruption_id,
            disruption_title=disruption["title"],
            affected_location=disruption["location"],
            affected_routes=tuple(disruption["affected_routes"]),
            affected_shipments=impacts,
        )

    def assess_shipment(self, shipment_id: str, disruption_id: str) -> WeatherShipmentImpact | None:
        shipment   = self._repo.get_shipment(shipment_id)
        disruption = self._repo.get_disruption(disruption_id)
        if not shipment or not disruption or disruption.get("status") != "active":
            return None
        if not self._route_affected(shipment, disruption):
            return None
        return self._assess_shipment(shipment, disruption, _parse_dt(disruption["observed_at"]))

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _route_affected(self, shipment: dict[str, Any], disruption: dict[str, Any]) -> bool:
        location_aliases = _aliases(disruption["location"])
        shipment_points  = {_norm(p) for p in [shipment["current_location"]] + shipment["route"]}
        if location_aliases & shipment_points:
            return True
        return any(_corridor_match(shipment["route"], seg) for seg in disruption["affected_routes"])

    def _assess_shipment(
        self,
        shipment: dict[str, Any],
        disruption: dict[str, Any],
        observed_at: datetime,
    ) -> WeatherShipmentImpact:
        route_affected  = any(_corridor_match(shipment["route"], seg) for seg in disruption["affected_routes"])
        cargo_sensitive = bool(shipment.get("temperature_required") or shipment["cargo_type"] in {"pharmaceuticals", "food"})
        deadline_press  = _deadline_pressure(shipment["deadline"], observed_at)
        impact_level    = self._impact_level(disruption["severity"], shipment["priority"], cargo_sensitive, deadline_press)
        delay           = min(float(disruption["expected_duration_hours"]), _DELAY_HOURS[disruption["severity"].upper()])

        reasons: list[str] = []
        if route_affected:
            reasons.append(f"Route passes through affected corridor ({disruption['location']})")
        if cargo_sensitive:
            reasons.append(f"Cargo type '{shipment['cargo_type']}' requires careful handling")
        if deadline_press in {"HIGH", "CRITICAL"}:
            reasons.append(f"Delivery deadline pressure is {deadline_press.lower()}")
        reasons.append(f"Disruption severity: {disruption['severity'].upper()}")

        rec = self._build_recommendation(shipment, disruption, impact_level, delay)

        return WeatherShipmentImpact(
            shipment_id=shipment["shipment_id"],
            disruption_id=disruption["disruption_id"],
            impact_level=impact_level,
            reasons=tuple(reasons),
            estimated_delay_hours=delay,
            route_affected=route_affected,
            cargo_sensitive=cargo_sensitive,
            deadline_pressure=deadline_press,
            recommendation=rec,
        )

    def _build_recommendation(
        self,
        shipment: dict[str, Any],
        disruption: dict[str, Any],
        impact_level: Severity,
        delay: float,
    ) -> RecoveryRecommendation | None:
        if impact_level == Severity.LOW:
            return None

        alt_routes   = self._repo.get_alternative_routes()
        idle         = self._repo.get_idle_vehicles()
        locations    = self._repo.get_locations()

        # Find best alternative route for any affected corridor
        alt_route: str | None = None
        for seg in disruption["affected_routes"]:
            if seg in alt_routes:
                alt_route = alt_routes[seg][0]
                break

        # Find best idle vehicle for this shipment
        best_vehicle = _best_idle_vehicle(
            shipment, idle, locations,
            require_refrigerated=bool(shipment.get("temperature_required")),
        )

        rec_type = RecommendationType.REROUTE if alt_route else RecommendationType.HOLD_SHIPMENT
        if best_vehicle and bool(shipment.get("temperature_required")):
            rec_type = RecommendationType.REDEPLOY_VEHICLE

        title = f"Reroute {shipment['shipment_id']} via {alt_route}" if alt_route else f"Hold {shipment['shipment_id']} — disruption ahead"
        desc_parts = [f"Disruption '{disruption['title']}' affects this shipment's route."]
        if alt_route:
            desc_parts.append(f"Recommended alternate path: {alt_route}.")
        if best_vehicle:
            desc_parts.append(
                f"Idle vehicle {best_vehicle['vehicle_id']} ({best_vehicle['vehicle_type']}) "
                f"is available in {best_vehicle['current_location']} — consider redeployment."
            )

        return RecoveryRecommendation(
            recommendation_id=f"REC-W-{shipment['shipment_id']}-{disruption['disruption_id']}",
            shipment_id=shipment["shipment_id"],
            event_id=disruption["disruption_id"],
            agent_type=AgentType.WEATHER,
            recommendation_type=rec_type,
            priority=1 if impact_level == Severity.CRITICAL else 2,
            title=title,
            description=" ".join(desc_parts),
            alternative_route=alt_route,
            suggested_vehicle_id=best_vehicle["vehicle_id"] if best_vehicle else None,
            suggested_carrier=None,
            estimated_saving_hours=delay * 0.6,
        )

    def _impact_level(self, sev: str, priority: str, sensitive: bool, deadline: str) -> Severity:
        score = _SEVERITY_RANK[sev.upper()]
        if priority.lower() in {"critical"}:
            score += 1
        elif priority.lower() == "high":
            score += 0.5
        if sensitive:
            score += 1
        if deadline == "CRITICAL":
            score += 1
        elif deadline == "HIGH":
            score += 0.5
        if score >= _IMPACT_CUTOFF["CRITICAL"]:
            return Severity.CRITICAL
        if score >= _IMPACT_CUTOFF["HIGH"]:
            return Severity.HIGH
        if score >= _IMPACT_CUTOFF["MEDIUM"]:
            return Severity.MEDIUM
        return Severity.LOW


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _norm(v: str) -> str:
    return v.strip().lower()

def _aliases(location: str) -> set[str]:
    n = _norm(location)
    result = {n}
    for suffix in (" port", " airport", " region"):
        if n.endswith(suffix):
            result.add(n.removesuffix(suffix))
    return result

def _corridor_match(route: list[str], segment: str) -> bool:
    parts = [_norm(p) for p in segment.split("-")]
    if len(parts) != 2:
        return False
    normed = [_norm(p) for p in route]
    try:
        i = normed.index(parts[0])
        normed.index(parts[1], i + 1)
        return True
    except ValueError:
        pass
    try:
        i = normed.index(parts[1])
        normed.index(parts[0], i + 1)
        return True
    except ValueError:
        return False

def _parse_dt(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)

def _deadline_pressure(deadline: str, observed_at: datetime) -> str:
    hours = (_parse_dt(deadline) - observed_at).total_seconds() / 3600
    if hours <= 24:
        return "CRITICAL"
    if hours <= 48:
        return "HIGH"
    if hours <= 96:
        return "MEDIUM"
    return "LOW"

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Approximate distance in km between two lat/lng points."""
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi  = math.radians(lat2 - lat1)
    dlam  = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _best_idle_vehicle(
    shipment: dict[str, Any],
    idle: list[dict[str, Any]],
    locations: dict[str, dict[str, float]],
    require_refrigerated: bool,
) -> dict[str, Any] | None:
    origin_loc = locations.get(shipment["origin"])
    if not origin_loc:
        return None
    candidates = [
        v for v in idle
        if (not require_refrigerated or v.get("refrigerated"))
        and v["capacity"] >= shipment["weight"]
    ]
    if not candidates:
        return None
    def score(v: dict[str, Any]) -> float:
        loc = locations.get(v["current_location"])
        dist = _haversine(origin_loc["lat"], origin_loc["lng"], loc["lat"], loc["lng"]) if loc else 9999
        return dist
    return min(candidates, key=score)
