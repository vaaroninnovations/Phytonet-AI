// KEGG Pathway Enrichment ShinyGO-style panel.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Layers } from "lucide-react";
import CytoscapeComponent from "react-cytoscapejs";
import "@/lib/cytoscapeSetup";
import { keggEnrich } from "@/lib/api";
import { HelpTip } from "@/components/network/HelpTip";
import { TableToolbar } from "@/components/network/TableToolbar";
import { FigureToolbar } from "@/components/network/FigureToolbar";
import { CyToolbar } from "@/components/network/CyToolbar";
import { DataTable } from "@/components/network/DataTable";
import { useAppliedStyle } from "@/context/ChartStyleContext";
import { benjaminiHochberg, bonferroni, CORRECTION_METHODS } from "@/lib/enrichmentUtils";

const VIZ_OPTIONS = [
  { key: "bubble", label: "Bubble Plot" },
  { key: "dot", label: "Dot Plot" },
  { key: "lollipop", label: "Lollipop Plot" },
  { key: "sankey", label: "Sankey Diagram" },
  { key: "bar", label: "Bar Plot" },
  { key: "gpnetwork", label: "Gene-Pathway Network" },
  { key: "chord", label: "Pathway Chord Plot" },
  { key: "heatmap", label: "Heatmap" },
];
const SORT_KEYS = [
  { key: "adj_p_value", label: "FDR / Adjusted P" },
  { key: "p_value", label: "P-value" },
  { key: "rich_factor", label: "Rich Factor" },
  { key: "gene_count", label: "Gene Count" },
  { key: "gene_ratio", label: "Gene Ratio" },
];
const SIZE_KEYS = [
  { key: "gene_count", label: "Gene Count" },
  { key: "gene_ratio", label: "Gene Ratio" },
];
const COLOR_KEYS = [
  { key: "adj_p_value", label: "FDR / Adjusted P" },
  { key: "rich_factor", label: "Rich Factor" },
  { key: "p_value", label: "P-value" },
];

