// Universal chart / network customization store.
//
// A single React context holds visual preferences that every chart component
// consumes via `useChartStyle()` / `useAppliedStyle(chartType)`.
//
// The store is intentionally hierarchical:
//   1. A base `themeKey` (light / dark / publication-nature / publication-cell /
//      publication-generic) picks a palette + background + label color.
//   2. Universal overrides (raw.* fields) can override any theme value globally.
//   3. Per-chart-type overrides (raw.byChart[type]) can further override for
//      specific chart types (ppi, hub, go, kegg, docking, admet, md, heatmap,
//      volcano, bubble, sankey, lollipop, chord).
//
// Preferences persist to localStorage per browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "phytonet.chart-style.v2";

/**
 * List of chart types that consume this style. Order matters for the Drawer's
 * per-chart accordion.
 */
export const CHART_TYPES = [
  { key: "ppi",       label: "PPI Network",        category: "Networks" },
  { key: "hub",       label: "Hub Subgraph",       category: "Networks" },
  { key: "cpdTarget", label: "Compound-Target",    category: "Networks" },
  { key: "go",        label: "GO Enrichment",      category: "Enrichment" },
  { key: "kegg",      label: "KEGG Enrichment",    category: "Enrichment" },
  { key: "docking",   label: "Docking Scores",     category: "Charts" },
  { key: "md",        label: "MD Trajectories",    category: "Charts" },
  { key: "admet",     label: "ADMET Radar",        category: "Charts" },
  { key: "heatmap",   label: "Compound×Target Heatmap", category: "Charts" },
  { key: "volcano",   label: "Volcano Plot",       category: "Charts" },
  { key: "bubble",    label: "Bubble Plot",        category: "Charts" },
  { key: "sankey",    label: "Sankey Flow",        category: "Charts" },
  { key: "lollipop",  label: "Lollipop",           category: "Charts" },
  { key: "venn",      label: "Venn Diagram",       category: "Charts" },
];

/**
 * Per-chart-type FIELD SCHEMA — declares which style options are relevant to
 * each chart. The drawer renders only these sections when the user picks a
 * per-chart scope, keeping the UI focused and preventing e.g. "node size"
 * appearing when editing a bar chart.
 *
 * Each entry is a set of feature flags — the drawer looks these up to decide
 * which rows/sections to render. The Global scope always shows everything.
 */
