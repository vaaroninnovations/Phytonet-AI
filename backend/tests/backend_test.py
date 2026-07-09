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


# ---------------------------------------------------------------------------
# Plants autocomplete + popular + Mongo cache
# ---------------------------------------------------------------------------
class TestPlantsAutocomplete:
    def test_empty_query_returns_seeded_matches(self, api):
        """q empty => popular/seeded plants list, at least 5 items."""
        r = api.get(
            f"{BASE_URL}/api/plants/autocomplete",
            params={"q": "", "limit": 6},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "matches" in data
        assert isinstance(data["matches"], list)
        assert len(data["matches"]) >= 5, (
            f"Expected >=5 seeded plants, got {len(data['matches'])}"
        )
        # Each match has required fields
        for m in data["matches"]:
            assert "name" in m
            assert "search_count" in m
            assert "imppat_hits" in m
            assert isinstance(m["name"], str)
            assert isinstance(m["search_count"], int)

    def test_prefix_cur_matches_curcuma(self, api):
        """q=cur should return Curcuma entries; prefix matches ranked first."""
        r = api.get(
            f"{BASE_URL}/api/plants/autocomplete",
            params={"q": "cur", "limit": 8},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        matches = data["matches"]
        assert len(matches) > 0
        names = [m["name"] for m in matches]
        # At least one Curcuma-ish name
        assert any("cur" in n.lower() for n in names), f"No 'cur' match: {names}"
        # Prefix ranked first: first result should start with 'cur' (case-insensitive)
        assert names[0].lower().startswith("cur"), (
            f"First match should be prefix match, got '{names[0]}' in {names}"
        )

    def test_prefix_withan_matches_withania(self, api):
        r = api.get(
            f"{BASE_URL}/api/plants/autocomplete",
            params={"q": "withan", "limit": 5},
            timeout=15,
        )
        assert r.status_code == 200
        names = [m["name"] for m in r.json()["matches"]]
        assert any("Withania somnifera" == n for n in names), (
            f"'Withania somnifera' not in {names}"
        )


class TestPlantsPopular:
    def test_popular_valid_json(self, api):
        r = api.get(
            f"{BASE_URL}/api/plants/popular",
            params={"limit": 5},
            timeout=15,
        )
        assert r.status_code == 200
        data = r.json()
        assert "plants" in data
        assert isinstance(data["plants"], list)
        # If any items exist, they must have search_count >= 1
        for p in data["plants"]:
            assert "name" in p
            assert p.get("search_count", 0) >= 1


class TestPlantSearchCache:
    """Second call for same plant should be a Mongo cache hit (<500ms)."""

    def test_curcuma_longa_cached_second_call(self, api):
        params = {"plant": "Curcuma longa", "limit": 3}
        # First call — may populate the cache (could already be cached from prior test)
        t0 = time.time()
        r1 = api.get(f"{BASE_URL}/api/plant/search", params=params, timeout=90)
        e1 = time.time() - t0
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1.get("imppat_count", 0) > 0

        # Second call — must be cache hit
        t1 = time.time()
        r2 = api.get(f"{BASE_URL}/api/plant/search", params=params, timeout=30)
        e2 = time.time() - t1
        assert r2.status_code == 200
        d2 = r2.json()
        assert d1 == d2, "Cached payload differs from initial"
        assert e2 < 0.5, (
            f"Second (cached) call took {e2:.3f}s (>500ms). "
            f"First call: {e1:.3f}s"
        )

    def test_search_indexes_plant_into_autocomplete(self, api):
        """After a successful plant search, that plant is indexed and searchable."""
        # Trigger a search (may be cached from previous test, that's fine — index is set on first hit)
        api.get(
            f"{BASE_URL}/api/plant/search",
            params={"plant": "Curcuma longa", "limit": 3},
            timeout=90,
        )
        # Curcuma longa should now show up in autocomplete for 'curcuma'
        r = api.get(
            f"{BASE_URL}/api/plants/autocomplete",
            params={"q": "curcuma longa", "limit": 5},
            timeout=15,
        )
        assert r.status_code == 200
        matches = r.json()["matches"]
        target = next(
            (m for m in matches if m["name"].lower() == "curcuma longa"), None
        )
        assert target is not None, f"Curcuma longa not indexed: {matches}"
        assert target["search_count"] >= 1
        assert target["imppat_hits"] >= 1
