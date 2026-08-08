"""Referral program — mutual 10-node reward on first bundle purchase.

How it works
────────────
1.  Every user gets a unique `referral_code` (e.g. "PN7X2K4Q") on signup — see
    `_ensure_referral_code()`.
2.  A prospective new user visits `phytonet.ai/?ref=PN7X2K4Q`. The frontend
    stashes the code in localStorage.
3.  On successful signup, the frontend calls `POST /api/referrals/apply` with
    the code. We record `referred_by` on the new user and log a pending
    reward tied to (referrer, invitee).
4.  When the invitee completes their FIRST bundle purchase (verify-payment
    fires), we call `award_referral_on_first_purchase()` which credits **10
    nodes** to BOTH parties and marks the reward as `paid`.

Idempotency guarantees
──────────────────────
* Each invitee can only be referred once (`referred_by` is set-once).
* Rewards live in `referral_rewards` with unique index on (invitee_user_id).
* The reward-on-purchase call is idempotent — if a reward is already `paid`
  we return early.

Endpoints
─────────
  GET  /api/referrals/me             → { code, invited_count, earned_nodes, share_url }
  POST /api/referrals/apply          → { ok } — attaches a referral code to the caller
  GET  /api/referrals/leaderboard    → top referrers (auth-required, informational only)
"""
from __future__ import annotations
import logging
import os
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from bson import ObjectId

logger = logging.getLogger(__name__)

REFERRAL_REWARD_NODES = 10  # credited to both parties on invitee's first purchase.
REFERRAL_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _generate_code(length: int = 8) -> str:
    return "PN" + "".join(secrets.choice(REFERRAL_CODE_ALPHABET) for _ in range(length - 2))


async def _ensure_referral_code(db, user_doc: dict) -> str:
    """Return the caller's referral code, creating one if missing.
    Guarantees uniqueness via a retry loop over `users.referral_code`.
    """
    existing = user_doc.get("referral_code")
    if existing:
        return existing
    users = db["users"]
    # Ensure the index exists (idempotent — Mongo returns if already present).
    try:
        await users.create_index("referral_code", unique=True, sparse=True)
    except Exception:
        pass
    for _ in range(8):
        code = _generate_code()
        try:
            await users.update_one({"_id": user_doc["_id"]}, {"$set": {"referral_code": code}})
            return code
        except Exception:
            continue
    raise HTTPException(status_code=500, detail="Failed to allocate referral code")


class ApplyReferralPayload(BaseModel):
    code: str = Field(min_length=4, max_length=32)


def build_router(db, get_current_user):
    router = APIRouter(prefix="/referrals", tags=["referrals"])
    users = db["users"]
    rewards = db["referral_rewards"]

    @router.get("/me")
    async def me(user=Depends(get_current_user)):
        code = await _ensure_referral_code(db, user)
        # Count how many people have signed up with this user's code and how
        # many nodes have already been paid out for successful referrals.
        invited_count = await users.count_documents({"referred_by": code})
        agg = [
            {"$match": {"referrer_user_id": str(user["_id"]), "status": "paid"}},
            {"$group": {"_id": None,
                        "earned":    {"$sum": "$referrer_reward_nodes"},
                        "converted": {"$sum": 1}}},
        ]
        earned, converted = 0, 0
        async for r in rewards.aggregate(agg):
            earned = int(r.get("earned") or 0)
            converted = int(r.get("converted") or 0)
        origin = os.environ.get("FRONTEND_URL", "").rstrip("/")
        share_url = (f"{origin}/?ref={code}" if origin else f"?ref={code}")
        return {
            "code": code,
            "invited_count": invited_count,
            "converted_count": converted,
            "earned_nodes": earned,
            "reward_per_referral": REFERRAL_REWARD_NODES,
            "share_url": share_url,
        }

    @router.post("/apply")
    async def apply(payload: ApplyReferralPayload, user=Depends(get_current_user)):
        """Attach a referral code to the calling user. Idempotent — can only
        succeed once per user, and never self-references.

        Called by the signup UI after a new account is created + also exposed
        as a manual "I have a referral code" flow from the dashboard for the
        first hour post-signup.
        """
        code = payload.code.strip().upper()
        if not code.startswith("PN"):
            raise HTTPException(status_code=400, detail="That doesn't look like a valid PhytoNet referral code.")
        # Reject self-referrals.
        my_code = user.get("referral_code")
        if my_code and code == my_code:
            raise HTTPException(status_code=400, detail="You can't refer yourself.")
        # Set-once rule.
        if user.get("referred_by"):
            raise HTTPException(status_code=400, detail="A referral code is already applied to your account.")
        # Look up the referrer.
        referrer = await users.find_one({"referral_code": code})
        if not referrer:
            raise HTTPException(status_code=404, detail="Referral code not found.")
        if referrer["_id"] == user["_id"]:
            raise HTTPException(status_code=400, detail="You can't refer yourself.")
        now = datetime.now(timezone.utc)
        # Set referred_by on the invitee.
        await users.update_one(
            {"_id": user["_id"]},
            {"$set": {"referred_by": code, "referred_by_at": now,
                      "referrer_user_id": str(referrer["_id"])}},
        )
        # Create a pending reward row. Uniqueness protects against double-apply.
        try:
            await rewards.create_index("invitee_user_id", unique=True)
        except Exception:
            pass
        try:
            await rewards.insert_one({
                "referrer_user_id": str(referrer["_id"]),
                "invitee_user_id":  str(user["_id"]),
                "referral_code":    code,
                "referrer_reward_nodes": REFERRAL_REWARD_NODES,
                "invitee_reward_nodes":  REFERRAL_REWARD_NODES,
                "status": "pending",   # → "paid" once the invitee buys
                "created_at": now,
            })
        except Exception:
            # If a duplicate exists we still consider apply() successful — the
            # reward will fire on first purchase.
            pass
        return {"ok": True,
                "message": f"Referral applied — you'll both earn {REFERRAL_REWARD_NODES} nodes when you make your first purchase!"}

    @router.get("/leaderboard")
    async def leaderboard():
        """Top 10 referrers — public endpoint (no auth required).
        Surfaces community energy on marketing pages. User display names are
        first-name-only or anonymised email prefixes to protect privacy."""
        pipe = [
            {"$match": {"status": "paid"}},
            {"$group": {
                "_id":     "$referrer_user_id",
                "converted": {"$sum": 1},
                "nodes":     {"$sum": "$referrer_reward_nodes"},
            }},
            {"$sort": {"converted": -1}},
            {"$limit": 10},
        ]
        rows = []
        rank = 0
        async for r in rewards.aggregate(pipe):
            rank += 1
            uid = r["_id"]
            u = None
            try:
                u = await users.find_one({"_id": ObjectId(uid)})
            except Exception:
                pass
            # Prefer first_name; fall back to a masked email prefix
            # ("alice@..." → "alice") so we never expose full emails.
            display = None
            if u:
                display = u.get("first_name")
                if not display and u.get("email"):
                    prefix = u["email"].split("@", 1)[0]
                    # Truncate long prefixes so it looks like a handle.
                    display = prefix[:12]
            rows.append({
                "rank": rank,
                "user_display": display or "anonymous",
                "converted": r["converted"],
                "nodes":     r["nodes"],
            })
        return {"rows": rows}

    return router


