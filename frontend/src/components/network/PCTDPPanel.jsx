// Plant → Compound → Target → Disease → Pathway integrative network.
import { useEffect, useMemo, useRef, useState } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import "@/lib/cytoscapeSetup";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useNetwork } from "@/context/NetworkContext";
import { buildPCTDPGraph } from "@/lib/pctdpBuilder";
import { computeNetworkMetrics } from "@/lib/networkMetrics";
import { combinedHubScores } from "@/lib/hubScoring";
import { HelpTip } from "@/components/network/HelpTip";
import { TableToolbar } from "@/components/network/TableToolbar";
import { CyToolbar } from "@/components/network/CyToolbar";
import { DataTable } from "@/components/network/DataTable";

const TYPE_META = {
  plant:    { color: "#10B981", shape: "round-rectangle", label: "Plant" },
  compound: { color: "#8139ED", shape: "ellipse",         label: "Compound" },
  target:   { color: "#5139ED", shape: "diamond",         label: "Target" },
  disease:  { color: "#EF4444", shape: "hexagon",         label: "Disease" },
  pathway:  { color: "#F59E0B", shape: "round-rectangle", label: "KEGG Pathway" },
};
const REL_COLOR = {
  contains: "#10B981",
  targets: "#8139ED",
  associated_with: "#EF4444",
  part_of: "#F59E0B",
  disease_pathway: "#94A3B8",
};

