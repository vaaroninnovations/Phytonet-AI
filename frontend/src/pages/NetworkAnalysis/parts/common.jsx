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

const SUBSECTIONS = [
  { id: "intersection", label: "Target Intersection Analysis", icon: Target },
  { id: "ppi", label: "Protein–Protein Interaction", icon: Network },
  { id: "hubs", label: "Hub Gene Analysis", icon: Waypoints },
  { id: "go", label: "GO Enrichment", icon: Layers },
  { id: "kegg", label: "KEGG Pathway Enrichment", icon: Activity },
  { id: "pctdp", label: "PCTDP Integrative Network", icon: Sparkles },
];

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

export { SUBSECTIONS, SubsectionNav, Stat, DlBtn, PlaceholderPanel };
