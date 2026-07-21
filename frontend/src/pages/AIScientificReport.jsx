// Report Generation — final workflow module (v1.0). Deterministic, no LLM.
// Compiles a publication-quality report (PDF + DOCX) from real workflow data;
// modules with no data are automatically omitted (§ dynamic content rule).
import { useMemo, useState } from "react";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { useAuth, requireAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
  FileText, Loader2, Download, CheckCircle2, XCircle, BookOpen,
  Database, Beaker, Target, Network, Activity, FileDown, Layers,
} from "lucide-react";
import { buildReportDoc } from "@/lib/reportBuilder";
import { renderReportPdf } from "@/lib/reportPdf";
import { renderReportDocx } from "@/lib/reportDocx";

// Which visible module cards to display in the preview.
const MODULE_CARDS = [
  { key: "compound",   label: "Compound Identification",      icon: Beaker,   fig: (w) => (w.selectedCompounds?.length || 0) > 0 },
  { key: "admet",      label: "ADMET & Drug-Likeness",         icon: Beaker,   fig: (w) => (w.selectedCompounds || []).some((c) => c.admet != null || c.admet_score != null || c.drug_likeness != null) },
  { key: "targets",    label: "Compound Target Prediction",   icon: Target,   fig: (w) => (w.compoundTargets?.length || 0) > 0 },
  { key: "disease",    label: "Disease Target Identification",icon: Target,   fig: (w) => (w.diseaseTargets?.length || 0) > 0 },
  { key: "network",    label: "Network Analysis & PPI",       icon: Network,  fig: (w) => !!w.ppiResult || (w.hubScores?.length || 0) > 0 },
  { key: "go",         label: "GO Enrichment",                 icon: Activity, fig: (w) => (w.goTerms?.length || 0) > 0 },
  { key: "kegg",       label: "KEGG / Reactome Pathways",      icon: Activity, fig: (w) => (w.selectedKeggPathways?.length || 0) > 0 },
  { key: "docking",    label: "Molecular Docking",             icon: Layers,   fig: (w) => (w.dockingResults?.results?.length || 0) > 0 },
];

