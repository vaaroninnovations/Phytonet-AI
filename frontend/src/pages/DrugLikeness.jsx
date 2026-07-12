import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelection, compoundKey } from "@/context/SelectionContext";
import { useWorkflow } from "@/context/WorkflowContext";
import WorkflowLayout from "@/components/WorkflowLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { admetPredict, admetStatus } from "@/lib/api";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Beaker,
  Download,
  FlaskConical,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";

const CATEGORY_ORDER = [
  { key: "absorption", label: "Absorption" },
  { key: "distribution", label: "Distribution" },
  { key: "metabolism", label: "Metabolism" },
  { key: "excretion", label: "Excretion" },
  { key: "toxicity", label: "Toxicity" },
  { key: "druglikeness", label: "Drug-Likeness" },
];

// Threshold conventions — probabilities > 0.5 = "positive" (classifier output).
const isHigh = (v) => typeof v === "number" && v >= 0.5;
const passBool = (v) => v === true;

const INITIAL_FILTERS = {
  hia: "any",
  bbb: "any",
  pgp: "any",
  cyp1a2: "any",
  cyp2c9: "any",
  cyp2c19: "any",
  cyp2d6: "any",
  cyp3a4: "any",
  ames: "any",
  herg: "any",
  dili: "any",
  carcinogenicity: "any",
  skin: "any",
  lipinski: false,
  veber: false,
  ghose: false,
  egan: false,
  muegge: false,
  bioavailability: "any",
  logpMin: "",
  logpMax: "",
  tpsaMin: "",
  tpsaMax: "",
  mwMin: "",
  mwMax: "",
};

