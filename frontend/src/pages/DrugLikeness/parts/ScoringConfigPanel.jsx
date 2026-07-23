import { Sparkles, Wand2 } from "lucide-react";
import { DEFAULT_WEIGHTS } from "@/lib/admetScoring";

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

export { ScoringConfigPanel };
