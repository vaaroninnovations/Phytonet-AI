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

function GOPanel({ genes, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [topN, setTopN] = useState(10);
  const [maxP, setMaxP] = useState(0.05);
  const [activeSource, setActiveSource] = useState("GO:BP");

  const runGO = async () => {
    if (!genes || genes.length === 0) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await goEnrich({ genes });
      if (res.error) toast.error(`g:Profiler: ${res.error}`);
      setResult(res);
      toast.success(`g:Profiler returned ${res.terms?.length || 0} GO terms`);
    } catch (e) {
      toast.error("GO enrichment failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (genes?.length && !result) runGO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bySource = useMemo(() => {
    const g = { "GO:BP": [], "GO:MF": [], "GO:CC": [] };
    if (!result?.terms) return g;
    for (const t of result.terms) {
      if ((t.p_value ?? 1) > maxP) continue;
      if (!g[t.source]) g[t.source] = [];
      g[t.source].push(t);
    }
    for (const k of Object.keys(g)) g[k] = g[k].slice(0, topN);
    return g;
  }, [result, topN, maxP]);

  const activeTerms = bySource[activeSource] || [];

  const accessors = useMemo(
    () => ({
      name: (r) => r.name,
      native: (r) => r.native,
      p_value: (r) => r.p_value,
      term_size: (r) => r.term_size,
      intersection_size: (r) => r.intersection_size,
      precision: (r) => r.precision,
      recall: (r) => r.recall,
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(activeTerms, accessors, {
    key: "p_value",
    dir: "asc",
  });

  const exportRows = () => {
    if (!result?.terms) return;
    const flat = result.terms.map((r) => ({
      Source: r.source,
      Category: r.category,
      "Term ID": r.native,
      "Term Name": r.name,
      "P-value": r.p_value,
      "Term Size": r.term_size,
      "Query Size": r.query_size,
      "Intersection Size": r.intersection_size,
      Precision: r.precision,
      Recall: r.recall,
      "Overlap Genes": (r.overlap_genes || []).join(","),
    }));
    exportCSV(
      flat,
      Object.keys(flat[0] || { Source: 0 }).map((k) => ({ key: k, label: k })),
      "go_enrichment.csv"
    );
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="go-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Layers className="mr-1 inline h-3.5 w-3.5" />
              GO Enrichment · g:Profiler (g:SCS · H. sapiens)
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes?.length || 0} genes → Biological Process · Molecular Function · Cellular Component
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomizeFigureButton chartType="go" testid="customize-figure-go" />
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top
              <input
                data-testid="go-topn"
                type="number"
                min={1}
                max={100}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Max P
              <input
                data-testid="go-max-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={maxP}
                onChange={(e) => setMaxP(Number(e.target.value))}
                className="w-20 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <button
              data-testid="go-run"
              onClick={runGO}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
            >
              {loading ? "Enriching…" : "Re-run"}
            </button>
            <DlBtn
              onClick={exportRows}
              testid="go-export-csv"
              label="CSV"
              icon={<Download className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* Source tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["GO:BP", "GO:MF", "GO:CC"].map((s) => (
            <button
              key={s}
              data-testid={`go-tab-${s.replace(":", "-").toLowerCase()}`}
              onClick={() => setActiveSource(s)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-inset ${
                activeSource === s
                  ? "bg-[#5139ED] text-white ring-[#5139ED]"
                  : "bg-white text-[#0B0B18] ring-[#E7E7F3] hover:ring-[#5139ED]/40"
              }`}
            >
              {s === "GO:BP"
                ? "Biological Process"
                : s === "GO:MF"
                ? "Molecular Function"
                : "Cellular Component"}
              <span className="ml-1.5 text-[10px] opacity-70">({bySource[s]?.length || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div data-testid="go-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Querying g:Profiler…
        </div>
      ) : activeTerms.length === 0 ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          No significantly enriched {activeSource} terms at P ≤ {maxP}.
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div
            data-testid="go-bar-chart"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Bar chart · −log10(P) per term · {activeSource}
            </p>
            <GOBarChart terms={activeTerms} />
          </div>

          {/* Dot plot */}
          <div
            data-testid="go-dot-plot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Dot plot · gene ratio × −log10(P) · dot size = intersection count
            </p>
            <GODotPlot terms={activeTerms} />
          </div>

          {/* Chord plot */}
          <div
            data-testid="go-chord-plot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Chord plot · term–gene relationships · {activeSource}
            </p>
            <GOChordPlot terms={activeTerms.slice(0, 10)} />
          </div>

          {/* Table */}
          <div
            data-testid="go-table"
            className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
          >
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                    <SortableTh id="native" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term ID</SortableTh>
                    <SortableTh id="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term Name</SortableTh>
                    <SortableTh id="p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>P-value</SortableTh>
                    <SortableTh id="term_size" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term Size</SortableTh>
                    <SortableTh id="intersection_size" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Overlap</SortableTh>
                    <SortableTh id="precision" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Precision</SortableTh>
                    <SortableTh id="recall" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Recall</SortableTh>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                      Genes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr key={r.native} data-testid={`go-row-${r.native}`} className="border-b border-[#F1F1FA] hover:bg-[#F8F8FE]">
                      <td className="px-3 py-3 font-mono text-[11px]">
                        <a
                          href={`https://amigo.geneontology.org/amigo/term/${r.native}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#5139ED] underline decoration-dotted underline-offset-2"
                        >
                          {r.native}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-[12px] font-semibold text-[#0B0B18]">{r.name}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                        {r.p_value?.toExponential(2)}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] text-[#0B0B18]">
                        {r.term_size}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] font-bold text-[#5139ED]">
                        {r.intersection_size}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                        {(r.precision || 0).toFixed(3)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                        {(r.recall || 0).toFixed(3)}
                      </td>
                      <td
                        className="max-w-[240px] px-3 py-3 text-[10px] font-mono text-[#64748B]"
                        title={(r.overlap_genes || []).join(", ")}
                      >
                        {(r.overlap_genes || []).slice(0, 6).join(", ")}
                        {r.overlap_genes?.length > 6 && "…"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button
          data-testid="go-complete"
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
        >
          Next — KEGG Pathway Enrichment
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}


function GOBarChart({ terms }) {
  const s = useAppliedStyle("go");
  const w = 780;
  const rowH = 26;
  const h = Math.max(120, terms.length * rowH + 60);
  const labelW = 260;
  const maxLog = Math.max(1, ...terms.map((t) => -Math.log10(Math.max(t.p_value || 1, 1e-30))));
  const barMax = w - labelW - 60;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f) => (
        <line key={`grid-${f}`} x1={labelW + f * barMax} x2={labelW + f * barMax} y1={20} y2={h - 40}
              stroke={s.grid} strokeWidth="0.5" />
      ))}
      {terms.map((t, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(t.p_value || 1, 1e-30));
        const bw = (logp / maxLog) * barMax;
        const label = t.name.length > 34 ? t.name.slice(0, 32) + "…" : t.name;
        return (
          <g key={t.native} opacity={s.opacity}>
            <text
              x={labelW - 8}
              y={y + rowH / 2 + 3}
              textAnchor="end"
              fontSize={s.labelSize}
              fill={s.labelColor}
              fontFamily={s.fontFamily}
            >
              {label}
            </text>
            <rect
              x={labelW}
              y={y + 4}
              width={bw}
              height={rowH - 8}
              rx={3}
              fill={s.palette[i % s.palette.length]}
              fillOpacity="0.85"
            />
            <text
              x={labelW + bw + 6}
              y={y + rowH / 2 + 3}
              fontSize={Math.max(9, s.labelSize - 2)}
              fill={s.labelColor}
              opacity="0.7"
              fontFamily={s.fontFamily}
            >
              {logp.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text x={labelW + barMax / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P-value)
      </text>
    </svg>
  );
}


function GODotPlot({ terms }) {
  const s = useAppliedStyle("go");
  const w = 780;
  const rowH = 26;
  const h = Math.max(180, terms.length * rowH + 60);
  const labelW = 260;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxLog = Math.max(1, ...terms.map((t) => -Math.log10(Math.max(t.p_value || 1, 1e-30))));
  const maxIS = Math.max(1, ...terms.map((t) => t.intersection_size || 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={`grid-${f}`}
          x1={plotL + f * plotW}
          x2={plotL + f * plotW}
          y1={20}
          y2={h - 40}
          stroke={s.grid}
          strokeWidth="0.5"
        />
      ))}
      {terms.map((t, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(t.p_value || 1, 1e-30));
        const x = plotL + (logp / maxLog) * plotW;
        const r = (4 + ((t.intersection_size || 0) / maxIS) * 12) * s.nodeSize;
        const label = t.name.length > 34 ? t.name.slice(0, 32) + "…" : t.name;
        const colour = s.palette[i % s.palette.length];
        return (
          <g key={t.native} opacity={s.opacity}>
            <text
              x={labelW - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={s.labelSize}
              fill={s.labelColor}
              fontFamily={s.fontFamily}
            >
              {label}
            </text>
            <circle cx={x} cy={y} r={r} fill={colour} fillOpacity="0.85" stroke={colour} strokeWidth="1" />
            <text x={x + r + 4} y={y + 3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {t.intersection_size}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P) · dot size ∝ overlap · colour ∝ term index
      </text>
    </svg>
  );
}


function GOChordPlot({ terms }) {
  // Simplified radial chord: terms on the top arc, unique overlap genes on the
  // bottom arc, curved lines connecting each term ↔ gene.
  const w = 780;
  const h = 460;
  const cx = w / 2;
  const cy = h / 2 + 20;
  const rIn = 150;
  const rOut = 180;
  const genes = useMemo(() => {
    const s = new Set();
    for (const t of terms) for (const g of t.overlap_genes || []) s.add(g);
    return [...s];
  }, [terms]);

  if (terms.length === 0 || genes.length === 0) {
    return (
      <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">
        Not enough overlap data to render a chord diagram.
      </div>
    );
  }

  // Terms occupy top hemisphere (π→0), genes occupy bottom (0→−π going through π).
  // We split the full circle: first half for terms, second half for genes.
  const termCount = terms.length;
  const geneCount = genes.length;
  const total = termCount + geneCount;
  const angleFor = (i) => (Math.PI * 2 * i) / total - Math.PI / 2;

  const termAngles = terms.map((_, i) => angleFor(i));
  const geneAngles = {};
  genes.forEach((g, i) => (geneAngles[g] = angleFor(termCount + i)));

  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const palette = ["#5139ED", "#8139ED", "#395AED", "#ED39A6", "#39C1ED", "#F5B301", "#10B981", "#EF4444", "#0EA5E9", "#7C3AED"];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3">
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {/* Term arcs */}
      {terms.map((t, i) => {
        const a = termAngles[i];
        const [x1, y1] = point(rIn, a);
        const [x2, y2] = point(rOut, a);
        const [lx, ly] = point(rOut + 10, a);
        const colour = palette[i % palette.length];
        const label = t.name.length > 22 ? t.name.slice(0, 20) + "…" : t.name;
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={t.native}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth="4" strokeLinecap="round" />
            <text
              x={lx}
              y={ly}
              fontSize="10"
              fill={colour}
              fontFamily="Inter"
              fontWeight="700"
              textAnchor={anchor}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Gene arcs */}
      {genes.map((g, i) => {
        const a = geneAngles[g];
        const [x1, y1] = point(rIn, a);
        const [x2, y2] = point(rOut, a);
        const [lx, ly] = point(rOut + 10, a);
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={g}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <text x={lx} y={ly + 3} fontSize="9" fill="#0B0B18" fontFamily="Inter" textAnchor={anchor}>
              {g}
            </text>
          </g>
        );
      })}
      {/* Chords */}
      {terms.map((t, i) => {
        const colour = palette[i % palette.length];
        const [tx, ty] = point(rIn, termAngles[i]);
        return (t.overlap_genes || []).map((g) => {
          if (geneAngles[g] == null) return null;
          const [gx, gy] = point(rIn, geneAngles[g]);
          const d = `M ${tx} ${ty} Q ${cx} ${cy} ${gx} ${gy}`;
          return (
            <path
              key={`${t.native}-${g}`}
              d={d}
              stroke={colour}
              strokeWidth="0.8"
              strokeOpacity="0.45"
              fill="none"
            />
          );
        });
      })}
    </svg>
  );
}

// ────────────────────── KEGG Panel ─────────────────────

export { GOPanel, GOBarChart, GODotPlot, GOChordPlot };
