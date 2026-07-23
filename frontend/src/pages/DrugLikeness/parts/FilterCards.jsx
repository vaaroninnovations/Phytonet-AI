import { Checkbox } from "@/components/ui/checkbox";
import { DL_RULES, DL_NUMERIC, DL_CRITERIA_TABLE } from "@/lib/admetParams";
import { HelpTip } from "./HelpTip";

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

export { FilterCard, groupByCategory, FilterControl, DrugLikenessFilterCard, CriteriaCard };
