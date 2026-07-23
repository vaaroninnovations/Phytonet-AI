import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsStandalone } from "@/hooks/useIsStandalone";
import {
  searchPlant,
  lotusSimple,
  lotusExact,
  lotusSubstructure,
  lotusMolweight,
} from "@/lib/api";
import {
  exportCSV,
  exportXLSX,
  exportJSON,
} from "@/lib/exporters";
import StructureCanvas from "@/components/StructureCanvas";
import PlantAutocomplete from "@/components/PlantAutocomplete";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSelection, compoundKey } from "@/context/SelectionContext";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { toast } from "sonner";
import {
  Search,
  Leaf,
  Loader2,
  Download,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpAZ,
  Filter,
  ExternalLink,
  FlaskConical,
  ArrowRight,
  Database,
} from "lucide-react";

const ALL_FIELDS = [
  { key: "compound_name", label: "Compound Name", default: true },
  { key: "structure", label: "Structure", default: true },
  { key: "molecular_formula", label: "Molecular Formula", default: true },
  { key: "molecular_weight", label: "Molecular Weight", default: true },
  { key: "source", label: "Source", default: true },
  { key: "status", label: "Status", default: true },
  { key: "imppat_id", label: "IMPPAT ID", default: false },
  { key: "smiles", label: "SMILES", default: true },
  { key: "inchi", label: "InChI", default: false },
  { key: "inchi_key", label: "InChI Key", default: false },
];

const MODES = [
  { id: "plant", label: "Plant name", icon: Leaf },
  { id: "simple", label: "LOTUS Simple", icon: Search },
  { id: "exact", label: "LOTUS Exact", icon: FlaskConical },
  { id: "substructure", label: "LOTUS Substructure", icon: Filter },
  { id: "molweight", label: "Molecular Weight", icon: ArrowUpAZ },
];

const SOURCE_OPTIONS = [
  { id: "all", label: "All sources" },
  { id: "IMPPAT", label: "IMPPAT" },
  { id: "LOTUS", label: "LOTUS" },
  { id: "IMPPAT+LOTUS", label: "Both databases" },
];

