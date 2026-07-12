// ADMET & Drug-Likeness scoring engine.
// Category weights are user-configurable; within each category, weight is
// distributed EQUALLY across the parameters the user actually selected
// (i.e., non-"any" filters, checked rules, or filled ranges). Any parameter
// whose observed value is unavailable is ignored (not counted as fail) and
// the remaining parameters are renormalized so the category score is on
// 0–100. The three category scores are then combined by the user weights;
// if some categories have no selected params, remaining category weights
// are renormalized so we don't dilute the final score.

export const DEFAULT_WEIGHTS = { druglikeness: 35, adme: 35, toxicity: 30 };

export const STAR_TIERS = [
  { min: 95, stars: 5, label: "Excellent Drug Candidate" },
  { min: 85, stars: 5, label: "Strong Drug-Like Candidate" },
  { min: 70, stars: 4, label: "Good Drug Candidate" },
  { min: 55, stars: 3, label: "Moderately Drug-Like" },
  { min: 40, stars: 2, label: "Weak Drug Candidate" },
  { min: 0, stars: 1, label: "Poor Candidate" },
];

export function assess(score) {
  if (!Number.isFinite(score)) return { stars: 0, label: "—" };
  for (const t of STAR_TIERS) if (score >= t.min) return t;
  return STAR_TIERS[STAR_TIERS.length - 1];
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const prob = (v, cutoff = 0.5) => {
  const n = num(v);
  return n == null ? null : n >= cutoff;
};

// Build a threshold description string for a range filter.
const rangeStr = (min, max, unit = "") => {
  const lo = min !== "" && min != null ? Number(min) : null;
  const hi = max !== "" && max != null ? Number(max) : null;
  if (lo != null && hi != null) return `${lo} – ${hi} ${unit}`.trim();
  if (lo != null) return `≥ ${lo} ${unit}`.trim();
  if (hi != null) return `≤ ${hi} ${unit}`.trim();
  return "";
};

const inRange = (v, min, max) => {
  const n = num(v);
  if (n == null) return null;
  if (min !== "" && min != null && n < Number(min)) return false;
  if (max !== "" && max != null && n > Number(max)) return false;
  return true;
};

// Build the list of "selected parameters" per category from the current
// filter state. Each entry describes how to evaluate pass/fail on a row.
export function selectedParameters(filters) {
  const dl = [];
  const adme = [];
  const tox = [];

  // ---- Drug-Likeness ----
  const rules = [
    ["lipinski", "Lipinski", "Pass"],
    ["veber", "Veber", "Pass"],
    ["ghose", "Ghose", "Pass"],
    ["egan", "Egan", "Pass"],
    ["muegge", "Muegge", "Pass"],
  ];
  for (const [k, label, thr] of rules) {
    if (filters[k]) {
      dl.push({
        id: k,
        label,
        threshold: thr,
        getValue: (r) => r.druglikeness?.[`${k}_pass`],
        evaluate: (r) => {
          const v = r.druglikeness?.[`${k}_pass`];
          return v == null ? null : v === true;
        },
      });
    }
  }
  if (filters.bioavailability !== "any") {
    const want = filters.bioavailability; // 'high' | 'low'
    dl.push({
      id: "bioavailability_score",
      label: "Bioavailability score",
      threshold: want === "high" ? "≥ 0.55" : "< 0.55",
      getValue: (r) => r.admet?.bioavailability,
      evaluate: (r) => {
        const n = num(r.admet?.bioavailability);
        if (n == null) return null;
        return want === "high" ? n >= 0.55 : n < 0.55;
      },
    });
  }
  if (filters.logpMin !== "" || filters.logpMax !== "") {
    dl.push({
      id: "logp",
      label: "LogP",
      threshold: rangeStr(filters.logpMin, filters.logpMax),
      getValue: (r) => r.physchem?.logp,
      evaluate: (r) => inRange(r.physchem?.logp, filters.logpMin, filters.logpMax),
    });
  }
  if (filters.mwMin !== "" || filters.mwMax !== "") {
    dl.push({
      id: "mw",
      label: "Molecular weight",
      threshold: rangeStr(filters.mwMin, filters.mwMax, "Da"),
      getValue: (r) => r.physchem?.mw,
      evaluate: (r) => inRange(r.physchem?.mw, filters.mwMin, filters.mwMax),
    });
  }
  if (filters.tpsaMin !== "" || filters.tpsaMax !== "") {
    dl.push({
      id: "tpsa",
      label: "TPSA",
      threshold: rangeStr(filters.tpsaMin, filters.tpsaMax, "Å²"),
      getValue: (r) => r.physchem?.tpsa,
      evaluate: (r) => inRange(r.physchem?.tpsa, filters.tpsaMin, filters.tpsaMax),
    });
  }

  // ---- ADME (Absorption + Distribution + Metabolism + Excretion) ----
  if (filters.hia !== "any") {
    const want = filters.hia; // 'high' | 'low'
    adme.push({
      id: "hia",
      label: "HIA (Absorption)",
      threshold: want === "high" ? "≥ 0.5" : "< 0.5",
      getValue: (r) => r.admet?.hia,
      evaluate: (r) => {
        const p = prob(r.admet?.hia);
        return p == null ? null : want === "high" ? p : !p;
      },
    });
  }
  if (filters.pgp !== "any") {
    const want = filters.pgp; // 'substrate' | 'non-substrate'
    adme.push({
      id: "pgp",
      label: "P-gp inhibitor",
      threshold: want === "substrate" ? "≥ 0.5" : "< 0.5",
      getValue: (r) => r.admet?.pgp_inhibitor,
      evaluate: (r) => {
        const p = prob(r.admet?.pgp_inhibitor);
        return p == null ? null : want === "substrate" ? p : !p;
      },
    });
  }
  if (filters.bbb !== "any") {
    const want = filters.bbb; // 'yes' | 'no'
    adme.push({
      id: "bbb",
      label: "BBB permeability",
      threshold: want === "yes" ? "≥ 0.5" : "< 0.5",
      getValue: (r) => r.admet?.bbb,
      evaluate: (r) => {
        const p = prob(r.admet?.bbb);
        return p == null ? null : want === "yes" ? p : !p;
      },
    });
  }
  const cyps = [
    ["cyp1a2", "CYP1A2 inhibitor", "cyp1a2_inhibitor"],
    ["cyp2c9", "CYP2C9 inhibitor", "cyp2c9_inhibitor"],
    ["cyp2c19", "CYP2C19 inhibitor", "cyp2c19_inhibitor"],
    ["cyp2d6", "CYP2D6 inhibitor", "cyp2d6_inhibitor"],
    ["cyp3a4", "CYP3A4 inhibitor", "cyp3a4_inhibitor"],
  ];
  for (const [k, label, field] of cyps) {
    if (filters[k] !== "any") {
      const want = filters[k]; // 'yes' | 'no'
      adme.push({
        id: k,
        label,
        threshold: want === "yes" ? "≥ 0.5" : "< 0.5",
        getValue: (r) => r.admet?.[field],
        evaluate: (r) => {
          const p = prob(r.admet?.[field]);
          return p == null ? null : want === "yes" ? p : !p;
        },
      });
    }
  }
  // Excretion ranges
  if (filters.halfLifeMin !== "" || filters.halfLifeMax !== "") {
    adme.push({
      id: "half_life",
      label: "Half-life",
      threshold: rangeStr(filters.halfLifeMin, filters.halfLifeMax, "h"),
      getValue: (r) => r.admet?.half_life,
      evaluate: (r) => inRange(r.admet?.half_life, filters.halfLifeMin, filters.halfLifeMax),
    });
  }
  if (filters.clearanceMin !== "" || filters.clearanceMax !== "") {
    adme.push({
      id: "clearance_hepatocyte",
      label: "Clearance (hepatocyte)",
      threshold: rangeStr(filters.clearanceMin, filters.clearanceMax),
      getValue: (r) => r.admet?.clearance_hepatocyte,
      evaluate: (r) =>
        inRange(r.admet?.clearance_hepatocyte, filters.clearanceMin, filters.clearanceMax),
    });
  }

  // ---- Toxicity ---- (all endpoints treated as "prefer safer" when selected)
  const toxEndpoints = [
    ["ames", "Non-AMES", "ames"],
    ["herg", "Non-hERG", "herg"],
    ["dili", "Non-DILI", "dili"],
    ["carcinogenicity", "Non-Carcinogenic", "carcinogenicity"],
    ["skin", "Non-Skin Sensitizer", "skin_sensitization"],
    ["clintox", "Non-ClinTox", "clintox"],
  ];
  for (const [fkey, label, field] of toxEndpoints) {
    const v = filters[fkey];
    if (v && v !== "any") {
      const want = v; // 'yes' | 'no'
      tox.push({
        id: fkey,
        label,
        threshold: want === "no" ? "< 0.5 (non-toxic)" : "≥ 0.5",
        getValue: (r) => r.admet?.[field],
        evaluate: (r) => {
          const p = prob(r.admet?.[field]);
          return p == null ? null : want === "yes" ? p : !p;
        },
      });
    }
  }

  return { druglikeness: dl, adme, toxicity: tox };
}

// Total selected parameter count across all categories.
export function totalSelected(selMap) {
  return (
    (selMap.druglikeness?.length || 0) +
    (selMap.adme?.length || 0) +
    (selMap.toxicity?.length || 0)
  );
}

// Compute a single compound's Final Score and full transparency breakdown.
export function scoreCompound(row, selMap, weights) {
  const catKeys = ["druglikeness", "adme", "toxicity"];
  const catScores = {}; // 0–100 per category (or null if no data / no params)
  const breakdown = []; // list of {category, parameter, value, threshold, pass, contribution}
  const activeCatWeights = {};

  // First pass: compute per-category pass ratios ignoring unavailable data.
  for (const cat of catKeys) {
    const params = selMap[cat] || [];
    if (params.length === 0) {
      catScores[cat] = null;
      continue;
    }
    let evaluated = 0;
    let passed = 0;
    for (const p of params) {
      const value = p.getValue(row);
      const res = p.evaluate(row);
      if (res == null) {
        breakdown.push({
          category: cat,
          parameter: p.label,
          value,
          threshold: p.threshold,
          pass: null, // unavailable
          contribution: null,
        });
        continue;
      }
      evaluated += 1;
      if (res) passed += 1;
      breakdown.push({
        category: cat,
        parameter: p.label,
        value,
        threshold: p.threshold,
        pass: res,
        contribution: null, // filled below once category weight is known
      });
    }
    catScores[cat] = evaluated > 0 ? (passed / evaluated) * 100 : null;
  }

  // Renormalize category weights: drop categories with no evaluable params.
  const totalUserWeight = Math.max(
    1,
    (weights.druglikeness || 0) + (weights.adme || 0) + (weights.toxicity || 0)
  );
  let activeSum = 0;
  for (const cat of catKeys) {
    if (catScores[cat] != null) activeSum += weights[cat] || 0;
  }
  for (const cat of catKeys) {
    activeCatWeights[cat] =
      catScores[cat] != null && activeSum > 0
        ? ((weights[cat] || 0) / activeSum) * 100 // % of active total
        : 0;
  }

  // Weighted final.
  let final = 0;
  for (const cat of catKeys) {
    if (catScores[cat] != null) {
      final += (catScores[cat] * activeCatWeights[cat]) / 100;
    }
  }
  const scoreValid = activeSum > 0;

  // Fill per-parameter contribution: within a category each param contributes
  // equally to that category's share of the final score.
  for (const b of breakdown) {
    if (b.pass == null) {
      b.contribution = 0;
      continue;
    }
    const catParams = selMap[b.category] || [];
    // Only "evaluated" params share the category weight.
    const evaluableCount = catParams.filter((p) => p.evaluate(row) != null).length || 1;
    const perParam = activeCatWeights[b.category] / evaluableCount;
    b.contribution = b.pass ? perParam : 0;
  }

  return {
    score: scoreValid ? Math.round(final * 10) / 10 : null,
    categoryScores: catScores,
    activeCategoryWeights: activeCatWeights,
    breakdown,
    totalUserWeight,
    valid: scoreValid,
  };
}
