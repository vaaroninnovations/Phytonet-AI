// Report Builder v2 (Session A of AI Report Redesign, 2026-02-25).
// Modular per-module selection with 4-toggle include controls
// (Methods · Tables · Figures · AI Interpretation).
// See PRD.md for the multi-session roadmap.
import { useMemo, useState, useEffect } from "react";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { useAuth, requireAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
  FileText, Loader2, Download, FileDown, Layers, Settings2, ClipboardList,
  ChartBar, Sparkles, CheckCircle2, XCircle,
} from "lucide-react";
import { buildReportDoc } from "@/lib/reportBuilder";
import { renderReportPdf } from "@/lib/reportPdf";
import { renderReportDocx } from "@/lib/reportDocx";
import { reportInterpret } from "@/lib/api";

/* ─── Module catalogue — all 15 modules from the redesign spec ─── */
const MODULES = [
  { id: "plant-database",     label: "Plant Database",              dataKey: (w) => (w.allCompounds?.length || 0) > 0 || !!w.plantName },
  { id: "phyto-std",          label: "Phytochemical Standardization", dataKey: (w) => (w.allCompounds || []).some((c) => c.canonical_smiles) },
  { id: "compound-library",   label: "Compound Library",            dataKey: (w) => (w.selectedCompounds?.length || 0) > 0 },
  { id: "drug-likeness",      label: "Drug-likeness",               dataKey: (w) => (w.selectedCompounds || []).some((c) => c.drug_likeness != null) },
  { id: "admet",              label: "ADMET",                       dataKey: (w) => (w.selectedCompounds || []).some((c) => c.admet != null || c.admet_score != null) },
  { id: "target-prediction",  label: "Target Prediction",           dataKey: (w) => (w.compoundTargets?.length || 0) > 0 },
  { id: "disease-targets",    label: "Disease Targets",             dataKey: (w) => (w.diseaseTargets?.length || 0) > 0 },
  { id: "ct-network",         label: "Compound–Target Network",     dataKey: (w) => (w.compoundTargets?.length || 0) > 0 && (w.selectedCompounds?.length || 0) > 0 },
  { id: "network-analysis",   label: "Network Analysis",            dataKey: (w) => (w.intersectingGenes?.length || 0) > 0 || !!w.ppiResult },
  { id: "ppi",                label: "Protein–Protein Interaction", dataKey: (w) => !!w.ppiResult },
  { id: "hub-genes",          label: "Hub Gene Analysis",           dataKey: (w) => (w.hubScores?.length || 0) > 0 },
  { id: "go",                 label: "GO Enrichment",               dataKey: (w) => (w.goTerms?.length || 0) > 0 },
  { id: "kegg",               label: "KEGG Enrichment",             dataKey: (w) => (w.selectedKeggPathways?.length || 0) > 0 },
  { id: "docking",            label: "Molecular Docking",           dataKey: (w) => (w.dockingResults?.results?.length || 0) > 0 },
  { id: "md",                 label: "Molecular Dynamics",          dataKey: (w) => !!w.mdConfig?.applied || !!w.mdResult },
];

const DEFAULT_TOGGLES = { methods: true, tables: true, figures: true, interpretation: true };

/* ─── Report ID generator: PN-YYYYMMDD-6charnanoid ─── */
function generateReportId() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let nid = "";
  const bytes = new Uint8Array(6);
  (window.crypto || window.msCrypto).getRandomValues(bytes);
  for (let i = 0; i < 6; i++) nid += alphabet[bytes[i] % alphabet.length];
  return `PN-${ymd}-${nid}`;
}

