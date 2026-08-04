"""User feedback system — collects ratings + comments after every successful
standalone module run or completed PhytoNet AI workflow.

Endpoints
─────────
  POST /api/feedback              → submit feedback for a task
  GET  /api/feedback/eligible     → can the current user submit for {module, task_id}?

Idempotency: one feedback per (user_id, module, task_id). Any attempt to
resubmit is rejected with HTTP 409.

Collection: `feedback`
  {
    _id, user_id, module, workflow_id, task_id,
    ratings: { overall, ease_of_use, accuracy, speed },
    would_recommend: bool,
    comments: str | None,
    created_at: datetime
  }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, conint

logger = logging.getLogger(__name__)


MODULE_WHITELIST = {
    "plant-database", "target-prediction", "disease-target-prediction",
    "admet", "molecular-docking", "phytonet-ai-agent",
    "network-analysis", "ai-report", "molecular-dynamics",
}


class Ratings(BaseModel):
    overall:     conint(ge=1, le=5)
    ease_of_use: conint(ge=1, le=5)
    accuracy:    conint(ge=1, le=5)
    speed:       conint(ge=1, le=5)


class FeedbackPayload(BaseModel):
    module: str = Field(..., min_length=2, max_length=64)
    task_id: str = Field(..., min_length=1, max_length=128)
    workflow_id: Optional[str] = Field(None, max_length=128)
    ratings: Ratings
    would_recommend: bool
    comments: Optional[str] = Field(None, max_length=2000)


def build_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/feedback", tags=["feedback"])
    feedback = db["feedback"]

    async def _exists(user_id: str, module: str, task_id: str) -> bool:
        return bool(await feedback.find_one({
            "user_id": user_id, "module": module, "task_id": task_id,
        }, projection={"_id": 1}))

    @router.get("/eligible")
    async def eligible(module: str, task_id: str,
                       user=Depends(get_current_user)):
        if module not in MODULE_WHITELIST:
            raise HTTPException(status_code=400, detail=f"Unknown module {module!r}")
        return {"eligible": not await _exists(str(user["_id"]), module, task_id)}

    @router.post("")
    async def submit(payload: FeedbackPayload,
                     user=Depends(get_current_user)):
        if payload.module not in MODULE_WHITELIST:
            raise HTTPException(status_code=400, detail=f"Unknown module {payload.module!r}")

        uid = str(user["_id"])
        if await _exists(uid, payload.module, payload.task_id):
            raise HTTPException(status_code=409, detail="Feedback already submitted for this task.")

        doc = {
            "user_id": uid,
            "user_email": user.get("email"),
            "user_name": " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x) or user.get("email"),
            "module": payload.module,
            "workflow_id": payload.workflow_id,
            "task_id": payload.task_id,
            "ratings": payload.ratings.model_dump(),
            "would_recommend": payload.would_recommend,
            "comments": (payload.comments or "").strip() or None,
            "created_at": datetime.now(timezone.utc),
        }
        res = await feedback.insert_one(doc)
        return {"ok": True, "id": str(res.inserted_id)}

    return router
