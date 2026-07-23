// Network Analysis — 5-subsection guided workflow.
// Subsection 1 (Target Intersection Analysis) is fully implemented.
// Subsections 2-5 have gated placeholder scaffolds.

import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { useNetwork } from "@/context/NetworkContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import { ppiNetwork, keggEnrich, goEnrich } from "@/lib/api";
import { combinedHubScores, HUB_METRICS } from "@/lib/hubScoring";
import { downloadGraph } from "@/lib/graphExporters";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import jsPDF from "jspdf";
import UTIF from "utif";
import CytoscapeComponent from "react-cytoscapejs";
import "@/lib/cytoscapeSetup";
import { useAppliedStyle, mixHex } from "@/context/ChartStyleContext";
import { CustomizeFigureButton } from "@/components/CustomizeFigureButton";
import { GOPanel as NewGOPanel } from "@/components/network/GOPanel";
import { KEGGPanel as NewKEGGPanel } from "@/components/network/KEGGPanel";
import { PCTDPPanel } from "@/components/network/PCTDPPanel";
import { TableToolbar } from "@/components/network/TableToolbar";
import { requireAuth } from "@/context/AuthContext";
import { FigureToolbar } from "@/components/network/FigureToolbar";
import { CyToolbar } from "@/components/network/CyToolbar";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Download,
  FileImage,
  FileText,
  Lock,
  Network,
  Sparkles,
  Waypoints,
  Target,
  Activity,
  Beaker,
  Layers,
} from "lucide-react";

