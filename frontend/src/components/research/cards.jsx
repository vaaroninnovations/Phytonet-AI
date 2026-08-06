// Research Workspace — Result & plan cards (chat + viz panel)
// Includes: PlanCard (with retry-failed-step), TableCard, ResultCard, NetworkCard,
// and CSV / Excel / JSON download helpers.
import cytoscape from "cytoscape";
import { memo, useEffect, useMemo, useRef, useState, Fragment } from "react";
import * as XLSX from "xlsx";
import {
  Sparkles, Loader2, CheckCircle2, Circle, XCircle, RotateCcw,
  FileSpreadsheet, FileText, FileJson,
  Beaker, ChevronDown, ChevronUp, TrendingDown,
} from "lucide-react";
import DockingViewer from "../DockingViewer";

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
function ResultCardImpl({ result, onOpen }) {
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
    return <EnrichmentCard data={d} message={msg} />;
  }
  if (card === "intersection_venn") {
    return <IntersectionVennCard data={d} message={msg} />;
  }
  if (card === "ctp_network") {
    return <CTPNetworkCard data={d} message={msg} />;
  }
  if (card === "docking") {
    return <DockingCard data={d} message={msg} />;
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

// Result payloads (from completed steps) are immutable — bail out of
// re-render entirely when the same result object is passed again.
export const ResultCard = memo(ResultCardImpl, (prev, next) => {
  const a = prev.result, b = next.result;
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.card !== b.card) return false;
  // Cheap structural signature — good enough for the polling use-case
  // (server returns idempotent completed step results).
  const sig = (r) => JSON.stringify({
    m: r.message || "",
    n: (r.data?.compounds || r.data?.targets || r.data?.hits ||
        r.data?.results || r.data?.rows || r.data?.kegg ||
        r.data?.common || r.data?.nodes || []).length,
    e: (r.data?.network?.edges || r.data?.edges || []).length,
    c: (r.data?.common || []).length,
  });
  return sig(a) === sig(b);
});

