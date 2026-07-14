// Universal chart / network customization store.
//
// A single React context holds visual preferences that any chart component
// can consume via `useChartStyle()` — one canonical source-of-truth for:
//   • Colors (node, edge, background, primary/secondary/accent, palette gradient)
//   • Sizes (node scale, edge thickness, label size)
//   • Themes (Light / Dark / Publication)
//   • Legend position (top / right / bottom / left / off)
//   • Transparency / opacity
//
// Preferences persist to localStorage per user and are also available to the
// backend "save-as-preference" flow via `getPreferences()`.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "phytonet.chart-style.v1";

export const THEMES = {
  light: {
    label: "Light", background: "#FFFFFF", foreground: "#111827",
    surface: "#F8FAFC", grid: "#E7E7F3",
    palette: ["#5139ED", "#395AED", "#8139ED", "#2BB673", "#F59E0B", "#EF4444",
              "#8B5CF6", "#0EA5E9", "#14B8A6", "#EC4899"],
    node: "#5139ED", edge: "#94A3B8", labelColor: "#0B0B18",
  },
  dark: {
    label: "Dark", background: "#0B0B18", foreground: "#F1F1FA",
    surface: "#1E1E33", grid: "#2A2A45",
    palette: ["#A78BFA", "#7DD3FC", "#F0ABFC", "#4ADE80", "#FBBF24", "#F87171",
              "#C084FC", "#67E8F9", "#5EEAD4", "#F9A8D4"],
    node: "#A78BFA", edge: "#64748B", labelColor: "#F1F1FA",
  },
  publication: {
    label: "Publication", background: "#FFFFFF", foreground: "#0B0B18",
    surface: "#FFFFFF", grid: "#CBD5E1",
    palette: ["#1F2937", "#4B5563", "#6B7280", "#0F766E", "#B45309", "#7C2D12",
              "#312E81", "#134E4A", "#4C1D95", "#701A75"],
    node: "#1F2937", edge: "#94A3B8", labelColor: "#0B0B18",
  },
};

const DEFAULT_STYLE = {
  themeKey: "light",
  nodeColor: null,         // null → use theme.node
  edgeColor: null,
  backgroundColor: null,
  labelColor: null,
  paletteOverride: null,   // custom palette (array) or null
  nodeSize: 1.0,           // scale multiplier
  edgeThickness: 1.0,
  labelSize: 12,
  opacity: 1.0,
  legendPosition: "right", // top | right | bottom | left | off
};

const ChartStyleContext = createContext(null);

export function ChartStyleProvider({ children }) {
  const [style, setStyle] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      return { ...DEFAULT_STYLE, ...s };
    } catch { return DEFAULT_STYLE; }
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(style)); } catch {}
  }, [style]);

  const theme = THEMES[style.themeKey] || THEMES.light;

  const set = useCallback((patch) => setStyle((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setStyle({ ...DEFAULT_STYLE }), []);

  // Resolve final values (custom → theme fallback)
  const resolved = useMemo(() => ({
    theme,
    background: style.backgroundColor || theme.background,
    node:       style.nodeColor       || theme.node,
    edge:       style.edgeColor       || theme.edge,
    labelColor: style.labelColor      || theme.labelColor,
    palette:    style.paletteOverride || theme.palette,
    nodeSize:      style.nodeSize,
    edgeThickness: style.edgeThickness,
    labelSize:     style.labelSize,
    opacity:       style.opacity,
    legendPosition: style.legendPosition,
    themeKey: style.themeKey,
  }), [style, theme]);

  const value = useMemo(() => ({ style: resolved, raw: style, set, reset, THEMES }),
                        [resolved, style, set, reset]);
  return <ChartStyleContext.Provider value={value}>{children}</ChartStyleContext.Provider>;
}

export function useChartStyle() {
  const ctx = useContext(ChartStyleContext);
  if (!ctx) throw new Error("useChartStyle must be inside <ChartStyleProvider>");
  return ctx;
}
