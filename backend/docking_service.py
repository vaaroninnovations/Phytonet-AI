"""AutoDock Vina docking pipeline.

Pipeline:
  1. RCSB PDB candidate discovery by UniProt ID + scoring.
  2. Receptor preparation from PDB → PDBQT (Meeko for polymer prep + OB fallback).
  3. Ligand preparation from SMILES → PDBQT (RDKit + Meeko).
  4. Binding-box detection from co-crystallised ligand or geometric centroid.
  5. Batch docking via `vina` CLI.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx
from rdkit import Chem
from rdkit.Chem import AllChem
from meeko import MoleculePreparation, PDBQTWriterLegacy
from openbabel import openbabel as ob

logger = logging.getLogger(__name__)

RCSB_SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query"
RCSB_FILE = "https://files.rcsb.org/download/{pdb}.pdb"

DOCK_ROOT = Path(os.environ.get("DOCK_WORKDIR", "/tmp/phytonet_docking"))
DOCK_ROOT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# PDB candidate discovery
# ---------------------------------------------------------------------------
async def rcsb_candidates_for_uniprot(uniprot_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Return a scored list of PDB structures for a UniProt ID."""
    if not uniprot_id:
        return []
    # RCSB text-search: match uniprot accession + human organism (Taxonomy 9606).
    query = {
        "query": {
            "type": "group",
            "logical_operator": "and",
            "nodes": [
                {"type": "terminal", "service": "text",
                 "parameters": {"attribute": "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
                                "operator": "exact_match", "value": uniprot_id}},
                {"type": "terminal", "service": "text",
                 "parameters": {"attribute": "rcsb_entity_source_organism.taxonomy_lineage.name",
                                "operator": "exact_match", "value": "Homo sapiens"}},
            ],
        },
        "return_type": "entry",
        "request_options": {"paginate": {"start": 0, "rows": limit},
                            "sort": [{"sort_by": "rcsb_entry_info.resolution_combined", "direction": "asc"}]},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(RCSB_SEARCH, json=query, headers={"Accept": "application/json"})
            r.raise_for_status()
            hits = r.json().get("result_set", []) or []
            pdb_ids = [h["identifier"] for h in hits]
        except Exception as e:
            logger.exception(f"RCSB search failed for {uniprot_id}: {e}")
            return []
        if not pdb_ids:
            return []
        # Fetch details in batch
        details = []
        for pid in pdb_ids:
            try:
                d = await client.get(f"https://data.rcsb.org/rest/v1/core/entry/{pid}",
                                     headers={"Accept": "application/json"})
                d.raise_for_status()
                entry = d.json()
                details.append(_score_pdb(entry, uniprot_id))
            except Exception:
                continue
    details.sort(key=lambda x: -x["score"])
    return details


def _score_pdb(entry: Dict[str, Any], uniprot_id: str) -> Dict[str, Any]:
    pid = entry.get("entry", {}).get("id") or entry.get("rcsb_id")
    resolution = (entry.get("rcsb_entry_info") or {}).get("resolution_combined")
    resolution = resolution[0] if isinstance(resolution, list) and resolution else resolution
    method = ((entry.get("exptl") or [{}])[0]).get("method") or ""
    title = (entry.get("struct") or {}).get("title", "")
    n_ligands = (entry.get("rcsb_entry_info") or {}).get("nonpolymer_entity_count") or 0
    n_polymers = (entry.get("rcsb_entry_info") or {}).get("polymer_entity_count") or 0
    deposit_year = (entry.get("rcsb_accession_info") or {}).get("deposit_date", "")[:4]
    # Simple weighted score
    score = 0.0
    if isinstance(resolution, (int, float)):
        # <1 Å → 6, 1-2 → 5, 2-3 → 3, 3-4 → 1, else 0
        score += max(0.0, 6.0 - resolution)
    if n_ligands >= 1:
        score += 2.0
    if "X-RAY" in method.upper():
        score += 0.5
    if n_polymers == 1:
        score += 0.5
    if deposit_year and int(deposit_year) >= 2015:
        score += 0.3
    return {
        "pdb_id": pid,
        "resolution": resolution,
        "method": method,
        "title": title,
        "n_ligands": n_ligands,
        "n_polymers": n_polymers,
        "deposit_year": deposit_year,
        "uniprot_id": uniprot_id,
        "score": round(score, 2),
        "download_url": RCSB_FILE.format(pdb=pid),
    }


# ---------------------------------------------------------------------------
# Receptor / ligand preparation
# ---------------------------------------------------------------------------
async def download_pdb(pdb_id: str, dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(RCSB_FILE.format(pdb=pdb_id))
        r.raise_for_status()
        dest.write_bytes(r.content)
    return dest


def _extract_hetatms(pdb_path: Path) -> List[Tuple[str, List[Tuple[float, float, float]]]]:
    """Return list of (resname, atom_coords[]) for non-water HETATMs."""
    groups: Dict[str, List[Tuple[float, float, float]]] = {}
    for line in pdb_path.read_text().splitlines():
        if not line.startswith("HETATM"):
            continue
        resname = line[17:20].strip()
        if resname in ("HOH", "WAT", "H2O"):
            continue
        try:
            x = float(line[30:38]); y = float(line[38:46]); z = float(line[46:54])
        except ValueError:
            continue
        groups.setdefault(resname, []).append((x, y, z))
    return list(groups.items())


def detect_binding_box(pdb_path: Path,
                       padding: float = 8.0,
                       ligand_hint: Optional[str] = None) -> Dict[str, float]:
    """Detect Vina box from co-crystallised ligand; else use protein centroid."""
    hetatms = _extract_hetatms(pdb_path)
    coords: List[Tuple[float, float, float]] = []
    picked = None
    if ligand_hint:
        for name, atoms in hetatms:
            if name.upper() == ligand_hint.upper():
                coords = atoms; picked = name; break
    if not coords and hetatms:
        # largest hetatm group (most atoms) → likely the substrate/inhibitor
        best = max(hetatms, key=lambda g: len(g[1]))
        coords = best[1]; picked = best[0]
    if not coords:
        # Fallback: geometric centre of Cα atoms
        for line in pdb_path.read_text().splitlines():
            if line.startswith("ATOM") and line[12:16].strip() == "CA":
                try:
                    coords.append((float(line[30:38]), float(line[38:46]), float(line[46:54])))
                except ValueError:
                    pass
        picked = "protein-centroid"
    if not coords:
        return {"center_x": 0.0, "center_y": 0.0, "center_z": 0.0,
                "size_x": 30.0, "size_y": 30.0, "size_z": 30.0, "reference": None}
    xs, ys, zs = zip(*coords)
    cx, cy, cz = sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)
    sx = max(20.0, (max(xs) - min(xs)) + 2 * padding)
    sy = max(20.0, (max(ys) - min(ys)) + 2 * padding)
    sz = max(20.0, (max(zs) - min(zs)) + 2 * padding)
    return {"center_x": cx, "center_y": cy, "center_z": cz,
            "size_x": sx, "size_y": sy, "size_z": sz, "reference": picked}


def prepare_receptor_pdbqt(pdb_path: Path, out_pdbqt: Path) -> Path:
    """Strip HETATM/water and convert to PDBQT with OpenBabel."""
    cleaned = pdb_path.with_suffix(".clean.pdb")
    lines = []
    for line in pdb_path.read_text().splitlines():
        if line.startswith(("ATOM", "TER", "END")):
            lines.append(line)
    cleaned.write_text("\n".join(lines))
    conv = ob.OBConversion()
    conv.SetInAndOutFormats("pdb", "pdbqt")
    mol = ob.OBMol()
    if not conv.ReadFile(mol, str(cleaned)):
        raise RuntimeError("Failed to read cleaned PDB")
    # Add polar hydrogens, compute Gasteiger charges implicitly via OB
    mol.AddPolarHydrogens()
    # Set write options: -xr for rigid receptor
    conv.AddOption("r", conv.OUTOPTIONS)
    if not conv.WriteFile(mol, str(out_pdbqt)):
        raise RuntimeError("Failed to write receptor PDBQT")
    return out_pdbqt


def prepare_ligand_pdbqt(smiles: str, name: str, out_pdbqt: Path) -> Path:
    """SMILES → 3D conformer → PDBQT via Meeko."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise RuntimeError(f"Invalid SMILES: {smiles}")
    mol = Chem.AddHs(mol)
    if AllChem.EmbedMolecule(mol, randomSeed=42) != 0:
        # Fallback: use ETKDG v3
        AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=200)
    except Exception:
        pass
    mol.SetProp("_Name", name)
    prep = MoleculePreparation()
    setups = prep.prepare(mol)
    setup = setups[0]
    writer = PDBQTWriterLegacy()
    pdbqt_string, is_ok, err = writer.write_string(setup)
    if not is_ok:
        raise RuntimeError(f"Meeko write failed: {err}")
    out_pdbqt.write_text(pdbqt_string)
    return out_pdbqt


# ---------------------------------------------------------------------------
# Vina execution
# ---------------------------------------------------------------------------
@dataclass
class DockPose:
    mode: int
    affinity: float  # kcal/mol
    rmsd_lb: float
    rmsd_ub: float


@dataclass
class DockResult:
    ligand_name: str
    ligand_smiles: str
    receptor_uniprot: str
    receptor_pdb: str
    best_affinity: float
    poses: List[DockPose]
    interactions: Dict[str, Any]
    pose_pdbqt_path: str
    log_path: str
    job_id: str
    pair_id: str
    error: Optional[str] = None


def _parse_vina_log(log_text: str) -> List[DockPose]:
    poses: List[DockPose] = []
    in_table = False
    for line in log_text.splitlines():
        s = line.strip()
        if s.startswith("mode |"):
            in_table = True; continue
        if not in_table:
            continue
        if not s or s.startswith("-"):
            continue
        parts = s.split()
        if len(parts) >= 4 and parts[0].isdigit():
            try:
                poses.append(DockPose(int(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])))
            except ValueError:
                continue
    return poses


def _analyse_pose_interactions(pose_pdb: Path, receptor_pdb: Path) -> Dict[str, Any]:
    """Very lightweight H-bond / hydrophobic detection (proximity-based)."""
    def _read_atoms(path: Path):
        atoms = []
        for line in path.read_text().splitlines():
            if not line.startswith(("ATOM", "HETATM")):
                continue
            try:
                x = float(line[30:38]); y = float(line[38:46]); z = float(line[46:54])
                atom = line[12:16].strip()
                resn = line[17:20].strip()
                resi = line[22:26].strip()
                chain = line[21].strip()
                atoms.append({"atom": atom, "resn": resn, "resi": resi, "chain": chain, "x": x, "y": y, "z": z})
            except Exception:
                continue
        return atoms
    lig = _read_atoms(pose_pdb)
    rec = _read_atoms(receptor_pdb)
    hbonds: List[Dict[str, Any]] = []
    hydrophobic: List[Dict[str, Any]] = []
    HBOND_ATOMS = {"N", "O", "F", "NE", "ND1", "ND2", "NE1", "NE2", "NH1", "NH2", "NZ",
                   "OD1", "OD2", "OE1", "OE2", "OG", "OG1", "OH"}
    HYDROPHOBIC = {"CA", "CB", "CG", "CD", "CE", "CZ", "CH2", "CD1", "CD2", "CG1", "CG2",
                   "CE1", "CE2", "CE3", "CZ2", "CZ3"}
    for la in lig:
        la_polar = la["atom"][:1] in ("N", "O", "F")
        for ra in rec:
            dx = la["x"] - ra["x"]; dy = la["y"] - ra["y"]; dz = la["z"] - ra["z"]
            d2 = dx * dx + dy * dy + dz * dz
            if d2 > 25:  # >5 Å
                continue
            d = d2 ** 0.5
            ra_polar = ra["atom"] in HBOND_ATOMS
            if la_polar and ra_polar and d <= 3.5:
                hbonds.append({"ligand_atom": la["atom"], "residue": f"{ra['resn']}{ra['resi']}",
                               "chain": ra["chain"], "distance": round(d, 2)})
            elif not la_polar and ra["atom"] in HYDROPHOBIC and d <= 4.5:
                hydrophobic.append({"ligand_atom": la["atom"], "residue": f"{ra['resn']}{ra['resi']}",
                                    "chain": ra["chain"], "distance": round(d, 2)})
    # Deduplicate by residue for readability
    def _dedup(rows, key="residue"):
        seen = {}
        for r in rows:
            k = r[key]
            if k not in seen or r["distance"] < seen[k]["distance"]:
                seen[k] = r
        return sorted(seen.values(), key=lambda r: r["distance"])
    return {"hydrogen_bonds": _dedup(hbonds)[:10],
            "hydrophobic_contacts": _dedup(hydrophobic)[:10]}


def _pdbqt_to_pdb(pdbqt_path: Path, pdb_path: Path) -> Path:
    conv = ob.OBConversion()
    conv.SetInAndOutFormats("pdbqt", "pdb")
    mol = ob.OBMol()
    if conv.ReadFile(mol, str(pdbqt_path)):
        conv.WriteFile(mol, str(pdb_path))
    return pdb_path


async def dock_pair(job_dir: Path, receptor_pdbqt: Path, receptor_pdb: Path,
                    ligand: Dict[str, str], box: Dict[str, float],
                    exhaustiveness: int = 8, num_modes: int = 9) -> DockResult:
    pair_id = f"{ligand['name']}_x_{receptor_pdb.stem}"
    pair_id = re.sub(r"[^A-Za-z0-9_.-]", "_", pair_id)[:80]
    pair_dir = job_dir / pair_id
    pair_dir.mkdir(exist_ok=True)
    ligand_pdbqt = pair_dir / "ligand.pdbqt"
    try:
        prepare_ligand_pdbqt(ligand["smiles"], ligand["name"], ligand_pdbqt)
    except Exception as e:
        return DockResult(ligand["name"], ligand["smiles"], ligand["uniprot_id"], receptor_pdb.stem,
                          best_affinity=0.0, poses=[], interactions={}, pose_pdbqt_path="",
                          log_path="", job_id=job_dir.name, pair_id=pair_id, error=str(e))
    out_pdbqt = pair_dir / "out.pdbqt"
    log_path = pair_dir / "vina.log"
    # Resolve the vina binary path from env / deps_check (never hardcoded)
    try:
        import deps_check
        vina_bin = deps_check.vina_path()
    except Exception as _e:
        return DockResult(ligand["name"], ligand["smiles"], ligand["uniprot_id"], receptor_pdb.stem,
                          best_affinity=0.0, poses=[], interactions={}, pose_pdbqt_path="",
                          log_path="", job_id=job_dir.name, pair_id=pair_id, error=str(_e))
    cmd = [
        vina_bin,
        "--receptor", str(receptor_pdbqt),
        "--ligand", str(ligand_pdbqt),
        "--center_x", f"{box['center_x']:.3f}",
        "--center_y", f"{box['center_y']:.3f}",
        "--center_z", f"{box['center_z']:.3f}",
        "--size_x", f"{box['size_x']:.3f}",
        "--size_y", f"{box['size_y']:.3f}",
        "--size_z", f"{box['size_z']:.3f}",
        "--exhaustiveness", str(exhaustiveness),
        "--num_modes", str(num_modes),
        "--out", str(out_pdbqt),
        "--seed", "42",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        cwd=str(pair_dir),
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=180)
    except asyncio.TimeoutError:
        proc.kill()
        return DockResult(ligand["name"], ligand["smiles"], ligand["uniprot_id"], receptor_pdb.stem,
                          best_affinity=0.0, poses=[], interactions={}, pose_pdbqt_path="",
                          log_path="", job_id=job_dir.name, pair_id=pair_id, error="Vina timed out")
    log_text = stdout.decode(errors="ignore") + "\n" + stderr.decode(errors="ignore")
    log_path.write_text(log_text)
    if proc.returncode != 0:
        return DockResult(ligand["name"], ligand["smiles"], ligand["uniprot_id"], receptor_pdb.stem,
                          best_affinity=0.0, poses=[], interactions={}, pose_pdbqt_path="",
                          log_path=str(log_path), job_id=job_dir.name, pair_id=pair_id,
                          error=f"Vina exited {proc.returncode}: {stderr.decode(errors='ignore')[:200]}")
    poses = _parse_vina_log(log_text)
    best = poses[0].affinity if poses else 0.0
    pose_pdb = pair_dir / "pose.pdb"
    _pdbqt_to_pdb(out_pdbqt, pose_pdb)
    interactions = _analyse_pose_interactions(pose_pdb, receptor_pdb)
    return DockResult(ligand["name"], ligand["smiles"], ligand["uniprot_id"], receptor_pdb.stem,
                      best_affinity=best, poses=poses, interactions=interactions,
                      pose_pdbqt_path=str(out_pdbqt), log_path=str(log_path),
                      job_id=job_dir.name, pair_id=pair_id)


async def run_docking_batch(compounds: List[Dict[str, str]],
                            targets: List[Dict[str, str]],
                            exhaustiveness: int = 8,
                            num_modes: int = 9,
                            box_padding: float = 8.0) -> Dict[str, Any]:
    """Run docking for every (compound, target) pair.

    compounds: [{name, smiles}]
    targets:   [{uniprot_id, pdb_id (optional; auto if omitted), gene_symbol}]
    """
    job_id = uuid.uuid4().hex[:12]
    job_dir = DOCK_ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    receptors: Dict[str, Dict[str, Any]] = {}
    for t in targets:
        uid = t["uniprot_id"]
        if uid in receptors:
            continue
        pdb_id = t.get("pdb_id")
        if not pdb_id:
            cands = await rcsb_candidates_for_uniprot(uid, limit=5)
            if not cands:
                receptors[uid] = {"error": "No PDB structure found", "uniprot_id": uid}
                continue
            pdb_id = cands[0]["pdb_id"]
        pdb_path = job_dir / f"{pdb_id}.pdb"
        try:
            if not pdb_path.exists():
                await download_pdb(pdb_id, pdb_path)
            recpt_pdbqt = job_dir / f"{pdb_id}.pdbqt"
            prepare_receptor_pdbqt(pdb_path, recpt_pdbqt)
            box = detect_binding_box(pdb_path, padding=box_padding)
            receptors[uid] = {"pdb_id": pdb_id, "pdb_path": str(pdb_path),
                              "pdbqt_path": str(recpt_pdbqt), "box": box,
                              "uniprot_id": uid, "gene_symbol": t.get("gene_symbol")}
        except Exception as e:
            logger.exception(f"Receptor prep failed for {uid}/{pdb_id}: {e}")
            receptors[uid] = {"error": str(e), "uniprot_id": uid, "pdb_id": pdb_id}
    # Batch dock — sequential to keep resource usage in check.
    pairs: List[DockResult] = []
    for c in compounds:
        for t in targets:
            rec = receptors.get(t["uniprot_id"])
            if not rec or rec.get("error"):
                pairs.append(DockResult(c["name"], c["smiles"], t["uniprot_id"],
                                        pdb_id=(rec or {}).get("pdb_id", ""),
                                        best_affinity=0.0, poses=[], interactions={},
                                        pose_pdbqt_path="", log_path="", job_id=job_id,
                                        pair_id=f"{c['name']}_x_{t['uniprot_id']}",
                                        error=(rec or {}).get("error", "no receptor")))
                continue
            res = await dock_pair(job_dir, Path(rec["pdbqt_path"]), Path(rec["pdb_path"]),
                                  {"name": c["name"], "smiles": c["smiles"], "uniprot_id": t["uniprot_id"]},
                                  rec["box"], exhaustiveness=exhaustiveness, num_modes=num_modes)
            pairs.append(res)
    pairs.sort(key=lambda p: p.best_affinity if p.best_affinity else 0.0)
    return {
        "job_id": job_id,
        "job_dir": str(job_dir),
        "receptors": receptors,
        "results": [asdict(p) for p in pairs],
    }


def get_pose_content(job_id: str, pair_id: str, fmt: str = "pdbqt") -> Tuple[bytes, str]:
    """Read the pose file for download."""
    safe_job = re.sub(r"[^A-Za-z0-9_.-]", "", job_id)
    safe_pair = re.sub(r"[^A-Za-z0-9_.-]", "", pair_id)
    pair_dir = DOCK_ROOT / safe_job / safe_pair
    if fmt == "pdb":
        p = pair_dir / "pose.pdb"
        return p.read_bytes(), "chemical/x-pdb"
    p = pair_dir / "out.pdbqt"
    return p.read_bytes(), "chemical/x-pdbqt"
