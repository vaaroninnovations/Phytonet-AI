"""ADMET & Drug-Likeness endpoint tests.

Covers:
- /api/health returns admet_ready boolean
- /api/admet/predict + /api/admet/status happy path (Aspirin + Ethanol)
- Empty compounds list → job_id=null
- Missing SMILES row is flagged no_smiles / admet_ready=false
- Drug-likeness flags correct on Aspirin
- 404 on unknown job id
"""
import os
import time
import uuid
import pytest
import requests


def _read_backend_url():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _read_backend_url()


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Accept": "application/json", "Content-Type": "application/json"})
    return s


def _poll_admet(api, job_id, timeout=180, interval=1.5):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = api.get(f"{BASE_URL}/api/admet/status/{job_id}", timeout=20)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("done", "failed"):
            return last
        time.sleep(interval)
    raise AssertionError(f"ADMET job {job_id} did not complete in {timeout}s: {last}")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class TestHealthAdmetReady:
    def test_health_has_admet_ready_bool(self, api):
        r = api.get(f"{BASE_URL}/api/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert "admet_ready" in data
        assert isinstance(data["admet_ready"], bool)


# ---------------------------------------------------------------------------
# ADMET predict happy path
# ---------------------------------------------------------------------------
class TestAdmetPredictHappyPath:
    _ADMET_KEYS = {
        "hia", "bbb", "ames", "herg", "dili",
        "cyp1a2_inhibitor", "cyp2c9_inhibitor", "cyp2c19_inhibitor",
        "cyp2d6_inhibitor", "cyp3a4_inhibitor",
        "pgp_inhibitor", "bioavailability", "carcinogenicity",
        "skin_sensitization", "clearance_hepatocyte",
        "clearance_microsome", "half_life", "caco2", "ppbr", "vdss",
    }
    _PHYS_KEYS = {"mw", "logp", "tpsa", "hba", "hbd", "lipinski_rules", "qed"}
    _DL_KEYS = {
        "lipinski_pass", "veber_pass", "ghose_pass", "egan_pass",
        "muegge_pass", "rotatable_bonds",
    }

    def test_predict_two_compounds_and_status_done(self, api):
        payload = {
            "compounds": [
                {"compound_name": "Aspirin", "canonical_smiles": "CC(=O)OC1=CC=CC=C1C(=O)O"},
                {"compound_name": "Ethanol", "canonical_smiles": "CCO"},
            ]
        }
        r = api.post(f"{BASE_URL}/api/admet/predict", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        start = r.json()
        assert start.get("total") == 2
        assert start.get("job_id"), f"job_id missing in: {start}"

        final = _poll_admet(api, start["job_id"], timeout=180)
        assert final.get("status") == "done", final
        compounds = final.get("compounds") or []
        assert len(compounds) == 2, f"Expected 2 compounds, got {len(compounds)}"

        for row in compounds:
            assert row.get("admet_ready") is True, row
            for k in self._ADMET_KEYS:
                assert k in row["admet"], f"admet key missing: {k} in {row['admet'].keys()}"
            for k in self._PHYS_KEYS:
                assert k in row["physchem"], f"physchem key missing: {k}"
            for k in self._DL_KEYS:
                assert k in row["druglikeness"], f"druglikeness key missing: {k}"

        aspirin = compounds[0]
        # Aspirin values sanity checks
        p = aspirin["physchem"]
        assert p["mw"] is not None and 170 < p["mw"] < 195, f"MW: {p['mw']}"
        assert p["hba"] is not None
        assert p["hbd"] is not None
        # a small number of numeric ADMET values should be populated
        populated = [k for k, v in aspirin["admet"].items() if isinstance(v, (int, float))]
        assert len(populated) >= 10, f"Too few populated ADMET numerics: {populated}"

    def test_aspirin_druglikeness_flags(self, api):
        payload = {
            "compounds": [
                {"compound_name": "Aspirin", "canonical_smiles": "CC(=O)OC1=CC=CC=C1C(=O)O"},
            ]
        }
        r = api.post(f"{BASE_URL}/api/admet/predict", json=payload, timeout=20)
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_admet(api, job_id, timeout=120)
        assert final["status"] == "done"
        row = final["compounds"][0]
        d = row["druglikeness"]
        assert d["lipinski_pass"] is True, row
        assert d["veber_pass"] is True, row
        assert d["egan_pass"] is True, row
        assert d["ghose_pass"] is True, row
        # rotatable_bonds should be an int
        assert isinstance(d["rotatable_bonds"], int)


class TestAdmetEmptyAnd404:
    def test_predict_empty_returns_null_job(self, api):
        r = api.post(f"{BASE_URL}/api/admet/predict", json={"compounds": []}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data.get("job_id") is None
        assert data.get("total") == 0

    def test_status_unknown_job_404(self, api):
        rand_id = str(uuid.uuid4())
        r = api.get(f"{BASE_URL}/api/admet/status/{rand_id}", timeout=15)
        assert r.status_code == 404


class TestAdmetNoSmilesRow:
    def test_row_without_smiles_marked_no_smiles(self, api):
        payload = {
            "compounds": [
                {"compound_name": "NoSmilesRow"},
                {"compound_name": "Aspirin", "canonical_smiles": "CC(=O)OC1=CC=CC=C1C(=O)O"},
            ]
        }
        r = api.post(f"{BASE_URL}/api/admet/predict", json=payload, timeout=15)
        assert r.status_code == 200
        job_id = r.json()["job_id"]
        final = _poll_admet(api, job_id, timeout=180)
        assert final["status"] == "done"
        cs = final["compounds"]
        assert len(cs) == 2
        assert cs[0].get("no_smiles") is True, cs[0]
        assert cs[0].get("admet_ready") is False, cs[0]
        assert cs[1].get("admet_ready") is True, cs[1]
        assert cs[1]["admet"].get("hia") is not None
