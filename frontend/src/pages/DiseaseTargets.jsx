import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useIsStandalone } from "@/hooks/useIsStandalone";
import WorkflowLayout from "@/components/WorkflowLayout";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { diseaseSearch, diseaseTargets as apiDiseaseTargets } from "@/lib/api";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { useNetwork } from "@/context/NetworkContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  HelpCircle,
  Loader2,
  Search,
  Sparkles,
  Star,
  Stethoscope,
  Trash2,
  Wand2,
} from "lucide-react";

const CONFIDENCE_OPTIONS = [
  { stars: 5, label: "★★★★★  Highly curated only" },
  { stars: 4, label: "★★★★  Multi-source curated (default)" },
  { stars: 3, label: "★★★  Includes inferred" },
];

const FILTER_TOOLTIPS = {
  assoc:
    "Open Targets Platform overall association score (0–1). Combines genetic, literature, drug and pathway evidence.",
  evidence:
    "Curated = at least one database asserts the association explicitly. Inferred = inferred by text mining or co-occurrence only.",
  db: "Which source contributed this gene: Open Targets, CTD, NCBI Gene, UniProt Disease, or HGNC (for normalization).",
  klass:
    "HGNC locus group / gene family (e.g. protein-coding, non-coding RNA, pseudogene).",
};

