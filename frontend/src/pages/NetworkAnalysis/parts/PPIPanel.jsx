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

function PPIPanel({ genes, ppiResult, setPpiResult, onComplete }) {
  const [requiredScore, setRequiredScore] = useState(400);
  const [networkType, setNetworkType] = useState("functional");
  const [addNodes, setAddNodes] = useState(0);
  const [removeIsolated, setRemoveIsolated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ppiLayout, setPpiLayout] = useState("fcose");
  const ppiCardRef = useRef(null);
  const ppiCyRef = useRef(null);

  const runPPI = async () => {
    if (!genes || genes.length === 0)
      return toast.error("No intersecting genes selected");
    setLoading(true);
    try {
      const res = await ppiNetwork({
        genes,
        species: 9606,
        required_score: requiredScore,
        network_type: networkType,
        add_nodes: addNodes,
      });
      setPpiResult(res);
      toast.success(
        `STRING returned ${res.nodes.length} nodes, ${res.edges.length} interactions`
      );
    } catch (e) {
      toast.error("STRING query failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount if we have genes and no result yet.
  useEffect(() => {
    if (genes.length > 0 && !ppiResult) runPPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResult = useMemo(() => {
    if (!ppiResult) return null;
    if (!removeIsolated) return ppiResult;
    const connected = new Set();
    for (const e of ppiResult.edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    return {
      nodes: ppiResult.nodes.filter((n) => connected.has(n.id)),
      edges: ppiResult.edges,
    };
  }, [ppiResult, removeIsolated]);

  const elements = useMemo(() => {
    if (!filteredResult) return [];
    return [
      ...filteredResult.nodes.map((n) => ({
        data: { id: n.id, label: n.id },
      })),
      ...filteredResult.edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          weight: e.score,
        },
      })),
    ];
  }, [filteredResult]);

  const ppiStyle = useAppliedStyle("ppi");
  const stylesheet = useMemo(() => [
    {
      selector: "node",
      style: {
        "background-color": ppiStyle.node,
        label: "data(label)",
        color: ppiStyle.labelColor,
        "font-size": ppiStyle.labelSize,
        "font-family": ppiStyle.fontFamily,
        "font-weight": 700,
        "text-outline-color": ppiStyle.background,
        "text-outline-width": 2,
        width: 22 * ppiStyle.nodeSize,
        height: 22 * ppiStyle.nodeSize,
        opacity: ppiStyle.opacity,
      },
    },
    {
      selector: "edge",
      style: {
        "line-color": ppiStyle.edge,
        opacity: 0.4 * ppiStyle.opacity,
        width: `mapData(weight, 0.4, 1, ${1 * ppiStyle.edgeThickness}, ${4 * ppiStyle.edgeThickness})`,
        "curve-style": "haystack",
      },
    },
    {
      selector: ":selected",
      style: { "background-color": "#f5b301", "line-color": "#f5b301" },
    },
  ], [ppiStyle]);

  // Live-apply stylesheet to the mounted Cytoscape instance whenever the
  // computed stylesheet changes — react-cytoscapejs does not do this on prop
  // updates, so we bridge it manually. This preserves zoom / pan / selection
  // (no re-mount) and delivers the live-preview behaviour required by the
  // customization panel.
  useEffect(() => {
    const cy = ppiCyRef.current;
    if (!cy) return;
    try {
      cy.style().fromJson(stylesheet).update();
      // Also reflect the background (Cytoscape does not manage the wrapper's
      // background; we set it via inline style on the CytoscapeComponent host,
      // and React will re-render when ppiStyle changes, so this is a no-op).
    } catch (e) { console.debug("cy.style update failed:", e); }
  }, [stylesheet]);

  const exportEdges = () => {
    if (!filteredResult) return;
    const flat = filteredResult.edges.map((e) => ({
      Source: e.source,
      Target: e.target,
      Score: e.score,
      ...e.channels,
    }));
    const fields = Object.keys(flat[0] || { Source: 0 }).map((k) => ({ key: k, label: k }));
    exportCSV(flat, fields, "ppi_edges.csv");
  };

  const exportGraph = (kind) => {
    if (!filteredResult) return;
    downloadGraph(kind, filteredResult, "ppi_network");
    toast.success(`PPI network exported as ${kind.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="ppi-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Network className="mr-1 inline h-3.5 w-3.5" />
              STRING PPI · Homo sapiens
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes.length} intersecting proteins → interaction network
            </h2>
          </div>
          <button
            data-testid="ppi-run"
            onClick={runPPI}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
          >
            {loading ? "Querying STRING…" : "Re-run"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Min score
            <select
              data-testid="ppi-min-score"
              value={requiredScore}
              onChange={(e) => setRequiredScore(Number(e.target.value))}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            >
              <option value={150}>150 · low</option>
              <option value={400}>400 · medium</option>
              <option value={700}>700 · high</option>
              <option value={900}>900 · highest</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Network type
            <select
              data-testid="ppi-net-type"
              value={networkType}
              onChange={(e) => setNetworkType(e.target.value)}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            >
              <option value="functional">Functional</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            First-shell (+n)
            <input
              data-testid="ppi-add-nodes"
              type="number"
              min={0}
              max={50}
              value={addNodes}
              onChange={(e) => setAddNodes(Number(e.target.value))}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-xs text-[#0B0B18]">
            <Checkbox
              data-testid="ppi-remove-isolated"
              checked={removeIsolated}
              onCheckedChange={(v) => setRemoveIsolated(!!v)}
              className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
            />
            Remove isolated
          </label>
        </div>
      </div>

      {filteredResult && (
        <>
          <div
            ref={ppiCardRef}
            data-testid="ppi-network"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                Interaction network · {filteredResult.nodes.length} nodes ·{" "}
                {filteredResult.edges.length} edges
              </p>
              <div data-testid="ppi-exports" className="flex flex-wrap items-center gap-2">
                <CustomizeFigureButton chartType="ppi" />
                <TableToolbar
                  rows={filteredResult.edges.map((e) => ({
                    source: e.source, target: e.target, score: e.score, ...(e.channels || {}),
                  }))}
                  columns={[
                    { key: "source", label: "Source" },
                    { key: "target", label: "Target" },
                    { key: "score", label: "Score" },
                  ]}
                  basename="ppi_edges"
                  testidPrefix="ppi-tbl"
                />
                <CyToolbar
                  getCy={() => ppiCyRef.current}
                  containerRef={ppiCardRef}
                  basename="ppi_network"
                  graph={filteredResult}
                  title={`PPI Network · ${filteredResult.nodes.length} nodes`}
                  layout={ppiLayout}
                  onLayoutChange={setPpiLayout}
                  onResetLayout={() => { const cy = ppiCyRef.current; if (cy) cy.layout({ name: ppiLayout, animate: false, fit: true, padding: 30 }).run(); }}
                  testidPrefix="ppi"
                />
              </div>
            </div>
            <CytoscapeComponent
              key={`ppi-${elements.length}`}
              elements={elements}
              style={{ width: "100%", height: "520px", background: ppiStyle.background }}
              layout={{ name: ppiLayout, animate: false, fit: true, padding: 30 }}
              stylesheet={stylesheet}
              cy={(cy) => {
                ppiCyRef.current = cy;
                cy.userZoomingEnabled(true);
                cy.userPanningEnabled(true);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end">
            <button
              data-testid="ppi-complete"
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Next — Hub Gene Analysis
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────── Hub Gene Panel ─────────────────────

export { PPIPanel };
