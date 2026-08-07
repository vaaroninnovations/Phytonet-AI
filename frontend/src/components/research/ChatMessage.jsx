// Research Workspace — Chat message bubble (user / assistant + plan + result cards)
import { Bot, User, Sparkles, ArrowRight } from "lucide-react";
import { PlanCard, ResultCard } from "./cards";

export function ChatMessage({ msg, run, onExecute, executing, onOpenRun, onSend,
                              onRetryStep, retryingStepId, hideResults }) {
  const isUser = msg.role === "user";
  const Icon = isUser ? User : Bot;
  return (
    <div data-testid={`msg-${msg.role}`}
         className={`flex gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && (
        <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-lg bg-gradient-to-br from-[#5139ED] to-[#8139ED] flex items-center justify-center shadow-lg">
          <Icon size={15} className="text-white" />
        </div>
      )}
      <div className={`max-w-[820px] ${isUser ? "text-right" : ""} flex-1`}>
        <div className={`inline-block rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
          isUser
            ? "bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-white"
            : "bg-white/5 border border-white/10 text-slate-100 backdrop-blur-sm"
        }`}>
          {msg.text}
        </div>
        {!isUser && (msg.next_steps || []).length > 0 && (
          <div data-testid="next-steps" className="mt-2 flex flex-wrap gap-1.5">
            <div className="w-full text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">
              Suggested next steps
            </div>
            {(msg.next_steps || []).map((s, i) => (
              <button key={i}
                      data-testid={`next-step-${i}`}
                      onClick={() => onSend && onSend(s)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#5139ED]/40 bg-[#5139ED]/10 px-3 py-1 text-[12px] text-slate-100 hover:bg-[#5139ED]/25 hover:border-[#5139ED]/70 transition-colors">
                <Sparkles size={11} className="text-[#a48bff]" />
                {s}
                <ArrowRight size={11} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}
        {msg.mode === "plan" && run && (
          <PlanCard
            plan={run.plan || msg.plan || []}
            title={msg.title || run.title}
            cost={run.cost || msg.cost}
            onExecute={() => onExecute(run.id)}
            executing={executing === run.id || run.status === "running"}
            executed={run.status === "completed" || run.status === "failed"}
            onRetryStep={onRetryStep ? (stepId) => onRetryStep(run.id, stepId) : undefined}
            retryingStepId={retryingStepId?.runId === run.id ? retryingStepId.stepId : null}
          />
        )}
        {run?.results?.map((res, i) => (
          hideResults
            ? null
            : <ResultCard key={i} result={res.result} onOpen={() => onOpenRun(run)} />
        ))}
        {/* Live partial results (e.g. docking streaming). Only shown in the
            main chat feed when hideResults is false — the workspace's
            VizPanel already has its own copy. */}
        {!hideResults && (run?.plan || [])
          .filter((s) => s.status !== "done" && s.status !== "error" && s.partial_result)
          .map((s) => (
            <ResultCard key={`partial-${s.id}`} result={s.partial_result}
                        onOpen={() => onOpenRun(run)} />
          ))}
      </div>
      {isUser && (
        <div className="flex-shrink-0 mt-1 h-8 w-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center">
          <Icon size={15} className="text-slate-300" />
        </div>
      )}
    </div>
  );
}
