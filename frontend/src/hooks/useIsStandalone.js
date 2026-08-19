// Detect whether a workflow-aware module page is currently being viewed
// as a standalone tool (accessed directly from a homepage card) vs. as
// part of the guided PhytoNet AI Agent workflow.
//
// Truth table:
//   1. If the current pathname is a WORKFLOW_STEPS route → workflow mode
//      (standalone=false). Same page rendered inside the guided shell.
//   2. Otherwise → standalone mode.
//
// Every module page has TWO routes registered in App.js — one used inside
// the workflow (e.g. `/molecular-docking`) and a standalone alias used from
// homepage cards (e.g. `/dock`). Basing the truth on WORKFLOW_STEPS keeps
// the two sets disjoint and prevents accidental collisions when a workflow
// route also appeared in the (old) standalone list.
import { useLocation } from "react-router-dom";
import { useMemo } from "react";
import { WORKFLOW_STEPS } from "@/context/WorkflowContext";

const WORKFLOW_ROUTES = new Set(WORKFLOW_STEPS.map((s) => s.route));

/**
 * @returns {{ standalone: boolean, backHref: string }}
 *   standalone — true when the current route is NOT part of the guided workflow.
 *   backHref   — where the "back / done" button should point when standalone.
 */
export function useIsStandalone() {
  const { pathname } = useLocation();
  return useMemo(
    () => ({
      standalone: !WORKFLOW_ROUTES.has(pathname),
      backHref: "/#research-modules",
    }),
    [pathname]
  );
}
