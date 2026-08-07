// CopyButton — tiny clipboard-copy button with success feedback.
// Copies plain text to clipboard, briefly flips to a checkmark state.
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

export function CopyButton({ text, label = "Copy", testid, className = "" }) {
  const [copied, setCopied] = useState(false);

  const doCopy = async () => {
    const value = (typeof text === "function" ? text() : text) || "";
    if (!value.trim()) {
      toast.error("Nothing to copy yet.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Legacy fallback: hidden textarea + execCommand
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      toast.error("Copy failed — clipboard access denied");
    }
  };

  return (
    <button
      type="button"
      data-testid={testid}
      onClick={doCopy}
      title={label}
      className={
        "inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 " +
        "px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10 " +
        "transition-colors " +
        (copied ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/10 " : "") +
        className
      }
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : label}
    </button>
  );
}
