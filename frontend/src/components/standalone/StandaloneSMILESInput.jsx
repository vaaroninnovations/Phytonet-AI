// Standalone entry point for the ADMET & Drug-Likeness module.
//
// When a user lands on `/admet` directly (via homepage card, not the AI
// Agent), the page has no selected compounds yet. This card lets them
// paste SMILES or upload a CSV/XLSX file directly — the resulting rows
// are pushed into SelectionContext so the rest of the DrugLikeness page
// renders and computes without any workflow prerequisite.
import { useRef, useState } from "react";
import { FlaskConical, Upload, Plus, Trash2, FileText } from "lucide-react";
import { useSelection } from "@/context/SelectionContext";
import { toast } from "sonner";

const EXAMPLE_ROWS = [
  { name: "Curcumin",       smiles: "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O" },
  { name: "Withaferin A",   smiles: "CC1=C2C(=O)C=CC(O)(C2(C)CCC3C1CCC4(C3(CCC4C(=C)C(=O)O5)C)O5)C" },
  { name: "Resveratrol",    smiles: "OC1=CC=C(/C=C/C2=CC(O)=CC(O)=C2)C=C1" },
];

/* Very light SMILES sanity check — permissive, catches empty / whitespace. */
const looksLikeSmiles = (s) =>
  typeof s === "string" &&
  s.trim().length >= 2 &&
  /[A-Za-z]/.test(s) &&
  !/\s{2,}/.test(s);

/* Parse a CSV/TSV/XLSX-exported text blob into [{name, smiles}]. */
function parseCsvLikeText(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  // Detect header
  const headerLike = /(smiles|name|compound)/i.test(lines[0]);
  const rows = headerLike ? lines.slice(1) : lines;
  return rows
    .map((line) => {
      const cols = line.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cols.length === 1) return { name: "", smiles: cols[0] };
      // Heuristic: SMILES typically has no spaces, ends with braces / brackets, contains bonds
      const smi = cols.find((c) => looksLikeSmiles(c) && /[=#()[\]]/.test(c)) || cols[cols.length - 1];
      const nm = cols.find((c) => c !== smi) || "";
      return { name: nm, smiles: smi };
    })
    .filter((r) => looksLikeSmiles(r.smiles));
}

export default function StandaloneSMILESInput({
  title = "Analyse compounds",
  subtitle = "Paste SMILES, upload a CSV/Excel file, or start with a curated example.",
  onLoaded,
  onCommit, // (compounds[]) => void  — page-specific handler (overrides default SelectionContext push)
}) {
  const { setMany, setSourcePlant } = useSelection();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const commit = (rows, label = "Standalone input") => {
    if (rows.length === 0) {
      toast.error("No valid SMILES found");
      return;
    }
    // Normalise each row to the compound shape the rest of the pipeline expects.
    const compounds = rows.map((r, i) => ({
      name: r.name || `Compound_${i + 1}`,
      compound_name: r.name || `Compound_${i + 1}`,
      smiles: r.smiles.trim(),
      cid: null,
      source: "standalone",
    }));
    if (onCommit) {
      // Page-specific handler decides which store gets the compounds
      onCommit(compounds, label);
    } else {
      setMany(compounds, true);
      setSourcePlant(label);
    }
    toast.success(`${compounds.length} compound${compounds.length === 1 ? "" : "s"} loaded`);
    if (onLoaded) onLoaded(compounds);
  };

  const submitPasted = () => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // If every line is a bare SMILES with no comma / tab, treat as one-per-line.
    const rows = lines.every((l) => !/[,\t]/.test(l) && looksLikeSmiles(l))
      ? lines.map((s) => ({ name: "", smiles: s }))
      : parseCsvLikeText(text);
    commit(rows, "Pasted SMILES");
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const isXlsx = /\.xlsx?$/i.test(file.name);
      let rows = [];
      if (isXlsx) {
        // Dynamic import so xlsx is only pulled in when a user uploads a spreadsheet.
        const XLSX = (await import("xlsx")).default || (await import("xlsx"));
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        rows = json
          .map((r) => {
            const smi =
              r.SMILES || r.smiles || r.Smiles || r.smi || r["Canonical SMILES"] || "";
            const nm =
              r.Name || r.name || r.Compound || r.compound_name || r["Compound Name"] || "";
            return { name: String(nm || ""), smiles: String(smi || "") };
          })
          .filter((r) => looksLikeSmiles(r.smiles));
      } else {
        const txt = await file.text();
        rows = parseCsvLikeText(txt);
      }
      commit(rows, `Upload: ${file.name}`);
    } catch (err) {
      console.error(err);
      toast.error(`Could not parse file: ${err.message || err}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loadExamples = () => commit(EXAMPLE_ROWS, "Curated example set");

  return (
    <section
      data-testid="standalone-smiles-input"
      className="mx-auto max-w-4xl px-6 pt-14"
    >
      <div className="mb-8 flex items-start gap-4">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#8139ED]/10 text-[#8139ED]">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#0B0B18] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-[#4B5563]">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Paste */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <FileText className="h-4 w-4 text-[#5139ED]" /> Paste SMILES
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">
            One SMILES per line, or paste CSV/TSV columns (name, SMILES).
          </p>
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
          >
            <Plus className="h-3.5 w-3.5" /> Analyze pasted SMILES
          </button>
        </div>

        {/* Upload */}
        <div className="rounded-3xl border border-[#E7E7F3] bg-white/80 p-5 backdrop-blur">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
            <Upload className="h-4 w-4 text-[#2BB673]" /> Batch upload
          </div>
          <p className="mt-1 text-[12px] text-[#64748B]">
            Upload a CSV or Excel file with a <code className="rounded bg-[#F1F5F9] px-1 py-0.5 text-[11px]">SMILES</code> column (and an optional{" "}
            <code className="rounded bg-[#F1F5F9] px-1 py-0.5 text-[11px]">Name</code> column).
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
          <button
            type="button"
            data-testid="standalone-load-examples"
            onClick={loadExamples}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#111827] transition hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            <Plus className="h-3.5 w-3.5" /> Load curated examples
          </button>
        </div>
      </div>
    </section>
  );
}
