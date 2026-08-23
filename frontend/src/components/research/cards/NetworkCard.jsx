// NetworkCard — memoised Cytoscape compound→target graph.
import { memo, useEffect, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { FileText, ImageDown, Waves, Target as TargetIcon } from "lucide-react";
import { downloadCytoscapePublicationPng } from "@/lib/publicationExport";

// Layout presets — the toggle in each network header cycles between them.
// `cose` = organic force-directed. `concentric` = tidy rings.
const LAYOUTS = {
  cose:       { name: "cose", nodeRepulsion: 4500, idealEdgeLength: 80,
                animate: false, padding: 30 },
  concentric: {
    name: "concentric",
    concentric: (n) => (n.data("type") === "compound" ? 1 : 2 + (n.data("degree") || 0)),
    levelWidth: () => 1,
    minNodeSpacing: 26,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    animate: false,
    padding: 40,
    equidistant: false,
  },
};

function NetworkCardImpl({ network }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const [layout, setLayout] = useState("cose");
  useEffect(() => {
    if (!ref.current || !network) return;
    // Only build once. Rerenders with the same nodes/edges (handled by the
    // outer memo) never reach this effect.
    const cy = cytoscape({
      container: ref.current,
      hideEdgesOnViewport: false,
      textureOnViewport: true,
      motionBlur: false,
      pixelRatio: 1,
      elements: [
        ...network.nodes.map((n) => ({
          data: { id: n.id, label: n.label, type: n.type, degree: n.degree || 1 },
        })),
        ...network.edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.source, target: e.target,
                  score: e.score || 0.5 },
        })),
      ],
      style: [
        { selector: "node[type='compound']", style: {
            "background-color": "#5139ED", "shape": "hexagon",
            "label": "data(label)",
            "color": "#e0e0ff", "font-size": 10, "text-outline-color": "#0B0B18",
            "text-outline-width": 2,
            "text-valign": "center", "text-halign": "center",
            "width": 26, "height": 26 } },
        { selector: "node[type='target']", style: {
            "background-color": "#2BB673", "shape": "ellipse",
            "label": "data(label)",
            "color": "#d0ffd0", "font-size": 10, "text-outline-color": "#0B0B18",
            "text-outline-width": 2,
            "text-valign": "center", "text-halign": "center",
            "width":  (n) => 18 + Math.min(24, (n.data("degree") || 1) * 3),
            "height": (n) => 14 + Math.min(18, (n.data("degree") || 1) * 2) } },
        { selector: "edge", style: {
            "width": 1, "line-color": "#8139ED", "line-opacity": 0.28,
            "curve-style": "bezier",
            "target-arrow-shape": "none" } },
      ],
      // Force-directed cose layout — restored per user preference. Shape
      // distinction (hexagon vs ellipse) is kept so node types remain
      // visually differentiated.
      layout: LAYOUTS[layout],
    });
    cy.autolock(false);
    cy.autoungrabify(true);
    cyRef.current = cy;
    return () => cy.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Live-relayout on toggle without rebuilding the whole cytoscape instance.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.layout(LAYOUTS[layout]).run();
    cy.fit(undefined, 20);
  }, [layout]);

  return (
    <div data-testid="network-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[15px] font-semibold text-slate-100">Compound–Target Network</div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {network.nodes.length} nodes · {network.edges.length} edges
        </span>
        {/* Layout toggle — organic (cose) ⇄ tidy rings (concentric). */}
        <div
          data-testid="network-layout-toggle"
          className="ml-auto inline-flex overflow-hidden rounded-md border border-white/10 bg-white/5 text-[10.5px] font-semibold text-slate-300"
        >
          {[
            { key: "cose",       Icon: Waves,      label: "Organic",    testid: "network-layout-cose" },
            { key: "concentric", Icon: TargetIcon, label: "Rings",      testid: "network-layout-concentric" },
          ].map(({ key, Icon, label, testid }) => (
            <button
              key={key}
              type="button"
              data-testid={testid}
              onClick={() => setLayout(key)}
              title={`${label} layout`}
              aria-pressed={layout === key}
              className={`inline-flex items-center gap-1 px-2 py-1 transition-colors ${
                layout === key
                  ? "bg-[#5139ED]/25 text-white"
                  : "hover:bg-white/10"
              }`}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
        <button
          data-testid="network-download-png"
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            const url = cy.png({ bg: "#0B0B18", scale: 2, full: true });
            const a = document.createElement("a");
            a.href = url; a.download = "compound_target_network.png"; a.click();
          }}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
          <FileText size={10} /> PNG
        </button>
        <button
          data-testid="network-download-publication-png"
          title="Publication-quality PNG on a clean white background"
          onClick={() => downloadCytoscapePublicationPng(
            cyRef.current, "compound_target_network_publication.png"
          )}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-semibold text-emerald-200 hover:bg-emerald-500/20">
          <ImageDown size={10} /> Publication PNG
        </button>
      </div>
      <div className="mt-2 text-[10.5px] text-slate-500 flex items-center flex-wrap gap-x-3 gap-y-1">
        <span><span className="inline-block h-2.5 w-2.5 bg-[#5139ED] mr-1" style={{ clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)" }} />Compounds (hexagons)</span>
        <span><span className="inline-block h-2 w-3 rounded-full bg-[#2BB673] mr-1" />Targets (ellipses)</span>
        <span data-testid="network-size-legend" className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/10 px-2 py-0.5 text-slate-400">
          <span className="inline-flex items-center gap-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2BB673]/70" />
            <span className="inline-block h-2 w-2 rounded-full bg-[#2BB673]/85" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2BB673]" />
          </span>
          Node size scales with degree
        </span>
      </div>
      <div ref={ref} data-testid="network-cytoscape"
           className="mt-2 w-full h-[420px] rounded-lg border border-white/5 bg-black/40" />
    </div>
  );
}

// Only re-mount cytoscape when the graph shape actually changes.
export const NetworkCard = memo(NetworkCardImpl, (prev, next) => {
  const a = prev.network, b = next.network;
  if (a === b) return true;
  if (!a || !b) return false;
  if ((a.nodes?.length || 0) !== (b.nodes?.length || 0)) return false;
  if ((a.edges?.length || 0) !== (b.edges?.length || 0)) return false;
  const nodeIds = (arr) => (arr || []).map((n) => n.id).join("|");
  const edgeIds = (arr) => (arr || []).map((e) => `${e.source}>${e.target}`).join("|");
  return nodeIds(a.nodes) === nodeIds(b.nodes) &&
         edgeIds(a.edges) === edgeIds(b.edges);
});
