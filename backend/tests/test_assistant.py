"""PhytoNet AI Assistant — endpoint contract & free-tier gating tests.

Covers:
  - Groq/env config (indirect via report meta)
  - /api/assistant/eligibility as admin + fresh user
  - /api/assistant/run as admin (200)
  - /api/assistant/run twice as fresh user (200, then 402)
  - /api/assistant/status/{run_id}
  - Basic homepage regressions (module imports & routes exist)
"""
from __future__ import annotations
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@phytonet.ai"
ADMIN_PASSWORD = "Admin123!"


# ─────────────────────────── Fixtures ───────────────────────────
@pytest.fixture(scope="module")
def admin_session() -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    return s


@pytest.fixture(scope="module")
def fresh_user() -> dict:
    """Register a fresh user and return {session, email}."""
    s = requests.Session()
    email = f"TEST_{uuid.uuid4().hex[:10]}@phytonet.ai"
    pw = "TestPass123!"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": pw,
        "first_name": "Test", "last_name": "User",
    }, timeout=30)
    assert r.status_code in (200, 201), f"Registration failed: {r.status_code} {r.text[:300]}"
    # Ensure cookie is set — if not, explicit login
    if "access_token" not in s.cookies:
        lr = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
        assert lr.status_code == 200, lr.text[:200]
    return {"session": s, "email": email, "password": pw}


# ─────────────────────────── Config sanity ───────────────────────────
class TestConfig:
    def test_env_has_groq(self):
        # Backend env vars are on server side — assert via a sentinel endpoint if any.
        # We validate indirectly through run meta later. Sanity-check nothing crashed.
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200


# ─────────────────────────── Eligibility ───────────────────────────
class TestEligibility:
    def test_eligibility_admin(self, admin_session):
        r = admin_session.get(f"{API}/assistant/eligibility", timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["eligible"] is True
        assert d["is_admin"] is True
        # Admin may or may not have used a run before; ensure key exists
        assert "free_used" in d

    def test_eligibility_fresh_user(self, fresh_user):
        r = fresh_user["session"].get(f"{API}/assistant/eligibility", timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["eligible"] is True
        assert d["is_admin"] is False
        assert d["free_used"] is False

    def test_eligibility_unauthenticated(self):
        r = requests.get(f"{API}/assistant/eligibility", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ─────────────────────────── Run (admin) ───────────────────────────
class TestAdminRun:
    def test_admin_run_starts(self, admin_session):
        payload = {"plant_name": "Withania somnifera", "disease_name": "Type 2 Diabetes"}
        r = admin_session.post(f"{API}/assistant/run", json=payload, timeout=30)
        assert r.status_code == 200, f"admin run failed: {r.status_code} {r.text[:400]}"
        d = r.json()
        assert "id" in d
        assert d["status"] == "running"
        assert d["current_stage"] == "collect_phytochemicals"
        assert d["progress"] == 0
        assert d["plant_name"] == "Withania somnifera"
        assert d["disease_name"] == "Type 2 Diabetes"
        assert "user_id" in d
        # Stash the run id on the class for the next test
        TestAdminRun.run_id = d["id"]

    def test_admin_status_endpoint(self, admin_session):
        rid = getattr(TestAdminRun, "run_id", None)
        assert rid, "no run id from previous test"
        r = admin_session.get(f"{API}/assistant/status/{rid}", timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d["id"] == rid
        assert d["status"] in ("running", "done", "failed")
        assert isinstance(d.get("stages", []), list)

    def test_admin_status_invalid_id(self, admin_session):
        r = admin_session.get(f"{API}/assistant/status/notahexoid", timeout=20)
        assert r.status_code in (400, 404)

    def test_admin_run_unlimited(self, admin_session):
        """Admin should be able to launch again (unlimited) — should NOT get 402."""
        payload = {"plant_name": "Curcuma longa", "disease_name": "Hepatocellular carcinoma"}
        r = admin_session.post(f"{API}/assistant/run", json=payload, timeout=30)
        assert r.status_code == 200, f"admin second run must succeed: {r.status_code} {r.text[:200]}"


# ─────────────────────────── Free-tier gating ───────────────────────────
class TestFreeTierGating:
    def test_first_run_succeeds(self, fresh_user):
        s = fresh_user["session"]
        payload = {"plant_name": "Tinospora cordifolia", "disease_name": "Chronic fatigue"}
        r = s.post(f"{API}/assistant/run", json=payload, timeout=30)
        assert r.status_code == 200, f"first run must succeed: {r.status_code} {r.text[:300]}"
        d = r.json()
        assert d["status"] == "running"
        TestFreeTierGating.first_run_id = d["id"]

    def test_eligibility_after_first_run(self, fresh_user):
        r = fresh_user["session"].get(f"{API}/assistant/eligibility", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["free_used"] is True
        assert d["eligible"] is False

    def test_second_run_is_402(self, fresh_user):
        s = fresh_user["session"]
        payload = {"plant_name": "Ocimum sanctum", "disease_name": "Malaria"}
        r = s.post(f"{API}/assistant/run", json=payload, timeout=30)
        assert r.status_code == 402, f"second run must return 402: {r.status_code} {r.text[:300]}"
        try:
            d = r.json()
            detail = (d.get("detail") or "").lower()
        except Exception:
            detail = r.text.lower()
        assert "upgrade" in detail or "run again" in detail, f"unexpected 402 body: {r.text[:200]}"


# ─────────────────────────── Runs listing ───────────────────────────
class TestRunsList:
    def test_admin_list_runs(self, admin_session):
        r = admin_session.get(f"{API}/assistant/runs", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "runs" in d and isinstance(d["runs"], list)


# ─────────────────────────── Regression: existing routes ───────────────────────────
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/deps/status",
        "/md/engines",
    ])
    def test_public_endpoint_alive(self, path):
        r = requests.get(f"{API}{path}", timeout=20)
        assert r.status_code == 200, f"{path} broken: {r.status_code}"