export default function AIScientificReport() {
  const {
    plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
    intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
    dockingResults, mdConfig,
  } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const { user } = useAuth();

  const [busy, setBusy] = useState(null);              // 'pdf' | 'docx' | null
  const [projectTitle, setProjectTitle] = useState("");
  const [scientificName, setScientificName] = useState("");

  const workflow = useMemo(() => ({
    plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
    intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
    dockingResults, mdConfig, allCompounds,
  }), [plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
       intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
       dockingResults, mdConfig, allCompounds]);

  const reportDoc = useMemo(() => buildReportDoc({
    workflow,
    user,
    projectTitle: projectTitle || undefined,
    scientificName: scientificName || undefined,
  }), [workflow, user, projectTitle, scientificName]);

  const anyData = reportDoc.sections.some((s) => s.key !== "references" && s.key !== "appendix" && s.key !== "executive-summary");

  const genPdf = () => requireAuth(async () => {
    setBusy("pdf");
    try {
      const { blob, filename } = renderReportPdf(reportDoc);
      saveAs(blob, filename);
      toast.success("PDF report generated");
    } catch (e) {
      console.error(e);
      toast.error("PDF generation failed: " + (e.message || e));
    } finally { setBusy(null); }
  });

  const genDocx = () => requireAuth(async () => {
    setBusy("docx");
    try {
      const { blob, filename } = await renderReportDocx(reportDoc);
      saveAs(blob, filename);
      toast.success("DOCX report generated");
    } catch (e) {
      console.error(e);
      toast.error("DOCX generation failed: " + (e.message || e));
    } finally { setBusy(null); }
  });

  return (
    <WorkflowLayout>
      <main data-testid="report-generation-page" className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 08 · Final</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
              Report Generation
            </h1>
            <p className="mt-2 max-w-3xl text-[#64748B]">
              Deterministic, publication-quality report. Automatically compiles the real outputs of every module
              you actually ran — sections without data are omitted so nothing is fabricated.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="report-generate-pdf"
              onClick={genPdf}
              disabled={busy != null}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40"
            >
              {busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {busy === "pdf" ? "Building PDF…" : "Download PDF"}
            </button>
            <button
              data-testid="report-generate-docx"
              onClick={genDocx}
              disabled={busy != null}
              className="inline-flex items-center gap-2 rounded-full border border-[#5139ED]/40 bg-white px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-[#5139ED] hover:bg-[#F5F3FE] disabled:opacity-40"
            >
              {busy === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {busy === "docx" ? "Building DOCX…" : "Download DOCX"}
            </button>
          </div>
        </div>

        {/* Cover-page metadata form */}
        <section data-testid="report-cover-form" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Cover Page</p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Project title (optional — auto-derived from plant + disease if blank)">
              <input
                data-testid="report-project-title"
                value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={reportDoc.meta.projectTitle}
                className="w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm text-[#0B0B18]"
              />
            </Field>
            <Field label="Plant scientific name (Genus species)">
              <input
                data-testid="report-scientific-name"
                value={scientificName} onChange={(e) => setScientificName(e.target.value)}
                placeholder="e.g. Withania somnifera"
                className="w-full rounded-lg border border-[#E7E7F3] bg-white px-3 py-2 text-sm italic text-[#0B0B18]"
              />
            </Field>
          </div>
          {/* Preview strip */}
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-3 text-[12px] md:grid-cols-3">
            <Kv label="Plant" value={reportDoc.meta.plantName} />
            <Kv label="Scientific name" value={reportDoc.meta.scientificName} italic />
            <Kv label="Disease" value={reportDoc.meta.diseaseName || "—"} />
            <Kv label="Prepared by" value={reportDoc.meta.userName} />
            <Kv label="Date" value={reportDoc.meta.date} />
            <Kv label="Platform" value={reportDoc.meta.brand} />
          </div>
        </section>

        {/* Included modules */}
        <section data-testid="report-modules" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Modules included in this report</p>
          </div>
          <p className="mt-2 text-[12px] text-[#64748B]">
            Only modules that produced results appear in the final PDF / DOCX. Missing modules are hidden entirely — no placeholders.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {MODULE_CARDS.map((m) => {
              const included = m.fig(workflow);
              return (
                <div
                  key={m.key}
                  data-testid={`report-mod-${m.key}`}
                  data-included={included ? "true" : "false"}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    included ? "border-[#5139ED]/25 bg-[#F5F3FE]/50" : "border-dashed border-[#E7E7F3] bg-[#FAFAFF]/50 opacity-70"
                  }`}
                >
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    included ? "bg-[#5139ED] text-white" : "bg-[#F1F1FA] text-[#94A3B8]"
                  }`}>
                    <m.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-semibold ${included ? "text-[#0B0B18]" : "text-[#64748B]"}`}>{m.label}</p>
                    <p className="text-[10px] uppercase tracking-widest text-[#64748B]">
                      {included ? "Included" : "Skipped"}
                    </p>
                  </div>
                  {included ? <CheckCircle2 className="h-4 w-4 text-[#0F7A47]" /> : <XCircle className="h-4 w-4 text-[#94A3B8]" />}
                </div>
              );
            })}
          </div>
        </section>

        {/* Report outline */}
        <section data-testid="report-outline" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Report outline (auto-generated)</p>
          </div>
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
                {sec.refs && <p className="ml-6 text-[12px] text-[#64748B]">{sec.refs.length} citations · databases and software</p>}
                {sec.keyvals && <p className="ml-6 text-[12px] text-[#64748B]">{sec.keyvals.length} parameters</p>}
              </div>
            ))}
          </div>
        </section>

        {!anyData && (
          <div data-testid="report-empty" className="mt-6 rounded-3xl border border-dashed border-[#E7E7F3] bg-[#FAFAFF] p-8 text-center text-sm text-[#64748B]">
            No workflow modules have produced results yet. Run at least one of Compound Identification, Target Prediction, Network Analysis or Docking to populate the report.
          </div>
        )}

        <section data-testid="report-supp" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#5139ED]" />
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Supplementary materials</p>
          </div>
          <p className="mt-2 text-xs text-[#64748B]">
            Every figure and table from Modules 1–6 remains available for publication-quality export (SVG · PNG at 300 &amp; 600 dpi · TIFF · PDF · CSV · XLSX) directly from its module. The Appendix in this report references these downloads.
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
function Kv({ label, value, italic }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <p className="text-[9px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      <p className={`mt-0.5 text-[13px] font-semibold text-[#0B0B18] ${italic ? "italic" : ""}`}>{value}</p>
    </div>
  );
}
