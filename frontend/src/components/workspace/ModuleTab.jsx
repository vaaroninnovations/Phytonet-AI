// Renders a standalone module (Plant Database, ADMET, etc.) inside a tab via
// iframe. The iframe stays mounted (display:none when tab is hidden) so its
// state is preserved when switching tabs.
import { useRef, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";

export function ModuleTab({ path, title, visible }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);

  return (
    <div data-testid={`module-tab-${path.replace(/\//g, "")}`}
         style={{ display: visible ? "flex" : "none" }}
         className="h-full w-full flex-col bg-white relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#0B0B18] via-[#141024] to-[#1A0F2E]">
          <Loader2 className="animate-spin text-[#a48bff]" size={26} />
          <div className="text-[13px] text-slate-300">Loading {title}…</div>
        </div>
      )}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-4 py-2 backdrop-blur-xl">
        <div className="text-[12px] text-slate-300">
          <span className="font-semibold text-white">{title}</span>
          <span className="ml-2 text-slate-500">· {path}</span>
        </div>
        <a href={path} target="_blank" rel="noreferrer"
           data-testid="module-open-new"
           className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10">
          <ExternalLink size={11} /> Open standalone
        </a>
      </div>
      <iframe
        ref={iframeRef}
        src={`${path}${path.includes("?") ? "&" : "?"}embed=1`}
        title={title}
        onLoad={() => setLoading(false)}
        data-testid="module-iframe"
        className="flex-1 w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
