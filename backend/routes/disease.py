"""Disease target identification endpoints (Open Targets, CTD, NCBI Gene)."""
from __future__ import annotations
import time

from fastapi import APIRouter, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

import disease_service


def build_router(db: AsyncIOMotorDatabase, *, cache_ttl_seconds: int) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["disease"])
    cache_col = db["disease_cache_v1"]

    @router.get("/disease/search")
    async def disease_search(q: str = Query(..., min_length=2)):
        hits = await disease_service.search_diseases(q)
        return {"query": q, "hits": hits}

    @router.get("/disease/targets")
    async def disease_targets(efo_id: str = Query(...), name: str = Query("")):
        """Return disease → targets, cached in Mongo for cache_ttl_seconds."""
        doc = await cache_col.find_one({"_id": efo_id})
        now = time.time()
        if doc and (now - doc.get("cached_at", 0)) < cache_ttl_seconds:
            return doc.get("payload", {})
        payload = await disease_service.get_disease_targets(efo_id, name)
        try:
            await cache_col.replace_one(
                {"_id": efo_id},
                {"_id": efo_id, "payload": payload, "cached_at": now},
                upsert=True,
            )
        except Exception:
            pass
        return payload

    return router
