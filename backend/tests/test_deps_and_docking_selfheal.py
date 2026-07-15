"""Iteration 31: Verify deps_check self-heal + docking end-to-end.

This test covers the bug fix where /api/docking/run returned HTTP 503
'missing required dependencies: vina' when the preview pod was rebuilt
without autodock-vina in the base image. deps_check.py now runs
`apt-get install autodock-vina openbabel gromacs` on startup when a
required binary is missing (gated by AUTO_INSTALL_MISSING_DEPS env var).

We test:
 1) GET /api/deps/status  → ok:true, no missing required, vina/obabel/gmx OK
 2) POST /api/docking/run (aspirin × PTGS1) → HTTP 200, best_affinity<0
 3) GET  /api/docking/pose/{job_id}/{pair_id}?fmt=complex_pdb → HTTP 200
 4) GET  /api/docking/render/{job_id}/{pair_id}?dpi=300&fmt=png → 200 + image/png
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Frontend .env holds the public preview URL
    from pathlib import Path
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- 1) /api/deps/status ---------------------------------------------------


def test_deps_status_ok(session):
    r = session.get(f"{BASE_URL}/api/deps/status", timeout=30)
    assert r.status_code == 200, f"deps/status returned {r.status_code}: {r.text[:400]}"
    data = r.json()
    assert data.get("ok") is True, f"deps not ok: {data}"
    assert data.get("missing_required") == [], f"missing required: {data.get('missing_required')}"


def test_deps_vina_ok(session):
    r = session.get(f"{BASE_URL}/api/deps/status", timeout=30)
    deps = r.json().get("deps", {})
    vina = deps.get("vina", {})
    assert vina.get("ok") is True, f"vina not ok: {vina}"
    assert vina.get("path"), f"vina path missing: {vina}"
    # Path should be something like /bin/vina or /usr/bin/vina
    assert "vina" in vina["path"], f"unexpected vina path: {vina['path']}"
    ver = (vina.get("version") or "").lower()
    assert "v1.2" in ver, f"vina version does not contain 'v1.2': {vina.get('version')}"


def test_deps_obabel_ok(session):
    r = session.get(f"{BASE_URL}/api/deps/status", timeout=30)
    obabel = r.json().get("deps", {}).get("obabel", {})
    assert obabel.get("ok") is True, f"obabel not ok: {obabel}"


def test_deps_gmx_ok(session):
    r = session.get(f"{BASE_URL}/api/deps/status", timeout=30)
    gmx = r.json().get("deps", {}).get("gmx", {})
    assert gmx.get("ok") is True, f"gmx not ok: {gmx}"


# --- 2) POST /api/docking/run ---------------------------------------------


@pytest.fixture(scope="module")
def docking_job(session):
    """Run aspirin × PTGS1 docking once and reuse the job for downstream tests."""
    payload = {
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets": [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 2,
        "num_modes": 3,
        "box_padding": 6.0,
    }
    r = session.post(f"{BASE_URL}/api/docking/run", json=payload, timeout=600)
    assert r.status_code == 200, f"docking/run returned {r.status_code}: {r.text[:800]}"
    return r.json()


def test_docking_run_returns_200_not_503(docking_job):
    # The very bug from the report — 503 must NOT be returned now
    assert "job_id" in docking_job, f"missing job_id: {docking_job}"


def test_docking_run_response_shape(docking_job):
    data = docking_job
    assert data.get("job_id"), "job_id missing/empty"
    assert isinstance(data["job_id"], str)
    results = data.get("results")
    assert isinstance(results, list) and len(results) == 1, f"results shape: {results}"
    res0 = results[0]
    # best_affinity < 0 (docking scores are negative kcal/mol)
    assert isinstance(res0.get("best_affinity"), (int, float)), f"best_affinity type: {res0.get('best_affinity')}"
    assert res0["best_affinity"] < 0, f"best_affinity not negative: {res0['best_affinity']}"
    assert isinstance(res0.get("pair_id"), str) and res0["pair_id"], "pair_id missing"
    poses = res0.get("poses")
    assert isinstance(poses, list) and len(poses) >= 1, f"poses missing/empty: {poses}"
    inter = res0.get("interactions") or {}
    for k in ("hydrogen_bonds", "hydrophobic_contacts", "salt_bridges", "pi_stacking"):
        assert k in inter, f"interactions missing key {k}: keys={list(inter.keys())}"


# --- 3) GET /api/docking/pose ---------------------------------------------


def test_docking_pose_complex_pdb(session, docking_job):
    job_id = docking_job["job_id"]
    pair_id = docking_job["results"][0]["pair_id"]
    r = session.get(
        f"{BASE_URL}/api/docking/pose/{job_id}/{pair_id}",
        params={"fmt": "complex_pdb"}, timeout=60,
    )
    assert r.status_code == 200, f"pose returned {r.status_code}: {r.text[:400]}"
    body = r.content
    assert len(body) > 0, "empty pose body"
    # Sanity: should contain ATOM/HETATM lines (PDB format)
    txt = body[:4000].decode("utf-8", errors="ignore")
    assert ("ATOM" in txt or "HETATM" in txt), f"pose body does not look like PDB: {txt[:200]}"


# --- 4) GET /api/docking/render (server-side hi-DPI PNG) ------------------


def test_docking_render_png_300dpi(session, docking_job):
    job_id = docking_job["job_id"]
    pair_id = docking_job["results"][0]["pair_id"]
    r = session.get(
        f"{BASE_URL}/api/docking/render/{job_id}/{pair_id}",
        params={"dpi": 300, "fmt": "png"}, timeout=120,
    )
    assert r.status_code == 200, f"render returned {r.status_code}: {r.text[:400]}"
    ctype = r.headers.get("content-type", "")
    assert ctype.startswith("image/png"), f"unexpected content-type: {ctype}"
    body = r.content
    assert len(body) > 500, f"png body suspiciously small: {len(body)}"
    # PNG magic bytes
    assert body[:8] == b"\x89PNG\r\n\x1a\n", f"not a valid PNG signature: {body[:8]!r}"
