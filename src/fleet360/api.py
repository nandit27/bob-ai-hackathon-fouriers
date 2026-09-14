"""FastAPI application for the Fleet360 synthetic POC backend."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .api_models import (
    DisruptionResponse,
    ErrorResponse,
    HealthResponse,
    ShipmentResponse,
    TemperatureLogResponse,
    VehicleResponse,
    ShipmentImpactResponse,
    StandardizedEventResponse,
    WeatherAssessmentResponse,
)
from .repository import (
    get_disruption,
    get_disruptions,
    get_fleet,
    get_idle_vehicles,
    get_shipment,
    get_shipments,
    get_temperature_logs,
    get_vehicle,
    repository,
)
from .weather_agent import WeatherIntelligenceAgent

app = FastAPI(
    title="Fleet360 POC API",
    version="0.1.0",
    description="Backend APIs backed by synthetic local logistics data.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)

weather_agent = WeatherIntelligenceAgent(repository)


def not_found(resource_type: str, resource_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "detail": f"{resource_type} '{resource_id}' was not found",
            "resource_id": resource_id,
            "resource_type": resource_type,
        },
    )


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", synthetic_data=True, service="fleet360-backend")


@app.get("/api/shipments", response_model=list[ShipmentResponse])
def shipments() -> list[dict]:
    return get_shipments()


@app.get("/api/shipments/{shipment_id}", response_model=ShipmentResponse, responses={404: {"model": ErrorResponse}})
def shipment(shipment_id: str) -> dict:
    result = get_shipment(shipment_id)
    if result is None:
        raise not_found("shipment", shipment_id)
    return result


@app.get("/api/fleet", response_model=list[VehicleResponse])
def fleet() -> list[dict]:
    return get_fleet()


@app.get("/api/fleet/idle", response_model=list[VehicleResponse])
def idle_fleet() -> list[dict]:
    return get_idle_vehicles()


@app.get("/api/fleet/{vehicle_id}", response_model=VehicleResponse, responses={404: {"model": ErrorResponse}})
def vehicle(vehicle_id: str) -> dict:
    result = get_vehicle(vehicle_id)
    if result is None:
        raise not_found("vehicle", vehicle_id)
    return result


@app.get("/api/disruptions", response_model=list[DisruptionResponse])
def disruptions() -> list[dict]:
    return get_disruptions()


@app.get("/api/disruptions/{disruption_id}", response_model=DisruptionResponse, responses={404: {"model": ErrorResponse}})
def disruption(disruption_id: str) -> dict:
    result = get_disruption(disruption_id)
    if result is None:
        raise not_found("disruption", disruption_id)
    return result


@app.get("/api/temperature/{shipment_id}", response_model=list[TemperatureLogResponse])
def temperature_logs(shipment_id: str) -> list[dict]:
    if get_shipment(shipment_id) is None:
        raise not_found("shipment", shipment_id)
    return get_temperature_logs(shipment_id)


@app.get("/api/weather/assessments", response_model=list[WeatherAssessmentResponse])
def weather_assessments() -> list[dict]:
    return [assessment.to_dict() for assessment in weather_agent.assess_all()]


@app.get(
    "/api/weather/assessments/{disruption_id}",
    response_model=WeatherAssessmentResponse,
    responses={404: {"model": ErrorResponse}},
)
def weather_assessment(disruption_id: str) -> dict:
    assessment = weather_agent.assess_disruption(disruption_id)
    if assessment is None:
        raise not_found("disruption", disruption_id)
    return assessment.to_dict()


@app.get(
    "/api/weather/impacts/{disruption_id}",
    response_model=list[ShipmentImpactResponse],
    responses={404: {"model": ErrorResponse}},
)
def weather_impacts(disruption_id: str) -> list[dict]:
    assessment = weather_agent.assess_disruption(disruption_id)
    if assessment is None:
        raise not_found("disruption", disruption_id)
    return [impact.to_dict() for impact in assessment.affected_shipments]


@app.get(
    "/api/weather/shipments/{shipment_id}",
    response_model=list[ShipmentImpactResponse],
    responses={404: {"model": ErrorResponse}},
)
def weather_shipment_impacts(shipment_id: str) -> list[dict]:
    if get_shipment(shipment_id) is None:
        raise not_found("shipment", shipment_id)
    impacts = []
    for disruption in get_disruptions():
        impact = weather_agent.assess_shipment_impact(shipment_id, disruption["disruption_id"])
        if impact is not None:
            impacts.append(impact.to_dict())
    return impacts


@app.get(
    "/api/weather/events/{disruption_id}",
    response_model=StandardizedEventResponse,
    responses={404: {"model": ErrorResponse}},
)
def weather_event(disruption_id: str) -> dict:
    assessment = weather_agent.assess_disruption(disruption_id)
    if assessment is None:
        raise not_found("disruption", disruption_id)
    return assessment.standardized_event.to_dict()
