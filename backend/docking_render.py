"""Server-side high-DPI 3D snapshot of a protein-ligand docking complex.

Uses matplotlib in Agg (offscreen) mode to render the receptor Cα trace,
interacting side-chains, and the docked ligand at arbitrary DPI. This exists
because the client-side 3Dmol.js WebGL canvas is fundamentally limited to the
device's GPU dimensions — typically capping publication exports around ~300
DPI. matplotlib+Agg has no such cap and can produce 600–1200 DPI PNG / TIFF /
PDF for direct submission to journals.

The renderer is deliberately style-agnostic (line + sticks + labels) so it
composites well with modern figure layouts. For true ray-traced beauty, PyMOL
would be preferred, but this ships without any extra ~200 MB dependency.
"""
from __future__ import annotations
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")                               # no display, thread-safe
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D             # noqa: F401 — registers 3D projection

# ── PDB parsing ─────────────────────────────────────────────────────────
def _read_pdb_atoms(text: str) -> List[Dict[str, Any]]:
    atoms: List[Dict[str, Any]] = []
    for line in text.splitlines():
        if not line.startswith(("ATOM", "HETATM")):
            continue
        try:
            atoms.append({
                "kind":  line[:6].strip(),
                "atom":  line[12:16].strip(),
                "resn":  line[17:20].strip(),
                "chain": line[21].strip() or "A",
                "resi":  int(line[22:26].strip()),
                "x": float(line[30:38]),
                "y": float(line[38:46]),
                "z": float(line[46:54]),
                "elem":  (line[76:78].strip() or line[12:14].strip() or "C").upper(),
            })
        except (ValueError, IndexError):
            continue
    return atoms


_ELEM_COLORS = {
    "C": "#4A4A4A", "N": "#3B82F6", "O": "#DC2626", "S": "#EAB308",
    "P": "#F97316", "F": "#22C55E", "H": "#D4D4D4",
}


def _elem_color(elem: str) -> str:
    if not elem:
        return "#4A4A4A"
    e = elem.strip().upper()
    if e[0] in _ELEM_COLORS:
        return _ELEM_COLORS[e[0]]
    return "#4A4A4A"


