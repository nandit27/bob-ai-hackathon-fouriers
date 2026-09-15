# Solution Overview

## What We Built

Fleet360 is an AI-powered supply chain operations assistant that gives logistics
operators a single interface to monitor their fleet, detect disruptions, assess
which shipments are affected, and receive actionable recommendations — all backed
by IBM watsonx.ai for natural-language interaction and AI-narrated guidance.

The system runs against a synthetic but realistic dataset of shipments, vehicles,
disruptions, and cold-chain sensor readings that covers Indian logistics corridors.
Every feature works end-to-end with no external data sources required.

## How It Works

1. **Fleet data is loaded from a structured JSON fixture** (`src/data/fleet360_demo.json`)
   containing shipments, vehicles, disruptions, and temperature sensor logs for
   a simulated Indian road-freight operation.

2. **The Weather Intelligence Agent** (`WeatherIntelligenceAgent`) correlates each
   active disruption against all in-transit shipments by matching location aliases
   and ordered route corridors. It weighs disruption severity, cargo type, shipment
   priority, and deadline proximity to produce an explainable impact level
   (LOW / MEDIUM / HIGH / CRITICAL) and estimated delay hours for every affected
   shipment.

3. **Each assessed disruption emits a `StandardizedAgentEvent`** — a versioned,
   schema-validated event object that carries the affected shipment IDs, vehicle
   IDs, location context, and structured payload. This contract is designed to be
   consumed by a future multi-agent correlator alongside geopolitical and cold-chain
   agents.

4. **The recommendation engine** (`build_recommendations`) merges weather impacts
   and cold-chain excursion data to produce a prioritised list of operator actions:
   reroute, redeploy vehicle, or inspect cargo. Each recommendation description is
   narrated by IBM watsonx.ai (via the `granite_generate` helper) and falls back
   to a deterministic template when watsonx.ai is not configured.

5. **The alerts engine** (`build_alerts`) surfaces CRITICAL and HIGH impacts plus
   active disruptions as ranked alerts. Operators can acknowledge individual alerts
   through the API; acknowledgements are persisted to `src/data/poc_state.json`.

6. **The route alternatives engine** (`build_alternatives`) computes two
   deterministic detour options for any shipment-disruption pair using Haversine
   distances between Indian city coordinates, reporting extra km, time, fuel, and
   cost in ₹.

7. **The AI assistant endpoint** (`POST /api/assistant/ask`) accepts a free-text
   operator question, builds a structured prompt from live fleet context, and sends
   it to IBM watsonx.ai. If watsonx.ai is unavailable, a rule-based fallback
   answers the question deterministically — the operator always gets a response.

8. **The React dashboard** (`src/frontend`) calls all API endpoints and presents
   the live map, shipment list, disruption list, recommendations, alerts, and
   route alternatives in a single-page application. The AI assistant chat panel
   is embedded in the dashboard.

## Architecture Diagram

> See [`architecture.md`](architecture.md) for the full diagram with component detail.

```
Operator
  │
  ▼
React Dashboard (Vite + TypeScript) ← http://127.0.0.1:5173
  │  REST calls
  ▼
FastAPI Backend (src/fleet360/api.py) ← http://127.0.0.1:8000
  │
  ├── WeatherIntelligenceAgent ──► StandardizedAgentEvent
  │       │
  │       └── Fleet360Repository ──► src/data/fleet360_demo.json
  │
  ├── build_recommendations / build_alerts / build_alternatives (poc.py)
  │       │
  │       └── granite_generate() ──► IBM watsonx.ai (optional, falls back)
  │
  └── poc_state.json  (actions + alert acknowledgements)
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Synthetic JSON dataset, no database | Enables a fully self-contained demo with zero infrastructure setup; the data model is production-shaped so a real database swap is straightforward |
| Deterministic impact scoring (no LLM for risk) | Ensures explainable, reproducible results; AI adds narration on top of decisions already made by code |
| `StandardizedAgentEvent` contract | Common versioned schema lets the weather agent output be consumed by a future correlator without coupling to agent internals |
| watsonx.ai as graceful enhancement | The assistant and recommendation narration work without credentials; IBM AI makes them richer when configured |
| FastAPI + Pydantic response models | Strong typing on every endpoint and auto-generated OpenAPI docs at `/docs` |
| Rule-based fallback in assistant | The operator always gets a response; no silent failures when AI is unavailable |

## IBM Technologies Used

- **IBM watsonx.ai (via `ibm-watsonx-ai` Python SDK):** Used in two ways.
  First, `build_recommendations` calls `granite_generate()` to narrate each
  recommendation as a clear one-sentence operator action. Second,
  `POST /api/assistant/ask` builds a structured prompt from live fleet context
  (active impacts, cold-chain excursions, idle vehicles) and sends it to the
  configured model for a grounded, data-cited answer. The default model is
  `meta-llama/llama-3-3-70b-instruct`; any chat-capable watsonx.ai model can
  be substituted via the `WATSONX_MODEL_ID` environment variable.

- **IBM Bob:** Used throughout development as the AI engineering assistant —
  writing, reviewing, and refactoring the agent domain layer, API models, route
  alternatives logic, and this documentation.
