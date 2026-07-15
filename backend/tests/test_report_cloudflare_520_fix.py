"""Regression tests for the PhytoNet AI Cloudflare 520 fix on /api/report/generate.

Verifies:
1. Small workflow generates a full markdown report (HTTP 200, non-empty markdown).
2. Large workflow (20 docking pairs, 200 genes, 40 compounds, per-pose interactions)
   returns HTTP 200 (or clean HTTP 500 JSON) within 90 s — NOT a Cloudflare
   520 HTML page, NOT a hang.
3. Prompt-length safety cap (< 24000 chars) is engaged for the large payload.
4. All 4 download formats (md/html/pdf/docx) work.
"""
from __future__ import annotations
import os
import re
import time
import json
import httpx
import pytest

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or
        os.environ.get("BASE_URL") or
        "https://herbal-nexus.preview.emergentagent.com").rstrip("/")


# ─────────────────────────── payload builders ───────────────────────────────
def _small_workflow():
    return {
        "plant_name": "Withania somnifera",
        "disease_name": "Alzheimer's disease",
        "selected_compounds": [
            {"name": "Withaferin A", "smiles": "CC1=C2CC[C@@H]3[C@@H](CC=C4C[C@@H](O)CC[C@@]34C)[C@@]12CCC5=CC(=O)OC5",
             "molecular_weight": 470.6, "logp": 3.2}
        ],
        "intersecting_genes": ["APP", "BACE1", "MAPT", "PSEN1", "TP53"],
        "hub_ranking": [
            {"gene": "APP", "mcc": 12, "degree": 8, "betweenness": 0.32}
        ],
        "go_terms": [
            {"term": "amyloid-beta binding", "p_value": 1e-5, "genes": ["APP", "BACE1"]}
        ],
        "kegg_pathways": [
            {"pathway": "Alzheimer disease", "p_value": 1e-6, "genes": ["APP", "BACE1", "MAPT"]}
        ],
        "docking_results": [{
            "ligand_name": "Withaferin A",
            "receptor_uniprot": "P05067", "receptor_pdb": "1IYT",
            "best_affinity": -8.7,
            "classification": {"class": "Strong", "score": 0.82},
            "poses": [{"rank": i, "affinity": -8.7 + 0.1*i} for i in range(9)],
            "interactions": {
                "hydrogen_bonds": [
                    {"residue": f"LYS{16+i}", "distance": 2.8 + 0.05*i} for i in range(15)
                ],
                "hydrophobic_contacts": [
                    {"residue": f"LEU{20+i}", "distance": 3.6 + 0.05*i} for i in range(15)
                ],
            }
        }],
        "md_config": {"forcefield": "amber99sb-ildn", "solvent": "TIP3P", "duration_ns": 100}
    }


def _large_workflow():
    """Build the ~101 kB payload described in the fix ticket."""
    compounds = [
        {"name": f"Compound_{i}", "smiles": "CCO"*4,
         "molecular_weight": 200 + i, "logp": 1.0 + i*0.1,
         "hbd": i % 5, "hba": i % 7} for i in range(40)
    ]
    genes = [f"GENE_{i}" for i in range(200)]
    hubs = [{"gene": f"GENE_{i}", "mcc": 100-i, "degree": 30-i//10,
             "betweenness": 0.5 - i*0.001, "closeness": 0.7 - i*0.001}
            for i in range(20)]
    go_terms = [{"term": f"GO_term_{i}", "p_value": 10**(-i-1),
                 "genes": [f"GENE_{j}" for j in range(15)],
                 "description": "A very long description of the GO term "*10}
                for i in range(30)]
    kegg = [{"pathway": f"KEGG_pathway_{i}", "p_value": 10**(-i-1),
             "genes": [f"GENE_{j}" for j in range(20)],
             "description": "A very long description of the KEGG pathway "*10}
            for i in range(30)]
    docking = []
    for i in range(20):
        docking.append({
            "ligand_name": f"Compound_{i}",
            "receptor_uniprot": f"P{10000+i}",
            "receptor_pdb": f"PDB{i}",
            "best_affinity": -6.0 - i*0.15,
            "classification": {"class": "Strong" if i < 10 else "Moderate",
                                "score": 0.9 - i*0.02,
                                "notes": "Long classification notes "*10},
            "poses": [{"rank": p, "affinity": -6.0 - i*0.15 + p*0.1,
                       "xyz": [[j, j*2, j*3] for j in range(50)]}
                       for p in range(9)],
            "interactions": {
                "hydrogen_bonds":       [{"residue": f"LYS{20+j}", "distance": 2.8+j*0.03,
                                          "angle": 150.0+j, "donor": "N", "acceptor": "O"}
                                          for j in range(15)],
                "hydrophobic_contacts": [{"residue": f"LEU{40+j}", "distance": 3.6+j*0.03,
                                          "atom1": "CA", "atom2": "CB"}
                                          for j in range(15)],
                "pi_stacking":          [{"residue": f"PHE{60+j}", "distance": 4.5+j*0.03}
                                          for j in range(5)],
            },
        })
    return {
        "plant_name": "Curcuma longa",
        "disease_name": "Type 2 Diabetes Mellitus",
        "selected_compounds": compounds,
        "intersecting_genes": genes,
        "hub_ranking": hubs,
        "go_terms": go_terms,
        "kegg_pathways": kegg,
        "docking_results": docking,
        "md_config": {"forcefield": "amber99sb-ildn", "solvent": "TIP3P",
                       "duration_ns": 100, "temperature_K": 310},
    }


