// PoseOverlayViewer — 3Dmol.js modal for the Docking Validation panel.
//
// Given a validation `job_id` + `pair_id`, fetches the three PDB blobs
// (receptor, native crystal ligand, redocked pose) from the backend and
// renders an overlay:
//   • Receptor       → light-grey cartoon + surface (semi-transparent)
//   • Crystal ligand → emerald sticks (thick)
//   • Redocked pose  → violet sticks (thick)
//
// The colour code lets a researcher see at a glance where the redocked
// pose deviates from the crystal — the whole point of the RMSD number.

import { useEffect, useRef, useState } from "react";
import { X, Loader2, Info, Download } from "lucide-react";
import { getDockingValidationOverlay } from "@/lib/api";

const CRYSTAL_COLOR   = 0x10B981;    // emerald-500
const REDOCKED_COLOR  = 0x8B5CF6;    // violet-500

export default function PoseOverlayViewer({ open, jobId, pairId, meta, onClose }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // ── Escape closes the modal ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // ── Fetch overlay PDBs whenever the modal opens on a new pair ──────
  useEffect(() => {
    if (!open || !jobId || !pairId) return;
    setLoading(true); setError(null); setData(null);
    getDockingValidationOverlay(jobId, pairId)
      .then((d) => setData(d))
      .catch((e) => setError(e?.response?.data?.detail || e?.message || "Overlay unavailable"))
      .finally(() => setLoading(false));
  }, [open, jobId, pairId]);

  // ── Render into 3Dmol once the PDBs arrive ─────────────────────────
  useEffect(() => {
    if (!open || !data || !hostRef.current) return;
    let cancelled = false;
    (async () => {
      const mod = await import("3dmol");
      const $3Dmol = mod.default || mod;
      if (cancelled) return;

      // Fresh viewer for every open/close cycle — avoids WebGL leaks.
      if (viewerRef.current) {
        try { viewerRef.current.clear(); } catch { /* ignore */ }
        viewerRef.current = null;
      }
      const v = $3Dmol.createViewer(hostRef.current, {
        defaultcolors: $3Dmol.rasmolElementColors,
      });
      v.setBackgroundColor(0xffffff);

      // Receptor — soft grey cartoon (visible but visually recessive).
      v.addModel(data.receptor_pdb, "pdb");
      v.setStyle({ hetflag: false }, { cartoon: { color: "#C7CDDA", opacity: 0.85 } });
      v.setStyle({ hetflag: true }, {});   // hide any HETATMs on the receptor model

      // Native crystal ligand — emerald sticks.
      v.addModel(data.native_ligand_pdb, "pdb");
      v.setStyle({ model: 1 }, { stick: { colorscheme: undefined, color: CRYSTAL_COLOR, radius: 0.22 } });

      // Redocked pose — violet sticks.
      v.addModel(data.redocked_pose_pdb, "pdb");
      v.setStyle({ model: 2 }, { stick: { colorscheme: undefined, color: REDOCKED_COLOR, radius: 0.22 } });

      // Zoom to the union of both ligands so the overlay is centred.
      v.zoomTo({ model: [1, 2] });
      v.zoom(1.1);
      v.render();

      viewerRef.current = v;
    })();
    return () => { cancelled = true; };
  }, [open, data]);

  // ── Tear down on unmount so React can safely re-mount later ────────
  useEffect(() => {
    return () => {
      if (viewerRef.current) {
        try { viewerRef.current.clear(); } catch { /* ignore */ }
        viewerRef.current = null;
      }
      if (hostRef.current) {
        // 3Dmol appends a WebGL canvas + label divs; detach them by hand so
        // React's fiber isn't surprised on the next mount.
        while (hostRef.current.firstChild) hostRef.current.removeChild(hostRef.current.firstChild);
      }
    };
  }, []);

  const downloadPdb = (label, text) => {
    const blob = new Blob([text], { type: "chemical/x-pdb" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta?.pdb_id || "validation"}_${label}.pdb`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!open) return null;

  return (
    <div
      data-testid="pose-overlay-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_40px_80px_-30px_rgba(15,23,42,0.5)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F1F1FA] bg-gradient-to-b from-[#F5F5FC] to-white px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Pose Overlay</p>
            <h3 className="mt-0.5 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {meta?.pdb_id || "Validation"} · {meta?.ligand_resname || "ligand"}
              {meta?.rmsd_angstrom !== undefined && meta?.rmsd_angstrom !== null && (
                <span className="ml-2 rounded-full bg-[#0B0B18] px-2 py-0.5 text-[11px] font-semibold text-white">
                  RMSD {meta.rmsd_angstrom} Å
                </span>
              )}
            </h3>
            {/* Legend chips */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Crystal (native)
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-violet-700">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-500" />
                Redocked pose
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300" />
                Receptor
              </span>
            </div>
          </div>
          <button
            data-testid="pose-overlay-close"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-[#0B0B18]/5 text-[#374151] hover:bg-[#0B0B18]/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Viewer canvas */}
        <div className="relative flex-1 bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <Loader2 className="h-5 w-5 animate-spin text-[#5139ED]" />
              <span className="ml-2 text-sm font-semibold text-[#5139ED]">Loading overlay…</span>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <div>
                <p className="font-display text-base font-bold text-[#B91C1C]">Overlay unavailable</p>
                <p className="mt-1 text-sm text-[#64748B]">{error}</p>
              </div>
            </div>
          )}
          <div
            ref={hostRef}
            data-testid="pose-overlay-canvas"
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {/* Footer downloads */}
        {data && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F1FA] bg-[#FBFBFF] px-6 py-3">
            <p className="flex items-start gap-1.5 text-[11.5px] text-[#64748B]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5139ED]" />
              Overlay rendered from the exact PDB slices used for the RMSD calculation.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => downloadPdb("crystal", data.native_ligand_pdb)}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-[11.5px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Download className="h-3 w-3" /> Crystal.pdb
              </button>
              <button
                onClick={() => downloadPdb("redocked", data.redocked_pose_pdb)}
                className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-[11.5px] font-semibold text-violet-800 hover:bg-violet-100"
              >
                <Download className="h-3 w-3" /> Redocked.pdb
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
