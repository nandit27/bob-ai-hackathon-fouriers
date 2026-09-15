"""watsonx.ai client for Fleet360.

Provides a single helper `granite_generate()` that calls the IBM watsonx.ai
chat API using the ibm-watsonx-ai SDK.

Configuration is entirely through environment variables — no credentials are
ever hard-coded.  If any required variable is absent, or if the SDK is not
installed, every call returns None and the caller falls back to rule-based
logic transparently.

Required environment variables
--------------------------------
WATSONX_API_KEY    – IBM Cloud API key (IAM)
WATSONX_PROJECT_ID – watsonx.ai project GUID
WATSONX_URL        – service endpoint, e.g. https://eu-de.ml.cloud.ibm.com

Optional
--------
WATSONX_MODEL_ID  – defaults to meta-llama/llama-3-3-70b-instruct
                    (use any chat-capable model available in your region)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Default model — best instruct model available on eu-de
_DEFAULT_MODEL = "meta-llama/llama-3-3-70b-instruct"

# Module-level cache so the client is created once per process
_client: Any = None
_client_attempted: bool = False


def _get_client() -> Any | None:
    """Lazily initialise and cache the watsonx.ai ModelInference client.

    Returns None if credentials are missing or the SDK is not installed.
    """
    global _client, _client_attempted
    if _client_attempted:
        return _client
    _client_attempted = True

    api_key = os.getenv("WATSONX_API_KEY", "").strip()
    project_id = os.getenv("WATSONX_PROJECT_ID", "").strip()
    url = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").strip()
    model_id = os.getenv("WATSONX_MODEL_ID", _DEFAULT_MODEL).strip()

    if not api_key or not project_id:
        logger.debug("watsonx.ai: WATSONX_API_KEY or WATSONX_PROJECT_ID not set — IBM AI disabled")
        return None

    try:
        from ibm_watsonx_ai import APIClient, Credentials  # type: ignore
        from ibm_watsonx_ai.foundation_models import ModelInference  # type: ignore

        credentials = Credentials(url=url, api_key=api_key)
        api_client = APIClient(credentials)
        _client = ModelInference(
            model_id=model_id,
            api_client=api_client,
            project_id=project_id,
        )
        logger.info("watsonx.ai: client initialised (model=%s)", model_id)
    except ImportError:
        logger.debug("watsonx.ai: ibm-watsonx-ai package not installed — IBM AI disabled")
    except Exception as exc:  # noqa: BLE001
        logger.warning("watsonx.ai: client init failed — %s", exc)

    return _client


def granite_generate(prompt: str, max_tokens: int = 300) -> str | None:
    """Send a prompt via the watsonx.ai chat API and return the reply text.

    Uses the chat (messages) API which works with all instruct models.
    Returns None on any error so the caller can use its fallback.

    Parameters
    ----------
    prompt:
        The full user prompt (system context already embedded).
    max_tokens:
        Maximum tokens to generate.
    """
    client = _get_client()
    if client is None:
        return None

    try:
        messages = [{"role": "user", "content": prompt}]
        result = client.chat(
            messages=messages,
            params={"max_tokens": max_tokens, "temperature": 0.3},
        )
        text: str = result["choices"][0]["message"]["content"].strip()
        return text if text else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("watsonx.ai: chat() failed — %s", exc)
        return None
