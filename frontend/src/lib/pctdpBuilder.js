// Build the Plant → Compound → Target → Pathway → Disease hierarchical graph.
//
// STRICT biological rules (v2):
//   • Plant → Compound            iff the compound is listed under `selectedCompounds`
//   • Compound → Target           iff a `compoundTargets` row links THAT compound to THAT gene
//   • Target → Pathway            iff the pathway's overlap_genes contains THAT gene
//   • Pathway → Disease           iff the pathway is selected AND a disease is set
//
// The old "Disease → Target (direct)" edge is REMOVED — disease connects to
// targets only through pathways, matching the correct biological flow.
//
// `expanded` (optional Set<string>) controls progressive expansion. When set,
// only nodes whose parent (or self) is in `expanded` are included. Set to
// `null` to return the full graph.

const PALETTE = {
  plant:    "#10B981",       // emerald
  compound: "#2563EB",       // blue
  target:   "#F59E0B",       // orange (target genes / proteins)
  pathway:  "#8139ED",       // purple (KEGG pathway)
  disease:  "#DC2626",       // red
};
const SHAPE = {
  plant:    "hexagon",
  compound: "ellipse",
  target:   "round-rectangle",
  pathway:  "diamond",
  disease:  "octagon",
};

const nid = (type, raw) => `${type}::${String(raw).trim().replace(/\s+/g, "_")}`;
const norm = (s) => (s || "").toString().trim().toUpperCase();

export function buildPCTDPGraph({
  plantName,
  selectedCompounds = [],
  compoundTargets = [],
  diseaseTargets = [],
  diseaseName = "",
  intersectingGenes = [],
  keggPathways = [],
  include = { plant: true, compound: true, target: true, pathway: true, disease: true },
  expanded = null,        // Set<string> of node ids to expand; null = full graph
} = {}) {
  const nodes = new Map();
  const edges = new Map();
  const isExp = (id) => expanded == null || expanded.has(id);
  const addNode = (id, data) => { if (!nodes.has(id)) nodes.set(id, { id, ...data }); };
  const addEdge = (source, target, rel) => {
    if (!source || !target || !nodes.has(source) || !nodes.has(target)) return;
    const id = `${source}||${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target, relationship: rel });
  };

  const intersectSet = new Set(intersectingGenes.map(norm));

  // ═══ 1) Plant ═══════════════════════════════════════════════════════════
  let plantId = null;
  if (include.plant && plantName) {
    plantId = nid("plant", plantName);
    addNode(plantId, { type: "plant", label: plantName, color: PALETTE.plant, shape: SHAPE.plant });
  }

  // ═══ 2) Compounds — only if plant is expanded (or when unrestricted) ════
  const compoundIdByLabel = new Map();     // normalized compound name → nid
  const compoundIdByImppat = new Map();
  const showCompounds = include.compound && (!plantId || isExp(plantId));
  if (showCompounds) {
    for (const c of selectedCompounds || []) {
      const label = c.compound_name || c.name || c.imppat_id || c.pubchem_cid || "Compound";
      const cid = nid("compound", c.imppat_id || c.pubchem_cid || label);
      addNode(cid, {
        type: "compound",
        label,
        color: PALETTE.compound, shape: SHAPE.compound,
        imppat_id: c.imppat_id, pubchem_cid: c.pubchem_cid,
        smiles: c.smiles, mw: c.mw, logp: c.logp, drug_likeness: c.drug_likeness,
      });
      compoundIdByLabel.set(norm(label), cid);
      if (c.imppat_id)   compoundIdByImppat.set(norm(c.imppat_id), cid);
      if (plantId) addEdge(plantId, cid, "contains");
    }
  }

  // ═══ 3) Targets — only linked to compounds that are expanded ════════════
  const targetIdByGene = new Map();
  if (include.target) {
    for (const row of compoundTargets || []) {
      const gene = norm(row.gene_symbol || row.target || row.symbol);
      if (!gene) continue;
      // Resolve which compound this row belongs to
      const compKey = norm(row.compound_name) ||
                      norm(row.compound) ||
                      norm(row.imppat_id) ||
                      norm(row.compound_id);
      const cid = compoundIdByLabel.get(compKey) || compoundIdByImppat.get(compKey);
      if (!cid) continue;                    // compound not in the selection — skip
      if (expanded != null && !expanded.has(cid)) continue;  // parent not expanded

      const tid = nid("target", gene);
      if (!targetIdByGene.has(gene)) {
        addNode(tid, {
          type: "target",
          label: gene,
          color: intersectSet.has(gene) ? "#0EA5E9" : PALETTE.target,
          shape: SHAPE.target,
          uniprot: row.uniprot_id,
          protein_name: row.protein_name,
          intersecting: intersectSet.has(gene),
        });
        targetIdByGene.set(gene, tid);
      }
      addEdge(cid, tid, "targets");
    }
  }

  // ═══ 4) Pathways — only for expanded targets ════════════════════════════
  const pathwayIdByTerm = new Map();
  if (include.pathway) {
    for (const p of keggPathways || []) {
      const term = p.term || p.name;
      if (!term) continue;
      const pid = nid("pathway", term);
      const genes = (p.overlap_genes || p.genes || []).map(norm);

      // At least one of this pathway's target-genes must exist AND (when
      // expansion is active) be expanded, otherwise skip the pathway.
      const eligibleTargets = genes.filter((g) => targetIdByGene.has(g)
        && (expanded == null || expanded.has(targetIdByGene.get(g))));
      if (!eligibleTargets.length) continue;

      addNode(pid, {
        type: "pathway",
        label: term.length > 40 ? term.slice(0, 38) + "…" : term,
        fullLabel: term,
        color: PALETTE.pathway, shape: SHAPE.pathway,
        p_value: p.p_value, adj_p_value: p.adj_p_value,
        gene_count: p.gene_count ?? eligibleTargets.length,
        overlap_genes: eligibleTargets,
      });
      pathwayIdByTerm.set(term, pid);
      for (const g of eligibleTargets) addEdge(targetIdByGene.get(g), pid, "part_of");
    }
  }

  // ═══ 5) Disease — only when pathways link to it via expansion ═══════════
  let diseaseId = null;
  if (include.disease && diseaseName && pathwayIdByTerm.size > 0) {
    diseaseId = nid("disease", diseaseName);
    addNode(diseaseId, {
      type: "disease",
      label: diseaseName,
      color: PALETTE.disease, shape: SHAPE.disease,
      db_ids: (diseaseTargets && diseaseTargets[0]?.disease_id) || null,
      n_pathways: pathwayIdByTerm.size,
    });
    for (const pid of pathwayIdByTerm.values()) {
      if (expanded == null || expanded.has(pid)) addEdge(pid, diseaseId, "involved_in");
    }
  }

  // Degree annotation for downstream ranking / centrality.
  const deg = new Map();
  for (const e of edges.values()) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1);
    deg.set(e.target, (deg.get(e.target) || 0) + 1);
  }
  return {
    nodes: [...nodes.values()].map((n) => ({ ...n, degree: deg.get(n.id) || 0 })),
    edges: [...edges.values()],
  };
}

// Palette / shape maps re-exported for consumers that render legends.
export const PCTDP_PALETTE = PALETTE;
export const PCTDP_SHAPES = SHAPE;
