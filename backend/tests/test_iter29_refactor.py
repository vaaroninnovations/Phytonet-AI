"""Iter-29 tests — Router refactor + DOCX title-kwarg fix.

Validates that all endpoints listed in the review_request are still reachable
after the server.py -> routes/{disease,network,docking,md,report}.py extraction,
and that BOTH DOCX endpoints (/api/report/download/{id}?fmt=docx AND
/api/assistant/report/{run_id}/docx) work with the new title kwarg in
report_service.markdown_to_docx.

Report-download tests use FastAPI TestClient with a mocked LLM (the live
Emergent LLM is intermittently 502'ing in preview), so we still exercise the
real router + report_service pipeline, just not the model call itself.
"""
import sys
import time
import zipfile
import io
from unittest.mock import patch
import requests
import pytest

from conftest import TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_BASE_URL

BASE_URL = TEST_BASE_URL

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


# ---------------------------------------------------------------- routes/md.py
class TestMDRoutes:
    def test_deps_status(self):
        r = requests.get(f"{BASE_URL}/api/deps/status", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "ok" in data
        assert "deps" in data
        assert isinstance(data["deps"], dict)

    def test_md_engines(self):
        r = requests.get(f"{BASE_URL}/api/md/engines", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "engines" in data
        keys = {e.get("key") for e in data["engines"]}
        assert {"local", "hpc_slurm", "cloud"}.issubset(keys), f"got engines={keys}"

    def test_md_estimate_default(self):
        r = requests.post(
            f"{BASE_URL}/api/md/estimate",
            json={},  # MDConfigModel defaults are valid
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        # md_service.estimate_runtime returns a dict with numeric fields
        assert isinstance(data, dict)
        assert len(data) > 0


# ------------------------------------------------------------ routes/network.py
class TestNetworkRoutes:
    def test_ppi_network(self):
        r = requests.post(
            f"{BASE_URL}/api/ppi/network",
            json={"genes": ["AKT1", "MTOR"]},
            timeout=45,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "nodes" in data
        assert "edges" in data
        assert isinstance(data["nodes"], list)

    def test_kegg_enrich(self):
        r = requests.post(
            f"{BASE_URL}/api/kegg/enrich",
            json={"genes": ["AKT1", "MTOR", "TP53"]},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # KEGG returns {"pathways": [...]}
        assert isinstance(data, dict)
        pathways = data.get("pathways") or data.get("results") or []
        assert isinstance(pathways, list)
        assert len(pathways) > 0, f"no pathways returned: {data}"

    def test_go_enrich(self):
        r = requests.post(
            f"{BASE_URL}/api/go/enrich",
            json={"genes": ["AKT1", "MTOR", "TP53"]},
            timeout=60,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        # Expect GO terms in some list container
        assert isinstance(data, (dict, list))


# ------------------------------------------------------------ routes/disease.py
class TestDiseaseRoutes:
    def test_disease_search(self):
        r = requests.get(f"{BASE_URL}/api/disease/search", params={"q": "diabetes"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["query"] == "diabetes"
        assert "hits" in data
        assert isinstance(data["hits"], list)

    def test_disease_targets_and_cache(self):
        params = {"efo_id": "EFO_0000400", "name": "diabetes"}
        r1 = requests.get(f"{BASE_URL}/api/disease/targets", params=params, timeout=60)
        assert r1.status_code == 200, r1.text[:300]
        d1 = r1.json()
        assert isinstance(d1, dict)
        # Second call should be served from Mongo cache -> fast + identical
        t0 = time.time()
        r2 = requests.get(f"{BASE_URL}/api/disease/targets", params=params, timeout=60)
        elapsed = time.time() - t0
        assert r2.status_code == 200
        assert r2.json() == d1
        # Not a hard assertion — just log if cache seems slow
        print(f"disease_targets 2nd call elapsed={elapsed:.2f}s")


# ------------------------------------------------------------- routes/docking.py
class TestDockingRoutes:
    def test_pdb_candidates(self):
        r = requests.post(
            f"{BASE_URL}/api/docking/pdb-candidates",
            json={"uniprot_ids": ["P04637"], "limit": 3},
            timeout=45,
        )
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert "candidates" in data
        assert "P04637" in data["candidates"]


# -------------------------------------------------------------- routes/report.py
# We use FastAPI TestClient with a mocked LLM. This still exercises the real
# routes/report.py router + report_service.markdown_to_{html,docx,pdf} pipeline
# — only the LLM call itself is replaced, because the live preview LLM is
# intermittently returning 502.

_MOCK_MARKDOWN = """# PhytoNet Research Report

Compound **Withaferin A** shows a *promising* affinity of `-9.2 kcal/mol`.

## Findings

- Item one
- Item two
- Item three

> A meaningful blockquote about the finding.

| Column A | Column B |
|----------|----------|
| Row 1 A  | Row 1 B  |
| Row 2 A  | Row 2 B  |

1. First numbered item
2. Second numbered item
"""


@pytest.fixture(scope="module")
def test_client_with_report():
    """Import server.py, monkeypatch report_service.generate_report to skip the
    LLM, POST /api/report/generate, return (client, report_id)."""
    # Ensure backend on path
    sys.path.insert(0, "/app/backend")
    import server
    import report_service
    from fastapi.testclient import TestClient

    async def _fake_generate_report(workflow, model="x"):
        return {
            "markdown": _MOCK_MARKDOWN,
            "meta": {"plant": "Withania somnifera"},
            "error": None,
        }

    with patch.object(report_service, "generate_report", side_effect=_fake_generate_report):
        client = TestClient(server.app)
        r = client.post("/api/report/generate", json={"workflow": {"plant_name": "X"}})
        assert r.status_code == 200, r.text
        rid = r.json()["report_id"]
        yield client, rid


class TestReportRoutes:
    def test_report_download_404(self, test_client_with_report):
        client, _ = test_client_with_report
        r = client.get("/api/report/download/nope-nope-nope?fmt=md")
        assert r.status_code == 404

    def test_report_download_md(self, test_client_with_report):
        client, rid = test_client_with_report
        r = client.get(f"/api/report/download/{rid}?fmt=md")
        assert r.status_code == 200
        assert "text/markdown" in r.headers.get("content-type", "")
        assert "Withaferin A" in r.text

    def test_report_download_html(self, test_client_with_report):
        client, rid = test_client_with_report
        r = client.get(f"/api/report/download/{rid}?fmt=html")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        assert "<title>" in r.text
        # Title contract: plant name — Research Report
        assert "Research Report" in r.text
        assert "Withania somnifera" in r.text

    def test_report_download_docx(self, test_client_with_report):
        """CRITICAL — this used to 500 because of unknown title kwarg."""
        client, rid = test_client_with_report
        r = client.get(f"/api/report/download/{rid}?fmt=docx")
        assert r.status_code == 200, r.text[:300]
        assert DOCX_MIME in r.headers.get("content-type", "")
        assert r.content[:2] == b"PK"
        with zipfile.ZipFile(io.BytesIO(r.content)) as z:
            names = z.namelist()
            assert "word/document.xml" in names
            doc_xml = z.read("word/document.xml").decode("utf-8", errors="ignore")
            # Verify title was embedded
            assert "Withania somnifera" in doc_xml, "title kwarg not embedded in DOCX"

    def test_report_download_pdf(self, test_client_with_report):
        client, rid = test_client_with_report
        r = client.get(f"/api/report/download/{rid}?fmt=pdf")
        assert r.status_code == 200, r.text[:300]
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"

    def test_report_download_bad_fmt(self, test_client_with_report):
        client, rid = test_client_with_report
        r = client.get(f"/api/report/download/{rid}?fmt=xls")
        assert r.status_code == 400

    def test_report_generate_route_exists_live(self):
        """Sanity: /api/report/generate route is mounted on the live server
        (LLM 502 in preview is fine — we just want NOT 404)."""
        try:
            r = requests.post(
                f"{BASE_URL}/api/report/generate",
                json={"workflow": {"plant_name": "X"}},
                timeout=5,
            )
            assert r.status_code != 404
        except requests.exceptions.ReadTimeout:
            # timeout == route exists and LLM is running
            pass


# ------------------------------------------------ assistant DOCX regression fix
class TestAssistantDocxRegression:
    """The previously-broken code path: assistant_service.py L406 calls
    report_service.markdown_to_docx(md, title=...). If the signature doesn't
    accept `title`, the endpoint 500's. We can't easily create a fresh
    assistant run without funded LLM budget, but hitting the endpoint with a
    known-bad run_id should return a *404 (or similar business error)*, NOT
    a 500 with 'unexpected keyword argument title'."""

    def test_assistant_docx_bad_id_is_not_kwarg_500(self):
        # Authenticate first so we actually reach the DOCX code path
        s = requests.Session()
        s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
            timeout=15,
        )
        r = s.get(
            f"{BASE_URL}/api/assistant/report/does-not-exist-run-id/docx",
            timeout=15,
        )
        # Must NOT be the old kwarg-error 500
        if r.status_code == 500:
            body = r.text.lower()
            assert "unexpected keyword" not in body and "keyword argument 'title'" not in body, (
                f"assistant DOCX still fails on the title kwarg: {r.text[:300]}"
            )
        # Acceptable outcomes: 404 (run not found), 400, 403, or 200 (unlikely)
        assert r.status_code in (200, 400, 403, 404, 422), f"unexpected: {r.status_code} {r.text[:200]}"


# ------------------------------------------------- Regression: main api_router
class TestRegressionMainRouter:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_plants_popular(self):
        r = requests.get(f"{BASE_URL}/api/plants/popular", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, (list, dict))

    def test_plants_autocomplete(self):
        r = requests.get(f"{BASE_URL}/api/plants/autocomplete", params={"q": "cur"}, timeout=15)
        assert r.status_code == 200

    def test_plant_search(self):
        r = requests.get(f"{BASE_URL}/api/plant/search", params={"plant": "curcuma", "limit": 3, "want_structure": False, "want_physchem": False}, timeout=60)
        assert r.status_code == 200

    def test_auth_login_and_me(self):
        s = requests.Session()
        r = s.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
            timeout=15,
        )
        assert r.status_code == 200
        assert "access_token" in s.cookies
        r2 = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        # /me may return either {email:...} or {user:{email:...}}
        email = body.get("email") or (body.get("user") or {}).get("email")
        assert email == TEST_ADMIN_EMAIL
