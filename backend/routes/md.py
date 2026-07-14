"""Molecular Dynamics endpoints (GROMACS project generator, setup-only)."""
from __future__ import annotations
import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

import deps_check
import docking_service
import execution_engines
import md_service


class MDCompound(BaseModel):
    name: str
    smiles: str


class MDTarget(BaseModel):
    uniprot_id: str
    gene_symbol: Optional[str] = None
    pdb_id: Optional[str] = None


class MDConfigModel(BaseModel):
    force_field: str = "amber99sb-ildn"
    water_model: str = "tip3p"
    box_type: str = "dodecahedron"
    box_padding_nm: float = 1.0
    ion_concentration: float = 0.15
    positive_ion: str = "NA"
    negative_ion: str = "CL"
    temperature_K: float = 300.0
    pressure_bar: float = 1.0
    em_steps: int = 50000
    nvt_ps: int = 100
    npt_ps: int = 100
    production_ns: int = 100
    dt_fs: float = 2.0


class MDBuildRequest(BaseModel):
    compound: MDCompound
    target: MDTarget
    config: MDConfigModel = MDConfigModel()
    receptor_pdb_content: Optional[str] = None
    engine: Optional[str] = None
    engine_options: Dict[str, Any] = Field(default_factory=dict)


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["md"])

    @router.get("/md/engines")
    async def md_engines():
        return {"engines": execution_engines.list_engines()}

    @router.get("/deps/status")
    async def deps_status():
        """Expose the startup dependency check result — used by ops + frontend
        'system health' panels. Never raises."""
        return {
            "ok": len(deps_check.get_missing_required()) == 0,
            "missing_required": deps_check.get_missing_required(),
            "deps": {
                k: {
                    "ok": s.ok, "required": s.required, "kind": s.kind,
                    "path": s.path, "version": s.version, "error": s.error,
                }
                for k, s in deps_check.DEPS_STATUS.items()
            },
        }

    @router.post("/md/estimate")
    async def md_estimate(payload: MDConfigModel):
        cfg = md_service.MDConfig(**payload.model_dump())
        return md_service.estimate_runtime(cfg, atoms=30000)

    @router.post("/md/build")
    async def md_build(payload: MDBuildRequest):
        cfg = md_service.MDConfig(**payload.config.model_dump())
        receptor_content = payload.receptor_pdb_content
        if not receptor_content and payload.target.pdb_id:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.get(docking_service.RCSB_FILE.format(pdb=payload.target.pdb_id))
                    r.raise_for_status()
                    receptor_content = r.text
            except Exception as e:
                logging.warning(f"MD receptor fetch failed: {e}")
        project, zip_bytes = md_service.build_md_project(
            compound=payload.compound.model_dump(),
            target=payload.target.model_dump(),
            receptor_pdb_content=receptor_content,
            ligand_smiles_or_mol2=payload.compound.smiles,
            cfg=cfg,
            engine_key=payload.engine,
            engine_opts=payload.engine_options or {},
        )
        return Response(content=zip_bytes, media_type="application/zip",
                        headers={"Content-Disposition": f"attachment; filename={project}.zip"})

    return router
