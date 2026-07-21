"""Iteration 28 backend tests — Google OAuth + SSE Docking."""
import re
import requests

from conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_BASE_URL

BASE_URL = TEST_BASE_URL


# ----- Google OAuth -----
class TestGoogleOAuth:
    def test_status_configured(self):
        r = requests.get(f"{BASE_URL}/api/auth/google/status", timeout=10)
        assert r.status_code == 200
        assert r.json() == {"configured": True}

    def test_login_redirect(self):
        r = requests.get(
            f"{BASE_URL}/api/auth/google/login?next=/molecular-docking",
            allow_redirects=False, timeout=10,
        )
        assert r.status_code == 302
        loc = r.headers.get("Location", "")
        assert loc.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
        assert "client_id=555143244587-" in loc
        assert "redirect_uri=https%3A%2F%2Fherbal-nexus.preview.emergentagent.com%2Fauth%2Fgoogle%2Fcallback" in loc
        assert re.search(r"scope=openid[+ ]email[+ ]profile", loc)
        assert "response_type=code" in loc
        assert re.search(r"state=[A-Za-z0-9_-]{16,}", loc)

    def test_callback_bad_state_returns_400(self):
        r = requests.get(
            f"{BASE_URL}/api/auth/google/callback?code=abc&state=INVALIDSTATE",
            allow_redirects=False, timeout=10,
        )
        assert r.status_code == 400
        assert "Invalid OAuth state" in r.json().get("detail", "")


# ----- SSE Docking -----
class TestDockingSSE:
    def test_docking_run_stream(self):
        payload = {
            "compounds": [{"name": "Aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
            "targets": [{"uniprot_id": "P23219", "gene_symbol": "PTGS1"}],
            "exhaustiveness": 4, "num_modes": 3, "box_padding": 8,
        }
        with requests.post(
            f"{BASE_URL}/api/docking/run/stream",
            json=payload,
            headers={"Accept": "text/event-stream"},
            stream=True, timeout=60,
        ) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("Content-Type", "")
            body = r.text
        assert "event: queued" in body
        assert '"total": 1' in body
        assert "event: pair_start" in body
        assert '"compound": "Aspirin"' in body
        assert '"target": "PTGS1"' in body
        assert "event: pair_done" in body
        assert '"best_affinity"' in body
        assert "event: done" in body


# ----- Regression: auth still works -----
class TestAuthRegression:
    def test_admin_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
            timeout=10,
        )
        assert r.status_code == 200
        assert "access_token" in r.cookies

    def test_deps_status(self):
        r = requests.get(f"{BASE_URL}/api/deps/status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "deps" in data
        # vina, obabel, rdkit, meeko should all be ok
        for dep in ["vina", "obabel", "rdkit", "meeko"]:
            assert data["deps"].get(dep, {}).get("ok") is True, f"{dep} not ok"
