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
from datetime import datetime, timezone, timedelta
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
#
# `kind` distinguishes:
#   - "bundle":       one-time purchase, permanent nodes (default legacy behaviour).
#   - "student":      same as bundle but gated to .edu / .ac.* email domains.
#   - "subscription": monthly recurring — credits `nodes` on activation +
#                     unlocks Pro features (rollover cap, priority concurrency,
#                     Pro badge). Expires after 30 days unless renewed.
#   - "enterprise":   Team / Lab plan — routes to "Contact Sales" form
#                     instead of Razorpay checkout.
PRICING_PLANS = [
    {
        "id": "student",
        "label": "Student",
        "kind": "student",
        "nodes": 15,
        "price_inr": 99,
        "highlight": False,
        "badge": "Academic",
        "description": "Verified academic email required (.edu / .ac.in / .ac.uk). One-time purchase.",
        "requires_academic_email": True,
    },
    {
        "id": "starter",
        "label": "Starter",
        "kind": "bundle",
        "nodes": 10,
        "price_inr": 250,
        "highlight": False,
        "description": "Enough for two full docking runs.",
    },
    {
        "id": "research",
        "label": "Research",
        "kind": "bundle",
        "nodes": 25,
        "price_inr": 500,
        "highlight": True,
        "badge": "Most Popular",
        "description": "Best value for regular users — 5 docking runs or 2 full AI workflows.",
    },
    {
        "id": "professional",
        "label": "Professional",
        "kind": "bundle",
        "nodes": 60,
        "price_inr": 1000,
        "highlight": False,
        "description": "For labs running the AI Agent daily — 12 docking runs or 6 workflows.",
    },
    {
        "id": "pro_monthly",
        "label": "PhytoNet Pro",
        "kind": "subscription",
        "nodes": 100,
        "price_inr": 1499,
        "highlight": False,
        "badge": "Best for Recurring Use",
        "description": "100 nodes/month with rollover (cap 300), priority docking concurrency (8 parallel), Pro badge on shared reports.",
        "features": [
            "100 nodes credited every month",
            "Node rollover — up to 300 unused nodes carry forward",
            "Priority docking concurrency (8 parallel vs. 4)",
            "Unlimited plant & disease queries",
            "'Pro' badge on your shared reports",
        ],
        "billing_period_days": 30,
        "rollover_cap": 300,
    },
    {
        "id": "lab_team",
        "label": "Lab / Team",
        "kind": "enterprise",
        "nodes": 0,
        "price_inr": 9999,
        "highlight": False,
        "badge": "Enterprise",
        "description": "5 seats + shared node pool + collaboration workspaces. Ideal for universities and pharma labs.",
        "features": [
            "5 seats with a shared node pool (500 nodes/month)",
            "Collaboration workspaces — share projects across seats",
            "Priority support + onboarding call",
            "Invoiced billing available",
        ],
        "contact_sales": True,
        "billing_period_days": 30,
    },
]

# ── Academic email domain check for the Student plan ───────────────
ACADEMIC_EMAIL_SUFFIXES = (
    ".edu", ".edu.in", ".ac.in", ".ac.uk", ".ac.jp", ".ac.kr", ".ac.nz",
    ".edu.au", ".edu.sg", ".edu.pk", ".edu.my", ".edu.ph", ".edu.cn",
)

def _is_academic_email(email: Optional[str]) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1].lower().strip()
    return any(domain.endswith(sfx) for sfx in ACADEMIC_EMAIL_SUFFIXES)


def _pro_status_from_user(user_doc: dict) -> dict:
    """Return the user's Pro subscription state for the frontend badge / gating.

    Fields:
      - is_pro:  True if pro_expires_at is in the future.
      - plan_id: "pro_monthly" if active, else None.
      - expires_at: ISO date string or None.
      - rollover_cap: soft cap on how many nodes carry forward at renewal.
      - concurrency_max: docking concurrency ceiling (Pro → 8, free → 4).
    """
    expires_at = user_doc.get("pro_expires_at")
    now = datetime.now(timezone.utc)
    is_pro = False
    if isinstance(expires_at, datetime):
        # MongoDB may return naive datetimes — treat those as UTC.
        exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        is_pro = exp > now
    return {
        "is_pro": is_pro,
        "plan_id": "pro_monthly" if is_pro else None,
        "expires_at": expires_at.isoformat() if isinstance(expires_at, datetime) else None,
        "rollover_cap": 300 if is_pro else None,
        "concurrency_max": 8 if is_pro else 4,
    }

# ── Node costs for premium modules — the frontend reads this map so both
#    sides agree on prices and the UI can preflight without a round-trip.
MODULE_COSTS = {
    "phytonet-ai-agent": 10,
    "molecular-docking": 5,
    # Free modules are absent from this map by design (implicit cost = 0).
}

