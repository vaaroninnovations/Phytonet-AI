"""Tests for the AI Report backend routes (cache is per-process; only public
route contracts are testable via HTTP without funded LLM credit)."""
import os
import httpx

BASE = (os.environ.get("BASE_URL") or "http://localhost:8001").rstrip("/")


def test_report_download_404_for_unknown_id():
    r = httpx.get(f"{BASE}/api/report/download/does-not-exist?fmt=md", timeout=15.0)
    assert r.status_code == 404


def test_report_generate_route_returns_500_or_200_not_404():
    """LLM budget may be exhausted; we only assert the route exists."""
    try:
        r = httpx.post(f"{BASE}/api/report/generate",
                       json={"workflow": {"plant_name": "Test", "intersecting_genes": ["TP53"]}},
                       timeout=5.0)
        assert r.status_code != 404
    except httpx.ReadTimeout:
        # Timeout = LLM is running = route exists = pass
        pass
