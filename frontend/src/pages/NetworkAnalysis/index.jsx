// Network Analysis — 5-subsection guided workflow.
// Subsection 1 (Target Intersection Analysis) is fully implemented.
// Subsections 2-5 have gated placeholder scaffolds.

import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import { Checkbox } from "@/components/ui/checkbox";
import { useNetwork } from "@/context/NetworkContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { useSortable, SortableTh } from "@/lib/useSortable";
import { exportCSV, exportXLSX } from "@/lib/exporters";
import { ppiNetwork, keggEnrich, goEnrich } from "@/lib/api";
import { combinedHubScores, HUB_METRICS } from "@/lib/hubScoring";
import { downloadGraph } from "@/lib/graphExporters";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import jsPDF from "jspdf";
import UTIF from "utif";
import CytoscapeComponent from "react-cytoscapejs";
import "@/lib/cytoscapeSetup";
import { useAppliedStyle, mixHex } from "@/context/ChartStyleContext";
import { CustomizeFigureButton } from "@/components/CustomizeFigureButton";
import { GOPanel as NewGOPanel } from "@/components/network/GOPanel";
import { KEGGPanel as NewKEGGPanel } from "@/components/network/KEGGPanel";
import { PCTDPPanel } from "@/components/network/PCTDPPanel";
import { TableToolbar } from "@/components/network/TableToolbar";
import { requireAuth } from "@/context/AuthContext";
import { FigureToolbar } from "@/components/network/FigureToolbar";
import { CyToolbar } from "@/components/network/CyToolbar";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleDot,
  Download,
  FileImage,
  FileText,
  Lock,
  Network,
  Sparkles,
  Waypoints,
  Target,
  Activity,
  Beaker,
  Layers,
} from "lucide-react";

// ── Refactored per-page parts (2026-02-23) ────────────────────────────
import { SUBSECTIONS, SubsectionNav, Stat, DlBtn, PlaceholderPanel } from "./parts/common";
import { IntersectionPanel } from "./parts/IntersectionPanel";
import { PPIPanel } from "./parts/PPIPanel";
import { HubPanel, HubSubgraphNetwork } from "./parts/HubPanel";
import { GOPanel, GOBarChart, GODotPlot, GOChordPlot } from "./parts/GOPanel";
import { KeggPanel, KEGGDotPlot, KEGGLollipopChart, KEGGSankey } from "./parts/KeggPanel";

