"""PhytoNet AI — Groq LLM adapter.

Uses Groq's OpenAI-compatible API for scientific writing / figure interpretation /
manuscript generation. Falls back gracefully to Emergent LLM key when
GROQ_API_KEY is unset.

Model: `GROQ_MODEL` env var (default `llama-3.3-70b-versatile`).
"""
from __future__ import annotations
import logging
import os
from typing import Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

GROQ_BASE = "https://api.groq.com/openai/v1"
DEFAULT_MODEL = "llama-3.3-70b-versatile"


def is_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY", "").strip())


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
        "Content-Type": "application/json",
    }


async def chat_completion(messages: List[Dict[str, str]],
                          model: Optional[str] = None,
                          temperature: float = 0.35,
                          max_tokens: int = 8192,
                          timeout: float = 180.0) -> str:
    """Simple non-streaming chat completion returning the assistant text.
    Raises on failure — callers should catch and fall back."""
    if not is_configured():
        raise RuntimeError("GROQ_API_KEY is not set")
    model = model or os.environ.get("GROQ_MODEL", DEFAULT_MODEL)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "top_p": 0.95,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{GROQ_BASE}/chat/completions",
                              headers=_headers(), json=payload)
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"]


async def scientific_writer(system: str, user: str,
                            temperature: float = 0.3) -> str:
    """Convenience wrapper for scientific manuscript sections."""
    return await chat_completion(
        [{"role": "system", "content": system},
         {"role": "user", "content": user}],
        temperature=temperature,
    )