export default function AIScientificReport() {
  const {
    plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
    intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
    dockingResults, mdConfig, mdResult,
  } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const { user } = useAuth();

  const [busy, setBusy] = useState(null);
  const [projectTitle, setProjectTitle] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [reportId] = useState(() => generateReportId());
  // AI interpretation cache — populated on first PDF/DOCX generation with
  // any Interpretation toggle on. Keyed by module id + "overall".
  const [aiInterpret, setAiInterpret] = useState({ per_module: {}, overall: null });

  const workflow = useMemo(() => ({
    plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
    intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
    dockingResults, mdConfig, mdResult, allCompounds,
  }), [plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
       intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
       dockingResults, mdConfig, mdResult, allCompounds]);

  const availability = useMemo(() => {
    const m = {};
    MODULES.forEach((mod) => { m[mod.id] = !!mod.dataKey(workflow); });
    return m;
  }, [workflow]);

  // Per-module include state — only auto-selected if data exists
  const [selection, setSelection] = useState({});
  useEffect(() => {
    setSelection((prev) => {
      const next = { ...prev };
      MODULES.forEach((mod) => {
        if (!next[mod.id]) {
          next[mod.id] = { included: !!availability[mod.id], ...DEFAULT_TOGGLES };
        }
      });
      return next;
    });
  }, [availability]);

  const includedIds = MODULES.filter((m) => selection[m.id]?.included && availability[m.id]).map((m) => m.id);
  const anyIncluded = includedIds.length > 0;

  const reportDoc = useMemo(() => buildReportDoc({
    workflow, user,
    projectTitle: projectTitle || undefined,
    scientificName: scientificName || undefined,
    reportId,
    include: selection,   // new selective-generation contract
    includedIds,
    aiInterpret,          // {per_module, overall} — rendered by PDF/DOCX pipelines
  }), [workflow, user, projectTitle, scientificName, reportId, selection, includedIds, aiInterpret]);

  // Fetches Claude Sonnet 4.5 interpretations for every selected module that
  // has the "AI Interpretation" toggle on. Cached in state — subsequent
  // downloads reuse it. Silent no-op if no module requests interpretation.
  const fetchInterpretations = async () => {
    const modules = includedIds.filter((id) => selection[id]?.interpretation);
    if (modules.length === 0) return { per_module: {}, overall: null };
    try {
      const res = await reportInterpret({
        workflow: {
          plant_name: plantName,
          disease_name: selectedDisease?.name || selectedDisease?.efo_id,
          selected_compounds: selectedCompounds || [],
          compound_targets: compoundTargets || [],
          disease_targets: diseaseTargets || [],
          intersecting_genes: intersectingGenes || [],
          hub_ranking: hubScores || [],
          ppi_result: ppiResult || null,
          go_terms: goTerms || [],
          kegg_pathways: selectedKeggPathways || [],
          docking_results: dockingResults || null,
          md_config: mdConfig || null,
        },
        modules,
        plant_name: plantName,
        disease_name: selectedDisease?.name || null,
        include_overall: modules.length >= 2,   // "Overall" only makes sense with ≥2 modules
      });
      setAiInterpret(res);
      return res;
    } catch (e) {
      toast.error("AI interpretation failed — proceeding without it.");
      return { per_module: {}, overall: null };
    }
  };

  const toggle = (id, key) => setSelection((s) => ({ ...s, [id]: { ...s[id], [key]: !s[id]?.[key] } }));
  const setAll = (val) => setSelection((s) => {
    const next = { ...s };
    MODULES.forEach((m) => { if (availability[m.id]) next[m.id] = { ...next[m.id], included: val }; });
    return next;
  });

  const genPdf = () => requireAuth(async () => {
    setBusy("pdf");
    try {
      const ai = await fetchInterpretations();
      const docWithAI = buildReportDoc({
        workflow, user,
        projectTitle: projectTitle || undefined,
        scientificName: scientificName || undefined,
        reportId, include: selection, includedIds, aiInterpret: ai,
      });
      const { blob, filename } = renderReportPdf(docWithAI);
      saveAs(blob, filename);
      toast.success("PDF report generated");
    } catch (e) { toast.error("PDF generation failed: " + (e.message || e)); }
    finally { setBusy(null); }
  });
  const genDocx = () => requireAuth(async () => {
    setBusy("docx");
    try {
      const ai = await fetchInterpretations();
      const docWithAI = buildReportDoc({
        workflow, user,
        projectTitle: projectTitle || undefined,
        scientificName: scientificName || undefined,
        reportId, include: selection, includedIds, aiInterpret: ai,
      });
      const { blob, filename } = await renderReportDocx(docWithAI);
      saveAs(blob, filename);
      toast.success("DOCX report generated");
    } catch (e) { toast.error("DOCX generation failed: " + (e.message || e)); }
    finally { setBusy(null); }
  });

  return (
    <WorkflowLayout>
      <main data-testid="report-generation-page" className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 08 · Final</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">Report Builder</h1>
            <p className="mt-2 max-w-3xl text-[#64748B]">
              Compose a modular, publication-quality computational analysis report. Toggle only the
              modules and sections you want — the export excludes anything you leave off, and empty
              modules are dropped automatically. Nothing is fabricated.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button data-testid="report-generate-pdf" onClick={genPdf} disabled={busy != null || !anyIncluded}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {busy === "pdf" ? "Building PDF…" : "Download PDF"}
            </button>
            <button data-testid="report-generate-docx" onClick={genDocx} disabled={busy != null || !anyIncluded}
              className="inline-flex items-center gap-2 rounded-full border border-[#5139ED]/40 bg-white px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-[#5139ED] hover:bg-[#F5F3FE] disabled:opacity-40">
              {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy === "docx" ? "Building DOCX…" : "Download DOCX"}
            </button>
          </div>
        </div>

        {/* Report info card */}
        <section data-testid="report-info" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Report Information</p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Kv label="Report ID" value={reportId} mono />
            <Field label="Project Name (auto-derived if blank)">
              <input data-testid="report-project-title" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={reportDoc.meta.projectTitle}
                className="w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]" />
            </Field>
            <Field label="Plant scientific name (Genus species)">
              <input data-testid="report-scientific-name" value={scientificName} onChange={(e) => setScientificName(e.target.value)}
                placeholder="e.g. Withania somnifera"
                className="w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm italic text-[#0B0B18]" />
            </Field>
            <Kv label="Plant" value={reportDoc.meta.plantName} />
            <Kv label="Disease" value={reportDoc.meta.diseaseName || "—"} />
            <Kv label="Date & Time" value={reportDoc.meta.date} />
            <Kv label="PhytoNet AI" value={reportDoc.meta.brand} />
            <Kv label="Prepared by" value={reportDoc.meta.userName} />
            <Kv label="Modules selected" value={`${includedIds.length} / ${MODULES.length}`} />
          </div>
        </section>

        {/* Report Builder — module picker + toggles */}
        <section data-testid="report-builder" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#5139ED]" />
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Select Modules & Content</p>
            </div>
            <div className="flex gap-2 text-[11px]">
              <button data-testid="report-select-all" onClick={() => setAll(true)} className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-semibold hover:border-[#5139ED]/40 hover:text-[#5139ED]">Select all with data</button>
              <button data-testid="report-clear-all" onClick={() => setAll(false)} className="rounded-full border border-[#E7E7F3] bg-white px-3 py-1 font-semibold hover:border-[#5139ED]/40 hover:text-[#5139ED]">Clear all</button>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-[#64748B]">
            Modules greyed-out have no data yet — they'll be omitted from the export regardless of toggle state.
            Each included module has independent controls for Methods · Tables · Figures · AI Interpretation.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {MODULES.map((mod) => {
              const has = availability[mod.id];
              const sel = selection[mod.id] || { included: false, ...DEFAULT_TOGGLES };
              return (
                <div key={mod.id} data-testid={`mod-${mod.id}`} data-included={sel.included ? "true" : "false"}
                     className={`rounded-2xl border p-3 transition ${sel.included && has ? "border-[#5139ED]/30 bg-[#F5F3FE]/40" : "border-[#E7E7F3] bg-white"} ${!has ? "opacity-55" : ""}`}>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" data-testid={`mod-${mod.id}-include`}
                        checked={!!sel.included} disabled={!has}
                        onChange={() => toggle(mod.id, "included")}
                        className="h-4 w-4 accent-[#5139ED]" />
                      <span className="text-sm font-semibold text-[#0B0B18]">{mod.label}</span>
                    </span>
                    {has ? <CheckCircle2 className="h-4 w-4 text-[#0F7A47]" /> : <XCircle className="h-4 w-4 text-[#94A3B8]" />}
                  </label>
                  {sel.included && has && (
                    <div className="mt-2 flex flex-wrap gap-3 pl-6 text-[11.5px] text-[#374151]">
                      {[
                        { k: "methods",        label: "Methods",         icon: Settings2 },
                        { k: "tables",         label: "Tables",          icon: ClipboardList },
                        { k: "figures",        label: "Figures",         icon: ChartBar },
                        { k: "interpretation", label: "AI Interpretation", icon: Sparkles },
                      ].map((c) => (
                        <label key={c.k} className="inline-flex cursor-pointer items-center gap-1.5">
                          <input type="checkbox" data-testid={`mod-${mod.id}-${c.k}`}
                            checked={!!sel[c.k]} onChange={() => toggle(mod.id, c.k)}
                            className="h-3.5 w-3.5 accent-[#5139ED]" />
                          <c.icon className="h-3 w-3 text-[#5139ED]" />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Preview outline */}
        <section data-testid="report-preview" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Preview outline</p>
          </div>
          {!anyIncluded && (
            <div data-testid="report-empty" className="mt-4 rounded-2xl border border-dashed border-[#E7E7F3] bg-[#FAFAFF] p-8 text-center text-sm text-[#64748B]">
              No modules selected. Enable at least one module above to build the report.
            </div>
          )}
          {anyIncluded && (
            <div className="mt-4 space-y-1 text-[13px]">
              {reportDoc.sections.map((sec) => (
                <div key={sec.key}>
                  <p className="font-semibold text-[#0B0B18]">
                    <span className="mr-2 text-[#5139ED]">{sec.number}</span>{sec.title}
                  </p>
                  {sec.subsections && (
                    <ul className="ml-6 mt-1 space-y-0.5 text-[12px] text-[#64748B]">
                      {sec.subsections.map((sub, i) => (
                        <li key={sub.key}>
                          <span className="mr-1 text-[#5139ED]">{sec.number}.{i + 1}</span>{sub.title}
                          {sub.table && <span className="ml-1 text-[#94A3B8]">· Table {sub.table.id.slice(1)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* AI-generated notice */}
        <section data-testid="report-notice" className="mt-6 rounded-3xl border border-[#5139ED]/20 bg-[#5139ED]/[0.04] p-5 text-[12.5px] leading-relaxed text-[#374151]">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">PhytoNet AI-Generated Analysis Report</p>
          <p className="mt-2">
            This report is automatically generated using PhytoNet AI based on the computational analyses selected by the user. Materials and Methods, Results, figures, tables, and AI interpretations are compiled directly from completed workflow outputs and standardized reporting pipelines. Although every effort has been made to ensure accuracy and reproducibility, AI-generated summaries and interpretations may contain inaccuracies or omissions. Users should independently verify all computational findings against the original datasets, software outputs, databases, and relevant scientific literature before publication, experimental validation, or clinical application.
          </p>
        </section>
      </main>
    </WorkflowLayout>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
      {label}
      {children}
    </label>
  );
}
function Kv({ label, value, italic, mono }) {
  return (
    <div className="rounded-lg border border-[#F1F1FA] bg-[#FAFAFF] p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      <p className={`mt-0.5 text-[13px] font-semibold text-[#0B0B18] ${italic ? "italic" : ""} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