# ── Per-tool costs for the AI Research Assistant orchestrator. The chat
#    charges nodes per successful tool execution instead of a flat run
#    price, so cheap runs stay cheap and heavy multi-docking runs pay
#    proportionally. `docking` bills per-pair via a multiplier.
RESEARCH_TOOL_COSTS = {
    # Free discovery tools
    "compound_lookup": 0, "plant_search": 0, "lotus_search": 0,
    "disease_search":  0, "target_resolve": 0,
    # 1-node analytical tools
    "target_predict": 1, "admet_predict": 1, "disease_targets": 1,
    "pathway_enrichment": 1, "ctp_network": 1,
    # Interpretation is folded into the planner cost
    # "interpret": 0,
}
RESEARCH_DOCKING_COST_PER_PAIR = 3
RESEARCH_PLANNER_COST = 1
FREE_RESEARCH_RUNS = 3          # per-user grace runs — full plans, no charge


def compute_research_run_cost(plan: list) -> dict:
    """Compute the preflight cost of an entire research plan.

    Returns a breakdown so the frontend plan-card can show
    `~14 nodes (1 planner + 4 tools + 9 docking pairs)`.
    """
    per_tool = 0
    dock_pairs = 0
    dock_cost = 0
    breakdown = []
    for step in plan or []:
        tool = step.get("tool")
        if tool == "docking":
            args = step.get("args") or {}
            tc = int(args.get("top_compounds") or 5)
            tg = int(args.get("top_genes")     or 3)
            pairs = max(1, tc * tg)
            dock_pairs += pairs
            cost = pairs * RESEARCH_DOCKING_COST_PER_PAIR
            dock_cost += cost
            breakdown.append({"tool": tool, "step_id": step.get("id"),
                              "cost": cost, "pairs": pairs})
        else:
            c = RESEARCH_TOOL_COSTS.get(tool, 0)
            per_tool += c
            breakdown.append({"tool": tool, "step_id": step.get("id"), "cost": c})
    planner = RESEARCH_PLANNER_COST
    total = planner + per_tool + dock_cost
    return {"total": total, "planner": planner, "tools": per_tool,
            "docking": dock_cost, "docking_pairs": dock_pairs,
            "steps": breakdown}


# Module-level references filled in by attach_routes() below so the
# research orchestrator can charge nodes without an HTTP round-trip.
_users_col = None
_ledger_col = None
_apply_transaction_ref = None
_ensure_node_fields_ref = None


async def research_charge_step(user_id: str, run_id: str, step_id: str,
                                tool: str, amount: int) -> dict:
    """Called by the research orchestrator after each successful step.

    Idempotent per (run_id, step_id) — retrying the same step never
    double-charges. Returns {ok, balance, charged, free_run, insufficient?}.
    """
    if amount <= 0:
        return {"ok": True, "balance": None, "charged": 0, "free_run": False}
    if _users_col is None or _apply_transaction_ref is None:
        return {"ok": True, "balance": None, "charged": 0,
                "free_run": False, "note": "node-charge system not attached"}
    try:
        uid_obj = ObjectId(user_id)
    except Exception:
        return {"ok": False, "balance": None, "charged": 0,
                "free_run": False, "error": "invalid_user_id"}
    user = await _users_col.find_one({"_id": uid_obj})
    if not user:
        return {"ok": False, "error": "user_not_found"}
    user = await _ensure_node_fields_ref(user)
    # Free-run policy — first N runs of every account are free (planner
    # + tools + docking). Tracked by counting distinct run-ids seen in
    # the ledger's `meta.research_run_id` field.
    if (user.get("free_research_runs_used") or 0) < FREE_RESEARCH_RUNS:
        already = user.get("research_free_runs_seen") or []
        if run_id in already:
            return {"ok": True, "balance": user.get("nodes_balance", 0),
                    "charged": 0, "free_run": True}
        # First step of a new free run — bump the counter.
        await _users_col.update_one(
            {"_id": uid_obj},
            {"$addToSet": {"research_free_runs_seen": run_id},
             "$inc":      {"free_research_runs_used": 1}},
        )
        return {"ok": True, "balance": user.get("nodes_balance", 0),
                "charged": 0, "free_run": True}
    # Charge — idempotent per (run_id, step_id)
    job_id = f"research:{run_id}:{step_id}"
    try:
        res = await _apply_transaction_ref(
            user, "debit", int(amount),
            module="phytonet-ai-agent",
            workflow=run_id, job_id=job_id,
            reason=f"research tool: {tool}",
            meta={"research_run_id": run_id, "step_id": step_id, "tool": tool},
        )
        return {"ok": True, "balance": res.get("balance"),
                "charged": int(amount), "free_run": False,
                "idempotent": res.get("idempotent", False)}
    except HTTPException as e:
        det = e.detail if isinstance(e.detail, dict) else {"error": str(e.detail)}
        return {"ok": False, "insufficient_nodes": True,
                "balance": det.get("balance"), "required": det.get("required"),
                "charged": 0, "free_run": False}


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


class ContactSalesPayload(BaseModel):
    plan_id: str = Field(min_length=1, max_length=64)
    organization: str = Field(min_length=1, max_length=200)
    role: Optional[str] = Field(default=None, max_length=100)
    team_size: Optional[str] = Field(default=None, max_length=50)
    message: Optional[str] = Field(default=None, max_length=2000)


