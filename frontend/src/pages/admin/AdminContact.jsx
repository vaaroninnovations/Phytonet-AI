// Admin Contact Messages dashboard — /admin/contact
// Summary counts + status filter + searchable list + detail drawer with
// status change (New → Read → Replied) and admin notes.
import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  Mail, Loader2, X, Filter, Search, Trash2, Inbox, Eye, CheckCircle2,
  Circle, MessageSquareReply, Building2, User, Clock, ExternalLink,
  Send, MailCheck, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_META = {
  new:     { label: "New",     color: "bg-amber-500/15 text-amber-300 border-amber-500/30",  Icon: Circle },
  read:    { label: "Read",    color: "bg-sky-500/15 text-sky-300 border-sky-500/30",        Icon: Eye },
  replied: { label: "Replied", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.new;
  const { Icon } = meta;
  return (
    <span data-testid={`status-badge-${status}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      <Icon size={12} />
      {meta.label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function AdminContact() {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", q: "" });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [notes, setNotes] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

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
        adminApi.get("/contact/summary"),
        adminApi.get("/contact/messages", { params: { ...params, page, page_size: 25 } }),
      ]);
      setSummary(s.data);
      setRows(l.data.rows || []);
      setTotal(l.data.total || 0);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load contact messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params, page]);

  const openDetail = async (id) => {
    try {
      const { data } = await adminApi.get(`/contact/messages/${id}`);
      setDetail(data);
      setNotes(data.admin_notes || "");
      setReplyBody("");
      setReplySubject(`Re: ${data.subject || ""}`);
      // Reload list so status may flip to 'read'
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to open message");
    }
  };

  const sendReply = async () => {
    if (!detail) return;
    if (replyBody.trim().length < 2) {
      toast.error("Please write a reply before sending.");
      return;
    }
    setSendingReply(true);
    try {
      const { data } = await adminApi.post(`/contact/messages/${detail.id}/reply`, {
        subject: replySubject.trim() || undefined,
        body: replyBody,
      });
      setDetail(data.message);
      setReplyBody("");
      if (data.delivered) {
        toast.success(`Reply sent via ${data.provider || "email"}`);
      } else {
        toast.warning(
          `Reply saved but delivery failed${data.delivery_note ? `: ${data.delivery_note}` : "."} ` +
          `Check SMTP settings.`
        );
      }
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send reply");
    } finally {
      setSendingReply(false);
    }
  };

  const updateStatus = async (status) => {
    if (!detail) return;
    setSavingDetail(true);
    try {
      const { data } = await adminApi.patch(`/contact/messages/${detail.id}`, { status });
      setDetail(data);
      toast.success(`Marked as ${status}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to update status");
    } finally { setSavingDetail(false); }
  };

  const saveNotes = async () => {
    if (!detail) return;
    setSavingDetail(true);
    try {
      const { data } = await adminApi.patch(`/contact/messages/${detail.id}`, { admin_notes: notes });
      setDetail(data);
      toast.success("Notes saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save notes");
    } finally { setSavingDetail(false); }
  };

  const deleteMsg = async () => {
    if (!detail) return;
    if (!window.confirm("Delete this message permanently? This cannot be undone.")) return;
    setSavingDetail(true);
    try {
      await adminApi.delete(`/contact/messages/${detail.id}`);
      toast.success("Message deleted");
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to delete");
    } finally { setSavingDetail(false); }
  };

  const setF = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div data-testid="admin-contact-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="text-amber-400" size={22} />
            <h1 className="text-xl font-semibold tracking-tight">Contact Messages</h1>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Inquiries submitted through the public homepage. Triage, respond, and archive.
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total"   value={summary?.total ?? 0}   Icon={Inbox}          tint="text-slate-200" data-testid="stat-total" />
        <StatCard label="New"     value={summary?.new ?? 0}     Icon={Circle}         tint="text-amber-300" data-testid="stat-new" />
        <StatCard label="Read"    value={summary?.read ?? 0}    Icon={Eye}            tint="text-sky-300"   data-testid="stat-read" />
        <StatCard label="Replied" value={summary?.replied ?? 0} Icon={CheckCircle2}   tint="text-emerald-300" data-testid="stat-replied" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Filter size={14} /> Filters
        </div>
        <select
          data-testid="filter-status"
          value={filters.status}
          onChange={(e) => setF("status", e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
        >
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="replied">Replied</option>
        </select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
          <input
            data-testid="filter-search"
            value={filters.q}
            onChange={(e) => setF("q", e.target.value)}
            placeholder="Search email, name, subject…"
            className="w-72 rounded-md border border-slate-700 bg-slate-950 pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
          />
        </div>
        {(filters.status || filters.q) && (
          <button
            onClick={() => { setFilters({ status: "", q: "" }); setPage(1); }}
            className="text-xs text-slate-400 hover:text-slate-200"
          >Clear</button>
        )}
        {loading && <Loader2 className="ml-auto animate-spin text-slate-400" size={16} />}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-[100px_1.4fr_2fr_1.2fr_120px] gap-3 border-b border-slate-800 bg-slate-900/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div>Status</div>
          <div>From</div>
          <div>Subject</div>
          <div>Received</div>
          <div className="text-right">Actions</div>
        </div>
        {rows.length === 0 && !loading && (
          <div className="px-4 py-16 text-center text-sm text-slate-500">
            No messages match the current filters.
          </div>
        )}
        {rows.map((r) => (
          <div
            key={r.id}
            data-testid={`contact-row-${r.id}`}
            className="grid grid-cols-[100px_1.4fr_2fr_1.2fr_120px] gap-3 border-b border-slate-800/70 px-4 py-3 text-sm hover:bg-slate-800/30"
          >
            <div><StatusBadge status={r.status} /></div>
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-100">{r.name}</div>
              <div className="truncate text-xs text-slate-400">{r.email}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate text-slate-200">{r.subject}</div>
              <div className="truncate text-xs text-slate-500">{r.message}</div>
            </div>
            <div className="text-xs text-slate-400">{fmtDate(r.created_at)}</div>
            <div className="text-right">
              <button
                data-testid={`open-btn-${r.id}`}
                onClick={() => openDetail(r.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-100 hover:bg-slate-700"
              >
                Open <ExternalLink size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Pagination */}
        {total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-400">
            <div>Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}</div>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 disabled:opacity-40"
              >Prev</button>
              <div>Page {page} / {totalPages}</div>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 disabled:opacity-40"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex" data-testid="contact-detail-modal">
          <div className="flex-1 bg-slate-950/70 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="w-full max-w-xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <StatusBadge status={detail.status} />
                <h2 className="mt-3 text-lg font-semibold text-slate-100">{detail.subject}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1"><User size={12} />{detail.name}</span>
                  <a href={`mailto:${detail.email}`} className="inline-flex items-center gap-1 hover:text-amber-300">
                    <Mail size={12} />{detail.email}
                  </a>
                  {detail.institution && (
                    <span className="inline-flex items-center gap-1"><Building2 size={12} />{detail.institution}</span>
                  )}
                  <span className="inline-flex items-center gap-1"><Clock size={12} />{fmtDate(detail.created_at)}</span>
                </div>
              </div>
              <button
                data-testid="close-detail-btn"
                onClick={() => setDetail(null)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              ><X size={18} /></button>
            </div>

            {/* Message body */}
            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">
              {detail.message}
            </div>

            {/* Reply thread — previous outgoing replies */}
            {detail.replies && detail.replies.length > 0 && (
              <div className="mt-6" data-testid="reply-thread">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Sent replies ({detail.replies.length})
                </div>
                <div className="mt-2 space-y-2">
                  {detail.replies.map((r, i) => (
                    <div key={i} data-testid={`reply-item-${i}`}
                         className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        {r.delivered ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <MailCheck size={11} /> Delivered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertTriangle size={11} /> Delivery failed
                          </span>
                        )}
                        <span>by {r.by}</span>
                        <span>· {fmtDate(r.sent_at)}</span>
                        {r.provider && <span>· via {r.provider}</span>}
                      </div>
                      <div className="mt-1.5 text-[12px] font-semibold text-slate-100">{r.subject}</div>
                      <div className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">{r.body}</div>
                      {r.delivery_note && !r.delivered && (
                        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-200">
                          {r.delivery_note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reply composer — send email + record thread */}
            <div className="mt-6" data-testid="reply-composer">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Reply to {detail.email}
              </div>
              <input
                data-testid="reply-subject"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                placeholder="Subject"
                maxLength={200}
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
              <textarea
                data-testid="reply-body"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write your reply — the recipient will get an email with the original message quoted."
                maxLength={10000}
                className="mt-2 min-h-[120px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{replyBody.length}/10000</span>
                <button
                  data-testid="send-reply-btn"
                  onClick={sendReply}
                  disabled={sendingReply || replyBody.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {sendingReply ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {sendingReply ? "Sending…" : "Send reply"}
                </button>
              </div>
            </div>

            {/* Status actions */}
            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Update status</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["new", "read", "replied"]).map((s) => (
                  <button
                    key={s}
                    data-testid={`set-status-${s}`}
                    onClick={() => updateStatus(s)}
                    disabled={savingDetail || detail.status === s}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      detail.status === s
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    {s === "replied" && <MessageSquareReply size={12} />}
                    Mark as {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin notes */}
            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Internal notes</div>
              <textarea
                data-testid="admin-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                placeholder="Add a private note for the admin team…"
                className="mt-2 min-h-[100px] w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{notes.length}/2000</span>
                <button
                  data-testid="save-notes-btn"
                  onClick={saveNotes}
                  disabled={savingDetail}
                  className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-60"
                >Save notes</button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="mt-8 border-t border-slate-800 pt-4">
              <button
                data-testid="delete-message-btn"
                onClick={deleteMsg}
                disabled={savingDetail}
                className="inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-60"
              >
                <Trash2 size={12} /> Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, Icon, tint = "text-slate-200", ...rest }) {
  return (
    <div {...rest} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
        <Icon size={16} className={tint} />
      </div>
      <div className={`mt-2 text-2xl font-semibold ${tint}`}>{value}</div>
    </div>
  );
}
