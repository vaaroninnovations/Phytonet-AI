"""Network Analysis backend services — STRING PPI + KEGG (via Enrichr).

Public REST APIs only:
- STRING: https://string-db.org/api/  (Public, CC-BY 4.0)
- Enrichr: https://maayanlab.cloud/Enrichr/  (Public, permissive)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

STRING_API = "https://string-db.org/api"
ENRICHR_API = "https://maayanlab.cloud/Enrichr"
GPROFILER_API = "https://biit.cs.ut.ee/gprofiler/api/gost/profile/"
UA = "PhytoNetAI-network/1.0"


# ---------------------------------------------------------------------------
# STRING PPI
# ---------------------------------------------------------------------------
async def fetch_string_network(
    genes: List[str],
    species: int = 9606,
    required_score: int = 400,
    network_type: str = "functional",
    add_nodes: int = 0,
) -> Dict[str, Any]:
    """Fetch a STRING interaction network for a gene list. Returns nodes + edges.

    STRING scoring bands:
      150 low · 400 medium · 700 high · 900 highest confidence
    """
    if not genes:
        return {"nodes": [], "edges": []}
    identifiers = "%0d".join(genes)
    params = {
        "identifiers": identifiers,
        "species": species,
        "required_score": required_score,
        "network_type": network_type,
        "add_nodes": add_nodes,
        "caller_identity": "phytonet-ai",
    }
    async with httpx.AsyncClient(follow_redirects=True) as client:
        # Use `tsv-no-header` for the network endpoint — returns row per edge.
        try:
            r = await client.get(
                f"{STRING_API}/tsv-no-header/network",
                params=params,
                timeout=45.0,
                headers={"User-Agent": UA},
            )
            r.raise_for_status()
        except Exception as e:
            logger.exception(f"STRING network fetch failed: {e}")
            return {"nodes": [], "edges": [], "error": str(e)}
        text = r.text.strip()

    node_set: Dict[str, Dict[str, Any]] = {}
    edges: List[Dict[str, Any]] = []
    for line in text.splitlines():
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        # STRING TSV columns: stringId_A, stringId_B, preferredName_A,
        # preferredName_B, ncbiTaxonId, score, ...channel scores
        (
            sid_a,
            sid_b,
            name_a,
            name_b,
            _tax,
            score_str,
            *rest,
        ) = parts
        try:
            score = float(score_str)
        except ValueError:
            continue
        for sid, name in ((sid_a, name_a), (sid_b, name_b)):
            if name not in node_set:
                node_set[name] = {"id": name, "string_id": sid}
        # Extract per-channel scores if present (nscore, fscore, ..., escore, dscore, tscore)
        channels = {}
        channel_keys = [
            "nscore",
            "fscore",
            "pscore",
            "ascore",
            "escore",
            "dscore",
            "tscore",
        ]
        for k, v in zip(channel_keys, rest):
            try:
                channels[k] = float(v)
            except ValueError:
                pass
        edges.append(
            {"source": name_a, "target": name_b, "score": score, "channels": channels}
        )
    nodes = list(node_set.values())
    return {"nodes": nodes, "edges": edges, "total_edges": len(edges)}


# ---------------------------------------------------------------------------
# KEGG enrichment via Enrichr
# ---------------------------------------------------------------------------
async def enrichr_kegg(genes: List[str], library: str = "KEGG_2021_Human") -> Dict[str, Any]:
    if not genes:
        return {"pathways": []}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        # 1. Add gene list
        try:
            r1 = await client.post(
                f"{ENRICHR_API}/addList",
                files={
                    "list": (None, "\n".join(genes)),
                    "description": (None, "PhytoNet AI"),
                },
                timeout=30.0,
                headers={"User-Agent": UA},
            )
            r1.raise_for_status()
            data = r1.json()
        except Exception as e:
            logger.exception(f"Enrichr addList failed: {e}")
            return {"pathways": [], "error": str(e)}
        user_list_id = data.get("userListId")
        if not user_list_id:
            return {"pathways": [], "error": "Enrichr addList returned no userListId"}
        # 2. Enrich
        try:
            r2 = await client.get(
                f"{ENRICHR_API}/enrich",
                params={"userListId": user_list_id, "backgroundType": library},
                timeout=45.0,
                headers={"User-Agent": UA, "Accept": "application/json"},
            )
            r2.raise_for_status()
            payload = r2.json()
        except Exception as e:
            logger.exception(f"Enrichr enrich failed: {e}")
            return {"pathways": [], "error": str(e), "user_list_id": user_list_id}

    rows = payload.get(library, []) or []
    # Enrichr row: [Rank, Term, P-value, Z-score, Combined score, Overlapping_Genes,
    #               Adjusted p-value, Old p-value, Old adjusted p-value]
    pathways = []
    for r in rows:
        try:
            pathways.append(
                {
                    "rank": r[0],
                    "term": r[1],
                    "p_value": r[2],
                    "z_score": r[3],
                    "combined_score": r[4],
                    "overlap_genes": r[5] if isinstance(r[5], list) else [],
                    "adj_p_value": r[6],
                    "gene_count": len(r[5]) if isinstance(r[5], list) else 0,
                }
            )
        except Exception:
            continue
    return {"pathways": pathways, "library": library, "n": len(pathways)}


# ---------------------------------------------------------------------------
# GO enrichment via g:Profiler
# ---------------------------------------------------------------------------
_GO_SOURCE_LABELS = {"GO:BP": "Biological Process", "GO:MF": "Molecular Function", "GO:CC": "Cellular Component"}


async def gprofiler_go(
    genes: List[str],
    organism: str = "hsapiens",
    sources: Optional[List[str]] = None,
    user_threshold: float = 0.05,
    significance_method: str = "g_SCS",
) -> Dict[str, Any]:
    """GO enrichment via g:Profiler REST API.

    Returns bar/dot/chord-ready rows keyed by source (GO:BP, GO:MF, GO:CC).
    """
    if not genes:
        return {"terms": [], "n": 0}
    if not sources:
        sources = ["GO:BP", "GO:MF", "GO:CC"]

    payload = {
        "organism": organism,
        "query": genes,
        "sources": sources,
        "user_threshold": user_threshold,
        "significance_threshold_method": significance_method,
        "no_evidences": False,
        "no_iea": False,
        "ordered": False,
        "combined": False,
        "measure_underrepresentation": False,
        "domain_scope": "annotated",
    }

    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            r = await client.post(
                GPROFILER_API,
                json=payload,
                timeout=60.0,
                headers={
                    "User-Agent": UA,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            logger.exception(f"g:Profiler failed: {e}")
            return {"terms": [], "n": 0, "error": str(e)}

    meta = data.get("meta") or {}
    query_names_map = (
        (meta.get("genes_metadata") or {}).get("query") or {}
    )
    # g:Profiler v2 shape: {"query_1": {"mapping": {"TP53": ["ENSG..."]}, "ensgs": [...], "failed": [...]}}
    # Build ordered list of input symbols aligned with each intersection row.
    input_symbols: List[str] = []
    if query_names_map:
        first_key = next(iter(query_names_map))
        query_val = query_names_map[first_key]
        if isinstance(query_val, dict):
            mapping = query_val.get("mapping") or {}
            ensgs_ordered = query_val.get("ensgs") or []
            # Reverse mapping: ENSG → input symbol
            ensg_to_sym = {}
            for sym, ensgs in mapping.items():
                for e in (ensgs or []):
                    ensg_to_sym[e] = sym
            for ensg in ensgs_ordered:
                input_symbols.append(ensg_to_sym.get(ensg) or ensg)
        elif isinstance(query_val, list):
            # Older/alt shape
            for gene_meta in query_val:
                if isinstance(gene_meta, dict):
                    sym = gene_meta.get("name") or gene_meta.get("input")
                else:
                    sym = str(gene_meta) if gene_meta else None
                if sym:
                    input_symbols.append(sym)
    if not input_symbols:
        input_symbols = list(genes)

    terms = []
    for row in data.get("result", []) or []:
        intersections = row.get("intersections") or []  # per-input evidences
        overlap_genes: List[str] = []
        for i, evid in enumerate(intersections):
            if evid and i < len(input_symbols):
                overlap_genes.append(input_symbols[i])
        source = row.get("source")
        term_size = row.get("term_size") or 0
        query_size = row.get("query_size") or 0
        eff = row.get("effective_domain_size") or 0
        isize = row.get("intersection_size") or 0
        # Fold enrichment = (k/n) / (K/N)
        fold_enrichment = 0.0
        if query_size and term_size and eff:
            gr = isize / query_size
            bg = term_size / eff
            fold_enrichment = gr / bg if bg else 0.0
        gene_ratio = (isize / query_size) if query_size else 0.0
        rich_factor = (isize / term_size) if term_size else 0.0
        terms.append({
            "source": source,
            "category": _GO_SOURCE_LABELS.get(source, source),
            "native": row.get("native"),
            "name": row.get("name"),
            "p_value": row.get("p_value"),
            "term_size": term_size,
            "query_size": query_size,
            "intersection_size": isize,
            "effective_domain_size": eff,
            "precision": row.get("precision"),
            "recall": row.get("recall"),
            "overlap_genes": overlap_genes,
            "fold_enrichment": fold_enrichment,
            "gene_ratio": gene_ratio,
            "rich_factor": rich_factor,
        })

    terms.sort(key=lambda t: (t["source"] or "", t["p_value"] or 1.0))
    return {"terms": terms, "n": len(terms), "sources": sources, "organism": organism,
            "significance_method": significance_method, "user_threshold": user_threshold}
