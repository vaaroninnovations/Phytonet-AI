"""Disease Target Identification service.

Query a disease → merged list of disease-associated human protein targets.

Databases (all commercial-use permitted):
- Open Targets Platform (Apache 2.0) — GraphQL
- CTD (Comparative Toxicogenomics DB) — batchQuery TSV endpoint
- NCBI Gene (Public Domain) — E-utilities
- UniProt disease annotation (CC-BY 4.0) — REST search

Identifier normalization via HGNC + UniProt.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql"
CTD_BATCH = "https://ctdbase.org/tools/batchQuery.go"
NCBI_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
NCBI_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
UNIPROT_SEARCH = "https://rest.uniprot.org/uniprotkb/search"
HGNC = "https://rest.genenames.org"

UA = "Mozilla/5.0 (PhytoNetAI-disease/1.0; +https://networkpharm.ai)"

MAX_TARGETS_PER_SOURCE = 250


# ---------------------------------------------------------------------------
async def _get_json(client, url, params=None, timeout=25.0):
    try:
        r = await client.get(
            url,
            params=params,
            timeout=timeout,
            headers={"Accept": "application/json", "User-Agent": UA},
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:  # pragma: no cover
        logger.debug(f"GET {url} failed: {e}")
    return None


async def _post_json(client, url, payload, timeout=30.0):
    try:
        r = await client.post(
            url,
            json=payload,
            timeout=timeout,
            headers={"Accept": "application/json", "User-Agent": UA},
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:  # pragma: no cover
        logger.debug(f"POST {url} failed: {e}")
    return None


async def _get_text(client, url, params=None, timeout=25.0):
    try:
        r = await client.get(
            url, params=params, timeout=timeout, headers={"User-Agent": UA}
        )
        if r.status_code == 200:
            return r.text
    except Exception as e:  # pragma: no cover
        logger.debug(f"GET {url} failed: {e}")
    return None


# ---------------------------------------------------------------------------
# Disease search (autocomplete)
# ---------------------------------------------------------------------------
DISEASE_SEARCH_GQL = """
query search($q: String!) {
  search(queryString: $q, entityNames: ["disease"], page: {index: 0, size: 12}) {
    hits {
      id
      name
      entity
      description
    }
  }
}
"""


async def search_diseases(query: str) -> List[dict]:
    if not query or len(query.strip()) < 2:
        return []
    async with httpx.AsyncClient(follow_redirects=True) as client:
        data = await _post_json(
            client, OT_GQL, {"query": DISEASE_SEARCH_GQL, "variables": {"q": query}}
        )
    if not data:
        return []
    hits = (data.get("data", {}).get("search", {}) or {}).get("hits", []) or []
    out = []
    for h in hits:
        out.append(
            {
                "efo_id": h.get("id"),
                "name": h.get("name"),
                "description": h.get("description"),
            }
        )
    return out


# ---------------------------------------------------------------------------
# Open Targets — associated targets
# ---------------------------------------------------------------------------
DISEASE_TARGETS_GQL = """
query targets($efo: String!, $size: Int!) {
  disease(efoId: $efo) {
    id
    name
    associatedTargets(page: {index: 0, size: $size}) {
      count
      rows {
        score
        datatypeScores { id score }
        target {
          id
          approvedSymbol
          approvedName
          proteinIds { id source }
          biotype
          targetClass { level id label }
        }
      }
    }
  }
}
"""


async def opentargets_disease_targets(client, efo_id: str) -> Dict[str, Any]:
    data = await _post_json(
        client,
        OT_GQL,
        {
            "query": DISEASE_TARGETS_GQL,
            "variables": {"efo": efo_id, "size": MAX_TARGETS_PER_SOURCE},
        },
    )
    if not data:
        return {"name": None, "rows": []}
    d = (data.get("data", {}) or {}).get("disease", {}) or {}
    name = d.get("name")
    rows = ((d.get("associatedTargets", {}) or {}).get("rows", [])) or []
    parsed = []
    for r in rows:
        t = r.get("target", {}) or {}
        uni = None
        for pid in t.get("proteinIds", []) or []:
            if (pid.get("source") or "").lower() == "uniprot_swissprot":
                uni = pid.get("id")
                break
        if not uni:
            # fall back to any uniprot id
            for pid in t.get("proteinIds", []) or []:
                if "uniprot" in (pid.get("source") or "").lower():
                    uni = pid.get("id")
                    break
        # target class label (first level 1)
        klass = None
        for c in t.get("targetClass", []) or []:
            if c.get("level") == "l1" or klass is None:
                klass = c.get("label")
        # datatype scores → curated / experimental
        datatypes = {ds.get("id"): ds.get("score") for ds in r.get("datatypeScores", []) or []}
        parsed.append(
            {
                "gene_symbol": t.get("approvedSymbol"),
                "protein_name": t.get("approvedName"),
                "uniprot_id": uni,
                "ensembl_id": t.get("id"),
                "protein_class": klass,
                "biotype": t.get("biotype"),
                "association_score": round(float(r.get("score") or 0), 3),
                "curated_score": datatypes.get("known_drug") or datatypes.get("literature"),
                "genetic_score": datatypes.get("genetic_association"),
                "sources": ["Open Targets"],
            }
        )
    return {"name": name, "rows": parsed}


# ---------------------------------------------------------------------------
# CTD — disease → curated genes
# ---------------------------------------------------------------------------
async def ctd_disease_genes(client, disease_name: str) -> List[dict]:
    if not disease_name:
        return []
    params = {
        "inputType": "disease",
        "inputTerms": disease_name,
        "report": "genes_curated",
        "format": "tsv",
        "action": "Download",
    }
    text = await _get_text(client, CTD_BATCH, params=params, timeout=30.0)
    if not text:
        return []
    lines = [l for l in text.splitlines() if l and not l.startswith("#")]
    if not lines:
        return []
    header = lines[0].split("\t")
    out = []
    idx = {c: i for i, c in enumerate(header)}
    for line in lines[1:]:
        parts = line.split("\t")
        if len(parts) < len(header):
            continue
        try:
            symbol = parts[idx.get("GeneSymbol", 1)] if "GeneSymbol" in idx else parts[1]
            ncbi = parts[idx.get("GeneID", 2)] if "GeneID" in idx else parts[2]
            direct = (
                parts[idx["DirectEvidence"]]
                if "DirectEvidence" in idx and idx["DirectEvidence"] < len(parts)
                else ""
            )
        except Exception:
            continue
        if not symbol:
            continue
        out.append(
            {
                "gene_symbol": symbol.strip(),
                "ncbi_gene_id": ncbi.strip() if ncbi else None,
                "evidence_level": "curated" if direct else "inferred",
                "sources": ["CTD"],
            }
        )
        if len(out) >= MAX_TARGETS_PER_SOURCE:
            break
    return out


# ---------------------------------------------------------------------------
# NCBI Gene — E-utilities
# ---------------------------------------------------------------------------
async def ncbi_disease_genes(client, disease_name: str) -> List[dict]:
    if not disease_name:
        return []
    # ESearch → list of gene UIDs
    term = f'"{disease_name}"[Disease/Phenotype] AND "Homo sapiens"[Organism]'
    data = await _get_json(
        client,
        NCBI_ESEARCH,
        params={"db": "gene", "term": term, "retmode": "json", "retmax": 100},
    )
    ids = (data or {}).get("esearchresult", {}).get("idlist", []) or []
    if not ids:
        return []
    # ESummary → gene names
    data = await _get_json(
        client,
        NCBI_ESUMMARY,
        params={"db": "gene", "id": ",".join(ids), "retmode": "json"},
    )
    result = (data or {}).get("result", {})
    out = []
    for uid in ids:
        entry = result.get(uid)
        if not entry or entry == {"error": "Invalid uid"}:
            continue
        out.append(
            {
                "gene_symbol": entry.get("name"),
                "ncbi_gene_id": uid,
                "protein_name": entry.get("description"),
                "evidence_level": "inferred",
                "sources": ["NCBI Gene"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# UniProt — disease annotation
# ---------------------------------------------------------------------------
async def uniprot_disease_genes(client, disease_name: str) -> List[dict]:
    if not disease_name:
        return []
    query = f'(organism_id:9606) AND (cc_disease:"{disease_name}") AND reviewed:true'
    params = {
        "query": query,
        "format": "json",
        "size": 100,
        "fields": "accession,gene_names,protein_name,cc_disease",
    }
    data = await _get_json(client, UNIPROT_SEARCH, params=params, timeout=30.0)
    if not data:
        return []
    out = []
    for entry in data.get("results", []) or []:
        accession = entry.get("primaryAccession")
        genes = entry.get("genes", []) or []
        symbol = None
        for g in genes:
            if g.get("geneName", {}).get("value"):
                symbol = g["geneName"]["value"]
                break
        protein_name = (
            entry.get("proteinDescription", {})
            .get("recommendedName", {})
            .get("fullName", {})
            .get("value")
        )
        out.append(
            {
                "gene_symbol": symbol,
                "protein_name": protein_name,
                "uniprot_id": accession,
                "evidence_level": "curated",
                "sources": ["UniProt Disease"],
            }
        )
    return out


# ---------------------------------------------------------------------------
# HGNC normalization
# ---------------------------------------------------------------------------
async def hgnc_normalize(client, symbol: str) -> Optional[dict]:
    if not symbol:
        return None
    data = await _get_json(client, f"{HGNC}/fetch/symbol/{symbol}", timeout=12.0)
    if not data or not data.get("response", {}).get("docs"):
        data = await _get_json(client, f"{HGNC}/fetch/alias_symbol/{symbol}", timeout=12.0)
    docs = (data or {}).get("response", {}).get("docs", []) or []
    if not docs:
        return None
    d = docs[0]
    return {
        "gene_symbol": d.get("symbol"),
        "hgnc_id": d.get("hgnc_id"),
        "protein_name": d.get("name") or None,
        "protein_class": d.get("locus_group"),
        "uniprot_ids": (d.get("uniprot_ids") or [None])[0],
    }


# ---------------------------------------------------------------------------
# Merge & normalize
# ---------------------------------------------------------------------------
def _merge_rows(rows_lists: List[List[dict]]) -> List[dict]:
    merged: Dict[str, dict] = {}
    for lst in rows_lists:
        for r in lst:
            sym = (r.get("gene_symbol") or "").strip().upper()
            if not sym:
                continue
            slot = merged.setdefault(
                sym,
                {
                    "gene_symbol": sym,
                    "protein_name": None,
                    "uniprot_id": None,
                    "ncbi_gene_id": None,
                    "protein_class": None,
                    "association_score": 0.0,
                    "evidence_level": "inferred",
                    "sources": set(),
                },
            )
            for k in ("protein_name", "uniprot_id", "ncbi_gene_id", "protein_class"):
                if not slot.get(k) and r.get(k):
                    slot[k] = r[k]
            score = r.get("association_score")
            if isinstance(score, (int, float)) and score > slot["association_score"]:
                slot["association_score"] = float(score)
            if r.get("evidence_level") == "curated":
                slot["evidence_level"] = "curated"
            for s in r.get("sources", []) or []:
                slot["sources"].add(s)
    out = []
    for slot in merged.values():
        slot["sources"] = sorted(slot["sources"])
        # 5★ if curated + 3+ sources + score ≥ 0.5
        # 4★ if curated + 2+ sources
        # 3★ if curated + 1 source or ≥ 2 sources
        # 2★ if 1 source non-curated + score ≥ 0.3
        # 1★ otherwise
        src = len(slot["sources"])
        curated = slot["evidence_level"] == "curated"
        score = slot["association_score"]
        if curated and src >= 3 and score >= 0.5:
            slot["confidence"] = 5
        elif curated and src >= 2:
            slot["confidence"] = 4
        elif curated or src >= 2:
            slot["confidence"] = 3
        elif score >= 0.3:
            slot["confidence"] = 2
        else:
            slot["confidence"] = 1
        out.append(slot)
    # Sort by association score desc, then confidence desc
    out.sort(key=lambda r: (r["association_score"], r["confidence"]), reverse=True)
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
async def get_disease_targets(efo_id: str, disease_name: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(follow_redirects=True) as client:
        ot_res, ctd_rows, ncbi_rows, uni_rows = await asyncio.gather(
            opentargets_disease_targets(client, efo_id) if efo_id else _noop_dict(),
            ctd_disease_genes(client, disease_name),
            ncbi_disease_genes(client, disease_name),
            uniprot_disease_genes(client, disease_name),
        )
        resolved_name = (ot_res or {}).get("name") or disease_name
        merged = _merge_rows(
            [
                (ot_res or {}).get("rows", []) or [],
                ctd_rows or [],
                ncbi_rows or [],
                uni_rows or [],
            ]
        )
        # HGNC-normalize gene symbols (top 100 to bound network I/O).
        top = merged[:100]
        normed = await asyncio.gather(
            *[hgnc_normalize(client, r["gene_symbol"]) for r in top]
        )
        for row, norm in zip(top, normed):
            if not norm:
                continue
            if norm.get("gene_symbol"):
                row["gene_symbol"] = norm["gene_symbol"]
            if not row.get("protein_name") and norm.get("protein_name"):
                row["protein_name"] = norm["protein_name"]
            if not row.get("protein_class") and norm.get("protein_class"):
                row["protein_class"] = norm["protein_class"]
            if not row.get("uniprot_id") and norm.get("uniprot_ids"):
                row["uniprot_id"] = norm["uniprot_ids"]
            row["sources"] = sorted(set(row["sources"]) | {"HGNC"})
    return {"disease_name": resolved_name, "efo_id": efo_id, "targets": merged}


async def _noop_dict():
    return {"name": None, "rows": []}
