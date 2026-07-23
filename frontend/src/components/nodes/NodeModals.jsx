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
import { X, Check, Loader2, Sparkles, ShieldAlert, Wallet, Info } from "lucide-react";
import { useNodes } from "@/context/NodeContext";
import { getNodePricing, createPurchaseIntent } from "@/lib/api";
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
  const { purchaseOpen, closePurchase, balance } = useNodes();
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!purchaseOpen) return;
    getNodePricing().then((d) => setPlans(d.plans || [])).catch(() => setPlans([]));
  }, [purchaseOpen]);

  const buy = async (planId) => {
    setBusy(planId);
    try {
      const d = await createPurchaseIntent(planId);
      toast.message("Payment gateway coming soon", {
        description: d.message,
        duration: 6000,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create purchase intent");
    } finally {
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

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const perNode = (p.price_inr / p.nodes).toFixed(1);
          const highlighted = !!p.highlight;
          return (
            <div
              key={p.id}
              data-testid={`plan-${p.id}`}
              className={`relative flex flex-col rounded-2xl border p-5 transition ${highlighted
                ? "border-[#F59E0B]/50 bg-gradient-to-b from-[#FFFBEB] to-white shadow-[0_20px_44px_-24px_rgba(245,158,11,0.5)]"
                : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/30"}`}
            >
              {highlighted && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#B45309] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  {p.badge || "Most Popular"}
                </span>
              )}
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">{p.label}</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <GoldenLeaf size={20} />
                <span className="font-headline text-3xl font-bold text-[#0F172A]">{p.nodes}</span>
                <span className="text-[12px] text-[#64748B]">nodes</span>
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#0F172A]">
                ₹{p.price_inr}
                <span className="ml-1 text-[11px] font-normal text-[#94A3B8]">₹{perNode}/node</span>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[#4B5563]">{p.description}</p>
              <button
                type="button"
                data-testid={`buy-${p.id}`}
                onClick={() => buy(p.id)}
                disabled={!!busy}
                className={`mt-auto pt-4 inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[12.5px] font-bold transition ${highlighted
                  ? "bg-gradient-to-r from-[#F59E0B] to-[#B45309] text-white hover:-translate-y-0.5"
                  : "border border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]"} disabled:pointer-events-none disabled:opacity-50`}
              >
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Buy plan
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-[#E7E7F3] bg-[#F8FAFC] p-3 text-[12px] text-[#475569]">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#5139ED]" />
          <span>
            Payment gateway is being configured. Clicking "Buy plan" records your interest — we'll notify you the moment purchases go live.
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
