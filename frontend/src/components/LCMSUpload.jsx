import { useCallback, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, X, CheckCircle2 } from "lucide-react";

const REQUIRED_COLUMNS = [
  "Compound Name",
  "Molecular Formula",
  "Molecular Weight",
  "Retention Time (RT)",
];

const COL_ALIASES = {
  compound_name: [
    "compound name",
    "compound",
    "name",
    "compoundname",
  ],
  molecular_formula: [
    "molecular formula",
    "formula",
    "molformula",
    "molecular_formula",
    "molecularformula",
  ],
  molecular_weight: [
    "molecular weight",
    "mw",
    "molweight",
    "molecular_weight",
    "molecularweight",
    "mol weight",
  ],
  retention_time: [
    "retention time",
    "retention time (rt)",
    "rt",
    "retention_time",
    "retentiontime",
    "rt (min)",
  ],
};

function mapRow(row) {
  const norm = {};
  Object.keys(row).forEach((k) => {
    norm[String(k).trim().toLowerCase()] = row[k];
  });
  const pick = (aliases) => {
    for (const a of aliases) if (a in norm) return norm[a];
    return undefined;
  };
  return {
    source: "LC-MS",
    compound_name: pick(COL_ALIASES.compound_name) ?? "",
    molecular_formula: pick(COL_ALIASES.molecular_formula) ?? "",
    molecular_weight: (() => {
      const v = pick(COL_ALIASES.molecular_weight);
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    })(),
    retention_time: (() => {
      const v = pick(COL_ALIASES.retention_time);
      const n = Number(v);
      return Number.isFinite(n) ? n : v ?? undefined;
    })(),
  };
}

/**
 * Optional LC-MS upload card. Parses .xlsx / .csv client-side and reports a
 * concise summary. If a file is provided, downstream modules should use these
 * compounds; otherwise they fall back to the Plant Database extraction.
 */
export default function LCMSUpload({ onLoaded }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  const handleFile = useCallback(
    async (file) => {
      setError("");
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "csv"].includes(ext)) {
        setError("Please upload a .xlsx or .csv file.");
        toast.error("Unsupported file type — use .xlsx or .csv");
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const parsed = rows
          .map(mapRow)
          .filter((r) => r.compound_name || r.molecular_formula);
        setFileName(file.name);
        setCount(parsed.length);
        onLoaded && onLoaded({ file: file.name, compounds: parsed });
        toast.success(`Loaded ${parsed.length} LC-MS compound${parsed.length === 1 ? "" : "s"}`);
      } catch (e) {
        setError("Could not read that file. Make sure it's a valid .xlsx or .csv.");
        toast.error("Failed to parse file");
      }
    },
    [onLoaded]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const clearFile = () => {
    setFileName("");
    setCount(0);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    onLoaded && onLoaded(null);
  };

  return (
    <section
      data-testid="lcms-upload-section"
      className="mx-auto mt-6 max-w-7xl px-6 pb-24"
    >
      <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-sm md:p-8">
        <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Optional
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-[#0B0B18]">
              Experimental LC-MS Data
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#64748B]">
              Upload experimentally identified compounds to continue the
              downstream network pharmacology workflow. If provided, these
              compounds override the Plant Database extraction for downstream
              modules.
            </p>
          </div>
          {fileName && (
            <button
              data-testid="lcms-clear"
              onClick={clearFile}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
              Remove file
            </button>
          )}
        </div>

        <div
          data-testid="lcms-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`mt-6 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            dragActive
              ? "border-[#5139ED] bg-[#5139ED]/[0.04]"
              : "border-[#E7E7F3] bg-[#FAFAFF]"
          }`}
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.55)]">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="mt-5 font-heading text-base font-semibold text-[#0B0B18]">
            Drag and drop your LC-MS file here
          </p>
          <p className="mt-1 text-xs text-[#64748B]">
            Accepted formats: .xlsx, .csv · max 20 MB
          </p>
          <button
            data-testid="lcms-browse"
            onClick={() => inputRef.current?.click()}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4127c9]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Browse Files
          </button>
          <input
            ref={inputRef}
            data-testid="lcms-file-input"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {/* Required columns */}
        <div className="mt-6 rounded-2xl border border-[#F1F1FA] bg-white p-5">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-[#0B0B18]">
            Required columns
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REQUIRED_COLUMNS.map((c) => (
              <span
                key={c}
                data-testid={`lcms-required-${c}`}
                className="rounded-full border border-[#E7E7F3] bg-[#FAFAFF] px-3 py-1 text-xs font-medium text-[#0B0B18]"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Feedback */}
        {error && (
          <div
            data-testid="lcms-error"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
          >
            {error}
          </div>
        )}
        {fileName && !error && (
          <div
            data-testid="lcms-loaded"
            className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">{fileName}</span>
            <span className="text-emerald-600">·</span>
            <span>{count} compound{count === 1 ? "" : "s"} parsed</span>
          </div>
        )}
      </div>
    </section>
  );
}
