// Modal shown after login when an autosave exists — offers Resume / Discard.
import { useProject } from "@/context/ProjectContext";
import { X, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { WORKFLOW_STEPS } from "@/context/WorkflowContext";
import { useMemo } from "react";

const STEP_LABELS = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s.label]));
const STEP_ROUTES = Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.id, s.route]));

export default function ResumeSessionModal() {
  const { resumePrompt, autosaveMeta, resumeAutosave, discardAutosave } = useProject();
  const navigate = useNavigate();
  const meta = autosaveMeta;

  const summary = useMemo(() => {
    if (!meta) return "";
    const s = meta.workflow_state || {};
    const bits = [];
    if (s.plantName) bits.push(`Plant: ${s.plantName}`);
    if (Array.isArray(s.selectedCompounds) && s.selectedCompounds.length) bits.push(`${s.selectedCompounds.length} selected compounds`);
    if (s.selectedDisease?.label || s.selectedDisease?.name) bits.push(`Disease: ${s.selectedDisease.label || s.selectedDisease.name}`);
    if (Array.isArray(s.compounds) && s.compounds.length) bits.push(`${s.compounds.length} compounds in table`);
    return bits.join(" · ") || "Workflow state saved";
  }, [meta]);

  if (!resumePrompt || !meta) return null;

  const currentLabel = STEP_LABELS[meta.current_step] || "workflow";
  const timeLabel = meta.updated_at ? new Date(meta.updated_at).toLocaleString() : "";

  const onResume = async () => {
    await resumeAutosave();
    const route = STEP_ROUTES[meta.current_step];
    if (route) navigate(route);
  };

  return (
    <div data-testid="resume-modal" role="dialog" aria-modal="true"
         className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0B18]/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-3xl border border-[#E7E7F3] bg-white p-8 shadow-[0_24px_60px_-20px_rgba(81,57,237,0.4)]">
        <button data-testid="resume-close" onClick={discardAutosave}
                className="absolute right-5 top-5 rounded-full p-1 text-[#64748B] hover:bg-[#F1F1FA]">
          <X className="h-4 w-4" />
        </button>

        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">Auto-saved session</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-[#0B0B18]">Resume your previous session?</h2>
        <p className="mt-2 text-sm text-[#64748B]">
          We saved your workflow state on this account. You can pick up right where you left off — no re-uploads needed.
        </p>

        <div className="mt-5 rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Current step</p>
          <p className="mt-1 text-sm font-semibold text-[#0B0B18]">{currentLabel}</p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Snapshot</p>
          <p className="mt-1 text-xs text-[#1E1E33]">{summary}</p>
          {timeLabel && <p className="mt-2 text-[10px] text-[#94A3B8]">Saved {timeLabel}</p>}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button data-testid="resume-discard" onClick={discardAutosave}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-sm font-semibold text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]">
            <Trash2 className="h-4 w-4" />Discard
          </button>
          <button data-testid="resume-continue" onClick={onResume}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]">
            <RefreshCw className="h-4 w-4" />Resume
          </button>
        </div>
      </div>
    </div>
  );
}
