// PlanCard — renders an execution plan with per-step status + retry.
import {
  Sparkles, Loader2, CheckCircle2, Circle, XCircle, RotateCcw,
  Coins,
} from "lucide-react";

// Best per-node rate from the Research bundle (₹500 / 25 nodes = ₹20/node).
// Kept as a display hint only — actual billing is per-node, not per-rupee.
const NODE_TO_INR = 20;

export function PlanCard({ plan, title, cost, onExecute, executing, executed,
                           onRetryStep, retryingStepId }) {
  const total    = cost?.total;
  const insuff   = !!cost?.insufficient;
  const freeLeft = cost?.free_runs_left;
  const billable = !!cost?.billable;
  const inrEquiv = total ? Math.round(total * NODE_TO_INR) : 0;
  // Per-step cost lookup keyed by step id — the backend already returns this
  // in cost.steps as [{tool, step_id, cost, pairs?}]. We flatten it so the
  // plan list below can annotate each row with its individual cost.
  const stepCost = {};
  (cost?.steps || []).forEach((s) => { if (s.step_id) stepCost[s.step_id] = s; });
  return (
    <div data-testid="plan-card"
         className="mt-2 rounded-2xl border border-[#5139ED]/25 bg-gradient-to-br from-[#5139ED]/10 to-[#8139ED]/5 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">Execution Plan</div>
          <div className="mt-1 text-[15px] font-semibold text-slate-100">{title}</div>
          {total != null && (
            <div data-testid="plan-cost-pill" className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              {billable ? (
                <>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${
                    insuff ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                           : "border-[#5139ED]/40 bg-[#5139ED]/10 text-[#c4b5fd]"
                  }`}>
                    <Coins size={11} className="opacity-80" />
                    ~{total} node{total === 1 ? "" : "s"}
                    {inrEquiv > 0 && (
                      <span className="opacity-70">≈ ₹{inrEquiv.toLocaleString()}</span>
                    )}
                  </span>
                  {/* Explicit breakdown so users see exactly what they'll pay for */}
                  <span className="text-slate-400">
                    Planner <strong className="text-slate-200">{cost?.planner ?? 0}</strong>
                    {" + "}Tools <strong className="text-slate-200">{cost?.tools ?? 0}</strong>
                    {cost?.docking_pairs > 0 && (
                      <> {" + "}Docking <strong className="text-slate-200">{cost.docking} </strong>
                        <span className="opacity-70">({cost.docking_pairs} pair{cost.docking_pairs === 1 ? "" : "s"} × 3)</span>
                      </>
                    )}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200">
                  Free run · {freeLeft} left after this
                </span>
              )}
              {billable && cost?.balance != null && (
                <span className="text-slate-400">Balance: {cost.balance} nodes</span>
              )}
              {insuff && (
                <span className="text-rose-300 font-semibold">
                  Insufficient — top up to run
                </span>
              )}
            </div>
          )}
        </div>
        {!executed && (
          <button
            data-testid="plan-execute-btn"
            onClick={onExecute}
            disabled={executing || insuff}
            title={insuff ? "Not enough nodes — please top up first." : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#5139ED] px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-[#4128d4] disabled:opacity-60"
          >
            {executing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {executing ? "Running…" : "Run plan"}
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-1.5">
        {plan.map((s, i) => {
          const state = s.status || "pending";
          const Icon = state === "done" ? CheckCircle2
                     : state === "error" ? XCircle
                     : state === "running" ? Loader2 : Circle;
          const color = state === "done" ? "text-emerald-400"
                      : state === "error" ? "text-rose-400"
                      : state === "running" ? "text-amber-300"
                      : "text-slate-500";
          const progress = s.progress;
          const isRetrying = retryingStepId && retryingStepId === s.id;
          const sc = stepCost[s.id];
          return (
            <li key={s.id || i} data-testid={`plan-step-${i}`}
                className="flex items-start gap-2 text-[13px]">
              <Icon size={14} className={`${color} mt-0.5 flex-shrink-0 ${state === "running" ? "animate-spin" : ""}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-200">{s.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">{s.tool}</span>
                  {billable && sc && sc.cost > 0 && (
                    <span data-testid={`plan-step-${i}-cost`}
                          className="inline-flex items-center gap-0.5 rounded-full bg-[#5139ED]/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[#c4b5fd]">
                      {sc.cost}n
                      {sc.pairs > 0 && <span className="opacity-70">·{sc.pairs}p</span>}
                    </span>
                  )}
                  {billable && sc && sc.cost === 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-emerald-300">
                      free
                    </span>
                  )}
                  {state === "error" && onRetryStep && (
                    <button
                      data-testid={`plan-step-${i}-retry`}
                      onClick={() => onRetryStep(s.id)}
                      disabled={isRetrying}
                      className="ml-1 inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-60">
                      {isRetrying ? <Loader2 size={10} className="animate-spin" />
                                  : <RotateCcw size={10} />}
                      {isRetrying ? "Retrying…" : "Retry step"}
                    </button>
                  )}
                </div>
                {state === "running" && progress?.detail && (
                  <div data-testid={`plan-step-${i}-progress`}
                       className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-amber-200/90">
                    <span className="inline-block h-1 w-1 rounded-full bg-amber-300 animate-pulse" />
                    {progress.detail}
                  </div>
                )}
                {state === "done" && progress?.detail && (
                  <div className="mt-0.5 text-[11.5px] text-emerald-400/80">
                    {progress.detail}
                  </div>
                )}
                {state === "error" && progress?.detail && (
                  <div className="mt-0.5 text-[11.5px] text-rose-300">
                    {progress.detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
