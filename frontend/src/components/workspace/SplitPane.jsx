// Draggable vertical divider between two panes.
// Ratio (0-1) = left pane width / total width. Emits onChange with the new
// ratio while dragging so the parent can persist it.
import { useCallback, useEffect, useRef, useState } from "react";

export function SplitPane({ ratio = 0.45, min = 0.22, max = 0.78,
                             onChange, left, right }) {
  const wrap = useRef(null);
  const [current, setCurrent] = useState(ratio);
  const dragging = useRef(false);

  useEffect(() => { setCurrent(ratio); }, [ratio]);

  const onDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onMove = useCallback((e) => {
    if (!dragging.current || !wrap.current) return;
    const rect = wrap.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let r = (clientX - rect.left) / rect.width;
    r = Math.max(min, Math.min(max, r));
    setCurrent(r);
  }, [min, max]);

  const onUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (onChange) onChange(current);
  }, [current, onChange]);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [onMove, onUp]);

  return (
    <div ref={wrap} data-testid="split-pane"
         className="flex h-full w-full min-h-0 min-w-0">
      <div data-testid="split-left"
           style={{ width: `${current * 100}%` }}
           className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {left}
      </div>
      <div data-testid="split-divider"
           onMouseDown={onDown}
           onTouchStart={onDown}
           className="group relative flex-shrink-0 w-1.5 cursor-col-resize bg-white/5 hover:bg-[#5139ED]/40 transition-colors">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-white/20 group-hover:bg-[#5139ED]" />
      </div>
      <div data-testid="split-right"
           style={{ width: `${(1 - current) * 100}%` }}
           className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {right}
      </div>
    </div>
  );
}
