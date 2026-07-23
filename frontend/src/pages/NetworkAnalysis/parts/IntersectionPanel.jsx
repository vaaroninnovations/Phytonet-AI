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
            <CustomizeFigureButton chartType="venn" testid="customize-figure-venn" />
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

export { IntersectionPanel };