export function PCTDPPanel({ intersectingGenes = [], selectedKeggPathways = [], onComplete }) {
  const {
    plantName: ctxPlantName, setPlantName,
    selectedCompounds, compoundTargets, diseaseTargets, selectedDisease,
  } = useNetwork();

  // Local plant name editor (writes back to context)
  const [plantInput, setPlantInput] = useState(ctxPlantName || "");
  useEffect(() => { if (ctxPlantName !== plantInput) setPlantName(plantInput); /* eslint-disable-next-line */ }, [plantInput]);

  const [include, setInclude] = useState({ plant: true, compound: true, target: true, disease: true, pathway: true });
  const [layout, setLayout] = useState("dagre");
  const [autoAnalyzed, setAutoAnalyzed] = useState(false);
  const cyRef = useRef(null);
  const containerRef = useRef(null);

  const graph = useMemo(() => buildPCTDPGraph({
    plantName: plantInput || "Unknown Plant",
    selectedCompounds,
    compoundTargets,
    diseaseTargets,
    diseaseName: selectedDisease?.name || selectedDisease?.efo_id || "",
    intersectingGenes,
    keggPathways: selectedKeggPathways,
    include,
  }), [plantInput, selectedCompounds, compoundTargets, diseaseTargets, selectedDisease, intersectingGenes, selectedKeggPathways, include]);

  const metrics = useMemo(() => computeNetworkMetrics(graph.nodes, graph.edges), [graph]);

  // Enrich node table with centrality metrics on demand
  const [centrality, setCentrality] = useState(null);
  const runCentrality = () => {
    if (graph.nodes.length === 0) return;
    setTimeout(() => {
      try {
        const scores = combinedHubScores(graph.nodes, graph.edges);
        const map = new Map(scores.map((s) => [s.id, s]));
        setCentrality(map);
      } catch (e) { toast.error("Centrality failed"); }
    }, 30);
  };
  useEffect(() => { setCentrality(null); }, [graph]);

  // Cytoscape elements
  const elements = useMemo(() => {
    const els = [];
    for (const n of graph.nodes) {
      els.push({ group: "nodes", data: {
        id: n.id, label: n.label || n.id, type: n.type,
        degree: n.degree, color: n.color, shape: n.shape,
      }});
    }
    for (const e of graph.edges) {
      els.push({ group: "edges", data: {
        source: e.source, target: e.target, weight: e.confidence ?? 1,
        relationship: e.relationship, edgeColor: REL_COLOR[e.relationship] || "#94A3B8",
      }});
    }
    return els;
  }, [graph]);

  // Apply layout when it changes
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const opts = layoutOptions(layout, graph.nodes.length);
    try { cy.layout(opts).run(); } catch (e) {}
  }, [layout, elements]);

  const stylesheet = useMemo(() => [
    { selector: "node", style: {
      "background-color": "data(color)",
      "shape": "data(shape)",
      "label": "data(label)",
      "font-size": 10,
      "color": "#0B0B18",
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": 100,
      "width": "mapData(degree, 1, 30, 26, 66)",
      "height": "mapData(degree, 1, 30, 26, 66)",
      "border-width": 1,
      "border-color": "#FFFFFF",
    }},
    { selector: "edge", style: {
      "line-color": "data(edgeColor)",
      "target-arrow-color": "data(edgeColor)",
      "width": "mapData(weight, 0, 1, 0.5, 3)",
      "curve-style": "bezier",
      "opacity": 0.7,
    }},
    { selector: ".faded", style: { "opacity": 0.15 } },
    { selector: ":selected", style: { "border-color": "#F97316", "border-width": 3 } },
  ], []);

  const nodeTableRows = useMemo(() => graph.nodes.map((n) => {
    const c = centrality?.get(n.id) || {};
    return {
      id: n.id,
      node_id: n.id.split("::").slice(1).join("::"),
      node_type: TYPE_META[n.type]?.label || n.type,
      display_name: n.label || n.id,
      degree: n.degree,
      betweenness: c.betweenness ?? 0,
      closeness: c.closeness ?? 0,
      intersecting: n.intersecting ? "Yes" : "",
    };
  }), [graph, centrality]);

  const edgeTableRows = useMemo(() => graph.edges.map((e) => ({
    id: e.id,
    source: e.source.split("::").slice(1).join("::"),
    source_id: e.source,
    target: e.target.split("::").slice(1).join("::"),
    target_id: e.target,
    relationship: e.relationship,
    confidence: e.confidence,
    evidence: e.relationship,
    weight: e.confidence,
  })), [graph]);

  const nodeCols = [
    { key: "node_id", label: "Node ID", filterable: true },
    { key: "node_type", label: "Type", filterable: true },
    { key: "display_name", label: "Display Name", filterable: true },
    { key: "degree", label: "Degree" },
    { key: "betweenness", label: "Betweenness", format: (v) => (v ?? 0).toFixed(3) },
    { key: "closeness", label: "Closeness", format: (v) => (v ?? 0).toFixed(4) },
    { key: "intersecting", label: "Intersecting" },
  ];
  const edgeCols = [
    { key: "source", label: "Source", filterable: true },
    { key: "target", label: "Target", filterable: true },
    { key: "relationship", label: "Relationship", filterable: true },
    { key: "confidence", label: "Confidence", format: (v) => (v ?? 0).toFixed(2) },
    { key: "evidence", label: "Evidence" },
    { key: "weight", label: "Weight", format: (v) => (v ?? 0).toFixed(2) },
  ];

  const doAutoAnalyze = () => {
    setInclude({ plant: true, compound: true, target: true, disease: true, pathway: true });
    setLayout("dagre");
    setTimeout(() => {
      const cy = cyRef.current;
      if (cy) cy.layout(layoutOptions("dagre", graph.nodes.length)).run();
      runCentrality();
      setAutoAnalyzed(true);
      toast.success("Network auto-analyzed");
    }, 100);
  };

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Config panel */}
      <div data-testid="pctdp-controls" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Plant–Compound–Target–Disease–Pathway
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">Integrative Network</h2>
          </div>
          <button data-testid="pctdp-auto-analyze" onClick={doAutoAnalyze}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]">
            Auto Analyze
          </button>
        </div>

        {/* Plant name input (optional; defaults from context) */}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Plant name<HelpTip text="Displayed as the root node. Editable — feeds back into workflow context." />
            </label>
            <input
              data-testid="pctdp-plant-name"
              value={plantInput}
              onChange={(e) => setPlantInput(e.target.value)}
              placeholder="e.g. Curcuma longa"
              className="brand-focus mt-1 w-64 rounded-lg border border-[#E7E7F3] bg-white px-3 py-1.5 text-sm text-[#0B0B18]"
            />
          </div>
          <div>
            <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Include node types<HelpTip text="Toggle to include or exclude entire layers. Graph regenerates instantly." />
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(TYPE_META).map(([k, meta]) => (
                <label key={k} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs">
                  <input data-testid={`pctdp-include-${k}`} type="checkbox" checked={include[k]} onChange={(e) => setInclude((s) => ({ ...s, [k]: e.target.checked }))} className="accent-[#5139ED]" />
                  <span className="inline-block h-3 w-3 rounded-full" style={{ background: meta.color }} />
                  {meta.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Metrics cards */}
      <div data-testid="pctdp-metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard testid="pctdp-metric-nodes" label="Nodes" value={metrics.nodes} />
        <MetricCard testid="pctdp-metric-edges" label="Edges" value={metrics.edges} />
        <MetricCard testid="pctdp-metric-avg-degree" label="Avg Degree" value={metrics.avg_degree.toFixed(2)} />
        <MetricCard testid="pctdp-metric-density" label="Density" value={metrics.density.toFixed(3)} />
        <MetricCard testid="pctdp-metric-components" label="Components" value={metrics.components} />
        <MetricCard testid="pctdp-metric-clustering" label="Clustering" value={metrics.clustering.toFixed(3)} />
        <MetricCard testid="pctdp-metric-avg-path" label="Avg Path" value={metrics.avg_path_length.toFixed(2)} />
        <MetricCard testid="pctdp-metric-diameter" label="Diameter" value={metrics.diameter} />
      </div>

      {/* Network */}
      <div data-testid="pctdp-network-card" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Integrative PCTDP Network</p>
          <CyToolbar
            getCy={() => cyRef.current}
            containerRef={containerRef}
            basename="pctdp_network"
            graph={graph}
            title="Plant-Compound-Target-Disease-Pathway Network"
            layout={layout}
            onLayoutChange={setLayout}
            onResetLayout={() => { const cy = cyRef.current; if (cy) cy.layout(layoutOptions(layout, graph.nodes.length)).run(); }}
            testidPrefix="pctdp-network"
          />
        </div>
        {graph.nodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E7E7F3] bg-[#FAFAFF] p-10 text-center text-xs text-[#64748B]">
            No data available yet. Complete the previous Network Analysis steps to populate compounds, targets, disease and pathways.
          </div>
        ) : (
          <div className="h-[620px] w-full rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF]">
            <CytoscapeComponent
              key={"pctdp-" + elements.length}
              cy={(cy) => { cyRef.current = cy; }}
              elements={elements}
              layout={layoutOptions(layout, graph.nodes.length)}
              stylesheet={stylesheet}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        )}
        {/* Legend */}
        <div data-testid="pctdp-legend" className="mt-3 flex flex-wrap gap-2">
          {Object.entries(TYPE_META).map(([k, meta]) => (
            <div key={k} className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2 py-1 text-[10px]">
              <span className="inline-block h-3 w-3 rounded" style={{ background: meta.color }} />
              {meta.label}
            </div>
          ))}
        </div>
      </div>

      {/* Node table */}
      <div data-testid="pctdp-node-table-wrap" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Node Table</p>
          <div className="flex flex-wrap items-center gap-2">
            <button data-testid="pctdp-node-centrality" onClick={runCentrality} className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED]">
              Compute Centrality
            </button>
            <TableToolbar rows={nodeTableRows} columns={nodeCols.map(({ key, label }) => ({ key, label }))} basename="pctdp_nodes" testidPrefix="pctdp-node-tbl" />
          </div>
        </div>
        <DataTable rows={nodeTableRows} columns={nodeCols} testidPrefix="pctdp-node-dt" />
      </div>

      {/* Edge table */}
      <div data-testid="pctdp-edge-table-wrap" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Edge Table</p>
          <TableToolbar rows={edgeTableRows} columns={edgeCols.map(({ key, label }) => ({ key, label }))} basename="pctdp_edges" testidPrefix="pctdp-edge-tbl" />
        </div>
        <DataTable rows={edgeTableRows} columns={edgeCols} testidPrefix="pctdp-edge-dt" />
      </div>

      <div className="flex justify-end">
        <button data-testid="pctdp-complete" onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
          Complete Network Analysis
        </button>
      </div>
    </div>
  );
}

