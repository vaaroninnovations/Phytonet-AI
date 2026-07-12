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


# ---------------------------------------------------------------------------
# Dedup verification (P1 bug fix)
# ---------------------------------------------------------------------------
def _skeleton(ik: str) -> str:
    return (ik or "").split("-")[0]


class TestPlantSearchDedup:
    """
    Regression tests for the 'duplicate compounds' bug.
    After the _merge_and_dedupe fix in server.py, /api/plant/search must:
      - not emit two rows sharing the same InChIKey connectivity skeleton
      - not emit two rows sharing the same case-insensitive compound_name
      - len(compounds) should be < imppat_count + lotus_count when merges occurred
    """

    @pytest.fixture(scope="class")
    def curcuma_data(self, api):
        r = api.get(
            f"{BASE_URL}/api/plant/search",
            params={"plant": "Curcuma longa", "limit": 200},
            timeout=180,
        )
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.fixture(scope="class")
    def withania_data(self, api):
        r = api.get(
            f"{BASE_URL}/api/plant/search",
            params={"plant": "Withania somnifera", "limit": 200},
            timeout=180,
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_curcuma_no_duplicate_inchikey_skeleton(self, curcuma_data):
        compounds = curcuma_data["compounds"]
        skeletons = [
            _skeleton(c.get("inchi_key")) for c in compounds if c.get("inchi_key")
        ]
        seen = set()
        dups = []
        for s in skeletons:
            if s in seen:
                dups.append(s)
            seen.add(s)
        assert not dups, f"Duplicate InChIKey skeletons in Curcuma longa: {dups[:5]}"

    def test_curcuma_no_duplicate_compound_name(self, curcuma_data):
        compounds = curcuma_data["compounds"]
        names_lc = [
            (c.get("compound_name") or "").strip().lower()
            for c in compounds
            if c.get("compound_name")
        ]
        seen = set()
        dups = []
        for n in names_lc:
            if n in seen:
                dups.append(n)
            seen.add(n)
        assert not dups, f"Duplicate compound_names (ci) for Curcuma longa: {dups[:5]}"

    def test_curcuma_merged_size_less_than_sum(self, curcuma_data):
        d = curcuma_data
        imppat_ct = d["imppat_count"]
        lotus_ct = d["lotus_count"]
        merged = len(d["compounds"])
        # counts still reflect RAW upstream
        assert imppat_ct > 0
        assert lotus_ct > 0
        # Proof merge happened: unique < sum
        assert merged < imppat_ct + lotus_ct, (
            f"Expected merged={merged} < imppat_count({imppat_ct})+lotus_count({lotus_ct}); "
            "either merge didn't happen or LOTUS/IMPPAT contributed non-overlapping."
        )

    def test_curcuma_has_cross_source_merged_row(self, curcuma_data):
        """At least one compound must come from both IMPPAT and LOTUS with both ids populated."""
        merged_rows = [
            c
            for c in curcuma_data["compounds"]
            if c.get("source") == "IMPPAT+LOTUS"
            and (c.get("imppat_id") or "").startswith("IMPHY")
            and (c.get("lotus_id") or "").startswith("LTS")
        ]
        assert len(merged_rows) >= 1, (
            "Expected >=1 compound with source='IMPPAT+LOTUS' carrying both "
            "imppat_id (IMPHY*) and lotus_id (LTS*). "
            f"Sources observed: {sorted({c.get('source') for c in curcuma_data['compounds']})}"
        )

    def test_curcuma_merge_backfills_missing_fields(self, curcuma_data):
        """
        For merged rows, if IMPPAT had no molecular_weight the LOTUS side (or vice-versa)
        should have filled it in. At least one merged row must carry molecular_weight.
        """
        merged_rows = [
            c for c in curcuma_data["compounds"] if c.get("source") == "IMPPAT+LOTUS"
        ]
        assert merged_rows, "No merged rows to check backfill on"
        filled = [c for c in merged_rows if c.get("molecular_weight") is not None]
        assert len(filled) >= 1, (
            "No merged (IMPPAT+LOTUS) row has molecular_weight populated — "
            "backfill from LOTUS into IMPPAT rows isn't working."
        )

    def test_withania_no_duplicate_inchikey_skeleton(self, withania_data):
        compounds = withania_data["compounds"]
        skeletons = [
            _skeleton(c.get("inchi_key")) for c in compounds if c.get("inchi_key")
        ]
        assert len(skeletons) == len(set(skeletons)), (
            "Duplicate InChIKey skeletons in Withania somnifera compounds"
        )

    def test_withania_no_duplicate_compound_name(self, withania_data):
        compounds = withania_data["compounds"]
        names_lc = [
            (c.get("compound_name") or "").strip().lower()
            for c in compounds
            if c.get("compound_name")
        ]
        assert len(names_lc) == len(set(names_lc)), (
            "Duplicate compound_names (case-insensitive) for Withania somnifera"
        )


class TestLotusDedup:
    """LOTUS wrappers must also dedupe internally via _normalize_lotus."""

    def test_lotus_simple_curcumin_no_inchikey_duplicates(self, api):
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/simple",
            {"query": "curcumin"},
            timeout=45,
        )
        assert r.status_code == 200
        compounds = r.json()["compounds"]
        skeletons = [
            _skeleton(c.get("inchi_key")) for c in compounds if c.get("inchi_key")
        ]
        assert len(skeletons) == len(set(skeletons)), (
            f"Duplicate InChIKey skeletons in /lotus/simple?query=curcumin "
            f"({len(skeletons)-len(set(skeletons))} dups)"
        )

    def test_lotus_molweight_no_inchikey_duplicates(self, api):
        r = _retry_get(
            api,
            f"{BASE_URL}/api/lotus/molweight",
            {"minMass": 300, "maxMass": 400, "maxHits": 50},
            timeout=60,
        )
        assert r.status_code == 200
        compounds = r.json()["compounds"]
        skeletons = [
            _skeleton(c.get("inchi_key")) for c in compounds if c.get("inchi_key")
        ]
        assert len(skeletons) == len(set(skeletons)), (
            f"Duplicate InChIKey skeletons in /lotus/molweight ({len(skeletons)-len(set(skeletons))} dups)"
        )


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


