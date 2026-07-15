"""LOTUS natural-products API wrappers (thin HTTP proxy)."""
from __future__ import annotations
from typing import List, Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query

LOTUS_BASE = "https://lotus.naturalproducts.net/api/search"
USER_AGENT = (
    "PhytoNet-AI/1.0 (+https://phytonet.ai) FastAPI/httpx research-tool"
)


def _normalize(nps: list) -> List[dict]:
    """Map LOTUS naturalProducts payloads to the compact shape used everywhere
    else in the app. Duplicated locally so the router has no import from
    server.py — keeps this module self-contained.
    """
    out: List[dict] = []
    for np_ in nps or []:
        out.append({
            "source": "LOTUS",
            "compound_name": np_.get("traditional_name") or np_.get("iupac_name"),
            "lotus_id": np_.get("lotus_id"),
            "smiles": np_.get("smiles") or np_.get("smiles2D"),
            "inchi": np_.get("inchi"),
            "inchi_key": np_.get("inchikey"),
            "molecular_formula": np_.get("molecular_formula"),
            "molecular_weight": np_.get("molecular_weight"),
        })
    # De-duplicate on inchi_key or lotus_id (LOTUS occasionally returns dupes)
    seen: set = set()
    uniq: List[dict] = []
    for row in out:
        key = row.get("inchi_key") or row.get("lotus_id") or (row.get("smiles"), row.get("compound_name"))
        if key in seen:
            continue
        seen.add(key)
        uniq.append(row)
    return uniq


async def _get(url: str, timeout: float = 30.0):
    async with httpx.AsyncClient() as c:
        r = await c.get(url, timeout=timeout, headers={"User-Agent": USER_AGENT})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="LOTUS upstream error")
    return r.json()


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["lotus"])

    @router.get("/lotus/simple")
    async def lotus_simple(query: str = Query(..., min_length=1)):
        data = await _get(f"{LOTUS_BASE}/simple?query={quote(query)}")
        return {
            "query": query,
            "type": data.get("determinedInputType"),
            "compounds": _normalize(data.get("naturalProducts", [])),
        }

    @router.get("/lotus/exact")
    async def lotus_exact(
        type: Literal["smiles", "inchi"] = Query("smiles"),
        value: str = Query(..., min_length=1),
    ):
        data = await _get(f"{LOTUS_BASE}/exact-structure?type={type}&smiles={quote(value)}")
        nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
        return {"type": type, "value": value, "compounds": _normalize(nps or [])}

    @router.get("/lotus/substructure")
    async def lotus_substructure(
        smiles: str = Query(..., min_length=1),
        algorithm: Literal["default", "df", "vf"] = Query("default"),
        max_hits: int = Query(100, ge=1, le=500),
    ):
        data = await _get(
            f"{LOTUS_BASE}/substructure?type={algorithm}&max-hits={max_hits}&smiles={quote(smiles)}",
            timeout=60.0,
        )
        nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
        return {"algorithm": algorithm, "smiles": smiles, "compounds": _normalize(nps or [])}

    @router.get("/lotus/molweight")
    async def lotus_molweight(
        min_mass: float = Query(..., alias="minMass"),
        max_mass: float = Query(..., alias="maxMass"),
        max_hits: int = Query(20, ge=1, le=500, alias="maxHits"),
    ):
        data = await _get(
            f"{LOTUS_BASE}/molweight?minMass={min_mass}&maxMass={max_mass}&maxHits={max_hits}",
            timeout=45.0,
        )
        nps = data.get("naturalProducts", []) if isinstance(data, dict) else data
        return {"minMass": min_mass, "maxMass": max_mass, "compounds": _normalize(nps or [])}

    return router
