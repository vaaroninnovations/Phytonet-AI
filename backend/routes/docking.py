"""Molecular Docking endpoints (AutoDock Vina + Meeko + OpenBabel)."""
from __future__ import annotations
import json as _json
import logging
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

import deps_check
import docking_service


class DockCompound(BaseModel):
    name: str
    smiles: str


class DockTarget(BaseModel):
    uniprot_id: str
    gene_symbol: Optional[str] = None
    pdb_id: Optional[str] = None


class DockPDBCandidatesRequest(BaseModel):
    uniprot_ids: List[str]
    limit: int = 5


class DockRunRequest(BaseModel):
    compounds: List[DockCompound]
    targets: List[DockTarget]
    exhaustiveness: int = 8
    num_modes: int = 9
    box_padding: float = 8.0


_DOCK_MISSING_MSG = (
    "Docking service unavailable — missing required dependencies: {miss}. "
    "Rebuild the backend image with `autodock-vina` + `openbabel` (see "
    "/app/Dockerfile) or set VINA_EXECUTABLE / OBABEL_EXECUTABLE to a valid "
    "path."
)


def _check_deps():
    missing = deps_check.get_missing_required()
    blockers = [m for m in missing if m in {"vina", "obabel", "rdkit", "meeko"}]
    if blockers:
        raise HTTPException(
            status_code=503,
            detail=_DOCK_MISSING_MSG.format(miss=", ".join(blockers)),
        )


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["docking"])

    @router.post("/docking/pdb-candidates")
    async def docking_pdb_candidates(payload: DockPDBCandidatesRequest):
        result: dict = {}
        for uid in payload.uniprot_ids:
            try:
                result[uid] = await docking_service.rcsb_candidates_for_uniprot(uid, limit=payload.limit)
            except Exception as e:
                result[uid] = {"error": str(e)}
        return {"candidates": result}

    @router.post("/docking/run")
    async def docking_run(payload: DockRunRequest):
        _check_deps()
        try:
            return await docking_service.run_docking_batch(
                compounds=[c.model_dump() for c in payload.compounds],
                targets=[t.model_dump() for t in payload.targets],
                exhaustiveness=payload.exhaustiveness,
                num_modes=payload.num_modes,
                box_padding=payload.box_padding,
            )
        except Exception as e:
            logging.exception("Docking batch failed")
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/docking/run/stream")
    async def docking_run_stream(payload: DockRunRequest):
        _check_deps()
        compounds = [c.model_dump() for c in payload.compounds]
        targets = [t.model_dump() for t in payload.targets]
        pairs = [(c, t) for c in compounds for t in targets]
        total = len(pairs)

        async def event_gen():
            started = time.time()
            yield f"event: queued\ndata: {_json.dumps({'total': total})}\n\n"
            results = []
            for i, (c, t) in enumerate(pairs):
                elapsed = time.time() - started
                payload_start = {
                    "index": i, "total": total,
                    "compound": c.get("name"),
                    "target": t.get("gene_symbol") or t.get("uniprot_id"),
                    "elapsed_s": round(elapsed, 1),
                }
                yield f"event: pair_start\ndata: {_json.dumps(payload_start)}\n\n"
                try:
                    r = await docking_service.run_docking_batch(
                        compounds=[c], targets=[t],
                        exhaustiveness=payload.exhaustiveness,
                        num_modes=payload.num_modes,
                        box_padding=payload.box_padding,
                    )
                    res = (r.get("results") or [{}])[0]
                    results.append(res)
                    yield f"event: pair_done\ndata: {_json.dumps({**payload_start, 'result': res})}\n\n"
                except Exception as e:
                    yield f"event: error\ndata: {_json.dumps({**payload_start, 'error': str(e)})}\n\n"
            yield f"event: done\ndata: {_json.dumps({'results': results, 'n': len(results)})}\n\n"

        return StreamingResponse(event_gen(), media_type="text/event-stream")

    @router.get("/docking/pose/{job_id}/{pair_id}")
    async def docking_pose(job_id: str, pair_id: str, fmt: str = "pdbqt"):
        try:
            content, mime = docking_service.get_pose_content(job_id, pair_id, fmt=fmt)
            return Response(content=content, media_type=mime,
                            headers={"Content-Disposition": f"attachment; filename={pair_id}.{fmt}"})
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Pose not found")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Legacy POST alias
    @router.post("/docking/pose/{job_id}/{pair_id}")
    async def docking_pose_alias(job_id: str, pair_id: str, fmt: str = "pdbqt"):
        return await docking_pose(job_id, pair_id, fmt)

    return router
