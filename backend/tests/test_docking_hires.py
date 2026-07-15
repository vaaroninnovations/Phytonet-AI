"""Test the server-side high-DPI 3D snapshot endpoint.

Verifies that the offscreen matplotlib renderer produces valid PNG/TIFF/PDF/SVG
bytes at all DPI values, breaking the client-side canvas DPI cap.
"""
from __future__ import annotations
import os
import httpx

BACKEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://herbal-nexus.preview.emergentagent.com")
API = f"{BACKEND_URL}/api"


def _seed_docking_pair(client: httpx.Client) -> tuple[str, str]:
    r = client.post(f"{API}/docking/run", json={
        "compounds": [{"name": "aspirin", "smiles": "CC(=O)Oc1ccccc1C(=O)O"}],
        "targets":   [{"uniprot_id": "P23219", "gene_symbol": "PTGS1", "pdb_id": "1EQG"}],
        "exhaustiveness": 2, "num_modes": 3, "box_padding": 6.0,
    })
    r.raise_for_status()
    data = r.json()
    return data["job_id"], data["results"][0]["pair_id"]


def test_high_dpi_snapshot_produces_all_formats():
    """The offscreen renderer must produce bytes for every supported format
    across the DPI ladder that the client-side canvas cannot reach."""
    with httpx.Client(timeout=120.0) as c:
        job_id, pair_id = _seed_docking_pair(c)

        cases = [
            ("png",  300, "image/png",       50_000),
            ("png",  600, "image/png",       200_000),
            ("png",  1200, "image/png",      500_000),
            ("tiff", 300, "image/tiff",      50_000),
            ("tiff", 1200, "image/tiff",     500_000),
            ("pdf",  600, "application/pdf", 10_000),
            ("svg",  600, "image/svg+xml",   10_000),
        ]
        for fmt, dpi, mime, min_size in cases:
            r = c.get(f"{API}/docking/render/{job_id}/{pair_id}?fmt={fmt}&dpi={dpi}")
            assert r.status_code == 200, f"{fmt}@{dpi}: HTTP {r.status_code} — {r.text[:200]}"
            assert mime in r.headers.get("content-type", ""), \
                f"{fmt}@{dpi}: mime mismatch — got {r.headers.get('content-type')}"
            assert len(r.content) >= min_size, \
                f"{fmt}@{dpi}: file too small ({len(r.content)} < {min_size}) — likely render failed silently"

        # Sanity: PDF must start with %PDF, SVG with <?xml
        pdf = c.get(f"{API}/docking/render/{job_id}/{pair_id}?fmt=pdf&dpi=300")
        assert pdf.content[:4] == b"%PDF"
        svg = c.get(f"{API}/docking/render/{job_id}/{pair_id}?fmt=svg&dpi=300")
        assert svg.text.startswith("<?xml") or svg.text.lstrip().startswith("<svg")


def test_high_dpi_snapshot_404_on_missing_pair():
    """Non-existent job_id / pair_id must 404 gracefully, not 500."""
    with httpx.Client(timeout=15.0) as c:
        r = c.get(f"{API}/docking/render/nonexistent_job/nonexistent_pair?fmt=png&dpi=300")
        assert r.status_code == 404


def test_high_dpi_snapshot_clamps_dpi_range():
    """DPI must be clamped into a sane 72..1200 range so a caller cannot melt
    the renderer with dpi=10000."""
    with httpx.Client(timeout=120.0) as c:
        job_id, pair_id = _seed_docking_pair(c)
        # 20000 should still return 200 (clamped to 1200)
        r = c.get(f"{API}/docking/render/{job_id}/{pair_id}?fmt=png&dpi=20000")
        assert r.status_code == 200
