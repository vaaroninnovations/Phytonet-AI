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

// ───────────────────────────── Help Tooltip ──────────────────────────────
function HelpTip({ text, testid }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testid}
          className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[#B4B4CD] hover:text-[#5139ED]"
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

// ────────────────────────── Scoring Config Panel ─────────────────────────
function ScoringConfigPanel({
  weights,
  setWeights,
  weightTotal,
  weightsValid,
  scoringEnabled,
  selectedCount,
  onAutoAnalyse,
  autoActive,
}) {
  const setW = (k) => (e) => {
    const raw = e.target.value;
    const n = raw === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(raw))));
    setWeights((w) => ({ ...w, [k]: n }));
  };
  return (
    <div
      data-testid="admet-scoring-config"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
            Scoring configuration
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
            Weighted Final Score
          </h2>
          <p className="mt-1 max-w-xl text-xs text-[#64748B]">
            Weights are distributed equally across the parameters you activate
            in the filter cards below. Unavailable ADMET values are ignored and
            remaining weights are renormalized automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            data-testid="auto-analyse-btn"
            type="button"
            onClick={onAutoAnalyse}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all hover:-translate-y-0.5 ${
              autoActive
                ? "bg-[#0B0B18] text-white"
                : "bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]"
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {autoActive ? "Re-run Auto Analyse" : "Auto Analyse"}
          </button>
          <div
            data-testid="admet-weight-total"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset ${
              weightsValid
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            Total {weightTotal}%
            {weightsValid ? " · valid" : " · must equal 100%"}
          </div>
          <button
            data-testid="scoring-reset"
            type="button"
            onClick={() => setWeights(DEFAULT_WEIGHTS)}
            className="text-xs font-semibold text-[#64748B] underline decoration-dotted underline-offset-4 hover:text-[#5139ED]"
          >
            Reset defaults
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <WeightInput
          testid="weight-druglikeness"
          label="Drug-Likeness"
          hint="Lipinski · Veber · Ghose · Egan · Muegge · Pfizer · GSK · MW · LogP · TPSA · HBA · HBD · Rotatable"
          value={weights.druglikeness}
          onChange={setW("druglikeness")}
        />
        <WeightInput
          testid="weight-adme"
          label="ADME"
          hint="Absorption · Distribution · Metabolism · Excretion"
          value={weights.adme}
          onChange={setW("adme")}
        />
        <WeightInput
          testid="weight-toxicity"
          label="Toxicity"
          hint="AMES · hERG · DILI · Carcinogenicity · Skin · ClinTox · LD50"
          value={weights.toxicity}
          onChange={setW("toxicity")}
        />
      </div>
      <div
        data-testid="admet-scoring-status"
        className="mt-4 flex flex-wrap items-center gap-2 text-xs"
      >
        {scoringEnabled ? (
          <span className="rounded-full bg-[#5139ED]/8 px-3 py-1 font-semibold text-[#5139ED]">
            Scoring active · {selectedCount} parameter
            {selectedCount === 1 ? "" : "s"} selected
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
            {weightsValid
              ? "Scoring paused — activate at least one filter or rule below"
              : "Scoring disabled — weights must total 100%"}
          </span>
        )}
      </div>
    </div>
  );
}

function WeightInput({ label, hint, value, onChange, testid }) {
  return (
    <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-4">
      <div className="flex items-center justify-between">
        <span className="font-heading text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">
          {label}
        </span>
        <div className="inline-flex items-center gap-1 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1">
          <input
            data-testid={testid}
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={onChange}
            className="w-12 bg-transparent text-right text-sm font-bold tabular-nums text-[#0B0B18] outline-none"
          />
          <span className="text-xs text-[#64748B]">%</span>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-[#E7E7F3]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED]"
          style={{
            width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
          }}
        />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[#64748B]">{hint}</p>
    </div>
  );
}

// ─────────────────────────── Generic Filter Card ─────────────────────────
function FilterCard({ title, testid, params, filters, setFilters, categoryOrder, flatLayout }) {
  // Skip computed (derived) params from the filter controls.
  const controllable = params.filter((p) => p.kind !== "computed");
  if (flatLayout) {
    return (
      <div
        data-testid={testid}
        className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          {title}
        </p>
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
              Toxicity
            </span>
            <span className="h-px flex-1 bg-[#E7E7F3]" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {controllable.map((p) => (
              <FilterControl
                key={p.id}
                param={p}
                filters={filters}
                setFilters={setFilters}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }
  const groups = groupByCategory(controllable, categoryOrder);
  return (
    <div
      data-testid={testid}
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        {title}
      </p>
      <div className="mt-4 space-y-4">
        {groups.map(([cat, list]) => (
          <div key={cat} data-testid={`${testid}-row-${cat.toLowerCase()}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
                {cat}
              </span>
              <span className="h-px flex-1 bg-[#E7E7F3]" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {list.map((p) => (
                <FilterControl
                  key={p.id}
                  param={p}
                  filters={filters}
                  setFilters={setFilters}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupByCategory(params, order) {
  const map = new Map();
  for (const p of params) {
    const cat = p.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(p);
  }
  const known = (order || []).filter((c) => map.has(c));
  const rest = [...map.keys()].filter((c) => !known.includes(c));
  return [...known, ...rest].map((c) => [c, map.get(c)]);
}

function FilterControl({ param, filters, setFilters }) {
  const setF = (patch) => setFilters((s) => ({ ...s, ...patch }));
  if (param.kind === "computed") return null; // derived — no filter control
  const label = (
    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
      {param.label}
      <HelpTip
        text={`${param.fullName || param.label}: ${param.tooltip}`}
        testid={`help-${param.id}`}
      />
    </span>
  );

  const testid = `filter-${param.id}`;

  if (param.kind === "range") {
    const [minK, maxK] = param.filterKey;
    return (
      <div className="flex flex-col gap-1">
        {label}
        <div className="flex items-center gap-1">
          <input
            data-testid={`${testid}-min`}
            type="number"
            placeholder="min"
            value={filters[minK]}
            onChange={(e) => setF({ [minK]: e.target.value })}
            className="brand-focus w-full min-w-0 rounded-lg border border-[#E7E7F3] bg-white px-2.5 py-2 text-sm text-[#0B0B18]"
          />
          <input
            data-testid={`${testid}-max`}
            type="number"
            placeholder="max"
            value={filters[maxK]}
            onChange={(e) => setF({ [maxK]: e.target.value })}
            className="brand-focus w-full min-w-0 rounded-lg border border-[#E7E7F3] bg-white px-2.5 py-2 text-sm text-[#0B0B18]"
          />
        </div>
      </div>
    );
  }
  if (param.kind === "rule") {
    const on = !!filters[param.filterKey];
    return (
      <label
        data-testid={testid}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
          on
            ? "border-[#5139ED]/40 bg-[#5139ED]/8 text-[#5139ED]"
            : "border-[#E7E7F3] bg-white text-[#64748B] hover:border-[#5139ED]/30"
        }`}
      >
        <Checkbox
          checked={on}
          onCheckedChange={(v) => setF({ [param.filterKey]: !!v })}
          className="h-3.5 w-3.5 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
        />
        <span className="flex items-center gap-1">
          {param.label}
          <HelpTip text={param.tooltip} testid={`help-${param.id}`} />
        </span>
      </label>
    );
  }

  const options = (() => {
    if (param.kind === "select_hl") return [["any", "Any"], ["high", "High"], ["low", "Low"]];
    if (param.kind === "select_yn") return [["any", "Any"], ["yes", "Yes"], ["no", "No"]];
    if (param.kind === "select_toxyn")
      return [["any", "Any"], ["negative", "Negative"], ["positive", "Positive"]];
    if (param.kind === "select_inh")
      return [["any", "Any"], ["inhibitor", "Inhibitor"], ["non-inhibitor", "Non-inhibitor"]];
    if (param.kind === "select_sub")
      return [["any", "Any"], ["substrate", "Substrate"], ["non-substrate", "Non-substrate"]];
    if (param.kind === "select_cyp5")
      return [
        ["any", "Any"],
        ["inhibitor", "Inhibitor"],
        ["non-inhibitor", "Non-inhibitor"],
        ["substrate", "Substrate"],
        ["non-substrate", "Non-substrate"],
      ];
    return [["any", "Any"]];
  })();

  const key = param.filterKey;
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select
        data-testid={testid}
        value={filters[key]}
        onChange={(e) => setF({ [key]: e.target.value })}
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

// ───────────────── Drug-Likeness dedicated filter card ───────────────────
function DrugLikenessFilterCard({ filters, setFilters }) {
  return (
    <div
      data-testid="dl-filters"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Drug-Likeness Assessment Filters
      </p>

      {/* Rules row */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
            Rules
          </span>
          <span className="h-px flex-1 bg-[#E7E7F3]" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {DL_RULES.map((p) => (
            <FilterControl
              key={p.id}
              param={p}
              filters={filters}
              setFilters={setFilters}
            />
          ))}
        </div>
      </div>

      {/* Numeric row */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
            Numeric properties
          </span>
          <span className="h-px flex-1 bg-[#E7E7F3]" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DL_NUMERIC.filter((p) => p.kind !== "shared_bioavailability").map((p) => (
            <FilterControl
              key={p.id}
              param={p}
              filters={filters}
              setFilters={setFilters}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────── Criteria (informational) card ──────────────────────
function CriteriaCard() {
  return (
    <div
      data-testid="dl-criteria-card"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Common Drug-Likeness Criteria
      </p>
      <p className="mt-1 text-xs text-[#64748B]">
        Reference thresholds used by ADMET-AI and this scoring engine.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-[#F1F1FA]">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-[#FAFAFF] text-[#64748B]">
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest">
                Rule
              </th>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest">
                Accepted Range / Conditions
              </th>
            </tr>
          </thead>
          <tbody>
            {DL_CRITERIA_TABLE.map((r) => (
              <tr key={r.name} className="border-t border-[#F1F1FA]">
                <td className="px-3 py-2 font-heading font-semibold text-[#0B0B18]">
                  {r.name}
                </td>
                <td className="px-3 py-2 font-mono text-[#1E1E33]">
                  {r.conditions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────── Generic Results Table ────────────────────────
function ResultsTable({
  title,
  testid,
  params,
  rows,
  filters,
  finalSel,
  toggleRow,
  setManyFinal,
  expanded,
  setExpanded,
  scoringEnabled,
  status,
}) {
  const activeCols = activeColumnsFor(params, filters);
  const hasActive = anyFilterActive(params, filters);

  // Build column accessors for sortable headers.
  const accessors = useMemo(() => {
    const map = {
      "_rank": (r) => r._rank,
      "_score": (r) => r._score?.score,
      "_stars": (r) => (r._score?.score != null ? r._score.score : null),
      "compound_name": (r) => r.compound_name,
    };
    for (const p of activeCols) {
      map[p.id] =
        p.kind === "computed"
          ? (r) => p.computed?.(r)
          : (r) => readPath(r, p.path);
    }
    return map;
  }, [activeCols]);

  const { sortedRows, sortKey, sortDir, onSort } = useSortable(rows, accessors);

  const allInViewSelected =
    sortedRows.length > 0 && sortedRows.every((r) => finalSel[compoundKey(r)]);
  const someInViewSelected =
    sortedRows.some((r) => finalSel[compoundKey(r)]) && !allInViewSelected;

  const filteredCount = sortedRows.length;
  const selectedInView = sortedRows.filter((r) => finalSel[compoundKey(r)]).length;

  return (
    <div className="mt-6">
      <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-end">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span
              data-testid={`${testid}-row-count`}
              className="font-display text-xl font-bold text-[#0B0B18]"
            >
              {filteredCount}
            </span>
            <span className="text-xs text-[#64748B]">
              {hasActive
                ? `${activeCols.length} column${activeCols.length === 1 ? "" : "s"} · filtered`
                : `${activeCols.length} columns · all shown`}
              {" · "}
              {selectedInView} selected
            </span>
          </div>
        </div>
      </div>
      <div
        data-testid={testid}
        className="mt-3 overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
      >
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                <Th sticky>
                  <Checkbox
                    data-testid={`${testid}-select-all`}
                    checked={
                      allInViewSelected
                        ? true
                        : someInViewSelected
                        ? "indeterminate"
                        : false
                    }
                    onCheckedChange={() =>
                      setManyFinal(sortedRows, !allInViewSelected)
                    }
                    disabled={sortedRows.length === 0}
                    className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=indeterminate]:bg-[#5139ED] data-[state=checked]:text-white data-[state=indeterminate]:text-white"
                  />
                </Th>
                <SortableTh id="_rank" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>#</SortableTh>
                <SortableTh id="_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Final Score</SortableTh>
                <SortableTh id="_stars" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Assessment</SortableTh>
                <SortableTh id="compound_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Compound</SortableTh>
                {activeCols.map((p) => (
                  <SortableTh
                    key={p.id}
                    id={p.id}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={onSort}
                    sticky
                  >
                    <span className="inline-flex items-center gap-1">
                      {p.label}
                      <HelpTip
                        text={`${p.fullName || p.label}: ${p.tooltip}`}
                        testid={`help-col-${p.id}`}
                      />
                    </span>
                  </SortableTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {status !== "done" ? (
                <tr>
                  <td
                    colSpan={activeCols.length + 5}
                    className="px-4 py-14 text-center text-sm text-[#64748B]"
                  >
                    Running ADMET prediction…
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeCols.length + 5}
                    className="px-4 py-14 text-center text-sm text-[#64748B]"
                  >
                    No compounds match the current filters.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => (
                  <RowRender
                    key={compoundKey(r)}
                    row={r}
                    params={activeCols}
                    tableTestid={testid}
                    selected={!!finalSel[compoundKey(r)]}
                    onToggle={() => toggleRow(r)}
                    expanded={!!expanded[compoundKey(r)]}
                    onExpand={() =>
                      setExpanded((s) => ({
                        ...s,
                        [compoundKey(r)]: !s[compoundKey(r)],
                      }))
                    }
                    scoringEnabled={scoringEnabled}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RowRender({
  row,
  params,
  tableTestid,
  selected,
  onToggle,
  expanded,
  onExpand,
  scoringEnabled,
}) {
  const s = row._score;
  const rank = row._rank;
  const scoreVal = s?.score;
  const asmt = assess(scoreVal ?? -1);
  const key = compoundKey(row);
  return (
    <>
      <tr
        data-testid={`${tableTestid}-row-${key}`}
        className={`border-b border-[#F1F1FA] ${
          selected ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
        }`}
      >
        <td className="px-3 py-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-testid={`${tableTestid}-row-expand-${key}`}
              onClick={onExpand}
              disabled={!scoringEnabled}
              className="rounded p-0.5 text-[#64748B] hover:bg-[#5139ED]/10 hover:text-[#5139ED] disabled:opacity-30"
              aria-label="Toggle score breakdown"
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            <Checkbox
              data-testid={`${tableTestid}-row-check-${key}`}
              checked={selected}
              onCheckedChange={onToggle}
              className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
            />
          </div>
        </td>
        <td className="px-3 py-3 text-center font-mono text-[11px] font-semibold text-[#64748B]">
          {rank ? `#${rank}` : "—"}
        </td>
        <td className="px-3 py-3">
          {scoringEnabled && typeof scoreVal === "number" ? (
            <div className="flex items-center gap-2">
              <span
                data-testid={`admet-score-${key}`}
                className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                  scoreVal >= 70
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : scoreVal >= 40
                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-rose-50 text-rose-700 ring-rose-200"
                }`}
              >
                {scoreVal.toFixed(1)}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[#B4B4CD]">—</span>
          )}
        </td>
        <td className="px-3 py-3">
          {scoringEnabled && typeof scoreVal === "number" ? (
            <div
              data-testid={`admet-stars-${key}`}
              className="flex flex-col"
            >
              <StarRow n={asmt.stars} />
              <span className="mt-0.5 text-[9px] uppercase tracking-widest text-[#64748B]">
                {asmt.label}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-[#B4B4CD]">—</span>
          )}
        </td>
        <td className="max-w-[220px] px-3 py-3 text-[13px]">
          <div className="font-heading font-semibold text-[#0B0B18]">
            {row.compound_name || "—"}
          </div>
          <div className="mt-0.5 text-[10px] text-[#64748B]">
            {row.molecular_formula || ""} · {row.source || ""}
          </div>
        </td>
        {params.map((p) => (
          <ParamCell key={p.id} param={p} row={row} />
        ))}
      </tr>
      {expanded && scoringEnabled && s && (
        <tr
          data-testid={`admet-breakdown-${key}`}
          className="border-b border-[#F1F1FA] bg-[#FAFAFF]"
        >
          <td colSpan={params.length + 5} className="px-6 py-4">
            <ScoreBreakdown score={s} />
          </td>
        </tr>
      )}
    </>
  );
}

function ParamCell({ param, row }) {
  // Rule with client-side computed value
  if (param.kind === "rule") {
    const v = param.path ? readPath(row, param.path) : param.computed?.(row);
    return <BoolCell v={v} />;
  }
  // Computed / derived value (e.g. LD50 mg/kg)
  if (param.kind === "computed") {
    const v = param.computed?.(row);
    return (
      <td className="px-3 py-3 font-mono text-[11px] text-[#1E1E33]">
        {typeof v === "number" ? v.toFixed(0) : "—"}
      </td>
    );
  }
  const v = readPath(row, param.path);
  if (param.dataType === "prob") return <ProbCell v={v} reverse={param.section === "tox"} />;
  if (param.dataType === "bool") return <BoolCell v={v} />;
  // numeric
  return (
    <td className="px-3 py-3 font-mono text-[11px] text-[#1E1E33]">
      {typeof v === "number" ? v.toFixed(2) : "—"}
    </td>
  );
}

// ─────────────────────────── Score Breakdown ─────────────────────────────
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

function formatObserved(v) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Pass" : "Fail";
  if (typeof v === "number") return v.toFixed(3).replace(/\.?0+$/, "");
  return String(v);
}

function ScoreBreakdown({ score }) {
  const catLabel = {
    druglikeness: "Drug-Likeness",
    adme: "ADME",
    toxicity: "Toxicity",
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
        <span className="font-heading font-bold uppercase tracking-widest text-[#5139ED]">
          Score breakdown
        </span>
        {Object.entries(score.categoryScores).map(([k, v]) => (
          <span
            key={k}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-[#E7E7F3]"
          >
            <b className="text-[#0B0B18]">{catLabel[k]}</b>
            {v == null
              ? "—"
              : `${v.toFixed(1)} · weight ${score.activeCategoryWeights[k].toFixed(0)}%`}
          </span>
        ))}
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-[#E7E7F3] text-[#64748B]">
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest">
              Category
            </th>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest">
              Parameter
            </th>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest">
              Observed
            </th>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest">
              Threshold
            </th>
            <th className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest">
              Pass / Fail
            </th>
            <th className="px-2 py-1.5 text-right font-semibold uppercase tracking-widest">
              Contribution
            </th>
          </tr>
        </thead>
        <tbody>
          {score.breakdown.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2 py-3 text-center text-[#B4B4CD]">
                No parameters selected — set filters or rules to build a score.
              </td>
            </tr>
          ) : (
            score.breakdown.map((b, i) => (
              <tr key={`${b.category}-${b.parameter}-${i}`} className="border-b border-[#F1F1FA]">
                <td className="px-2 py-1.5 text-[#64748B]">{catLabel[b.category]}</td>
                <td className="px-2 py-1.5 font-semibold text-[#0B0B18]">
                  {b.parameter}
                </td>
                <td className="px-2 py-1.5 font-mono text-[#1E1E33]">
                  {formatObserved(b.value)}
                </td>
                <td className="px-2 py-1.5 text-[#64748B]">{b.threshold || "—"}</td>
                <td className="px-2 py-1.5">
                  {b.pass == null ? (
                    <span className="text-[#B4B4CD]">n/a</span>
                  ) : b.pass ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                      PASS
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200">
                      FAIL
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[#0B0B18]">
                  {b.pass == null ? "—" : `+${b.contribution.toFixed(2)}`}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── Cell primitives ───────────────────────────
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

// ─────────────────── Auto Analysis (final ranked) card ─────────────────
function AutoAnalysisCard({
  rows,
  finalSel,
  toggleRow,
  setManyFinal,
  scoringEnabled,
  onClear,
}) {
  const ranked = [...rows].sort(
    (a, b) => (a._rank ?? 9e9) - (b._rank ?? 9e9)
  );

  const buildFlat = (r) => {
    const s = r._score;
    const score = s?.score;
    const dlScore = s?.categoryScores?.druglikeness;
    const admetMean =
      s && s.categoryScores?.adme != null && s.categoryScores?.toxicity != null
        ? (s.categoryScores.adme + s.categoryScores.toxicity) / 2
        : s?.categoryScores?.adme ?? s?.categoryScores?.toxicity;
    const dlLabel =
      dlScore != null ? labelFor(dlScore, "drug") : score != null ? labelFor(score, "drug") : "—";
    const admetLabel =
      admetMean != null
        ? labelFor(admetMean, "admet")
        : score != null
        ? labelFor(score, "admet")
        : "—";
    const stars = score != null ? assess(score).stars : 0;
    const recommended = score != null && score >= 55;
    return { score, dlLabel, admetLabel, stars, recommended };
  };

  const allSelected = ranked.length > 0 && ranked.every((r) => finalSel[compoundKey(r)]);

  return (
    <div
      data-testid="auto-analysis-card"
      className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            <Wand2 className="mr-1 inline h-3.5 w-3.5" />
            Auto analysis · Final ranked candidates
          </p>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
            Publication-grade ADMET triage
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-[#64748B]">
            Ranked using published medicinal-chemistry criteria: Lipinski, Veber,
            Ghose, Egan, Muegge, Pfizer 3/75, GSK 4/400; high HIA + PAMPA + oral
            bioavailability; non-inhibitor of CYP1A2/2C9/2C19/2D6/3A4; non-AMES /
            hERG / DILI / carcinogenic / clinical-tox; LD50 ≥ 100 mg/kg-equivalent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            data-testid="auto-select-all"
            type="button"
            onClick={() =>
              setManyFinal(
                ranked.filter((r) => (r._score?.score ?? -1) >= 55),
                true
              )
            }
            className="rounded-full border border-[#5139ED]/40 bg-[#5139ED]/8 px-3 py-1.5 text-xs font-semibold text-[#5139ED] hover:bg-[#5139ED]/12"
          >
            Select all recommended
          </button>
          <button
            data-testid="auto-analysis-close"
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-[#64748B] underline decoration-dotted underline-offset-4 hover:text-[#5139ED]"
          >
            Hide auto-analysis
          </button>
        </div>
      </div>

      {!scoringEnabled ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">
          Weights invalid — fix the total to 100% to re-enable Final Score.
        </p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#F1F1FA]">
          <div className="max-h-[520px] overflow-auto">
            <table
              data-testid="auto-analysis-table"
              className="w-full min-w-[960px] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <Th sticky>
                    <Checkbox
                      data-testid="auto-check-all"
                      checked={allSelected ? true : false}
                      onCheckedChange={() => setManyFinal(ranked, !allSelected)}
                      disabled={ranked.length === 0}
                      className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                    />
                  </Th>
                  <Th sticky>Rank</Th>
                  <Th sticky>Compound Name</Th>
                  <Th sticky>Final Score</Th>
                  <Th sticky>Drug-Likeness Assessment</Th>
                  <Th sticky>Overall ADMET Assessment</Th>
                  <Th sticky>Final Recommendation</Th>
                </tr>
              </thead>
              <tbody>
                {ranked.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#64748B]">
                      No compounds available.
                    </td>
                  </tr>
                ) : (
                  ranked.map((r) => {
                    const k = compoundKey(r);
                    const f = buildFlat(r);
                    const selected = !!finalSel[k];
                    return (
                      <tr
                        key={k}
                        data-testid={`auto-row-${k}`}
                        className={`border-b border-[#F1F1FA] ${
                          selected ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
                        }`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            data-testid={`auto-row-check-${k}`}
                            checked={selected}
                            onCheckedChange={() => toggleRow(r)}
                            className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                          />
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-[12px] font-bold text-[#5139ED]">
                          #{r._rank ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-[13px] font-heading font-semibold text-[#0B0B18]">
                          {r.compound_name || "—"}
                          <div className="mt-0.5 text-[10px] font-normal text-[#64748B]">
                            {r.molecular_formula || ""}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {typeof f.score === "number" ? (
                            <span
                              data-testid={`auto-score-${k}`}
                              className={`inline-flex min-w-[42px] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                                f.score >= 70
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : f.score >= 40
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : "bg-rose-50 text-rose-700 ring-rose-200"
                              }`}
                            >
                              {f.score.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-[#B4B4CD]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[#0B0B18]">{f.dlLabel}</td>
                        <td className="px-3 py-3 text-[12px] text-[#0B0B18]">{f.admetLabel}</td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-0.5">
                            <StarRow n={f.stars} />
                            <span
                              data-testid={`auto-reco-${k}`}
                              className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${
                                f.recommended
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                              }`}
                            >
                              {f.recommended
                                ? "✓ Recommended"
                                : "Not recommended"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
        Select compounds in the Plant Database first — they will be automatically
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
