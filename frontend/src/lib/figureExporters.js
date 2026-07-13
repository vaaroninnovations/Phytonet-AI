// Publication-quality figure exporters.
// Supports SVG, PNG (300 & 600 dpi), TIFF (300 & 600 dpi), PDF (vector).
// Accepts an SVG DOM element, and optionally a title/legend that is drawn
// into the exported bitmap frame for publication quality.

import { saveAs } from "file-saver";
import { jsPDF } from "jspdf";
import UTIF from "utif";
import { toast } from "sonner";

/** Serialize a live SVG DOM element into a stand-alone SVG file string. */
export function serializeSVG(svgEl, { title, width, height } = {}) {
  if (!svgEl) throw new Error("No SVG element");
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("version", "1.1");
  if (!clone.getAttribute("viewBox")) {
    const bb = svgEl.viewBox?.baseVal;
    if (bb && bb.width) {
      clone.setAttribute("viewBox", `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
    }
  }
  const w = width ?? svgEl.viewBox?.baseVal?.width ?? svgEl.clientWidth ?? 800;
  const h = height ?? svgEl.viewBox?.baseVal?.height ?? svgEl.clientHeight ?? 600;
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  // Inject font-face metadata so exports look publication-ready.
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    text { font-family: Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; }
    .fig-title { font-weight: 700; font-size: 14px; fill: #0B0B18; }
  `;
  clone.insertBefore(style, clone.firstChild);
  if (title) {
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", w); bg.setAttribute("height", 28); bg.setAttribute("fill", "#FFFFFF");
    clone.insertBefore(bg, clone.firstChild);
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", 16); t.setAttribute("y", 20);
    t.setAttribute("class", "fig-title");
    t.textContent = title;
    clone.insertBefore(t, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

export function downloadSVG(svgEl, filename = "figure.svg", { title } = {}) {
  const svgStr = serializeSVG(svgEl, { title });
  saveAs(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }), filename);
}

/** Rasterise the SVG at the requested dpi to a canvas. Returns Promise<canvas>. */
async function rasterise(svgEl, dpi, { title } = {}) {
  const baseW = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 800;
  const baseH = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 600;
  const svgStr = serializeSVG(svgEl, { title, width: baseW, height: baseH });
  // 96 CSS px == 1 inch by convention. Scale by dpi/96 for pixels/inch.
  const scale = dpi / 96;
  const w = Math.round(baseW * scale);
  const h = Math.round(baseH * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, w, h);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
  await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, w, h); resolve(); };
    img.onerror = reject;
    img.src = url;
  });
  return { canvas, w, h };
}

export async function downloadPNG(svgEl, filename = "figure.png", { dpi = 300, title } = {}) {
  const { canvas } = await rasterise(svgEl, dpi, { title });
  canvas.toBlob((blob) => saveAs(blob, filename), "image/png");
}

export async function downloadTIFF(svgEl, filename = "figure.tiff", { dpi = 300, title } = {}) {
  const { canvas, w, h } = await rasterise(svgEl, dpi, { title });
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, w, h);
  // UTIF encodes an RGBA ImageData-like object.
  const ifd = { width: w, height: h, data: imgData.data };
  const bytes = UTIF.encodeImage(imgData.data, w, h, {
    t256: [w], t257: [h],
    t282: [dpi, 1], t283: [dpi, 1], t296: [2] // Xres, Yres, ResolutionUnit=2 (inch)
  });
  saveAs(new Blob([bytes], { type: "image/tiff" }), filename);
}

export async function downloadPDF(svgEl, filename = "figure.pdf", { title } = {}) {
  const baseW = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 800;
  const baseH = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 600;
  const svgStr = serializeSVG(svgEl, { title, width: baseW, height: baseH });
  const orientation = baseW >= baseH ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [baseW + 40, baseH + 60] });
  // Render at 300 DPI via canvas for reliable text.
  const { canvas } = await rasterise(svgEl, 300, { title });
  const dataURL = canvas.toDataURL("image/png", 1.0);
  pdf.addImage(dataURL, "PNG", 20, 20, baseW, baseH, undefined, "FAST");
  pdf.save(filename);
}

/** Cytoscape.js network export helpers. */
export function cyDownloadPNG(cy, filename, { dpi = 300 } = {}) {
  const scale = dpi / 96;
  const blob = cy.png({ output: "blob", full: true, bg: "#FFFFFF", scale });
  saveAs(blob, filename);
}
export function cyDownloadJPG(cy, filename, { dpi = 300 } = {}) {
  const scale = dpi / 96;
  const blob = cy.jpg({ output: "blob", full: true, bg: "#FFFFFF", scale, quality: 0.95 });
  saveAs(blob, filename);
}
export function cyDownloadSVG(cy, filename) {
  // Requires cytoscape-svg extension (registered at module load).
  const svgStr = typeof cy.svg === "function" ? cy.svg({ full: true, bg: "#FFFFFF" }) : null;
  if (!svgStr) { toast.error("SVG export requires the cytoscape-svg extension"); return; }
  saveAs(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }), filename);
}
export async function cyDownloadTIFF(cy, filename, { dpi = 300 } = {}) {
  const scale = dpi / 96;
  const blob = cy.png({ output: "blob", full: true, bg: "#FFFFFF", scale });
  const arrbuf = await blob.arrayBuffer();
  const bmpImg = await createImageBitmap(new Blob([arrbuf]));
  const w = bmpImg.width, h = bmpImg.height;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmpImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const bytes = UTIF.encodeImage(imgData.data, w, h, {
    t282: [dpi, 1], t283: [dpi, 1], t296: [2]
  });
  saveAs(new Blob([bytes], { type: "image/tiff" }), filename);
}
export async function cyDownloadPDF(cy, filename, { title } = {}) {
  const svgStr = typeof cy.svg === "function" ? cy.svg({ full: true, bg: "#FFFFFF" }) : null;
  const container = cy.container();
  const w = container?.clientWidth || 900;
  const h = container?.clientHeight || 620;
  const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "pt", format: [w + 40, h + 60] });
  if (title) { pdf.setFontSize(12); pdf.text(title, 20, 24); }
  if (svgStr) {
    // Rasterise the SVG to preserve quality
    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr);
    const scale = 300 / 96;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await new Promise((res, rej) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width, canvas.height); res(); }; img.onerror = rej; img.src = url; });
    pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 20, title ? 40 : 20, w, h, undefined, "FAST");
  } else {
    // Fallback to PNG blob
    const blob = cy.png({ output: "blob", full: true, bg: "#FFFFFF", scale: 300 / 96 });
    const arrbuf = await blob.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(arrbuf)));
    pdf.addImage("data:image/png;base64," + b64, "PNG", 20, title ? 40 : 20, w, h, undefined, "FAST");
  }
  pdf.save(filename);
}
