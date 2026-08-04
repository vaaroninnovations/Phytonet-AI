"""Contact message system — capture inquiries from the public homepage and
expose an admin dashboard to triage them.

Collections
───────────
`contact_messages`
  {
    _id, name, email, institution, subject, message,
    status: "new" | "read" | "replied",
    admin_notes: str | None,
    created_at, updated_at
  }

Endpoints
─────────
  POST   /api/contact                      → public submit (no auth)
  GET    /api/admin/contact/messages       → admin list w/ filters
  GET    /api/admin/contact/summary        → admin stats (counts by status)
  PATCH  /api/admin/contact/messages/{id}  → update status/notes (admin)
  DELETE /api/admin/contact/messages/{id}  → hard delete (admin)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field, field_validator

import admin_service as adm

logger = logging.getLogger(__name__)

STATUS_VALUES = ("new", "read", "replied")


# ─────────────────────── payload models ────────────────────────
class ContactSubmitPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    institution: Optional[str] = Field(None, max_length=200)
    subject: str = Field(..., min_length=2, max_length=200)
    message: str = Field(..., min_length=5, max_length=5000)

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
# Public router — POST /api/contact
# ═══════════════════════════════════════════════════════════════
def build_public_router(db) -> APIRouter:
    router = APIRouter(prefix="/contact", tags=["contact"])
    col = db["contact_messages"]

    @router.post("")
    async def submit(payload: ContactSubmitPayload, request: Request):
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
            "ip": (request.client.host if request.client else None),
            "user_agent": request.headers.get("user-agent", "")[:400],
        }
        res = await col.insert_one(doc)
        logger.info(f"[contact] new message from {payload.email} ({payload.subject!r})")
        return {"ok": True, "id": str(res.inserted_id)}

    return router


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
