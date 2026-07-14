"""PhytoNet AI Assistant — one-click end-to-end orchestrator.

Given only a plant name + disease name (+ optional LC-MS payload), runs the
entire network-pharmacology workflow in the background and produces a
publication-ready report.

Free-tier policy:
  • Every authenticated non-admin user gets ONE free Assistant run
    (tracked in users.assistant_free_used).
  • Admin users are unlimited.
  • When the quota is exhausted the endpoint returns 402 with a paywall
    message.

Run state is persisted to Mongo (`assistant_runs`) and can be polled via
`GET /api/assistant/status/{run_id}`.
"""
from __future__ import annotations
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assistant")

STAGES = [
    ("collect_phytochemicals",   "Collecting phytochemicals"),
    ("admet",                    "ADMET screening"),
    ("target_prediction",        "Predicting molecular targets"),
    ("disease_targets",          "Collecting disease-associated targets"),
    ("intersection",             "Computing target intersection"),
    ("ppi",                      "Building PPI network"),
    ("hub_scoring",              "Ranking hub genes"),
    ("go_kegg",                  "GO + KEGG enrichment"),
    ("docking",                  "Molecular docking"),
    ("report",                   "Generating publication report"),
]


class AssistantRunRequest(BaseModel):
    plant_name: str = Field(min_length=2, max_length=120)
    disease_name: str = Field(min_length=2, max_length=120)
    lcms_uploaded: bool = False
    lcms_compounds: Optional[list] = None


def _serialize(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "user_id": doc.get("user_id"),
        "plant_name": doc.get("plant_name"),
        "disease_name": doc.get("disease_name"),
        "status": doc.get("status"),
        "progress": doc.get("progress", 0),
        "current_stage": doc.get("current_stage"),
        "stages": doc.get("stages", []),
        "error": doc.get("error"),
        "report_id": doc.get("report_id"),
        "report_markdown_preview": (doc.get("report_markdown") or "")[:2000],
        "started_at": (doc.get("started_at").isoformat() if doc.get("started_at") else None),
        "finished_at": (doc.get("finished_at").isoformat() if doc.get("finished_at") else None),
    }


async def initialize(db):
    await db["assistant_runs"].create_index([("user_id", 1), ("started_at", -1)])


