"""Validated domain models shared by Fleet360 agents and the correlator."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class DomainValidationError(ValueError):
    """Raised when a domain object contains invalid operational data."""


class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AgentType(str, Enum):
    WEATHER = "weather"
    GEOPOLITICAL = "geopolitical"
    COLD_CHAIN = "cold_chain"


class ShipmentStatus(str, Enum):
    PLANNED = "planned"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    DELAYED = "delayed"
    CANCELLED = "cancelled"


class VehicleStatus(str, Enum):
    AVAILABLE = "available"
    ASSIGNED = "assigned"
    IN_TRANSIT = "in_transit"
    MAINTENANCE = "maintenance"


class DisruptionType(str, Enum):
    WEATHER = "weather"
    GEOPOLITICAL = "geopolitical"
    TEMPERATURE_EXCURSION = "temperature_excursion"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecommendationType(str, Enum):
    REROUTE = "reroute"
    REDEPLOY_VEHICLE = "redeploy_vehicle"
    HOLD_SHIPMENT = "hold_shipment"
    INSPECT_CARGO = "inspect_cargo"
    EXPEDITE = "expedite"


def _required(value: str, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DomainValidationError(f"{field_name} must be a non-empty string")
    return value.strip()


def _positive(value: float, field_name: str, *, allow_zero: bool = False) -> float:
    if value < 0 or (value == 0 and not allow_zero):
        qualifier = "non-negative" if allow_zero else "positive"
        raise DomainValidationError(f"{field_name} must be {qualifier}")
    return value


def _serialize(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if is_dataclass(value):
        return {key: _serialize(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_serialize(item) for item in value]
    return value


@dataclass(frozen=True)
class Location:
    """A named operational location or event area."""

    location_id: str
    name: str
    country: str
    latitude: float | None = None
    longitude: float | None = None

    def __post_init__(self) -> None:
        _required(self.location_id, "location_id")
        _required(self.name, "name")
        _required(self.country, "country")
        if self.latitude is not None and not -90 <= self.latitude <= 90:
            raise DomainValidationError("latitude must be between -90 and 90")
        if self.longitude is not None and not -180 <= self.longitude <= 180:
            raise DomainValidationError("longitude must be between -180 and 180")


@dataclass(frozen=True)
class Shipment:
    shipment_id: str
    origin: Location
    destination: Location
    route_id: str
    vehicle_id: str | None
    commodity: str
    quantity: float
    quantity_unit: str
    departure_at: datetime
    eta: datetime
    status: ShipmentStatus = ShipmentStatus.PLANNED

    def __post_init__(self) -> None:
        _required(self.shipment_id, "shipment_id")
        _required(self.route_id, "route_id")
        _required(self.commodity, "commodity")
        _required(self.quantity_unit, "quantity_unit")
        if self.vehicle_id is not None:
            _required(self.vehicle_id, "vehicle_id")
        _positive(self.quantity, "quantity")
        if self.eta < self.departure_at:
            raise DomainValidationError("eta cannot be earlier than departure_at")

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class FleetVehicle:
    vehicle_id: str
    vehicle_type: str
    capacity_kg: float
    status: VehicleStatus
    current_location: Location
    temperature_controlled: bool
    available_at: datetime | None = None

    def __post_init__(self) -> None:
        _required(self.vehicle_id, "vehicle_id")
        _required(self.vehicle_type, "vehicle_type")
        _positive(self.capacity_kg, "capacity_kg")

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class DisruptionEvent:
    event_id: str
    disruption_type: DisruptionType
    severity: Severity
    title: str
    description: str
    observed_at: datetime
    source: str
    location_ids: tuple[str, ...] = ()
    route_ids: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _required(self.event_id, "event_id")
        _required(self.title, "title")
        _required(self.description, "description")
        _required(self.source, "source")

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class TemperatureLog:
    log_id: str
    shipment_id: str
    vehicle_id: str
    recorded_at: datetime
    temperature_c: float
    minimum_safe_c: float
    maximum_safe_c: float
    sensor_id: str

    def __post_init__(self) -> None:
        for value, field_name in (
            (self.log_id, "log_id"),
            (self.shipment_id, "shipment_id"),
            (self.vehicle_id, "vehicle_id"),
            (self.sensor_id, "sensor_id"),
        ):
            _required(value, field_name)
        if self.minimum_safe_c > self.maximum_safe_c:
            raise DomainValidationError("minimum_safe_c cannot exceed maximum_safe_c")

    @property
    def is_excursion(self) -> bool:
        return not self.minimum_safe_c <= self.temperature_c <= self.maximum_safe_c

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class RiskAssessment:
    assessment_id: str
    shipment_id: str
    assessed_at: datetime
    risk_level: RiskLevel
    risk_score: float
    contributing_event_ids: tuple[str, ...]
    rationale: str

    def __post_init__(self) -> None:
        _required(self.assessment_id, "assessment_id")
        _required(self.shipment_id, "shipment_id")
        _required(self.rationale, "rationale")
        if not 0 <= self.risk_score <= 1:
            raise DomainValidationError("risk_score must be between 0 and 1")

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class RecoveryRecommendation:
    recommendation_id: str
    shipment_id: str
    recommendation_type: RecommendationType
    priority: int
    description: str
    generated_at: datetime
    estimated_delay_hours: float | None = None

    def __post_init__(self) -> None:
        _required(self.recommendation_id, "recommendation_id")
        _required(self.shipment_id, "shipment_id")
        _required(self.description, "description")
        if self.priority < 1:
            raise DomainValidationError("priority must be at least 1")
        if self.estimated_delay_hours is not None:
            _positive(self.estimated_delay_hours, "estimated_delay_hours", allow_zero=True)

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)


@dataclass(frozen=True)
class StandardizedAgentEvent:
    """Versioned contract consumed by the Fleet360 event correlator."""

    event_id: str
    schema_version: str
    agent_type: AgentType
    event_type: DisruptionType
    severity: Severity
    occurred_at: datetime
    received_at: datetime
    source_reference: str
    confidence: float
    location_ids: tuple[str, ...] = ()
    shipment_ids: tuple[str, ...] = ()
    vehicle_ids: tuple[str, ...] = ()
    route_ids: tuple[str, ...] = ()
    payload: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _required(self.event_id, "event_id")
        _required(self.schema_version, "schema_version")
        _required(self.source_reference, "source_reference")
        if not 0 <= self.confidence <= 1:
            raise DomainValidationError("confidence must be between 0 and 1")
        if self.received_at < self.occurred_at:
            raise DomainValidationError("received_at cannot be earlier than occurred_at")

    def to_dict(self) -> dict[str, Any]:
        return _serialize(self)