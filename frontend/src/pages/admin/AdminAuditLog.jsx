import { useEffect, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import { Search, Filter, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_COLOR = {
  success: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  failure: "text-red-300 bg-red-500/10 border-red-500/30",
};

export default function AdminAuditLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (q) params.q = q;
      if (status) params.status = status;
      const { data } = await adminApi.get("/audit-log", { params });
      setRows(data.rows); setTotal(data.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [offset, status]);

  return (
    <div className="space-y-6" data-testid="admin-audit-log">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-slate-400 mt-1">Every admin action is recorded here.</p>
      </header>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            data-testid="audit-search-input"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setOffset(0); load(); } }}
            placeholder="Search action, actor, or target…"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm focus:border-amber-500/50 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            data-testid="audit-status-filter"
            value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}
            className="py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
          <button
            data-testid="audit-refresh-btn"
            onClick={() => { setOffset(0); load(); }}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-950/60">
            <tr>
              <th className="text-left px-4 py-3">Timestamp</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Actor</th>
              <th className="text-left px-4 py-3">Target</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody data-testid="audit-log-body">
            {loading && (
              <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-400">
                <Loader2 className="animate-spin inline mr-2" size={14}/> Loading…
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-10 text-center text-slate-500">No entries.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                <td className="px-4 py-3 text-slate-300 tabular-nums whitespace-nowrap">
                  {new Date(r.at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-amber-200">{r.action}</span>
                </td>
                <td className="px-4 py-3 text-slate-300">{r.actor_email || "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{r.target || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded border text-xs ${STATUS_COLOR[r.status] || ""}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{r.ip || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>{total} total entries</div>
        <div className="flex items-center gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tabular-nums">{offset + 1} – {Math.min(offset + limit, total)}</span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
