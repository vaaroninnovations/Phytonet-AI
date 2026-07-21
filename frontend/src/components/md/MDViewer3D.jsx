// Minimal 3Dmol.js viewer for MD (initial ↔ final structure toggle).
// DOM-isolated (plain host div) so React doesn't fight 3Dmol's manual removal.
import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";

export default function MDViewer3D({ pdbUrl, ligandName = "LIG", pdbData = null, finalPdbData = null }) {
  const hostRef = useRef(null);
  const viewerRef = useRef(null);
  const [mode, setMode] = useState("initial");         // initial | final
  const [rep, setRep] = useState({ cartoon: true, surface: false, stick: false, hbonds: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load PDB (initial or final) and (re)render.
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);

    async function load() {
      try {
        let text = mode === "final" ? finalPdbData : pdbData;
        if (!text && mode === "initial" && pdbUrl) {
          const r = await fetch(pdbUrl);
          if (!r.ok) throw new Error(`RCSB fetch ${r.status}`);
          text = await r.text();
        }
        if (cancelled) return;
        if (!text) { setError("No structure loaded"); setLoading(false); return; }

        const $3Dmol = (await import("3dmol")).default || (await import("3dmol"));
        const host = hostRef.current;
        if (!host) return;
        // Clear any prior 3Dmol children so re-renders don't stack canvases.
        while (host.firstChild) host.removeChild(host.firstChild);
        const viewer = $3Dmol.createViewer(host, { backgroundColor: "white" });
        viewerRef.current = viewer;
        viewer.addModel(text, "pdb");
        // Style
        viewer.setStyle({}, {});
        if (rep.cartoon) viewer.setStyle({ chain: /^(?!L$).*/ }, { cartoon: { color: "spectrum" } });
        if (rep.stick) viewer.addStyle({}, { stick: { radius: 0.15 } });
        if (rep.surface) viewer.addSurface($3Dmol.SurfaceType.MS, { opacity: 0.35, color: "#94A3B8" }, { chain: /^(?!L$).*/ });
        // Highlight ligand (chain L or HETATM residue name = ligandName)
        viewer.setStyle({ chain: "L" }, { stick: { colorscheme: "purpleCarbon", radius: 0.25 } });
        viewer.setStyle({ resn: ligandName }, { stick: { colorscheme: "purpleCarbon", radius: 0.25 } });
        // H-bond visualization (as thin dashed cylinders — approximation)
        if (rep.hbonds) {
          try {
            viewer.setStyle({ elem: "O" }, { stick: { radius: 0.15 }, sphere: { radius: 0.35, color: "#F59E0B", opacity: 0.6 } });
            viewer.setStyle({ elem: "N" }, { stick: { radius: 0.15 }, sphere: { radius: 0.35, color: "#0F7A47", opacity: 0.4 } });
          } catch (_) { /* best effort */ }
        }
        viewer.zoomTo();
        viewer.render();
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(String(e.message || e)); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [pdbUrl, pdbData, finalPdbData, mode, rep, ligandName]);

  const downloadSnapshot = () => {
    try {
      const png = viewerRef.current?.pngURI?.();
      if (!png) return;
      const a = document.createElement("a");
      a.href = png; a.download = `md_${mode}_${ligandName}.png`; a.click();
    } catch (e) { console.debug("snapshot failed", e); }
  };

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full border border-[#E7E7F3] bg-white p-0.5 text-[11px] font-semibold">
          <button
            data-testid="md-viewer-mode-initial"
            onClick={() => setMode("initial")}
            className={`rounded-full px-3 py-1 ${mode === "initial" ? "bg-[#5139ED] text-white" : "text-[#64748B]"}`}
          >Initial</button>
          <button
            data-testid="md-viewer-mode-final"
            disabled={!finalPdbData}
            onClick={() => setMode("final")}
            className={`rounded-full px-3 py-1 ${mode === "final" ? "bg-[#5139ED] text-white" : "text-[#64748B]"} disabled:opacity-40`}
            title={!finalPdbData ? "Upload final structure to enable" : ""}
          >Final</button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {["cartoon", "surface", "stick", "hbonds"].map((k) => (
            <button
              key={k}
              data-testid={`md-viewer-rep-${k}`}
              onClick={() => setRep((r) => ({ ...r, [k]: !r[k] }))}
              className={`rounded-full border px-2.5 py-1 font-semibold ${
                rep[k] ? "border-[#5139ED] bg-[#F5F3FE] text-[#5139ED]" : "border-[#E7E7F3] bg-white text-[#64748B]"
              }`}
            >{k.charAt(0).toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
        <button
          data-testid="md-viewer-snapshot"
          onClick={downloadSnapshot}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[11px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40"
        ><Download className="h-3 w-3" />PNG</button>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white">
        {loading && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white/70 text-[#5139ED]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-white text-center text-[13px] text-[#64748B]">
            <div>
              <p className="font-semibold text-[#0B0B18]">Viewer unavailable</p>
              <p className="mt-1 max-w-xs px-4">{error}</p>
            </div>
          </div>
        )}
        <div ref={hostRef} className="h-full w-full" data-testid="md-3d-viewer-host" />
      </div>
    </div>
  );
}
