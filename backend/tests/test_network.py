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
