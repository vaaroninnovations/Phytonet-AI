// GO Enrichment ShinyGO-style panel.
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Layers } from "lucide-react";
import CytoscapeComponent from "react-cytoscapejs";
import "@/lib/cytoscapeSetup";
import { goEnrich } from "@/lib/api";
import { HelpTip } from "@/components/network/HelpTip";
import { TableToolbar } from "@/components/network/TableToolbar";
import { useAppliedStyle, useElementColor } from "@/context/ChartStyleContext";
import ColorPopover from "@/components/ColorPopover";

// Fired by chart elements on right-click; wired at the panel level so the popover
// lives above all SVGs regardless of overflow / clip constraints.
const openColorMenu = (setPopover) => (id, currentColor, label) => (e) => {
  e.preventDefault();
  e.stopPropagation();
  setPopover({ x: e.clientX, y: e.clientY, id, color: currentColor, label });
};
import { FigureToolbar } from "@/components/network/FigureToolbar";
import { CyToolbar } from "@/components/network/CyToolbar";
import { DataTable } from "@/components/network/DataTable";
import { CORRECTION_METHODS } from "@/lib/enrichmentUtils";

const SOURCE_LABEL = { "GO:BP": "Biological Process", "GO:MF": "Molecular Function", "GO:CC": "Cellular Component" };
const VIZ_OPTIONS = [
  { key: "bar", label: "Bar Plot" },
  { key: "bubble", label: "Bubble Plot" },
  { key: "dot", label: "Dot Plot" },
  { key: "chord", label: "GO Chord Plot" },
  { key: "gtnetwork", label: "Gene-Term Network" },
  { key: "emap", label: "Enrichment Map" },
  { key: "circular", label: "Circular Chord Diagram" },
];
const SORT_KEYS = [
  { key: "p_value", label: "Adjusted P-value (FDR)" },
  { key: "raw_p", label: "P-value" },
  { key: "intersection_size", label: "Gene Count" },
  { key: "fold_enrichment", label: "Fold Enrichment" },
  { key: "gene_ratio", label: "Gene Ratio" },
];
const COLOR_KEYS = [
  { key: "p_value", label: "FDR / Adjusted P" },
  { key: "raw_p", label: "P-value" },
  { key: "intersection_size", label: "Gene Count" },
  { key: "fold_enrichment", label: "Fold Enrichment" },
];
const SIZE_KEYS = [
  { key: "intersection_size", label: "Gene Count" },
  { key: "gene_ratio", label: "Gene Ratio" },
  { key: "fold_enrichment", label: "Fold Enrichment" },
];

