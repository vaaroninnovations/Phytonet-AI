import WorkflowSidebar from "@/components/WorkflowSidebar";
import { useIsStandalone } from "@/hooks/useIsStandalone";

/**
 * Shared layout for every workflow module page.
 *
 * When rendered as part of the guided PhytoNet AI Agent workflow it shows
 * the persistent step-tracker sidebar on the left. When the same page is
 * accessed as a *standalone* module (Plant Database, ADMET, etc. opened
 * directly from a homepage card) the sidebar is hidden and the page takes
 * the full width — no workflow context leaks into the standalone view.
 */
export default function WorkflowLayout({ children }) {
  const { standalone } = useIsStandalone();

  if (standalone) {
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
