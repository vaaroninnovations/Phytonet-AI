// AI Scientific Report — Step 8. Aggregates ALL workflow state from context
// and generates a publication-ready manuscript via Claude Sonnet 4.5.
import { useMemo, useState } from "react";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useResults } from "@/context/ResultsContext";
import { reportGenerate, reportDownloadURL } from "@/lib/api";
import { requireAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles, Download } from "lucide-react";

export default function AIScientificReport() {
  const {
    plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
    intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
    dockingResults, mdConfig,
  } = useNetwork();
  const { compounds: allCompounds } = useResults();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);   // {report_id, markdown, meta}
  const [previewOpen, setPreviewOpen] = useState(true);

  const workflow = useMemo(() => ({
    plant_name: plantName || "Unknown Plant",
    disease_name: selectedDisease?.name || selectedDisease?.efo_id || "",
    selected_compounds: (selectedCompounds || []).slice(0, 20).map((c) => ({
      name: c.compound_name, smiles: c.smiles, imppat_id: c.imppat_id,
      pubchem_cid: c.pubchem_cid,
      admet: c.admet_score, drug_likeness: c.drug_likeness,
    })),
    lcms_uploaded: (allCompounds || []).some((c) => c.source === "lcms"),
    compound_target_count: compoundTargets?.length || 0,
    disease_target_count: diseaseTargets?.length || 0,
    intersecting_genes: intersectingGenes || [],
    hub_ranking: (hubScores || []).slice(0, 15),
    ppi_summary: ppiResult ? { nodes: ppiResult.nodes.length, edges: ppiResult.edges.length } : null,
    go_terms: (goTerms || []).slice(0, 15),
    kegg_pathways: (selectedKeggPathways || []).slice(0, 15),
    docking_results: (dockingResults?.results || []).slice(0, 15).map((r) => ({
      ligand: r.ligand_name, target: r.receptor_uniprot,
      pdb: r.receptor_pdb, affinity: r.best_affinity,
      hbonds: r.interactions?.hydrogen_bonds?.length || 0,
      hydrophobic: r.interactions?.hydrophobic_contacts?.length || 0,
    })),
    md_config: mdConfig,
  }), [plantName, selectedDisease, selectedCompounds, compoundTargets, diseaseTargets,
       intersectingGenes, hubScores, ppiResult, goTerms, selectedKeggPathways,
       dockingResults, mdConfig, allCompounds]);

  const dataAvailable = (compoundTargets?.length || 0) > 0 || (intersectingGenes?.length || 0) > 0;

  const runReport = async () => {
    requireAuth(async () => {
      setBusy(true); setReport(null);
      try {
        const res = await reportGenerate(workflow);
        setReport(res);
        toast.success("Manuscript generated");
      } catch (e) {
        toast.error("Report generation failed: " + (e.response?.data?.detail || e.message));
      } finally { setBusy(false); }
    });
  };

  const download = (fmt) => {
    if (!report?.report_id) return;
    requireAuth(() => { window.location.href = reportDownloadURL(report.report_id, fmt); });
  };

  return (
    <WorkflowLayout>
      <main data-testid="scientific-report-page" className="mx-auto max-w-6xl px-6 pb-24 pt-14">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Module · 08</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">AI Manuscript Generator</h1>
        <p className="mt-3 max-w-3xl text-[#64748B]">
          Claude Sonnet 4.5 synthesises a publication-ready IMRAD manuscript from every previous module. All figures and
          tables produced in Modules 1-7 remain available for download in publication quality.
        </p>

        {/* Data summary cards */}
        <div data-testid="report-summary" className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <SumCard testid="rep-plant" label="Plant" value={plantName || "—"} />
          <SumCard testid="rep-disease" label="Disease" value={selectedDisease?.name || "—"} />
          <SumCard testid="rep-comps" label="Compounds" value={selectedCompounds?.length || 0} />
          <SumCard testid="rep-ctgt" label="Comp. Targets" value={compoundTargets?.length || 0} />
          <SumCard testid="rep-dtgt" label="Disease Targets" value={diseaseTargets?.length || 0} />
          <SumCard testid="rep-inter" label="Intersecting" value={intersectingGenes?.length || 0} highlight />
          <SumCard testid="rep-kegg" label="KEGG paths" value={selectedKeggPathways?.length || 0} />
          <SumCard testid="rep-dock" label="Docking pairs" value={dockingResults?.results?.length || 0} />
        </div>

        {!dataAvailable && (
          <div data-testid="report-empty" className="mt-6 rounded-3xl border border-dashed border-[#E7E7F3] bg-[#FAFAFF] p-8 text-center text-sm text-[#64748B]">
            Complete the earlier modules (target prediction, disease targets, and ideally network analysis + docking)
            to populate the workflow context. The generator can still produce a manuscript from partial data, but it
            will read best with the full pipeline attached.
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Generate</p>
              <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
                Full IMRAD manuscript · Discussion · Limitations · References
              </h2>
              <p className="mt-1 text-xs text-[#64748B]">Model: Claude Sonnet 4.5 · Median generation time: 45-90 s.</p>
            </div>
            <button data-testid="report-generate" onClick={runReport} disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)] disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Writing manuscript…" : (report ? "Regenerate" : "Generate AI Research Report")}
            </button>
          </div>
        </div>

        {report?.markdown && (
          <div data-testid="report-card" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#5139ED]" />
                <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                  Manuscript · {report.markdown.length.toLocaleString()} characters
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DlBtn testid="report-dl-md" onClick={() => download("md")}>Markdown</DlBtn>
                <DlBtn testid="report-dl-html" onClick={() => download("html")}>HTML</DlBtn>
                <DlBtn testid="report-dl-pdf" onClick={() => download("pdf")}>PDF</DlBtn>
                <DlBtn testid="report-dl-docx" onClick={() => download("docx")}>DOCX</DlBtn>
              </div>
            </div>
            <details data-testid="report-preview" className="mt-4" open={previewOpen} onToggle={(e) => setPreviewOpen(e.target.open)}>
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[#64748B]">Preview</summary>
              <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-2xl border border-[#F1F1FA] bg-[#FAFAFF] p-4 font-mono text-[11px] leading-relaxed text-[#0B0B18]">{report.markdown}</pre>
            </details>
          </div>
        )}

        {/* Supplementary downloads pointer */}
        <div data-testid="report-supp" className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Supplementary materials</p>
          <p className="mt-2 text-xs text-[#64748B]">
            Every figure and table from Modules 1-7 remains available for publication-quality export (SVG/PNG 300&600 dpi/TIFF/PDF/CSV/XLSX) directly from its module — the same content is referenced in the manuscript's Supplementary Tables section.
          </p>
        </div>
      </main>
    </WorkflowLayout>
  );
}

function SumCard({ testid, label, value, highlight }) {
  return (
    <div data-testid={testid} className={`rounded-2xl border p-3 ${highlight ? "border-[#5139ED]/30 bg-[#5139ED]/[0.04]" : "border-[#F1F1FA] bg-white"}`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-bold ${highlight ? "text-[#5139ED]" : "text-[#0B0B18]"}`}>{value}</p>
    </div>
  );
}

function DlBtn({ testid, children, onClick }) {
  return (
    <button data-testid={testid} onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED]">
      <Download className="h-3 w-3" /> {children}
    </button>
  );
}
