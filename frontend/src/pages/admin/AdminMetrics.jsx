// Admin Usage Metrics — /admin/metrics
// KPIs + timeseries + top-modules from `usage_events`. Powers the Phase-2
// pricing decisions: track preflight-to-executed conversion, node spend
// velocity, and which tools are worth graduating to subscriptions.
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  BarChart3, TrendingUp, Users, Zap, Loader2, Activity, Target,
} from "lucide-react";
import { toast } from "sonner";

function Sparkline({ rows, valueKey = "events", height = 40 }) {
  if (!rows || rows.length === 0) {
    return <div className="text-[11px] text-slate-500">No data yet.</div>;
  }
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey] || 0)));
  const w = 100 / rows.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none"
         className="w-full" style={{ height }}>
      {rows.map((r, i) => {
        const v = Number(r[valueKey] || 0);
        const h = (v / max) * (height - 4);
        return (
          <rect
            key={i}
            x={i * w + 0.5}
            y={height - h - 1}
            width={Math.max(0.5, w - 1)}
            height={Math.max(0.5, h)}
            fill="#8139ED"
            opacity={0.85}
          >
            <title>{r.date}: {v}</title>
          </rect>
        );
      })}
    </svg>
  );
}

const KPI_COLOR = {
  events:  "text-sky-300",
  users:   "text-emerald-300",
  nodes:   "text-amber-300",
  conv:    "text-fuchsia-300",
};

function Kpi({ label, value, sub, tone = "events", icon: Icon = Activity, testid }) {
  return (
    <div data-testid={testid} className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        <Icon className={`h-3 w-3 ${KPI_COLOR[tone] || ""}`} />
        {label}
      </div>
      <div className={`mt-2 font-headline text-3xl font-bold ${KPI_COLOR[tone] || "text-slate-100"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default function AdminMetrics() {
  const [overview, setOverview] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [topModules, setTopModules] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [ov, ts, tm] = await Promise.all([
        adminApi.get("/metrics/overview"),
        adminApi.get("/metrics/timeseries", { params: { days } }),
        adminApi.get("/metrics/top-modules", { params: { days } }),
      ]);
      setOverview(ov.data);
      setTimeseries(ts.data);
      setTopModules(tm.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load metrics");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [days]);

  const funnel = overview?.research_funnel_30d;
  const maxModule = useMemo(() => {
    if (!topModules?.rows?.length) return 1;
    return Math.max(1, ...topModules.rows.map((r) => Number(r.events || 0)));
  }, [topModules]);

  return (
    <div data-testid="admin-metrics-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-slate-100">Usage Metrics</h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Preflight-to-executed conversion, node spend velocity, and top modules —
            groundwork for graduating to subscriptions at scale.
          </p>
        </div>
        <select
          data-testid="metrics-days-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 focus:border-[#5139ED] focus:outline-none"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={60}>Last 60 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi testid="kpi-events-24h"
             label="Events last 24 h" tone="events" icon={Activity}
             value={overview?.["24h"]?.events ?? "—"} />
        <Kpi testid="kpi-users-7d"
             label="Unique users (7 d)" tone="users" icon={Users}
             value={overview?.["7d"]?.unique_users ?? "—"} />
        <Kpi testid="kpi-nodes-30d"
             label="Nodes charged (30 d)" tone="nodes" icon={Zap}
             value={overview?.["30d"]?.nodes_charged?.toLocaleString?.() ?? "—"} />
        <Kpi testid="kpi-conv-30d"
             label="Plan conversion (30 d)"
             value={funnel ? `${funnel.conversion_pct}%` : "—"}
             sub={funnel ? `${funnel.executed} of ${funnel.preflight} plans executed` : null}
             tone="conv" icon={Target} />
      </div>

      {/* Timeseries */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Daily events</div>
            <div className="mt-0.5 text-[15px] font-semibold text-slate-100">Activity volume over time</div>
          </div>
          <BarChart3 className="h-4 w-4 text-slate-500" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <Sparkline rows={timeseries?.rows || []} valueKey="events" height={60} />
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Daily nodes charged</div>
            <div className="mt-0.5 text-[15px] font-semibold text-slate-100">Revenue proxy (nodes ≈ ₹20 each)</div>
          </div>
          <TrendingUp className="h-4 w-4 text-slate-500" />
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <Sparkline rows={timeseries?.rows || []} valueKey="nodes" height={60} />
        )}
      </div>

      {/* Top modules */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Top modules</div>
            <div className="mt-0.5 text-[15px] font-semibold text-slate-100">Most-used tools last {days} days</div>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (topModules?.rows?.length ?? 0) === 0 ? (
          <div className="py-6 text-center text-[13px] text-slate-500">No usage recorded yet.</div>
        ) : (
          <div className="space-y-1.5">
            {topModules.rows.map((r) => {
              const pct = (Number(r.events || 0) / maxModule) * 100;
              return (
                <div key={r.module} data-testid={`top-module-${r.module}`} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-slate-100">{r.module}</span>
                    <span className="text-[12px] text-slate-400">{r.events.toLocaleString()} events · {r.nodes.toLocaleString()} nodes</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/5">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-[#5139ED] to-[#8139ED]"
                         style={{ width: `${Math.max(6, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
