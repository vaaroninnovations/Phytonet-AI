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
import { useState } from "react";
import {
  Atom, Sparkles, Target, Search, Loader2, CheckCircle2, XCircle,
  ExternalLink, FlaskConical, Copy, Play, Info, Dna,
} from "lucide-react";
import { useNetwork } from "@/context/NetworkContext";
import { compoundLookup, targetResolve } from "@/lib/api";
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

/* ─────────────────────────── Main ─────────────────────────── */
export default function StandaloneDockingInput() {
  const { setSelectedCompounds, setCompoundTargets, setIntersectingGenes } = useNetwork();

  const [compoundQuery, setCompoundQuery] = useState("");
  const [compound, setCompound] = useState(null);
  const [compoundBusy, setCompoundBusy] = useState(false);

  const [targetQuery, setTargetQuery] = useState("");
  const [target, setTarget] = useState(null);
  const [targetBusy, setTargetBusy] = useState(false);

  const [advOpen, setAdvOpen] = useState(false);
  const [advSmiles, setAdvSmiles] = useState("");
  const [advUniprot, setAdvUniprot] = useState("");
  const [advPdb, setAdvPdb] = useState("");

  /* Compound resolver */
  const resolveCompound = async () => {
    const q = compoundQuery.trim();
    if (!q) return toast.error("Enter a compound name");
    setCompoundBusy(true);
    try {
      const data = await compoundLookup(q);
      setCompound(data);
      toast.success(`Resolved “${q}” → CID ${data.pubchem_cid}`);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Lookup failed";
      toast.error(`Could not resolve “${q}”: ${detail}`);
    } finally {
      setCompoundBusy(false);
    }
  };

  /* Target resolver */
  const resolveTarget = async () => {
    const q = targetQuery.trim();
    if (!q) return toast.error("Enter a gene symbol or protein name");
    setTargetBusy(true);
    try {
      const data = await targetResolve(q);
      setTarget(data);
      toast.success(`Resolved “${q}” → ${data.uniprot_id}`);
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Lookup failed";
      toast.error(`Could not resolve “${q}”: ${detail}`);
    } finally {
      setTargetBusy(false);
    }
  };

  /* Commit both to the docking pipeline */
  const commit = () => {
    // Compound: prefer resolved > advanced-paste SMILES
    let comp;
    if (compound) {
      comp = {
        name: compound.name,
        compound_name: compound.name,
        smiles: compound.canonical_smiles || compound.isomeric_smiles || "",
        cid: compound.pubchem_cid || null,
        source: "resolver",
      };
    } else if (advSmiles.trim()) {
      comp = { name: "AdvancedInput", compound_name: "AdvancedInput", smiles: advSmiles.trim(), cid: null, source: "advanced" };
    } else {
      return toast.error("Resolve a compound (or paste a SMILES in Advanced) first");
    }
    if (!comp.smiles) return toast.error("Resolved compound has no SMILES — try Advanced paste");

    // Target: prefer resolved > advanced UniProt
    let tgt;
    if (target) {
      tgt = {
        gene_symbol: target.primary_gene || target.uniprot_id,
        uniprot_id: target.uniprot_id,
        protein_name: target.protein_name,
        confidence: 5, score: 1,
        pdb_id: (advPdb.trim() || target.pdb_ids?.[0] || undefined),
      };
    } else if (advUniprot.trim()) {
      tgt = {
        gene_symbol: advUniprot.trim().toUpperCase(),
        uniprot_id: advUniprot.trim().toUpperCase(),
        protein_name: advUniprot.trim().toUpperCase(),
        confidence: 5, score: 1,
        pdb_id: advPdb.trim() || undefined,
      };
    } else {
      return toast.error("Resolve a target (or paste a UniProt ID in Advanced) first");
    }

    setSelectedCompounds([comp]);
    setCompoundTargets([tgt]);
    if (typeof setIntersectingGenes === "function") {
      setIntersectingGenes([tgt.gene_symbol]);
    }
    toast.success("Inputs loaded — configure docking parameters below");
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
            Just type a <strong>compound name</strong> (e.g. Curcumin) and a{" "}
            <strong>protein or gene</strong> (e.g. EGFR). We'll fetch SMILES + PubChem metadata,
            resolve the UniProt entry, and auto-pick the best PDB structure for docking. Advanced
            users can override every field.
          </p>
        </div>
      </div>

      {/* Two-column resolver grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* COMPOUND */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <FlaskConical className="h-4 w-4 text-[#2BB673]" /> Compound
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">Compound name (e.g. Quercetin, Metformin, Aspirin) — PubChem-resolved.</p>
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
              Resolve
            </button>
          </div>
          {compound && <div className="mt-4"><CompoundCard compound={compound} onClear={() => setCompound(null)} /></div>}
        </div>

        {/* TARGET */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <Target className="h-4 w-4 text-[#DB2777]" /> Target
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">Gene symbol or protein name (e.g. EGFR, "Insulin receptor") — UniProt-resolved with auto-PDB pick.</p>
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
              Resolve
            </button>
          </div>
          {target && <div className="mt-4"><TargetCard target={target} onClear={() => setTarget(null)} /></div>}
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
            <Info className="h-3.5 w-3.5" /> Advanced mode — override with raw SMILES / UniProt / PDB
          </span>
          <span className="text-[11px] text-[#94A3B8]">{advOpen ? "hide" : "show"}</span>
        </button>
        {advOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              data-testid="adv-smiles"
              value={advSmiles}
              onChange={(e) => setAdvSmiles(e.target.value)}
              placeholder="Ligand SMILES override"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
            <input
              data-testid="adv-uniprot"
              value={advUniprot}
              onChange={(e) => setAdvUniprot(e.target.value)}
              placeholder="UniProt ID override (e.g. P00533)"
              className="h-9 rounded-lg border border-[#E7E7F3] bg-white px-3 font-mono text-[11.5px] outline-none focus:border-[#5139ED]/50"
            />
            <input
              data-testid="adv-pdb"
              value={advPdb}
              onChange={(e) => setAdvPdb(e.target.value)}
              placeholder="PDB ID override (e.g. 1M17)"
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
          disabled={!compound && !advSmiles.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#DB2777] via-[#8139ED] to-[#5139ED] px-6 py-3 text-[13px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(219,39,119,0.6)] transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Load & continue to docking
        </button>
        <span className="ml-auto text-[11px] text-[#94A3B8]">
          Backend: PubChem · UniProt · RCSB PDB · AutoDock Vina · Open Babel · Meeko
        </span>
      </div>
    </section>
  );
}
