import { useState } from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Search,
  Eye,
  EyeOff,
  Type,
} from "lucide-react";
import { toast } from "sonner";
import {
  cyDownloadPNG,
  cyDownloadJPG,
  cyDownloadSVG,
  cyDownloadTIFF,
  cyDownloadPDF,
} from "@/lib/figureExporters";
import { downloadGraph } from "@/lib/graphExporters";
import { requireAuth } from "@/context/AuthContext";

export const CY_LAYOUTS = [
  { key: "fcose", label: "fCoSE (default)" },
  { key: "concentric", label: "Concentric" },
  { key: "circle", label: "Circle" },
  { key: "breadthfirst", label: "Breadthfirst" },
  { key: "grid", label: "Grid" },
  { key: "cose-bilkent", label: "Cose-Bilkent" },
  { key: "dagre", label: "Dagre (Hierarchical)" },
];

const btn = "inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] disabled:opacity-40";

/**
 * Toolbar for interactive Cytoscape.js networks.
 * Props:
 *   getCy: () => cytoscape instance
 *   containerRef: for fullscreen
 *   basename: filename prefix for exports
 *   graph: {nodes,edges} for GraphML/GML/XGMML/JSON exports (optional)
 *   title: figure title
 *   layout, onLayoutChange: controlled layout selector
 *   onHighlightSelected: (bool) => void
 *   onToggleLabels: (bool) => void
 *   showExtraExports: boolean — include GraphML/GML/XGMML/JSON download buttons
 */
