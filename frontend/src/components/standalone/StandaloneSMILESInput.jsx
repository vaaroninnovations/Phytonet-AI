// Standalone entry point for the ADMET / Drug-Likeness / Target Prediction
// modules. Same component used by all three so intelligent compound
// resolution goes live across the platform with a single change.
//
// Three input tabs (tab is picked once and remembered per-render):
//   • By name    (default) — resolve a compound via PubChem → curated batch
//   • Paste SMILES         — power-user paste fallback
//   • Batch upload         — CSV/XLSX with name and/or SMILES columns; rows
//                            missing SMILES are auto-resolved by name and
//                            flagged when the resolver can't find them.
//
// Every parsed / resolved row is committed via the page-specific `onCommit`
// prop, or (when not provided) the default SelectionContext push used by
// ADMET/Drug-Likeness. This preserves the existing prediction pipelines.
import { useRef, useState } from "react";
import {
  FlaskConical, Upload, Plus, FileText, Search, Loader2, CheckCircle2,
  XCircle, Trash2, X, Info,
} from "lucide-react";
import { useSelection } from "@/context/SelectionContext";
import { compoundLookup } from "@/lib/api";
import { toast } from "sonner";

const EXAMPLE_ROWS = [
  { name: "Curcumin",     smiles: "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O" },
  { name: "Withaferin A", smiles: "CC1=C2C(=O)C=CC(O)(C2(C)CCC3C1CCC4(C3(CCC4C(=C)C(=O)O5)C)O5)C" },
  { name: "Resveratrol",  smiles: "OC1=CC=C(/C=C/C2=CC(O)=CC(O)=C2)C=C1" },
];

const looksLikeSmiles = (s) =>
  typeof s === "string" && s.trim().length >= 2 && /[A-Za-z]/.test(s) && !/\s{2,}/.test(s);

function parseCsvLikeText(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headerLike = /(smiles|name|compound)/i.test(lines[0]);
  const rows = headerLike ? lines.slice(1) : lines;
  return rows.map((line) => {
    const cols = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length === 1) {
      const c = cols[0];
      // Single-column: SMILES if it looks like one, otherwise treat as name
      return looksLikeSmiles(c) && /[=#()[\]]/.test(c)
        ? { name: "", smiles: c }
        : { name: c, smiles: "" };
    }
    const smi = cols.find((c) => looksLikeSmiles(c) && /[=#()[\]]/.test(c)) || "";
    const nm = cols.find((c) => c !== smi) || "";
    return { name: nm, smiles: smi };
  }).filter((r) => r.smiles || r.name);
}

/* Sequential resolver — throttles PubChem to avoid rate limits + collects
   which rows failed so the user can review. */
async function resolveBatch(rows, onProgress) {
  const resolved = [];
  const unresolved = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.smiles) { resolved.push(r); onProgress?.(i + 1, rows.length); continue; }
    if (!r.name) { unresolved.push({ ...r, reason: "no name / smiles" }); continue; }
    try {
      const d = await compoundLookup(r.name);
      const smi = d.canonical_smiles || d.isomeric_smiles || "";
      if (!smi) { unresolved.push({ ...r, reason: "no SMILES in PubChem entry" }); }
      else {
        resolved.push({
          name: r.name, smiles: smi,
          cid: d.pubchem_cid || null, mw: d.molecular_weight || null,
          formula: d.molecular_formula || null, inchi_key: d.inchi_key || null,
        });
      }
    } catch (e) {
      unresolved.push({ ...r, reason: e?.response?.data?.detail || "lookup failed" });
    }
    onProgress?.(i + 1, rows.length);
  }
  return { resolved, unresolved };
}

