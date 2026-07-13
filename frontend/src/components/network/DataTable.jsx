import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";

/**
 * Sortable / searchable / filterable / paginated table.
 * Props:
 *   rows:    array of objects
 *   columns: [{ key, label, format?(v,r), sortable?=true, filterable?=false }]
 *   pageSize: default 25
 *   testidPrefix
 *   pinFirstColumn (bool)
 *   emptyMessage
 */
export function DataTable({
  rows,
  columns,
  pageSize = 25,
  testidPrefix = "dtbl",
  emptyMessage = "No rows to display.",
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [ps, setPs] = useState(pageSize);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [colFilters, setColFilters] = useState({}); // { key: value }

  const filtered = useMemo(() => {
    let r = rows || [];
    if (q) {
      const needle = q.toLowerCase();
      r = r.filter((row) =>
        columns.some((c) => {
          const v = row[c.key];
          if (v == null) return false;
          return String(Array.isArray(v) ? v.join(",") : v).toLowerCase().includes(needle);
        })
      );
    }
    for (const [key, val] of Object.entries(colFilters)) {
      if (val === "" || val == null) continue;
      const vv = String(val).toLowerCase();
      r = r.filter((row) => String(row[key] ?? "").toLowerCase().includes(vv));
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      r = [...r].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      });
    }
    return r;
  }, [rows, q, colFilters, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ps));
  const p = Math.min(page, totalPages);
  const pageRows = filtered.slice((p - 1) * ps, p * ps);

  const onHeaderClick = (col) => {
    if (col.sortable === false) return;
    if (sortKey === col.key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(col.key); setSortDir("asc"); }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
          <input
            data-testid={`${testidPrefix}-search`}
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search…"
            className="brand-focus w-56 rounded-full border border-[#E7E7F3] bg-white pl-8 pr-3 py-1.5 text-xs text-[#0B0B18]"
          />
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
          <span data-testid={`${testidPrefix}-count`}>
            {filtered.length} rows · page {p}/{totalPages}
          </span>
          <select
            data-testid={`${testidPrefix}-pagesize`}
            value={ps}
            onChange={(e) => { setPs(Number(e.target.value)); setPage(1); }}
            className="brand-focus rounded-full border border-[#E7E7F3] bg-white px-2 py-1 text-[10px] font-bold text-[#0B0B18]"
          >
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button
            data-testid={`${testidPrefix}-prev`}
            onClick={() => setPage((v) => Math.max(1, v - 1))}
            disabled={p <= 1}
            className="rounded-full border border-[#E7E7F3] bg-white px-2 py-1 disabled:opacity-40"
          >Prev</button>
          <button
            data-testid={`${testidPrefix}-next`}
            onClick={() => setPage((v) => Math.min(totalPages, v + 1))}
            disabled={p >= totalPages}
            className="rounded-full border border-[#E7E7F3] bg-white px-2 py-1 disabled:opacity-40"
          >Next</button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#F1F1FA] bg-white">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#E7E7F3] bg-[#FAFAFF]">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    data-testid={`${testidPrefix}-th-${c.key}`}
                    onClick={() => onHeaderClick(c)}
                    className={`sticky top-0 z-10 whitespace-nowrap bg-[#FAFAFF] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#64748B] ${
                      c.sortable !== false ? "cursor-pointer select-none hover:text-[#5139ED]" : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {c.sortable !== false && (
                        sortKey === c.key
                          ? sortDir === "asc"
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                          : <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
              {columns.some((c) => c.filterable) && (
                <tr className="border-b border-[#F1F1FA] bg-white">
                  {columns.map((c) => (
                    <th key={`${c.key}-f`} className="px-2 py-1">
                      {c.filterable ? (
                        <input
                          data-testid={`${testidPrefix}-filter-${c.key}`}
                          value={colFilters[c.key] || ""}
                          onChange={(e) => {
                            setColFilters((f) => ({ ...f, [c.key]: e.target.value }));
                            setPage(1);
                          }}
                          placeholder="filter…"
                          className="brand-focus w-full rounded border border-[#E7E7F3] bg-white px-2 py-0.5 text-[10px] text-[#0B0B18]"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-[#94A3B8]">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {pageRows.map((r, i) => (
                <tr key={r.__key || r.id || i} data-testid={`${testidPrefix}-row-${r.id || i}`} className="border-b border-[#F1F1FA] hover:bg-[#F8F8FE]">
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-2 align-top text-[12px] text-[#0B0B18]">
                      {c.format ? c.format(r[c.key], r) : r[c.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
