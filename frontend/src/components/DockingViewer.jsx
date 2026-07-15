// DockingViewer — publication-ready 3D complex viewer + 2D interaction diagram
// + downloads for a single docking pair (job_id + pair_id).
//
// Renders four columns:
//   1. Interactive 3D viewer (3Dmol.js) — receptor cartoon + ligand sticks + H-bond
//      distance labels. Rotate / zoom / reset / fullscreen.
//   2. 2D interaction diagram (SVG) — LigPlot-style: ligand centroid at the origin
//      with residues arrayed around it, coloured by interaction type, dashed lines
//      with distance labels.
//   3. Interactions table (residue / type / distance).
//   4. Download panel (Complex PDB / Pose PDBQT / Pose PDB / Interaction CSV /
//      Snapshot PNG-SVG-TIFF-PDF).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Expand, RotateCcw, Loader2, Camera, Info } from "lucide-react";
import { dockingPoseURL } from "@/lib/api";
import {
  downloadPNG, downloadSVG, downloadTIFF, downloadPDF,
  canvasToTIFF, canvasToPDF, canvasToPNG,
} from "@/lib/figureExporters";
import { CustomizeFigureButton } from "@/components/CustomizeFigureButton";

const INTERACTION_STYLE = {
  hydrogen_bond:   { color: "#2BB673", stroke: "#0F7A47", label: "H-Bond" },
  hydrophobic:     { color: "#F59E0B", stroke: "#B45309", label: "Hydrophobic" },
  salt_bridge:     { color: "#E11D48", stroke: "#9F1239", label: "Salt Bridge" },
  pi_stacking:     { color: "#7C3AED", stroke: "#5B21B6", label: "π-Stacking" },
};

/**
 * @param {{jobId: string, pairId: string, ligandName: string, receptor: string,
 *          bestAffinity: number, interactions: object}} props
 */
