"""Test that the docking pipeline now generates all publication-grade artifacts:
best_pose (pdbqt + pdb), complex.pdb, interactions.json/.csv, and that the
pose-download endpoint serves each new format.
"""
from __future__ import annotations
import os
import httpx

BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com")
API = f"{BACKEND_URL}/api"


def test_docking_generates_all_visualization_artifacts():
    """Full docking run must return valid job_id + pair_id, and the 7 new
    download formats must all resolve to HTTP 200 with the correct MIME type."""
    payload = {
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets":   [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 2, "num_modes": 3, "box_padding": 6.0,
    }
    with httpx.Client(timeout=300.0) as c:
        r = c.post(f"{API}/docking/run", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        job_id = data["job_id"]
        res = data["results"][0]
        assert not res.get("error"), res.get("error")
        assert res["best_affinity"] < 0     # negative = attractive
        pair_id = res["pair_id"]

        # New interaction detection covers 4 types
        inter = res["interactions"]
        for k in ("hydrogen_bonds", "hydrophobic_contacts", "salt_bridges", "pi_stacking"):
            assert k in inter, f"missing interaction type: {k}"
        assert isinstance(inter.get("all"), list)

        # Download endpoints for all seven formats
        expected_mimes = {
            "pdbqt":             "chemical/x-pdbqt",
            "pdb":               "chemical/x-pdb",
            "best_pdbqt":        "chemical/x-pdbqt",
            "best_pdb":          "chemical/x-pdb",
            "complex_pdb":       "chemical/x-pdb",
            "interactions_json": "application/json",
            "interactions_csv":  "text/csv",
        }
        for fmt, expected_mime in expected_mimes.items():
            resp = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt={fmt}")
            assert resp.status_code == 200, f"{fmt} → HTTP {resp.status_code}"
            assert expected_mime in resp.headers.get("content-type", ""), \
                f"{fmt} MIME mismatch: {resp.headers.get('content-type')}"
            assert len(resp.content) > 0, f"{fmt} empty"

        # complex.pdb must contain both receptor + ligand (chain L / resn LIG)
        cpx = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt=complex_pdb")
        text = cpx.text
        assert "ATOM" in text, "complex.pdb missing receptor ATOM records"
        assert "LIG" in text and " L " in text, "complex.pdb missing ligand chain L / resn LIG"

        # interactions.csv must have proper header and at least one row
        csv = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt=interactions_csv")
        lines = csv.text.strip().splitlines()
        assert lines[0] == "residue,chain,ligand_atom,type,distance_A"
        assert len(lines) >= 2, "no interaction rows in CSV"
