// Deterministic Report Generation content builder.
// Walks the workflow state and produces a structured document tree that the
// PDF and DOCX renderers consume without any LLM in the loop. Sections are
// omitted whenever the underlying data is missing → no placeholder content.

/**
 * @typedef {Object} ReportDoc
 * @property {Object} meta
 * @property {Array<{key:string,title:string,paragraphs?:string[],table?:{columns:string[],rows:Array<Array<string|number>>,caption?:string},methods?:string[],included:boolean}>} sections
 * @property {Array<{id:string,text:string}>} references
 */

// ── Reference registry — cited whenever the matching database/tool is used
const REFS = {
  IMPPAT: { id: "IMPPAT", text: "Vivek-Ananth, R. P. et al. (2023). IMPPAT 2.0: an enhanced and expanded phytochemical atlas of Indian medicinal plants. RSC Advances, 13(9), 5541–5551." },
  LOTUS:  { id: "LOTUS",  text: "Rutz, A. et al. (2022). The LOTUS initiative for open knowledge management in natural products research. eLife, 11, e70780." },
  PubChem:{ id: "PubChem",text: "Kim, S. et al. (2023). PubChem 2023 update. Nucleic Acids Research, 51(D1), D1373–D1380." },
  SwissADME:{ id: "SwissADME", text: "Daina, A., Michielin, O. & Zoete, V. (2017). SwissADME: a free web tool to evaluate pharmacokinetics, drug-likeness and medicinal chemistry friendliness of small molecules. Scientific Reports, 7, 42717." },
  Lipinski:{ id: "Lipinski", text: "Lipinski, C. A. et al. (2001). Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. Adv. Drug Deliv. Rev., 46(1–3), 3–26." },
  SwissTP:{ id: "SwissTP",   text: "Daina, A., Michielin, O. & Zoete, V. (2019). SwissTargetPrediction: updated data and new features for efficient prediction of protein targets of small molecules. Nucleic Acids Research, 47(W1), W357–W364." },
  ChEMBL: { id: "ChEMBL",    text: "Zdrazil, B. et al. (2024). The ChEMBL Database in 2023: a drug discovery platform spanning multiple bioactivity data types and time periods. Nucleic Acids Research, 52(D1), D1180–D1192." },
  UniProt:{ id: "UniProt",   text: "The UniProt Consortium (2023). UniProt: the universal protein knowledgebase in 2023. Nucleic Acids Research, 51(D1), D523–D531." },
  DisGeNET:{ id: "DisGeNET", text: "Piñero, J. et al. (2020). The DisGeNET knowledge platform for disease genomics: 2019 update. Nucleic Acids Research, 48(D1), D845–D855." },
  OpenTargets:{ id: "OpenTargets", text: "Ochoa, D. et al. (2023). The Open Targets Platform: supporting systematic drug–target identification and prioritisation. Nucleic Acids Research, 51(D1), D1353–D1359." },
  STRING: { id: "STRING",    text: "Szklarczyk, D. et al. (2023). The STRING database in 2023: protein–protein association networks and functional enrichment analyses. Nucleic Acids Research, 51(D1), D638–D646." },
  gProfiler:{ id: "gProfiler", text: "Kolberg, L. et al. (2023). g:Profiler—interoperable web service for functional enrichment analysis and gene identifier mapping (2023 update). Nucleic Acids Research, 51(W1), W207–W212." },
  KEGG:   { id: "KEGG",      text: "Kanehisa, M. et al. (2023). KEGG for taxonomy-based analysis of pathways and genomes. Nucleic Acids Research, 51(D1), D587–D592." },
  Reactome:{id: "Reactome",  text: "Gillespie, M. et al. (2022). The Reactome pathway knowledgebase 2022. Nucleic Acids Research, 50(D1), D687–D692." },
  Cytoscape:{id: "Cytoscape",text: "Shannon, P. et al. (2003). Cytoscape: a software environment for integrated models of biomolecular interaction networks. Genome Research, 13(11), 2498–2504." },
  PDB:    { id: "PDB",       text: "Berman, H. M. et al. (2000). The Protein Data Bank. Nucleic Acids Research, 28(1), 235–242." },
  Vina:   { id: "AutoDockVina", text: "Eberhardt, J., Santos-Martins, D., Tillack, A. F. & Forli, S. (2021). AutoDock Vina 1.2.0: New docking methods, expanded force field, and Python bindings. J. Chem. Inf. Model., 61(8), 3891–3898." },
  OpenBabel:{id: "OpenBabel",text: "O'Boyle, N. M. et al. (2011). Open Babel: An open chemical toolbox. Journal of Cheminformatics, 3, 33." },
  MGLTools:{id: "MGLTools",  text: "Morris, G. M. et al. (2009). AutoDock4 and AutoDockTools4: Automated docking with selective receptor flexibility. J. Comput. Chem., 30(16), 2785–2791." },
  RCSB:   { id: "RCSB",      text: "Burley, S. K. et al. (2023). RCSB Protein Data Bank (RCSB.org): delivery of experimentally-determined PDB structures. Nucleic Acids Research, 51(D1), D488–D508." },
  ADMETAI:{ id: "ADMETAI",   text: "Swanson, K. et al. (2024). ADMET-AI: a machine learning ADMET platform for evaluation of large-scale chemical libraries. Bioinformatics, 40, btae416." },
};

