// Contact-Sales modal — opens from the Pricing page when a user picks the
// Lab / Team plan. Collects organisation, role, seat count, message and POSTs
// to /api/nodes/contact-sales. On success, shows a thank-you state.
import { useState, useEffect } from "react";
import { X, Users, Loader2, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { contactSales } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const TEAM_SIZE_OPTIONS = ["1-5", "6-10", "11-25", "26-50", "50+"];

export default function ContactSalesModal({ open, plan, onClose }) {
  const { user, openModal } = useAuth();
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setDone(false);
      setOrganization(""); setRole(""); setTeamSize(""); setMessage("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !plan) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { onClose?.(); openModal("login"); return; }
    if (!organization.trim()) return toast.error("Please tell us your organisation");
    setBusy(true);
    try {
      await contactSales({
        plan_id: plan.id,
        organization: organization.trim(),
        role: role.trim() || null,
        team_size: teamSize || null,
        message: message.trim() || null,
      });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not submit your inquiry. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" data-testid="contact-sales-modal">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg rounded-3xl border border-[#E7E7F3] bg-white p-6 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#F1F5F9]"
          aria-label="Close"
          data-testid="contact-sales-close"
        >
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <div data-testid="contact-sales-success" className="py-6 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-8 w-8" />
            </span>
            <h2 className="mt-5 font-headline text-2xl font-bold text-[#0F172A]">Thanks — we'll be in touch</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
              Our team will reach out within <strong>1 business day</strong> to discuss the {plan.label} plan for your organisation.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-[#0F172A] px-6 py-2.5 text-[13px] font-bold text-white hover:bg-[#111827] transition"
              data-testid="contact-sales-done"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <Building2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-headline text-2xl font-bold tracking-tight text-[#0F172A]">
                  Get a quote for {plan.label}
                </h2>
                <p className="mt-1 text-[13px] text-[#4B5563]">
                  Tell us about your team and we'll tailor a plan. Base rate: ₹{plan.price_inr.toLocaleString()}/mo.
                </p>
              </div>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                  Organisation<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="contact-sales-org"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. IIT Delhi Chemistry Dept."
                  className="mt-1.5 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2.5 text-[13.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Your role</label>
                  <input
                    type="text"
                    data-testid="contact-sales-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="e.g. PhD Scholar"
                    className="mt-1.5 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2.5 text-[13.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Team size</label>
                  <select
                    data-testid="contact-sales-team-size"
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2.5 text-[13.5px] text-[#0F172A] focus:border-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
                  >
                    <option value="">Select…</option>
                    {TEAM_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">
                  What are you hoping to do?
                </label>
                <textarea
                  data-testid="contact-sales-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. We want to screen ~500 compounds against 20 disease targets over the next semester."
                  className="mt-1.5 w-full rounded-xl border border-[#E7E7F3] bg-white px-3 py-2.5 text-[13.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#5139ED] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                data-testid="contact-sales-submit"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-3 text-[13px] font-bold text-white hover:-translate-y-0.5 transition disabled:pointer-events-none disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                Send inquiry
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