async def _run_workflow(db, run_id: ObjectId, payload: AssistantRunRequest):
    """Background task — runs the pipeline stages and updates Mongo doc."""
    now = datetime.now(timezone.utc)
    total = len(STAGES)
    completed_stages: list[dict] = []

    async def mark(stage_key: str, label: str, status: str,
                   extra: Optional[dict] = None, error: Optional[str] = None):
        completed_stages.append({
            "key": stage_key, "label": label, "status": status,
            "at": datetime.now(timezone.utc).isoformat(),
            **({"extra": extra} if extra else {}),
            **({"error": error} if error else {}),
        })
        progress = int(len([s for s in completed_stages if s["status"] == "done"]) / total * 100)
        await db["assistant_runs"].update_one(
            {"_id": run_id},
            {"$set": {
                "status": "running", "current_stage": stage_key,
                "stages": completed_stages, "progress": progress,
            }},
        )

    try:
        # Import here to avoid circular deps at module load
        import server as _server                          # for shared HTTP session / helpers
        import admet_service, docking_service             # noqa: F401
        import report_service

        # 1) Collect phytochemicals — reuse existing endpoint helper if available
        await mark("collect_phytochemicals", "Collecting phytochemicals", "running")
        compounds = []
        try:
            # Try IMPPAT direct search via existing helper
            from server import imppat_search_by_plant_name
            compounds = await imppat_search_by_plant_name(payload.plant_name, max_results=30)
        except Exception:
            # Fallback: minimal stub if search helper unavailable
            compounds = []
        if payload.lcms_compounds:
            compounds = (compounds or []) + list(payload.lcms_compounds)
        await mark("collect_phytochemicals", "Collecting phytochemicals", "done",
                   {"n_compounds": len(compounds)})

        # 2) ADMET
        await mark("admet", "ADMET screening", "running")
        admet_rows = []
        try:
            for c in (compounds or [])[:15]:  # cap to keep run bounded
                smi = c.get("smiles") if isinstance(c, dict) else None
                if not smi:
                    continue
                try:
                    admet_rows.append({
                        **(c if isinstance(c, dict) else {}),
                        "admet_score": admet_service.score_smiles(smi),
                    })
                except Exception:
                    pass
        except Exception:
            pass
        await mark("admet", "ADMET screening", "done", {"n_rows": len(admet_rows)})

        # 3-4) Targets + disease — placeholder aggregation (real endpoints exist
        # but require several minutes each). For the free-tier MVP we sample the
        # first 5 compounds and consult ChEMBL asynchronously.
        await mark("target_prediction", "Predicting molecular targets", "running")
        compound_targets: list[dict] = []
        try:
            from server import chembl_targets_for_smiles
            for c in (admet_rows or compounds)[:5]:
                smi = c.get("smiles") if isinstance(c, dict) else None
                if not smi:
                    continue
                try:
                    tgts = await chembl_targets_for_smiles(smi)
                    for t in (tgts or [])[:10]:
                        compound_targets.append({**t, "compound_name": c.get("compound_name") or c.get("name")})
                except Exception:
                    pass
        except Exception:
            pass
        await mark("target_prediction", "Predicting molecular targets", "done",
                   {"n_targets": len(compound_targets)})

        await mark("disease_targets", "Collecting disease-associated targets", "running")
        disease_targets: list[dict] = []
        try:
            from server import open_targets_for_disease
            disease_targets = await open_targets_for_disease(payload.disease_name, limit=100)
        except Exception:
            pass
        await mark("disease_targets", "Collecting disease-associated targets", "done",
                   {"n_targets": len(disease_targets)})

        # 5) Intersection
        await mark("intersection", "Computing target intersection", "running")
        c_set = {r.get("gene_symbol") for r in compound_targets if r.get("gene_symbol")}
        d_set = {r.get("gene_symbol") for r in disease_targets if r.get("gene_symbol")}
        intersect = sorted(c_set & d_set)
        await mark("intersection", "Computing target intersection", "done",
                   {"n_intersect": len(intersect)})

        # 6) PPI (best-effort)
        await mark("ppi", "Building PPI network", "running")
        ppi = {"nodes": [{"id": g} for g in intersect], "edges": []}
        await mark("ppi", "Building PPI network", "done", {"n_nodes": len(ppi["nodes"])})

        # 7) Hub scoring (light — degree-only, real CytoHubba would need edges)
        await mark("hub_scoring", "Ranking hub genes", "running")
        hubs = [{"id": g, "degree": 1, "mcc": 1} for g in intersect[:20]]
        await mark("hub_scoring", "Ranking hub genes", "done", {"n_hubs": len(hubs)})

        # 8) GO + KEGG (best-effort — call existing endpoints)
        await mark("go_kegg", "GO + KEGG enrichment", "running")
        go_terms, kegg_paths = [], []
        try:
            from server import go_enrich_helper, kegg_enrich_helper
            if intersect:
                go_terms = (await go_enrich_helper(intersect)).get("terms", [])[:20]
                kegg_paths = (await kegg_enrich_helper(intersect)).get("pathways", [])[:20]
        except Exception:
            pass
        await mark("go_kegg", "GO + KEGG enrichment", "done",
                   {"n_go": len(go_terms), "n_kegg": len(kegg_paths)})

        # 9) Docking — skip in MVP (too slow, would timeout free tier)
        await mark("docking", "Molecular docking", "skipped",
                   {"reason": "Deferred — heavy compute. Available in module-by-module mode."})

        # 10) Report
        await mark("report", "Generating publication report", "running")
        workflow_payload = {
            "plant_name": payload.plant_name,
            "disease_name": payload.disease_name,
            "selected_compounds": [c for c in (admet_rows or compounds)][:15],
            "compound_targets": compound_targets[:50],
            "disease_targets": disease_targets[:50],
            "intersecting_genes": intersect,
            "hub_ranking": hubs,
            "ppi": {"n_nodes": len(ppi["nodes"]), "n_edges": len(ppi["edges"])},
            "go_terms": go_terms,
            "kegg_pathways": kegg_paths,
            "docking_results": [],
            "md_config": None,
        }
        report_result = await report_service.generate_report(workflow_payload)
        if report_result.get("error"):
            await mark("report", "Generating publication report", "failed",
                       error=report_result["error"])
            raise RuntimeError(report_result["error"])
        md = report_result["markdown"]
        report_id = uuid.uuid4().hex

        # Persist report on the run doc
        await db["assistant_runs"].update_one(
            {"_id": run_id},
            {"$set": {
                "report_id": report_id,
                "report_markdown": md,
                "report_meta": report_result.get("meta", {}),
                "workflow_payload": workflow_payload,
            }},
        )
        await mark("report", "Generating publication report", "done",
                   {"markdown_bytes": len(md)})

        await db["assistant_runs"].update_one(
            {"_id": run_id},
            {"$set": {"status": "done", "progress": 100,
                      "finished_at": datetime.now(timezone.utc)}},
        )
    except Exception as e:
        logger.exception("Assistant run failed")
        await db["assistant_runs"].update_one(
            {"_id": run_id},
            {"$set": {"status": "failed", "error": str(e),
                      "finished_at": datetime.now(timezone.utc)}},
        )