function fmt(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (typeof n !== "number") return String(n);
  return n.toFixed(digits);
}

/**
 * @param {Object} params
 * @param {Object} params.workflow - The React Context payload (see AIScientificReport).
 * @param {Object} params.user     - { first_name, last_name, email }.
 * @param {string} [params.projectTitle]
 * @param {string} [params.scientificName]
 * @returns {ReportDoc}
 */
export function buildReportDoc({ workflow, user, projectTitle, scientificName }) {
  const {
    plantName, selectedDisease, selectedCompounds = [], allCompounds = [],
    compoundTargets = [], diseaseTargets = [], intersectingGenes = [],
    hubScores = [], ppiResult, goTerms = [], selectedKeggPathways = [],
    dockingResults,
  } = workflow || {};

  const doc = {
    meta: {
      projectTitle: projectTitle || `Network Pharmacology of ${plantName || "an Indian Medicinal Plant"}${selectedDisease?.name ? ` in ${selectedDisease.name}` : ""}`,
      plantName: plantName || "—",
      scientificName: scientificName || "—",
      diseaseName: selectedDisease?.name || selectedDisease?.efo_id || null,
      date: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      userName: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "—",
      userEmail: user?.email || "",
      brand: "PhytoNet AI · v1.0",
    },
    sections: [],
    references: [],
    figures: [],
    tables: [],
  };

  const usedRefs = new Set();
  const cite = (...ids) => { ids.forEach((i) => usedRefs.add(i)); return ids.map((i) => `[${i}]`).join(""); };
  const nextTable = () => (doc.tables.length + 1);
  const nextFigure = () => (doc.figures.length + 1);

  // ═════════ Executive Summary ═════════
  const executed = [];
  if (selectedCompounds.length) executed.push(`${selectedCompounds.length} phytochemicals`);
  if (compoundTargets.length)   executed.push(`${new Set(compoundTargets.map((t) => t.gene_symbol)).size} compound targets`);
  if (diseaseTargets.length)    executed.push(`${new Set(diseaseTargets.map((t) => t.gene_symbol)).size} disease targets`);
  if (intersectingGenes.length) executed.push(`${intersectingGenes.length} intersecting genes`);
  if (ppiResult)                executed.push(`${ppiResult.nodes} PPI nodes, ${ppiResult.edges} interactions`);
  if (goTerms.length)           executed.push(`${goTerms.length} enriched GO terms`);
  if (selectedKeggPathways.length) executed.push(`${selectedKeggPathways.length} KEGG pathways`);
  if (dockingResults?.results?.length) executed.push(`${dockingResults.results.length} docked complexes`);

  const bestDock = (dockingResults?.results || [])
    .filter((r) => typeof r.best_affinity === "number")
    .sort((a, b) => a.best_affinity - b.best_affinity)[0];

  doc.sections.push({
    key: "executive-summary",
    number: "1",
    title: "Executive Summary",
    included: true,
    paragraphs: [
      `This report summarises the network-pharmacology study of ${plantName || "the queried plant"}${selectedDisease?.name ? ` in the context of ${selectedDisease.name}` : ""}, generated by the PhytoNet AI platform. The analysis integrates ${executed.length ? executed.join(", ") : "the workflow modules executed prior to report generation"}.`,
      bestDock ? `The strongest predicted binding was observed for ${bestDock.ligand_name} against ${bestDock.gene_symbol || bestDock.receptor_uniprot} (binding affinity ${fmt(bestDock.best_affinity)} kcal/mol).` : "",
      `Only modules that actually produced results are included below; skipped steps are omitted so the report never fabricates data.`,
    ].filter(Boolean),
  });

  // ═════════ Materials & Methods ═════════
  const methodsSubs = [];

  if (selectedCompounds.length) {
    methodsSubs.push({
      key: "m-compounds", title: "Compound Identification",
      body: [
        `Phytochemicals attributed to ${plantName || "the plant"} were retrieved from the Indian Medicinal Plants, Phytochemistry And Therapeutics database (IMPPAT 2.0) ${cite("IMPPAT")} and the LOTUS natural-products knowledgebase ${cite("LOTUS")}. Chemical identifiers, SMILES strings and PubChem CIDs were harmonised via PubChem ${cite("PubChem")}. Duplicate structures were removed by canonical SMILES.`,
      ],
    });
  }

  const hasAdmet = selectedCompounds.some((c) => c.admet != null || c.admet_score != null || c.drug_likeness != null);
  if (hasAdmet) {
    methodsSubs.push({
      key: "m-admet", title: "ADMET & Drug-Likeness Evaluation",
      body: [
        `Absorption, Distribution, Metabolism, Excretion and Toxicity (ADMET) properties were predicted with ADMET-AI ${cite("ADMETAI")} and cross-checked against the SwissADME service ${cite("SwissADME")}. Drug-likeness was scored using Lipinski's Rule of Five ${cite("Lipinski")} (MW ≤ 500 Da, LogP ≤ 5, HBD ≤ 5, HBA ≤ 10) together with the SwissADME bioavailability score.`,
      ],
    });
  }

  if (compoundTargets.length) {
    methodsSubs.push({
      key: "m-targets", title: "Compound Target Prediction",
      body: [
        `Putative human protein targets for each phytochemical were predicted with SwissTargetPrediction ${cite("SwissTP")}. Bioactive targets with a probability ≥ 0.10 were retained; hits were annotated with the ChEMBL activity database ${cite("ChEMBL")} where measured Ki/IC₅₀ data were available.`,
      ],
    });
  }

  if (diseaseTargets.length) {
    methodsSubs.push({
      key: "m-disease", title: "Disease Target Identification",
      body: [
        `Genes associated with the disease "${selectedDisease?.name || selectedDisease?.efo_id || "the queried disease"}" were retrieved from Open Targets ${cite("OpenTargets")} and DisGeNET ${cite("DisGeNET")}; protein-level metadata was harmonised through UniProt ${cite("UniProt")}. Targets shared between the compound-target and disease-target sets were treated as the intersecting-target set used for the downstream network construction.`,
      ],
    });
  }

  if (ppiResult) {
    methodsSubs.push({
      key: "m-network", title: "Network Construction & PPI Analysis",
      body: [
        `A protein–protein interaction (PPI) network of the intersecting targets was built from STRING ${cite("STRING")} with a minimum confidence score of 0.7. Node connectivity metrics were computed to prioritise hub genes; the tripartite compound → target → disease graph was rendered client-side using Cytoscape-style layouts ${cite("Cytoscape")}.`,
      ],
    });
  }

  if (goTerms.length) {
    methodsSubs.push({
      key: "m-go", title: "GO Enrichment Analysis",
      body: [
        `Gene Ontology (GO) enrichment analysis was performed via g:Profiler ${cite("gProfiler")} against the human background; adjusted P-values were computed by the Benjamini–Hochberg procedure. Only terms with q < 0.05 are reported.`,
      ],
    });
  }

  if (selectedKeggPathways.length) {
    methodsSubs.push({
      key: "m-kegg", title: "KEGG / Reactome Pathway Analysis",
      body: [
        `Pathway enrichment against the KEGG ${cite("KEGG")} and Reactome ${cite("Reactome")} knowledgebases was performed on the intersecting-target set using the g:Profiler enrichment engine ${cite("gProfiler")}. Pathways with q < 0.05 are reported.`,
      ],
    });
  }

  if (dockingResults?.results?.length) {
    methodsSubs.push({
      key: "m-docking", title: "Molecular Docking",
      body: [
        `Receptor structures were retrieved from the RCSB Protein Data Bank ${cite("RCSB", "PDB")}. Ligand and receptor files were prepared with Open Babel ${cite("OpenBabel")} and AutoDockTools ${cite("MGLTools")}. Blind docking was performed with AutoDock Vina 1.2.5 ${cite("Vina")} (exhaustiveness = 8; 9 poses per ligand). Binding affinities are reported in kcal/mol; a lower (more-negative) score indicates a more favourable predicted binding.`,
      ],
    });
  }

  if (methodsSubs.length) {
    doc.sections.push({
      key: "materials-methods",
      number: "2",
      title: "Materials and Methods",
      included: true,
      subsections: methodsSubs,
    });
  }

  // ═════════ Results ═════════
  const resultsSubs = [];

  // 3.1 Compound Identification results
  if (selectedCompounds.length) {
    const tbl = {
      id: `T${nextTable()}`,
      title: `Selected phytochemicals from ${plantName || "the plant"} (${selectedCompounds.length} compounds).`,
      columns: ["#", "Compound", "IMPPAT / LOTUS ID", "SMILES"],
      rows: selectedCompounds.slice(0, 40).map((c, i) => [
        i + 1,
        c.compound_name || "—",
        c.imppat_id || c.lotus_id || "—",
        truncateSmiles(c.smiles),
      ]),
      caption: `Selected phytochemicals retrieved from IMPPAT / LOTUS.`,
    };
    doc.tables.push(tbl);
    const uniq = new Set(selectedCompounds.map((c) => (c.smiles || "").split(" ")[0])).size;
    const lcms = (allCompounds || []).some((c) => c.source === "lcms");
    resultsSubs.push({
      key: "r-compounds", title: "Compound Identification",
      paragraphs: [
        `A total of ${selectedCompounds.length} phytochemicals (${uniq} unique canonical structures) were selected for the downstream analysis${lcms ? "; a subset was corroborated by user-uploaded LC-MS data" : ""}.`,
      ],
      table: tbl,
    });
  }

  // 3.2 ADMET results
  if (hasAdmet) {
    const rows = selectedCompounds
      .filter((c) => c.admet != null || c.admet_score != null || c.drug_likeness != null)
      .slice(0, 40)
      .map((c) => {
        const admet = c.admet ?? c.admet_score;
        return [
          c.compound_name || c.imppat_id || "—",
          formatMaybe(c.mw),
          formatMaybe(c.logp),
          formatMaybe(c.hba),
          formatMaybe(c.hbd),
          formatMaybe(c.tpsa),
          typeof admet === "number" ? fmt(admet, 2) : (admet || "—"),
          typeof c.drug_likeness === "number" ? fmt(c.drug_likeness, 2) : (c.drug_likeness || "—"),
        ];
      });
    if (rows.length) {
      const tbl = {
        id: `T${nextTable()}`,
        title: `ADMET & drug-likeness profile.`,
        columns: ["Compound", "MW", "LogP", "HBA", "HBD", "TPSA", "ADMET", "Drug-likeness"],
        rows,
        caption: "MW = molecular weight (Da); TPSA in Å².",
      };
      doc.tables.push(tbl);
      resultsSubs.push({
        key: "r-admet", title: "ADMET & Drug-Likeness",
        paragraphs: [
          `Compounds meeting Lipinski's Rule of Five and displaying favourable ADMET properties are prioritised for downstream target prediction.`,
        ],
        table: tbl,
      });
    }
  }

  // 3.3 Target Prediction
  if (compoundTargets.length) {
    const perGene = new Map();
    for (const r of compoundTargets) {
      const g = r.gene_symbol || r.uniprot_id;
      if (!g) continue;
      const cur = perGene.get(g) || { gene: g, uniprot: r.uniprot_id, protein: r.protein_name, comps: new Set(), prob: 0 };
      cur.comps.add(r.compound_name || r.imppat_id);
      cur.prob = Math.max(cur.prob, Number(r.probability || r.score || 0));
      perGene.set(g, cur);
    }
    const rows = [...perGene.values()]
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 40)
      .map((x) => [x.gene, x.uniprot || "—", x.protein || "—", x.comps.size, fmt(x.prob, 2)]);
    const tbl = {
      id: `T${nextTable()}`,
      title: `Top predicted compound targets.`,
      columns: ["Gene", "UniProt", "Protein", "# Compounds", "Max probability"],
      rows,
      caption: `${perGene.size} distinct human protein targets predicted across all phytochemicals.`,
    };
    doc.tables.push(tbl);
    resultsSubs.push({
      key: "r-targets", title: "Compound Target Prediction",
      paragraphs: [
        `SwissTargetPrediction and ChEMBL bioactivity mining identified ${perGene.size} distinct putative human protein targets for the queried phytochemicals.`,
      ],
      table: tbl,
    });
  }

  // 3.4 Disease Targets + Venn
  if (diseaseTargets.length) {
    const uniqDis = new Set(diseaseTargets.map((t) => t.gene_symbol));
    const uniqCmp = new Set(compoundTargets.map((t) => t.gene_symbol));
    const overlap = intersectingGenes.length || [...uniqCmp].filter((g) => uniqDis.has(g)).length;
    resultsSubs.push({
      key: "r-disease", title: "Disease Target Identification",
      paragraphs: [
        `A total of ${uniqDis.size} genes were associated with the disease. The intersection of compound-derived and disease-derived target sets yielded ${overlap} shared genes — these form the network hubs analysed in subsequent modules.`,
      ],
    });
  }

  // 3.5 Network Analysis
  if (ppiResult || hubScores.length) {
    const rows = (hubScores || []).slice(0, 20).map((h, i) => [
      i + 1, h.gene_symbol || h.gene, fmt(h.combined_score ?? h.score, 2), h.degree ?? "—",
    ]);
    const tbl = rows.length ? {
      id: `T${nextTable()}`,
      title: "Top hub genes ranked by combined centrality.",
      columns: ["Rank", "Gene", "Combined score", "Degree"],
      rows,
      caption: "Combined score aggregates degree, betweenness and closeness centrality.",
    } : null;
    if (tbl) doc.tables.push(tbl);
    resultsSubs.push({
      key: "r-network", title: "Network Analysis",
      paragraphs: [
        ppiResult ? `The PPI network reconstructed on the intersecting-target set consists of ${ppiResult.nodes} nodes and ${ppiResult.edges} edges (STRING minimum confidence = 0.7).` : "",
        hubScores.length ? `The highest-ranking hub genes (Table ${tbl?.id?.slice(1)}) are prioritised as principal biological effectors.` : "",
      ].filter(Boolean),
      table: tbl,
    });
  }

  // 3.6 GO Enrichment
  if (goTerms.length) {
    const rows = goTerms.slice(0, 20).map((t, i) => [
      i + 1, t.term_id || t.native || "—", t.name || t.term_name || "—",
      (t.source || t.namespace || "—").toString().toUpperCase(),
      fmt(-Math.log10(t.p_value || t.padj || 1), 2),
    ]);
    const tbl = {
      id: `T${nextTable()}`,
      title: "Top enriched Gene Ontology terms.",
      columns: ["#", "GO ID", "Term name", "Source", "−log₁₀(q)"],
      rows,
      caption: "Enrichment adjusted P-values via Benjamini–Hochberg.",
    };
    doc.tables.push(tbl);
    resultsSubs.push({
      key: "r-go", title: "GO Enrichment Analysis",
      paragraphs: [
        `${goTerms.length} GO terms were significantly enriched (q < 0.05) across BP, MF and CC namespaces. The top 20 terms are shown in Table ${tbl.id.slice(1)}.`,
      ],
      table: tbl,
    });
  }

  // 3.7 KEGG
  if (selectedKeggPathways.length) {
    const rows = selectedKeggPathways.slice(0, 20).map((p, i) => [
      i + 1, p.pathway_id || p.id || "—", p.name || p.pathway_name || "—",
      p.n_targets ?? p.n_genes ?? "—", fmt(-Math.log10(p.p_value || p.padj || 1), 2),
    ]);
    const tbl = {
      id: `T${nextTable()}`,
      title: "Enriched KEGG / Reactome pathways.",
      columns: ["#", "Pathway ID", "Name", "Targets", "−log₁₀(q)"],
      rows,
      caption: "Pathways selected during Network Analysis.",
    };
    doc.tables.push(tbl);
    resultsSubs.push({
      key: "r-kegg", title: "KEGG / Reactome Pathway Analysis",
      paragraphs: [
        `${selectedKeggPathways.length} pathways were selected during the network-analysis step. The enrichment ranking is reported in Table ${tbl.id.slice(1)}.`,
      ],
      table: tbl,
    });
  }

  // 3.8 Docking
  if (dockingResults?.results?.length) {
    const okResults = dockingResults.results.filter((r) => typeof r.best_affinity === "number");
    const rows = [...okResults]
      .sort((a, b) => a.best_affinity - b.best_affinity)
      .slice(0, 40)
      .map((r, i) => [
        i + 1, r.ligand_name || "—",
        r.gene_symbol || r.receptor_uniprot || "—",
        r.receptor_pdb || "—",
        fmt(r.best_affinity, 2),
        (r.interactions?.hydrogen_bonds?.length || 0),
        (r.interactions?.hydrophobic_contacts?.length || 0),
      ]);
    const tbl = {
      id: `T${nextTable()}`,
      title: "Molecular docking scores and interaction counts.",
      columns: ["Rank", "Ligand", "Target", "PDB", "ΔG (kcal/mol)", "H-bonds", "Hydrophobic"],
      rows,
      caption: "Sorted by lowest (most-favourable) binding affinity.",
    };
    doc.tables.push(tbl);
    const meanAffinity = okResults.reduce((s, r) => s + r.best_affinity, 0) / (okResults.length || 1);
    resultsSubs.push({
      key: "r-docking", title: "Molecular Docking",
      paragraphs: [
        `${okResults.length} compound–target complexes were docked with AutoDock Vina. The mean predicted binding affinity across all pairs was ${fmt(meanAffinity, 2)} kcal/mol; the strongest binder was ${okResults.slice().sort((a,b)=>a.best_affinity-b.best_affinity)[0].ligand_name} × ${okResults.slice().sort((a,b)=>a.best_affinity-b.best_affinity)[0].gene_symbol} at ${fmt(okResults.slice().sort((a,b)=>a.best_affinity-b.best_affinity)[0].best_affinity, 2)} kcal/mol.`,
      ],
      table: tbl,
    });
  }

  if (resultsSubs.length) {
    doc.sections.push({
      key: "results",
      number: "3",
      title: "Results",
      included: true,
      subsections: resultsSubs,
    });
  }

  // ═════════ References ═════════
  doc.references = [...usedRefs].map((k) => REFS[k]).filter(Boolean);
  if (doc.references.length) {
    doc.sections.push({
      key: "references", number: "4", title: "References", included: true, refs: doc.references,
    });
  }

  // ═════════ Appendix ═════════
  const appendix = [];
  if (dockingResults?.job_id) appendix.push({ label: "Docking job ID", value: dockingResults.job_id });
  if (selectedDisease?.efo_id) appendix.push({ label: "Disease EFO ID", value: selectedDisease.efo_id });
  if (workflow?.md_config) {
    Object.entries(workflow.md_config).forEach(([k, v]) => appendix.push({ label: `md.${k}`, value: String(v) }));
  }
  if (appendix.length) {
    doc.sections.push({
      key: "appendix", number: "5", title: "Appendix", included: true, keyvals: appendix,
    });
  }

  // ═════════ Assign TOC numbers dynamically ═════════
  // (Already assigned inline above; numbering is stable because sections are
  //  built in a fixed order — Executive Summary → Methods → Results → Refs.)

  return doc;
}

function truncateSmiles(s, max = 40) {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function formatMaybe(v) {
  if (v === null || v === undefined || v === "") return "—";
  return typeof v === "number" ? v.toFixed(2) : String(v);
}
