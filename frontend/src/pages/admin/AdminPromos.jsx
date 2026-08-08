// Admin Promo Codes — /admin/promos
// Create, activate/deactivate, or delete discount codes without a code deploy.
import { useEffect, useState } from "react";
import { adminApi } from "@/context/AdminAuthContext";
import {
  Loader2, Tag, Plus, Trash2, Edit3, Check, X, ToggleLeft, ToggleRight,
  Percent, IndianRupee,
} from "lucide-react";
import { toast } from "sonner";

const PLAN_KIND_OPTIONS = [
  { id: "bundle",       label: "One-time bundles" },
  { id: "student",      label: "Student bundle" },
  { id: "subscription", label: "PhytoNet Pro" },
];

const KIND_OPTIONS = [
  { id: "first_bundle", label: "First bundle only (one-per-user)", hint: "New buyers only" },
  { id: "general",      label: "General",                          hint: "Can be used repeatedly" },
];

function initialForm() {
  return {
    code: "",
    kind: "general",
    percent_off: 20,
    flat_off_inr: "",
    applies_to_kinds: ["bundle"],
    description: "",
    max_redemptions: "",
    active: true,
  };
}

export default function AdminPromos() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm());
  const [editing, setEditing] = useState(null);      // existing code being edited, or null
  const [saving, setSaving] = useState(false);
  const [discountType, setDiscountType] = useState("percent");   // "percent" | "flat"

  const load = async () => {
    setLoading(true);
    try {
      const r = await adminApi.get("/promos");
      setRows(r.data.rows || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load promo codes");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(initialForm()); setEditing(null); setDiscountType("percent"); setShowForm(true);
  };
  const openEdit = (r) => {
    setForm({
      code: r.code,
      kind: r.kind || "general",
      percent_off:  r.percent_off  || "",
      flat_off_inr: r.flat_off_inr || "",
      applies_to_kinds: r.applies_to_kinds || ["bundle"],
      description: r.description || "",
      max_redemptions: r.max_redemptions || "",
      active: !!r.active,
    });
    setEditing(r.code);
    setDiscountType(r.flat_off_inr ? "flat" : "percent");
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      description: form.description || null,
      applies_to_kinds: form.applies_to_kinds,
      active: form.active,
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      // Only send the discount that matches the toggle.
      percent_off:  discountType === "percent" ? Number(form.percent_off) : null,
      flat_off_inr: discountType === "flat"    ? Number(form.flat_off_inr) : null,
    };
    if (!editing && !payload.code) return toast.error("Code is required");
    if (!payload.percent_off && !payload.flat_off_inr)
      return toast.error("Set either a percentage or a flat discount");
    setSaving(true);
    try {
      if (editing) {
        // Backend patch ignores `code` — code is immutable once created.
        const { code: _code, ...patch } = payload;
        await adminApi.patch(`/promos/${editing}`, patch);
        toast.success(`Promo ${editing} updated`);
      } else {
        await adminApi.post("/promos", payload);
        toast.success(`Promo ${payload.code} created`);
      }
      setShowForm(false); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const toggleActive = async (r) => {
    try {
      await adminApi.patch(`/promos/${r.code}`, { active: !r.active });
      toast.success(`${r.code} ${!r.active ? "activated" : "deactivated"}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Toggle failed");
    }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete promo code ${r.code}? Redemption history is preserved but the code stops working.`)) return;
    try {
      await adminApi.delete(`/promos/${r.code}`);
      toast.success(`${r.code} deleted`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div data-testid="admin-promos-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-slate-100">Promo Codes</h1>
          <p className="mt-1 text-[13px] text-slate-400">
            Spin up discount codes without redeploying. First-bundle-only codes cap at one redemption per user.
          </p>
        </div>
        <button
          data-testid="promo-create-btn"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2 text-[12.5px] font-bold text-white hover:-translate-y-0.5 transition"
        >
          <Plus className="h-4 w-4" /> New promo
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] py-16 text-center text-slate-500">
          <Tag className="mx-auto h-8 w-8 opacity-30 mb-2" />
          No promo codes yet. Click "New promo" to create the first one.
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-white/[0.03] text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Discount</th>
                <th className="px-4 py-3 text-left">Applies to</th>
                <th className="px-4 py-3 text-left">Kind</th>
                <th className="px-4 py-3 text-left">Redemptions</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.code} data-testid={`promo-row-${r.code}`} className="hover:bg-white/[0.03] transition">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-slate-100">{r.code}</span>
                    {r.description && (
                      <div className="text-[11px] text-slate-500 truncate max-w-[280px]">{r.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.percent_off
                      ? <span className="inline-flex items-center gap-1 text-emerald-300"><Percent size={12} />{r.percent_off}% off</span>
                      : <span className="inline-flex items-center gap-1 text-emerald-300"><IndianRupee size={12} />{r.flat_off_inr} off</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{(r.applies_to_kinds || []).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.kind === "first_bundle"
                      ? <span className="rounded-full bg-fuchsia-500/15 border border-fuchsia-500/30 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-fuchsia-300">First bundle</span>
                      : <span className="rounded-full bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-sky-300">General</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {r.redemptions} {r.max_redemptions ? <span className="text-slate-500">/ {r.max_redemptions}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      data-testid={`promo-toggle-${r.code}`}
                      onClick={() => toggleActive(r)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        r.active
                          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                          : "border-slate-500/30 bg-slate-500/15 text-slate-400 hover:bg-slate-500/25"
                      }`}
                    >
                      {r.active ? <><ToggleRight size={13} /> Active</>
                                : <><ToggleLeft  size={13} /> Off</>}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button data-testid={`promo-edit-${r.code}`} onClick={() => openEdit(r)}
                            className="text-[12px] font-semibold text-[#a48bff] hover:text-white mr-3"><Edit3 size={12} className="inline mr-0.5" />Edit</button>
                    <button data-testid={`promo-delete-${r.code}`} onClick={() => remove(r)}
                            className="text-[12px] font-semibold text-rose-300 hover:text-rose-100"><Trash2 size={12} className="inline mr-0.5" />Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit form */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex" data-testid="promo-form-drawer">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} aria-hidden />
          <form onSubmit={submit} className="relative ml-auto h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#0E0B22] p-6 space-y-4">
            <button type="button" onClick={() => setShowForm(false)}
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-white/5" data-testid="promo-form-close">
              <X className="h-4 w-4" />
            </button>
            <h2 className="font-headline text-xl font-bold text-slate-100">
              {editing ? `Edit ${editing}` : "New promo code"}
            </h2>

            {!editing && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Code</label>
                <input
                  data-testid="promo-form-code"
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))}
                  placeholder="e.g. DIWALI50"
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono uppercase text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Discount</label>
              <div className="mt-1.5 flex gap-2">
                <button type="button"
                        onClick={() => setDiscountType("percent")}
                        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
                          discountType === "percent"
                            ? "border-[#5139ED] bg-[#5139ED]/20 text-white"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"
                        }`}>
                  <Percent size={12} /> Percentage
                </button>
                <button type="button"
                        onClick={() => setDiscountType("flat")}
                        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${
                          discountType === "flat"
                            ? "border-[#5139ED] bg-[#5139ED]/20 text-white"
                            : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20"
                        }`}>
                  <IndianRupee size={12} /> Flat rupees
                </button>
              </div>
              {discountType === "percent" ? (
                <input
                  data-testid="promo-form-percent"
                  type="number"
                  min={1} max={90}
                  required
                  value={form.percent_off}
                  onChange={(e) => setForm((f) => ({ ...f, percent_off: e.target.value }))}
                  placeholder="20"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 focus:border-[#5139ED] focus:outline-none"
                />
              ) : (
                <input
                  data-testid="promo-form-flat"
                  type="number"
                  min={1}
                  required
                  value={form.flat_off_inr}
                  onChange={(e) => setForm((f) => ({ ...f, flat_off_inr: e.target.value }))}
                  placeholder="₹100"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 focus:border-[#5139ED] focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Kind</label>
              <select
                data-testid="promo-form-kind"
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 focus:border-[#5139ED] focus:outline-none"
              >
                {KIND_OPTIONS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <div className="mt-1 text-[11px] text-slate-500">
                {KIND_OPTIONS.find((k) => k.id === form.kind)?.hint}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Applies to plan types</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PLAN_KIND_OPTIONS.map((k) => {
                  const selected = form.applies_to_kinds.includes(k.id);
                  return (
                    <button key={k.id} type="button"
                            data-testid={`promo-form-kind-${k.id}`}
                            onClick={() => setForm((f) => ({
                              ...f,
                              applies_to_kinds: selected
                                ? f.applies_to_kinds.filter((x) => x !== k.id)
                                : [...f.applies_to_kinds, k.id],
                            }))}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                              selected
                                ? "border-[#5139ED] bg-[#5139ED]/15 text-white"
                                : "border-white/10 bg-white/5 text-slate-400"
                            }`}>
                      {selected && <Check size={11} />} {k.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Description (shown to users)</label>
              <input
                data-testid="promo-form-desc"
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Save 50% during Diwali"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Total redemption cap (optional)</label>
              <input
                data-testid="promo-form-max"
                type="number"
                min={1}
                value={form.max_redemptions}
                onChange={(e) => setForm((f) => ({ ...f, max_redemptions: e.target.value }))}
                placeholder="Leave blank for unlimited"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-[#5139ED] focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-[13px] text-slate-200">
              <input
                data-testid="promo-form-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>

            <button
              type="submit"
              data-testid="promo-form-save"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? "Save changes" : "Create promo"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
