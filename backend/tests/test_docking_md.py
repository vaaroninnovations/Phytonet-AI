"""Integration tests for the Molecular Docking + MD backend endpoints."""
import os
import time
import httpx

BASE = (os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")


def test_pdb_candidates_returns_scored_list():
    r = httpx.post(f"{BASE}/api/docking/pdb-candidates",
                   json={"uniprot_ids": ["P04637"], "limit": 3}, timeout=30.0)
    assert r.status_code == 200
    d = r.json()
    cands = d["candidates"]["P04637"]
    assert isinstance(cands, list) and len(cands) > 0
    top = cands[0]
    # Required scoring fields
    for k in ("pdb_id", "resolution", "score", "method", "download_url"):
        assert k in top, f"missing {k}"
    # Sorted by score desc
    for i in range(len(cands) - 1):
        assert cands[i]["score"] >= cands[i + 1]["score"]


def test_docking_run_aspirin_ptgs1():
    r = httpx.post(f"{BASE}/api/docking/run", json={
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets":   [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 4, "num_modes": 5, "box_padding": 6.0,
    }, timeout=300.0)
    assert r.status_code == 200
    d = r.json()
    assert d.get("job_id")
    results = d.get("results") or []
    assert len(results) == 1
    r0 = results[0]
    assert r0.get("error") is None, r0
    assert r0["best_affinity"] < 0    # kcal/mol
    assert len(r0["poses"]) >= 1
    inter = r0.get("interactions") or {}
    assert "hydrogen_bonds" in inter and "hydrophobic_contacts" in inter


def test_md_estimate_scales_with_production_ns():
    r1 = httpx.post(f"{BASE}/api/md/estimate", json={"production_ns": 100}, timeout=15.0)
    r2 = httpx.post(f"{BASE}/api/md/estimate", json={"production_ns": 500}, timeout=15.0)
    assert r1.status_code == 200 and r2.status_code == 200
    d1, d2 = r1.json(), r2.json()
    # 5x production time => 5x wallclock
    assert d2["cpu32"] > 4 * d1["cpu32"]
    assert d2["gpu"] > 4 * d1["gpu"]


def test_md_build_returns_zip_with_all_files():
    r = httpx.post(f"{BASE}/api/md/build", json={
        "compound": {"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"},
        "target":   {"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"},
        "config":   {"production_ns": 50},
    }, timeout=60.0)
    assert r.status_code == 200
    assert r.headers.get("content-type") == "application/zip"
    import zipfile, io
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        names = {n.split("/", 1)[1] for n in zf.namelist() if "/" in n}
        for expected in ("README.md", "minim.mdp", "nvt.mdp", "npt.mdp", "md.mdp",
                         "run_md.sh", "run_md.ps1", "merge_topology.py",
                         "MD_PREPARATION_REPORT.md", "PROJECT_MANIFEST.json",
                         "receptor.pdb", "ligand.smi"):
            assert expected in names, f"missing {expected}"
