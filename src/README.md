# src — Fleet360 Innovation Build

```
src/
├── backend/                  ← Python FastAPI backend
│   ├── data/
│   │   └── fleet360.json     ← Fleet operations dataset (shipments, fleet, disruptions, geo events, temp logs)
│   ├── models/
│   │   └── domain.py         ← Immutable dataclass models
│   ├── agents/
│   │   ├── weather_agent.py          ← Agent 1: disruption → shipment impact → recommendation
│   │   ├── geopolitical_agent.py     ← Agent 2: geo event → commodity → shipment → carrier alt
│   │   ├── cold_chain_agent.py       ← Agent 3: excursion → severity → depot → recommendation
│   │   └── redeployment_engine.py    ← Match idle vehicles to at-risk shipments
│   ├── repository.py         ← Read-only data access layer
│   ├── main.py               ← FastAPI app + all routes
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                 ← React + TypeScript + Vite dashboard
    ├── src/
    │   ├── api/client.ts     ← Typed API client
    │   ├── types/index.ts    ← All TypeScript types
    │   ├── components/
    │   │   ├── Badge.tsx
    │   │   ├── MetricCard.tsx
    │   │   └── OperationsMap.tsx
    │   ├── styles/index.css
    │   ├── App.tsx           ← Full dashboard
    │   └── main.tsx
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    └── vite.config.ts
```

## Run the backend

```bash
cd src/backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## Run the frontend

```bash
cd src/frontend
npm install
npm run dev
```

Open: http://127.0.0.1:5173