// ─── CTPNetworkCard — Compound → Target → Pathway master graph ───
function CTPNetworkCard({ data, message }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const serverNodes = useMemo(() => data?.nodes || [], [data?.nodes]);
  const serverEdges = useMemo(() => data?.edges || [], [data?.edges]);
  const metrics     = useMemo(() => data?.metrics || {}, [data?.metrics]);
  const exports = data?.exports || {};
  const raw = data?.raw || null;

  // ── Interactive slider state — allow live top-N re-filtering ────
  const keggAvail = metrics.kegg_available ?? (raw?.kegg?.length || 0);
  const goAvail   = metrics.go_available   ?? (raw?.go?.length   || 0);
  const maxAdjP   = metrics.max_adj_p ?? 0.05;
  const [topKegg, setTopKegg] = useState(metrics.top_kegg_used ?? 20);
  const [topGo,   setTopGo]   = useState(metrics.top_go_used   ?? 20);
  const [isolatedNodeId, setIsolatedNodeId] = useState(null);

  // Recompute nodes/edges client-side when sliders move. Falls back to
  // the server-baked graph when raw upstream data isn't available.
  const { nodes, edges, liveMetrics } = useMemo(() => {
    if (!raw) {
      return { nodes: serverNodes, edges: serverEdges, liveMetrics: metrics };
    }

    const pwScore = (pw) => {
      const p = pw?.adjusted_p_value ?? pw?.adj_p_value ?? pw?.p_value ?? 1.0;
      const n = parseFloat(p);
      return Number.isFinite(n) ? n : 1.0;
    };
    const topN = (rows, k) => {
      const filt = (rows || []).filter((r) => pwScore(r) <= maxAdjP);
      filt.sort((a, b) => pwScore(a) - pwScore(b));
      return filt.slice(0, k);
    };

    const keggTop = topN(raw.kegg, topKegg);
    const goTop   = topN(raw.go,   topGo);

    // Compound-Target edges
    const compounds = new Set();
    const targets   = new Set();
    const ctEdges   = [];
    for (const t of raw.targets || []) {
      const c = (t.compound_name || t.query_compound || "").trim();
      const g = (t.gene || t.gene_symbol || t.symbol || "").trim().toUpperCase();
      if (!c || !g) continue;
      compounds.add(c); targets.add(g);
      ctEdges.push({ source: c, target: g, interaction: "targets" });
    }

    // Target-Pathway edges from selected top-N pathways
    const pathways = new Set();
    const tpEdges  = [];
    for (const pw of [...keggTop, ...goTop]) {
      const pname = (pw.term_name || pw.name || pw.term || "").trim();
      if (!pname) continue;
      for (const gene of pw.overlap_genes || []) {
        const g = (gene || "").trim().toUpperCase();
        if (!g) continue;
        pathways.add(pname);
        tpEdges.push({ source: g, target: pname, interaction: "involved_in" });
      }
    }

    // De-dupe edges
    const seen = new Set();
    const allEdges = [...ctEdges, ...tpEdges].filter((e) => {
      const k = `${e.source}→${e.target}→${e.interaction}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });

    // Build node registry with degree
    const nodeMap = new Map();
    const addNode = (id, type) => {
      if (!nodeMap.has(id)) nodeMap.set(id, { id, label: id, type, degree: 0 });
    };
    compounds.forEach((c) => addNode(c, "Compound"));
    targets.forEach((t)   => addNode(t, "Target"));
    pathways.forEach((p)  => addNode(p, "Pathway"));
    for (const e of allEdges) {
      // Ensure endpoints exist (in case raw targets missed a gene that
      // shows up in a pathway overlap list)
      if (!nodeMap.has(e.source)) addNode(e.source, "Target");
      if (!nodeMap.has(e.target)) {
        addNode(e.target, e.interaction === "involved_in" ? "Pathway" : "Target");
      }
      nodeMap.get(e.source).degree += 1;
      nodeMap.get(e.target).degree += 1;
    }

    const nodesArr = Array.from(nodeMap.values());
    return {
      nodes: nodesArr,
      edges: allEdges,
      liveMetrics: {
        ...metrics,
        n_compounds: compounds.size,
        n_targets:   targets.size,
        n_pathways:  pathways.size,
        n_nodes:     nodesArr.length,
        n_edges:     allEdges.length,
        top_kegg_used: keggTop.length,
        top_go_used:   goTop.length,
      },
    };
  }, [raw, topKegg, topGo, maxAdjP, serverNodes, serverEdges, metrics]);

  useEffect(() => {
    if (!ref.current || !nodes.length) return;
    const cy = cytoscape({
      container: ref.current,
      elements: [
        ...nodes.map((n) => ({ data: {
          id: n.id, label: n.label, type: n.type, degree: n.degree,
        }})),
        ...edges.map((e, i) => ({ data: {
          id: `e${i}`, source: e.source, target: e.target,
          interaction: e.interaction,
        }})),
      ],
      style: [
        { selector: "node[type='Compound']", style: {
            "background-color": "#5139ED", "label": "data(label)",
            "color": "#e0e0ff", "font-size": 10,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "width":  (n) => 18 + Math.min(24, (n.data("degree") || 1) * 2),
            "height": (n) => 18 + Math.min(24, (n.data("degree") || 1) * 2) } },
        { selector: "node[type='Target']", style: {
            "background-color": "#2BB673", "label": "data(label)",
            "color": "#d0ffd0", "font-size": 9,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "width":  (n) => 14 + Math.min(18, (n.data("degree") || 1) * 2),
            "height": (n) => 14 + Math.min(18, (n.data("degree") || 1) * 2) } },
        { selector: "node[type='Pathway']", style: {
            "background-color": "#F5B301", "shape": "diamond",
            "label": "data(label)", "color": "#fef3c7", "font-size": 9,
            "text-outline-color": "#0B0B18", "text-outline-width": 2,
            "width":  (n) => 14 + Math.min(18, (n.data("degree") || 1) * 2),
            "height": (n) => 14 + Math.min(18, (n.data("degree") || 1) * 2) } },
        { selector: "edge", style: {
            "width": 1, "line-color": "#8139ED", "line-opacity": 0.32,
            "curve-style": "bezier", "target-arrow-shape": "none" } },
        { selector: "edge[interaction='involved_in']", style: {
            "line-color": "#F5B301", "line-opacity": 0.28 } },
        // ── Neighborhood isolation styles ─────────────────────────
        { selector: ".dimmed", style: {
            "opacity": 0.08, "text-opacity": 0 } },
        { selector: ".focus", style: {
            "border-width": 3, "border-color": "#FDE68A",
            "text-outline-color": "#F59E0B", "text-outline-width": 2,
            "font-size": 12, "z-index": 999 } },
        { selector: ".neighbor", style: {
            "border-width": 2, "border-color": "#FDE68A", "opacity": 1 } },
        { selector: "edge.highlight", style: {
            "line-color": "#FDE68A", "line-opacity": 0.95, "width": 2.5,
            "z-index": 998 } },
      ],
      layout: { name: "cose", nodeRepulsion: 4200, idealEdgeLength: 60,
                animate: false, padding: 40 },
      textureOnViewport: true, motionBlur: false, pixelRatio: 1,
    });
    cy.autoungrabify(true);

    // Tap a node to isolate its first-degree neighborhood
    cy.on("tap", "node", (evt) => {
      const id = evt.target.id();
      setIsolatedNodeId((prev) => (prev === id ? null : id));
    });
    // Tap empty space to reset
    cy.on("tap", (evt) => { if (evt.target === cy) setIsolatedNodeId(null); });

    cyRef.current = cy;
    return () => cy.destroy();
  }, [nodes, edges]);

  // Apply / clear isolation classes without re-mounting Cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("dimmed focus neighbor highlight");
      if (!isolatedNodeId) return;
      const focus = cy.getElementById(isolatedNodeId);
      if (focus.empty()) return;
      const neigh = focus.neighborhood();
      const keep  = focus.union(neigh);
      cy.elements().not(keep).addClass("dimmed");
      focus.addClass("focus");
      neigh.nodes().addClass("neighbor");
      neigh.edges().addClass("highlight");
    });
  }, [isolatedNodeId, nodes, edges]);

  const dl = (fname) => {
    const txt = exports?.[fname]; if (!txt) return;
    const isJson = fname.endsWith(".json");
    _trigger(new Blob([txt], {
      type: isJson ? "application/json"
                   : fname.endsWith(".graphml") ? "application/xml"
                   : "text/csv;charset=utf-8;",
    }), fname);
  };

  return (
    <div data-testid="ctp-network-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="text-[15px] font-semibold text-slate-100">Compound → Target → Pathway Network</div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {liveMetrics.n_nodes} nodes · {liveMetrics.n_edges} edges
        </span>
      </div>
      <div className="text-[11.5px] text-slate-400 mb-3">{message}</div>

      {/* Stat pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {[
          { label: "Compounds", value: liveMetrics.n_compounds, color: "text-[#a48bff]" },
          { label: "Targets",   value: liveMetrics.n_targets,   color: "text-emerald-300" },
          { label: liveMetrics.top_kegg_used != null
                    ? `Top Pathways (${(liveMetrics.top_kegg_used ?? 0) + (liveMetrics.top_go_used ?? 0)}/${(keggAvail + goAvail)})`
                    : "Pathways",
            value: liveMetrics.n_pathways, color: "text-amber-300" },
          { label: "Nodes",     value: liveMetrics.n_nodes,     color: "text-slate-100" },
          { label: "Edges",     value: liveMetrics.n_edges,     color: "text-slate-100" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-center">
            <div className={`text-[18px] font-bold ${s.color}`}>{s.value ?? "—"}</div>
            <div className="text-[10.5px] uppercase tracking-widest text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Interactive sliders — live top-N pathway re-filter */}
      {raw && (keggAvail > 0 || goAvail > 0) && (
        <div data-testid="ctp-slider-panel"
             className="mb-3 rounded-lg border border-white/5 bg-black/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-300">
              Adjust top-N pathways · adj-p ≤ {maxAdjP}
            </div>
            <button data-testid="ctp-reset-topn"
                    onClick={() => {
                      setTopKegg(Math.min(20, keggAvail));
                      setTopGo(Math.min(20, goAvail));
                    }}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-white/10">
              Reset
            </button>
          </div>

          {keggAvail > 0 && (
            <div className="mb-2">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Top KEGG pathways</span>
                <span className="font-mono text-amber-300">{topKegg} / {keggAvail}</span>
              </div>
              <input data-testid="ctp-slider-kegg"
                     type="range" min={0} max={keggAvail} step={1} value={topKegg}
                     onChange={(e) => setTopKegg(parseInt(e.target.value, 10) || 0)}
                     className="w-full accent-amber-400" />
            </div>
          )}

          {goAvail > 0 && (
            <div>
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>Top GO terms</span>
                <span className="font-mono text-amber-300">{topGo} / {goAvail}</span>
              </div>
              <input data-testid="ctp-slider-go"
                     type="range" min={0} max={goAvail} step={1} value={topGo}
                     onChange={(e) => setTopGo(parseInt(e.target.value, 10) || 0)}
                     className="w-full accent-amber-400" />
            </div>
          )}
          <div className="mt-1 text-[10px] text-slate-500">
            Tip: click any node in the graph to isolate its neighborhood — click empty space to reset.
          </div>
        </div>
      )}

      {/* Isolation banner */}
      {isolatedNodeId && (
        <div data-testid="ctp-isolation-banner"
             className="mb-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200">
          <span>
            Isolating <span className="font-mono font-semibold">{isolatedNodeId}</span> and its first-degree neighborhood.
          </span>
          <button data-testid="ctp-clear-isolation"
                  onClick={() => setIsolatedNodeId(null)}
                  className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100 hover:bg-amber-500/20">
            Clear
          </button>
        </div>
      )}

      {/* Legend + downloads */}
      <div className="flex flex-wrap items-center gap-3 mb-2 text-[10.5px] text-slate-400">
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#5139ED] mr-1" />Compounds</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-[#2BB673] mr-1" />Targets</span>
        <span><span className="inline-block h-2 w-2 rotate-45 bg-[#F5B301] mr-1" />Pathways</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button data-testid="ctp-download-nodes-csv" onClick={() => dl("ctp_nodes.csv")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> nodes.csv
          </button>
          <button data-testid="ctp-download-edges-csv" onClick={() => dl("ctp_edges.csv")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> edges.csv
          </button>
          <button data-testid="ctp-download-graphml" onClick={() => dl("ctp_network.graphml")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> GraphML
          </button>
          <button data-testid="ctp-download-json" onClick={() => dl("ctp_network.json")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileJson size={10} /> JSON
          </button>
          <button data-testid="ctp-download-png"
            onClick={() => {
              const cy = cyRef.current; if (!cy) return;
              const url = cy.png({ bg: "#0B0B18", scale: 2, full: true });
              const a = document.createElement("a");
              a.href = url; a.download = "ctp_network.png"; a.click();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
            <FileText size={10} /> PNG
          </button>
        </div>
      </div>

      <div ref={ref} data-testid="ctp-network-canvas"
           className="w-full h-[500px] rounded-lg border border-white/5 bg-black/40" />

      {/* Top nodes by degree — recomputed live from the current graph */}
      {(() => {
        const topHubs = raw
          ? [...nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0)).slice(0, 10)
          : (metrics.top_by_degree || []);
        if (!topHubs.length) return null;
        return (
          <div className="mt-3">
            <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
              Top hubs by degree
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topHubs.map((h, i) => {
                const tint = h.type === "Compound" ? "text-[#a48bff] border-[#5139ED]/40 bg-[#5139ED]/10"
                           : h.type === "Target"   ? "text-emerald-200 border-emerald-500/40 bg-emerald-500/10"
                           : "text-amber-200 border-amber-500/40 bg-amber-500/10";
                return (
                  <button key={h.id || i}
                        data-testid={`ctp-hub-${i}`}
                        onClick={() => setIsolatedNodeId(h.id)}
                        title="Click to isolate this node's neighborhood"
                        className={`inline-flex items-center gap-1 rounded-full border ${tint} px-2 py-0.5 text-[11px] font-semibold hover:brightness-125`}>
                    {h.id} <span className="text-slate-500 text-[10px]">·{h.degree}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ─── DockingCard — top compounds × top targets docking results ───
function DockingCard({ data, message }) {
  const jobId    = data?.job_id || "";
  const metrics  = data?.metrics || {};
  const rows     = useMemo(() => {
    const list = (data?.results || []).slice();
    // Sort by best_affinity ascending (more negative = stronger)
    list.sort((a, b) => {
      const av = (a.error || a.best_affinity == null) ? Infinity : a.best_affinity;
      const bv = (b.error || b.best_affinity == null) ? Infinity : b.best_affinity;
      return av - bv;
    });
    return list;
  }, [data?.results]);

  const [expandedPair, setExpandedPair] = useState(null);

  const strengthBadge = (aff) => {
    if (aff == null) return { label: "—", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
    if (aff <= -9)   return { label: "Very strong", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" };
    if (aff <= -7)   return { label: "Strong",      cls: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" };
    if (aff <= -5)   return { label: "Moderate",    cls: "bg-amber-500/15  text-amber-200  border-amber-400/30" };
    return              { label: "Weak",        cls: "bg-rose-500/15   text-rose-200   border-rose-400/30" };
  };

  const dlCSV = () => {
    const header = ["compound", "gene", "uniprot", "pdb",
                    "best_affinity_kcal_per_mol", "n_modes", "pair_id",
                    "error"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        JSON.stringify(r.ligand_name || ""),
        JSON.stringify(r.gene_symbol || ""),
        JSON.stringify(r.receptor_uniprot || ""),
        JSON.stringify(r.pdb_id || r.receptor_pdb || ""),
        (r.best_affinity != null ? Number(r.best_affinity).toFixed(3) : ""),
        (r.poses || []).length,
        JSON.stringify(r.pair_id || ""),
        JSON.stringify(r.error || ""),
      ].join(","));
    }
    _trigger(new Blob([lines.join("\n")],
      { type: "text/csv;charset=utf-8;" }), "docking_results.csv");
  };

  return (
    <div data-testid="docking-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Beaker className="h-4 w-4 text-[#f472b6]" />
        <div className="text-[15px] font-semibold text-slate-100">
          Molecular Docking · Top compounds × Top targets
        </div>
        {metrics.n_strong != null && (
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
            {metrics.n_strong} strong binder{metrics.n_strong === 1 ? "" : "s"} (≤ −7 kcal/mol)
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-slate-400 mb-3">{message}</div>

      {/* Summary pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {[
          { label: "Pairs",          value: metrics.n_pairs,   color: "text-slate-100" },
          { label: "Succeeded",      value: metrics.n_success, color: "text-emerald-300" },
          { label: "Failed",         value: metrics.n_failed,  color: metrics.n_failed ? "text-rose-300" : "text-slate-300" },
          { label: "Strong (≤−7)",   value: metrics.n_strong,  color: "text-emerald-200" },
          { label: "Best affinity",
            value: (metrics.best_affinity != null
                     ? `${Number(metrics.best_affinity).toFixed(2)}` : "—"),
            color: "text-[#a48bff]" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-center">
            <div className={`text-[18px] font-bold ${s.color}`}>{s.value ?? "—"}</div>
            <div className="text-[10.5px] uppercase tracking-widest text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {metrics.best_pair && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11.5px] text-emerald-200">
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Best binder: <span className="font-mono font-semibold">{metrics.best_pair}</span> at <span className="font-mono font-semibold">{Number(metrics.best_affinity).toFixed(2)}</span> kcal/mol</span>
        </div>
      )}

      {/* Results table + actions */}
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">
          Ranked results ({rows.length})
        </div>
        <button data-testid="docking-download-csv" onClick={dlCSV}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
          <FileSpreadsheet size={10} /> CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-black/25">
        <table className="w-full text-[11.5px]">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Compound</th>
              <th className="px-3 py-2 text-left">Gene</th>
              <th className="px-3 py-2 text-left">PDB</th>
              <th className="px-3 py-2 text-right">Affinity (kcal/mol)</th>
              <th className="px-3 py-2 text-center">Strength</th>
              <th className="px-3 py-2 text-center">Modes</th>
              <th className="px-3 py-2 text-center">3D View</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = strengthBadge(r.best_affinity);
              const isOpen = expandedPair === r.pair_id;
              const hasError = !!r.error;
              return (
                <Fragment key={r.pair_id || i}>
                  <tr
                      data-testid={`docking-row-${i}`}
                      className={`border-t border-white/5 ${hasError ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 text-slate-100">{r.ligand_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-emerald-200">{r.gene_symbol || r.receptor_uniprot || "—"}</td>
                    <td className="px-3 py-2 font-mono text-amber-200">{r.pdb_id || r.receptor_pdb || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-100">
                      {hasError ? "—" : (r.best_affinity != null
                        ? Number(r.best_affinity).toFixed(2) : "—")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                        {hasError ? "Failed" : badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-300">
                      {hasError ? "—" : ((r.poses || []).length || "—")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!hasError && r.pair_id && (
                        <button
                          data-testid={`docking-view3d-${i}`}
                          onClick={() => setExpandedPair(isOpen ? null : r.pair_id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#5139ED]/40 bg-[#5139ED]/20 px-2 py-1 text-[10.5px] font-semibold text-[#c4b5fd] hover:bg-[#5139ED]/30">
                          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          {isOpen ? "Hide" : "View 3D"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && !hasError && (
                    <tr key={`${r.pair_id}-viewer`} className="bg-black/40">
                      <td colSpan={8} className="px-3 py-3">
                        <div data-testid={`docking-viewer-wrap-${i}`}
                             className="rounded-xl bg-white/95 p-2">
                          <DockingViewer
                            jobId={jobId}
                            pairId={r.pair_id}
                            ligandName={r.ligand_name}
                            receptor={`${r.gene_symbol || r.receptor_uniprot} (${r.pdb_id || r.receptor_pdb})`}
                            bestAffinity={r.best_affinity}
                            interactions={r.interactions || {}}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                  No docking results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {metrics.n_failed > 0 && (
        <div className="mt-2 text-[10.5px] text-rose-300">
          {metrics.n_failed} pair(s) failed — usually because a target has no
          reviewed PDB structure or the ligand rejected receptor prep.
        </div>
      )}
    </div>
  );
}


function EnrichmentCard({ data, message }) {
  const genesCount = (data?.genes || []).length;
  const keggAll = data?.kegg || [];
  const goAll   = data?.go   || [];
  const [tab, setTab] = useState("kegg");
  const [topN, setTopN] = useState(20);
  const [maxAdjP, setMaxAdjP] = useState(0.05);

  const rows = tab === "kegg" ? keggAll : goAll;
  const [chartView, setChartView] = useState("list");

  // Normalise each row across the two APIs so a single table renders both.
  // NB: g:Profiler's `p_value` is ALREADY the g:SCS-corrected value, so for
  // the GO tab we use it as the "adj_p_value" fallback (that's what the
  // Enrichr KEGG side exposes explicitly).
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
      // Sort by combined_score desc if available, else adj_p_value asc.
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
      {/* Header */}
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

      {/* Controls */}
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

      {/* View switcher */}
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
              {/* -log10(p) bar */}
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

// ─── Chart export helpers (SVG + PNG) ────────────────────────────
// Serialise a live SVG element into a standalone .svg file.
export function downloadSvgFile(svgEl, filename) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  // Inline the current computed background so exported figures don't render
  // transparent on white manuscripts.
  if (!clone.getAttribute("style")?.includes("background"))
    clone.style.background = "#0B0B18";
  const src = new XMLSerializer().serializeToString(clone);
  _trigger(new Blob([`<?xml version="1.0" standalone="no"?>\n${src}`],
                     { type: "image/svg+xml;charset=utf-8" }), filename);
}

// Rasterise an SVG element to a PNG at N× resolution and download it.
export function downloadSvgAsPng(svgEl, filename, scale = 2) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = clone.getAttribute("viewBox");
  let width, height;
  if (viewBox) {
    const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
    width  = vbW; height = vbH;
  } else {
    width  = svgEl.clientWidth  || svgEl.getBoundingClientRect().width  || 800;
    height = svgEl.clientHeight || svgEl.getBoundingClientRect().height || 400;
  }
  clone.setAttribute("width",  width);
  clone.setAttribute("height", height);
  if (!clone.getAttribute("style")?.includes("background"))
    clone.style.background = "#0B0B18";
  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(width  * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0B0B18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => {
      _trigger(b, filename);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// Small download-chart toolbar rendered above each SVG chart.
function ChartDownloadBar({ svgSelector, filenameBase }) {
  const get = () => document.querySelector(svgSelector);
  return (
    <div className="mb-2 flex items-center justify-end gap-1.5">
      <button data-testid={`chart-download-svg-${filenameBase}`}
              onClick={() => downloadSvgFile(get(), `${filenameBase}.svg`)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
        <FileText size={10} /> SVG
      </button>
      <button data-testid={`chart-download-png-${filenameBase}`}
              onClick={() => downloadSvgAsPng(get(), `${filenameBase}.png`, 2)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
        <FileText size={10} /> PNG
      </button>
    </div>
  );
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
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#e2e8f0">
              {label}
            </text>
            <circle cx={x} cy={y} r={rB} fill="#a48bff" fillOpacity="0.55"
                    stroke="#8139ED" strokeWidth="1" />
            <text x={x + rB + 4} y={y + 3} fontSize="9" fill="#94a3b8">
              {r.gene_count ?? ""}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize="10"
            fill="#94a3b8">−log₁₀(P-value) · bubble size = overlap gene count</text>
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
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#e2e8f0">
              {label}
            </text>
            <line x1={plotL} y1={y} x2={plotL + bw} y2={y}
                  stroke="#8139ED" strokeOpacity="0.7" strokeWidth="2" />
            <circle cx={plotL + bw} cy={y} r={5} fill="#a48bff"
                    stroke="#0B0B18" strokeWidth="1.5" />
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



function IntersectionVennCard({ data, message }) {
  const pred        = data?.predicted_gene_symbols || [];
  const dz          = data?.disease_gene_symbols   || [];
  const common      = data?.common                 || [];
  const predOnly    = data?.predicted_only         || [];
  const dzOnly      = data?.disease_only           || [];
  const commonRows  = data?.targets                || [];
  const totalPred   = pred.length;
  const totalDz     = dz.length;
  const totalCommon = common.length;
  return (
    <div data-testid="intersection-venn-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="text-[15px] font-semibold text-slate-100">
          Predicted ∩ Disease Genes
        </div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {totalCommon} common
        </span>
        {data?.disease_name && (
          <span className="text-[11px] text-slate-500">· {data.disease_name}</span>
        )}
      </div>
      <div className="text-[11.5px] text-slate-400">{message}</div>

      {/* SVG Venn */}
      <div className="mt-3">
        <ChartDownloadBar svgSelector="[data-testid=venn-svg]"
                          filenameBase="venn_intersection" />
        <div className="flex justify-center">
        <svg viewBox="0 0 380 200" width="100%" style={{maxWidth: 480}}
             data-testid="venn-svg" role="img" aria-label="Intersection Venn diagram">
          <defs>
            <linearGradient id="vennA" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#5139ED" stopOpacity="0.42"/>
              <stop offset="1" stopColor="#8139ED" stopOpacity="0.28"/>
            </linearGradient>
            <linearGradient id="vennB" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#059669" stopOpacity="0.42"/>
              <stop offset="1" stopColor="#22c55e" stopOpacity="0.28"/>
            </linearGradient>
          </defs>
          <circle cx="140" cy="100" r="82" fill="url(#vennA)"
                  stroke="#a48bff" strokeWidth="1.5" />
          <circle cx="240" cy="100" r="82" fill="url(#vennB)"
                  stroke="#34d399" strokeWidth="1.5" />
          {/* Left-only count */}
          <text x="90"  y="100" textAnchor="middle" fontSize="20"
                fill="#e2e8f0" fontWeight="700">{totalPred - totalCommon}</text>
          <text x="90"  y="122" textAnchor="middle" fontSize="10"
                fill="#a48bff">Predicted only</text>
          {/* Right-only count */}
          <text x="290" y="100" textAnchor="middle" fontSize="20"
                fill="#e2e8f0" fontWeight="700">{totalDz - totalCommon}</text>
          <text x="290" y="122" textAnchor="middle" fontSize="10"
                fill="#34d399">Disease only</text>
          {/* Common count */}
          <text x="190" y="102" textAnchor="middle" fontSize="26"
                fill="#f0fdf4" fontWeight="800"
                data-testid="venn-common-count">{totalCommon}</text>
          <text x="190" y="122" textAnchor="middle" fontSize="10"
                fill="#fef3c7">Common</text>
          {/* Legend labels */}
          <text x="70"  y="35" textAnchor="middle" fontSize="11"
                fill="#a48bff" fontWeight="700">Compound targets</text>
          <text x="310" y="35" textAnchor="middle" fontSize="11"
                fill="#34d399" fontWeight="700">Disease genes</text>
        </svg>
        </div>
      </div>

      {/* Common genes as pills */}
      {common.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
            Common genes ({common.length})
          </div>
          <div data-testid="common-genes-pills"
               className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {common.map((g) => (
              <span key={g}
                    className="inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Enriched rows for the intersection */}
      {commonRows.length > 0 && (
        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-lg border border-white/5 bg-black/20">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-black/70 backdrop-blur-sm z-10">
              <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-white/10">
                <th className="text-left py-2 px-3">Gene</th>
                <th className="text-left py-2 px-3">Protein</th>
                <th className="text-left py-2 px-3">UniProt</th>
                <th className="text-left py-2 px-3">Assoc.</th>
                <th className="text-left py-2 px-3">Class</th>
              </tr>
            </thead>
            <tbody>
              {commonRows.map((r, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="py-1.5 px-3 font-semibold text-emerald-200">
                    {r.gene_symbol || r.gene || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-200 truncate max-w-[280px]"
                      title={r.protein_name || ""}>
                    {r.protein_name || r.pref_name || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-300 font-mono">
                    {r.uniprot_id || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-200">
                    {r.association_score != null ? Number(r.association_score).toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-300">
                    {r.protein_class || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {commonRows.length === 0 && totalCommon === 0 && (
        <div className="mt-3 text-[12px] italic text-slate-500 text-center">
          No overlap between the predicted targets and this disease's gene panel.
        </div>
      )}
    </div>
  );
}


// ─── NetworkCard (Cytoscape compound-target graph) ────────────────
// Memoised so parent-driven re-renders (e.g. polling ticks) never trigger a
// full cytoscape destroy+recreate — that used to cause a visible flicker
// every second while a run was still executing.
function NetworkCardImpl({ network }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  useEffect(() => {
    if (!ref.current || !network) return;
    // Only build once. Rerenders with the same nodes/edges (handled by the
    // outer memo) never reach this effect. Explicit `animate: false` + a
    // `hideEdgesOnViewport` guard prevents cytoscape from repainting itself
    // during unrelated parent updates (streaming interpretation, scroll
    // events, etc.).
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
    // Freeze auto-resize so a scrollbar / streaming layout jitter never
    // triggers a redraw of the whole graph.
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
  // Nodes/edges same size — compare a hash of ids to catch content changes.
  const nodeIds = (arr) => (arr || []).map((n) => n.id).join("|");
  const edgeIds = (arr) => (arr || []).map((e) => `${e.source}>${e.target}`).join("|");
  return nodeIds(a.nodes) === nodeIds(b.nodes) &&
         edgeIds(a.edges) === edgeIds(b.edges);
});