export default function DockingViewer({ jobId, pairId, ligandName, receptor, bestAffinity, interactions }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div data-testid={`docking-viewer-${pairId}`} className="rounded-3xl border border-[#E7E7F3] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-heading text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Complex viewer
          </p>
          <h3 className="mt-1 font-display text-[18px] font-bold text-[#0B0B18]">
            {ligandName} <span className="text-[#94A3B8]">×</span> {receptor}
            <span className="ml-2 rounded-full bg-[#5139ED]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#5139ED]">
              {bestAffinity?.toFixed?.(2) ?? "—"} kcal/mol
            </span>
          </h3>
        </div>
        <button data-testid={`viewer-toggle-${pairId}`} onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
          <Expand className="h-3.5 w-3.5" /> {expanded ? "Collapse" : "Expand viewer"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CustomizeFigureButton chartType="docking" testid={`customize-figure-docking-${pairId}`} />
        </div>
      )}

      {expanded && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Complex3DViewer jobId={jobId} pairId={pairId} interactions={interactions} />
          <div className="flex flex-col gap-4">
            <InteractionDiagram2D pairId={pairId} interactions={interactions} ligandName={ligandName} receptor={receptor} />
            <InteractionsTable interactions={interactions} pairId={pairId} />
            <DownloadPanel jobId={jobId} pairId={pairId} ligandName={ligandName} receptor={receptor} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 3D Complex viewer (3Dmol.js) ─────────────────────────────────────── */
function Complex3DViewer({ jobId, pairId, interactions }) {
  const wrapRef = useRef(null);
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [style, setStyle] = useState("cartoon");        // cartoon | surface
  const [showHbondLabels, setShowHbondLabels] = useState(true);

  const applyStyle = useCallback((v) => {
    if (!viewerRef.current) return;
    viewerRef.current.setStyle({}, {});
    // Receptor
    if (style === "cartoon") {
      viewerRef.current.setStyle({ chain: "A" }, { cartoon: { color: "spectrum" } });
    } else {
      viewerRef.current.setStyle({ chain: "A" }, { cartoon: { color: "#E7E7F3" } });
      viewerRef.current.addSurface(v.SurfaceType.VDW, { opacity: 0.75, color: "#c8c8e6" }, { chain: "A" });
    }
    // Ligand
    viewerRef.current.setStyle({ chain: "L" }, { stick: { colorscheme: "greenCarbon", radius: 0.22 } });
    viewerRef.current.addStyle({ chain: "L" }, { sphere: { colorscheme: "greenCarbon", radius: 0.35 } });
    // Residues in interactions — sticks
    const resList = new Set();
    Object.values(interactions || {}).forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((r) => r.residue && resList.add(r.residue.replace(/^[A-Z]{3}/, "")));
    });
    if (resList.size) {
      viewerRef.current.addStyle(
        { chain: "A", resi: Array.from(resList) },
        { stick: { colorscheme: "yellowCarbon", radius: 0.15 } }
      );
      viewerRef.current.addResLabels(
        { chain: "A", resi: Array.from(resList) },
        { fontSize: 11, backgroundColor: "#0B0B18", backgroundOpacity: 0.7,
          fontColor: "#FFFFFF", showBackground: true }
      );
    }
    // H-bond distance labels
    if (showHbondLabels) {
      const bonds = interactions?.hydrogen_bonds || [];
      bonds.slice(0, 8).forEach((b) => {
        try {
          const ri = String(b.residue).replace(/^[A-Z]{3}/, "");
          const ligPos = viewerRef.current.selectedAtoms({ chain: "L", atom: b.ligand_atom })?.[0];
          const recPos = viewerRef.current.selectedAtoms({ chain: "A", resi: ri, atom: b.ligand_atom.startsWith("O") ? "N" : "O" })?.[0]
            || viewerRef.current.selectedAtoms({ chain: "A", resi: ri })?.[0];
          if (ligPos && recPos) {
            viewerRef.current.addLine({
              start: ligPos, end: recPos, dashed: true, color: "#2BB673",
            });
            viewerRef.current.addLabel(`${b.distance} Å`, {
              position: { x: (ligPos.x + recPos.x) / 2, y: (ligPos.y + recPos.y) / 2, z: (ligPos.z + recPos.z) / 2 },
              fontSize: 10, backgroundColor: "#0F7A47", fontColor: "#FFFFFF",
              backgroundOpacity: 0.85, showBackground: true, borderThickness: 0,
            });
          }
        } catch { /* skip missing atoms */ }
      });
    }
    viewerRef.current.zoomTo({ chain: "L" });
    viewerRef.current.zoom(0.6, 500);
    viewerRef.current.render();
  }, [style, showHbondLabels, interactions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const $3Dmol = (await import("3dmol")).default || (await import("3dmol"));
        if (cancelled || !wrapRef.current) return;
        // Fetch complex.pdb
        const url = dockingPoseURL(jobId, pairId, "complex_pdb");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`complex.pdb HTTP ${res.status}`);
        const pdbText = await res.text();

        wrapRef.current.innerHTML = "";
        viewerRef.current = $3Dmol.createViewer(wrapRef.current, {
          backgroundColor: "white",
          // Required for `getCanvas().toDataURL()` / `getImageData()` to work —
          // without this WebGL clears the drawing buffer after each frame.
          preserveDrawingBuffer: true,
          antialias: true,
        });
        viewerRef.current.addModel(pdbText, "pdb");
        applyStyle($3Dmol);
        setLoading(false);
      } catch (e) {
        console.error(e);
        toast.error(`Viewer failed: ${e.message || e}`);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId, pairId, applyStyle]);

  const reset = () => {
    if (viewerRef.current) {
      viewerRef.current.zoomTo({ chain: "L" });
      viewerRef.current.zoom(0.6, 500);
      viewerRef.current.render();
    }
  };

  const fullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const snapshot = async (fmt) => {
    if (!viewerRef.current) return;
    const base = `${pairId}_3D`;
    try {
      const canvas =
        (viewerRef.current.getCanvas && viewerRef.current.getCanvas()) ||
        wrapRef.current?.querySelector("canvas");
      if (!canvas) throw new Error("3D canvas not available");
      viewerRef.current.render();
      if (fmt === "png")       canvasToPNG(canvas, `${base}.png`);
      else if (fmt === "tiff") canvasToTIFF(canvas, `${base}.tiff`, { dpi: 300 });
      else if (fmt === "pdf")  canvasToPDF(canvas, `${base}.pdf`);
      else                     throw new Error(`Unsupported snapshot format: ${fmt}`);
    } catch (e) {
      toast.error(`Snapshot failed: ${e.message || e}`);
    }
  };

  /** Server-side high-DPI render (matplotlib Agg). Downloads at 600 DPI by
   *  default — the browser canvas is capped by the GPU, this isn't. */
  const hiResExport = async (fmt, dpi) => {
    try {
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/docking/render/${jobId}/${pairId}?dpi=${dpi}&fmt=${fmt}&labels=${showHbondLabels}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${pairId}_${dpi}dpi.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success(`Downloaded ${dpi} DPI ${fmt.toUpperCase()}`);
    } catch (e) {
      toast.error(`High-DPI render failed: ${(e.message || e).toString().slice(0, 120)}`);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {["cartoon", "surface"].map((v) => (
            <button key={v} data-testid={`viewer-style-${v}`} onClick={() => setStyle(v)}
                    className={`rounded-full px-3 py-1 text-[10px] font-bold capitalize ${
                      style === v ? "bg-[#5139ED] text-white" : "border border-[#E7E7F3] bg-white text-[#0B0B18]"}`}>
              {v}
            </button>
          ))}
          <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-[#0B0B18]">
            <input data-testid="viewer-hbond-labels" type="checkbox" checked={showHbondLabels}
                   onChange={(e) => setShowHbondLabels(e.target.checked)} className="accent-[#5139ED]" />
            H-bond distances
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button data-testid={`viewer-reset-${pairId}`} onClick={reset} title="Reset view"
                  className="grid h-7 w-7 place-items-center rounded-full border border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button data-testid={`viewer-fullscreen-${pairId}`} onClick={fullscreen} title="Fullscreen"
                  className="grid h-7 w-7 place-items-center rounded-full border border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40">
            <Expand className="h-3.5 w-3.5" />
          </button>
          <button data-testid={`viewer-snapshot-png-${pairId}`} onClick={() => snapshot("png")} title="Snapshot PNG"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
            <Camera className="h-3 w-3" /> PNG
          </button>
          <button data-testid={`viewer-snapshot-tiff-${pairId}`} onClick={() => snapshot("tiff")} title="Snapshot TIFF (300 DPI)"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
            <Camera className="h-3 w-3" /> TIFF
          </button>
          <button data-testid={`viewer-snapshot-pdf-${pairId}`} onClick={() => snapshot("pdf")} title="Snapshot PDF"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
            <Camera className="h-3 w-3" /> PDF
          </button>
          <span className="mx-1 h-4 w-px bg-[#E7E7F3]" />
          <select
            data-testid={`viewer-hidpi-${pairId}`}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [fmt, dpi] = v.split(":");
              hiResExport(fmt, Number(dpi));
              e.target.value = "";
            }}
            title="Server-side render at journal-grade DPI"
            className="rounded-full border border-[#5139ED]/40 bg-white px-2 py-1 text-[10px] font-bold text-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/30"
          >
            <option value="">High-DPI ▾</option>
            <optgroup label="PNG (raster)">
              <option value="png:600">PNG · 600 DPI</option>
              <option value="png:1200">PNG · 1200 DPI</option>
            </optgroup>
            <optgroup label="TIFF (journal)">
              <option value="tiff:600">TIFF · 600 DPI (LZW)</option>
              <option value="tiff:1200">TIFF · 1200 DPI (LZW)</option>
            </optgroup>
            <optgroup label="Vector">
              <option value="pdf:600">PDF</option>
              <option value="svg:600">SVG</option>
            </optgroup>
          </select>
        </div>
      </div>
      <div ref={wrapRef} className="relative h-[420px] w-full rounded-xl bg-white">
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/60 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[#5139ED]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading 3D complex…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 2D Interaction diagram (SVG, publication-ready) ────────────────────── */
function InteractionDiagram2D({ pairId, interactions, ligandName, receptor }) {
  const svgRef = useRef(null);
  const rows = useMemo(() => {
    const all = interactions?.all || [];
    // Prefer H-bonds + salt bridges + pi-stacking first (biologically most important)
    const priority = { hydrogen_bond: 1, salt_bridge: 2, pi_stacking: 3, hydrophobic: 4 };
    return [...all].sort((a, b) => (priority[a.type] || 9) - (priority[b.type] || 9)).slice(0, 14);
  }, [interactions]);

  const W = 560, H = 460;
  const CX = W / 2, CY = H / 2;
  const R = 170;

  const download = async (fmt) => {
    if (!svgRef.current) return;
    const base = `${pairId}_interactions`;
    if (fmt === "svg") await downloadSVG(svgRef.current, `${base}.svg`, { title: `${ligandName} × ${receptor}` });
    else if (fmt === "png") await downloadPNG(svgRef.current, `${base}.png`, { dpi: 300, title: `${ligandName} × ${receptor}` });
    else if (fmt === "tiff") await downloadTIFF(svgRef.current, `${base}.tiff`, { dpi: 300, title: `${ligandName} × ${receptor}` });
    else if (fmt === "pdf") await downloadPDF(svgRef.current, `${base}.pdf`, { title: `${ligandName} × ${receptor}` });
  };

  return (
    <div className="rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">2D Interaction diagram</p>
        <div className="flex items-center gap-1">
          {["svg", "png", "tiff", "pdf"].map((f) => (
            <button key={f} data-testid={`viewer-2d-${f}-${pairId}`} onClick={() => download(f)}
                    className="rounded-full border border-[#E7E7F3] bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[#0B0B18] hover:border-[#5139ED]/40">
              {f}
            </button>
          ))}
        </div>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="rounded-xl bg-white"
           fontFamily="'Inter', system-ui, sans-serif">
        {/* Ligand centroid */}
        <circle cx={CX} cy={CY} r="34" fill="#5139ED" opacity="0.95" />
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="13" fontWeight="700" fill="white">{ligandName}</text>
        <text x={CX} y={CY + 14} textAnchor="middle" fontSize="10" fill="white" opacity="0.85">ligand</text>
        {rows.map((r, i) => {
          const theta = (i / Math.max(1, rows.length)) * 2 * Math.PI - Math.PI / 2;
          const x = CX + R * Math.cos(theta);
          const y = CY + R * Math.sin(theta);
          const style = INTERACTION_STYLE[r.type] || { color: "#94A3B8", stroke: "#64748B", label: r.type };
          const mx = (CX + x) / 2, my = (CY + y) / 2;
          return (
            <g key={i}>
              <line x1={CX} y1={CY} x2={x} y2={y} stroke={style.stroke}
                    strokeWidth="1.4"
                    strokeDasharray={r.type === "hydrogen_bond" ? "5,4" : r.type === "salt_bridge" ? "2,2" : "1,3"} />
              <rect x={mx - 22} y={my - 8} width="44" height="16" rx="8" fill="#0B0B18" opacity="0.8" />
              <text x={mx} y={my + 4} textAnchor="middle" fontSize="9" fill="white">{r.distance} Å</text>
              <circle cx={x} cy={y} r="22" fill={style.color} opacity="0.9" />
              <text x={x} y={y - 1} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="white">{r.residue}</text>
              <text x={x} y={y + 11} textAnchor="middle" fontSize="8" fill="white" opacity="0.85">{r.chain}</text>
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(12, ${H - 78})`}>
          {Object.entries(INTERACTION_STYLE).map(([k, v], i) => (
            <g key={k} transform={`translate(0, ${i * 16})`}>
              <circle cx="8" cy="6" r="6" fill={v.color} />
              <text x="20" y="10" fontSize="10.5" fill="#0B0B18">{v.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ── Interactions table ─────────────────────────────────────────────────── */
function InteractionsTable({ interactions, pairId }) {
  const rows = interactions?.all || [];
  return (
    <div className="rounded-2xl border border-[#E7E7F3] bg-white">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="font-heading text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Interactions ({rows.length})
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] text-[#64748B]">
          <Info className="h-3 w-3" /> polar / hydrophobic / charged / aromatic
        </span>
      </div>
      <div className="max-h-72 overflow-auto border-t border-[#F1F1FA]">
        <table data-testid={`viewer-int-tbl-${pairId}`} className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-[#FAFAFF] text-[10px] uppercase tracking-widest text-[#64748B]">
            <tr>
              <th className="px-3 py-2">Residue</th>
              <th className="px-3 py-2">Chain</th>
              <th className="px-3 py-2">Ligand atom</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Distance (Å)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-[#94A3B8]">No non-covalent interactions detected.</td></tr>
            )}
            {rows.map((r, i) => {
              const s = INTERACTION_STYLE[r.type] || { color: "#94A3B8", label: r.type };
              return (
                <tr key={i} className={i % 2 ? "bg-white" : "bg-[#FAFAFF]"}>
                  <td className="px-3 py-1.5 font-semibold text-[#0B0B18]">{r.residue}</td>
                  <td className="px-3 py-1.5 text-[#64748B]">{r.chain}</td>
                  <td className="px-3 py-1.5 font-mono text-[#64748B]">{r.ligand_atom}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: s.color }}>{s.label}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-[#0B0B18]">{r.distance}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Downloads panel ────────────────────────────────────────────────────── */
function DownloadPanel({ jobId, pairId, ligandName, receptor }) {
  const dl = (fmt, ext, label) => (
    <a data-testid={`viewer-dl-${fmt}-${pairId}`} key={fmt}
       href={dockingPoseURL(jobId, pairId, fmt)}
       download={`${ligandName}_x_${receptor}_${ext}`}
       className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[10.5px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]">
      <Download className="h-3 w-3" /> {label}
    </a>
  );
  return (
    <div className="rounded-2xl border border-[#E7E7F3] bg-white p-3">
      <p className="font-heading text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Downloads</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {dl("complex_pdb",       "complex.pdb",       "Complex PDB")}
        {dl("best_pdbqt",        "best_pose.pdbqt",   "Best pose PDBQT")}
        {dl("best_pdb",          "best_pose.pdb",     "Best pose PDB")}
        {dl("pdbqt",             "all_poses.pdbqt",   "All poses PDBQT")}
        {dl("pdb",               "all_poses.pdb",     "All poses PDB")}
        {dl("interactions_csv",  "interactions.csv",  "Interactions CSV")}
        {dl("interactions_json", "interactions.json", "Interactions JSON")}
      </div>
      <p className="mt-2 text-[10px] text-[#94A3B8]">
        PNG / SVG / TIFF / PDF snapshots of the 3D view and 2D diagram are exported via the toolbars above.
      </p>
    </div>
  );
}