export default function NetworkAnalysis() {
  const {
    compoundTargets,
    diseaseTargets,
    selectedDisease,
    selectedCompounds,
  } = useNetwork();
  const { markComplete } = useWorkflow();

  const [active, setActive] = useState("intersection");
  const [completed, setCompleted] = useState({}); // { subId: true }
  const [intersectSel, setIntersectSel] = useState({}); // {gene: true}
  const [intersectDone, setIntersectDone] = useState(false);
  const [ppiResult, setPpiResult] = useState(null); // {nodes, edges}
  const [keggResult, setKeggResult] = useState(null);
  const [selectedKeggPathways, setSelectedKeggPathwaysLocal] = useState([]);
  const { setSelectedKeggPathways, setIntersectingGenes, setHubScores, setPpiResult: setCtxPpi, setGoTerms } = useNetwork();

  // Push intersecting genes → context so downstream modules can consume them.
  useEffect(() => {
    const genes = Object.keys(intersectSel).filter((g) => intersectSel[g]);
    setIntersectingGenes(genes);
  }, [intersectSel, setIntersectingGenes]);

  // Push PPI result → context
  useEffect(() => { if (ppiResult) setCtxPpi(ppiResult); }, [ppiResult, setCtxPpi]);

  const hasInputs = compoundTargets.length > 0 && diseaseTargets.length > 0;

  // Compute intersection (auto). Matching key = gene_symbol OR uniprot_id when
  // available — helps when Open Targets and ChEMBL emit different HGNC synonyms
  // for the same protein (issue flagged during E2E automation in iter 16/17).
  const intersection = useMemo(() => {
    if (!hasInputs) return [];
    const cMap = new Map();
    for (const c of compoundTargets) {
      const key = c.gene_symbol;
      if (!key) continue;
      const slot = cMap.get(key) || {
        gene_symbol: key,
        protein_name: c.protein_name,
        uniprot_id: c.uniprot_id,
        compounds: new Set(),
        best_pchembl: null,
        supporting_databases: new Set(),
      };
      if (c.compound_name) slot.compounds.add(c.compound_name);
      if (c.best_pchembl != null && (slot.best_pchembl == null || c.best_pchembl > slot.best_pchembl))
        slot.best_pchembl = c.best_pchembl;
      for (const s of c.supporting_databases || []) slot.supporting_databases.add(s);
      if (!slot.protein_name) slot.protein_name = c.protein_name;
      if (!slot.uniprot_id) slot.uniprot_id = c.uniprot_id;
      cMap.set(key, slot);
    }
    // Build gene-symbol and uniprot-id lookups on the disease side.
    const dSymSet = new Set(diseaseTargets.map((d) => d.gene_symbol).filter(Boolean));
    const dUniMap = new Map();
    for (const d of diseaseTargets) {
      if (d.uniprot_id) dUniMap.set(d.uniprot_id, d);
    }
    const out = [];
    for (const [gene, slot] of cMap.entries()) {
      let d = null;
      if (dSymSet.has(gene)) {
        d = diseaseTargets.find((x) => x.gene_symbol === gene) || {};
      } else if (slot.uniprot_id && dUniMap.has(slot.uniprot_id)) {
        d = dUniMap.get(slot.uniprot_id);
      }
      if (d) {
        out.push({
          gene_symbol: gene,
          protein_name: slot.protein_name || d.protein_name,
          uniprot_id: slot.uniprot_id || d.uniprot_id,
          supporting_compounds: [...slot.compounds].join(", "),
          n_compounds: slot.compounds.size,
          best_pchembl: slot.best_pchembl,
          association_score: d.association_score,
          disease_evidence: d.evidence_level,
          supporting_databases: [...slot.supporting_databases].join(", "),
          experimental_evidence: slot.best_pchembl != null,
        });
      }
    }
    return out.sort((a, b) => (b.association_score || 0) - (a.association_score || 0));
  }, [compoundTargets, diseaseTargets, hasInputs]);

  // Auto-select all shared targets by default when data arrives.
  useEffect(() => {
    if (intersection.length > 0 && Object.keys(intersectSel).length === 0) {
      const m = {};
      intersection.forEach((r) => (m[r.gene_symbol] = true));
      setIntersectSel(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intersection.length]);

  useEffect(() => {
    if (intersectDone) {
      markComplete("target-prediction");
      markComplete("disease-target-identification");
    }
  }, [intersectDone, markComplete]);

  const canNavigate = (id) => {
    const idx = SUBSECTIONS.findIndex((s) => s.id === id);
    if (idx === 0) return true;
    return completed[SUBSECTIONS[idx - 1].id] === true;
  };

  if (!hasInputs) {
    return (
      <WorkflowLayout>
        <main
          data-testid="network-empty"
          className="mx-auto max-w-3xl px-6 pb-24 pt-14 text-center"
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
            <Network className="h-6 w-6" />
          </div>
          <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-[#0B0B18]">
            Network Analysis
          </h1>
          <p className="mt-3 text-[#64748B]">
            Complete Compound Target Identification and Disease Target
            Identification first — this module receives both tables
            automatically.
          </p>
          <Link
            to="/target-prediction"
            data-testid="back-to-target"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white hover:bg-[#4127c9]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go to Target Prediction
          </Link>
        </main>
      </WorkflowLayout>
    );
  }

  return (
    <WorkflowLayout>
      <main
        data-testid="network-analysis-page"
        className="mx-auto max-w-7xl px-6 pb-24 pt-14"
      >
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Module · 05
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
          Network Analysis
        </h1>
        <p className="mt-3 max-w-2xl text-[#64748B]">
          {selectedCompounds.length} compound
          {selectedCompounds.length === 1 ? "" : "s"} ·{" "}
          {compoundTargets.length} compound targets ·{" "}
          {diseaseTargets.length} disease targets
          {selectedDisease?.name ? ` · ${selectedDisease.name}` : ""}
        </p>

        {/* Two-column: subsection nav + panel */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          <SubsectionNav
            active={active}
            setActive={setActive}
            completed={completed}
            canNavigate={canNavigate}
          />
          <div>
            {active === "intersection" && (
              <IntersectionPanel
                compoundTargets={compoundTargets}
                diseaseTargets={diseaseTargets}
                intersection={intersection}
                intersectSel={intersectSel}
                setIntersectSel={setIntersectSel}
                selectedDisease={selectedDisease}
                selectedCompounds={selectedCompounds}
                onComplete={() => {
                  setCompleted((c) => ({ ...c, intersection: true }));
                  setIntersectDone(true);
                  setActive("ppi");
                }}
              />
            )}
            {active === "ppi" && (
              <PPIPanel
                genes={Object.keys(intersectSel).filter((g) => intersectSel[g])}
                ppiResult={ppiResult}
                setPpiResult={setPpiResult}
                onComplete={() => {
                  setCompleted((c) => ({ ...c, ppi: true }));
                  setActive("hubs");
                }}
              />
            )}
            {active === "hubs" && (
              <HubPanel
                ppiResult={ppiResult}
                onComplete={() => {
                  setCompleted((c) => ({ ...c, hubs: true }));
                  setActive("go");
                }}
              />
            )}
            {active === "go" && (
              <NewGOPanel
                genes={
                  ppiResult?.nodes?.map((n) => n.id) ||
                  Object.keys(intersectSel).filter((g) => intersectSel[g])
                }
                onResultChange={(terms) => setGoTerms(terms || [])}
                onComplete={() => {
                  setCompleted((c) => ({ ...c, go: true }));
                  setActive("kegg");
                }}
              />
            )}
            {active === "kegg" && (
              <NewKEGGPanel
                genes={
                  ppiResult?.nodes?.map((n) => n.id) ||
                  Object.keys(intersectSel).filter((g) => intersectSel[g])
                }
                onPathwaysUpdate={(pathways) => {
                  setSelectedKeggPathwaysLocal(pathways);
                  setSelectedKeggPathways(pathways);
                }}
                onComplete={() => {
                  setCompleted((c) => ({ ...c, kegg: true }));
                  setActive("pctdp");
                }}
              />
            )}
            {active === "pctdp" && (
              <PCTDPPanel
                intersectingGenes={Object.keys(intersectSel).filter((g) => intersectSel[g])}
                selectedKeggPathways={selectedKeggPathways}
                onComplete={() => setCompleted((c) => ({ ...c, pctdp: true }))}
              />
            )}
          </div>
        </div>
      </main>
    </WorkflowLayout>
  );
}

// ─────────────────────── Sub-section navigation ──────────────────────
