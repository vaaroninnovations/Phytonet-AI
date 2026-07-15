"""PhytoNet AI — JWT-based custom authentication service.

Endpoints (mounted at /api/auth by server.py):
  POST /register        Sign-up with full research-profile fields
  POST /login           Email + password login
  POST /logout          Clear cookies
  GET  /me              Current session user
  POST /refresh         Exchange refresh cookie for new access cookie
  POST /verify-email    Confirm email via verification token
  POST /resend-verification  Re-send verification link
"""
from __future__ import annotations
import logging
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

import email_service

logger = logging.getLogger(__name__)

# ── Public-preview bypass ──────────────────────────────────────────────────
# When AUTH_GATE_ENABLED is False, protected endpoints resolve a synthetic
# admin user without requiring a valid JWT. Flip to True (or set env
# AUTH_GATE_ENABLED=on) before production deploy to re-enable the gate.
AUTH_GATE_ENABLED = os.environ.get("AUTH_GATE_ENABLED", "off").strip().lower() in {"1", "on", "true", "yes"}

# Verification tokens expire after 24 hours (production requirement).
VERIFICATION_TTL = timedelta(hours=24)
APP_NAME = "PhytoNet AI"

JWT_ALGORITHM = "HS256"
ACCESS_TTL = timedelta(minutes=60)   # slightly longer since app is analysis-heavy
REFRESH_TTL = timedelta(days=14)
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

router = APIRouter(prefix="/auth")


# ─────────────────────────── password hashing ────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─────────────────────────── JWT helpers ─────────────────────────────────
def _secret() -> str:
    s = os.environ.get("JWT_SECRET")
    if not s:
        raise RuntimeError("JWT_SECRET not configured")
    return s


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + ACCESS_TTL}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + REFRESH_TTL}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _set_auth_cookies(response: Response, access: str, refresh: str, remember: bool = True):
    max_access = int(ACCESS_TTL.total_seconds())
    max_refresh = int(REFRESH_TTL.total_seconds()) if remember else None
    # Same-origin preview deployment → samesite=lax works; secure required over HTTPS.
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=max_access, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="lax", max_age=max_refresh, path="/")


def _clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/", samesite="lax", secure=True)
    response.delete_cookie("refresh_token", path="/", samesite="lax", secure=True)


# ─────────────────────────── models ────────────────────────────────────
class RegisterPayload(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    country: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    role: Optional[str] = None
    research_area: Optional[str] = None
    purpose_of_use: List[str] = Field(default_factory=list)
    referral_source: Optional[str] = None
    orcid_id: Optional[str] = None
    website: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _lc(cls, v: str) -> str:
        return v.strip().lower()


class LoginPayload(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True

    @field_validator("email")
    @classmethod
    def _lc(cls, v: str) -> str:
        return v.strip().lower()


class VerifyEmailPayload(BaseModel):
    token: str


# ─────────────────────────── helpers ────────────────────────────────────
def _serialize_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u.get("email"),
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "role": u.get("role"),
        "institution": u.get("institution"),
        "department": u.get("department"),
        "country": u.get("country"),
        "research_area": u.get("research_area"),
        "purpose_of_use": u.get("purpose_of_use", []),
        "referral_source": u.get("referral_source"),
        "orcid_id": u.get("orcid_id"),
        "website": u.get("website"),
        "email_verified": bool(u.get("email_verified", False)),
        "account_type": u.get("account_type", "user"),
        "created_at": (u.get("created_at").isoformat() if u.get("created_at") else None),
    }


def _dispatch_verification(background: BackgroundTasks, base_url: str, token: str,
                           email: str, first_name: str = ""):
    """Log + send verification email (async via BackgroundTasks)."""
    link = f"{base_url}/verify-email?token={token}"
    logger.warning(
        "\n============================================================\n"
        f"[EMAIL VERIFICATION] Link for {email}:\n{link}\n"
        "============================================================\n"
    )
    html = email_service.verification_email_html(APP_NAME, link, first_name)
    subject = f"Verify your {APP_NAME} account"
    if background is not None:
        background.add_task(email_service.send_email, email, subject, html)
    else:
        email_service.send_email(email, subject, html)


async def _record_login_attempt(db, key: str, success: bool):
    coll = db["login_attempts"]
    if success:
        await coll.delete_many({"identifier": key})
        return
    now = datetime.now(timezone.utc)
    await coll.insert_one({"identifier": key, "at": now, "success": False})


async def _check_lockout(db, key: str):
    since = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_MINUTES)
    n = await db["login_attempts"].count_documents({"identifier": key, "at": {"$gte": since}, "success": False})
    if n >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.")


