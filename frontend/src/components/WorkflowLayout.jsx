import WorkflowSidebar from "@/components/WorkflowSidebar";

/**
 * Shared layout for every workflow module page — renders the persistent
 * sidebar on the left with the module content on the right.
 */
export default function WorkflowLayout({ children }) {
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
