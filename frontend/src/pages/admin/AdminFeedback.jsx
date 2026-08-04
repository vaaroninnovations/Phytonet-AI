// Admin Feedback dashboard — /admin/feedback
// Summary cards + charts + filterable table + row-details modal + CSV/XLSX export.
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  MessageSquare, Star, ThumbsUp, Filter, Download, X, Loader2,
  TrendingUp, Gauge, Layers3, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";

const MODULES = [
  { id: "", label: "All modules" },
  { id: "plant-database", label: "Plant Database" },
  { id: "target-prediction", label: "Compound Target Prediction" },
  { id: "disease-target-prediction", label: "Disease Target Prediction" },
  { id: "admet", label: "ADMET Prediction" },
  { id: "molecular-docking", label: "Molecular Docking" },
  { id: "phytonet-ai-agent", label: "PhytoNet AI Agent" },
];

const RATING_COLORS = ["#B91C1C", "#EA580C", "#F59E0B", "#10B981", "#059669"];

export default function AdminFeedback() {
  const [filters, setFilters] = useState({
    module: "", user: "", rating: "", date_from: "", date_to: "",
  });
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const params = useMemo(() => {
    const p = {};
    for (const [k, v] of Object.entries(filters)) if (v !== "" && v !== null) p[k] = v;
    return p;
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        adminApi.get("/feedback/summary", { params }),
        adminApi.get("/feedback",         { params: { ...params, page, page_size: 25 } }),
      ]);
      setSummary(s.data);
      setRows(l.data.rows || []);
      setTotal(l.data.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params, page]);

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clearFilters = () => { setFilters({ module: "", user: "", rating: "", date_from: "", date_to: "" }); setPage(1); };

  const exportAs = async (fmt) => {
    try {
      const res = await adminApi.get(`/feedback/export/${fmt}`, { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url;
      a.download = fmt === "csv" ? "feedback.csv" : "feedback.xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error("Export failed"); }
  };

  const distributionData = useMemo(() => {
    if (!summary?.distribution) return [];
    return [1, 2, 3, 4, 5].map((n) => ({
      rating: `${n}★`,
      count: Number(summary.distribution[String(n)] || 0),
      fill: RATING_COLORS[n - 1],
    }));
  }, [summary]);

  return (
    <div data-testid="admin-feedback" className="mx-auto max-w-7xl px-6 py-8 text-white">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Feedback Management</h1>
          <p className="mt-1 text-sm text-white/70">User ratings, comments and satisfaction trends across every module.</p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="fb-export-csv" onClick={() => exportAs("csv")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button data-testid="fb-export-xlsx" onClick={() => exportAs("xlsx")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={MessageSquare} label="Total feedback" value={summary?.total ?? "—"} tone="violet" />
        <StatCard icon={Star}          label="Avg rating"     value={summary?.avg_overall ?? "—"}  tone="amber"   suffix="/5" />
        <StatCard icon={Gauge}         label="Avg speed"      value={summary?.avg_speed ?? "—"}    tone="blue"    suffix="/5" />
        <StatCard icon={Layers3}       label="Avg usability"  value={summary?.avg_ease ?? "—"}     tone="emerald" suffix="/5" />
        <StatCard icon={ShieldCheck}   label="Avg accuracy"   value={summary?.avg_accuracy ?? "—"} tone="teal"    suffix="/5" />
        <StatCard icon={ThumbsUp}      label="Recommend"      value={summary?.recommend_pct ?? "—"} tone="rose"   suffix="%" />
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select data-testid="fb-filter-module" value={filters.module} onChange={(e) => setF("module", e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#0F172A] px-3 py-2 text-sm">
            {MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <input data-testid="fb-filter-user" type="text" value={filters.user} onChange={(e) => setF("user", e.target.value)}
                 placeholder="User email or name…"
                 className="rounded-lg border border-white/15 bg-[#0F172A] px-3 py-2 text-sm placeholder:text-white/40" />
          <select data-testid="fb-filter-rating" value={filters.rating} onChange={(e) => setF("rating", e.target.value)}
                  className="rounded-lg border border-white/15 bg-[#0F172A] px-3 py-2 text-sm">
            <option value="">Any rating</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★ only</option>)}
          </select>
          <input data-testid="fb-filter-date-from" type="date" value={filters.date_from} onChange={(e) => setF("date_from", e.target.value)}
                 className="rounded-lg border border-white/15 bg-[#0F172A] px-3 py-2 text-sm" />
          <input data-testid="fb-filter-date-to" type="date" value={filters.date_to} onChange={(e) => setF("date_to", e.target.value)}
                 className="rounded-lg border border-white/15 bg-[#0F172A] px-3 py-2 text-sm" />
        </div>
        <div className="mt-3">
          <button onClick={clearFilters} className="text-xs text-white/60 underline hover:text-white">Clear filters</button>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Ratings over time (30 days)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={summary?.over_time || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis domain={[0, 5]} tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #ffffff20", color: "white" }} />
              <Line type="monotone" dataKey="avg" stroke="#8139ED" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Rating distribution" icon={Star}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={distributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="rating" tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #ffffff20", color: "white" }} />
              <Bar dataKey="count">
                {distributionData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="By module" icon={Layers3}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={summary?.by_module || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="module" tick={{ fill: "#94A3B8", fontSize: 9 }} interval={0} angle={-16} textAnchor="end" height={60} />
              <YAxis domain={[0, 5]} tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #ffffff20", color: "white" }} />
              <Bar dataKey="avg" fill="#5139ED" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Monthly trend (12 months)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={summary?.monthly || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis domain={[0, 5]} tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #ffffff20", color: "white" }} />
              <Line type="monotone" dataKey="avg" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead className="bg-white/10 text-[10.5px] font-bold uppercase tracking-widest text-white/70">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Module</th>
              <th className="px-3 py-2 text-left">Task</th>
              <th className="px-3 py-2 text-right">Rating</th>
              <th className="px-3 py-2 text-center">Recommend</th>
              <th className="px-3 py-2 text-right">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-white/60"><Loader2 className="inline h-5 w-5 animate-spin" /> Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-white/60">No feedback matches these filters.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}
                  data-testid={`fb-row-${r.id}`}
                  onClick={() => setDetail(r)}
                  className="cursor-pointer border-t border-white/5 text-[12.5px] hover:bg-white/5">
                <td className="px-3 py-2 truncate">{r.user_name || r.user_email || r.user_id}</td>
                <td className="px-3 py-2"><span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">{r.module}</span></td>
                <td className="px-3 py-2 max-w-[200px] truncate font-mono text-[11px] text-white/70">{r.task_id}</td>
                <td className="px-3 py-2 text-right"><StarRow n={r.ratings?.overall} /></td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${r.would_recommend ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                    {r.would_recommend ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] text-white/60">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-xs text-white/60">
        <span>{total} total</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1 disabled:opacity-40">Prev</button>
          <span>Page {page}</span>
          <button disabled={rows.length < 25} onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDetail(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F172A] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Feedback detail</p>
                <h3 className="mt-1 font-display text-lg font-bold">{detail.user_name || detail.user_email}</h3>
                <p className="text-xs text-white/60">{detail.module} · {new Date(detail.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setDetail(null)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <RatingCell label="Overall"     n={detail.ratings?.overall} />
              <RatingCell label="Ease of use" n={detail.ratings?.ease_of_use} />
              <RatingCell label="Accuracy"    n={detail.ratings?.accuracy} />
              <RatingCell label="Speed"       n={detail.ratings?.speed} />
            </div>
            <p className="mt-4 text-sm">
              <span className="font-semibold">Would recommend:</span>{" "}
              <span className={detail.would_recommend ? "text-emerald-300" : "text-rose-300"}>
                {detail.would_recommend ? "Yes" : "No"}
              </span>
            </p>
            <p className="mt-2 text-sm"><span className="font-semibold">Task ID:</span> <span className="font-mono text-xs">{detail.task_id}</span></p>
            {detail.workflow_id && <p className="mt-1 text-sm"><span className="font-semibold">Workflow:</span> <span className="font-mono text-xs">{detail.workflow_id}</span></p>}
            {detail.comments && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Comments</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{detail.comments}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TONE = {
  violet:  "text-violet-300",
  amber:   "text-amber-300",
  blue:    "text-sky-300",
  emerald: "text-emerald-300",
  teal:    "text-teal-300",
  rose:    "text-rose-300",
};
function StatCard({ icon: Icon, label, value, tone = "violet", suffix = "" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-widest text-white/60">
        <Icon className={`h-3.5 w-3.5 ${TONE[tone]}`} />
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-bold">
        {value}
        {value !== "—" && suffix && <span className="ml-0.5 text-xs opacity-70">{suffix}</span>}
      </p>
    </div>
  );
}
function ChartCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/70">
        <Icon className="h-3.5 w-3.5" />{title}
      </div>
      {children}
    </div>
  );
}
function StarRow({ n = 0 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-white/25"}`} />
      ))}
    </span>
  );
}
function RatingCell({ label, n }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</p>
      <div className="mt-1 flex items-center justify-between">
        <StarRow n={n || 0} />
        <span className="font-mono text-xs text-white/80">{n ?? "—"}/5</span>
      </div>
    </div>
  );
}
