"""Iter 20 additional coverage: cloud engine, restore-version, resend-verification-public, engine options schema."""
from __future__ import annotations
import io
import uuid
import zipfile
import httpx

from conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_BASE_URL

BASE = TEST_BASE_URL


def _login_client(email: str = TEST_ADMIN_EMAIL, password: str = TEST_ADMIN_PASSWORD):
    c = httpx.Client(base_url=BASE, timeout=20.0)
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    for name in ("access_token", "refresh_token"):
        val = r.cookies.get(name)
        if val:
            c.cookies.set(name, val)
    return c


# ------------------------ MD Engines ------------------------

def test_md_engines_have_options_schema():
    r = httpx.get(f"{BASE}/api/md/engines", timeout=10.0)
    assert r.status_code == 200
    data = r.json()
    engines = {e["key"]: e for e in data["engines"]}
    assert {"local", "hpc_slurm", "cloud"} <= set(engines.keys())
    for key in ("local", "hpc_slurm", "cloud"):
        eng = engines[key]
        assert "options" in eng, f"engine {key} missing options: {eng}"
        # options must be dict-like schema (list of fields or dict)
        assert eng["options"] is not None


def test_md_build_cloud_engine_aws_produces_dispatch_and_readme():
    r = httpx.post(f"{BASE}/api/md/build", json={
        "compound": {"name": "Curcumin", "smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"},
        "target": {"uniprot_id": "P36956", "gene_symbol": "SREBF1"},
        "config": {"production_ns": 5},
        "engine": "cloud",
        "engine_options": {"provider": "aws"},
    }, timeout=60.0)
    assert r.status_code == 200, r.text
    with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
        names = zf.namelist()
    assert any(n.endswith("execution/cloud/aws/README.md") for n in names), f"missing aws README in: {names}"
    assert any(n.endswith("execution/cloud/aws/dispatch.json") for n in names) or any(
        n.endswith("execution/cloud/dispatch.json") for n in names
    ), f"missing dispatch.json in: {names}"


# ------------------------ Projects: restore-version ------------------------

def test_project_restore_version_reverts_state():
    c = _login_client()
    try:
        # create project
        r = c.post("/api/projects", json={
            "name": f"RestoreTest {uuid.uuid4().hex[:5]}",
            "description": "restore test",
            "workflow_state": {"plantName": "Original", "note": "v1"},
            "current_step": "plant-database",
            "completed_steps": [],
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]

        # snapshot v1
        r = c.post(f"/api/projects/{pid}/snapshot", json={"label": "v1"})
        assert r.status_code == 200, r.text
        v1 = r.json()
        version_id = v1.get("id") or v1.get("version_id") or v1.get("_id")
        # Fallback: fetch versions and pick first
        if not version_id:
            r = c.get(f"/api/projects/{pid}/versions")
            versions = r.json()["versions"]
            version_id = versions[0].get("id") or versions[0].get("version_id")
        assert version_id, f"no version id in snapshot response: {v1}"

        # update project state
        r = c.put(f"/api/projects/{pid}", json={
            "workflow_state": {"plantName": "Changed", "note": "v2"},
            "current_step": "network-analysis",
        })
        assert r.status_code == 200
        assert r.json()["workflow_state"]["plantName"] == "Changed"

        # restore
        r = c.post(f"/api/projects/{pid}/restore/{version_id}")
        assert r.status_code == 200, r.text

        # verify state reverted
        r = c.get(f"/api/projects/{pid}")
        assert r.status_code == 200
        state = r.json()["workflow_state"]
        assert state.get("plantName") == "Original", f"restore failed: {state}"

        # cleanup
        c.delete(f"/api/projects/{pid}")
    finally:
        c.close()


# ------------------------ Auth: register with email_provider ------------------------

def test_register_returns_email_provider_field():
    email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    r = httpx.post(f"{BASE}/api/auth/register", json={
        "email": email,
        "password": "TestPass123!",
        "first_name": "Test",
        "last_name": "User",
        "role": "researcher",
        "area_of_research": "phytochemistry",
        "referral_source": "search",
        "purpose": ["exploration"],
    }, timeout=15.0)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert "email_provider" in body, f"missing email_provider in: {body}"
    assert "verification_token_dev" in body, f"missing verification_token_dev in: {body}"


# ------------------------ Auth: resend-verification-public ------------------------

def test_resend_verification_public_flow():
    email = f"resend_{uuid.uuid4().hex[:8]}@example.com"
    password = "Resend123!"
    # register but do not verify
    r = httpx.post(f"{BASE}/api/auth/register", json={
        "email": email,
        "password": password,
        "first_name": "Resend",
        "last_name": "Tester",
        "role": "researcher",
        "area_of_research": "phytochemistry",
        "referral_source": "search",
        "purpose": ["exploration"],
    }, timeout=15.0)
    assert r.status_code in (200, 201), r.text

    # wrong password → 401
    r = httpx.post(f"{BASE}/api/auth/resend-verification-public", json={
        "email": email, "password": "WRONG!!!"
    }, timeout=15.0)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text}"

    # correct password → 200 + fresh dev token
    r = httpx.post(f"{BASE}/api/auth/resend-verification-public", json={
        "email": email, "password": password
    }, timeout=15.0)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "verification_token_dev" in body, f"missing verification_token_dev in: {body}"
    assert body["verification_token_dev"], "empty verification_token_dev"
