// FeedbackDialog + useFeedbackTrigger — reusable post-task feedback capture.
//
// Rendered ONCE at the app root (see App.js) so any module can request the
// dialog by calling `useFeedbackTrigger(module).open(taskId, workflowId?)`.
// The dialog fetches `/api/feedback/eligible` first — if the user has already
// rated this task, it silently no-ops (satisfies the "one per task" rule).
// Anonymous users see nothing (feedback requires a signed-in user).
//
// Persistence: submissions are stored server-side (MongoDB `feedback`
// collection). We also mirror the completed task-id in localStorage so we
// don't re-hit the eligibility endpoint on every page navigation.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Star, X, Loader2, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ─────────────────────── Context ─────────────────────── */
const FeedbackCtx = createContext(null);

export function FeedbackProvider({ children }) {
  const [state, setState] = useState(null);   // { module, taskId, workflowId } | null

  const open = useCallback(({ module, taskId, workflowId }) => {
    if (!module || !taskId) return;
    // Local dedupe — avoids hammering the API when the same task-id appears
    // during React re-renders / batch runs.
    const key = `phytonet_fb_${module}_${taskId}`;
    if (typeof window !== "undefined" && localStorage.getItem(key)) return;
    setState({ module, taskId, workflowId });
  }, []);

  const close = useCallback(() => setState(null), []);

  const value = useMemo(() => ({ open, close, state }), [open, close, state]);
  return (
    <FeedbackCtx.Provider value={value}>
      {children}
      <FeedbackDialog />
    </FeedbackCtx.Provider>
  );
}

/** Small hook — kept for backwards-compat with existing module pages that
 *  call `.open(taskId)` when a run completes. As of Feb-2026 auto-popups
 *  are DISABLED (they were experienced as intrusive); the trigger now
 *  silently marks the module as "feedback available" so the persistent
 *  floating bubble can react (e.g. show a small dot badge) — the user
 *  decides when to open the dialog. */
export function useFeedbackTrigger(module) {
  const ctx = useContext(FeedbackCtx);
  return {
    open: (taskId, workflowId) => {
      if (!module || !taskId) return;
      // Cheap breadcrumb — the floating bubble reads this on mount so it
      // can flag "we noticed you just finished a run, tap for feedback".
      try {
        localStorage.setItem("phytonet_fb_last_task",
          JSON.stringify({ module, taskId, workflowId, at: Date.now() }));
      } catch {}
      // Broadcast for same-window listeners (localStorage 'storage' events
      // don't fire in the tab that wrote the value).
      try {
        window.dispatchEvent(new CustomEvent("phytonet:feedback-available",
          { detail: { module, taskId, workflowId } }));
      } catch {}
    },
    /** Programmatic manual-open — used by the floating bubble. */
    openManual: (module_, taskId, workflowId) =>
      ctx?.open({ module: module_ || module, taskId, workflowId }),
  };
}

/** Direct access to the FeedbackDialog opener, needed by the floating
 *  bubble that doesn't know its module until click time. */
export function useFeedbackOpener() {
  const ctx = useContext(FeedbackCtx);
  return ctx?.open;
}

