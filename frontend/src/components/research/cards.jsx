// Research Workspace — Result & plan cards (chat + viz panel)
// Includes: PlanCard (with retry-failed-step), TableCard, ResultCard, NetworkCard,
// and CSV / Excel / JSON download helpers.
import cytoscape from "cytoscape";
import { useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Sparkles, Loader2, CheckCircle2, Circle, XCircle, RotateCcw,
  FileSpreadsheet, FileText, FileJson,
} from "lucide-react";

// ─── PlanCard ─────────────────────────────────────────────────────
export function PlanCard({ plan, title, onExecute, executing, executed,
                           onRetryStep, retryingStepId }) {
  return (
    <div data-testid="plan-card"
         className="mt-2 rounded-2xl border border-[#5139ED]/25 bg-gradient-to-br from-[#5139ED]/10 to-[#8139ED]/5 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">Execution Plan</div>
          <div className="mt-1 text-[15px] font-semibold text-slate-100">{title}</div>
        </div>
        {!executed && (
          <button
            data-testid="plan-execute-btn"
            onClick={onExecute}
            disabled={executing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5139ED] px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#4128d4] disabled:opacity-60"
          >
            {executing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {executing ? "Running…" : "Run plan"}
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-1.5">
        {plan.map((s, i) => {
          const state = s.status || "pending";
          const Icon = state === "done" ? CheckCircle2
                     : state === "error" ? XCircle
                     : state === "running" ? Loader2 : Circle;
          const color = state === "done" ? "text-emerald-400"
                      : state === "error" ? "text-rose-400"
                      : state === "running" ? "text-amber-300"
                      : "text-slate-500";
          const progress = s.progress;
          const isRetrying = retryingStepId && retryingStepId === s.id;
          return (
            <li key={s.id || i} data-testid={`plan-step-${i}`}
                className="flex items-start gap-2 text-[13px]">
              <Icon size={14} className={`${color} mt-0.5 flex-shrink-0 ${state === "running" ? "animate-spin" : ""}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-200">{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.tool}</span>
                  {state === "error" && onRetryStep && (
                    <button
                      data-testid={`plan-step-${i}-retry`}
                      onClick={() => onRetryStep(s.id)}
                      disabled={isRetrying}
                      className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-60">
                      {isRetrying ? <Loader2 size={10} className="animate-spin" />
                                  : <RotateCcw size={10} />}
                      {isRetrying ? "Retrying…" : "Retry step"}
                    </button>
                  )}
                </div>
                {state === "running" && progress?.detail && (
                  <div data-testid={`plan-step-${i}-progress`}
                       className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-amber-200/90">
                    <span className="inline-block h-1 w-1 rounded-full bg-amber-300 animate-pulse" />
                    {progress.detail}
                  </div>
                )}
                {state === "done" && progress?.detail && (
                  <div className="mt-0.5 text-[11.5px] text-emerald-400/80">
                    {progress.detail}
                  </div>
                )}
                {state === "error" && progress?.detail && (
                  <div className="mt-0.5 text-[11.5px] text-rose-300">
                    {progress.detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─── TableCard ────────────────────────────────────────────────────
export function TableCard({ testid, title, rows, columns, downloadBase, subtitle, onOpen, groups }) {
  const total = rows.length;
  const fullColumns = useMemo(() => {
    const seen = new Map();
    for (const c of columns) seen.set(c.key, c.label);
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) seen.set(k, k);
      }
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rows, columns]);
  return (
    <div data-testid={testid}
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold text-slate-100">{title}</div>
            <span data-testid={`${testid}-count`}
                  className="rounded-full bg-[#5139ED]/20 border border-[#5139ED]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#a48bff]">
              {total} {total === 1 ? "row" : "rows"}
            </span>
            {fullColumns.length > columns.length && (
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                {fullColumns.length} cols in export
              </span>
            )}
          </div>
          {subtitle && <div className="mt-0.5 text-[11px] text-slate-400">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          {downloadBase && (
            <>
              <button onClick={() => downloadCsv(rows, fullColumns, `${downloadBase}.csv`)}
                      data-testid={`${testid}-download-csv`}
                      title={`Download full ${fullColumns.length}-column CSV`}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileText size={11} /> CSV
              </button>
              <button onClick={() => downloadExcel(rows, fullColumns, `${downloadBase}.xlsx`, title)}
                      data-testid={`${testid}-download-xlsx`}
                      title={`Download full ${fullColumns.length}-column Excel`}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileSpreadsheet size={11} /> Excel
              </button>
              <button onClick={() => downloadJson(rows, `${downloadBase}.json`)}
                      data-testid={`${testid}-download-json`}
                      title="Download raw JSON"
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileJson size={11} /> JSON
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 max-h-[420px] overflow-y-auto overflow-x-auto rounded-lg border border-white/5 bg-black/20">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-black/70 backdrop-blur-sm z-10">
            {groups && groups.length > 0 && (
              <tr className="border-b border-white/10">
                {groups.map((g, i) => (
                  <th key={i}
                      colSpan={g.span}
                      className={`text-left py-1.5 px-3 text-[10.5px] font-bold uppercase tracking-widest ${g.className || "text-slate-300"}`}>
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-white/10">
              {columns.map((c) => (
                <th key={c.key}
                    title={c.tooltip || c.label}
                    className="text-left py-2 px-3 font-semibold cursor-help">
                  <span className="border-b border-dotted border-slate-500/60">
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                {columns.map((c) => (
                  <td key={c.key} className="py-1.5 px-3 text-slate-200 truncate max-w-[240px]">
                    {c.render ? c.render(r) : (r[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-500">No data returned.</div>
        )}
      </div>
      {rows.length > 8 && (
        <div className="mt-2 text-right text-[10.5px] text-slate-500">
          Scroll inside the table to see all {rows.length} rows.
        </div>
      )}
    </div>
  );
}

// ─── Download helpers ─────────────────────────────────────────────
function _rowsToPlain(rows, columns) {
  const stringify = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return v;
  };
  return rows.map((r) => {
    const out = {};
    for (const c of columns) {
      let v;
      if (c.render) {
        try {
          const rendered = c.render(r);
          v = typeof rendered === "string" || typeof rendered === "number"
                ? rendered
                : stringify(r[c.key] ?? "");
        } catch { v = stringify(r[c.key] ?? ""); }
      } else {
        v = stringify(r[c.key] ?? "");
      }
      out[c.label] = v;
    }
    return out;
  });
}

function downloadCsv(rows, columns, filename) {
  const plain = _rowsToPlain(rows, columns);
  const cols = columns.map((c) => c.label);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.join(","),
    ...plain.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
  _trigger(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

function downloadExcel(rows, columns, filename, sheetName = "Results") {
  const plain = _rowsToPlain(rows, columns);
  const ws = XLSX.utils.json_to_sheet(plain);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Results");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  _trigger(new Blob([wbout], { type: "application/octet-stream" }), filename);
}

function downloadJson(data, filename) {
  _trigger(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

function _trigger(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── ResultCard (switches on `result.card`) ───────────────────────
export function ResultCard({ result, onOpen }) {
  const card = result?.card;
  const d = result?.data || {};
  const msg = result?.message || "";
  if (card === "compound_table") {
    const rows = d.compounds || [];
    return <TableCard testid="compound-table" title="Compounds" subtitle={msg}
      rows={rows} downloadBase="compounds" onOpen={onOpen}
      columns={[
        { key: "compound_name", label: "Name",
          tooltip: "Compound name from source database",
          render: (r) => r.compound_name || r.name || r.iupac_name || "—" },
        { key: "molecular_formula", label: "Formula",
          tooltip: "Molecular formula (Hill notation)",
          render: (r) => r.molecular_formula || "—" },
        { key: "molecular_weight", label: "MW (Da)",
          tooltip: "Molecular weight in daltons",
          render: (r) => (r.molecular_weight || "").toString().slice(0, 8) || "—" },
        { key: "smiles", label: "SMILES",
          tooltip: "Canonical SMILES structure",
          render: (r) => <span className="font-mono text-[11px]">{(r.smiles || r.canonical_smiles || "—").slice(0, 32)}</span> },
        { key: "source", label: "Source",
          tooltip: "Origin database (IMPPAT / LOTUS / PubChem)",
          render: (r) => r.source || r.lotus_id ? "LOTUS" : r.imppat_id ? "IMPPAT" : "—" },
      ]} />;
  }
  if (card === "target_table") {
    const rows = d.targets || [];
    const network = d.network;
    const fmt = (v, n = 2) => (v === null || v === undefined || v === "") ? "—"
      : typeof v === "number" ? v.toFixed(n) : String(v);
    return <>
      <TableCard testid="target-table" title="Predicted Targets" subtitle={msg}
        rows={rows} downloadBase="targets" onOpen={onOpen}
        columns={[
          { key: "compound_name", label: "Compound",
            tooltip: "Query compound (from prior step)",
            render: (r) => r.compound_name || r.query_compound || "—" },
          { key: "gene", label: "Gene",
            tooltip: "Predicted target gene symbol (HGNC)",
            render: (r) => r.gene || r.gene_symbol || r.symbol || "—" },
          { key: "uniprot", label: "UniProt",
            tooltip: "UniProt accession of the predicted protein target",
            render: (r) => r.uniprot_id || r.uniprot || "—" },
          { key: "target_name", label: "Target Name",
            tooltip: "Full name of the predicted protein",
            render: (r) => (r.target_name || r.pref_name || "").slice(0, 40) || "—" },
          { key: "similarity", label: "Similarity",
            tooltip: "Tanimoto similarity to the nearest known ChEMBL ligand (0-1)",
            render: (r) => fmt(r.similarity, 2) },
          { key: "pchembl", label: "pChEMBL",
            tooltip: "-log10(activity in M) of the nearest ChEMBL bioactivity (higher = more potent)",
            render: (r) => fmt(r.pchembl, 2) },
          { key: "score", label: "Score",
            tooltip: "Overall confidence score (0-1)",
            render: (r) => fmt(r.score ?? r.overall_score, 3) },
          { key: "source", label: "Source",
            tooltip: "Evidence source (ChEMBL / SwissTargetPrediction / Open Targets)",
            render: (r) => r.source || (r.sources || []).join(", ") || "—" },
        ]} />
      {network && network.nodes && network.nodes.length > 0 && (
        <NetworkCard network={network} />
      )}
    </>;
  }
  if (card === "disease_table") {
    const rows = d.hits || [];
    return <TableCard testid="disease-table" title="Disease Search" subtitle={msg}
      rows={rows} downloadBase="diseases" onOpen={onOpen}
      columns={[
        { key: "name", label: "Disease",
          tooltip: "Disease / condition name",
          render: (r) => r.name || r.disease_name || r.label || "—" },
        { key: "id", label: "ID",
          tooltip: "Cross-reference ID (EFO / MONDO / DisGeNET)",
          render: (r) => r.disease_id || r.efo_id || r.mondo_id || r.id || "—" },
        { key: "score", label: "Score",
          tooltip: "Match relevance score from Open Targets",
          render: (r) => (r.score ?? "").toString().slice(0, 6) },
      ]} />;
  }
  if (card === "admet_table") {
    const rows = Array.isArray(d.results) ? d.results : (d.rows || d.compounds || []);
    const fmt = (v, digits = 2) => (v === null || v === undefined || v === "") ? "—" :
      typeof v === "number" ? v.toFixed(digits) : String(v);
    const pass = (v) => v === true ? <span className="text-emerald-400">✓</span>
                        : v === false ? <span className="text-rose-400">✗</span>
                        : "—";
    const ld50mgkg = (r) => {
      const raw = r.ld50 ?? r["ld50_log"] ?? null;
      if (raw === null || raw === undefined || raw === "") return "—";
      const n = Number(raw);
      if (Number.isNaN(n)) return "—";
      const mgkg = n > 20 ? n : Math.pow(10, n);
      return mgkg.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };
    return <TableCard testid="admet-table" title="ADMET & Drug-Likeness" subtitle={msg}
      rows={rows} downloadBase="admet" onOpen={onOpen}
      groups={[
        { label: "Identity",       span: 2, className: "text-slate-400" },
        { label: "Drug-Likeness",  span: 4, className: "text-emerald-300" },
        { label: "ADME",           span: 6, className: "text-sky-300" },
        { label: "Toxicity",       span: 4, className: "text-rose-300" },
      ]}
      columns={[
        { key: "compound_name", label: "Name",
          tooltip: "Compound name from IMPPAT / LOTUS / PubChem",
          render: (r) => r.compound_name || "—" },
        { key: "smiles", label: "SMILES",
          tooltip: "Canonical SMILES string",
          render: (r) => <span className="font-mono text-[11px]">{(r.smiles || "").slice(0, 24)}</span> },
        { key: "mw", label: "MW (Da)",
          tooltip: "Molecular weight in daltons. Lipinski threshold: ≤500 Da.",
          render: (r) => fmt(r.mw, 1) },
        { key: "logp", label: "logP",
          tooltip: "Octanol-water partition coefficient. Lipinski threshold: ≤5.",
          render: (r) => fmt(r.logp) },
        { key: "qed", label: "QED",
          tooltip: "Quantitative Estimate of Drug-likeness (0-1, higher is better).",
          render: (r) => fmt(r.qed, 3) },
        { key: "lipinski_pass", label: "Lipinski Ro5",
          tooltip: "Passes Lipinski's Rule of Five: MW≤500, logP≤5, HBD≤5, HBA≤10.",
          render: (r) => pass(r.lipinski_pass) },
        { key: "tpsa", label: "TPSA (Å²)",
          tooltip: "Topological polar surface area in Ų. Veber threshold: ≤140 Å².",
          render: (r) => fmt(r.tpsa, 1) },
        { key: "hba", label: "HBA",
          tooltip: "Hydrogen bond acceptors. Lipinski threshold: ≤10.",
          render: (r) => fmt(r.hba, 0) },
        { key: "hbd", label: "HBD",
          tooltip: "Hydrogen bond donors. Lipinski threshold: ≤5.",
          render: (r) => fmt(r.hbd, 0) },
        { key: "hia", label: "HIA",
          tooltip: "Human intestinal absorption probability (0-1).",
          render: (r) => fmt(r.hia, 2) },
        { key: "bbb", label: "BBB",
          tooltip: "Blood-brain barrier permeability probability (0-1).",
          render: (r) => fmt(r.bbb, 2) },
        { key: "caco2", label: "Caco-2 (log)",
          tooltip: "Caco-2 cell permeability, log10(10⁻⁶ cm/s).",
          render: (r) => fmt(r.caco2, 2) },
        { key: "ld50", label: "LD50 (mg/kg)",
          tooltip: "Rat oral median lethal dose. Higher = safer (>2000 = low toxicity).",
          render: (r) => ld50mgkg(r) },
        { key: "herg", label: "hERG",
          tooltip: "hERG cardiotoxicity probability (0-1). Lower = safer.",
          render: (r) => fmt(r.herg, 2) },
        { key: "ames", label: "Ames",
          tooltip: "Ames mutagenicity probability (0-1). Lower = safer.",
          render: (r) => fmt(r.ames, 2) },
        { key: "dili", label: "DILI",
          tooltip: "Drug-induced liver injury probability (0-1). Lower = safer.",
          render: (r) => fmt(r.dili, 2) },
      ]} />;
  }
  if (card === "enrichment_table") {
    const kegg = (d.kegg || []).slice(0, 10);
    const go   = (d.go   || []).slice(0, 10);
    return <div data-testid="enrichment-card"
                className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <div className="text-[15px] font-semibold text-slate-100">Pathway Enrichment</div>
        <span className="rounded-full bg-[#5139ED]/20 border border-[#5139ED]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#a48bff]">
          {(d.genes || []).length} genes
        </span>
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{msg}</div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { title: "KEGG (Enrichr)", rows: kegg, testid: "enrichment-kegg" },
          { title: "GO / Reactome (g:Profiler)", rows: go, testid: "enrichment-go" },
        ].map((sec) => (
          <div key={sec.title} data-testid={sec.testid} className="rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">{sec.title}</div>
            <ul className="space-y-1">
              {sec.rows.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="truncate text-slate-200" title={t.term_name || t.name || t.term || ""}>
                    {t.term_name || t.name || t.term || "—"}
                  </span>
                  <span className="text-[10.5px] font-mono text-emerald-300">
                    p={((t.adjusted_p_value ?? t.adj_p_value ?? t.p_value ?? t.p_adj ?? t.pvalue) || 0).toExponential(1)}
                  </span>
                </li>
              ))}
              {sec.rows.length === 0 && (
                <li className="text-[11px] text-slate-500 italic">No enriched terms.</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>;
  }
  if (card === "compound_details" || card === "target_details") {
    return <div data-testid={card}
                className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-[13px] backdrop-blur-sm">
      <div className="text-[15px] font-semibold text-slate-100">
        {card === "target_details" ? "Target Details" : "Compound Details"}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{msg}</div>
      <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11.5px] leading-relaxed text-slate-300">
{JSON.stringify(d, null, 2)}
      </pre>
    </div>;
  }
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] text-slate-300">
      {msg || "Result"}
    </div>
  );
}

// ─── NetworkCard (Cytoscape compound-target graph) ────────────────
export function NetworkCard({ network }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !network) return;
    const cy = cytoscape({
      container: ref.current,
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