# ─────────────────────────── dependency: get_current_user ─────────────────
def make_get_current_user(db):
    async def _dep(request: Request):
        # Public-preview bypass — return a persistent synthetic admin so that
        # protected endpoints (AI Assistant, Projects, Downloads) work without
        # requiring a JWT. This user is created once, so per-user data (e.g.
        # Assistant runs, saved projects) is still coherent across requests.
        if not AUTH_GATE_ENABLED:
            preview_email = "preview@phytonet.ai"
            u = await db["users"].find_one({"email": preview_email})
            if u is None:
                await db["users"].insert_one({
                    "email": preview_email,
                    "password_hash": "!disabled!",
                    "first_name": "Preview",
                    "last_name": "User",
                    "role": "admin",           # unlimited assistant runs while gate is off
                    "account_type": "admin",
                    "email_verified": True,
                    "created_at": datetime.now(timezone.utc),
                })
                u = await db["users"].find_one({"email": preview_email})
            return u

        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        try:
            payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid token type")
            u = await db["users"].find_one({"_id": ObjectId(payload["sub"])})
            if not u:
                raise HTTPException(status_code=401, detail="User not found")
            return u
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    return _dep


# ─────────────────────────── init / seed ─────────────────────────────────
async def initialize(db):
    await db["users"].create_index("email", unique=True)
    await db["login_attempts"].create_index("identifier")
    await db["login_attempts"].create_index("at", expireAfterSeconds=60 * 60 * 24)
    await db["password_reset_tokens"].create_index("expires_at", expireAfterSeconds=0)
    await db["email_verification_tokens"].create_index("expires_at", expireAfterSeconds=0)

    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        return
    existing = await db["users"].find_one({"email": admin_email})
    if existing is None:
        await db["users"].insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "first_name": "PhytoNet",
            "last_name": "Admin",
            "role": "admin",
            "account_type": "admin",
            "email_verified": True,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info(f"Seeded admin user {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db["users"].update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Updated admin password for {admin_email}")


