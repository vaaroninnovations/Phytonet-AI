// Cross-page state for the Compound → Target → Disease → Network workflow.
// Holds the outputs of Steps 3 & 4 so Step 5 (Network Analysis) can build the
// tripartite graph without any additional user upload.

import { createContext, useContext, useMemo, useState } from "react";

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [selectedCompounds, setSelectedCompounds] = useState([]); // incoming from ADMET
  const [compoundTargets, setCompoundTargets] = useState([]); // final selected rows
  const [diseaseTargets, setDiseaseTargets] = useState([]); // final selected rows
  const [selectedDisease, setSelectedDisease] = useState(null); // {efo_id, name}
  const [plantName, setPlantName] = useState(""); // set on Plant Database
  const [selectedKeggPathways, setSelectedKeggPathways] = useState([]); // set on KEGG panel
  const value = useMemo(
    () => ({
      selectedCompounds,
      setSelectedCompounds,
      compoundTargets,
      setCompoundTargets,
      diseaseTargets,
      setDiseaseTargets,
      selectedDisease,
      setSelectedDisease,
      plantName,
      setPlantName,
      selectedKeggPathways,
      setSelectedKeggPathways,
    }),
    [selectedCompounds, compoundTargets, diseaseTargets, selectedDisease, plantName, selectedKeggPathways]
  );
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within NetworkProvider");
  return ctx;
}