# ─────────────────── Called from nodes.verify_payment ────────────────────
async def award_referral_on_first_purchase(db, invitee_user_id: str) -> None:
    """Credit REFERRAL_REWARD_NODES to both referrer and invitee if this is
    the invitee's very first paid bundle. Idempotent — safe to call after
    every purchase; only the first one fires actual credits.
    """
    users = db["users"]
    rewards = db["referral_rewards"]
    ledger  = db["node_ledger"]
    try:
        invitee_oid = ObjectId(invitee_user_id)
    except Exception:
        return
    invitee = await users.find_one({"_id": invitee_oid})
    if not invitee:
        return
    referrer_uid = invitee.get("referrer_user_id")
    if not referrer_uid:
        return  # user was not referred, nothing to award
    # Look up the pending reward row.
    reward = await rewards.find_one({"invitee_user_id": invitee_user_id})
    if not reward or reward.get("status") == "paid":
        return  # already paid or nothing to do
    try:
        ref_oid = ObjectId(referrer_uid)
    except Exception:
        return
    now = datetime.now(timezone.utc)
    # Credit referrer.
    referrer = await users.find_one_and_update(
        {"_id": ref_oid},
        {"$inc": {"nodes_balance": REFERRAL_REWARD_NODES,
                  "nodes_lifetime_purchased": REFERRAL_REWARD_NODES}},
        return_document=True,
    )
    if referrer is not None:
        await ledger.insert_one({
            "user_id":  str(ref_oid),
            "direction": "credit", "amount": REFERRAL_REWARD_NODES,
            "balance_after": int(referrer.get("nodes_balance") or 0),
            "module": "system", "workflow": "referral_reward",
            "reason": f"Referral bonus — {invitee.get('email','friend')} joined & purchased",
            "job_id": None,
            "meta": {"invitee_user_id": invitee_user_id,
                     "referral_code":   invitee.get("referred_by")},
            "at": now,
        })
    # Credit invitee.
    invitee_after = await users.find_one_and_update(
        {"_id": invitee_oid},
        {"$inc": {"nodes_balance": REFERRAL_REWARD_NODES,
                  "nodes_lifetime_purchased": REFERRAL_REWARD_NODES}},
        return_document=True,
    )
    if invitee_after is not None:
        await ledger.insert_one({
            "user_id":  invitee_user_id,
            "direction": "credit", "amount": REFERRAL_REWARD_NODES,
            "balance_after": int(invitee_after.get("nodes_balance") or 0),
            "module": "system", "workflow": "referral_reward",
            "reason": "Welcome bonus for using a referral code",
            "job_id": None,
            "meta": {"referrer_user_id": referrer_uid,
                     "referral_code":    invitee.get("referred_by")},
            "at": now,
        })
    await rewards.update_one(
        {"_id": reward["_id"]},
        {"$set": {"status": "paid", "paid_at": now}},
    )
