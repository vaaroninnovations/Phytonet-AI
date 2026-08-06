"""AI Research Assistant — planner + tool registry + executor.

The Research Assistant is an orchestration layer ONLY. It never fabricates
scientific results — every result comes from an existing backend endpoint
invoked here as an HTTP call to the running FastAPI service.

Public surface
──────────────
  plan(prompt, history, context) → ExecutionPlan
      Ask Claude Sonnet 4.5 (via Emergent LLM Key) to translate a natural
      language prompt into a structured JSON plan referencing tools in the
      TOOL_REGISTRY.

  interpret(plan, results) → str
      A short scientific interpretation paragraph based on tool outputs.

  execute_step(step, project_ctx) → dict
      Dispatch a plan step by calling its tool with the given arguments.

Tool registry
─────────────
Each tool is a coroutine `async def _tool(**kwargs) -> dict` that returns
{status: "ok" | "error", data: <structured JSON>, message: str}. Tools call
the local FastAPI endpoints via httpx.AsyncClient so they respect the same
caching, rate-limits, and DB writes as the standalone modules.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Tool registry — thin wrappers around existing /api endpoints
# ═══════════════════════════════════════════════════════════════
INTERNAL_BASE = os.environ.get("INTERNAL_API_BASE", "http://localhost:8001")


async def _get(path: str, params: dict | None = None, timeout: float = 90.0) -> dict:
    async with httpx.AsyncClient(base_url=INTERNAL_BASE, timeout=timeout) as c:
        r = await c.get(path, params=params or {})
        r.raise_for_status()
        return r.json()


async def _post(path: str, json_body: dict | None = None, timeout: float = 120.0) -> dict:
    async with httpx.AsyncClient(base_url=INTERNAL_BASE, timeout=timeout) as c:
        r = await c.post(path, json=json_body or {})
        r.raise_for_status()
        return r.json()


async def _noop_progress(stage: str, detail: str = "") -> None:
    return None


async def tool_plant_search(query: str, limit: int = 200,
                             progress=_noop_progress, **_) -> dict:
    # Match the standalone Plant Database defaults so the AI Assistant
    # returns the same compound count as the manual page. `want_structure`
    # and `want_physchem` widen the backend response.
    await progress("querying", f"Querying IMPPAT for '{query}'…")
    data = await _get("/api/plant/search", {
        "plant": query,
        "limit": max(1, min(int(limit), 500)),
        "want_structure": "true",
        "want_physchem":  "true",
    }, timeout=180.0)
    compounds = data if isinstance(data, list) else data.get("compounds", []) or []
    await progress("merging",
                   f"Merging with LOTUS + PubChem, removing duplicates…")
    await progress("standardizing",
                   f"Standardizing structures across sources…")
    await progress("building",
                   f"Building compound table ({len(compounds)} rows)…")
    return {"status": "ok",
            "card": "compound_table",
            "message": f"Retrieved {len(compounds)} compounds for '{query}' "
                       f"from IMPPAT + LOTUS + PubChem.",
            "data":    {"query": query, "compounds": compounds}}


async def tool_lotus_search(query: str, limit: int = 25,
                             progress=_noop_progress, **_) -> dict:
    await progress("querying", f"Querying LOTUS for '{query}'…")
    data = await _get("/api/lotus/simple", {"query": query, "limit": limit})
    hits = data if isinstance(data, list) else data.get("compounds", []) or []
    await progress("building", f"Building compound table ({len(hits)} rows)…")
    return {"status": "ok",
            "card": "compound_table",
            "message": f"LOTUS returned {len(hits)} compounds for '{query}'.",
            "data": {"query": query, "compounds": hits[:limit]}}


async def tool_compound_lookup(compound: str,
                                progress=_noop_progress, **_) -> dict:
    """Look up a compound by name or SMILES → PubChem/ChEBI details."""
    key = "smiles" if any(c in compound for c in "()=[]#@\\/") else "name"
    await progress("resolving",
                   f"Resolving '{compound}' via PubChem + ChEBI…")
    data = await _get("/api/compound/lookup", {key: compound})
    return {"status": "ok",
            "card": "compound_details",
            "message": f"Resolved '{compound}' — PubChem CID "
                       f"{data.get('pubchem_cid') or 'n/a'}.",
            "data": data}


async def tool_target_predict(smiles: list[str] | str | None = None,
                               compounds: list[dict] | None = None,
                               progress=_noop_progress, **_) -> dict:
    """Predict protein targets FOR a set of compounds via ChEMBL similarity +
    SwissTargetPrediction. Accepts the same shape as admet_predict so it can
    chain from a plant_search result."""
    payload_compounds: list[dict] = []
    if compounds:
        for c in compounds:
            if not isinstance(c, dict):
                continue
            smi = (c.get("canonical_smiles") or c.get("smiles") or "").strip()
            if smi:
                payload_compounds.append({
                    "smiles": smi,
                    "canonical_smiles": smi,
                    "compound_name": c.get("compound_name") or c.get("name"),
                    "molecular_formula": c.get("molecular_formula"),
                    "molecular_weight": c.get("molecular_weight"),
                })
    else:
        smi_list = [smiles] if isinstance(smiles, str) else list(smiles or [])
        for s in smi_list:
            s = (s or "").strip()
            if s:
                payload_compounds.append({"smiles": s, "canonical_smiles": s})

    if not payload_compounds:
        return {"status": "error",
                "message": "Target prediction needs at least one compound. "
                           "Provide `smiles` (str or list) or `compounds` "
                           "(list of {smiles, ...})."}

    await progress("submitting",
                   f"Submitting {len(payload_compounds)} compound(s) to the "
                   f"target-prediction pipeline…")
    job = await _post("/api/target/predict", {"compounds": payload_compounds})
    job_id = job.get("job_id")
    total  = job.get("total", len(payload_compounds))
    if not job_id:
        return {"status": "error",
                "message": "Target-prediction job did not return an id."}
    await progress("running",
                   f"Querying ChEMBL + SwissTargetPrediction "
                   f"(0/{total} compounds)…")

    import asyncio
    for _ in range(150):
        s = await _get(f"/api/target/status/{job_id}")
        st = (s.get("status") or "").lower()
        done_ct = s.get("done") or 0
        if done_ct:
            await progress("running",
                           f"Ranking targets by similarity ({done_ct}/{total})…")
        if st in ("done", "success", "completed"):
            await progress("finalizing",
                           "Aggregating unique targets, sorting by score…")
            rows = s.get("rows") or []
            # Build a small compound → target graph for Cytoscape
            comp_nodes: dict = {}
            tgt_nodes: dict = {}
            edges = []
            for r in rows:
                cn = (r.get("compound_name") or r.get("query_compound")
                      or (r.get("smiles") or "")[:20] or "?")
                gs = (r.get("gene_symbol") or r.get("gene") or r.get("symbol"))
                if not gs:
                    continue
                comp_nodes[cn] = True
                tgt_nodes[gs] = tgt_nodes.get(gs, 0) + 1
                edges.append({"source": cn, "target": gs,
                              "score": r.get("score") or r.get("similarity")})
            network = {
                "nodes": [{"id": c, "label": c, "type": "compound"}
                          for c in comp_nodes]
                        + [{"id": g, "label": g, "type": "target",
                            "degree": deg} for g, deg in tgt_nodes.items()],
                "edges": edges,
            }
            return {"status": "ok",
                    "card": "target_table",
                    "message": f"Target prediction complete — {len(rows)} "
                               f"compound-target predictions across "
                               f"{len(tgt_nodes)} unique targets.",
                    "data": {"job_id": job_id, "total": total,
                             "targets": rows,
                             "network": network}}
        if st in ("error", "failed"):
            return {"status": "error",
                    "message": s.get("error") or "Target-prediction job failed."}
        await asyncio.sleep(2)
    return {"status": "error",
            "message": "Target-prediction job timed out after 5 minutes."}


async def tool_target_resolve(query: str,
                               progress=_noop_progress, **_) -> dict:
    """Resolve a protein target (gene symbol / uniprot) to full annotation."""
    await progress("resolving",
                   f"Resolving target '{query}' via UniProt + ChEMBL…")
    data = await _get("/api/target/resolve", {"query": query})
    return {"status": "ok",
            "card": "target_details",
            "message": f"Resolved target '{query}' → {data.get('uniprot_id') or 'n/a'}.",
            "data": data}


async def tool_disease_search(query: str,
                               progress=_noop_progress, **_) -> dict:
    await progress("querying",
                   f"Searching Open Targets + DisGeNET for '{query}'…")
    # Endpoint expects `q`, not `query`, and returns {"query", "hits"}.
    data = await _get("/api/disease/search", {"q": query})
    if isinstance(data, list):
        hits = data
    else:
        hits = data.get("hits") or data.get("results") or []
    await progress("building", f"Building disease table ({len(hits)} rows)…")
    return {"status": "ok",
            "card": "disease_table",
            "message": f"Found {len(hits)} matching diseases for '{query}'.",
            "data": {"query": query, "hits": hits}}


async def tool_pathway_enrichment(genes: list | None = None,
                                    library: str = "KEGG_2021_Human",
                                    progress=_noop_progress, **_) -> dict:
    """Run KEGG + GO pathway enrichment on a gene list. Auto-chains from a
    prior target_predict / target_resolve step."""
    # Coerce whatever the planner passes into a list of clean HGNC symbols.
    def _sym(item):
        if isinstance(item, str):
            return item.strip().upper()
        if isinstance(item, dict):
            for k in ("gene", "gene_symbol", "symbol", "hgnc_symbol", "name"):
                v = item.get(k)
                if isinstance(v, str) and v.strip():
                    return v.strip().upper()
        return ""
    seen: set[str] = set()
    gene_list: list[str] = []
    for g in (genes or []):
        s = _sym(g)
        if s and s not in seen:
            seen.add(s); gene_list.append(s)

    if not gene_list:
        return {"status": "error",
                "message": ("Enrichment needs a list of gene symbols "
                            "(e.g. ['AKT1','EGFR']). Run target_predict or "
                            "target_resolve first so the assistant can "
                            "auto-chain the gene list.")}
    await progress("querying",
                   f"Running Enrichr KEGG on {len(gene_list)} genes…")
    kegg = await _post("/api/kegg/enrich",
                       {"genes": gene_list, "library": library})
    await progress("querying",
                   f"Running g:Profiler GO / Reactome enrichment…")
    go = await _post("/api/go/enrich",
                     {"genes": gene_list, "organism": "hsapiens",
                      "sources": ["GO:BP", "REAC", "KEGG", "WP"],
                      "user_threshold": 0.05,
                      "significance_method": "g_SCS"})
    def _extract_rows(resp):
        if isinstance(resp, list):
            return resp
        if isinstance(resp, dict):
            for k in ("pathways", "terms", "results", "rows"):
                if isinstance(resp.get(k), list):
                    return resp[k]
        return []
    kegg_rows = _extract_rows(kegg)[:200]
    go_rows   = _extract_rows(go)[:200]
    await progress("finalizing",
                   f"Aggregated {len(kegg_rows)} KEGG + {len(go_rows)} GO terms.")
    return {"status": "ok",
            "card": "enrichment_table",
            "message": (f"Enriched pathways across {len(gene_list)} genes — "
                        f"{len(kegg_rows)} KEGG hits, {len(go_rows)} GO/Reactome hits."),
            "data": {"genes": gene_list,
                     "kegg": kegg_rows,
                     "go":   go_rows}}


async def tool_disease_targets(disease_id: str, limit: int = 30,
                                genes: list[str] | None = None,
                                progress=_noop_progress, **_) -> dict:
    """Get the gene panel for a disease. If `genes` is supplied (e.g. from a
    prior target_predict step), the response is FILTERED to just the overlap
    — showing which of the predicted compound-targets are already disease-
    associated. That's the "target → disease chain" the researcher usually
    wants."""
    await progress("querying",
                   f"Fetching gene panel for disease {disease_id}…")
    # Fetch a wider panel so we can find overlaps even when only a few match
    fetch_limit = 500 if genes else limit
    # The backend endpoint expects `efo_id`; accept either name for input.
    data = await _get("/api/disease/targets",
                      {"efo_id": disease_id, "limit": fetch_limit})
    targets = data if isinstance(data, list) else data.get("targets", []) or []
    await progress("scoring",
                   f"Scoring evidence across Open Targets + CTD…")

    if genes:
        # Normalise the caller's predicted gene list.
        pred_syms: list[str] = []
        seen: set[str] = set()
        for g in (genes or []):
            s = (g or "").strip().upper() if isinstance(g, str) else \
                (g.get("gene") or g.get("gene_symbol") or g.get("symbol") or "").strip().upper() \
                if isinstance(g, dict) else ""
            if s and s not in seen:
                seen.add(s); pred_syms.append(s)

        disease_syms: list[str] = []
        seen_d: set[str] = set()
        for t in targets:
            g = (t.get("gene") or t.get("gene_symbol") or t.get("symbol") or "").strip().upper()
            if g and g not in seen_d:
                seen_d.add(g); disease_syms.append(g)

        common = [g for g in pred_syms if g in seen_d]
        predicted_only = [g for g in pred_syms if g not in seen_d]
        disease_only   = [g for g in disease_syms if g not in seen]  # not in predicted

        overlap_rows = [t for t in targets
                        if (t.get("gene") or t.get("gene_symbol")
                            or t.get("symbol") or "").strip().upper() in seen]
        await progress("intersecting",
                       f"Intersecting {len(pred_syms)} predicted targets "
                       f"with {len(disease_syms)} disease genes → {len(common)} hits.")
        disease_name = (data.get("disease_name") if isinstance(data, dict) else None) \
                        or disease_id
        return {"status": "ok",
                "card": "intersection_venn",
                "message": (f"{len(common)} common gene(s) between your predicted "
                            f"targets and {disease_name} "
                            f"({len(pred_syms)} predicted · {len(disease_syms)} disease-linked)."),
                "data": {"disease_id":              disease_id,
                         "disease_name":            disease_name,
                         "predicted_gene_symbols":  pred_syms,
                         "disease_gene_symbols":    disease_syms[:500],
                         "common":                  common,
                         "predicted_only":          predicted_only,
                         "disease_only":            disease_only[:500],
                         "targets":                 overlap_rows[:limit]}}

    await progress("building", f"Building target table ({len(targets)} rows)…")
    return {"status": "ok",
            "card": "target_table",
            "message": f"Retrieved {len(targets)} disease-associated targets.",
            "data": {"disease_id": disease_id, "targets": targets[:limit]}}


async def tool_admet_predict(smiles: list[str] | str | None = None,
                              compounds: list[dict] | None = None,
                              progress=_noop_progress,
                              **_) -> dict:
    """Predict ADMET for a list of SMILES OR a list of compound dicts.
    Accepts either shape so Claude can chain a plant_search result into it."""
    # Normalize input into the shape expected by /api/admet/predict.
    # No hard truncation — ADMET runs across the entire supplied set, just
    # like the standalone Drug-Likeness page.
    payload_compounds: list[dict] = []
    if compounds:
        for c in compounds:
            if not isinstance(c, dict):
                continue
            smi = ((c.get("canonical_smiles") or c.get("smiles") or "")
                   if isinstance(c, dict) else "")
            if smi:
                payload_compounds.append({
                    "smiles": smi,
                    "compound_name": c.get("compound_name") or c.get("name"),
                    "molecular_weight": c.get("molecular_weight"),
                    "molecular_formula": c.get("molecular_formula"),
                    "source": c.get("source"),
                })
    else:
        smi_list = [smiles] if isinstance(smiles, str) else list(smiles or [])
        for s in smi_list:
            s = (s or "").strip()
            if s:
                payload_compounds.append({"smiles": s})

    if not payload_compounds:
        return {"status": "error",
                "message": "ADMET needs at least one SMILES. Provide `smiles` "
                           "(str or list) or `compounds` (list of {smiles, ...})."}

    await progress("submitting",
                   f"Submitting {len(payload_compounds)} compound(s) to the "
                   f"ADMET model…")
    job = await _post("/api/admet/predict", {"compounds": payload_compounds})
    job_id = job.get("job_id")
    total  = job.get("total", len(payload_compounds))
    if not job_id:
        return {"status": "error",
                "message": "ADMET job did not return an id. "
                           "Model may still be warming up."}
    await progress("running",
                   f"Running physchem + drug-likeness + ADMET models "
                   f"(0/{total} compounds)…")
    # Poll for up to 5 minutes (ADMET model is compute-intensive on cold start)
    import asyncio
    for i in range(150):
        s = await _get(f"/api/admet/status/{job_id}")
        st = (s.get("status") or "").lower()
        done_ct = s.get("done") or s.get("completed") or 0
        if done_ct and total:
            await progress("running",
                           f"Predicting properties ({done_ct}/{total})…")
        if st in ("done", "success", "completed"):
            await progress("finalizing",
                           f"Flattening physchem / drug-likeness / ADMET "
                           f"columns and building table…")
            rows_raw = s.get("compounds") or []
            # Flatten physchem / druglikeness / admet nested dicts so the UI's
            # simple key-based column renderers work AND every raw property is
            # available in the CSV/Excel/JSON export — matches the standalone
            # ADMET page's Excel dump byte-for-byte at the row level.
            def _flat(r: dict) -> dict:
                out = {k: r.get(k) for k in ("smiles", "compound_name",
                                             "molecular_formula",
                                             "molecular_weight", "source")}
                for section in ("physchem", "druglikeness", "admet"):
                    for k, v in (r.get(section) or {}).items():
                        # Prefer bare key when it doesn't clash; otherwise
                        # namespace it (e.g. "druglikeness.lipinski_pass").
                        if k not in out or out.get(k) is None:
                            out[k] = v
                        else:
                            out[f"{section}.{k}"] = v
                return out

            rows = [_flat(r) for r in rows_raw]
            return {"status": "ok",
                    "card": "admet_table",
                    "message": f"ADMET prediction complete for "
                               f"{len(rows)} compound(s). "
                               f"Every physchem / drug-likeness / ADMET field "
                               f"available in the CSV / Excel export.",
                    "data": {"job_id": job_id,
                             "total": total,
                             "results": rows,
                             "raw":     rows_raw}}
        if st in ("error", "failed"):
            return {"status": "error",
                    "message": s.get("error") or "ADMET job failed."}
        await asyncio.sleep(2)
    return {"status": "error",
            "message": "ADMET job timed out after 5 minutes."}


TOOL_REGISTRY: dict[str, dict[str, Any]] = {
    "plant_search":     {"fn": tool_plant_search,
                         "desc": "Search medicinal plants for their full "
                                 "phytochemical catalogue (IMPPAT + LOTUS + "
                                 "PubChem). ALWAYS use limit=200 unless the "
                                 "user asks for a smaller subset. "
                                 "Args: {query: str, limit?: int (default 200, max 500)}."},
    "lotus_search":     {"fn": tool_lotus_search,
                         "desc": "Search LOTUS natural-product database by "
                                 "compound name. Args: {query: str, limit?: int}."},
    "compound_lookup":  {"fn": tool_compound_lookup,
                         "desc": "Look up a compound by name or SMILES "
                                 "→ PubChem CID + ChEBI. Args: {compound: str}."},
    "target_predict":   {"fn": tool_target_predict,
                         "desc": "Predict protein targets FOR a set of "
                                 "compounds via ChEMBL similarity + Swiss"
                                 "TargetPrediction. Provide `smiles` (single "
                                 "string OR list) OR `compounds` (list of "
                                 "{smiles, compound_name, ...}). Chains from "
                                 "plant_search naturally."},
    "target_resolve":   {"fn": tool_target_resolve,
                         "desc": "Resolve a protein target (gene symbol / "
                                 "UniProt) → full annotation. Args: {query: str}."},
    "disease_search":   {"fn": tool_disease_search,
                         "desc": "Search DisGeNET / Open Targets for a "
                                 "disease. Args: {query: str}."},
    "pathway_enrichment": {"fn": tool_pathway_enrichment,
                            "desc": "KEGG + GO / Reactome pathway enrichment "
                                    "for a gene list via Enrichr + g:Profiler. "
                                    "Chains from a prior target_predict / "
                                    "target_resolve step. Args: {genes?: "
                                    "list[str], library?: str}."},
    "disease_targets":  {"fn": tool_disease_targets,
                         "desc": "Get disease-associated gene panel. When a "
                                 "prior target_predict step exists, pass "
                                 "`genes: \"$prev.targets\"` to intersect — "
                                 "returning ONLY predicted targets that are "
                                 "also disease genes. Args: {disease_id: str, "
                                 "limit?: int, genes?: list[str]}."},
    "admet_predict":    {"fn": tool_admet_predict,
                         "desc": "Predict ADMET + drug-likeness (RDKit-derived "
                                 "physchem, Ro5, QED, permeability, toxicity). "
                                 "Provide `smiles` (single string OR list) for "
                                 "standalone use, OR `compounds` (list of "
                                 "{smiles, compound_name, molecular_weight, "
                                 "source, ...} dicts) when chaining from a "
                                 "previous plant_search result."},
}


# ═══════════════════════════════════════════════════════════════
# Claude Planner
# ═══════════════════════════════════════════════════════════════
_MODEL_PROVIDER = "anthropic"
_MODEL_NAME     = "claude-sonnet-4-5-20250929"

_SYSTEM_PLANNER = f"""You are the PhytoNet AI Research Assistant — a workflow \
orchestrator for computational network pharmacology. You NEVER fabricate \
scientific results. Every result must come from calling one of these tools:

{chr(10).join(f'  • {name}: {t["desc"]}' for name, t in TOOL_REGISTRY.items())}

RULES
─────
1. Analyse the user's message + prior conversation. Decide whether:
   a) You have enough information to build an execution plan (respond mode=plan)
   b) You need one clarifying question (respond mode=followup)
   c) The request is conversational and no tool is needed (respond mode=chat)
2. Plans must be minimal and ordered. Only include steps that answer the \
question. Do not over-plan.
3. Reference tools ONLY by the exact names above. Never invent a tool.
4. Arguments must match the tool signature. Where the user has already given \
values in earlier messages, reuse them without re-asking.
5. Never mention that you are calling APIs, backend services or tools by name \
in your `interpretation`. Speak like a research scientist.

CHAINING RESULTS BETWEEN STEPS
──────────────────────────────
To feed the output of an earlier step into a later one, use a placeholder \
string starting with `$`:

  "$prev.compounds"           → the `data.compounds` array from the most \
recent SUCCESSFUL step
  "$prev.compounds[:25]"      → first 25 items (Python slice syntax)
  "$step_1.compounds[:50]"    → items from a specific step (matched by step id)
  "$prev.targets"             → the `data.targets` array from a target step
  "$prev.hits"                → the `data.hits` array from a disease search