# ─────────────────────────── route factory ──────────────────────────────
def build_router(db, frontend_url: str = ""):
    dep_user = make_get_current_user(db)

    @router.post("/register")
    async def register(payload: RegisterPayload, request: Request, response: Response,
                       background: BackgroundTasks):
        email = payload.email
        if await db["users"].find_one({"email": email}):
            raise HTTPException(status_code=409, detail="An account with that email already exists.")
        doc = {
            "email": email,
            "password_hash": hash_password(payload.password),
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "country": payload.country,
            "institution": payload.institution,
            "department": payload.department,
            "role": payload.role,
            "research_area": payload.research_area,
            "purpose_of_use": payload.purpose_of_use,
            "referral_source": payload.referral_source,
            "orcid_id": payload.orcid_id,
            "website": payload.website,
            "email_verified": False,
            "account_type": "user",
            "created_at": datetime.now(timezone.utc),
        }
        res = await db["users"].insert_one(doc)
        uid = str(res.inserted_id)
        # Generate verification token (24h TTL — production requirement)
        vtoken = secrets.token_urlsafe(32)
        await db["email_verification_tokens"].insert_one({
            "token": vtoken, "user_id": uid, "email": email,
            "expires_at": datetime.now(timezone.utc) + VERIFICATION_TTL,
        })
        base = frontend_url or str(request.base_url).rstrip("/")
        _dispatch_verification(background, base, vtoken, email, payload.first_name)
        # Auto-login upon register (verification is required only for downloads)
        access = create_access_token(uid, email)
        refresh = create_refresh_token(uid)
        _set_auth_cookies(response, access, refresh, remember=True)
        doc["_id"] = res.inserted_id
        return {"user": _serialize_user(doc), "verification_required": True,
                "verification_token_dev": vtoken,
                "email_provider": email_service.get_provider() or "dev-log"}

    @router.post("/login")
    async def login(payload: LoginPayload, request: Request, response: Response):
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{payload.email}"
        await _check_lockout(db, key)
        u = await db["users"].find_one({"email": payload.email})
        if not u or not verify_password(payload.password, u["password_hash"]):
            await _record_login_attempt(db, key, False)
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        await _record_login_attempt(db, key, True)
        uid = str(u["_id"])
        access = create_access_token(uid, u["email"])
        refresh = create_refresh_token(uid)
        _set_auth_cookies(response, access, refresh, remember=payload.remember_me)
        return {"user": _serialize_user(u)}

    @router.post("/logout")
    async def logout(response: Response):
        _clear_auth_cookies(response)
        return {"ok": True}

    @router.get("/me")
    async def me(user=Depends(dep_user)):
        return {"user": _serialize_user(user)}

    @router.post("/refresh")
    async def refresh_token_endpoint(request: Request, response: Response):
        rt = request.cookies.get("refresh_token")
        if not rt:
            raise HTTPException(status_code=401, detail="No refresh token")
        try:
            payload = jwt.decode(rt, _secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=401, detail="Invalid token type")
            uid = payload["sub"]
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        u = await db["users"].find_one({"_id": ObjectId(uid)})
        if not u:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(uid, u["email"])
        response.set_cookie("access_token", access, httponly=True, secure=True,
                            samesite="lax", max_age=int(ACCESS_TTL.total_seconds()), path="/")
        return {"ok": True}

    @router.post("/verify-email")
    async def verify_email(payload: VerifyEmailPayload):
        rec = await db["email_verification_tokens"].find_one({"token": payload.token})
        if not rec:
            raise HTTPException(status_code=400, detail="Invalid or expired verification token.")
        await db["users"].update_one({"_id": ObjectId(rec["user_id"])},
                                     {"$set": {"email_verified": True}})
        await db["email_verification_tokens"].delete_one({"_id": rec["_id"]})
        return {"ok": True, "email": rec["email"]}

    @router.post("/resend-verification")
    async def resend_verification(request: Request, background: BackgroundTasks,
                                  user=Depends(dep_user)):
        if user.get("email_verified"):
            return {"ok": True, "already_verified": True}
        # Purge previous tokens
        await db["email_verification_tokens"].delete_many({"user_id": str(user["_id"])})
        vtoken = secrets.token_urlsafe(32)
        await db["email_verification_tokens"].insert_one({
            "token": vtoken, "user_id": str(user["_id"]), "email": user["email"],
            "expires_at": datetime.now(timezone.utc) + VERIFICATION_TTL,
        })
        base = frontend_url or str(request.base_url).rstrip("/")
        _dispatch_verification(background, base, vtoken, user["email"], user.get("first_name", ""))
        return {"ok": True, "verification_token_dev": vtoken,
                "email_provider": email_service.get_provider() or "dev-log"}

    @router.post("/resend-verification-public")
    async def resend_verification_public(payload: LoginPayload, request: Request,
                                         background: BackgroundTasks):
        """Public resend used when a user isn't logged in (e.g. token expired).
        Validates password to prevent enumeration + spam."""
        u = await db["users"].find_one({"email": payload.email})
        if not u or not verify_password(payload.password, u["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        if u.get("email_verified"):
            return {"ok": True, "already_verified": True}
        await db["email_verification_tokens"].delete_many({"user_id": str(u["_id"])})
        vtoken = secrets.token_urlsafe(32)
        await db["email_verification_tokens"].insert_one({
            "token": vtoken, "user_id": str(u["_id"]), "email": u["email"],
            "expires_at": datetime.now(timezone.utc) + VERIFICATION_TTL,
        })
        base = frontend_url or str(request.base_url).rstrip("/")
        _dispatch_verification(background, base, vtoken, u["email"], u.get("first_name", ""))
        return {"ok": True, "verification_token_dev": vtoken,
                "email_provider": email_service.get_provider() or "dev-log"}

    return router
