"""Docking Protocol Validation — Redocking + heavy-atom RMSD.

Given a PDB structure that contains a co-crystallised ligand, this module
runs a "self-docking" (or redocking) sanity check:

    1.  Fetch the PDB from RCSB
    2.  Extract the native ligand HETATM group into its own PDB slice
    3.  Perceive bond orders → derive a SMILES via OpenBabel
    4.  Redock that SMILES back into the receptor with AutoDock Vina
        (the existing pipeline in `docking_service.dock_pair`)
    5.  Compute heavy-atom RMSD between the redocked best pose and the
        crystal pose using RDKit's symmetry-aware `GetBestRMS`
    6.  Classify: < 2.0 Å = excellent, 2.0-3.0 Å = acceptable, > 3.0 Å = poor

The industry-standard success criterion for a docking protocol is an RMSD
under 2.0 Å between the top pose and the native crystal pose (Wang et al.,
J Med Chem 2003). This module surfaces that number so researchers can prove
their protocol works on their receptor family before trusting new-compound
predictions.

Backend-only — the frontend hits `/api/docking/validate` and renders the
result badge.
"""
from __future__ import annotations

import asyncio
import logging
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import docking_service

logger = logging.getLogger(__name__)

# Common non-ligand HETATMs to skip when auto-picking (cofactors, solvents,
# crystallisation additives). If the user explicitly supplies a resname we
# always honour it — the skip list is only used for auto-detection.
_HET_SKIP = {
    "HOH", "WAT", "H2O", "DOD",           # water / heavy water
    "SO4", "PO4", "CL", "NA", "K", "MG",  # crystallisation salts
    "CA", "ZN", "FE", "MN", "CU",         # metal ions
    "GOL", "EDO", "PEG", "PGE", "MPD",    # cryoprotectants
    "ACT", "DMS", "IMD", "TRS",           # buffers
    "NAG", "MAN", "BMA", "FUC",           # N-linked glycans (usually not the ligand of interest)
}


@dataclass
class ValidationResult:
    pdb_id: str
    ligand_resname: str
    ligand_smiles: Optional[str]
    ligand_heavy_atoms: int
    redocked_affinity: float          # kcal/mol
    rmsd_angstrom: Optional[float]    # None if RMSD calculation failed
    validation_status: str            # "excellent" | "acceptable" | "poor" | "error"
    notes: str
    job_id: Optional[str] = None
    pair_id: Optional[str] = None


# ────────────────────────────── helpers ──────────────────────────────
def _extract_native_ligand_pdb(pdb_path: Path, out_pdb: Path,
                               ligand_resname: Optional[str] = None
                               ) -> Tuple[str, int]:
    """Slice a single HETATM residue out of a PDB into its own file.

    Returns (resname, heavy_atom_count). Raises ValueError if no candidate
    ligand can be found.
    """
    lines = pdb_path.read_text().splitlines()

    # 1. Collect HETATM lines per residue key (resname + chain + resseq)
    #    A single ligand instance might have multiple residues but usually
    #    only one contiguous group per PDB — pick the first instance we see.
    het_by_key: dict = {}
    for line in lines:
        if not line.startswith("HETATM"):
            continue
        resname = line[17:20].strip()
        if resname in ("HOH", "WAT", "H2O"):
            continue
        chain = line[21:22]
        resseq = line[22:26].strip()
        key = (resname, chain, resseq)
        het_by_key.setdefault(key, []).append(line)

    if not het_by_key:
        raise ValueError("PDB contains no non-water HETATM records.")

    # 2. Choose the target residue.
    target_key = None
    if ligand_resname:
        want = ligand_resname.upper()
        for k in het_by_key:
            if k[0].upper() == want:
                target_key = k
                break
        if target_key is None:
            raise ValueError(f"Ligand residue {ligand_resname!r} not found in PDB.")
    else:
        # Skip common cofactors/salts and pick the largest remaining group.
        candidates = [(k, v) for k, v in het_by_key.items()
                      if k[0].upper() not in _HET_SKIP and len(v) >= 5]
        if not candidates:
            # Everything was on the skip list — fall back to the raw largest.
            candidates = [(k, v) for k, v in het_by_key.items() if len(v) >= 5]
        if not candidates:
            raise ValueError("No suitable co-crystallised ligand found (all HETATMs are too small).")
        target_key, _atoms = max(candidates, key=lambda kv: len(kv[1]))

    resname = target_key[0]
    atoms = het_by_key[target_key]

    # 3. Count heavy atoms (skip explicit H columns).
    heavy = 0
    for a in atoms:
        element = (a[76:78].strip() or a[12:16].strip().lstrip("0123456789")[:1]).upper()
        if element != "H":
            heavy += 1

    # 4. Emit standalone PDB with CONECT records skipped (OpenBabel will
    #    re-perceive bonds from 3D coordinates).
    body = "\n".join(atoms) + "\nEND\n"
    out_pdb.write_text(body)
    return resname, heavy


