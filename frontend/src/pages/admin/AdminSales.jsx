// Admin Sales Inquiries — /admin/sales
// Triage inbox for enterprise / Lab-Team plan inquiries submitted via
// POST /api/nodes/contact-sales.
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  Building2, Loader2, Filter, Search, Inbox, Eye, CheckCircle2,
  Circle, Clock, X, Save, MessageSquare, User as UserIcon, Users,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  new:         { label: "New",         color: "bg-amber-500/15 text-amber-300 border-amber-500/30",     Icon: Circle },
  in_progress: { label: "In progress", color: "bg-sky-500/15 text-sky-300 border-sky-500/30",           Icon: Eye },
  won:         { label: "Won",         color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  lost:        { label: "Lost",        color: "bg-rose-500/15 text-rose-300 border-rose-500/30",         Icon: X },
  closed:      { label: "Closed",      color: "bg-slate-500/15 text-slate-300 border-slate-500/30",     Icon: Clock },
};
const STATUS_ORDER = ["new", "in_progress", "won", "lost", "closed"];

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.new;
  const { Icon } = meta;
  return (
    <span data-testid={`status-badge-${status}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      <Icon size={12} /> {meta.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminSales() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", q: "" });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");

  const params = useMemo(() => {
    const p = {};
    if (filters.status) p.status = filters.status;
    if (filters.q)      p.q = filters.q;
    return p;
  }, [filters]);

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        adminApi.get("/sales/summary"),
        adminApi.get("/sales/inquiries", { params: { ...params, page, page_size: 25 } }),
      ]);
      setSummary(s.data);
      setRows(l.data.rows || []);
      setTotal(l.data.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load sales inquiries");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, filters.status, filters.q]);

  const openDetail = (row) => {
    setDetail(row);
    setNotes(row.notes || "");
    setAssignee(row.assignee || "");
  };

  const updateStatus = async (id, patch) => {
    setSaving(true);
    try {
      await adminApi.patch(`/sales/inquiries/${id}`, patch);
      toast.success("Inquiry updated");
      // Optimistic: reload list + close if we changed the drawer's row
      await load();
      if (detail?.id === id) {
        setDetail((d) => ({ ...(d || {}), ...patch }));
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Update failed");
    } finally { setSaving(false); }
  };

  return (
    <div data-testid="admin-sales-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-slate-100">Sales Inquiries</h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Lab / Team plan requests from the public pricing page. Assign, note,
            and progress each lead to close.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-slate-300">
          <Building2 className="inline-block h-3.5 w-3.5 mr-1.5 text-amber-400" />
          Enterprise pipeline
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div data-testid="sales-tile-total" className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total</div>
          <div className="mt-1 text-2xl font-bold text-slate-100">{summary?.total ?? "—"}</div>
        </div>
        <div data-testid="sales-tile-24h" className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Last 24 h</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300">{summary?.last_24h ?? "—"}</div>
        </div>
        {STATUS_ORDER.map((k) => (
          <div key={k} data-testid={`sales-tile-${k}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{STATUS_META[k].label}</div>
            <div className="mt-1 text-2xl font-bold text-slate-100">{summary?.by_status?.[k] ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            data-testid="sales-search"
            type="text"
            placeholder="Search organisation, email, message…"
            value={filters.q}
            onChange={(e) => { setFilters((f) => ({ ...f, q: e.target.value })); setPage(1); }}
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            data-testid="sales-status-filter"
            value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 focus:border-[#5139ED] focus:outline-none"
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Inbox className="h-8 w-8 mb-2 opacity-40" />
            No inquiries yet.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-white/[0.03] text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Organisation</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Team size</th>
                <th className="px-4 py-3 text-left">Received</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} data-testid={`sales-row-${r.id}`} className="hover:bg-white/[0.03] transition">
                  <td className="px-4 py-3 font-medium text-slate-100">{r.organization}</td>
                  <td className="px-4 py-3 text-slate-300">
                    <div>{r.user_name || "—"}</div>
                    <div className="text-[11px] text-slate-500">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.team_size || "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtDate(r.at)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      data-testid={`sales-open-${r.id}`}
                      onClick={() => openDetail(r)}
                      className="text-[12px] font-semibold text-[#a48bff] hover:text-white"
                    >View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 25 && (
        <div className="flex items-center justify-between text-[12px] text-slate-400">
          <div>Showing {Math.min((page - 1) * 25 + 1, total)}–{Math.min(page * 25, total)} of {total}</div>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">← Prev</button>
            <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}
                    className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-[100] flex" data-testid="sales-detail-drawer">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetail(null)} aria-hidden />
          <div className="relative ml-auto h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0E0B22] p-6">
            <button onClick={() => setDetail(null)} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/5" data-testid="sales-detail-close">
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-amber-300">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-headline text-xl font-bold text-slate-100">{detail.organization}</h2>
                <div className="text-[12px] text-slate-400">Plan: {detail.plan_id} · Received {fmtDate(detail.at)}</div>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  <UserIcon className="h-3 w-3" /> Contact
                </div>
                <div className="mt-1.5 text-[13.5px] text-slate-100">{detail.user_name || "—"}</div>
                <div className="text-[12px] text-slate-400">{detail.email}</div>
                {detail.role && <div className="text-[12px] text-slate-400">Role: {detail.role}</div>}
                {detail.team_size && <div className="text-[12px] text-slate-400 inline-flex items-center gap-1"><Users className="h-3 w-3" /> {detail.team_size}</div>}
              </div>

              {detail.message && (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    <MessageSquare className="h-3 w-3" /> Message
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-200">{detail.message}</p>
                </div>
              )}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Status</div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        data-testid={`sales-status-${s}`}
                        onClick={() => updateStatus(detail.id, { status: s })}
                        disabled={saving}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                          detail.status === s
                            ? STATUS_META[s].color
                            : "border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200"
                        }`}
                      >{STATUS_META[s].label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Assignee</label>
                  <input
                    data-testid="sales-assignee-input"
                    type="text"
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="e.g. sales@phytonetai.com"
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Internal notes</label>
                  <textarea
                    data-testid="sales-notes-input"
                    rows={4}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add context, next steps, quoted price…"
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none"
                  />
                </div>
                <button
                  data-testid="sales-save-detail"
                  onClick={() => updateStatus(detail.id, { notes, assignee })}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save notes & assignee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
