// Floating color picker that opens at the pointer position when a chart
// element is right-clicked. Purely presentational — the caller owns the
// current color and the setter. Auto-closes on outside click / Esc.
//
// Usage:
//   const [popover, setPopover] = useState(null);   // {x, y, id, color}
//   const el = useElementColor("go");
//   <rect
//     fill={el.get(id) || palette[i]}
//     onContextMenu={(e) => { e.preventDefault();
//         setPopover({x:e.clientX, y:e.clientY, id, color: el.get(id) || palette[i]}); }}
//   />
//   {popover && (
//     <ColorPopover x={popover.x} y={popover.y} color={popover.color}
//       onChange={(c) => el.set(popover.id, c)}
//       onReset={() => el.clear(popover.id)}
//       onClose={() => setPopover(null)}
//     />
//   )}
import { useEffect, useRef } from "react";
import { Palette, RotateCcw, X } from "lucide-react";

const PRESETS = [
  "#5139ED", "#8139ED", "#395AED", "#2563EB", "#0EA5E9", "#0F7A47",
  "#10B981", "#F5B301", "#F97316", "#DC2626", "#EC4899", "#6B7280",
  "#0B0B18", "#FFFFFF",
];

export default function ColorPopover({ x, y, color, onChange, onReset, onClose, elementLabel }) {
  const ref = useRef(null);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    // Delay a tick so the same right-click doesn't immediately dismiss.
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp to viewport so it never falls off screen.
  const W = 232, H = 218;
  const left = Math.min(Math.max(8, x), window.innerWidth - W - 8);
  const top  = Math.min(Math.max(8, y), window.innerHeight - H - 8);

  return (
    <div
      ref={ref}
      data-testid="chart-color-popover"
      role="dialog"
      aria-label="Recolour element"
      style={{ position: "fixed", left, top, width: W, zIndex: 100 }}
      className="rounded-2xl border border-[#E7E7F3] bg-white p-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.25)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[#F5F3FE] text-[#5139ED]">
          <Palette className="h-3.5 w-3.5" />
        </span>
        <p className="flex-1 truncate text-[11px] font-bold text-[#0B0B18]">
          {elementLabel || "Element colour"}
        </p>
        <button
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-md text-[#64748B] hover:bg-[#F8FAFC]"
          data-testid="chart-color-popover-close"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Preset swatches */}
      <div className="grid grid-cols-7 gap-1.5">
        {PRESETS.map((c) => (
          <button
            key={c}
            data-testid={`chart-color-preset-${c.replace("#", "")}`}
            title={c}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-md border transition-transform hover:scale-110 ${
              c.toLowerCase() === (color || "").toLowerCase()
                ? "ring-2 ring-[#5139ED] ring-offset-1 border-transparent"
                : "border-[#E7E7F3]"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Native color input */}
      <label className="mt-3 flex items-center gap-2 rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-2 py-1.5">
        <input
          data-testid="chart-color-popover-input"
          type="color"
          value={color || "#5139ED"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-9 cursor-pointer rounded border border-[#E7E7F3] bg-transparent p-0"
        />
        <span className="font-mono text-[11px] text-[#0B0B18]">{color || "#5139ED"}</span>
      </label>

      <button
        onClick={onReset}
        data-testid="chart-color-popover-reset"
        className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#E7E7F3] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#0B0B18] hover:border-[#5139ED]/40"
      >
        <RotateCcw className="h-3 w-3" /> Reset to palette
      </button>
      <p className="mt-1.5 text-center text-[10px] leading-tight text-[#64748B]">
        Right-click any element to recolour it.
      </p>
    </div>
  );
}
