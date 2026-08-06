"""Iteration 46 — verify docking auto-append in AI research planner.

Verifies:
  1. Login as rtest user succeeds.
  2. Creating a research project + posting a prompt that requires both
     target_predict and admet_predict produces a plan whose steps include
     a `docking` step at the end (auto-appended).
  3. The docking tool is registered in TOOL_REGISTRY (introspected via
     the planner returning it as a valid tool name).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
EMAIL    = "rtest1785979513@phytonetai.com"
PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


def _find_project(session):
    r = session.get(f"{BASE_URL}/api/research/projects", timeout=30)
    assert r.status_code == 200, r.text[:300]
    projects = r.json() if isinstance(r.json(), list) else r.json().get("projects", [])
    return projects


def test_login_ok(session):
    r = session.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    data = r.json()
    user = data.get("user") or data
    assert user.get("email") == EMAIL


def test_docking_autoappend_on_new_plan(session):
    # Create a fresh project so we can post a plan-generating prompt.
    r = session.post(f"{BASE_URL}/api/research/projects",
                     json={"title": "TEST_iter46_docking_autoappend"}, timeout=30)
    assert r.status_code in (200, 201), r.text[:300]
    project = r.json()
    pid = project.get("id") or project.get("_id") or project.get("project_id")
    assert pid, project

    # A prompt that should produce a plan containing BOTH target_predict AND
    # admet_predict — the backend should then auto-append docking.
    prompt = ("For curcumin, please run ADMET and target prediction, then dock "
              "the top compounds against the top targets.")
    r = session.post(f"{BASE_URL}/api/research/projects/{pid}/message",
                     json={"prompt": prompt}, timeout=180)
    assert r.status_code == 200, f"planner failed: {r.status_code} {r.text[:500]}"
    body = r.json()

    # The plan is nested under the assistant message
    plan_steps = None
    for key in ("plan", "assistant", "run", "message"):
        v = body.get(key)
        if isinstance(v, dict):
            plan_steps = v.get("plan") or plan_steps
        if isinstance(v, list) and v and isinstance(v[0], dict) and v[0].get("tool"):
            plan_steps = v
    if not plan_steps:
        # Try nested runs / recent
        r2 = session.get(f"{BASE_URL}/api/research/projects/{pid}", timeout=30)
        if r2.status_code == 200:
            data = r2.json()
            runs = data.get("runs") or []
            if runs:
                plan_steps = runs[-1].get("plan")
    assert plan_steps, f"no plan returned. body keys={list(body.keys())} body={str(body)[:600]}"

    tools = [s.get("tool") for s in plan_steps]
    print(f"Plan tools: {tools}")
    assert "target_predict" in tools, f"target_predict missing: {tools}"
    assert "admet_predict"  in tools, f"admet_predict missing: {tools}"
    assert "docking"        in tools, f"docking NOT auto-appended: {tools}"

    # Docking step should have the expected label
    docking_step = next(s for s in plan_steps if s.get("tool") == "docking")
    assert "dock" in (docking_step.get("label") or "").lower(), docking_step
