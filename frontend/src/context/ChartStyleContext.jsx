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
];

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
    set, setForChart, resetChart, reset,
    THEMES, CHART_TYPES,
  }), [resolveBase, style, set, setForChart, resetChart, reset]);

  return <ChartStyleContext.Provider value={value}>{children}</ChartStyleContext.Provider>;
}

export function useChartStyle() {
  const ctx = useContext(ChartStyleContext);
  if (!ctx) throw new Error("useChartStyle must be inside <ChartStyleProvider>");
  return ctx;
}

/**
 * Convenience hook: universal style merged with per-chart-type overrides.
 * Chart components should use this and treat it as their live style.
 *
 *   const s = useAppliedStyle("go");
 *   <rect fill={s.palette[0]} />
 */
export function useAppliedStyle(chartType) {
  const { style, raw } = useChartStyle();
  return useMemo(() => {
    const override = (raw.byChart || {})[chartType] || {};
    const merged = { ...style };
    const passthrough = [
      "background", "node", "edge", "labelColor", "grid",
      "nodeSize", "edgeThickness", "labelSize", "opacity",
      "legendPosition", "showGrid", "showBorder", "borderColor",
      "borderRadius", "showLegend", "fontFamily",
    ];
    passthrough.forEach((k) => { if (override[k] !== undefined && override[k] !== null) merged[k] = override[k]; });
    if (Array.isArray(override.palette) && override.palette.length) {
      merged.palette = override.palette;
    }
    return merged;
  }, [style, raw, chartType]);
}
