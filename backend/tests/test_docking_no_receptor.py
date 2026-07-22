"""Regression test for HIGH defect: docking batch crashed with TypeError when a
target lacked a usable PDB structure.

Previously, the error-placeholder DockResult was constructed with `pdb_id=` (a
keyword that doesn't exist on the dataclass; the real field is `receptor_pdb`),
raising TypeError and taking the entire batch down with it. This test ensures
run_docking_batch returns a graceful per-pair error entry instead.
"""
from __future__ import annotations

import asyncio
import pytest


def test_run_docking_batch_survives_missing_receptor(monkeypatch, tmp_path):
    from backend import docking_service

    # Force RCSB PDB candidate lookup to return nothing → triggers the
    # "no receptor" error placeholder path in run_docking_batch.
    async def _no_candidates(*_a, **_kw):
        return []

    monkeypatch.setattr(docking_service, "rcsb_candidates_for_uniprot", _no_candidates)
    monkeypatch.setattr(docking_service, "DOCK_ROOT", tmp_path)

    out = asyncio.get_event_loop().run_until_complete(
        docking_service.run_docking_batch(
            compounds=[{"name": "Curcumin", "smiles": "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"}],
            targets=[{"uniprot_id": "P00000", "gene_symbol": "MOCK"}],
            exhaustiveness=1,
            num_modes=1,
            box_padding=4.0,
        )
    )

    assert "results" in out and len(out["results"]) == 1, "should return one placeholder row, not crash"
    row = out["results"][0]
    assert row.get("error"), "row must carry an error message"
    assert row.get("ligand_name") == "Curcumin"
    assert row.get("receptor_uniprot") == "P00000"
    # Ensure the field name is `receptor_pdb` (not `pdb_id`) — the regression itself.
    assert "receptor_pdb" in row
