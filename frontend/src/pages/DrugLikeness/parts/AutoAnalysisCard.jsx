import { Wand2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { compoundKey } from "@/context/SelectionContext";
import { labelFor } from "@/lib/admetParams";
import { assess } from "@/lib/admetScoring";
import { Th, StarRow } from "./tableComponents";

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


export { AutoAnalysisCard };