def build_router(db, get_current_user):
    """Factory: constructs the router bound to the passed Mongo db + auth dep."""
    router = APIRouter(prefix="/nodes", tags=["nodes"])

    users = db["users"]
    ledger = db["node_transactions"]
    # Expose collection + helpers at module scope so the research
    # orchestrator (research_service.py) can charge nodes per-tool
    # without an HTTP round-trip.
    global _users_col, _ledger_col, _apply_transaction_ref, _ensure_node_fields_ref
    _users_col   = users
    _ledger_col  = ledger

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

    # Wire the closure helpers into the module-scope refs so the research
    # orchestrator can call `research_charge_step()` without importing
    # closure locals.
    _apply_transaction_ref = _apply_transaction   # noqa: F841
    _ensure_node_fields_ref = _ensure_node_fields  # noqa: F841
    globals()["_apply_transaction_ref"]  = _apply_transaction
    globals()["_ensure_node_fields_ref"] = _ensure_node_fields

    # ─────────────────────────── endpoints ───────────────────────────

    @router.get("/balance")
    async def balance(user=Depends(get_current_user)):
        user = await _ensure_node_fields(user)
        pro = _pro_status_from_user(user)
        return {
            "balance": user.get("nodes_balance", 0),
            "lifetime_used": user.get("nodes_lifetime_used", 0),
            "lifetime_purchased": user.get("nodes_lifetime_purchased", 0),
            "welcome_bonus_granted": bool(user.get("welcome_bonus_granted", False)),
            "module_costs": MODULE_COSTS,
            "pro": pro,
            "academic_email_eligible": _is_academic_email(user.get("email")),
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

    @router.post("/contact-sales")
    async def contact_sales(payload: ContactSalesPayload,
                            user=Depends(get_current_user)):
        """Log a sales inquiry for Enterprise / Lab plans.

        Stores the inquiry in `sales_inquiries` — the admin dashboard can
        surface it later. No Razorpay flow — pricing is quoted manually.
        """
        plan = next((p for p in PRICING_PLANS if p["id"] == payload.plan_id), None)
        if not plan or not (plan.get("kind") == "enterprise" or plan.get("contact_sales")):
            raise HTTPException(status_code=400,
                                detail="Contact-sales is only available on enterprise plans.")
        now = datetime.now(timezone.utc)
        await db["sales_inquiries"].insert_one({
            "user_id": str(user["_id"]),
            "email": user.get("email"),
            "user_name": " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x) or None,
            "plan_id": payload.plan_id,
            "organization": payload.organization,
            "role": payload.role,
            "team_size": payload.team_size,
            "message": payload.message,
            "status": "new",
            "at": now,
        })
        return {"ok": True, "message": "Thanks — our team will reach out within 1 business day."}

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

        # Enterprise plans are contact-sales — reject checkout attempts.
        if plan.get("kind") == "enterprise" or plan.get("contact_sales"):
            raise HTTPException(
                status_code=400,
                detail="Enterprise plans require a sales consultation — use /api/nodes/contact-sales.",
            )

        # Student plan is gated to academic emails.
        if plan.get("requires_academic_email") and not _is_academic_email(user.get("email")):
            raise HTTPException(
                status_code=403,
                detail="Student plan requires a verified academic email address (.edu / .ac.in / .ac.uk).",
            )

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
            "plan_kind": plan.get("kind", "bundle"),
            "billing_period_days": plan.get("billing_period_days"),
            "rollover_cap": plan.get("rollover_cap"),
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
        # Extra fields set when this is a subscription (Pro) purchase.
        pro_update = {}
        if intent.get("plan_kind") == "subscription":
            days = int(intent.get("billing_period_days") or 30)
            pro_update["pro_expires_at"] = now + timedelta(days=days)
            pro_update["pro_plan_id"] = intent.get("plan_id")
            pro_update["pro_activated_at"] = now
        upd_op = {
            "$inc": {
                "nodes_balance": credited,
                "nodes_lifetime_purchased": credited,
            }
        }
        if pro_update:
            upd_op["$set"] = pro_update
        upd = await users.find_one_and_update(
            {"_id": user["_id"]},
            upd_op,
            return_document=True,
        )
        balance_after = upd.get("nodes_balance", credited) if upd else credited

        await ledger.insert_one({
            "user_id": str(user["_id"]),
            "direction": "credit",
            "amount": credited,
            "balance_after": balance_after,
            "module": "system",
            "workflow": ("pro_subscription" if intent.get("plan_kind") == "subscription"
                         else "razorpay_purchase"),
            "reason": (f"Activated {intent.get('plan_id')} subscription (₹{amount_inr})"
                       if intent.get("plan_kind") == "subscription"
                       else f"Purchased plan {intent.get('plan_id')} (₹{amount_inr})"),
            "job_id": None,
            "meta": {
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "plan_id": intent.get("plan_id"),
                "plan_kind": intent.get("plan_kind"),
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

        # Re-read the user so we can return their fresh Pro status.
        fresh = upd or await users.find_one({"_id": user["_id"]})
        return {
            "ok": True,
            "already_verified": False,
            "credited": credited,
            "balance_after": balance_after,
            "pro": _pro_status_from_user(fresh or {}),
        }

    return router
