import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelection, compoundKey } from "@/context/SelectionContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { useNetwork } from "@/context/NetworkContext";
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
import { admetPredict, admetStatus } from "@/lib/api";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import {
  DEFAULT_WEIGHTS,
  assess,
  scoreCompound,
  selectedParameters,
  totalSelected,
} from "@/lib/admetScoring";
import {
  ADME_PARAMS,
  TOX_PARAMS,
  DL_RULES,
  DL_NUMERIC,
  DL_CRITERIA_TABLE,
  AUTO_ANALYSIS_FILTERS,
  labelFor,
  activeColumnsFor,
  anyFilterActive,
  isFilterActive,
  readPath,
} from "@/lib/admetParams";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Beaker,
  ChevronDown,
  ChevronRight,
  Download,
  FlaskConical,
  HelpCircle,
  Loader2,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";

// ── Refactored per-page parts (2026-02-23) ────────────────────────────
import { HelpTip } from "./parts/HelpTip";
import { ScoringConfigPanel } from "./parts/ScoringConfigPanel";
import { FilterCard, DrugLikenessFilterCard, CriteriaCard } from "./parts/FilterCards";
import { ResultsTable } from "./parts/tableComponents";
import { ExportBtn } from "./parts/ExportBtn";
import { AutoAnalysisCard } from "./parts/AutoAnalysisCard";
import { EmptySelection } from "./parts/EmptySelection";

const INITIAL_FILTERS = {
  // ADME - Absorption
  hia: "any",
  pampa: "any",
  pgp_inh: "any",
  bioavailability: "any",
  caco2Min: "",
  caco2Max: "",
  solubilityMin: "",
  solubilityMax: "",
  // ADME - Distribution
  bbb: "any",
  ppbrMin: "",
  ppbrMax: "",
  vdssMin: "",
  vdssMax: "",
  // ADME - Metabolism (CYPs, 5-way where substrate is available)
  cyp1a2: "any",
  cyp2c9: "any",
  cyp2c19: "any",
  cyp2d6: "any",
  cyp3a4: "any",
  // ADME - Excretion
  clearanceHepMin: "",
  clearanceHepMax: "",
  clearanceMicMin: "",
  clearanceMicMax: "",
  halfLifeMin: "",
  halfLifeMax: "",
  // Toxicity
  ames: "any",
  herg: "any",
  dili: "any",
  carcinogenicity: "any",
  skin: "any",
  clintox: "any",
  ld50Min: "",
  ld50Max: "",
  // Drug-Likeness rules
  lipinski: false,
  veber: false,
  ghose: false,
  egan: false,
  muegge: false,
  pfizer: false,
  gsk: false,
  // Drug-Likeness numerics
  mwMin: "",
  mwMax: "",
  logpMin: "",
  logpMax: "",
  tpsaMin: "",
  tpsaMax: "",
  hbaMin: "",
  hbaMax: "",
  hbdMin: "",
  hbdMax: "",
  rotbMin: "",
  rotbMax: "",
};

