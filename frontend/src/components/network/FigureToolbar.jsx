import { useState } from "react";
import {
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  downloadSVG,
  downloadPNG,
  downloadTIFF,
  downloadPDF,
} from "@/lib/figureExporters";
import { requireAuth } from "@/context/AuthContext";

/**
 * Reusable per-figure toolbar. Wrap the SVG inside a container ref (or pass
 * a getSvg() function). Provides SVG / PNG@300 / PNG@600 / TIFF@300 / TIFF@600
 * / PDF exports plus Fullscreen + Reset.
 *
 * Props:
 *   getSvg: () => SVGSVGElement | null  (required)
 *   containerRef: React.RefObject<HTMLElement>  (for Fullscreen)
 *   onReset?: () => void
 *   basename?: string
 *   title?: string
 *   testidPrefix?: string
 */
export function FigureToolbar({
  getSvg,
  containerRef,
  onReset,
  basename = "figure",
  title,
  testidPrefix,
}) {
  const [busy, setBusy] = useState(false);
  const tp = testidPrefix || basename.replace(/\W+/g, "-");

  const withBusy = (fn) => async () => {
    if (busy) return;
    requireAuth(async () => {
      setBusy(true);
      try { await fn(); } catch (e) { toast.error(`Export failed: ${e.message || e}`); }
      finally { setBusy(false); }
    });
  };

  const doSVG = withBusy(() => { const el = getSvg(); if (!el) throw new Error("SVG not ready"); downloadSVG(el, `${basename}.svg`, { title }); });
  const doPNG = (dpi) => withBusy(async () => { const el = getSvg(); if (!el) throw new Error("SVG not ready"); await downloadPNG(el, `${basename}_${dpi}dpi.png`, { dpi, title }); });
  const doTIFF = (dpi) => withBusy(async () => { const el = getSvg(); if (!el) throw new Error("SVG not ready"); await downloadTIFF(el, `${basename}_${dpi}dpi.tiff`, { dpi, title }); });
  const doPDF = withBusy(async () => { const el = getSvg(); if (!el) throw new Error("SVG not ready"); await downloadPDF(el, `${basename}.pdf`, { title }); });

  const [isFs, setIsFs] = useState(false);
  const toggleFs = async () => {
    const el = containerRef?.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      try { await el.requestFullscreen(); setIsFs(true); } catch (e) { toast.error("Fullscreen unavailable"); }
    } else {
      try { await document.exitFullscreen(); setIsFs(false); } catch (e) {}
    }
  };

  const btn = "inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`${tp}-toolbar`}>
      <button data-testid={`${tp}-svg`} onClick={doSVG} disabled={busy} className={btn}><Download className="h-3 w-3" /> SVG</button>
      <button data-testid={`${tp}-png-300`} onClick={doPNG(300)} disabled={busy} className={btn}>PNG 300</button>
      <button data-testid={`${tp}-png-600`} onClick={doPNG(600)} disabled={busy} className={btn}>PNG 600</button>
      <button data-testid={`${tp}-tiff-300`} onClick={doTIFF(300)} disabled={busy} className={btn}>TIFF 300</button>
      <button data-testid={`${tp}-tiff-600`} onClick={doTIFF(600)} disabled={busy} className={btn}>TIFF 600</button>
      <button data-testid={`${tp}-pdf`} onClick={doPDF} disabled={busy} className={btn}><Download className="h-3 w-3" /> PDF</button>
      {onReset && (
        <button data-testid={`${tp}-reset`} onClick={onReset} className={btn}><RotateCcw className="h-3 w-3" /> Reset</button>
      )}
      {containerRef && (
        <button data-testid={`${tp}-fullscreen`} onClick={toggleFs} className={btn}>
          {isFs ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {isFs ? "Exit" : "Fullscreen"}
        </button>
      )}
    </div>
  );
}
