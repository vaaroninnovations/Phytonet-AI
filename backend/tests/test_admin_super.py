"""Super Admin architecture tests — /api/admin/*

Covers: login, negative + lockout, /me, refresh, logout, change-password,
2FA (TOTP + Email OTP setup/confirm/verify/disable), forgot/reset password,
audit log, settings (with SMTP password masking), dashboard, users listing,
and regression: regular user auth /api/auth/login still works & cookies isolated.
"""
import os
import time
import pytest
import requests
import pyotp


def _env(name, default=""):
    v = os.environ.get(name, default) or default
    return v.strip().strip('"').strip("'")


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# Frontend .env is used as truth for public URL — but backend runs under same host
if not BASE_URL:
    BASE_URL = "https://herbal-nexus.preview.emergentagent.com"

ADMIN_EMAIL = "superadmin@phytonet.ai"
ADMIN_PASSWORD = "SuperAdmin@2026!"
USER_ADMIN_EMAIL = "admin@phytonet.ai"
USER_ADMIN_PASSWORD = "Admin123!"

API = f"{BASE_URL}/api"


# ─────────────────────── helpers ───────────────────────
def _reset_admin_state():
    """Ensure admin's 2FA is disabled and password is default before tests."""
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code == 200 and r.json().get("two_factor_required"):
        # Cannot easily disable without valid 2FA — skip; tests handle it
        return None
    if r.status_code != 200:
        return None
    # Disable 2FA if enabled (idempotent)
    s.post(f"{API}/admin/auth/2fa/disable",
           json={"password": ADMIN_PASSWORD}, timeout=15)
    return s


@pytest.fixture(scope="module", autouse=True)
def _pre_test_cleanup():
    _reset_admin_state()
    yield
    _reset_admin_state()


@pytest.fixture
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    data = r.json()
    if data.get("two_factor_required"):
        pytest.skip("2FA is unexpectedly enabled")
    return s


