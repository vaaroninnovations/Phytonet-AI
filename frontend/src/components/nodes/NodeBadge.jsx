// Golden-leaf node balance indicator for the top nav.
// Colour-coded (green >30, orange 10-30, red <10) with a click-through
// popover exposing balance / recharge / dashboard shortcuts.
import { useState, useId } from "react";
import { Link } from "react-router-dom";
import { Wallet, History, LayoutDashboard, AlertTriangle } from "lucide-react";
import { useNodes } from "@/context/NodeContext";
import { useAuth } from "@/context/AuthContext";

function tierClass(balance) {
  // Node currency is the "golden leaf" — always use amber/gold for the badge
  // so the currency icon stays visually consistent. Balance state is
  // conveyed via the AlertTriangle warning icon + border shade.
  if (balance == null)  return "text-[#B45309] bg-[#FFFBEB] border-[#FDE68A]";
  if (balance > 30)     return "text-[#B45309] bg-gradient-to-r from-[#FFFBEB] to-[#FEF3C7] border-[#FCD34D]";
  if (balance >= 10)    return "text-[#9A3412] bg-[#FFEDD5] border-[#FDBA74]";
  return "text-[#991B1B] bg-[#FEE2E2] border-[#FCA5A5]";
}

/**
 * Golden gradient leaf icon — used everywhere the node "currency" appears.
 * Uses an inline SVG with a linear-gradient stroke so the gold gradient
 * remains visible even at small sizes (background-clip:text fails on
 * stroke-based icons at <20px).
 */
export function GoldenLeaf({ size = 14, className = "", solid = false }) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `goldenLeaf-${gid}`;
  const stroke = solid ? "#B45309" : `url(#${gradId})`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#FDE68A" />
          <stop offset="40%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>
      {/* Leaf path (matches lucide-react Leaf) with gradient stroke + subtle fill */}
      <path
        d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 3.5 1 8.11-1.19 11.31C15.9 17.87 12 20 11 20Z"
        stroke={stroke}
        fill={solid ? "#FEF3C7" : `url(#${gradId})`}
        fillOpacity={solid ? 1 : 0.18}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"
        stroke={stroke}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
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
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12.5px] font-semibold shadow-[0_6px_18px_-10px_rgba(180,83,9,0.45)] transition hover:-translate-y-0.5 ${tier}`}
        aria-label={`Nodes: ${balance}`}
      >
        <GoldenLeaf size={16} />
        <span data-testid="node-balance" className="tabular-nums">{balance}</span>
        <span className="hidden sm:inline text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-75">nodes</span>
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
