"""AI Scientific Report generation & multi-format download."""
from __future__ import annotations
import asyncio
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import report_service


class ReportGenerateRequest(BaseModel):
    workflow: Dict[str, Any]
    model: str = "claude-sonnet-4-5-20250929"


class ReportInterpretRequest(BaseModel):
    workflow: Dict[str, Any]
    modules: List[str]                          # e.g. ["admet", "docking", "go"]
    project_title: Optional[str] = None
    plant_name: Optional[str] = None
    disease_name: Optional[str] = None
    include_overall: bool = True
    model: str = "claude-sonnet-4-5-20250929"


# Prompts kept as module constants so they're not rebuilt on every call.
MODULE_INTERPRET_SYSTEM = """You are a senior computational pharmacology researcher writing the
"AI Interpretation" subsection of a PhytoNet AI computational analysis report. Your task is to
interpret ONE module's results in 3-5 concise scientific sentences.

Rules:
- Discuss what the results INDICATE — biological significance, methodological strengths and
  limitations, and how they relate to the other modules in the report if relevant.
- DO NOT simply restate numerical values. Interpret them.
- DO NOT fabricate values, references or facts not present in the DATA block.
- If DATA is missing or empty, respond exactly: "No results generated for this analysis."
- Voice: formal, third-person, precise. No first person. No hedging like "may be" repeatedly.
- Return plain paragraph text — no headings, no bullets, no code fences."""

OVERALL_INTERPRET_SYSTEM = """You are a senior computational pharmacology researcher writing the
"Overall Summary" of a PhytoNet AI computational analysis report. Integrate the findings from
ALL modules the user selected into ONE cohesive scientific narrative (6-10 sentences).

Discuss: phytochemical quality, drug-likeness, ADMET profile, target prediction, key pathways,
network analysis, docking performance, overall biological significance, and recommended compounds
for future experimental validation. Read as a Discussion/Conclusion, not a bullet list.

Rules: no fabrication, no headings, no bullets, no code fences. Return plain paragraphs."""


def _fallback_slices(w: Dict[str, Any]) -> Dict[str, Any]:
    """Local fallback if report_service doesn't expose build_module_slices.
    Slims workflow state into per-module data blobs for the LLM prompt."""
    sc = w.get("selected_compounds") or w.get("selectedCompounds") or []
    ct = w.get("compound_targets") or w.get("compoundTargets") or []
    dt = w.get("disease_targets")  or w.get("diseaseTargets")  or []
    hubs = w.get("hub_ranking") or w.get("hubScores") or []
    go   = w.get("go_terms") or w.get("goTerms") or []
    kegg = w.get("kegg_pathways") or w.get("selectedKeggPathways") or []
    dr   = (w.get("docking_results") or w.get("dockingResults") or {}).get("results") or []
    ppi  = w.get("ppi_result") or w.get("ppiResult") or None
    plant = w.get("plant_name") or w.get("plantName")
    return {
        "plant-database":    {"plant": plant, "n_compounds": len(sc)} if plant else None,
        "phyto-std":         {"n_standardized": sum(1 for c in sc if c.get("canonical_smiles"))} if sc else None,
        "compound-library":  {"n": len(sc), "top20": sc[:20]} if sc else None,
        "drug-likeness":     {"n_scored": sum(1 for c in sc if c.get("drug_likeness") is not None)} if sc else None,
        "admet":             {"n_scored": sum(1 for c in sc if c.get("admet") is not None or c.get("admet_score") is not None)} if sc else None,
        "target-prediction": {"n_targets": len({t.get("gene_symbol") for t in ct}), "top20": ct[:20]} if ct else None,
        "disease-targets":   {"n": len({t.get("gene_symbol") for t in dt}), "top20": dt[:20]} if dt else None,
        "ct-network":        {"edges": len(ct), "compounds": len(sc)} if ct and sc else None,
        "network-analysis":  {"intersect": len(w.get("intersecting_genes") or w.get("intersectingGenes") or [])} if (w.get("intersecting_genes") or w.get("intersectingGenes")) else None,
        "ppi":               ppi,
        "hub-genes":         {"top10": hubs[:10]} if hubs else None,
        "go":                {"top20": go[:20]} if go else None,
        "kegg":               {"top20": kegg[:20]} if kegg else None,
        "docking":           {"n_pairs": len(dr), "top10": [
                                {"lig": r.get("ligand_name"), "tgt": r.get("receptor_uniprot"),
                                 "aff": r.get("best_affinity")}
                                for r in dr[:10]
                             ]} if dr else None,
        "md":                w.get("md_config") or w.get("mdConfig") or None,
    }


