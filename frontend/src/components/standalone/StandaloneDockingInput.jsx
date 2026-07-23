// Standalone entry point for the Molecular Docking module.
//
// When accessed via `/molecular-docking` directly (not through the AI
// Agent workflow), the docking page has no compounds or intersection
// hub genes. This card lets researchers supply both inputs inline:
//   • Ligands  — paste SMILES, upload CSV/XLSX, or load examples.
//   • Targets  — paste UniProt IDs / Gene symbols, one per line.
// The parsed inputs are pushed into NetworkContext (selectedCompounds
// + compoundTargets) so the existing docking workflow renders and runs
// unchanged.
import { useRef, useState } from "react";
import {
  Atom, Upload, Plus, FileText, Dna, Target, Info,
} from "lucide-react";
import { useNetwork } from "@/context/NetworkContext";
import { toast } from "sonner";

const LIGAND_EXAMPLES = [
  { name: "Curcumin",      smiles: "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O" },
  { name: "Withaferin A",  smiles: "CC1=C2C(=O)C=CC(O)(C2(C)CCC3C1CCC4(C3(CCC4C(=C)C(=O)O5)C)O5)C" },
  { name: "Quercetin",     smiles: "OC1=CC(O)=C2C(=O)C(O)=C(OC2=C1)C3=CC(O)=C(O)C=C3" },
];

const TARGET_EXAMPLES = [
  { gene_symbol: "TNF",   uniprot_id: "P01375" },
  { gene_symbol: "IL6",   uniprot_id: "P05231" },
];

const looksLikeSmiles = (s) =>
  typeof s === "string" &&
  s.trim().length >= 2 &&
  /[A-Za-z]/.test(s) &&
  !/\s{2,}/.test(s);

const looksLikeUniprot = (s) =>
  /^[OPQ][0-9][A-Z0-9]{3}[0-9]$|^[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}$/i.test(String(s || "").trim());

function parseLigandCsvText(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headerLike = /(smiles|name|compound)/i.test(lines[0]);
  const rows = headerLike ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const cols = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length === 1) return { name: "", smiles: cols[0] };
      const smi = cols.find((c) => looksLikeSmiles(c) && /[=#()[\]]/.test(c)) || cols[cols.length - 1];
      const nm = cols.find((c) => c !== smi) || "";
      return { name: nm, smiles: smi };
    })
    .filter((r) => looksLikeSmiles(r.smiles));
}