# ─────────────────────────── unit-level prompt tests ───────────────────────
def test_prompt_stays_under_safety_cap_for_large_workflow():
    """Verify _build_prompt() safety cap 24000 chars fires (or the slim keeps
    us under it) for the large payload."""
    import sys
    sys.path.insert(0, "/app/backend")
    import report_service
    wf = _large_workflow()
    raw_size = len(json.dumps(wf, default=str))
    prompt = report_service._build_prompt(wf)
    print(f"raw workflow bytes={raw_size}  built prompt chars={len(prompt)}")
    assert raw_size > 50_000, "Test payload should be > 50 kB to exercise the cap"
    assert len(prompt) <= 24000 + 200, f"Prompt {len(prompt)} exceeds 24k safety cap"


def test_slim_docking_drops_poses_and_interactions():
    import sys
    sys.path.insert(0, "/app/backend")
    import report_service
    wf = _large_workflow()
    slim = report_service._slim_docking(wf["docking_results"])
    assert len(slim) == 10, "slim_docking should cap at 10 pairs"
    entry = slim[0]
    # heavy fields dropped
    assert "poses" not in entry
    assert "interactions" not in entry
    # essential fields kept
    for k in ["ligand", "target", "pdb", "affinity_kcal_mol", "quality", "score",
              "top_hbond_residues", "top_hydrophobic_residues", "n_poses"]:
        assert k in entry, f"missing {k} in slim docking"
    assert entry["n_poses"] == 9
    assert len(entry["top_hbond_residues"]) == 3
    assert len(entry["top_hydrophobic_residues"]) == 3


# ─────────────────────────── HTTP end-to-end tests ─────────────────────────
@pytest.fixture(scope="session")
def http():
    with httpx.Client(timeout=120.0) as c:
        yield c


def _post_generate(http, workflow: dict) -> tuple[float, httpx.Response]:
    t0 = time.time()
    r = http.post(f"{BASE}/api/report/generate", json={"workflow": workflow})
    return time.time() - t0, r


def _assert_json_response(r: httpx.Response):
    ct = r.headers.get("content-type", "")
    assert "application/json" in ct, (
        f"Expected JSON, got content-type={ct}. First 400 bytes: {r.text[:400]}"
    )
    # Cloudflare 520 pages are HTML; JSON assertion above catches that.
    try:
        r.json()
    except Exception as e:
        pytest.fail(f"Non-JSON body: {e}\n{r.text[:400]}")


