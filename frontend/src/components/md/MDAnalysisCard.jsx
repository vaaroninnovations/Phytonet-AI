// Reusable analysis chart card for MD trajectory data.
// Collapsible + export (CSV/PNG/SVG). Auto-labels axes from XVG metadata.
import { useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ChevronDown, ChevronUp, Download, Maximize2 } from "lucide-react";
import { saveAs } from "file-saver";

export default function MDAnalysisCard({
  testid,
  title,
  data,              // {chart, stats, meta, raw}
  color = "#5139ED",
  description,       // short prose describing the metric
}) {
  const [open, setOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const svgRef = useRef(null);

  const empty = !data || !data.chart || data.chart.length === 0;
  const legends = (data?.meta?.legends?.length ? data.meta.legends : ["value"]);

  const exportCsv = () => {
    if (!data) return;
    const cols = Object.keys(data.chart[0] || { x: 0 });
    const header = cols.map((k, i) => (i === 0 ? (data.meta?.xaxis || "x") : (legends[i - 1] || k))).join(",");
    const rows = data.chart.map((row) => cols.map((k) => row[k]).join(","));
    saveAs(new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" }), `${testid}.csv`);
  };
  const exportSvg = () => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    saveAs(new Blob([s], { type: "image/svg+xml" }), `${testid}.svg`);
  };
  const exportPng = () => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;
    const s = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2; // 2x for hi-DPI
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => { if (b) saveAs(b, `${testid}.png`); URL.revokeObjectURL(url); }, "image/png");
    };
    img.src = url;
  };

  return (
    <div data-testid={`md-analysis-${testid}`} className={`overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white ${fullscreen ? "fixed inset-4 z-50" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[#FAFAFF]"
        data-testid={`md-analysis-${testid}-toggle`}
      >
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-[#0B0B18]">{title}</span>
          {data?.stats && (
            <span className="hidden text-[11px] font-mono text-[#64748B] md:inline">
              μ={data.stats.mean.toFixed(3)}  σ={data.stats.std.toFixed(3)}  [{data.stats.min.toFixed(3)}, {data.stats.max.toFixed(3)}]
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[#64748B]" /> : <ChevronDown className="h-4 w-4 text-[#64748B]" />}
      </button>

      {open && (
        <div className="border-t border-[#F1F1FA] px-5 py-4">
          {description && <p className="mb-3 text-[12px] text-[#64748B]">{description}</p>}

          {empty ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#E7E7F3] bg-[#FAFAFF] text-center text-sm text-[#64748B]">
              Awaiting simulation output — upload GROMACS <span className="mx-1 font-mono">.xvg</span> to populate.
            </div>
          ) : (
            <>
              <div ref={svgRef} className={`w-full ${fullscreen ? "h-[70vh]" : "h-64"}`}>
                <ResponsiveContainer>
                  <LineChart data={data.chart} margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
                    <CartesianGrid stroke="#F1F1FA" strokeDasharray="2 3" />
                    <XAxis dataKey="x" tick={{ fill: "#64748B", fontSize: 11 }}
                           label={{ value: data.meta?.xaxis || "Time", position: "insideBottom", offset: -10, fill: "#64748B", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 11 }}
                           label={{ value: data.meta?.yaxis || "", angle: -90, position: "insideLeft", fill: "#64748B", fontSize: 11 }} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E7E7F3", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {Object.keys(data.chart[0]).filter((k) => k !== "x").map((k, i) => (
                      <Line key={k} type="monotone" dataKey={k} name={legends[i] || k}
                            stroke={i === 0 ? color : `hsl(${(i * 47) % 360},70%,55%)`}
                            strokeWidth={1.6} dot={false} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button data-testid={`md-analysis-${testid}-csv`} onClick={exportCsv} className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[11px] font-semibold hover:border-[#5139ED]/40">
                  <Download className="h-3 w-3" />CSV
                </button>
                <button data-testid={`md-analysis-${testid}-png`} onClick={exportPng} className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[11px] font-semibold hover:border-[#5139ED]/40">
                  <Download className="h-3 w-3" />PNG
                </button>
                <button data-testid={`md-analysis-${testid}-svg`} onClick={exportSvg} className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[11px] font-semibold hover:border-[#5139ED]/40">
                  <Download className="h-3 w-3" />SVG
                </button>
                <button
                  data-testid={`md-analysis-${testid}-fullscreen`}
                  onClick={() => setFullscreen((v) => !v)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1 text-[11px] font-semibold hover:border-[#5139ED]/40"
                >
                  <Maximize2 className="h-3 w-3" />{fullscreen ? "Exit" : "Expand"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
