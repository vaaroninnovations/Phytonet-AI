// Research Workspace — Project header with Share popover
import { useMemo, useState } from "react";
import { authApi } from "@/context/AuthContext";
import { Loader2, Share2, Copy, Check, Zap } from "lucide-react";
import { toast } from "sonner";

// Compute a live "Nodes used: X / Y" summary from the newest active run.
// While a run is executing we sum the per-step `charge` records (populated
// by routes/research.py after each successful step) so the meter climbs
// pair-by-pair. Free runs render as a green "Free run" pill so users
// don't get confused by a zero-out-of-N counter.
function useLiveNodeTicker(project) {
  return useMemo(() => {
    const runs = project?.runs || [];
    if (!runs.length) return null;
    // Pick the most-recent run that has a cost object.
    const run = [...runs].reverse().find((r) => r.cost);
    if (!run) return null;
    const cost = run.cost || {};
    const total = cost.total ?? 0;
    const running = run.status === "running" || run.status === "pending";
    const isFree  = cost.billable === false && cost.free_runs_left != null;

    const usedFromSteps = (run.plan || []).reduce((sum, s) => {
      const c = s?.cost || {};
      if (s.status !== "done") return sum;
      return sum + (c.charged || 0);
    }, 0);

    return {
      total, used: usedFromSteps, running, isFree,
      status: run.status,
      insufficient: !!cost.insufficient,
      balance: cost.balance,
      pairs: cost.docking_pairs || 0,
    };
  }, [project]);
}

export function ProjectHeader({ project }) {
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const ticker = useLiveNodeTicker(project);

  const enable = async () => {
    setBusy(true);
    try {
      const { data } = await authApi.post(`/research/projects/${project.id}/share`);
      const url = `${window.location.origin}/research/shared/${data.share_slug}`;
      setShareUrl(url);
      setOpen(true);
      toast.success("Public share link created");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to enable sharing");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await authApi.delete(`/research/projects/${project.id}/share`);
      setShareUrl("");
      setOpen(false);
      toast.success("Share link disabled");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to disable sharing");
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div data-testid="project-header"
         className="flex items-center justify-between gap-3 border-b border-white/5 bg-black/25 px-6 py-3 backdrop-blur-xl">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-slate-100">{project.title || "New Research"}</div>
        <div className="text-[11px] text-slate-500">{(project.messages || []).length} messages · {(project.runs || []).length} runs</div>
      </div>

      {/* Live nodes-used ticker — shows while a run is active or has cost data */}
      {ticker && ticker.total > 0 && (
        <div data-testid="nodes-used-ticker"
             title={ticker.isFree
                     ? "This run is free — first 3 runs of every account cost 0 nodes."
                     : `Balance: ${ticker.balance ?? "?"} nodes${
                         ticker.pairs ? ` · ${ticker.pairs} docking pair${ticker.pairs === 1 ? "" : "s"}` : ""
                       }`}
             className={`ml-auto mr-2 hidden md:flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold ${
               ticker.isFree
                 ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                 : ticker.insufficient
                   ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                   : "border-[#5139ED]/40 bg-[#5139ED]/10 text-[#c4b5fd]"
             }`}>
          <Zap size={12} className={ticker.running ? "animate-pulse" : ""} />
          {ticker.isFree ? (
            <span>Free run · <span className="opacity-80">0 / {ticker.total} nodes</span></span>
          ) : (
            <>
              <span data-testid="nodes-used-value">
                {ticker.used} / {ticker.total} nodes
              </span>
              {/* mini progress bar */}
              <span className="ml-1 hidden lg:inline-block h-1 w-24 rounded bg-white/10 overflow-hidden">
                <span className="block h-full rounded bg-gradient-to-r from-[#5139ED] to-[#8139ED] transition-all"
                      style={{ width: `${Math.min(100, Math.round(100 * ticker.used / Math.max(1, ticker.total)))}%` }} />
              </span>
            </>
          )}
          {ticker.running && (
            <span className="ml-1 text-[10px] text-slate-400 italic">running…</span>
          )}
        </div>
      )}

      <div className="relative">
        <button data-testid="share-project-btn"
                onClick={() => (shareUrl ? setOpen((o) => !o) : enable())}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] font-medium text-slate-100 hover:bg-white/10 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}
          Share
        </button>
        {open && shareUrl && (
          <div data-testid="share-popover"
               className="absolute right-0 top-full mt-2 w-[380px] rounded-xl border border-white/10 bg-[#141024] p-3 shadow-2xl shadow-black/50 z-30">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">Public link · Read-only</div>
            <div className="flex items-center gap-2">
              <input readOnly value={shareUrl}
                     data-testid="share-url-input"
                     onFocus={(e) => e.target.select()}
                     className="flex-1 rounded-md border border-white/10 bg-black/50 px-2 py-1.5 text-[11.5px] font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#5139ED]" />
              <button data-testid="copy-share-btn"
                      onClick={copy}
                      className="rounded-md bg-[#5139ED] px-2 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[#6242f5]">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              Anyone with this link can view the project's messages and results. They cannot execute or modify anything.
            </div>
            <div className="mt-2 flex items-center justify-between">
              <a href={shareUrl} target="_blank" rel="noreferrer"
                 className="text-[11px] text-[#a48bff] hover:text-white">Open in new tab →</a>
              <button data-testid="disable-share-btn"
                      onClick={disable}
                      className="text-[11px] text-rose-300 hover:text-rose-100">
                Disable sharing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
