// AI Research Workspace — chat-first entry point at /research.
// Left sidebar (projects) · Center (chat) · Right (viz panel).
// The planner + executor live in the backend (research_service.py); this
// component only orchestrates the UI.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { authApi } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import {
  Sparkles, Send, Plus, Loader2, ChevronRight, Trash2,
  Beaker, FlaskConical, Dna, Microscope, Atom, X, Download,
  Paperclip, MessageSquare, Bot, User, CheckCircle2, Circle, XCircle,
  ArrowRight, Menu, Search, FileSpreadsheet, FileText, FileJson,
} from "lucide-react";
import { toast } from "sonner";

const SUGGESTIONS = [
  { icon: Beaker,       text: "Find phytochemicals from Withania somnifera" },
  { icon: Atom,         text: "Predict protein targets for Quercetin" },
  { icon: Dna,          text: "Show me disease-associated genes for Type 2 diabetes" },
  { icon: FlaskConical, text: "Run ADMET prediction for Curcumin" },
  { icon: Microscope,   text: "Compare the phytochemistry of Turmeric and Ginger" },
  { icon: Sparkles,     text: "Design a workflow to study the anti-inflammatory potential of turmeric" },
];

function fmtWhen(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

// ═════════════════════════════════════════════════════════════════
// SIDEBAR
// ═════════════════════════════════════════════════════════════════
function Sidebar({ projects, activeId, onSelect, onNew, onDelete, loading }) {
  return (
    <aside data-testid="research-sidebar"
           className="hidden lg:flex w-72 flex-shrink-0 flex-col border-r border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="p-4">
        <button
          data-testid="research-new-project"
          onClick={onNew}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 hover:shadow-xl transition-all"
        >
          <Plus size={16} /> New Research
        </button>
      </div>
      <div className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        Research History
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {loading && <div className="px-3 py-6 text-center text-xs text-slate-500">
          <Loader2 className="mx-auto animate-spin" size={14} />
        </div>}
        {!loading && projects.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No projects yet. Start a new research to begin.
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id}
               data-testid={`project-row-${p.id}`}
               onClick={() => onSelect(p.id)}
               className={`group flex items-start justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                 activeId === p.id
                   ? "bg-[#5139ED]/20 border border-[#5139ED]/40"
                   : "hover:bg-white/5 border border-transparent"
               }`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-slate-100">{p.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                <MessageSquare size={10} /> {p.message_count}
                <span>·</span>
                {fmtWhen(p.updated_at)}
              </div>
            </div>
            <button
              data-testid={`delete-project-${p.id}`}
              onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
              className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"
              title="Delete project"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ═════════════════════════════════════════════════════════════════
// CARDS · Rendered inside chat + right panel
// ═════════════════════════════════════════════════════════════════
function PlanCard({ plan, title, onExecute, executing, executed }) {
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
          return (
            <li key={s.id || i} data-testid={`plan-step-${i}`}
                className="flex items-start gap-2 text-[13px]">
              <Icon size={14} className={`${color} mt-0.5 flex-shrink-0 ${state === "running" ? "animate-spin" : ""}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-200">{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.tool}</span>
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

function TableCard({ testid, title, rows, columns, downloadBase, subtitle, onOpen, groups }) {
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

function ResultCard({ result, onOpen }) {
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
    return <TableCard testid="target-table" title="Disease-Associated Targets" subtitle={msg}
      rows={rows} downloadBase="targets" onOpen={onOpen}
      columns={[
        { key: "gene", label: "Gene",
          tooltip: "Gene symbol (HGNC)",
          render: (r) => r.gene || r.gene_symbol || r.symbol || "—" },
        { key: "score", label: "Score",
          tooltip: "Overall evidence score across all sources (0-1)",
          render: (r) => (r.score ?? r.overall_score ?? "").toString().slice(0, 6) || "—" },
        { key: "source", label: "Source",
          tooltip: "Contributing databases (Open Targets, CTD, NCBI Gene)",
          render: (r) => r.source || (r.sources || []).join(", ") || "—" },
        { key: "uniprot", label: "UniProt",
          tooltip: "UniProt accession for the encoded protein",
          render: (r) => r.uniprot_id || r.uniprot || "—" },
      ]} />;
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
    // Convert normalised LD50 → mg/kg. Backend returns log10(mg/kg) — invert.
    const ld50mgkg = (r) => {
      const raw = r.ld50 ?? r["ld50_log"] ?? null;
      if (raw === null || raw === undefined || raw === "") return "—";
      // Heuristic: if the value is > 20, assume it's already mg/kg; if <= 20,
      // assume it's log10(mg/kg) and invert.
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
        /* Identity */
        { key: "compound_name", label: "Name",
          tooltip: "Compound name from IMPPAT / LOTUS / PubChem",
          render: (r) => r.compound_name || "—" },
        { key: "smiles", label: "SMILES",
          tooltip: "Canonical SMILES string",
          render: (r) => <span className="font-mono text-[11px]">{(r.smiles || "").slice(0, 24)}</span> },
        /* Drug-Likeness */
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
        /* ADME */
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
        /* Toxicity */
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

// ═════════════════════════════════════════════════════════════════
// CHAT MESSAGE
// ═════════════════════════════════════════════════════════════════
function ChatMessage({ msg, run, onExecute, executing, onOpenRun, onSend }) {
  const isUser = msg.role === "user";
  const Icon = isUser ? User : Bot;
  return (
    <div data-testid={`msg-${msg.role}`}
         className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-lg bg-gradient-to-br from-[#5139ED] to-[#8139ED] flex items-center justify-center shadow-lg">
          <Icon size={15} className="text-white" />
        </div>
      )}
      <div className={`max-w-[820px] ${isUser ? "text-right" : ""} flex-1`}>
        <div className={`inline-block rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
          isUser
            ? "bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-white"
            : "bg-white/5 border border-white/10 text-slate-100 backdrop-blur-sm"
        }`}>
          {msg.text}
        </div>
        {/* Suggested next steps — surfaces after an interpretation message */}
        {!isUser && (msg.next_steps || []).length > 0 && (
          <div data-testid="next-steps" className="mt-2 flex flex-wrap gap-1.5">
            <div className="w-full text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">
              Suggested next steps
            </div>
            {(msg.next_steps || []).map((s, i) => (
              <button key={i}
                      data-testid={`next-step-${i}`}
                      onClick={() => onSend && onSend(s)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#5139ED]/40 bg-[#5139ED]/10 px-3 py-1 text-[12px] text-slate-100 hover:bg-[#5139ED]/25 hover:border-[#5139ED]/70 transition-colors">
                <Sparkles size={11} className="text-[#a48bff]" />
                {s}
                <ArrowRight size={11} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}
        {msg.mode === "plan" && run && (
          <PlanCard
            plan={run.plan || msg.plan || []}
            title={msg.title || run.title}
            onExecute={() => onExecute(run.id)}
            executing={executing === run.id || run.status === "running"}
            executed={run.status === "completed" || run.status === "failed"}
          />
        )}
        {run?.results?.map((res, i) => (
          <ResultCard key={i} result={res.result} onOpen={() => onOpenRun(run)} />
        ))}
      </div>
      {isUser && (
        <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center">
          <Icon size={15} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// RIGHT VIZ PANEL
// ═════════════════════════════════════════════════════════════════
function VizPanel({ activeRun, onClose, onSend }) {
  if (!activeRun) return null;
  return (
    <aside data-testid="viz-panel"
           className="hidden lg:flex w-[380px] xl:w-[420px] flex-shrink-0 flex-col border-l border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">Viz Panel</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-100">{activeRun.title}</div>
        </div>
        <button data-testid="viz-close" onClick={onClose}
                className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(activeRun.results || []).map((r, i) => (
          <ResultCard key={i} result={r.result} />
        ))}
        {activeRun.interpretation && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] leading-relaxed text-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1">Interpretation</div>
            {activeRun.interpretation}
          </div>
        )}
        {(activeRun.next_steps || []).length > 0 && (
          <div data-testid="viz-next-steps"
               className="rounded-xl border border-[#5139ED]/30 bg-[#5139ED]/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff] mb-2">
              Suggested next steps
            </div>
            <div className="flex flex-col gap-1.5">
              {(activeRun.next_steps || []).map((s, i) => (
                <button key={i}
                        data-testid={`viz-next-step-${i}`}
                        onClick={() => onSend && onSend(s)}
                        className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[12.5px] text-slate-200 hover:bg-[#5139ED]/15 hover:border-[#5139ED]/50 transition-colors">
                  <Sparkles size={12} className="mt-0.5 text-[#a48bff] flex-shrink-0" />
                  <span className="flex-1">{s}</span>
                  <ArrowRight size={12} className="mt-0.5 text-slate-400 group-hover:text-slate-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

// ═════════════════════════════════════════════════════════════════
// COMPOSER (chat input + drag-drop upload)
// ═════════════════════════════════════════════════════════════════
function Composer({ onSend, onAttach, disabled, attachments, onRemoveAttach }) {
  const [value, setValue] = useState("");
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onAttach(files);
  };

  return (
    <div className="border-t border-white/10 bg-black/30 backdrop-blur-xl p-4">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span key={i} data-testid={`attach-chip-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200">
              <Paperclip size={10} />
              {a.name}
              <span className="text-slate-500">
                {a.kind}{a.extracted?.length ? ` · ${a.extracted.length} SMILES` : ""}
              </span>
              <button onClick={() => onRemoveAttach(i)}
                      className="text-slate-500 hover:text-rose-300"><X size={11}/></button>
            </span>
          ))}
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-end gap-2 rounded-2xl border p-2 transition-colors ${
          dragging ? "border-[#5139ED] bg-[#5139ED]/5" : "border-white/15 bg-white/5"
        }`}>
        <button onClick={() => fileRef.current?.click()}
                data-testid="composer-attach-btn"
                className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                title="Attach file (SMILES, CSV, XLSX, MOL, SDF)">
          <Paperclip size={16} />
        </button>
        <input ref={fileRef} type="file" hidden multiple
               accept=".smi,.txt,.csv,.xlsx,.xls,.mol,.sdf"
               onChange={(e) => onAttach(Array.from(e.target.files || []))} />
        <textarea
          data-testid="composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          disabled={disabled}
          placeholder={dragging ? "Drop files to attach…" : "Describe your research question — Enter to send, Shift+Enter for a new line…"}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-40"
        />
        <button data-testid="composer-send-btn"
                onClick={submit}
                disabled={disabled || !value.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 disabled:opacity-40">
          {disabled ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════
export default function ResearchWorkspace() {
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [vizRun, setVizRun] = useState(null);
  const scrollRef = useRef(null);
  const pollRef = useRef(null);

  // ─── Bootstrap ──────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const { data } = await authApi.get("/research/projects");
      setProjects(data || []);
      return data || [];
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load projects");
      return [];
    } finally { setProjectsLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openProject = async (id) => {
    setLoading(true);
    try {
      const { data } = await authApi.get(`/research/projects/${id}`);
      setActiveProject(data);
      setAttachments([]);
      setVizRun(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to open project");
    } finally { setLoading(false); }
  };

  const newProject = async (initialTitle = "New Research") => {
    try {
      const { data } = await authApi.post("/research/projects",
                                          { title: initialTitle });
      await loadProjects();
      setActiveProject(data);
      setVizRun(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create project");
    }
  };

  const deleteProject = async (id) => {
    if (!window.confirm("Delete this research project?")) return;
    try {
      await authApi.delete(`/research/projects/${id}`);
      setProjects((ps) => ps.filter((p) => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete");
    }
  };

  // ─── Auto-scroll on new messages ────────────────────────────────
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeProject?.messages?.length, activeProject?.runs?.length]);

  // ─── Send message ───────────────────────────────────────────────
  const send = async (prompt) => {
    let proj = activeProject;
    if (!proj) {
      const { data } = await authApi.post("/research/projects", { title: prompt.slice(0, 80) });
      proj = data;
      setActiveProject(proj);
      loadProjects();
    }
    setSending(true);
    try {
      const { data } = await authApi.post(
        `/research/projects/${proj.id}/message`,
        { prompt, attachments },
      );
      // Refetch to get authoritative state including new run
      const { data: fresh } = await authApi.get(`/research/projects/${proj.id}`);
      setActiveProject(fresh);
      setAttachments([]);
      loadProjects();
      // Auto-execute if a plan came back
      const newRun = data.run;
      if (newRun?.id) {
        execute(proj.id, newRun.id);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send message");
    } finally { setSending(false); }
  };

  // ─── Execute a run + poll status ────────────────────────────────
  const execute = async (pid, runId) => {
    setExecuting(runId);
    try {
      await authApi.post(`/research/projects/${pid}/execute/${runId}`);
      startPolling(pid, runId);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to start execution");
      setExecuting(null);
    }
  };

  const startPolling = (pid, runId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data: status } = await authApi.get(
          `/research/projects/${pid}/status/${runId}`,
        );
        setActiveProject((cur) => {
          if (!cur) return cur;
          const runs = (cur.runs || []).map((r) =>
            r.id === runId ? { ...r, ...status } : r,
          );
          return { ...cur, runs };
        });
        if (["completed", "failed"].includes(status.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setExecuting(null);
          // Refetch to get any final assistant interpretation message + full run
          const { data: fresh } = await authApi.get(`/research/projects/${pid}`);
          setActiveProject(fresh);
          // Prefer the full run doc from the refetched project — the /status
          // payload can be lean and miss the interpretation string.
          const fullRun = (fresh.runs || []).find((r) => r.id === runId) || status;
          setVizRun(fullRun);
        }
      } catch { /* ignore transient */ }
    }, 1000);
  };
  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), []);

  // ─── Attachments ────────────────────────────────────────────────
  const attach = async (files) => {
    let pid = activeProject?.id;
    if (!pid) {
      const { data } = await authApi.post("/research/projects", { title: "New Research" });
      pid = data.id;
      setActiveProject(data);
      loadProjects();
    }
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await authApi.post(
          `/research/projects/${pid}/upload`, fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        setAttachments((cur) => [...cur, data]);
        toast.success(`Attached ${f.name} (${data.kind}${data.extracted?.length ? `, ${data.extracted.length} SMILES` : ""})`);
      } catch (e) {
        toast.error(e?.response?.data?.detail || `Failed to upload ${f.name}`);
      }
    }
  };

  // ─── Runs indexed for quick lookup ──────────────────────────────
  const runsById = useMemo(() => {
    const m = {};
    for (const r of (activeProject?.runs || [])) m[r.id] = r;
    return m;
  }, [activeProject?.runs]);

  const messages = activeProject?.messages || [];

  return (
    <div data-testid="research-workspace"
         className="fixed inset-0 top-16 flex bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E] text-slate-100">
      <Sidebar projects={projects} activeId={activeProject?.id}
               onSelect={openProject}
               onNew={() => newProject()}
               onDelete={deleteProject}
               loading={projectsLoading} />

      <main className="flex flex-1 flex-col min-w-0">
        {/* Empty state or chat */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {!activeProject ? (
            <EmptyState onPick={(text) => { newProject(text.slice(0, 80)).then(() => setTimeout(() => send(text), 250)); }} />
          ) : (
            <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
              {messages.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm">
                  <Sparkles className="mx-auto text-[#a48bff]" size={22} />
                  <div className="mt-2 text-[15px] font-semibold text-slate-100">Ready when you are.</div>
                  <div className="mt-1 text-[13px] text-slate-400">Type a research question below or pick one of the suggested prompts.</div>
                  <SuggestedPromptsGrid onPick={send} />
                </div>
              )}
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  msg={m}
                  run={m.run_id ? runsById[m.run_id] : null}
                  onExecute={(rid) => execute(activeProject.id, rid)}
                  executing={executing}
                  onOpenRun={setVizRun}
                  onSend={send}
                />
              ))}
              {sending && (
                <div className="flex items-center gap-2 text-[13px] text-slate-400">
                  <Loader2 size={14} className="animate-spin text-[#a48bff]" />
                  Planning workflow with Claude Sonnet 4.5…
                </div>
              )}
            </div>
          )}
        </div>

        <Composer
          onSend={send}
          onAttach={attach}
          disabled={sending || !!executing}
          attachments={attachments}
          onRemoveAttach={(i) => setAttachments((cur) => cur.filter((_, j) => j !== i))}
        />
      </main>

      <VizPanel activeRun={vizRun} onClose={() => setVizRun(null)} onSend={send} />
    </div>
  );
}

function SuggestedPromptsGrid({ onPick }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
      {SUGGESTIONS.map((s, i) => {
        const Icon = s.icon;
        return (
          <button key={i} data-testid={`suggestion-${i}`}
                  onClick={() => onPick(s.text)}
                  className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10 transition-colors">
            <Icon size={16} className="mt-0.5 text-[#a48bff]" />
            <span className="text-[13px] text-slate-200 group-hover:text-white">{s.text}</span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5139ED] to-[#8139ED] shadow-2xl shadow-purple-500/30">
          <Sparkles className="text-white" size={26} />
        </div>
        <h1 className="mt-5 text-[26px] font-bold tracking-tight text-slate-100">
          Your AI Research Assistant
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-400">
          Describe a research question in plain language. I'll orchestrate the right modules —
          plant search, target prediction, disease mapping, ADMET — and cite every source.
        </p>
        <SuggestedPromptsGrid onPick={onPick} />
      </div>
    </div>
  );
}
