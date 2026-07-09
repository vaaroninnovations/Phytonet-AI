import { useMemo, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";

const ALL_FIELDS = [
  { key: "compound_name", label: "Compound Name", default: true },
  { key: "structure", label: "Structure", default: true },
  { key: "molecular_formula", label: "Molecular Formula", default: true },
  { key: "molecular_weight", label: "Molecular Weight", default: true },
  { key: "imppat_id", label: "IMPPAT ID", default: true },
  { key: "smiles", label: "SMILES", default: false },
  { key: "inchi", label: "InChI", default: false },
  { key: "inchi_key", label: "InChI Key", default: true },
];

const MODES = [
  { id: "plant", label: "Plant name", icon: Leaf },
  { id: "simple", label: "LOTUS Simple", icon: Search },
  { id: "exact", label: "LOTUS Exact", icon: FlaskConical },
  { id: "substructure", label: "LOTUS Substructure", icon: Filter },
  { id: "molweight", label: "Molecular Weight", icon: ArrowUpAZ },
];

export default function PlantDatabase() {
  const [mode, setMode] = useState("plant");
  const [selectedFields, setSelectedFields] = useState(
    Object.fromEntries(ALL_FIELDS.map((f) => [f.key, f.default]))
  );
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [compounds, setCompounds] = useState([]);
  const [meta, setMeta] = useState(null);

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
  const [pageSize, setPageSize] = useState(20);

  const activeFields = useMemo(
    () => ALL_FIELDS.filter((f) => selectedFields[f.key]),
    [selectedFields]
  );

  const filtered = useMemo(() => {
    let rows = compounds;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some(
          (v) => v && String(v).toLowerCase().includes(q)
        )
      );
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
  }, [compounds, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const runSearch = async (fn, label) => {
    setLoading(true);
    setProgress(15);
    setCompounds([]);
    setMeta(null);
    setPage(1);
    const tick = setInterval(
      () => setProgress((p) => (p < 92 ? p + Math.random() * 6 : p)),
      500
    );
    try {
      const data = await fn();
      setCompounds(data.compounds || []);
      setMeta(data);
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

  const searchByMode = () => {
    if (mode === "plant") {
      if (!plant.trim()) return toast.error("Enter a plant name");
      return runSearch(
        () =>
          searchPlant(plant.trim(), {
            limit: 200,
            wantStructure: selectedFields.smiles || selectedFields.inchi || selectedFields.inchi_key || selectedFields.structure,
            wantPhyschem: selectedFields.molecular_formula || selectedFields.molecular_weight,
          }),
        `Plant "${plant.trim()}"`
      );
    }
    if (mode === "simple") {
      if (!simpleQuery.trim()) return toast.error("Enter a query");
      return runSearch(
        () => lotusSimple(simpleQuery.trim()),
        `Simple "${simpleQuery.trim()}"`
      );
    }
    if (mode === "exact") {
      if (!exactValue.trim()) return toast.error("Enter a value");
      return runSearch(
        () => lotusExact(exactType, exactValue.trim()),
        `Exact ${exactType}`
      );
    }
    if (mode === "substructure") {
      if (!subSmiles.trim()) return toast.error("Enter SMILES");
      return runSearch(
        () => lotusSubstructure(subSmiles.trim(), subAlgo, subMax),
        `Substructure (${subAlgo})`
      );
    }
    if (mode === "molweight") {
      if (Number(minMass) >= Number(maxMass))
        return toast.error("minMass must be < maxMass");
      return runSearch(
        () => lotusMolweight(Number(minMass), Number(maxMass), Number(mwMaxHits)),
        `MW ${minMass}-${maxMass}`
      );
    }
  };

  const onSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
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

        {/* Search panel */}
        <div className="mt-10 rounded-3xl border border-[#E7E7F3] bg-white p-5 shadow-[0_20px_60px_-40px_rgba(81,57,237,0.35)] md:p-7">
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
              <SearchInput
                testid="plant-input"
                icon={<Leaf className="h-5 w-5 text-[#5139ED]" />}
                placeholder="e.g. Curcuma longa, Withania somnifera, Ocimum sanctum"
                value={plant}
                onChange={setPlant}
                onSubmit={searchByMode}
                loading={loading}
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
      </section>

      {/* Results */}
      <section className="relative mx-auto mt-10 max-w-7xl px-6 pb-24">
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
                  placeholder="Filter results…"
                  className="brand-focus w-64 rounded-full border border-[#E7E7F3] bg-white py-2.5 pl-9 pr-4 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
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

          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#F1F1FA]">
            <table
              data-testid="results-table"
              className="w-full min-w-[720px] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <th className="w-10 px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    #
                  </th>
                  {activeFields.map((f) => (
                    <th
                      key={f.key}
                      onClick={() => f.key !== "structure" && onSort(f.key)}
                      className="cursor-pointer whitespace-nowrap px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B] hover:text-[#5139ED]"
                    >
                      <span className="inline-flex items-center gap-1">
                        {f.label}
                        {f.key !== "structure" && (
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows fields={activeFields} />
                ) : pageRows.length === 0 ? (
                  <EmptyState hasQuery={!!compounds.length} />
                ) : (
                  pageRows.map((row, i) => (
                    <tr
                      key={
                        row.imppat_id ||
                        row.lotus_id ||
                        row.compound_name ||
                        i
                      }
                      className="border-b border-[#F1F1FA] transition-colors hover:bg-[#F8F8FE]"
                    >
                      <td className="px-3 py-3 font-mono text-xs text-[#B4B4CD]">
                        {(page - 1) * pageSize + i + 1}
                      </td>
                      {activeFields.map((f) => (
                        <td
                          key={f.key}
                          className="max-w-[280px] px-4 py-3 align-middle text-[13px] text-[#1E1E33]"
                        >
                          <CellValue field={f.key} row={row} />
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
                  ))
                )}
              </tbody>
            </table>
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
                {[10, 20, 50, 100].map((n) => (
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

function CellValue({ field, row }) {
  if (field === "structure") {
    return <StructureCanvas smiles={row.smiles} size={160} />;
  }
  if (field === "smiles" || field === "inchi") {
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
