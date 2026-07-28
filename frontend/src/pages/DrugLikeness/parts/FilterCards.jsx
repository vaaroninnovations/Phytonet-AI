import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DL_RULES, DL_NUMERIC, DL_CRITERIA_TABLE } from "@/lib/admetParams";
import { HelpTip } from "./HelpTip";

/**
 * Hue registry — each section gets a distinct visual identity while staying
 * within the "premium scientific" palette. `sub` is used for group headers
 * inside the card (Absorption, Distribution, etc.).
 */
const HUES = {
  adme: {
    border: "border-[#DBEAFE]",
    bg: "bg-gradient-to-br from-white via-[#F7FBFF] to-[#EEF6FF]",
    title: "text-[#1D4ED8]",
    sub: "text-[#2563EB]",
    divider: "bg-[#DBEAFE]",
    subGroups: {
      Absorption: "text-[#0EA5E9] bg-[#F0F9FF]",
      Distribution: "text-[#0891B2] bg-[#ECFEFF]",
      Metabolism: "text-[#7C3AED] bg-[#F5F3FF]",
      Excretion: "text-[#2563EB] bg-[#EFF6FF]",
    },
  },
  toxicity: {
    border: "border-[#FEE2E2]",
    bg: "bg-gradient-to-br from-white via-[#FFF7F7] to-[#FEECEC]",
    title: "text-[#B91C1C]",
    sub: "text-[#DC2626]",
    divider: "bg-[#FECACA]",
    subGroups: { Toxicity: "text-[#DC2626] bg-[#FEF2F2]" },
  },
  druglikeness: {
    border: "border-[#D1FAE5]",
    bg: "bg-gradient-to-br from-white via-[#F5FFFB] to-[#E7FBF2]",
    title: "text-[#047857]",
    sub: "text-[#059669]",
    divider: "bg-[#A7F3D0]",
    subGroups: {
      Rules: "text-[#059669] bg-[#ECFDF5]",
      "Numeric properties": "text-[#0D9488] bg-[#F0FDFA]",
    },
  },
  criteria: {
    border: "border-[#E7E7F3]",
    bg: "bg-gradient-to-br from-white via-[#FAFAFF] to-[#F4F4FB]",
    title: "text-[#5139ED]",
    sub: "text-[#8139ED]",
    divider: "bg-[#E7E7F3]",
    subGroups: {},
  },
};

function useHue(hueKey) {
  return HUES[hueKey] || HUES.criteria;
}

/**
 * CardShell — wraps every collapsible card with header (title + chevron
 * toggle) and animated body reveal.
 */
function CardShell({ title, testid, hueKey, defaultOpen = true, children, subtitle }) {
  const hue = useHue(hueKey);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-testid={testid}
      className={`mt-6 rounded-3xl border ${hue.border} ${hue.bg} p-5 md:p-6 transition-colors`}
    >
      <button
        type="button"
        data-testid={`${testid}-toggle`}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className={`font-heading text-xs font-bold uppercase tracking-[0.24em] ${hue.title}`}>
            {title}
          </p>
          {subtitle && <p className="mt-1 text-xs text-[#64748B]">{subtitle}</p>}
        </div>
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${hue.border} bg-white/70 text-[#64748B] transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden
        >
          <ChevronDown size={16} />
        </span>
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

/**
 * SubGroupHeader — colored pill + horizontal rule for named categories
 * inside a card (e.g. Absorption within ADME).
 */
function SubGroupHeader({ label, hueKey }) {
  const hue = useHue(hueKey);
  const chipClass = hue.subGroups[label] || `${hue.sub}`;
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${chipClass}`}
      >
        {label}
      </span>
      <span className={`h-px flex-1 ${hue.divider}`} />
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

/**
 * Shared collapsible + hued FilterCard used for ADME (grouped) and Toxicity
 * (flat) sections.
 */
function FilterCard({ title, testid, params, filters, setFilters, categoryOrder, flatLayout, hueKey = "adme" }) {
  const controllable = params.filter((p) => p.kind !== "computed");
  const inner = flatLayout ? (
    <div>
      <SubGroupHeader label="Toxicity" hueKey={hueKey} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {controllable.map((p) => (
          <FilterControl key={p.id} param={p} filters={filters} setFilters={setFilters} />
        ))}
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      {groupByCategory(controllable, categoryOrder).map(([cat, list]) => (
        <div key={cat} data-testid={`${testid}-row-${cat.toLowerCase()}`}>
          <SubGroupHeader label={cat} hueKey={hueKey} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {list.map((p) => (
              <FilterControl key={p.id} param={p} filters={filters} setFilters={setFilters} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <CardShell title={title} testid={testid} hueKey={hueKey}>
      {inner}
    </CardShell>
  );
}

function FilterControl({ param, filters, setFilters }) {
  const setF = (patch) => setFilters((s) => ({ ...s, ...patch }));
  if (param.kind === "computed") return null;
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
  const hueKey = "druglikeness";
  return (
    <CardShell title="Drug-Likeness Assessment Filters" testid="dl-filters" hueKey={hueKey}>
      <div>
        <SubGroupHeader label="Rules" hueKey={hueKey} />
        <div className="flex flex-wrap items-center gap-2">
          {DL_RULES.map((p) => (
            <FilterControl key={p.id} param={p} filters={filters} setFilters={setFilters} />
          ))}
        </div>
      </div>
      <div className="mt-4">
        <SubGroupHeader label="Numeric properties" hueKey={hueKey} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {DL_NUMERIC.filter((p) => p.kind !== "shared_bioavailability").map((p) => (
            <FilterControl key={p.id} param={p} filters={filters} setFilters={setFilters} />
          ))}
        </div>
      </div>
    </CardShell>
  );
}

// ─────────────────── Criteria (informational) card ──────────────────────

function CriteriaCard() {
  return (
    <CardShell
      title="Common Drug-Likeness Criteria"
      testid="dl-criteria-card"
      hueKey="criteria"
      defaultOpen={false}
      subtitle="Reference thresholds used by ADMET-AI and this scoring engine."
    >
      <div className="overflow-hidden rounded-xl border border-[#F1F1FA]">
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
    </CardShell>
  );
}

export { FilterCard, groupByCategory, FilterControl, DrugLikenessFilterCard, CriteriaCard };
