// Golden-leaf node balance indicator for the top nav.
// Colour-coded (green >30, orange 10-30, red <10) with a click-through
// popover exposing balance / recharge / dashboard shortcuts.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Leaf, Zap, Wallet, History, LayoutDashboard, AlertTriangle } from "lucide-react";
import { useNodes } from "@/context/NodeContext";
import { useAuth } from "@/context/AuthContext";

function tierClass(balance) {
  if (balance == null) return "text-[#94A3B8] bg-white/60 border-[#E7E7F3]";
  if (balance > 30)   return "text-[#166534] bg-[#DCFCE7] border-[#86EFAC]";
  if (balance >= 10)  return "text-[#9A3412] bg-[#FFEDD5] border-[#FDBA74]";
  return "text-[#991B1B] bg-[#FEE2E2] border-[#FCA5A5]";
}

/** Golden gradient leaf icon — used everywhere the node "currency" appears. */
export function GoldenLeaf({ size = 14, className = "" }) {
  return (
    <span
      className={`inline-flex ${className}`}
      style={{
        color: "transparent",
        background: "linear-gradient(135deg, #FBBF24 0%, #F59E0B 45%, #B45309 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
      }}
      aria-hidden
    >
      <Leaf size={size} strokeWidth={2.4} />
    </span>
  );
}

export default function NodeBadge() {
  const { user } = useAuth();
  const { balance, lifetimeUsed, ready, openPurchase } = useNodes();
  const [open, setOpen] = useState(false);
  if (!user) return null;         // guests don't see a balance
  if (!ready) return null;
  const tier = tierClass(balance);
  const low = balance < 10;

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="node-badge"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold transition hover:-translate-y-0.5 ${tier}`}
        aria-label={`Nodes: ${balance}`}
      >
        <GoldenLeaf size={13} />
        <span data-testid="node-balance">Nodes: {balance}</span>
        {low && <AlertTriangle className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            data-testid="node-badge-popover"
            className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-[#E7E7F3] bg-white p-3 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.28)]"
          >
            <div className="rounded-xl bg-gradient-to-br from-[#FFFBEB] to-white p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#B45309]">Current Balance</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <GoldenLeaf size={20} />
                <span className="font-headline text-2xl font-bold text-[#0F172A]">{balance}</span>
                <span className="text-[11px] text-[#94A3B8]">nodes</span>
              </div>
              <div className="mt-2 text-[11px] text-[#64748B]">
                Total used to date: <strong className="text-[#0F172A]">{lifetimeUsed}</strong>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => { openPurchase(); setOpen(false); }}
                data-testid="badge-recharge"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-[#0F172A] transition hover:bg-[#F8FAFC]"
              >
                <Wallet className="h-4 w-4 text-[#B45309]" /> Recharge nodes
              </button>
              <Link
                to="/my-projects?tab=nodes"
                onClick={() => setOpen(false)}
                data-testid="badge-history"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-[#0F172A] transition hover:bg-[#F8FAFC]"
              >
                <History className="h-4 w-4 text-[#5139ED]" /> Usage history
              </Link>
              <Link
                to="/my-projects"
                onClick={() => setOpen(false)}
                data-testid="badge-dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] text-[#0F172A] transition hover:bg-[#F8FAFC]"
              >
                <LayoutDashboard className="h-4 w-4 text-[#2BB673]" /> Dashboard
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
