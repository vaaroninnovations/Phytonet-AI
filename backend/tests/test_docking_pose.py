"""Focused test for the /api/docking/pose download endpoint.

Runs a small aspirin × PTGS1 (1EQG) docking, then downloads the docked pose
in both PDBQT and PDB formats and verifies MIME + Content-Disposition.
"""
import os
import httpx

BASE = (os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")


def test_pose_download_pdbqt_and_pdb():
    r = httpx.post(f"{BASE}/api/docking/run", json={
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets":   [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 4, "num_modes": 5, "box_padding": 6.0,
    }, timeout=300.0)
    assert r.status_code == 200
    data = r.json()
    job_id = data["job_id"]
    pair_id = data["results"][0]["pair_id"]
    assert data["results"][0].get("error") is None

    # PDBQT
    p1 = httpx.get(f"{BASE}/api/docking/pose/{job_id}/{pair_id}", params={"fmt": "pdbqt"}, timeout=30.0)
    assert p1.status_code == 200
    assert "attachment" in (p1.headers.get("content-disposition") or "").lower()
    assert f"{pair_id}.pdbqt" in p1.headers.get("content-disposition", "")
    assert len(p1.content) > 100

    # PDB
    p2 = httpx.get(f"{BASE}/api/docking/pose/{job_id}/{pair_id}", params={"fmt": "pdb"}, timeout=30.0)
    assert p2.status_code == 200
    assert "attachment" in (p2.headers.get("content-disposition") or "").lower()
    assert f"{pair_id}.pdb" in p2.headers.get("content-disposition", "")
    assert len(p2.content) > 100
