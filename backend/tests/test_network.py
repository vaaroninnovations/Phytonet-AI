"""Integration tests for the Network Analysis backend endpoints."""
import os
import httpx

BASE = (os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")
GENES = ["TP53", "BRCA1", "MYC", "AKT1", "EGFR", "MAPK1", "PTEN", "KRAS"]


def test_ppi_network():
    r = httpx.post(
        f"{BASE}/api/ppi/network",
        json={"genes": GENES, "required_score": 400},
        timeout=60.0,
    )
    assert r.status_code == 200
    d = r.json()
    assert len(d["nodes"]) > 0
    assert len(d["edges"]) > 0


def test_kegg_enrich():
    r = httpx.post(f"{BASE}/api/kegg/enrich", json={"genes": GENES}, timeout=90.0)
    assert r.status_code == 200
    d = r.json()
    assert d.get("pathways") is not None
    assert len(d["pathways"]) > 0
    row = d["pathways"][0]
    assert "term" in row and "p_value" in row and "gene_count" in row


def test_go_enrich_all_ontologies():
    r = httpx.post(f"{BASE}/api/go/enrich", json={"genes": GENES}, timeout=90.0)
    assert r.status_code == 200
    d = r.json()
    assert d.get("error") is None, d
    terms = d.get("terms") or []
    assert len(terms) > 0
    sources = {t["source"] for t in terms}
    assert "GO:BP" in sources
    row = terms[0]
    assert row["p_value"] is not None
    for g in row["overlap_genes"]:
        assert g in GENES, f"Unexpected overlap gene {g!r}"


def test_go_enrich_has_fold_enrichment_gene_ratio_rich_factor():
    """Iter 17: verify the new GO fields exist and are numeric non-null values."""
    r = httpx.post(f"{BASE}/api/go/enrich", json={"genes": GENES}, timeout=90.0)
    assert r.status_code == 200
    d = r.json()
    terms = d.get("terms") or []
    assert len(terms) > 0
    for t in terms[:20]:
        assert "fold_enrichment" in t, "Missing fold_enrichment"
        assert "gene_ratio" in t, "Missing gene_ratio"
        assert "rich_factor" in t, "Missing rich_factor"
        assert isinstance(t["fold_enrichment"], (int, float))
        assert isinstance(t["gene_ratio"], (int, float))
        assert isinstance(t["rich_factor"], (int, float))
        # Sanity: rich_factor and gene_ratio ∈ [0, 1]; fold_enrichment ≥ 0
        assert 0 <= t["gene_ratio"] <= 1, t["gene_ratio"]
        assert 0 <= t["rich_factor"] <= 1, t["rich_factor"]
        assert t["fold_enrichment"] >= 0


def test_go_enrich_accepts_correction_and_threshold_params():
    """Iter 17: significance_method and user_threshold pass-through."""
    r = httpx.post(
        f"{BASE}/api/go/enrich",
        json={
            "genes": GENES,
            "significance_method": "fdr",
            "user_threshold": 0.01,
        },
        timeout=90.0,
    )
    assert r.status_code == 200
    d = r.json()
    assert d.get("error") is None, d
    # response echoes user params
    assert d.get("significance_method") == "fdr"
    assert d.get("user_threshold") == 0.01