export const CHART_FIELD_SCHEMAS = {
  // ── Network graphs ────────────────────────────────────────────────
  ppi: {
    colors: ["node", "edge", "background", "label"],
    sizes: ["nodeSize", "edgeThickness", "labelSize", "opacity"],
    palette: true, legend: true, grid: false,
    border: true, font: true,
  },
  hub: {
    colors: ["node", "edge", "background", "label"],
    sizes: ["nodeSize", "edgeThickness", "labelSize", "opacity"],
    palette: true, legend: true, grid: false,
    border: true, font: true,
  },
  cpdTarget: {
    colors: ["node", "edge", "background", "label"],
    sizes: ["nodeSize", "edgeThickness", "labelSize", "opacity"],
    palette: true, legend: true, grid: false,
    border: true, font: true,
  },
  // ── Enrichment (bar-style) ────────────────────────────────────────
  go: {
    colors: ["background", "label", "grid"],
    sizes: ["labelSize", "opacity"],
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  kegg: {
    colors: ["background", "label", "grid"],
    sizes: ["labelSize", "opacity"],
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  // ── Docking / affinity bars ───────────────────────────────────────
  docking: {
    colors: ["background", "label", "grid"],
    sizes: ["labelSize", "opacity"],
    palette: true, legend: false, grid: true,
    border: true, font: true,
  },
  // ── Time-series lines (MD RMSD/RMSF) ──────────────────────────────
  md: {
    colors: ["background", "label", "grid"],
    sizes: ["edgeThickness", "labelSize", "opacity"],  // edgeThickness = line width
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  // ── Radar (ADMET) ─────────────────────────────────────────────────
  admet: {
    colors: ["node", "background", "label", "grid"],   // node = fill colour
    sizes: ["labelSize", "opacity"],
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  // ── Heatmap ───────────────────────────────────────────────────────
  heatmap: {
    colors: ["background", "label", "grid"],
    sizes: ["labelSize"],
    palette: true, legend: true, grid: false,          // gradient palette instead
    border: true, font: true,
  },
  // ── Volcano / Bubble (scatter) ────────────────────────────────────
  volcano: {
    colors: ["node", "background", "label", "grid"],   // node = dot colour
    sizes: ["nodeSize", "labelSize", "opacity"],
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  bubble: {
    colors: ["node", "background", "label", "grid"],
    sizes: ["nodeSize", "labelSize", "opacity"],
    palette: true, legend: true, grid: true,
    border: true, font: true,
  },
  // ── Sankey (flow) ─────────────────────────────────────────────────
  sankey: {
    colors: ["node", "edge", "background", "label"],
    sizes: ["edgeThickness", "labelSize", "opacity"],
    palette: true, legend: false, grid: false,
    border: true, font: true,
  },
  // ── Lollipop ──────────────────────────────────────────────────────
  lollipop: {
    colors: ["node", "edge", "background", "label", "grid"],
    sizes: ["nodeSize", "edgeThickness", "labelSize", "opacity"],
    palette: true, legend: false, grid: true,
    border: true, font: true,
  },
  // ── Venn (2-set) ──────────────────────────────────────────────────
  // palette[0] = Set A fill/stroke, palette[1] = Set B fill/stroke
  // edgeThickness controls circle stroke width. opacity controls fill alpha.
  venn: {
    colors: ["background", "label"],
    sizes: ["edgeThickness", "labelSize", "opacity"],
    palette: true, legend: false, grid: false,
    border: true, font: true,
  },
};

/** Global scope shows everything — used as the fallback when scope === 'global' */
const GLOBAL_SCHEMA = {
  colors: ["node", "edge", "background", "label", "grid"],
  sizes: ["nodeSize", "edgeThickness", "labelSize", "opacity"],
  palette: true, legend: true, grid: true, border: true, font: true,
};

/** Look up the schema for a scope (chart type key, or "global") */
export function schemaFor(scope) {
  if (scope === "global") return GLOBAL_SCHEMA;
  return CHART_FIELD_SCHEMAS[scope] || GLOBAL_SCHEMA;
}

/**
 * Theme presets. Publication themes are colour-safe and journal-style.
 */
export const THEMES = {
  light: {
    label: "Light",
    background: "#FFFFFF", foreground: "#111827",
    surface: "#F8FAFC", grid: "#E7E7F3",
    palette: ["#5139ED", "#395AED", "#8139ED", "#2BB673", "#F59E0B", "#EF4444",
              "#8B5CF6", "#0EA5E9", "#14B8A6", "#EC4899"],
    node: "#5139ED", edge: "#94A3B8", labelColor: "#0B0B18",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  dark: {
    label: "Dark",
    background: "#0B0B18", foreground: "#F1F1FA",
    surface: "#1E1E33", grid: "#2A2A45",
    palette: ["#A78BFA", "#7DD3FC", "#F0ABFC", "#4ADE80", "#FBBF24", "#F87171",
              "#C084FC", "#67E8F9", "#5EEAD4", "#F9A8D4"],
    node: "#A78BFA", edge: "#64748B", labelColor: "#F1F1FA",
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  publicationNature: {
    label: "Nature-style",
    background: "#FFFFFF", foreground: "#101820",
    surface: "#F5F5F5", grid: "#D9DDE1",
    // Nature uses vivid but distinguishable primaries (Okabe-Ito colour-blind safe)
    palette: ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7",
              "#56B4E9", "#F0E442", "#000000", "#7B7B7B", "#B57EDC"],
    node: "#0072B2", edge: "#7B7B7B", labelColor: "#101820",
    fontFamily: "'Arial', 'Helvetica', sans-serif",
  },
  publicationCell: {
    label: "Cell-style",
    background: "#FFFFFF", foreground: "#111827",
    surface: "#F7F5F0", grid: "#DAD5CC",
    palette: ["#B71C1C", "#1B5E20", "#0D47A1", "#4A148C", "#E65100",
              "#004D40", "#3E2723", "#37474F", "#880E4F", "#1A237E"],
    node: "#B71C1C", edge: "#8C7A66", labelColor: "#111827",
    fontFamily: "'Georgia', 'Times New Roman', serif",
  },
  publicationBW: {
    label: "B&W (safe)",
    background: "#FFFFFF", foreground: "#000000",
    surface: "#F8F8F8", grid: "#D0D0D0",
    palette: ["#000000", "#3F3F3F", "#6B6B6B", "#8F8F8F", "#B4B4B4",
              "#525252", "#2A2A2A", "#0F0F0F", "#787878", "#A0A0A0"],
    node: "#000000", edge: "#4A4A4A", labelColor: "#000000",
    fontFamily: "'Arial', 'Helvetica', sans-serif",
  },
};

/**
 * Default universal style. Per-chart overrides live in `byChart`.
 */
const DEFAULT_STYLE = {
  themeKey: "light",
  nodeColor: null,
  edgeColor: null,
  backgroundColor: null,
  labelColor: null,
  paletteOverride: null,
  nodeSize: 1.0,
  edgeThickness: 1.0,
  labelSize: 12,
  opacity: 1.0,
  legendPosition: "right",     // top | right | bottom | left | off
  fontFamily: null,            // null → theme.fontFamily
  showGrid: true,
  gridColor: null,
  showBorder: true,
  borderColor: null,
  borderRadius: 12,
  showLegend: true,
  byChart: {},                 // { [chartType]: { partial overrides } }
};

const ChartStyleContext = createContext(null);

export function ChartStyleProvider({ children }) {
  const [style, setStyle] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { ...DEFAULT_STYLE, ...s, byChart: { ...(s.byChart || {}) } };
    } catch { return DEFAULT_STYLE; }
  });
  // Ephemeral preview overrides, keyed by chartType. Never persisted.
  // Consumers read via `useAppliedStyle` which layers preview on top of applied.
  const [preview, setPreview] = useState({});   // { [chartType]: {patch}, __global?: {patch} }

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(style)); } catch { /* ignore */ }
  }, [style]);

  const theme = THEMES[style.themeKey] || THEMES.light;

  const set = useCallback((patch) => setStyle((s) => ({ ...s, ...patch })), []);
  const setForChart = useCallback((chartKey, patch) =>
    setStyle((s) => ({
      ...s,
      byChart: {
        ...(s.byChart || {}),
        [chartKey]: { ...((s.byChart || {})[chartKey] || {}), ...patch },
      },
    })), []);
  const resetChart = useCallback((chartKey) =>
    setStyle((s) => {
      const next = { ...(s.byChart || {}) };
      delete next[chartKey];
      return { ...s, byChart: next };
    }), []);
  const reset = useCallback(() => setStyle({ ...DEFAULT_STYLE }), []);

  // ── Preview API — ephemeral edits, read by useAppliedStyle ──────────
  const previewPatch = useCallback((scope, patch) =>
    setPreview((p) => ({ ...p, [scope]: { ...(p[scope] || {}), ...patch } })), []);
  const discardPreview = useCallback((scope) =>
    setPreview((p) => { const n = { ...p }; delete n[scope]; return n; }), []);
  const commitPreview = useCallback((scope) => {
    const patch = preview[scope];
    if (!patch) return;
    if (scope === "__global") set(patch);
    else setForChart(scope, patch);
    discardPreview(scope);
  }, [preview, set, setForChart, discardPreview]);

  const resolveBase = useMemo(() => ({
    theme,
    themeKey: style.themeKey,
    background: style.backgroundColor || theme.background,
    node:       style.nodeColor       || theme.node,
    edge:       style.edgeColor       || theme.edge,
    labelColor: style.labelColor      || theme.labelColor,
    palette:    style.paletteOverride || theme.palette,
    grid:       style.gridColor       || theme.grid,
    surface:    theme.surface,
    foreground: theme.foreground,
    fontFamily: style.fontFamily || theme.fontFamily,
    nodeSize:      style.nodeSize,
    edgeThickness: style.edgeThickness,
    labelSize:     style.labelSize,
    opacity:       style.opacity,
    legendPosition: style.legendPosition,
    showGrid:   style.showGrid,
    showBorder: style.showBorder,
    borderColor: style.borderColor || theme.grid,
    borderRadius: style.borderRadius,
    showLegend: style.showLegend,
  }), [style, theme]);

  const value = useMemo(() => ({
    style: resolveBase,
    raw: style,
    preview,
    set, setForChart, resetChart, reset,
    previewPatch, discardPreview, commitPreview,
    THEMES, CHART_TYPES,
  }), [resolveBase, style, preview, set, setForChart, resetChart, reset,
      previewPatch, discardPreview, commitPreview]);

  return <ChartStyleContext.Provider value={value}>{children}</ChartStyleContext.Provider>;
}

