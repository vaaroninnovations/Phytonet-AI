"""Node credit system — PhytoNet AI monetisation service.

Central FastAPI router that owns *all* node-credit state so future premium
modules (Molecular Dynamics, Pathway Analysis, etc.) can charge nodes by
POSTing here — no billing logic is duplicated anywhere else.

Endpoints
─────────
  GET  /api/nodes/balance            → current user's balance + lifetime stats
  POST /api/nodes/charge             → atomic deduction; idempotent by job_id
  GET  /api/nodes/history            → paginated ledger (newest first)
  GET  /api/nodes/pricing            → static pricing plans
  POST /api/nodes/purchase-intent    → Razorpay Standard Checkout — creates an
                                       order and returns { order_id, amount,
                                       currency, razorpay_key_id } so the
                                       browser can open the checkout modal.
  POST /api/nodes/verify-payment     → verifies the Razorpay HMAC signature,
                                       credits nodes on success and appends a
                                       ledger entry. Idempotent by order_id.

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

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from bson import ObjectId

logger = logging.getLogger(__name__)


# ── Razorpay client — lazily instantiated so the module still imports when
#    keys are unset (e.g. local dev without a payment gateway).
def _razorpay_client() -> Optional[razorpay.Client]:
    key_id = os.environ.get("RAZORPAY_KEY_ID")
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
    if not (key_id and key_secret):
        return None
    return razorpay.Client(auth=(key_id, key_secret))


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


class VerifyPaymentPayload(BaseModel):
    razorpay_order_id: str = Field(..., min_length=6, max_length=64)
    razorpay_payment_id: str = Field(..., min_length=6, max_length=64)
    razorpay_signature: str = Field(..., min_length=6, max_length=256)


def build_router(db, get_current_user):
    """Factory: constructs the router bound to the passed Mongo db + auth dep."""
    router = APIRouter(prefix="/nodes", tags=["nodes"])

    users = db["users"]
    ledger = db["node_transactions"]

    async def _ensure_node_fields(user_doc: dict) -> dict:
        """Backfill node fields for existing users who registered before this
        service went live. Grants the 10-node welcome bonus one time, then
        writes back so future requests are O(1).
        """
        if user_doc.get("welcome_bonus_granted") is True:
            return user_doc
        now = datetime.now(timezone.utc)
        await users.update_one(
            {"_id": user_doc["_id"]},
            {"$set": {
                "nodes_balance": 10,
                "nodes_lifetime_used": user_doc.get("nodes_lifetime_used", 0),
                "nodes_lifetime_purchased": user_doc.get("nodes_lifetime_purchased", 0),
                "welcome_bonus_granted": True,
                "welcome_bonus_granted_at": now,
            }},
        )
        await ledger.insert_one({
            "user_id": str(user_doc["_id"]),
            "direction": "credit",
            "amount": 10,
            "balance_after": 10,
            "module": "system",
            "workflow": "welcome_bonus",
            "reason": "One-time welcome bonus",
            "job_id": None,
            "meta": {},
            "at": now,
        })
        user_doc["nodes_balance"] = 10
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
        """Create a Razorpay order for the requested plan.

        The browser passes the returned `order_id` + `razorpay_key_id` straight
        into the Razorpay Standard Checkout widget. Amount is denominated in
        paise (Razorpay's smallest unit — 100 paise = 1 INR).
        """
        plan = next((p for p in PRICING_PLANS if p["id"] == payload.plan_id), None)
        if not plan:
            raise HTTPException(status_code=404, detail=f"Unknown plan '{payload.plan_id}'")

        client = _razorpay_client()
        if client is None:
            raise HTTPException(
                status_code=503,
                detail="Payment gateway not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
            )

        amount_paise = int(plan["price_inr"]) * 100
        if amount_paise < 100:  # Razorpay minimum
            raise HTTPException(status_code=400, detail="Plan amount below Razorpay minimum (100 paise).")

        now = datetime.now(timezone.utc)
        # Local intent doc — created first so we always have a reference even if
        # the Razorpay order call ends up erroring below.
        intent = await db["purchase_intents"].insert_one({
            "user_id": str(user["_id"]),
            "plan_id": plan["id"],
            "nodes": plan["nodes"],
            "amount_inr": plan["price_inr"],
            "amount_paise": amount_paise,
            "status": "created",
            "created_at": now,
        })

        try:
            # Receipt is capped at 40 chars by Razorpay; the intent id is 24.
            order = client.order.create({
                "amount": amount_paise,
                "currency": "INR",
                "receipt": f"phy-{intent.inserted_id}",
                "notes": {
                    "user_id": str(user["_id"]),
                    "plan_id": plan["id"],
                    "nodes": str(plan["nodes"]),
                },
            })
        except razorpay.errors.BadRequestError as e:
            logger.exception("razorpay order.create BadRequest")
            await db["purchase_intents"].update_one(
                {"_id": intent.inserted_id},
                {"$set": {"status": "failed", "error": str(e)}},
            )
            raise HTTPException(status_code=400, detail=f"Razorpay rejected the order: {e}")
        except Exception as e:
            logger.exception("razorpay order.create failed")
            await db["purchase_intents"].update_one(
                {"_id": intent.inserted_id},
                {"$set": {"status": "failed", "error": str(e)}},
            )
            raise HTTPException(status_code=500, detail="Could not create Razorpay order.")

        await db["purchase_intents"].update_one(
            {"_id": intent.inserted_id},
            {"$set": {
                "razorpay_order_id": order["id"],
                "razorpay_order_status": order.get("status"),
            }},
        )

        return {
            "id": str(intent.inserted_id),
            "plan": plan,
            "order_id": order["id"],
            "amount": amount_paise,
            "currency": "INR",
            "razorpay_key_id": os.environ["RAZORPAY_KEY_ID"],
            "prefill": {
                "name": " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x) or user.get("email", ""),
                "email": user.get("email", ""),
            },
        }

    @router.post("/verify-payment")
    async def verify_payment(payload: VerifyPaymentPayload,
                             user=Depends(get_current_user)):
        """Verify Razorpay HMAC signature and credit nodes atomically.

        Razorpay signs `order_id + "|" + payment_id` with HMAC-SHA256 keyed by
        the KEY_SECRET. If the signatures match we credit the plan's nodes and
        record a ledger entry. Idempotent — verifying the same order twice
        never credits twice.
        """
        key_secret = os.environ.get("RAZORPAY_KEY_SECRET")
        if not key_secret:
            raise HTTPException(status_code=503, detail="Payment gateway not configured.")

        # 1. HMAC verification (do NOT trust anything on the wire before this).
        expected = hmac.new(
            key_secret.encode("utf-8"),
            f"{payload.razorpay_order_id}|{payload.razorpay_payment_id}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, payload.razorpay_signature):
            raise HTTPException(status_code=400, detail="Invalid payment signature.")

        # 2. Match the order to a local intent that belongs to this user.
        intent = await db["purchase_intents"].find_one({
            "razorpay_order_id": payload.razorpay_order_id,
            "user_id": str(user["_id"]),
        })
        if not intent:
            raise HTTPException(status_code=404, detail="Unknown Razorpay order for this user.")

        # 3. Idempotency — if we've already credited this order, return the
        #    existing balance instead of double-crediting.
        if intent.get("status") == "paid":
            fresh = await users.find_one({"_id": user["_id"]})
            return {
                "ok": True,
                "already_verified": True,
                "credited": intent.get("nodes", 0),
                "balance_after": fresh.get("nodes_balance", 0),
            }

        # 4. Atomic credit + ledger entry (same pipeline used by welcome bonus).
        credited = int(intent.get("nodes", 0))
        amount_inr = int(intent.get("amount_inr", 0))
        if credited <= 0:
            raise HTTPException(status_code=500, detail="Purchase intent has no node quantity.")

        now = datetime.now(timezone.utc)
        upd = await users.find_one_and_update(
            {"_id": user["_id"]},
            {"$inc": {
                "nodes_balance": credited,
                "nodes_lifetime_purchased": credited,
            }},
            return_document=True,
        )
        balance_after = upd.get("nodes_balance", credited) if upd else credited

        await ledger.insert_one({
            "user_id": str(user["_id"]),
            "direction": "credit",
            "amount": credited,
            "balance_after": balance_after,
            "module": "system",
            "workflow": "razorpay_purchase",
            "reason": f"Purchased plan {intent.get('plan_id')} (₹{amount_inr})",
            "job_id": None,
            "meta": {
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "plan_id": intent.get("plan_id"),
                "amount_inr": amount_inr,
            },
            "at": now,
        })

        await db["purchase_intents"].update_one(
            {"_id": intent["_id"]},
            {"$set": {
                "status": "paid",
                "razorpay_payment_id": payload.razorpay_payment_id,
                "paid_at": now,
            }},
        )

        return {
            "ok": True,
            "already_verified": False,
            "credited": credited,
            "balance_after": balance_after,
        }

    return router
