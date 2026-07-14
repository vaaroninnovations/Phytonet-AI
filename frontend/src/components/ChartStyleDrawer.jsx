// Floating "Customize" drawer — universal chart / network style controls.
// Any page/chart consumes via `useChartStyle()`.
import { useState } from "react";
import { Palette, RotateCcw, X, ChevronDown } from "lucide-react";
import { useChartStyle, THEMES } from "@/context/ChartStyleContext";

export default function ChartStyleDrawer() {
  const [open, setOpen] = useState(false);
  const { style, raw, set, reset } = useChartStyle();

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
        <div className="fixed inset-0 z-[80] flex justify-end bg-[#0B0B18]/30 backdrop-blur-sm"
             onClick={() => setOpen(false)}
             data-testid="chart-style-backdrop">
          <aside data-testid="chart-style-drawer"
                 onClick={(e) => e.stopPropagation()}
                 className="h-full w-full max-w-md overflow-y-auto border-l border-[#E7E7F3] bg-white p-6 shadow-2xl">
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

            {/* Theme */}
            <Section title="Theme">
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(THEMES).map(([k, t]) => (
                  <button key={k} data-testid={`theme-${k}`} onClick={() => set({ themeKey: k })}
                          className={`rounded-xl border p-3 text-left transition-all ${
                            raw.themeKey === k
                              ? "border-[#5139ED] bg-[#F5F3FE]"
                              : "border-[#E7E7F3] bg-white hover:border-[#5139ED]/40"}`}>
                    <div className="flex gap-1">
                      {t.palette.slice(0, 4).map((c) => (
                        <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-[#0B0B18]">{t.label}</p>
                  </button>
                ))}
              </div>
            </Section>

            {/* Colors */}
            <Section title="Colors">
              <ColorRow label="Node"       testid="color-node" value={raw.nodeColor || style.node} onChange={(v) => set({ nodeColor: v })} />
              <ColorRow label="Edge"       testid="color-edge" value={raw.edgeColor || style.edge} onChange={(v) => set({ edgeColor: v })} />
              <ColorRow label="Background" testid="color-bg"   value={raw.backgroundColor || style.background} onChange={(v) => set({ backgroundColor: v })} />
              <ColorRow label="Label"      testid="color-label"value={raw.labelColor || style.labelColor} onChange={(v) => set({ labelColor: v })} />
            </Section>

            {/* Sizes */}
            <Section title="Sizes & opacity">
              <SliderRow label="Node scale"    testid="size-node"   min={0.3} max={3} step={0.05} value={raw.nodeSize}      onChange={(v) => set({ nodeSize: v })} />
              <SliderRow label="Edge thickness"testid="size-edge"   min={0.3} max={6} step={0.1}  value={raw.edgeThickness} onChange={(v) => set({ edgeThickness: v })} />
              <SliderRow label="Label size"    testid="size-label"  min={8}   max={22} step={1}   value={raw.labelSize}     onChange={(v) => set({ labelSize: v })} />
              <SliderRow label="Opacity"       testid="size-opacity"min={0.2} max={1} step={0.05} value={raw.opacity}       onChange={(v) => set({ opacity: v })} />
            </Section>

            {/* Legend */}
            <Section title="Legend position">
              <div className="grid grid-cols-5 gap-2">
                {["off","top","right","bottom","left"].map((p) => (
                  <button key={p} data-testid={`legend-${p}`} onClick={() => set({ legendPosition: p })}
                          className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold capitalize transition-all ${
                            raw.legendPosition === p
                              ? "border-[#5139ED] bg-[#F5F3FE] text-[#5139ED]"
                              : "border-[#E7E7F3] bg-white text-[#0B0B18] hover:border-[#5139ED]/40"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </Section>

            {/* Preview */}
            <Section title="Live preview">
              <MiniPreview />
            </Section>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button data-testid="chart-style-reset" onClick={reset}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-4 py-2 text-[12px] font-bold text-[#0B0B18] hover:border-[#5139ED]/40">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
              <button data-testid="chart-style-save" onClick={() => setOpen(false)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#5139ED] px-5 py-2 text-[12px] font-bold text-white hover:bg-[#4127c9]">
                Save preferences
              </button>
            </div>
            <p className="mt-2 text-[10px] text-[#94A3B8]">Preferences are saved locally to your browser and applied automatically to every chart on this device.</p>
          </aside>
        </div>
      )}
    </>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <p className="font-headline text-[10px] font-bold uppercase tracking-widest text-[#64748B]">{title}</p>
      <div className="mt-3 space-y-2.5">{children}</div>
    </div>
  );
}

function ColorRow({ label, testid, value, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#E7E7F3] bg-[#FAFAFF] px-3 py-2">
      <span className="text-[12px] font-semibold text-[#0B0B18]">{label}</span>
      <label className="flex items-center gap-2 cursor-pointer">
        <input data-testid={testid} type="color" value={value} onChange={(e) => onChange(e.target.value)}
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
      <span className="w-10 text-right font-mono text-[11px] text-[#6B7280]">{typeof value === "number" ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
    </div>
  );
}

function MiniPreview() {
  const { style } = useChartStyle();
  return (
    <div className="rounded-2xl border border-[#E7E7F3] p-3" style={{ background: style.background }}>
      <svg viewBox="0 0 300 120" className="w-full">
        {/* Nodes */}
        {[
          { x: 40, y: 60 }, { x: 100, y: 30 }, { x: 100, y: 90 },
          { x: 180, y: 60 }, { x: 260, y: 60 },
        ].map((n, i) => (
          <g key={i} opacity={style.opacity}>
            {/* Sample edges */}
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
        ))}
      </svg>
    </div>
  );
}