DO NOT use `{{...}}` Jinja templates. Use only the `$name.field` syntax above.

FOLLOW-UP PROMPTS ACROSS TURNS
──────────────────────────────
If the user says "now run ADMET on the top 25" AFTER a prior plant search \
already completed in an earlier message, you MAY still use `$prev.compounds` \
— the executor falls back to the previous completed run's compound list. \
BUT to be safe, if the prior step's data isn't guaranteed, ALWAYS include a \
plant_search step FIRST in the same plan and chain from it. Never emit a \
single-step admet_predict whose only source is `$prev` unless you are \
certain a prior run has compounds ready.

TYPICAL CHAINS
──────────────
User: "Show me phytochemicals from Withania somnifera and run ADMET on the top 25."
Plan:
  step_1  plant_search      {{"query": "Withania somnifera", "limit": 200}}
  step_2  admet_predict     {{"compounds": "$step_1.compounds[:25]"}}

User: "Find compounds in Ashwagandha and check drug-likeness for all of them."
Plan:
  step_1  plant_search      {{"query": "Ashwagandha", "limit": 200}}
  step_2  admet_predict     {{"compounds": "$prev.compounds"}}

User: "Predict protein targets for phytochemicals of Curcuma longa."
Plan:
  step_1  plant_search      {{"query": "Curcuma longa", "limit": 200}}
  step_2  target_predict    {{"compounds": "$prev.compounds"}}

