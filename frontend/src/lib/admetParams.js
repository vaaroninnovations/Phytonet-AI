// ADMET parameter registry — describes every ADME / Toxicity / Drug-Likeness
// endpoint we surface, with tooltips, filter control types, cell renderers,
// and helpers to determine "active" state per filter.
//
// Only endpoints actually returned by the installed ADMET-AI package are
// listed (see /app/backend/admet_service.py::FIELD_MAP). Pfizer / GSK rules
// are computed client-side from RDKit physchem descriptors already available
// on the row (mw, logp).

// ---------- filter control kinds ----------
// select_hl   → Any / High / Low                (probability, prefer higher)
// select_yn   → Any / Yes / No                  (probability outcome)
// select_toxyn→ Any / Positive / Negative       (toxicity, prefer negative)
// select_sub  → Any / Substrate / Non-substrate
// select_inh  → Any / Inhibitor / Non-inhibitor
// select_cyp5 → Any / Inhibitor / Non-inhibitor / Substrate / Non-substrate
// range       → { min, max } numeric range
// rule        → Boolean checkbox (rule pass)

// ---------- ADME parameters ----------
export const ADME_PARAMS = [
  // ─── Absorption ───────────────────────────────────────────
  {
    id: "hia",
    label: "HIA",
    fullName: "Human Intestinal Absorption",
    category: "Absorption",
    section: "adme",
    filterKey: "hia",
    kind: "select_hl",
    path: ["admet", "hia"],
    dataType: "prob",
    tooltip:
      "Human Intestinal Absorption — probability the compound is absorbed through the intestinal wall. High values (≥ 0.5) indicate good oral absorption.",
  },
  {
    id: "caco2",
    label: "Caco-2",
    fullName: "Caco-2 Permeability",
    category: "Absorption",
    section: "adme",
    filterKey: ["caco2Min", "caco2Max"],
    kind: "range",
    path: ["admet", "caco2"],
    dataType: "value",
    unit: "log(cm/s)",
    tooltip:
      "Caco-2 permeability — regression estimate of intestinal permeability in log(cm/s). Values greater than about −5.15 are considered highly permeable.",
  },
  {
    id: "pampa",
    label: "PAMPA",
    fullName: "Parallel Artificial Membrane Permeability",
    category: "Absorption",
    section: "adme",
    filterKey: "pampa",
    kind: "select_hl",
    path: ["admet", "pampa"],
    dataType: "prob",
    tooltip:
      "PAMPA permeability — passive-diffusion permeability across an artificial phospholipid membrane. High values indicate favourable passive absorption.",
  },
  {
    id: "pgp_inh",
    label: "P-gp Inhibitor",
    fullName: "P-glycoprotein Inhibitor",
    category: "Absorption",
    section: "adme",
    filterKey: "pgp_inh",
    kind: "select_inh",
    path: ["admet", "pgp_inhibitor"],
    dataType: "prob",
    tooltip:
      "P-glycoprotein inhibition — inhibitors may reduce first-pass efflux (raising exposure) but also raise drug-drug interaction risk. Non-inhibitors are generally preferred.",
  },
  {
    id: "bioavailability",
    label: "Bioavailability",
    fullName: "Bioavailability Score",
    category: "Absorption",
    section: "adme",
    filterKey: "bioavailability",
    kind: "select_hl",
    path: ["admet", "bioavailability"],
    dataType: "prob",
    tooltip:
      "Fraction of an oral dose expected to reach systemic circulation. Values ≥ 0.55 are generally favourable.",
  },
  {
    id: "solubility",
    label: "Solubility",
    fullName: "Aqueous Solubility",
    category: "Absorption",
    section: "adme",
    filterKey: ["solubilityMin", "solubilityMax"],
    kind: "range",
    path: ["admet", "solubility"],
    dataType: "value",
    unit: "log mol/L",
    tooltip:
      "Aqueous solubility (AqSolDB regression) in log mol/L. Values above about −4 indicate acceptable solubility for oral formulation.",
  },

  // ─── Distribution ─────────────────────────────────────────
  {
    id: "bbb",
    label: "BBB",
    fullName: "Blood–Brain Barrier Permeability",
    category: "Distribution",
    section: "adme",
    filterKey: "bbb",
    kind: "select_yn",
    path: ["admet", "bbb"],
    dataType: "prob",
    tooltip:
      "Probability of crossing the blood-brain barrier. Required for CNS targets, undesirable for peripheral-only drugs.",
  },
  {
    id: "ppbr",
    label: "PPB",
    fullName: "Plasma Protein Binding",
    category: "Distribution",
    section: "adme",
    filterKey: ["ppbrMin", "ppbrMax"],
    kind: "range",
    path: ["admet", "ppbr"],
    dataType: "value",
    unit: "%",
    tooltip:
      "Fraction of drug bound to plasma proteins. Very high binding (> 95%) can limit free drug availability at the target.",
  },
  {
    id: "vdss",
    label: "VDss",
    fullName: "Volume of Distribution (steady state)",
    category: "Distribution",
    section: "adme",
    filterKey: ["vdssMin", "vdssMax"],
    kind: "range",
    path: ["admet", "vdss"],
    dataType: "value",
    unit: "L/kg",
    tooltip:
      "Steady-state volume of distribution in L/kg (log10 in some references). Larger values indicate wider tissue penetration.",
  },

  // ─── Metabolism ───────────────────────────────────────────
  ...["cyp1a2", "cyp2c9", "cyp2c19", "cyp2d6", "cyp3a4"].map((k) => {
    // CYP2C9 / CYP2D6 / CYP3A4 have both inhibitor and substrate data;
    // CYP1A2 and CYP2C19 have inhibitor only.
    const hasSub = ["cyp2c9", "cyp2d6", "cyp3a4"].includes(k);
    return {
      id: k,
      label: k.toUpperCase(),
      fullName: `${k.toUpperCase()} — cytochrome P450`,
      category: "Metabolism",
      section: "adme",
      filterKey: k,
      kind: hasSub ? "select_cyp5" : "select_inh",
      path: ["admet", `${k}_inhibitor`],
      subPath: hasSub ? ["admet", `${k}_substrate`] : null,
      dataType: "prob",
      tooltip:
        `${k.toUpperCase()} inhibition/substrate probability. ` +
        `${
          k === "cyp3a4"
            ? "CYP3A4 metabolises the largest share of clinical drugs — potent inhibitors are the biggest DDI risk."
            : "Inhibitors raise drug-drug interaction risk; being a substrate can shorten half-life."
        }`,
    };
  }),

  // ─── Excretion ────────────────────────────────────────────
  {
    id: "clearance_hepatocyte",
    label: "CL (hep)",
    fullName: "Clearance — Hepatocyte",
    category: "Excretion",
    section: "adme",
    filterKey: ["clearanceHepMin", "clearanceHepMax"],
    kind: "range",
    path: ["admet", "clearance_hepatocyte"],
    dataType: "value",
    unit: "µL/min/1e6 cells",
    tooltip:
      "Intrinsic hepatocyte clearance. Very high values suggest rapid metabolism and short half-life; very low values may indicate slow elimination.",
  },
  {
    id: "clearance_microsome",
    label: "CL (mic)",
    fullName: "Clearance — Microsome",
    category: "Excretion",
    section: "adme",
    filterKey: ["clearanceMicMin", "clearanceMicMax"],
    kind: "range",
    path: ["admet", "clearance_microsome"],
    dataType: "value",
    unit: "µL/min/mg",
    tooltip:
      "Microsomal intrinsic clearance — an in-vitro proxy for hepatic phase-I metabolic clearance.",
  },
  {
    id: "half_life",
    label: "Half-life",
    fullName: "Half-life",
    category: "Excretion",
    section: "adme",
    filterKey: ["halfLifeMin", "halfLifeMax"],
    kind: "range",
    path: ["admet", "half_life"],
    dataType: "value",
    unit: "h",
    tooltip:
      "Predicted human plasma half-life in hours. Longer values allow less-frequent dosing but may raise accumulation risk.",
  },
];

