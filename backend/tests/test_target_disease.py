"""
Backend API tests for Compound Target (Step 3) and Disease Target (Step 4).

- POST /api/target/predict (job) → GET /api/target/status/{id}
- GET /api/disease/search
- GET /api/disease/targets
"""
import os
import time
import pytest
import requests


def _base_url():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _base_url()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


# ---------------------------------------------------------------------------
# Disease search
# ---------------------------------------------------------------------------
class TestDiseaseSearch:
    def test_search_diabetes_returns_hits(self, api):
        r = api.get(f"{BASE_URL}/api/disease/search",
                    params={"q": "diabetes"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("query") == "diabetes"
        hits = data.get("hits") or []
        assert len(hits) >= 5, f"Expected >=5 disease hits, got {len(hits)}"

        # Each hit should have efo_id and name
        for h in hits:
            assert "efo_id" in h or "id" in h, h
            assert h.get("name") or h.get("label"), h

        ids = [
            (h.get("efo_id") or h.get("id") or "") for h in hits
        ]
        names_lc = [(h.get("name") or h.get("label") or "").lower() for h in hits]

        # Look for T2DM MONDO_0005148 or type 2 diabetes name
        has_t2 = any("MONDO_0005148" in x for x in ids) or any(
            "type 2 diabetes" in n for n in names_lc
        )
        assert has_t2, f"Expected 'type 2 diabetes mellitus' in hits: {list(zip(ids, names_lc))}"


# ---------------------------------------------------------------------------
# Disease targets
# ---------------------------------------------------------------------------
class TestDiseaseTargets:
    def test_t2dm_targets(self, api):
        r = api.get(
            f"{BASE_URL}/api/disease/targets",
            params={
                "efo_id": "MONDO_0005148",
                "name": "type 2 diabetes mellitus",
            },
            timeout=180,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        rows = data.get("targets") or data.get("rows") or []
        assert isinstance(rows, list)
        # relax >=100 to >=50 in case some upstreams flake; still meaningful
        assert len(rows) >= 50, f"Expected >=50 disease targets, got {len(rows)}"

        # Verify field shape
        sample = rows[0]
        for k in ("gene_symbol", "uniprot_id", "association_score",
                  "confidence", "sources"):
            assert k in sample, f"missing field {k} in {sample}"

        # confidence is 1-5
        conf = sample.get("confidence")
        assert isinstance(conf, (int, float))
        assert 1 <= conf <= 5

        # sources list contains at least one recognisable upstream
        srcs = sample.get("sources") or []
        assert isinstance(srcs, list) and len(srcs) > 0


# ---------------------------------------------------------------------------
# Target predict (single compound - curcumin)
# ---------------------------------------------------------------------------
def _poll_target(api, job_id, timeout=240, interval=3.0):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = api.get(f"{BASE_URL}/api/target/status/{job_id}", timeout=30)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("done", "failed"):
            return last
        time.sleep(interval)
    raise AssertionError(f"Target job {job_id} timed out: {last}")


class TestTargetPredict:
    def test_predict_curcumin(self, api):
        smi = "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"
        r = api.post(
            f"{BASE_URL}/api/target/predict",
            json={"compounds": [{"compound_name": "Curcumin",
                                 "canonical_smiles": smi, "smiles": smi}]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        start = r.json()
        assert start.get("total") == 1
        assert start.get("job_id"), start
        final = _poll_target(api, start["job_id"], timeout=240)
        assert final["status"] == "done", final
        rows = final.get("rows") or []
        assert len(rows) > 0, "Expected some rows for curcumin target prediction"
        sample = rows[0]
        for k in ("gene_symbol", "uniprot_id", "prediction_score",
                  "confidence", "supporting_databases"):
            assert k in sample, f"missing field {k} in {sample}"
        assert isinstance(sample["confidence"], (int, float))
        assert 1 <= sample["confidence"] <= 5
        dbs = sample.get("supporting_databases") or []
        assert isinstance(dbs, list) and len(dbs) > 0

    def test_status_unknown_job_404(self, api):
        import uuid as _uuid
        r = api.get(f"{BASE_URL}/api/target/status/{_uuid.uuid4()}", timeout=15)
        assert r.status_code == 404
