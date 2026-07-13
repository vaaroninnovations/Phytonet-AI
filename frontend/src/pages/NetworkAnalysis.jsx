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
import { saveAs } from "file-saver";
import { toast } from "sonner";
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

  const hasInputs = compoundTargets.length > 0 && diseaseTargets.length > 0;

  // Compute intersection (auto).
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
    const dSet = new Set(diseaseTargets.map((d) => d.gene_symbol));
    const out = [];
    for (const [gene, slot] of cMap.entries()) {
      if (dSet.has(gene)) {
        const d = diseaseTargets.find((x) => x.gene_symbol === gene) || {};
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
              <PlaceholderPanel
                icon={<Network className="h-6 w-6" />}
                title="Protein–Protein Interaction Analysis"
                gene_count={
                  Object.keys(intersectSel).filter((g) => intersectSel[g]).length
                }
                description="STRING REST API (public, permissive-license) will be wired next: interaction score / evidence channels / network type filters, interactive Cytoscape.js graph, and network statistics. Locally-deployable STRING-MCP mode ships as an environment flag."
              />
            )}
            {active === "hubs" && (
              <PlaceholderPanel
                icon={<Waypoints className="h-6 w-6" />}
                title="Hub Gene Analysis"
                description="CytoHubba-style ranking with 10 algorithms (MCC / Degree / MNC / DMNC / EPC / Closeness / Betweenness / Stress / Radiality / Bottleneck), Top-N picker + interactive network. Runs on PPI output."
              />
            )}
            {active === "go" && (
              <PlaceholderPanel
                icon={<Layers className="h-6 w-6" />}
                title="GO Enrichment"
                description="g:Profiler (open, permissive-license) for BP / MF / CC ontologies. Bar charts · dot plots · chord plots · gene-term networks. Runs on PPI genes."
              />
            )}
            {active === "kegg" && (
              <PlaceholderPanel
                icon={<Activity className="h-6 w-6" />}
                title="KEGG Pathway Enrichment"
                description="KEGG REST + Enrichr: pathway table · bubble · dot · lollipop · Sankey · bar. Top-N configurable."
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

  const downloadSvg = () => {
    if (!svgRef.current) return;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    saveAs(blob, `venn_${diseaseLabel.replace(/\s+/g, "_")}.svg`);
  };
  const downloadPng = async (dpi = 300) => {
    if (!svgRef.current) return;
    // Base SVG viewport is 600×400 → scale by dpi/96 for print-quality raster.
    const scale = dpi / 96;
    const src = new XMLSerializer().serializeToString(svgRef.current);
    const img = new Image();
    const svgBlob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 600 * scale;
      canvas.height = 400 * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) saveAs(blob, `venn_${dpi}dpi.png`);
        URL.revokeObjectURL(url);
      }, "image/png");
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
            <DlBtn
              onClick={() => doExport(exportCSV, "intersection_targets.csv")}
              testid="intersection-export-csv"
              label="CSV"
              icon={<Download className="h-3.5 w-3.5" />}
            />
            <DlBtn
              onClick={() => doExport(exportXLSX, "intersection_targets.xlsx")}
              testid="intersection-export-xlsx"
              label="Excel"
              icon={<Download className="h-3.5 w-3.5" />}
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

function PlaceholderPanel({ icon, title, description, gene_count }) {
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
          {gene_count} intersecting genes carried from Step 1
        </p>
      )}
      <p className="mx-auto mt-3 max-w-xl text-sm text-[#64748B]">{description}</p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
        <Sparkles className="h-3 w-3" />
        Coming in the next iteration — data pipeline already tied to Step 1
      </p>
    </div>
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
