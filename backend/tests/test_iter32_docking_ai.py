"""Iter32 — verify extended interaction detection, composite classification,
AI interpretation endpoint, and new download formats for the molecular
docking module.

Runs a single aspirin × PTGS1 (P23219 / 1EQG) docking and reuses the resulting
job_id + pair_id across all sub-tests via a module fixture (docking is ~30-60 s
and we don't want to repeat it).
"""
from __future__ import annotations
import os
import re
import json
import httpx
import pytest

BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
API = f"{BACKEND_URL}/api"

_ALLOWED_CLASSES = {"Excellent", "Very Good", "Good", "Moderate", "Weak", "Failed"}
_INTERACTION_KEYS = {
    "hydrogen_bonds", "hydrophobic_contacts", "salt_bridges",
    "pi_stacking", "pi_cation", "metal_coordination", "van_der_waals",
}


# ── Shared fixture: run docking exactly once for the module ──
@pytest.fixture(scope="module")
def docking_run():
    payload = {
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets":   [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 2, "num_modes": 3, "box_padding": 6.0,
    }
    with httpx.Client(timeout=300.0) as c:
        r = c.post(f"{API}/docking/run", json=payload)
        assert r.status_code == 200, f"docking/run failed: HTTP {r.status_code} — {r.text[:300]}"
        data = r.json()
        assert data.get("job_id"), "job_id missing"
        assert data.get("results"), "results missing"
        assert not data["results"][0].get("error"), f"docking error: {data['results'][0].get('error')}"
    return data


# ── Assertion 1 & 2: classification object shape + class in enum ──
def test_docking_result_has_classification_object(docking_run):
    res = docking_run["results"][0]
    cls = res.get("classification")
    assert cls is not None, "classification field missing from result"
    assert isinstance(cls, dict), "classification must be a dict"
    for key in ("score", "class", "ligand_efficiency", "n_hbonds",
                "n_hydrophobic", "n_pi", "n_salt", "recommend_md"):
        assert key in cls, f"classification missing key: {key}"
    assert cls["class"] in _ALLOWED_CLASSES, f"class '{cls['class']}' not in {_ALLOWED_CLASSES}"
    # ligand efficiency should be negative (better ⇒ more negative)
    assert isinstance(cls["ligand_efficiency"], (int, float))
    assert isinstance(cls["score"], (int, float))
    assert isinstance(cls["recommend_md"], bool)


# ── Assertion 3: interactions dict has 7 keys + `all` list ──
def test_interactions_has_seven_types_plus_all(docking_run):
    res = docking_run["results"][0]
    inter = res.get("interactions") or {}
    for key in _INTERACTION_KEYS:
        assert key in inter, f"interactions missing key: {key}"
        assert isinstance(inter[key], list), f"interactions[{key}] must be a list"
    assert "all" in inter and isinstance(inter["all"], list), "interactions.all must be a list"
    # For aspirin × PTGS1 (small uncharged aromatic ligand):
    #   6-10 H-bonds, 8-15 hydrophobic, likely 0 salt / pi_stacking / metal_coord
    n_hb = len(inter["hydrogen_bonds"])
    n_hp = len(inter["hydrophobic_contacts"])
    assert n_hb > 0 or n_hp > 0, f"expected at least some interactions, got hb={n_hb}, hp={n_hp}"


# ── Assertion 4: AI interpretation endpoint returns proper markdown ──
def test_docking_interpret_returns_markdown(docking_run):
    job_id = docking_run["job_id"]
    pair_id = docking_run["results"][0]["pair_id"]
    with httpx.Client(timeout=30.0) as c:
        r = c.get(f"{API}/docking/interpret/{job_id}/{pair_id}")
    # 502 is documented as expected if Groq quota is exceeded
    if r.status_code == 502:
        pytest.skip(f"Groq quota / provider error (documented as acceptable): {r.text[:200]}")
    assert r.status_code == 200, f"interpret → HTTP {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert body.get("pair_id") == pair_id
    assert body.get("job_id") == job_id
    interp = body.get("interpretation") or ""
    assert isinstance(interp, str)
    assert len(interp) >= 100, f"interpretation too short: {len(interp)} chars"
    # Must contain at least one of the four bold section headers
    header_patterns = [r"\*\*Biological", r"\*\*Key binding",
                       r"\*\*.*mechanism", r"\*\*MD recommendation"]
    found = [p for p in header_patterns if re.search(p, interp, re.IGNORECASE)]
    assert found, (
        f"interpretation missing all bold section headers. First 400 chars:\n{interp[:400]}"
    )
    # classification + counts must be present
    assert "classification" in body and isinstance(body["classification"], dict)
    counts = body.get("counts") or {}
    for k in ("hbonds", "hydrophobic", "pi", "salt_bridges"):
        assert k in counts, f"counts missing key: {k}"


