// Reusable 3-state sortable-column hook + <SortableTh /> component.
//
// Click cycle per column:
//   1st click → ascending  (↑)
//   2nd click → descending (↓)
//   3rd click → default    (⇅  — original order)
//
// Sorting is type-aware: numbers compare numerically, strings use
// `localeCompare` with numeric option so "AKT1" < "AKT2" < "AKT10".
// Null / undefined values always sort to the END regardless of direction.
//
// Sorting happens on whatever rows array you pass in — so it composes
// naturally with upstream search / filter / pagination.

import { useMemo, useState } from "react";

/**
 * @param {Array} rows                    Rows to sort (post-filter, post-search).
 * @param {Object<string,(row)=>any>} accessors Optional key → accessor map.
 *        If a column id maps to a computed value, provide an accessor.
 *        Otherwise the hook reads `row[id]`.
 * @param {{key: string|null, dir: 'asc'|'desc'|null}} initial Optional initial sort.
 * @returns {{sortedRows, sortKey, sortDir, onSort, resetSort}}
 */
export function useSortable(rows, accessors = {}, initial = { key: null, dir: null }) {
  const [state, setState] = useState(initial);

  const onSort = (key) => {
    setState((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: null };
    });
  };
  const resetSort = () => setState({ key: null, dir: null });

  const sortedRows = useMemo(() => {
    if (!state.key || !state.dir) return rows;
    const acc =
      accessors[state.key] ||
      ((r) => (r == null ? undefined : r[state.key]));
    const sign = state.dir === "asc" ? 1 : -1;
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      // Nulls always to the end
      const aNull = va == null || Number.isNaN(va);
      const bNull = vb == null || Number.isNaN(vb);
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * sign;
      }
      if (typeof va === "boolean" && typeof vb === "boolean") {
        return (Number(va) - Number(vb)) * sign;
      }
      // Date-ish (numeric timestamp) or ISO string sortable via localeCompare
      return (
        String(va).localeCompare(String(vb), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * sign
      );
    });
    return arr;
  }, [rows, state.key, state.dir, accessors]);

  return { sortedRows, sortKey: state.key, sortDir: state.dir, onSort, resetSort };
}

/**
 * <SortableTh> — table header cell wired to `useSortable`.
 * Renders the caption + a subtle sort arrow that fills in when active.
 */
export function SortableTh({
  id,
  sortKey,
  sortDir,
  onSort,
  children,
  className = "",
  sticky = false,
  align = "left",
  testid,
}) {
  const active = sortKey === id;
  const arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "⇅";
  return (
    <th
      data-testid={testid || `sortable-${id}`}
      onClick={() => onSort(id)}
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-3 text-${align} text-[10px] font-bold uppercase tracking-widest text-[#64748B] transition-colors hover:text-[#5139ED] ${
        sticky ? "sticky top-0 z-10 bg-[#FAFAFF]" : ""
      } ${className}`}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span
          data-testid={`sort-arrow-${id}`}
          className={`inline-block min-w-[10px] text-[10px] leading-none ${
            active ? "font-bold text-[#5139ED]" : "text-[#B4B4CD] opacity-60"
          }`}
        >
          {arrow}
        </span>
      </span>
    </th>
  );
}
