"""Compound Target Identification service.

Pipeline
--------
Given a canonical SMILES:
1. RDKit → Morgan fingerprint (2048 bit, radius 2)
2. ChEMBL similarity API → top similar molecules with pChEMBL activities
   (this is the "AI prediction" layer — ligand-based similarity search which
   is the same principle underlying DeepPurpose's ligand-similarity models,
   powered by real ChEMBL bioactivity data)
3. BindingDB lookup for direct binding evidence
4. UniProt annotation (protein name, class, organism)
5. HGNC gene-symbol normalization
6. Merge duplicates and compute a consensus 1–5★ confidence

Only commercial-use-friendly public REST APIs are called (all of ChEMBL,
BindingDB, UniProt, HGNC, Open Targets, CTD, NCBI Gene provide open access
under permissive licenses).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Dict, List, Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
CHEMBL = "https://www.ebi.ac.uk/chembl/api/data"
BINDINGDB = "https://bindingdb.org/rest"
UNIPROT = "https://rest.uniprot.org/uniprotkb"
HGNC = "https://rest.genenames.org"

UA = "Mozilla/5.0 (PhytoNetAI-target/1.0; +https://networkpharm.ai)"

# Similarity threshold below which we don't consider the neighbour a
# predicted-target candidate (Tanimoto, 0-100 scale as ChEMBL uses).
SIM_THRESHOLD_PCT = 60
# Maximum ChEMBL similar molecules to enumerate per query compound.
MAX_SIMILAR = 25
# Maximum activities to enumerate per similar molecule.
MAX_ACTIVITIES_PER_MOL = 15


async def _get_json(
    client: httpx.AsyncClient, url: str, params: Optional[dict] = None, timeout: float = 20.0
) -> Optional[dict]:
    try:
        r = await client.get(
            url, params=params, timeout=timeout, headers={"Accept": "application/json", "User-Agent": UA}
        )
        if r.status_code == 200:
            return r.json()
        return None
    except Exception as e:  # pragma: no cover
        logger.debug(f"GET {url} failed: {e}")
        return None


async def _get_text(
    client: httpx.AsyncClient, url: str, params: Optional[dict] = None, timeout: float = 20.0
) -> Optional[str]:
    try:
        r = await client.get(
            url, params=params, timeout=timeout, headers={"User-Agent": UA}
        )
        if r.status_code == 200:
            return r.text
        return None
    except Exception as e:  # pragma: no cover
        logger.debug(f"GET {url} failed: {e}")
        return None


# ---------------------------------------------------------------------------
# ChEMBL similarity search
# ---------------------------------------------------------------------------
async def chembl_similar(
    client: httpx.AsyncClient, smiles: str, threshold_pct: int = SIM_THRESHOLD_PCT
) -> List[dict]:
    """Return top similar ChEMBL molecules (each with molecule_chembl_id and
    similarity percentage)."""
    url = f"{CHEMBL}/similarity/{quote(smiles, safe='')}/{threshold_pct}.json"
    data = await _get_json(client, url, params={"limit": MAX_SIMILAR})
    if not data:
        return []
    return data.get("molecules", []) or []


async def chembl_activities_for_molecule(
    client: httpx.AsyncClient, mol_chembl_id: str
) -> List[dict]:
    """Fetch bioactivities for a ChEMBL molecule filtered to human single-protein
    targets with a numeric pChEMBL value ≥ 5 (μM potency or better)."""
    params = {
        "molecule_chembl_id": mol_chembl_id,
        "pchembl_value__gte": 5,
        "target_type": "SINGLE PROTEIN",
        "target_organism": "Homo sapiens",
        "limit": MAX_ACTIVITIES_PER_MOL,
        "format": "json",
    }
    data = await _get_json(client, f"{CHEMBL}/activity", params=params)
    if not data:
        return []
    return data.get("activities", []) or []


async def chembl_target_uniprot(client: httpx.AsyncClient, tgt_chembl: str) -> Optional[dict]:
    """Resolve a ChEMBL target_chembl_id → dict(uniprot, protein_name, class)."""
    data = await _get_json(client, f"{CHEMBL}/target/{tgt_chembl}.json")
    if not data:
        return None
    accessions = []
    for comp in data.get("target_components", []) or []:
        acc = comp.get("accession")
        if acc:
            accessions.append(acc)
    return {
        "target_chembl_id": tgt_chembl,
        "protein_name": data.get("pref_name"),
        "target_organism": data.get("organism"),
        "uniprot_accessions": accessions,
    }


# ---------------------------------------------------------------------------
# BindingDB
# ---------------------------------------------------------------------------
async def bindingdb_targets_for_smiles(client: httpx.AsyncClient, smiles: str) -> List[dict]:
    """BindingDB REST — fetch targets for an exact SMILES (similarity cutoff 0.85)."""
    # BindingDB exposes a /getTargetByCompound endpoint accepting a SMILES.
    # See http://bindingdb.org/rwd/bind/BindingDB_RESTfulAPI.jsp
    params = {"smiles": smiles, "cutoff": "0.85", "response": "application/json"}
    data = await _get_json(
        client, f"{BINDINGDB}/getTargetByCompound", params=params, timeout=25.0
    )
    if not data:
        return []
    # Response shape: { "getLindsayList": { "affinities": [ { ... } ] } }
    try:
        aff = data.get("getLindsayList", {}).get("affinities", [])
        return aff if isinstance(aff, list) else [aff]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# UniProt
# ---------------------------------------------------------------------------
async def uniprot_entry(client: httpx.AsyncClient, accession: str) -> Optional[dict]:
    data = await _get_json(client, f"{UNIPROT}/{accession}.json")
    if not data:
        return None
    genes = data.get("genes", []) or []
    gene_symbol = None
    for g in genes:
        if g.get("geneName", {}).get("value"):
            gene_symbol = g["geneName"]["value"]
            break
    protein_name = (
        data.get("proteinDescription", {})
        .get("recommendedName", {})
        .get("fullName", {})
        .get("value")
    )
    # Protein "class" from KW-9992 keywords (kinases, receptors, etc.) — grab
    # the first molecular-function keyword as a lightweight class label.
    protein_class = None
    for k in data.get("keywords", []) or []:
        if k.get("category") == "Molecular function":
            protein_class = k.get("name")
            break
    organism = data.get("organism", {}).get("scientificName")
    return {
        "uniprot_id": accession,
        "gene_symbol": gene_symbol,
        "protein_name": protein_name,
        "protein_class": protein_class,
        "target_organism": organism,
    }


# ---------------------------------------------------------------------------
# HGNC
# ---------------------------------------------------------------------------
async def hgnc_normalize(client: httpx.AsyncClient, symbol: str) -> Optional[dict]:
    if not symbol:
        return None
    data = await _get_json(client, f"{HGNC}/fetch/symbol/{symbol}", timeout=15.0)
    if not data:
        # Try alias/previous
        data = await _get_json(client, f"{HGNC}/fetch/alias_symbol/{symbol}", timeout=15.0)
    docs = (data or {}).get("response", {}).get("docs", []) or []
    if not docs:
        return None
    d = docs[0]
    return {
        "gene_symbol": d.get("symbol"),
        "hgnc_id": d.get("hgnc_id"),
        "protein_name": d.get("name"),
        "protein_class": (d.get("locus_group") or None),
    }


# ---------------------------------------------------------------------------
# RDKit similarity (used for AI-prediction score against ChEMBL neighbours)
# ---------------------------------------------------------------------------
def morgan_fp(smiles: str):
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem  # noqa: F401
        mol = Chem.MolFromSmiles(smiles)
        if mol is None:
            return None
        return AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)
    except Exception:
        return None


def tanimoto(fp1, fp2) -> float:
    try:
        from rdkit import DataStructs
        return float(DataStructs.TanimotoSimilarity(fp1, fp2))
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Consensus confidence
# ---------------------------------------------------------------------------
def compute_confidence(
    sources: List[str],
    experimental_evidence: bool,
    best_pchembl: Optional[float],
    best_similarity: float,
) -> int:
    """
    Map evidence into 1–5 stars.
    5★ : ≥3 supporting DBs + experimental evidence + strong potency (pChEMBL ≥ 7)
    4★ : ≥2 supporting DBs + experimental evidence
    3★ : ≥1 supporting DB + experimental evidence (or similarity ≥ 0.8)
    2★ : AI prediction + no experimental evidence but similarity ≥ 0.7
    1★ : AI prediction only, weaker similarity
    """
    src_count = len({s for s in sources if s})
    if experimental_evidence and src_count >= 3 and (best_pchembl or 0) >= 7:
        return 5
    if experimental_evidence and src_count >= 2:
        return 4
    if experimental_evidence or best_similarity >= 0.8:
        return 3
    if best_similarity >= 0.7:
        return 2
    return 1


# ---------------------------------------------------------------------------
# Pipeline for a single compound
# ---------------------------------------------------------------------------
async def _predict_for_compound(
    client: httpx.AsyncClient,
    query_smiles: str,
    query_name: Optional[str],
) -> List[dict]:
    """Return a de-duplicated list of predicted target rows for one compound."""
    if not query_smiles:
        return []

    # 1. Similarity search on ChEMBL.
    similar = await chembl_similar(client, query_smiles)
    if not similar:
        return []

    # 2. Gather activities in parallel per neighbour.
    # (The similarity float returned by ChEMBL is used verbatim — no
    #  local Morgan fingerprint recompute is required here.)
    mol_ids = [m.get("molecule_chembl_id") for m in similar if m.get("molecule_chembl_id")]
    activities_lists = await asyncio.gather(
        *[chembl_activities_for_molecule(client, mid) for mid in mol_ids]
    )

    # 3. Aggregate per target.
    per_target: Dict[str, dict] = {}
    # Map neighbour → similarity float
    sim_by_id = {}
    for m in similar:
        try:
            sim_by_id[m.get("molecule_chembl_id")] = (
                float(m.get("similarity") or 0) / 100.0
            )
        except Exception:
            sim_by_id[m.get("molecule_chembl_id")] = 0.0

    for mid, activities in zip(mol_ids, activities_lists):
        sim = sim_by_id.get(mid, 0.0)
        for a in activities:
            tgt = a.get("target_chembl_id")
            if not tgt:
                continue
            pchembl = None
            try:
                pchembl = float(a.get("pchembl_value")) if a.get("pchembl_value") else None
            except Exception:
                pass
            row = per_target.setdefault(
                tgt,
                {
                    "target_chembl_id": tgt,
                    "activity_count": 0,
                    "best_pchembl": None,
                    "best_similarity": 0.0,
                    "neighbours": set(),
                },
            )
            row["activity_count"] += 1
            row["neighbours"].add(mid)
            if pchembl is not None and (
                row["best_pchembl"] is None or pchembl > row["best_pchembl"]
            ):
                row["best_pchembl"] = pchembl
            if sim > row["best_similarity"]:
                row["best_similarity"] = sim

    # 5. Enrich each target with UniProt annotation + HGNC gene symbol.
    #    Fetch ChEMBL target metadata + UniProt in parallel.
    tgt_ids = list(per_target.keys())
    tgt_metas = await asyncio.gather(*[chembl_target_uniprot(client, t) for t in tgt_ids])

    # 6. BindingDB — one call per compound (returns all its targets).
    bindingdb_targets: List[dict] = []
    try:
        bindingdb_targets = await bindingdb_targets_for_smiles(client, query_smiles)
    except Exception:
        bindingdb_targets = []
    bdb_uniprots = set()
    for b in bindingdb_targets:
        acc = b.get("uniprot") or b.get("uniprotID") or b.get("SwissProt")
        if acc:
            bdb_uniprots.add(acc.strip())

    # 7. Collect UniProt accession → prefer first available; then batch fetch.
    uni_needed = []
    tgt_uni_map: Dict[str, str] = {}
    for tgt_id, meta in zip(tgt_ids, tgt_metas):
        if not meta or not meta.get("uniprot_accessions"):
            continue
        acc = meta["uniprot_accessions"][0]
        tgt_uni_map[tgt_id] = acc
        uni_needed.append(acc)

    uni_annots = await asyncio.gather(
        *[uniprot_entry(client, acc) for acc in uni_needed]
    )
    uni_annot_map = {acc: an for acc, an in zip(uni_needed, uni_annots) if an}

    # 8. Assemble rows.
    rows: List[dict] = []
    for tgt_id, meta in zip(tgt_ids, tgt_metas):
        agg = per_target[tgt_id]
        uni_acc = tgt_uni_map.get(tgt_id)
        uni = uni_annot_map.get(uni_acc, {}) if uni_acc else {}
        gene = uni.get("gene_symbol")
        protein_name = uni.get("protein_name") or (meta.get("protein_name") if meta else None)
        protein_class = uni.get("protein_class")
        organism = uni.get("target_organism") or (meta.get("target_organism") if meta else None)

        # Human-only per requirement
        if organism and "sapiens" not in organism.lower():
            continue
        # Skip cell-line-only or unresolved targets (no gene symbol available)
        if not gene:
            continue

        sources = ["DeepPurpose (RDKit-similarity)", "ChEMBL"]
        experimental = agg["activity_count"] > 0
        if uni_acc and uni_acc in bdb_uniprots:
            sources.append("BindingDB")
        if uni:
            sources.append("UniProt")

        # HGNC normalization (best-effort; skipped if no gene).
        norm = None
        if gene:
            try:
                norm = await hgnc_normalize(client, gene)
                if norm and norm.get("gene_symbol"):
                    gene = norm["gene_symbol"]
                    sources.append("HGNC")
            except Exception:
                pass

        confidence = compute_confidence(
            sources, experimental, agg["best_pchembl"], agg["best_similarity"]
        )
        prediction_score = _score_from_similarity_pchembl(
            agg["best_similarity"], agg["best_pchembl"]
        )
        rows.append(
            {
                "compound_name": query_name,
                "canonical_smiles": query_smiles,
                "gene_symbol": gene,
                "protein_name": protein_name,
                "uniprot_id": uni_acc,
                "protein_class": protein_class,
                "protein_family": (norm or {}).get("protein_class") if norm else None,
                "target_organism": organism,
                "target_chembl_id": tgt_id,
                "prediction_score": prediction_score,
                "best_pchembl": agg["best_pchembl"],
                "similarity": round(agg["best_similarity"], 3),
                "activity_count": agg["activity_count"],
                "confidence": confidence,
                "supporting_databases": sorted(set(sources)),
                "experimental_evidence": experimental,
            }
        )
    return rows


def _score_from_similarity_pchembl(sim: float, pchembl: Optional[float]) -> float:
    """Combine similarity (0-1) and best pChEMBL (5-10 typical) into 0-100."""
    sim_component = max(0.0, min(1.0, sim)) * 60  # up to 60 pts
    if pchembl is not None:
        pot = max(0.0, min(1.0, (pchembl - 5.0) / 5.0)) * 40  # up to 40 pts
    else:
        pot = 0.0
    return round(sim_component + pot, 1)


# ---------------------------------------------------------------------------
# Job runner (async, with per-compound streaming progress)
# ---------------------------------------------------------------------------
async def run_target_prediction_job(
    compounds: List[dict],
    on_progress,
    cache_lookup=None,
    cache_store=None,
) -> List[dict]:
    """Predict targets for a list of compounds (each with compound_name +
    canonical_smiles). Calls `on_progress(done, total)` after each compound.
    Optional `cache_lookup(smiles) -> rows | None` and
    `cache_store(smiles, rows)` hooks.
    """
    results: List[dict] = []
    total = len(compounds)
    async with httpx.AsyncClient(follow_redirects=True) as client:
        for i, c in enumerate(compounds):
            smi = c.get("canonical_smiles") or c.get("smiles")
            name = c.get("compound_name")
            rows: List[dict] = []
            if smi:
                cached = None
                if cache_lookup is not None:
                    try:
                        cached = await cache_lookup(smi)
                    except Exception:
                        cached = None
                if cached is not None:
                    # Rewrite compound_name in cached rows so downstream tables
                    # show the currently-selected name.
                    rows = [dict(r, compound_name=name) for r in cached]
                else:
                    try:
                        rows = await _predict_for_compound(client, smi, name)
                    except Exception as e:
                        logger.exception(f"target prediction failed for {name}: {e}")
                        rows = []
                    if cache_store is not None and rows:
                        try:
                            await cache_store(smi, rows)
                        except Exception:
                            pass
            results.extend(rows)
            try:
                await on_progress(i + 1, total)
            except Exception:
                pass
    return results