function parseTargetsText(raw) {
  return String(raw || "")
    .split(/[\n,;\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (looksLikeUniprot(t) ? { uniprot_id: t.toUpperCase(), gene_symbol: t.toUpperCase() } : { gene_symbol: t.toUpperCase(), uniprot_id: "" }));
}

export default function StandaloneDockingInput() {
  const {
    setSelectedCompounds: setNetworkCompounds,
    setCompoundTargets,
    setIntersectingGenes,
  } = useNetwork();

  const [ligandText, setLigandText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const commit = (ligands, targets, label = "Standalone docking input") => {
    if (ligands.length === 0) return toast.error("Provide at least one ligand (SMILES)");
    if (targets.length === 0) return toast.error("Provide at least one target (UniProt ID or gene symbol)");

    const compounds = ligands.map((r, i) => ({
      name: r.name || `Ligand_${i + 1}`,
      compound_name: r.name || `Ligand_${i + 1}`,
      smiles: r.smiles.trim(),
      cid: null,
      source: "standalone",
    }));
    const targetRows = targets.map((t) => ({
      gene_symbol: t.gene_symbol,
      uniprot_id: t.uniprot_id || null,
      protein_name: t.gene_symbol,
      confidence: 5,
      score: 1,
    }));

    setNetworkCompounds(compounds);
    setCompoundTargets(targetRows);
    // Force the "intersection" set so the docking priority matrix has entries
    // and the target dropdown is populated regardless of disease overlap.
    if (typeof setIntersectingGenes === "function") {
      setIntersectingGenes(targetRows.map((t) => t.gene_symbol));
    }
    toast.success(`${compounds.length} ligand${compounds.length === 1 ? "" : "s"} × ${targetRows.length} target${targetRows.length === 1 ? "" : "s"} loaded (${label})`);
  };

  const submit = () => {
    const ligands = ligandText.split(/\r?\n/).every((l) => !/[,\t]/.test(l) && looksLikeSmiles(l.trim()))
      ? ligandText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((s) => ({ name: "", smiles: s }))
      : parseLigandCsvText(ligandText);
    const targets = parseTargetsText(targetText);
    commit(ligands, targets, "Manual paste");
  };

  const onLigandFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isXlsx = /\.xlsx?$/i.test(file.name);
      let rows;
      if (isXlsx) {
        const XLSX = (await import("xlsx")).default || (await import("xlsx"));
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        rows = json
          .map((r) => ({
            name: String(r.Name || r.name || r.Compound || r.compound_name || ""),
            smiles: String(r.SMILES || r.smiles || r.Smiles || r["Canonical SMILES"] || ""),
          }))
          .filter((r) => looksLikeSmiles(r.smiles));
      } else {
        rows = parseLigandCsvText(await file.text());
      }
      if (!rows.length) return toast.error("No valid SMILES found in file");
      // Merge with any manual text
      const manual = ligandText.trim() ? parseLigandCsvText(ligandText) : [];
      const combined = [...manual, ...rows];
      const targets = parseTargetsText(targetText);
      commit(combined, targets, `Upload: ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error(`Could not parse file: ${err.message || err}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadExamples = () => commit(LIGAND_EXAMPLES, TARGET_EXAMPLES, "Curated example set");

  return (
    <section
      data-testid="standalone-docking-input"
      className="mx-auto max-w-5xl px-6 pt-14"
    >
      <div className="mb-8 flex items-start gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DB2777]/10 text-[#DB2777]">
          <Atom className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B0B18] sm:text-4xl">
            Molecular Docking
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] text-[#4B5563]">
            Provide ligands (SMILES) and targets (UniProt ID or Gene symbol). We'll auto-download the
            best PDB structure for each target, prepare the receptor with Open Babel, and run
            AutoDock Vina for every ligand × target pair.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* LIGANDS */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <FileText className="h-4 w-4 text-[#5139ED]" /> Ligands (SMILES)
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">One SMILES per line — or paste CSV columns (name, SMILES).</p>
          <textarea
            data-testid="dock-ligand-textarea"
            value={ligandText}
            onChange={(e) => setLigandText(e.target.value)}
            placeholder={"Curcumin, COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O\nQuercetin, OC1=CC(O)=C2..."}
            rows={7}
            className="mt-3 w-full resize-y rounded-xl border border-[#E7E7F3] bg-white p-3 font-mono text-[12.5px] text-[#111827] shadow-inner outline-none focus:border-[#5139ED]/60 focus:ring-2 focus:ring-[#5139ED]/20"
          />
          <label
            htmlFor="dock-ligand-file"
            className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E7E7F3] bg-white/60 px-3 py-3 text-[12.5px] font-semibold text-[#374151] transition hover:border-[#5139ED]/40 hover:bg-white"
          >
            <Upload className="h-4 w-4 text-[#94A3B8]" />
            {uploading ? "Parsing…" : "Batch upload — CSV or XLSX"}
            <input
              id="dock-ligand-file"
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,.xls,.xlsx"
              onChange={onLigandFile}
              className="sr-only"
              data-testid="dock-ligand-file"
            />
          </label>
        </div>

        {/* TARGETS */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <Target className="h-4 w-4 text-[#DB2777]" /> Targets
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">UniProt IDs or gene symbols — one per line, or space/comma separated.</p>
          <textarea
            data-testid="dock-target-textarea"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            placeholder={"P01375\nP05231\nTNF, IL6, EGFR"}
            rows={7}
            className="mt-3 w-full resize-y rounded-xl border border-[#E7E7F3] bg-white p-3 font-mono text-[12.5px] text-[#111827] shadow-inner outline-none focus:border-[#5139ED]/60 focus:ring-2 focus:ring-[#5139ED]/20"
          />
          <div className="mt-3 rounded-xl border border-[#E7E7F3] bg-[#FDF4FF] p-3">
            <div className="flex items-start gap-2 text-[11.5px] text-[#701A75]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Best PDB structure is auto-fetched from RCSB. Advanced options
                (custom PDB upload, grid box override, flexibility) available on
                the docking page after inputs are loaded.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="dock-submit"
          onClick={submit}
          disabled={!ligandText.trim() || !targetText.trim()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#DB2777] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(219,39,119,0.6)] transition hover:-translate-y-0.5 hover:bg-[#be1e6a] disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Load inputs & continue
        </button>
        <button
          type="button"
          data-testid="dock-load-examples"
          onClick={loadExamples}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#111827] transition hover:border-[#DB2777]/40 hover:text-[#DB2777]"
        >
          <Dna className="h-4 w-4" /> Load curated examples
        </button>
        <span className="ml-auto text-[11px] text-[#94A3B8]">
          Backend: AutoDock Vina · RCSB PDB · Open Babel · Meeko
        </span>
      </div>
    </section>
  );
}
