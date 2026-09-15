"""FastAPI application for the Fleet360 synthetic POC backend."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Load .env from src/.env if present (local dev only — never committed)
_env_path = Path(__file__).parents[1] / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(_env_path)
    except ImportError:
        # python-dotenv not installed — manually parse key=value lines
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

from .api_models import (
    ActionCreate,
    ActionResponse,
    AlertAckRequest,
    AlertResponse,
    AlternativesResponse,
    AssistantAskRequest,
    AssistantAskResponse,
    DisruptionResponse,
    ErrorResponse,
    HealthResponse,
    RecommendationResponse,
    ShipmentResponse,
    TemperatureLogResponse,
    VehicleResponse,
    ShipmentImpactResponse,
    StandardizedEventResponse,
    WeatherAssessmentResponse,
)
from .poc import answer_question, build_alerts, build_alternatives, build_recommendations, load_state, save_state, _utcnow
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
    allow_methods=["GET", "POST", "OPTIONS"],
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


def _excursion_ids() -> list[str]:
    ids: list[str] = []
    for shipment in get_shipments():
        if not shipment.get("temperature_required"):
            continue
        logs = get_temperature_logs(shipment["shipment_id"])
        if not logs:
            continue
        latest = logs[-1]
        if latest["temperature_c"] < latest["temperature_min"] or latest["temperature_c"] > latest["temperature_max"]:
            ids.append(shipment["shipment_id"])
    return ids


def _all_impacts() -> list[dict]:
    impacts: list[dict] = []
    for disruption in get_disruptions():
        assessment = weather_agent.assess_disruption(disruption["disruption_id"])
        if assessment is not None:
            impacts.extend(impact.to_dict() for impact in assessment.affected_shipments)
    return impacts


@app.get("/api/recommendations", response_model=list[RecommendationResponse])
def recommendations() -> list[dict]:
    return build_recommendations(_all_impacts(), get_shipments(), get_idle_vehicles(), _excursion_ids())


@app.get("/api/actions", response_model=list[ActionResponse])
def list_actions() -> list[dict]:
    return load_state()["actions"]


@app.post("/api/actions", response_model=ActionResponse)
def create_action(payload: ActionCreate) -> dict:
    if get_shipment(payload.shipment_id) is None:
        raise not_found("shipment", payload.shipment_id)
    if payload.vehicle_id and get_vehicle(payload.vehicle_id) is None:
        raise not_found("vehicle", payload.vehicle_id)
    state = load_state()
    action = {
        "action_id": f"ACT-{len(state['actions']) + 1:03d}",
        "action_type": payload.action_type,
        "shipment_id": payload.shipment_id,
        "vehicle_id": payload.vehicle_id,
        "recommendation_id": payload.recommendation_id,
        "note": payload.note,
        "created_at": _utcnow(),
        "status": "logged",
    }
    state["actions"].append(action)
    save_state(state)
    return action


@app.get("/api/alerts", response_model=list[AlertResponse])
def alerts() -> list[dict]:
    state = load_state()
    return build_alerts(get_disruptions(), _all_impacts(), _excursion_ids(), state["acked_alerts"])


@app.post("/api/alerts/ack", response_model=AlertResponse)
def ack_alert(payload: AlertAckRequest) -> dict:
    state = load_state()
    if payload.alert_id not in state["acked_alerts"]:
        state["acked_alerts"].append(payload.alert_id)
        save_state(state)
    current = build_alerts(get_disruptions(), _all_impacts(), _excursion_ids(), state["acked_alerts"])
    match = next((a for a in current if a["alert_id"] == payload.alert_id), None)
    if match is None:
        raise not_found("alert", payload.alert_id)
    return match


@app.get(
    "/api/routes/alternatives/{shipment_id}",
    response_model=AlternativesResponse,
    responses={404: {"model": ErrorResponse}},
)
def route_alternatives(shipment_id: str) -> dict:
    shipment = get_shipment(shipment_id)
    if shipment is None:
        raise not_found("shipment", shipment_id)
    impacts = []
    for disruption in get_disruptions():
        impact = weather_agent.assess_shipment_impact(shipment_id, disruption["disruption_id"])
        if impact is not None:
            impacts.append(impact.to_dict())
    return build_alternatives(shipment, impacts, get_disruptions())


@app.post("/api/assistant/ask", response_model=AssistantAskResponse)
def assistant_ask(payload: AssistantAskRequest) -> dict:
    shipments = get_shipments()
    impacts = _all_impacts()
    idle = get_idle_vehicles()
    excursions = _excursion_ids()
    return answer_question(payload.question, {"shipments": shipments, "impacts": impacts, "idle": idle, "excursions": excursions})