export default function StandaloneSMILESInput({
  title = "Analyse compounds",
  subtitle = "Type a compound name and we'll auto-fetch SMILES + full chemistry from PubChem. Or paste / upload SMILES directly for advanced use.",
  onLoaded,
  onCommit,
}) {
  const { setMany, setSourcePlant } = useSelection();
  const [tab, setTab] = useState("name");
  // "By name" state
  const [nameQuery, setNameQuery] = useState("");
  const [resolving, setResolving] = useState(false);
  const [batch, setBatch] = useState([]); // [{name, smiles, cid, mw, formula, inchi_key}]
  // "Paste SMILES" state
  const [text, setText] = useState("");
  // "Batch upload" state
  const [uploading, setUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // {done, total}
  const [unresolvedRows, setUnresolvedRows] = useState([]);
  const fileInputRef = useRef(null);

  const commit = (rows, label = "Standalone input") => {
    if (rows.length === 0) return toast.error("No valid SMILES found");
    const compounds = rows.map((r, i) => ({
      name: r.name || `Compound_${i + 1}`,
      compound_name: r.name || `Compound_${i + 1}`,
      smiles: r.smiles.trim(),
      cid: r.cid ?? null,
      source: r.source || "standalone",
      // Enrichment (available when resolved by name)
      ...(r.mw && { molecular_weight: r.mw }),
      ...(r.formula && { molecular_formula: r.formula }),
      ...(r.inchi_key && { inchi_key: r.inchi_key }),
    }));
    if (onCommit) onCommit(compounds, label);
    else { setMany(compounds, true); setSourcePlant(label); }
    toast.success(`${compounds.length} compound${compounds.length === 1 ? "" : "s"} loaded`);
    onLoaded?.(compounds);
  };

  /* ── Tab 1: By name ─────────────────────────────────────────────── */
  const resolveName = async () => {
    const q = nameQuery.trim();
    if (!q) return toast.error("Enter a compound name");
    if (batch.some((b) => b.name.toLowerCase() === q.toLowerCase())) {
      return toast.info(`${q} is already in the batch`);
    }
    setResolving(true);
    try {
      const d = await compoundLookup(q);
      const smi = d.canonical_smiles || d.isomeric_smiles || "";
      if (!smi) { toast.error(`No SMILES available for “${q}”`); return; }
      setBatch((b) => [...b, {
        name: d.name || q, smiles: smi, cid: d.pubchem_cid || null,
        mw: d.molecular_weight, formula: d.molecular_formula, inchi_key: d.inchi_key,
        source: "resolver",
      }]);
      setNameQuery("");
      toast.success(`Resolved “${q}” → CID ${d.pubchem_cid}`);
    } catch (e) {
      toast.error(`Could not resolve “${q}”: ${e?.response?.data?.detail || "not found"}`);
    } finally { setResolving(false); }
  };

  const submitNameBatch = () => {
    if (batch.length === 0) return toast.error("Add at least one compound");
    commit(batch, `Resolved batch (${batch.length})`);
    setBatch([]);
  };

  /* ── Tab 2: Paste SMILES ────────────────────────────────────────── */
  const submitPasted = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.every((l) => !/[,\t]/.test(l) && looksLikeSmiles(l))
      ? lines.map((s) => ({ name: "", smiles: s }))
      : parseCsvLikeText(text);
    commit(rows, "Pasted SMILES");
  };

  /* ── Tab 3: Batch upload (CSV/XLSX with auto-resolve for name-only rows) ── */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUnresolvedRows([]);
    try {
      const isXlsx = /\.xlsx?$/i.test(file.name);
      let rows = [];
      if (isXlsx) {
        const XLSX = (await import("xlsx")).default || (await import("xlsx"));
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        rows = json.map((r) => ({
          name: String(r.Name || r.name || r.Compound || r.compound_name || r["Compound Name"] || ""),
          smiles: String(r.SMILES || r.smiles || r.Smiles || r["Canonical SMILES"] || ""),
        })).filter((r) => r.smiles || r.name);
      } else {
        rows = parseCsvLikeText(await file.text());
      }
      if (!rows.length) { toast.error("No valid rows found in file"); return; }
      // Auto-resolve any rows that have a name but no SMILES
      const needsResolving = rows.filter((r) => !r.smiles && r.name).length;
      if (needsResolving > 0) {
        toast.message(`Resolving ${needsResolving} compound name${needsResolving === 1 ? "" : "s"}…`);
        setBatchProgress({ done: 0, total: needsResolving });
      }
      const { resolved, unresolved } = await resolveBatch(rows,
        (done, total) => setBatchProgress({ done, total }));
      setBatchProgress(null);
      if (unresolved.length > 0) setUnresolvedRows(unresolved);
      if (resolved.length === 0) { toast.error("No resolvable compounds in file"); return; }
      commit(resolved, `Upload: ${file.name} (${resolved.length}/${rows.length} resolved)`);
    } catch (err) {
      console.error(err);
      toast.error(`Could not parse file: ${err.message || err}`);
    } finally {
      setUploading(false); setBatchProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadExamples = () => commit(EXAMPLE_ROWS, "Curated example set");

  const Tab = ({ id, label, icon: Ic }) => (
    <button
      type="button"
      data-testid={`smiles-tab-${id}`}
      onClick={() => setTab(id)}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition ${
        tab === id
          ? "bg-[#5139ED] text-white shadow-[0_10px_24px_-14px_rgba(81,57,237,0.7)]"
          : "border border-[#E7E7F3] bg-white/70 text-[#374151] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
      }`}
    ><Ic className="h-3.5 w-3.5" />{label}</button>
  );

  return (
    <section data-testid="standalone-smiles-input" className="mx-auto max-w-4xl px-6 pt-14">
      <div className="mb-6 flex items-start gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8139ED]/10 text-[#8139ED]">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B0B18] sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-[15px] text-[#4B5563]">{subtitle}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Tab id="name"   label="By name (recommended)" icon={Search} />
        <Tab id="paste"  label="Paste SMILES"          icon={FileText} />
        <Tab id="upload" label="Batch upload"          icon={Upload} />
      </div>

      {/* ─── TAB: By name ─── */}
      {tab === "name" && (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                data-testid="smiles-name-input"
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resolveName()}
                placeholder="e.g. Curcumin, Quercetin, Metformin"
                className="h-11 w-full rounded-full border border-[#E7E7F3] bg-white pl-10 pr-3 text-[14px] outline-none focus:border-[#8139ED]/50 focus:ring-2 focus:ring-[#8139ED]/20"
              />
            </div>
            <button
              type="button"
              data-testid="smiles-name-resolve"
              onClick={resolveName}
              disabled={resolving || !nameQuery.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#8139ED] px-4 py-2.5 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#6b26cf] disabled:pointer-events-none disabled:opacity-50"
            >
              {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </div>

          {batch.length > 0 && (
            <ul data-testid="smiles-name-batch" className="mt-4 divide-y divide-[#F1F1FA] overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white">
              {batch.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-start gap-3 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2BB673]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
                      {r.name}
                      {r.cid && <span className="rounded-md bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-[10.5px] text-[#475569]">CID {r.cid}</span>}
                      {r.mw && <span className="text-[10.5px] text-[#94A3B8]">{r.mw.toFixed(2)} g/mol</span>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-[#64748B]">{r.smiles}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBatch((b) => b.filter((_, j) => j !== i))}
                    className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-red-500"
                    aria-label={`Remove ${r.name}`}
                  ><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="smiles-name-submit"
              onClick={submitNameBatch}
              disabled={batch.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2.5 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
            >Analyze {batch.length > 0 ? `${batch.length} compound${batch.length === 1 ? "" : "s"}` : "batch"}</button>
            <button
              type="button"
              data-testid="standalone-load-examples"
              onClick={loadExamples}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-[#111827] transition hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            ><Plus className="h-3.5 w-3.5" /> Load curated examples</button>
          </div>
        </div>
      )}

      {/* ─── TAB: Paste SMILES ─── */}
      {tab === "paste" && (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <p className="text-[12px] text-[#64748B]">One SMILES per line, or paste CSV/TSV columns (name, SMILES).</p>
          <textarea
            data-testid="standalone-smiles-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"CCO\nCOc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O\nCurcumin, COc1..."}
            rows={7}
            className="mt-3 w-full resize-y rounded-xl border border-[#E7E7F3] bg-white p-3 font-mono text-[12.5px] text-[#111827] shadow-inner outline-none focus:border-[#5139ED]/60 focus:ring-2 focus:ring-[#5139ED]/20"
          />
          <button
            type="button"
            data-testid="standalone-smiles-submit"
            onClick={submitPasted}
            disabled={!text.trim()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-4 py-2 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
          ><Plus className="h-3.5 w-3.5" /> Analyze pasted SMILES</button>
        </div>
      )}

      {/* ─── TAB: Batch upload ─── */}
      {tab === "upload" && (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <p className="text-[12px] text-[#64748B]">
            Upload CSV/XLSX with a{" "}
            <code className="rounded bg-[#F1F5F9] px-1 py-0.5 text-[11px]">Name</code> or{" "}
            <code className="rounded bg-[#F1F5F9] px-1 py-0.5 text-[11px]">SMILES</code> column
            (or both). Rows missing SMILES are auto-resolved via PubChem.
          </p>
          <label
            htmlFor="standalone-file-upload"
            className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E7E7F3] bg-white/60 p-6 text-center transition hover:border-[#5139ED]/40 hover:bg-white"
          >
            <Upload className="h-6 w-6 text-[#94A3B8]" />
            <span className="text-[12.5px] font-semibold text-[#374151]">
              {uploading ? "Parsing…" : "Click to choose a .csv or .xlsx file"}
            </span>
            <span className="text-[11px] text-[#94A3B8]">Max 5 MB · up to 1 000 rows</span>
            <input
              id="standalone-file-upload"
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xls,.xlsx"
              onChange={onFile}
              className="sr-only"
              data-testid="standalone-file-input"
            />
          </label>

          {batchProgress && (
            <div className="mt-3 rounded-xl border border-[#E7E7F3] bg-[#FAF9FF] p-3 text-[12px] text-[#5139ED]">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Resolving compounds — {batchProgress.done}/{batchProgress.total}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-gradient-to-r from-[#5139ED] to-[#8139ED] transition-all"
                  style={{ width: `${(batchProgress.done / Math.max(1, batchProgress.total)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {unresolvedRows.length > 0 && (
            <div data-testid="unresolved-rows" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-900">
                <Info className="h-3.5 w-3.5" />
                {unresolvedRows.length} compound{unresolvedRows.length === 1 ? "" : "s"} could not be resolved
              </div>
              <ul className="mt-2 max-h-32 overflow-auto space-y-1 text-[11.5px] text-amber-900">
                {unresolvedRows.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <XCircle className="h-3 w-3 shrink-0" />
                    <span className="font-mono">{r.name || r.smiles || "(blank)"}</span>
                    <span className="text-amber-700/70">— {r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
