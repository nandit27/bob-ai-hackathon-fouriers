"""
watsonx.ai Granite integration — narrate recovery recommendations.

Uses ibm/granite-3-8b-instruct via the watsonx.ai REST API to convert
structured RecoveryRecommendation objects into plain-language operator
briefings.

Environment variables required (add to .env):
  WATSONX_API_KEY   — IBM Cloud API key with watsonx.ai access
  WATSONX_PROJECT_ID — watsonx.ai project ID
  WATSONX_URL        — regional endpoint, e.g. https://us-south.ml.cloud.ibm.com
"""
from __future__ import annotations

import os
import json
import urllib.request
import urllib.parse
from typing import Any

from .models.domain import RecoveryRecommendation

# ---------------------------------------------------------------------------
# Config (read from environment — never hardcoded)
# ---------------------------------------------------------------------------
WATSONX_API_KEY    = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
MODEL_ID           = "ibm/granite-3-8b-instruct"
NARRATION_ENABLED  = bool(WATSONX_API_KEY and WATSONX_PROJECT_ID)

# ---------------------------------------------------------------------------
# IAM token exchange
# ---------------------------------------------------------------------------
_cached_token: dict[str, Any] = {}

def _get_iam_token() -> str:
    """Exchange IBM Cloud API key for a short-lived IAM bearer token."""
    data = urllib.parse.urlencode({
        "grant_type":    "urn:ibm:params:oauth:grant-type:apikey",
        "apikey":        WATSONX_API_KEY,
    }).encode()
    req = urllib.request.Request(
        "https://iam.cloud.ibm.com/identity/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        result = json.loads(resp.read())
    return str(result["access_token"])


# ---------------------------------------------------------------------------
# Granite inference
# ---------------------------------------------------------------------------

def _call_granite(prompt: str) -> str:
    """Call watsonx.ai text generation endpoint with ibm/granite-3-8b-instruct."""
    token   = _get_iam_token()
    url     = f"{WATSONX_URL}/ml/v1/text/generation?version=2025-02-11"
    payload = json.dumps({
        "model_id":   MODEL_ID,
        "project_id": WATSONX_PROJECT_ID,
        "input":      prompt,
        "parameters": {
            "max_new_tokens": 180,
            "temperature":    0.3,
            "stop_sequences": ["\n\n"],
        },
    }).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
            "Accept":        "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        result = json.loads(resp.read())
    return str(result["results"][0]["generated_text"]).strip()


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def narrate_recommendation(rec: RecoveryRecommendation) -> str:
    """
    Return a one-paragraph plain-language operator briefing for a recommendation.

    If WATSONX credentials are not set, returns a deterministic fallback
    so the app works without credentials in development / demo mode.
    """
    if not NARRATION_ENABLED:
        return _fallback_narration(rec)

    prompt = _build_prompt(rec)
    try:
        return _call_granite(prompt)
    except Exception as exc:  # noqa: BLE001
        # Never crash the API — fall back gracefully
        return f"{_fallback_narration(rec)} (watsonx.ai narration unavailable: {exc})"


def _build_prompt(rec: RecoveryRecommendation) -> str:
    """
    Build a concise, instruction-style prompt for Granite.
    The model receives structured facts and is asked to write one operator-facing sentence.
    """
    route_line   = f"Recommended alternate route: {rec.alternative_route}." if rec.alternative_route else ""
    vehicle_line = f"Suggested idle vehicle: {rec.suggested_vehicle_id}."    if rec.suggested_vehicle_id else ""
    carrier_line = f"Suggested carrier: {rec.suggested_carrier}."            if rec.suggested_carrier else ""
    saving_line  = f"Estimated time saving: {rec.estimated_saving_hours:.1f} hours." if rec.estimated_saving_hours > 0 else ""

    return (
        "You are a fleet operations assistant. Write one clear, actionable sentence "
        "for a logistics operator that summarises the following recovery action. "
        "Be direct, specific, and mention the shipment ID and key action.\n\n"
        f"Shipment: {rec.shipment_id}\n"
        f"Action type: {rec.recommendation_type.value.replace('_', ' ')}\n"
        f"Triggered by: {rec.agent_type.value} agent (event {rec.event_id})\n"
        f"Priority: {rec.priority}\n"
        f"{route_line}\n{vehicle_line}\n{carrier_line}\n{saving_line}\n\n"
        "Operator briefing:"
    )


def _fallback_narration(rec: RecoveryRecommendation) -> str:
    """Deterministic fallback when watsonx.ai credentials are not available."""
    parts = [f"[{rec.recommendation_type.value.replace('_', ' ').upper()}] {rec.title}."]
    if rec.alternative_route:
        parts.append(f"Suggested route: {rec.alternative_route}.")
    if rec.suggested_vehicle_id:
        parts.append(f"Redeploy {rec.suggested_vehicle_id}.")
    if rec.suggested_carrier:
        parts.append(f"Switch to {rec.suggested_carrier}.")
    if rec.estimated_saving_hours > 0:
        parts.append(f"Estimated saving: {rec.estimated_saving_hours:.1f} h.")
    return " ".join(parts)
