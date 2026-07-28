"""Admin routes: authentication, profile, audit log, settings, dashboard.

Mounted at /api/admin/*  (kept isolated from /api/auth/*).
"""
from __future__ import annotations
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

import jwt
import pyotp
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

import admin_service as adm

logger = logging.getLogger(__name__)


# ───────────────────────── payloads ───────────────────────────────
class LoginPayload(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def _lc(cls, v: str) -> str:
        return v.strip().lower()


class Verify2FAPayload(BaseModel):
    challenge_token: str
    code: str


class SendEmailOTPPayload(BaseModel):
    challenge_token: str


class ChangePasswordPayload(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class ForgotPasswordPayload(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _lc(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str = Field(min_length=10, max_length=128)


class Setup2FAPayload(BaseModel):
    method: str = Field(pattern="^(totp|email_otp)$")


class Confirm2FAPayload(BaseModel):
    method: str = Field(pattern="^(totp|email_otp)$")
    code: str
    # Only for TOTP first-time setup — client passes the pending secret back
    pending_secret: Optional[str] = None


class Disable2FAPayload(BaseModel):
    password: str


class UpdateSettingPayload(BaseModel):
    key: str = Field(pattern="^(branding|smtp|oauth|node_pricing|feature_flags)$")
    value: dict


class UserPatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = None
    institution: Optional[str] = None
    department: Optional[str] = None
    country: Optional[str] = None
    designation: Optional[str] = None
    email_verified: Optional[bool] = None


class SuspendPayload(BaseModel):
    reason: Optional[str] = Field(None, max_length=280)


class AdminResetPasswordPayload(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class NodeAdjustPayload(BaseModel):
    delta: int = Field(..., ge=-100_000, le=100_000)
    reason: Optional[str] = Field(None, max_length=280)


# ───────────────────────── router factory ─────────────────────────
def build_router(db, frontend_url: str = ""):
    router = APIRouter(prefix="/admin", tags=["admin"])
    require_admin = adm.make_get_current_admin(db)

    # ═════════════════ AUTHENTICATION ═════════════════

    @router.post("/auth/login")
    async def login(payload: LoginPayload, request: Request, response: Response):
        # Single-admin threat model → key lockout on email only. Behind a
        # load balancer request.client.host is the ingress-pod IP (rotates),
        # so IP-based keys never accumulate enough failures to trip the limit.
        key = payload.email
        await adm.check_lockout(db, key)
        admin = await db["users"].find_one({"email": payload.email})
        if (not admin
                or not admin.get("is_super_admin")
                or (admin.get("email") or "").lower() != adm.super_admin_email()
                or not adm.verify_password(payload.password, admin.get("password_hash", ""))):
            await adm.record_login_attempt(db, key, False)
            await adm.record_audit(db, actor_email=payload.email,
                                   action="admin.login_failed",
                                   details={"reason": "bad_credentials"},
                                   request=request, status="failure")
            raise HTTPException(status_code=401, detail="Invalid credentials")

        # If 2FA is enabled, don't issue full tokens yet — return a challenge.
        if admin.get("two_factor_enabled"):
            method = admin.get("two_factor_method") or "totp"
            challenge = adm.create_challenge_token(str(admin["_id"]), method)
            await adm.record_audit(db, actor_email=admin["email"],
                                   action="admin.login_2fa_required",
                                   details={"method": method}, request=request)
            return {"two_factor_required": True, "method": method,
                    "challenge_token": challenge}

        await adm.record_login_attempt(db, key, True)
        await db["users"].update_one({"_id": admin["_id"]},
                                     {"$set": {"last_login_at": datetime.now(timezone.utc)}})
        access = adm.create_access_token(str(admin["_id"]), admin["email"])
        refresh = adm.create_refresh_token(str(admin["_id"]))
        adm._set_admin_cookies(response, access, refresh)
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.login", request=request)
        return {"admin": adm.serialize_admin(admin), "two_factor_required": False}

    @router.post("/auth/2fa/send-email")
    async def send_email_otp(payload: SendEmailOTPPayload, request: Request):
        try:
            claims = adm.decode_challenge_token(payload.challenge_token)
        except HTTPException:
            raise
        if claims.get("method") != "email_otp":
            raise HTTPException(status_code=400, detail="Challenge is not email_otp")
        admin = await db["users"].find_one({"_id": ObjectId(claims["sub"])})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
        await adm.issue_email_otp(db, admin["email"])
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.email_otp_sent", request=request)
        return {"ok": True}

    @router.post("/auth/2fa/verify")
    async def verify_2fa(payload: Verify2FAPayload, request: Request,
                         response: Response):
        claims = adm.decode_challenge_token(payload.challenge_token)
        admin = await db["users"].find_one({"_id": ObjectId(claims["sub"])})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
        method = claims.get("method")
        ok = False
        if method == "totp":
            ok = adm.verify_totp(admin.get("totp_secret") or "", payload.code)
        elif method == "email_otp":
            ok = await adm.verify_email_otp(db, admin["email"], payload.code)
        if not ok:
            await adm.record_audit(db, actor_email=admin["email"],
                                   action="admin.login_2fa_failed",
                                   details={"method": method},
                                   request=request, status="failure")
            raise HTTPException(status_code=401, detail="Invalid 2FA code")

        await db["users"].update_one({"_id": admin["_id"]},
                                     {"$set": {"last_login_at": datetime.now(timezone.utc)}})
        access = adm.create_access_token(str(admin["_id"]), admin["email"])
        refresh = adm.create_refresh_token(str(admin["_id"]))
        adm._set_admin_cookies(response, access, refresh)
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.login_2fa_success",
                               details={"method": method}, request=request)
        return {"admin": adm.serialize_admin(admin)}

    @router.post("/auth/logout")
    async def logout(request: Request, response: Response,
                     admin=Depends(require_admin)):
        adm._clear_admin_cookies(response)
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.logout", request=request)
        return {"ok": True}

    @router.post("/auth/refresh")
    async def refresh(request: Request, response: Response):
        rt = request.cookies.get("admin_refresh_token")
        if not rt:
            raise HTTPException(status_code=401, detail="No admin refresh token")
        try:
            payload = jwt.decode(rt, adm._secret(),
                                 algorithms=[adm.JWT_ALGORITHM], audience="admin")
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Invalid admin refresh token")
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Bad token type")
        admin = await db["users"].find_one({"_id": ObjectId(payload["sub"])})
        if not admin or not admin.get("is_super_admin"):
            raise HTTPException(status_code=401, detail="Admin not found")
        access = adm.create_access_token(str(admin["_id"]), admin["email"])
        response.set_cookie("admin_access_token", access, httponly=True, secure=True,
                            samesite="lax",
                            max_age=int(adm.ADMIN_ACCESS_TTL.total_seconds()),
                            path="/")
        return {"ok": True}

    @router.get("/auth/me")
    async def me(admin=Depends(require_admin)):
        return {"admin": adm.serialize_admin(admin)}

    @router.post("/auth/forgot-password")
    async def forgot_password(payload: ForgotPasswordPayload, request: Request):
        # Prevent enumeration: always respond with 200 but only actually issue
        # a token for the configured super admin.
        if payload.email == adm.super_admin_email():
            admin = await db["users"].find_one({"email": payload.email})
            if admin:
                base = frontend_url or str(request.base_url).rstrip("/")
                await adm.issue_password_reset(db, payload.email, base)
                await adm.record_audit(db, actor_email=payload.email,
                                       action="admin.password_reset_requested",
                                       request=request)
        return {"ok": True, "message": "If the account exists, a reset link has been sent."}

    @router.post("/auth/reset-password")
    async def reset_password(payload: ResetPasswordPayload, request: Request):
        rec = await db["admin_password_reset_tokens"].find_one({"token": payload.token})
        exp = rec.get("expires_at") if rec else None
        if exp is not None and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if not rec or exp is None or exp < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired reset token")
        email = rec["email"]
        if email != adm.super_admin_email():
            raise HTTPException(status_code=400, detail="Invalid reset token")
        await db["users"].update_one(
            {"email": email},
            {"$set": {"password_hash": adm.hash_password(payload.new_password)}},
        )
        await db["admin_password_reset_tokens"].delete_many({"email": email})
        await adm.record_audit(db, actor_email=email,
                               action="admin.password_reset_completed",
                               request=request)
        return {"ok": True}

    # ═════════════════ PROFILE / 2FA ═════════════════

    @router.post("/auth/change-password")
    async def change_password(payload: ChangePasswordPayload, request: Request,
                              admin=Depends(require_admin)):
        if not adm.verify_password(payload.current_password, admin.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        await db["users"].update_one(
            {"_id": admin["_id"]},
            {"$set": {"password_hash": adm.hash_password(payload.new_password)}},
        )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.password_changed", request=request)
        return {"ok": True}

    @router.post("/auth/2fa/setup")
    async def setup_2fa(payload: Setup2FAPayload, request: Request,
                        admin=Depends(require_admin)):
        if payload.method == "totp":
            secret = pyotp.random_base32()
            uri = adm.build_totp_provisioning_uri(admin["email"], secret)
            qr = adm.build_totp_qr_data_url(uri)
            # NOTE: secret is returned to the client so it can be POSTed back
            # on /confirm. We do NOT persist it until confirmation succeeds.
            return {"method": "totp", "pending_secret": secret,
                    "provisioning_uri": uri, "qr_code": qr}
        else:  # email_otp
            await adm.issue_email_otp(db, admin["email"])
            return {"method": "email_otp",
                    "message": "One-time code sent to admin email."}

    @router.post("/auth/2fa/confirm")
    async def confirm_2fa(payload: Confirm2FAPayload, request: Request,
                          admin=Depends(require_admin)):
        if payload.method == "totp":
            if not payload.pending_secret:
                raise HTTPException(status_code=400,
                                    detail="Missing pending_secret for TOTP setup")
            if not adm.verify_totp(payload.pending_secret, payload.code):
                raise HTTPException(status_code=401, detail="Invalid TOTP code")
            await db["users"].update_one(
                {"_id": admin["_id"]},
                {"$set": {
                    "two_factor_enabled": True,
                    "two_factor_method": "totp",
                    "totp_secret": payload.pending_secret,
                }},
            )
        else:  # email_otp
            if not await adm.verify_email_otp(db, admin["email"], payload.code):
                raise HTTPException(status_code=401, detail="Invalid email OTP")
            await db["users"].update_one(
                {"_id": admin["_id"]},
                {"$set": {
                    "two_factor_enabled": True,
                    "two_factor_method": "email_otp",
                    "totp_secret": None,
                }},
            )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.2fa_enabled",
                               details={"method": payload.method},
                               request=request)
        return {"ok": True, "method": payload.method}

    @router.post("/auth/2fa/disable")
    async def disable_2fa(payload: Disable2FAPayload, request: Request,
                          admin=Depends(require_admin)):
        if not adm.verify_password(payload.password, admin.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Password is incorrect")
        await db["users"].update_one(
            {"_id": admin["_id"]},
            {"$set": {"two_factor_enabled": False, "two_factor_method": None,
                      "totp_secret": None}},
        )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.2fa_disabled", request=request)
        return {"ok": True}

    # ═════════════════ AUDIT LOG ═════════════════

    @router.get("/audit-log")
    async def list_audit(
        admin=Depends(require_admin),
        q: Optional[str] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ):
        limit = max(1, min(500, limit))
        offset = max(0, offset)
        query: dict = {}
        if action:
            query["action"] = action
        if status:
            query["status"] = status
        if q:
            query["$or"] = [
                {"actor_email": {"$regex": q, "$options": "i"}},
                {"target": {"$regex": q, "$options": "i"}},
                {"action": {"$regex": q, "$options": "i"}},
            ]
        cursor = db["admin_audit_logs"].find(query).sort("at", -1).skip(offset).limit(limit)
        rows = []
        async for r in cursor:
            rows.append({
                "id": str(r["_id"]),
                "actor_email": r.get("actor_email"),
                "action": r.get("action"),
                "target": r.get("target"),
                "details": r.get("details") or {},
                "status": r.get("status", "success"),
                "ip": r.get("ip"),
                "user_agent": r.get("user_agent"),
                "at": (r.get("at") or datetime.now(timezone.utc)).isoformat(),
            })
        total = await db["admin_audit_logs"].count_documents(query)
        return {"rows": rows, "total": total, "limit": limit, "offset": offset}

    # ═════════════════ SETTINGS ═════════════════

    @router.get("/settings")
    async def list_settings(admin=Depends(require_admin)):
        out = {}
        for key in ("branding", "smtp", "oauth", "node_pricing", "feature_flags"):
            out[key] = await adm.get_setting(db, key)
        # Never expose the raw SMTP password
        smtp = out.get("smtp", {}) or {}
        if "password" in smtp:
            smtp["password_masked"] = bool(smtp.pop("password"))
        return out

    @router.get("/settings/{key}")
    async def get_setting(key: str, admin=Depends(require_admin)):
        if key not in ("branding", "smtp", "oauth", "node_pricing", "feature_flags"):
            raise HTTPException(status_code=404, detail="Unknown settings key")
        v = await adm.get_setting(db, key)
        if key == "smtp" and "password" in v:
            v = dict(v)
            v["password_masked"] = bool(v.pop("password"))
        return {"key": key, "value": v}

    @router.put("/settings/{key}")
    async def update_setting(key: str, payload: dict, request: Request,
                             admin=Depends(require_admin)):
        if key not in ("branding", "smtp", "oauth", "node_pricing", "feature_flags"):
            raise HTTPException(status_code=404, detail="Unknown settings key")
        # SMTP password preservation: allow updating with password stripped
        if key == "smtp":
            existing = await adm.get_setting(db, "smtp") or {}
            if not payload.get("password") and existing.get("password"):
                payload["password"] = existing["password"]
        current = await adm.get_setting(db, key)
        await adm.set_setting(db, key, payload, updated_by=admin["email"])
        await adm.record_audit(
            db, actor_email=admin["email"],
            action="admin.settings_updated",
            target=f"settings/{key}",
            details={"key": key,
                     "changed_fields": sorted(list((payload or {}).keys()))},
            request=request,
        )
        return {"key": key, "value": payload}

    # ═════════════════ DASHBOARD & USER MGMT ═════════════════

    @router.get("/dashboard/stats")
    async def dashboard_stats(admin=Depends(require_admin)):
        users_total = await db["users"].count_documents({})
        users_verified = await db["users"].count_documents({"email_verified": True})
        projects_total = await db["projects"].count_documents({}) if "projects" in await db.list_collection_names() else 0
        # Node aggregates
        agg = await db["users"].aggregate([
            {"$group": {
                "_id": None,
                "total_balance": {"$sum": {"$ifNull": ["$nodes_balance", 0]}},
                "total_used": {"$sum": {"$ifNull": ["$nodes_lifetime_used", 0]}},
                "total_purchased": {"$sum": {"$ifNull": ["$nodes_lifetime_purchased", 0]}},
            }},
        ]).to_list(1)
        node_stats = agg[0] if agg else {"total_balance": 0, "total_used": 0, "total_purchased": 0}
        node_stats.pop("_id", None)

        # Recent audit entries
        recent_audit = []
        async for r in db["admin_audit_logs"].find({}).sort("at", -1).limit(10):
            recent_audit.append({
                "action": r.get("action"),
                "actor_email": r.get("actor_email"),
                "status": r.get("status", "success"),
                "at": (r.get("at") or datetime.now(timezone.utc)).isoformat(),
            })

        # Signups over last 30 days
        thirty_days_ago = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        signups_30d = await db["users"].count_documents(
            {"created_at": {"$gte": thirty_days_ago.replace(day=1)}}
        )
        return {
            "users_total": users_total,
            "users_verified": users_verified,
            "projects_total": projects_total,
            "node_stats": node_stats,
            "signups_current_month": signups_30d,
            "recent_audit": recent_audit,
        }

    @router.get("/users")
    async def list_users(
        admin=Depends(require_admin),
        q: Optional[str] = None,
        role: Optional[str] = None,
        verified: Optional[str] = None,     # "true" | "false"
        suspended: Optional[str] = None,    # "true" | "false"
        limit: int = 50,
        offset: int = 0,
    ):
        limit = max(1, min(200, limit))
        query: dict = {}
        if q:
            query["$or"] = [
                {"email": {"$regex": q, "$options": "i"}},
                {"first_name": {"$regex": q, "$options": "i"}},
                {"last_name": {"$regex": q, "$options": "i"}},
            ]
        if role:
            query["role"] = role
        if verified in ("true", "false"):
            query["email_verified"] = (verified == "true")
        if suspended in ("true", "false"):
            query["is_suspended"] = (suspended == "true") if suspended == "true" else {"$ne": True}
        cursor = db["users"].find(query, {"password_hash": 0, "totp_secret": 0}).sort("created_at", -1).skip(offset).limit(limit)
        rows = []
        async for u in cursor:
            rows.append({
                "id": str(u["_id"]),
                "email": u.get("email"),
                "first_name": u.get("first_name"),
                "last_name": u.get("last_name"),
                "role": u.get("role"),
                "is_super_admin": bool(u.get("is_super_admin")),
                "is_suspended": bool(u.get("is_suspended")),
                "email_verified": bool(u.get("email_verified")),
                "nodes_balance": u.get("nodes_balance", 0),
                "created_at": (u.get("created_at").isoformat() if u.get("created_at") else None),
                "last_login_at": (u.get("last_login_at").isoformat() if u.get("last_login_at") else None),
            })
        total = await db["users"].count_documents(query)
        return {"rows": rows, "total": total, "limit": limit, "offset": offset}

    # ═════════════════ USER MANAGEMENT ═════════════════
    # All mutation endpoints refuse to touch the super admin. Every action is
    # audit-logged with action='admin.user_*'.

    def _protect_super_admin(u: dict):
        if u.get("is_super_admin") or (u.get("email") or "").lower() == adm.super_admin_email():
            raise HTTPException(status_code=403, detail="Cannot modify the super admin account")

    async def _fetch_user_or_404(user_id: str) -> dict:
        try:
            oid = ObjectId(user_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid user id")
        u = await db["users"].find_one({"_id": oid})
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        return u

    def _serialize_user(u: dict) -> dict:
        return {
            "id": str(u["_id"]),
            "email": u.get("email"),
            "first_name": u.get("first_name"),
            "last_name": u.get("last_name"),
            "username": u.get("username"),
            "role": u.get("role"),
            "account_type": u.get("account_type"),
            "is_super_admin": bool(u.get("is_super_admin")),
            "is_suspended": bool(u.get("is_suspended")),
            "email_verified": bool(u.get("email_verified")),
            "institution": u.get("institution"),
            "department": u.get("department"),
            "country": u.get("country"),
            "designation": u.get("designation"),
            "orcid_id": u.get("orcid_id") or u.get("orcid"),
            "website": u.get("website"),
            "research_area": u.get("research_area"),
            "purpose_of_use": u.get("purpose_of_use", []),
            "nodes_balance": u.get("nodes_balance", 0),
            "nodes_lifetime_used": u.get("nodes_lifetime_used", 0),
            "nodes_lifetime_purchased": u.get("nodes_lifetime_purchased", 0),
            "created_at": (u.get("created_at").isoformat() if u.get("created_at") else None),
            "last_login_at": (u.get("last_login_at").isoformat() if u.get("last_login_at") else None),
            "suspended_at": (u.get("suspended_at").isoformat() if u.get("suspended_at") else None),
            "suspended_reason": u.get("suspended_reason"),
        }

    @router.get("/users/{user_id}")
    async def get_user(user_id: str, admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        # Include recent node ledger for this user (last 20)
        history = []
        async for r in db["node_transactions"].find({"user_id": user_id}).sort("at", -1).limit(20):
            history.append({
                "id": str(r["_id"]),
                "direction": r.get("direction"),
                "amount": r.get("amount", 0),
                "balance_after": r.get("balance_after", 0),
                "module": r.get("module"),
                "reason": r.get("reason"),
                "at": (r.get("at") or datetime.now(timezone.utc)).isoformat(),
            })
        projects_count = await db["projects"].count_documents({"user_id": user_id})
        return {"user": _serialize_user(u),
                "node_history": history,
                "projects_count": projects_count}

    @router.patch("/users/{user_id}")
    async def update_user(user_id: str, payload: UserPatch, request: Request,
                          admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        _protect_super_admin(u)
        update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
        if not update:
            raise HTTPException(status_code=400, detail="No fields provided")
        update["updated_at"] = datetime.now(timezone.utc)
        await db["users"].update_one({"_id": u["_id"]}, {"$set": update})
        fresh = await db["users"].find_one({"_id": u["_id"]})
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_updated", target=u.get("email"),
                               details={"user_id": user_id,
                                        "changed_fields": sorted(update.keys())},
                               request=request)
        return {"user": _serialize_user(fresh)}

    @router.post("/users/{user_id}/suspend")
    async def suspend_user(user_id: str, payload: SuspendPayload, request: Request,
                           admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        _protect_super_admin(u)
        await db["users"].update_one(
            {"_id": u["_id"]},
            {"$set": {"is_suspended": True,
                      "suspended_at": datetime.now(timezone.utc),
                      "suspended_reason": payload.reason or "Suspended by admin"}},
        )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_suspended", target=u.get("email"),
                               details={"user_id": user_id, "reason": payload.reason},
                               request=request)
        return {"ok": True}

    @router.post("/users/{user_id}/unsuspend")
    async def unsuspend_user(user_id: str, request: Request,
                             admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        _protect_super_admin(u)
        await db["users"].update_one(
            {"_id": u["_id"]},
            {"$unset": {"is_suspended": "", "suspended_at": "", "suspended_reason": ""}},
        )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_unsuspended", target=u.get("email"),
                               details={"user_id": user_id}, request=request)
        return {"ok": True}

    @router.post("/users/{user_id}/reset-password")
    async def admin_reset_user_password(user_id: str,
                                        payload: AdminResetPasswordPayload,
                                        request: Request,
                                        admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        _protect_super_admin(u)
        await db["users"].update_one(
            {"_id": u["_id"]},
            {"$set": {"password_hash": adm.hash_password(payload.new_password)}},
        )
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_password_reset",
                               target=u.get("email"),
                               details={"user_id": user_id}, request=request)
        return {"ok": True}

    @router.post("/users/{user_id}/nodes/adjust")
    async def adjust_user_nodes(user_id: str, payload: NodeAdjustPayload,
                                request: Request, admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        if payload.delta == 0:
            raise HTTPException(status_code=400, detail="Delta must be non-zero")
        current = u.get("nodes_balance", 0)
        new_balance = max(0, current + payload.delta)
        applied_delta = new_balance - current  # never allow negative balance
        await db["users"].update_one(
            {"_id": u["_id"]},
            {"$set": {"nodes_balance": new_balance}},
        )
        # Ledger entry
        direction = "credit" if applied_delta > 0 else "debit"
        await db["node_transactions"].insert_one({
            "user_id": user_id,
            "direction": direction,
            "amount": abs(applied_delta),
            "balance_after": new_balance,
            "module": "admin_adjustment",
            "workflow": None,
            "job_id": None,
            "reason": payload.reason or f"Admin manual {direction}",
            "meta": {"admin_email": admin["email"]},
            "at": datetime.now(timezone.utc),
        })
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_nodes_adjusted",
                               target=u.get("email"),
                               details={"user_id": user_id,
                                        "delta": applied_delta,
                                        "new_balance": new_balance,
                                        "reason": payload.reason},
                               request=request)
        return {"ok": True, "new_balance": new_balance, "applied_delta": applied_delta}

    @router.delete("/users/{user_id}")
    async def delete_user(user_id: str, request: Request,
                          admin=Depends(require_admin)):
        u = await _fetch_user_or_404(user_id)
        _protect_super_admin(u)
        # Cascade cleanup: user's projects, autosave, tokens
        await db["projects"].delete_many({"user_id": user_id})
        await db["project_versions"].delete_many({"user_id": user_id})
        await db["node_transactions"].delete_many({"user_id": user_id})
        await db["email_verification_tokens"].delete_many({"user_id": user_id})
        await db["password_reset_tokens"].delete_many({"user_id": user_id})
        await db["users"].delete_one({"_id": u["_id"]})
        await adm.record_audit(db, actor_email=admin["email"],
                               action="admin.user_deleted", target=u.get("email"),
                               details={"user_id": user_id,
                                        "user_email": u.get("email")},
                               request=request)
        return {"ok": True}

    return router