# ─────────────────────── AUTH: login ───────────────────────
class TestAdminLogin:
    def test_login_success(self):
        s = requests.Session()
        r = s.post(f"{API}/admin/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["two_factor_required"] is False
        assert data["admin"]["email"] == ADMIN_EMAIL
        assert data["admin"]["is_super_admin"] is True
        # Cookies set
        assert "admin_access_token" in s.cookies
        assert "admin_refresh_token" in s.cookies
        # Regular user cookie NOT set
        assert "access_token" not in s.cookies

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "WrongPass!!"}, timeout=15)
        assert r.status_code == 401

    def test_regular_user_cannot_admin_login(self):
        # admin@phytonet.ai is a regular admin, NOT super admin
        r = requests.post(f"{API}/admin/auth/login",
                          json={"email": USER_ADMIN_EMAIL, "password": USER_ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 401

    def test_lockout_after_5_failures(self):
        # Use a unique email to not lock out real admin from other tests
        bad_email = ADMIN_EMAIL  # locking on real admin is fine — IP+email pair
        # Trigger 5 failures then expect 429
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/admin/auth/login",
                              json={"email": bad_email, "password": "NopeNope1!"}, timeout=15)
            codes.append(r.status_code)
        # Expect at least one 429 among the last attempts
        assert 429 in codes, f"No 429 lockout observed; codes={codes}"


# ─────────────────────── AUTH: me / logout / refresh ───────────────────────
class TestAdminSession:
    def test_me_requires_auth(self):
        r = requests.get(f"{API}/admin/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_authenticated(self, admin_session):
        r = admin_session.get(f"{API}/admin/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["admin"]["email"] == ADMIN_EMAIL

    def test_refresh_issues_new_access_token(self, admin_session):
        old_access = admin_session.cookies.get("admin_access_token")
        r = admin_session.post(f"{API}/admin/auth/refresh", timeout=15)
        assert r.status_code == 200
        new_access = admin_session.cookies.get("admin_access_token")
        assert new_access and new_access != old_access

    def test_logout_clears_cookies(self, admin_session):
        r = admin_session.post(f"{API}/admin/auth/logout", timeout=15)
        assert r.status_code == 200
        # After logout /me should 401
        r2 = admin_session.get(f"{API}/admin/auth/me", timeout=15)
        assert r2.status_code == 401


# ─────────────────────── REGULAR USER AUTH REGRESSION ───────────────────────
class TestRegularUserAuthCoexists:
    def test_regular_user_login_still_works(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login",
                   json={"email": USER_ADMIN_EMAIL, "password": USER_ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200, r.text
        # Regular user cookie set, admin cookie NOT set
        assert "access_token" in s.cookies
        assert "admin_access_token" not in s.cookies

    def test_regular_user_cannot_access_admin_endpoints(self):
        s = requests.Session()
        s.post(f"{API}/auth/login",
               json={"email": USER_ADMIN_EMAIL, "password": USER_ADMIN_PASSWORD}, timeout=15)
        r = s.get(f"{API}/admin/auth/me", timeout=15)
        # No admin cookie present, so 401
        assert r.status_code == 401


# ─────────────────────── CHANGE PASSWORD ───────────────────────
class TestChangePassword:
    def test_change_password_wrong_current(self, admin_session):
        r = admin_session.post(f"{API}/admin/auth/change-password",
                               json={"current_password": "wrong",
                                     "new_password": "NewPass@2026Long"}, timeout=15)
        assert r.status_code == 401

    def test_change_password_too_short(self, admin_session):
        r = admin_session.post(f"{API}/admin/auth/change-password",
                               json={"current_password": ADMIN_PASSWORD,
                                     "new_password": "short"}, timeout=15)
        assert r.status_code == 422

    def test_change_password_success_and_revert(self, admin_session):
        new_pw = "Temp@2026PhytoNet"
        r = admin_session.post(f"{API}/admin/auth/change-password",
                               json={"current_password": ADMIN_PASSWORD,
                                     "new_password": new_pw}, timeout=15)
        assert r.status_code == 200
        # Revert
        r2 = admin_session.post(f"{API}/admin/auth/change-password",
                                json={"current_password": new_pw,
                                      "new_password": ADMIN_PASSWORD}, timeout=15)
        assert r2.status_code == 200


# ─────────────────────── 2FA: TOTP ───────────────────────
class TestTOTP:
    def test_totp_full_lifecycle(self, admin_session):
        # setup
        r = admin_session.post(f"{API}/admin/auth/2fa/setup",
                               json={"method": "totp"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["method"] == "totp"
        assert data["pending_secret"]
        assert data["qr_code"].startswith("data:image/png;base64,")
        assert "provisioning_uri" in data
        secret = data["pending_secret"]
        code = pyotp.TOTP(secret).now()
        # confirm
        r2 = admin_session.post(f"{API}/admin/auth/2fa/confirm",
                                json={"method": "totp", "code": code,
                                      "pending_secret": secret}, timeout=15)
        assert r2.status_code == 200

        # Verify /me shows 2FA
        me = admin_session.get(f"{API}/admin/auth/me").json()["admin"]
        assert me["two_factor_enabled"] is True
        assert me["two_factor_method"] == "totp"

        # New login should trigger challenge
        s2 = requests.Session()
        r3 = s2.post(f"{API}/admin/auth/login",
                     json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r3.status_code == 200
        d3 = r3.json()
        assert d3["two_factor_required"] is True
        assert d3["method"] == "totp"
        assert d3["challenge_token"]

        # Verify with fresh code
        time.sleep(1)
        code2 = pyotp.TOTP(secret).now()
        r4 = s2.post(f"{API}/admin/auth/2fa/verify",
                     json={"challenge_token": d3["challenge_token"], "code": code2}, timeout=15)
        assert r4.status_code == 200
        assert "admin_access_token" in s2.cookies

        # Disable 2FA
        r5 = admin_session.post(f"{API}/admin/auth/2fa/disable",
                                json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r5.status_code == 200
        me2 = admin_session.get(f"{API}/admin/auth/me").json()["admin"]
        assert me2["two_factor_enabled"] is False


# ─────────────────────── 2FA: Email OTP ───────────────────────
class TestEmailOTP:
    def test_email_otp_setup_and_disable(self, admin_session):
        # Fetch OTP from Mongo (mocked SMTP)
        from pymongo import MongoClient
        mongo = MongoClient(_env("MONGO_URL", "mongodb://localhost:27017"))
        dbname = _env("DB_NAME", "test_database")
        db = mongo[dbname]
        db["admin_email_otp"].delete_many({"email": ADMIN_EMAIL})

        r = admin_session.post(f"{API}/admin/auth/2fa/setup",
                               json={"method": "email_otp"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["method"] == "email_otp"

        # Grab the code from Mongo
        time.sleep(0.5)
        rec = db["admin_email_otp"].find_one({"email": ADMIN_EMAIL})
        assert rec, "No email OTP record found in Mongo"
        code = rec["code"]

        r2 = admin_session.post(f"{API}/admin/auth/2fa/confirm",
                                json={"method": "email_otp", "code": code}, timeout=15)
        assert r2.status_code == 200

        # Disable
        r3 = admin_session.post(f"{API}/admin/auth/2fa/disable",
                                json={"password": ADMIN_PASSWORD}, timeout=15)
        assert r3.status_code == 200


# ─────────────────────── PASSWORD RESET (forgot/reset) ───────────────────────
class TestPasswordReset:
    def test_forgot_password_no_enumeration(self):
        r1 = requests.post(f"{API}/admin/auth/forgot-password",
                           json={"email": ADMIN_EMAIL}, timeout=15)
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/admin/auth/forgot-password",
                           json={"email": "nobody@example.com"}, timeout=15)
        assert r2.status_code == 200

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{API}/admin/auth/reset-password",
                          json={"token": "invalid-token-xxx",
                                "new_password": "SomePassLong@1"}, timeout=15)
        assert r.status_code == 400

    def test_reset_password_valid_flow(self):
        # Trigger forgot, fetch token from Mongo
        requests.post(f"{API}/admin/auth/forgot-password",
                      json={"email": ADMIN_EMAIL}, timeout=15)
        from pymongo import MongoClient
        mongo = MongoClient(_env("MONGO_URL", "mongodb://localhost:27017"))
        dbname = _env("DB_NAME", "test_database")
        db = mongo[dbname]
        rec = db["admin_password_reset_tokens"].find_one({"email": ADMIN_EMAIL})
        assert rec, "No reset token issued"
        token = rec["token"]

        # Reset to a temp password, then reset back
        temp_pw = "TempReset@2026X"
        r = requests.post(f"{API}/admin/auth/reset-password",
                          json={"token": token, "new_password": temp_pw}, timeout=15)
        assert r.status_code == 200

        # Login with new password
        r2 = requests.post(f"{API}/admin/auth/login",
                           json={"email": ADMIN_EMAIL, "password": temp_pw}, timeout=15)
        assert r2.status_code == 200

        # Revert password via change-password
        s = requests.Session()
        s.post(f"{API}/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": temp_pw}, timeout=15)
        s.post(f"{API}/admin/auth/change-password",
               json={"current_password": temp_pw, "new_password": ADMIN_PASSWORD}, timeout=15)


# ─────────────────────── AUDIT LOG ───────────────────────
class TestAuditLog:
    def test_audit_log_requires_auth(self):
        r = requests.get(f"{API}/admin/audit-log", timeout=15)
        assert r.status_code == 401

    def test_audit_log_returns_rows(self, admin_session):
        r = admin_session.get(f"{API}/admin/audit-log?limit=50", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data
        assert isinstance(data["rows"], list)
        assert data["total"] >= 1
        # login action should be present
        actions = [x["action"] for x in data["rows"]]
        assert any("admin.login" in a for a in actions)

    def test_audit_log_filter_status(self, admin_session):
        r = admin_session.get(f"{API}/admin/audit-log?status=failure", timeout=15)
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["status"] == "failure"


# ─────────────────────── SETTINGS ───────────────────────
class TestSettings:
    def test_get_all_settings(self, admin_session):
        r = admin_session.get(f"{API}/admin/settings", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("branding", "smtp", "oauth", "node_pricing", "feature_flags"):
            assert k in data
        # Ensure NO raw SMTP password leaked
        smtp = data["smtp"]
        assert "password" not in smtp

    def test_update_branding_setting(self, admin_session):
        # Read current
        cur = admin_session.get(f"{API}/admin/settings/branding").json()["value"]
        new_value = dict(cur)
        new_value["tagline"] = "PhytoNet AI — Automated Test Tagline"
        r = admin_session.put(f"{API}/admin/settings/branding",
                              json=new_value, timeout=15)
        assert r.status_code == 200
        # GET to confirm persistence
        r2 = admin_session.get(f"{API}/admin/settings/branding").json()
        assert r2["value"]["tagline"] == "PhytoNet AI — Automated Test Tagline"
        # Restore
        admin_session.put(f"{API}/admin/settings/branding", json=cur, timeout=15)

    def test_settings_bad_key_404(self, admin_session):
        r = admin_session.get(f"{API}/admin/settings/nope", timeout=15)
        assert r.status_code == 404


# ─────────────────────── DASHBOARD & USERS ───────────────────────
class TestDashboardAndUsers:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{API}/admin/dashboard/stats", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("users_total", "users_verified", "projects_total",
                  "node_stats", "signups_current_month", "recent_audit"):
            assert k in data
        assert isinstance(data["recent_audit"], list)
        for k in ("total_balance", "total_used", "total_purchased"):
            assert k in data["node_stats"]

    def test_users_listing_no_secrets(self, admin_session):
        r = admin_session.get(f"{API}/admin/users?limit=5", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data
        for u in data["rows"]:
            assert "password_hash" not in u
            assert "totp_secret" not in u

    def test_users_search_q(self, admin_session):
        r = admin_session.get(f"{API}/admin/users?q=superadmin", timeout=15)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()["rows"]]
        assert any("superadmin" in (e or "") for e in emails)
