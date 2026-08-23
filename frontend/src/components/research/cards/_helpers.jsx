// Shared download + SVG serialisation helpers used across the research
// result cards. Kept module-internal (prefixed with `_`) except for the
// two SVG exporters which are also consumed by the Enrichment charts.
import * as XLSX from "xlsx";

export function trigger(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function rowsToPlain(rows, columns) {
  const stringify = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") {
      try { return JSON.stringify(v); } catch { return String(v); }
    }
    return v;
  };
  return rows.map((r) => {
    const out = {};
    for (const c of columns) {
      let v;
      if (c.render) {
        try {
          const rendered = c.render(r);
          v = typeof rendered === "string" || typeof rendered === "number"
                ? rendered
                : stringify(r[c.key] ?? "");
        } catch { v = stringify(r[c.key] ?? ""); }
      } else {
        v = stringify(r[c.key] ?? "");
      }
      out[c.label] = v;
    }
    return out;
  });
}

export function downloadCsv(rows, columns, filename) {
  const plain = rowsToPlain(rows, columns);
  const cols = columns.map((c) => c.label);
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    cols.join(","),
    ...plain.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
  trigger(new Blob([csv], { type: "text/csv;charset=utf-8;" }), filename);
}

export function downloadExcel(rows, columns, filename, sheetName = "Results") {
  const plain = rowsToPlain(rows, columns);
  const ws = XLSX.utils.json_to_sheet(plain);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Results");
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  trigger(new Blob([wbout], { type: "application/octet-stream" }), filename);
}

export function downloadJson(data, filename) {
  trigger(new Blob([JSON.stringify(data, null, 2)],
                    { type: "application/json" }), filename);
}

import { downloadSvgAsPublicationPng } from "@/lib/publicationExport";

// ─── SVG chart exporters ─────────────────────────────────────────
export function downloadSvgFile(svgEl, filename) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (!clone.getAttribute("style")?.includes("background"))
    clone.style.background = "#0B0B18";
  const src = new XMLSerializer().serializeToString(clone);
  trigger(new Blob([`<?xml version="1.0" standalone="no"?>\n${src}`],
                    { type: "image/svg+xml;charset=utf-8" }), filename);
}

export function downloadSvgAsPng(svgEl, filename, scale = 2) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = clone.getAttribute("viewBox");
  let width, height;
  if (viewBox) {
    const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
    width  = vbW; height = vbH;
  } else {
    width  = svgEl.clientWidth  || svgEl.getBoundingClientRect().width  || 800;
    height = svgEl.clientHeight || svgEl.getBoundingClientRect().height || 400;
  }
  clone.setAttribute("width",  width);
  clone.setAttribute("height", height);
  if (!clone.getAttribute("style")?.includes("background"))
    clone.style.background = "#0B0B18";
  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(width  * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0B0B18";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => {
      trigger(b, filename);
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// Small download-chart toolbar rendered above each SVG chart. Includes a
// dark-theme PNG (matches on-screen appearance) + a publication-quality
// PNG (white background, dark text, palette-safe) for use in manuscripts
// and slide decks.
export function ChartDownloadBar({ svgSelector, filenameBase }) {
  const get = () => document.querySelector(svgSelector);
  return (
    <div className="mb-2 flex items-center justify-end gap-1.5">
      <button data-testid={`chart-download-svg-${filenameBase}`}
              onClick={() => downloadSvgFile(get(), `${filenameBase}.svg`)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
        SVG
      </button>
      <button data-testid={`chart-download-png-${filenameBase}`}
              onClick={() => downloadSvgAsPng(get(), `${filenameBase}.png`, 2)}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
        PNG
      </button>
      <button data-testid={`chart-download-publication-png-${filenameBase}`}
              title="Publication-quality PNG (white background, dark text, high resolution)"
              onClick={() => downloadSvgAsPublicationPng(get(), `${filenameBase}_publication.png`, 3)}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-semibold text-emerald-200 hover:bg-emerald-500/20">
        Publication PNG
      </button>
    </div>
  );
}