function MetricCard({ testid, label, value }) {
  return (
    <div data-testid={testid} className="rounded-2xl border border-[#F1F1FA] bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold text-[#5139ED]">{value}</p>
    </div>
  );
}

function layoutOptions(name, nodeCount = 20) {
  // Dagre for hierarchical PCTDP by default; other layouts adapt spacing to graph size.
  const spacing = Math.min(2.0, Math.max(1.0, 1.0 + nodeCount / 100));
  if (name === "dagre") {
    return {
      name: "dagre",
      rankDir: "TB",
      nodeSep: 40 * spacing,
      edgeSep: 20,
      rankSep: 100 * spacing,
      animate: false,
      fit: true,
      padding: 40,
    };
  }
  if (name === "fcose") {
    return {
      name: "fcose",
      quality: "proof",
      animate: false,
      fit: true,
      padding: 40,
      nodeSeparation: 90 * spacing,
      idealEdgeLength: 90 * spacing,
      nodeDimensionsIncludeLabels: true,
      randomize: true,
    };
  }
  if (name === "cose-bilkent") {
    return { name: "cose-bilkent", animate: false, fit: true, padding: 40, idealEdgeLength: 80 * spacing };
  }
  if (name === "concentric") {
    return { name: "concentric", animate: false, fit: true, padding: 40, minNodeSpacing: 30, concentric: (n) => n.data("degree") || 1, levelWidth: () => 2 };
  }
  return { name, animate: false, fit: true, padding: 40 };
}
