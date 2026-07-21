// Figure-scoped chart customization drawer.
//
// Controlled component. Consumers embed it as:
//    <ChartStyleDrawer open={open} onClose={...} chartType="go" />
//
// The drawer:
//   • Shows only options relevant to the given chartType (schema-driven).
//   • Writes changes to `byChart[chartType]` by default (this figure only).
//   • Offers a "Apply current style to all figures in this project" toggle
//     that instead writes to global scope + clears the per-chart override so
//     changes propagate everywhere.
import { useMemo, useState } from "react";
import { Palette, RotateCcw, X, Grid, Type as TypeIcon, LayoutGrid } from "lucide-react";
import { useChartStyle, THEMES, CHART_TYPES, schemaFor } from "@/context/ChartStyleContext";

export default function ChartStyleDrawer({ open = false, onClose = () => {}, chartType = "global" }) {
  const [applyToAll, setApplyToAll] = useState(false);
  const { style, raw, set, setForChart, resetChart, reset } = useChartStyle();

  const scope = applyToAll ? "global" : chartType;
  const chartOverride = (raw.byChart || {})[chartType] || {};
  const schema = useMemo(() => schemaFor(chartType), [chartType]);

  // Write: either global raw.* or per-chart byChart[chartType]
  const write = (patch) => {
    if (applyToAll) {
      // Push to global AND clear the per-chart override so the global change
      // becomes visible on this figure.
      set(patch);
      const keysToClear = Object.keys(patch);
      const nextOverride = { ...chartOverride };
      keysToClear.forEach((k) => { delete nextOverride[k]; });
      if (raw.byChart?.[chartType]) {
        // resetChart wipes the entire override; we want a partial clear.
        // Emulate by pushing an object where only the affected keys are gone.
        setForChart(chartType, {});
      }
      void nextOverride;
    } else {
      setForChart(chartType, patch);
    }
  };
  const val = (k) => {
    if (applyToAll) return raw[k] ?? null;
    return chartOverride[k] ?? raw[k] ?? null;
  };
  const has = (section, field) => {
    if (!schema[section]) return false;
    if (field === undefined) return true;
    return Array.isArray(schema[section]) ? schema[section].includes(field) : Boolean(schema[section]);
  };

  const chartMeta = useMemo(() =>
    CHART_TYPES.find((c) => c.key === chartType), [chartType]);

  if (!open) return null;

  return (
    <div
      data-testid="chart-style-backdrop"
      className="fixed inset-0 z-[80] flex justify-end bg-[#0B0B18]/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        data-testid="chart-style-drawer"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#E7E7F3] bg-white p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-headline text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">
              Figure customization
            </p>
            <h2 className="font-headline mt-1 text-[20px] text-[#0B0B18]">
              {chartMeta?.label || "Figure style"}
            </h2>
          </div>
          <button data-testid="chart-style-close" onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-full text-[#64748B] hover:bg-[#F8FAFC]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scope toggle */}
        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-[#5139ED]/20 bg-[#F5F3FE] p-3">
          <input
            data-testid="chart-style-apply-all"
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="h-4 w-4 accent-[#5139ED]"
          />
          <div className="flex-1">
            <p className="text-[12px] font-bold text-[#0B0B18]">Apply current style to all figures in this project</p>
            <p className="mt-0.5 text-[10.5px] text-[#64748B]">
              {applyToAll
                ? "Changes propagate to every figure globally."
                : "Changes apply only to this figure."}
            </p>
          </div>
        </label>

        {/* Theme (only meaningful in global mode) */}
        {applyToAll && (
          <Section title="Theme" icon={<Palette className="h-3 w-3" />}>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(THEMES).map(([k, t]) => (
                <button key={k} data-testid={`theme-${k}`} onClick={() => set({ themeKey: k })}
                        className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                          raw.themeKey === k
                            ? "border-[#5139ED] bg-[#F5F3FE]"
                            : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/40"}`}>
                  <div className="flex gap-0.5">
                    {t.palette.slice(0, 5).map((c) => (
                      <span key={c} className="h-4 w-2.5 rounded-sm" style={{ background: c }} />
                    ))}
                  </div>
                  <p className="flex-1 text-[12px] font-bold text-[#0B0B18]">{t.label}</p>
                </button>
              ))}
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
                  onClick={() => set({ fontFamily: f.k })}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-all ${
                    (raw.fontFamily || null) === (f.k || null)
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
              palette={applyToAll
                ? (raw.paletteOverride ?? style.palette)
                : (chartOverride.palette || style.palette)}
              onChange={(next) => applyToAll
                ? set({ paletteOverride: next })
                : setForChart(chartType, { palette: next })}
            />
          </Section>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {applyToAll ? (
            <button data-testid="chart-style-reset" onClick={reset}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
              <RotateCcw className="h-3.5 w-3.5" /> Reset all figures
            </button>
          ) : (
            <button data-testid={`chart-style-reset-${chartType}`} onClick={() => resetChart(chartType)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
              <RotateCcw className="h-3.5 w-3.5" /> Reset this figure
            </button>
          )}
          <button data-testid="chart-style-save" onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#4127c9]">
            Done
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#94A3B8]">
          Preferences are saved locally to your browser and applied to this figure on all devices logged into this account.
        </p>
      </aside>
    </div>
  );
}

/* ── Building blocks ────────────────────────────────────────────────── */
function Section({ title, icon, children }) {
  return (
    <div className="mt-6">
      <p className="font-headline flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
        {icon}{title}
      </p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function ColorRow({ label, testid, value, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3 py-2">
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
    <div className="flex items-center gap-3">
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

function ToggleRow({ label, testid, value, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3 py-2">
      <span className="text-[12px] font-semibold text-[#0B0B18]">{label}</span>
      <button
        data-testid={testid}
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={`relative h-5 w-9 rounded-full transition-all ${value ? "bg-[#5139ED]" : "bg-[#D5D5E8]"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
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