// ---------- Toxicity parameters (only ADMET-AI-supported endpoints) ----------
export const TOX_PARAMS = [
  {
    id: "ames",
    label: "AMES",
    fullName: "AMES Mutagenicity",
    category: "Genetic",
    section: "tox",
    filterKey: "ames",
    kind: "select_toxyn",
    path: ["admet", "ames"],
    dataType: "prob",
    tooltip:
      "AMES mutagenicity — probability the compound induces bacterial reverse-mutation. Non-mutagens are strongly preferred.",
  },
  {
    id: "herg",
    label: "hERG",
    fullName: "hERG Blockade",
    category: "Cardiac",
    section: "tox",
    filterKey: "herg",
    kind: "select_toxyn",
    path: ["admet", "herg"],
    dataType: "prob",
    tooltip:
      "hERG potassium-channel blockade — associated with QT prolongation and cardiotoxicity. Non-blockers (< 0.5) are preferred.",
  },
  {
    id: "dili",
    label: "DILI",
    fullName: "Drug-Induced Liver Injury",
    category: "Hepatic",
    section: "tox",
    filterKey: "dili",
    kind: "select_toxyn",
    path: ["admet", "dili"],
    dataType: "prob",
    tooltip:
      "Drug-Induced Liver Injury probability — a major cause of clinical attrition and post-market withdrawal. Non-DILI is strongly preferred.",
  },
  {
    id: "carcinogenicity",
    label: "Carcinogenic",
    fullName: "Carcinogenicity",
    category: "Genetic",
    section: "tox",
    filterKey: "carcinogenicity",
    kind: "select_toxyn",
    path: ["admet", "carcinogenicity"],
    dataType: "prob",
    tooltip:
      "Rodent carcinogenicity probability. Non-carcinogens are required for chronic-use drugs.",
  },
  {
    id: "skin_sensitization",
    label: "Skin Sens.",
    fullName: "Skin Sensitization",
    category: "Dermal",
    section: "tox",
    filterKey: "skin",
    kind: "select_toxyn",
    path: ["admet", "skin_sensitization"],
    dataType: "prob",
    tooltip:
      "Local skin sensitization / contact allergy risk. Relevant to topical formulations and manufacturing exposure.",
  },
  {
    id: "clintox",
    label: "ClinTox",
    fullName: "Clinical Toxicity",
    category: "Clinical",
    section: "tox",
    filterKey: "clintox",
    kind: "select_toxyn",
    path: ["admet", "clintox"],
    dataType: "prob",
    tooltip:
      "Probability of clinical trial toxicity-related failure (ClinTox benchmark). Lower is safer.",
  },
  {
    id: "ld50",
    label: "LD50",
    fullName: "Acute Oral Toxicity (LD50)",
    category: "Acute",
    section: "tox",
    filterKey: ["ld50Min", "ld50Max"],
    kind: "range",
    path: ["admet", "ld50"],
    dataType: "value",
    unit: "-log(mol/kg)",
    tooltip:
      "Predicted oral LD50 (Zhu regression) in −log(mol/kg). Higher values indicate lower acute toxicity — 2.5 is roughly 316 mg/kg for a 100 g/mol compound.",
  },
  {
    id: "ld50_mgkg",
    label: "LD50 (mg/kg)",
    fullName: "LD50 (mg/kg body weight)",
    category: "Acute",
    section: "tox",
    filterKey: ["ld50Min", "ld50Max"], // shares filter with LD50
    kind: "computed",
    path: null,
    computed: (r) => {
      const p = r.admet?.ld50;
      const mw = r.physchem?.mw ?? r.molecular_weight;
      if (typeof p !== "number" || typeof mw !== "number") return null;
      // LD50 (mol/kg) = 10^(-prediction); LD50 (mg/kg) = mol/kg × MW × 1000
      const molkg = Math.pow(10, -p);
      return molkg * mw * 1000;
    },
    dataType: "value",
    unit: "mg/kg",
    tooltip:
      "LD50 (mg/kg) is automatically calculated from the ADMET-AI prediction using the compound molecular weight: 10^(−prediction) × MW × 1000.",
  },
];

