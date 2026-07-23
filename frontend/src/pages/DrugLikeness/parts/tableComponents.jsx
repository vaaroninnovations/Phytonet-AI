import { useMemo } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { compoundKey } from "@/context/SelectionContext";
import { assess } from "@/lib/admetScoring";
import { activeColumnsFor, anyFilterActive, readPath } from "@/lib/admetParams";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { HelpTip } from "./HelpTip";

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


export { ResultsTable, RowRender, ParamCell, StarRow, formatObserved, ScoreBreakdown, Th, ProbCell, BoolCell };
