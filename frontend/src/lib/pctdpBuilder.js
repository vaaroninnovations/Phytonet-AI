// Build the Plant→Compound→Target→Disease→KEGG-Pathway graph from
// NetworkContext + local intersection/KEGG selections.
// De-duplicates nodes and edges and produces unique IDs.

const PALETTE = {
  plant: "#10B981",     // emerald
  compound: "#8139ED",  // violet
  target: "#5139ED",    // indigo
  disease: "#EF4444",   // red
  pathway: "#F59E0B",   // amber
};

const SHAPE = {
  plant: "round-rectangle",
  compound: "ellipse",
  target: "diamond",
  disease: "hexagon",
  pathway: "round-rectangle",
};

const nid = (type, raw) => `${type}::${String(raw).trim().replace(/\s+/g, "_")}`;

export function buildPCTDPGraph({
  plantName,
  selectedCompounds = [],
  compoundTargets = [],   // rows from Target Prediction (compound → targets)
  diseaseTargets = [],    // rows from Disease Target ID
  diseaseName = "",
  intersectingGenes = [], // strings — the final intersecting set from Step 5.1
  keggPathways = [],      // objects from KEGG results (must contain term & overlap_genes)
  include = { plant: true, compound: true, target: true, disease: true, pathway: true },
}) {
  const nodes = new Map();
  const edges = new Map();
  const addNode = (id, data) => {
    if (!nodes.has(id)) nodes.set(id, { id, ...data });
  };
  const addEdge = (source, target, rel, confidence = 1) => {
    if (!source || !target) return;
    const id = `${source}||${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target, relationship: rel, confidence });
  };

  const intersectSet = new Set((intersectingGenes || []).map((g) => g.toUpperCase()));

  // Plant node
  let plantNodeId = null;
  if (include.plant && plantName) {
    plantNodeId = nid("plant", plantName);
    addNode(plantNodeId, {
      type: "plant",
      label: plantName,
      color: PALETTE.plant,
      shape: SHAPE.plant,
    });
  }

  // Compound nodes
  const compoundIds = [];
  if (include.compound) {
    for (const c of selectedCompounds || []) {
      const label = c.compound_name || c.compound || c.name || c.imppat_id || c.id || "Compound";
      const cid = nid("compound", c.imppat_id || c.pubchem_cid || label);
      addNode(cid, {
        type: "compound",
        label,
        color: PALETTE.compound,
        shape: SHAPE.compound,
        imppat_id: c.imppat_id,
        pubchem_cid: c.pubchem_cid,
      });
      compoundIds.push(cid);
      if (plantNodeId) addEdge(plantNodeId, cid, "contains", 1);
    }
  }
  const compoundIdSet = new Set(compoundIds);

  // Target nodes + Compound-Target edges
  const compoundTargetGenes = new Set();
  if (include.target) {
    for (const row of compoundTargets || []) {
      const gene = (row.gene_symbol || row.target || row.symbol || "").toUpperCase();
      if (!gene) continue;
      compoundTargetGenes.add(gene);
      const tid = nid("target", gene);
      const isIntersecting = intersectSet.has(gene);
      addNode(tid, {
        type: "target",
        label: gene,
        color: isIntersecting ? "#0EA5E9" : PALETTE.target,
        shape: SHAPE.target,
        uniprot: row.uniprot_id,
        intersecting: isIntersecting,
      });
      // Edge from compound (if we know which one, we could link; if row has compound_id use it)
      const cRef = row.compound_id || row.imppat_id;
      if (cRef && include.compound) {
        const candidate = compoundIds.find((cid) => cid.includes(String(cRef)));
        if (candidate) addEdge(candidate, tid, "targets", row.confidence_score || row.score || 0.7);
      } else if (include.compound && compoundIds.length) {
        // Fall back to first compound if no linkage info
        addEdge(compoundIds[0], tid, "targets", row.confidence_score || 0.5);
      }
    }
  }

  // Disease node
  let diseaseNodeId = null;
  if (include.disease && diseaseName) {
    diseaseNodeId = nid("disease", diseaseName);
    addNode(diseaseNodeId, {
      type: "disease",
      label: diseaseName,
      color: PALETTE.disease,
      shape: SHAPE.disease,
    });
  }
  // Disease-Target edges (only for disease targets that also appear in the graph)
  if (include.target && include.disease && diseaseNodeId) {
    for (const row of diseaseTargets || []) {
      const gene = (row.gene_symbol || row.target || row.symbol || "").toUpperCase();
      if (!gene) continue;
      const tid = nid("target", gene);
      if (!nodes.has(tid)) {
        const isIntersecting = intersectSet.has(gene);
        addNode(tid, {
          type: "target",
          label: gene,
          color: isIntersecting ? "#0EA5E9" : PALETTE.target,
          shape: SHAPE.target,
          uniprot: row.uniprot_id,
          intersecting: isIntersecting,
        });
      }
      addEdge(tid, diseaseNodeId, "associated_with", row.association_score || row.score || 0.6);
    }
  }

  // Pathway nodes + Target-Pathway edges + Disease-Pathway edges
  if (include.pathway) {
    for (const p of keggPathways || []) {
      const term = p.term || p.name || "";
      if (!term) continue;
      const pid = nid("pathway", term);
      addNode(pid, {
        type: "pathway",
        label: term.length > 40 ? term.slice(0, 38) + "…" : term,
        fullLabel: term,
        color: PALETTE.pathway,
        shape: SHAPE.pathway,
        p_value: p.p_value,
      });
      const genes = (p.overlap_genes || p.genes || []).map((g) => String(g).toUpperCase());
      for (const g of genes) {
        const tid = nid("target", g);
        if (nodes.has(tid)) addEdge(tid, pid, "part_of", 1);
      }
      if (diseaseNodeId) addEdge(diseaseNodeId, pid, "disease_pathway", 0.5);
    }
  }

  // Degree annotation
  const degMap = new Map();
  for (const e of edges.values()) {
    degMap.set(e.source, (degMap.get(e.source) || 0) + 1);
    degMap.set(e.target, (degMap.get(e.target) || 0) + 1);
  }
  const finalNodes = [];
  for (const n of nodes.values()) {
    finalNodes.push({ ...n, degree: degMap.get(n.id) || 0 });
  }

  return { nodes: finalNodes, edges: [...edges.values()] };
}