// ---------- Drug-Likeness rules + numeric properties ----------
export const DL_RULES = [
  {
    id: "lipinski",
    label: "Lipinski RO5",
    filterKey: "lipinski",
    kind: "rule",
    path: ["druglikeness", "lipinski_pass"],
    dataType: "bool",
    tooltip:
      "Rule of Five (Lipinski, 1997) — MW ≤ 500, LogP ≤ 5, HBD ≤ 5, HBA ≤ 10. Predictor of oral bioavailability.",
  },
  {
    id: "veber",
    label: "Veber",
    filterKey: "veber",
    kind: "rule",
    path: ["druglikeness", "veber_pass"],
    dataType: "bool",
    tooltip:
      "Veber rule — TPSA ≤ 140 Å² and Rotatable Bonds ≤ 10. Correlates with good oral bioavailability.",
  },
  {
    id: "ghose",
    label: "Ghose",
    filterKey: "ghose",
    kind: "rule",
    path: ["druglikeness", "ghose_pass"],
    dataType: "bool",
    tooltip:
      "Ghose filter — 160 ≤ MW ≤ 480 and −0.4 ≤ LogP ≤ 5.6. Defines a drug-like property window.",
  },
  {
    id: "egan",
    label: "Egan",
    filterKey: "egan",
    kind: "rule",
    path: ["druglikeness", "egan_pass"],
    dataType: "bool",
    tooltip:
      "Egan rule — LogP ≤ 5.88 and TPSA ≤ 131.6 Å². Focuses on passive absorption.",
  },
  {
    id: "muegge",
    label: "Muegge",
    filterKey: "muegge",
    kind: "rule",
    path: ["druglikeness", "muegge_pass"],
    dataType: "bool",
    tooltip:
      "Muegge rule — 200 ≤ MW ≤ 600, −2 ≤ LogP ≤ 5, TPSA ≤ 150, Rotatable ≤ 15, HBA ≤ 10, HBD ≤ 5. Bayer's oral-drug filter.",
  },
  {
    id: "pfizer",
    label: "Pfizer 3/75",
    filterKey: "pfizer",
    kind: "rule",
    path: null, // computed client-side
    computed: (r) => {
      const l = r.physchem?.logp,
        t = r.physchem?.tpsa;
      if (l == null || t == null) return null;
      return !(l > 3 && t < 75); // safer profile
    },
    dataType: "bool",
    tooltip:
      "Pfizer 3/75 rule — compounds with LogP > 3 AND TPSA < 75 Å² show higher toxicity risk. Compounds outside this liability window pass.",
  },
  {
    id: "gsk",
    label: "GSK 4/400",
    filterKey: "gsk",
    kind: "rule",
    path: null,
    computed: (r) => {
      const l = r.physchem?.logp,
        m = r.physchem?.mw;
      if (l == null || m == null) return null;
      return l <= 4 && m <= 400;
    },
    dataType: "bool",
    tooltip:
      "GSK 4/400 rule — LogP ≤ 4 and MW ≤ 400. Compounds meeting both criteria show better developability profiles.",
  },
];

