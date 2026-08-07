// PhytoNet AI — Intelligent Molecular Docking Assistant (standalone entry).
//
// This replaces the previous raw-paste input on `/molecular-docking`. Users
// type a compound *name* and a target *gene / protein name*; the platform
// resolves everything (SMILES, InChI, IUPAC, UniProt entry, best PDBs) via
// PubChem + UniProt REST APIs. Advanced users can fall back to pasting a
// SMILES or a UniProt ID to override the resolver.
//
// Once both a compound and a target are locked in, the "Load & continue"
// action pushes them into NetworkContext so the existing AutoDock Vina
// pipeline mounted below renders unchanged.
import { useState, useRef } from "react";
import {
  Atom, Sparkles, Target, Search, Loader2, CheckCircle2, XCircle,
  ExternalLink, FlaskConical, Copy, Play, Info, Dna, Upload, ListPlus,
} from "lucide-react";
import { useNetwork } from "@/context/NetworkContext";
import { compoundLookup, targetResolve } from "@/lib/api";
import { authApi } from "@/context/AuthContext";
import { toast } from "sonner";

/* ────────────────────── Compound resolver card ────────────────────── */
function CompoundCard({ compound, onClear }) {
  return (
    <div data-testid="compound-resolved-card" className="rounded-2xl border border-[#2BB673]/30 bg-[#F0FDF4] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2BB673]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved compound
          </div>
          <div className="mt-1 font-headline text-[16px] font-bold text-[#0F172A]">{compound.name}</div>
          {compound.iupac_name && (
            <div className="mt-0.5 text-[11.5px] italic text-[#4B5563]">{compound.iupac_name}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          data-testid="clear-compound"
          className="rounded-md p-1 text-[#94A3B8] transition hover:bg-white hover:text-red-500"
          aria-label="Clear compound"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <div><dt className="text-[#94A3B8]">Formula</dt><dd className="mt-0.5 font-mono text-[#0F172A]">{compound.molecular_formula || "—"}</dd></div>
        <div><dt className="text-[#94A3B8]">MW</dt><dd className="mt-0.5 text-[#0F172A]">{compound.molecular_weight ? `${compound.molecular_weight.toFixed(2)} g/mol` : "—"}</dd></div>
        <div><dt className="text-[#94A3B8]">PubChem CID</dt><dd className="mt-0.5 text-[#0F172A]">{compound.pubchem_cid || "—"}</dd></div>
        <div><dt className="text-[#94A3B8]">InChIKey</dt><dd className="mt-0.5 truncate font-mono text-[10.5px] text-[#0F172A]">{compound.inchi_key || "—"}</dd></div>
      </dl>
      {compound.canonical_smiles && (
        <div className="mt-3 rounded-lg bg-white/70 p-2 font-mono text-[11px] text-[#0F172A]">
          <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">SMILES</span>
          <div className="mt-0.5 break-all">{compound.canonical_smiles}</div>
        </div>
      )}
      {compound.synonyms?.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] uppercase tracking-wider text-[#94A3B8]">Also known as</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {compound.synonyms.slice(0, 6).map((s) => (
              <span key={s} className="rounded-full border border-[#E7E7F3] bg-white px-2 py-0.5 text-[10.5px] text-[#374151]">{s}</span>
            ))}
          </div>
        </div>
      )}
      {compound.pubchem_url && (
        <a href={compound.pubchem_url} target="_blank" rel="noreferrer"
           className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#2BB673] hover:underline">
          View on PubChem <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ────────────────────── Target resolver card ────────────────────── */
function TargetCard({ target, onClear }) {
  return (
    <div data-testid="target-resolved-card" className="rounded-2xl border border-[#DB2777]/30 bg-[#FDF2F8] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#DB2777]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved target
          </div>
          <div className="mt-1 font-headline text-[16px] font-bold text-[#0F172A]">{target.protein_name}</div>
          <div className="mt-0.5 text-[11.5px] text-[#4B5563]">
            {target.primary_gene && <><span className="font-semibold">{target.primary_gene}</span> · </>}
            {target.organism}
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          data-testid="clear-target"
          className="rounded-md p-1 text-[#94A3B8] transition hover:bg-white hover:text-red-500"
          aria-label="Clear target"
        >
          <XCircle className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <div><dt className="text-[#94A3B8]">UniProt</dt><dd className="mt-0.5 font-mono text-[#0F172A]">{target.uniprot_id}</dd></div>
        <div><dt className="text-[#94A3B8]">Length</dt><dd className="mt-0.5 text-[#0F172A]">{target.sequence_length ? `${target.sequence_length} aa` : "—"}</dd></div>
        <div className="col-span-2"><dt className="text-[#94A3B8]">Available PDB structures ({target.pdb_ids?.length || 0})</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {target.pdb_ids?.length > 0
              ? target.pdb_ids.slice(0, 12).map((p, i) => (
                  <span key={p}
                        className={`rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] ${i === 0 ? "border-[#DB2777]/40 bg-white text-[#DB2777]" : "border-[#E7E7F3] bg-white text-[#374151]"}`}>
                    {p}{i === 0 && " ★"}
                  </span>
                ))
              : <span className="text-[11px] italic text-[#94A3B8]">no experimental PDB — will use AlphaFold fallback</span>}
          </dd></div>
      </dl>
      {target.function && (
        <div className="mt-3 rounded-lg bg-white/70 p-2 text-[11.5px] leading-relaxed text-[#374151]">
          <span className="text-[10px] uppercase tracking-wider text-[#94A3B8]">Function</span>
          <p className="mt-0.5">{target.function}</p>
        </div>
      )}
      {target.uniprot_url && (
        <a href={target.uniprot_url} target="_blank" rel="noreferrer"
           className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#DB2777] hover:underline">
          View on UniProt <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/* ────────── Bulk import — CSV upload + multi-line paste ────────── */
/**
 * Parses either a plain multi-line text (one entry per line) or a CSV file
 * with headers. For CSV we prefer these column names (case-insensitive):
 *   Compound side: "smiles" > "compound" > "name"
 *   Target side:   "uniprot" > "target" > "gene" > "name"
 * Every value gets trimmed; empty lines and duplicates are dropped.
 */
function parseBulkInput(raw, preferCols) {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // CSV detection: header line contains any of the preferred columns.
  const first = lines[0].toLowerCase();
  const looksCsv = first.includes(",") && preferCols.some((c) => first.includes(c));
  if (looksCsv) {
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    let col = -1;
    for (const c of preferCols) {
      const idx = headers.indexOf(c);
      if (idx !== -1) { col = idx; break; }
    }
    if (col === -1) col = 0; // fall back to first column
    return lines
      .slice(1)
      .map((row) => (row.split(",")[col] || "").trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  // Plain text — one entry per line, or comma-separated on a single line
  if (lines.length === 1 && lines[0].includes(",")) {
    return lines[0].split(",").map((v) => v.trim()).filter(Boolean);
  }
  return lines;
}

function BulkImportPanel({ kind, resolver, existingKey, onAdded, onClose, color }) {
  // kind: 'compound' | 'target'   resolver: async (query) => resolved obj
  const [raw, setRaw] = useState("");
  const [progress, setProgress] = useState(null); // {done, total, current}
  const inputRef = useRef(null);

  const readFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    setRaw(text);
  };

  const run = async () => {
    const cols = kind === "compound"
      ? ["smiles", "compound", "name"]
      : ["uniprot", "target", "gene", "name"];
    const entries = Array.from(new Set(parseBulkInput(raw, cols)));
    if (!entries.length) {
      toast.error("Nothing to import — paste at least one entry per line");
      return;
    }
    setProgress({ done: 0, total: entries.length, current: entries[0] });
    let ok = 0, skipped = 0, failed = 0;
    for (let i = 0; i < entries.length; i++) {
      const q = entries[i];
      setProgress({ done: i, total: entries.length, current: q });
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await resolver(q);
        const key = existingKey(data);
        // De-dup vs already-added entries via the parent callback
        const added = onAdded(data, key);
        if (added) ok++; else skipped++;
      } catch {
        failed++;
      }
    }
    setProgress(null);
    setRaw("");
    toast.success(`Bulk import: ${ok} added, ${skipped} duplicates, ${failed} failed`);
    onClose();
  };

  return (
    <div
      data-testid={`${kind}-bulk-panel`}
      className="mt-3 rounded-2xl border border-dashed border-[#5139ED]/40 bg-[#F5F3FE]/60 p-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-[#5139ED]">
          <ListPlus className="h-3.5 w-3.5" /> Bulk import — paste one per line OR upload a CSV
        </div>
        <button
          onClick={onClose}
          data-testid={`${kind}-bulk-close`}
          className="text-[11px] text-[#94A3B8] hover:text-[#5139ED]"
        >
          close
        </button>
      </div>
      <textarea
        data-testid={`${kind}-bulk-textarea`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={5}
        placeholder={
          kind === "compound"
            ? "curcumin\nquercetin\nresveratrol\n\n… or paste CSV with a `compound` or `smiles` column"
            : "EGFR\nAKT1\nTP53\n\n… or paste CSV with a `target` or `uniprot` column"
        }
        className="mt-2 h-28 w-full resize-y rounded-lg border border-[#E7E7F3] bg-white p-2 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50 focus:ring-2 focus:ring-[#5139ED]/15"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          data-testid={`${kind}-bulk-file`}
          onChange={(e) => readFile(e.target.files?.[0])}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!!progress}
          className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40"
        >
          <Upload className="h-3 w-3" /> Upload CSV / TXT
        </button>
        <button
          data-testid={`${kind}-bulk-run`}
          onClick={run}
          disabled={!!progress || !raw.trim()}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold text-white transition disabled:pointer-events-none disabled:opacity-50"
          style={{ background: color }}
        >
          {progress ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
          {progress ? `Resolving ${progress.done}/${progress.total}…` : "Import & resolve all"}
        </button>
        {progress && (
          <span className="truncate text-[10.5px] text-[#64748B]" data-testid={`${kind}-bulk-progress`}>
            Current: {progress.current}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Main ─────────────────────────── */
export default function StandaloneDockingInput() {
  const { setSelectedCompounds, setCompoundTargets, setIntersectingGenes } = useNetwork();

  // NOTE: this page now supports MULTIPLE compounds + targets. The resolver
  // fields still handle one lookup at a time, but each successful resolve is
  // added to the list. Docking will run the full N × M cross-product.
  const [compoundQuery, setCompoundQuery] = useState("");
  const [compoundBusy, setCompoundBusy] = useState(false);
  const [compoundList, setCompoundList] = useState([]);    // resolved compounds
  const [compoundBulkOpen, setCompoundBulkOpen] = useState(false);

  const [targetQuery, setTargetQuery] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [targetList, setTargetList] = useState([]);        // resolved targets
  const [targetBulkOpen, setTargetBulkOpen] = useState(false);

  const [advOpen, setAdvOpen] = useState(false);
  const [advSmiles, setAdvSmiles] = useState("");
  const [advSmilesName, setAdvSmilesName] = useState("");
  const [advUniprot, setAdvUniprot] = useState("");
  const [advPdb, setAdvPdb] = useState("");

  /* Compound resolver — appends to the list on success */
  const resolveCompound = async () => {
    const q = compoundQuery.trim();
    if (!q) return toast.error("Enter a compound name");
    if (compoundList.some((c) => (c.name || "").toLowerCase() === q.toLowerCase())) {
      return toast.info(`“${q}” is already in the list`);
    }
    setCompoundBusy(true);
    try {
      const data = await compoundLookup(q);
      setCompoundList((prev) => [...prev, data]);
      setCompoundQuery("");
      toast.success(`Added ${data.name} (CID ${data.pubchem_cid}) — ${compoundList.length + 1} compound(s)`);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Lookup failed";
      toast.error(`Could not resolve “${q}”: ${detail}`);
    } finally {
      setCompoundBusy(false);
    }
  };

  /* Target resolver — appends to the list on success */
  const resolveTarget = async () => {
    const q = targetQuery.trim();
    if (!q) return toast.error("Enter a gene symbol or protein name");
    if (targetList.some((t) => (t.uniprot_id || "").toLowerCase() === q.toLowerCase()
                              || (t.primary_gene || "").toLowerCase() === q.toLowerCase())) {
      return toast.info(`“${q}” is already in the list`);
    }
    setTargetBusy(true);
    try {
      const data = await targetResolve(q);
      setTargetList((prev) => [...prev, data]);
      setTargetQuery("");
      toast.success(`Added ${data.primary_gene || data.uniprot_id} — ${targetList.length + 1} target(s)`);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Lookup failed";
      toast.error(`Could not resolve “${q}”: ${detail}`);
    } finally {
      setTargetBusy(false);
    }
  };

  const removeCompound = (idx) =>
    setCompoundList((prev) => prev.filter((_, i) => i !== idx));
  const removeTarget = (idx) =>
    setTargetList((prev) => prev.filter((_, i) => i !== idx));

  /** Push all resolved compounds + targets to the docking pipeline. Docking
   *  runs the full cross-product (N compounds × M targets). */
  const commit = () => {
    const comps = compoundList.map((c) => ({
      name: c.name,
      compound_name: c.name,
      smiles: c.canonical_smiles || c.isomeric_smiles || "",
      cid: c.pubchem_cid || null,
      source: "resolver",
    }));
    // Advanced-mode single SMILES falls back if the list is empty
    if (comps.length === 0 && advSmiles.trim()) {
      comps.push({
        name: advSmilesName.trim() || "AdvancedInput",
        compound_name: advSmilesName.trim() || "AdvancedInput",
        smiles: advSmiles.trim(),
        cid: null,
        source: "advanced",
      });
    }
    if (comps.length === 0) return toast.error("Add at least one compound first");
    if (comps.some((c) => !c.smiles)) return toast.error("Some compounds have no SMILES");

    const tgts = targetList.map((t) => ({
      gene_symbol: t.primary_gene || t.uniprot_id,
      uniprot_id: t.uniprot_id,
      protein_name: t.protein_name,
      confidence: 5, score: 1,
      pdb_id: t.pdb_ids?.[0] || t.pdb_id || undefined,
      // Preserve the local-PDB path so the downstream docking pipeline
      // skips the RCSB fetch for user-uploaded receptors.
      pdb_upload_path: t.pdb_upload_path || undefined,
    }));
    if (tgts.length === 0 && advUniprot.trim()) {
      tgts.push({
        gene_symbol: advUniprot.trim().toUpperCase(),
        uniprot_id: advUniprot.trim().toUpperCase(),
        protein_name: advUniprot.trim().toUpperCase(),
        confidence: 5, score: 1,
        pdb_id: advPdb.trim() || undefined,
      });
    }
    if (tgts.length === 0) return toast.error("Add at least one target first");

    setSelectedCompounds(comps);
    setCompoundTargets(tgts);
    if (typeof setIntersectingGenes === "function") {
      setIntersectingGenes(tgts.map((t) => t.gene_symbol));
    }
    toast.success(
      `Loaded ${comps.length} compound(s) × ${tgts.length} target(s) = ${comps.length * tgts.length} docking pair(s)`
    );
  };

  return (
    <section
      data-testid="standalone-docking-input"
      className="mx-auto max-w-6xl px-6 pt-14"
    >
      {/* Hero */}
      <div className="mb-6 flex items-start gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DB2777]/10 text-[#DB2777]">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B0B18] sm:text-4xl">
            Intelligent Docking Assistant
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] text-[#4B5563]">
            Add one or more <strong>compounds</strong> (e.g. Curcumin, Quercetin) and one or more{" "}
            <strong>protein targets</strong> (e.g. EGFR, AKT1). Every compound will be docked against
            every target, producing a full N × M binding matrix. Advanced users can override every field.
          </p>
        </div>
      </div>

      {/* Two-column resolver grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* COMPOUND */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center justify-between text-[13px] font-semibold text-[#111827]">
            <span className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-[#2BB673]" /> Compounds
            </span>
            <span
              data-testid="compound-count"
              className="rounded-full bg-[#2BB673]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#2BB673]"
            >
              {compoundList.length} added
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">Search by name — each successful resolve is added to the list below.</p>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                data-testid="compound-input"
                value={compoundQuery}
                onChange={(e) => setCompoundQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resolveCompound()}
                placeholder="e.g. Curcumin"
                className="h-10 w-full rounded-full border border-[#E7E7F3] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#2BB673]/50 focus:ring-2 focus:ring-[#2BB673]/20"
              />
            </div>
            <button
              type="button"
              data-testid="compound-resolve"
              onClick={resolveCompound}
              disabled={compoundBusy || !compoundQuery.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2BB673] px-4 py-2 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#22986a] disabled:pointer-events-none disabled:opacity-50"
            >
              {compoundBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Add
            </button>
            <button
              type="button"
              data-testid="compound-bulk-toggle"
              onClick={() => setCompoundBulkOpen((v) => !v)}
              title="Import multiple compounds from a list or CSV"
              className="inline-flex items-center gap-1 rounded-full border border-[#2BB673]/40 bg-white px-3 py-2 text-[11.5px] font-semibold text-[#2BB673] hover:bg-[#F0FDF4]"
            >
              <ListPlus className="h-3.5 w-3.5" /> Bulk
            </button>
          </div>
          {compoundBulkOpen && (
            <BulkImportPanel
              kind="compound"
              color="#2BB673"
              resolver={compoundLookup}
              existingKey={(d) => (d.name || "").toLowerCase() + ":" + (d.pubchem_cid || "")}
              onClose={() => setCompoundBulkOpen(false)}
              onAdded={(data) => {
                const key = (data.name || "").toLowerCase();
                let added = false;
                setCompoundList((prev) => {
                  if (prev.some((c) => (c.name || "").toLowerCase() === key)) return prev;
                  added = true;
                  return [...prev, data];
                });
                return added;
              }}
            />
          )}
          {compoundList.length > 0 && (
            <ul data-testid="compound-list" className="mt-4 space-y-2">
              {compoundList.map((c, i) => (
                <li key={`${c.pubchem_cid || c.name}-${i}`}
                    data-testid={`compound-chip-${i}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#2BB673]/30 bg-[#F0FDF4] px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-semibold text-[#065F46]">{c.name}</div>
                    <div className="truncate font-mono text-[10.5px] text-[#059669]">
                      CID {c.pubchem_cid} · {(c.canonical_smiles || c.isomeric_smiles || "").slice(0, 42)}{(c.canonical_smiles || "").length > 42 ? "…" : ""}
                    </div>
                  </div>
                  <button data-testid={`remove-compound-${i}`} onClick={() => removeCompound(i)}
                          className="shrink-0 rounded-full p-1 text-[#059669] hover:bg-[#2BB673]/20">
                    <XCircle className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* TARGET */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center justify-between text-[13px] font-semibold text-[#111827]">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[#DB2777]" /> Targets
            </span>
            <span
              data-testid="target-count"
              className="rounded-full bg-[#DB2777]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#DB2777]"
            >
              {targetList.length} added
            </span>
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">Search gene symbol or protein name — each resolve is added to the list.</p>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Dna className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <input
                data-testid="target-input"
                value={targetQuery}
                onChange={(e) => setTargetQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resolveTarget()}
                placeholder="e.g. EGFR or Epidermal Growth Factor Receptor"
                className="h-10 w-full rounded-full border border-[#E7E7F3] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#DB2777]/50 focus:ring-2 focus:ring-[#DB2777]/20"
              />
            </div>
            <button
              type="button"
              data-testid="target-resolve"
              onClick={resolveTarget}
              disabled={targetBusy || !targetQuery.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-4 py-2 text-[12.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#be1e6a] disabled:pointer-events-none disabled:opacity-50"
            >
              {targetBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Add
            </button>
            <button
              type="button"
              data-testid="target-bulk-toggle"
              onClick={() => setTargetBulkOpen((v) => !v)}
              title="Import multiple targets from a list or CSV"
              className="inline-flex items-center gap-1 rounded-full border border-[#DB2777]/40 bg-white px-3 py-2 text-[11.5px] font-semibold text-[#DB2777] hover:bg-[#FDF2F8]"
            >
              <ListPlus className="h-3.5 w-3.5" /> Bulk
            </button>
            <label
              data-testid="target-upload-pdb"
              title="Upload a local PDB file to use as a docking receptor"
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#5139ED]/40 bg-white px-3 py-2 text-[11.5px] font-semibold text-[#5139ED] hover:bg-[#F5F3FE]"
            >
              <ListPlus className="h-3.5 w-3.5" /> Upload PDB
              <input
                type="file"
                accept=".pdb,.ent,chemical/x-pdb"
                className="hidden"
                data-testid="target-upload-pdb-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  setTargetBusy(true);
                  try {
                    const { data } = await authApi.post("/docking/upload-pdb", fd, {
                      headers: { "Content-Type": "multipart/form-data" },
                    });
                    const key = (data.uniprot_id || "").toLowerCase();
                    let added = false;
                    setTargetList((prev) => {
                      if (prev.some((t) => (t.uniprot_id || "").toLowerCase() === key)) return prev;
                      added = true;
                      return [...prev, { ...data, _uploaded: true }];
                    });
                    if (added) toast.success(`Uploaded ${file.name} (${data.pdb_id})`);
                    else toast.info("That PDB is already in the target list.");
                  } catch (err) {
                    toast.error(err?.response?.data?.detail
                      || `Upload failed: ${err.message || err}`);
                  } finally {
                    setTargetBusy(false);
                  }
                }}
              />
            </label>
          </div>
          {targetBulkOpen && (
            <BulkImportPanel
              kind="target"
              color="#DB2777"
              resolver={targetResolve}
              existingKey={(d) => (d.uniprot_id || "").toLowerCase()}
              onClose={() => setTargetBulkOpen(false)}
              onAdded={(data) => {
                const key = (data.uniprot_id || "").toLowerCase();
                let added = false;
                setTargetList((prev) => {
                  if (prev.some((t) => (t.uniprot_id || "").toLowerCase() === key)) return prev;
                  added = true;
                  return [...prev, data];
                });
                return added;
              }}
            />
          )}
          {targetList.length > 0 && (
            <ul data-testid="target-list" className="mt-4 space-y-2">
              {targetList.map((t, i) => (
                <li key={`${t.uniprot_id}-${i}`}
                    data-testid={`target-chip-${i}`}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                      t._uploaded ? "border-[#5139ED]/40 bg-[#F5F3FE]"
                                  : "border-[#DB2777]/30 bg-[#FDF2F8]"}`}>
                  <div className="min-w-0">
                    <div className={`truncate text-[12.5px] font-semibold ${
                      t._uploaded ? "text-[#3E28C4]" : "text-[#831843]"}`}>
                      {t.primary_gene || t.uniprot_id}{t.protein_name && t.primary_gene ? ` — ${t.protein_name}` : ""}
                      {t._uploaded && (
                        <span data-testid={`target-chip-${i}-uploaded-badge`}
                              className="ml-1.5 inline-block rounded-full bg-[#5139ED] px-1.5 py-0 text-[9px] font-bold uppercase tracking-widest text-white">
                          Uploaded
                        </span>
                      )}
                    </div>
                    <div className={`truncate font-mono text-[10.5px] ${
                      t._uploaded ? "text-[#5139ED]" : "text-[#BE185D]"}`}>
                      {t._uploaded
                        ? `Local PDB · ${t.pdb_id || "USR"}`
                        : `UniProt ${t.uniprot_id}${t.pdb_ids?.[0] ? ` · PDB ${t.pdb_ids[0]}` : ""}`}
                    </div>
                  </div>
                  <button data-testid={`remove-target-${i}`} onClick={() => removeTarget(i)}
                          className={`shrink-0 rounded-full p-1 hover:bg-white/40 ${
                            t._uploaded ? "text-[#5139ED]" : "text-[#BE185D]"}`}>
                    <XCircle className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Advanced mode */}
      <div className="mt-6 rounded-2xl border border-[#E7E7F3] bg-white/60 p-4 backdrop-blur">
        <button
          type="button"
          onClick={() => setAdvOpen((v) => !v)}
          data-testid="advanced-toggle"
          className="flex w-full items-center justify-between gap-2 text-left text-[12px] font-semibold text-[#5139ED]"
        >
          <span className="inline-flex items-center gap-2">
            <Info className="h-3.5 w-3.5" /> Advanced mode — override with raw SMILES / UniProt / PDB (used only when the lists above are empty)
          </span>
          <span className="text-[11px] text-[#94A3B8]">{advOpen ? "hide" : "show"}</span>
        </button>
        {advOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              data-testid="adv-smiles-name"
              value={advSmilesName}
              onChange={(e) => setAdvSmilesName(e.target.value)}
              placeholder="Compound name (optional)"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
            <input
              data-testid="adv-smiles"
              value={advSmiles}
              onChange={(e) => setAdvSmiles(e.target.value)}
              placeholder="Ligand SMILES"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
            <input
              data-testid="adv-uniprot"
              value={advUniprot}
              onChange={(e) => setAdvUniprot(e.target.value)}
              placeholder="UniProt ID (e.g. P00533)"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
            <input
              data-testid="adv-pdb"
              value={advPdb}
              onChange={(e) => setAdvPdb(e.target.value)}
              placeholder="PDB ID (e.g. 1M17)"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
          </div>
        )}
      </div>

      {/* Commit */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="dock-submit"
          onClick={commit}
          disabled={compoundList.length === 0 && !advSmiles.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#DB2777] via-[#8139ED] to-[#5139ED] px-6 py-3 text-[13px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(219,39,119,0.6)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Load {compoundList.length || 1} × {targetList.length || 1} = {(compoundList.length || 1) * (targetList.length || 1)} pair(s)
        </button>
        <span className="ml-auto text-[11px] text-[#94A3B8]">
          Backend: PubChem · UniProt · RCSB PDB · AutoDock Vina · Open Babel · Meeko
        </span>
      </div>
    </section>
  );
}
