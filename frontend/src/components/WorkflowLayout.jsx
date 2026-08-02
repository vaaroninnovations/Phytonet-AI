import WorkflowSidebar from "@/components/WorkflowSidebar";
import WorkflowInfoCard from "@/components/WorkflowInfoCard";
import { useIsStandalone } from "@/hooks/useIsStandalone";

/**
 * Shared layout for every workflow module page.
 *
 * Three rendering modes:
 *  1. Guided workflow (default)      → persistent left step-tracker sidebar
 *     rendered by <WorkflowSidebar />, children fill the rest.
 *  2. Standalone + moduleInfo         → two-column responsive layout with a
 *     sticky <WorkflowInfoCard /> on the left (25-30%) explaining the module
 *     and highlighting the current step, and the existing module UI on the
 *     right (70-75%). On mobile the card stacks above the content and can be
 *     collapsed via a chevron toggle.
 *  3. Standalone (no moduleInfo)      → children fill the whole viewport
 *     (used only by legacy pages that haven't opted into the info card yet).
 *
 *  @param {object}   props
 *  @param {ReactNode} props.children
 *  @param {object=}  props.moduleInfo   { title, moduleTag, description, databases }
 *  @param {number=}  props.currentStep  0-based active step index (0..5 default)
 *  @param {Array=}   props.steps        custom step timeline (optional)
 */
export default function WorkflowLayout({ children, moduleInfo, currentStep, steps }) {
  const { standalone } = useIsStandalone();

  if (standalone) {
    if (moduleInfo) {
      return (
        <div
          data-testid="workflow-layout"
          data-standalone="true"
          data-has-info-card="true"
          className="min-h-[calc(100vh-4rem)]"
        >
          <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 md:flex-row md:gap-6 md:px-6 md:py-8">
            {/* Left column — sticky info card on desktop, top on mobile */}
            <aside
              data-testid="workflow-info-card-wrap"
              className="md:sticky md:top-24 md:h-[calc(100vh-7rem)] md:w-[300px] md:shrink-0 md:overflow-y-auto lg:w-[320px] xl:w-[340px]"
            >
              <WorkflowInfoCard {...moduleInfo} currentStep={currentStep} steps={steps} />
            </aside>

            {/* Right column — existing module UI, fills remaining width */}
            <div data-testid="workflow-main" className="min-w-0 flex-1">
              {children}
            </div>
          </div>
        </div>
      );
    }
    // Standalone, no info card — legacy full-width fallback.
    return (
      <div
        data-testid="workflow-layout"
        data-standalone="true"
        className="min-h-[calc(100vh-4rem)]"
      >
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  // Guided PhytoNet AI workflow — persistent sidebar on the left.
  return (
    <div
      data-testid="workflow-layout"
      className="flex min-h-[calc(100vh-4rem)] flex-col md:flex-row"
    >
      <WorkflowSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
