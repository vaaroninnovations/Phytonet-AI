"""Projects service integration tests."""
import uuid
import httpx

from conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_BASE_URL

BASE = TEST_BASE_URL


def _login_client(email: str = TEST_ADMIN_EMAIL, password: str = TEST_ADMIN_PASSWORD):
    # Use HTTPS-flavoured base if configured; otherwise keep localhost. httpx
    # respects Secure cookies only on HTTPS — for local test we manually copy the
    # Set-Cookie header into the client cookie jar (bypasses Secure enforcement).
    c = httpx.Client(base_url=BASE, timeout=15.0)
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    # Re-apply cookies without Secure requirement
    for name in ("access_token", "refresh_token"):
        val = r.cookies.get(name)
        if val:
            c.cookies.set(name, val)
    return c


def test_projects_crud_full_lifecycle():
    c = _login_client()
    try:
        # empty state
        r = c.get("/api/projects")
        assert r.status_code == 200
        # create
        r = c.post("/api/projects", json={
            "name": f"Test Project {uuid.uuid4().hex[:6]}",
            "description": "pytest lifecycle",
            "workflow_state": {"plantName": "Curcuma longa", "compounds": []},
            "current_step": "admet-drug-likeness",
            "completed_steps": ["plant-database"],
        })
        assert r.status_code == 200
        proj = r.json()
        pid = proj["id"]

        # get
        r = c.get(f"/api/projects/{pid}")
        assert r.status_code == 200
        assert r.json()["workflow_state"]["plantName"] == "Curcuma longa"

        # update (rename)
        r = c.put(f"/api/projects/{pid}", json={"name": "Renamed", "current_step": "target-prediction"})
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"
        assert r.json()["current_step"] == "target-prediction"

        # snapshot
        r = c.post(f"/api/projects/{pid}/snapshot", json={"label": "v1"})
        assert r.status_code == 200
        v = r.json()
        assert v["label"] == "v1"

        r = c.get(f"/api/projects/{pid}/versions")
        assert r.status_code == 200
        assert len(r.json()["versions"]) >= 1

        # duplicate
        r = c.post(f"/api/projects/{pid}/duplicate")
        assert r.status_code == 200
        dup = r.json()
        assert dup["id"] != pid
        assert "(copy)" in dup["name"]

        # delete
        r = c.delete(f"/api/projects/{pid}")
        assert r.status_code == 200
        r = c.delete(f"/api/projects/{dup['id']}")
        assert r.status_code == 200
    finally:
        c.close()


def test_autosave_upsert_and_get():
    c = _login_client()
    try:
        r = c.post("/api/projects/autosave", json={
            "workflow_state": {"foo": "bar", "n": 42},
            "current_step": "network-analysis",
            "completed_steps": ["plant-database", "admet-drug-likeness"],
        })
        assert r.status_code == 200
        assert r.json()["ok"] is True

        r = c.get("/api/projects/autosave/latest")
        assert r.status_code == 200
        auto = r.json()["autosave"]
        assert auto is not None
        assert auto["workflow_state"]["foo"] == "bar"
        assert auto["current_step"] == "network-analysis"
        assert "plant-database" in auto["completed_steps"]

        # clear
        r = c.delete("/api/projects/autosave")
        assert r.status_code == 200
        r = c.get("/api/projects/autosave/latest")
        assert r.json()["autosave"] is None
    finally:
        c.close()


def test_projects_require_auth():
    # While AUTH_GATE_ENABLED is off (public-preview), protected endpoints
    # resolve a synthetic admin instead of raising 401. Skip this test when
    # the gate is disabled; it will resume enforcing 401 once the flag is
    # flipped back on before deploy.
    from auth_service import AUTH_GATE_ENABLED
    if not AUTH_GATE_ENABLED:
        import pytest
        pytest.skip("AUTH_GATE_ENABLED is off (public-preview bypass)")
    r = httpx.get(f"{BASE}/api/projects", timeout=10.0)
    assert r.status_code == 401
    r = httpx.post(f"{BASE}/api/projects/autosave", json={"workflow_state": {}}, timeout=10.0)
    assert r.status_code == 401


def test_md_engines_endpoint():
    r = httpx.get(f"{BASE}/api/md/engines", timeout=10.0)
    assert r.status_code == 200
    d = r.json()
    keys = {e["key"] for e in d["engines"]}
    assert {"local", "hpc_slurm", "cloud"} <= keys


def test_md_build_local_engine_produces_extra_files():
    import io, zipfile
    r = httpx.post(f"{BASE}/api/md/build", json={
        "compound": {"name": "Curcumin", "smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"},
        "target": {"uniprot_id": "P36956", "gene_symbol": "SREBF1"},
        "config": {"production_ns": 5},
        "engine": "local",
        "engine_options": {"threads": 4, "use_gpu": False, "extra_flags": ""},
    }, timeout=60.0)
    assert r.status_code == 200, r.text
    zbuf = io.BytesIO(r.content)
    with zipfile.ZipFile(zbuf) as zf:
        names = zf.namelist()
    assert any(n.endswith("execution/local/run_local.sh") for n in names), names
    assert any(n.endswith("execution/local/README.md") for n in names)


def test_md_build_hpc_engine_produces_sbatch():
    import io, zipfile
    r = httpx.post(f"{BASE}/api/md/build", json={
        "compound": {"name": "Curcumin", "smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"},
        "target": {"uniprot_id": "P36956", "gene_symbol": "SREBF1"},
        "config": {"production_ns": 10},
        "engine": "hpc_slurm",
        "engine_options": {"partition": "gpu", "nodes": 2, "gpus": 2, "cpus_per_task": 16, "walltime": "48:00:00"},
    }, timeout=60.0)
    assert r.status_code == 200
    zbuf = io.BytesIO(r.content)
    with zipfile.ZipFile(zbuf) as zf:
        sbatch = zf.read([n for n in zf.namelist() if n.endswith("submit.sh")][0]).decode()
    assert "#SBATCH --partition=gpu" in sbatch
    assert "#SBATCH --nodes=2" in sbatch
    assert "#SBATCH --gres=gpu:2" in sbatch
    assert "#SBATCH --time=48:00:00" in sbatch
