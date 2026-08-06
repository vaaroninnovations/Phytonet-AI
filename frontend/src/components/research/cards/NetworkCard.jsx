// NetworkCard — memoised Cytoscape compound→target graph.
import { memo, useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import { FileText } from "lucide-react";

function NetworkCardImpl({ network }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
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
            "background-color": "#5139ED", "label": "data(label)",
            "color": "#e0e0ff", "font-size": 10, "text-outline-color": "#0B0B18",
            "text-outline-width": 2, "width": 22, "height": 22 } },
        { selector: "node[type='target']", style: {
            "background-color": "#2BB673", "label": "data(label)",
            "color": "#d0ffd0", "font-size": 10, "text-outline-color": "#0B0B18",
            "text-outline-width": 2,
            "width":  (n) => 14 + Math.min(20, (n.data("degree") || 1) * 3),
            "height": (n) => 14 + Math.min(20, (n.data("degree") || 1) * 3) } },
        { selector: "edge", style: {
            "width": 1, "line-color": "#8139ED", "line-opacity": 0.33,
            "curve-style": "bezier",
            "target-arrow-shape": "none" } },
      ],
      layout: { name: "cose", nodeRepulsion: 4500, idealEdgeLength: 80,
                animate: false, padding: 30 },
    });
    cy.autolock(false);
    cy.autoungrabify(true);
    cyRef.current = cy;
    return () => cy.destroy();
  }, [network]);

  return (
    <div data-testid="network-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[15px] font-semibold text-slate-100">Compound–Target Network</div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {network.nodes.length} nodes · {network.edges.length} edges
        </span>
        <button
          data-testid="network-download-png"
          onClick={() => {
            const cy = cyRef.current;
            if (!cy) return;
            const url = cy.png({ bg: "#0B0B18", scale: 2, full: true });
            const a = document.createElement("a");
            a.href = url; a.download = "compound_target_network.png"; a.click();
          }}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
          <FileText size={10} /> PNG
        </button>
      </div>
      <div className="mt-2 text-[10.5px] text-slate-500 flex items-center gap-3">
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#5139ED] mr-1" />Compounds</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#2BB673] mr-1" />Targets (larger = more overlapping compounds)</span>
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