/* ─────────────────────── Dialog ─────────────────────── */
function FeedbackDialog() {
  const ctx = useContext(FeedbackCtx);
  const state = ctx?.state;
  const [eligible, setEligible] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [ratings, setRatings] = useState({ overall: 0, ease_of_use: 0, accuracy: 0, speed: 0 });
  const [recommend, setRecommend] = useState(null);
  const [comments, setComments] = useState("");

  useEffect(() => {
    if (!state) return;
    setEligible(null); setSubmitting(false);
    setRatings({ overall: 0, ease_of_use: 0, accuracy: 0, speed: 0 });
    setRecommend(null); setComments("");
    // Check server-side eligibility (respects the one-per-task rule even
    // across devices, unlike localStorage-only).
    axios.get(`${API}/feedback/eligible`, {
      withCredentials: true,
      params: { module: state.module, task_id: state.taskId },
    })
      .then((r) => setEligible(!!r.data?.eligible))
      .catch(() => setEligible(false));    // auth failure → silently skip
  }, [state]);

  // If the server says already-submitted (or 401), close silently.
  useEffect(() => {
    if (state && eligible === false) {
      const key = `phytonet_fb_${state.module}_${state.taskId}`;
      try { localStorage.setItem(key, "1"); } catch {}
      ctx?.close();
    }
  }, [state, eligible, ctx]);

  if (!state || !eligible) return null;

  const canSubmit = ratings.overall > 0 && ratings.ease_of_use > 0
    && ratings.accuracy > 0 && ratings.speed > 0 && recommend !== null;

  const skip = () => {
    // Skip counts as "not now" — we don't lock the task, so the user can
    // still be prompted after their next run for the same module.
    ctx?.close();
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/feedback`, {
        module: state.module,
        task_id: state.taskId,
        workflow_id: state.workflowId || null,
        ratings,
        would_recommend: recommend,
        comments: comments.trim() || null,
      }, { withCredentials: true });
      const key = `phytonet_fb_${state.module}_${state.taskId}`;
      try { localStorage.setItem(key, "1"); } catch {}
      toast.success("Thanks for the feedback!", {
        description: "Every rating helps us improve the platform.",
      });
      ctx?.close();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="feedback-dialog"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={skip}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_40px_80px_-30px_rgba(15,23,42,0.5)]"
      >
        {/* Header */}
        <div className="relative flex items-start justify-between gap-3 border-b border-[#F1F1FA] bg-gradient-to-b from-[#F5F5FC] to-white px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Quick Feedback</p>
            <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
              How was <span className="text-[#5139ED]">{PRETTY[state.module] || state.module}</span>?
            </h3>
            <p className="mt-0.5 text-[12px] text-[#64748B]">Takes 15 seconds — helps us prioritise fixes and improvements.</p>
          </div>
          <button
            data-testid="feedback-close"
            onClick={skip}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#0B0B18]/5 text-[#374151] hover:bg-[#0B0B18]/10"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          <RatingRow label="Overall"     value={ratings.overall}     onChange={(n) => setRatings((r) => ({ ...r, overall: n }))}     testid="rating-overall" />
          <RatingRow label="Ease of use" value={ratings.ease_of_use} onChange={(n) => setRatings((r) => ({ ...r, ease_of_use: n }))} testid="rating-ease" />
          <RatingRow label="Accuracy"    value={ratings.accuracy}    onChange={(n) => setRatings((r) => ({ ...r, accuracy: n }))}    testid="rating-accuracy" />
          <RatingRow label="Speed"       value={ratings.speed}       onChange={(n) => setRatings((r) => ({ ...r, speed: n }))}       testid="rating-speed" />

          {/* Recommend Y/N */}
          <div className="mt-4">
            <p className="text-[12.5px] font-semibold text-[#0B0B18]">Would you recommend this module?</p>
            <div className="mt-2 flex gap-2">
              <button
                data-testid="recommend-yes"
                onClick={() => setRecommend(true)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                  recommend === true
                    ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.55)]"
                    : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-emerald-400/50"
                }`}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Yes
              </button>
              <button
                data-testid="recommend-no"
                onClick={() => setRecommend(false)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                  recommend === false
                    ? "border-rose-500 bg-rose-500 text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.55)]"
                    : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-rose-400/50"
                }`}
              >
                <ThumbsDown className="h-3.5 w-3.5" /> No
              </button>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="flex items-center gap-1 text-[12.5px] font-semibold text-[#0B0B18]">
              <MessageSquare className="h-3.5 w-3.5 text-[#5139ED]" />
              Comments <span className="text-[11px] font-normal text-[#94A3B8]">(optional)</span>
            </span>
            <textarea
              data-testid="feedback-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Anything specific we should improve?"
              className="mt-1 w-full resize-y rounded-xl border border-[#E7E7F3] bg-white px-3 py-2 text-[13px] focus:border-[#5139ED]/40 focus:outline-none focus:ring-2 focus:ring-[#5139ED]/20"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#F1F1FA] bg-[#FBFBFF] px-6 py-3">
          <button
            data-testid="feedback-skip"
            onClick={skip}
            className="rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#374151] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            Skip
          </button>
          <button
            data-testid="feedback-submit"
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2 text-[12.5px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit feedback
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange, testid }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-semibold text-[#0B0B18]">{label}</span>
      <div className="flex gap-1" data-testid={testid}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            data-testid={`${testid}-${n}`}
            onClick={() => onChange(n)}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-[#F5F5FC]"
            aria-label={`${label} ${n} of 5`}
          >
            <Star
              className={`h-5 w-5 transition ${
                n <= value ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#CBD5E1]"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

const PRETTY = {
  "plant-database": "Plant Database",
  "target-prediction": "Compound Target Prediction",
  "disease-target-prediction": "Disease Target Prediction",
  "admet": "ADMET Prediction",
  "molecular-docking": "Molecular Docking",
  "phytonet-ai-agent": "the PhytoNet AI Agent",
  "network-analysis": "Network Analysis",
  "ai-report": "the AI Scientific Report",
  "molecular-dynamics": "Molecular Dynamics",
};
