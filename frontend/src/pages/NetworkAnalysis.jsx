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
import { useAppliedStyle } from "@/context/ChartStyleContext";
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

const SUBSECTIONS = [
  { id: "intersection", label: "Target Intersection Analysis", icon: Target },
  { id: "ppi", label: "Protein–Protein Interaction", icon: Network },
  { id: "hubs", label: "Hub Gene Analysis", icon: Waypoints },
  { id: "go", label: "GO Enrichment", icon: Layers },
  { id: "kegg", label: "KEGG Pathway Enrichment", icon: Activity },
  { id: "pctdp", label: "PCTDP Integrative Network", icon: Sparkles },
];

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
function SubsectionNav({ active, setActive, completed, canNavigate }) {
  return (
    <aside
      data-testid="network-subsection-nav"
      className="h-fit rounded-3xl border border-[#E7E7F3] bg-white p-4"
    >
      <p className="px-2 font-heading text-[10px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Network workflow
      </p>
      <ul className="mt-3 space-y-1">
        {SUBSECTIONS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = active === s.id;
          const isDone = completed[s.id];
          const isEnabled = canNavigate(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                data-testid={`subnav-${s.id}`}
                disabled={!isEnabled}
                onClick={() => isEnabled && setActive(s.id)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#5139ED]/10 font-heading font-bold text-[#5139ED]"
                    : isEnabled
                    ? "text-[#0B0B18] hover:bg-[#FAFAFF]"
                    : "cursor-not-allowed text-[#B4B4CD]"
                }`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-lg ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                      ? "bg-[#5139ED] text-white"
                      : "bg-[#F1F1FA] text-[#8139ED]"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : !isEnabled ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
                    Step {idx + 1}
                  </span>
                  <span>{s.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ─────────────────────── Intersection Panel ──────────────────────
function IntersectionPanel({
  compoundTargets,
  diseaseTargets,
  intersection,
  intersectSel,
  setIntersectSel,
  selectedDisease,
  selectedCompounds,
  onComplete,
}) {
  const nCompound = new Set(compoundTargets.map((r) => r.gene_symbol).filter(Boolean)).size;
  const nDisease = new Set(diseaseTargets.map((r) => r.gene_symbol).filter(Boolean)).size;
  const nCommon = intersection.length;

  const plantLabel = useMemo(() => {
    const names = new Set(compoundTargets.map((r) => r.compound_name).filter(Boolean));
    if (names.size === 0) return "Compound Targets";
    if (names.size === 1) return [...names][0];
    return `${names.size} compound${names.size === 1 ? "" : "s"}`;
  }, [compoundTargets]);
  const diseaseLabel = selectedDisease?.name || "Disease Targets";

  const svgRef = useRef(null);

  const toggle = (r) =>
    setIntersectSel((s) => {
      const k = r.gene_symbol;
      if (s[k]) {
        const { [k]: _, ...rest } = s;
        return rest;
      }
      return { ...s, [k]: true };
    });

  const accessors = useMemo(
    () => ({
      gene_symbol: (r) => r.gene_symbol,
      protein_name: (r) => r.protein_name,
      uniprot_id: (r) => r.uniprot_id,
      n_compounds: (r) => r.n_compounds,
      association_score: (r) => r.association_score,
      supporting_compounds: (r) => r.supporting_compounds,
      experimental_evidence: (r) => (r.experimental_evidence ? 1 : 0),
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(
    intersection,
    accessors
  );

  const selectedCount = Object.keys(intersectSel).filter((k) => intersectSel[k]).length;

  const downloadSvg = () => requireAuth(() => {
    if (!svgRef.current) return;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, `venn_${diseaseLabel.replace(/\s+/g, "_")}.svg`);
  });
  const downloadPng = async (dpi = 300) => requireAuth(() => rasterize(dpi, "png"));
  const downloadTiff = async (dpi = 300) => requireAuth(() => rasterize(dpi, "tiff"));
  const downloadPdf = async () => requireAuth(() => {
    if (!svgRef.current) return;
    const scale = 300 / 96;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    const img = new Image();
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 600 * scale;
      c.height = 400 * scale;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const iw = pw - 60;
      const ih = (iw * c.height) / c.width;
      pdf.addImage(c.toDataURL("image/png"), "PNG", 30, (ph - ih) / 2, iw, ih);
      pdf.save(`venn_${diseaseLabel.replace(/\s+/g, "_")}.pdf`);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
  const rasterize = async (dpi, kind) => {
    if (!svgRef.current) return;
    const scale = dpi / 96;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    const img = new Image();
    const svgBlob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 600 * scale;
      c.height = 400 * scale;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      if (kind === "png") {
        c.toBlob((b) => {
          if (b) saveAs(b, `venn_${dpi}dpi.png`);
          URL.revokeObjectURL(url);
        }, "image/png");
      } else {
        // TIFF via UTIF — encode raw RGBA pixels.
        const imgData = ctx.getImageData(0, 0, c.width, c.height);
        const tiff = UTIF.encodeImage(imgData.data.buffer, c.width, c.height);
        saveAs(new Blob([tiff], { type: "image/tiff" }), `venn_${dpi}dpi.tif`);
        URL.revokeObjectURL(url);
      }
    };
    img.src = url;
  };

  const exportRows = () => {
    const list = sortedRows.filter((r) => intersectSel[r.gene_symbol]);
    if (list.length === 0) return toast.error("Select intersecting targets to export");
    const flat = list.map((r) => ({
      "Gene Symbol": r.gene_symbol,
      "Protein Name": r.protein_name || "",
      "UniProt ID": r.uniprot_id || "",
      "Supporting Compounds": r.supporting_compounds || "",
      "N Compounds": r.n_compounds || 0,
      "Best pChEMBL": r.best_pchembl || "",
      "Disease Association Score": r.association_score || "",
      "Disease Evidence Level": r.disease_evidence || "",
      "Supporting Databases": r.supporting_databases || "",
      "Experimental Evidence": r.experimental_evidence ? "Yes" : "No",
      "Selection Status": "Selected",
    }));
    return flat;
  };
  const doExport = (fn, filename) => {
    const flat = exportRows();
    if (!flat) return;
    const fields = Object.keys(flat[0]).map((k) => ({ key: k, label: k }));
    fn(flat, fields, filename);
  };

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label={plantLabel} value={nCompound} testid="stat-compound-targets" />
        <Stat label={diseaseLabel} value={nDisease} testid="stat-disease-targets" />
        <Stat
          label="Common Targets"
          value={nCommon}
          testid="stat-common-targets"
          emphasis
        />
      </div>

      {/* Venn diagram card */}
      <div
        data-testid="intersection-venn-card"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Target className="mr-1 inline h-3.5 w-3.5" />
              Target Intersection
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              Compound × Disease Venn
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Publication-quality SVG · scalable to 300 / 600 dpi PNG · TIFF via
              conversion from the SVG source
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DlBtn onClick={downloadSvg} testid="download-svg" label="SVG" />
            <DlBtn onClick={() => downloadPng(300)} testid="download-png-300" label="PNG 300 dpi" />
            <DlBtn onClick={() => downloadPng(600)} testid="download-png-600" label="PNG 600 dpi" />
            <DlBtn onClick={() => downloadTiff(300)} testid="download-tiff-300" label="TIFF 300 dpi" />
            <DlBtn onClick={() => downloadTiff(600)} testid="download-tiff-600" label="TIFF 600 dpi" />
            <DlBtn onClick={downloadPdf} testid="download-pdf" label="PDF" icon={<FileText className="h-3.5 w-3.5" />} />
          </div>
        </div>
        <div className="mt-5 flex justify-center">
          <VennSVG
            ref={svgRef}
            n1={nCompound}
            n2={nDisease}
            nCommon={nCommon}
            label1={plantLabel}
            label2={diseaseLabel}
          />
        </div>
      </div>

      {/* Intersecting table */}
      <div
        data-testid="intersection-table-card"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Intersecting Targets
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span
                data-testid="intersection-row-count"
                className="font-display text-xl font-bold text-[#0B0B18]"
              >
                {nCommon}
              </span>
              <span className="text-xs text-[#64748B]">
                {selectedCount} selected
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TableToolbar
              rows={sortedRows}
              columns={[
                { key: "gene_symbol", label: "Gene" },
                { key: "protein_name", label: "Protein" },
                { key: "uniprot_id", label: "UniProt" },
                { key: "supporting_compounds", label: "Supporting Compounds" },
                { key: "n_compounds", label: "N Compounds" },
                { key: "best_pchembl", label: "Best pChEMBL" },
                { key: "association_score", label: "Assoc. Score" },
                { key: "supporting_databases", label: "Databases" },
              ]}
              basename="intersection_targets"
              testidPrefix="intersection-tbl"
            />
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#F1F1FA]">
          <div className="max-h-[520px] overflow-auto">
            <table
              data-testid="intersection-table"
              className="w-full min-w-[900px] border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    <Checkbox
                      data-testid="intersection-select-all"
                      checked={
                        sortedRows.length > 0 &&
                        sortedRows.every((r) => intersectSel[r.gene_symbol])
                      }
                      onCheckedChange={() => {
                        const all = sortedRows.every((r) => intersectSel[r.gene_symbol]);
                        if (all) setIntersectSel({});
                        else {
                          const m = {};
                          sortedRows.forEach((r) => (m[r.gene_symbol] = true));
                          setIntersectSel(m);
                        }
                      }}
                      className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                    />
                  </th>
                  <SortableTh id="gene_symbol" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Gene</SortableTh>
                  <SortableTh id="protein_name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Protein</SortableTh>
                  <SortableTh id="uniprot_id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>UniProt</SortableTh>
                  <SortableTh id="supporting_compounds" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Supporting Compounds</SortableTh>
                  <SortableTh id="n_compounds" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>N Comp.</SortableTh>
                  <SortableTh id="association_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Assoc.</SortableTh>
                  <SortableTh id="experimental_evidence" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Evidence</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#64748B]">
                      No overlap between compound and disease targets.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => {
                    const isSel = !!intersectSel[r.gene_symbol];
                    return (
                      <tr
                        key={r.gene_symbol}
                        data-testid={`intersection-row-${r.gene_symbol}`}
                        className={`border-b border-[#F1F1FA] ${
                          isSel ? "bg-[#5139ED]/[0.04]" : "hover:bg-[#F8F8FE]"
                        }`}
                      >
                        <td className="px-3 py-3">
                          <Checkbox
                            data-testid={`intersection-row-check-${r.gene_symbol}`}
                            checked={isSel}
                            onCheckedChange={() => toggle(r)}
                            className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
                          />
                        </td>
                        <td className="px-3 py-3 font-mono text-[12px] font-bold text-[#5139ED]">
                          {r.gene_symbol}
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[#0B0B18]">
                          {r.protein_name || "—"}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                          {r.uniprot_id ? (
                            <a
                              href={`https://www.uniprot.org/uniprotkb/${r.uniprot_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-dotted underline-offset-2 hover:text-[#5139ED]"
                            >
                              {r.uniprot_id}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td
                          className="max-w-[240px] truncate px-3 py-3 text-[11px] text-[#0B0B18]"
                          title={r.supporting_compounds}
                        >
                          {r.supporting_compounds || "—"}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-[11px] text-[#0B0B18]">
                          {r.n_compounds}
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                          {(r.association_score || 0).toFixed(3)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                              r.experimental_evidence
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]"
                            }`}
                          >
                            {r.experimental_evidence
                              ? `Exp · pChEMBL ${(r.best_pchembl || 0).toFixed(1)}`
                              : "Predicted"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Next button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/disease-target-identification"
          className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Disease Targets
        </Link>
        <button
          data-testid="intersection-complete"
          type="button"
          onClick={() => {
            if (selectedCount === 0)
              return toast.error("Select at least one shared target to continue");
            toast.success(
              `${selectedCount} intersecting target${selectedCount === 1 ? "" : "s"} carried into PPI`
            );
            onComplete();
          }}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
        >
          Next — Protein–Protein Interaction
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────── Small helpers ──────────────────────
function Stat({ label, value, testid, emphasis }) {
  return (
    <div
      data-testid={testid}
      className={`rounded-3xl border p-4 ${
        emphasis
          ? "border-[#5139ED]/30 bg-gradient-to-br from-[#5139ED]/8 via-[#395AED]/8 to-[#8139ED]/8"
          : "border-[#E7E7F3] bg-white"
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-[#0B0B18]">
        {value}
      </div>
    </div>
  );
}

function DlBtn({ onClick, testid, label, icon }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
    >
      {icon || <FileImage className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function PlaceholderPanel({ icon, title, description, gene_count, onComplete }) {
  return (
    <div
      data-testid={`placeholder-${title.toLowerCase().replace(/\W+/g, "-")}`}
      className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center"
    >
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold text-[#0B0B18]">{title}</h2>
      {gene_count != null && (
        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#5139ED]/8 px-3 py-1 text-xs font-semibold text-[#5139ED]">
          <CircleDot className="h-3 w-3" />
          {gene_count} genes carried from previous step
        </p>
      )}
      <p className="mx-auto mt-3 max-w-xl text-sm text-[#64748B]">{description}</p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
        <Sparkles className="h-3 w-3" />
        Coming in the next iteration — data pipeline already tied to previous step
      </p>
      {onComplete && (
        <div className="mt-6">
          <button
            data-testid="skip-to-next"
            type="button"
            onClick={onComplete}
            className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-xs font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            Skip to next section
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────── PPI Panel ─────────────────────
function PPIPanel({ genes, ppiResult, setPpiResult, onComplete }) {
  const [requiredScore, setRequiredScore] = useState(400);
  const [networkType, setNetworkType] = useState("functional");
  const [addNodes, setAddNodes] = useState(0);
  const [removeIsolated, setRemoveIsolated] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ppiLayout, setPpiLayout] = useState("fcose");
  const ppiCardRef = useRef(null);
  const ppiCyRef = useRef(null);

  const runPPI = async () => {
    if (!genes || genes.length === 0)
      return toast.error("No intersecting genes selected");
    setLoading(true);
    try {
      const res = await ppiNetwork({
        genes,
        species: 9606,
        required_score: requiredScore,
        network_type: networkType,
        add_nodes: addNodes,
      });
      setPpiResult(res);
      toast.success(
        `STRING returned ${res.nodes.length} nodes, ${res.edges.length} interactions`
      );
    } catch (e) {
      toast.error("STRING query failed");
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on mount if we have genes and no result yet.
  useEffect(() => {
    if (genes.length > 0 && !ppiResult) runPPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredResult = useMemo(() => {
    if (!ppiResult) return null;
    if (!removeIsolated) return ppiResult;
    const connected = new Set();
    for (const e of ppiResult.edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    return {
      nodes: ppiResult.nodes.filter((n) => connected.has(n.id)),
      edges: ppiResult.edges,
    };
  }, [ppiResult, removeIsolated]);

  const elements = useMemo(() => {
    if (!filteredResult) return [];
    return [
      ...filteredResult.nodes.map((n) => ({
        data: { id: n.id, label: n.id },
      })),
      ...filteredResult.edges.map((e, i) => ({
        data: {
          id: `e${i}`,
          source: e.source,
          target: e.target,
          weight: e.score,
        },
      })),
    ];
  }, [filteredResult]);

  const stylesheet = [
    {
      selector: "node",
      style: {
        "background-color": "#5139ED",
        label: "data(label)",
        color: "#0B0B18",
        "font-size": 10,
        "font-family": "Inter, sans-serif",
        "font-weight": 700,
        "text-outline-color": "#fff",
        "text-outline-width": 2,
        width: 22,
        height: 22,
      },
    },
    {
      selector: "edge",
      style: {
        "line-color": "#8139ED",
        opacity: 0.4,
        width: "mapData(weight, 0.4, 1, 1, 4)",
        "curve-style": "haystack",
      },
    },
    {
      selector: ":selected",
      style: { "background-color": "#f5b301", "line-color": "#f5b301" },
    },
  ];

  const exportEdges = () => {
    if (!filteredResult) return;
    const flat = filteredResult.edges.map((e) => ({
      Source: e.source,
      Target: e.target,
      Score: e.score,
      ...e.channels,
    }));
    const fields = Object.keys(flat[0] || { Source: 0 }).map((k) => ({ key: k, label: k }));
    exportCSV(flat, fields, "ppi_edges.csv");
  };

  const exportGraph = (kind) => {
    if (!filteredResult) return;
    downloadGraph(kind, filteredResult, "ppi_network");
    toast.success(`PPI network exported as ${kind.toUpperCase()}`);
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="ppi-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Network className="mr-1 inline h-3.5 w-3.5" />
              STRING PPI · Homo sapiens
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes.length} intersecting proteins → interaction network
            </h2>
          </div>
          <button
            data-testid="ppi-run"
            onClick={runPPI}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
          >
            {loading ? "Querying STRING…" : "Re-run"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Min score
            <select
              data-testid="ppi-min-score"
              value={requiredScore}
              onChange={(e) => setRequiredScore(Number(e.target.value))}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            >
              <option value={150}>150 · low</option>
              <option value={400}>400 · medium</option>
              <option value={700}>700 · high</option>
              <option value={900}>900 · highest</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            Network type
            <select
              data-testid="ppi-net-type"
              value={networkType}
              onChange={(e) => setNetworkType(e.target.value)}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            >
              <option value="functional">Functional</option>
              <option value="physical">Physical</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
            First-shell (+n)
            <input
              data-testid="ppi-add-nodes"
              type="number"
              min={0}
              max={50}
              value={addNodes}
              onChange={(e) => setAddNodes(Number(e.target.value))}
              className="brand-focus rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-xs text-[#0B0B18]">
            <Checkbox
              data-testid="ppi-remove-isolated"
              checked={removeIsolated}
              onCheckedChange={(v) => setRemoveIsolated(!!v)}
              className="h-4 w-4 border-[#5139ED] data-[state=checked]:bg-[#5139ED] data-[state=checked]:text-white"
            />
            Remove isolated
          </label>
        </div>
      </div>

      {filteredResult && (
        <>
          <div
            ref={ppiCardRef}
            data-testid="ppi-network"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                Interaction network · {filteredResult.nodes.length} nodes ·{" "}
                {filteredResult.edges.length} edges
              </p>
              <div data-testid="ppi-exports" className="flex flex-wrap items-center gap-2">
                <TableToolbar
                  rows={filteredResult.edges.map((e) => ({
                    source: e.source, target: e.target, score: e.score, ...(e.channels || {}),
                  }))}
                  columns={[
                    { key: "source", label: "Source" },
                    { key: "target", label: "Target" },
                    { key: "score", label: "Score" },
                  ]}
                  basename="ppi_edges"
                  testidPrefix="ppi-tbl"
                />
                <CyToolbar
                  getCy={() => ppiCyRef.current}
                  containerRef={ppiCardRef}
                  basename="ppi_network"
                  graph={filteredResult}
                  title={`PPI Network · ${filteredResult.nodes.length} nodes`}
                  layout={ppiLayout}
                  onLayoutChange={setPpiLayout}
                  onResetLayout={() => { const cy = ppiCyRef.current; if (cy) cy.layout({ name: ppiLayout, animate: false, fit: true, padding: 30 }).run(); }}
                  testidPrefix="ppi"
                />
              </div>
            </div>
            <CytoscapeComponent
              key={`ppi-${elements.length}`}
              elements={elements}
              style={{ width: "100%", height: "520px" }}
              layout={{ name: ppiLayout, animate: false, fit: true, padding: 30 }}
              stylesheet={stylesheet}
              cy={(cy) => {
                ppiCyRef.current = cy;
                cy.userZoomingEnabled(true);
                cy.userPanningEnabled(true);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end">
            <button
              data-testid="ppi-complete"
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Next — Hub Gene Analysis
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────── Hub Gene Panel ─────────────────────
function HubPanel({ ppiResult, onComplete }) {
  const [topN, setTopN] = useState(10);
  const [metric, setMetric] = useState("degree");
  const [algoLoading, setAlgoLoading] = useState(false);
  const [scores, setScores] = useState(null);
  const { setHubScores } = useNetwork();

  const runHub = () => {
    if (!ppiResult) return toast.error("Run PPI analysis first");
    setAlgoLoading(true);
    setTimeout(() => {
      try {
        const s = combinedHubScores(ppiResult.nodes, ppiResult.edges);
        setScores(s);
        setHubScores(s);   // publish to context for Docking/Report
      } catch (e) {
        toast.error("Hub scoring failed");
      } finally {
        setAlgoLoading(false);
      }
    }, 30);
  };

  useEffect(() => {
    if (ppiResult && !scores) runHub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppiResult]);

  const ranked = useMemo(() => {
    if (!scores) return [];
    return [...scores].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  }, [scores, metric]);
  const top = ranked.slice(0, topN);

  const accessors = useMemo(() => {
    const a = { id: (r) => r.id };
    for (const m of HUB_METRICS) a[m.key] = (r) => r[m.key] ?? 0;
    return a;
  }, []);
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(top, accessors, {
    key: metric,
    dir: "desc",
  });

  const fmt = (v, key) => {
    if (v == null) return "—";
    if (key === "degree" || key === "mnc" || key === "bottleneck") return v.toFixed(0);
    if (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0)) return v.toExponential(2);
    return v.toFixed(3);
  };

  const exportHubs = () => {
    if (!scores) return;
    const flat = ranked.map((r, i) => {
      const row = { Rank: i + 1, Gene: r.id };
      for (const m of HUB_METRICS) row[m.label] = r[m.key] ?? 0;
      return row;
    });
    exportCSV(
      flat,
      Object.keys(flat[0]).map((k) => ({ key: k, label: k })),
      "hub_genes.csv"
    );
  };

  if (!ppiResult) {
    return (
      <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
        Complete PPI analysis first to score hub genes.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div
        data-testid="hub-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Waypoints className="mr-1 inline h-3.5 w-3.5" />
              Hub Gene Analysis
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              CytoHubba-style ranking · 10 algorithms
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Degree · Betweenness (Brandes) · Closeness (Wasserman–Faust) · MCC (Bron–Kerbosch cliques) ·
              MNC · DMNC (ε=1.7) · EPC (Monte-Carlo p=0.5, 100 trials) · Stress · Radiality · Bottleneck (n/4 threshold)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              data-testid="hub-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-xs font-semibold text-[#0B0B18]"
            >
              {HUB_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top&nbsp;
              <input
                data-testid="hub-topn"
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <DlBtn onClick={exportHubs} testid="hub-export-csv" label="CSV" icon={<Download className="h-3.5 w-3.5" />} />
          </div>
        </div>
      </div>

      {algoLoading ? (
        <div data-testid="hub-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Computing 10 centrality algorithms…
        </div>
      ) : (
        <>
        <div data-testid="hub-table-card" className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F1FA] bg-[#FAFAFF] px-3 py-2">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Hub Gene Ranking</p>
            <TableToolbar
              rows={sortedRows.map((r, i) => ({ Rank: i + 1, Gene: r.id, ...Object.fromEntries(HUB_METRICS.map((m) => [m.label, r[m.key] ?? 0])) }))}
              columns={[{ key: "Rank", label: "Rank" }, { key: "Gene", label: "Gene" }, ...HUB_METRICS.map((m) => ({ key: m.label, label: m.label }))]}
              basename="hub_genes"
              testidPrefix="hub-tbl"
            />
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <th className="sticky top-0 z-10 whitespace-nowrap bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    Rank
                  </th>
                  <SortableTh id="id" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Gene</SortableTh>
                  {HUB_METRICS.map((m) => (
                    <SortableTh key={m.key} id={m.key} sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>
                      {m.label}
                    </SortableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r, i) => (
                  <tr
                    key={r.id}
                    data-testid={`hub-row-${r.id}`}
                    className={`border-b border-[#F1F1FA] hover:bg-[#F8F8FE] ${
                      i < 3 ? "bg-[#5139ED]/[0.03]" : ""
                    }`}
                  >
                    <td className="px-3 py-3 text-center font-mono text-[12px] font-bold text-[#5139ED]">
                      #{i + 1}
                    </td>
                    <td className="px-3 py-3 font-mono text-[12px] font-bold text-[#5139ED]">{r.id}</td>
                    {HUB_METRICS.map((m) => (
                      <td
                        key={m.key}
                        className={`px-3 py-3 font-mono text-[11px] ${
                          metric === m.key ? "font-bold text-[#5139ED]" : "text-[#0B0B18]"
                        }`}
                      >
                        {fmt(r[m.key], m.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <HubSubgraphNetwork ppiResult={ppiResult} scores={scores} metric={metric} topN={topN} />
        </>
      )}

      <div className="flex justify-end">
        <button
          data-testid="hub-complete"
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
        >
          Next — GO Enrichment
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Hub subgraph network view — induced subgraph of top-N hub genes.
function HubSubgraphNetwork({ ppiResult, scores, metric, topN }) {
  const [layout, setLayout] = useState("concentric");
  const cardRef = useRef(null);
  const cyRef = useRef(null);
  const subgraph = useMemo(() => {
    if (!ppiResult || !scores) return { nodes: [], edges: [] };
    const ranked = [...scores].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, topN);
    const idSet = new Set(ranked.map((r) => r.id));
    const nodes = ppiResult.nodes.filter((n) => idSet.has(n.id))
      .map((n) => ({ ...n, score: (scores.find((s) => s.id === n.id) || {})[metric] || 0 }));
    const edges = ppiResult.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target));
    return { nodes, edges };
  }, [ppiResult, scores, metric, topN]);

  const elements = useMemo(() => {
    const els = [];
    const maxScore = Math.max(1, ...subgraph.nodes.map((n) => n.score || 0));
    for (const n of subgraph.nodes) {
      els.push({ group: "nodes", data: { id: n.id, label: n.id, score: n.score, scoreNorm: (n.score || 0) / maxScore } });
    }
    for (const e of subgraph.edges) {
      els.push({ group: "edges", data: { source: e.source, target: e.target, weight: e.score || 0.5 } });
    }
    return els;
  }, [subgraph]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    try { cy.layout({ name: layout, animate: false, fit: true, padding: 30, concentric: (n) => n.data("scoreNorm") || 0.1, levelWidth: () => 2, minNodeSpacing: 30 }).run(); } catch (e) {}
  }, [layout, elements]);

  const stylesheet = useMemo(() => [
    { selector: "node", style: {
      "background-color": "mapData(scoreNorm, 0, 1, #B2AFE8, #5139ED)",
      "label": "data(label)", "font-size": 10, "color": "#0B0B18", "text-valign": "center", "text-halign": "center",
      "width": "mapData(scoreNorm, 0, 1, 30, 70)",
      "height": "mapData(scoreNorm, 0, 1, 30, 70)",
      "border-width": 1, "border-color": "#FFFFFF", "shape": "ellipse",
    }},
    { selector: "edge", style: { "width": "mapData(weight, 0, 1, 0.5, 3)", "line-color": "#B2AFE8", "curve-style": "bezier", "opacity": 0.6 } },
  ], []);

  if (subgraph.nodes.length === 0) return null;
  return (
    <div ref={cardRef} data-testid="hub-subgraph-card" className="rounded-3xl border border-[#E7E7F3] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Hub Subgraph · Top {subgraph.nodes.length} by {metric} · {subgraph.edges.length} edges
        </p>
        <CyToolbar
          getCy={() => cyRef.current}
          containerRef={cardRef}
          basename="hub_network"
          graph={subgraph}
          title={`Hub Subgraph · Top ${subgraph.nodes.length} by ${metric}`}
          layout={layout}
          onLayoutChange={setLayout}
          onResetLayout={() => { const cy = cyRef.current; if (cy) cy.layout({ name: layout, animate: false, fit: true, padding: 30 }).run(); }}
          testidPrefix="hub-net"
        />
      </div>
      <CytoscapeComponent
        key={`hub-${elements.length}`}
        elements={elements}
        style={{ width: "100%", height: "500px" }}
        layout={{ name: layout, animate: false, fit: true, padding: 30 }}
        stylesheet={stylesheet}
        cy={(cy) => { cyRef.current = cy; cy.userZoomingEnabled(true); cy.userPanningEnabled(true); }}
      />
    </div>
  );
}

// ────────────────────── GO Enrichment Panel ─────────────────────
function GOPanel({ genes, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [topN, setTopN] = useState(10);
  const [maxP, setMaxP] = useState(0.05);
  const [activeSource, setActiveSource] = useState("GO:BP");

  const runGO = async () => {
    if (!genes || genes.length === 0) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await goEnrich({ genes });
      if (res.error) toast.error(`g:Profiler: ${res.error}`);
      setResult(res);
      toast.success(`g:Profiler returned ${res.terms?.length || 0} GO terms`);
    } catch (e) {
      toast.error("GO enrichment failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (genes?.length && !result) runGO();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bySource = useMemo(() => {
    const g = { "GO:BP": [], "GO:MF": [], "GO:CC": [] };
    if (!result?.terms) return g;
    for (const t of result.terms) {
      if ((t.p_value ?? 1) > maxP) continue;
      if (!g[t.source]) g[t.source] = [];
      g[t.source].push(t);
    }
    for (const k of Object.keys(g)) g[k] = g[k].slice(0, topN);
    return g;
  }, [result, topN, maxP]);

  const activeTerms = bySource[activeSource] || [];

  const accessors = useMemo(
    () => ({
      name: (r) => r.name,
      native: (r) => r.native,
      p_value: (r) => r.p_value,
      term_size: (r) => r.term_size,
      intersection_size: (r) => r.intersection_size,
      precision: (r) => r.precision,
      recall: (r) => r.recall,
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(activeTerms, accessors, {
    key: "p_value",
    dir: "asc",
  });

  const exportRows = () => {
    if (!result?.terms) return;
    const flat = result.terms.map((r) => ({
      Source: r.source,
      Category: r.category,
      "Term ID": r.native,
      "Term Name": r.name,
      "P-value": r.p_value,
      "Term Size": r.term_size,
      "Query Size": r.query_size,
      "Intersection Size": r.intersection_size,
      Precision: r.precision,
      Recall: r.recall,
      "Overlap Genes": (r.overlap_genes || []).join(","),
    }));
    exportCSV(
      flat,
      Object.keys(flat[0] || { Source: 0 }).map((k) => ({ key: k, label: k })),
      "go_enrichment.csv"
    );
  };

  return (
    <div className="space-y-6">
      <div
        data-testid="go-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Layers className="mr-1 inline h-3.5 w-3.5" />
              GO Enrichment · g:Profiler (g:SCS · H. sapiens)
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes?.length || 0} genes → Biological Process · Molecular Function · Cellular Component
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top
              <input
                data-testid="go-topn"
                type="number"
                min={1}
                max={100}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Max P
              <input
                data-testid="go-max-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={maxP}
                onChange={(e) => setMaxP(Number(e.target.value))}
                className="w-20 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <button
              data-testid="go-run"
              onClick={runGO}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
            >
              {loading ? "Enriching…" : "Re-run"}
            </button>
            <DlBtn
              onClick={exportRows}
              testid="go-export-csv"
              label="CSV"
              icon={<Download className="h-3.5 w-3.5" />}
            />
          </div>
        </div>

        {/* Source tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {["GO:BP", "GO:MF", "GO:CC"].map((s) => (
            <button
              key={s}
              data-testid={`go-tab-${s.replace(":", "-").toLowerCase()}`}
              onClick={() => setActiveSource(s)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ring-1 ring-inset ${
                activeSource === s
                  ? "bg-[#5139ED] text-white ring-[#5139ED]"
                  : "bg-white text-[#0B0B18] ring-[#E7E7F3] hover:ring-[#5139ED]/40"
              }`}
            >
              {s === "GO:BP"
                ? "Biological Process"
                : s === "GO:MF"
                ? "Molecular Function"
                : "Cellular Component"}
              <span className="ml-1.5 text-[10px] opacity-70">({bySource[s]?.length || 0})</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div data-testid="go-loading" className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Querying g:Profiler…
        </div>
      ) : activeTerms.length === 0 ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          No significantly enriched {activeSource} terms at P ≤ {maxP}.
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div
            data-testid="go-bar-chart"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Bar chart · −log10(P) per term · {activeSource}
            </p>
            <GOBarChart terms={activeTerms} />
          </div>

          {/* Dot plot */}
          <div
            data-testid="go-dot-plot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Dot plot · gene ratio × −log10(P) · dot size = intersection count
            </p>
            <GODotPlot terms={activeTerms} />
          </div>

          {/* Chord plot */}
          <div
            data-testid="go-chord-plot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Chord plot · term–gene relationships · {activeSource}
            </p>
            <GOChordPlot terms={activeTerms.slice(0, 10)} />
          </div>

          {/* Table */}
          <div
            data-testid="go-table"
            className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
          >
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                    <SortableTh id="native" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term ID</SortableTh>
                    <SortableTh id="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term Name</SortableTh>
                    <SortableTh id="p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>P-value</SortableTh>
                    <SortableTh id="term_size" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Term Size</SortableTh>
                    <SortableTh id="intersection_size" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Overlap</SortableTh>
                    <SortableTh id="precision" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Precision</SortableTh>
                    <SortableTh id="recall" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Recall</SortableTh>
                    <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                      Genes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => (
                    <tr key={r.native} data-testid={`go-row-${r.native}`} className="border-b border-[#F1F1FA] hover:bg-[#F8F8FE]">
                      <td className="px-3 py-3 font-mono text-[11px]">
                        <a
                          href={`https://amigo.geneontology.org/amigo/term/${r.native}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#5139ED] underline decoration-dotted underline-offset-2"
                        >
                          {r.native}
                        </a>
                      </td>
                      <td className="px-3 py-3 text-[12px] font-semibold text-[#0B0B18]">{r.name}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                        {r.p_value?.toExponential(2)}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] text-[#0B0B18]">
                        {r.term_size}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-[11px] font-bold text-[#5139ED]">
                        {r.intersection_size}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                        {(r.precision || 0).toFixed(3)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                        {(r.recall || 0).toFixed(3)}
                      </td>
                      <td
                        className="max-w-[240px] px-3 py-3 text-[10px] font-mono text-[#64748B]"
                        title={(r.overlap_genes || []).join(", ")}
                      >
                        {(r.overlap_genes || []).slice(0, 6).join(", ")}
                        {r.overlap_genes?.length > 6 && "…"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button
          data-testid="go-complete"
          type="button"
          onClick={onComplete}
          className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
        >
          Next — KEGG Pathway Enrichment
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function GOBarChart({ terms }) {
  const s = useAppliedStyle("go");
  const w = 780;
  const rowH = 26;
  const h = Math.max(120, terms.length * rowH + 60);
  const labelW = 260;
  const maxLog = Math.max(1, ...terms.map((t) => -Math.log10(Math.max(t.p_value || 1, 1e-30))));
  const barMax = w - labelW - 60;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={labelW + f * barMax} x2={labelW + f * barMax} y1={20} y2={h - 40}
              stroke={s.grid} strokeWidth="0.5" />
      ))}
      {terms.map((t, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(t.p_value || 1, 1e-30));
        const bw = (logp / maxLog) * barMax;
        const label = t.name.length > 34 ? t.name.slice(0, 32) + "…" : t.name;
        return (
          <g key={t.native} opacity={s.opacity}>
            <text
              x={labelW - 8}
              y={y + rowH / 2 + 3}
              textAnchor="end"
              fontSize={s.labelSize}
              fill={s.labelColor}
              fontFamily={s.fontFamily}
            >
              {label}
            </text>
            <rect
              x={labelW}
              y={y + 4}
              width={bw}
              height={rowH - 8}
              rx={3}
              fill={s.palette[i % s.palette.length]}
              fillOpacity="0.85"
            />
            <text
              x={labelW + bw + 6}
              y={y + rowH / 2 + 3}
              fontSize={Math.max(9, s.labelSize - 2)}
              fill={s.labelColor}
              opacity="0.7"
              fontFamily={s.fontFamily}
            >
              {logp.toFixed(2)}
            </text>
          </g>
        );
      })}
      <text x={labelW + barMax / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P-value)
      </text>
    </svg>
  );
}

function GODotPlot({ terms }) {
  const s = useAppliedStyle("go");
  const w = 780;
  const rowH = 26;
  const h = Math.max(180, terms.length * rowH + 60);
  const labelW = 260;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxLog = Math.max(1, ...terms.map((t) => -Math.log10(Math.max(t.p_value || 1, 1e-30))));
  const maxIS = Math.max(1, ...terms.map((t) => t.intersection_size || 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f, i) => (
        <line
          key={i}
          x1={plotL + f * plotW}
          x2={plotL + f * plotW}
          y1={20}
          y2={h - 40}
          stroke={s.grid}
          strokeWidth="0.5"
        />
      ))}
      {terms.map((t, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(t.p_value || 1, 1e-30));
        const x = plotL + (logp / maxLog) * plotW;
        const r = (4 + ((t.intersection_size || 0) / maxIS) * 12) * s.nodeSize;
        const label = t.name.length > 34 ? t.name.slice(0, 32) + "…" : t.name;
        const colour = s.palette[i % s.palette.length];
        return (
          <g key={t.native} opacity={s.opacity}>
            <text
              x={labelW - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={s.labelSize}
              fill={s.labelColor}
              fontFamily={s.fontFamily}
            >
              {label}
            </text>
            <circle cx={x} cy={y} r={r} fill={colour} fillOpacity="0.85" stroke={colour} strokeWidth="1" />
            <text x={x + r + 4} y={y + 3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {t.intersection_size}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P) · dot size ∝ overlap · colour ∝ term index
      </text>
    </svg>
  );
}

function GOChordPlot({ terms }) {
  // Simplified radial chord: terms on the top arc, unique overlap genes on the
  // bottom arc, curved lines connecting each term ↔ gene.
  const w = 780;
  const h = 460;
  const cx = w / 2;
  const cy = h / 2 + 20;
  const rIn = 150;
  const rOut = 180;
  const genes = useMemo(() => {
    const s = new Set();
    for (const t of terms) for (const g of t.overlap_genes || []) s.add(g);
    return [...s];
  }, [terms]);

  if (terms.length === 0 || genes.length === 0) {
    return (
      <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">
        Not enough overlap data to render a chord diagram.
      </div>
    );
  }

  // Terms occupy top hemisphere (π→0), genes occupy bottom (0→−π going through π).
  // We split the full circle: first half for terms, second half for genes.
  const termCount = terms.length;
  const geneCount = genes.length;
  const total = termCount + geneCount;
  const angleFor = (i) => (Math.PI * 2 * i) / total - Math.PI / 2;

  const termAngles = terms.map((_, i) => angleFor(i));
  const geneAngles = {};
  genes.forEach((g, i) => (geneAngles[g] = angleFor(termCount + i)));

  const point = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const palette = ["#5139ED", "#8139ED", "#395AED", "#ED39A6", "#39C1ED", "#F5B301", "#10B981", "#EF4444", "#0EA5E9", "#7C3AED"];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3">
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {/* Term arcs */}
      {terms.map((t, i) => {
        const a = termAngles[i];
        const [x1, y1] = point(rIn, a);
        const [x2, y2] = point(rOut, a);
        const [lx, ly] = point(rOut + 10, a);
        const colour = palette[i % palette.length];
        const label = t.name.length > 22 ? t.name.slice(0, 20) + "…" : t.name;
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={t.native}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colour} strokeWidth="4" strokeLinecap="round" />
            <text
              x={lx}
              y={ly}
              fontSize="10"
              fill={colour}
              fontFamily="Inter"
              fontWeight="700"
              textAnchor={anchor}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Gene arcs */}
      {genes.map((g, i) => {
        const a = geneAngles[g];
        const [x1, y1] = point(rIn, a);
        const [x2, y2] = point(rOut, a);
        const [lx, ly] = point(rOut + 10, a);
        const anchor = Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={g}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748B" strokeWidth="3" strokeLinecap="round" />
            <text x={lx} y={ly + 3} fontSize="9" fill="#0B0B18" fontFamily="Inter" textAnchor={anchor}>
              {g}
            </text>
          </g>
        );
      })}
      {/* Chords */}
      {terms.map((t, i) => {
        const colour = palette[i % palette.length];
        const [tx, ty] = point(rIn, termAngles[i]);
        return (t.overlap_genes || []).map((g) => {
          if (geneAngles[g] == null) return null;
          const [gx, gy] = point(rIn, geneAngles[g]);
          const d = `M ${tx} ${ty} Q ${cx} ${cy} ${gx} ${gy}`;
          return (
            <path
              key={`${t.native}-${g}`}
              d={d}
              stroke={colour}
              strokeWidth="0.8"
              strokeOpacity="0.45"
              fill="none"
            />
          );
        });
      })}
    </svg>
  );
}

// ────────────────────── KEGG Panel ─────────────────────
function KeggPanel({ genes, keggResult, setKeggResult, onComplete }) {
  const [loading, setLoading] = useState(false);
  const [topN, setTopN] = useState(20);
  const [maxAdjP, setMaxAdjP] = useState(0.05);

  const runKegg = async () => {
    if (!genes || genes.length === 0) return toast.error("No genes to enrich");
    setLoading(true);
    try {
      const res = await keggEnrich({ genes });
      setKeggResult(res);
      toast.success(`Enrichr returned ${res.pathways?.length || 0} KEGG pathways`);
    } catch (e) {
      toast.error("KEGG enrichment failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (genes?.length && !keggResult) runKegg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!keggResult) return [];
    const p = keggResult.pathways || [];
    return p
      .filter((r) => (r.adj_p_value ?? 1) <= maxAdjP)
      .slice(0, topN);
  }, [keggResult, topN, maxAdjP]);

  const accessors = useMemo(
    () => ({
      term: (r) => r.term,
      p_value: (r) => r.p_value,
      adj_p_value: (r) => r.adj_p_value,
      combined_score: (r) => r.combined_score,
      gene_count: (r) => r.gene_count,
    }),
    []
  );
  const { sortedRows, sortKey, sortDir, onSort } = useSortable(filtered, accessors, {
    key: "combined_score",
    dir: "desc",
  });

  const exportKegg = () => {
    if (!filtered.length) return;
    const flat = filtered.map((r) => ({
      Rank: r.rank,
      Pathway: r.term,
      "P-value": r.p_value,
      "Adj. P-value": r.adj_p_value,
      "Combined Score": r.combined_score,
      "Gene Count": r.gene_count,
      "Overlapping Genes": (r.overlap_genes || []).join(","),
    }));
    exportCSV(flat, Object.keys(flat[0]).map((k) => ({ key: k, label: k })), "kegg_pathways.csv");
  };

  // Bubble plot data: x = -log10(p), y = pathway idx, size = gene_count
  const maxLog = Math.max(1, ...sortedRows.map((r) => -Math.log10(Math.max(r.p_value || 1, 1e-30))));
  const maxCount = Math.max(1, ...sortedRows.map((r) => r.gene_count || 0));

  return (
    <div className="space-y-6">
      <div
        data-testid="kegg-controls"
        className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              <Activity className="mr-1 inline h-3.5 w-3.5" />
              KEGG Pathway Enrichment · via Enrichr
            </p>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              {genes?.length || 0} genes → KEGG_2021_Human
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Top
              <input
                data-testid="kegg-topn"
                type="number"
                min={1}
                max={200}
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-16 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <label className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Max adj-P
              <input
                data-testid="kegg-max-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={maxAdjP}
                onChange={(e) => setMaxAdjP(Number(e.target.value))}
                className="w-20 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1 text-right text-sm text-[#0B0B18]"
              />
            </label>
            <button
              data-testid="kegg-run"
              onClick={runKegg}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
            >
              {loading ? "Enriching…" : "Re-run"}
            </button>
            <DlBtn onClick={exportKegg} testid="kegg-export-csv" label="CSV" icon={<Download className="h-3.5 w-3.5" />} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          Querying Enrichr…
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center text-sm text-[#64748B]">
          No significantly enriched pathways at adj-P ≤ {maxAdjP}.
        </div>
      ) : (
        <>
          {/* Bubble plot */}
          <div
            data-testid="kegg-bubble"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Bubble plot · −log10(P) vs pathway · bubble size = gene count
            </p>
            <svg viewBox="0 0 780 480" width="100%" height={480} className="mt-4">
              <rect x="0" y="0" width="780" height="480" fill="#FFFFFF" />
              {/* Y-axis labels */}
              {sortedRows.map((r, i) => {
                const y = 30 + i * ((420) / sortedRows.length);
                const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
                const x = 300 + (logp / maxLog) * 440;
                const rBubble = 4 + (r.gene_count / maxCount) * 14;
                return (
                  <g key={r.term}>
                    <text
                      x={295}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#0B0B18"
                      fontFamily="Inter"
                    >
                      {r.term.length > 42 ? r.term.slice(0, 40) + "…" : r.term}
                    </text>
                    <circle
                      cx={x}
                      cy={y}
                      r={rBubble}
                      fill="#5139ED"
                      fillOpacity="0.55"
                      stroke="#5139ED"
                      strokeWidth="1"
                    />
                    <text x={x + rBubble + 4} y={y + 3} fontSize="9" fill="#64748B">
                      {r.gene_count}
                    </text>
                  </g>
                );
              })}
              <text
                x="540"
                y="465"
                fontSize="11"
                textAnchor="middle"
                fill="#64748B"
                fontFamily="Inter"
              >
                −log10(P-value)
              </text>
            </svg>
          </div>

          {/* Dot plot */}
          <div
            data-testid="kegg-dot"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Dot plot · gene ratio × −log10(P) · size = overlap
            </p>
            <KEGGDotPlot rows={sortedRows} />
          </div>

          {/* Lollipop chart */}
          <div
            data-testid="kegg-lollipop"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Lollipop chart · combined score
            </p>
            <KEGGLollipopChart rows={sortedRows} />
          </div>

          {/* Sankey diagram */}
          <div
            data-testid="kegg-sankey"
            className="rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
          >
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Sankey · gene → pathway flows (top {Math.min(8, sortedRows.length)} pathways)
            </p>
            <KEGGSankey rows={sortedRows.slice(0, 8)} />
          </div>

          {/* Pathway table */}
          <div
            data-testid="kegg-table"
            className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white"
          >
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                  <SortableTh id="term" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Pathway</SortableTh>
                  <SortableTh id="p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>P-value</SortableTh>
                  <SortableTh id="adj_p_value" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Adj. P</SortableTh>
                  <SortableTh id="combined_score" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Combined</SortableTh>
                  <SortableTh id="gene_count" sortKey={sortKey} sortDir={sortDir} onSort={onSort} sticky>Genes</SortableTh>
                  <th className="whitespace-nowrap px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                    Overlapping
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.term} data-testid={`kegg-row-${r.rank}`} className="border-b border-[#F1F1FA] hover:bg-[#F8F8FE]">
                    <td className="px-3 py-3 text-[12px] font-semibold text-[#0B0B18]">{r.term}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                      {r.p_value?.toExponential(2)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#64748B]">
                      {r.adj_p_value?.toExponential(2)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[#0B0B18]">
                      {(r.combined_score || 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-[11px] font-bold text-[#5139ED]">
                      {r.gene_count}
                    </td>
                    <td className="max-w-[280px] px-3 py-3 text-[10px] font-mono text-[#64748B]" title={(r.overlap_genes || []).join(", ")}>
                      {(r.overlap_genes || []).slice(0, 6).join(", ")}
                      {r.overlap_genes?.length > 6 && "…"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              data-testid="kegg-complete"
              type="button"
              onClick={onComplete}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Finish — Network Analysis
              <Check className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────── KEGG additional plots ─────────────────────
function KEGGDotPlot({ rows }) {
  const s = useAppliedStyle("kegg");
  const w = 780;
  const rowH = 28;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxLog = Math.max(1, ...rows.map((r) => -Math.log10(Math.max(r.p_value || 1, 1e-30))));
  const maxCount = Math.max(1, ...rows.map((r) => r.gene_count || 0));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && [0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i} x1={plotL + f * plotW} x2={plotL + f * plotW} y1={20} y2={h - 40}
              stroke={s.grid} strokeWidth="0.5" />
      ))}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const logp = -Math.log10(Math.max(r.p_value || 1, 1e-30));
        const x = plotL + (logp / maxLog) * plotW;
        const dot = (4 + ((r.gene_count || 0) / maxCount) * 12) * s.nodeSize;
        const colour = s.palette[i % s.palette.length];
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        return (
          <g key={r.term} opacity={s.opacity}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>
              {label}
            </text>
            <circle cx={x} cy={y} r={dot} fill={colour} fillOpacity="0.85" stroke={colour} strokeWidth="1" />
            <text x={x + dot + 4} y={y + 3} fontSize={Math.max(9, s.labelSize - 3)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {r.gene_count}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        −log10(P-value) · dot size ∝ overlap
      </text>
    </svg>
  );
}

function KEGGLollipopChart({ rows }) {
  const s = useAppliedStyle("lollipop");
  const w = 780;
  const rowH = 28;
  const h = Math.max(180, rows.length * rowH + 60);
  const labelW = 300;
  const plotL = labelW + 20;
  const plotW = w - plotL - 60;
  const maxScore = Math.max(1, ...rows.map((r) => r.combined_score || 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3"
         style={{ fontFamily: s.fontFamily, borderRadius: s.borderRadius, border: s.showBorder ? `1px solid ${s.borderColor}` : "none" }}>
      <rect x="0" y="0" width={w} height={h} fill={s.background} />
      {s.showGrid && <line x1={plotL} x2={plotL} y1={20} y2={h - 40} stroke={s.grid} strokeWidth="1" />}
      {rows.map((r, i) => {
        const y = 30 + i * rowH;
        const bw = ((r.combined_score || 0) / maxScore) * plotW;
        const label = r.term.length > 40 ? r.term.slice(0, 38) + "…" : r.term;
        const c = s.palette[i % s.palette.length];
        return (
          <g key={r.term} opacity={s.opacity}>
            <text x={labelW - 8} y={y + 4} textAnchor="end" fontSize={s.labelSize} fill={s.labelColor} fontFamily={s.fontFamily}>
              {label}
            </text>
            <line
              x1={plotL} y1={y} x2={plotL + bw} y2={y}
              stroke={c} strokeWidth={2 * s.edgeThickness} strokeOpacity="0.65"
            />
            <circle cx={plotL + bw} cy={y} r={5 * s.nodeSize} fill={c} stroke={s.background} strokeWidth="1.5" />
            <text x={plotL + bw + 10} y={y + 3} fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
              {(r.combined_score || 0).toFixed(1)}
            </text>
          </g>
        );
      })}
      <text x={plotL + plotW / 2} y={h - 12} textAnchor="middle" fontSize={Math.max(10, s.labelSize - 1)} fill={s.labelColor} opacity="0.7" fontFamily={s.fontFamily}>
        Combined score
      </text>
    </svg>
  );
}

function KEGGSankey({ rows }) {
  // Simple gene→pathway Sankey. Genes on the left; pathways on the right.
  const w = 900;
  const pad = 16;
  const geneW = 12;
  const pathW = 12;

  // Collect and count gene appearances.
  const geneCounts = new Map();
  for (const r of rows) for (const g of r.overlap_genes || []) {
    geneCounts.set(g, (geneCounts.get(g) || 0) + 1);
  }
  const genes = [...geneCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([g]) => g);
  const geneSet = new Set(genes);

  const filteredRows = rows
    .map((r) => ({ ...r, overlap_genes: (r.overlap_genes || []).filter((g) => geneSet.has(g)) }))
    .filter((r) => r.overlap_genes.length > 0);

  const h = Math.max(360, Math.max(genes.length, filteredRows.length) * 22 + 60);
  const geneStep = (h - 2 * pad) / Math.max(1, genes.length);
  const pathStep = (h - 2 * pad) / Math.max(1, filteredRows.length);
  const geneY = (i) => pad + geneStep * (i + 0.5);
  const pathY = (i) => pad + pathStep * (i + 0.5);
  const palette = ["#5139ED", "#8139ED", "#395AED", "#ED39A6", "#39C1ED", "#F5B301", "#10B981", "#EF4444"];

  if (filteredRows.length === 0 || genes.length === 0) {
    return (
      <div className="rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-6 text-center text-xs text-[#64748B]">
        Not enough overlap data to render a Sankey diagram.
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="mt-3">
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      {/* Gene nodes (left) */}
      {genes.map((g, i) => (
        <g key={g}>
          <rect x={140} y={geneY(i) - 6} width={geneW} height={12} rx={2} fill="#5139ED" />
          <text x={135} y={geneY(i) + 3} fontSize="10" fill="#0B0B18" fontFamily="Inter" textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {/* Pathway nodes (right) */}
      {filteredRows.map((r, i) => {
        const color = palette[i % palette.length];
        const label = r.term.length > 34 ? r.term.slice(0, 32) + "…" : r.term;
        return (
          <g key={r.term}>
            <rect x={w - 140 - pathW} y={pathY(i) - 6} width={pathW} height={12} rx={2} fill={color} />
            <text x={w - 140 + 6} y={pathY(i) + 3} fontSize="10" fill="#0B0B18" fontFamily="Inter">
              {label}
            </text>
          </g>
        );
      })}
      {/* Flows */}
      {filteredRows.map((r, pi) => {
        const color = palette[pi % palette.length];
        return (r.overlap_genes || []).map((g) => {
          const gi = genes.indexOf(g);
          if (gi < 0) return null;
          const x1 = 140 + geneW;
          const y1 = geneY(gi);
          const x2 = w - 140 - pathW;
          const y2 = pathY(pi);
          const c1x = x1 + (x2 - x1) * 0.5;
          const c2x = x1 + (x2 - x1) * 0.5;
          const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
          return (
            <path
              key={`${g}-${r.term}`}
              d={d}
              stroke={color}
              strokeWidth="1.6"
              strokeOpacity="0.35"
              fill="none"
            />
          );
        });
      })}
    </svg>
  );
}

// ─────────────────────── Venn diagram SVG (2-set) ──────────────────────
import React from "react";
const VennSVG = React.forwardRef(function VennSVG(
  { n1, n2, nCommon, label1, label2 },
  ref
) {
  // Two overlapping circles, sized to visually communicate cardinality.
  const w = 600, h = 400;
  const cx1 = 220, cx2 = 380, cy = 200;
  const r = 130;
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Venn diagram: ${label1} vs ${label2}`}
      style={{ maxWidth: "100%", height: "auto" }}
    >
      <rect x="0" y="0" width={w} height={h} fill="#FFFFFF" />
      <title>{`Venn ${label1} vs ${label2}`}</title>
      <circle
        cx={cx1}
        cy={cy}
        r={r}
        fill="#5139ED"
        fillOpacity="0.35"
        stroke="#5139ED"
        strokeWidth="2"
      />
      <circle
        cx={cx2}
        cy={cy}
        r={r}
        fill="#8139ED"
        fillOpacity="0.35"
        stroke="#8139ED"
        strokeWidth="2"
      />
      {/* Left-only */}
      <text
        x={cx1 - 60}
        y={cy}
        fontFamily="Inter, sans-serif"
        fontSize="26"
        fontWeight="700"
        textAnchor="middle"
        fill="#0B0B18"
      >
        {n1 - nCommon}
      </text>
      {/* Intersection */}
      <text
        x={(cx1 + cx2) / 2}
        y={cy}
        fontFamily="Inter, sans-serif"
        fontSize="28"
        fontWeight="800"
        textAnchor="middle"
        fill="#0B0B18"
      >
        {nCommon}
      </text>
      {/* Right-only */}
      <text
        x={cx2 + 60}
        y={cy}
        fontFamily="Inter, sans-serif"
        fontSize="26"
        fontWeight="700"
        textAnchor="middle"
        fill="#0B0B18"
      >
        {n2 - nCommon}
      </text>
      {/* Labels */}
      <text
        x={cx1 - 20}
        y={cy - r - 12}
        fontFamily="Inter, sans-serif"
        fontSize="14"
        fontWeight="700"
        textAnchor="middle"
        fill="#5139ED"
      >
        {label1}
      </text>
      <text
        x={cx2 + 20}
        y={cy - r - 12}
        fontFamily="Inter, sans-serif"
        fontSize="14"
        fontWeight="700"
        textAnchor="middle"
        fill="#8139ED"
      >
        {label2}
      </text>
      <text
        x={(cx1 + cx2) / 2}
        y={h - 20}
        fontFamily="Inter, sans-serif"
        fontSize="11"
        textAnchor="middle"
        fill="#64748B"
      >
        Compound targets ∩ Disease targets · PhytoNet AI
      </text>
    </svg>
  );
});
