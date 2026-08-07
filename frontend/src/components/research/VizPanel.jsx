// Research Workspace — Right-side visualization panel
import { X, Sparkles, ArrowRight } from "lucide-react";
import { ResultCard } from "./cards";

export function VizPanel({ activeRun, onClose, onSend }) {
  if (!activeRun) return null;
  return (
    <aside data-testid="viz-panel"
           className="hidden lg:flex w-[380px] xl:w-[420px] flex-shrink-0 flex-col border-l border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">Viz Panel</div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-100">{activeRun.title}</div>
        </div>
        <button data-testid="viz-close" onClick={onClose}
                className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-slate-100"><X size={16}/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(activeRun.results || []).map((r, i) => (
          <ResultCard key={i} result={r.result} />
        ))}
        {/* Live partial-result cards from any still-running step (e.g.
            docking streaming pair-by-pair). Rendered after the completed
            cards so they appear at the bottom of the chronological feed. */}
        {(activeRun.plan || [])
          .filter((s) => s.status !== "done"
                      && s.status !== "error"
                      && s.partial_result)
          .map((s) => (
            <ResultCard key={`partial-${s.id}`} result={s.partial_result} />
          ))}
        {activeRun.interpretation && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[13px] leading-relaxed text-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300 mb-1">Interpretation</div>
            {activeRun.interpretation}
          </div>
        )}
        {(activeRun.next_steps || []).length > 0 && (
          <div data-testid="viz-next-steps"
               className="rounded-xl border border-[#5139ED]/30 bg-[#5139ED]/5 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff] mb-2">
              Suggested next steps
            </div>
            <div className="flex flex-col gap-1.5">
              {(activeRun.next_steps || []).map((s, i) => (
                <button key={i}
                        data-testid={`viz-next-step-${i}`}
                        onClick={() => onSend && onSend(s)}
                        className="group flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-[12.5px] text-slate-200 hover:bg-[#5139ED]/15 hover:border-[#5139ED]/50 transition-colors">
                  <Sparkles size={12} className="mt-0.5 text-[#a48bff] flex-shrink-0" />
                  <span className="flex-1">{s}</span>
                  <ArrowRight size={12} className="mt-0.5 text-slate-400 group-hover:text-slate-100" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