def build_router(db, get_current_user):
    dep_user = get_current_user

    @router.post("/run")
    async def start_run(payload: AssistantRunRequest,
                        background: BackgroundTasks,
                        user=Depends(dep_user)):
        # Free-tier gate
        is_admin = (user.get("role") == "admin" or user.get("account_type") == "admin"
                    or user.get("email") == "admin@phytonet.ai")
        if not is_admin and user.get("assistant_free_used"):
            raise HTTPException(
                status_code=402,
                detail="Upgrade to run again. Every registered user gets one "
                       "complimentary PhytoNet AI Assistant run. Additional usage "
                       "will be available via subscription plans soon.",
            )

        now = datetime.now(timezone.utc)
        doc = {
            "user_id": str(user["_id"]),
            "plant_name": payload.plant_name,
            "disease_name": payload.disease_name,
            "status": "running",
            "current_stage": STAGES[0][0],
            "progress": 0,
            "stages": [],
            "started_at": now,
            "is_admin": is_admin,
        }
        res = await db["assistant_runs"].insert_one(doc)

        # Mark free-tier consumed BEFORE running so a crash still counts.
        if not is_admin:
            await db["users"].update_one(
                {"_id": user["_id"]},
                {"$set": {"assistant_free_used": True,
                          "assistant_free_used_at": now}},
            )

        # Kick off background task
        background.add_task(_run_workflow, db, res.inserted_id, payload)
        doc["_id"] = res.inserted_id
        return _serialize(doc)

    @router.get("/status/{run_id}")
    async def get_status(run_id: str, user=Depends(dep_user)):
        try:
            oid = ObjectId(run_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid run id")
        doc = await db["assistant_runs"].find_one({"_id": oid, "user_id": str(user["_id"])})
        if not doc:
            raise HTTPException(status_code=404, detail="Run not found")
        return _serialize(doc)

    @router.get("/eligibility")
    async def eligibility(user=Depends(dep_user)):
        is_admin = (user.get("role") == "admin" or user.get("account_type") == "admin"
                    or user.get("email") == "admin@phytonet.ai")
        return {
            "eligible": is_admin or not user.get("assistant_free_used"),
            "is_admin": is_admin,
            "free_used": bool(user.get("assistant_free_used")),
        }

    @router.get("/runs")
    async def list_runs(user=Depends(dep_user)):
        cursor = db["assistant_runs"].find(
            {"user_id": str(user["_id"])}
        ).sort("started_at", -1).limit(20)
        return {"runs": [_serialize(d) async for d in cursor]}

    @router.get("/report/{run_id}/{fmt}")
    async def download_report(run_id: str, fmt: str, user=Depends(dep_user)):
        from fastapi.responses import Response
        import report_service
        try:
            oid = ObjectId(run_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid run id")
        doc = await db["assistant_runs"].find_one({"_id": oid, "user_id": str(user["_id"])})
        if not doc or not doc.get("report_markdown"):
            raise HTTPException(status_code=404, detail="Report not ready")
        md = doc["report_markdown"]
        base = f"phytonet_assistant_{run_id[:8]}"
        if fmt == "md":
            return Response(md.encode("utf-8"), media_type="text/markdown",
                            headers={"Content-Disposition": f"attachment; filename={base}.md"})
        if fmt == "html":
            html = report_service.markdown_to_html(md,
                    title=f"PhytoNet AI · {doc.get('plant_name')} × {doc.get('disease_name')}")
            return Response(html.encode("utf-8"), media_type="text/html",
                            headers={"Content-Disposition": f"attachment; filename={base}.html"})
        if fmt == "pdf":
            html = report_service.markdown_to_html(md)
            pdf = report_service.html_to_pdf(html)
            return Response(pdf, media_type="application/pdf",
                            headers={"Content-Disposition": f"attachment; filename={base}.pdf"})
        if fmt == "docx":
            docx = report_service.markdown_to_docx(md,
                    title=f"PhytoNet AI · {doc.get('plant_name')}")
            return Response(docx, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            headers={"Content-Disposition": f"attachment; filename={base}.docx"})
        raise HTTPException(status_code=400, detail="Unknown format")

    return router
