import { Link, useLocation } from "react-router-dom";
import { CheckCircle2, Circle, Menu } from "lucide-react";
import { useState } from "react";

export const WORKFLOW_STEPS = [
  { id: "plant-database", label: "Plant Database" },
  { id: "compound-standardization", label: "Compound Standardization" },
  { id: "toxicity-prediction", label: "Toxicity Prediction" },
  { id: "drug-likeness-screening", label: "Drug-Likeness Screening" },
  { id: "target-prediction", label: "Target Prediction" },
  { id: "disease-target-identification", label: "Disease Target Identification" },
  { id: "network-analysis", label: "Network Analysis" },
  { id: "molecular-docking", label: "Molecular Docking" },
  { id: "molecular-dynamics", label: "Molecular Dynamics" },
  { id: "ai-scientific-report", label: "AI Scientific Report" },
];

/**
 * Fixed left sidebar for the PhytoNet AI workspace.
 * - Active step highlighted.
 * - Completed steps show a green check.
 * - Pending steps stay grey.
 * - Sidebar is sticky under the app header on md+ screens; on mobile it
 *   collapses into a top disclosure to avoid competing with the header.
 */
export default function WorkflowSidebar({
  activeId,
  completedIds = [],
  onStepClick,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isCompleted = (id) => completedIds.includes(id);

  const items = WORKFLOW_STEPS.map((s, idx) => {
    const active = s.id === activeId;
    const completed = isCompleted(s.id);
    return (
      <button
        key={s.id}
        data-testid={`workflow-step-${s.id}`}
        onClick={() => onStepClick && onStepClick(s.id)}
        className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          active
            ? "bg-[#5139ED]/10 text-[#5139ED]"
            : completed
            ? "text-[#0B0B18] hover:bg-[#F5F5FC]"
            : "text-[#64748B] hover:bg-[#F5F5FC] hover:text-[#0B0B18]"
        }`}
      >
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold ${
            active
              ? "bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_4px_10px_-4px_rgba(81,57,237,0.6)]"
              : completed
              ? "bg-emerald-500 text-white"
              : "bg-[#F1F1FA] text-[#64748B]"
          }`}
        >
          {completed ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            String(idx + 1).padStart(2, "0")
          )}
        </span>
        <span
          className={`flex-1 truncate text-[13px] font-medium ${
            active ? "font-semibold" : ""
          }`}
        >
          {s.label}
        </span>
        {active && (
          <span className="rounded-full bg-[#5139ED]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#5139ED]">
            Now
          </span>
        )}
      </button>
    );
  });

  return (
    <>
      {/* Mobile disclosure */}
      <div className="border-b border-[#E7E7F3] bg-white/90 px-4 py-3 md:hidden">
        <button
          data-testid="workflow-mobile-toggle"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-[#E7E7F3] bg-white px-4 py-2.5 text-sm font-semibold text-[#0B0B18]"
        >
          <span className="flex items-center gap-2">
            <Menu className="h-4 w-4" />
            Research Workflow
          </span>
          <span className="text-xs text-[#64748B]">
            {(activeId &&
              WORKFLOW_STEPS.find((s) => s.id === activeId)?.label) ||
              "Choose step"}
          </span>
        </button>
        {mobileOpen && (
          <div className="mt-3 space-y-1 rounded-2xl border border-[#E7E7F3] bg-white p-2">
            {items}
          </div>
        )}
      </div>

      {/* Desktop sticky sidebar */}
      <aside
        data-testid="workflow-sidebar"
        className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 flex-col overflow-y-auto border-r border-[#E7E7F3] bg-white/85 backdrop-blur-md md:flex"
      >
        <div className="px-5 pb-3 pt-6">
          <p className="font-heading text-[10px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            PhytoNet AI Scientist
          </p>
          <h2 className="mt-1 font-display text-xl font-bold text-[#0B0B18]">
            Research Workflow
          </h2>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pb-6">{items}</nav>
        <div className="border-t border-[#E7E7F3] px-5 py-4 text-[11px] text-[#64748B]">
          Follow each step to build a complete, reproducible network
          pharmacology study.
        </div>
      </aside>
    </>
  );
}
