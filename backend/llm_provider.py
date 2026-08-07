"""
Portable LLM provider wrapper for PhytoNet AI.

Auto-switches between:
  1. Direct Anthropic SDK  — used when ANTHROPIC_API_KEY is set (Hostinger / prod).
  2. Emergent Universal Key (`emergentintegrations.llm.chat.LlmChat`) — fallback
     for the Emergent preview environment.

Public surface (drop-in for `emergentintegrations.llm.chat`):
    - `UserMessage(text=...)`
    - `TextDelta(content=...)` / `StreamDone()`   (streaming event types)
    - `new_chat(session_id, system_message, model=...) -> Chat`
    - `Chat.send_message(UserMessage) -> str`
    - `Chat.stream_message(UserMessage) -> async iterator of TextDelta/StreamDone`

Environment variables (mutually exclusive; ANTHROPIC_API_KEY wins):
    ANTHROPIC_API_KEY   — direct Anthropic key (sk-ant-...).
    EMERGENT_LLM_KEY    — Emergent Universal Key.
    LLM_MODEL           — optional override, defaults to
                          "claude-sonnet-4-5-20250929".
"""
from __future__ import annotations

import os
import asyncio
import logging
from dataclasses import dataclass
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.environ.get("LLM_MODEL", "claude-sonnet-4-5-20250929")
DEFAULT_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "4096"))


# ─────────────────────────── Public message types ───────────────────────────
@dataclass
class UserMessage:
    text: str


@dataclass
class TextDelta:
    content: str


@dataclass
class StreamDone:
    pass


# ─────────────────────────── Provider selection ─────────────────────────────
def _provider() -> str:
    """Return which backend to use. `anthropic` wins over `emergent`."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("EMERGENT_LLM_KEY"):
        return "emergent"
    raise RuntimeError(
        "No LLM key configured. Set ANTHROPIC_API_KEY (recommended for "
        "self-hosted deployments) or EMERGENT_LLM_KEY (Emergent platform)."
    )


# ─────────────────────────── Direct Anthropic path ──────────────────────────
class _AnthropicChat:
    """Thin async wrapper over the official Anthropic SDK.

    Maintains its own message history so it behaves like a session — the
    Emergent LlmChat also carries history internally, so parity matters.
    """

    def __init__(self, session_id: str, system_message: str, model: str):
        # Import lazily so environments without the SDK still boot.
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        self.session_id = session_id
        self.system = system_message
        self.model = model
        self._history: list[dict] = []

    async def send_message(self, msg: UserMessage) -> str:
        self._history.append({"role": "user", "content": msg.text})
        resp = await self._client.messages.create(
            model=self.model,
            max_tokens=DEFAULT_MAX_TOKENS,
            system=self.system,
            messages=self._history,
        )
        # Concatenate any text blocks in the response.
        text = "".join(
            (blk.text or "") for blk in resp.content if getattr(blk, "type", None) == "text"
        )
        self._history.append({"role": "assistant", "content": text})
        return text

    async def stream_message(self, msg: UserMessage) -> AsyncIterator:
        self._history.append({"role": "user", "content": msg.text})
        collected: list[str] = []
        async with self._client.messages.stream(
            model=self.model,
            max_tokens=DEFAULT_MAX_TOKENS,
            system=self.system,
            messages=self._history,
        ) as stream:
            async for text in stream.text_stream:
                if text:
                    collected.append(text)
                    yield TextDelta(content=text)
        self._history.append({"role": "assistant", "content": "".join(collected)})
        yield StreamDone()


# ─────────────────────────── Emergent fallback path ─────────────────────────
class _EmergentChat:
    """Delegates to `emergentintegrations.llm.chat.LlmChat`, adapting types."""

    def __init__(self, session_id: str, system_message: str, model: str):
        from emergentintegrations.llm.chat import LlmChat, UserMessage as EmUser
        self._EmUser = EmUser
        self._chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=session_id,
            system_message=system_message,
        ).with_model("anthropic", model)

    async def send_message(self, msg: UserMessage) -> str:
        resp = await self._chat.send_message(self._EmUser(text=msg.text))
        return str(resp)

    async def stream_message(self, msg: UserMessage) -> AsyncIterator:
        from emergentintegrations.llm.chat import TextDelta as EmDelta
        stream = self._chat.stream_message(self._EmUser(text=msg.text))
        async for evt in stream:
            if isinstance(evt, EmDelta) and evt.content:
                yield TextDelta(content=evt.content)
        yield StreamDone()


# ─────────────────────────── Factory ────────────────────────────────────────
def new_chat(session_id: str, system_message: str,
             model: Optional[str] = None):
    """Return a chat session bound to the active provider."""
    mdl = model or DEFAULT_MODEL
    prov = _provider()
    if prov == "anthropic":
        logger.debug(f"[llm] Anthropic-direct chat, session={session_id[:16]}, model={mdl}")
        return _AnthropicChat(session_id, system_message, mdl)
    logger.debug(f"[llm] Emergent chat, session={session_id[:16]}, model={mdl}")
    return _EmergentChat(session_id, system_message, mdl)


def active_provider() -> str:
    """For diagnostics / health endpoints."""
    try:
        return _provider()
    except RuntimeError:
        return "none"
