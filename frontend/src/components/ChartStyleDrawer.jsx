// Figure-scoped chart customization drawer.
//
// Preview / Apply / Cancel semantics:
//   • While the drawer is open, every control write goes into an EPHEMERAL
//     preview layer (context.preview[chartType]). Consumers of
//     useAppliedStyle() see the preview immediately → live preview without
//     touching localStorage.
//   • Apply commits the preview into the persistent applied state.
//   • Cancel / clicking the backdrop / pressing Esc discards the preview,
//     restoring the previously applied configuration.
//   • Reset clears the per-chart applied override entirely.
import { useEffect, useMemo, useState } from "react";
import { Palette, RotateCcw, X, Grid, Type as TypeIcon, LayoutGrid, Check } from "lucide-react";
import { useChartStyle, THEMES, CHART_TYPES, schemaFor } from "@/context/ChartStyleContext";

export default function ChartStyleDrawer({ open = false, onClose = () => {}, chartType = "global" }) {
  const [applyToAll, setApplyToAll] = useState(false);
  const {
    style, raw, preview,
    set, setForChart, resetChart, reset,
    previewPatch, discardPreview, commitPreview,
  } = useChartStyle();

  const scope = applyToAll ? "__global" : chartType;
  const chartOverride  = (raw.byChart || {})[chartType] || {};
  const globalPreview  = (preview || {}).__global || {};
  const chartPreview   = (preview || {})[chartType] || {};
  const schema = useMemo(() => schemaFor(chartType), [chartType]);

  // Discard any leftover preview when the drawer is closed via unmount.
  useEffect(() => {
    if (!open) {
      // Only discard if user closed WITHOUT applying — the Apply button clears it.
      // Guard: if there is nothing in preview, this is a no-op.
      discardPreview(scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape closes the drawer without applying.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") handleCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  // Write into the preview layer (never straight to applied state).
  const write = (patch) => previewPatch(scope, patch);

  // Resolve current value in strict priority order:
  //   preview[scope]  →  applied per-chart  →  applied global
  const val = (k) => {
    // preview may store patch keys either as store keys (backgroundColor) or applied keys.
    const p = applyToAll ? globalPreview : chartPreview;
    if (p[k] !== undefined) return p[k];
    if (!applyToAll && chartOverride[k] !== undefined) return chartOverride[k];
    return raw[k] ?? null;
  };
  const has = (section, field) => {
    if (!schema[section]) return false;
    if (field === undefined) return true;
    return Array.isArray(schema[section]) ? schema[section].includes(field) : Boolean(schema[section]);
  };

  const chartMeta = useMemo(() =>
    CHART_TYPES.find((c) => c.key === chartType), [chartType]);

  const hasPending = Object.keys(applyToAll ? globalPreview : chartPreview).length > 0;

  const handleApply = () => {
    commitPreview(scope);
    onClose();
  };
  const handleCancel = () => {
    discardPreview(scope);
    onClose();
  };
  const handleResetToDefault = () => {
    // Reset clears both applied override AND active preview.
    if (applyToAll) reset(); else resetChart(chartType);
    discardPreview(scope);
  };

  // Effective palette that the palette editor should render (preview → applied → theme).
  const effectivePalette = useMemo(() => {
    if (applyToAll) {
      return globalPreview.paletteOverride ?? raw.paletteOverride ?? style.palette;
    }
    return chartPreview.palette ?? chartOverride.palette ?? style.palette;
  }, [applyToAll, globalPreview, chartPreview, chartOverride, raw, style]);

  if (!open) return null;

  return (
    <div
      data-testid="chart-style-backdrop"
      className="fixed inset-0 z-[80] flex justify-end bg-[#0B0B18]/30 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <aside
        data-testid="chart-style-drawer"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#E7E7F3] bg-white shadow-2xl"
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F1F1FA] bg-white/95 px-6 py-4 backdrop-blur">
          <div>
            <p className="font-headline text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">
              Figure customization
            </p>
            <h2 className="font-headline mt-1 text-[20px] text-[#0B0B18]">
              {chartMeta?.label || "Figure style"}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {hasPending && <span data-testid="chart-style-dirty" className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#92400E]">Preview</span>}
            <button data-testid="chart-style-close" onClick={handleCancel}
                    className="grid h-8 w-8 place-items-center rounded-full text-[#64748B] hover:bg-[#F8FAFC]"
                    aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 px-6 py-5">
        {/* Scope toggle */}
        <label className="flex items-center gap-3 rounded-2xl border border-[#5139ED]/20 bg-[#F5F3FE] p-3">
          <Switch
            testid="chart-style-apply-all"
            checked={applyToAll}
            onCheckedChange={(v) => {
              // When the user flips scope while there's a preview, discard it —
              // otherwise the preview payload would target the wrong scope.
              discardPreview(scope);
              setApplyToAll(v);
            }}
          />
          <div className="flex-1">
            <p className="text-[12px] font-bold text-[#0B0B18]">Apply to all figures in this project</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-[#64748B]">
              {applyToAll
                ? "Changes will propagate to every figure globally on Apply."
                : "Changes will apply only to this figure on Apply."}
            </p>
          </div>
        </label>

        {/* Theme (only meaningful in global mode) */}
        {applyToAll && (
          <Section title="Theme" icon={<Palette className="h-3 w-3" />}>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(THEMES).map(([k, t]) => {
                const active = (val("themeKey") ?? raw.themeKey) === k;
                return (
                  <button key={k} data-testid={`theme-${k}`} onClick={() => write({ themeKey: k })}
                          className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                            active
                              ? "border-[#5139ED] bg-[#F5F3FE]"
                              : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/40"}`}>
                    <div className="flex gap-0.5">
                      {t.palette.slice(0, 5).map((c) => (
                        <span key={c} className="h-4 w-2.5 rounded-sm" style={{ background: c }} />
                      ))}
                    </div>
                    <p className="flex-1 text-[12px] font-bold text-[#0B0B18]">{t.label}</p>
                    {active && <Check className="h-3.5 w-3.5 text-[#5139ED]" />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Colors */}
        <Section title="Colors">
          {has("colors", "node")       && <ColorRow label={chartType === "admet" ? "Fill" : "Node"} testid={`${scope}-color-node`}  value={val("nodeColor") || style.node}      onChange={(v) => write({ nodeColor: v })} />}
          {has("colors", "edge")       && <ColorRow label="Edge"        testid={`${scope}-color-edge`}  value={val("edgeColor") || style.edge}      onChange={(v) => write({ edgeColor: v })} />}
          {has("colors", "background") && <ColorRow label="Background"  testid={`${scope}-color-bg`}    value={val("backgroundColor") || style.background} onChange={(v) => write({ backgroundColor: v })} />}
          {has("colors", "label")      && <ColorRow label="Label"       testid={`${scope}-color-label`} value={val("labelColor") || style.labelColor} onChange={(v) => write({ labelColor: v })} />}
          {has("colors", "grid")       && <ColorRow label="Grid"        testid={`${scope}-color-grid`}  value={val("gridColor") || style.grid}      onChange={(v) => write({ gridColor: v })} />}
        </Section>

        {/* Sizes */}
        <Section title="Sizes & opacity">
          {has("sizes", "nodeSize")      && <SliderRow label={chartType === "bubble" || chartType === "volcano" ? "Dot size" : "Node scale"} testid={`${scope}-size-node`}    min={0.3} max={3}   step={0.05} value={val("nodeSize") ?? style.nodeSize}         onChange={(v) => write({ nodeSize: v })} />}
          {has("sizes", "edgeThickness") && <SliderRow label={chartType === "md" ? "Line width" : chartType === "venn" ? "Circle stroke" : "Edge thickness"} testid={`${scope}-size-edge`}    min={0.3} max={6}   step={0.1}  value={val("edgeThickness") ?? style.edgeThickness} onChange={(v) => write({ edgeThickness: v })} />}
          {has("sizes", "labelSize")     && <SliderRow label="Label size" testid={`${scope}-size-label`}   min={8}   max={22}  step={1}    value={val("labelSize") ?? style.labelSize}       onChange={(v) => write({ labelSize: v })} />}
          {has("sizes", "opacity")       && <SliderRow label="Opacity"    testid={`${scope}-size-opacity`} min={0.2} max={1}   step={0.05} value={val("opacity") ?? style.opacity}           onChange={(v) => write({ opacity: v })} />}
        </Section>

        {/* Legend */}
        {has("legend") && (
          <Section title="Legend" icon={<LayoutGrid className="h-3 w-3" />}>
            <ToggleRow label="Show legend" testid={`${scope}-show-legend`} value={val("showLegend") ?? style.showLegend} onChange={(v) => write({ showLegend: v })} />
            <div className="grid grid-cols-5 gap-2">
              {["off","top","right","bottom","left"].map((p) => (
                <button key={p} data-testid={`legend-${scope}-${p}`}
                        onClick={() => write({ legendPosition: p })}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold capitalize transition-all ${
                          (val("legendPosition") ?? style.legendPosition) === p
                            ? "border-[#5139ED] bg-[#F5F3FE] text-[#5139ED]"
                            : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40"}`}>
                  {p}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Grid + Border */}
        {(has("grid") || has("border")) && (
          <Section title="Grid & border" icon={<Grid className="h-3 w-3" />}>
            {has("grid")   && <ToggleRow label="Show gridlines" testid={`${scope}-show-grid`}   value={val("showGrid") ?? style.showGrid}   onChange={(v) => write({ showGrid: v })} />}
            {has("border") && <ToggleRow label="Show border"    testid={`${scope}-show-border`} value={val("showBorder") ?? style.showBorder} onChange={(v) => write({ showBorder: v })} />}
            {has("border") && <SliderRow label="Border radius"  testid={`${scope}-border-radius`} min={0} max={32} step={1} value={val("borderRadius") ?? style.borderRadius} onChange={(v) => write({ borderRadius: v })} />}
          </Section>
        )}

        {applyToAll && has("font") && (
          <Section title="Font family" icon={<TypeIcon className="h-3 w-3" />}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: null, label: "Theme default" },
                { k: "'Inter', sans-serif", label: "Inter" },
                { k: "'Arial', 'Helvetica', sans-serif", label: "Arial" },
                { k: "'Georgia', serif", label: "Georgia" },
                { k: "'Times New Roman', serif", label: "Times" },
                { k: "'JetBrains Mono', monospace", label: "Mono" },
              ].map((f) => (
                <button
                  key={f.label}
                  data-testid={`font-${f.label}`}
                  onClick={() => write({ fontFamily: f.k })}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-all ${
                    (val("fontFamily") || null) === (f.k || null)
                      ? "border-[#5139ED] bg-[#F5F3FE] text-[#5139ED]"
                      : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40"}`}
                  style={f.k ? { fontFamily: f.k } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Palette editor */}
        {has("palette") && (
          <Section title={chartType === "heatmap" ? "Colour scale" : chartType === "venn" ? "Set colours (A · B · …)" : "Palette"}>
            <PaletteEditor
              testidPrefix={`${scope}-palette`}
              palette={effectivePalette}
              onChange={(next) => applyToAll
                ? write({ paletteOverride: next })
                : write({ palette: next })}
            />
          </Section>
        )}
        </div>

        {/* Sticky footer — Reset / Cancel / Apply */}
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-[#F1F1FA] bg-white/95 px-6 py-3 backdrop-blur">
          <button data-testid={applyToAll ? "chart-style-reset" : `chart-style-reset-${chartType}`}
                  onClick={handleResetToDefault}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
          <div className="flex items-center gap-2">
            <button data-testid="chart-style-cancel" onClick={handleCancel}
                    className="rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
              Cancel
            </button>
            <button data-testid="chart-style-apply" onClick={handleApply}
                    disabled={!hasPending}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2 text-[12px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(81,57,237,0.5)] hover:bg-[#4127c9] disabled:cursor-not-allowed disabled:opacity-40">
              <Check className="h-3.5 w-3.5" /> Apply
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── Building blocks ────────────────────────────────────────────────── */
function Section({ title, icon, children }) {
  return (
    <div>
      <p className="font-headline flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
        {icon}{title}
      </p>
      <div className="mt-2.5 space-y-2.5">{children}</div>
    </div>
  );
}

function ColorRow({ label, testid, value, onChange }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3">
      <span className="text-[12px] font-semibold text-[#0B0B18]">{label}</span>
      <label className="flex cursor-pointer items-center gap-2">
        <input data-testid={testid} type="color" value={value || "#000000"}
               onChange={(e) => onChange(e.target.value)}
               className="h-7 w-9 cursor-pointer rounded border border-[#E7E7F3] bg-transparent p-0" />
        <span className="font-mono text-[11px] text-[#6B7280]">{value}</span>
      </label>
    </div>
  );
}

function SliderRow({ label, testid, min, max, step, value, onChange }) {
  return (
    <div className="flex h-10 items-center gap-3 rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3">
      <span className="w-28 text-[11px] font-semibold text-[#0B0B18]">{label}</span>
      <input data-testid={testid} type="range" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))}
             className="flex-1 accent-[#5139ED]" />
      <span className="w-10 text-right font-mono text-[11px] text-[#6B7280]">
        {typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Switch — shadcn/ui-spec sizing.
//   track:  h-6  w-11   (24 × 44)
//   thumb:  h-5  w-5    (20 × 20)
//   off:    thumb translate-x-0.5   (2px in)
//   on:     thumb translate-x-[22px] (22px right, leaves 2px margin)
// Thumb is CENTERED vertically via top-1/2 + -translate-y-1/2 so it never
// escapes the track when the label text wraps or the parent uses baseline.
// ─────────────────────────────────────────────────────────────────────
function Switch({ testid, checked, onCheckedChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testid}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5139ED] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[#5139ED]" : "bg-[#D5D5E8]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ToggleRow({ label, testid, value, onChange }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3">
      <span className="text-[12px] font-semibold text-[#0B0B18]">{label}</span>
      <Switch testid={testid} checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

function PaletteEditor({ testidPrefix, palette, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {palette.map((c, i) => (
        <label key={i} className="relative cursor-pointer">
          <input
            data-testid={`${testidPrefix}-${i}`}
            type="color"
            value={c}
            onChange={(e) => {
              const next = [...palette]; next[i] = e.target.value; onChange(next);
            }}
            className="sr-only"
          />
          <span
            className="grid h-7 w-7 place-items-center rounded-md border border-[#E7E7F3] font-mono text-[9px] text-white/80"
            style={{ background: c }}
          >
            {i + 1}
          </span>
        </label>
      ))}
    </div>
  );
}