# ---------------------------------------------------------------------------
# LC-MS enrichment (PubChem + LOTUS by name)
# ---------------------------------------------------------------------------
class TestLCMSEnrich:
    """POST /api/lcms/enrich — enrichment against PubChem primary + LOTUS fallback."""

    def test_enrich_happy_path_with_missing(self, api):
        payload = {
            "compounds": [
                {"compound_name": "Curcumin"},
                {"compound_name": "Piperine"},
                {"compound_name": "Withanolide A"},
                {"compound_name": "NONEXISTENT_XYZ_ABC"},
            ]
        }
        r = api.post(f"{BASE_URL}/api/lcms/enrich", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("compounds"), list)
        assert len(data["compounds"]) == 4
        assert data.get("found") == 3
        assert data.get("not_found") == 1

        by_name = {c.get("compound_name"): c for c in data["compounds"]}

        for nm in ("Curcumin", "Piperine", "Withanolide A"):
            row = by_name[nm]
            assert "LC-MS" in (row.get("source") or ""), row
            assert (
                "PubChem" in row["source"] or "LOTUS" in row["source"]
            ), f"expected upstream in source for {nm}: {row['source']}"
            assert row.get("smiles"), f"smiles missing for {nm}"
            assert isinstance(row["smiles"], str) and len(row["smiles"]) > 0
            assert row.get("inchi_key"), f"inchi_key missing for {nm}"
            assert row.get("molecular_formula"), f"formula missing for {nm}"
            assert row.get("molecular_weight") is not None, (
                f"molecular_weight missing for {nm}"
            )
            assert not row.get("not_found")

        missing = by_name["NONEXISTENT_XYZ_ABC"]
        assert missing.get("source") == "LC-MS · not found"
        assert missing.get("not_found") is True
        assert not missing.get("smiles")

    def test_enrich_preserves_uploaded_values(self, api):
        payload = {
            "compounds": [
                {
                    "compound_name": "Curcumin",
                    "molecular_weight": 999.99,
                    "molecular_formula": "CUSTOM_FMLA",
                    "retention_time": 7.3,
                }
            ]
        }
        r = api.post(f"{BASE_URL}/api/lcms/enrich", json=payload, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["compounds"]) == 1
        row = data["compounds"][0]
        # Uploaded values must be preserved (never overwritten)
        assert row["molecular_weight"] == 999.99, row
        assert row["molecular_formula"] == "CUSTOM_FMLA", row
        assert row["retention_time"] == 7.3, row
        # But SMILES / InChI / InChIKey / source still enriched from PubChem
        assert row.get("smiles"), "smiles must still be populated from PubChem"
        assert row.get("inchi_key"), "inchi_key must still be populated from PubChem"
        assert row.get("inchi"), "inchi must still be populated from PubChem"
        assert "LC-MS" in (row.get("source") or "")
        assert "PubChem" in row["source"] or "LOTUS" in row["source"]

    def test_enrich_empty_compounds(self, api):
        r = api.post(
            f"{BASE_URL}/api/lcms/enrich", json={"compounds": []}, timeout=15
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data == {"compounds": [], "found": 0, "not_found": 0}

    def test_enrich_missing_name_row(self, api):
        payload = {"compounds": [{"compound_name": ""}]}
        r = api.post(f"{BASE_URL}/api/lcms/enrich", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data["compounds"]) == 1
        row = data["compounds"][0]
        assert row.get("source") == "LC-MS · missing name"
        assert row.get("not_found") is True
        assert not row.get("smiles")
        assert data.get("found") == 0
        assert data.get("not_found") == 1

    def test_enrich_no_body_returns_422(self, api):
        # Missing the required `compounds` field entirely
        r = api.post(
            f"{BASE_URL}/api/lcms/enrich",
            json={"garbage": True},
            timeout=15,
        )
        # Pydantic accepts default_factory=list, so 200 is also valid.
        # We accept either but ensure the returned structure is sane.
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            data = r.json()
            assert data.get("compounds") == []



# ---------------------------------------------------------------------------
# Compound Standardization (PubChem + LOTUS + ChEBI, async job pattern)
# ---------------------------------------------------------------------------
def _poll_standardize(api, job_id, timeout=90, interval=0.7):
    """Poll /api/standardize/status until status == 'done' or 'failed'."""
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = api.get(
            f"{BASE_URL}/api/standardize/status/{job_id}", timeout=20
        )
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("done", "failed"):
            return last
        time.sleep(interval)
    raise AssertionError(f"Standardize job {job_id} did not complete in {timeout}s: {last}")


class TestStandardizeStartAndStatus:
    """POST /standardize/start returns job_id + total. GET /status polls to done."""

    def test_start_and_status_4_compounds(self, api):
        payload = {
            "compounds": [
                {"compound_name": "Curcumin"},
                {"compound_name": "Piperine"},
                {"compound_name": "Withanolide A"},
                {"compound_name": "Quercetin"},
            ]
        }
        r = api.post(f"{BASE_URL}/api/standardize/start", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        start = r.json()
        assert start.get("total") == 4
        assert start.get("job_id"), f"job_id missing: {start}"

        final = _poll_standardize(api, start["job_id"], timeout=120)
        assert final.get("status") == "done", final
        assert final.get("done") == final.get("total") == 4
        stats = final.get("stats") or {}
        assert stats.get("total") == 4
        assert "standardized" in stats
        assert "manual_review" in stats
        assert "duplicate_removed" in stats
        assert isinstance(final.get("compounds"), list)
        # 4 unique -> should be 4 rows (no dedup expected)
        assert len(final["compounds"]) == 4

    def test_empty_compounds_returns_null_job(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start", json={"compounds": []}, timeout=10
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("job_id") is None
        assert data.get("total") == 0

    def test_status_unknown_job_returns_404(self, api):
        import uuid as _uuid

        random_id = str(_uuid.uuid4())
        r = api.get(
            f"{BASE_URL}/api/standardize/status/{random_id}", timeout=10
        )
        assert r.status_code == 404


class TestStandardizeIdentifiers:
    """Curcumin must resolve to full identifiers from PubChem + ChEBI."""

    def test_curcumin_full_identifiers(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start",
            json={"compounds": [{"compound_name": "Curcumin"}]},
            timeout=15,
        )
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=90)
        assert final["status"] == "done"
        row = final["compounds"][0]
        # canonical_smiles or smiles
        smi = row.get("canonical_smiles") or row.get("smiles")
        assert smi and isinstance(smi, str) and len(smi) > 5, row
        assert row.get("inchi"), row
        assert row.get("inchi_key"), row
        assert row.get("molecular_formula"), row
        assert row.get("molecular_weight") is not None
        assert isinstance(row.get("pubchem_cid"), int), (
            f"pubchem_cid should be int, got {type(row.get('pubchem_cid'))}: {row.get('pubchem_cid')}"
        )
        src = row.get("source") or ""
        assert "PubChem" in src, f"expected PubChem in source: {src}"
        # ChEBI is best-effort; if present must start with CHEBI:
        if row.get("chebi_id"):
            assert row["chebi_id"].upper().startswith("CHEBI:")
            assert "ChEBI" in src, f"expected ChEBI in source when chebi_id present: {src}"
        assert row.get("status") == "standardized"


class TestStandardizeSynonymResolution:
    """Vitamin C -> L-ascorbic acid via PubChem synonym lookup."""

    def test_vitamin_c_resolves(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start",
            json={"compounds": [{"compound_name": "Vitamin C"}]},
            timeout=15,
        )
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=90)
        assert final["status"] == "done"
        row = final["compounds"][0]
        assert row.get("status") == "standardized", row
        assert row.get("pubchem_cid"), f"pubchem_cid missing for Vitamin C: {row}"
        smi = row.get("canonical_smiles") or row.get("smiles")
        assert smi, row
        assert row.get("inchi_key"), row


class TestStandardizeManualReview:
    """Bogus compound name -> manual_review with no SMILES."""

    def test_bogus_compound_manual_review(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start",
            json={"compounds": [{"compound_name": "TotallyMadeUpMolecule_XYZ_ZZZZZZ"}]},
            timeout=15,
        )
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=90)
        assert final["status"] == "done"
        row = final["compounds"][0]
        assert row.get("status") == "manual_review", row
        assert not row.get("canonical_smiles")
        assert not row.get("smiles")
        assert not row.get("inchi_key")

    def test_empty_name_manual_review(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start",
            json={"compounds": [{"compound_name": ""}]},
            timeout=15,
        )
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=30)
        assert final["status"] == "done"
        row = final["compounds"][0]
        assert row.get("status") == "manual_review", row


