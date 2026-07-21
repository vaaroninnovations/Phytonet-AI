"""Auth-service integration tests."""
import uuid
import httpx

from conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_BASE_URL

BASE = TEST_BASE_URL


def test_admin_login_returns_user_profile():
    """Login works when hit as HTTPS (Secure cookies are stripped on plain HTTP)."""
    r = httpx.post(f"{BASE}/api/auth/login",
                   json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
                   timeout=15.0)
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["email"] == TEST_ADMIN_EMAIL
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
                   json={"email": TEST_ADMIN_EMAIL, "password": "wrongpass"},
                   timeout=15.0)
    assert r.status_code == 401
