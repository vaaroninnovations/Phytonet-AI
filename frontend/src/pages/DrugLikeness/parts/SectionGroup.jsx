import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * SectionGroup — one collapsible container per analysis section (ADME,
 * Toxicity, Drug-Likeness). Renders a hued header with a single chevron
 * toggle that shows/hides BOTH the filter card and its results table
 * together.
 *
 * Hue registry mirrors the FilterCards hues but at a slightly stronger
 * saturation for the outer chrome so the boundary between groups is clear.
 */
const HUES = {
  adme: {
    border: "border-[#BFDBFE]",
    bg: "bg-gradient-to-r from-[#EFF6FF] to-[#DBEAFE]",
    title: "text-[#1E3A8A]",
    icon: "bg-[#3B82F6] text-white",
    innerBg: "bg-[#F8FBFF]",
    innerBorder: "border-[#DBEAFE]",
  },
  toxicity: {
    border: "border-[#FECACA]",
    bg: "bg-gradient-to-r from-[#FEF2F2] to-[#FEE2E2]",
    title: "text-[#7F1D1D]",
    icon: "bg-[#EF4444] text-white",
    innerBg: "bg-[#FFF9F9]",
    innerBorder: "border-[#FECACA]",
  },
  druglikeness: {
    border: "border-[#A7F3D0]",
    bg: "bg-gradient-to-r from-[#ECFDF5] to-[#D1FAE5]",
    title: "text-[#064E3B]",
    icon: "bg-[#10B981] text-white",
    innerBg: "bg-[#F6FFFB]",
    innerBorder: "border-[#D1FAE5]",
  },
};

export default function SectionGroup({
  title,
  subtitle,
  testid,
  hueKey = "adme",
  defaultOpen = true,
  icon: Icon,
  children,
  meta,
}) {
  const hue = HUES[hueKey] || HUES.adme;
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      data-testid={testid}
      data-open={open}
      className={`mt-8 overflow-hidden rounded-3xl border ${hue.border} ${hue.innerBg}`}
    >
      <button
        type="button"
        data-testid={`${testid}-toggle`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-4 px-6 py-4 ${hue.bg} text-left transition-colors`}
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${hue.icon}`}>
              <Icon size={18} />
            </span>
          )}
          <div>
            <p className={`font-heading text-[13px] font-bold uppercase tracking-[0.24em] ${hue.title}`}>
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-[#475569]">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {meta && <span className="text-xs text-[#64748B]">{meta}</span>}
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${hue.border} bg-white text-[#475569] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
            aria-hidden
          >
            <ChevronDown size={16} />
          </span>
        </div>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 px-4 pb-5 pt-4 md:px-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
