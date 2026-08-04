"""Backend tests for Contact Us system (public + admin)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "superadmin@phytonet.ai")
ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "SuperAdmin@2026!")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_message_id():
    payload = {
        "name": "TEST Contact User",
        "email": "test_contact_user@example.com",
        "institution": "TEST University",
        "subject": "TEST subject line",
        "message": "This is a TEST inquiry message from pytest backend suite.",
    }
    r = requests.post(f"{BASE_URL}/api/contact", json=payload, timeout=20)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    assert isinstance(j.get("id"), str) and len(j["id"]) > 10
    return j["id"]


# ─── Public POST /api/contact ─────────────────────────────
class TestPublicContact:
    def test_submit_valid(self, created_message_id):
        assert created_message_id

    def test_invalid_email(self):
        r = requests.post(f"{BASE_URL}/api/contact", json={
            "name": "Bad", "email": "not-an-email",
            "subject": "hello", "message": "Some message here"
        }, timeout=20)
        assert r.status_code == 422

    def test_missing_fields(self):
        r = requests.post(f"{BASE_URL}/api/contact", json={"name": "x"}, timeout=20)
        assert r.status_code == 422

    def test_no_auth_required(self):
        # Fresh session no cookies
        r = requests.post(f"{BASE_URL}/api/contact", json={
            "name": "Public User", "email": "pub_test@example.com",
            "subject": "Public sub", "message": "Hello there anonymous"
        }, timeout=20)
        assert r.status_code == 200


# ─── Admin auth guard ─────────────────────────────────────
class TestAdminAuthGuard:
    def test_summary_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/contact/summary", timeout=20)
        assert r.status_code == 401

    def test_messages_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/contact/messages", timeout=20)
        assert r.status_code == 401


# ─── Admin flows ──────────────────────────────────────────
class TestAdminContact:
    def test_summary(self, admin_session, created_message_id):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact/summary", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("total", "new", "read", "replied"):
            assert k in data
        assert data["total"] >= 1

    def test_list_messages(self, admin_session, created_message_id):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact/messages", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and isinstance(data["rows"], list)
        assert data["total"] >= 1

    def test_list_filter_and_search(self, admin_session, created_message_id):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact/messages",
                              params={"status": "new", "q": "TEST subject"}, timeout=20)
        assert r.status_code == 200
        rows = r.json()["rows"]
        assert any(row["id"] == created_message_id for row in rows)

    def test_get_auto_flip_new_to_read(self, admin_session, created_message_id):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact/messages/{created_message_id}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == created_message_id
        assert data["status"] == "read", f"Expected auto-flip to 'read', got {data['status']}"

    def test_patch_status_replied_and_notes(self, admin_session, created_message_id):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/contact/messages/{created_message_id}",
            json={"status": "replied", "admin_notes": "Replied via email."},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "replied"
        assert data["admin_notes"] == "Replied via email."

        # Verify persistence
        g = admin_session.get(f"{BASE_URL}/api/admin/contact/messages/{created_message_id}", timeout=20)
        assert g.status_code == 200
        assert g.json()["status"] == "replied"
        assert g.json()["admin_notes"] == "Replied via email."

    def test_patch_empty_body_returns_400(self, admin_session, created_message_id):
        r = admin_session.patch(
            f"{BASE_URL}/api/admin/contact/messages/{created_message_id}",
            json={}, timeout=20,
        )
        assert r.status_code == 400

    def test_delete_message(self, admin_session, created_message_id):
        r = admin_session.delete(
            f"{BASE_URL}/api/admin/contact/messages/{created_message_id}", timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # Verify 404 on subsequent GET
        g = admin_session.get(
            f"{BASE_URL}/api/admin/contact/messages/{created_message_id}", timeout=20)
        assert g.status_code == 404

    def test_get_invalid_id(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/contact/messages/not-a-valid-oid", timeout=20)
        assert r.status_code == 400
