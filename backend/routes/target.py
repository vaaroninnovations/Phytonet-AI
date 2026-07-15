"""Target Prediction (Compound → Targets) endpoints.

Async job pattern: POST /target/predict returns a job_id; GET /target/status/{id}
polls for progress and final rows. Cached per-SMILES in Mongo.
"""
from __future__ import annotations
import asyncio
import logging
import time
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

import target_service


class TargetCompound(BaseModel):
    compound_name: Optional[str] = None
    canonical_smiles: Optional[str] = None
    smiles: Optional[str] = None
    molecular_formula: Optional[str] = None
    molecular_weight: Optional[float] = None


class TargetPredictPayload(BaseModel):
    compounds: List[TargetCompound]


def build_router(db: AsyncIOMotorDatabase, *, cache_ttl_seconds: int) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["target"])
    cache_col = db["target_cache_v1"]
    jobs: Dict[str, dict] = {}

    async def _lookup(smi: str) -> Optional[List[dict]]:
        doc = await cache_col.find_one({"_id": smi})
        if not doc:
            return None
        if (time.time() - doc.get("cached_at", 0)) > cache_ttl_seconds:
            return None
        return doc.get("rows", [])

    async def _store(smi: str, rows: List[dict]):
        try:
            await cache_col.replace_one(
                {"_id": smi},
                {"_id": smi, "rows": rows, "cached_at": time.time()},
                upsert=True,
            )
        except Exception as e:
            logging.debug(f"target cache store failed: {e}")

    async def _run_job(job_id: str, compounds: List[dict]):
        async def on_progress(done: int, total: int):
            j = jobs.get(job_id)
            if j:
                j["done"] = done
        try:
            rows = await target_service.run_target_prediction_job(
                compounds, on_progress,
                cache_lookup=_lookup, cache_store=_store,
            )
            jobs[job_id]["rows"] = rows
            jobs[job_id]["status"] = "done"
        except Exception as e:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["error"] = str(e)
            logging.exception(f"Target job {job_id} failed: {e}")

    @router.post("/target/predict")
    async def target_predict(payload: TargetPredictPayload):
        if not payload.compounds:
            return {"job_id": None, "total": 0}
        job_id = str(uuid.uuid4())
        total = len(payload.compounds)
        jobs[job_id] = {
            "done": 0, "total": total, "status": "running",
            "rows": None, "started_at": time.time(),
        }
        asyncio.create_task(_run_job(job_id, [c.model_dump() for c in payload.compounds]))
        return {"job_id": job_id, "total": total}

    @router.get("/target/status/{job_id}")
    async def target_status(job_id: str):
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        resp = {
            "job_id": job_id,
            "done": job.get("done", 0),
            "total": job.get("total", 0),
            "status": job.get("status"),
            "error": job.get("error"),
        }
        if job.get("status") == "done":
            resp["rows"] = job.get("rows", [])
        return resp

    return router
