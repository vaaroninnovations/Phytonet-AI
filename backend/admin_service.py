"""PhytoNet AI — Single Super Admin architecture.

Namespace: /api/admin/*  (kept intentionally separate from /api/auth/*).

Design constraints (locked by user spec):
  - EXACTLY ONE super admin identified by env var SUPER_ADMIN_EMAIL.
  - No RBAC, no roles, no invites, no multi-admin.
  - Every state-changing action is written to `admin_audit_logs`.
  - Optional 2FA (both TOTP + Email OTP; admin picks).
  - Password reset uses SMTP; when not configured the reset link is logged.

Collections owned by this service
  - admin_audit_logs    ← append-only audit trail
  - admin_sessions      ← currently unused (JWT is self-contained); reserved for future revocation
  - admin_password_reset_tokens
  - admin_email_otp     ← ephemeral email-OTP challenges
  - platform_settings   ← key-value store of runtime config (branding, SMTP, node prices, feature flags, OAuth)

The super-admin document is stored inside the standard `users` collection
alongside every other account (single source of truth) but is uniquely
identified by `is_super_admin: True` + email match against SUPER_ADMIN_EMAIL.
"""
from __future__ import annotations
import io
import logging
import os
import secrets
from base64 import b64encode
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
import pyotp
import qrcode
from bson import ObjectId
from fastapi import HTTPException, Request

import email_service

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ADMIN_ACCESS_TTL = timedelta(minutes=30)
ADMIN_REFRESH_TTL = timedelta(hours=8)
ADMIN_MAX_FAILED_ATTEMPTS = 5
ADMIN_LOCKOUT_MINUTES = 15
EMAIL_OTP_TTL = timedelta(minutes=10)
RESET_TTL = timedelta(hours=1)
TOTP_ISSUER = "PhytoNet AI Admin"


# ───────────────────────── env helpers ──────────────────────────────
def super_admin_email() -> str:
    return (os.environ.get("SUPER_ADMIN_EMAIL", "") or "").strip().lower()


def _secret() -> str:
    s = os.environ.get("SUPER_ADMIN_JWT_SECRET")
    if not s:
        # Fall back to main JWT secret if not configured (still isolated by
        # payload `aud`).
        s = os.environ.get("JWT_SECRET")
    if not s:
        raise RuntimeError("SUPER_ADMIN_JWT_SECRET / JWT_SECRET not configured")
    return s


# ───────────────────────── password hashing ─────────────────────────
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ───────────────────────── JWT ──────────────────────────────────────
def create_access_token(admin_id: str, email: str) -> str:
    payload = {
        "sub": admin_id, "email": email, "type": "access", "aud": "admin",
        "exp": datetime.now(timezone.utc) + ADMIN_ACCESS_TTL,
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(admin_id: str) -> str:
    payload = {
        "sub": admin_id, "type": "refresh", "aud": "admin",
        "exp": datetime.now(timezone.utc) + ADMIN_REFRESH_TTL,
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_challenge_token(admin_id: str, method: str) -> str:
    """Short-lived token proving password verification succeeded, so the client
    can submit the 2FA code on a second call without re-typing password."""
    payload = {
        "sub": admin_id, "type": "challenge", "aud": "admin",
        "method": method,  # 'totp' | 'email_otp'
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def decode_challenge_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM],
                          audience="admin", options={"require": ["exp", "aud"]})
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired 2FA challenge: {e}")


def _set_admin_cookies(response, access: str, refresh: str):
    response.set_cookie("admin_access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=int(ADMIN_ACCESS_TTL.total_seconds()), path="/")
    response.set_cookie("admin_refresh_token", refresh, httponly=True, secure=True,
                        samesite="lax", max_age=int(ADMIN_REFRESH_TTL.total_seconds()), path="/")


def _clear_admin_cookies(response):
    response.delete_cookie("admin_access_token", path="/", samesite="lax", secure=True)
    response.delete_cookie("admin_refresh_token", path="/", samesite="lax", secure=True)


# ───────────────────────── auth dependency ──────────────────────────
def make_get_current_admin(db):
    """FastAPI dependency: returns the super-admin document or raises 401."""
    async def _dep(request: Request):
        token = request.cookies.get("admin_access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Admin authentication required")
        try:
            payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM],
                                 audience="admin")
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid admin token type")
            admin = await db["users"].find_one({"_id": ObjectId(payload["sub"])})
            if not admin or not admin.get("is_super_admin"):
                raise HTTPException(status_code=403, detail="Not the super admin")
            # Sanity: the env-configured email must still match
            if (admin.get("email") or "").lower() != super_admin_email():
                raise HTTPException(status_code=403, detail="Admin email mismatch")
            return admin
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Admin session expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid admin token")
    return _dep


