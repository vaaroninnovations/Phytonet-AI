import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Wrench } from "lucide-react";
import { useWorkflow, WORKFLOW_STEPS } from "@/context/WorkflowContext";

/**
 * Reusable placeholder for workflow modules that aren't fully built out yet.
 * Renders inside the shared WorkflowLayout. Marks the previous step as
 * completed on mount (so this step becomes accessible) and provides a
 * "Continue" button that marks THIS step complete and moves forward.
 */
export default function WorkflowModulePage({
  stepId,
  title,
  subtitle,
  description,
}) {
  const navigate = useNavigate();
  const { markComplete, isCompleted } = useWorkflow();

  // Mark previous steps as completed automatically so the sidebar reflects
  // real progress when the user arrives here from an unlocked path.
  useEffect(() => {
    const idx = WORKFLOW_STEPS.findIndex((s) => s.id === stepId);
    for (let i = 0; i < idx; i++) markComplete(WORKFLOW_STEPS[i].id);
  }, [stepId, markComplete]);

  const idx = WORKFLOW_STEPS.findIndex((s) => s.id === stepId);
  const next = WORKFLOW_STEPS[idx + 1];

  const onContinue = () => {
    markComplete(stepId);
    if (next) navigate(next.route);
  };

  return (
    <main
      data-testid={`module-${stepId}`}
      className="mx-auto max-w-4xl px-6 pb-24 pt-14"
    >
      <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
        Module · {String(idx + 1).padStart(2, "0")}
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-3 font-heading text-lg font-semibold text-[#1E1E33]">
          {subtitle}
        </p>
      )}
      {description && (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#64748B]">
          {description}
        </p>
      )}

      <div className="mt-10 rounded-3xl border border-[#E7E7F3] bg-white p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
            <Wrench className="h-5 w-5" />
          </span>
          <div>
            <p className="font-heading text-base font-semibold text-[#0B0B18]">
              {isCompleted(stepId) ? "Ready to revisit" : "Module in development"}
            </p>
            <p className="mt-1 text-sm text-[#64748B]">
              The full implementation is coming soon. Your selected compounds
              are ready and standardized — mark this step complete to continue
              the pipeline.
            </p>
          </div>
        </div>

        {next && (
          <div className="mt-8 flex justify-end">
            <button
              data-testid={`continue-${stepId}`}
              onClick={onContinue}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Mark complete &amp; continue to {next.label}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
        {!next && (
          <div className="mt-8 flex justify-end">
            <button
              data-testid={`continue-${stepId}`}
              onClick={() => markComplete(stepId)}
              className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Mark workflow complete
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