export function GOPanel({ genes, onComplete, onResultChange }) {
  const [loading, setLoading] = useState(false);
  const [rawResult, setRawResult] = useState(null);

  // Bubble raw g:Profiler terms up to parent (NetworkAnalysis → NetworkContext)
  // so downstream modules (AI Report) can consume GO enrichment.
  useEffect(() => {
    if (onResultChange) onResultChange(rawResult?.terms || []);
  }, [rawResult, onResultChange]);

  // Filter panel state
  const [categories, setCategories] = useState({ "GO:BP": true, "GO:MF": true, "GO:CC": true });
  const [topN, setTopN] = useState(10);
  const [customTopN, setCustomTopN] = useState(20);
  const [minGeneCount, setMinGeneCount] = useState(1);
  const [minGeneRatio, setMinGeneRatio] = useState(0);
  const [minFold, setMinFold] = useState(0);
  const [pCutoff, setPCutoff] = useState(0.05);
  const [correction, setCorrection] = useState("g_SCS");
  const [sortBy, setSortBy] = useState("p_value");
  const [colorBy, setColorBy] = useState("p_value");
  const [sizeBy, setSizeBy] = useState("intersection_size");
  const [viz, setViz] = useState({ bar: true, bubble: true, dot: true, chord: true, gtnetwork: true, emap: true, circular: false });

  useEffect(() => {
    if (genes?.length) refetch(correction, pCutoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refetch = async (method = correction, threshold = pCutoff) => {
    if (!genes?.length) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await goEnrich({
        genes,
        sources: ["GO:BP", "GO:MF", "GO:CC"],
        user_threshold: method === "none" ? 1.0 : Math.min(1, Math.max(0.001, threshold)),
        significance_method: method === "none" ? "g_SCS" : method,
      });
      if (res.error) toast.error(`g:Profiler: ${res.error}`);
      setRawResult(res);
      toast.success(`g:Profiler returned ${res.terms?.length || 0} GO terms`);
    } catch (e) {
      toast.error("GO enrichment failed");
    } finally { setLoading(false); }
  };

  // Re-fetch when correction changes (backend requery)
  useEffect(() => {
    if (rawResult) refetch(correction, pCutoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correction]);

  const filteredBySource = useMemo(() => {
    const g = { "GO:BP": [], "GO:MF": [], "GO:CC": [] };
    if (!rawResult?.terms) return g;
    for (const t of rawResult.terms) {
      if (!categories[t.source]) continue;
      if ((t.p_value ?? 1) > pCutoff) continue;
      if ((t.intersection_size || 0) < minGeneCount) continue;
      if ((t.gene_ratio || 0) < minGeneRatio) continue;
      if ((t.fold_enrichment || 0) < minFold) continue;
      // Backend returns adjusted-p as p_value; also expose raw_p (same for now)
      const enriched = { ...t, raw_p: t.p_value };
      if (!g[t.source]) g[t.source] = [];
      g[t.source].push(enriched);
    }
    const dir = sortBy === "intersection_size" || sortBy === "fold_enrichment" || sortBy === "gene_ratio" ? -1 : 1;
    for (const k of Object.keys(g)) {
      g[k].sort((a, b) => ((a[sortBy] ?? 0) - (b[sortBy] ?? 0)) * dir);
      const N = topN === "custom" ? customTopN : topN;
      g[k] = g[k].slice(0, N);
    }
    return g;
  }, [rawResult, categories, pCutoff, minGeneCount, minGeneRatio, minFold, sortBy, topN, customTopN]);

  const allDisplayed = useMemo(() => Object.values(filteredBySource).flat(), [filteredBySource]);

  const tableColumns = useMemo(() => [
    { key: "source", label: "Category", format: (v) => SOURCE_LABEL[v] || v },
    { key: "native", label: "Term ID", format: (v) => <a href={`https://amigo.geneontology.org/amigo/term/${v}`} target="_blank" rel="noreferrer" className="text-[#5139ED] underline decoration-dotted">{v}</a> },
    { key: "name", label: "Term Name" },
    { key: "p_value", label: "P-value", format: (v) => (v ?? 0).toExponential(2) },
    { key: "term_size", label: "Term Size" },
    { key: "intersection_size", label: "Gene Count" },
    { key: "gene_ratio", label: "Gene Ratio", format: (v) => (v ?? 0).toFixed(3) },
    { key: "fold_enrichment", label: "Fold Enrichment", format: (v) => (v ?? 0).toFixed(2) },
    { key: "overlap_genes", label: "Overlap Genes", sortable: false, format: (v) => (
        <span className="font-mono text-[10px]">{(v || []).slice(0, 6).join(", ")}{v?.length > 6 ? "…" : ""}</span>
      )
    },
  ], []);

  return (
    <div className="space-y-6">
      <FilterPanel {...{ categories, setCategories, topN, setTopN, customTopN, setCustomTopN, minGeneCount, setMinGeneCount, minGeneRatio, setMinGeneRatio, minFold, setMinFold, pCutoff, setPCutoff, correction, setCorrection, sortBy, setSortBy, colorBy, setColorBy, sizeBy, setSizeBy, viz, setViz, loading, onRefetch: () => refetch(correction, pCutoff), genes }} />

      {loading ? (
        <div data-testid="go-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Querying g:Profiler…
        </div>
      ) : (
        <>
          {["GO:BP", "GO:MF", "GO:CC"].filter((s) => categories[s]).map((src) => {
            const rows = filteredBySource[src] || [];
            if (rows.length === 0) return (
              <div key={src} className="rounded-3xl border border-[#E7E7F3] bg-white p-6 text-center text-xs text-[#64748B]">
                No {SOURCE_LABEL[src]} terms match the current filters.
              </div>
            );
            return (
              <div key={src} className="space-y-4">
                <div className="flex items-center gap-3">
                  <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                    <Layers className="mr-1 inline h-3.5 w-3.5" /> {SOURCE_LABEL[src]} · {rows.length} terms
                  </p>
                </div>
                {viz.bar && <GOChartCard testid={`go-${src.toLowerCase().replace(":","-")}-bar`} title={`Bar Plot · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_bar`} rows={rows} kind="bar" colorBy={colorBy} sizeBy={sizeBy} />}
                {viz.bubble && <GOChartCard testid={`go-${src.toLowerCase().replace(":","-")}-bubble`} title={`Bubble Plot · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_bubble`} rows={rows} kind="bubble" colorBy={colorBy} sizeBy={sizeBy} />}
                {viz.dot && <GOChartCard testid={`go-${src.toLowerCase().replace(":","-")}-dot`} title={`Dot Plot · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_dot`} rows={rows} kind="dot" colorBy={colorBy} sizeBy={sizeBy} />}
                {viz.chord && <GOChartCard testid={`go-${src.toLowerCase().replace(":","-")}-chord`} title={`GO Chord Plot · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_chord`} rows={rows.slice(0,10)} kind="chord" colorBy={colorBy} sizeBy={sizeBy} />}
                {viz.circular && <GOChartCard testid={`go-${src.toLowerCase().replace(":","-")}-circular`} title={`Circular Chord Diagram · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_circular`} rows={rows.slice(0,10)} kind="circular" colorBy={colorBy} sizeBy={sizeBy} />}
                {viz.gtnetwork && <GOCyCard testid={`go-${src.toLowerCase().replace(":","-")}-gtnetwork`} title={`Gene-Term Network · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_gene_term`} rows={rows} kind="gene-term" />}
                {viz.emap && <GOCyCard testid={`go-${src.toLowerCase().replace(":","-")}-emap`} title={`Enrichment Map · ${SOURCE_LABEL[src]}`} basename={`go_${src.replace(":","")}_emap`} rows={rows} kind="emap" />}

                <div data-testid={`go-${src.toLowerCase().replace(":","-")}-table-wrap`} className="rounded-3xl border border-[#E7E7F3] bg-white p-4 md:p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Table · {SOURCE_LABEL[src]}</p>
                    <TableToolbar rows={rows} columns={tableColumns.map(({ key, label }) => ({ key, label }))} basename={`go_${src.replace(":","")}_table`} testidPrefix={`go-${src.toLowerCase().replace(":","-")}-tbl`} />
                  </div>
                  <DataTable rows={rows.map((r, i) => ({ ...r, id: r.native + "-" + i }))} columns={tableColumns} testidPrefix={`go-${src.toLowerCase().replace(":","-")}-dt`} />
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="flex justify-end">
        <button data-testid="go-complete" onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]">
          Next — KEGG Pathway Enrichment <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ────────────────────── Filter panel ──────────────────────
function FilterPanel({
  categories, setCategories, topN, setTopN, customTopN, setCustomTopN,
  minGeneCount, setMinGeneCount, minGeneRatio, setMinGeneRatio,
  minFold, setMinFold, pCutoff, setPCutoff, correction, setCorrection,
  sortBy, setSortBy, colorBy, setColorBy, sizeBy, setSizeBy,
  viz, setViz, loading, onRefetch, genes,
}) {
  const lbl = "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]";
  const inp = "brand-focus rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-xs text-[#0B0B18]";
  const sel = "brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#0B0B18]";
  return (
    <div data-testid="go-controls" className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            <Layers className="mr-1 inline h-3.5 w-3.5" /> GO Enrichment · g:Profiler · H. sapiens · {genes?.length || 0} genes
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">ShinyGO-style filters</h2>
        </div>
        <button data-testid="go-run" onClick={onRefetch} disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
          {loading ? "Enriching…" : "Re-run"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className={lbl}>Categories<HelpTip text="Choose which GO ontologies to include: Biological Process (BP), Molecular Function (MF), Cellular Component (CC)." /></label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["GO:BP","GO:MF","GO:CC"].map((s) => (
              <label key={s} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs">
                <input data-testid={`go-cat-${s.toLowerCase().replace(":","-")}`} type="checkbox" checked={categories[s]} onChange={(e) => setCategories((c) => ({ ...c, [s]: e.target.checked }))} className="accent-[#5139ED]" />
                {SOURCE_LABEL[s]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>Top N<HelpTip text="Show only the top N terms per category ranked by the current Sort criterion." /></label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[10,20,30].map((n) => (
              <button key={n} data-testid={`go-topn-${n}`} onClick={() => setTopN(n)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${topN === n ? "bg-[#5139ED] text-white ring-[#5139ED]" : "bg-white text-[#0B0B18] ring-[#E7E7F3] hover:ring-[#5139ED]/40"}`}>
                Top {n}
              </button>
            ))}
            <button data-testid="go-topn-custom" onClick={() => setTopN("custom")}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${topN === "custom" ? "bg-[#5139ED] text-white ring-[#5139ED]" : "bg-white text-[#0B0B18] ring-[#E7E7F3] hover:ring-[#5139ED]/40"}`}>
              Custom
            </button>
            {topN === "custom" && (
              <input data-testid="go-topn-input" type="number" min={1} max={500} value={customTopN} onChange={(e) => setCustomTopN(Number(e.target.value))} className={`${inp} w-16 text-right`} />
            )}
          </div>
        </div>
        <div>
          <label className={lbl}>Min Gene Count<HelpTip text="Minimum number of input genes overlapping a term (k). Filters out low-support terms." /></label>
          <input data-testid="go-min-gc" type="range" min={0} max={20} value={minGeneCount} onChange={(e) => setMinGeneCount(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {minGeneCount}</div>
        </div>
        <div>
          <label className={lbl}>Min Gene Ratio<HelpTip text="Gene Ratio = k / n (overlap / input). Filters out terms with low input coverage." /></label>
          <input data-testid="go-min-gr" type="range" min={0} max={1} step={0.05} value={minGeneRatio} onChange={(e) => setMinGeneRatio(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {minGeneRatio.toFixed(2)}</div>
        </div>
        <div>
          <label className={lbl}>Min Fold Enrichment<HelpTip text="(k/n) / (K/N). Values >1 indicate over-representation vs. background." /></label>
          <input data-testid="go-min-fe" type="range" min={0} max={50} step={0.5} value={minFold} onChange={(e) => setMinFold(Number(e.target.value))} className="mt-2 w-full accent-[#5139ED]" />
          <div className="text-[10px] font-mono text-[#64748B]">≥ {minFold.toFixed(1)}×</div>
        </div>
        <div>
          <label className={lbl}>P-value / FDR cutoff<HelpTip text="Adjusted P-value threshold. Terms above this cutoff are hidden." /></label>
          <input data-testid="go-pcut" type="number" min={0} max={1} step={0.001} value={pCutoff} onChange={(e) => setPCutoff(Number(e.target.value))} className={`${inp} mt-2 w-full`} />
        </div>
        <div>
          <label className={lbl}>Multiple-testing correction<HelpTip text="g:SCS is g:Profiler's default (accounts for hierarchical GO structure). BH-FDR = Benjamini–Hochberg. Bonferroni is the most conservative. None uses raw p-values." /></label>
          <select data-testid="go-correction" value={correction} onChange={(e) => setCorrection(e.target.value)} className={`${sel} mt-2 w-full`}>
            {CORRECTION_METHODS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Sort by<HelpTip text="Primary ranking for terms and 'Top N' selection." /></label>
          <select data-testid="go-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`${sel} mt-2 w-full`}>
            {SORT_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Color by<HelpTip text="Which metric drives the colour scale of dots / bubbles / bars." /></label>
          <select data-testid="go-color" value={colorBy} onChange={(e) => setColorBy(e.target.value)} className={`${sel} mt-2 w-full`}>
            {COLOR_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Bubble size by<HelpTip text="Which metric drives the size scale of bubble / dot plots." /></label>
          <select data-testid="go-size" value={sizeBy} onChange={(e) => setSizeBy(e.target.value)} className={`${sel} mt-2 w-full`}>
            {SIZE_KEYS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5 border-t border-[#F1F1FA] pt-4">
        <p className={lbl}>Visualisations<HelpTip text="Tick which figures to generate. Only selected ones will be rendered." /></p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIZ_OPTIONS.map((v) => (
            <label key={v.key} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-xs">
              <input data-testid={`go-viz-${v.key}`} type="checkbox" checked={!!viz[v.key]} onChange={(e) => setViz((s) => ({ ...s, [v.key]: e.target.checked }))} className="accent-[#5139ED]" />
              {v.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────── SVG-based chart cards (bar/bubble/dot/chord/circular) ──────────────────────
function GOChartCard({ testid, title, basename, rows, kind, colorBy, sizeBy }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [popover, setPopover] = useState(null);   // {x,y,id,color,label}
  const el = useElementColor("go");
  const handleMenu = openColorMenu(setPopover);
  const getSvg = () => svgRef.current;
  return (
    <div ref={containerRef} data-testid={testid} className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">{title}</p>
        <FigureToolbar getSvg={getSvg} containerRef={containerRef} basename={basename} title={title} testidPrefix={testid} />
      </div>
      {kind === "bar"      && <BarChart    svgRef={svgRef} rows={rows} colorBy={colorBy} title={title} onElementMenu={handleMenu} />}
      {kind === "bubble"   && <BubbleChart svgRef={svgRef} rows={rows} colorBy={colorBy} sizeBy={sizeBy} title={title} onElementMenu={handleMenu} />}
      {kind === "dot"      && <DotChart    svgRef={svgRef} rows={rows} colorBy={colorBy} sizeBy={sizeBy} title={title} onElementMenu={handleMenu} />}
      {kind === "chord"    && <ChordChart  svgRef={svgRef} rows={rows} title={title} circular={false} />}
      {kind === "circular" && <ChordChart  svgRef={svgRef} rows={rows} title={title} circular={true} />}
      {popover && (
        <ColorPopover
          x={popover.x} y={popover.y}
          color={popover.color}
          elementLabel={popover.label}
          onChange={(c) => el.set(popover.id, c)}
          onReset={() => { el.clear(popover.id); setPopover(null); }}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

const getMetric = (r, key) => {
  if (key === "raw_p") return -Math.log10(Math.max(r.raw_p ?? r.p_value ?? 1, 1e-30));
  if (key === "p_value") return -Math.log10(Math.max(r.p_value ?? 1, 1e-30));
  return r[key] ?? 0;
};
const colourFor = (v, vmax) => {
  const t = vmax > 0 ? v / vmax : 0;
  return `hsl(${260 - t * 40}, 70%, ${55 - t * 20}%)`;
};

function BarChart({ svgRef, rows, colorBy, onElementMenu }) {
  const s = useAppliedStyle("go");
  const el = useElementColor("go");
  const w = 780, rowH = 26, h = Math.max(160, rows.length * rowH + 60);
  const labelW = 300;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  const barMax = w - labelW - 60;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-1"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f) => (
        <line key={`g-${f}`} x1={labelW + f * barMax} x2={labelW + f * barMax} y1={20} y2={h - 40} stroke={s.grid} strokeWidth="0.5" />
      ))}
      {rows.map((t, i) => {
        const y = 30 + i * rowH;
        const v = getMetric(t, colorBy);
        const bw = (v / maxV) * barMax;
        const label = t.name.length > 40 ? t.name.slice(0, 38) + "…" : t.name;
        const paletteColor = s.palette[i % s.palette.length];
        const barColor = el.get(t.native) || paletteColor;
        return (
          <g key={t.native}>
            <text x={labelW - 8} y={y + rowH / 2 + 3} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>{label}</text>
            <rect
              data-testid={`go-bar-${t.native}`}
              x={labelW} y={y + 4} width={bw} height={rowH - 8} rx={3}
              fill={barColor} fillOpacity="0.85"
              style={{ cursor: "context-menu" }}
              onContextMenu={onElementMenu?.(t.native, barColor, t.name)}
            >
              <title>{`${t.name} — right-click to recolour`}</title>
            </rect>
            <text x={labelW + bw + 6} y={y + rowH / 2 + 3} fontSize={Math.max(9, s.labelSize - 2)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>{v.toFixed(2)}</text>
          </g>
        );
      })}
      <text x={labelW + barMax / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>{colorBy === "p_value" ? "−log10(P)" : colorBy}</text>
    </svg>
  );
}

function BubbleChart({ svgRef, rows, colorBy, sizeBy, onElementMenu }) {
  const s = useAppliedStyle("go");
  const el = useElementColor("go");
  const w = 780, rowH = 32, h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300, plotL = labelW + 20, plotW = w - plotL - 60;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  const maxS = Math.max(1, ...rows.map((r) => r[sizeBy] ?? 0));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-1"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={plotL + f * plotW} x2={plotL + f * plotW} y1={20} y2={h - 40} stroke={s.grid} strokeWidth="0.5" />
      ))}
      {rows.map((t, i) => {
        const y = 30 + i * rowH;
        const v = getMetric(t, colorBy);
        const x = plotL + (v / maxV) * plotW;
        const rad = (4 + ((t[sizeBy] || 0) / maxS) * 18) * s.nodeSize;
        const label = t.name.length > 40 ? t.name.slice(0, 38) + "…" : t.name;
        const c = el.get(t.native) || s.palette[i % s.palette.length];
        return (
          <g key={t.native}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>{label}</text>
            <circle
              data-testid={`go-bubble-${t.native}`}
              cx={x} cy={y} r={rad}
              fill={c} fillOpacity="0.6" stroke={c} strokeWidth="1.5"
              style={{ cursor: "context-menu" }}
              onContextMenu={onElementMenu?.(t.native, c, t.name)}
            >
              <title>{`${t.name} — right-click to recolour`}</title>
            </circle>
            <text x={x + rad + 4} y={y + 3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>{t[sizeBy]?.toFixed?.(2) ?? t[sizeBy]}</text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>{colorBy} · size ∝ {sizeBy}</text>
    </svg>
  );
}

function DotChart({ svgRef, rows, colorBy, sizeBy, onElementMenu }) {
  const s = useAppliedStyle("go");
  const el = useElementColor("go");
  const w = 780, rowH = 26, h = Math.max(160, rows.length * rowH + 60);
  const labelW = 300, plotL = labelW + 20, plotW = w - plotL - 60;
  const maxV = Math.max(1, ...rows.map((r) => getMetric(r, colorBy)));
  const maxS = Math.max(1, ...rows.map((r) => r[sizeBy] ?? 0));
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-1"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {rows.map((t, i) => {
        const y = 30 + i * rowH;
        const v = getMetric(t, colorBy);
        const x = plotL + (v / maxV) * plotW;
        const rad = (3 + ((t[sizeBy] || 0) / maxS) * 10) * s.nodeSize;
        const label = t.name.length > 40 ? t.name.slice(0, 38) + "…" : t.name;
        const c = el.get(t.native) || s.palette[i % s.palette.length];
        return (
          <g key={t.native}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>{label}</text>
            <circle
              data-testid={`go-dot-${t.native}`}
              cx={x} cy={y} r={rad}
              fill={c}
              style={{ cursor: "context-menu" }}
              onContextMenu={onElementMenu?.(t.native, c, t.name)}
            >
              <title>{`${t.name} — right-click to recolour`}</title>
            </circle>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>{colorBy} · size ∝ {sizeBy}</text>
    </svg>
  );
}

function ChordChart({ svgRef, rows, circular }) {
  const s = useAppliedStyle("go");
  const w = 780, h = 480;
  const cx = w / 2, cy = h / 2 + 20;
  const rIn = 150, rOut = 180;
  const genes = useMemo(() => {
    const set = new Set(); for (const t of rows) for (const g of t.overlap_genes || []) set.add(g); return [...set];
  }, [rows]);
  if (rows.length === 0 || genes.length === 0) {
    return <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">Not enough overlap data.</div>;
  }
  const total = rows.length + genes.length;
  const angleFor = (i) => (Math.PI * 2 * i) / total - Math.PI / 2;
  const geneAngles = {}; genes.forEach((g, i) => (geneAngles[g] = angleFor(rows.length + i)));
  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const palette = s.palette;
  const strokeW = 4 * s.edgeThickness;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-1"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none", opacity: s.opacity }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {rows.map((t, i) => {
        const a = angleFor(i); const [x1,y1]=point(rIn,a); const [x2,y2]=point(rOut,a); const [lx,ly]=point(rOut+10,a);
        const c = palette[i % palette.length]; const label = t.name.length > 22 ? t.name.slice(0,20)+"…" : t.name;
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return <g key={t.native}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={strokeW} strokeLinecap="round" /><text x={lx} y={ly} fontSize={s.labelSize} fill={c} fontWeight="700" fontFamily={s.fontFamily} textAnchor={anchor}>{label}</text></g>;
      })}
      {genes.map((g,i) => {
        const a = geneAngles[g]; const [x1,y1]=point(rIn,a); const [x2,y2]=point(rOut,a); const [lx,ly]=point(rOut+10,a);
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return <g key={g}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={s.edge} strokeWidth={strokeW * 0.75} strokeLinecap="round" /><text x={lx} y={ly+3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} fontFamily={s.fontFamily} textAnchor={anchor}>{g}</text></g>;
      })}
      {rows.map((t, i) => {
        const c = palette[i % palette.length]; const [tx,ty]=point(rIn, angleFor(i));
        return (t.overlap_genes||[]).map((g) => {
          if (geneAngles[g] == null) return null;
          const [gx,gy]=point(rIn, geneAngles[g]);
          const d = circular ? `M ${tx} ${ty} A ${rIn} ${rIn} 0 0 1 ${gx} ${gy}` : `M ${tx} ${ty} Q ${cx} ${cy} ${gx} ${gy}`;
          return <path key={`${t.native}-${g}`} d={d} stroke={c} strokeWidth={0.9 * s.edgeThickness} strokeOpacity="0.5" fill="none" />;
        });
      })}
    </svg>
  );
}

// ────────────────────── Cytoscape-based networks (Gene-Term & Enrichment Map) ──────────────────────
function GOCyCard({ testid, title, basename, rows, kind }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [layout, setLayout] = useState("fcose");
  const elements = useMemo(() => cyElementsForGO(rows, kind), [rows, kind]);
  const graph = useMemo(() => ({
    nodes: elements.filter((e) => e.group === "nodes").map((n) => ({ id: n.data.id, ...n.data })),
    edges: elements.filter((e) => e.group === "edges").map((e) => ({ source: e.data.source, target: e.data.target, score: e.data.weight || 1 })),
  }), [elements]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    try { cy.layout({ name: layout, animate: false, randomize: true, fit: true, padding: 30, nodeDimensionsIncludeLabels: true, quality: "proof" }).run(); } catch (e) {}
  }, [layout, elements]);

  const stylesheet = useMemo(() => [
    { selector: "node[type = 'term']", style: { "background-color": "#5139ED", "label": "data(label)", "font-size": 9, "color": "#0B0B18", "text-wrap": "wrap", "text-max-width": 90, "width": "mapData(degree, 1, 30, 24, 56)", "height": "mapData(degree, 1, 30, 24, 56)", "shape": "round-rectangle" } },
    { selector: "node[type = 'gene']", style: { "background-color": "#8139ED", "label": "data(label)", "font-size": 8, "color": "#0B0B18", "width": 18, "height": 18, "shape": "ellipse" } },
    { selector: "edge", style: { "width": 1, "line-color": "#B2AFE8", "curve-style": "bezier", "opacity": 0.7 } },
    { selector: ".faded", style: { "opacity": 0.15 } },
    { selector: ":selected", style: { "border-color": "#F97316", "border-width": 3 } },
  ], []);

  return (
    <div ref={containerRef} data-testid={testid} className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">{title}</p>
        <CyToolbar
          getCy={() => cyRef.current}
          containerRef={containerRef}
          basename={basename}
          graph={graph}
          title={title}
          layout={layout}
          onLayoutChange={setLayout}
          onResetLayout={() => { const cy = cyRef.current; if (cy) cy.layout({ name: layout, animate: false, fit: true, padding: 30 }).run(); }}
          testidPrefix={testid}
        />
      </div>
      <div className="h-[520px] w-full rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF]">
        <CytoscapeComponent
          key={testid + "-" + elements.length}
          cy={(cy) => { cyRef.current = cy; }}
          elements={elements}
          layout={{ name: layout, animate: false, fit: true, padding: 30 }}
          stylesheet={stylesheet}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

function cyElementsForGO(rows, kind) {
  if (kind === "gene-term") {
    const els = []; const geneSet = new Set(); const deg = new Map();
    for (const t of rows) {
      const tid = "T::" + t.native;
      const dCount = (t.overlap_genes || []).length;
      deg.set(tid, dCount);
      els.push({ group: "nodes", data: { id: tid, label: t.name?.slice(0, 40) || t.native, type: "term", degree: dCount } });
      for (const g of t.overlap_genes || []) {
        const gid = "G::" + g;
        if (!geneSet.has(gid)) { geneSet.add(gid); els.push({ group: "nodes", data: { id: gid, label: g, type: "gene", degree: 1 } }); }
        els.push({ group: "edges", data: { source: gid, target: tid, weight: 1 } });
      }
    }
    return els;
  }
  // Enrichment map: nodes = terms, edges = term-term (Jaccard>0.25)
  const els = [];
  const termGenes = rows.map((r) => new Set(r.overlap_genes || []));
  rows.forEach((t, i) => {
    els.push({ group: "nodes", data: { id: "T::" + t.native, label: t.name?.slice(0, 40) || t.native, type: "term", degree: 1 + (t.intersection_size || 0) } });
  });
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = termGenes[i], b = termGenes[j];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0; for (const g of a) if (b.has(g)) inter++;
      const uni = a.size + b.size - inter;
      const jac = uni > 0 ? inter / uni : 0;
      if (jac >= 0.25) {
        els.push({ group: "edges", data: { source: "T::" + rows[i].native, target: "T::" + rows[j].native, weight: jac } });
      }
    }
  }
  return els;
}
