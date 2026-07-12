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
  const [selection, setSelection] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  });
  const [sourcePlant, setSourcePlant] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY + ".plant") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    } catch {
      /* ignore quota errors */
    }
  }, [selection]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY + ".plant", sourcePlant || "");
    } catch {
      /* ignore */
    }
  }, [sourcePlant]);

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
