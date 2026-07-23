import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIsStandalone } from "@/hooks/useIsStandalone";
import StandaloneSMILESInput from "@/components/standalone/StandaloneSMILESInput";
import WorkflowLayout from "@/components/WorkflowLayout";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { targetPredict, targetStatus } from "@/lib/api";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { useNetwork } from "@/context/NetworkContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Download,
  HelpCircle,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";

const CONFIDENCE_OPTIONS = [
  { stars: 5, label: "★★★★★  High confidence only" },
  { stars: 4, label: "★★★★  Multi-source (default)" },
  { stars: 3, label: "★★★  Includes AI predictions" },
];

const FILTER_TOOLTIPS = {
  confidence:
    "Consensus 1–5★ score. 5★ = multi-database + experimental evidence + strong potency; 3★ or below = predicted/inferred only.",
  protein_class:
    "Broad molecular-function class as annotated by UniProt / HGNC (e.g. Kinase, Receptor, Hydrolase). Useful for pathway triage.",
  db: "Which upstream database contributed evidence for this compound-target pair (ChEMBL, BindingDB, UniProt, HGNC, DeepPurpose-similarity).",
  evidence:
    "Whether ChEMBL / BindingDB has direct experimental bioactivity for this target-compound pair (pChEMBL ≥ 5).",
  family:
    "HGNC locus group / gene family — narrower than protein class (e.g. serine/threonine kinase).",
  organism:
    "Target organism (currently locked to Homo sapiens per publication-grade defaults).",
};

