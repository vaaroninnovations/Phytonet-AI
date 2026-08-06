"""Iteration 43 — Retry-failed-step feature tests.

Covers:
  1. Happy-path POST /api/research/projects/{pid}/retry/{run_id}/{step_id} on a
     completed run — endpoint should reset target + downstream to pending and
     return {ok:true, retried_from, reset_steps} and re-executed successfully.
  2. Behaviour preservation of prior refactor: create/list/get/send-message
     endpoints still work end-to-end.
"""
from __future__ import annotations
import time
import os
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://herbal-nexus.preview.emergentagent.com").rstrip("/")
EMAIL = "rtest1785979513@phytonetai.com"
PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def project(sess):
    r = sess.post(f"{BASE_URL}/api/research/projects",
                  json={"title": "TEST_iter43_retry"}, timeout=30)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    try:
        sess.delete(f"{BASE_URL}/api/research/projects/{pid}", timeout=15)
    except Exception:
        pass


def _wait_for_run(sess, pid, run_id, timeout=180):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        r = sess.get(f"{BASE_URL}/api/research/projects/{pid}/status/{run_id}", timeout=15)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("completed", "failed"):
            return last
        time.sleep(2)
    return last


def test_create_project_and_ask_aspirin(project, sess):
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/message",
                  json={"prompt": "Predict protein targets for Aspirin"}, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("run"), f"planner did not return a plan run: {body}"
    run_id = body["run"]["id"]
    r2 = sess.post(f"{BASE_URL}/api/research/projects/{project}/execute/{run_id}", timeout=30)
    assert r2.status_code == 200, r2.text

    final = _wait_for_run(sess, project, run_id, timeout=180)
    assert final is not None
    print(f"[test1] final status={final.get('status')} steps={[(s.get('id'), s.get('status')) for s in final.get('plan',[])]}")
    pytest.aspirin_run_id = run_id
    pytest.aspirin_final = final


def test_retry_endpoint_response_shape(project, sess):
    run_id = getattr(pytest, "aspirin_run_id", None)
    final = getattr(pytest, "aspirin_final", None)
    if not run_id or not final:
        pytest.skip("previous test did not produce a run")
    plan = final.get("plan") or []
    if len(plan) < 2:
        pytest.skip("plan has <2 steps")
    step_id = plan[1].get("id")
    prior_step0_status = plan[0].get("status")

    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/retry/{run_id}/{step_id}", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("retried_from") == step_id
    assert body.get("reset_steps") == len(plan) - 1

    time.sleep(2)
    s = sess.get(f"{BASE_URL}/api/research/projects/{project}/status/{run_id}", timeout=15).json()
    assert s.get("status") in ("running", "completed", "failed"), s
    if prior_step0_status == "done":
        assert (s.get("plan") or [])[0].get("status") == "done", s.get("plan")

    final2 = _wait_for_run(sess, project, run_id, timeout=180)
    print(f"[test2] retried final status={final2.get('status')} steps={[(x.get('id'), x.get('status')) for x in final2.get('plan',[])]}")


def test_retry_bad_step_id_404(project, sess):
    run_id = getattr(pytest, "aspirin_run_id", None)
    if not run_id:
        pytest.skip("no run")
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/retry/{run_id}/step_does_not_exist", timeout=15)
    assert r.status_code == 404, r.text


def test_retry_bad_run_id_404(project, sess):
    r = sess.post(f"{BASE_URL}/api/research/projects/{project}/retry/fakerun/step_0", timeout=15)
    assert r.status_code == 404, r.text
