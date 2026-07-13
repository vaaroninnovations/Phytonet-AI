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
