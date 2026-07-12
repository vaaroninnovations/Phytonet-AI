import WorkflowLayout from "@/components/WorkflowLayout";
import WorkflowModulePage from "@/pages/WorkflowModulePage";

const MODULE_CONFIG = {
  "toxicity-prediction": {
    title: "Toxicity Prediction",
    subtitle: "ProTox 3.0 & ADMETlab hazard screening",
    description:
      "Screen selected compounds for acute toxicity, hepatotoxicity, mutagenicity and cardiotoxicity before advancing to drug-likeness.",
  },
  "target-prediction": {
    title: "Target Prediction",
    subtitle: "SwissTargetPrediction & STITCH",
    description:
      "Infer the most probable protein targets for each screened compound using ligand-similarity models.",
  },
  "disease-target-identification": {
    title: "Disease Target Identification",
    subtitle: "DisGeNET · OMIM · TTD",
    description:
      "Cross-reference predicted targets with curated disease-gene associations to focus on translationally relevant hits.",
  },
  "network-analysis": {
    title: "Network Analysis",
    subtitle: "Compound–target–disease graphs",
    description:
      "Construct the multi-partite network, identify hubs, and score topology metrics for enrichment.",
  },
  "molecular-docking": {
    title: "Molecular Docking",
    subtitle: "AutoDock Vina virtual screening",
    description:
      "Dock the shortlist against top targets, ranking by binding affinity and pose quality.",
  },
  "molecular-dynamics": {
    title: "Molecular Dynamics",
    subtitle: "GROMACS trajectories",
    description:
      "Refine top docking hits with atomistic MD, extracting RMSD, RMSF and binding stability profiles.",
  },
  "ai-scientific-report": {
    title: "AI Scientific Report",
    subtitle: "Auto-drafted narrative + figures",
    description:
      "Assemble the full manuscript: methods, results, publication-quality figures and references.",
  },
};

function ModuleRoute({ stepId }) {
  const cfg = MODULE_CONFIG[stepId];
  return (
    <WorkflowLayout>
      <WorkflowModulePage
        stepId={stepId}
        title={cfg.title}
        subtitle={cfg.subtitle}
        description={cfg.description}
      />
    </WorkflowLayout>
  );
}

export const ToxicityPrediction = () => <ModuleRoute stepId="toxicity-prediction" />;
export const TargetPrediction = () => <ModuleRoute stepId="target-prediction" />;
export const DiseaseTargetIdentification = () => (
  <ModuleRoute stepId="disease-target-identification" />
);
export const NetworkAnalysis = () => <ModuleRoute stepId="network-analysis" />;
export const MolecularDocking = () => <ModuleRoute stepId="molecular-docking" />;
export const MolecularDynamics = () => <ModuleRoute stepId="molecular-dynamics" />;
export const AIScientificReport = () => <ModuleRoute stepId="ai-scientific-report" />;