def build_router() -> APIRouter:
    router = APIRouter(prefix="/api", tags=["report"])
    cache: Dict[str, Dict[str, Any]] = {}

    @router.post("/report/generate")
    async def report_generate(payload: ReportGenerateRequest):
        result = await report_service.generate_report(payload.workflow, model=payload.model)
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        rid = uuid.uuid4().hex
        cache[rid] = result
        return {"report_id": rid, "markdown": result["markdown"], "meta": result["meta"]}

    @router.post("/report/interpret")
    async def report_interpret(payload: ReportInterpretRequest):
        """Per-module + optional overall interpretation via Claude Sonnet 4.5.
        Uses the Emergent LLM key. Skips modules with no data (no fabrication).
        Returns {"per_module": {module_id: text}, "overall": text|None, "model": "…"}"""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

        w = payload.workflow or {}
        plant = payload.plant_name or w.get("plant_name") or w.get("plantName") or "the plant"
        disease = payload.disease_name or w.get("disease_name") or (w.get("selectedDisease") or {}).get("name") or None

        # Build per-module data slices — kept small to avoid huge prompts.
        # Missing/empty data returns the fixed "No results generated" string
        # rather than calling the LLM (saves credits, prevents fabrication).
        slices = report_service.build_module_slices(w) if hasattr(report_service, "build_module_slices") \
                 else _fallback_slices(w)

        async def _one_module(mod: str) -> str:
            data = slices.get(mod)
            if not data:
                return "No results generated for this analysis."
            prompt = (
                f"# Module\n{mod}\n\n"
                f"# Study context\nPlant: {plant}\nDisease: {disease or 'not specified'}\n\n"
                f"# DATA (module-scoped, condensed)\n```json\n{report_service._kbytes(data, cap=3000)}\n```\n\n"
                "Write the AI Interpretation subsection for THIS module only."
            )
            try:
                chat = LlmChat(api_key=api_key, session_id=uuid.uuid4().hex,
                               system_message=MODULE_INTERPRET_SYSTEM).with_model("anthropic", payload.model)
                resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=30.0)
                text = str(resp).strip()
                return text or "No results generated for this analysis."
            except Exception as e:
                return f"AI interpretation unavailable for this module ({str(e)[:80]})."

        # Run per-module in parallel (up to 4 concurrent to stay well under
        # Emergent's rate limits and Cloudflare's ingress timeout).
        sem = asyncio.Semaphore(4)
        async def _bounded(mod):
            async with sem: return mod, await _one_module(mod)
        per_module_pairs = await asyncio.gather(*[_bounded(m) for m in payload.modules])
        per_module = {mod: txt for mod, txt in per_module_pairs}

        overall = None
        if payload.include_overall:
            combined = {m: slices.get(m) for m in payload.modules if slices.get(m)}
            if combined:
                prompt = (
                    f"# Study context\nPlant: {plant}\nDisease: {disease or 'not specified'}\n\n"
                    f"# Selected modules\n{', '.join(payload.modules)}\n\n"
                    f"# DATA (all modules, condensed)\n```json\n{report_service._kbytes(combined, cap=6000)}\n```\n\n"
                    "Write the Overall Summary integrating every module above."
                )
                try:
                    chat = LlmChat(api_key=api_key, session_id=uuid.uuid4().hex,
                                   system_message=OVERALL_INTERPRET_SYSTEM).with_model("anthropic", payload.model)
                    resp = await asyncio.wait_for(chat.send_message(UserMessage(text=prompt)), timeout=45.0)
                    overall = str(resp).strip() or None
                except Exception as e:
                    overall = f"Overall summary unavailable ({str(e)[:80]})."

        return {"per_module": per_module, "overall": overall, "model": f"anthropic/{payload.model}"}

    @router.get("/report/download/{report_id}")
    async def report_download(report_id: str, fmt: str = "md"):
        rec = cache.get(report_id)
        if not rec:
            raise HTTPException(status_code=404, detail="Report not found or expired")
        md = rec["markdown"]
        title = rec.get("meta", {}).get("plant") or "PhytoNet AI Report"
        if fmt == "md":
            return Response(content=md, media_type="text/markdown",
                            headers={"Content-Disposition": "attachment; filename=report.md"})
        if fmt == "html":
            html = report_service.markdown_to_html(md, title=f"{title} — Research Report")
            return Response(content=html, media_type="text/html",
                            headers={"Content-Disposition": "attachment; filename=report.html"})
        if fmt == "pdf":
            html = report_service.markdown_to_html(md, title=f"{title} — Research Report")
            pdf = report_service.html_to_pdf(html)
            return Response(content=pdf, media_type="application/pdf",
                            headers={"Content-Disposition": "attachment; filename=report.pdf"})
        if fmt == "docx":
            docx_bytes = report_service.markdown_to_docx(md, title=f"{title} — Research Report")
            return Response(content=docx_bytes,
                            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            headers={"Content-Disposition": "attachment; filename=report.docx"})
        raise HTTPException(status_code=400, detail=f"Unsupported format {fmt}")

    return router