export const DL_NUMERIC = [
  {
    id: "mw",
    label: "Molecular Weight",
    unit: "Da",
    filterKey: ["mwMin", "mwMax"],
    kind: "range",
    path: ["physchem", "mw"],
    dataType: "value",
    tooltip:
      "Molecular weight. Lipinski: ≤ 500 Da. Lower MW correlates with better oral absorption.",
  },
  {
    id: "logp",
    label: "LogP",
    unit: "",
    filterKey: ["logpMin", "logpMax"],
    kind: "range",
    path: ["physchem", "logp"],
    dataType: "value",
    tooltip:
      "Octanol-water partition coefficient. Lipinski: ≤ 5. Balance of solubility and permeability.",
  },
  {
    id: "tpsa",
    label: "TPSA",
    unit: "Å²",
    filterKey: ["tpsaMin", "tpsaMax"],
    kind: "range",
    path: ["physchem", "tpsa"],
    dataType: "value",
    tooltip:
      "Topological polar surface area. Veber: ≤ 140 Å² correlates with good oral absorption; < 90 Å² needed for CNS penetration.",
  },
  {
    id: "hba",
    label: "H-bond Acceptors",
    unit: "",
    filterKey: ["hbaMin", "hbaMax"],
    kind: "range",
    path: ["physchem", "hba"],
    dataType: "value",
    tooltip: "Hydrogen bond acceptor count. Lipinski: ≤ 10.",
  },
  {
    id: "hbd",
    label: "H-bond Donors",
    unit: "",
    filterKey: ["hbdMin", "hbdMax"],
    kind: "range",
    path: ["physchem", "hbd"],
    dataType: "value",
    tooltip: "Hydrogen bond donor count. Lipinski: ≤ 5.",
  },
  {
    id: "rotb",
    label: "Rotatable Bonds",
    unit: "",
    filterKey: ["rotbMin", "rotbMax"],
    kind: "range",
    path: ["druglikeness", "rotatable_bonds"],
    dataType: "value",
    tooltip: "Rotatable bond count. Veber: ≤ 10. Reflects molecular flexibility.",
  },
  {
    id: "bioavailability_dl",
    label: "Bioavailability Score",
    unit: "",
    filterKey: "bioavailability", // shared with ADME control
    kind: "shared_bioavailability",
    path: ["admet", "bioavailability"],
    dataType: "prob",
    tooltip:
      "Bioavailability score (Ma et al., 2008). ≥ 0.55 is favourable. Shared control with ADME → Absorption.",
  },
];

