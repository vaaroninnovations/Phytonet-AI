"""PhytoNet AI — Google OAuth 2.0 sign-in (server-side flow via authlib).

REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
THIS BREAKS THE AUTH. Redirect URI is read from GOOGLE_REDIRECT_URI env var
and must exactly match one of the "Authorized redirect URIs" registered in
Google Cloud Console.

Flow:
  1. Frontend redirects the browser to `/api/auth/google/login`.
  2. Backend redirects to Google's consent screen.
  3. Google redirects back to GOOGLE_REDIRECT_URI (frontend path
     `/auth/google/callback`). The frontend forwards `?code=…` to
     `/api/auth/google/callback` on the backend.
  4. Backend exchanges the code for tokens, fetches userinfo, upserts a Mongo
     user, and issues the SAME HttpOnly access+refresh cookies used by
     password auth. Then it redirects the frontend to `/` (or `?next=` param).

Env vars:
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GOOGLE_REDIRECT_URI
"""
from __future__ import annotations
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/google")

GOOGLE_AUTH  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_INFO  = "https://openidconnect.googleapis.com/v1/userinfo"
SCOPES       = "openid email profile"

# In-memory nonce store (single-instance only — Mongo would be better for HA)
_STATE_STORE: dict[str, dict] = {}


def _client_id() -> str:  return os.environ.get("GOOGLE_CLIENT_ID", "").strip()
def _client_secret() -> str: return os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
def _redirect_uri() -> str: return os.environ.get("GOOGLE_REDIRECT_URI", "").strip()


def is_configured() -> bool:
    return all([_client_id(), _client_secret(), _redirect_uri()])


def build_router(db, auth_service):
    """Build the Google-OAuth router.

    `auth_service` is the imported module — we reuse its cookie helpers so
    Google users share a single session mechanism with password users.
    """

    @router.get("/login")
    async def google_login(next: Optional[str] = Query(default="/")):
        if not is_configured():
            raise HTTPException(status_code=503, detail="Google OAuth is not configured.")
        state = secrets.token_urlsafe(24)
        _STATE_STORE[state] = {
            "next": next or "/",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        params = {
            "client_id": _client_id(),
            "redirect_uri": _redirect_uri(),
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "select_account",
            "state": state,
        }
        qs = str(httpx.QueryParams(params))
        return RedirectResponse(url=f"{GOOGLE_AUTH}?{qs}", status_code=302)

    @router.get("/callback")
    async def google_callback(code: str = Query(...), state: str = Query(...)):
        if state not in _STATE_STORE:
            raise HTTPException(status_code=400, detail="Invalid OAuth state (possible CSRF).")
        pending = _STATE_STORE.pop(state)
        next_path = pending.get("next", "/")

        # Exchange code → tokens
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_res = await client.post(GOOGLE_TOKEN, data={
                "code": code,
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "redirect_uri": _redirect_uri(),
                "grant_type": "authorization_code",
            })
            if token_res.status_code != 200:
                logger.error(f"Google token exchange failed: {token_res.text[:400]}")
                raise HTTPException(status_code=502, detail="Google token exchange failed.")
            tokens = token_res.json()

            # Fetch userinfo
            info_res = await client.get(GOOGLE_INFO, headers={
                "Authorization": f"Bearer {tokens['access_token']}",
            })
            if info_res.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch Google userinfo.")
            info = info_res.json()

        email = (info.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Google account has no email.")

        # Upsert user
        now = datetime.now(timezone.utc)
        existing = await db["users"].find_one({"email": email})
        if existing:
            await db["users"].update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "google_sub": info.get("sub"),
                    "email_verified": bool(info.get("email_verified", True)),
                    "avatar_url": info.get("picture"),
                    "last_login_at": now,
                }},
            )
            user = await db["users"].find_one({"_id": existing["_id"]})
        else:
            doc = {
                "email": email,
                "password_hash": None,
                "first_name": info.get("given_name") or "",
                "last_name": info.get("family_name") or "",
                "avatar_url": info.get("picture"),
                "google_sub": info.get("sub"),
                "email_verified": bool(info.get("email_verified", True)),
                "account_type": "user",
                "role": "user",
                "created_at": now,
                "last_login_at": now,
                "oauth_provider": "google",
            }
            res = await db["users"].insert_one(doc)
            doc["_id"] = res.inserted_id
            user = doc

        # Issue standard access+refresh cookies (same as password auth)
        access = auth_service.create_access_token(str(user["_id"]), user["email"])
        refresh = auth_service.create_refresh_token(str(user["_id"]))
        # Redirect back to app; the browser will land at next_path with cookies set.
        target = next_path if next_path.startswith("/") else "/"
        resp = RedirectResponse(url=target, status_code=302)
        auth_service._set_auth_cookies(resp, access, refresh, remember=True)
        return resp

    @router.get("/status")
    async def google_status():
        return {"configured": is_configured()}

    return router
