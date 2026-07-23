// Global node-credit state — balance, threshold toasts, module cost lookup,
// and imperative helpers (`charge`, `refresh`, `requireBalance`).
//
// The provider silently returns "guest" state when the user isn't logged in,
// so mounting <NodeProvider> in App.js is safe even for public pages.
import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { chargeNodes, getNodeBalance } from "@/lib/api";

const NodeContext = createContext(null);

// Threshold notifications (fires only when balance crosses a boundary downward).
const THRESHOLDS = [
  { value: 20, msg: "Your node balance is getting low.", tone: "warning" },
  { value: 10, msg: "Only 10 nodes remaining.", tone: "warning" },
  { value: 5,  msg: "Your remaining nodes may not be sufficient for future workflows.", tone: "warning" },
  { value: 0,  msg: "Your node balance has been exhausted.", tone: "error" },
];

// Fallback map — mirrors backend routes/nodes.py MODULE_COSTS. If the backend
// returns an updated map we merge it in.
const DEFAULT_COSTS = {
  "phytonet-ai-agent": 10,
  "molecular-docking": 5,
};

export function NodeProvider({ children }) {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [lifetimeUsed, setLifetimeUsed] = useState(0);
  const [lifetimePurchased, setLifetimePurchased] = useState(0);
  const [moduleCosts, setModuleCosts] = useState(DEFAULT_COSTS);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [insufficient, setInsufficient] = useState(null); // { required, module }
  const lastBalanceRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!user) { setReady(true); return; }
    setLoading(true);
    try {
      const d = await getNodeBalance();
      setBalance(d.balance || 0);
      setLifetimeUsed(d.lifetime_used || 0);
      setLifetimePurchased(d.lifetime_purchased || 0);
      if (d.module_costs && typeof d.module_costs === "object") {
        setModuleCosts({ ...DEFAULT_COSTS, ...d.module_costs });
      }
    } catch (e) {
      // Silent for guests / expired sessions — the badge just hides.
      setBalance(0);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Threshold toasts — fire only on downward crossings.
  useEffect(() => {
    if (!user) return;
    const prev = lastBalanceRef.current;
    lastBalanceRef.current = balance;
    if (prev == null) return; // first render
    for (const t of THRESHOLDS) {
      if (prev > t.value && balance <= t.value) {
        const opts = { description: `Balance: ${balance} nodes.`, duration: 6000 };
        if (t.tone === "error") toast.error(t.msg, opts);
        else toast.warning(t.msg, opts);
      }
    }
  }, [balance, user]);

  /** Compute cost for a module id. Returns 0 for free modules. */
  const costFor = useCallback(
    (moduleId) => Number(moduleCosts[moduleId] ?? 0),
    [moduleCosts]
  );

  /**
   * Preflight: check if the user has enough balance for a given cost. Returns
   * `{ ok: true }` if yes; `{ ok: false, ... }` if not (also pops the
   * insufficient-nodes modal automatically).
   */
  const preflight = useCallback((moduleId, workflow) => {
    if (!user) {
      // Guest — surface the auth modal instead of the balance modal.
      window.__phytonet_auth?.openModal?.("login");
      return { ok: false, reason: "not_authenticated" };
    }
    const need = costFor(moduleId);
    if (need <= 0) return { ok: true, required: 0 };
    if (balance < need) {
      setInsufficient({ required: need, module: moduleId, workflow });
      return { ok: false, reason: "insufficient", required: need, balance };
    }
    return { ok: true, required: need };
  }, [balance, costFor, user]);

  /**
   * Debit nodes for a module run. Returns the new balance on success. If the
   * server responds 402 we open the recharge modal transparently.
   */
  const charge = useCallback(async ({ module, amount, jobId, workflow, reason }) => {
    if (!user) {
      window.__phytonet_auth?.openModal?.("login");
      throw new Error("not_authenticated");
    }
    try {
      const d = await chargeNodes({ module, amount, job_id: jobId, workflow, reason });
      setBalance(d.balance);
      if (typeof d.lifetime_used === "number") setLifetimeUsed(d.lifetime_used);
      return d;
    } catch (e) {
      if (e?.response?.status === 402) {
        setInsufficient({ required: amount, module, workflow });
      }
      throw e;
    }
  }, [user]);

  const value = useMemo(() => ({
    ready, loading, user,
    balance, lifetimeUsed, lifetimePurchased,
    moduleCosts, costFor,
    refresh, charge, preflight,
    // Purchase modal
    purchaseOpen, openPurchase: () => setPurchaseOpen(true), closePurchase: () => setPurchaseOpen(false),
    // Insufficient modal
    insufficient, clearInsufficient: () => setInsufficient(null),
  }), [ready, loading, user, balance, lifetimeUsed, lifetimePurchased,
      moduleCosts, costFor, refresh, charge, preflight,
      purchaseOpen, insufficient]);

  return <NodeContext.Provider value={value}>{children}</NodeContext.Provider>;
}

export function useNodes() {
  const ctx = useContext(NodeContext);
  if (!ctx) throw new Error("useNodes must be used within NodeProvider");
  return ctx;
}
