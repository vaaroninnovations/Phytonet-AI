// WorkflowInfoCard — sticky glass-morphism informational side panel shown on
// every STANDALONE module page (Plant Database, ADMET, Target Prediction,
// Disease Targets, Molecular Docking). It explains what the module does and
// tracks the researcher's progress through a 6-step template:
//
//   1. Input           2. Data Validation      3. Processing
//   4. Analysis        5. Results              6. Download / Export
//
// The card is:
//   • sticky on desktop (visible while the researcher scrolls the main pane),
//   • collapsible on mobile (opens/closes via a chevron toggle),
//   • purely frontend — it consumes props only and never mutates page state.
//
// Contract (pass via WorkflowLayout `moduleInfo` prop):
//   moduleInfo = {
//     title:       string,   // e.g. "Molecular Docking"
//     moduleTag:   string,   // e.g. "Module · 06" (optional)
//     description: string,   // 2-3 sentence blurb
//     databases:   string[], // supported databases / algorithms (optional)
//   }
//   currentStep = 0..5       // zero-based index of the active step

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Circle,
  Database,
  Download as DownloadIcon,
  FileSearch,
  FlaskConical,
  Play,
  Sparkles,
  TableProperties,
} from "lucide-react";

// Default 6-step workflow template — same across every standalone module so
// researchers immediately recognise where they are, regardless of the tool.
export const DEFAULT_STEPS = [
  { key: "input",      label: "Input",              icon: Play },
  { key: "validate",   label: "Data Validation",    icon: FileSearch },
  { key: "process",    label: "Processing",         icon: FlaskConical },
  { key: "analyze",    label: "Analysis",           icon: Sparkles },
  { key: "results",    label: "Results",            icon: TableProperties },
  { key: "download",   label: "Download / Export",  icon: DownloadIcon },
];

export default function WorkflowInfoCard({
  title,
  moduleTag,
  description,
  databases = [],
  steps = DEFAULT_STEPS,
  currentStep = 0,
}) {
  const [openMobile, setOpenMobile] = useState(false);
  const activeIdx = Math.max(0, Math.min(steps.length - 1, currentStep));
  const progressLabel = `Step ${activeIdx + 1} of ${steps.length}`;
  const progressPct = useMemo(
    () => Math.round(((activeIdx + 1) / steps.length) * 100),
    [activeIdx, steps.length]
  );

  return (
    <div
      data-testid="workflow-info-card"
      className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-[0_20px_60px_-30px_rgba(81,57,237,0.35)] backdrop-blur-xl"
    >
      {/* Subtle glass gradient overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(129,57,237,0.10),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(57,90,237,0.08),transparent_55%)]"
      />

      <div className="relative p-5 sm:p-6">
        {/* Header — module tag + title. Doubles as the mobile collapse toggle. */}
        <button
          type="button"
          data-testid="workflow-info-card-toggle"
          onClick={() => setOpenMobile((o) => !o)}
          className="flex w-full items-start justify-between gap-3 text-left md:pointer-events-none"
          aria-expanded={openMobile}
        >
          <div className="min-w-0">
            {moduleTag && (
              <p className="font-heading text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                {moduleTag}
              </p>
            )}
            <h2
              data-testid="workflow-info-card-title"
              className="mt-1 font-display text-[17px] font-bold leading-tight tracking-tight text-[#0B0B18] sm:text-lg"
            >
              {title}
            </h2>
          </div>
          {/* Chevron — visible only on mobile */}
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#5139ED]/10 text-[#5139ED] md:hidden"
          >
            {openMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {/* Progress ribbon — always visible so users see the step count even
            when the body is collapsed on mobile. */}
        <div className="mt-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">
              <span data-testid="workflow-info-card-progress-label">{progressLabel}</span>
              <span className="text-[#64748B]">{progressPct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F1FA]">
              <div
                data-testid="workflow-info-card-progress-bar"
                className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] transition-[width] duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Body — hidden on mobile when collapsed. Desktop always shows it. */}
        <div className={`${openMobile ? "block" : "hidden"} md:block`}>
          {description && (
            <p className="mt-4 text-[13px] leading-relaxed text-[#374151]">
              {description}
            </p>
          )}

          {/* Vertical timeline */}
          <ol
            data-testid="workflow-info-card-steps"
            className="relative mt-5 space-y-3 border-l border-dashed border-[#E7E7F3] pl-6"
          >
            {steps.map((step, i) => {
              const Icon = step.icon || Circle;
              const isDone = i < activeIdx;
              const isActive = i === activeIdx;
              const iconWrap = isActive
                ? "bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_8px_24px_-6px_rgba(81,57,237,0.55)]"
                : isDone
                ? "bg-[#5139ED]/12 text-[#5139ED]"
                : "bg-[#F1F1FA] text-[#94A3B8]";
              const labelClr = isActive
                ? "text-[#0B0B18]"
                : isDone
                ? "text-[#374151]"
                : "text-[#94A3B8]";
              return (
                <li
                  key={step.key}
                  data-testid={`workflow-info-card-step-${step.key}`}
                  data-active={isActive || undefined}
                  data-done={isDone || undefined}
                  className="relative"
                >
                  {/* Marker — sits on the timeline rail */}
                  <span
                    className={`absolute -left-[38px] top-0.5 grid h-7 w-7 place-items-center rounded-full ring-4 ring-white ${iconWrap}`}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className={`font-mono text-[10px] font-bold ${isActive ? "text-[#5139ED]" : "text-[#B4B4CD]"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`text-[13px] font-semibold ${labelClr}`}>
                      {step.label}
                    </span>
                  </div>
                  {isActive && step.hint && (
                    <p className="mt-1 text-[11.5px] leading-snug text-[#5139ED]/80">{step.hint}</p>
                  )}
                </li>
              );
            })}
          </ol>

          {/* Supported databases / algorithms */}
          {databases.length > 0 && (
            <div className="mt-6 border-t border-[#F1F1FA] pt-4">
              <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-widest text-[#5139ED]">
                <Database className="h-3 w-3" />
                Supported databases / algorithms
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {databases.map((d) => (
                  <span
                    key={d}
                    data-testid={`workflow-info-card-db-${d}`}
                    className="inline-flex items-center rounded-md border border-[#E7E7F3] bg-white/60 px-2 py-0.5 text-[11px] font-medium text-[#0B0B18]"
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
