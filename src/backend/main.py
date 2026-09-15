"""Fleet360 — FastAPI application entry point."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .repository import Fleet360Repository
from .agents.weather_agent import WeatherAgent
from .agents.geopolitical_agent import GeopoliticalAgent
from .agents.cold_chain_agent import ColdChainAgent
from .agents.redeployment_engine import RedeploymentEngine
from .narration import narrate_recommendation, NARRATION_ENABLED
from .chat import ChatRouter

app = FastAPI(
    title="Fleet360 API",
    version="1.0.0",
    description="Fleet360 innovation backend — weather, geopolitical, cold-chain agents + fleet redeployment.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Shared repository + agent instances
repo         = Fleet360Repository()
weather      = WeatherAgent(repo)
geopolitical = GeopoliticalAgent(repo)
cold_chain   = ColdChainAgent(repo)
redeployment = RedeploymentEngine(repo)
chat_router  = ChatRouter(repo, weather, geopolitical, cold_chain, redeployment)


def _404(kind: str, id_: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"error": f"{kind} '{id_}' not found"})


# ===========================================================================
# Health
# ===========================================================================

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "fleet360-backend"}


# ===========================================================================
# Core data
# ===========================================================================

@app.get("/api/shipments")
def list_shipments():
    return repo.get_shipments()

@app.get("/api/shipments/{shipment_id}")
def get_shipment(shipment_id: str):
    s = repo.get_shipment(shipment_id)
    if not s:
        raise _404("shipment", shipment_id)
    return s

@app.get("/api/fleet")
def list_fleet():
    return repo.get_fleet()

@app.get("/api/fleet/idle")
def list_idle_fleet():
    return repo.get_idle_vehicles()

@app.get("/api/fleet/{vehicle_id}")
def get_vehicle(vehicle_id: str):
    v = repo.get_vehicle(vehicle_id)
    if not v:
        raise _404("vehicle", vehicle_id)
    return v

@app.get("/api/disruptions")
def list_disruptions():
    return repo.get_disruptions()

@app.get("/api/disruptions/{disruption_id}")
def get_disruption(disruption_id: str):
    d = repo.get_disruption(disruption_id)
    if not d:
        raise _404("disruption", disruption_id)
    return d

@app.get("/api/geopolitical")
def list_geopolitical():
    return repo.get_geopolitical_events()

@app.get("/api/geopolitical/{event_id}")
def get_geopolitical(event_id: str):
    e = repo.get_geopolitical_event(event_id)
    if not e:
        raise _404("geopolitical event", event_id)
    return e

@app.get("/api/temperature/{shipment_id}")
def get_temperature(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    return repo.get_temperature_logs(shipment_id)

@app.get("/api/locations")
def get_locations():
    return repo.get_locations()

@app.get("/api/carriers")
def list_carriers():
    return repo.get_carriers()


# ===========================================================================
# Agent 1 — Weather
# ===========================================================================

@app.get("/api/agents/weather/assessments")
def weather_all():
    return [a.to_dict() for a in weather.assess_all()]

@app.get("/api/agents/weather/assessments/{disruption_id}")
def weather_by_disruption(disruption_id: str):
    a = weather.assess(disruption_id)
    if not a:
        raise _404("disruption", disruption_id)
    return a.to_dict()

@app.get("/api/agents/weather/impacts/{disruption_id}")
def weather_impacts(disruption_id: str):
    a = weather.assess(disruption_id)
    if not a:
        raise _404("disruption", disruption_id)
    return [s.to_dict() for s in a.affected_shipments]

@app.get("/api/agents/weather/shipment/{shipment_id}")
def weather_shipment(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    results = []
    for d in repo.get_active_disruptions():
        impact = weather.assess_shipment(shipment_id, d["disruption_id"])
        if impact:
            results.append(impact.to_dict())
    return results


# ===========================================================================
# Agent 2 — Geopolitical
# ===========================================================================

@app.get("/api/agents/geopolitical/assessments")
def geo_all():
    return [a.to_dict() for a in geopolitical.assess_all()]

@app.get("/api/agents/geopolitical/assessments/{event_id}")
def geo_by_event(event_id: str):
    a = geopolitical.assess(event_id)
    if not a:
        raise _404("geopolitical event", event_id)
    return a.to_dict()

@app.get("/api/agents/geopolitical/impacts/{event_id}")
def geo_impacts(event_id: str):
    a = geopolitical.assess(event_id)
    if not a:
        raise _404("geopolitical event", event_id)
    return [s.to_dict() for s in a.affected_shipments]

@app.get("/api/agents/geopolitical/shipment/{shipment_id}")
def geo_shipment(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    results = []
    for e in repo.get_active_geopolitical_events():
        impact = geopolitical.assess_shipment(shipment_id, e["event_id"])
        if impact:
            results.append(impact.to_dict())
    return results


# ===========================================================================
# Agent 3 — Cold Chain
# ===========================================================================

@app.get("/api/agents/cold-chain/alerts")
def cold_chain_all():
    return [a.to_dict() for a in cold_chain.get_all_alerts()]

@app.get("/api/agents/cold-chain/alerts/{shipment_id}")
def cold_chain_shipment(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    alert = cold_chain.assess_shipment(shipment_id)
    if not alert:
        return None
    return alert.to_dict()


# ===========================================================================
# Fleet Redeployment
# ===========================================================================

@app.get("/api/agents/redeployment/all")
def redeploy_all():
    matches = redeployment.get_all_matches()
    return {sid: [m.to_dict() for m in ms] for sid, ms in matches.items()}

@app.get("/api/agents/redeployment/{shipment_id}")
def redeploy_shipment(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    return [m.to_dict() for m in redeployment.get_matches_for_shipment(shipment_id)]

@app.get("/api/agents/redeployment/{shipment_id}/best")
def redeploy_best(shipment_id: str):
    if not repo.get_shipment(shipment_id):
        raise _404("shipment", shipment_id)
    match = redeployment.get_best_match(shipment_id)
    if not match:
        return None
    return match.to_dict()


# ===========================================================================
# Unified recommendations (all agents, all events)
# ===========================================================================

@app.get("/api/recommendations")
def all_recommendations(narrate: bool = False):
    """
    Return all prioritized recovery recommendations from all agents.
    Pass ?narrate=true to enrich each recommendation with a plain-language
    operator briefing generated by IBM watsonx.ai (ibm/granite-3-8b-instruct).
    Falls back to a deterministic description when credentials are not set.
    """
    raw_recs = []

    # Weather
    for assessment in weather.assess_all():
        for impact in assessment.affected_shipments:
            if impact.recommendation:
                raw_recs.append(impact.recommendation)

    # Geopolitical
    for assessment in geopolitical.assess_all():
        for impact in assessment.affected_shipments:
            if impact.recommendation:
                raw_recs.append(impact.recommendation)

    # Cold chain
    for alert in cold_chain.get_all_alerts():
        raw_recs.append(alert.recommendation)

    # Deduplicate by recommendation_id
    seen: set[str] = set()
    unique = []
    for r in raw_recs:
        if r.recommendation_id not in seen:
            seen.add(r.recommendation_id)
            unique.append(r)

    unique.sort(key=lambda r: r.priority)

    result = []
    for r in unique:
        d = r.to_dict()
        # Add watsonx.ai narration when requested (or always include fallback)
        d["operator_briefing"] = narrate_recommendation(r) if (narrate or not NARRATION_ENABLED) else None
        d["narration_source"] = "watsonx.ai ibm/granite-3-8b-instruct" if (narrate and NARRATION_ENABLED) else "deterministic"
        result.append(d)

    return result


# ===========================================================================
# Chat — conversational assistant
# ===========================================================================

class ChatRequest(BaseModel):
    query: str


@app.post("/api/chat")
def chat(req: ChatRequest):
    """
    Accept a natural-language operator query, route it to the appropriate
    agent(s), and return a structured reply with markdown content + cards.
    """
    msg = chat_router.answer(req.query)
    return {
        "role":    msg.role,
        "content": msg.content,
        "cards":   msg.cards,
        "agent":   msg.agent,
    }


@app.get("/api/health")
def health_detailed():
    return {
        "status": "ok",
        "service": "fleet360-backend",
        "ibm_technologies": {
            "ibm_bob_mcp": "active — 11 tools registered in src/mcp-server",
            "watsonx_ai": "configured" if NARRATION_ENABLED else "not configured (set WATSONX_API_KEY + WATSONX_PROJECT_ID to enable)",
            "model": "ibm/granite-3-8b-instruct",
        },
    }
