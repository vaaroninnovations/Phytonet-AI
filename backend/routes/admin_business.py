"""Admin business dashboards — Sales Inquiries + Usage Metrics.

Both are read-mostly views on top of collections already being written by
other services (`sales_inquiries` written by `POST /api/nodes/contact-sales`,
`usage_events` written by the research + docking + module orchestrators).

Endpoints (all mounted under /api/admin)
────────────────────────────────────────
  GET   /api/admin/sales/inquiries          → paginated list with filters
  GET   /api/admin/sales/summary            → counts by status
  PATCH /api/admin/sales/inquiries/{id}     → update status/notes/assignee
  GET   /api/admin/metrics/overview         → high-level KPIs (24h/7d/30d)
  GET   /api/admin/metrics/timeseries       → daily buckets for charts
  GET   /api/admin/metrics/top-modules      → most-used tools last 30 days
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from bson import ObjectId

import admin_service as adm

logger = logging.getLogger(__name__)

SALES_STATUS_VALUES = ("new", "in_progress", "won", "lost", "closed")
VALID_PROMO_KINDS = ("first_bundle", "general")
VALID_PLAN_KINDS = ("bundle", "student", "subscription", "enterprise")


class UpdateInquiryPayload(BaseModel):
    status: Optional[str] = Field(default=None, pattern="^(new|in_progress|won|lost|closed)$")
    notes:  Optional[str] = Field(default=None, max_length=4000)
    assignee: Optional[str] = Field(default=None, max_length=100)


class PromoPayload(BaseModel):
    """Create/update payload for /admin/promos.
    Any field left as None on PATCH is left untouched. On create the code +
    at least one of (percent_off, flat_off_inr) is required."""
    code:         Optional[str]  = Field(default=None, min_length=3, max_length=32,
                                          pattern=r"^[A-Z0-9_]+$")
    kind:         Optional[str]  = Field(default=None, pattern="^(first_bundle|general)$")
    percent_off:  Optional[int]  = Field(default=None, ge=1, le=90)
    flat_off_inr: Optional[int]  = Field(default=None, ge=1, le=100000)
    applies_to_kinds: Optional[list[str]] = Field(default=None)
    description:  Optional[str]  = Field(default=None, max_length=280)
    active:       Optional[bool] = None
    max_redemptions: Optional[int] = Field(default=None, ge=1, le=1000000)


def build_router(db):
    router = APIRouter(prefix="/admin", tags=["admin-business"])
    require_admin = adm.make_get_current_admin(db)
    sales = db["sales_inquiries"]
    events = db["usage_events"]

    # ─────────────────── Sales Inquiries ────────────────────────
    @router.get("/sales/summary")
    async def sales_summary(admin=Depends(require_admin)):
        """Return counts per status + last-24h intake for the dashboard header."""
        agg = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
        counts = {}
        async for row in sales.aggregate(agg):
            counts[row["_id"] or "new"] = row["n"]
        yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
        last24h = await sales.count_documents({"at": {"$gte": yesterday}})
        total = await sales.count_documents({})
        return {
            "total":  total,
            "last_24h": last24h,
            "by_status": {s: counts.get(s, 0) for s in SALES_STATUS_VALUES},
        }

    @router.get("/sales/inquiries")
    async def list_inquiries(
        admin=Depends(require_admin),
        status: Optional[str] = Query(None),
        q: Optional[str] = Query(None, description="substring on org/email/message"),
        page: int = Query(1, ge=1),
        page_size: int = Query(25, ge=1, le=100),
    ):
        filt: dict = {}
        if status: filt["status"] = status
        if q:
            filt["$or"] = [
                {"organization": {"$regex": q, "$options": "i"}},
                {"email":        {"$regex": q, "$options": "i"}},
                {"message":      {"$regex": q, "$options": "i"}},
                {"user_name":    {"$regex": q, "$options": "i"}},
            ]
        total = await sales.count_documents(filt)
        cursor = sales.find(filt).sort("at", -1).skip((page - 1) * page_size).limit(page_size)
        rows = []
        async for r in cursor:
            rows.append({
                "id": str(r["_id"]),
                "user_id": r.get("user_id"),
                "email": r.get("email"),
                "user_name": r.get("user_name"),
                "plan_id": r.get("plan_id"),
                "organization": r.get("organization"),
                "role": r.get("role"),
                "team_size": r.get("team_size"),
                "message": r.get("message"),
                "status": r.get("status") or "new",
                "assignee": r.get("assignee"),
                "notes": r.get("notes"),
                "at": (r.get("at") or datetime.now(timezone.utc)).isoformat(),
            })
        return {"rows": rows, "total": total, "page": page, "page_size": page_size}

    @router.patch("/sales/inquiries/{inquiry_id}")
    async def update_inquiry(inquiry_id: str, payload: UpdateInquiryPayload,
                             admin=Depends(require_admin)):
        try:
            _id = ObjectId(inquiry_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid inquiry id")
        upd = {k: v for k, v in payload.model_dump().items() if v is not None}
        if not upd:
            raise HTTPException(status_code=400, detail="No fields to update")
        upd["updated_at"] = datetime.now(timezone.utc)
        upd["updated_by"] = admin.get("email") or str(admin.get("_id"))
        res = await sales.update_one({"_id": _id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Inquiry not found")
        return {"ok": True}

    # ─────────────────── Usage Metrics ────────────────────────
    @router.get("/metrics/overview")
    async def metrics_overview(admin=Depends(require_admin)):
        """High-level KPIs — total events, distinct users, node debit sum,
        broken down by 24 h / 7 d / 30 d buckets. Used by the admin
        dashboard to gauge growth."""
        now = datetime.now(timezone.utc)
        buckets = {
            "24h": now - timedelta(hours=24),
            "7d":  now - timedelta(days=7),
            "30d": now - timedelta(days=30),
        }
        out = {}
        for label, since in buckets.items():
            pipe = [
                {"$match": {"at": {"$gte": since}}},
                {"$group": {
                    "_id":  None,
                    "events": {"$sum": 1},
                    "users":  {"$addToSet": "$user_id"},
                    "nodes_charged": {"$sum": {"$ifNull": ["$nodes_charged", 0]}},
                }},
            ]
            row = None
            async for r in events.aggregate(pipe):
                row = r
                break
            out[label] = {
                "events": row["events"] if row else 0,
                "unique_users": len(row["users"]) if row else 0,
                "nodes_charged": row["nodes_charged"] if row else 0,
            }
        # Plan preflight → conversion funnel for the AI Research Assistant.
        preflight_30d = await events.count_documents({
            "kind": "research_preflight", "at": {"$gte": buckets["30d"]},
        })
        executed_30d  = await events.count_documents({
            "kind": "research_executed", "at": {"$gte": buckets["30d"]},
        })
        conversion = (executed_30d / preflight_30d * 100.0) if preflight_30d > 0 else 0.0
        out["research_funnel_30d"] = {
            "preflight": preflight_30d,
            "executed":  executed_30d,
            "conversion_pct": round(conversion, 1),
        }
        return out

    @router.get("/metrics/timeseries")
    async def metrics_timeseries(
        admin=Depends(require_admin),
        days: int = Query(30, ge=1, le=180),
    ):
        """Daily buckets of events + nodes charged for a bar/line chart."""
        since = datetime.now(timezone.utc) - timedelta(days=days)
        pipe = [
            {"$match": {"at": {"$gte": since}}},
            {"$group": {
                "_id": {
                    "y": {"$year":  "$at"},
                    "m": {"$month": "$at"},
                    "d": {"$dayOfMonth": "$at"},
                },
                "events": {"$sum": 1},
                "nodes":  {"$sum": {"$ifNull": ["$nodes_charged", 0]}},
                "users":  {"$addToSet": "$user_id"},
            }},
            {"$sort": {"_id.y": 1, "_id.m": 1, "_id.d": 1}},
        ]
        rows = []
        async for r in events.aggregate(pipe):
            k = r["_id"]
            rows.append({
                "date": f"{k['y']:04d}-{k['m']:02d}-{k['d']:02d}",
                "events": r["events"],
                "nodes":  r["nodes"],
                "unique_users": len(r["users"]),
            })
        return {"rows": rows, "days": days}

    @router.get("/metrics/top-modules")
    async def top_modules(
        admin=Depends(require_admin),
        days: int = Query(30, ge=1, le=180),
        limit: int = Query(15, ge=1, le=50),
    ):
        since = datetime.now(timezone.utc) - timedelta(days=days)
        pipe = [
            {"$match": {"at": {"$gte": since}}},
            {"$group": {
                "_id": "$module",
                "events": {"$sum": 1},
                "nodes":  {"$sum": {"$ifNull": ["$nodes_charged", 0]}},
            }},
            {"$sort": {"events": -1}},
            {"$limit": limit},
        ]
        rows = []
        async for r in events.aggregate(pipe):
            if not r["_id"]: continue
            rows.append({"module": r["_id"], "events": r["events"], "nodes": r["nodes"]})
        return {"rows": rows, "days": days}

    # ─────────────────── Promo Codes CRUD ────────────────────────
    promos = db["promo_codes"]

    @router.get("/promos")
    async def list_promos(admin=Depends(require_admin)):
        rows = []
        async for r in promos.find({}).sort("created_at", -1):
            rows.append({
                "code": r.get("code"),
                "kind": r.get("kind"),
                "percent_off": r.get("percent_off"),
                "flat_off_inr": r.get("flat_off_inr"),
                "applies_to_kinds": r.get("applies_to_kinds", []),
                "description": r.get("description"),
                "active": bool(r.get("active", True)),
                "max_redemptions": r.get("max_redemptions"),
                "redemptions": int(r.get("redemptions") or 0),
                "created_at": (r.get("created_at") or datetime.now(timezone.utc)).isoformat(),
                "updated_at": r["updated_at"].isoformat() if r.get("updated_at") else None,
            })
        return {"rows": rows, "total": len(rows)}

    @router.post("/promos")
    async def create_promo(payload: PromoPayload, admin=Depends(require_admin)):
        if not payload.code:
            raise HTTPException(status_code=400, detail="`code` is required")
        if not (payload.percent_off or payload.flat_off_inr):
            raise HTTPException(status_code=400,
                detail="Provide either `percent_off` or `flat_off_inr`")
        code = payload.code.strip().upper()
        if await promos.find_one({"code": code}):
            raise HTTPException(status_code=409, detail=f"Code '{code}' already exists")
        applies_to = payload.applies_to_kinds or ["bundle"]
        for k in applies_to:
            if k not in VALID_PLAN_KINDS:
                raise HTTPException(status_code=400,
                    detail=f"Invalid plan kind '{k}' in applies_to_kinds")
        now = datetime.now(timezone.utc)
        doc = {
            "code": code,
            "kind": payload.kind or "general",
            "percent_off":  payload.percent_off,
            "flat_off_inr": payload.flat_off_inr,
            "applies_to_kinds": applies_to,
            "description": payload.description or f"{payload.percent_off or 0}% off",
            "active": payload.active if payload.active is not None else True,
            "max_redemptions": payload.max_redemptions,
            "redemptions": 0,
            "created_at": now,
            "created_by": admin.get("email") or str(admin.get("_id")),
        }
        await promos.insert_one(doc)
        return {"ok": True, "code": code}

    @router.patch("/promos/{code}")
    async def update_promo(code: str, payload: PromoPayload,
                           admin=Depends(require_admin)):
        code = code.strip().upper()
        existing = await promos.find_one({"code": code})
        if not existing:
            raise HTTPException(status_code=404, detail=f"Promo '{code}' not found")
        upd = {}
        for f in ("kind", "percent_off", "flat_off_inr", "description",
                  "active", "max_redemptions"):
            v = getattr(payload, f, None)
            if v is not None:
                upd[f] = v
        if payload.applies_to_kinds is not None:
            for k in payload.applies_to_kinds:
                if k not in VALID_PLAN_KINDS:
                    raise HTTPException(status_code=400,
                        detail=f"Invalid plan kind '{k}' in applies_to_kinds")
            upd["applies_to_kinds"] = payload.applies_to_kinds
        if not upd:
            raise HTTPException(status_code=400, detail="No fields to update")
        upd["updated_at"] = datetime.now(timezone.utc)
        upd["updated_by"] = admin.get("email") or str(admin.get("_id"))
        await promos.update_one({"code": code}, {"$set": upd})
        return {"ok": True, "code": code}

    @router.delete("/promos/{code}")
    async def delete_promo(code: str, admin=Depends(require_admin)):
        code = code.strip().upper()
        res = await promos.delete_one({"code": code})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Promo '{code}' not found")
        return {"ok": True}

    return router


# ─────────────────── Usage Event Logger ────────────────────────
# Called from any route/service that wants to log a business event. Fire-and-
# forget: swallow exceptions so a metrics failure never breaks a user flow.
async def log_event(db, kind: str, user_id: Optional[str], *,
                    module: Optional[str] = None,
                    tool: Optional[str] = None,
                    nodes_charged: int = 0,
                    plan_id: Optional[str] = None,
                    meta: Optional[dict] = None) -> None:
    """
    kind: "research_preflight" | "research_executed" | "research_step_charge"
        | "module_run" | "purchase" | "pro_activated" | ...
    """
    try:
        await db["usage_events"].insert_one({
            "kind": kind,
            "user_id": user_id,
            "module": module,
            "tool": tool,
            "nodes_charged": int(nodes_charged or 0),
            "plan_id": plan_id,
            "meta": meta or {},
            "at": datetime.now(timezone.utc),
        })
    except Exception as e:  # noqa: BLE001 — metrics must never fail user flows.
        logger.warning(f"[metrics] log_event({kind}) suppressed: {e}")