# ── Renderer ────────────────────────────────────────────────────────────
def render_complex_snapshot(
    complex_pdb_text: str,
    interactions: Optional[Dict[str, List[Dict[str, Any]]]] = None,
    *,
    title: Optional[str] = None,
    dpi: int = 600,
    figsize_in: Tuple[float, float] = (7.5, 7.5),
    show_hbond_labels: bool = True,
    palette: Optional[Dict[str, str]] = None,
    background: str = "white",
    fmt: str = "png",
) -> Tuple[bytes, str]:
    """Render the docked complex to publication-quality bytes.

    Args:
        complex_pdb_text: contents of a PDB with receptor + ligand
            (ligand assumed on chain 'L' as produced by
            docking_service._build_complex_pdb).
        interactions: interaction dict from `_analyse_pose_interactions`.
            Only rows with a numeric ``distance`` are drawn as annotated lines.
        dpi: output resolution — 300 (screen), 600 (journal), 1200 (print).
        figsize_in: figure size in *inches* (matplotlib native).
        fmt: ``png`` | ``tiff`` | ``pdf`` | ``svg``.

    Returns:
        (bytes, mime_type)
    """
    palette = palette or {}
    receptor_color = palette.get("receptor", "#94A3B8")
    active_color   = palette.get("active",   "#F59E0B")
    ligand_color   = palette.get("ligand",   "#5139ED")
    hbond_color    = palette.get("hbond",    "#0F7A47")

    atoms = _read_pdb_atoms(complex_pdb_text)
    if not atoms:
        raise ValueError("No ATOM/HETATM records found in complex_pdb_text")

    lig = [a for a in atoms if a["chain"] == "L"]
    rec = [a for a in atoms if a["chain"] != "L"]

    # Interacting residue indices (in receptor chains) for highlighting
    active_res: set = set()
    if interactions:
        for row in (interactions.get("all") or []):
            m = re.match(r"^([A-Z]{3})(\d+)$", str(row.get("residue", "")))
            if m:
                active_res.add(int(m.group(2)))

    # Figure
    fig = plt.figure(figsize=figsize_in, dpi=dpi, facecolor=background)
    ax = fig.add_subplot(111, projection="3d")
    ax.set_facecolor(background)

    # Receptor Cα trace grouped per chain
    for chain in sorted({a["chain"] for a in rec}):
        ca = [a for a in rec if a["chain"] == chain and a["atom"] == "CA"]
        ca.sort(key=lambda a: a["resi"])
        if ca:
            ax.plot([a["x"] for a in ca], [a["y"] for a in ca], [a["z"] for a in ca],
                    color=receptor_color, linewidth=0.8, alpha=0.75, solid_capstyle="round")

    # Highlight active-site residues (all side-chain heavy atoms)
    if active_res:
        act_atoms = [a for a in rec if a["resi"] in active_res and a["atom"] not in {"C", "N", "O", "CA"}]
        if act_atoms:
            ax.scatter([a["x"] for a in act_atoms],
                       [a["y"] for a in act_atoms],
                       [a["z"] for a in act_atoms],
                       c=active_color, s=8, edgecolors="none", alpha=0.85, depthshade=True)

    # Ligand — coloured by element, sized generously so it reads as sticks
    if lig:
        lig_colors = [_elem_color(a["elem"]) for a in lig]
        ax.scatter([a["x"] for a in lig], [a["y"] for a in lig], [a["z"] for a in lig],
                   c=lig_colors, s=90, edgecolors="k", linewidths=0.5, depthshade=True)

    # Draw non-covalent interactions
    if interactions and show_hbond_labels:
        for row in (interactions.get("all") or [])[:12]:
            m = re.match(r"^([A-Z]{3})(\d+)$", str(row.get("residue", "")))
            la = row.get("ligand_atom")
            if not m or not la:
                continue
            resi = int(m.group(2))
            lig_atom = next((a for a in lig if a["atom"] == la), None)
            res_atom = next(
                (a for a in rec if a["resi"] == resi and a["atom"] not in {"C", "N", "O"}),
                None,
            )
            if not lig_atom or not res_atom:
                continue
            ax.plot([lig_atom["x"], res_atom["x"]],
                    [lig_atom["y"], res_atom["y"]],
                    [lig_atom["z"], res_atom["z"]],
                    color=hbond_color, linestyle="--", linewidth=0.9, alpha=0.85)
            mid = ((lig_atom["x"] + res_atom["x"]) / 2,
                   (lig_atom["y"] + res_atom["y"]) / 2,
                   (lig_atom["z"] + res_atom["z"]) / 2)
            ax.text(mid[0], mid[1], mid[2], f"{row.get('distance', 0):.1f} Å",
                    color=hbond_color, fontsize=6, ha="center", va="center",
                    bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none", alpha=0.85))

    # Frame the ligand — most viewers care about the pocket, not the whole protein
    if lig:
        cx = sum(a["x"] for a in lig) / len(lig)
        cy = sum(a["y"] for a in lig) / len(lig)
        cz = sum(a["z"] for a in lig) / len(lig)
        span = 20.0
        ax.set_xlim(cx - span, cx + span)
        ax.set_ylim(cy - span, cy + span)
        ax.set_zlim(cz - span, cz + span)

    ax.set_axis_off()
    if title:
        ax.set_title(title, fontsize=8, color="#0B0B18", pad=8)

    fmt_map = {
        "png":  ("png",  "image/png"),
        "tiff": ("tiff", "image/tiff"),
        "pdf":  ("pdf",  "application/pdf"),
        "svg":  ("svg",  "image/svg+xml"),
    }
    if fmt not in fmt_map:
        raise ValueError(f"Unsupported snapshot format: {fmt!r}")
    matplotlib_fmt, mime = fmt_map[fmt]

    buf = io.BytesIO()
    fig.tight_layout(pad=0.5)
    savefig_kwargs: Dict[str, Any] = {
        "format": matplotlib_fmt, "dpi": dpi, "bbox_inches": "tight",
        "facecolor": background,
    }
    if matplotlib_fmt == "tiff":
        # LZW compression is only meaningful for the TIFF/Pillow backend.
        savefig_kwargs["pil_kwargs"] = {"compression": "tiff_lzw"}
    fig.savefig(buf, **savefig_kwargs)
    plt.close(fig)
    return buf.getvalue(), mime


def snapshot_for_pair(job_id: str, pair_id: str, dpi: int = 600, fmt: str = "png",
                      show_hbond_labels: bool = True) -> Tuple[bytes, str]:
    """Convenience wrapper: read the on-disk artifacts for a docking pair
    and render a high-DPI snapshot."""
    import json
    from docking_service import DOCK_ROOT
    pair_dir: Path = DOCK_ROOT / re.sub(r"[^A-Za-z0-9_.-]", "", job_id) / re.sub(r"[^A-Za-z0-9_.-]", "", pair_id)
    complex_pdb = pair_dir / "complex.pdb"
    if not complex_pdb.exists():
        raise FileNotFoundError(f"complex.pdb not found for job={job_id} pair={pair_id}")
    interactions = None
    inter_path = pair_dir / "interactions.json"
    if inter_path.exists():
        try:
            interactions = json.loads(inter_path.read_text())
        except Exception:
            interactions = None
    return render_complex_snapshot(
        complex_pdb.read_text(),
        interactions=interactions,
        dpi=dpi,
        fmt=fmt,
        show_hbond_labels=show_hbond_labels,
        title=f"{pair_id}  ·  {dpi} DPI",
    )
