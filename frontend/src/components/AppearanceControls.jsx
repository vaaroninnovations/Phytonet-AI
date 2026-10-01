// Shared theme + font-size controls. Used in both the public SiteHeader and
// the authenticated workspace TabBar so signed-in users can switch
// appearance without leaving /app.
import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Type, Check } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

export default function AppearanceControls({ dark = false, compact = false }) {
  const { isDark, toggleTheme, fontSize, setFontSize, fontSizes } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close the font-size menu on any click outside it (capture phase so it
  // fires before the toggle button's own click re-opens it).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open]);

  const size = compact ? "h-8 w-8" : "h-9 w-9";
  const iconCls = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const chrome = dark
    ? "border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.05] text-[#FAFAFF] hover:border-[#c4b5fd]/50"
    : "border-[#E7E7F3] bg-white text-[#111827] hover:border-[#5139ED]/40 hover:text-[#5139ED]";
  const menuChrome = dark ? "border-[#2A2745] bg-[#151230]" : "border-[#E7E7F3] bg-white";
  const itemHover  = dark ? "text-[#EDEAFB] hover:bg-[#1B1838]" : "text-[#111827] hover:bg-[#F8FAFC]";
  const labelCls   = dark ? "text-[#9B94B8]" : "text-[#6B7280]";

  return (
    <>
      <button
        data-testid="theme-toggle"
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={`grid ${size} place-items-center rounded-full border transition-colors ${chrome}`}
      >
        {isDark ? <Sun className={iconCls} /> : <Moon className={iconCls} />}
      </button>

      <div className="relative" ref={ref}>
        <button
          data-testid="font-size-toggle"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Adjust text size"
          aria-expanded={open}
          title="Adjust text size"
          className={`grid ${size} place-items-center rounded-full border transition-colors ${chrome}`}
        >
          <Type className={iconCls} />
        </button>
        {open && (
          <div
            data-testid="font-size-menu"
            className={`absolute right-0 z-[100] mt-2 w-56 overflow-hidden rounded-2xl border shadow-lg ${menuChrome}`}
          >
            <div className={`border-b px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest ${labelCls} ${dark ? "border-[#2A2745]" : "border-[#F1F1FA]"}`}>
              Text size
            </div>
            {fontSizes.map((f) => (
              <button
                key={f.id}
                data-testid={`font-size-${f.id}`}
                onClick={() => { setFontSize(f.id); setOpen(false); }}
                aria-pressed={fontSize === f.id}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${itemHover}`}
              >
                <span
                  className={`font-headline font-extrabold leading-none ${
                    fontSize === f.id ? "text-[#5139ED]" : dark ? "text-[#c4b5fd]" : "text-[#374151]"
                  }`}
                  style={{ fontSize: `${12 + f.px - 14}px` }}
                >
                  Aa
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-bold">{f.label}</span>
                  <span className={`block text-[10.5px] ${labelCls}`}>{f.hint}</span>
                </span>
                {fontSize === f.id && <Check className="h-3.5 w-3.5 text-[#5139ED]" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