# ───────────────────────── seed / initialize ────────────────────────
async def initialize(db):
    """Create indexes and seed the single super admin from env vars."""
    await db["admin_audit_logs"].create_index([("at", -1)])
    await db["admin_audit_logs"].create_index("actor_email")
    await db["admin_audit_logs"].create_index("action")
    await db["admin_login_attempts"].create_index("identifier")
    await db["admin_login_attempts"].create_index(
        "at", expireAfterSeconds=60 * 60 * 24)
    await db["admin_email_otp"].create_index(
        "expires_at", expireAfterSeconds=0)
    await db["admin_password_reset_tokens"].create_index(
        "expires_at", expireAfterSeconds=0)
    await db["platform_settings"].create_index("key", unique=True)

    email = super_admin_email()
    password = os.environ.get("SUPER_ADMIN_PASSWORD", "")
    if not email or not password:
        logger.warning("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — super admin NOT seeded")
        return

    existing = await db["users"].find_one({"email": email})
    if existing is None:
        await db["users"].insert_one({
            "email": email,
            "password_hash": hash_password(password),
            "first_name": "Super",
            "last_name": "Admin",
            "role": "super_admin",
            "account_type": "admin",
            "is_super_admin": True,
            "email_verified": True,
            "two_factor_enabled": False,
            "two_factor_method": None,   # 'totp' | 'email_otp' | None
            "totp_secret": None,
            "created_at": datetime.now(timezone.utc),
            "nodes_balance": 0,
            "nodes_lifetime_used": 0,
            "nodes_lifetime_purchased": 0,
            "welcome_bonus_granted": True,  # skip node bonus for the admin
        })
        logger.info(f"Seeded super admin: {email}")
    else:
        # Ensure existing user is flagged as super admin + password matches env
        updates = {}
        if not existing.get("is_super_admin"):
            updates["is_super_admin"] = True
            updates["role"] = "super_admin"
        if not verify_password(password, existing.get("password_hash", "")):
            updates["password_hash"] = hash_password(password)
        if updates:
            await db["users"].update_one({"_id": existing["_id"]}, {"$set": updates})
            logger.info(f"Refreshed super admin credentials for {email}")

    # Seed default platform settings if missing
    await _seed_default_settings(db)


# ───────────────────────── audit log ────────────────────────────────
async def record_audit(db, *, actor_email: str, action: str,
                       target: Optional[str] = None,
                       details: Optional[dict] = None,
                       request: Optional[Request] = None,
                       status: str = "success"):
    """Append an immutable audit entry."""
    entry = {
        "actor_email": actor_email,
        "action": action,             # e.g. "admin.login", "settings.update"
        "target": target,             # e.g. "settings/branding" or user email
        "details": details or {},
        "status": status,             # 'success' | 'failure'
        "ip": (request.client.host if request and request.client else None) if request else None,
        "user_agent": (request.headers.get("user-agent") if request else None),
        "at": datetime.now(timezone.utc),
    }
    try:
        await db["admin_audit_logs"].insert_one(entry)
    except Exception as e:
        logger.warning(f"Audit log write failed: {e}")
    return entry


# ───────────────────────── login attempts ───────────────────────────
async def record_login_attempt(db, key: str, success: bool):
    coll = db["admin_login_attempts"]
    if success:
        await coll.delete_many({"identifier": key})
        return
    await coll.insert_one({"identifier": key, "at": datetime.now(timezone.utc),
                           "success": False})


async def check_lockout(db, key: str):
    since = datetime.now(timezone.utc) - timedelta(minutes=ADMIN_LOCKOUT_MINUTES)
    n = await db["admin_login_attempts"].count_documents(
        {"identifier": key, "at": {"$gte": since}, "success": False}
    )
    if n >= ADMIN_MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed admin login attempts. Retry in {ADMIN_LOCKOUT_MINUTES} min.",
        )


# ───────────────────────── 2FA — TOTP ───────────────────────────────
def build_totp_provisioning_uri(email: str, secret: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=TOTP_ISSUER)


def build_totp_qr_data_url(uri: str) -> str:
    """Return a data: URL PNG for the OTP-auth URI."""
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + b64encode(buf.getvalue()).decode("ascii")


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    try:
        return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)
    except Exception:
        return False


# ───────────────────────── 2FA — Email OTP ──────────────────────────
async def issue_email_otp(db, admin_email: str) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    now = datetime.now(timezone.utc)
    await db["admin_email_otp"].delete_many({"email": admin_email})
    await db["admin_email_otp"].insert_one({
        "email": admin_email, "code": code,
        "expires_at": now + EMAIL_OTP_TTL, "created_at": now,
    })
    # Deliver via configured provider or log
    subject = "PhytoNet AI Admin — 2FA one-time code"
    html = (
        "<h2>PhytoNet AI — Admin Sign-in Code</h2>"
        f"<p>Your one-time code is <strong style='font-size:22px;letter-spacing:4px'>{code}</strong>.</p>"
        f"<p>It expires in {int(EMAIL_OTP_TTL.total_seconds() // 60)} minutes.</p>"
        "<p>If you did not request this, someone may be trying to access the admin console.</p>"
    )
    try:
        email_service.send_email(admin_email, subject, html)
    except Exception as e:
        logger.warning(f"Email OTP send failed: {e}")
    logger.warning(
        "\n===================== ADMIN 2FA (Email OTP) ====================\n"
        f"Email: {admin_email}\nCode : {code}\nTTL  : {EMAIL_OTP_TTL}\n"
        "===============================================================\n"
    )
    return code