function HubPanel({ ppiResult, onComplete }) {
  const [topN, setTopN] = useState(10);
  const [metric, setMetric] = useState("degree");
  const [algoLoading, setAlgoLoading] = useState(false);
  const [scores, setScores] = useState(null);
  const { setHubScores } = useNetwork();

  const runHub = () => {
    if (!ppiResult) return toast.error("Run PPI analysis first");
    setAlgoLoading(true);
    setTimeout(() => {
      try {
        const s = combinedHubScores(ppiResult.nodes, ppiResult.edges);
        setScores(s);
        setHubScores(s);   // publish to context for Docking/Report
      } catch (e) {
        toast.error("Hub scoring failed");
      } finally {
        setAlgoLoading(false);
      }
    }, 30);
  };

  useEffect(() => {
    if (ppiResult && !scores) runHub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppiResult]);

  const ranked = useMemo(() => {
    if (!scores) return [];
    return [...scores].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  }, [scores, metric]);
  const top = ranked.slice(0, topN);

  const accessors = useMemo(() => {
    const a = { id: (r) => r.id };
    for (const m of HUB_METRICS) a[m.key] = (r) => r[m.key] ?? 0;
    return a;
  }, []);
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(top, accessors, {
    key: metric,
    dir: "desc",
  });

  const fmt = (v, key) => {
    if (v == null) return "—";
    if (key === "degree" || key === "mnc" || key === "bottleneck") return v.toFixed(0);
    if (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(2);
    return v.toFixed(3);
  };

  const exportHubs = () => {
    if (!scores) return;
    const flat = ranked.map((r, i) => {
      const row = { Rank: i + 1, Gene: r.id };
      for (const m of HUB_METRICS) row[m.label] = r[m.key] ?? 0;
      return row;
    });
    exportCSV(
      flat,
      Object.keys(flat[0]).map((k) => ({ key: k, label: k })),
      "hub_genes.csv"
    );
  };

  if (!ppiResult) {
    return (
      <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
        Complete PPI analysis first to score hub genes.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div
        data-testid="hub-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Waypoints className="mr-1 inline h-3.5 w-3.5" />
              Hub Gene Analysis
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              CytoHubba-style ranking · 10 algorithms
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Degree · Betweenness (Brandes) · Closeness (Wasserman–Faust) · MCC (Bron–Kerbosch cliques) ·
              MNC · DMNC (ε=1.7) · EPC (Monte-Carlo p=0.5, 100 trials) · Stress · Radiality · Bottleneck (n/4 threshold)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="hub-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-xs font-semibold text-[#0B0B18]"
            >
              {HUB_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top&nbsp;
              <input
                data-testid="hub-topn"
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <DlBtn onClick={exportHubs} testid="hub-export-csv" label="CSV" icon={<Download className="h-3.5 w-3.5" />} />
          </div>
        </div>
      </div>

      {algoLoading ? (
        <div data-testid="hub-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Computing 10 centrality algorithms…
        </div>
      ) : (
        <>
        <div data-testid="hub-table-card" className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F1FA] bg-[#FAFAFF] px-3 py-2">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Hub Gene Ranking</p>
            <TableToolbar
              rows={sortedRows.map((r, i) => ({ Rank: i + 1, Gene: r.id, ...Object.fromEntries(HUB_METRICS.map((m) => [m.label, r[m.key] ?? 0])) }))}
              columns={[{ key: "Rank", label: "Rank" }, { key: "Gene", label: "Gene" }, ...HUB_METRICS.map((m) => ({ key: m.label, label: m.label }))]}
              basename="hub_genes"
              testidPrefix="hub-tbl"
            />
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    Rank
                  </th>
                  <SortableTh id="id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Gene</SortableTh>
                  {HUB_METRICS.map((m) => (
                    <SortableTh key={m.key} id={m.key} sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>
                      {m.label}
                    </SortableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr
                    key={r.id}
                    data-testid={`hub-row-${r.id}`}
                    className={`border-b border-[#F1F1FA] hover:bg-[#F8F8FE] ${
                      i < 3 ? "bg-[#5139ED]/[0.03]" : ""
                    }`}
                  >
                    <td className="px-3 py-3 text-center font-mono text-[12px] font-bold text-[#5139ED]">
                      #{i + 1}
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] font-bold text-[#5139ED]">{r.id}</td>
                    {HUB_METRICS.map((m) => (
                      <td
                        key={m.key}
                        className={`px-3 py-3 font-mono text-[11px] ${
                          metric === m.key ? "font-bold text-[#5139ED]" : "text-[#0B0B18]"
                        }`}
                      >
                        {fmt(r[m.key], m.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <HubSubgraphNetwork ppiResult={ppiResult} scores={scores} metric={metric} topN={topN} />
        </>
      )}

      <div className="flex justify-end">
        <button
          data-testid="hub-complete"
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
        >
          Next — GO Enrichment
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Hub subgraph network view — induced subgraph of top-N hub genes.

function HubSubgraphNetwork({ ppiResult, scores, metric, topN }) {
  const [layout, setLayout] = useState("concentric");
  const cardRef = useRef(null);
  const cyRef = useRef(null);
  const subgraph = useMemo(() => {
    if (!ppiResult || !scores) return { nodes: [], edges: [] };
    const ranked = [...scores].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, topN);
    const idSet = new Set(ranked.map((r) => r.id));
    const nodes = ppiResult.nodes.filter((n) => idSet.has(n.id))
      .map((n) => ({ ...n, score: (scores.find((s) => s.id === n.id) || {})[metric] || 0 }));
    const edges = ppiResult.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, edges };
  }, [ppiResult, scores, metric, topN]);

  const elements = useMemo(() => {
    const els = [];
    const maxScore = Math.max(1, ...subgraph.nodes.map((n) => n.score || 0));
    for (const n of subgraph.nodes) {
      els.push({ group: "nodes", data: { id: n.id, label: n.id, score: n.score, scoreNorm: (n.score || 0) / maxScore } });
    }
    for (const e of subgraph.edges) {
      els.push({ group: "edges", data: { source: e.source, target: e.target, weight: e.score || 0.5 } });
    }
    return els;
  }, [subgraph]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    try { cy.layout({ name: layout, animate: false, fit: true, padding: 30, concentric: (n) => n.data("scoreNorm") || 0.1, levelWidth: () => 2, minNodeSpacing: 30 }).run(); } catch (e) { console.debug("cy.layout run failed:", e); }
  }, [layout, elements]);

  const hubStyle = useAppliedStyle("hub");
  const hubNodeLow = useMemo(() => mixHex(hubStyle.node, hubStyle.background, 0.72), [hubStyle.node, hubStyle.background]);
  const stylesheet = useMemo(() => [
    { selector: "node", style: {
      "background-color": `mapData(scoreNorm, 0, 1, ${hubNodeLow}, ${hubStyle.node})`,
      "label": "data(label)", "font-size": hubStyle.labelSize, "color": hubStyle.labelColor,
      "font-family": hubStyle.fontFamily,
      "text-valign": "center", "text-halign": "center",
      "width":  `mapData(scoreNorm, 0, 1, ${30 * hubStyle.nodeSize}, ${70 * hubStyle.nodeSize})`,
      "height": `mapData(scoreNorm, 0, 1, ${30 * hubStyle.nodeSize}, ${70 * hubStyle.nodeSize})`,
      "border-width": 1, "border-color": hubStyle.background, "shape": "ellipse",
      "opacity": hubStyle.opacity,
    }},
    { selector: "edge", style: {
      "width": `mapData(weight, 0, 1, ${0.5 * hubStyle.edgeThickness}, ${3 * hubStyle.edgeThickness})`,
      "line-color": hubStyle.edge, "curve-style": "bezier",
      "opacity": 0.6 * hubStyle.opacity,
    } },
  ], [hubStyle, hubNodeLow]);

  // Live-apply hub stylesheet without re-mounting (preserves zoom / pan).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    try { cy.style().fromJson(stylesheet).update(); }
    catch (e) { console.debug("hub cy.style update failed:", e); }
  }, [stylesheet]);

  if (subgraph.nodes.length === 0) return null;
  return (
    <div ref={cardRef} data-testid="hub-subgraph-card" className="rounded-3xl border border-[#E7E7F3] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Hub Subgraph · Top {subgraph.nodes.length} by {metric} · {subgraph.edges.length} edges
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <CustomizeFigureButton chartType="hub" />
          <CyToolbar
            getCy={() => cyRef.current}
            containerRef={cardRef}
            basename="hub_network"
            graph={subgraph}
            title={`Hub Subgraph · Top ${subgraph.nodes.length} by ${metric}`}
            layout={layout}
            onLayoutChange={setLayout}
            onResetLayout={() => { const cy = cyRef.current; if (cy) cy.layout({ name: layout, animate: false, fit: true, padding: 30 }).run(); }}
            testidPrefix="hub-net"
          />
        </div>
      </div>
      <CytoscapeComponent
        key={`hub-${elements.length}`}
        elements={elements}
        style={{ width: "100%", height: "500px", background: hubStyle.background }}
        layout={{ name: layout, animate: false, fit: true, padding: 30 }}
        stylesheet={stylesheet}
        cy={(cy) => { cyRef.current = cy; cy.userZoomingEnabled(true); cy.userPanningEnabled(true); }}
      />
    </div>
  );
}

// ────────────────────── GO Enrichment Panel ─────────────────────

export { HubPanel, HubSubgraphNetwork };
