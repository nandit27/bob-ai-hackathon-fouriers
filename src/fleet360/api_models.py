"""Pydantic response models for the Fleet360 HTTP API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ShipmentResponse(ApiModel):
    shipment_id: str
    origin: str
    destination: str
    current_location: str
    cargo_type: str
    priority: str
    deadline: datetime
    carrier: str
    status: str
    route: list[str]
    weight: float
    value: float
    temperature_required: bool
    temperature_min: float | None
    temperature_max: float | None
    assigned_vehicle_id: str


class VehicleResponse(ApiModel):
    vehicle_id: str
    vehicle_type: str
    capacity: float
    current_location: str
    status: str
    driver: str
    available_from: datetime
    fuel_level: float
    refrigerated: bool
    current_shipment_id: str | None


class DisruptionResponse(ApiModel):
    disruption_id: str
    title: str
    location: str
    severity: str
    type: str
    description: str
    affected_routes: list[str]
    expected_duration_hours: float
    observed_at: datetime
    source: str
    status: str


class TemperatureLogResponse(ApiModel):
    log_id: str
    shipment_id: str
    vehicle_id: str
    recorded_at: datetime
    temperature_c: float
    temperature_min: float
    temperature_max: float
    sensor_id: str


class HealthResponse(ApiModel):
    status: str
    synthetic_data: bool
    service: str


class ErrorResponse(ApiModel):
    detail: str
    resource_id: str
    resource_type: str


class MetadataResponse(ApiModel):
    model_config = ConfigDict(extra="allow")

    metadata: dict[str, Any]


class ShipmentImpactResponse(ApiModel):
    shipment_id: str
    disruption_id: str
    impact_level: str
    reason: str
    reasons: list[str]
    estimated_delay_hours: float
    route_affected: bool
    cargo_sensitivity: str
    deadline_pressure: str


class StandardizedEventResponse(ApiModel):
    event_id: str
    schema_version: str
    agent_type: str
    event_type: str
    severity: str
    occurred_at: datetime
    received_at: datetime
    source_reference: str
    confidence: float
    location_ids: list[str]
    shipment_ids: list[str]
    vehicle_ids: list[str]
    route_ids: list[str]
    payload: dict[str, Any]


class WeatherAssessmentResponse(ApiModel):
    disruption_id: str
    disruption_title: str
    affected_location: str
    affected_routes: list[str]
    affected_shipments: list[ShipmentImpactResponse]
    standardized_event: StandardizedEventResponse


class WeatherEventResponse(StandardizedEventResponse):
    pass


class RecommendationResponse(ApiModel):
    recommendation_id: str
    shipment_id: str
    disruption_id: str | None
    recommendation_type: str
    priority: int
    title: str
    description: str
    suggested_vehicle_id: str | None
    estimated_delay_hours: float
    status: str


class ActionCreate(ApiModel):
    action_type: str
    shipment_id: str
    vehicle_id: str | None = None
    recommendation_id: str | None = None
    note: str | None = None


class ActionResponse(ApiModel):
    action_id: str
    action_type: str
    shipment_id: str
    vehicle_id: str | None
    recommendation_id: str | None
    note: str | None
    created_at: str
    status: str


class AlertResponse(ApiModel):
    alert_id: str
    severity: str
    title: str
    detail: str
    shipment_id: str | None
    disruption_id: str | None
    acknowledged: bool


class AlertAckRequest(ApiModel):
    alert_id: str


class AssistantAskRequest(ApiModel):
    question: str


class AssistantAskResponse(ApiModel):
    answer: str
    cited_ids: list[str]


class RouteStatsResponse(ApiModel):
    waypoints: list[str]
    distance_km: float
    time_h: float
    fuel_l: float


class AlternateResponse(ApiModel):
    alternate_id: str
    name: str
    waypoints: list[str]
    distance_km: float
    time_h: float
    fuel_l: float
    extra_km: float
    extra_time_h: float
    extra_fuel_l: float
    extra_cost_rs: float
    avoids_disruption: bool
    delay_avoided_h: float


class AlternativesResponse(ApiModel):
    shipment_id: str
    primary: RouteStatsResponse
    disruption_id: str | None
    alternatives: list[AlternateResponse]
