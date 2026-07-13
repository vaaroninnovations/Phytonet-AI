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

// Convenience wrapper for prob-select filters.
const probParam = (id, label, threshold, field, want) => ({
  id,
  label,
  threshold,
  getValue: (r) => r.admet?.[field],
  evaluate: (r) => {
    const p = prob(r.admet?.[field]);
    return p == null ? null : want ? p : !p;
  },
});

const rangeParam = (id, label, path, min, max, unit = "") => ({
  id,
  label,
  threshold: rangeStr(min, max, unit),
  getValue: (r) => path.reduce((o, k) => (o == null ? undefined : o[k]), r),
  evaluate: (r) => {
    const v = path.reduce((o, k) => (o == null ? undefined : o[k]), r);
    return inRange(v, min, max);
  },
});

// Build the list of "selected parameters" per category from the current
// filter state.
export function selectedParameters(filters) {
  const dl = [];
  const adme = [];
  const tox = [];

  // ---- Drug-Likeness rules ----
  const ruleDefs = [
    ["lipinski", "Lipinski", "lipinski_pass"],
    ["veber", "Veber", "veber_pass"],
    ["ghose", "Ghose", "ghose_pass"],
    ["egan", "Egan", "egan_pass"],
    ["muegge", "Muegge", "muegge_pass"],
  ];
  for (const [k, label, field] of ruleDefs) {
    if (filters[k]) {
      dl.push({
        id: k,
        label,
        threshold: "Pass",
        getValue: (r) => r.druglikeness?.[field],
        evaluate: (r) => {
          const v = r.druglikeness?.[field];
          return v == null ? null : v === true;
        },
      });
    }
  }
  if (filters.pfizer) {
    dl.push({
      id: "pfizer",
      label: "Pfizer 3/75",
      threshold: "Not (LogP>3 & TPSA<75)",
      getValue: (r) =>
        r.physchem?.logp != null && r.physchem?.tpsa != null
          ? `LogP=${r.physchem.logp.toFixed(2)}, TPSA=${r.physchem.tpsa.toFixed(1)}`
          : null,
      evaluate: (r) => {
        const l = r.physchem?.logp,
          t = r.physchem?.tpsa;
        if (l == null || t == null) return null;
        return !(l > 3 && t < 75);
      },
    });
  }
  if (filters.gsk) {
    dl.push({
      id: "gsk",
      label: "GSK 4/400",
      threshold: "LogP≤4 & MW≤400",
      getValue: (r) =>
        r.physchem?.logp != null && r.physchem?.mw != null
          ? `LogP=${r.physchem.logp.toFixed(2)}, MW=${r.physchem.mw.toFixed(1)}`
          : null,
      evaluate: (r) => {
        const l = r.physchem?.logp,
          m = r.physchem?.mw;
        if (l == null || m == null) return null;
        return l <= 4 && m <= 400;
      },
    });
  }
  // DL numeric ranges
  const dlRanges = [
    ["mw", "Molecular weight", ["physchem", "mw"], "mwMin", "mwMax", "Da"],
    ["logp", "LogP", ["physchem", "logp"], "logpMin", "logpMax", ""],
    ["tpsa", "TPSA", ["physchem", "tpsa"], "tpsaMin", "tpsaMax", "Å²"],
    ["hba", "HBA", ["physchem", "hba"], "hbaMin", "hbaMax", ""],
    ["hbd", "HBD", ["physchem", "hbd"], "hbdMin", "hbdMax", ""],
    ["rotb", "Rotatable Bonds", ["druglikeness", "rotatable_bonds"], "rotbMin", "rotbMax", ""],
  ];
  for (const [id, label, path, minK, maxK, unit] of dlRanges) {
    if (filters[minK] !== "" || filters[maxK] !== "") {
      dl.push(rangeParam(id, label, path, filters[minK], filters[maxK], unit));
    }
  }
  // Bioavailability score (shared, but treated in DL — matches user spec's
  // Drug-Likeness numeric list. If also set, it counts once here.)
  if (filters.bioavailability !== "any") {
    const want = filters.bioavailability === "high";
    dl.push({
      id: "bioavailability_score",
      label: "Bioavailability score",
      threshold: want ? "≥ 0.55" : "< 0.55",
      getValue: (r) => r.admet?.bioavailability,
      evaluate: (r) => {
        const n = num(r.admet?.bioavailability);
        if (n == null) return null;
        return want ? n >= 0.55 : n < 0.55;
      },
    });
  }

  // ---- ADME (Absorption + Distribution + Metabolism + Excretion) ----
  // Absorption
  if (filters.hia !== "any") {
    const want = filters.hia === "high";
    adme.push(probParam("hia", "HIA", want ? "≥ 0.5" : "< 0.5", "hia", want));
  }
  if (filters.pampa !== "any") {
    const want = filters.pampa === "high";
    adme.push(probParam("pampa", "PAMPA", want ? "≥ 0.5" : "< 0.5", "pampa", want));
  }
  if (filters.pgp_inh !== "any") {
    const want = filters.pgp_inh === "inhibitor";
    adme.push(
      probParam(
        "pgp_inh",
        "P-gp inhibitor",
        want ? "≥ 0.5" : "< 0.5",
        "pgp_inhibitor",
        want
      )
    );
  }
  const admeRangeDefs = [
    ["caco2", "Caco-2 permeability", ["admet", "caco2"], "caco2Min", "caco2Max", "log(cm/s)"],
    ["solubility", "Solubility", ["admet", "solubility"], "solubilityMin", "solubilityMax", "log mol/L"],
    ["ppbr", "Plasma protein binding", ["admet", "ppbr"], "ppbrMin", "ppbrMax", "%"],
    ["vdss", "Volume of distribution", ["admet", "vdss"], "vdssMin", "vdssMax", "L/kg"],
    ["clearance_hep", "Clearance (hepatocyte)", ["admet", "clearance_hepatocyte"], "clearanceHepMin", "clearanceHepMax", ""],
    ["clearance_mic", "Clearance (microsome)", ["admet", "clearance_microsome"], "clearanceMicMin", "clearanceMicMax", ""],
    ["half_life", "Half-life", ["admet", "half_life"], "halfLifeMin", "halfLifeMax", "h"],
  ];
  for (const [id, label, path, minK, maxK, unit] of admeRangeDefs) {
    if (filters[minK] !== "" || filters[maxK] !== "") {
      adme.push(rangeParam(id, label, path, filters[minK], filters[maxK], unit));
    }
  }
  // Distribution — BBB
  if (filters.bbb !== "any") {
    const want = filters.bbb === "yes";
    adme.push(probParam("bbb", "BBB permeability", want ? "≥ 0.5" : "< 0.5", "bbb", want));
  }
  // Metabolism — CYPs (5-way for 2c9/2d6/3a4, 3-way for 1a2/2c19)
  const cypDefs = [
    ["cyp1a2", "CYP1A2", "cyp1a2_inhibitor", null],
    ["cyp2c9", "CYP2C9", "cyp2c9_inhibitor", "cyp2c9_substrate"],
    ["cyp2c19", "CYP2C19", "cyp2c19_inhibitor", null],
    ["cyp2d6", "CYP2D6", "cyp2d6_inhibitor", "cyp2d6_substrate"],
    ["cyp3a4", "CYP3A4", "cyp3a4_inhibitor", "cyp3a4_substrate"],
  ];
  for (const [k, label, inhField, subField] of cypDefs) {
    const v = filters[k];
    if (!v || v === "any") continue;
    if (v === "inhibitor" || v === "non-inhibitor") {
      const want = v === "inhibitor";
      adme.push(
        probParam(k, `${label} — ${v}`, want ? "≥ 0.5" : "< 0.5", inhField, want)
      );
    } else if (subField && (v === "substrate" || v === "non-substrate")) {
      const want = v === "substrate";
      adme.push(
        probParam(k, `${label} — ${v}`, want ? "≥ 0.5" : "< 0.5", subField, want)
      );
    }
  }

  // ---- Toxicity ----
  const toxEndpoints = [
    ["ames", "AMES", "ames"],
    ["herg", "hERG", "herg"],
    ["dili", "DILI", "dili"],
    ["carcinogenicity", "Carcinogenicity", "carcinogenicity"],
    ["skin", "Skin sensitization", "skin_sensitization"],
    ["clintox", "ClinTox", "clintox"],
  ];
  for (const [fkey, label, field] of toxEndpoints) {
    const v = filters[fkey];
    if (!v || v === "any") continue;
    // "positive" = compound IS mutagenic/blocker (want prob >= 0.5)
    // "negative" = compound is NOT (want prob < 0.5) — preferred
    const want = v === "positive";
    tox.push(
      probParam(
        fkey,
        want ? label : `Non-${label}`,
        want ? "≥ 0.5" : "< 0.5",
        field,
        want
      )
    );
  }
  if (filters.ld50Min !== "" || filters.ld50Max !== "") {
    tox.push(
      rangeParam(
        "ld50",
        "LD50",
        ["admet", "ld50"],
        filters.ld50Min,
        filters.ld50Max,
        "-log(mol/kg)"
      )
    );
  }

  return { druglikeness: dl, adme, toxicity: tox };
}

export function totalSelected(selMap) {
  return (
    (selMap.druglikeness?.length || 0) +
    (selMap.adme?.length || 0) +
    (selMap.toxicity?.length || 0)
  );
}

export function scoreCompound(row, selMap, weights) {
  const catKeys = ["druglikeness", "adme", "toxicity"];
  const catScores = {};
  const breakdown = [];
  const activeCatWeights = {};

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
          pass: null,
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
        contribution: null,
      });
    }
    catScores[cat] = evaluated > 0 ? (passed / evaluated) * 100 : null;
  }

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
        ? ((weights[cat] || 0) / activeSum) * 100
        : 0;
  }

  let final = 0;
  for (const cat of catKeys) {
    if (catScores[cat] != null) {
      final += (catScores[cat] * activeCatWeights[cat]) / 100;
    }
  }
  const scoreValid = activeSum > 0;

  for (const b of breakdown) {
    if (b.pass == null) {
      b.contribution = 0;
      continue;
    }
    const catParams = selMap[b.category] || [];
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
