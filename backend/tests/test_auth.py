"""Auth-service integration tests."""
import os
import uuid
import httpx

BASE = (os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")


def test_admin_login_returns_user_profile():
    """Login works when hit as HTTPS (Secure cookies are stripped on plain HTTP)."""
    r = httpx.post(f"{BASE}/api/auth/login",
                   json={"email": "admin@phytonet.ai", "password": "Admin123!"},
                   timeout=15.0)
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["email"] == "admin@phytonet.ai"
    assert user["role"] == "admin"


def test_register_creates_user_and_verifies_verification_token():
    email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    with httpx.Client() as c:
        r = c.post(f"{BASE}/api/auth/register", json={
            "first_name": "Test", "last_name": "User", "email": email, "password": "Passw0rd!",
            "role": "PhD Scholar", "research_area": "Network Pharmacology",
            "purpose_of_use": ["Research Project"],
        }, timeout=15.0)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["email"] == email
        assert d["verification_required"] is True
        # dev token exposed for tests
        vtoken = d["verification_token_dev"]
        assert vtoken
        # Verify
        vr = c.post(f"{BASE}/api/auth/verify-email", json={"token": vtoken}, timeout=15.0)
        assert vr.status_code == 200


def test_login_wrong_password_returns_401():
    r = httpx.post(f"{BASE}/api/auth/login",
                   json={"email": "admin@phytonet.ai", "password": "wrongpass"},
                   timeout=15.0)
    assert r.status_code == 401
