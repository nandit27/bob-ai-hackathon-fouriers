"""Deterministic weather disruption assessment over the Fleet360 repository."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from .domain import AgentType, DisruptionType, Severity, StandardizedAgentEvent


class WeatherDataSource(Protocol):
    """Repository shape required by the agent; replaceable by a weather adapter later."""

    def get_active_shipments(self) -> list[dict[str, Any]]: ...

    def get_disruptions(self) -> list[dict[str, Any]]: ...

    def get_disruption(self, disruption_id: str) -> dict[str, Any] | None: ...


@dataclass(frozen=True)
class ShipmentImpactAssessment:
    shipment_id: str
    disruption_id: str
    impact_level: str
    reason: str
    reasons: tuple[str, ...]
    estimated_delay_hours: float
    route_affected: bool
    cargo_sensitivity: str
    deadline_pressure: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "shipment_id": self.shipment_id,
            "disruption_id": self.disruption_id,
            "impact_level": self.impact_level,
            "reason": self.reason,
            "reasons": list(self.reasons),
            "estimated_delay_hours": self.estimated_delay_hours,
            "route_affected": self.route_affected,
            "cargo_sensitivity": self.cargo_sensitivity,
            "deadline_pressure": self.deadline_pressure,
        }


@dataclass(frozen=True)
class WeatherAssessment:
    disruption_id: str
    disruption_title: str
    affected_location: str
    affected_routes: tuple[str, ...]
    affected_shipments: tuple[ShipmentImpactAssessment, ...]
    standardized_event: StandardizedAgentEvent

    def to_dict(self) -> dict[str, Any]:
        return {
            "disruption_id": self.disruption_id,
            "disruption_title": self.disruption_title,
            "affected_location": self.affected_location,
            "affected_routes": list(self.affected_routes),
            "affected_shipments": [item.to_dict() for item in self.affected_shipments],
            "standardized_event": self.standardized_event.to_dict(),
        }


class WeatherIntelligenceAgent:
    """Assess synthetic weather disruptions without external weather APIs."""

    _severity_rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
    _delay_by_severity = {"LOW": 2.0, "MEDIUM": 4.0, "HIGH": 8.0, "CRITICAL": 16.0}
    _impact_thresholds = {"CRITICAL": 5, "HIGH": 3, "MEDIUM": 2}

    def __init__(self, data_source: WeatherDataSource) -> None:
        self.data_source = data_source

    def assess_disruption(self, disruption_id: str) -> WeatherAssessment | None:
        disruption = self.data_source.get_disruption(disruption_id)
        if disruption is None or disruption.get("status") != "active":
            return None

        observed_at = _parse_datetime(disruption["observed_at"])
        impacts = tuple(
            self._assess_shipment(shipment, disruption, observed_at)
            for shipment in self.data_source.get_active_shipments()
            if self._matches(shipment, disruption)
        )
        event = StandardizedAgentEvent(
            event_id=f"WEATHER-{disruption_id}",
            schema_version="1.0",
            agent_type=AgentType.WEATHER,
            event_type=DisruptionType.WEATHER,
            severity=_severity(disruption["severity"]),
            occurred_at=observed_at,
            received_at=observed_at,
            source_reference=disruption["source"],
            confidence=0.95,
            location_ids=(disruption["location"],),
            shipment_ids=tuple(item.shipment_id for item in impacts),
            vehicle_ids=tuple(
                shipment["assigned_vehicle_id"]
                for shipment in self.data_source.get_active_shipments()
                if shipment["shipment_id"] in {item.shipment_id for item in impacts}
            ),
            payload={
                "disruption_id": disruption_id,
                "affected_location": disruption["location"],
                "affected_routes": disruption["affected_routes"],
                "impact_assessment_count": len(impacts),
                "evidence": [item.reason for item in impacts],
            },
        )
        return WeatherAssessment(
            disruption_id=disruption_id,
            disruption_title=disruption["title"],
            affected_location=disruption["location"],
            affected_routes=tuple(disruption["affected_routes"]),
            affected_shipments=impacts,
            standardized_event=event,
        )

    def assess_all(self) -> list[WeatherAssessment]:
        return [
            assessment
            for disruption in self.data_source.get_disruptions()
            if (assessment := self.assess_disruption(disruption["disruption_id"])) is not None
        ]

    def find_affected_shipments(self, disruption_id: str) -> list[dict[str, Any]]:
        """Return active shipment records whose route or current area is affected."""
        disruption = self.data_source.get_disruption(disruption_id)
        if disruption is None or disruption.get("status") != "active":
            return []
        return [
            shipment
            for shipment in self.data_source.get_active_shipments()
            if self._matches(shipment, disruption)
        ]

    def assess_shipment_impact(
        self,
        shipment_id: str,
        disruption_id: str,
    ) -> ShipmentImpactAssessment | None:
        """Assess one shipment against one active disruption."""
        shipment = next(
            (item for item in self.data_source.get_active_shipments() if item["shipment_id"] == shipment_id),
            None,
        )
        disruption = self.data_source.get_disruption(disruption_id)
        if shipment is None or disruption is None or disruption.get("status") != "active":
            return None
        if not self._matches(shipment, disruption):
            return None
        return self._assess_shipment(
            shipment,
            disruption,
            _parse_datetime(disruption["observed_at"]),
        )

    def _matches(self, shipment: dict[str, Any], disruption: dict[str, Any]) -> bool:
        disruption_locations = _location_aliases(disruption["location"])
        shipment_locations = {_normalize_location(shipment["current_location"])}
        shipment_locations.update(_normalize_location(point) for point in shipment["route"])
        if disruption_locations & shipment_locations:
            return True
        return any(_route_in_corridor(shipment["route"], affected) for affected in disruption["affected_routes"])

    def _assess_shipment(
        self,
        shipment: dict[str, Any],
        disruption: dict[str, Any],
        observed_at: datetime,
    ) -> ShipmentImpactAssessment:
        route_affected = any(_route_in_corridor(shipment["route"], affected) for affected in disruption["affected_routes"])
        location_affected = bool(_location_aliases(disruption["location"]) & {
            _normalize_location(shipment["current_location"]),
            *(_normalize_location(point) for point in shipment["route"]),
        })
        cargo_sensitivity = _cargo_sensitivity(shipment)
        deadline_pressure = _deadline_pressure(shipment["deadline"], observed_at)
        impact_level = self._impact_level(disruption["severity"], shipment["priority"], cargo_sensitivity, deadline_pressure)
        reasons = []
        if route_affected:
            reasons.append("Current route passes through an affected route segment")
        if location_affected:
            reasons.append(f"Shipment is currently routing through the affected {disruption['location']} area")
        if cargo_sensitivity != "LOW":
            reasons.append(f"{cargo_sensitivity.title()} cargo sensitivity for {shipment['cargo_type'].replace('_', ' ')}")
        if deadline_pressure != "LOW":
            reasons.append(f"Delivery deadline pressure is {deadline_pressure.lower()}")
        reasons.append(f"Disruption severity is {disruption['severity'].upper()}")
        delay = min(float(disruption["expected_duration_hours"]), self._delay_by_severity[disruption["severity"].upper()])
        return ShipmentImpactAssessment(
            shipment_id=shipment["shipment_id"],
            disruption_id=disruption["disruption_id"],
            impact_level=impact_level,
            reason="; ".join(reasons),
            reasons=tuple(reasons),
            estimated_delay_hours=delay,
            route_affected=route_affected,
            cargo_sensitivity=cargo_sensitivity,
            deadline_pressure=deadline_pressure,
        )

    def _impact_level(self, disruption: str, priority: str, cargo: str, deadline: str) -> str:
        score = self._severity_rank[disruption.upper()]
        if priority.lower() == "critical":
            score += 1
        elif priority.lower() == "high":
            score += 0.5
        if cargo == "HIGH":
            score += 1
        if deadline == "CRITICAL":
            score += 1
        elif deadline == "HIGH":
            score += 0.5
        if score >= self._impact_thresholds["CRITICAL"]:
            return "CRITICAL"
        if score >= self._impact_thresholds["HIGH"]:
            return "HIGH"
        if score >= self._impact_thresholds["MEDIUM"]:
            return "MEDIUM"
        return "LOW"


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _severity(value: str) -> Severity:
    return Severity(value.lower())


def _normalize_location(value: str) -> str:
    return value.strip().lower()


def _location_aliases(value: str) -> set[str]:
    normalized = _normalize_location(value)
    aliases = {normalized}
    for suffix in (" port", " airport", " region"):
        if normalized.endswith(suffix):
            aliases.add(normalized.removesuffix(suffix))
    return aliases


def _normalize_route(value: str) -> tuple[str, str] | None:
    parts = [_normalize_location(part) for part in value.split("-")]
    return tuple(parts) if len(parts) == 2 and all(parts) else None


def _route_segments(route: list[str]) -> list[tuple[str, str]]:
    return [(_normalize_location(start), _normalize_location(end)) for start, end in zip(route, route[1:])]


def _route_matches(segment: tuple[str, str], affected_route: str) -> bool:
    affected = _normalize_route(affected_route)
    return affected is not None and (segment == affected or segment == (affected[1], affected[0]))


def _route_in_corridor(route: list[str], affected_route: str) -> bool:
    affected = _normalize_route(affected_route)
    if affected is None:
        return False
    normalized_route = [_normalize_location(point) for point in route]
    forward = _ordered_waypoints(normalized_route, affected[0], affected[1])
    reverse = _ordered_waypoints(normalized_route, affected[1], affected[0])
    return forward or reverse


def _ordered_waypoints(route: list[str], start: str, end: str) -> bool:
    try:
        start_index = route.index(start)
        end_index = route.index(end, start_index + 1)
    except ValueError:
        return False
    return start_index < end_index


def _cargo_sensitivity(shipment: dict[str, Any]) -> str:
    if shipment["temperature_required"] or shipment["cargo_type"] in {"pharmaceuticals", "food"}:
        return "HIGH"
    if shipment["value"] >= 10_000_000 or shipment["priority"] in {"critical", "high"}:
        return "MEDIUM"
    return "LOW"


def _deadline_pressure(deadline: str, observed_at: datetime) -> str:
    hours = (_parse_datetime(deadline) - observed_at).total_seconds() / 3600
    if hours <= 24:
        return "CRITICAL"
    if hours <= 48:
        return "HIGH"
    if hours <= 96:
        return "MEDIUM"
    return "LOW"
