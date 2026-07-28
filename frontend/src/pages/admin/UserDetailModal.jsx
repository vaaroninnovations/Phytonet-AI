// User management modal — view + edit + suspend + reset password + adjust nodes + delete.
import { useEffect, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  X, Loader2, ShieldCheck, Ban, UserCheck, KeyRound, Coins,
  Trash2, Save, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function Field({ label, value, testid }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm text-slate-100" data-testid={testid}>{value ?? "—"}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <h3 className="text-xs uppercase tracking-widest text-amber-300 mb-3">{title}</h3>
      {children}
    </section>
  );
}

export default function UserDetailModal({ userId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState({});
  const [action, setAction] = useState(null); // 'reset-pw' | 'nodes' | 'delete' | 'suspend'
  const [pw, setPw] = useState("");
  const [nodeDelta, setNodeDelta] = useState("");
  const [nodeReason, setNodeReason] = useState("");
  const [suspendReason, setSuspendReason] = useState("");

  const load = async () => {
    setData(null);
    const { data } = await adminApi.get(`/users/${userId}`);
    setData(data);
    setEditing({});
  };
  useEffect(() => { if (userId) load(); /* eslint-disable-next-line */ }, [userId]);

  if (!userId) return null;

  const u = data?.user;

  const savePatch = async () => {
    if (!Object.keys(editing).length) { toast.info("Nothing to save"); return; }
    setSaving(true);
    try {
      await adminApi.patch(`/users/${userId}`, editing);
      toast.success("User updated");
      setEditing({});
      await load();
      onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    finally { setSaving(false); }
  };

  const doSuspend = async () => {
    setSaving(true);
    try {
      await adminApi.post(`/users/${userId}/suspend`, { reason: suspendReason });
      toast.success("User suspended");
      setAction(null); setSuspendReason("");
      await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Suspend failed"); }
    finally { setSaving(false); }
  };

  const doUnsuspend = async () => {
    setSaving(true);
    try {
      await adminApi.post(`/users/${userId}/unsuspend`);
      toast.success("User reactivated");
      await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reactivate failed"); }
    finally { setSaving(false); }
  };

  const doResetPassword = async () => {
    if (!pw || pw.length < 8) { toast.error("Password must be ≥8 chars"); return; }
    setSaving(true);
    try {
      await adminApi.post(`/users/${userId}/reset-password`, { new_password: pw });
      toast.success("Password reset");
      setAction(null); setPw("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Reset failed"); }
    finally { setSaving(false); }
  };

  const doAdjustNodes = async () => {
    const n = Number(nodeDelta);
    if (!n || Number.isNaN(n)) { toast.error("Enter a non-zero delta"); return; }
    setSaving(true);
    try {
      const { data } = await adminApi.post(`/users/${userId}/nodes/adjust`,
        { delta: n, reason: nodeReason });
      toast.success(`Applied ${data.applied_delta} nodes → balance ${data.new_balance}`);
      setAction(null); setNodeDelta(""); setNodeReason("");
      await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Adjust failed"); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await adminApi.delete(`/users/${userId}`);
      toast.success("User deleted");
      setAction(null);
      onChanged?.();
      onClose?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Delete failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur flex items-center justify-center p-4"
         data-testid="user-detail-modal" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 text-slate-100"
           onClick={(e) => e.stopPropagation()}>
        <header className="px-6 py-4 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 className="text-lg font-semibold">User Details</h2>
            {u && (
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                <span data-testid="detail-email">{u.email}</span>
                {u.is_super_admin && (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <ShieldCheck size={12}/> super admin
                  </span>
                )}
                {u.is_suspended && (
                  <span className="inline-flex items-center gap-1 text-red-300">
                    <Ban size={12}/> suspended
                  </span>
                )}
              </div>
            )}
          </div>
          <button data-testid="user-detail-close" onClick={onClose}
                  className="p-2 rounded-md hover:bg-slate-800">
            <X size={16}/>
          </button>
        </header>

        {!data ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="inline animate-spin mr-2" size={16}/> Loading…
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* PROFILE OVERVIEW */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Field label="Name" value={[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"} />
              <Field label="Role" value={u.role || "user"} />
              <Field label="Nodes balance" value={u.nodes_balance} testid="detail-nodes" />
              <Field label="Projects" value={data.projects_count} />
              <Field label="Institution" value={u.institution} />
              <Field label="Department" value={u.department} />
              <Field label="Country" value={u.country} />
              <Field label="Designation" value={u.designation} />
              <Field label="Created" value={u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"} />
              <Field label="Last login" value={u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "—"} />
              <Field label="Verified" value={u.email_verified
                ? <span className="text-emerald-300 inline-flex items-center gap-1"><CheckCircle2 size={12}/>yes</span>
                : <span className="text-slate-500 inline-flex items-center gap-1"><XCircle size={12}/>no</span>} />
              <Field label="Lifetime used" value={u.nodes_lifetime_used} />
            </div>

            {u.is_suspended && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200"
                   data-testid="detail-suspended-banner">
                <AlertTriangle className="inline mr-2" size={14}/>
                Suspended {u.suspended_at ? new Date(u.suspended_at).toLocaleString() : ""}
                {u.suspended_reason && ` — ${u.suspended_reason}`}
              </div>
            )}

            {u.is_super_admin ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                Super admin accounts cannot be modified from this panel. Use the Profile page.
              </div>
            ) : (
              <>
                {/* EDITABLE FIELDS */}
                <Section title="Edit profile">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      ["first_name", "First name"],
                      ["last_name", "Last name"],
                      ["username", "Username"],
                      ["role", "Role"],
                      ["institution", "Institution"],
                      ["department", "Department"],
                      ["country", "Country"],
                      ["designation", "Designation"],
                    ].map(([k, label]) => (
                      <label key={k} className="block">
                        <span className="text-xs text-slate-400 uppercase tracking-wide">{label}</span>
                        <input
                          data-testid={`edit-${k}`}
                          type="text"
                          value={(editing[k] !== undefined) ? (editing[k] ?? "") : (u[k] ?? "")}
                          onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
                          className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm"
                        />
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm mt-6">
                      <input
                        data-testid="edit-verified"
                        type="checkbox"
                        checked={editing.email_verified ?? u.email_verified}
                        onChange={(e) => setEditing({ ...editing, email_verified: e.target.checked })}
                        className="w-4 h-4"
                      />
                      Email verified
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      data-testid="save-user-btn"
                      onClick={savePatch} disabled={saving || !Object.keys(editing).length}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold disabled:opacity-60"
                    >
                      <Save size={14}/> Save changes
                    </button>
                    {Object.keys(editing).length > 0 && (
                      <button onClick={() => setEditing({})}
                              className="px-4 py-2 rounded-lg bg-slate-800 text-sm">
                        Discard
                      </button>
                    )}
                  </div>
                </Section>

                {/* ACTIONS */}
                <Section title="Account actions">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {u.is_suspended ? (
                      <button data-testid="unsuspend-btn" onClick={doUnsuspend}
                              disabled={saving}
                              className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/20 text-sm">
                        <UserCheck size={16}/> Reactivate
                      </button>
                    ) : (
                      <button data-testid="suspend-btn" onClick={() => setAction("suspend")}
                              className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-200 hover:bg-amber-500/20 text-sm">
                        <Ban size={16}/> Suspend
                      </button>
                    )}
                    <button data-testid="reset-pw-btn" onClick={() => setAction("reset-pw")}
                            className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                      <KeyRound size={16}/> Reset password
                    </button>
                    <button data-testid="adjust-nodes-btn" onClick={() => setAction("nodes")}
                            className="flex items-center gap-2 p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm">
                      <Coins size={16}/> Adjust nodes
                    </button>
                    <button data-testid="delete-user-btn" onClick={() => setAction("delete")}
                            className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20 text-sm">
                      <Trash2 size={16}/> Delete user
                    </button>
                  </div>

                  {action === "suspend" && (
                    <div className="mt-4 space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <input
                        data-testid="suspend-reason"
                        type="text" placeholder="Reason (optional, shown at login)"
                        value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
                      />
                      <div className="flex gap-2">
                        <button data-testid="confirm-suspend-btn"
                                onClick={doSuspend} disabled={saving}
                                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-medium">
                          Confirm suspend
                        </button>
                        <button onClick={() => setAction(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {action === "reset-pw" && (
                    <div className="mt-4 space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <input
                        data-testid="new-password-input"
                        type="password" placeholder="New password (≥8 chars)"
                        value={pw} onChange={(e) => setPw(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
                      />
                      <div className="text-xs text-slate-500">
                        The user should be notified out-of-band. This does NOT auto-send a reset email.
                      </div>
                      <div className="flex gap-2">
                        <button data-testid="confirm-reset-pw-btn"
                                onClick={doResetPassword} disabled={saving}
                                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-medium">
                          Reset password
                        </button>
                        <button onClick={() => { setAction(null); setPw(""); }}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {action === "nodes" && (
                    <div className="mt-4 space-y-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          data-testid="node-delta-input"
                          type="number" placeholder="Delta (e.g. 25 or -10)"
                          value={nodeDelta} onChange={(e) => setNodeDelta(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
                        />
                        <input
                          data-testid="node-reason-input"
                          type="text" placeholder="Reason (audit trail)"
                          value={nodeReason} onChange={(e) => setNodeReason(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-sm"
                        />
                      </div>
                      <div className="text-xs text-slate-500">
                        Positive credits the user, negative debits. Balance can never go below 0.
                      </div>
                      <div className="flex gap-2">
                        <button data-testid="confirm-adjust-btn"
                                onClick={doAdjustNodes} disabled={saving}
                                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-medium">
                          Apply adjustment
                        </button>
                        <button onClick={() => { setAction(null); setNodeDelta(""); setNodeReason(""); }}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {action === "delete" && (
                    <div className="mt-4 space-y-2 p-3 rounded-lg bg-red-500/5 border border-red-500/40">
                      <div className="text-sm text-red-200 font-medium">Delete this user permanently?</div>
                      <div className="text-xs text-red-300/80">
                        This also removes their projects, saved versions, node ledger, and pending tokens. This cannot be undone.
                      </div>
                      <div className="flex gap-2">
                        <button data-testid="confirm-delete-btn"
                                onClick={doDelete} disabled={saving}
                                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-400 text-white text-sm font-medium">
                          Yes, delete permanently
                        </button>
                        <button onClick={() => setAction(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* NODE HISTORY */}
            <Section title={`Recent node activity (${data.node_history.length})`}>
              {data.node_history.length === 0 ? (
                <div className="text-sm text-slate-500">No transactions.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="text-left py-2">When</th>
                      <th className="text-left py-2">Module</th>
                      <th className="text-left py-2">Reason</th>
                      <th className="text-right py-2">Delta</th>
                      <th className="text-right py-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.node_history.map((r) => (
                      <tr key={r.id} className="border-t border-slate-800">
                        <td className="py-2 text-slate-400 text-xs">{new Date(r.at).toLocaleString()}</td>
                        <td className="py-2 text-slate-300">{r.module}</td>
                        <td className="py-2 text-slate-400 text-xs">{r.reason || "—"}</td>
                        <td className={`py-2 text-right tabular-nums ${r.direction === "credit" ? "text-emerald-300" : "text-rose-300"}`}>
                          {r.direction === "credit" ? "+" : "−"}{r.amount}
                        </td>
                        <td className="py-2 text-right text-slate-100 tabular-nums">{r.balance_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