export function CyToolbar({
  getCy,
  containerRef,
  basename = "network",
  graph,
  title,
  layout = "fcose",
  onLayoutChange,
  onResetLayout,
  onHighlightSelected,
  onToggleLabels,
  showExtraExports = true,
  testidPrefix,
}) {
  const [busy, setBusy] = useState(false);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [highlight, setHighlight] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const tp = testidPrefix || basename.replace(/\W+/g, "-");

  const withBusy = (fn) => async () => {
    if (busy) return;
    requireAuth(async () => {
      setBusy(true);
      try { await fn(); } catch (e) { toast.error(`Failed: ${e.message || e}`); }
      finally { setBusy(false); }
    });
  };

  const withCy = (fn) => async () => {
    const cy = getCy?.(); if (!cy) return toast.error("Network not ready");
    return fn(cy);
  };

  const zoomIn = () => { const cy = getCy?.(); if (cy) cy.zoom({ level: cy.zoom() * 1.25, position: { x: cy.width() / 2, y: cy.height() / 2 } }); };
  const zoomOut = () => { const cy = getCy?.(); if (cy) cy.zoom({ level: cy.zoom() / 1.25, position: { x: cy.width() / 2, y: cy.height() / 2 } }); };
  const fit = () => { const cy = getCy?.(); if (cy) cy.fit(null, 40); };
  const search = () => {
    const cy = getCy?.(); if (!cy) return;
    const q = prompt("Search node label / id");
    if (!q) return;
    const needle = q.toLowerCase();
    const matches = cy.nodes().filter((n) => {
      const d = n.data();
      return String(d.label || d.id || "").toLowerCase().includes(needle);
    });
    if (matches.length === 0) { toast.error(`No nodes matching "${q}"`); return; }
    cy.elements().unselect();
    matches.select();
    cy.animate({ fit: { eles: matches, padding: 80 } }, { duration: 500 });
    toast.success(`${matches.length} node(s) matched`);
  };

  const toggleLabels = () => {
    const cy = getCy?.(); if (!cy) return;
    const next = !labelsVisible;
    cy.nodes().style("label", next ? "data(label)" : "");
    setLabelsVisible(next);
    onToggleLabels?.(next);
  };

  const toggleHighlight = () => {
    const next = !highlight;
    setHighlight(next);
    onHighlightSelected?.(next);
    const cy = getCy?.(); if (!cy) return;
    if (next) {
      cy.on("tap", "node", cy._pctdpHighlight = function (evt) {
        const n = evt.target;
        cy.elements().removeClass("faded");
        cy.elements().addClass("faded");
        const nbrs = n.closedNeighborhood();
        nbrs.removeClass("faded");
      });
    } else {
      if (cy._pctdpHighlight) { cy.off("tap", "node", cy._pctdpHighlight); cy._pctdpHighlight = null; }
      cy.elements().removeClass("faded");
    }
  };

  const toggleFs = async () => {
    const el = containerRef?.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try { await el.requestFullscreen(); setIsFs(true); } catch (e) { toast.error("Fullscreen unavailable"); }
    } else {
      try { await document.exitFullscreen(); setIsFs(false); } catch (e) {}
    }
  };

  const doPNG = (dpi) => withBusy(withCy((cy) => cyDownloadPNG(cy, `${basename}_${dpi}dpi.png`, { dpi })));
  const doTIFF = (dpi) => withBusy(withCy((cy) => cyDownloadTIFF(cy, `${basename}_${dpi}dpi.tiff`, { dpi })));
  const doSVG = withBusy(withCy((cy) => cyDownloadSVG(cy, `${basename}.svg`)));
  const doPDF = withBusy(withCy((cy) => cyDownloadPDF(cy, `${basename}.pdf`, { title })));
  const doJPG = withBusy(withCy((cy) => cyDownloadJPG(cy, `${basename}.jpg`, { dpi: 300 })));

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`${tp}-toolbar`}>
      {onLayoutChange && (
        <select
          data-testid={`${tp}-layout`}
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value)}
          className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18]"
        >
          {CY_LAYOUTS.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
      )}
      {onResetLayout && (
        <button data-testid={`${tp}-reset-layout`} onClick={onResetLayout} className={btn}><RotateCcw className="h-3 w-3" /> Reset</button>
      )}
      <button data-testid={`${tp}-fit`} onClick={fit} className={btn}>Fit</button>
      <button data-testid={`${tp}-zoom-in`} onClick={zoomIn} className={btn}><ZoomIn className="h-3 w-3" /></button>
      <button data-testid={`${tp}-zoom-out`} onClick={zoomOut} className={btn}><ZoomOut className="h-3 w-3" /></button>
      <button data-testid={`${tp}-search`} onClick={search} className={btn}><Search className="h-3 w-3" /> Search</button>
      <button data-testid={`${tp}-highlight`} onClick={toggleHighlight} className={btn}>{highlight ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />} {highlight ? "Off" : "Neighbours"}</button>
      <button data-testid={`${tp}-labels`} onClick={toggleLabels} className={btn}><Type className="h-3 w-3" /> {labelsVisible ? "Hide" : "Show"}</button>
      {containerRef && (
        <button data-testid={`${tp}-fullscreen`} onClick={toggleFs} className={btn}>
          {isFs ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {isFs ? "Exit" : "Full"}
        </button>
      )}
      <span className="mx-1 h-4 w-px bg-[#E7E7F3]" />
      <button data-testid={`${tp}-svg`} onClick={doSVG} disabled={busy} className={btn}><Download className="h-3 w-3" /> SVG</button>
      <button data-testid={`${tp}-png-300`} onClick={doPNG(300)} disabled={busy} className={btn}>PNG 300</button>
      <button data-testid={`${tp}-png-600`} onClick={doPNG(600)} disabled={busy} className={btn}>PNG 600</button>
      <button data-testid={`${tp}-tiff-300`} onClick={doTIFF(300)} disabled={busy} className={btn}>TIFF 300</button>
      <button data-testid={`${tp}-tiff-600`} onClick={doTIFF(600)} disabled={busy} className={btn}>TIFF 600</button>
      <button data-testid={`${tp}-pdf`} onClick={doPDF} disabled={busy} className={btn}><Download className="h-3 w-3" /> PDF</button>
      <button data-testid={`${tp}-jpg`} onClick={doJPG} disabled={busy} className={btn}>JPG</button>
      {showExtraExports && graph && (
        <>
          <span className="mx-1 h-4 w-px bg-[#E7E7F3]" />
          <button data-testid={`${tp}-json`} onClick={() => requireAuth(() => downloadGraph("json", graph, basename))} className={btn}>JSON (.cyjs)</button>
          <button data-testid={`${tp}-graphml`} onClick={() => requireAuth(() => downloadGraph("graphml", graph, basename))} className={btn}>GraphML</button>
          <button data-testid={`${tp}-gml`} onClick={() => requireAuth(() => downloadGraph("gml", graph, basename))} className={btn}>GML</button>
          <button data-testid={`${tp}-xgmml`} onClick={() => requireAuth(() => downloadGraph("xgmml", graph, basename))} className={btn}>XGMML</button>
        </>
      )}
    </div>
  );
}
