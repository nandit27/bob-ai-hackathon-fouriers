# Setup Guide

> This guide describes the current foundation only. No external services or
> credentials are required yet.

## Prerequisites

- Python 3.11 or newer
- Git

## Environment Variables

The template lives at `src/.env.example`. Copy it to `src/.env` only for local
development; the current code reads values exported by the shell and does not
load `.env` files automatically.

```bash
cp src/.env.example src/.env
```

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Local application environment name | `development` |
| `APP_PORT` | Reserved local application port | `8000` |
| `FLEET360_DATA_DIR` | Location of synthetic and future local data | `src/data` |

## Installation

Create a virtual environment and install the backend dependencies:

```bash
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Running the Backend

Start the FastAPI development server from the repository root:

```bash
python -m uvicorn src.fleet360.api:app --reload --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000`. Check its health in a second
terminal:

```bash
curl http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok","synthetic_data":true,"service":"fleet360-backend"}
```

Weather impact assessments are available from the synthetic disruption data:

```bash
curl http://127.0.0.1:8000/api/weather/assessments/DIS-001
curl http://127.0.0.1:8000/api/weather/assessments
curl http://127.0.0.1:8000/api/weather/impacts/DIS-001
curl http://127.0.0.1:8000/api/weather/shipments/SHP-1001
curl http://127.0.0.1:8000/api/weather/events/DIS-001
```

The weather endpoints return derived shipment impacts and the standardized
weather-agent event for the Mumbai flooding event. The data is synthetic and
the weather agent does not call an external weather API yet.

## Running the Frontend

In a second terminal, start the React dashboard from `src/frontend`:

```powershell
cd src/frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/dashboard`. The dashboard reads the FastAPI
backend, including weather impact endpoints, and labels the operational data as
synthetic. To build the frontend for a production bundle:

```powershell
cd src/frontend
npm run build
```

## Running Tests

From the repository root:

```bash
python -m unittest discover -s tests -v
```

On Windows PowerShell, the equivalent command is the same. To exercise the
configuration reader with a custom port:

```powershell
$env:APP_PORT = "8100"
python -c "from src.fleet360.config import AppSettings; print(AppSettings.from_environment())"
```

## Current Runtime Surface

The backend is a read-only POC API over the synthetic fixture at
`src/data/fleet360_demo.json`. It does not use live logistics data or a
database. Agents, correlation, optimization, frontend, MCP, and LLM
integration will be added incrementally.

## Troubleshooting

| Issue | Solution |
|---|---|
| `ModuleNotFoundError` when importing from a custom script | Run the script from the repository root and import from `src.fleet360`. |
| `APP_PORT must be an integer` | Set `APP_PORT` to a whole number between 1 and 65535. |
| Tests are not discovered | Run `python -m unittest discover -s tests -v` from the repository root. |