// Static thresholds card content.
export const DL_CRITERIA_TABLE = [
  {
    name: "Lipinski",
    conditions: "MW ≤ 500 · LogP ≤ 5 · HBD ≤ 5 · HBA ≤ 10",
  },
  { name: "Veber", conditions: "TPSA ≤ 140 Å² · Rotatable Bonds ≤ 10" },
  {
    name: "Ghose",
    conditions: "160 ≤ MW ≤ 480 · −0.4 ≤ LogP ≤ 5.6 · 40 ≤ MR ≤ 130 · 20 ≤ atoms ≤ 70",
  },
  { name: "Egan", conditions: "LogP ≤ 5.88 · TPSA ≤ 131.6 Å²" },
  {
    name: "Muegge",
    conditions:
      "200 ≤ MW ≤ 600 · −2 ≤ LogP ≤ 5 · TPSA ≤ 150 · Rotatable ≤ 15 · HBA ≤ 10 · HBD ≤ 5",
  },
  { name: "Pfizer 3/75", conditions: "Avoid LogP > 3 AND TPSA < 75 Å²" },
  { name: "GSK 4/400", conditions: "LogP ≤ 4 · MW ≤ 400" },
];

// ---------- helpers ----------
export function readPath(row, path) {
  if (!path) return undefined;
  return path.reduce((o, k) => (o == null ? undefined : o[k]), row);
}

// Returns true if the user has activated a filter for this parameter.
export function isFilterActive(param, filters) {
  if (Array.isArray(param.filterKey)) {
    const [minK, maxK] = param.filterKey;
    return filters[minK] !== "" || filters[maxK] !== "";
  }
  if (param.kind === "rule") return filters[param.filterKey] === true;
  if (param.kind === "shared_bioavailability")
    return filters.bioavailability !== "any";
  return filters[param.filterKey] !== "any";
}

