"""Contact message system — capture inquiries from the public homepage and
expose an admin dashboard to triage them.

Anti-spam layers on POST /api/contact:
  1. Per-IP rate limit (5 submits / rolling hour, 20 / rolling day)
  2. Honeypot field `website` — silently accepted (200 OK) but never stored
  3. Friendly math captcha issued via GET /api/contact/challenge, verified on
     submit. Challenges expire after 10 minutes and are single-use.

Collections
───────────
`contact_messages`      → stored inquiries
`contact_challenges`    → active math captchas (TTL 10 min)

Endpoints
─────────
  GET    /api/contact/challenge            → issue math captcha
  POST   /api/contact                      → public submit (no auth)
  GET    /api/admin/contact/messages       → admin list w/ filters
  GET    /api/admin/contact/summary        → admin stats (counts by status)
  PATCH  /api/admin/contact/messages/{id}  → update status/notes (admin)
  DELETE /api/admin/contact/messages/{id}  → hard delete (admin)
"""
from __future__ import annotations

import logging
import random
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

import admin_service as adm

logger = logging.getLogger(__name__)

STATUS_VALUES = ("new", "read", "replied")

# ─── Rate-limit config ───
RATE_LIMIT_HOUR   = 5     # max submits per IP per rolling hour
RATE_LIMIT_DAY    = 20    # max submits per IP per rolling day
CHALLENGE_TTL_SEC = 600   # 10 minutes


def _client_ip(request: Request) -> str:
    # Behind an ingress/proxy — trust X-Forwarded-For if present, else the peer.
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─────────────────────── payload models ────────────────────────
class ContactSubmitPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    institution: Optional[str] = Field(None, max_length=200)
    subject: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=5, max_length=5000)
    # Anti-spam fields
    challenge_id: str = Field(..., min_length=8, max_length=64)
    challenge_answer: int
    website: Optional[str] = Field(None, max_length=200)   # honeypot

    @field_validator("email")
    @classmethod
    def _lc(cls, v: str) -> str:
        return v.strip().lower()


class ContactUpdatePayload(BaseModel):
    status: Optional[Literal["new", "read", "replied"]] = None
    admin_notes: Optional[str] = Field(None, max_length=2000)


# ─────────────────────── serializer ───────────────────────────
def _serialize(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "name": d.get("name"),
        "email": d.get("email"),
        "institution": d.get("institution"),
        "subject": d.get("subject"),
        "message": d.get("message"),
        "status": d.get("status", "new"),
        "admin_notes": d.get("admin_notes"),
        "created_at": (d.get("created_at") or datetime.now(timezone.utc)).isoformat(),
        "updated_at": (d.get("updated_at").isoformat() if d.get("updated_at") else None),
    }


# ═══════════════════════════════════════════════════════════════
# Public router — POST /api/contact + GET /api/contact/challenge
# ═══════════════════════════════════════════════════════════════
def build_public_router(db) -> APIRouter:
    router = APIRouter(prefix="/contact", tags=["contact"])
    col = db["contact_messages"]
    chal_col = db["contact_challenges"]

    @router.get("/challenge")
    async def issue_challenge():
        """Issue a friendly math captcha. Returns id + human-readable question.
        The correct answer is stored server-side and never sent to the client.
        Challenges expire in 10 min and are single-use."""
        a = random.randint(1, 9)
        b = random.randint(1, 9)
        op = random.choice(["+", "-"])
        if op == "+":
            answer = a + b
            question = f"What is {a} + {b}?"
        else:
            # Keep the answer positive so the UI never has to render '-'
            if b > a:
                a, b = b, a
            answer = a - b
            question = f"What is {a} − {b}?"
        challenge_id = secrets.token_urlsafe(18)
        await chal_col.insert_one({
            "_id": challenge_id,
            "answer": answer,
            "created_at": datetime.now(timezone.utc),
            "used": False,
        })
        return {"challenge_id": challenge_id, "question": question,
                "expires_in": CHALLENGE_TTL_SEC}

    async def _rate_limit_or_reject(ip: str):
        """Reject with 429 if the IP has exceeded hourly / daily limits."""
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)
        day_ago  = now - timedelta(days=1)
        hour_hits = await col.count_documents({"ip": ip, "created_at": {"$gte": hour_ago}})
        if hour_hits >= RATE_LIMIT_HOUR:
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Please try again in an hour "
                       f"(limit: {RATE_LIMIT_HOUR} messages per hour).",
            )
        day_hits = await col.count_documents({"ip": ip, "created_at": {"$gte": day_ago}})
        if day_hits >= RATE_LIMIT_DAY:
            raise HTTPException(
                status_code=429,
                detail=f"Daily limit reached. Please try again tomorrow "
                       f"(limit: {RATE_LIMIT_DAY} messages per day).",
            )

    async def _consume_challenge_or_reject(challenge_id: str, given_answer: int):
        rec = await chal_col.find_one({"_id": challenge_id})
        if not rec:
            raise HTTPException(status_code=400,
                                detail="Captcha expired or invalid. Please refresh and try again.")
        if rec.get("used"):
            raise HTTPException(status_code=400,
                                detail="This captcha was already used. Please refresh and try again.")
        created = rec.get("created_at") or datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() > CHALLENGE_TTL_SEC:
            await chal_col.delete_one({"_id": challenge_id})
            raise HTTPException(status_code=400,
                                detail="Captcha expired. Please refresh and try again.")
        if int(rec.get("answer", -1)) != int(given_answer):
            raise HTTPException(status_code=400,
                                detail="Incorrect captcha answer. Please try again.")
        # Single-use — mark and delete
        await chal_col.delete_one({"_id": challenge_id})

    @router.post("")
    async def submit(payload: ContactSubmitPayload, request: Request):
        ip = _client_ip(request)

        # 1) Honeypot — bots typically auto-fill every visible field. If the
        #    hidden `website` field is populated we pretend success but never
        #    persist the message.
        if (payload.website or "").strip():
            logger.info(f"[contact] honeypot triggered from ip={ip}")
            return {"ok": True, "id": "honeypot"}

        # 2) Rate limit
        await _rate_limit_or_reject(ip)

        # 3) Captcha (single-use)
        await _consume_challenge_or_reject(payload.challenge_id, payload.challenge_answer)

        now = datetime.now(timezone.utc)
        doc = {
            "name": payload.name.strip(),
            "email": payload.email,
            "institution": (payload.institution or "").strip() or None,
            "subject": payload.subject.strip(),
            "message": payload.message.strip(),
            "status": "new",
            "admin_notes": None,
            "created_at": now,
            "updated_at": None,
            "ip": ip,
            "user_agent": request.headers.get("user-agent", "")[:400],
        }
        res = await col.insert_one(doc)
        logger.info(f"[contact] new message from {payload.email} ({payload.subject!r}) ip={ip}")
        return {"ok": True, "id": str(res.inserted_id)}

    return router


