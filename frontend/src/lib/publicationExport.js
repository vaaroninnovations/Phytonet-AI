// Publication-mode figure export helpers — produce clean white-background,
// dark-text, colour-preserved images for use in manuscripts and slide decks.
// The originals stay dark-themed on screen; the export snapshots a
// publication-ready version of the same figure.

/* ── Cytoscape → PNG with publication styling ─────────────────────── */
// Given a live cytoscape instance, temporarily overrides the node/edge
// styles so labels are readable on a white canvas, exports a high-DPI PNG,
// then restores the original styling.
export function downloadCytoscapePublicationPng(cy, filename, opts = {}) {
  if (!cy) return;
  const scale = opts.scale ?? 3;
  // Save the current style so we can restore after export.
  const originalStyle = cy.style().json();

  const pubStyle = [
    { selector: "node[type='compound'], node[type='Compound']", style: {
        "background-color": "#5139ED", "shape": "hexagon",
        "border-color": "#312E81", "border-width": 1.5,
        "label": "data(label)", "color": "#0B0B18",
        "font-size": 12, "font-weight": 600,
        "text-outline-color": "#FFFFFF", "text-outline-width": 3,
        "text-valign": "center", "text-halign": "center",
        "width": 30, "height": 30 } },
    { selector: "node[type='target'], node[type='Target']", style: {
        "background-color": "#059669", "shape": "ellipse",
        "border-color": "#065F46", "border-width": 1.5,
        "label": "data(label)", "color": "#0B0B18",
        "font-size": 11, "font-weight": 600,
        "text-outline-color": "#FFFFFF", "text-outline-width": 3,
        "text-valign": "center", "text-halign": "center" } },
    { selector: "node[type='pathway'], node[type='Pathway']", style: {
        "background-color": "#D97706", "shape": "diamond",
        "border-color": "#92400E", "border-width": 1.5,
        "label": "data(label)", "color": "#0B0B18",
        "font-size": 11, "font-weight": 600,
        "text-outline-color": "#FFFFFF", "text-outline-width": 3,
        "text-valign": "center", "text-halign": "center" } },
    { selector: "edge", style: {
        "width": 1.2, "line-color": "#94A3B8", "line-opacity": 0.55,
        "curve-style": "bezier", "target-arrow-shape": "none" } },
    { selector: "edge[interaction='involved_in']", style: {
        "line-color": "#F59E0B", "line-opacity": 0.55 } },
  ];

  try {
    cy.style().fromJson(pubStyle).update();
    const url = cy.png({ bg: "#FFFFFF", scale, full: true });
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
  } finally {
    // Always restore original theme even if export fails.
    cy.style().fromJson(originalStyle).update();
  }
}

/* ── SVG → publication PNG ────────────────────────────────────────── */
// Clones an SVG, walks every element and remaps common dark-theme colours
// to publication-safe equivalents on a white background. Preserves
// hard-coded palette colours (fills used to distinguish categories).
const COLOR_REMAP = {
  // Backgrounds → white
  "#0B0B18": "#FFFFFF",
  "#12102E": "#FFFFFF",
  "#0F0E24": "#FFFFFF",
  // White-ish body text → black-ish
  "#e2e8f0": "#111827",
  "#E2E8F0": "#111827",
  "#e0e0ff": "#111827",
  "#d0ffd0": "#0F172A",
  "#fef3c7": "#111827",
  "#94a3b8": "#374151",
  "#94A3B8": "#374151",
  // Faint dark-mode grids → light grey
  "#ffffff10": "#E5E7EB",
  "#ffffff20": "#D1D5DB",
};

function remap(color) {
  if (!color) return color;
  const c = String(color).trim();
  if (COLOR_REMAP[c]) return COLOR_REMAP[c];
  // rgba(255,255,255,alpha) → grey with proportional alpha
  const m = c.match(/^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)$/i);
  if (m) {
    const a = parseFloat(m[1]);
    // Darker grid line for higher alpha, near-white for low alpha
    const lum = Math.round(240 - a * 120);
    return `rgb(${lum},${lum},${lum})`;
  }
  return c;
}

function rewriteSvgForPublication(svg) {
  // Every element that might carry a dark-theme colour.
  const walk = svg.querySelectorAll(
    "*, [fill], [stroke], [color], [style]"
  );
  walk.forEach((el) => {
    ["fill", "stroke", "color"].forEach((attr) => {
      const v = el.getAttribute?.(attr);
      if (v && v !== "none") el.setAttribute(attr, remap(v));
    });
    const styleAttr = el.getAttribute?.("style");
    if (styleAttr) {
      const rewritten = styleAttr.replace(
        /(fill|stroke|color)\s*:\s*([^;]+)/g,
        (_, k, v) => `${k}:${remap(v.trim())}`
      );
      el.setAttribute("style", rewritten);
    }
  });
}

export function downloadSvgAsPublicationPng(svgEl, filename, scale = 3) {
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  rewriteSvgForPublication(clone);

  const viewBox = clone.getAttribute("viewBox");
  let width, height;
  if (viewBox) {
    const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
    width = vbW; height = vbH;
  } else {
    width  = svgEl.clientWidth  || 900;
    height = svgEl.clientHeight || 500;
  }
  clone.setAttribute("width",  width);
  clone.setAttribute("height", height);
  clone.style.background = "#FFFFFF";

  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(width  * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((b) => {
      if (!b) return URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