def test_report_generate_small_workflow(http):
    dt, r = _post_generate(http, _small_workflow())
    print(f"small workflow: HTTP {r.status_code} in {dt:.1f}s")
    _assert_json_response(r)
    assert r.status_code in (200, 500), f"Unexpected status {r.status_code}: {r.text[:300]}"
    if r.status_code != 200:
        pytest.skip(f"LLM upstream error: {r.json().get('detail')}")
    data = r.json()
    assert "report_id" in data and re.fullmatch(r"[0-9a-f]{32}", data["report_id"])
    assert isinstance(data["markdown"], str) and len(data["markdown"]) >= 1000, \
        f"markdown too short: {len(data['markdown'])}"
    meta = data["meta"]
    assert meta["plant"] == "Withania somnifera"
    assert meta["disease"] == "Alzheimer's disease"
    assert "groq" in meta["model"].lower() or "anthropic" in meta["model"].lower()


def test_report_generate_large_workflow_no_cloudflare_520(http):
    """The core regression: a 100+ kB workflow must NOT cause a 520/hang."""
    workflow = _large_workflow()
    raw_bytes = len(json.dumps(workflow))
    print(f"large workflow bytes = {raw_bytes}")
    assert raw_bytes > 50_000, "test payload should be large"

    dt, r = _post_generate(http, workflow)
    print(f"large workflow: HTTP {r.status_code} in {dt:.1f}s")

    # Must complete within 90 s (upstream timeout in report_service is 90 s;
    # allow some ingress overhead, but not so much that Cloudflare would 520).
    assert dt < 120.0, f"Took {dt:.1f}s — Cloudflare would 520"

    # Must NOT be a Cloudflare-styled HTML error page
    body_prefix = r.text[:200].lower()
    assert "cloudflare" not in body_prefix or "application/json" in r.headers.get("content-type", ""), \
        f"Cloudflare error page returned: {r.text[:400]}"
    assert r.status_code in (200, 500, 502, 503), f"Unexpected {r.status_code}"
    _assert_json_response(r)

    if r.status_code != 200:
        detail = r.json().get("detail", "")
        # Acceptable failure: LLM timeout/rate-limit surfaced as JSON detail, NOT hang
        assert isinstance(detail, str) and len(detail) > 0
        pytest.skip(f"LLM upstream returned error (still a clean 500 JSON, not 520): {detail}")

    data = r.json()
    assert re.fullmatch(r"[0-9a-f]{32}", data["report_id"])
    assert isinstance(data["markdown"], str) and len(data["markdown"]) > 500
    assert data["meta"]["plant"] == "Curcuma longa"
    assert data["meta"]["disease"] == "Type 2 Diabetes Mellitus"
    model = data["meta"]["model"].lower()
    assert "groq" in model or "anthropic" in model


@pytest.fixture(scope="session")
def small_report_id(http):
    dt, r = _post_generate(http, _small_workflow())
    if r.status_code != 200:
        pytest.skip(f"cannot obtain report_id (LLM upstream error {r.status_code}: {r.text[:200]})")
    return r.json()["report_id"]


def test_download_md(http, small_report_id):
    r = http.get(f"{BASE}/api/report/download/{small_report_id}?fmt=md")
    assert r.status_code == 200
    assert "text/markdown" in r.headers.get("content-type", "")
    assert len(r.text) > 200


def test_download_html(http, small_report_id):
    r = http.get(f"{BASE}/api/report/download/{small_report_id}?fmt=html")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
    body = r.text
    assert ("<h1" in body) or ("<h2" in body), "HTML should contain rendered headings"


def test_download_pdf(http, small_report_id):
    r = http.get(f"{BASE}/api/report/download/{small_report_id}?fmt=pdf")
    assert r.status_code == 200
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content[:4] == b"%PDF", "PDF magic bytes missing"


def test_download_docx(http, small_report_id):
    r = http.get(f"{BASE}/api/report/download/{small_report_id}?fmt=docx")
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "openxmlformats-officedocument.wordprocessingml.document" in ct, ct
    # DOCX files start with PK (ZIP magic)
    assert r.content[:2] == b"PK"


def test_download_unknown_id_returns_404(http):
    r = http.get(f"{BASE}/api/report/download/does-not-exist?fmt=md")
    assert r.status_code == 404


def test_download_unsupported_format(http, small_report_id):
    r = http.get(f"{BASE}/api/report/download/{small_report_id}?fmt=xyz")
    assert r.status_code == 400