// Given a list of parameters and filter state, return the subset to render as
// table columns. If no filter is active within the parameter list, return all.
export function activeColumnsFor(params, filters) {
  const active = params.filter((p) => isFilterActive(p, filters));
  return active.length > 0 ? active : params;
}

export function anyFilterActive(params, filters) {
  return params.some((p) => isFilterActive(p, filters));
}

// ---------- Auto-analysis preset ----------
// Published medicinal-chemistry screening criteria, applied in one click.
// Only endpoints actually returned by ADMET-AI are addressed; BBB and
// clearance are intentionally left as "Any" because their preferred value
// depends on the drug target (CNS vs. peripheral, once-daily vs. bolus).
export const AUTO_ANALYSIS_FILTERS = {
  // Drug-Likeness rules — Lipinski, Veber, Ghose, Egan, Muegge, Pfizer, GSK
  lipinski: true,
  veber: true,
  ghose: true,
  egan: true,
  muegge: true,
  pfizer: true,
  gsk: true,
  // Numeric physchem thresholds
  mwMin: "",
  mwMax: "500",
  logpMin: "",
  logpMax: "5",
  tpsaMin: "",
  tpsaMax: "140",
  hbaMin: "",
  hbaMax: "10",
  hbdMin: "",
  hbdMax: "5",
  rotbMin: "",
  rotbMax: "10",
  // ADME — Absorption
  hia: "high",
  pampa: "high",
  pgp_inh: "non-inhibitor",
  bioavailability: "high",
  caco2Min: "-5.15", // Caco-2 log(cm/s) > -5.15 → high permeability
  caco2Max: "",
  solubilityMin: "-4", // log mol/L ≥ -4 → soluble enough for oral
  solubilityMax: "",
  // ADME — Distribution (BBB left "any" — target-dependent)
  bbb: "any",
  ppbrMin: "",
  ppbrMax: "",
  vdssMin: "",
  vdssMax: "",
  // ADME — Metabolism (prefer non-inhibitors)
  cyp1a2: "non-inhibitor",
  cyp2c9: "non-inhibitor",
  cyp2c19: "non-inhibitor",
  cyp2d6: "non-inhibitor",
  cyp3a4: "non-inhibitor",
  // ADME — Excretion (target-dependent — left blank)
  clearanceHepMin: "",
  clearanceHepMax: "",
  clearanceMicMin: "",
  clearanceMicMax: "",
  halfLifeMin: "",
  halfLifeMax: "",
  // Toxicity — prefer non-toxic
  ames: "negative",
  herg: "negative",
  dili: "negative",
  carcinogenicity: "negative",
  skin: "negative",
  clintox: "negative",
  ld50Min: "2", // -log(mol/kg) ≥ 2 → LD50 ≥ ~100 mg/kg for a 100 g/mol compound
  ld50Max: "",
};

// Assessment-label variants — two flavours used in the Auto Analysis table.
export const ASSESSMENT_LABELS = {
  drug: [
    { min: 95, label: "Excellent Drug Candidate" },
    { min: 85, label: "Strong Drug Candidate" },
    { min: 70, label: "Good Drug Candidate" },
    { min: 55, label: "Moderate Candidate" },
    { min: 40, label: "Weak Candidate" },
    { min: 0, label: "Poor Candidate" },
  ],
  admet: [
    { min: 95, label: "Excellent ADMET Profile" },
    { min: 85, label: "Very Good ADMET Profile" },
    { min: 70, label: "Acceptable ADMET Profile" },
    { min: 55, label: "Marginal ADMET Profile" },
    { min: 40, label: "Weak ADMET Profile" },
    { min: 0, label: "Poor ADMET Profile" },
  ],
};

export function labelFor(score, kind = "drug") {
  const table = ASSESSMENT_LABELS[kind] || ASSESSMENT_LABELS.drug;
  if (!Number.isFinite(score)) return "—";
  for (const t of table) if (score >= t.min) return t.label;
  return table[table.length - 1].label;
}