def _ligand_pdb_to_smiles(ligand_pdb: Path) -> Optional[str]:
    """Convert an extracted ligand PDB to canonical SMILES via OpenBabel.

    OpenBabel perceives bond orders from 3D atom positions, adds hydrogens,
    then writes canonical SMILES.
    """
    try:
        proc = subprocess.run(
            # -h → add hydrogens then perceive bonds; much more reliable when
            # the input PDB has no CONECT records (typical for HETATM slices).
            ["obabel", str(ligand_pdb), "-osmi", "-h"],
            capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            logger.warning("obabel SMILES conversion failed: %s", proc.stderr[:200])
            return None
        # obabel prints e.g. "CCO\t/tmp/x.pdb" — take the first whitespace token.
        line = (proc.stdout or "").strip().splitlines()[0] if proc.stdout.strip() else ""
        smiles = line.split()[0] if line else ""
        return smiles or None
    except Exception as e:
        logger.warning("obabel invocation failed: %s", e)
        return None


async def _ligand_smiles_from_rcsb(resname: str) -> Optional[str]:
    """Fetch the canonical SMILES for a residue directly from RCSB's Chemical
    Component Dictionary. This bypasses fragile bond perception from HETATM
    coordinates and uses the deposited, validated topology.
    """
    try:
        import httpx
    except Exception:
        return None
    url = ("https://data.rcsb.org/rest/v1/core/chemcomp/" + resname.upper())
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url)
            if r.status_code != 200:
                return None
            j = r.json()
        # RCSB returns UPPERCASE keys: SMILES, SMILES_stereo, InChI, InChIKey.
        desc = (j or {}).get("rcsb_chem_comp_descriptor") or {}
        return (desc.get("SMILES_stereo") or desc.get("SMILES") or None)
    except Exception as e:
        logger.info("RCSB chemcomp lookup failed for %s: %s", resname, e)
        return None


