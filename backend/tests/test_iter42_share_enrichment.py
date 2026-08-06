"""Iteration 42 backend tests:
- Pathway enrichment tool
- Share / Public share endpoints
- Redaction of user_id from public share
"""
import os
import time
import requests
import pytest


def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE = _load_base()
EMAIL = "rtest1785979513@phytonetai.com"
PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def project(session):
    r = session.post(f"{BASE}/api/research/projects",
                     json={"title": "TEST_iter42"}, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    session.delete(f"{BASE}/api/research/projects/{pid}", timeout=30)


def _run_plan(session, pid, prompt, timeout=180):
    r = session.post(f"{BASE}/api/research/projects/{pid}/message",
                     json={"prompt": prompt}, timeout=60)
    assert r.status_code == 200, r.text
    run = r.json().get("run")
    assert run, f"planner did not return run: {r.json()}"
    run_id = run["id"]
    e = session.post(f"{BASE}/api/research/projects/{pid}/execute/{run_id}",
                     timeout=30)
    assert e.status_code == 200, e.text
    deadline = time.time() + timeout
    payload = None
    while time.time() < deadline:
        s = session.get(
            f"{BASE}/api/research/projects/{pid}/status/{run_id}", timeout=30)
        assert s.status_code == 200
        payload = s.json()
        if payload["status"] in ("completed", "failed"):
            break
        time.sleep(3)
    return payload


def test_pathway_enrichment(session, project):
    payload = _run_plan(session, project,
        "Run pathway enrichment for these genes: AKT1, EGFR, TP53, TNF, IL6",
        timeout=180)
    assert payload["status"] == "completed", payload
    enr = [s for s in payload["results"]
           if s.get("tool") == "pathway_enrichment"]
    assert enr, f"no pathway_enrichment step in {payload['results']}"
    step = enr[0]
    assert step["status"] == "done", step
    data = (step.get("result") or {}).get("data") or {}
    kegg = data.get("kegg") or []
    go = data.get("go") or []
    assert len(kegg) > 0, f"no KEGG rows: {data}"
    assert len(go) > 0, f"no GO rows: {data}"
    row = kegg[0]
    assert any(k in row for k in ("p_value", "pvalue", "p", "P-value")), row


def test_share_enable_and_public_access(session, project):
    r = session.post(f"{BASE}/api/research/projects/{project}/share", timeout=30)
    assert r.status_code == 200, r.text
    slug = r.json()["share_slug"]
    assert slug and len(slug) > 5
    assert r.json()["share_path"] == f"/research/shared/{slug}"

    # public GET with a fresh (unauthenticated) requests session
    pub = requests.get(f"{BASE}/api/research/shared/{slug}", timeout=30)
    assert pub.status_code == 200, pub.text
    body = pub.json()
    assert "user_id" not in body, "user_id leaked in shared payload"
    assert body.get("title")
    assert "messages" in body
    assert "runs" in body

    # disable
    d = session.delete(f"{BASE}/api/research/projects/{project}/share", timeout=30)
    assert d.status_code == 200
    gone = requests.get(f"{BASE}/api/research/shared/{slug}", timeout=30)
    assert gone.status_code == 404


def test_public_share_no_auth_required(session, project):
    r = session.post(f"{BASE}/api/research/projects/{project}/share", timeout=30)
    slug = r.json()["share_slug"]
    pub = requests.get(f"{BASE}/api/research/shared/{slug}", timeout=30)
    assert pub.status_code == 200
