// Node-system modals — kept in one file so they share styling primitives
// and can be tree-shaken together.
//
// Exports:
//   <PurchaseNodesModal />         — mount once at app root; reads state from NodeContext
//   <InsufficientNodesModal />     — auto-opens when NodeContext.insufficient is set
//   <ChargeConfirmationDialog />   — imperative use: pass `open`, `cost`, `moduleLabel`,
//                                    `onConfirm`, `onCancel`. Used inside module pages
//                                    right before firing a paid workflow.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Check, Loader2, Sparkles, ShieldAlert, Wallet, Info,
         GraduationCap, Zap, Building2, ArrowUpRight } from "lucide-react";
import { useNodes } from "@/context/NodeContext";
import { getNodePricing, createPurchaseIntent, verifyPayment } from "@/lib/api";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { toast } from "sonner";
import { GoldenLeaf } from "@/components/nodes/NodeBadge";

/* ─────────────────────── ModalShell ─────────────────────── */
function ModalShell({ open, onClose, children, testid, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = size === "lg" ? "max-w-3xl" : size === "md" ? "max-w-lg" : "max-w-md";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" data-testid={testid}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className={`relative w-full ${width} rounded-3xl border border-[#E7E7F3] bg-white p-6 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[#94A3B8] transition hover:bg-[#F1F5F9]"
          aria-label="Close"
          data-testid={`${testid}-close`}
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

/* ─────────────────────── PurchaseNodesModal ─────────────────────── */
export function PurchaseNodesModal() {
  const { purchaseOpen, closePurchase, balance, refresh, academicEmailEligible, isPro } = useNodes();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!purchaseOpen) return;
    getNodePricing().then((d) => setPlans(d.plans || [])).catch(() => setPlans([]));
  }, [purchaseOpen]);

  const buy = async (planId) => {
    setBusy(planId);
    try {
      // 1. Create a Razorpay order on the backend for this plan.
      const intent = await createPurchaseIntent(planId);

      // 2. Open the Standard Checkout modal against that order.
      await openRazorpayCheckout({
        intent,
        onSuccess: async (resp) => {
          // 3. Backend verifies the HMAC signature, credits nodes atomically
          //    and returns the fresh balance. Only trust it after this call.
          try {
            const r = await verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success(
              r.already_verified
                ? "Payment already verified"
                : `Purchase successful — ${r.credited} nodes added to your balance`,
              { description: `New balance: ${r.balance_after} nodes`, duration: 6000 },
            );
            refresh?.();
            closePurchase();
          } catch (e) {
            toast.error(
              e?.response?.data?.detail
                || "Payment received but verification failed. Please contact support with your payment ID.",
            );
          } finally {
            setBusy(null);
          }
        },
        onFailure: (err) => {
          toast.error(err?.description || err?.message || "Payment failed. Please try again.");
          setBusy(null);
        },
        onDismiss: () => {
          // User closed the modal without paying — no toast needed, silent.
          setBusy(null);
        },
      });
    } catch (e) {
      // 403 / 400 for gated plans (student without academic email, enterprise) —
      // surface the backend detail string verbatim so users know what to do.
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : (e?.message || "Could not start checkout."));
      setBusy(null);
    }
  };

  return (
    <ModalShell open={purchaseOpen} onClose={closePurchase} testid="purchase-modal" size="lg">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFBEB] text-[#B45309]">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-headline text-2xl font-bold tracking-tight text-[#0F172A]">Recharge Nodes</h2>
          <p className="mt-1 text-[13px] text-[#4B5563]">
            Buy nodes to run premium workflows. Nodes never expire and roll over between sessions.
            Your current balance is <strong>{balance}</strong>.
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans
          .filter((p) => (p.kind || "bundle") === "bundle" || p.kind === "student")
          .map((p) => {
          const perNode = p.nodes > 0 ? (p.price_inr / p.nodes).toFixed(1) : null;
          const highlighted = !!p.highlight;
          const isStudent = p.kind === "student";
          const studentBlocked = p.requires_academic_email && !academicEmailEligible;
          return (
            <div
              key={p.id}
              data-testid={`plan-${p.id}`}
              className={`relative flex flex-col rounded-2xl border p-5 transition ${highlighted
                ? "border-[#F59E0B]/50 bg-gradient-to-b from-[#FFFBEB] to-white shadow-[0_20px_44px_-24px_rgba(245,158,11,0.5)]"
                : isStudent
                ? "border-emerald-200 bg-gradient-to-b from-emerald-50/50 to-white"
                : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/30"}`}
            >
              {(highlighted || p.badge) && (
                <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white ${
                  highlighted
                    ? "bg-gradient-to-r from-[#F59E0B] to-[#B45309]"
                    : isStudent
                    ? "bg-emerald-600"
                    : "bg-slate-700"
                }`}>{p.badge || (highlighted ? "Most Popular" : "")}</span>
              )}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                {isStudent && <GraduationCap className="h-3.5 w-3.5 text-emerald-600" />}
                {p.label}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <GoldenLeaf size={20} />
                <span className="font-headline text-3xl font-bold text-[#0F172A]">{p.nodes}</span>
                <span className="text-[12px] text-[#64748B]">nodes</span>
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#0F172A]">
                ₹{p.price_inr}
                {perNode && <span className="ml-1 text-[11px] font-normal text-[#94A3B8]">₹{perNode}/node</span>}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[#4B5563]">{p.description}</p>
              <button
                type="button"
                data-testid={`buy-${p.id}`}
                onClick={() => buy(p.id)}
                disabled={!!busy || studentBlocked}
                title={studentBlocked ? "Requires an academic email address" : ""}
                className={`mt-auto pt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-bold transition ${highlighted
                  ? "bg-gradient-to-r from-[#F59E0B] to-[#B45309] text-white hover:-translate-y-0.5"
                  : isStudent
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"} disabled:pointer-events-none disabled:opacity-50`}
              >
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Buy plan
              </button>
              {studentBlocked && (
                <div className="mt-2 text-center text-[10.5px] text-emerald-700">
                  Sign in with an .edu / .ac.in email to unlock
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cross-sell subscription + enterprise */}
      {!isPro && (
        <Link
          to="/pricing"
          onClick={closePurchase}
          data-testid="recharge-see-full-pricing"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 hover:border-amber-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Zap className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[13px] font-bold text-[#0F172A]">
                Save with PhytoNet Pro — ₹1,499/mo
              </div>
              <div className="text-[11.5px] text-[#4B5563]">
                150 nodes/month with rollover · priority docking · Pro badge
              </div>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-amber-600" />
        </Link>
      )}

      <div className="mt-6 rounded-2xl border border-[#E7E7F3] bg-[#F8FAFC] p-3 text-[12px] text-[#475569]">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5139ED]" />
          <span>
            Payments are processed securely by Razorpay. Nodes are credited to your account the moment your payment is verified.
          </span>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─────────────────────── InsufficientNodesModal ─────────────────────── */
export function InsufficientNodesModal() {
  const { insufficient, clearInsufficient, openPurchase, balance } = useNodes();
  const open = !!insufficient;
  return (
    <ModalShell open={open} onClose={clearInsufficient} testid="insufficient-modal">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FEE2E2] text-[#B91C1C]">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-[#0F172A]">
            You don't have enough nodes
          </h2>
          <p className="mt-1 text-[13px] text-[#4B5563]">
            This workflow requires <strong>{insufficient?.required ?? 0}</strong> nodes.
            Your balance is <strong>{balance}</strong>.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { clearInsufficient(); openPurchase(); }}
          data-testid="insufficient-recharge"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#B45309] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(180,83,9,0.5)] transition hover:-translate-y-0.5"
        >
          <Wallet className="h-4 w-4" /> Recharge now
        </button>
        <button
          type="button"
          onClick={clearInsufficient}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#111827] transition hover:border-[#94A3B8]"
        >
          Not now
        </button>
      </div>
    </ModalShell>
  );
}

/* ─────────────────────── ChargeConfirmationDialog ─────────────────────── */
/**
 * Imperative dialog — the caller controls `open` and provides callbacks.
 * Renders: "This workflow will consume X nodes. Balance Y. [Continue] [Cancel]".
 */
export function ChargeConfirmationDialog({ open, cost, moduleLabel, onConfirm, onCancel }) {
  const { balance } = useNodes();
  return (
    <ModalShell open={open} onClose={onCancel} testid="charge-confirm-modal">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFFBEB] text-[#B45309]">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-headline text-xl font-bold tracking-tight text-[#0F172A]">
            {moduleLabel || "Start workflow"}?
          </h2>
          <p className="mt-1 text-[13px] text-[#4B5563]">
            This will consume <strong className="inline-flex items-center gap-1"><GoldenLeaf size={12} /> {cost} nodes</strong>.
          </p>
          <p className="text-[13px] text-[#4B5563]">
            Current balance: <strong>{balance}</strong> · After run: <strong>{Math.max(0, balance - cost)}</strong>.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          data-testid="charge-confirm"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#5139ED] via-[#8139ED] to-[#DB2777] px-5 py-2.5 text-[12.5px] font-bold text-white shadow-[0_12px_28px_-10px_rgba(81,57,237,0.55)] transition hover:-translate-y-0.5"
        >
          <Check className="h-4 w-4" /> Continue
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid="charge-cancel"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[12.5px] font-semibold text-[#111827] transition hover:border-[#94A3B8]"
        >
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}
