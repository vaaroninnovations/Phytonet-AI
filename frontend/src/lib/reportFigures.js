// Lightweight canvas-based figure renderer for the AI Report.
// Renders simple horizontal bar charts (docking affinity, GO -log10 q, KEGG)
// to PNG data-URLs so both PDF (jsPDF.addImage) and DOCX (ImageRun) can embed
// them without needing DOM screenshots or external chart libraries.

const BRAND = "#5139ED";
const AXIS  = "#374151";
const MUTED = "#94A3B8";
const INK   = "#0B0B18";

/**
 * @param {{
 *   type: "hbar",
 *   data: Array<{ label: string, value: number, color?: string }>,
 *   xLabel?: string,
 *   width?: number, height?: number,
 *   reverse?: boolean,     // true for docking (most-negative first)
 * }} spec
 * @returns {{ dataUrl: string, widthPx: number, heightPx: number }}
 */
export function renderFigureToPng(spec) {
  const w = spec.width || 720;
  // Height grows with row count; keeps rows a comfortable 22 px each.
  const rowH = 22;
  const h = spec.height || (Math.max(140, 60 + spec.data.length * rowH));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, w, h);

  // Layout
  const leftPad = 190;                    // label column
  const rightPad = 24;
  const topPad = 18;
  const bottomPad = 36;
  const plotW = w - leftPad - rightPad;
  const plotH = h - topPad - bottomPad;

  // Axis limits — respect `reverse` so docking (negative) bars grow leftward.
  const values = spec.data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = (rawMax - rawMin) * 0.08 || 1;
  let lo = rawMin - pad, hi = rawMax + pad;
  if (spec.reverse) { hi = 0; lo = Math.min(lo, -0.1); }
  else              { lo = Math.min(0, lo); }

  // X axis + grid
  ctx.strokeStyle = "#E5E7EB"; ctx.lineWidth = 1;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const x = leftPad + t * plotW;
    ctx.beginPath(); ctx.moveTo(x, topPad); ctx.lineTo(x, topPad + plotH); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText((lo + t * (hi - lo)).toFixed(1), x, h - bottomPad + 14);
  }
  // X label
  if (spec.xLabel) {
    ctx.fillStyle = AXIS; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(spec.xLabel, leftPad + plotW / 2, h - 8);
  }

  // Bars
  const scale = (v) => leftPad + ((v - lo) / (hi - lo)) * plotW;
  spec.data.forEach((d, i) => {
    const yTop = topPad + i * (plotH / spec.data.length) + 3;
    const barH = (plotH / spec.data.length) - 6;
    const zeroX = scale(0);
    const barX0 = Math.min(zeroX, scale(d.value));
    const barX1 = Math.max(zeroX, scale(d.value));
    ctx.fillStyle = d.color || BRAND;
    ctx.fillRect(barX0, yTop, Math.max(1, barX1 - barX0), barH);
    // Label (truncated to 28 chars)
    ctx.fillStyle = INK; ctx.font = "11.5px sans-serif"; ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const lbl = String(d.label).length > 28 ? String(d.label).slice(0, 27) + "…" : String(d.label);
    ctx.fillText(lbl, leftPad - 6, yTop + barH / 2);
    // Value at bar end
    ctx.fillStyle = MUTED; ctx.font = "10.5px sans-serif"; ctx.textAlign = spec.reverse ? "left" : "left";
    ctx.fillText(d.value.toFixed(2), barX1 + 4, yTop + barH / 2);
  });

  return { dataUrl: canvas.toDataURL("image/png"), widthPx: w, heightPx: h };
}
