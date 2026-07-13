// Cross-page state for the Compound → Target → Disease → Network workflow.
// Holds the outputs of Steps 3 & 4 so Step 5 (Network Analysis) can build the
// tripartite graph without any additional user upload.

import { createContext, useContext, useMemo, useState } from "react";

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [selectedCompounds, setSelectedCompounds] = useState([]);
  const [compoundTargets, setCompoundTargets] = useState([]);
  const [diseaseTargets, setDiseaseTargets] = useState([]);
  const [selectedDisease, setSelectedDisease] = useState(null);
  const [plantName, setPlantName] = useState("");
  const [selectedKeggPathways, setSelectedKeggPathways] = useState([]);
  // Additional cross-workflow data used by Docking + MD + Report:
  const [intersectingGenes, setIntersectingGenes] = useState([]);
  const [hubScores, setHubScores] = useState([]);        // combinedHubScores() output
  const [ppiResult, setPpiResult] = useState(null);      // {nodes, edges}
  const [goTerms, setGoTerms] = useState([]);            // g:Profiler result rows
  const [dockingResults, setDockingResults] = useState(null); // {job_id, results}
  const [mdConfig, setMdConfig] = useState(null);
  const value = useMemo(
    () => ({
      selectedCompounds, setSelectedCompounds,
      compoundTargets, setCompoundTargets,
      diseaseTargets, setDiseaseTargets,
      selectedDisease, setSelectedDisease,
      plantName, setPlantName,
      selectedKeggPathways, setSelectedKeggPathways,
      intersectingGenes, setIntersectingGenes,
      hubScores, setHubScores,
      ppiResult, setPpiResult,
      goTerms, setGoTerms,
      dockingResults, setDockingResults,
      mdConfig, setMdConfig,
    }),
    [selectedCompounds, compoundTargets, diseaseTargets, selectedDisease, plantName,
     selectedKeggPathways, intersectingGenes, hubScores, ppiResult, goTerms,
     dockingResults, mdConfig]
  );
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
