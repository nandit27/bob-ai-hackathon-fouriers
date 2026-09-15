"""Fleet360 backend — domain models (immutable dataclasses)."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Severity(str, Enum):
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


class AgentType(str, Enum):
    WEATHER      = "weather"
    GEOPOLITICAL = "geopolitical"
    COLD_CHAIN   = "cold_chain"


class RecommendationType(str, Enum):
    REROUTE          = "reroute"
    REDEPLOY_VEHICLE = "redeploy_vehicle"
    CHANGE_CARRIER   = "change_carrier"
    HOLD_SHIPMENT    = "hold_shipment"
    INSPECT_CARGO    = "inspect_cargo"
    EXPEDITE         = "expedite"


# ---------------------------------------------------------------------------
# Shared recommendation
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RecoveryRecommendation:
    recommendation_id:      str
    shipment_id:            str
    event_id:               str
    agent_type:             AgentType
    recommendation_type:    RecommendationType
    priority:               int          # 1 = most urgent
    title:                  str
    description:            str
    alternative_route:      str | None
    suggested_vehicle_id:   str | None
    suggested_carrier:      str | None
    estimated_saving_hours: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "recommendation_id":      self.recommendation_id,
            "shipment_id":            self.shipment_id,
            "event_id":               self.event_id,
            "agent_type":             self.agent_type.value,
            "recommendation_type":    self.recommendation_type.value,
            "priority":               self.priority,
            "title":                  self.title,
            "description":            self.description,
            "alternative_route":      self.alternative_route,
            "suggested_vehicle_id":   self.suggested_vehicle_id,
            "suggested_carrier":      self.suggested_carrier,
            "estimated_saving_hours": self.estimated_saving_hours,
        }


# ---------------------------------------------------------------------------
# Weather agent output
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class WeatherShipmentImpact:
    shipment_id:            str
    disruption_id:          str
    impact_level:           Severity
    reasons:                tuple[str, ...]
    estimated_delay_hours:  float
    route_affected:         bool
    cargo_sensitive:        bool
    deadline_pressure:      str
    recommendation:         RecoveryRecommendation | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "shipment_id":            self.shipment_id,
            "disruption_id":          self.disruption_id,
            "impact_level":           self.impact_level.value,
            "reasons":                list(self.reasons),
            "estimated_delay_hours":  self.estimated_delay_hours,
            "route_affected":         self.route_affected,
            "cargo_sensitive":        self.cargo_sensitive,
            "deadline_pressure":      self.deadline_pressure,
            "recommendation":         self.recommendation.to_dict() if self.recommendation else None,
        }


@dataclass(frozen=True)
class WeatherAssessment:
    disruption_id:      str
    disruption_title:   str
    affected_location:  str
    affected_routes:    tuple[str, ...]
    affected_shipments: tuple[WeatherShipmentImpact, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "disruption_id":      self.disruption_id,
            "disruption_title":   self.disruption_title,
            "affected_location":  self.affected_location,
            "affected_routes":    list(self.affected_routes),
            "affected_shipments": [s.to_dict() for s in self.affected_shipments],
        }


# ---------------------------------------------------------------------------
# Geopolitical agent output
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GeopoliticalShipmentImpact:
    shipment_id:            str
    event_id:               str
    event_title:            str
    affected_commodity:     str
    impact_level:           Severity
    reasons:                tuple[str, ...]
    estimated_delay_hours:  float
    recommended_carriers:   tuple[str, ...]
    alternative_routes:     tuple[str, ...]
    recommendation:         RecoveryRecommendation | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "shipment_id":           self.shipment_id,
            "event_id":              self.event_id,
            "event_title":           self.event_title,
            "affected_commodity":    self.affected_commodity,
            "impact_level":          self.impact_level.value,
            "reasons":               list(self.reasons),
            "estimated_delay_hours": self.estimated_delay_hours,
            "recommended_carriers":  list(self.recommended_carriers),
            "alternative_routes":    list(self.alternative_routes),
            "recommendation":        self.recommendation.to_dict() if self.recommendation else None,
        }


@dataclass(frozen=True)
class GeopoliticalAssessment:
    event_id:           str
    event_title:        str
    event_type:         str
    severity:           Severity
    affected_shipments: tuple[GeopoliticalShipmentImpact, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id":           self.event_id,
            "event_title":        self.event_title,
            "event_type":         self.event_type,
            "severity":           self.severity.value,
            "affected_shipments": [s.to_dict() for s in self.affected_shipments],
        }


# ---------------------------------------------------------------------------
# Cold chain agent output
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ColdChainAlert:
    alert_id:               str
    shipment_id:            str
    vehicle_id:             str
    cargo_type:             str
    current_temp:           float
    min_safe:               float
    max_safe:               float
    excursion_since:        str          # ISO timestamp of first breach log
    excursion_duration_min: float
    severity:               Severity
    nearest_depot:          str
    action_required:        str
    recommendation:         RecoveryRecommendation

    def to_dict(self) -> dict[str, Any]:
        return {
            "alert_id":               self.alert_id,
            "shipment_id":            self.shipment_id,
            "vehicle_id":             self.vehicle_id,
            "cargo_type":             self.cargo_type,
            "current_temp":           self.current_temp,
            "min_safe":               self.min_safe,
            "max_safe":               self.max_safe,
            "excursion_since":        self.excursion_since,
            "excursion_duration_min": self.excursion_duration_min,
            "severity":               self.severity.value,
            "nearest_depot":          self.nearest_depot,
            "action_required":        self.action_required,
            "recommendation":         self.recommendation.to_dict(),
        }


# ---------------------------------------------------------------------------
# Fleet redeployment engine output
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RedeploymentMatch:
    shipment_id:      str
    vehicle_id:       str
    vehicle_type:     str
    vehicle_location: str
    distance_km:      float
    capacity_kg:      int
    refrigerated:     bool
    driver:           str
    fit_score:        float     # 0–1, higher = better

    def to_dict(self) -> dict[str, Any]:
        return {
            "shipment_id":      self.shipment_id,
            "vehicle_id":       self.vehicle_id,
            "vehicle_type":     self.vehicle_type,
            "vehicle_location": self.vehicle_location,
            "distance_km":      round(self.distance_km, 1),
            "capacity_kg":      self.capacity_kg,
            "refrigerated":     self.refrigerated,
            "driver":           self.driver,
            "fit_score":        round(self.fit_score, 3),
        }
