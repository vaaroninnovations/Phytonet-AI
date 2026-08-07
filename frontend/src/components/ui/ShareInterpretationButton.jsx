// ShareInterpretationButton — one-click generator of a read-only public
// URL that renders the interpretation (and the rest of the project) for
// a colleague. Reuses the existing /research/projects/{pid}/share
// endpoint (idempotent) and copies the URL to clipboard.
import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { authApi } from "@/context/AuthContext";

export function ShareInterpretationButton({ projectId, anchor = "interpretation",
                                             testid, className = "" }) {
  const [busy, setBusy]   = useState(false);
  const [done, setDone]   = useState(false);

  const shareIt = async () => {
    if (!projectId) {
      toast.error("Cannot share — project id not ready yet.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await authApi.post(`/research/projects/${projectId}/share`);
      const url = `${window.location.origin}/research/shared/${data.share_slug}#${anchor}`;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const ta = document.createElement("textarea");
          ta.value = url;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setDone(true);
        toast.success("Read-only share link copied to clipboard");
        setTimeout(() => setDone(false), 1800);
      } catch {
        // Clipboard blocked — surface the URL in a toast so the user
        // can still copy it manually.
        toast.success("Share link created", { description: url, duration: 12000 });
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to enable sharing");
    } finally { setBusy(false); }
  };

  return (
    <button
      type="button"
      data-testid={testid}
      onClick={shareIt}
      disabled={busy}
      title="Copy a read-only URL to share with a colleague"
      className={
        "inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 " +
        "px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10 " +
        "disabled:opacity-60 transition-colors " +
        (done ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10 " : "") +
        className
      }
    >
      {busy ? <Loader2 size={11} className="animate-spin" />
           : done ? <Check size={11} /> : <Share2 size={11} />}
      {done ? "Link copied" : busy ? "Sharing…" : "Share"}
    </button>
  );
}