async def initialize(db):
    """Create the TTL index on contact_challenges + IP index on messages."""
    try:
        await db["contact_challenges"].create_index(
            "created_at", expireAfterSeconds=CHALLENGE_TTL_SEC,
        )
        await db["contact_messages"].create_index([("ip", 1), ("created_at", -1)])
    except Exception as e:
        logger.warning(f"contact index init failed (non-fatal): {e}")


# ═══════════════════════════════════════════════════════════════
# Admin router — /api/admin/contact/*
# ═══════════════════════════════════════════════════════════════
def build_admin_router(db) -> APIRouter:
    router = APIRouter(prefix="/admin/contact", tags=["admin-contact"])
    require_admin = adm.make_get_current_admin(db)
    col = db["contact_messages"]

    @router.get("/summary")
    async def summary(admin=Depends(require_admin)):
        total = await col.count_documents({})
        buckets = {s: await col.count_documents({"status": s}) for s in STATUS_VALUES}
        # Coerce legacy/unknown status -> new
        known = sum(buckets.values())
        buckets["new"] += max(0, total - known)
        return {"total": total, **buckets}

    @router.get("/messages")
    async def list_messages(
        admin=Depends(require_admin),
        q: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 25,
    ):
        query: dict = {}
        if status and status in STATUS_VALUES:
            query["status"] = status
        if q:
            query["$or"] = [
                {"email":       {"$regex": q, "$options": "i"}},
                {"name":        {"$regex": q, "$options": "i"}},
                {"subject":     {"$regex": q, "$options": "i"}},
                {"message":     {"$regex": q, "$options": "i"}},
                {"institution": {"$regex": q, "$options": "i"}},
            ]
        page = max(1, int(page)); page_size = min(100, max(1, int(page_size)))
        total = await col.count_documents(query)
        rows = []
        cur = col.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
        async for d in cur:
            rows.append(_serialize(d))
        return {"total": total, "page": page, "page_size": page_size, "rows": rows}

    @router.get("/messages/{mid}")
    async def get_message(mid: str, admin=Depends(require_admin)):
        try:
            oid = ObjectId(mid)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid message id")
        d = await col.find_one({"_id": oid})
        if not d:
            raise HTTPException(status_code=404, detail="Message not found")
        # Auto-flip 'new' → 'read' on first open
        if d.get("status", "new") == "new":
            await col.update_one(
                {"_id": oid},
                {"$set": {"status": "read", "updated_at": datetime.now(timezone.utc)}},
            )
            d["status"] = "read"
        return _serialize(d)

    @router.patch("/messages/{mid}")
    async def update_message(mid: str, payload: ContactUpdatePayload,
                             request: Request, admin=Depends(require_admin)):
        try:
            oid = ObjectId(mid)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid message id")
        d = await col.find_one({"_id": oid})
        if not d:
            raise HTTPException(status_code=404, detail="Message not found")

        update = {}
        if payload.status is not None:
            update["status"] = payload.status
        if payload.admin_notes is not None:
            update["admin_notes"] = payload.admin_notes.strip() or None
        if not update:
            raise HTTPException(status_code=400, detail="No fields provided")
        update["updated_at"] = datetime.now(timezone.utc)
        await col.update_one({"_id": oid}, {"$set": update})
        fresh = await col.find_one({"_id": oid})
        await adm.record_audit(
            db, actor_email=admin["email"],
            action="admin.contact_message_updated",
            target=d.get("email"),
            details={"message_id": mid, "changed": sorted(update.keys())},
            request=request,
        )
        return _serialize(fresh)

    @router.delete("/messages/{mid}")
    async def delete_message(mid: str, request: Request,
                             admin=Depends(require_admin)):
        try:
            oid = ObjectId(mid)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid message id")
        d = await col.find_one({"_id": oid})
        if not d:
            raise HTTPException(status_code=404, detail="Message not found")
        await col.delete_one({"_id": oid})
        await adm.record_audit(
            db, actor_email=admin["email"],
            action="admin.contact_message_deleted",
            target=d.get("email"),
            details={"message_id": mid, "subject": d.get("subject")},
            request=request,
        )
        return {"ok": True}

    return router