# ── Assertion 5: 404 on nonexistent job/pair ──
def test_docking_interpret_404_on_missing_pair():
    with httpx.Client(timeout=15.0) as c:
        r = c.get(f"{API}/docking/interpret/nonexistent_job/nonexistent_pair")
    assert r.status_code == 404, f"expected 404 for missing pair, got {r.status_code} — {r.text[:200]}"


# ── Assertion 6: ligand_pdbqt download format ──
def test_download_ligand_pdbqt_format(docking_run):
    job_id = docking_run["job_id"]
    pair_id = docking_run["results"][0]["pair_id"]
    with httpx.Client(timeout=30.0) as c:
        r = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt=ligand_pdbqt")
    assert r.status_code == 200, f"ligand_pdbqt → {r.status_code}: {r.text[:200]}"
    assert "chemical/x-pdbqt" in r.headers.get("content-type", ""), \
        f"wrong MIME: {r.headers.get('content-type')}"
    assert len(r.content) > 0, "ligand_pdbqt empty"


# ── Assertion 7: classification_json download format ──
def test_download_classification_json_format(docking_run):
    job_id = docking_run["job_id"]
    pair_id = docking_run["results"][0]["pair_id"]
    with httpx.Client(timeout=30.0) as c:
        r = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt=classification_json")
    assert r.status_code == 200, f"classification_json → {r.status_code}: {r.text[:200]}"
    assert "application/json" in r.headers.get("content-type", ""), \
        f"wrong MIME: {r.headers.get('content-type')}"
    body = json.loads(r.content)
    assert body.get("class") in _ALLOWED_CLASSES
    assert "score" in body and "ligand_efficiency" in body


# ── Assertion 8: regression — /api/deps/status + existing formats + render 300 DPI ──
def test_deps_status_regression():
    with httpx.Client(timeout=15.0) as c:
        r = c.get(f"{API}/deps/status")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True, f"deps.ok not true: {body}"


@pytest.mark.parametrize("fmt,expected_mime", [
    ("pdbqt", "chemical/x-pdbqt"),
    ("pdb", "chemical/x-pdb"),
    ("best_pdbqt", "chemical/x-pdbqt"),
    ("best_pdb", "chemical/x-pdb"),
    ("complex_pdb", "chemical/x-pdb"),
    ("interactions_json", "application/json"),
    ("interactions_csv", "text/csv"),
])
def test_existing_download_formats_still_work(docking_run, fmt, expected_mime):
    job_id = docking_run["job_id"]
    pair_id = docking_run["results"][0]["pair_id"]
    with httpx.Client(timeout=30.0) as c:
        r = c.get(f"{API}/docking/pose/{job_id}/{pair_id}?fmt={fmt}")
    assert r.status_code == 200, f"{fmt} → {r.status_code}: {r.text[:200]}"
    assert expected_mime in r.headers.get("content-type", ""), \
        f"{fmt} MIME mismatch: got {r.headers.get('content-type')}"
    assert len(r.content) > 0, f"{fmt} empty"


def test_render_endpoint_300dpi_still_works(docking_run):
    job_id = docking_run["job_id"]
    pair_id = docking_run["results"][0]["pair_id"]
    with httpx.Client(timeout=120.0) as c:
        r = c.get(f"{API}/docking/render/{job_id}/{pair_id}?fmt=png&dpi=300")
    assert r.status_code == 200
    assert "image/png" in r.headers.get("content-type", "")
    # PNG magic bytes
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"
