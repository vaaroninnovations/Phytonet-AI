// WorkflowProceedBar — the one sticky bottom bar used across every workflow
// module (Disease Targets, Molecular Docking, ...). Consistent visual
// language: pill-shaped glass card, gradient icon chip on the left with a
// bold label and optional sub-line, one primary gradient CTA on the right,
// plus optional Back / secondary buttons in-between.
//
// Callers pass their own testid so each usage stays discoverable.
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function WorkflowProceedBar({
  testid = "workflow-proceed-bar",
  icon: Icon,
  label,
  sub,
  backHref,
  backLabel = "Back",
  secondary,               // { label, onClick, disabled, testid, icon }
  primary,                 // { label, to?, onClick?, disabled, testid, icon }
}) {
  const primaryHref = primary?.to;
  return (
    <div
      data-testid={testid}
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex w-full max-w-4xl flex-col items-center justify-between gap-3 rounded-full border border-[#E7E7F3] bg-white/95 px-4 py-2.5 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)] backdrop-blur-xl md:flex-row">
        {/* Left cluster — icon + label */}
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <div className="font-heading truncate text-[13.5px] font-semibold text-[#0B0B18]">
              {label}
            </div>
            {sub && (
              <div className="truncate text-[11px] text-[#64748B]">{sub}</div>
            )}
          </div>
        </div>

        {/* Right cluster — back / secondary / primary */}
        <div className="flex items-center gap-2">
          {backHref && (
            <Link
              data-testid={`${testid}-back`}
              to={backHref}
              className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-[11.5px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          )}
          {secondary && (
            <button
              type="button"
              data-testid={secondary.testid}
              onClick={secondary.onClick}
              disabled={secondary.disabled}
              className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] px-3.5 py-2 text-[11.5px] font-semibold text-[#64748B] hover:border-red-500/40 hover:text-red-500 disabled:pointer-events-none disabled:opacity-40"
            >
              {secondary.icon && <secondary.icon className="h-3 w-3" />}
              {secondary.label}
            </button>
          )}
          {primary && (
            primaryHref ? (
              <Link
                data-testid={primary.testid}
                to={primaryHref}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(81,57,237,0.6)] transition-all hover:-translate-y-0.5"
              >
                {primary.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <button
                type="button"
                data-testid={primary.testid}
                onClick={primary.onClick}
                disabled={primary.disabled}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(81,57,237,0.6)] transition-all hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              >
                {primary.label}
                <ArrowRight className="h-4 w-4" />
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
