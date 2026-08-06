// Research Workspace — Project header with Share popover
import { useState } from "react";
import { authApi } from "@/context/AuthContext";
import { Loader2, Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function ProjectHeader({ project }) {
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

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
