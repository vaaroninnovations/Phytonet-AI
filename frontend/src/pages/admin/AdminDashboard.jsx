import { useEffect, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  Users, ShieldCheck, Database, Activity, Coins, ArrowUpRight, Loader2,
} from "lucide-react";

function StatCard({ icon: Icon, label, value, sub, tone = "amber", testid }) {
  const tones = {
    amber: "from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-200",
    violet: "from-violet-500/20 to-violet-500/5 border-violet-500/30 text-violet-200",
    emerald: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30 text-emerald-200",
    rose: "from-rose-500/20 to-rose-500/5 border-rose-500/30 text-rose-200",
  };
  return (
    <div data-testid={testid}
         className={`rounded-2xl p-5 border bg-gradient-to-br ${tones[tone]} bg-slate-900/40 backdrop-blur`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-slate-400">{label}</div>
        <Icon size={16} />
      </div>
      <div className="mt-3 text-3xl font-semibold text-white tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await adminApi.get("/dashboard/stats");
        setData(data);
      } catch (e) { setErr(e?.response?.data?.detail || "Failed to load stats"); }
    })();
  }, []);

  if (err) return <div className="text-red-400" data-testid="admin-dashboard-error">{err}</div>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={16}/> Loading dashboard…</div>;

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">Platform overview at a glance.</p>
        </div>
        <div className="text-xs text-slate-400">Refreshed {new Date().toLocaleTimeString()}</div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard testid="stat-users-total" icon={Users} label="Total users" value={data.users_total} sub={`${data.users_verified} verified`} tone="violet" />
        <StatCard testid="stat-signups" icon={ArrowUpRight} label="Signups this month" value={data.signups_current_month} tone="emerald" />
        <StatCard testid="stat-projects" icon={Database} label="Projects" value={data.projects_total} tone="amber" />
        <StatCard testid="stat-nodes-used" icon={Coins} label="Nodes consumed" value={data.node_stats.total_used} sub={`${data.node_stats.total_balance} balance across users`} tone="rose" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <Activity size={14} /> Recent activity
            </h2>
            <a href="/admin/audit-log" className="text-xs text-amber-300 hover:underline">View all →</a>
          </div>
          {(data.recent_audit || []).length === 0 ? (
            <div className="text-sm text-slate-500">No admin activity yet.</div>
          ) : (
            <ul className="space-y-2" data-testid="admin-recent-audit">
              {data.recent_audit.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-slate-800/50">
                  <div>
                    <span className="font-mono text-xs text-amber-200">{r.action}</span>
                    <span className="ml-2 text-slate-400">{r.actor_email}</span>
                  </div>
                  <div className={`text-xs ${r.status === "success" ? "text-emerald-300" : "text-red-300"}`}>
                    {r.status}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {new Date(r.at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-4">
            <ShieldCheck size={14} /> Security posture
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-400">Verified users</span>
              <span className="text-slate-100 tabular-nums">
                {data.users_total > 0 ? Math.round((data.users_verified / data.users_total) * 100) : 0}%
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-400">Nodes purchased</span>
              <span className="text-slate-100 tabular-nums">{data.node_stats.total_purchased}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-400">Nodes balance</span>
              <span className="text-slate-100 tabular-nums">{data.node_stats.total_balance}</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
