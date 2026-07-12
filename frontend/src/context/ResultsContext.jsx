import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { compoundKey } from "@/context/SelectionContext";

const ResultsContext = createContext(null);

/**
 * Shared results state consumed by the PlantDatabase table. It replaces the
 * page-local `compounds`/`meta` state so multiple producers (plant search,
 * LOTUS wrappers, LC-MS upload+enrichment) can populate the SAME existing
 * table without any UI refactor.
 */
export function ResultsProvider({ children }) {
  const [compounds, setCompoundsState] = useState([]);
  const [meta, setMetaState] = useState(null);
  const [source, setSourceState] = useState(null); // "plant" | "lotus" | "lcms"

  const setResults = useCallback((next, nextMeta = null, nextSource = null) => {
    setCompoundsState(next || []);
    setMetaState(nextMeta);
    setSourceState(nextSource);
  }, []);

  const clearResults = useCallback(() => {
    setCompoundsState([]);
    setMetaState(null);
    setSourceState(null);
  }, []);

  /**
   * Patch a single row identified by compound key (imppat_id/lotus_id/inchi_key/name).
   * Used by manual SMILES edits on LC-MS rows.
   */
  const updateCompound = useCallback((key, patch) => {
    setCompoundsState((rows) =>
      rows.map((r) => (compoundKey(r) === key ? { ...r, ...patch } : r))
    );
  }, []);

  const value = useMemo(
    () => ({
      compounds,
      meta,
      source,
      setResults,
      clearResults,
      updateCompound,
    }),
    [compounds, meta, source, setResults, clearResults, updateCompound]
  );

  return (
    <ResultsContext.Provider value={value}>{children}</ResultsContext.Provider>
  );
}

export function useResults() {
  const ctx = useContext(ResultsContext);
  if (!ctx) throw new Error("useResults must be used within a ResultsProvider");
  return ctx;
}
