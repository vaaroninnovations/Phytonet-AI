// Floating "Customize" drawer — comprehensive chart / network style controls.
//
// Structure:
//   Global tab   → theme, colors, sizes, legend, grid, font, borders
//   Per-chart tab→ override any of the above for one of 13 chart types
//
// Consumers use `useChartStyle()` for global, or `useAppliedStyle(type)` for a
// merged style that already respects both global + per-chart overrides.
import { useMemo, useState } from "react";
import { Palette, RotateCcw, X, Grid, Type as TypeIcon, LayoutGrid } from "lucide-react";
import { useChartStyle, THEMES, CHART_TYPES } from "@/context/ChartStyleContext";

export default function ChartStyleDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("global");            // "global" | chartKey
  const { style, raw, set, setForChart, resetChart, reset } = useChartStyle();

  const chartOverride = (raw.byChart || {})[tab] || {};

  // Helper to write to the correct scope (global vs. per-chart)
  const write = (patch) => tab === "global" ? set(patch) : setForChart(tab, patch);
  const val = (k) => tab === "global" ? (raw[k] ?? null) : (chartOverride[k] ?? null);

  const chartMeta = useMemo(() =>
    CHART_TYPES.find((c) => c.key === tab), [tab]);

  return (
    <>
      <button
        data-testid="chart-style-open"
        onClick={() => setOpen(true)}
        aria-label="Customize charts"
        className="fixed bottom-24 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/95 px-4 py-2.5 text-[12px] font-bold text-[#0B0B18] shadow-[0_16px_36px_-14px_rgba(11,11,24,0.25)] backdrop-blur hover:border-[#5139ED]/40 hover:text-[#5139ED]">
        <Palette className="h-4 w-4 text-[#5139ED]" /> Customize
      </button>

      {open && (
        <div
          data-testid="chart-style-backdrop"
          className="fixed inset-0 z-[80] flex justify-end bg-[#0B0B18]/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside data-testid="chart-style-drawer"
                 onClick={(e) => e.stopPropagation()}
                 className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[#E7E7F3] bg-white p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-headline text-[11px] font-bold uppercase tracking-widest text-[#5139ED]">Visualization</p>
                <h2 className="font-headline mt-1 text-[20px] text-[#0B0B18]">Chart customization</h2>
              </div>
              <button data-testid="chart-style-close" onClick={() => setOpen(false)}
                      className="grid h-8 w-8 place-items-center rounded-full text-[#64748B] hover:bg-[#F8FAFC]">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scope selector */}
            <div className="mt-5 rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-1.5">
              <label className="ml-2 block text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Scope</label>
              <select
                data-testid="chart-style-scope"
                value={tab}
                onChange={(e) => setTab(e.target.value)}
                className="mt-1 w-full rounded-xl border-none bg-white px-3 py-2 text-[12.5px] font-semibold text-[#0B0B18] focus:outline-none focus:ring-2 focus:ring-[#5139ED]/40"
              >
                <option value="global">Global (all charts)</option>
                {["Networks", "Enrichment", "Charts"].map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {CHART_TYPES.filter((c) => c.category === cat).map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {chartMeta && (
              <p className="mt-2 text-[11px] italic text-[#64748B]">
                Overriding <span className="font-bold text-[#0B0B18]">{chartMeta.label}</span>.
                Leave a field empty to inherit from Global.
              </p>
            )}

            {/* Theme (global only — themes are global) */}
            {tab === "global" && (
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
                      <span className="rounded-md border border-[#E7E7F3] px-2 py-0.5 text-[10px] text-[#64748B]" style={{ background: t.background, color: t.foreground }}>
                        Aa
                      </span>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* Colors */}
            <Section title="Colors">
              <ColorRow label="Node"       testid={`${tab}-color-node`}  value={val("nodeColor") || style.node}      onChange={(v) => write({ nodeColor: v })} />
              <ColorRow label="Edge"       testid={`${tab}-color-edge`}  value={val("edgeColor") || style.edge}      onChange={(v) => write({ edgeColor: v })} />
              <ColorRow label="Background" testid={`${tab}-color-bg`}    value={val("backgroundColor") || style.background} onChange={(v) => write({ backgroundColor: v })} />
              <ColorRow label="Label"      testid={`${tab}-color-label`} value={val("labelColor") || style.labelColor} onChange={(v) => write({ labelColor: v })} />
              <ColorRow label="Grid"       testid={`${tab}-color-grid`}  value={val("gridColor") || style.grid}      onChange={(v) => write({ gridColor: v })} />
            </Section>

            {/* Sizes */}
            <Section title="Sizes & opacity">
              <SliderRow label="Node scale"     testid={`${tab}-size-node`}    min={0.3} max={3}   step={0.05} value={val("nodeSize") ?? style.nodeSize}         onChange={(v) => write({ nodeSize: v })} />
              <SliderRow label="Edge thickness" testid={`${tab}-size-edge`}    min={0.3} max={6}   step={0.1}  value={val("edgeThickness") ?? style.edgeThickness} onChange={(v) => write({ edgeThickness: v })} />
              <SliderRow label="Label size"     testid={`${tab}-size-label`}   min={8}   max={22}  step={1}    value={val("labelSize") ?? style.labelSize}       onChange={(v) => write({ labelSize: v })} />
              <SliderRow label="Opacity"        testid={`${tab}-size-opacity`} min={0.2} max={1}   step={0.05} value={val("opacity") ?? style.opacity}           onChange={(v) => write({ opacity: v })} />
            </Section>

            {/* Legend */}
            <Section title="Legend" icon={<LayoutGrid className="h-3 w-3" />}>
              <ToggleRow label="Show legend" testid={`${tab}-show-legend`} value={val("showLegend") ?? style.showLegend} onChange={(v) => write({ showLegend: v })} />
              <div className="grid grid-cols-5 gap-2">
                {["off","top","right","bottom","left"].map((p) => (
                  <button key={p} data-testid={`legend-${tab}-${p}`}
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

            {/* Grid + Border + Font */}
            <Section title="Grid & border" icon={<Grid className="h-3 w-3" />}>
              <ToggleRow label="Show grid"   testid={`${tab}-show-grid`}   value={val("showGrid") ?? style.showGrid}   onChange={(v) => write({ showGrid: v })} />
              <ToggleRow label="Show border" testid={`${tab}-show-border`} value={val("showBorder") ?? style.showBorder} onChange={(v) => write({ showBorder: v })} />
              <SliderRow label="Border radius" testid={`${tab}-border-radius`} min={0} max={32} step={1} value={val("borderRadius") ?? style.borderRadius} onChange={(v) => write({ borderRadius: v })} />
            </Section>

            {tab === "global" && (
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
            <Section title="Palette">
              <PaletteEditor
                testidPrefix={`${tab}-palette`}
                palette={val("paletteOverride") ?? (tab === "global" ? style.palette : ((raw.byChart?.[tab]?.palette) || style.palette))}
                onChange={(next) => tab === "global"
                  ? set({ paletteOverride: next })
                  : setForChart(tab, { palette: next })}
              />
            </Section>

            {/* Preview */}
            <Section title="Live preview">
              <MiniPreview chartType={tab === "global" ? "ppi" : tab} />
            </Section>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between gap-3">
              {tab === "global" ? (
                <button data-testid="chart-style-reset" onClick={reset}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset all
                </button>
              ) : (
                <button data-testid={`chart-style-reset-${tab}`} onClick={() => resetChart(tab)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset {chartMeta?.label}
                </button>
              )}
              <button data-testid="chart-style-save" onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#4127c9]">
                Save preferences
              </button>
            </div>
            <p className="mt-2 text-[10px] text-[#94A3B8]">
              Preferences are saved locally to your browser and applied automatically to every chart on this device.
            </p>
          </aside>
        </div>
      )}
    </>
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

/* ── Live preview ───────────────────────────────────────────────────── */
function MiniPreview({ chartType }) {
  const { style } = useChartStyle();
  const isBarLike = ["go", "kegg", "docking", "lollipop"].includes(chartType);
  const border = {
    borderRadius: style.borderRadius,
    border: style.showBorder ? `1px solid ${style.borderColor}` : "none",
  };
  return (
    <div className="rounded-2xl p-3" style={{ ...border, background: style.background, fontFamily: style.fontFamily }}>
      <svg viewBox="0 0 300 130" className="w-full">
        {style.showGrid && [30, 60, 90].map((y) => (
          <line key={y} x1="10" y1={y} x2="290" y2={y} stroke={style.grid} strokeWidth="0.5" />
        ))}
        {isBarLike ? (
          [65, 40, 85, 55, 70, 90, 45].map((h, i) => (
            <rect key={i} x={20 + i * 38} y={110 - h} width="26" height={h}
                  fill={style.palette[i % style.palette.length]} opacity={style.opacity}
                  rx={2} />
          ))
        ) : (
          [
            { x: 40, y: 60 }, { x: 100, y: 30 }, { x: 100, y: 90 },
            { x: 180, y: 60 }, { x: 260, y: 60 },
          ].map((n, i) => (
            <g key={i} opacity={style.opacity}>
              {i > 0 && (
                <line x1={n.x} y1={n.y}
                      x2={[null,40,40,100,180][i]} y2={[null,60,60,30,60][i]}
                      stroke={style.edge} strokeWidth={1.5 * style.edgeThickness} />
              )}
              <circle cx={n.x} cy={n.y} r={8 * style.nodeSize}
                      fill={style.palette[i % style.palette.length] || style.node} />
              <text x={n.x} y={n.y + 8 * style.nodeSize + 12}
                    textAnchor="middle" fontSize={style.labelSize}
                    fill={style.labelColor}>N{i + 1}</text>
            </g>
          ))
        )}
      </svg>
    </div>
  );
}
