// TableCard — generic sortable/download-friendly table used by every
// tabular result (compounds, targets, diseases, ADMET rows, …).
import { useMemo } from "react";
import { FileText, FileSpreadsheet, FileJson } from "lucide-react";
import { downloadCsv, downloadExcel, downloadJson } from "./_helpers";

export function TableCard({ testid, title, rows, columns, downloadBase, subtitle, onOpen, groups }) {
  const total = rows.length;
  const fullColumns = useMemo(() => {
    const seen = new Map();
    for (const c of columns) seen.set(c.key, c.label);
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) seen.set(k, k);
      }
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rows, columns]);
  return (
    <div data-testid={testid}
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-sm p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-semibold text-slate-100">{title}</div>
            <span data-testid={`${testid}-count`}
                  className="rounded-full bg-[#5139ED]/20 border border-[#5139ED]/40 px-2 py-0.5 text-[10.5px] font-semibold text-[#a48bff]">
              {total} {total === 1 ? "row" : "rows"}
            </span>
            {fullColumns.length > columns.length && (
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
                {fullColumns.length} cols in export
              </span>
            )}
          </div>
          {subtitle && <div className="mt-0.5 text-[11px] text-slate-400">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          {downloadBase && (
            <>
              <button onClick={() => downloadCsv(rows, fullColumns, `${downloadBase}.csv`)}
                      data-testid={`${testid}-download-csv`}
                      title={`Download full ${fullColumns.length}-column CSV`}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileText size={11} /> CSV
              </button>
              <button onClick={() => downloadExcel(rows, fullColumns, `${downloadBase}.xlsx`, title)}
                      data-testid={`${testid}-download-xlsx`}
                      title={`Download full ${fullColumns.length}-column Excel`}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileSpreadsheet size={11} /> Excel
              </button>
              <button onClick={() => downloadJson(rows, `${downloadBase}.json`)}
                      data-testid={`${testid}-download-json`}
                      title="Download raw JSON"
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
                <FileJson size={11} /> JSON
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 max-h-[420px] overflow-y-auto overflow-x-auto rounded-lg border border-white/5 bg-black/20">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-black/70 backdrop-blur-sm z-10">
            {groups && groups.length > 0 && (
              <tr className="border-b border-white/10">
                {groups.map((g, i) => (
                  <th key={i}
                      colSpan={g.span}
                      className={`text-left py-1.5 px-3 text-[10.5px] font-bold uppercase tracking-widest ${g.className || "text-slate-300"}`}>
                    {g.label}
                  </th>
                ))}
              </tr>
            )}
            <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-white/10">
              {columns.map((c) => (
                <th key={c.key}
                    title={c.tooltip || c.label}
                    className="text-left py-2 px-3 font-semibold cursor-help">
                  <span className="border-b border-dotted border-slate-500/60">
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                {columns.map((c) => (
                  <td key={c.key} className="py-1.5 px-3 text-slate-200 truncate max-w-[240px]">
                    {c.render ? c.render(r) : (r[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-6 text-center text-xs text-slate-500">No data returned.</div>
        )}
      </div>
      {rows.length > 8 && (
        <div className="mt-2 text-right text-[10.5px] text-slate-500">
          Scroll inside the table to see all {rows.length} rows.
        </div>
      )}
    </div>
  );
}
