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
import { Stat, DlBtn } from "./common";

function KeggPanel({ genes, keggResult, setKeggResult, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [topN, setTopN] = useState(20);
  const [maxAdjP, setMaxAdjP] = useState(0.05);

  const runKegg = async () => {
    if (!genes || genes.length === 0) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await keggEnrich({ genes });
      setKeggResult(res);
      toast.success(`Enrichr returned ${res.pathways?.length || 0} KEGG pathways`);
    } catch (e) {
      toast.error("KEGG enrichment failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (genes?.length && !keggResult) runKegg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!keggResult) return [];
    const p = keggResult.pathways || [];
    return p
      .filter((r) => (r.adj_p_value ?? 1) <= maxAdjP)
      .slice(0, topN);
  }, [keggResult, topN, maxAdjP]);

  const accessors = useMemo(
    () => ({
      term: (r) => r.term,
      p_value: (r) => r.p_value,
      adj_p_value: (r) => r.adj_p_value,
      combined_score: (r) => r.combined_score,
      gene_count: (r) => r.gene_count,
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(filtered, accessors, {
    key: "combined_score",
    dir: "desc",
  });

  const exportKegg = () => {
    if (!filtered.length) return;
    const flat = filtered.map((r) => ({
      Rank: r.rank,
      Pathway: r.term,
      "P-value": r.p_value,
      "Adj. P-value": r.adj_p_value,
      "Combined Score": r.combined_score,
      "Gene Count": r.gene_count,
      "Overlapping Genes": (r.overlap_genes || []).join(","),
    }));
    exportCSV(flat, Object.keys(flat[0]).map((k) => ({ key: k, label: k })), "kegg_pathways.csv");
  };

  // Bubble plot data: x = -log10(p), y = pathway idx, size = gene_count
  const maxLog = Math.max(1, ...sortedRows.map((r) => -Math.log10(Math.max(r.p_value || 1, 1e-30))));
  const maxCount = Math.max(1, ...sortedRows.map((r) => r.gene_count || 0));

  return (
    <div className="space-y-6">
      <div
        data-testid="kegg-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Activity className="mr-1 inline h-3.5 w-3.5" />
              KEGG Pathway Enrichment · via Enrichr
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes?.length || 0} genes → KEGG_2021_Human
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomizeFigureButton chartType="kegg" testid="customize-figure-kegg" />
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top
              <input
                data-testid="kegg-topn"
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Max adj-P
              <input
                data-testid="kegg-max-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={maxAdjP}
                onChange={(e) => setMaxAdjP(Number(e.target.value))}
                className="w-20 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <button
              data-testid="kegg-run"
              onClick={runKegg}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
            >
              {loading ? "Enriching…" : "Re-run"}
            </button>
            <DlBtn onClick={exportKegg} testid="kegg-export-csv" label="CSV" icon={<Download className="h-3.5 w-3.5" />} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Querying Enrichr…
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          No significantly enriched pathways at adj-P ≤ {maxAdjP}.
        </div>
      ) : (
        <>
          {/* Bubble plot */}
          <div
            data-testid="kegg-bubble"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Bubble plot · −log10(P) vs pathway · bubble size = gene count
            </p>
            <svg viewBox="0 0 780 480" width="100%" height={480} className="mt-4">
              <rect x="0" y="0" width="780" height="480" fill="#FFFFFF" />
              {/* Y-axis labels */}
              {sortedRows.map((r, i) => {
                const y = 30 + i * ((420) / sortedRows.length);
                const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
                const x = 300 + (logp / maxLog) * 440;
                const rBubble = 4 + (r.gene_count / maxCount) * 14;
                return (
                  <g key={r.term}>
                    <text
                      x={295}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#0B0B18"
                      fontFamily="Inter"
                    >
                      {r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term}
                    </text>
                    <circle
                      cx={x}
                      cy={y}
                      r={rBubble}
                      fill="#5139ED"
                      fillOpacity="0.55"
                      stroke="#5139ED"
                      strokeWidth="1"
                    />
                    <text x={x + rBubble + 4} y={y + 3} fontSize="9" fill="#64748B">
                      {r.gene_count}
                    </text>
                  </g>
                );
              })}
              <text
                x="540"
                y="465"
                fontSize="11"
                textAnchor="middle"
                fill="#64748B"
                fontFamily="Inter"
              >
                −log10(P-value)
              </text>
            </svg>
          </div>

          {/* Dot plot */}
          <div
            data-testid="kegg-dot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Dot plot · gene ratio × −log10(P) · size = overlap
            </p>
            <KEGGDotPlot rows={sortedRows} />
          </div>

          {/* Lollipop chart */}
          <div
            data-testid="kegg-lollipop"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Lollipop chart · combined score
            </p>
            <KEGGLollipopChart rows={sortedRows} />
          </div>

          {/* Sankey diagram */}
          <div
            data-testid="kegg-sankey"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Sankey · gene → pathway flows (top {Math.min(8, sortedRows.length)} pathways)
            </p>
            <KEGGSankey rows={sortedRows.slice(0, 8)} />
          </div>

          {/* Pathway table */}
          <div
            data-testid="kegg-table"
            className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
          >
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <SortableTh id="term" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Pathway</SortableTh>
                  <SortableTh id="p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>P-value</SortableTh>
                  <SortableTh id="adj_p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Adj. P</SortableTh>
                  <SortableTh id="combined_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Combined</SortableTh>
                  <SortableTh id="gene_count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Genes</SortableTh>
                  <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    Overlapping
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.term} data-testid={`kegg-row-${r.rank}`} className="border-b border-[#F1F1FA] hover:bg-[#F8F8FE]">
                    <td className="px-3 py-3 text-[12px] font-semibold text-[#0B0B18]">{r.term}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                      {r.p_value?.toExponential(2)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                      {r.adj_p_value?.toExponential(2)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                      {(r.combined_score || 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-[11px] font-bold text-[#5139ED]">
                      {r.gene_count}
                    </td>
                    <td className="max-w-[280px] px-3 py-3 text-[10px] font-mono text-[#64748B]" title={(r.overlap_genes || []).join(", ")}>
                      {(r.overlap_genes || []).slice(0, 6).join(", ")}
                      {r.overlap_genes?.length > 6 && "…"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              data-testid="kegg-complete"
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Finish — Network Analysis
              <Check className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────── KEGG additional plots ─────────────────────

function KEGGDotPlot({ rows }) {
  const s = useAppliedStyle("kegg");
  const w = 780;
  const rowH = 28;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxLog = Math.max(1, ...rows.map((r) => -Math.log10(Math.max(r.p_value || 1, 1e-30))));
  const maxCount = Math.max(1, ...rows.map((r) => r.gene_count || 0));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f) => (
        <line key={`grid-${f}`} x1={plotL + f * plotW} x2={plotL + f * plotW} y1={20} y2={h - 40}
              stroke={s.grid} strokeWidth="0.5" />
      ))}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
        const x = plotL + (logp / maxLog) * plotW;
        const dot = (4 + ((r.gene_count || 0) / maxCount) * 12) * s.nodeSize;
        const colour = s.palette[i % s.palette.length];
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        return (
          <g key={r.term} opacity={s.opacity}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>
              {label}
            </text>
            <circle cx={x} cy={y} r={dot} fill={colour} fillOpacity="0.85" stroke={colour} strokeWidth="1" />
            <text x={x + dot + 4} y={y + 3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {r.gene_count}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P-value) · dot size ∝ overlap
      </text>
    </svg>
  );
}


function KEGGLollipopChart({ rows }) {
  const s = useAppliedStyle("lollipop");
  const w = 780;
  const rowH = 28;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxScore = Math.max(1, ...rows.map((r) => r.combined_score || 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && <line x1={plotL} x2={plotL} y1={20} y2={h - 40} stroke={s.grid} strokeWidth="1" />}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const bw = ((r.combined_score || 0) / maxScore) * plotW;
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        const c = s.palette[i % s.palette.length];
        return (
          <g key={r.term} opacity={s.opacity}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>
              {label}
            </text>
            <line
              x1={plotL} y1={y} x2={plotL + bw} y2={y}
              stroke={c} strokeWidth={2 * s.edgeThickness} strokeOpacity="0.65"
            />
            <circle cx={plotL + bw} cy={y} r={5 * s.nodeSize} fill={c} stroke={s.background} strokeWidth="1.5" />
            <text x={plotL + bw + 10} y={y + 3} fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {(r.combined_score || 0).toFixed(1)}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        Combined score
      </text>
    </svg>
  );
}


function KEGGSankey({ rows }) {
  // Simple gene→pathway Sankey. Genes on the left; pathways on the right.
  const w = 900;
  const pad = 16;
  const geneW = 12;
  const pathW = 12;

  // Collect and count gene appearances.
  const geneCounts = new Map();
  for (const r of rows) for (const g of r.overlap_genes || []) {
    geneCounts.set(g, (geneCounts.get(g) || 0) + 1);
  }
  const genes = [...geneCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g]) => g);
  const geneSet = new Set(genes);

  const filteredRows = rows
    .map((r) => ({ ...r, overlap_genes: (r.overlap_genes || []).filter((g) => geneSet.has(g)) }))
    .filter((r) => r.overlap_genes.length > 0);

  const h = Math.max(360, Math.max(genes.length, filteredRows.length) * 22 + 60);
  const geneStep = (h - 2 * pad) / Math.max(1, genes.length);
  const pathStep = (h - 2 * pad) / Math.max(1, filteredRows.length);
  const geneY = (i) => pad + geneStep * (i + 0.5);
  const pathY = (i) => pad + pathStep * (i + 0.5);
  const palette = ["#5139ED", "#8139ED", "#395AED", "#ED39A6", "#39C1ED", "#F5B301", "#10B981", "#EF4444"];

  if (filteredRows.length === 0 || genes.length === 0) {
    return (
      <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">
        Not enough overlap data to render a Sankey diagram.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3">
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {/* Gene nodes (left) */}
      {genes.map((g, i) => (
        <g key={g}>
          <rect x={140} y={geneY(i) - 6} width={geneW} height={12} rx={2} fill="#5139ED" />
          <text x={135} y={geneY(i) + 3} fontSize="10" fill="#0B0B18" fontFamily="Inter" textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {/* Pathway nodes (right) */}
      {filteredRows.map((r, i) => {
        const color = palette[i % palette.length];
        const label = r.term.length > 34 ? r.term.slice(0, 32) + "…" : r.term;
        return (
          <g key={r.term}>
            <rect x={w - 140 - pathW} y={pathY(i) - 6} width={pathW} height={12} rx={2} fill={color} />
            <text x={w - 140 + 6} y={pathY(i) + 3} fontSize="10" fill="#0B0B18" fontFamily="Inter">
              {label}
            </text>
          </g>
        );
      })}
      {/* Flows */}
      {filteredRows.map((r, pi) => {
        const color = palette[pi % palette.length];
        return (r.overlap_genes || []).map((g) => {
          const gi = genes.indexOf(g);
          if (gi < 0) return null;
          const x1 = 140 + geneW;
          const y1 = geneY(gi);
          const x2 = w - 140 - pathW;
          const y2 = pathY(pi);
          const c1x = x1 + (x2 - x1) * 0.5;
          const c2x = x1 + (x2 - x1) * 0.5;
          const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
          return (
            <path
              key={`${g}-${r.term}`}
              d={d}
              stroke={color}
              strokeWidth="1.6"
              strokeOpacity="0.35"
              fill="none"
            />
          );
        });
      })}
    </svg>
  );
}

export { KeggPanel, KEGGDotPlot, KEGGLollipopChart, KEGGSankey };
