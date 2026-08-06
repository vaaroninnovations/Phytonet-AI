"""AI Research Assistant end-to-end backend tests (Phase 1+2)."""
import io
import os
import time

import pytest
import requests

def _load_backend_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

BASE_URL = _load_backend_url()
EMAIL = "rtest1785979513@phytonetai.com"
PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    return s


# ── Auth guard ───────────────────────────────────────────────
def test_projects_require_auth():
    r = requests.get(f"{BASE_URL}/api/research/projects", timeout=15)
    assert r.status_code in (401, 403)


# ── Project CRUD ─────────────────────────────────────────────
def test_create_list_delete_project(sess):
    c = sess.post(f"{BASE_URL}/api/research/projects", json={"title": "TEST_proj"}, timeout=30)
    assert c.status_code == 200, c.text[:300]
    p = c.json()
    assert "id" in p and p["title"] == "TEST_proj"
    assert p.get("messages") == [] and p.get("runs") == []
    pid = p["id"]

    lst = sess.get(f"{BASE_URL}/api/research/projects", timeout=30)
    assert lst.status_code == 200
    assert any(x["id"] == pid for x in lst.json())

    d = sess.delete(f"{BASE_URL}/api/research/projects/{pid}", timeout=30)
    assert d.status_code == 200 and d.json().get("ok") is True


# ── Intent: chat vs followup vs plan ─────────────────────────
@pytest.fixture(scope="module")
def project(sess):
    r = sess.post(f"{BASE_URL}/api/research/projects", json={"title": "TEST_flow"}, timeout=30)
    assert r.status_code == 200
    pid = r.json()["id"]
    yield pid
    sess.delete(f"{BASE_URL}/api/research/projects/{pid}", timeout=15)


def test_chat_intent(sess, project):
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/message",
                  json={"prompt": "hi how are you"}, timeout=90)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["assistant_message"]["mode"] == "chat"
    assert body.get("run") is None


def test_followup_intent(sess, project):
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/message",
                  json={"prompt": "Predict targets for something"}, timeout=90)
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    mode = body["assistant_message"]["mode"]
    # Accept plan too if Claude decides it can proceed, but common expected = followup/chat
    assert mode in ("followup", "chat", "plan")
    if mode == "followup":
        assert body["assistant_message"].get("text")


# ── Plan + Execute end-to-end ────────────────────────────────
ALLOWED_TOOLS = {"plant_search", "lotus_search", "compound_lookup",
                 "target_resolve", "disease_search", "disease_targets",
                 "admet_predict"}


def test_plan_and_execute_full_flow(sess):
    # Fresh project for isolation
    p = sess.post(f"{BASE_URL}/api/research/projects", json={"title": "TEST_plan_exec"}, timeout=30).json()
    pid = p["id"]
    try:
        r = sess.post(f"{BASE_URL}/api/research/projects/{pid}/message",
                      json={"prompt": "Find phytochemicals from Withania somnifera."},
                      timeout=120)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body["assistant_message"]["mode"] == "plan", body["assistant_message"]
        run = body["run"]
        assert run and run["plan"], "expected non-empty plan steps"
        for step in run["plan"]:
            assert step["tool"] in ALLOWED_TOOLS, step
        run_id = run["id"]

        # Execute
        ex = sess.post(f"{BASE_URL}/api/research/projects/{pid}/execute/{run_id}", timeout=30)
        assert ex.status_code == 200
        assert ex.json()["status"] == "running"

        # Poll until completed or timeout
        deadline = time.time() + 120
        final = None
        while time.time() < deadline:
            time.sleep(3)
            st = sess.get(f"{BASE_URL}/api/research/projects/{pid}/status/{run_id}", timeout=30)
            if st.status_code != 200:
                continue
            j = st.json()
            if j["status"] in ("completed", "failed"):
                final = j
                break
        assert final is not None, "run did not finish within 120s"
        assert final["status"] == "completed", f"run status={final['status']} results={final.get('results')}"
        assert final["results"], "expected populated results[]"
        for step_out in final["results"]:
            assert step_out["status"] == "done", step_out
            assert "card" in (step_out.get("result") or {})
        assert isinstance(final.get("interpretation"), str) and len(final["interpretation"]) > 0
    finally:
        sess.delete(f"{BASE_URL}/api/research/projects/{pid}", timeout=15)


# ── Upload with CSV containing SMILES ────────────────────────
def test_upload_csv_smiles(sess, project):
    csv_bytes = b"name,smiles\naspirin,CC(=O)Oc1ccccc1C(=O)O\ncaffeine,CN1C=NC2=C1C(=O)N(C(=O)N2C)C\n"
    files = {"file": ("compounds.csv", io.BytesIO(csv_bytes), "text/csv")}
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/upload",
                  files=files, timeout=30)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    assert j["kind"] == "csv"
    assert j["name"] == "compounds.csv"
    assert "CC(=O)Oc1ccccc1C(=O)O" in j["extracted"]
    assert "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" in j["extracted"]


# ── Regression: existing endpoints still respond ─────────────
def test_regression_plant_search():
    r = requests.get(f"{BASE_URL}/api/plant/search",
                     params={"plant": "Withania somnifera", "limit": 3}, timeout=60)
    assert r.status_code == 200, r.text[:200]


def test_regression_disease_search():
    r = requests.get(f"{BASE_URL}/api/disease/search",
                     params={"q": "diabetes"}, timeout=45)
    assert r.status_code == 200, r.text[:200]


def test_regression_target_resolve():
    r = requests.get(f"{BASE_URL}/api/target/resolve",
                     params={"query": "EGFR"}, timeout=45)
    assert r.status_code == 200


def test_regression_admet_predict_endpoint():
    r = requests.post(f"{BASE_URL}/api/admet/predict",
                      json={"smiles_list": ["CCO"]}, timeout=45)
    # ADMET may require auth or return job id; accept 200/401/402 (nodes) as "endpoint still exists"
    assert r.status_code in (200, 201, 202, 401, 402, 403), r.status_code


def test_regression_contact_and_admin():
    # Just verify endpoints still exist / respond (challenge required)
    r = requests.get(f"{BASE_URL}/api/contact/challenge", timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/admin/contact/messages", timeout=15)
    assert r2.status_code in (401, 403)
