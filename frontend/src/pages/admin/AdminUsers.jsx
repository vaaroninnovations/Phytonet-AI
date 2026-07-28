import { useEffect, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import { Search, Loader2, ChevronLeft, ChevronRight, ShieldCheck, CheckCircle2, XCircle, Ban } from "lucide-react";
import UserDetailModal from "./UserDetailModal";

export default function AdminUsers() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [verified, setVerified] = useState("");
  const [suspended, setSuspended] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (q) params.q = q;
      if (verified) params.verified = verified;
      if (suspended) params.suspended = suspended;
      const { data } = await adminApi.get("/users", { params });
      setRows(data.rows); setTotal(data.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [offset, verified, suspended]);

  return (
    <div className="space-y-6" data-testid="admin-users">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-slate-400 mt-1">{total} total accounts — click a row to manage.</p>
      </header>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            data-testid="users-search-input"
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setOffset(0); load(); } }}
            placeholder="Search email or name…"
            className="w-full pl-10 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
          />
        </div>
        <select
          data-testid="users-verified-filter"
          value={verified} onChange={(e) => { setVerified(e.target.value); setOffset(0); }}
          className="py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-sm"
        >
          <option value="">All (verified?)</option>
          <option value="true">Verified only</option>
          <option value="false">Unverified only</option>
        </select>
        <select
          data-testid="users-suspended-filter"
          value={suspended} onChange={(e) => { setSuspended(e.target.value); setOffset(0); }}
          className="py-2 px-3 rounded-lg bg-slate-900 border border-slate-800 text-sm"
        >
          <option value="">All (suspended?)</option>
          <option value="true">Suspended only</option>
          <option value="false">Active only</option>
        </select>
        <button
          data-testid="users-search-btn"
          onClick={() => { setOffset(0); load(); }}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm"
        >
          Search
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-950/60">
            <tr>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Nodes</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="text-left px-4 py-3">Last login</th>
            </tr>
          </thead>
          <tbody data-testid="users-table-body">
            {loading && (
              <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">
                <Loader2 className="animate-spin inline mr-2" size={14}/> Loading…
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-500">No users.</td></tr>
            )}
            {!loading && rows.map((u) => (
              <tr key={u.id}
                  data-testid={`user-row-${u.id}`}
                  onClick={() => setSelectedId(u.id)}
                  className="border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {u.is_super_admin && <ShieldCheck size={14} className="text-amber-400" />}
                    <span className="text-slate-200">{u.email}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-300">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{u.role || "user"}</td>
                <td className="px-4 py-3">
                  {u.is_suspended ? (
                    <span className="inline-flex items-center gap-1 text-xs text-red-300">
                      <Ban size={12}/> suspended
                    </span>
                  ) : u.email_verified ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <CheckCircle2 size={12}/> verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <XCircle size={12}/> unverified
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-300">{u.nodes_balance ?? 0}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <div>{total} users</div>
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

      {selectedId && (
        <UserDetailModal
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
