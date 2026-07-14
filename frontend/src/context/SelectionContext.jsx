import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "drSlash.selection.v1";

const SelectionContext = createContext(null);

export function compoundKey(c) {
  if (!c) return "";
  return (
    c.imppat_id ||
    c.lotus_id ||
    c.inchi_key ||
    `n:${(c.compound_name || "").trim().toLowerCase()}`
  );
}

export function SelectionProvider({ children }) {
  // Selections are intentionally NOT persisted across page reloads or between
  // searches. A fresh page load starts with an empty selection; each new
  // /api/plant/search call clears the previous selection (handled by
  // PlantDatabase). This prevents stale cross-search counts.
  const [selection, setSelection] = useState({});
  const [sourcePlant, setSourcePlant] = useState("");

  useEffect(() => {
    // Purge any stale legacy-persisted selections (previous versions of the app
    // wrote to localStorage — clear on first mount so old data can't resurface).
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + ".plant");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback((compound) => {
    setSelection((prev) => {
      const k = compoundKey(compound);
      if (!k) return prev;
      if (prev[k]) {
        const { [k]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [k]: compound };
    });
  }, []);

  const setMany = useCallback((compounds, on) => {
    setSelection((prev) => {
      const next = { ...prev };
      compounds.forEach((c) => {
        const k = compoundKey(c);
        if (!k) return;
        if (on) next[k] = c;
        else delete next[k];
      });
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (compound) => Boolean(selection[compoundKey(compound)]),
    [selection]
  );

  const clear = useCallback(() => setSelection({}), []);

  // Snapshot helpers for ProjectContext save/restore.
  const getAllSelections = useCallback(() => ({ ...selection }), [selection]);
  const replaceAllSelections = useCallback((snapshot) => {
    setSelection(snapshot && typeof snapshot === "object" ? { ...snapshot } : {});
  }, []);

  const selectedIds = useMemo(() => Object.keys(selection), [selection]);
  const selectedCompounds = useMemo(() => Object.values(selection), [selection]);
  const count = selectedIds.length;

  const value = useMemo(
    () => ({
      selection,
      selectedIds,
      selectedCompounds,
      count,
      isSelected,
      toggle,
      setMany,
      clear,
      getAllSelections,
      replaceAllSelections,
      sourcePlant,
      setSourcePlant,
    }),
    [
      selection,
      selectedIds,
      selectedCompounds,
      count,
      isSelected,
      toggle,
      setMany,
      clear,
      getAllSelections,
      replaceAllSelections,
      sourcePlant,
    ]
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx)
    throw new Error("useSelection must be used within a SelectionProvider");
  return ctx;
}