async def verify_email_otp(db, admin_email: str, code: str) -> bool:
    rec = await db["admin_email_otp"].find_one({"email": admin_email, "code": (code or "").strip()})
    if not rec:
        return False
    exp = rec.get("expires_at")
    if exp is not None:
        # MongoDB stores naive UTC datetimes — coerce to aware for comparison
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return False
    await db["admin_email_otp"].delete_many({"email": admin_email})
    return True


# ───────────────────────── password reset ───────────────────────────
async def issue_password_reset(db, email: str, base_url: str = "") -> str:
    token = secrets.token_urlsafe(32)
    await db["admin_password_reset_tokens"].delete_many({"email": email})
    await db["admin_password_reset_tokens"].insert_one({
        "email": email, "token": token,
        "expires_at": datetime.now(timezone.utc) + RESET_TTL,
        "created_at": datetime.now(timezone.utc),
    })
    link = f"{base_url or ''}/admin/reset-password?token={token}"
    subject = "PhytoNet AI Admin — Password Reset"
    html = (
        "<h2>PhytoNet AI — Admin Password Reset</h2>"
        f'<p>Click <a href="{link}">this link</a> to reset your admin password.</p>'
        f"<p>The link expires in {int(RESET_TTL.total_seconds() // 60)} minutes.</p>"
    )
    try:
        email_service.send_email(email, subject, html)
    except Exception as e:
        logger.warning(f"Password reset email failed: {e}")
    logger.warning(
        "\n===================== ADMIN PASSWORD RESET =====================\n"
        f"Link: {link}\nTTL : {RESET_TTL}\n"
        "==============================================================\n"
    )
    return token


# ───────────────────────── platform settings ────────────────────────
DEFAULT_SETTINGS = {
    "branding": {
        "app_name": "PhytoNet AI",
        "tagline": "Network Pharmacology Research Platform",
        "logo_url": "",
        "primary_color": "#5139ED",
        "accent_color": "#8139ED",
        "support_email": "support@phytonet.ai",
    },
    "smtp": {
        "provider": os.environ.get("EMAIL_PROVIDER", ""),
        "from_address": os.environ.get("EMAIL_FROM", ""),
        "host": os.environ.get("SMTP_HOST", ""),
        "port": int(os.environ.get("SMTP_PORT") or 587),
        "username": os.environ.get("SMTP_USERNAME", ""),
        "password_masked": bool(os.environ.get("SMTP_PASSWORD")),
        "tls": (os.environ.get("SMTP_TLS", "true").lower() == "true"),
    },
    "oauth": {
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "google_redirect_uri": os.environ.get("GOOGLE_REDIRECT_URI", ""),
        "google_enabled": bool(os.environ.get("GOOGLE_CLIENT_ID")),
    },
    "node_pricing": {
        "plans": [
            {"id": "starter", "label": "Starter", "nodes": 10, "price_inr": 250},
            {"id": "research", "label": "Research", "nodes": 25, "price_inr": 500, "highlight": True, "badge": "Most Popular"},
            {"id": "professional", "label": "Professional", "nodes": 60, "price_inr": 1000},
        ],
        "welcome_bonus": 100,
        "module_costs": {
            "phytonet-ai-agent": 10,
            "molecular-docking": 5,
        },
    },
    "feature_flags": {
        "signup_enabled": True,
        "google_oauth_enabled": True,
        "email_verification_required": True,
        "molecular_dynamics_enabled": False,
        "ai_report_enabled": True,
        "maintenance_mode": False,
    },
}


async def _seed_default_settings(db):
    coll = db["platform_settings"]
    for key, value in DEFAULT_SETTINGS.items():
        existing = await coll.find_one({"key": key})
        if existing is None:
            await coll.insert_one({
                "key": key, "value": value,
                "updated_at": datetime.now(timezone.utc),
                "updated_by": "system",
            })


async def get_setting(db, key: str) -> dict:
    doc = await db["platform_settings"].find_one({"key": key})
    if not doc:
        return DEFAULT_SETTINGS.get(key, {})
    return doc.get("value", {})


async def set_setting(db, key: str, value: dict, updated_by: str) -> dict:
    await db["platform_settings"].update_one(
        {"key": key},
        {"$set": {"value": value, "updated_at": datetime.now(timezone.utc),
                  "updated_by": updated_by}},
        upsert=True,
    )
    return value


def serialize_admin(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u.get("email"),
        "first_name": u.get("first_name"),
        "last_name": u.get("last_name"),
        "is_super_admin": bool(u.get("is_super_admin")),
        "two_factor_enabled": bool(u.get("two_factor_enabled")),
        "two_factor_method": u.get("two_factor_method"),
        "created_at": (u.get("created_at").isoformat() if u.get("created_at") else None),
        "last_login_at": (u.get("last_login_at").isoformat() if u.get("last_login_at") else None),
    }