export function useChartStyle() {
  const ctx = useContext(ChartStyleContext);
  if (!ctx) throw new Error("useChartStyle must be inside <ChartStyleProvider>");
  return ctx;
}

/**
 * Mix a hex colour toward another hex colour by fraction `t` (0…1).
 * Used to derive gradient low-end shades (e.g. Cytoscape mapData interpolation)
 * from the theme's node colour.
 */
export function mixHex(hex, target = "#FFFFFF", t = 0.75) {
  const parse = (h) => {
    const s = h.replace("#", "");
    if (s.length !== 6) return [0, 0, 0];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(target);
  const m = (a, b) => Math.round(a + (b - a) * t);
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(m(r1, r2))}${h(m(g1, g2))}${h(m(b1, b2))}`;
}

/**
 * Convenience hook: universal style merged with per-chart-type overrides.
 * Chart components should use this and treat it as their live style.
 *
 * Layering (highest priority last):
 *   1. universal applied  (raw.*)
 *   2. per-chart applied  (raw.byChart[chartType])
 *   3. universal preview  (preview.__global)
 *   4. per-chart preview  (preview[chartType])
 *
 * Preview layers are ephemeral — they never touch localStorage. This lets the
 * drawer live-preview while editing and discard the edits on Cancel.
 *
 *   const s = useAppliedStyle("go");
 *   <rect fill={s.palette[0]} />
 */
export function useAppliedStyle(chartType) {
  const { style, raw, preview } = useChartStyle();
  return useMemo(() => {
    const chartApplied  = (raw.byChart || {})[chartType] || {};
    const globalPreview = (preview || {}).__global || {};
    const chartPreview  = (preview || {})[chartType] || {};
    const passthrough = [
      "background", "node", "edge", "labelColor", "grid",
      "nodeSize", "edgeThickness", "labelSize", "opacity",
      "legendPosition", "showGrid", "showBorder", "borderColor",
      "borderRadius", "showLegend", "fontFamily",
    ];
    // Map style-store keys (e.g. `backgroundColor`) → applied keys (`background`)
    const keyMap = {
      backgroundColor: "background",
      nodeColor: "node",
      edgeColor: "edge",
      labelColor: "labelColor",
      gridColor: "grid",
    };
    const merged = { ...style };
    const layer = (src) => {
      Object.entries(src).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        const mk = keyMap[k] || k;
        if (passthrough.includes(mk)) merged[mk] = v;
        if (k === "palette" && Array.isArray(v) && v.length) merged.palette = v;
        if (k === "paletteOverride" && Array.isArray(v) && v.length) merged.palette = v;
      });
    };
    layer(chartApplied);
    layer(globalPreview);
    layer(chartPreview);
    return merged;
  }, [style, raw, preview, chartType]);
}
