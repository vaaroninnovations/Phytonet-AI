// Detect whether a workflow-aware module page is currently being viewed
// as a standalone tool (accessed directly from a homepage card) vs. as
// part of the guided PhytoNet AI Agent workflow.
//
// The set of "standalone" routes is defined once here so every module
// page checks against the same truth table.
import { useLocation } from "react-router-dom";
import { useMemo } from "react";

const STANDALONE_ROUTES = new Set([
  "/plant-database",
  "/admet",
  "/drug-likeness",
  "/compound-target-prediction",
  "/disease-target-prediction",
]);

/**
 * @returns {{ standalone: boolean, backHref: string }}
 *   standalone — true when the current route is a standalone module URL.
 *   backHref  — where the "back / done" button should point when standalone.
 */
export function useIsStandalone() {
  const { pathname } = useLocation();
  return useMemo(
    () => ({
      standalone: STANDALONE_ROUTES.has(pathname),
      backHref: "/#research-modules",
    }),
    [pathname]
  );
}
