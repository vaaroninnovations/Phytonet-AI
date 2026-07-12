import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * Nine-step workflow shared by all modules. Compound Standardization is an
 * automatic backend step and does NOT appear here.
 */
export const WORKFLOW_STEPS = [
  { id: "plant-database", label: "Plant Database", route: "/phytonet-ai" },
  { id: "toxicity-prediction", label: "Toxicity Prediction", route: "/toxicity-prediction" },
  { id: "drug-likeness-screening", label: "Drug-Likeness Screening", route: "/drug-likeness" },
  { id: "target-prediction", label: "Target Prediction", route: "/target-prediction" },
  { id: "disease-target-identification", label: "Disease Target Identification", route: "/disease-target-identification" },
  { id: "network-analysis", label: "Network Analysis", route: "/network-analysis" },
  { id: "molecular-docking", label: "Molecular Docking", route: "/molecular-docking" },
  { id: "molecular-dynamics", label: "Molecular Dynamics", route: "/molecular-dynamics" },
  { id: "ai-scientific-report", label: "AI Scientific Report", route: "/ai-scientific-report" },
];

const stepIndex = (id) => WORKFLOW_STEPS.findIndex((s) => s.id === id);

const WorkflowContext = createContext(null);

export function WorkflowProvider({ children }) {
  const [completed, setCompleted] = useState({});

  const markComplete = useCallback((stepId) => {
    setCompleted((s) => (s[stepId] ? s : { ...s, [stepId]: true }));
  }, []);

  const markIncomplete = useCallback((stepId) => {
    setCompleted((s) => {
      if (!s[stepId]) return s;
      const { [stepId]: _, ...rest } = s;
      return rest;
    });
  }, []);

  const isCompleted = useCallback((stepId) => !!completed[stepId], [completed]);

  /**
   * A step is accessible if every step before it is completed. This locks
   * future steps until the current workflow position advances.
   */
  const isAccessible = useCallback(
    (stepId) => {
      const i = stepIndex(stepId);
      if (i < 0) return false;
      return WORKFLOW_STEPS.slice(0, i).every((s) => !!completed[s.id]);
    },
    [completed]
  );

  const completedIds = useMemo(
    () => Object.keys(completed).filter((k) => completed[k]),
    [completed]
  );

  const value = useMemo(
    () => ({
      steps: WORKFLOW_STEPS,
      completed,
      completedIds,
      isCompleted,
      isAccessible,
      markComplete,
      markIncomplete,
    }),
    [completed, completedIds, isCompleted, isAccessible, markComplete, markIncomplete]
  );

  return (
    <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
  );
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("useWorkflow must be used within a WorkflowProvider");
  return ctx;
}