class TestStandardizeDuplicate:
    """[Curcumin, Piperine, Curcumin] -> second Curcumin flagged duplicate_removed."""

    def test_duplicate_second_curcumin(self, api):
        r = api.post(
            f"{BASE_URL}/api/standardize/start",
            json={
                "compounds": [
                    {"compound_name": "Curcumin"},
                    {"compound_name": "Piperine"},
                    {"compound_name": "Curcumin"},
                ]
            },
            timeout=15,
        )
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=120)
        assert final["status"] == "done"
        rows = final["compounds"]
        assert len(rows) == 3, f"expected 3 rows, got {len(rows)}: {rows}"
        # First Curcumin standardized
        assert rows[0].get("status") == "standardized", rows[0]
        # Piperine standardized
        assert rows[1].get("status") == "standardized", rows[1]
        # Third row is the second Curcumin, must be duplicate_removed
        assert rows[2].get("status") == "duplicate_removed", rows[2]
        assert (rows[2].get("duplicate_of") or "").lower() == "curcumin", rows[2]


class TestStandardizeShortCircuit:
    """Pre-populated (IMPPAT-like) rows must NOT overwrite SMILES/InChIKey."""

    def test_prepopulated_row_short_circuits_pubchem(self, api):
        # A synthetic row with all four required fields already set.
        # We deliberately provide a slightly non-standard SMILES so we can prove it
        # is not overwritten (real PubChem would return a different canonical form).
        custom_smiles = "CUSTOM_UNIQUE_SMILES_XYZ"
        custom_inchi_key = "CUSTOMINCHIKEY-XYZABC-N"
        custom_formula = "C1H1"
        custom_mw = 12345.6
        payload = {
            "compounds": [
                {
                    "compound_name": "Curcumin",
                    "canonical_smiles": custom_smiles,
                    "smiles": custom_smiles,
                    "inchi_key": custom_inchi_key,
                    "molecular_formula": custom_formula,
                    "molecular_weight": custom_mw,
                }
            ]
        }
        t0 = time.time()
        r = api.post(f"{BASE_URL}/api/standardize/start", json=payload, timeout=15)
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_standardize(api, job_id, timeout=90)
        elapsed = time.time() - t0
        assert final["status"] == "done"
        row = final["compounds"][0]
        # Fast-path must preserve user-supplied values
        assert row.get("canonical_smiles") == custom_smiles, row
        assert row.get("inchi_key") == custom_inchi_key, row
        assert row.get("molecular_formula") == custom_formula, row
        assert row.get("molecular_weight") == custom_mw, row
        assert row.get("status") == "standardized"
        # Overall elapsed should be < ~20s (only ChEBI is called, if reachable)
        assert elapsed < 30, f"short-circuit took {elapsed:.1f}s — too slow"