def _compute_rmsd(native_pdb: Path, pose_pdb: Path,
                  reference_smiles: Optional[str]) -> Optional[float]:
    """Symmetry-aware heavy-atom RMSD between two poses of the same ligand.

    Uses RDKit's `GetBestRMS` which enumerates automorphisms — critical for
    symmetric ligands (benzene, phenyl-substituted rings, etc.) where a
    naïve atom-by-atom RMSD would over-estimate the deviation.

    Falls back to a plain Kabsch-free heavy-atom RMSD if bond-order assignment
    or automorphism matching fails (e.g. ligand contains rare metals).
    """
    try:
        from rdkit import Chem
        from rdkit.Chem import AllChem
    except Exception:
        return None

    def _load(path: Path):
        mol = Chem.MolFromPDBFile(str(path), removeHs=True, sanitize=False)
        if mol is None:
            return None
        # Best-effort bond-order fix from the reference SMILES so heavy-atom
        # ordering matches between the two conformers.
        if reference_smiles:
            try:
                ref = Chem.MolFromSmiles(reference_smiles)
                if ref is not None:
                    mol = AllChem.AssignBondOrdersFromTemplate(ref, mol)
            except Exception:
                pass
        try:
            Chem.SanitizeMol(mol)
        except Exception:
            pass
        return mol

    m1 = _load(native_pdb)
    m2 = _load(pose_pdb)
    if m1 is None or m2 is None:
        return None

    try:
        # GetBestRMS aligns m2 onto m1 accounting for symmetry.
        return float(AllChem.GetBestRMS(m1, m2))
    except Exception as e:
        logger.info("GetBestRMS fell back to raw RMSD: %s", e)

    # ── Fallback: raw heavy-atom RMSD (no automorphism, no alignment).
    def _heavy_coords(mol):
        conf = mol.GetConformer()
        out = []
        for atom in mol.GetAtoms():
            if atom.GetAtomicNum() == 1:
                continue
            p = conf.GetAtomPosition(atom.GetIdx())
            out.append((p.x, p.y, p.z))
        return out

    a = _heavy_coords(m1); b = _heavy_coords(m2)
    if len(a) != len(b) or not a:
        return None
    ss = sum((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2
             for (ax, ay, az), (bx, by, bz) in zip(a, b))
    return (ss / len(a)) ** 0.5


def _classify(rmsd: Optional[float]) -> str:
    if rmsd is None:
        return "error"
    if rmsd < 2.0:
        return "excellent"
    if rmsd < 3.0:
        return "acceptable"
    return "poor"


# ────────────────────────────── public API ──────────────────────────────
async def validate_pdb(pdb_id: str,
                       ligand_resname: Optional[str] = None,
                       exhaustiveness: int = 8,
                       ) -> ValidationResult:
    """Fetch a PDB, extract its native ligand, redock, and compute RMSD.

    Runs entirely in a per-job tempdir under /tmp/dock_validate/<pdb>_<uid>
    so multiple validations can execute in parallel without stepping on
    each other. The directory is *not* auto-deleted so debug artefacts
    (input ligand, best pose, vina.log) can be inspected if RMSD is poor.
    """
    pdb_id = pdb_id.strip().upper()
    if not re.match(r"^[0-9A-Z]{4}$", pdb_id):
        raise ValueError(f"Not a valid PDB id: {pdb_id!r}")

    root = Path(tempfile.mkdtemp(prefix=f"dock_validate_{pdb_id.lower()}_",
                                 dir="/tmp"))
    logger.info("validate: %s → %s", pdb_id, root)

    # 1. Download PDB.
    pdb_path = root / f"{pdb_id}.pdb"
    await docking_service.download_pdb(pdb_id, pdb_path)

    # 2. Slice native ligand out.
    native_lig_pdb = root / "native_ligand.pdb"
    try:
        resname, heavy = _extract_native_ligand_pdb(pdb_path, native_lig_pdb, ligand_resname)
    except ValueError as e:
        return ValidationResult(
            pdb_id=pdb_id, ligand_resname=ligand_resname or "?", ligand_smiles=None,
            ligand_heavy_atoms=0, redocked_affinity=0.0, rmsd_angstrom=None,
            validation_status="error", notes=str(e),
        )

    # 3. Perceive SMILES — RCSB Chemical Component Dictionary first
    #    (authoritative bond orders), then OpenBabel from HETATM coordinates
    #    as a fallback for exotic residues not in the CCD.
    smiles = await _ligand_smiles_from_rcsb(resname)
    if not smiles:
        smiles = _ligand_pdb_to_smiles(native_lig_pdb)
    if not smiles:
        return ValidationResult(
            pdb_id=pdb_id, ligand_resname=resname, ligand_smiles=None,
            ligand_heavy_atoms=heavy, redocked_affinity=0.0, rmsd_angstrom=None,
            validation_status="error",
            notes="Could not derive a valid SMILES for the native ligand (RCSB and OpenBabel both failed).",
        )

    # 4. Prepare receptor + box centred on the native ligand.
    receptor_pdbqt = root / "receptor.pdbqt"
    try:
        docking_service.prepare_receptor_pdbqt(pdb_path, receptor_pdbqt)
    except Exception as e:
        return ValidationResult(
            pdb_id=pdb_id, ligand_resname=resname, ligand_smiles=smiles,
            ligand_heavy_atoms=heavy, redocked_affinity=0.0, rmsd_angstrom=None,
            validation_status="error", notes=f"Receptor preparation failed: {e}",
        )
    box = docking_service.detect_binding_box(pdb_path, ligand_hint=resname)

    # 5. Redock via the existing pipeline — pair_id = "<resname>_x_<pdb>".
    ligand_input = {
        "name": resname,
        "smiles": smiles,
        "uniprot_id": pdb_id,   # placeholder — some downstream code reads this
    }
    dock_result = await docking_service.dock_pair(
        job_dir=root,
        receptor_pdbqt=receptor_pdbqt,
        receptor_pdb=pdb_path,
        ligand=ligand_input,
        box=box,
        exhaustiveness=exhaustiveness,
        num_modes=9,
    )
    if dock_result.error:
        return ValidationResult(
            pdb_id=pdb_id, ligand_resname=resname, ligand_smiles=smiles,
            ligand_heavy_atoms=heavy, redocked_affinity=0.0, rmsd_angstrom=None,
            validation_status="error", notes=f"Redocking failed: {dock_result.error}",
            job_id=root.name, pair_id=dock_result.pair_id,
        )

    # 6. Best pose written by dock_pair → best_pose.pdb (heavy atoms in PDB format).
    pair_dir = root / dock_result.pair_id
    best_pose_pdb = pair_dir / "best_pose.pdb"
    if not best_pose_pdb.exists():
        best_pose_pdb = pair_dir / "pose.pdb"    # fall back to multi-model PDB
    rmsd = _compute_rmsd(native_lig_pdb, best_pose_pdb, smiles)

    status = _classify(rmsd)
    notes = {
        "excellent":  f"Redocked pose is within {rmsd:.2f} Å of the crystal ligand — docking protocol validated.",
        "acceptable": f"Redocked pose is {rmsd:.2f} Å from the crystal ligand — protocol usable but consider tuning exhaustiveness or search box.",
        "poor":       f"Redocked pose deviates {rmsd:.2f} Å from the crystal ligand — protocol needs adjustment before trusting new-compound predictions.",
        "error":      "RMSD could not be computed (atom-count or bond-order mismatch). Inspect ligand extraction manually.",
    }[status]

    return ValidationResult(
        pdb_id=pdb_id, ligand_resname=resname, ligand_smiles=smiles,
        ligand_heavy_atoms=heavy,
        redocked_affinity=float(dock_result.best_affinity or 0.0),
        rmsd_angstrom=None if rmsd is None else round(rmsd, 3),
        validation_status=status,
        notes=notes,
        job_id=root.name,
        pair_id=dock_result.pair_id,
    )


def get_overlay_pdbs(job_id: str, pair_id: str) -> dict:
    """Return the three PDB blobs needed by the 3D pose overlay viewer:
        receptor       — protein backbone/sidechains (from RCSB)
        native_ligand  — HETATM slice used as the crystal reference
        redocked_pose  — best pose written by Vina + OpenBabel

    Path-traversal safe: both ids must match the exact directory names that
    validate_pdb produced. Anything else → FileNotFoundError.
    """
    if not re.match(r"^dock_validate_[0-9a-z_]{6,60}$", job_id or ""):
        raise FileNotFoundError("Invalid validation job id.")
    if not re.match(r"^[A-Za-z0-9_.\-]{2,80}$", pair_id or ""):
        raise FileNotFoundError("Invalid validation pair id.")

    root = Path("/tmp") / job_id
    if not root.is_dir():
        raise FileNotFoundError("Validation job not found (temp dir was cleaned up).")

    pair_dir = root / pair_id
    if not pair_dir.is_dir():
        raise FileNotFoundError("Validation pair not found.")

    # Discover the receptor PDB (validate_pdb writes it as "<PDB_ID>.pdb").
    receptor_path = next(
        (p for p in root.iterdir() if p.is_file() and p.suffix == ".pdb"
         and p.name not in ("native_ligand.pdb",)),
        None,
    )
    native_path = root / "native_ligand.pdb"
    pose_path = pair_dir / "best_pose.pdb"
    if not pose_path.exists():
        pose_path = pair_dir / "pose.pdb"

    if not (receptor_path and receptor_path.exists()):
        raise FileNotFoundError("Receptor PDB missing for this validation.")
    if not native_path.exists():
        raise FileNotFoundError("Native ligand PDB missing for this validation.")
    if not pose_path.exists():
        raise FileNotFoundError("Redocked pose PDB missing for this validation.")

    return {
        "receptor_pdb": receptor_path.read_text(),
        "native_ligand_pdb": native_path.read_text(),
        "redocked_pose_pdb": pose_path.read_text(),
    }


async def validate_batch(pdb_ids: List[str],
                         exhaustiveness: int = 8,
                         ) -> dict:
    """Run validate_pdb over a list of PDB IDs sequentially (Vina is CPU-heavy,
    parallelising here would just thrash the box) and return per-PDB results
    plus an aggregate success-rate summary suitable for the AI report.

    A run counts as "successful" if `validation_status == 'excellent'` — the
    < 2 Å industry-standard threshold. Acceptable / poor / error do NOT count
    towards success but are broken out separately so the researcher can see
    where the protocol breaks down.
    """
    seen = set()
    unique = []
    for pid in pdb_ids:
        p = (pid or "").strip().upper()
        if not p or p in seen:
            continue
        seen.add(p)
        unique.append(p)

    if not unique:
        raise ValueError("Provide at least one PDB ID.")
    if len(unique) > 12:
        # Guardrail — a single validation can take several minutes; cap the
        # batch so the request doesn't sit for half an hour.
        raise ValueError("Batch benchmark accepts at most 12 PDB IDs per run.")

    results = []
    for pid in unique:
        try:
            r = await validate_pdb(pid, exhaustiveness=exhaustiveness)
            results.append({
                "pdb_id": r.pdb_id,
                "ligand_resname": r.ligand_resname,
                "ligand_heavy_atoms": r.ligand_heavy_atoms,
                "redocked_affinity": r.redocked_affinity,
                "rmsd_angstrom": r.rmsd_angstrom,
                "validation_status": r.validation_status,
                "notes": r.notes,
                "job_id": r.job_id,
                "pair_id": r.pair_id,
            })
        except Exception as e:
            logger.exception("batch validation error for %s", pid)
            results.append({
                "pdb_id": pid,
                "ligand_resname": "?",
                "ligand_heavy_atoms": 0,
                "redocked_affinity": 0.0,
                "rmsd_angstrom": None,
                "validation_status": "error",
                "notes": str(e),
                "job_id": None,
                "pair_id": None,
            })

    n = len(results)
    counts = {"excellent": 0, "acceptable": 0, "poor": 0, "error": 0}
    rmsd_values = []
    for r in results:
        counts[r["validation_status"]] = counts.get(r["validation_status"], 0) + 1
        if r["rmsd_angstrom"] is not None:
            rmsd_values.append(float(r["rmsd_angstrom"]))

    mean_rmsd = sum(rmsd_values) / len(rmsd_values) if rmsd_values else None
    success_rate = round(100.0 * counts["excellent"] / n, 1) if n else 0.0

    return {
        "results": results,
        "summary": {
            "total": n,
            "excellent": counts["excellent"],
            "acceptable": counts["acceptable"],
            "poor": counts["poor"],
            "error": counts["error"],
            "success_rate_pct": success_rate,
            "mean_rmsd_angstrom": None if mean_rmsd is None else round(mean_rmsd, 3),
            "verdict": (
                "Protocol validated on this benchmark suite — safe to trust "
                "predictions for the same receptor family."
                if success_rate >= 80.0 else
                "Protocol usable but not fully validated — inspect the failing "
                "cases and consider tuning search box or exhaustiveness."
                if success_rate >= 50.0 else
                "Protocol needs adjustment before trusting new-compound "
                "predictions — most benchmark cases exceed the 2 Å threshold."
            ),
        },
    }