export function KEGGPanel({ genes, onComplete, onPathwaysUpdate }) {
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState(null);

  const [topN, setTopN] = useState(10);
  const [customTopN, setCustomTopN] = useState(20);
  const [minGeneCount, setMinGeneCount] = useState(1);
  const [minGeneRatio, setMinGeneRatio] = useState(0);
  const [minRichFactor, setMinRichFactor] = useState(0);
  const [minFold, setMinFold] = useState(0);
  const [adjPCutoff, setAdjPCutoff] = useState(0.25);
  const [pCutoff, setPCutoff] = useState(0.05);
  const [correction, setCorrection] = useState("fdr");
  const [sortBy, setSortBy] = useState("adj_p_value");
  const [colorBy, setColorBy] = useState("adj_p_value");
  const [sizeBy, setSizeBy] = useState("gene_count");
  const [viz, setViz] = useState({ bubble: true, dot: true, lollipop: true, sankey: true, bar: true, gpnetwork: true, chord: true, heatmap: true });
  const [selectedPathways, setSelectedPathways] = useState({}); // {term: true}

  useEffect(() => {
    if (genes?.length) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = async () => {
    if (!genes?.length) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await keggEnrich({ genes });
      if (res.error) toast.error(`Enrichr: ${res.error}`);
      setRaw(res);
      toast.success(`Enrichr returned ${res.pathways?.length || 0} KEGG pathways`);
    } catch (e) { toast.error("KEGG enrichment failed"); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!raw?.pathways) return [];
    const nQuery = genes?.length || 1;
    // Compute enriched fields client-side
    const enriched = raw.pathways.map((p) => {
      const gc = p.gene_count || (p.overlap_genes?.length || 0);
      const gene_ratio = nQuery ? gc / nQuery : 0;
      // Approximate rich factor: without term_size we default to combined score proxy
      const rich_factor = p.rich_factor ?? (p.combined_score ? p.combined_score / 100 : gene_ratio);
      const fold_enrichment = p.combined_score ? p.combined_score / Math.max(1, Math.log(nQuery)) : 0;
      return { ...p, gene_count: gc, gene_ratio, rich_factor, fold_enrichment };
    });
    // Apply user-selected correction on raw p
    const rawP = enriched.map((r) => r.p_value ?? 1);
    let adj = enriched.map((r, i) => r.adj_p_value ?? rawP[i]);
    if (correction === "fdr") adj = benjaminiHochberg(rawP);
    else if (correction === "bonferroni") adj = bonferroni(rawP);
    else if (correction === "none") adj = rawP;
    const withAdj = enriched.map((r, i) => ({ ...r, adj_p_value: adj[i] }));
    // Filter
    let r = withAdj.filter((p) =>
      (p.gene_count || 0) >= minGeneCount &&
      (p.gene_ratio || 0) >= minGeneRatio &&
      (p.rich_factor || 0) >= minRichFactor &&
      (p.fold_enrichment || 0) >= minFold &&
      (p.adj_p_value ?? 1) <= adjPCutoff &&
      (p.p_value ?? 1) <= pCutoff
    );
    // Sort
    const dir = sortBy === "gene_count" || sortBy === "rich_factor" || sortBy === "gene_ratio" ? -1 : 1;
    r.sort((a, b) => ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)) * dir);
    const N = topN === "custom" ? customTopN : topN;
    return r.slice(0, N);
  }, [raw, genes, minGeneCount, minGeneRatio, minRichFactor, minFold, adjPCutoff, pCutoff, correction, sortBy, topN, customTopN]);

  // Push selected pathways up to context for PCTDP consumption
  useEffect(() => {
    const sel = filtered.filter((p) => selectedPathways[p.term] !== false); // default select all
    onPathwaysUpdate?.(sel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selectedPathways]);

  const tableColumns = useMemo(() => [
    { key: "select", label: "☑", sortable: false, format: (_, r) => (
        <input type="checkbox" data-testid={`kegg-sel-${r.term}`} checked={selectedPathways[r.term] !== false} onChange={(e) => setSelectedPathways((s) => ({ ...s, [r.term]: e.target.checked }))} className="accent-[#5139ED]" />
      )
    },
    { key: "term", label: "Pathway", format: (v) => <span className="font-semibold text-[#0B0B18]">{v}</span> },
    { key: "p_value", label: "P-value", format: (v) => (v ?? 0).toExponential(2) },
    { key: "adj_p_value", label: "Adj P (FDR)", format: (v) => (v ?? 0).toExponential(2) },
    { key: "gene_count", label: "Gene Count" },
    { key: "gene_ratio", label: "Gene Ratio", format: (v) => (v ?? 0).toFixed(3) },
    { key: "rich_factor", label: "Rich Factor", format: (v) => (v ?? 0).toFixed(3) },
    { key: "combined_score", label: "Combined", format: (v) => (v ?? 0).toFixed(1) },
    { key: "overlap_genes", label: "Genes", sortable: false, format: (v) => <span className="font-mono text-[10px]">{(v || []).slice(0, 6).join(", ")}{v?.length > 6 ? "…" : ""}</span> },
  ], [selectedPathways]);

  return (
    <div className="space-y-6">
      <FilterPanel {...{ topN, setTopN, customTopN, setCustomTopN, minGeneCount, setMinGeneCount, minGeneRatio, setMinGeneRatio, minRichFactor, setMinRichFactor, minFold, setMinFold, adjPCutoff, setAdjPCutoff, pCutoff, setPCutoff, correction, setCorrection, sortBy, setSortBy, colorBy, setColorBy, sizeBy, setSizeBy, viz, setViz, loading, onRefetch: refetch, genes }} />

      {loading ? (
        <div data-testid="kegg-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">Querying Enrichr KEGG_2021_Human…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-6 text-center text-xs text-[#64748B]">No pathways match the current filters.</div>
      ) : (
        <>
          {viz.bar && <KEGGChartCard testid="kegg-bar" title="KEGG · Bar Plot" basename="kegg_bar" rows={filtered} kind="bar" colorBy={colorBy} sizeBy={sizeBy} />}
          {viz.bubble && <KEGGChartCard testid="kegg-bubble" title="KEGG · Bubble Plot" basename="kegg_bubble" rows={filtered} kind="bubble" colorBy={colorBy} sizeBy={sizeBy} />}
          {viz.dot && <KEGGChartCard testid="kegg-dot" title="KEGG · Dot Plot" basename="kegg_dot" rows={filtered} kind="dot" colorBy={colorBy} sizeBy={sizeBy} />}
          {viz.lollipop && <KEGGChartCard testid="kegg-lollipop" title="KEGG · Lollipop Plot" basename="kegg_lollipop" rows={filtered} kind="lollipop" colorBy={colorBy} sizeBy={sizeBy} />}
          {viz.sankey && <KEGGChartCard testid="kegg-sankey" title="KEGG · Sankey" basename="kegg_sankey" rows={filtered.slice(0, 8)} kind="sankey" />}
          {viz.chord && <KEGGChartCard testid="kegg-chord" title="KEGG · Pathway Chord" basename="kegg_chord" rows={filtered.slice(0, 10)} kind="chord" />}
          {viz.heatmap && <KEGGChartCard testid="kegg-heatmap" title="KEGG · Heatmap" basename="kegg_heatmap" rows={filtered.slice(0, 15)} kind="heatmap" />}
          {viz.gpnetwork && <KEGGCyCard testid="kegg-gpnetwork" title="KEGG · Gene-Pathway Network" basename="kegg_gene_pathway" rows={filtered.slice(0, 15)} />}

          <div data-testid="kegg-table-wrap" className="rounded-3xl border border-[#E7E7F3] bg-white p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Pathway Table</p>
              <TableToolbar rows={filtered} columns={tableColumns.map(({ key, label }) => ({ key, label })).filter((c) => c.key !== "select")} basename="kegg_pathways" testidPrefix="kegg-tbl" />
            </div>
            <DataTable rows={filtered.map((r, i) => ({ ...r, id: r.term + "-" + i }))} columns={tableColumns} testidPrefix="kegg-dt" />
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button data-testid="kegg-complete" onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
          Next — PCTDP Network <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FilterPanel(p) {
  const lbl = "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]";
  const inp = "brand-focus rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-xs text-[#0B0B18]";
  const sel = "brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#0B0B18]";
  return (
    <div data-testid="kegg-controls" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            <Layers className="mr-1 inline h-3.5 w-3.5" /> KEGG Enrichment · Enrichr KEGG_2021_Human · {p.genes?.length || 0} genes
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">ShinyGO-style filters</h2>
        </div>
        <button data-testid="kegg-run" onClick={p.onRefetch} disabled={p.loading}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
          {p.loading ? "Enriching…" : "Re-run"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={lbl}>Top N<HelpTip text="Show only the top N pathways ranked by the current Sort criterion." /></label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[10,20,30].map((n) => (
              <button key={n} data-testid={`kegg-topn-${n}`} onClick={() => p.setTopN(n)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${p.topN === n ? "bg-[#5139ED] text-white ring-[#5139ED]" : "bg-white text-[#0B0B18] ring-[#E7E7F3]"}`}>Top {n}</button>
            ))}
            <button data-testid="kegg-topn-custom" onClick={() => p.setTopN("custom")} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${p.topN === "custom" ? "bg-[#5139ED] text-white ring-[#5139ED]" : "bg-white text-[#0B0B18] ring-[#E7E7F3]"}`}>Custom</button>
            {p.topN === "custom" && <input data-testid="kegg-topn-input" type="number" min={1} max={500} value={p.customTopN} onChange={(e) => p.setCustomTopN(Number(e.target.value))} className={`${inp} w-16 text-right`} />}
          </div>
        </div>
        <div>
          <label className={lbl}>Min Gene Count<HelpTip text="Minimum number of input genes overlapping a pathway." /></label>
          <input data-testid="kegg-min-gc" type="range" min={0} max={20} value={p.minGeneCount} onChange={(e) => p.setMinGeneCount(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {p.minGeneCount}</div>
        </div>
        <div>
          <label className={lbl}>Min Gene Ratio<HelpTip text="Gene Ratio = k / n (overlap over input set size)." /></label>
          <input data-testid="kegg-min-gr" type="range" min={0} max={1} step={0.05} value={p.minGeneRatio} onChange={(e) => p.setMinGeneRatio(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {p.minGeneRatio.toFixed(2)}</div>
        </div>
        <div>
          <label className={lbl}>Min Rich Factor<HelpTip text="Rich Factor = overlap / pathway size. Higher values indicate greater coverage of the pathway." /></label>
          <input data-testid="kegg-min-rf" type="range" min={0} max={1} step={0.05} value={p.minRichFactor} onChange={(e) => p.setMinRichFactor(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {p.minRichFactor.toFixed(2)}</div>
        </div>
        <div>
          <label className={lbl}>Min Fold Enrichment<HelpTip text="Approximate fold enrichment from Enrichr combined score." /></label>
          <input data-testid="kegg-min-fe" type="range" min={0} max={50} step={0.5} value={p.minFold} onChange={(e) => p.setMinFold(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {p.minFold.toFixed(1)}×</div>
        </div>
        <div>
          <label className={lbl}>Adjusted P cutoff<HelpTip text="FDR / adjusted P-value threshold." /></label>
          <input data-testid="kegg-adj-p" type="number" min={0} max={1} step={0.001} value={p.adjPCutoff} onChange={(e) => p.setAdjPCutoff(Number(e.target.value))} className={`${inp} mt-2 w-full`} />
        </div>
        <div>
          <label className={lbl}>Raw P cutoff<HelpTip text="Raw p-value threshold, applied in parallel with FDR cutoff." /></label>
          <input data-testid="kegg-raw-p" type="number" min={0} max={1} step={0.001} value={p.pCutoff} onChange={(e) => p.setPCutoff(Number(e.target.value))} className={`${inp} mt-2 w-full`} />
        </div>
        <div>
          <label className={lbl}>Multiple-testing correction<HelpTip text="Applied client-side to Enrichr raw p-values." /></label>
          <select data-testid="kegg-correction" value={p.correction} onChange={(e) => p.setCorrection(e.target.value)} className={`${sel} mt-2 w-full`}>
            {CORRECTION_METHODS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Sort by<HelpTip text="Primary ranking column." /></label>
          <select data-testid="kegg-sort" value={p.sortBy} onChange={(e) => p.setSortBy(e.target.value)} className={`${sel} mt-2 w-full`}>{SORT_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </div>
        <div>
          <label className={lbl}>Color by<HelpTip text="Colour scale for bubble/dot/bar plots." /></label>
          <select data-testid="kegg-color" value={p.colorBy} onChange={(e) => p.setColorBy(e.target.value)} className={`${sel} mt-2 w-full`}>{COLOR_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </div>
        <div>
          <label className={lbl}>Bubble size by<HelpTip text="Size scale for bubble/dot plots." /></label>
          <select data-testid="kegg-size" value={p.sizeBy} onChange={(e) => p.setSizeBy(e.target.value)} className={`${sel} mt-2 w-full`}>{SIZE_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
        </div>
      </div>

      <div className="mt-5 border-t border-[#F1F1FA] pt-4">
        <p className={lbl}>Visualisations<HelpTip text="Tick which plots to generate." /></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIZ_OPTIONS.map((v) => (
            <label key={v.key} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs">
              <input data-testid={`kegg-viz-${v.key}`} type="checkbox" checked={!!p.viz[v.key]} onChange={(e) => p.setViz((s) => ({ ...s, [v.key]: e.target.checked }))} className="accent-[#5139ED]" />
              {v.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// SVG chart cards
const getMetric = (r, key) => {
  if (key === "adj_p_value" || key === "p_value") return -Math.log10(Math.max(r[key] ?? 1, 1e-30));
  return r[key] ?? 0;
};
const colourFor = (v, vmax) => { const t = vmax > 0 ? v / vmax : 0; return `hsl(${260 - t * 40}, 70%, ${55 - t * 20}%)`; };

function KEGGChartCard({ testid, title, basename, rows, kind, colorBy = "adj_p_value", sizeBy = "gene_count" }) {
  const containerRef = useRef(null); const svgRef = useRef(null);
  return (
    <div ref={containerRef} data-testid={testid} className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">{title}</p>
        <FigureToolbar getSvg={() => svgRef.current} containerRef={containerRef} basename={basename} title={title} testidPrefix={testid} />
      </div>
      {kind === "bar" && <BarChart svgRef={svgRef} rows={rows} colorBy={colorBy} />}
      {kind === "bubble" && <BubbleChart svgRef={svgRef} rows={rows} colorBy={colorBy} sizeBy={sizeBy} />}
      {kind === "dot" && <DotChart svgRef={svgRef} rows={rows} colorBy={colorBy} sizeBy={sizeBy} />}
      {kind === "lollipop" && <LollipopChart svgRef={svgRef} rows={rows} />}
      {kind === "sankey" && <SankeyChart svgRef={svgRef} rows={rows} />}
      {kind === "chord" && <ChordChart svgRef={svgRef} rows={rows} />}
      {kind === "heatmap" && <HeatmapChart svgRef={svgRef} rows={rows} />}
    </div>
  );
}

function BarChart({ svgRef, rows, colorBy }) {
  const w = 780, rowH = 26, h = Math.max(160, rows.length * rowH + 60);
  const labelW = 320, barMax = w - labelW - 60;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {rows.map((r, i) => {
        const y = 30 + i * rowH; const v = getMetric(r, colorBy); const bw = (v / maxV) * barMax;
        const label = r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term;
        return (<g key={r.term}><text x={labelW-8} y={y+rowH/2+3} textAnchor="end" fontSize="11" fill="#0B0B18">{label}</text><rect x={labelW} y={y+4} width={bw} height={rowH-8} rx={3} fill={colourFor(v, maxV)} fillOpacity="0.85" /><text x={labelW+bw+6} y={y+rowH/2+3} fontSize="10" fill="#64748B">{v.toFixed(2)}</text></g>);
      })}
      <text x={labelW + barMax/2} y={h-12} textAnchor="middle" fontSize="11" fill="#64748B">{colorBy === "adj_p_value" || colorBy === "p_value" ? "−log10(P)" : colorBy}</text>
    </svg>
  );
}

function BubbleChart({ svgRef, rows, colorBy, sizeBy }) {
  const w = 780, rowH = 34, h = Math.max(200, rows.length * rowH + 60);
  const labelW = 320, plotL = labelW + 20, plotW = w - plotL - 60;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  const maxS = Math.max(1, ...rows.map((r) => r[sizeBy] ?? 0));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {rows.map((r, i) => {
        const y = 30 + i * rowH; const v = getMetric(r, colorBy); const x = plotL + (v/maxV)*plotW;
        const s = 6 + ((r[sizeBy] || 0) / maxS) * 20; const c = colourFor(v, maxV);
        const label = r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term;
        return (<g key={r.term}><text x={labelW-8} y={y+4} textAnchor="end" fontSize="11" fill="#0B0B18">{label}</text><circle cx={x} cy={y} r={s} fill={c} fillOpacity="0.6" stroke={c} strokeWidth="1.5" /><text x={x+s+4} y={y+3} fontSize="9" fill="#64748B">{r[sizeBy]?.toFixed?.(2) ?? r[sizeBy]}</text></g>);
      })}
    </svg>
  );
}

function DotChart({ svgRef, rows, colorBy, sizeBy }) {
  const w = 780, rowH = 26, h = Math.max(160, rows.length * rowH + 60);
  const labelW = 320, plotL = labelW + 20, plotW = w - plotL - 60;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  const maxS = Math.max(1, ...rows.map((r) => r[sizeBy] ?? 0));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {rows.map((r, i) => {
        const y = 30 + i * rowH; const v = getMetric(r, colorBy); const x = plotL + (v/maxV)*plotW;
        const s = 3 + ((r[sizeBy] || 0) / maxS) * 12;
        const label = r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term;
        return (<g key={r.term}><text x={labelW-8} y={y+4} textAnchor="end" fontSize="11" fill="#0B0B18">{label}</text><circle cx={x} cy={y} r={s} fill={colourFor(v, maxV)} /></g>);
      })}
    </svg>
  );
}

function LollipopChart({ svgRef, rows }) {
  const w = 780, rowH = 28, h = Math.max(160, rows.length * rowH + 60);
  const labelW = 320, plotL = labelW + 20, plotW = w - plotL - 60;
  const max = Math.max(1, ...rows.map((r) => r.combined_score || 0));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {rows.map((r, i) => {
        const y = 30 + i * rowH; const bw = ((r.combined_score || 0) / max) * plotW;
        const label = r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term;
        return (<g key={r.term}><text x={labelW-8} y={y+4} textAnchor="end" fontSize="11" fill="#0B0B18">{label}</text><line x1={plotL} y1={y} x2={plotL+bw} y2={y} stroke="#8139ED" strokeWidth="2" strokeOpacity="0.65" /><circle cx={plotL+bw} cy={y} r={5} fill="#5139ED" stroke="#fff" strokeWidth="1.5" /><text x={plotL+bw+10} y={y+3} fontSize="10" fill="#64748B">{(r.combined_score || 0).toFixed(1)}</text></g>);
      })}
    </svg>
  );
}

function SankeyChart({ svgRef, rows }) {
  const s = useAppliedStyle("sankey");
  const w = 900, pad = 16, geneW = 12, pathW = 12;
  const geneCounts = new Map();
  for (const r of rows) for (const g of r.overlap_genes || []) geneCounts.set(g, (geneCounts.get(g) || 0) + 1);
  const genes = [...geneCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,24).map(([g]) => g);
  const geneSet = new Set(genes);
  const filteredRows = rows.map((r) => ({ ...r, overlap_genes: (r.overlap_genes || []).filter((g) => geneSet.has(g)) })).filter((r) => r.overlap_genes.length > 0);
  const h = Math.max(360, Math.max(genes.length, filteredRows.length) * 22 + 60);
  if (filteredRows.length === 0 || genes.length === 0) return <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">Not enough overlap data.</div>;
  const geneY = (i) => pad + ((h - 2*pad) / Math.max(1, genes.length)) * (i + 0.5);
  const pathY = (i) => pad + ((h - 2*pad) / Math.max(1, filteredRows.length)) * (i + 0.5);
  const palette = s.palette;
  const linkW = 1.6 * s.edgeThickness;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {genes.map((g,i) => <g key={g}><rect x={140} y={geneY(i)-6} width={geneW} height={12} rx={2} fill={s.node} /><text x={135} y={geneY(i)+3} fontSize={Math.max(9, s.labelSize - 2)} fill={s.labelColor} fontFamily={s.fontFamily} textAnchor="end">{g}</text></g>)}
      {filteredRows.map((r,i) => { const c = palette[i%palette.length]; const label = r.term.length>34 ? r.term.slice(0,32)+"…" : r.term; return <g key={r.term}><rect x={w-140-pathW} y={pathY(i)-6} width={pathW} height={12} rx={2} fill={c} /><text x={w-140+6} y={pathY(i)+3} fontSize={Math.max(9, s.labelSize - 2)} fill={s.labelColor} fontFamily={s.fontFamily}>{label}</text></g>; })}
      {filteredRows.map((r, pi) => { const color = palette[pi%palette.length]; return (r.overlap_genes || []).map((g) => { const gi = genes.indexOf(g); if (gi < 0) return null; const x1 = 140+geneW; const y1 = geneY(gi); const x2 = w-140-pathW; const y2 = pathY(pi); const cx = x1+(x2-x1)*0.5; const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`; return <path key={`${g}-${r.term}`} d={d} stroke={color} strokeWidth={linkW} strokeOpacity="0.35" fill="none" />; }); })}
    </svg>
  );
}

function ChordChart({ svgRef, rows }) {
  const s = useAppliedStyle("kegg");
  const w = 780, h = 480, cx = w/2, cy = h/2 + 20, rIn = 150, rOut = 180;
  const genes = useMemo(() => { const set = new Set(); for (const t of rows) for (const g of t.overlap_genes || []) set.add(g); return [...set]; }, [rows]);
  if (rows.length === 0 || genes.length === 0) return <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">Not enough overlap data.</div>;
  const total = rows.length + genes.length;
  const angleFor = (i) => (Math.PI*2*i)/total - Math.PI/2;
  const geneAngles = {}; genes.forEach((g,i) => geneAngles[g] = angleFor(rows.length + i));
  const point = (r,a) => [cx+r*Math.cos(a), cy+r*Math.sin(a)];
  const palette = s.palette;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {rows.map((t,i) => { const a = angleFor(i); const [x1,y1]=point(rIn,a); const [x2,y2]=point(rOut,a); const [lx,ly]=point(rOut+10,a); const c = palette[i%palette.length]; const label = t.term.length>22 ? t.term.slice(0,20)+"…" : t.term; const anchor = Math.cos(a)>0?"start":"end"; return <g key={t.term}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={4 * s.edgeThickness} strokeLinecap="round" /><text x={lx} y={ly} fontSize={s.labelSize} fill={c} fontWeight="700" fontFamily={s.fontFamily} textAnchor={anchor}>{label}</text></g>; })}
      {genes.map((g,i) => { const a = geneAngles[g]; const [x1,y1]=point(rIn,a); const [x2,y2]=point(rOut,a); const [lx,ly]=point(rOut+10,a); const anchor = Math.cos(a)>0?"start":"end"; return <g key={g}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.edge} strokeWidth={3 * s.edgeThickness} strokeLinecap="round" /><text x={lx} y={ly+3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} fontFamily={s.fontFamily} textAnchor={anchor}>{g}</text></g>; })}
      {rows.map((t,i) => { const c = palette[i%palette.length]; const [tx,ty]=point(rIn, angleFor(i)); return (t.overlap_genes||[]).map((g) => { if (geneAngles[g]==null) return null; const [gx,gy]=point(rIn, geneAngles[g]); return <path key={`${t.term}-${g}`} d={`M ${tx} ${ty} Q ${cx} ${cy} ${gx} ${gy}`} stroke={c} strokeWidth={0.9 * s.edgeThickness} strokeOpacity="0.5" fill="none" />; }); })}
    </svg>
  );
}

function HeatmapChart({ svgRef, rows }) {
  const s = useAppliedStyle("heatmap");
  const genes = useMemo(() => { const set = new Set(); for (const r of rows) for (const g of r.overlap_genes || []) set.add(g); return [...set].sort(); }, [rows]);
  if (rows.length === 0 || genes.length === 0) return <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">Not enough overlap data.</div>;
  const cellW = Math.max(18, Math.min(28, Math.floor(700 / genes.length)));
  const cellH = 22;
  const labelW = 300;
  const w = labelW + cellW * genes.length + 40;
  const h = 40 + cellH * rows.length + 80;
  // Heatmap uses the palette as a gradient scale (low → high).
  const palette = s.palette.length >= 4 ? s.palette.slice(0, 4) : ["#F1F5F9", "#CFD9F7", "#8A97ED", s.palette[0] || "#5139ED"];
  const scale = (v) => v ? palette[Math.min(3, Math.max(1, Math.floor(v * 4)))] : palette[0];
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {genes.map((g,gi) => (
        <text key={g} x={labelW + gi*cellW + cellW/2} y={30} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} fontFamily={s.fontFamily} textAnchor="middle" transform={`rotate(-45, ${labelW + gi*cellW + cellW/2}, 30)`}>{g}</text>
      ))}
      {rows.map((r,ri) => {
        const y = 40 + ri*cellH;
        const label = r.term.length > 40 ? r.term.slice(0,38)+"…" : r.term;
        return <g key={r.term}>
          <text x={labelW-8} y={y+cellH/2+3} fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily} textAnchor="end">{label}</text>
          {genes.map((g,gi) => {
            const present = (r.overlap_genes || []).includes(g);
            return <rect key={g} x={labelW + gi*cellW} y={y} width={cellW-1} height={cellH-1} fill={scale(present ? 1 : 0)} />;
          })}
        </g>;
      })}
    </svg>
  );
}

// Gene-Pathway Network via Cytoscape
function KEGGCyCard({ testid, title, basename, rows }) {
  const containerRef = useRef(null); const cyRef = useRef(null);
  const [layout, setLayout] = useState("fcose");
  const elements = useMemo(() => {
    const els = []; const seen = new Set();
    for (const r of rows) {
      const pid = "P::" + r.term;
      els.push({ group: "nodes", data: { id: pid, label: r.term.length > 30 ? r.term.slice(0,28)+"…" : r.term, type: "pathway", degree: (r.overlap_genes || []).length } });
      for (const g of r.overlap_genes || []) {
        const gid = "G::" + g;
        if (!seen.has(gid)) { seen.add(gid); els.push({ group: "nodes", data: { id: gid, label: g, type: "gene", degree: 1 } }); }
        els.push({ group: "edges", data: { source: gid, target: pid, weight: 1 } });
      }
    }
    return els;
  }, [rows]);
  const graph = useMemo(() => ({
    nodes: elements.filter((e) => e.group === "nodes").map((n) => ({ id: n.data.id, ...n.data })),
    edges: elements.filter((e) => e.group === "edges").map((e) => ({ source: e.data.source, target: e.data.target, score: e.data.weight || 1 })),
  }), [elements]);
  useEffect(() => { const cy = cyRef.current; if (!cy) return; try { cy.layout({ name: layout, animate: false, fit: true, padding: 30, nodeDimensionsIncludeLabels: true }).run(); } catch (e) {} }, [layout, elements]);
  const stylesheet = useMemo(() => [
    { selector: "node[type = 'pathway']", style: { "background-color": "#F59E0B", "label": "data(label)", "font-size": 9, "color": "#0B0B18", "text-wrap": "wrap", "text-max-width": 100, "width": "mapData(degree, 1, 30, 24, 60)", "height": "mapData(degree, 1, 30, 24, 60)", "shape": "round-rectangle" } },
    { selector: "node[type = 'gene']", style: { "background-color": "#5139ED", "label": "data(label)", "font-size": 8, "color": "#0B0B18", "width": 18, "height": 18, "shape": "ellipse" } },
    { selector: "edge", style: { "width": 1, "line-color": "#B2AFE8", "curve-style": "bezier", "opacity": 0.7 } },
    { selector: ".faded", style: { "opacity": 0.15 } },
  ], []);
  return (
    <div ref={containerRef} data-testid={testid} className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">{title}</p>
        <CyToolbar getCy={() => cyRef.current} containerRef={containerRef} basename={basename} graph={graph} title={title} layout={layout} onLayoutChange={setLayout} onResetLayout={() => { const cy = cyRef.current; if (cy) cy.layout({ name: layout, animate: false, fit: true, padding: 30 }).run(); }} testidPrefix={testid} />
      </div>
      <div className="h-[520px] w-full rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF]">
        <CytoscapeComponent key={testid + "-" + elements.length} cy={(cy) => { cyRef.current = cy; }} elements={elements} layout={{ name: layout, animate: false, fit: true, padding: 30 }} stylesheet={stylesheet} style={{ width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