export default function DrugLikeness() {
  const navigate = useNavigate();
  const { standalone } = useIsStandalone();
  const {
    selectedCompounds,
    count: inputCount,
    sourcePlant,
  } = useSelection();
  const { markComplete } = useWorkflow();
  const { setSelectedCompounds: setNetworkCompounds } = useNetwork();

  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [status, setStatus] = useState("idle");
  const [rows, setRows] = useState([]);
  const pollRef = useRef(null);

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState({});
  const [finalSel, setFinalSel] = useState(() => ({}));
  const [autoActive, setAutoActive] = useState(false);
  const finalCount = Object.keys(finalSel).length;

  const weightTotal =
    (Number(weights.druglikeness) || 0) +
    (Number(weights.adme) || 0) +
    (Number(weights.toxicity) || 0);
  const weightsValid = weightTotal === 100;

  const selMap = useMemo(() => selectedParameters(filters), [filters]);
  const scoringEnabled = weightsValid && totalSelected(selMap) > 0;

  useEffect(() => {
    if (standalone) return; // Standalone view: don't touch the guided-workflow progress tracker.
    markComplete("plant-database");
  }, [markComplete, standalone]);

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
            /* ignore */
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

  // Score + rank rows (independent of the three per-section column selections).
  const scoredRows = useMemo(() => {
    let out = rows.map((r) => {
      const s = scoringEnabled ? scoreCompound(r, selMap, weights) : null;
      return { ...r, _score: s };
    });
    if (scoringEnabled) {
      const ranked = [...out].sort(
        (a, b) => (b._score?.score ?? -1) - (a._score?.score ?? -1)
      );
      const rankMap = new Map(ranked.map((r, i) => [compoundKey(r), i + 1]));
      out = out.map((r) => ({ ...r, _rank: rankMap.get(compoundKey(r)) }));
    }
    // Text search
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
    // Sort by rank (score desc) by default; user can override per-column later.
    if (scoringEnabled) {
      out = [...out].sort((a, b) => (a._rank ?? 9e9) - (b._rank ?? 9e9));
    }
    return out;
  }, [rows, selMap, weights, scoringEnabled, query]);

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

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setAutoActive(false);
  };

  const runAutoAnalyse = () => {
    setFilters((s) => ({ ...s, ...AUTO_ANALYSIS_FILTERS }));
    setWeights(DEFAULT_WEIGHTS);
    setAutoActive(true);
    // Smoothly reveal the auto-analysis table.
    setTimeout(() => {
      const el = document.querySelector('[data-testid="auto-analysis-card"]');
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  const onContinue = () => {
    if (finalCount === 0) return toast.error("Select at least one compound");
    // Publish the selected compounds so Step 3 (Target Prediction) can pick them up.
    setNetworkCompounds(Object.values(finalSel));
    if (standalone) {
      toast.success(`${finalCount} compound${finalCount === 1 ? "" : "s"} saved. Use the export buttons to download results.`);
      return;
    }
    markComplete("admet-drug-likeness");
    navigate("/target-prediction");
  };

  // ---------- Export (unified across all sections) ----------
  const flattenRow = (r) => {
    const s = r._score;
    const asmt = s?.score != null ? assess(s.score) : null;
    const dlScore = s?.categoryScores?.druglikeness;
    const admetMean =
      s && s.categoryScores?.adme != null && s.categoryScores?.toxicity != null
        ? (s.categoryScores.adme + s.categoryScores.toxicity) / 2
        : s?.categoryScores?.adme ?? s?.categoryScores?.toxicity;
    const dlLabelStr =
      dlScore != null ? labelFor(dlScore, "drug") : s?.score != null ? labelFor(s.score, "drug") : "";
    const admetLabelStr =
      admetMean != null
        ? labelFor(admetMean, "admet")
        : s?.score != null
        ? labelFor(s.score, "admet")
        : "";
    const recommended = s?.score != null && s.score >= 55 ? "YES" : "NO";
    const breakdownStr =
      s?.breakdown
        ?.map(
          (b) =>
            `${b.parameter}[${b.threshold || "—"}]=${
              b.pass == null ? "n/a" : b.pass ? "PASS" : "FAIL"
            }(+${(b.contribution ?? 0).toFixed(2)})`
        )
        .join(" | ") || "";
    const base = {
      Rank: r._rank ?? "",
      "Compound Name": r.compound_name,
      Formula: r.molecular_formula,
      "Canonical SMILES": r.canonical_smiles || r.smiles,
      "Final Score": s?.score ?? "",
      "Drug-Likeness Assessment": dlLabelStr,
      "Overall ADMET Assessment": admetLabelStr,
      "Final Recommendation": asmt?.label ?? "",
      "Recommended for Downstream Analysis": recommended,
      Stars: asmt ? "★".repeat(asmt.stars) + "☆".repeat(5 - asmt.stars) : "",
      "Drug-Likeness Score": s?.categoryScores?.druglikeness ?? "",
      "ADME Score": s?.categoryScores?.adme ?? "",
      "Toxicity Score": s?.categoryScores?.toxicity ?? "",
      "Scoring Breakdown": breakdownStr,
    };
    // Add every ADME / Tox / DL parameter column (including derived LD50 mg/kg).
    for (const p of [...ADME_PARAMS, ...TOX_PARAMS]) {
      if (p.kind === "computed") {
        base[p.fullName || p.label] = p.computed?.(r);
      } else {
        base[p.fullName || p.label] = readPath(r, p.path);
      }
    }
    for (const p of DL_RULES) {
      const v = p.path ? readPath(r, p.path) : p.computed?.(r);
      base[p.label] = v == null ? "" : v ? "Pass" : "Fail";
    }
    for (const p of DL_NUMERIC) {
      base[p.label] = readPath(r, p.path);
    }
    base["Selection Status"] = finalSel[compoundKey(r)] ? "Selected" : "Not selected";
    return base;
  };

  const exportRows = () =>
    scoredRows
      .filter((r) => finalSel[compoundKey(r)])
      .sort((a, b) => (a._rank ?? 9e9) - (b._rank ?? 9e9))
      .map(flattenRow);

  const doExport = (fn, filename) => {
    const data = exportRows();
    if (data.length === 0) return toast.error("Select compounds to export");
    const metaLine =
      `Weights → DL ${weights.druglikeness}% · ADME ${weights.adme}% · TOX ${weights.toxicity}% (total ${weightTotal}%). ` +
      `Selected: ${totalSelected(selMap)} params.`;
    const metaRow = {};
    Object.keys(data[0]).forEach((k) => (metaRow[k] = ""));
    metaRow["Compound Name"] = metaLine;
    const finalData = [metaRow, ...data];
    const fields = Object.keys(data[0]).map((k) => ({ key: k, label: k }));
    fn(
      finalData.map((d) => {
        const obj = {};
        fields.forEach((f) => (obj[f.key] = d[f.label]));
        return obj;
      }),
      fields,
      filename
    );
  };

  if (inputCount === 0) {
    return (
      <WorkflowLayout>
        {standalone ? (
          <StandaloneSMILESInput
            title="ADMET & Drug-Likeness Analysis"
            subtitle="Paste SMILES, upload a CSV/Excel file, or start with a curated example — no workflow prerequisite."
          />
        ) : (
          <EmptySelection />
        )}
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <TooltipProvider delayDuration={150}>
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
                          ? Math.min(
                              100,
                              (progress.done / progress.total) * 100
                            )
                          : 5
                      }%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                data-testid="admet-done"
                className="flex items-center justify-between gap-3 text-sm text-[#0B0B18]"
              >
                <div className="flex items-center gap-3">
                  <Beaker className="h-5 w-5 text-emerald-500" />
                  <span className="font-heading text-sm font-semibold">
                    ADMET predictions ready · {rows.length} compound
                    {rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
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
                      doExport(
                        (data, fields, name) => exportCSV(data, fields, name),
                        "admet_scored.csv"
                      )
                    }
                    disabled={finalCount === 0}
                  />
                  <ExportBtn
                    label="Excel"
                    testid="admet-export-xlsx"
                    onClick={() =>
                      doExport(
                        (data, fields, name) => exportXLSX(data, fields, name),
                        "admet_scored.xlsx"
                      )
                    }
                    disabled={finalCount === 0}
                  />
                  <button
                    data-testid="reset-all-filters"
                    onClick={resetFilters}
                    className="rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#64748B] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                  >
                    Reset all filters
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scoring configuration */}
          <ScoringConfigPanel
            weights={weights}
            setWeights={setWeights}
            weightTotal={weightTotal}
            weightsValid={weightsValid}
            scoringEnabled={scoringEnabled}
            selectedCount={totalSelected(selMap)}
            onAutoAnalyse={runAutoAnalyse}
            autoActive={autoActive}
          />

          {/* Final Auto Analysis ranking table */}
          {autoActive && (
            <AutoAnalysisCard
              rows={scoredRows}
              finalSel={finalSel}
              toggleRow={toggleRow}
              setManyFinal={setManyFinal}
              filters={filters}
              weights={weights}
              scoringEnabled={scoringEnabled}
              onClear={() => setAutoActive(false)}
            />
          )}

          {/* SECTION 1 — ADME */}
          <FilterCard
            title="ADME Analysis Filters"
            testid="adme-filters"
            params={ADME_PARAMS}
            filters={filters}
            setFilters={setFilters}
            categoryOrder={["Absorption", "Distribution", "Metabolism", "Excretion"]}
          />
          <ResultsTable
            title="ADME Results"
            testid="adme-results"
            params={ADME_PARAMS}
            rows={scoredRows}
            filters={filters}
            finalSel={finalSel}
            toggleRow={toggleRow}
            setManyFinal={setManyFinal}
            expanded={expanded}
            setExpanded={setExpanded}
            scoringEnabled={scoringEnabled}
            status={status}
          />

          {/* SECTION 2 — Toxicity */}
          <FilterCard
            title="Toxicity Analysis Filters"
            testid="tox-filters"
            params={TOX_PARAMS}
            filters={filters}
            setFilters={setFilters}
            flatLayout={true}
          />
          <ResultsTable
            title="Toxicity Results"
            testid="tox-results"
            params={TOX_PARAMS}
            rows={scoredRows}
            filters={filters}
            finalSel={finalSel}
            toggleRow={toggleRow}
            setManyFinal={setManyFinal}
            expanded={expanded}
            setExpanded={setExpanded}
            scoringEnabled={scoringEnabled}
            status={status}
          />

          {/* SECTION 3 — Drug-Likeness */}
          <DrugLikenessFilterCard filters={filters} setFilters={setFilters} />
          <CriteriaCard />
          <ResultsTable
            title="Drug-Likeness Results"
            testid="dl-results"
            params={[...DL_RULES, ...DL_NUMERIC]}
            rows={scoredRows}
            filters={filters}
            finalSel={finalSel}
            toggleRow={toggleRow}
            setManyFinal={setManyFinal}
            expanded={expanded}
            setExpanded={setExpanded}
            scoringEnabled={scoringEnabled}
            status={status}
          />
        </main>

        {!standalone && rows.length > 0 && (
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
                    <span data-testid="admet-proceed-count">{finalCount}</span>{" "}
                    of {rows.length} compounds selected
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Only these move on to Target Prediction.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/phytonet-ai"
                  data-testid="modify-selection-link"
                  className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Modify selection
                </Link>
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
      </TooltipProvider>
    </WorkflowLayout>
  );
}

