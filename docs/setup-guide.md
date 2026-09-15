# Setup Guide

## Prerequisites

- Python 3.11 or newer
- Node.js 18 or newer (for the React dashboard)
- Git

## Environment Variables

Copy the example file to `src/.env` for local development:

```bash
cp src/.env.example src/.env
```

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Local application environment name | `development` |
| `APP_PORT` | FastAPI server port | `8000` |
| `FLEET360_DATA_DIR` | Location of synthetic data | `src/data` |
| `WATSONX_API_KEY` | IBM Cloud IAM API key | _(blank — AI disabled)_ |
| `WATSONX_PROJECT_ID` | watsonx.ai project GUID | _(blank — AI disabled)_ |
| `WATSONX_URL` | watsonx.ai service endpoint | `https://us-south.ml.cloud.ibm.com` |
| `WATSONX_MODEL_ID` | Model to use for chat completions | `meta-llama/llama-3-3-70b-instruct` |

> **IBM watsonx.ai is optional.** If `WATSONX_API_KEY` and `WATSONX_PROJECT_ID`
> are left blank the backend runs in fallback mode — recommendations use
> template strings and the AI assistant uses rule-based logic. All other
> features work identically.

To obtain watsonx.ai credentials:
1. Log in to [cloud.ibm.com](https://cloud.ibm.com) and create an API key under
   **Manage → Access (IAM) → API keys**.
2. Open your watsonx.ai project and copy the **Project ID** from
   **Manage → General**.
3. Set `WATSONX_URL` to the endpoint for your region
   (e.g. `https://eu-de.ml.cloud.ibm.com` for Frankfurt).

## Installation

Create a virtual environment and install backend dependencies from the
repository root:

```bash
python -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
```

## Running the Backend

Start the FastAPI development server from the repository root:

```bash
python -m uvicorn src.fleet360.api:app --reload --host 127.0.0.1 --port 8000
```

Verify it is running:

```bash
curl http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok","synthetic_data":true,"service":"fleet360-backend"}
```

Interactive API docs (Swagger UI) are available at:

```
http://127.0.0.1:8000/docs
```

## Running the Frontend

In a second terminal, install Node dependencies and start the Vite dev server:

```bash
cd src/frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open the dashboard at:

```
http://127.0.0.1:5173/dashboard
```

The dashboard connects to the FastAPI backend automatically. All data shown is
synthetic and labelled as such.

To build a production bundle:

```bash
cd src/frontend
npm run build
```

## Exercising Key API Endpoints

With the backend running, try these curl commands:

```bash
# All active disruptions
curl http://127.0.0.1:8000/api/disruptions

# Weather impact assessment for the Mumbai flooding event
curl http://127.0.0.1:8000/api/weather/assessments/DIS-001

# All shipment impacts across all disruptions
curl http://127.0.0.1:8000/api/weather/assessments

# Impacts on a specific shipment
curl http://127.0.0.1:8000/api/weather/shipments/SHP-1001

# Prioritised operator recommendations
curl http://127.0.0.1:8000/api/recommendations

# Current alert feed
curl http://127.0.0.1:8000/api/alerts

# Route alternatives for a shipment
curl http://127.0.0.1:8000/api/routes/alternatives/SHP-1001

# Ask the AI assistant
curl -X POST http://127.0.0.1:8000/api/assistant/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Which shipments are most at risk right now?"}'
```

## Running Tests

From the repository root:

```bash
python -m unittest discover -s tests -v
```

On Windows PowerShell the command is identical.

## Troubleshooting

| Issue | Solution |
|---|---|
| `ModuleNotFoundError` when running the server | Run `python -m uvicorn ...` from the repository root, not from inside `src/`. |
| `APP_PORT must be an integer` | Set `APP_PORT` in `src/.env` to a whole number between 1 and 65535. |
| Tests not discovered | Run `python -m unittest discover -s tests -v` from the repository root. |
| `ibm_watsonx_ai` not found | Install with `pip install ibm-watsonx-ai` or run `pip install -r requirements.txt` from the repo root. |
| `WATSONX_API_KEY or WATSONX_PROJECT_ID not set` (log message) | Expected when credentials are not configured — AI features fall back automatically. |
| Frontend cannot reach backend | Confirm the backend is running on port 8000 and CORS allows `localhost:5173`. |
| `poc_state.json` in unexpected state | Delete `src/data/poc_state.json`; it will be recreated as an empty store on next write. |
