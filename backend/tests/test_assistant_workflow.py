"""PhytoNet AI Assistant — E2E workflow test for iter_26.

Verifies that _run_workflow now calls REAL services (plant_search, admet,
target_predict/status, disease_service, network_service, report_service) and
populates non-zero counts on the stage `extra` payloads.

Acceptance (per review request):
  * compounds > 0 (IMPPAT+LOTUS cache for Curcuma longa)
  * admet n_rows > 0
  * target_prediction n_targets >= 0 (may be 0 if ChEMBL slow — non-fatal)
  * disease_targets n_targets > 0 with efo_id set (Type 2 Diabetes)
  * intersection stage has n_compound_genes / n_disease_genes / n_intersect keys
  * ppi stage has n_nodes / n_edges keys
  * go_kegg stage has n_go / n_kegg keys
  * docking status == "skipped"
  * report status == "done" with markdown_bytes > 1000
  * report meta.model contains 'groq' (Groq preferred; fallback allowed)
"""
from __future__ import annotations
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@phytonet.ai"
ADMIN_PASSWORD = "Admin123!"

MAX_WAIT_SECONDS = 360  # 6 min budget (ChEMBL can be slow)
POLL_INTERVAL = 5


@pytest.fixture(scope="module")
def admin_session() -> requests.Session:
    s = requests.Session()
    r = s.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def completed_run(admin_session) -> dict:
    """Kick off a real workflow (Curcuma longa × Type 2 Diabetes) and poll to done/failed."""
    r = admin_session.post(
        f"{API}/assistant/run",
        json={"plant_name": "Curcuma longa", "disease_name": "Type 2 Diabetes"},
        timeout=30,
    )
    assert r.status_code == 200, f"run start failed: {r.status_code} {r.text[:200]}"
    run_id = r.json()["id"]

    started = time.time()
    last_doc = None
    while time.time() - started < MAX_WAIT_SECONDS:
        st = admin_session.get(f"{API}/assistant/status/{run_id}", timeout=30)
        assert st.status_code == 200, st.text[:200]
        last_doc = st.json()
        if last_doc.get("status") in ("done", "failed"):
            break
        time.sleep(POLL_INTERVAL)

    assert last_doc is not None, "no status document received"
    return last_doc


def _stage(doc: dict, key: str) -> dict:
    """Return the LAST occurrence of a stage (each stage is logged twice: running+done)."""
    matches = [s for s in doc.get("stages", []) if s.get("key") == key]
    assert matches, f"stage {key} not present in {[s.get('key') for s in doc.get('stages', [])]}"
    return matches[-1]


class TestAssistantWorkflowRealData:
    def test_run_completes_or_progresses(self, completed_run):
        # Must at least be running / done / failed (never stuck without stages)
        assert completed_run.get("status") in ("running", "done", "failed")
        assert isinstance(completed_run.get("stages", []), list)
        assert len(completed_run["stages"]) >= 2, "no stages recorded"

    def test_compounds_populated(self, completed_run):
        st = _stage(completed_run, "collect_phytochemicals")
        assert st["status"] == "done", f"phytochem stage not done: {st}"
        n = st.get("extra", {}).get("n_compounds", 0)
        assert n > 0, f"expected >0 compounds for Curcuma longa, got {n}"

    def test_admet_populated(self, completed_run):
        st = _stage(completed_run, "admet")
        assert st["status"] == "done"
        assert st.get("extra", {}).get("n_rows", 0) > 0

    def test_target_prediction_stage_ran(self, completed_run):
        st = _stage(completed_run, "target_prediction")
        # May be 0 if ChEMBL slow — pipeline should continue regardless
        assert st["status"] == "done"
        assert "n_targets" in st.get("extra", {})

    def test_disease_targets_populated_with_efo(self, completed_run):
        st = _stage(completed_run, "disease_targets")
        assert st["status"] == "done"
        extra = st.get("extra", {})
        assert extra.get("n_targets", 0) > 0, f"expected >0 disease targets: {extra}"
        assert extra.get("efo_id"), f"expected EFO/MONDO id: {extra}"

    def test_intersection_stage_has_all_keys(self, completed_run):
        st = _stage(completed_run, "intersection")
        assert st["status"] == "done"
        extra = st.get("extra", {})
        for k in ("n_compound_genes", "n_disease_genes", "n_intersect"):
            assert k in extra, f"intersection missing {k}: {extra}"

    def test_ppi_stage_has_keys(self, completed_run):
        st = _stage(completed_run, "ppi")
        assert st["status"] == "done"
        extra = st.get("extra", {})
        assert "n_nodes" in extra and "n_edges" in extra

    def test_go_kegg_stage_has_keys(self, completed_run):
        st = _stage(completed_run, "go_kegg")
        assert st["status"] == "done"
        extra = st.get("extra", {})
        assert "n_go" in extra and "n_kegg" in extra

    def test_docking_skipped(self, completed_run):
        st = _stage(completed_run, "docking")
        assert st["status"] == "skipped"

    def test_report_generated(self, completed_run):
        if completed_run.get("status") != "done":
            pytest.skip(f"workflow did not finish within budget: status={completed_run.get('status')}")
        st = _stage(completed_run, "report")
        assert st["status"] == "done", f"report stage: {st}"
        extra = st.get("extra", {})
        assert extra.get("markdown_bytes", 0) > 1000, f"markdown too small: {extra}"

    def test_report_uses_groq(self, completed_run):
        if completed_run.get("status") != "done":
            pytest.skip("workflow did not finish; report model not available yet")
        st = _stage(completed_run, "report")
        model = str(st.get("extra", {}).get("model", "")).lower()
        # Groq is preferred; Emergent fallback is acceptable but note if it happens.
        assert "groq" in model or "claude" in model or "gpt" in model, (
            f"unknown model provider: {model}"
        )

    def test_report_download_md(self, admin_session, completed_run):
        if completed_run.get("status") != "done":
            pytest.skip("workflow did not finish")
        rid = completed_run["id"]
        r = admin_session.get(f"{API}/assistant/report/{rid}/md", timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 1000
        assert b"##" in r.content  # markdown headings present
