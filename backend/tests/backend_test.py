"""
Backend API tests for Dr. / Network Pharmacology.

Covers:
- /api/health
- /api/plant/search (IMPPAT scraping + LOTUS simple)
- /api/lotus/simple, /api/lotus/exact, /api/lotus/substructure, /api/lotus/molweight
- Input validation (422 responses)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://herbal-nexus.preview.emergentagent.com",
).rstrip("/")


def _read_frontend_env_backend_url():
    """Prefer REACT_APP_BACKEND_URL from /app/frontend/.env if available."""
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    return BASE_URL


BASE_URL = _read_frontend_env_backend_url()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    return s


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class TestHealth:
    def test_health_ok(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"


# ---------------------------------------------------------------------------
# Plant search (IMPPAT + LOTUS)
# ---------------------------------------------------------------------------
class TestPlantSearch:
    def test_plant_search_curcuma_longa(self, api):
        t0 = time.time()
        r = api.get(
            f"{BASE_URL}/api/plant/search",
            params={"plant": "Curcuma longa", "limit": 5},
            timeout=90,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 60, f"Response took {elapsed:.1f}s (>60s)"
        data = r.json()
        # top-level counts
        assert "imppat_count" in data
        assert "lotus_count" in data
        assert "total_listing" in data
        assert isinstance(data.get("compounds"), list)
        assert data["imppat_count"] > 0, "Expected IMPPAT hits for Curcuma longa"
        # inspect at least one IMPPAT compound
        imppat = [c for c in data["compounds"] if c.get("source") == "IMPPAT"]
        assert len(imppat) > 0, "No IMPPAT-sourced compound in response"
        sample = imppat[0]
        assert sample.get("compound_name"), "compound_name missing"
        assert sample.get("imppat_id", "").startswith("IMPHY"), (
            f"imppat_id should start with IMPHY, got {sample.get('imppat_id')}"
        )
        # Check that at least one of the enriched imppat rows has full details
        enriched = [
            c for c in imppat
            if c.get("smiles") and c.get("inchi") and c.get("inchi_key")
            and c.get("molecular_formula") and c.get("molecular_weight") is not None
        ]
        assert len(enriched) > 0, (
            "Expected at least one IMPPAT compound with smiles/inchi/inchi_key/"
            "molecular_formula/molecular_weight populated"
        )
        e = enriched[0]
        assert isinstance(e["molecular_weight"], (int, float))
        # simple formula sanity: starts with a letter, contains digits
        assert any(ch.isalpha() for ch in e["molecular_formula"])

    def test_plant_search_missing_param_422(self, api):
        r = api.get(f"{BASE_URL}/api/plant/search", timeout=15)
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# LOTUS wrappers
# ---------------------------------------------------------------------------
def _retry_get(api, url, params, timeout, retries=1):
    """Retry once for upstream 502s (LOTUS occasionally flakes)."""
    for attempt in range(retries + 1):
        r = api.get(url, params=params, timeout=timeout)
        if r.status_code != 502:
            return r
        time.sleep(2)
    return r


class TestLotusSimple:
    def test_simple_curcumin(self, api):
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/simple",
            {"query": "curcumin"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "compounds" in data
        assert isinstance(data["compounds"], list)
        assert len(data["compounds"]) > 0, "Expected at least one lotus match for curcumin"
        # At least one populated LTS id
        ids = [c.get("lotus_id") for c in data["compounds"] if c.get("lotus_id")]
        assert any(str(x).startswith("LTS") for x in ids), (
            f"No lotus_id starting with LTS found; got sample={ids[:3]}"
        )
        # smiles/inchi/inchikey exist for at least one row
        has_struct = any(
            c.get("smiles") and c.get("inchi") and c.get("inchi_key")
            for c in data["compounds"]
        )
        assert has_struct, "No compound has smiles+inchi+inchi_key populated"


class TestLotusExact:
    def test_exact_smiles_curcumin(self, api):
        smiles = "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/exact",
            {"type": "smiles", "value": smiles},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "compounds" in data
        assert isinstance(data["compounds"], list)

    def test_exact_invalid_type_422(self, api):
        r = api.get(
            f"{BASE_URL}/api/lotus/exact",
            params={"type": "notatype", "value": "foo"},
            timeout=15,
        )
        assert r.status_code == 422


class TestLotusSubstructure:
    def test_substructure_phenol(self, api):
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/substructure",
            {"smiles": "c1ccccc1O", "algorithm": "default", "max_hits": 10},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("compounds"), list)


class TestLotusMolweight:
    def test_molweight_range(self, api):
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/molweight",
            {"minMass": 800, "maxMass": 1000, "maxHits": 5},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("compounds"), list)
