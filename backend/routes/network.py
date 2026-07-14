"""Network analysis endpoints — PPI (STRING), KEGG (Enrichr), GO (g:Profiler)."""
from __future__ import annotations
from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

import network_service


class PPIRequest(BaseModel):
    genes: List[str]
    species: int = 9606
    required_score: int = 400
    network_type: str = "functional"
    add_nodes: int = 0


class KeggRequest(BaseModel):
    genes: List[str]
    library: str = "KEGG_2021_Human"


class GoRequest(BaseModel):
    genes: List[str]
    organism: str = "hsapiens"
    sources: Optional[List[str]] = None
    user_threshold: float = 0.05
    significance_method: str = "g_SCS"


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["network"])

    @router.post("/ppi/network")
    async def ppi_network(payload: PPIRequest):
        return await network_service.fetch_string_network(
            genes=payload.genes,
            species=payload.species,
            required_score=payload.required_score,
            network_type=payload.network_type,
            add_nodes=payload.add_nodes,
        )

    @router.post("/kegg/enrich")
    async def kegg_enrich(payload: KeggRequest):
        return await network_service.enrichr_kegg(payload.genes, payload.library)

    @router.post("/go/enrich")
    async def go_enrich(payload: GoRequest):
        return await network_service.gprofiler_go(
            genes=payload.genes,
            organism=payload.organism,
            sources=payload.sources,
            user_threshold=payload.user_threshold,
            significance_method=payload.significance_method,
        )

    return router
