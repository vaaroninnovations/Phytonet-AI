// EnrichmentCard — pathway enrichment (KEGG / GO) with list + bubble +
// lollipop + sankey visualisations.
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { downloadCsv, ChartDownloadBar } from "./_helpers";

export function EnrichmentCard({ data, message }) {
  const genesCount = (data?.genes || []).length;
  const keggAll = data?.kegg || [];
  const goAll   = data?.go   || [];
  const [tab, setTab] = useState("kegg");
  const [topN, setTopN] = useState(20);
  const [maxAdjP, setMaxAdjP] = useState(0.05);

  const rows = tab === "kegg" ? keggAll : goAll;
  const [chartView, setChartView] = useState("list");

  const norm = useMemo(() => rows.map((r) => {
    const p       = r.p_value ?? r.pvalue ?? null;
    const adj     = r.adjusted_p_value ?? r.adj_p_value ?? r.p_adj ?? null;
    const isGo    = tab !== "kegg";
    return {
      term:           r.term_name || r.name || r.term || "—",
      source:         r.source || (tab === "kegg" ? "KEGG" : "GO"),
      p_value:        p,
      adj_p_value:    adj ?? (isGo ? p : null),
      combined_score: r.combined_score ?? r.fold_enrichment ?? null,
      gene_count:     r.gene_count ?? r.intersection_size ??
                      (r.overlap_genes?.length ?? null),
      overlap_genes:  r.overlap_genes || r.intersections || [],
    };
  }), [rows, tab]);

  const filtered = useMemo(() => {
    const passing = norm.filter((r) => (r.adj_p_value ?? 1) <= maxAdjP);
    const sorted = passing.slice().sort((a, b) => {
      if (a.combined_score != null && b.combined_score != null)
        return (b.combined_score || 0) - (a.combined_score || 0);
      return (a.adj_p_value ?? 1) - (b.adj_p_value ?? 1);
    });
    return sorted.slice(0, topN);
  }, [norm, topN, maxAdjP]);

  const download = () => {
    const cols = [
      { key: "term", label: "Pathway" },
      { key: "source", label: "Source" },
      { key: "p_value", label: "P-value" },
      { key: "adj_p_value", label: "Adj. P-value" },
      { key: "combined_score", label: "Combined Score" },
      { key: "gene_count", label: "Gene Count" },
      { key: "overlap_genes", label: "Overlapping Genes",
        render: (r) => (r.overlap_genes || []).join(";") },
    ];
    downloadCsv(filtered, cols, `${tab === "kegg" ? "kegg" : "go"}_pathways.csv`);
  };

  const maxLog = Math.max(1, ...filtered.map(
    (r) => -Math.log10(Math.max(r.p_value || 1, 1e-30))));

  return (
    <div data-testid="enrichment-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="text-[15px] font-semibold text-slate-100">Pathway Enrichment</div>
        <span className="rounded-full bg-[#5139ED]/20 border border-[#5139ED]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#a48bff]">
          {genesCount} genes
        </span>
        <span className="text-[11px] text-slate-500">
          · {keggAll.length} KEGG · {goAll.length} GO/Reactome
        </span>
      </div>
      <div className="text-[11.5px] text-slate-400 mb-3">{message}</div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          <button data-testid="enrichment-tab-kegg"
                  onClick={() => setTab("kegg")}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold ${
                    tab === "kegg" ? "bg-[#5139ED] text-white" : "text-slate-300 hover:text-white"
                  }`}>KEGG ({keggAll.length})</button>
          <button data-testid="enrichment-tab-go"
                  onClick={() => setTab("go")}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold ${
                    tab === "go" ? "bg-[#5139ED] text-white" : "text-slate-300 hover:text-white"
                  }`}>GO / Reactome ({goAll.length})</button>
        </div>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          Top N
          <input type="number" data-testid="enrichment-topn"
                 value={topN} min={1} max={200}
                 onChange={(e) => setTopN(Math.max(1, Math.min(200, +e.target.value || 20)))}
                 className="w-14 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[11px] text-slate-100" />
        </label>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          Max adj. p
          <input type="number" step="0.001" data-testid="enrichment-maxp"
                 value={maxAdjP} min={0} max={1}
                 onChange={(e) => setMaxAdjP(Math.max(0, Math.min(1, +e.target.value || 0.05)))}
                 className="w-16 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[11px] text-slate-100" />
        </label>
        <button data-testid="enrichment-download"
                onClick={download}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
          <FileText size={11} /> CSV
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5 mb-3">
        {["list", "bubble", "lollipop", "sankey"].map((v) => (
          <button key={v}
                  data-testid={`enrichment-view-${v}`}
                  onClick={() => setChartView(v)}
                  className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold capitalize ${
                    chartView === v ? "bg-[#5139ED] text-white" : "text-slate-300 hover:text-white"
                  }`}>{v}</button>
        ))}
      </div>

      {chartView !== "list" && (
        <div data-testid={`enrichment-chart-${chartView}`}
             className="rounded-lg border border-white/5 bg-black/20 p-3 mb-3">
          <ChartDownloadBar
            svgSelector={`[data-testid=enrichment-${chartView}-svg]`}
            filenameBase={`enrichment_${tab}_${chartView}`} />
          {chartView === "bubble"   && <EnrichBubble   rows={filtered} />}
          {chartView === "lollipop" && <EnrichLollipop rows={filtered} />}
          {chartView === "sankey"   && <EnrichSankey   rows={filtered.slice(0, 10)} />}
        </div>
      )}

      {chartView === "list" && (
      <div data-testid="enrichment-rows"
           className="max-h-[420px] overflow-y-auto rounded-lg border border-white/5 bg-black/20 divide-y divide-white/5">
        {filtered.length === 0 && (
          <div className="p-4 text-[12px] italic text-slate-500 text-center">
            No enriched pathways below adj. p ≤ {maxAdjP}.
            {norm.length > 0 && ` Try raising Max adj. p (current tab has ${norm.length} raw hits).`}
          </div>
        )}
        {filtered.map((r, i) => {
          const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
          const barPct = Math.max(4, Math.round(100 * logp / maxLog));
          return (
            <div key={i}
                 className="px-3 py-2 flex items-center gap-3 text-[12.5px] hover:bg-white/[0.02]">
              <div className="flex-1 min-w-0">
                <div className="text-slate-100 truncate" title={r.term}>
                  <span className="font-semibold">{i + 1}.</span> {r.term}
                </div>
                <div className="mt-0.5 text-[10.5px] text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>adj p = <span className="font-mono text-emerald-300">
                    {(r.adj_p_value ?? 0).toExponential(2)}
                  </span></span>
                  {r.combined_score != null && (
                    <span>· score <span className="font-mono">{(+r.combined_score).toFixed(1)}</span></span>
                  )}
                  {r.gene_count != null && (
                    <span>· {r.gene_count} genes</span>
                  )}
                  <span>· {r.source}</span>
                </div>
                {(r.overlap_genes || []).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.overlap_genes.slice(0, 8).map((g) => (
                      <span key={g}
                            className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-200">
                        {g}
                      </span>
                    ))}
                    {r.overlap_genes.length > 8 && (
                      <span className="text-[10px] text-slate-500">
                        +{r.overlap_genes.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="w-24 flex-shrink-0">
                <div className="h-2 rounded bg-white/5 overflow-hidden">
                  <div className="h-full rounded bg-gradient-to-r from-[#5139ED] to-[#8139ED]"
                       style={{ width: `${barPct}%` }} />
                </div>
                <div className="mt-0.5 text-[9.5px] text-slate-500 text-right">
                  −log₁₀p = {logp.toFixed(1)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}


// Per-source styling for the enrichment charts — different colour and
// marker shape for KEGG vs GO groups (BP / MF / CC) so a manuscript
// figure legend can immediately identify each family.
function styleForSource(source) {
  const s = String(source || "").toLowerCase();
  if (s.includes("kegg")) return { color: "#5139ED", fill: "#a48bff", shape: "circle" };
  if (s.includes("bp") || s.includes("biological_process")) return { color: "#2BB673", fill: "#6EE7B7", shape: "square" };
  if (s.includes("mf") || s.includes("molecular_function")) return { color: "#F59E0B", fill: "#FCD34D", shape: "triangle" };
  if (s.includes("cc") || s.includes("cellular_component")) return { color: "#E11D48", fill: "#FCA5A5", shape: "diamond" };
  return { color: "#8139ED", fill: "#c4b5fd", shape: "circle" };
}

// Draw a shaped marker centred on (cx, cy). Kept simple so it also survives
// the SVG → publication PNG rewrite.
function ShapeMarker({ shape, cx, cy, size, fill, stroke }) {
  const s = size;
  if (shape === "square") {
    return <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2}
                 fill={fill} fillOpacity="0.55" stroke={stroke} strokeWidth="1" />;
  }
  if (shape === "triangle") {
    const path = `M ${cx} ${cy - s} L ${cx + s} ${cy + s} L ${cx - s} ${cy + s} Z`;
    return <path d={path} fill={fill} fillOpacity="0.55" stroke={stroke} strokeWidth="1" />;
  }
  if (shape === "diamond") {
    const path = `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`;
    return <path d={path} fill={fill} fillOpacity="0.55" stroke={stroke} strokeWidth="1" />;
  }
  return <circle cx={cx} cy={cy} r={s} fill={fill} fillOpacity="0.55"
                 stroke={stroke} strokeWidth="1" />;
}

function EnrichBubble({ rows }) {
  if (!rows.length)
    return <div className="p-4 text-center text-[12px] italic text-slate-500">
             No data to plot.</div>;
  const w = 780;
  const rowH = 26;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxLog = Math.max(1, ...rows.map((r) =>
    -Math.log10(Math.max(r.p_value || 1, 1e-30))));
  const maxCount = Math.max(1, ...rows.map((r) => r.gene_count || 0));
  // Deduplicated source list for the legend row.
  const legendSources = Array.from(new Set(rows.map((r) => r.source)));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: "Inter, system-ui" }}
         data-testid="enrichment-bubble-svg">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={plotL + f * plotW} x2={plotL + f * plotW} y1={20} y2={h - 40}
              stroke="#ffffff10" strokeWidth="0.5" />
      ))}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
        const x = plotL + (logp / maxLog) * plotW;
        const rB = 4 + ((r.gene_count || 0) / maxCount) * 14;
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        const st = styleForSource(r.source);
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#e2e8f0">
              {label}
            </text>
            <ShapeMarker shape={st.shape} cx={x} cy={y} size={rB}
                         fill={st.fill} stroke={st.color} />
            <text x={x + rB + 4} y={y + 3} fontSize="9" fill="#94a3b8">
              {r.gene_count ?? ""}
            </text>
          </g>
        );
      })}
      {/* Legend row */}
      <g transform={`translate(${plotL}, ${h - 26})`}>
        {legendSources.map((src, i) => {
          const st = styleForSource(src);
          const gx = i * 128;
          return (
            <g key={src} transform={`translate(${gx}, 0)`}>
              <ShapeMarker shape={st.shape} cx={6} cy={0} size={5}
                           fill={st.fill} stroke={st.color} />
              <text x={16} y={3} fontSize="10" fill="#94a3b8">{src}</text>
            </g>
          );
        })}
      </g>
      <text x={plotL + plotW / 2} y={h - 4} textAnchor="middle" fontSize="10"
            fill="#94a3b8">−log₁₀(P-value) · marker size = overlap gene count</text>
    </svg>
  );
}

function EnrichLollipop({ rows }) {
  if (!rows.length)
    return <div className="p-4 text-center text-[12px] italic text-slate-500">
             No data to plot.</div>;
  const w = 780;
  const rowH = 26;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxScore = Math.max(1, ...rows.map(
    (r) => r.combined_score || 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: "Inter, system-ui" }}
         data-testid="enrichment-lollipop-svg">
      <line x1={plotL} x2={plotL} y1={20} y2={h - 40}
            stroke="#ffffff20" strokeWidth="1" />
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const bw = ((r.combined_score || 0) / maxScore) * plotW;
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        const st = styleForSource(r.source);
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#e2e8f0">
              {label}
            </text>
            <line x1={plotL} y1={y} x2={plotL + bw} y2={y}
                  stroke={st.color} strokeOpacity="0.7" strokeWidth="2" />
            <ShapeMarker shape={st.shape} cx={plotL + bw} cy={y} size={5}
                         fill={st.fill} stroke={st.color} />
            <text x={plotL + bw + 10} y={y + 3} fontSize="10" fill="#94a3b8">
              {(r.combined_score || 0).toFixed(1)}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize="10"
            fill="#94a3b8">Combined score (Enrichr) or fold-enrichment (g:Profiler)</text>
    </svg>
  );
}

function EnrichSankey({ rows }) {
  const w = 900;
  const geneCounts = new Map();
  for (const r of rows) for (const g of (r.overlap_genes || []))
    geneCounts.set(g, (geneCounts.get(g) || 0) + 1);
  const genes = [...geneCounts.entries()]
                  .sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g]) => g);
  const geneSet = new Set(genes);
  const filtered = rows
    .map((r) => ({ ...r, overlap_genes: (r.overlap_genes || []).filter((g) => geneSet.has(g)) }))
    .filter((r) => r.overlap_genes.length > 0);

  if (!filtered.length || !genes.length)
    return <div className="p-4 text-center text-[12px] italic text-slate-500">
             Not enough overlap data to render a Sankey diagram.</div>;

  const h = Math.max(360, Math.max(genes.length, filtered.length) * 22 + 60);
  const pad = 16;
  const geneStep = (h - 2 * pad) / Math.max(1, genes.length);
  const pathStep = (h - 2 * pad) / Math.max(1, filtered.length);
  const geneY = (i) => pad + geneStep * (i + 0.5);
  const pathY = (i) => pad + pathStep * (i + 0.5);
  const palette = ["#5139ED", "#8139ED", "#395AED", "#ED39A6",
                   "#39C1ED", "#F5B301", "#10B981", "#EF4444"];
  const geneW = 12, pathW = 12;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}
         style={{ fontFamily: "Inter, system-ui" }}
         data-testid="enrichment-sankey-svg">
      {genes.map((g, i) => (
        <g key={g}>
          <rect x={140} y={geneY(i) - 6} width={geneW} height={12} rx={2} fill="#a48bff" />
          <text x={135} y={geneY(i) + 3} fontSize="10" fill="#e2e8f0"
                textAnchor="end">{g}</text>
        </g>
      ))}
      {filtered.map((r, i) => {
        const color = palette[i % palette.length];
        const label = r.term.length > 34 ? r.term.slice(0, 32) + "…" : r.term;
        return (
          <g key={i}>
            <rect x={w - 140 - pathW} y={pathY(i) - 6} width={pathW} height={12}
                  rx={2} fill={color} />
            <text x={w - 140 + 6} y={pathY(i) + 3} fontSize="10"
                  fill="#e2e8f0">{label}</text>
          </g>
        );
      })}
      {filtered.map((r, pi) => {
        const color = palette[pi % palette.length];
        return (r.overlap_genes || []).map((g) => {
          const gi = genes.indexOf(g);
          if (gi < 0) return null;
          const x1 = 140 + geneW, y1 = geneY(gi);
          const x2 = w - 140 - pathW, y2 = pathY(pi);
          const cx = x1 + (x2 - x1) * 0.5;
          const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
          return <path key={`${g}-${pi}`} d={d} stroke={color}
                       strokeWidth="1.5" strokeOpacity="0.4" fill="none" />;
        });
      })}
    </svg>
  );
}
