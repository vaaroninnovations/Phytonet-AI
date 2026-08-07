// FloatingFeedbackBubble — persistent bottom-right bubble on every module
// and chat workflow. Replaces the intrusive auto-popup that used to fire
// after every backend job completion. Displays a small "new" dot when a
// run has just finished so the user knows their feedback is welcome.
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquarePlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useFeedbackOpener } from "./FeedbackDialog";

// URL prefix → feedback module id (mirrors the backend's PRETTY map).
const ROUTE_TO_MODULE = [
  ["/plant-database",                "plant-database"],
  ["/admet",                         "admet"],
  ["/compound-target-prediction",    "target-prediction"],
  ["/disease-target-identification", "disease-target-prediction"],
  ["/disease-target-prediction",     "disease-target-prediction"],
  ["/molecular-docking",             "molecular-docking"],
  ["/dock",                          "molecular-docking"],
  ["/molecular-dynamics",            "molecular-dynamics"],
  ["/ai-scientific-report",          "ai-scientific-report"],
  ["/phytonet-ai",                   "phytonet-ai-agent"],
  ["/research",                      "phytonet-ai-agent"],
  ["/app",                           "phytonet-ai-agent"],
];

// Hide the bubble on pages where it would be noise (marketing pages,
// admin, checkout, auth callbacks…). The bubble only surfaces where the
// user is actively doing research work.
const HIDE_PATH_PREFIXES = [
  "/admin", "/pricing", "/verify-email", "/auth/", "/checkout",
  "/reset-password", "/forgot-password",
];

function moduleForPath(pathname) {
  for (const [prefix, id] of ROUTE_TO_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return id;
  }
  return null;
}

export function FloatingFeedbackBubble() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const openDialog = useFeedbackOpener();
  const [pulse, setPulse] = useState(false);

  // Show a subtle dot when a run just completed (via useFeedbackTrigger
  // breadcrumb). Clears the flag once the user opens the bubble.
  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem("phytonet_fb_last_task");
        if (!raw) { setPulse(false); return; }
        const { at } = JSON.parse(raw);
        // "recent" = last 10 minutes
        setPulse(Date.now() - (at || 0) < 10 * 60 * 1000);
      } catch { setPulse(false); }
    };
    check();
    const on = () => check();
    window.addEventListener("phytonet:feedback-available", on);
    window.addEventListener("storage", on);
    const int = setInterval(check, 30_000);
    return () => {
      window.removeEventListener("phytonet:feedback-available", on);
      window.removeEventListener("storage", on);
      clearInterval(int);
    };
  }, []);

  // Anonymous users don't see the bubble (feedback endpoint requires auth).
  if (!user) return null;
  if (HIDE_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const currentModule = moduleForPath(pathname);

  const onClick = () => {
    if (!openDialog) return;
    let last = null;
    try {
      const raw = localStorage.getItem("phytonet_fb_last_task");
      if (raw) last = JSON.parse(raw);
    } catch {}
    // Prefer the most recent completed-run task-id (if any and same
    // module) so the feedback ties back to the actual work. Otherwise
    // synthesise a manual task-id so /feedback still accepts the row.
    const module_ = (last?.module) || currentModule || "phytonet-ai-agent";
    const taskId  = (last && last.module === module_)
      ? last.taskId
      : `manual-${module_}-${Date.now()}`;
    openDialog({ module: module_, taskId, workflowId: last?.workflowId });
    setPulse(false);
    try { localStorage.removeItem("phytonet_fb_last_task"); } catch {}
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="floating-feedback-bubble"
      title="Send feedback about this page"
      aria-label="Send feedback"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full
                 bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED]
                 px-4 py-2.5 text-[12.5px] font-semibold text-white
                 shadow-[0_18px_36px_-14px_rgba(81,57,237,0.6)]
                 hover:brightness-110 hover:shadow-[0_22px_48px_-14px_rgba(81,57,237,0.7)]
                 active:scale-[0.97] transition-all"
    >
      <MessageSquarePlus className="h-4 w-4" />
      <span className="hidden sm:inline">Feedback</span>
      {pulse && (
        <span data-testid="floating-feedback-pulse"
              className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400 border-2 border-white" />
        </span>
      )}
    </button>
  );
}