export default function DiseaseTargets() {
  const navigate = useNavigate();
  const { standalone } = useIsStandalone();
  const { setDiseaseTargets: setNetworkTargets, selectedDisease, setSelectedDisease } =
    useNetwork();
  const { markComplete } = useWorkflow();

  const [query, setQuery] = useState(selectedDisease?.name || "");
  const [hits, setHits] = useState([]);
  const [showHits, setShowHits] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [chosen, setChosen] = useState(selectedDisease || null);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [rows, setRows] = useState([]);

  const [filters, setFilters] = useState({
    minConfidence: 1,
    minScore: 0,
    evidence: "any",
    db: "any",
    klass: "any",
  });
  const [autoThreshold, setAutoThreshold] = useState(4);
  const [selected, setSelected] = useState({});
  const [tableQuery, setTableQuery] = useState("");

  useEffect(() => {
    if (!query || query === chosen?.name || query.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoadingSearch(true);
    const t = setTimeout(async () => {
      try {
        const res = await diseaseSearch(query);
        if (!cancelled) {
          setHits(res.hits || []);
          setShowHits(true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, chosen?.name]);

  const runDisease = async (d) => {
    setChosen(d);
    setSelectedDisease(d);
    setShowHits(false);
    setQuery(d.name);
    setRows([]);
    setSelected({});
    setLoadingTargets(true);
    try {
      const res = await apiDiseaseTargets(d.efo_id, d.name);
      setRows(res.targets || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to fetch disease targets");
    } finally {
      setLoadingTargets(false);
    }
  };

  const rowId = (r) => r.gene_symbol;

  const proteinClasses = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.protein_class && s.add(r.protein_class));
    return ["any", ...Array.from(s).sort()];
  }, [rows]);
  const dbOptions = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => (r.sources || []).forEach((d) => s.add(d)));
    return ["any", ...Array.from(s).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows.filter((r) => {
      if ((r.confidence || 0) < filters.minConfidence) return false;
      if ((r.association_score || 0) < filters.minScore) return false;
      if (filters.evidence === "curated" && r.evidence_level !== "curated") return false;
      if (filters.evidence === "inferred" && r.evidence_level !== "inferred") return false;
      if (filters.db !== "any" && !(r.sources || []).includes(filters.db)) return false;
      if (filters.klass !== "any" && r.protein_class !== filters.klass) return false;
      return true;
    });
    if (tableQuery.trim()) {
      const q = tableQuery.toLowerCase();
      out = out.filter(
        (r) =>
          (r.gene_symbol || "").toLowerCase().includes(q) ||
          (r.protein_name || "").toLowerCase().includes(q) ||
          (r.uniprot_id || "").toLowerCase().includes(q)
      );
    }
    return out.sort((a, b) => (b.association_score || 0) - (a.association_score || 0));
  }, [rows, filters, tableQuery]);

  // Sortable column overlay on top of the filtered/search-scoped rows.
  const sortAccessors = useMemo(
    () => ({
      gene_symbol: (r) => r.gene_symbol,
      protein_name: (r) => r.protein_name,
      uniprot_id: (r) => r.uniprot_id,
      ncbi_gene_id: (r) => r.ncbi_gene_id,
      association_score: (r) => r.association_score,
      confidence: (r) => r.confidence,
      evidence_level: (r) => r.evidence_level,
      sources: (r) => (r.sources || []).join(","),
    }),
    []
  );
  const {
    sortedRows: displayed,
    sortKey,
    sortDir,
    onSort,
  } = useSortable(filtered, sortAccessors);

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
    const m = {};
    for (const r of rows) {
      if ((r.confidence || 0) >= autoThreshold) m[rowId(r)] = true;
    }
    setSelected(m);
    toast.success(
      `Auto-selected ${Object.keys(m).length} target${
        Object.keys(m).length === 1 ? "" : "s"
      } (≥ ${autoThreshold}★)`
    );
  };

  const doExport = (fn, filename) => {
    const list = rows.filter((r) => selected[rowId(r)]);
    if (list.length === 0) return toast.error("Select targets to export");
    const flat = list.map((r) => ({
      Disease: chosen?.name || "",
      "EFO ID": chosen?.efo_id || "",
      "Gene Symbol": r.gene_symbol,
      "Protein Name": r.protein_name,
      "UniProt ID": r.uniprot_id,
      "NCBI Gene ID": r.ncbi_gene_id,
      "Protein Class": r.protein_class,
      "Association Score": r.association_score,
      Confidence: r.confidence,
      "Evidence Level": r.evidence_level,
      "Supporting Databases": (r.sources || []).join(" | "),
      "Selection Status": "Selected",
    }));
    const fields = Object.keys(flat[0]).map((k) => ({ key: k, label: k }));
    fn(flat, fields, filename);
  };

  const onContinue = () => {
    const list = rows.filter((r) => selected[rowId(r)]);
    if (list.length === 0) return toast.error("Select at least one disease target");
    setNetworkTargets(list);
    if (standalone) {
      toast.success(`${list.length} target${list.length === 1 ? "" : "s"} saved. Use the export buttons below to download results.`);
      return;
    }
    markComplete("disease-target-identification");
    navigate("/network-analysis");
  };

  return (
    <WorkflowLayout>
      <TooltipProvider delayDuration={150}>
        <main
          data-testid="disease-page"
          className="relative mx-auto max-w-7xl px-6 pb-40 pt-14"
        >
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Module · 04
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
            Disease Target Identification
          </h1>
          <p className="mt-3 max-w-2xl text-[#64748B]">
            Retrieve disease-associated human genes from Open Targets · CTD · NCBI Gene ·
            UniProt Disease; normalized through HGNC.
          </p>

          {/* Disease search */}
          <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Stethoscope className="mr-1 inline h-3.5 w-3.5" />
              Select disease
            </p>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B4B4CD]" />
              <input
                data-testid="disease-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowHits(true)}
                onBlur={() => setTimeout(() => setShowHits(false), 200)}
                placeholder="e.g. Type 2 diabetes, Breast cancer, Alzheimer's disease"
                className="brand-focus w-full rounded-2xl border border-[#E7E7F3] bg-white py-3.5 pl-11 pr-4 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
              />
              {loadingSearch && (
                <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#5139ED]" />
              )}
              {showHits && hits.length > 0 && (
                <div
                  data-testid="disease-hits"
                  className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-[#E7E7F3] bg-white shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)]"
                >
                  {hits.map((h) => (
                    <button
                      key={h.efo_id}
                      data-testid={`disease-hit-${h.efo_id}`}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        runDisease(h);
                      }}
                      className="block w-full border-b border-[#F1F1FA] px-4 py-3 text-left text-[13px] transition-colors last:border-b-0 hover:bg-[#FAFAFF]"
                    >
                      <div className="font-heading font-semibold text-[#0B0B18]">
                        {h.name}
                      </div>
                      {h.description && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-[#64748B]">
                          {h.description}
                        </div>
                      )}
                      <div className="mt-0.5 text-[10px] font-mono text-[#8139ED]">
                        {h.efo_id}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {chosen && (
              <div
                data-testid="disease-chip"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#5139ED]/8 px-3 py-1.5 text-xs font-semibold text-[#5139ED]"
              >
                <Sparkles className="h-3 w-3" />
                {chosen.name} · {chosen.efo_id}
              </div>
            )}
          </div>

          {/* Loading */}
          {loadingTargets && (
            <div
              data-testid="disease-loading"
              className="mt-6 flex items-center gap-3 rounded-3xl border border-[#E7E7F3] bg-white p-5"
            >
              <Loader2 className="h-5 w-5 animate-spin text-[#5139ED]" />
              <div>
                <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                  Querying Open Targets · CTD · NCBI Gene · UniProt · HGNC…
                </div>
                <div className="text-xs text-[#64748B]">
                  Consolidating and normalizing identifiers.
                </div>
              </div>
            </div>
          )}

          {rows.length > 0 && !loadingTargets && (
            <>
              {/* Summary */}
              <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <SumChip label="Disease" value={chosen?.name} testid="sum-disease" />
                    <SumChip label="Retrieved" value={rows.length} testid="sum-retrieved" />
                    <SumChip
                      label="Unique"
                      value={new Set(rows.map((r) => r.gene_symbol)).size}
                      testid="sum-unique-disease"
                    />
                    <SumChip label="Selected" value={selectedCount} testid="sum-selected-disease" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="disease-table-search"
                      value={tableQuery}
                      onChange={(e) => setTableQuery(e.target.value)}
                      placeholder="Search gene, protein, UniProt…"
                      className="brand-focus w-64 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
                    />
                    <button
                      data-testid="disease-export-csv"
                      onClick={() => doExport(exportCSV, "disease_targets.csv")}
                      disabled={selectedCount === 0}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      CSV
                    </button>
                    <button
                      data-testid="disease-export-xlsx"
                      onClick={() => doExport(exportXLSX, "disease_targets.xlsx")}
                      disabled={selectedCount === 0}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Excel
                    </button>
                  </div>
                </div>
              </div>

              {/* Auto-select */}
              <div
                data-testid="disease-auto-card"
                className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                      <Wand2 className="mr-1 inline h-3.5 w-3.5" />
                      Auto select targets
                    </p>
                    <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
                      Consensus disease-target picker
                    </h2>
                    <p className="mt-1 max-w-2xl text-xs text-[#64748B]">
                      Highest disease-association score · multiple supporting
                      databases · curated evidence · human genes only.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      data-testid="disease-auto-threshold"
                      value={autoThreshold}
                      onChange={(e) => setAutoThreshold(Number(e.target.value))}
                      className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-xs font-semibold text-[#0B0B18]"
                    >
                      {CONFIDENCE_OPTIONS.map((o) => (
                        <option key={o.stars} value={o.stars}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      data-testid="disease-run-auto-select"
                      type="button"
                      onClick={autoSelect}
                      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] hover:-translate-y-0.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto Select
                    </button>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div
                data-testid="disease-filters"
                className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
              >
                <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                  Filters
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                      Min Association Score
                      <HelpTip text={FILTER_TOOLTIPS.assoc} testid="help-assoc" />
                    </span>
                    <input
                      data-testid="filter-min-score"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={filters.minScore}
                      onChange={(e) =>
                        setFilters((s) => ({ ...s, minScore: Number(e.target.value) }))
                      }
                      className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
                    />
                  </label>
                  <DFSelect
                    label="Min Confidence"
                    testid="filter-min-conf"
                    tooltip="Consensus 1–5★ score (curated evidence + multi-source support + score strength)."
                    value={String(filters.minConfidence)}
                    onChange={(v) =>
                      setFilters((s) => ({ ...s, minConfidence: Number(v) }))
                    }
                    options={[
                      ["1", "≥ ★"],
                      ["2", "≥ ★★"],
                      ["3", "≥ ★★★"],
                      ["4", "≥ ★★★★"],
                      ["5", "≥ ★★★★★"],
                    ]}
                  />
                  <DFSelect
                    label="Evidence Level"
                    testid="filter-evidence"
                    tooltip={FILTER_TOOLTIPS.evidence}
                    value={filters.evidence}
                    onChange={(v) => setFilters((s) => ({ ...s, evidence: v }))}
                    options={[
                      ["any", "Any"],
                      ["curated", "Curated only"],
                      ["inferred", "Inferred only"],
                    ]}
                  />
                  <DFSelect
                    label="Supporting Database"
                    testid="filter-db"
                    tooltip={FILTER_TOOLTIPS.db}
                    value={filters.db}
                    onChange={(v) => setFilters((s) => ({ ...s, db: v }))}
                    options={dbOptions.map((c) => [c, c === "any" ? "Any" : c])}
                  />
                  <DFSelect
                    label="Protein Class"
                    testid="filter-class"
                    tooltip={FILTER_TOOLTIPS.klass}
                    value={filters.klass}
                    onChange={(v) => setFilters((s) => ({ ...s, klass: v }))}
                    options={proteinClasses.map((c) => [c, c === "any" ? "Any" : c])}
                  />
                </div>
              </div>

              {/* Results */}
              <div className="mt-6">
                <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                  Disease Targets
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span
                    data-testid="disease-row-count"
                    className="font-display text-xl font-bold text-[#0B0B18]"
                  >
                    {displayed.length}
                  </span>
                  <span className="text-xs text-[#64748B]">
                    rows shown · {selectedCount} selected
                  </span>
                </div>
                <div
                  data-testid="disease-results-table"
                  className="mt-3 overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
                >
                  <div className="max-h-[560px] overflow-auto">
                    <table className="w-full min-w-[1050px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                          <Th sticky>
                            <Checkbox
                              data-testid="disease-select-all"
                              checked={
                                displayed.length > 0 &&
                                displayed.every((r) => selected[rowId(r)])
                              }
                              onCheckedChange={() => {
                                const all = displayed.every((r) => selected[rowId(r)]);
                                if (all) setSelected({});
                                else {
                                  const m = {};
                                  displayed.forEach((r) => (m[rowId(r)] = true));
                                  setSelected(m);
                                }
                              }}
                              className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                            />
                          </Th>
                          <SortableTh id="gene_symbol" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Gene</SortableTh>
                          <SortableTh id="protein_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Protein</SortableTh>
                          <SortableTh id="uniprot_id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>UniProt</SortableTh>
                          <SortableTh id="ncbi_gene_id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>NCBI Gene</SortableTh>
                          <SortableTh id="association_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Association</SortableTh>
                          <SortableTh id="confidence" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Confidence</SortableTh>
                          <SortableTh id="evidence_level" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Evidence</SortableTh>
                          <SortableTh id="sources" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Sources</SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-sm text-[#64748B]">
                              No targets match the current filters.
                            </td>
                          </tr>
                        ) : (
                          displayed.map((r) => {
                            const k = rowId(r);
                            const isSel = !!selected[k];
                            return (
                              <tr
                                key={k}
                                data-testid={`disease-row-${k}`}
                                className={`border-b border-[#F1F1FA] ${
                                  isSel ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
                                }`}
                              >
                                <td className="px-3 py-3">
                                  <Checkbox
                                    data-testid={`disease-row-check-${k}`}
                                    checked={isSel}
                                    onCheckedChange={() => toggle(r)}
                                    className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                                  />
                                </td>
                                <td className="px-3 py-3 font-mono text-[12px] font-bold text-[#5139ED]">
                                  {r.gene_symbol}
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
                                <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                                  {r.ncbi_gene_id || "—"}
                                </td>
                                <td className="px-3 py-3">
                                  <span
                                    className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                                      r.association_score >= 0.5
                                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                        : r.association_score >= 0.2
                                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                                        : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                                    }`}
                                  >
                                    {(r.association_score || 0).toFixed(3)}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <StarRow n={r.confidence || 0} />
                                </td>
                                <td className="px-3 py-3 text-[11px]">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                                      r.evidence_level === "curated"
                                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                        : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                                    }`}
                                  >
                                    {r.evidence_level}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-[10px] font-mono text-[#64748B]">
                                  {(r.sources || []).join(" · ")}
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
            </>
          )}
        </main>

        {rows.length > 0 && !loadingTargets && (
          <div
            data-testid="disease-proceed-bar"
            className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
          >
            <div className="pointer-events-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-full border border-[#E7E7F3] bg-white/95 px-5 py-3 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur md:flex-row">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
                  <Stethoscope className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                    <span data-testid="disease-selected-count">{selectedCount}</span> of{" "}
                    {rows.length} disease targets selected
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    These flow into Network Analysis.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/target-prediction"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Link>
                <button
                  data-testid="disease-clear"
                  onClick={() => setSelected({})}
                  disabled={selectedCount === 0}
                  className="rounded-full border border-[#E7E7F3] px-4 py-2 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
                >
                  <Trash2 className="mr-1 inline h-3 w-3" />
                  Clear
                </button>
                <button
                  data-testid="continue-disease-target-identification"
                  onClick={onContinue}
                  disabled={selectedCount === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
                >
                  Proceed to Network Analysis
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

// ─────────── Small helpers ───────────
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

function SumChip({ label, value, testid }) {
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-2 rounded-full bg-[#FAFAFF] px-3 py-1 ring-1 ring-inset ring-[#E7E7F3]"
    >
      <span className="font-heading font-bold text-[#0B0B18]">{value ?? "—"}</span>
      <span className="text-[10px] uppercase tracking-widest text-[#8139ED]">{label}</span>
    </span>
  );
}

function DFSelect({ testid, label, tooltip, value, onChange, options }) {
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