export default function DrugLikeness() {
  const navigate = useNavigate();
  const {
    selectedCompounds,
    count: inputCount,
    sourcePlant,
  } = useSelection();
  const { markComplete } = useWorkflow();

  // ADMET job state
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState("idle"); // idle | running | done | failed
  const [rows, setRows] = useState([]); // enriched compounds with .admet/.physchem/.druglikeness
  const pollRef = useRef(null);

  // UI state
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [finalSel, setFinalSel] = useState(() => ({})); // {compoundKey: row}
  const finalCount = Object.keys(finalSel).length;

  // Mark previous step complete on mount so the sidebar reflects progression.
  useEffect(() => {
    markComplete("plant-database");
  }, [markComplete]);

  // Auto-run ADMET prediction when we arrive with selected compounds.
  useEffect(() => {
    if (inputCount === 0) return;
    let cancelled = false;
    (async () => {
      try {
        setStatus("running");
        setProgress({ done: 0, total: inputCount });
        const payload = selectedCompounds.map((c) => ({
          compound_name: c.compound_name,
          smiles: c.smiles,
          canonical_smiles: c.canonical_smiles || c.smiles,
          molecular_formula: c.molecular_formula,
          molecular_weight: c.molecular_weight,
          imppat_id: c.imppat_id,
          lotus_id: c.lotus_id,
          pubchem_cid: c.pubchem_cid,
          inchi_key: c.inchi_key,
          source: c.source,
          id: compoundKey(c),
        }));
        const start = await admetPredict(payload);
        if (cancelled || !start.job_id) return;
        setJobId(start.job_id);
        pollRef.current = setInterval(async () => {
          try {
            const s = await admetStatus(start.job_id);
            if (cancelled) return;
            setProgress({ done: s.done, total: s.total });
            if (s.status === "done") {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setRows(s.compounds || []);
              setStatus("done");
            } else if (s.status === "failed") {
              clearInterval(pollRef.current);
              pollRef.current = null;
              setStatus("failed");
              toast.error("ADMET prediction failed — please retry.");
            }
          } catch {
            // ignore transient poll errors
          }
        }, 900);
      } catch (e) {
        setStatus("failed");
        toast.error(e?.response?.data?.detail || "ADMET request failed");
      }
    })();
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputCount]);

  // Filtering + sorting
  const filtered = useMemo(() => {
    const applyRange = (v, min, max) => {
      if (v == null || Number.isNaN(v)) return true;
      if (min !== "" && v < Number(min)) return false;
      if (max !== "" && v > Number(max)) return false;
      return true;
    };
    const passesSelect = (val, choice, kind = "prob") => {
      if (choice === "any") return true;
      if (kind === "prob") {
        if (choice === "high" || choice === "yes" || choice === "substrate")
          return isHigh(val);
        return !isHigh(val);
      }
      return true;
    };
    let out = rows.filter((r) => {
      const a = r.admet || {};
      const p = r.physchem || {};
      const d = r.druglikeness || {};
      if (!passesSelect(a.hia, filters.hia)) return false;
      if (!passesSelect(a.bbb, filters.bbb)) return false;
      if (!passesSelect(a.pgp_inhibitor, filters.pgp)) return false;
      if (!passesSelect(a.cyp1a2_inhibitor, filters.cyp1a2)) return false;
      if (!passesSelect(a.cyp2c9_inhibitor, filters.cyp2c9)) return false;
      if (!passesSelect(a.cyp2c19_inhibitor, filters.cyp2c19)) return false;
      if (!passesSelect(a.cyp2d6_inhibitor, filters.cyp2d6)) return false;
      if (!passesSelect(a.cyp3a4_inhibitor, filters.cyp3a4)) return false;
      if (!passesSelect(a.ames, filters.ames)) return false;
      if (!passesSelect(a.herg, filters.herg)) return false;
      if (!passesSelect(a.dili, filters.dili)) return false;
      if (!passesSelect(a.carcinogenicity, filters.carcinogenicity)) return false;
      if (!passesSelect(a.skin_sensitization, filters.skin)) return false;
      if (filters.lipinski && !passBool(d.lipinski_pass)) return false;
      if (filters.veber && !passBool(d.veber_pass)) return false;
      if (filters.ghose && !passBool(d.ghose_pass)) return false;
      if (filters.egan && !passBool(d.egan_pass)) return false;
      if (filters.muegge && !passBool(d.muegge_pass)) return false;
      if (filters.bioavailability !== "any") {
        const b = a.bioavailability ?? 0;
        if (filters.bioavailability === "high" && b < 0.5) return false;
        if (filters.bioavailability === "low" && b >= 0.5) return false;
      }
      if (!applyRange(p.logp, filters.logpMin, filters.logpMax)) return false;
      if (!applyRange(p.tpsa, filters.tpsaMin, filters.tpsaMax)) return false;
      if (!applyRange(p.mw, filters.mwMin, filters.mwMax)) return false;
      return true;
    });
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter(
        (r) =>
          (r.compound_name || "").toLowerCase().includes(q) ||
          (r.molecular_formula || "").toLowerCase().includes(q) ||
          String(r.physchem?.mw ?? "").includes(q) ||
          (r.source || "").toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const va = pickSort(a, sortKey) ?? "";
        const vb = pickSort(b, sortKey) ?? "";
        if (typeof va === "number" && typeof vb === "number")
          return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc"
          ? String(va).localeCompare(String(vb))
          : String(vb).localeCompare(String(va));
      });
    }
    return out;
  }, [rows, filters, query, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleRow = (row) => {
    setFinalSel((s) => {
      const k = compoundKey(row);
      if (s[k]) {
        const { [k]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [k]: row };
    });
  };
  const setManyFinal = (rowsIn, on) => {
    setFinalSel((s) => {
      const next = { ...s };
      rowsIn.forEach((r) => {
        const k = compoundKey(r);
        if (on) next[k] = r;
        else delete next[k];
      });
      return next;
    });
  };
  const filteredSelectedCount = filtered.filter((r) => finalSel[compoundKey(r)]).length;
  const allInViewSelected =
    filtered.length > 0 && filteredSelectedCount === filtered.length;
  const someInViewSelected =
    filteredSelectedCount > 0 && filteredSelectedCount < filtered.length;

  const onContinue = () => {
    if (finalCount === 0) return toast.error("Select at least one compound");
    markComplete("admet-drug-likeness");
    navigate("/target-prediction");
  };

  // Export helpers
  const flatten = (r) => ({
    "Compound Name": r.compound_name,
    "Formula": r.molecular_formula,
    "Molecular Weight": r.physchem?.mw ?? r.molecular_weight,
    "Canonical SMILES": r.canonical_smiles || r.smiles,
    "LogP": r.physchem?.logp,
    "TPSA": r.physchem?.tpsa,
    "HBA": r.physchem?.hba,
    "HBD": r.physchem?.hbd,
    "Rotatable Bonds": r.druglikeness?.rotatable_bonds,
    "QED": r.physchem?.qed,
    "HIA": r.admet?.hia,
    "Caco-2": r.admet?.caco2,
    "P-gp inhibitor": r.admet?.pgp_inhibitor,
    "BBB": r.admet?.bbb,
    "PPBR": r.admet?.ppbr,
    "VDss": r.admet?.vdss,
    "CYP1A2 inhibitor": r.admet?.cyp1a2_inhibitor,
    "CYP2C9 inhibitor": r.admet?.cyp2c9_inhibitor,
    "CYP2C19 inhibitor": r.admet?.cyp2c19_inhibitor,
    "CYP2D6 inhibitor": r.admet?.cyp2d6_inhibitor,
    "CYP3A4 inhibitor": r.admet?.cyp3a4_inhibitor,
    "Clearance (hepatocyte)": r.admet?.clearance_hepatocyte,
    "Half-life": r.admet?.half_life,
    "AMES": r.admet?.ames,
    "hERG": r.admet?.herg,
    "DILI": r.admet?.dili,
    "Carcinogenicity": r.admet?.carcinogenicity,
    "Skin sensitization": r.admet?.skin_sensitization,
    "Lipinski Pass": r.druglikeness?.lipinski_pass,
    "Veber Pass": r.druglikeness?.veber_pass,
    "Ghose Pass": r.druglikeness?.ghose_pass,
    "Egan Pass": r.druglikeness?.egan_pass,
    "Muegge Pass": r.druglikeness?.muegge_pass,
    "Bioavailability": r.admet?.bioavailability,
    "Selection Status": finalSel[compoundKey(r)] ? "Selected" : "Not selected",
  });

  const exportRows = () => filtered.filter((r) => finalSel[compoundKey(r)]).map(flatten);
  const doExport = (fn) => {
    const data = exportRows();
    if (data.length === 0) return toast.error("Select compounds to export");
    const fields = Object.keys(data[0]).map((k) => ({ key: k, label: k }));
    fn(
      data.map((d) => {
        const obj = {};
        fields.forEach((f) => (obj[f.key] = d[f.label]));
        return obj;
      }),
      fields,
      "admet_selected.csv"
    );
  };

  if (inputCount === 0) {
    return (
      <WorkflowLayout>
        <EmptySelection />
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <main
        data-testid="admet-page"
        className="relative mx-auto max-w-7xl px-6 pb-40 pt-14"
      >
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Module · 02
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
          ADMET &amp; Drug-Likeness Analysis
        </h1>
        <p className="mt-3 max-w-2xl text-[#64748B]">
          Predicting ADMET endpoints for {inputCount} selected compound
          {inputCount === 1 ? "" : "s"}
          {sourcePlant ? ` from ${sourcePlant}` : ""} via ADMET-AI (Chemprop
          ensembles).
        </p>

        {/* Status */}
        <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6">
          {status !== "done" ? (
            <div
              data-testid="admet-progress"
              className="flex items-center gap-3"
            >
              <Loader2 className="h-5 w-5 animate-spin text-[#5139ED]" />
              <div className="flex-1">
                <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                  {status === "failed"
                    ? "ADMET prediction failed"
                    : "Running ADMET & drug-likeness prediction…"}
                </div>
                <div className="text-xs text-[#64748B]">
                  {progress.done} of {progress.total} compounds processed
                  {status === "running" &&
                    " · first run loads the model (~20 s)"}
                </div>
              </div>
              <div className="h-2 w-40 overflow-hidden rounded-full bg-[#F1F1FA]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] transition-[width] duration-300"
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
            <div
              data-testid="admet-done"
              className="flex items-center gap-3 text-sm text-[#0B0B18]"
            >
              <Beaker className="h-5 w-5 text-emerald-500" />
              <span className="font-heading text-sm font-semibold">
                ADMET predictions ready · {rows.length} compound
                {rows.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {/* Filters */}
        <FiltersPanel filters={filters} setFilters={setFilters} />

        {/* Results header */}
        <div className="mt-6 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Results
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span
                data-testid="admet-row-count"
                className="font-display text-2xl font-bold text-[#0B0B18]"
              >
                {filtered.length}
              </span>
              <span className="text-sm text-[#64748B]">
                of {rows.length} compounds match filters
              </span>
            </div>
            <div
              data-testid="admet-selection-count"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#5139ED]/8 px-3 py-1 text-xs font-semibold text-[#5139ED]"
            >
              <FlaskConical className="h-3 w-3" />
              Selected compounds: {finalCount} of {rows.length}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B4B4CD]" />
              <input
                data-testid="admet-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, formula, MW…"
                className="brand-focus w-64 rounded-full border border-[#E7E7F3] bg-white py-2.5 pl-9 pr-4 text-sm text-[#0B0B18] placeholder:text-[#B4B4CD]"
              />
            </div>
            <ExportBtn
              label="CSV"
              testid="admet-export-csv"
              onClick={() =>
                doExport((data, fields) =>
                  exportCSV(data, fields, "admet_selected.csv")
                )
              }
              disabled={finalCount === 0}
            />
            <ExportBtn
              label="Excel"
              testid="admet-export-xlsx"
              onClick={() =>
                doExport((data, fields) =>
                  exportXLSX(data, fields, "admet_selected.xlsx")
                )
              }
              disabled={finalCount === 0}
            />
            <Link
              to="/phytonet-ai"
              data-testid="modify-selection-link"
              className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Modify selection
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white">
          <div className="max-h-[640px] overflow-auto">
            <table
              data-testid="admet-table"
              className="w-full min-w-[1080px] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <Th sticky>
                    <Checkbox
                      data-testid="admet-select-all"
                      checked={
                        allInViewSelected
                          ? true
                          : someInViewSelected
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={() =>
                        setManyFinal(filtered, !allInViewSelected)
                      }
                      disabled={filtered.length === 0}
                      className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=indeterminate]:bg-[#5139ED] data-[state=checked]:text-white data-[state=indeterminate]:text-white"
                    />
                  </Th>
                  {[
                    ["compound_name", "Compound"],
                    ["mw", "MW"],
                    ["logp", "LogP"],
                    ["tpsa", "TPSA"],
                    ["hia", "HIA"],
                    ["bbb", "BBB"],
                    ["ames", "AMES"],
                    ["herg", "hERG"],
                    ["dili", "DILI"],
                    ["lipinski_pass", "Lipinski"],
                    ["veber_pass", "Veber"],
                    ["druglike", "Rules"],
                  ].map(([k, label]) => (
                    <Th
                      key={k}
                      sticky
                      onClick={() => k !== "druglike" && onSort(k)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {k !== "druglike" && (
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        )}
                      </span>
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {status !== "done" ? (
                  <tr>
                    <td colSpan={99} className="px-4 py-14 text-center text-sm text-[#64748B]">
                      Running ADMET prediction…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={99} className="px-4 py-14 text-center text-sm text-[#64748B]">
                      No compounds match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <AdmetRow
                      key={compoundKey(r)}
                      row={r}
                      selected={!!finalSel[compoundKey(r)]}
                      onToggle={() => toggleRow(r)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Sticky Proceed bar */}
      {rows.length > 0 && (
        <div
          data-testid="admet-proceed-bar"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-full border border-[#E7E7F3] bg-white/95 px-5 py-3 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur md:flex-row">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
                <FlaskConical className="h-4 w-4" />
              </span>
              <div>
                <div className="font-heading text-sm font-semibold text-[#0B0B18]">
                  <span data-testid="admet-proceed-count">{finalCount}</span> of{" "}
                  {rows.length} compounds selected
                </div>
                <div className="text-[11px] text-[#64748B]">
                  Only these move on to Target Prediction.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="admet-clear-all"
                onClick={() => setFinalSel({})}
                disabled={finalCount === 0}
                className="rounded-full border border-[#E7E7F3] px-4 py-2 text-xs font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="mr-1 inline h-3 w-3" />
                Clear
              </button>
              <button
                data-testid="continue-admet-drug-likeness"
                onClick={onContinue}
                disabled={finalCount === 0}
                className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9] disabled:pointer-events-none disabled:opacity-50"
              >
                Proceed to Target Prediction
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkflowLayout>
  );
}

function pickSort(r, key) {
  if (key === "compound_name") return r.compound_name;
  if (["mw", "logp", "tpsa"].includes(key)) return r.physchem?.[key];
  if (["hia", "bbb", "ames", "herg", "dili"].includes(key)) return r.admet?.[key];
  if (key === "lipinski_pass") return r.druglikeness?.lipinski_pass ? 1 : 0;
  if (key === "veber_pass") return r.druglikeness?.veber_pass ? 1 : 0;
  return null;
}

function Th({ children, sticky, onClick }) {
  return (
    <th
      onClick={onClick}
      className={`whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B] ${
        onClick ? "cursor-pointer hover:text-[#5139ED]" : ""
      } ${sticky ? "sticky top-0 z-10 bg-[#FAFAFF]" : ""}`}
    >
      {children}
    </th>
  );
}

function AdmetRow({ row, selected, onToggle }) {
  const p = row.physchem || {};
  const a = row.admet || {};
  const d = row.druglikeness || {};
  return (
    <tr
      data-testid={`admet-row-${compoundKey(row)}`}
      className={`border-b border-[#F1F1FA] ${
        selected ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
      }`}
    >
      <td className="px-3 py-3">
        <Checkbox
          data-testid={`admet-row-check-${compoundKey(row)}`}
          checked={selected}
          onCheckedChange={onToggle}
          className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
        />
      </td>
      <td className="max-w-[260px] px-3 py-3 text-[13px]">
        <div className="font-heading font-semibold text-[#0B0B18]">
          {row.compound_name || "—"}
        </div>
        <div className="mt-0.5 text-[10px] text-[#64748B]">
          {row.molecular_formula || ""} · {row.source || ""}
        </div>
      </td>
      <Cell num={p.mw} fixed={2} />
      <Cell num={p.logp} fixed={2} />
      <Cell num={p.tpsa} fixed={1} />
      <ProbCell v={a.hia} label="HIA" />
      <ProbCell v={a.bbb} label="BBB" />
      <ProbCell v={a.ames} label="AMES" reverse />
      <ProbCell v={a.herg} label="hERG" reverse />
      <ProbCell v={a.dili} label="DILI" reverse />
      <BoolCell v={d.lipinski_pass} />
      <BoolCell v={d.veber_pass} />
      <td className="px-3 py-3 text-[10px] font-mono text-[#64748B]">
        {[
          d.lipinski_pass && "Lip",
          d.veber_pass && "Veb",
          d.ghose_pass && "Gho",
          d.egan_pass && "Ega",
          d.muegge_pass && "Mue",
        ]
          .filter(Boolean)
          .join(" · ") || "—"}
      </td>
    </tr>
  );
}

function Cell({ num, fixed = 2 }) {
  return (
    <td className="px-3 py-3 font-mono text-[11px] text-[#1E1E33]">
      {typeof num === "number" ? num.toFixed(fixed) : "—"}
    </td>
  );
}

function ProbCell({ v, reverse }) {
  if (typeof v !== "number")
    return <td className="px-3 py-3 text-[#B4B4CD]">—</td>;
  const high = v >= 0.5;
  const good = reverse ? !high : high;
  return (
    <td className="px-3 py-3">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
          good
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-amber-50 text-amber-700 ring-amber-200"
        }`}
      >
        {v.toFixed(2)}
      </span>
    </td>
  );
}

function BoolCell({ v }) {
  if (v == null) return <td className="px-3 py-3 text-[#B4B4CD]">—</td>;
  return (
    <td className="px-3 py-3">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
          v
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
        }`}
      >
        {v ? "PASS" : "FAIL"}
      </span>
    </td>
  );
}

function FiltersPanel({ filters, setFilters }) {
  const setF = (patch) => setFilters((s) => ({ ...s, ...patch }));
  return (
    <div
      data-testid="admet-filters"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Filters
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Select label="HIA (Absorption)" testid="filter-hia" value={filters.hia} onChange={(v) => setF({ hia: v })}
          options={[["any","Any"],["high","High"],["low","Low"]]} />
        <Select label="BBB permeability" testid="filter-bbb" value={filters.bbb} onChange={(v) => setF({ bbb: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="P-gp inhibitor" testid="filter-pgp" value={filters.pgp} onChange={(v) => setF({ pgp: v })}
          options={[["any","Any"],["substrate","Substrate"],["non-substrate","Non-substrate"]]} />
        <Select label="AMES" testid="filter-ames" value={filters.ames} onChange={(v) => setF({ ames: v })}
          options={[["any","Any"],["yes","Positive"],["no","Negative"]]} />
        <Select label="hERG" testid="filter-herg" value={filters.herg} onChange={(v) => setF({ herg: v })}
          options={[["any","Any"],["yes","Positive"],["no","Negative"]]} />
        <Select label="DILI" testid="filter-dili" value={filters.dili} onChange={(v) => setF({ dili: v })}
          options={[["any","Any"],["yes","Positive"],["no","Negative"]]} />
        <Select label="Carcinogenicity" testid="filter-carc" value={filters.carcinogenicity} onChange={(v) => setF({ carcinogenicity: v })}
          options={[["any","Any"],["yes","Positive"],["no","Negative"]]} />
        <Select label="Skin sensitization" testid="filter-skin" value={filters.skin} onChange={(v) => setF({ skin: v })}
          options={[["any","Any"],["yes","Positive"],["no","Negative"]]} />
        <Select label="CYP1A2 inhibitor" testid="filter-cyp1a2" value={filters.cyp1a2} onChange={(v) => setF({ cyp1a2: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="CYP2C9 inhibitor" testid="filter-cyp2c9" value={filters.cyp2c9} onChange={(v) => setF({ cyp2c9: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="CYP2C19 inhibitor" testid="filter-cyp2c19" value={filters.cyp2c19} onChange={(v) => setF({ cyp2c19: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="CYP2D6 inhibitor" testid="filter-cyp2d6" value={filters.cyp2d6} onChange={(v) => setF({ cyp2d6: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="CYP3A4 inhibitor" testid="filter-cyp3a4" value={filters.cyp3a4} onChange={(v) => setF({ cyp3a4: v })}
          options={[["any","Any"],["yes","Yes"],["no","No"]]} />
        <Select label="Bioavailability" testid="filter-bioavail" value={filters.bioavailability} onChange={(v) => setF({ bioavailability: v })}
          options={[["any","Any"],["high","High"],["low","Low"]]} />
        <RangeInput label="LogP" testid="filter-logp" min={filters.logpMin} max={filters.logpMax}
          onMin={(v) => setF({ logpMin: v })} onMax={(v) => setF({ logpMax: v })} />
        <RangeInput label="TPSA" testid="filter-tpsa" min={filters.tpsaMin} max={filters.tpsaMax}
          onMin={(v) => setF({ tpsaMin: v })} onMax={(v) => setF({ tpsaMax: v })} />
        <RangeInput label="Mol. Weight" testid="filter-mw" min={filters.mwMin} max={filters.mwMax}
          onMin={(v) => setF({ mwMin: v })} onMax={(v) => setF({ mwMax: v })} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-widest text-[#64748B]">
          Drug-likeness rules
        </span>
        {[
          ["lipinski", "Lipinski"],
          ["veber", "Veber"],
          ["ghose", "Ghose"],
          ["egan", "Egan"],
          ["muegge", "Muegge"],
        ].map(([k, l]) => (
          <label
            key={k}
            data-testid={`filter-${k}`}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filters[k]
                ? "border-[#5139ED]/40 bg-[#5139ED]/8 text-[#5139ED]"
                : "border-[#E7E7F3] bg-white text-[#64748B] hover:border-[#5139ED]/30"
            }`}
          >
            <Checkbox
              checked={filters[k]}
              onCheckedChange={(v) => setFilters((s) => ({ ...s, [k]: !!v }))}
              className="h-3.5 w-3.5 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
            />
            {l} pass
          </label>
        ))}
        <button
          data-testid="filter-reset"
          onClick={() => setFilters(INITIAL_FILTERS)}
          className="ml-auto text-xs font-semibold text-[#64748B] underline decoration-dotted underline-offset-4 hover:text-[#5139ED]"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}

function Select({ label, testid, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
        {label}
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

function RangeInput({ label, testid, min, max, onMin, onMax }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          data-testid={`${testid}-min`}
          type="number"
          placeholder="min"
          value={min}
          onChange={(e) => onMin(e.target.value)}
          className="brand-focus w-full min-w-0 rounded-lg border border-[#E7E7F3] bg-white px-2.5 py-2 text-sm text-[#0B0B18]"
        />
        <input
          data-testid={`${testid}-max`}
          type="number"
          placeholder="max"
          value={max}
          onChange={(e) => onMax(e.target.value)}
          className="brand-focus w-full min-w-0 rounded-lg border border-[#E7E7F3] bg-white px-2.5 py-2 text-sm text-[#0B0B18]"
        />
      </div>
    </div>
  );
}

function ExportBtn({ label, testid, onClick, disabled }) {
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

function EmptySelection() {
  return (
    <main
      data-testid="admet-empty"
      className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
        <FlaskConical className="h-6 w-6" />
      </div>
      <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">
        ADMET &amp; Drug-Likeness Analysis
      </h1>
      <p className="mt-3 text-[#64748B]">
        Select compounds in the Plant Database first — they'll be automatically
        analyzed here.
      </p>
      <Link
        to="/phytonet-ai"
        data-testid="back-to-plant-db"
        className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"
      >
        <ArrowLeft className="h-4 w-4" />
        Go to Plant Database
      </Link>
    </main>
  );
}