export default function TargetPrediction() {
  const navigate = useNavigate();
  const { standalone } = useIsStandalone();
  const { selectedCompounds, setCompoundTargets, setSelectedCompounds: setNetworkCompounds } = useNetwork();
  const { markComplete } = useWorkflow();

  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState("idle");
  const [rows, setRows] = useState([]);
  const pollRef = useRef(null);

  const [filters, setFilters] = useState({
    minConfidence: 1,
    proteinClass: "any",
    db: "any",
    experimental: "any",
    family: "any",
    organism: "Homo sapiens",
  });
  const [autoThreshold, setAutoThreshold] = useState(4);
  const [selected, setSelected] = useState({}); // {id: true}
  const [query, setQuery] = useState("");

  const rowId = (r) => `${r.uniprot_id || r.target_chembl_id}::${r.compound_name || ""}`;

  useEffect(() => {
    if (standalone) return; // Standalone view: skip workflow progress mutation.
    markComplete("admet-drug-likeness");
  }, [markComplete, standalone]);

  useEffect(() => {
    if (!selectedCompounds || selectedCompounds.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("running");
        setProgress({ done: 0, total: selectedCompounds.length });
        const start = await targetPredict(
          selectedCompounds.map((c) => ({
            compound_name: c.compound_name,
            canonical_smiles: c.canonical_smiles || c.smiles,
            smiles: c.smiles,
            molecular_formula: c.molecular_formula,
            molecular_weight: c.molecular_weight,
          }))
        );
        if (cancelled || !start.job_id) return;
        setJobId(start.job_id);
        pollRef.current = setInterval(async () => {
          try {
            const s = await targetStatus(start.job_id);
            if (cancelled) return;
            setProgress({ done: s.done, total: s.total });
            if (s.status === "done") {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setRows(s.rows || []);
              setStatus("done");
            } else if (s.status === "failed") {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setStatus("failed");
              toast.error("Target prediction failed — please retry.");
            }
          } catch (e) {
            // Poll transient errors are non-fatal — log for observability but
            // keep polling. Real failures are surfaced via the setStatus above.
            console.debug("target poll transient error:", e);
          }
        }, 1200);
      } catch (e) {
        setStatus("failed");
        toast.error(e?.response?.data?.detail || "Target prediction request failed");
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompounds?.length]);

  // Derived filter option lists
  const proteinClasses = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.protein_class && s.add(r.protein_class));
    return ["any", ...Array.from(s).sort()];
  }, [rows]);
  const families = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.protein_family && s.add(r.protein_family));
    return ["any", ...Array.from(s).sort()];
  }, [rows]);
  const dbOptions = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => (r.supporting_databases || []).forEach((d) => s.add(d)));
    return ["any", ...Array.from(s).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if ((r.confidence || 0) < filters.minConfidence) return false;
      if (filters.proteinClass !== "any" && r.protein_class !== filters.proteinClass)
        return false;
      if (
        filters.family !== "any" &&
        r.protein_family !== filters.family
      )
        return false;
      if (
        filters.db !== "any" &&
        !(r.supporting_databases || []).includes(filters.db)
      )
        return false;
      if (filters.experimental === "yes" && !r.experimental_evidence) return false;
      if (filters.experimental === "no" && r.experimental_evidence) return false;
      if (
        filters.organism !== "any" &&
        r.target_organism &&
        !r.target_organism.toLowerCase().includes(filters.organism.toLowerCase())
      )
        return false;
      return true;
    });
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (r) =>
          (r.gene_symbol || "").toLowerCase().includes(q) ||
          (r.protein_name || "").toLowerCase().includes(q) ||
          (r.uniprot_id || "").toLowerCase().includes(q) ||
          (r.compound_name || "").toLowerCase().includes(q)
      );
    }
    return out.sort((a, b) => (b.prediction_score || 0) - (a.prediction_score || 0));
  }, [rows, filters, query]);

  const uniqueTargets = useMemo(() => new Set(rows.map((r) => r.gene_symbol)).size, [rows]);
  const selectedCount = Object.keys(selected).length;

  const toggle = (r) =>
    setSelected((s) => {
      const k = rowId(r);
      if (s[k]) {
        const { [k]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [k]: true };
    });

  const autoSelect = () => {
    const map = {};
    for (const r of rows) {
      if ((r.confidence || 0) >= autoThreshold) {
        if (r.target_organism && !r.target_organism.toLowerCase().includes("sapiens"))
          continue;
        map[rowId(r)] = true;
      }
    }
    setSelected(map);
    toast.success(
      `Auto-selected ${Object.keys(map).length} target${
        Object.keys(map).length === 1 ? "" : "s"
      } (≥ ${autoThreshold}★)`
    );
  };

  const doExport = (fn, filename) => {
    const chosen = filtered.filter((r) => selected[rowId(r)]);
    if (chosen.length === 0) return toast.error("Select targets to export");
    const flat = chosen.map((r) => ({
      "Compound Name": r.compound_name,
      "Canonical SMILES": r.canonical_smiles,
      "Gene Symbol": r.gene_symbol,
      "Protein Name": r.protein_name,
      "UniProt ID": r.uniprot_id,
      "Protein Class": r.protein_class,
      "Prediction Score": r.prediction_score,
      "Confidence": r.confidence,
      "Best pChEMBL": r.best_pchembl,
      "Best Similarity": r.similarity,
      "Activity Count": r.activity_count,
      "Supporting Databases": (r.supporting_databases || []).join(" | "),
      "Experimental Evidence": r.experimental_evidence ? "Yes" : "No",
      "Target Organism": r.target_organism,
      "Selection Status": "Selected",
    }));
    const fields = Object.keys(flat[0]).map((k) => ({ key: k, label: k }));
    fn(flat, fields, filename);
  };

  const onContinue = () => {
    const chosen = filtered.filter((r) => selected[rowId(r)]);
    if (chosen.length === 0) return toast.error("Select at least one target to continue");
    setCompoundTargets(chosen);
    if (standalone) {
      toast.success(`${chosen.length} target${chosen.length === 1 ? "" : "s"} saved. Use the export buttons below to download results.`);
      return;
    }
    markComplete("target-prediction");
    navigate("/disease-target-identification");
  };

  if (!selectedCompounds || selectedCompounds.length === 0) {
    if (standalone) {
      return (
        <WorkflowLayout>
          <StandaloneSMILESInput
            title="Compound Target Prediction"
            subtitle="Paste SMILES, upload a CSV/Excel file, or start with a curated example — no workflow prerequisite."
            onCommit={(compounds) => setNetworkCompounds(compounds)}
          />
        </WorkflowLayout>
      );
    }
    return (
      <WorkflowLayout>
        <main
          data-testid="target-empty"
          className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center"
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
            <Beaker className="h-6 w-6" />
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">
            Compound Target Identification
          </h1>
          <p className="mt-3 text-[#64748B]">
            Complete the ADMET step and select compounds before running target prediction.
          </p>
          <Link
            to="/drug-likeness"
            data-testid="back-to-admet"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to ADMET
          </Link>
        </main>
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <TooltipProvider delayDuration={150}>
        <main
          data-testid="target-prediction-page"
          className="relative mx-auto max-w-7xl px-6 pb-40 pt-14"
        >
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Module · 03
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
            Compound Target Identification
          </h1>
          <p className="mt-3 max-w-2xl text-[#64748B]">
            Predicting human protein targets for {selectedCompounds.length} compound
            {selectedCompounds.length === 1 ? "" : "s"} via RDKit similarity → ChEMBL
            bioactivity → BindingDB → UniProt → HGNC.
          </p>

          {/* Status */}
          <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
            {status !== "done" ? (
              <div
                data-testid="target-progress"
                className="flex items-center gap-3"
              >
                <Loader2 className="h-5 w-5 animate-spin text-[#5139ED]" />
                <div className="flex-1">
                  <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                    {status === "failed"
                      ? "Target prediction failed"
                      : "Running compound target prediction…"}
                  </div>
                  <div className="text-xs text-[#64748B]">
                    {progress.done} of {progress.total} compounds processed · querying
                    ChEMBL / BindingDB / UniProt / HGNC
                  </div>
                </div>
                <div className="h-2 w-40 overflow-hidden rounded-full bg-[#F1F1FA]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED]"
                    style={{
                      width: `${
                        progress.total
                          ? Math.min(100, (progress.done / progress.total) * 100)
                          : 5
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <SummaryBar
                compounds={selectedCompounds.length}
                predicted={rows.length}
                unique={uniqueTargets}
                autoCount={selectedCount}
                query={query}
                setQuery={setQuery}
                onExportCSV={() => doExport(exportCSV, "targets_selected.csv")}
                onExportXLSX={() => doExport(exportXLSX, "targets_selected.xlsx")}
                exportDisabled={selectedCount === 0}
              />
            )}
          </div>

          {/* Auto select */}
          <AutoSelectCard
            threshold={autoThreshold}
            setThreshold={setAutoThreshold}
            onRun={autoSelect}
            disabled={status !== "done" || rows.length === 0}
          />

          {/* Filters */}
          <FiltersCard
            filters={filters}
            setFilters={setFilters}
            proteinClasses={proteinClasses}
            families={families}
            dbOptions={dbOptions}
          />

          {/* Results table */}
          <ResultsTable
            rows={filtered}
            selected={selected}
            toggle={toggle}
            setSelected={setSelected}
            rowId={rowId}
            status={status}
          />
        </main>

        {!standalone && rows.length > 0 && (
          <div
            data-testid="target-proceed-bar"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
          >
            <div className="pointer-events-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-full border border-[#E7E7F3] bg-white/95 px-5 py-3 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur md:flex-row">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                    <span data-testid="target-selected-count">{selectedCount}</span> of{" "}
                    {rows.length} predicted targets selected
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    These carry into Disease Target Identification.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/drug-likeness"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Link>
                <button
                  data-testid="target-clear"
                  onClick={() => setSelected({})}
                  disabled={selectedCount === 0}
                  className="rounded-full border border-[#E7E7F3] px-4 py-2 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 className="mr-1 inline h-3 w-3" />
                  Clear
                </button>
                <button
                  data-testid="continue-target-prediction"
                  onClick={onContinue}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
                >
                  Proceed to Disease Targets
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </TooltipProvider>
    </WorkflowLayout>
  );
}

// ────────────────────── Sub-components ───────────────────────
function HelpTip({ text, testid }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center text-[#B4B4CD] hover:text-[#5139ED]"
          aria-label="Help"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-[#0B0B18] text-white">
        <p className="text-[11px] leading-relaxed">{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function SummaryBar({
  compounds,
  predicted,
  unique,
  autoCount,
  query,
  setQuery,
  onExportCSV,
  onExportXLSX,
  exportDisabled,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
        <SumChip label="Compounds" value={compounds} testid="sum-compounds" />
        <SumChip label="Predicted" value={predicted} testid="sum-predicted" />
        <SumChip label="Unique" value={unique} testid="sum-unique" />
        <SumChip label="Auto/Manual" value={autoCount} testid="sum-selected" />
      </div>
      <div className="flex items-center gap-2">
        <input
          data-testid="target-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search gene, protein, UniProt…"
          className="brand-focus w-64 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
        />
        <button
          data-testid="target-export-csv"
          onClick={onExportCSV}
          disabled={exportDisabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
        <button
          data-testid="target-export-xlsx"
          onClick={onExportXLSX}
          disabled={exportDisabled}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" />
          Excel
        </button>
      </div>
    </div>
  );
}

function SumChip({ label, value, testid }) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-2 rounded-full bg-[#FAFAFF] px-3 py-1 ring-1 ring-inset ring-[#E7E7F3]"
    >
      <span className="font-heading font-bold text-[#0B0B18]">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-[#8139ED]">{label}</span>
    </span>
  );
}

function AutoSelectCard({ threshold, setThreshold, onRun, disabled }) {
  return (
    <div
      data-testid="auto-select-card"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            <Wand2 className="mr-1 inline h-3.5 w-3.5" />
            Auto select targets
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
            Consensus-driven auto-selection
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-[#64748B]">
            Automatically picks human targets at or above the chosen confidence
            threshold — highest confidence · multiple supporting DBs ·
            experimental evidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="auto-threshold"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-xs font-semibold text-[#0B0B18]"
          >
            {CONFIDENCE_OPTIONS.map((o) => (
              <option key={o.stars} value={o.stars}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            data-testid="run-auto-select"
            type="button"
            onClick={onRun}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] hover:-translate-y-0.5 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Auto Select
          </button>
        </div>
      </div>
    </div>
  );
}

function FiltersCard({ filters, setFilters, proteinClasses, families, dbOptions }) {
  const setF = (patch) => setFilters((s) => ({ ...s, ...patch }));
  return (
    <div
      data-testid="target-filters"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Filters
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <FilterSelect
          testid="filter-confidence"
          label="Prediction confidence"
          tooltip={FILTER_TOOLTIPS.confidence}
          value={String(filters.minConfidence)}
          onChange={(v) => setF({ minConfidence: Number(v) })}
          options={[
            ["1", "≥ ★"],
            ["2", "≥ ★★"],
            ["3", "≥ ★★★"],
            ["4", "≥ ★★★★"],
            ["5", "≥ ★★★★★"],
          ]}
        />
        <FilterSelect
          testid="filter-protein-class"
          label="Protein class"
          tooltip={FILTER_TOOLTIPS.protein_class}
          value={filters.proteinClass}
          onChange={(v) => setF({ proteinClass: v })}
          options={proteinClasses.map((c) => [c, c === "any" ? "Any" : c])}
        />
        <FilterSelect
          testid="filter-family"
          label="Protein family"
          tooltip={FILTER_TOOLTIPS.family}
          value={filters.family}
          onChange={(v) => setF({ family: v })}
          options={families.map((c) => [c, c === "any" ? "Any" : c])}
        />
        <FilterSelect
          testid="filter-db"
          label="Supporting database"
          tooltip={FILTER_TOOLTIPS.db}
          value={filters.db}
          onChange={(v) => setF({ db: v })}
          options={dbOptions.map((c) => [c, c === "any" ? "Any" : c])}
        />
        <FilterSelect
          testid="filter-experimental"
          label="Experimental evidence"
          tooltip={FILTER_TOOLTIPS.evidence}
          value={filters.experimental}
          onChange={(v) => setF({ experimental: v })}
          options={[
            ["any", "Any"],
            ["yes", "Yes"],
            ["no", "Predicted only"],
          ]}
        />
        <FilterSelect
          testid="filter-organism"
          label="Target organism"
          tooltip={FILTER_TOOLTIPS.organism}
          value={filters.organism}
          onChange={(v) => setF({ organism: v })}
          options={[
            ["any", "Any"],
            ["Homo sapiens", "Homo sapiens"],
          ]}
        />
      </div>
    </div>
  );
}

function FilterSelect({ testid, label, tooltip, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
        {label}
        <HelpTip text={tooltip} testid={`help-${testid}`} />
      </span>
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function StarRow({ n }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${
            i <= n
              ? "fill-[#F5B301] text-[#F5B301]"
              : "fill-transparent text-[#D9D9E8]"
          }`}
        />
      ))}
    </div>
  );
}

function ResultsTable({ rows, selected, toggle, setSelected, rowId, status }) {
  const accessors = useMemo(
    () => ({
      compound_name: (r) => r.compound_name,
      gene_symbol: (r) => r.gene_symbol,
      protein_name: (r) => r.protein_name,
      uniprot_id: (r) => r.uniprot_id,
      protein_class: (r) => r.protein_class,
      prediction_score: (r) => r.prediction_score,
      confidence: (r) => r.confidence,
      supporting_databases: (r) => (r.supporting_databases || []).join(","),
      experimental_evidence: (r) => (r.experimental_evidence ? 1 : 0),
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(
    rows,
    accessors,
    { key: "prediction_score", dir: "desc" }
  );
  const allSelected =
    sortedRows.length > 0 && sortedRows.every((r) => selected[rowId(r)]);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Predicted Targets
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span
              data-testid="target-row-count"
              className="font-display text-xl font-bold text-[#0B0B18]"
            >
              {sortedRows.length}
            </span>
            <span className="text-xs text-[#64748B]">rows shown</span>
          </div>
        </div>
      </div>
      <div
        data-testid="target-results-table"
        className="mt-3 overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
      >
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                <Th sticky>
                  <Checkbox
                    data-testid="target-select-all"
                    checked={allSelected}
                    onCheckedChange={() => {
                      if (allSelected) setSelected({});
                      else {
                        const m = {};
                        sortedRows.forEach((r) => (m[rowId(r)] = true));
                        setSelected(m);
                      }
                    }}
                    disabled={sortedRows.length === 0}
                    className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                  />
                </Th>
                <SortableTh id="compound_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Compound</SortableTh>
                <SortableTh id="gene_symbol" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Gene</SortableTh>
                <SortableTh id="protein_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Protein</SortableTh>
                <SortableTh id="uniprot_id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>UniProt</SortableTh>
                <SortableTh id="protein_class" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Class</SortableTh>
                <SortableTh id="prediction_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Score</SortableTh>
                <SortableTh id="confidence" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Confidence</SortableTh>
                <SortableTh id="supporting_databases" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Databases</SortableTh>
                <SortableTh id="experimental_evidence" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Evidence</SortableTh>
              </tr>
            </thead>
            <tbody>
              {status !== "done" ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    Running target prediction…
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    No targets match the current filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => {
                  const k = rowId(r);
                  const isSel = !!selected[k];
                  return (
                    <tr
                      key={k}
                      data-testid={`target-row-${k}`}
                      className={`border-b border-[#F1F1FA] ${
                        isSel ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          data-testid={`target-row-check-${k}`}
                          checked={isSel}
                          onCheckedChange={() => toggle(r)}
                          className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] font-heading font-semibold text-[#0B0B18]">
                        {r.compound_name || "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] font-bold text-[#5139ED]">
                        {r.gene_symbol || "—"}
                      </td>
                      <td className="px-3 py-3 text-[12px] text-[#0B0B18]">
                        {r.protein_name || "—"}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                        {r.uniprot_id ? (
                          <a
                            href={`https://www.uniprot.org/uniprotkb/${r.uniprot_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-[#5139ED]"
                          >
                            {r.uniprot_id}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-[#64748B]">
                        {r.protein_class || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                            (r.prediction_score || 0) >= 70
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : (r.prediction_score || 0) >= 40
                              ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                          }`}
                        >
                          {(r.prediction_score || 0).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StarRow n={r.confidence || 0} />
                      </td>
                      <td className="px-3 py-3 text-[10px] font-mono text-[#64748B]">
                        {(r.supporting_databases || []).join(" · ")}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                            r.experimental_evidence
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                          }`}
                        >
                          {r.experimental_evidence
                            ? `Exp · pChEMBL ${(r.best_pchembl || 0).toFixed(1)}`
                            : "Predicted"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, sticky }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B] ${
        sticky ? "sticky top-0 z-10 bg-[#FAFAFF]" : ""
      }`}
    >
      {children}
    </th>
  );
}