export default function PlantDatabase({ topRightSlot = null }) {
  const navigate = useNavigate();
  const { standalone } = useIsStandalone();
  const {
    isSelected,
    toggle: toggleSelect,
    setMany,
    count: selectedCount,
    setSourcePlant,
    clear: clearSelection,
  } = useSelection();

  const [mode, setMode] = useState("plant");
  const [selectedFields, setSelectedFields] = useState(
    Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.default]))
  );
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const {
    compounds,
    meta,
    setResults,
    updateCompound,
    standardizing,
    stdStats,
  } = useResults();
  // Feed the current plant name into cross-workflow NetworkContext (used by PCTDP).
  const networkCtx = useNetwork();

  // Plant mode
  const [plant, setPlant] = useState("");
  // Simple mode
  const [simpleQuery, setSimpleQuery] = useState("");
  // Exact
  const [exactType, setExactType] = useState("smiles");
  const [exactValue, setExactValue] = useState("");
  // Substructure
  const [subSmiles, setSubSmiles] = useState("");
  const [subAlgo, setSubAlgo] = useState("default");
  const [subMax, setSubMax] = useState(100);
  // Molweight
  const [minMass, setMinMass] = useState(800);
  const [maxMass, setMaxMass] = useState(1000);
  const [mwMaxHits, setMwMaxHits] = useState(20);

  // Table
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset UI state when new dataset arrives
  useEffect(() => {
    setPage(1);
    setSourceFilter("all");
    setQuery("");
    setSortKey(null);
  }, [compounds]);

  const activeFields = useMemo(
    () => ALL_FIELDS.filter((f) => selectedFields[f.key]),
    [selectedFields]
  );

  const filtered = useMemo(() => {
    let rows = compounds;
    if (sourceFilter !== "all") {
      rows = rows.filter((r) => (r.source || "") === sourceFilter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => {
        const name = (r.compound_name || "").toLowerCase();
        const mf = (r.molecular_formula || "").toLowerCase();
        const mw = String(r.molecular_weight ?? "").toLowerCase();
        const src = (r.source || "").toLowerCase();
        return (
          name.includes(q) ||
          mf.includes(q) ||
          mw.includes(q) ||
          src.includes(q)
        );
      });
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const va = a[sortKey] ?? "";
        const vb = b[sortKey] ?? "";
        if (typeof va === "number" && typeof vb === "number")
          return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return rows;
  }, [compounds, query, sortKey, sortDir, sourceFilter]);

  // Source counts (from unfiltered dataset)
  const sourceCounts = useMemo(() => {
    const counts = { all: compounds.length };
    for (const c of compounds) {
      const s = c.source || "";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [compounds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const runSearch = async (fn, label) => {
    setLoading(true);
    setProgress(15);
    setResults([], null);
    setPage(1);
    // A new search resets any prior selection so the counter starts at 0.
    clearSelection();
    const tick = setInterval(
      () => setProgress((p) => (p < 92 ? p + Math.random() * 6 : p)),
      500
    );
    try {
      const data = await fn();
      setResults(data.compounds || [], data, "search");
      setProgress(100);
      toast.success(`${label} · ${data.compounds?.length ?? 0} compounds`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || "Search failed");
      setProgress(0);
    } finally {
      clearInterval(tick);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 400);
    }
  };

  const searchByMode = (plantOverride) => {
    if (mode === "plant") {
      const p = (typeof plantOverride === "string" ? plantOverride : plant).trim();
      if (!p) return toast.error("Enter a plant name");
      if (typeof plantOverride === "string") setPlant(p);
      setSourcePlant(p);
      try { networkCtx?.setPlantName?.(p); } catch (e) { console.debug("networkCtx.setPlantName failed:", e); }
      return runSearch(
        () =>
          searchPlant(p, {
            limit: 200,
            wantStructure: selectedFields.smiles || selectedFields.inchi || selectedFields.inchi_key || selectedFields.structure,
            wantPhyschem: selectedFields.molecular_formula || selectedFields.molecular_weight,
          }),
        `Plant "${p}"`
      );
    }
    if (mode === "simple") {
      if (!simpleQuery.trim()) return toast.error("Enter a query");
      setSourcePlant("");
      return runSearch(
        () => lotusSimple(simpleQuery.trim()),
        `Simple "${simpleQuery.trim()}"`
      );
    }
    if (mode === "exact") {
      if (!exactValue.trim()) return toast.error("Enter a value");
      setSourcePlant("");
      return runSearch(
        () => lotusExact(exactType, exactValue.trim()),
        `Exact ${exactType}`
      );
    }
    if (mode === "substructure") {
      if (!subSmiles.trim()) return toast.error("Enter SMILES");
      setSourcePlant("");
      return runSearch(
        () => lotusSubstructure(subSmiles.trim(), subAlgo, subMax),
        `Substructure (${subAlgo})`
      );
    }
    if (mode === "molweight") {
      if (Number(minMass) >= Number(maxMass))
        return toast.error("minMass must be < maxMass");
      setSourcePlant("");
      return runSearch(
        () => lotusMolweight(Number(minMass), Number(maxMass), Number(mwMaxHits)),
        `MW ${minMass}-${maxMass}`
      );
    }
  };

  // Select-all state derived from the CURRENT filtered view
  const filteredSelectedCount = useMemo(
    () => filtered.filter((r) => isSelected(r)).length,
    [filtered, isSelected]
  );
  const allInViewSelected =
    filtered.length > 0 && filteredSelectedCount === filtered.length;
  const someInViewSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filtered.length;

  const toggleAllInView = () => {
    setMany(filtered, !allInViewSelected);
  };

  const openConfirm = () => {
    if (selectedCount === 0) return toast.error("Select at least one compound");
    if (standalone) {
      toast.success(`${selectedCount} compound${selectedCount === 1 ? "" : "s"} saved. Use the export buttons below to download results.`);
      return;
    }
    setConfirmOpen(true);
  };

  const proceedToDrugLikeness = () => {
    setConfirmOpen(false);
    navigate("/drug-likeness");
  };

  const onSort = (key) => {
    // 3-state cycle: asc → desc → default (null)
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  const exportFields = activeFields.filter((f) => f.key !== "structure");

  return (
    <main data-testid="plant-database-page" className="relative overflow-hidden">
      {/* backdrop orbs */}
      <div
        className="brand-orb"
        style={{
          background: "#5139ED",
          width: 360,
          height: 360,
          top: -120,
          right: -140,
          opacity: 0.25,
        }}
      />
      <div
        className="brand-orb"
        style={{
          background: "#395AED",
          width: 320,
          height: 320,
          top: 220,
          left: -140,
          opacity: 0.2,
        }}
      />

      <section className="relative mx-auto max-w-7xl px-6 pt-14">
        <div className="max-w-3xl">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Compound Extractor · Live
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
            Plant Database
          </h1>
          <p className="mt-3 max-w-2xl text-[#64748B]">
            Query medicinal plants across IMPPAT and LOTUS in parallel — or
            search LOTUS by structure, substructure, or molecular-weight range.
          </p>
        </div>

        {/* Top row: 75/25 grid — Search panel + optional LC-MS slot */}
        <div
          className={`mt-10 grid grid-cols-1 gap-6 ${
            topRightSlot ? "md:grid-cols-4" : ""
          } items-stretch`}
        >
          {/* Search panel */}
          <div
            className={`rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-[0_20px_60px_-40px_rgba(81,57,237,0.35)] md:p-7 ${
              topRightSlot ? "md:col-span-3" : ""
            } flex h-full flex-col`}
          >
            <Tabs value={mode} onValueChange={setMode} data-testid="mode-tabs">
            <TabsList className="mb-6 flex h-auto flex-wrap justify-start gap-1 rounded-full bg-[#F5F5FC] p-1">
              {MODES.map((m) => (
                <TabsTrigger
                  key={m.id}
                  value={m.id}
                  data-testid={`mode-${m.id}`}
                  className="rounded-full px-4 py-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:text-[#5139ED] data-[state=active]:shadow"
                >
                  <m.icon className="mr-2 h-4 w-4" />
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="plant">
              <PlantAutocomplete
                value={plant}
                onChange={setPlant}
                onSubmit={(name) => searchByMode(name)}
                loading={loading}
                placeholder="e.g. Curcuma longa, Withania somnifera, Ocimum sanctum"
              />
            </TabsContent>

            <TabsContent value="simple">
              <SearchInput
                testid="simple-input"
                icon={<Search className="h-5 w-5 text-[#5139ED]" />}
                placeholder="LOTUS ID · InChI · InChI Key · molecule name"
                value={simpleQuery}
                onChange={setSimpleQuery}
                onSubmit={searchByMode}
                loading={loading}
              />
            </TabsContent>

            <TabsContent value="exact">
              <div className="flex flex-col gap-3 md:flex-row">
                <select
                  data-testid="exact-type"
                  value={exactType}
                  onChange={(e) => setExactType(e.target.value)}
                  className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-4 py-3 text-sm font-medium text-[#0B0B18] md:w-40"
                >
                  <option value="smiles">SMILES</option>
                  <option value="inchi">InChI</option>
                </select>
                <SearchInput
                  testid="exact-input"
                  icon={<FlaskConical className="h-5 w-5 text-[#5139ED]" />}
                  placeholder={
                    exactType === "smiles"
                      ? "e.g. COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"
                      : "e.g. InChI=1S/C21H20O6/..."
                  }
                  value={exactValue}
                  onChange={setExactValue}
                  onSubmit={searchByMode}
                  loading={loading}
                />
              </div>
            </TabsContent>

            <TabsContent value="substructure">
              <div className="flex flex-col gap-3 md:flex-row">
                <SearchInput
                  testid="substructure-input"
                  icon={<Filter className="h-5 w-5 text-[#5139ED]" />}
                  placeholder="SMILES substructure — e.g. c1ccccc1O"
                  value={subSmiles}
                  onChange={setSubSmiles}
                  onSubmit={searchByMode}
                  loading={loading}
                />
                <div className="flex gap-3">
                  <select
                    data-testid="substructure-algo"
                    value={subAlgo}
                    onChange={(e) => setSubAlgo(e.target.value)}
                    className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-4 py-3 text-sm font-medium text-[#0B0B18]"
                  >
                    <option value="default">default</option>
                    <option value="df">df</option>
                    <option value="vf">vf</option>
                  </select>
                  <input
                    data-testid="substructure-max"
                    type="number"
                    value={subMax}
                    onChange={(e) => setSubMax(e.target.value)}
                    className="brand-focus w-28 rounded-full border border-[#E7E7F3] bg-white px-4 py-3 text-sm text-[#0B0B18]"
                    placeholder="max hits"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="molweight">
              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
                <NumberField
                  testid="mw-min"
                  label="Min mass"
                  value={minMass}
                  onChange={setMinMass}
                />
                <NumberField
                  testid="mw-max"
                  label="Max mass"
                  value={maxMass}
                  onChange={setMaxMass}
                />
                <NumberField
                  testid="mw-hits"
                  label="Max hits"
                  value={mwMaxHits}
                  onChange={setMwMaxHits}
                />
                <button
                  data-testid="mw-search"
                  onClick={searchByMode}
                  disabled={loading}
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4127c9] disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </button>
              </div>
            </TabsContent>
          </Tabs>

          {/* progress bar */}
          <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-[#F1F1FA]">
            <div
              data-testid="progress-bar"
              className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] transition-[width] duration-300"
              style={{ width: `${loading ? progress : progress === 100 ? 100 : 0}%` }}
            />
          </div>

          {/* Field selectors */}
          <div className="mt-6">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-[#0B0B18]">
              Output fields
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALL_FIELDS.map((f) => {
                const checked = !!selectedFields[f.key];
                return (
                  <label
                    key={f.key}
                    data-testid={`field-${f.key}`}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      checked
                        ? "border-[#5139ED]/40 bg-[#5139ED]/8 text-[#5139ED]"
                        : "border-[#E7E7F3] bg-white text-[#64748B] hover:border-[#5139ED]/30"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setSelectedFields((s) => ({ ...s, [f.key]: !!v }))
                      }
                      className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

          {/* Right slot — LC-MS upload (25%) */}
          {topRightSlot && (
            <div className="md:col-span-1 flex h-full flex-col">
              {topRightSlot}
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="relative mx-auto mt-10 max-w-7xl px-6 pb-40">
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                Results
              </p>
              <div className="mt-1 flex items-center gap-3">
                <span
                  data-testid="row-count"
                  className="font-display text-2xl font-bold text-[#0B0B18]"
                >
                  {filtered.length}
                </span>
                <span className="text-sm text-[#64748B]">
                  {meta?.plant
                    ? `compounds for “${meta.plant}” · IMPPAT ${meta.imppat_count ?? 0} · LOTUS ${meta.lotus_count ?? 0}`
                    : compounds.length
                    ? "compounds"
                    : "no query yet"}
                </span>
              </div>
              {standardizing && (
                <div
                  data-testid="standardize-progress"
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#5139ED]/8 px-3 py-1 text-xs font-semibold text-[#5139ED]"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Standardizing compounds…{" "}
                  <span data-testid="standardize-progress-count">
                    {standardizing.done} of {standardizing.total} completed
                  </span>
                </div>
              )}
              {!standardizing && stdStats && (
                <div
                  data-testid="standardize-stats"
                  className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold"
                >
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    {stdStats.standardized ?? 0} standardized
                  </span>
                  {stdStats.manual_review > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200">
                      {stdStats.manual_review} manual review
                    </span>
                  )}
                  {stdStats.duplicate_removed > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F1FA] px-2.5 py-0.5 text-[#64748B] ring-1 ring-inset ring-[#E7E7F3]">
                      {stdStats.duplicate_removed} duplicate removed
                    </span>
                  )}
                </div>
              )}
              <div
                data-testid="selection-count"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#5139ED]/8 px-3 py-1 text-xs font-semibold text-[#5139ED]"
              >
                <FlaskConical className="h-3 w-3" />
                Selected compounds: {selectedCount}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B4B4CD]" />
                <input
                  data-testid="results-search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, formula, MW, source…"
                  className="brand-focus w-72 rounded-full border border-[#E7E7F3] bg-white py-2.5 pl-9 pr-4 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
                />
              </div>
              <ExportButton
                label="CSV"
                testid="export-csv"
                onClick={() =>
                  exportCSV(filtered, exportFields, "compounds.csv")
                }
                disabled={!filtered.length}
              />
              <ExportButton
                label="Excel"
                testid="export-xlsx"
                onClick={() =>
                  exportXLSX(filtered, exportFields, "compounds.xlsx")
                }
                disabled={!filtered.length}
              />
              <ExportButton
                label="JSON"
                testid="export-json"
                onClick={() =>
                  exportJSON(filtered, exportFields, "compounds.json")
                }
                disabled={!filtered.length}
              />
            </div>
          </div>

          {/* Source filter chips */}
          {compounds.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[#64748B]">
                <Database className="h-3.5 w-3.5" />
                Source
              </span>
              {SOURCE_OPTIONS.map((o) => {
                const cnt = sourceCounts[o.id] ?? 0;
                const active = sourceFilter === o.id;
                return (
                  <button
                    key={o.id}
                    data-testid={`source-filter-${o.id}`}
                    onClick={() => {
                      setSourceFilter(o.id);
                      setPage(1);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "border-[#5139ED] bg-[#5139ED] text-white"
                        : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                    }`}
                  >
                    {o.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                        active ? "bg-white/20" : "bg-[#F1F1FA] text-[#64748B]"
                      }`}
                    >
                      {cnt}
                    </span>
                  </button>
                );
              })}
              {filteredSelectedCount > 0 && (
                <button
                  data-testid="clear-view-selection"
                  onClick={() => setMany(filtered, false)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500"
                >
                  Deselect {filteredSelectedCount} in view
                </button>
              )}
            </div>
          )}

          {/* Table with sticky header + scroll container */}
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#F1F1FA]">
            <div className="max-h-[640px] overflow-auto">
              <table
                data-testid="results-table"
                className="w-full min-w-[820px] border-collapse text-sm"
              >
                <thead>
                  <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                    <th
                      className="sticky top-0 z-10 w-10 bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]"
                    >
                      <Checkbox
                        data-testid="select-all"
                        checked={
                          allInViewSelected
                            ? true
                            : someInViewSelected
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={toggleAllInView}
                        disabled={filtered.length === 0}
                        className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=indeterminate]:bg-[#5139ED] data-[state=checked]:text-white data-[state=indeterminate]:text-white"
                      />
                    </th>
                    <th className="sticky top-0 z-10 w-10 bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                      #
                    </th>
                    {activeFields.map((f) => {
                      const isSortable = f.key !== "structure";
                      const isActive = sortKey === f.key;
                      const arrow = isActive
                        ? sortDir === "asc"
                          ? "↑"
                          : "↓"
                        : "⇅";
                      return (
                        <th
                          key={f.key}
                          data-testid={`sortable-${f.key}`}
                          onClick={() => isSortable && onSort(f.key)}
                          className={`sticky top-0 z-10 whitespace-nowrap bg-[#FAFAFF] px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B] ${
                            isSortable ? "cursor-pointer hover:text-[#5139ED]" : ""
                          }`}
                          aria-sort={
                            isActive
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : "none"
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {f.label}
                            {isSortable && (
                              <span
                                data-testid={`sort-arrow-${f.key}`}
                                className={`inline-block min-w-[10px] text-[10px] leading-none ${
                                  isActive
                                    ? "font-bold text-[#5139ED]"
                                    : "text-[#B4B4CD] opacity-60"
                                }`}
                              >
                                {arrow}
                              </span>
                            )}
                          </span>
                        </th>
                      );
                    })}
                    <th className="sticky top-0 z-10 bg-[#FAFAFF] px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <LoadingRows fields={activeFields} />
                  ) : pageRows.length === 0 ? (
                    <EmptyState hasQuery={!!compounds.length} />
                  ) : (
                    pageRows.map((row, i) => {
                      const selected = isSelected(row);
                      return (
                        <tr
                          key={compoundKey(row) || i}
                          data-testid={`row-${compoundKey(row)}`}
                          className={`border-b border-[#F1F1FA] transition-colors ${
                            selected
                              ? "bg-[#5139ED]/[0.04]"
                              : "hover:bg-[#F8F8FE]"
                          }`}
                        >
                          <td className="px-3 py-3">
                            <Checkbox
                              data-testid={`row-check-${compoundKey(row)}`}
                              checked={selected}
                              onCheckedChange={() => toggleSelect(row)}
                              className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                            />
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-[#B4B4CD]">
                            {(page - 1) * pageSize + i + 1}
                          </td>
                          {activeFields.map((f) => (
                            <td
                              key={f.key}
                              className="max-w-[280px] px-4 py-3 align-middle text-[13px] text-[#1E1E33]"
                            >
                              <CellValue
                                field={f.key}
                                row={row}
                                onEdit={(patch) =>
                                  updateCompound(compoundKey(row), patch)
                                }
                              />
                            </td>
                          ))}
                          <td className="px-3 py-3 text-right">
                            {row.imppat_id ? (
                              <a
                                href={`https://cb.imsc.res.in/imppat/phytochemical-detailedpage/${row.imppat_id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5139ED]"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : row.lotus_id ? (
                              <a
                                href={`https://lotus.naturalproducts.net/compound/lotus_id/${row.lotus_id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5139ED]"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="text-xs text-[#64748B]">
              Showing{" "}
              <span className="font-semibold text-[#0B0B18]">
                {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1}
              </span>{" "}
              –{" "}
              <span className="font-semibold text-[#0B0B18]">
                {Math.min(page * pageSize, filtered.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-[#0B0B18]">
                {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <select
                data-testid="page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-xs font-medium text-[#0B0B18]"
              >
                {[10, 25, 50, 100, 250].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
              <button
                data-testid="page-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="grid h-8 w-8 place-items-center rounded-full border border-[#E7E7F3] text-[#0B0B18] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span
                data-testid="page-indicator"
                className="text-xs font-medium text-[#0B0B18]"
              >
                {page} / {totalPages}
              </span>
              <button
                data-testid="page-next"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="grid h-8 w-8 place-items-center rounded-full border border-[#E7E7F3] text-[#0B0B18] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky proceed bar */}
      {compounds.length > 0 && (
        <div
          data-testid="proceed-bar"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-full border border-[#E7E7F3] bg-white/95 px-5 py-3 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur md:flex-row">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
                <FlaskConical className="h-4 w-4" />
              </span>
              <div>
                <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                  <span data-testid="proceed-count">{selectedCount}</span> compound{selectedCount === 1 ? "" : "s"} selected
                </div>
                <div className="text-[11px] text-[#64748B]">
                  Selection resets when you start a new search.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="clear-all-selection"
                onClick={() => setMany(compounds, false)}
                disabled={selectedCount === 0}
                className="rounded-full border border-[#E7E7F3] px-4 py-2 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                data-testid="proceed-drug-likeness"
                onClick={openConfirm}
                disabled={selectedCount === 0}
                className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
              >
                {standalone ? "Save Selection" : "Proceed to Drug-Likeness Screening"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          data-testid="confirm-dialog"
          className="max-w-md rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_30px_80px_-30px_rgba(81,57,237,0.45)]"
        >
          <AlertDialogHeader>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
              <FlaskConical className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-center font-display text-xl font-bold text-[#0B0B18]">
              Continue to Drug-Likeness Screening?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-[#64748B]">
              You have selected{" "}
              <span className="font-semibold text-[#0B0B18]">{selectedCount}</span>{" "}
              compound{selectedCount === 1 ? "" : "s"} for downstream analysis.
              These will be passed to SwissADME, Target Prediction, PPI, GO/KEGG
              and Docking modules.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 gap-2 sm:justify-center">
            <AlertDialogCancel
              data-testid="confirm-modify"
              className="rounded-full border border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/30 hover:text-[#5139ED]"
            >
              Modify Selection
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-continue"
              onClick={proceedToDrugLikeness}
              className="rounded-full bg-[#5139ED] text-white hover:bg-[#4127c9]"
            >
              Continue
              <ArrowRight className="ml-1 h-4 w-4" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function SearchInput({ testid, icon, placeholder, value, onChange, onSubmit, loading }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border-2 border-[#E7E7F3] bg-white p-1.5 pl-5 focus-within:border-[#5139ED] focus-within:ring-4 focus-within:ring-[#5139ED]/15 transition-colors duration-200">
      {icon}
      <input
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent px-3 py-2.5 text-sm text-[#0B0B18] outline-none placeholder:text-[#B4B4CD]"
      />
      <button
        data-testid={`${testid}-submit`}
        onClick={onSubmit}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4127c9] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        Search
      </button>
    </div>
  );
}

function NumberField({ testid, label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#64748B]">
        {label}
      </span>
      <input
        data-testid={testid}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 border-none bg-transparent text-sm text-[#0B0B18] outline-none"
      />
    </label>
  );
}

function ExportButton({ label, testid, onClick, disabled }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] transition-colors hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function CellValue({ field, row, onEdit }) {
  if (field === "structure") {
    return <StructureCanvas smiles={row.smiles} size={160} />;
  }
  if (field === "status") {
    const st = row.status;
    if (!st) return <span className="text-[#B4B4CD]">—</span>;
    const map = {
      standardized: {
        label: "Standardized",
        cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      },
      manual_review: {
        label: "Requires Manual Review",
        cls: "bg-amber-50 text-amber-700 ring-amber-200",
      },
      duplicate_removed: {
        label: "Duplicate Removed",
        cls: "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3] line-through",
      },
    };
    const m = map[st] || { label: st, cls: "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]" };
    return (
      <span
        data-testid={`status-${compoundKey(row)}`}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${m.cls}`}
      >
        {m.label}
      </span>
    );
  }
  if (field === "source") {
    const src = row.source || "";
    const notFound = row.not_found || src.endsWith("not found");
    const color = notFound
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : src === "IMPPAT"
      ? "bg-[#5139ED]/10 text-[#5139ED] ring-[#5139ED]/20"
      : src === "LOTUS"
      ? "bg-[#395AED]/10 text-[#395AED] ring-[#395AED]/20"
      : src.startsWith("LC-MS")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : src.includes("+")
      ? "bg-gradient-to-r from-[#5139ED] to-[#395AED] text-white ring-transparent"
      : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${color}`}
      >
        {src || "—"}
      </span>
    );
  }
  if (field === "smiles") {
    const v = row.smiles;
    const isLcms = (row.source || "").startsWith("LC-MS");
    if (!v) {
      if (isLcms && onEdit) {
        return (
          <input
            data-testid={`smiles-edit-${compoundKey(row)}`}
            defaultValue=""
            placeholder="SMILES Not Available — paste to edit"
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) onEdit({ smiles: val, not_found: false });
            }}
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[11px] text-amber-900 outline-none placeholder:text-amber-500 focus:border-[#5139ED] focus:ring-1 focus:ring-[#5139ED]/30"
          />
        );
      }
      return <span className="text-[#B4B4CD]">—</span>;
    }
    return (
      <span
        className="font-mono text-[11px] leading-tight text-[#1E1E33]"
        title={v}
      >
        {v.length > 60 ? `${v.slice(0, 60)}…` : v}
      </span>
    );
  }
  if (field === "inchi") {
    const v = row[field];
    if (!v) return <span className="text-[#B4B4CD]">—</span>;
    return (
      <span
        className="font-mono text-[11px] leading-tight text-[#1E1E33]"
        title={v}
      >
        {v.length > 60 ? `${v.slice(0, 60)}…` : v}
      </span>
    );
  }
  if (field === "molecular_weight") {
    return row.molecular_weight ? (
      <span className="font-mono text-[12px]">
        {Number(row.molecular_weight).toFixed(2)}
      </span>
    ) : (
      <span className="text-[#B4B4CD]">—</span>
    );
  }
  const v = row[field];
  return v ? (
    <span>{v}</span>
  ) : (
    <span className="text-[#B4B4CD]">—</span>
  );
}

function LoadingRows({ fields }) {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-b border-[#F1F1FA]">
      <td className="px-3 py-4">
        <div className="h-4 w-4 animate-pulse rounded bg-[#F1F1FA]" />
      </td>
      <td className="px-3 py-4">
        <div className="h-3 w-4 animate-pulse rounded bg-[#F1F1FA]" />
      </td>
      {fields.map((f) => (
        <td key={f.key} className="px-4 py-4">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#F1F1FA]" />
        </td>
      ))}
      <td />
    </tr>
  ));
}

function EmptyState({ hasQuery }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 py-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#F5F5FC] text-[#5139ED]">
          <Leaf className="h-5 w-5" />
        </div>
        <p className="mt-4 font-heading text-base font-semibold text-[#0B0B18]">
          {hasQuery ? "No compounds match this filter." : "Run a search to populate compounds."}
        </p>
        <p className="mt-1 text-sm text-[#64748B]">
          Try “Curcuma longa”, “Withania somnifera” or paste a SMILES.
        </p>
      </td>
    </tr>
  );
}