User: "Map the predicted targets to Type 2 diabetes."
Plan:
  step_1  disease_search    {{"query": "Type 2 diabetes"}}
  step_2  disease_targets   {{"disease_id": "$step_1.hits[0].id"}}
  (the executor auto-injects `genes` from the most recent target_predict)

User: "Study anti-inflammatory potential of Withania somnifera."
Plan:
  step_1  plant_search      {{"query": "Withania somnifera", "limit": 200}}
  step_2  target_predict    {{"compounds": "$step_1.compounds"}}
  step_3  disease_search    {{"query": "inflammation"}}
  step_4  disease_targets   {{"disease_id": "$step_3.hits[0].id"}}
  step_5  admet_predict     {{"compounds": "$step_1.compounds"}}

User (follow-up on an existing project): "Now run ADMET on the top 25."
Plan (SAFEST):
  step_1  plant_search      {{"query": "<plant from earlier turn>", "limit": 200}}
  step_2  admet_predict     {{"compounds": "$step_1.compounds[:25]"}}

DEFAULT LIMITS
──────────────
• plant_search: default limit=200 (returns 100-200 compounds per plant).
• admet_predict: run across ALL compounds produced by the previous step \
by default (matches the standalone Drug-Likeness page's behaviour). Only \
slice with `[:N]` if the user EXPLICITLY asks for a top-N subset.
• target_predict: same rule — all compounds by default, respect explicit \
top-N slicing from the user.

HARD RULES FOR admet_predict AND target_predict
───────────────────────────────────────────────
• You MUST NEVER emit an admet_predict or target_predict step whose `args` \
is empty or whose compound source cannot be traced to (a) an earlier step \
in the SAME plan, (b) a prior completed run in the SAME conversation, or \
(c) explicit SMILES provided by the user. Prefer inserting a plant_search \
step in the same plan when in doubt.
• target_resolve is DIFFERENT from target_predict — use target_resolve when \
the user names a specific protein (e.g. "resolve AKT1") and target_predict \
when the user asks which targets a compound might bind.

OUTPUT FORMAT
─────────────
Return ONLY a JSON object matching this exact schema — no prose before or \
after, no code fences:

{{
  "mode": "plan" | "followup" | "chat",
  "title": "Short 3-6 word title for the plan",
  "reasoning": "One-sentence justification (<=140 chars).",
  "followup_question": "Only if mode=followup. Concise, single question.",
  "reply": "Only if mode=chat. Short conversational reply.",
  "plan": [
    {{
      "id": "step_1",
      "tool": "plant_search",
      "label": "Retrieve phytochemicals from Withania somnifera",
      "args": {{"query": "Withania somnifera", "limit": 200}}
    }},
    {{
      "id": "step_2",
      "tool": "admet_predict",
      "label": "Predict ADMET for the top 25 compounds",
      "args": {{"compounds": "$step_1.compounds[:25]"}}
    }}
  ]
}}
"""


_SYSTEM_INTERPRETER = """You are a research scientist writing a concise \
scientific interpretation of a completed workflow. Given the plan and its \
raw tool outputs, produce a short natural-language summary (3-6 sentences) \
that highlights the key numeric findings, cites the source databases named \
in the tool outputs, and suggests one logical next step. Do NOT invent data. \
Do NOT mention 'tools', 'API', 'plan', or 'JSON'. Speak like a scientist \
briefing a colleague."""


_SYSTEM_NEXT_STEPS = """You are a research strategist. Given a completed \
computational pharmacology workflow (its plan + raw tool outputs), propose \
EXACTLY 3-4 useful next actions the researcher could take.

RULES
─────
1. Each suggestion is a SHORT natural-language prompt the user could paste \
into the chat as their next message — start with an imperative verb.
2. Suggestions must be actionable against the available modules \
(plant_search, target_resolve, disease_search, disease_targets, admet_predict, \
compound_lookup, lotus_search). Do NOT suggest anything not in that set.
3. Reference specific entities returned by the run (a compound name, a target, \
a disease) whenever possible so the suggestion feels personalised.
4. Keep each suggestion under 90 characters.
5. Return ONLY a JSON array of strings — no prose, no code fences.

Example:
  ["Predict targets for the top 5 Withanolides", "Identify inflammation-related targets", "Run ADMET on the top-QED compounds", "Compare Withania somnifera with Withania coagulans"]"""


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY missing in environment")
    return key


def _new_chat(session_id: str, system: str) -> LlmChat:
    return LlmChat(
        api_key=_emergent_key(),
        session_id=session_id,
        system_message=system,
    ).with_model(_MODEL_PROVIDER, _MODEL_NAME)


async def plan(prompt: str, history: list[dict], project_id: str,
               attachments: list[dict] | None = None) -> dict:
    """Ask Claude to produce a plan for the user's request.
    `history` is a list of prior {role, content} messages within the same
    project — used verbatim as extra context.
    """
    chat = _new_chat(f"research:{project_id}:planner", _SYSTEM_PLANNER)
    # Fold history into the user message so the planner sees continuity.
    lines: list[str] = []
    for msg in history[-10:]:
        role = msg.get("role", "user").upper()
        content = (msg.get("text") or msg.get("content") or "").strip()
        if content:
            lines.append(f"[{role}] {content}")
    if attachments:
        lines.append(f"[USER-ATTACHMENTS] {json.dumps(attachments)[:800]}")
    lines.append(f"[USER] {prompt.strip()}")

    resp = await chat.send_message(UserMessage(text="\n".join(lines)))
    parsed = _parse_json_response(resp)
    # Sanitize plan steps
    steps = []
    for i, step in enumerate(parsed.get("plan", []) or []):
        tool = step.get("tool")
        if tool not in TOOL_REGISTRY:
            continue
        steps.append({
            "id":    step.get("id") or f"step_{i+1}",
            "tool":  tool,
            "label": step.get("label") or tool.replace("_", " ").title(),
            "args":  step.get("args") or {},
            "status": "pending",
        })
    parsed["plan"] = steps
    return parsed


async def interpret(plan: dict, results: list[dict], project_id: str) -> str:
    chat = _new_chat(f"research:{project_id}:interp", _SYSTEM_INTERPRETER)
    payload = {
        "title": plan.get("title"),
        "reasoning": plan.get("reasoning"),
        "steps": [{"label": s.get("label"), "tool": s.get("tool")} for s in plan.get("plan", [])],
        "results": [{
            "label":  r.get("label"),
            "status": r.get("status"),
            "summary": (r.get("result") or {}).get("message"),
            "data_preview": _preview((r.get("result") or {}).get("data")),
        } for r in results],
    }
    try:
        resp = await chat.send_message(UserMessage(
            text=json.dumps(payload, default=str)[:8000]
        ))
        return resp.strip()
    except Exception as e:
        logger.warning(f"[research] interpretation failed: {e}")
        return "Workflow complete. See the results panel for details."


async def interpret_stream(plan: dict, results: list[dict], project_id: str):
    """Stream the scientific interpretation token-by-token so the frontend
    can render it progressively (via /status polling reading the run's
    interpretation field as it grows). Yields plain-text deltas."""
    chat = _new_chat(f"research:{project_id}:interp", _SYSTEM_INTERPRETER)
    payload = {
        "title": plan.get("title"),
        "reasoning": plan.get("reasoning"),
        "steps":  [{"label": s.get("label"), "tool": s.get("tool")}
                   for s in plan.get("plan", [])],
        "results": [{
            "label":       r.get("label"),
            "status":      r.get("status"),
            "summary":     (r.get("result") or {}).get("message"),
            "data_preview": _preview((r.get("result") or {}).get("data")),
        } for r in results],
    }
    try:
        # Local import to avoid a hard dependency at module load.
        from emergentintegrations.llm.chat import TextDelta
        stream = chat.stream_message(UserMessage(
            text=json.dumps(payload, default=str)[:8000]
        ))
        async for evt in stream:
            if isinstance(evt, TextDelta) and evt.content:
                yield evt.content
    except Exception as e:
        logger.warning(f"[research] interpretation stream failed: {e}")
        yield "Workflow complete. See the results panel for details."


async def suggest_next_steps(plan: dict, results: list[dict],
                              project_id: str) -> list[str]:
    """Ask Claude for 3-4 personalised next-step prompts based on what just
    ran. Return an empty list on any failure — this is a UX nicety, not
    critical to the workflow."""
    chat = _new_chat(f"research:{project_id}:next", _SYSTEM_NEXT_STEPS)
    payload = {
        "title":  plan.get("title"),
        "steps":  [{"tool": s.get("tool"), "label": s.get("label")}
                   for s in (plan.get("plan") or [])],
        "results": [{
            "tool":  r.get("tool"),
            "status": r.get("status"),
            "summary": (r.get("result") or {}).get("message"),
            "data_preview": _preview((r.get("result") or {}).get("data")),
        } for r in results],
    }
    try:
        resp = await chat.send_message(UserMessage(
            text=json.dumps(payload, default=str)[:8000]
        ))
        parsed = _parse_json_response(resp)
        if isinstance(parsed, list):
            suggestions = parsed
        elif isinstance(parsed, dict):
            # Some Claude responses wrap in {suggestions: [...]}
            for k in ("suggestions", "next_steps", "actions"):
                if isinstance(parsed.get(k), list):
                    suggestions = parsed[k]
                    break
            else:
                suggestions = []
        else:
            suggestions = []
        # Sanitize — keep only clean strings, cap length
        out = []
        for s in suggestions[:4]:
            if isinstance(s, str) and 4 <= len(s.strip()) <= 140:
                out.append(s.strip())
        return out
    except Exception as e:
        logger.warning(f"[research] next-steps failed: {e}")
        return []


def _preview(data: Any) -> Any:
    """Trim large payloads before feeding them into the interpreter prompt."""
    if isinstance(data, list):
        return data[:5]
    if isinstance(data, dict):
        out = {}
        for k, v in list(data.items())[:6]:
            out[k] = v[:5] if isinstance(v, list) else v
        return out
    return data


def _parse_json_response(text: str) -> dict:
    """Claude sometimes wraps JSON in ```json fences — strip them robustly."""
    if not text:
        return {"mode": "chat", "reply": "I couldn't produce a response."}
    t = text.strip()
    # Strip ```json ... ``` fences (with or without the `json` label)
    if t.startswith("```"):
        # Drop the opening fence line
        t = t.split("\n", 1)[1] if "\n" in t else t[3:]
        # Drop the closing fence
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
        t = t.strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        # Attempt to extract the first {...} block
        start = t.find("{"); end = t.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(t[start:end + 1])
            except Exception:
                pass
        logger.warning(f"[research] planner returned non-JSON: {text[:200]!r}")
        return {"mode": "chat", "reply": text[:800]}


async def execute_step(step: dict,
                       prior_results: list[dict] | None = None,
                       project_context: list[dict] | None = None,
                       progress=None) -> dict:
    tool_name = step.get("tool")
    entry = TOOL_REGISTRY.get(tool_name)
    if not entry:
        return {"status": "error", "message": f"Unknown tool: {tool_name}"}
    fn = entry["fn"]
    args = resolve_args(step.get("args") or {},
                        prior_results or [], project_context or [])

    # ── Defensive auto-injection for compound-driven tools ────────
    # If Claude planned admet_predict or target_predict without SMILES
    # (e.g. user asked as a follow-up "now run ADMET" or "predict targets
    # for these compounds"), scan every source for compounds and inject
    # the most recent list automatically. Matches how the standalone
    # linear workflow chains outputs → inputs across turns.
    if tool_name in ("admet_predict", "target_predict") and not (
            args.get("compounds") or args.get("smiles")):
        found = _auto_pick_compounds(prior_results or [], project_context or [])
        if found:
            args["compounds"] = found
            logger.info(f"[research] {tool_name} auto-injected "
                        f"{len(found)} compounds from project context")

    # ── Disease chain: target_predict → disease_targets ───────────
    # If disease_targets is called with a disease_id but no `genes` filter,
    # auto-inject the gene list from the most recent target_predict /
    # target_resolve step so the response is intersected — showing the
    # overlap between predicted targets and disease-associated genes.
    if tool_name == "disease_targets" and args.get("disease_id") and not args.get("genes"):
        genes = _auto_pick_genes(prior_results or [], project_context or [])
        if genes:
            args["genes"] = genes
            logger.info(f"[research] disease_targets auto-injected "
                        f"{len(genes)} genes from prior target step")

    # ── Enrichment chain: target_predict → pathway_enrichment ─────
    # Fire even if the planner *did* pass `genes` when those items don't
    # normalize to any HGNC symbols (e.g. it passed target objects
    # verbatim). We test the payload via the same coercion tool_pathway_
    # enrichment uses.
    if tool_name == "pathway_enrichment":
        supplied = args.get("genes") or []
        cleaned = [g for g in supplied
                    if (isinstance(g, str) and g.strip())
                       or (isinstance(g, dict) and any(
                            isinstance(g.get(k), str) and g[k].strip()
                            for k in ("gene", "gene_symbol", "symbol",
                                      "hgnc_symbol", "name")))]
        if not cleaned:
            genes = _auto_pick_genes(prior_results or [], project_context or [])
            if genes:
                args["genes"] = genes
                logger.info(f"[research] pathway_enrichment auto-injected "
                            f"{len(genes)} genes")

    # Wire live progress callback into the tool call so stage-by-stage
    # sub-status is persisted for the frontend poller to display.
    if progress is not None:
        args["progress"] = progress

    try:
        return await fn(**args)
    except httpx.HTTPStatusError as e:
        detail = ""
        try:
            detail = e.response.json().get("detail", "")
        except Exception:
            detail = e.response.text[:200]
        return {"status": "error",
                "message": f"{tool_name} HTTP {e.response.status_code}: {detail}"}
    except Exception as e:
        logger.exception(f"[research] tool {tool_name} error")
        return {"status": "error", "message": f"{tool_name}: {e}"}


def _auto_pick_compounds(prior_results: list[dict],
                         project_context: list[dict],
                         limit: int | None = None) -> list[dict]:
    """Return the compound list from anywhere we know about — full set by
    default so ADMET runs across every compound produced upstream (parity
    with the standalone Drug-Likeness page). Caller may pass a soft `limit`
    only when the user explicitly asks for a subset."""
    for pool in (prior_results, project_context):
        for step in reversed(pool):
            if step.get("status") != "done":
                continue
            data = (step.get("result") or {}).get("data") or {}
            compounds = data.get("compounds")
            if isinstance(compounds, list) and compounds:
                selected = [c for c in compounds
                            if isinstance(c, dict) and (c.get("smiles")
                                                       or c.get("canonical_smiles"))]
                if selected:
                    return selected if limit is None else selected[:limit]
    # Single-compound lookups (compound_lookup / compound_details card) —
    # synthesise a 1-item compounds list so target_predict / admet_predict
    # can chain from "Look up Curcumin → Predict targets" prompts.
    for pool in (prior_results, project_context):
        for step in reversed(pool):
            if step.get("status") != "done":
                continue
            data = (step.get("result") or {}).get("data") or {}
            smi = (data.get("canonical_smiles") or data.get("isomeric_smiles")
                   or data.get("smiles"))
            if isinstance(smi, str) and smi.strip():
                one = {
                    "smiles": smi,
                    "canonical_smiles": smi,
                    "compound_name": data.get("iupac_name") or data.get("name")
                                     or data.get("compound_name"),
                    "molecular_formula": data.get("molecular_formula"),
                    "molecular_weight": data.get("molecular_weight"),
                    "pubchem_cid": data.get("pubchem_cid"),
                }
                return [one]
    for step in reversed(project_context):
        data = (step.get("result") or {}).get("data") or {}
        smis = data.get("smiles_extracted")
        if isinstance(smis, list) and smis:
            picked = [{"smiles": s} for s in smis]
            return picked if limit is None else picked[:limit]
    return []


def _auto_pick_genes(prior_results: list[dict],
                      project_context: list[dict]) -> list[str]:
    """Return the most-recent unique list of gene symbols from a target_predict
    (compound → target predictions) or a bare target_resolve step."""
    def _extract(step: dict) -> list[str]:
        data = (step.get("result") or {}).get("data") or {}
        if isinstance(data.get("targets"), list):
            seen: set[str] = set()
            out: list[str] = []
            for t in data["targets"]:
                g = (t.get("gene") or t.get("gene_symbol") or
                     t.get("symbol") or "").strip().upper()
                if g and g not in seen:
                    seen.add(g); out.append(g)
            return out
        # target_resolve returns a single-target payload
        g = (data.get("gene") or data.get("gene_symbol") or
             data.get("symbol") or "").strip().upper()
        return [g] if g else []

    for pool in (prior_results, project_context):
        for step in reversed(pool):
            if step.get("status") != "done":
                continue
            if step.get("tool") not in ("target_predict", "target_resolve"):
                continue
            genes = _extract(step)
            if genes:
                return genes
    return []


# ═══════════════════════════════════════════════════════════════
# Result forwarding — resolve "$prev.<path>" / "$step_id.<path>" placeholders
# in a plan step's args from prior successful results.
# Also handles Claude's {{...}} Jinja-style templates by rewriting them.
# ═══════════════════════════════════════════════════════════════
_PLACEHOLDER_KEYS = ("compounds", "targets", "hits", "results")


def resolve_args(args: dict,
                 prior_results: list[dict],
                 project_context: list[dict] | None = None) -> dict:
    """Walk a step's args and replace any `$prev.<path>` or `$step_<id>.<path>`
    reference with the corresponding value from prior step results.

    If a placeholder cannot be resolved from the CURRENT plan's `prior_results`,
    we fall back to `project_context` — the flat list of results from previous
    COMPLETED runs of the same project. This makes follow-up prompts like
    "now run ADMET on the top 25" work even when Claude produces a single-step
    plan that references `$prev.compounds`.
    """
    def _lookup(source: str) -> Any:
        target, *rest = source.split(".", 1)
        path = rest[0] if rest else ""
        slice_spec = None
        if path.endswith("]") and "[" in path:
            path, _, slc = path.rpartition("[")
            slice_spec = slc.rstrip("]")
        # 1) In-run lookup
        if target == "prev":
            candidates = [r for r in prior_results if (r.get("status") == "done")]
            step_res = candidates[-1] if candidates else None
        else:
            step_res = next((r for r in prior_results if r.get("id") == target), None)
        # 2) Cross-run fallback — reach into the previous completed run
        if step_res is None and (target in ("prev", "last") or target.startswith("step_")):
            step_res = _pick_from_project_context(project_context or [], path)
        if not step_res:
            return None
        payload = (step_res.get("result") or {}).get("data") or {}
        # Support indexed lookups like `$step_1.hits[0]` or `.hits[0].efo_id`
        idx = None
        tail = ""
        if "[" in path and "]" in path:
            head, _, rest = path.partition("[")
            idx_str, _, tail = rest.partition("]")
            if tail.startswith("."):
                tail = tail[1:]
            try:
                idx = int(idx_str)
            except ValueError:
                idx = None
            path = head
        value = payload.get(path) if path else payload
        if idx is not None and isinstance(value, list):
            value = value[idx] if 0 <= idx < len(value) else None
            if tail and isinstance(value, dict):
                # Support both `.efo_id` directly and alias lookups.
                subval = value.get(tail)
                if subval in (None, ""):
                    _ID_ALIASES = ("efo_id", "mondo_id", "id", "disease_id")
                    for alt in _ID_ALIASES:
                        if value.get(alt) not in (None, ""):
                            subval = value[alt]
                            break
                value = subval
        # Compat aliases — Claude sometimes asks for "smiles" while
        # compound_lookup stores the SMILES under `canonical_smiles`, etc.
        if path and (value is None or value == "") and isinstance(payload, dict):
            _ALIASES = {
                "smiles":       ("canonical_smiles", "isomeric_smiles"),
                "gene":         ("gene_symbol", "symbol"),
                "gene_symbol":  ("gene", "symbol"),
                "name":         ("iupac_name", "compound_name"),
                "compound_name": ("name", "iupac_name"),
                "id":           ("efo_id", "mondo_id", "disease_id",
                                 "pubchem_cid", "uniprot_id"),
            }
            for alt in _ALIASES.get(path, ()):
                if payload.get(alt) not in (None, ""):
                    value = payload[alt]
                    break
        if isinstance(value, list) and slice_spec:
            try:
                if ":" not in slice_spec:
                    # Bare index, e.g. $prev.hits[0]
                    ii = int(slice_spec)
                    value = value[ii] if 0 <= ii < len(value) else None
                else:
                    start, stop = (slice_spec.split(":") + [""])[:2]
                    s = int(start) if start else None
                    e = int(stop)  if stop  else None
                    value = value[slice(s, e)]
            except Exception:
                pass
        return value

    def _rewrite_jinja(s: str) -> str:
        """Best-effort: convert `{{previous_plant_search_results}}` → `$prev.compounds`,
        `{{prev.compounds}}` → `$prev.compounds`, etc."""
        raw = s.strip()
        if not (raw.startswith("{{") and raw.endswith("}}")):
            return s
        inner = raw[2:-2].strip()
        # Common aliases Claude tends to use
        aliases = {
            "previous_plant_search_results": "prev.compounds",
            "plant_search_results":          "prev.compounds",
            "prior_compounds":               "prev.compounds",
            "previous_compounds":            "prev.compounds",
            "previous_results":              "prev.compounds",
            "prev_compounds":                "prev.compounds",
            "compounds":                     "prev.compounds",
        }
        target = aliases.get(inner, inner.replace(" ", ""))
        return f"${target}"

    def _walk(v: Any) -> Any:
        if isinstance(v, str):
            if v.startswith("{{") and v.endswith("}}"):
                v = _rewrite_jinja(v)
            if v.startswith("$"):
                return _lookup(v[1:])
            return v
        if isinstance(v, list):
            return [_walk(x) for x in v]
        if isinstance(v, dict):
            return {k: _walk(x) for k, x in v.items()}
        return v

    return _walk(args)


def _pick_from_project_context(project_context: list[dict], path: str) -> dict | None:
    """Given a flat list of prior-run step results (chronological order),
    return the most recent one whose result payload contains `path`. If
    `path` is empty, return the most recent one that has any data.
    """
    # Search newest → oldest
    for step in reversed(project_context):
        if step.get("status") != "done":
            continue
        data = (step.get("result") or {}).get("data") or {}
        if not data:
            continue
        if path and path in data and data.get(path):
            return step
        if not path:
            return step
    # Fallback: any step whose data has ANY known compound-ish key
    for step in reversed(project_context):
        if step.get("status") != "done":
            continue
        data = (step.get("result") or {}).get("data") or {}
        for k in _PLACEHOLDER_KEYS:
            if data.get(k):
                # Rebuild a step-like doc but with the payload keyed by the
                # requested path so the caller can still `.get(path)`.
                return {
                    **step,
                    "result": {**(step.get("result") or {}),
                               "data": {path or k: data[k]}}
                    if path and path != k
                    else step["result"],
                }
    return None
