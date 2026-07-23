"""Node credit system — PhytoNet AI monetisation service.

Central FastAPI router that owns *all* node-credit state so future premium
modules (Molecular Dynamics, Pathway Analysis, etc.) can charge nodes by
POSTing here — no billing logic is duplicated anywhere else.

Endpoints
─────────
  GET  /api/nodes/balance            → current user's balance + lifetime stats
  POST /api/nodes/charge             → atomic deduction; idempotent by job_id
  GET  /api/nodes/history            → paginated ledger (newest first)
  GET  /api/nodes/pricing            → static pricing plans (shell — no live
                                       payment provider yet; see PRD)
  POST /api/nodes/purchase-intent    → placeholder "coming soon" purchase
                                       intent that pretends to queue the
                                       transaction and returns a client-visible
                                       tracking id (real Razorpay/Stripe will
                                       replace this in a follow-up).

Node ledger — MongoDB collection `node_transactions`
────────────────────────────────────────────────────
Each document represents an immutable ledger entry:
  {
    _id, user_id, direction: "debit"|"credit", amount, balance_after,
    module, workflow, job_id, reason, meta, at
  }

Direction key
  debit  — nodes spent on a run.
  credit — welcome bonus, purchases, refunds.

Balance is stored denormalised on the `users` doc (`nodes_balance`,
`nodes_lifetime_used`, `nodes_lifetime_purchased`) so a read is O(1). Every
mutation goes through the same atomic pipeline (see `_apply_transaction`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from bson import ObjectId


# ── Static pricing plans (INR) — kept here so the frontend can pull from
#    /api/nodes/pricing and the checkout server can consume the same list.
PRICING_PLANS = [
    {
        "id": "starter",
        "label": "Starter",
        "nodes": 10,
        "price_inr": 250,
        "highlight": False,
        "description": "Enough for two full docking runs.",
    },
    {
        "id": "research",
        "label": "Research",
        "nodes": 25,
        "price_inr": 500,
        "highlight": True,
        "badge": "Most Popular",
        "description": "Best value for regular users — 5 docking runs or 2 full AI workflows.",
    },
    {
        "id": "professional",
        "label": "Professional",
        "nodes": 60,
        "price_inr": 1000,
        "highlight": False,
        "description": "For labs running the AI Agent daily — 12 docking runs or 6 workflows.",
    },
]

# ── Node costs for premium modules — the frontend reads this map so both
#    sides agree on prices and the UI can preflight without a round-trip.
MODULE_COSTS = {
    "phytonet-ai-agent": 10,
    "molecular-docking": 5,
    # Free modules are absent from this map by design (implicit cost = 0).
}


class ChargePayload(BaseModel):
    module: str = Field(..., min_length=2, max_length=64)
    amount: int = Field(..., ge=1, le=10_000)
    job_id: Optional[str] = Field(None, max_length=128)
    workflow: Optional[str] = Field(None, max_length=128)
    reason: Optional[str] = Field(None, max_length=256)


class PurchaseIntentPayload(BaseModel):
    plan_id: str = Field(..., min_length=2, max_length=32)


def build_router(db, get_current_user):
    """Factory: constructs the router bound to the passed Mongo db + auth dep."""
    router = APIRouter(prefix="/nodes", tags=["nodes"])

    users = db["users"]
    ledger = db["node_transactions"]

    async def _ensure_node_fields(user_doc: dict) -> dict:
        """Backfill node fields for existing users who registered before this
        service went live. Grants the 100-node welcome bonus one time, then
        writes back so future requests are O(1).
        """
        if user_doc.get("welcome_bonus_granted") is True:
            return user_doc
        now = datetime.now(timezone.utc)
        await users.update_one(
            {"_id": user_doc["_id"]},
            {"$set": {
                "nodes_balance": 100,
                "nodes_lifetime_used": user_doc.get("nodes_lifetime_used", 0),
                "nodes_lifetime_purchased": user_doc.get("nodes_lifetime_purchased", 0),
                "welcome_bonus_granted": True,
                "welcome_bonus_granted_at": now,
            }},
        )
        await ledger.insert_one({
            "user_id": str(user_doc["_id"]),
            "direction": "credit",
            "amount": 100,
            "balance_after": 100,
            "module": "system",
            "workflow": "welcome_bonus",
            "reason": "One-time welcome bonus",
            "job_id": None,
            "meta": {},
            "at": now,
        })
        user_doc["nodes_balance"] = 100
        user_doc["welcome_bonus_granted"] = True
        return user_doc

    async def _apply_transaction(user_doc: dict, direction: str, amount: int,
                                 module: str, workflow: Optional[str],
                                 job_id: Optional[str], reason: Optional[str],
                                 meta: Optional[dict] = None) -> dict:
        """Atomically mutate balance + append ledger row. Uses a conditional
        update to prevent going negative on debit under concurrency.
        """
        user_doc = await _ensure_node_fields(user_doc)
        # Idempotency: if job_id was already charged, return current state.
        if direction == "debit" and job_id:
            prior = await ledger.find_one({
                "user_id": str(user_doc["_id"]),
                "direction": "debit",
                "job_id": job_id,
            })
            if prior:
                return {
                    "ok": True,
                    "idempotent": True,
                    "balance": user_doc.get("nodes_balance", 0),
                }

        if direction == "debit":
            # Optimistic conditional decrement to keep balance >= 0.
            res = await users.update_one(
                {"_id": user_doc["_id"], "nodes_balance": {"$gte": amount}},
                {"$inc": {
                    "nodes_balance": -amount,
                    "nodes_lifetime_used": amount,
                }},
            )
            if res.modified_count == 0:
                raise HTTPException(status_code=402, detail={
                    "error": "insufficient_nodes",
                    "balance": user_doc.get("nodes_balance", 0),
                    "required": amount,
                })
        else:  # credit
            await users.update_one(
                {"_id": user_doc["_id"]},
                {"$inc": {
                    "nodes_balance": amount,
                    "nodes_lifetime_purchased": amount if module != "system" else 0,
                }},
            )

        fresh = await users.find_one({"_id": user_doc["_id"]})
        entry = {
            "user_id": str(user_doc["_id"]),
            "direction": direction,
            "amount": amount,
            "balance_after": fresh.get("nodes_balance", 0),
            "module": module,
            "workflow": workflow,
            "job_id": job_id,
            "reason": reason,
            "meta": meta or {},
            "at": datetime.now(timezone.utc),
        }
        await ledger.insert_one(entry)
        return {
            "ok": True,
            "idempotent": False,
            "balance": fresh.get("nodes_balance", 0),
            "lifetime_used": fresh.get("nodes_lifetime_used", 0),
            "lifetime_purchased": fresh.get("nodes_lifetime_purchased", 0),
        }

    # ─────────────────────────── endpoints ───────────────────────────

    @router.get("/balance")
    async def balance(user=Depends(get_current_user)):
        user = await _ensure_node_fields(user)
        return {
            "balance": user.get("nodes_balance", 0),
            "lifetime_used": user.get("nodes_lifetime_used", 0),
            "lifetime_purchased": user.get("nodes_lifetime_purchased", 0),
            "welcome_bonus_granted": bool(user.get("welcome_bonus_granted", False)),
            "module_costs": MODULE_COSTS,
        }

    @router.post("/charge")
    async def charge(payload: ChargePayload, user=Depends(get_current_user)):
        return await _apply_transaction(
            user_doc=user,
            direction="debit",
            amount=payload.amount,
            module=payload.module,
            workflow=payload.workflow,
            job_id=payload.job_id,
            reason=payload.reason,
        )

    @router.get("/history")
    async def history(
        user=Depends(get_current_user),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        direction: Optional[str] = Query(None, pattern="^(debit|credit)$"),
    ):
        q: dict = {"user_id": str(user["_id"])}
        if direction:
            q["direction"] = direction
        cursor = ledger.find(q).sort("at", -1).skip(offset).limit(limit)
        rows = []
        async for r in cursor:
            rows.append({
                "id": str(r.get("_id")),
                "direction": r.get("direction"),
                "amount": r.get("amount", 0),
                "balance_after": r.get("balance_after", 0),
                "module": r.get("module"),
                "workflow": r.get("workflow"),
                "job_id": r.get("job_id"),
                "reason": r.get("reason"),
                "at": (r.get("at") or datetime.now(timezone.utc)).isoformat(),
            })
        total = await ledger.count_documents(q)
        return {"rows": rows, "total": total, "limit": limit, "offset": offset}

    @router.get("/pricing")
    async def pricing():
        return {"plans": PRICING_PLANS, "currency": "INR"}

    @router.post("/purchase-intent")
    async def purchase_intent(payload: PurchaseIntentPayload,
                              user=Depends(get_current_user)):
        # SHELL — no live payment provider is wired yet. When the user
        # configures Razorpay we'll expand this to create an order + secret.
        plan = next((p for p in PRICING_PLANS if p["id"] == payload.plan_id), None)
        if not plan:
            raise HTTPException(status_code=404, detail=f"Unknown plan '{payload.plan_id}'")
        now = datetime.now(timezone.utc)
        # Persist the intent so the follow-up payment integration can look it up.
        res = await db["purchase_intents"].insert_one({
            "user_id": str(user["_id"]),
            "plan_id": plan["id"],
            "nodes": plan["nodes"],
            "amount_inr": plan["price_inr"],
            "status": "coming_soon",  # will become "created"/"paid"/"failed" once live
            "created_at": now,
        })
        return {
            "id": str(res.inserted_id),
            "plan": plan,
            "status": "coming_soon",
            "message": (
                "Payment gateway is being configured. Your intent has been "
                "recorded — we'll notify you once purchases go live."
            ),
        }

    return router
