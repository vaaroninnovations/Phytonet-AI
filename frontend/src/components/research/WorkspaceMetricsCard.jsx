// WorkspaceMetricsCard — publication-grade summary metrics rendered
// directly next to the AI Interpretation so users see the "so what?" of
// their run at a glance (no need to download the PDF report).
import { useMemo } from "react";
import {
  Beaker, Pill, Network, TrendingDown, ShieldCheck, ShieldAlert, Award,
} from "lucide-react";

function pct(n, total) {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}
const fmt = (v, d = 2) => (v == null || Number.isNaN(v)) ? "—"
  : (typeof v === "number" ? v.toFixed(d) : String(v));

export function WorkspaceMetricsCard({ run }) {
  const { docking, admet, network } = useMemo(() => {
    const results = run?.results || [];

    // Docking metrics from tool_docking (research assistant)
    const dock = results.find((r) => r.tool === "docking");
    let dockingBlock = null;
    if (dock) {
      const data = (dock.result || {}).data || {};
      const m = data.metrics || {};
      const okRows = (data.results || []).filter((r) => !r.error &&
        typeof r.best_affinity === "number");
      const sorted = okRows.slice().sort((a, b) => a.best_affinity - b.best_affinity);
      if (sorted.length) {
        dockingBlock = {
          nPairs:   m.n_pairs   ?? sorted.length,
          nStrong:  m.n_strong  ?? sorted.filter((r) => r.best_affinity <= -7).length,
          nSuccess: m.n_success ?? sorted.length,
          best:     sorted[0],
          top3:     sorted.slice(0, 3),
          meanHB:   sorted.reduce((s, r) =>
                     s + (r.interactions?.hydrogen_bonds?.length || 0), 0) / sorted.length,
        };
      }
    }

    // ADMET metrics from tool_admet_predict
    const admetStep = results.find((r) => r.tool === "admet_predict");
    let admetBlock = null;
    if (admetStep) {
      const rows = ((admetStep.result || {}).data || {}).results || [];
      if (rows.length) {
        const num = (r, k) => {
          const v = Number(r[k]);
          return Number.isFinite(v) ? v : null;
        };
        const meanOf = (k) => {
          const arr = rows.map((r) => num(r, k)).filter((v) => v != null);
          return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        };
        const passLipinski = rows.filter((r) => {
          const mw = num(r, "mw"), lp = num(r, "logp"),
                hba = num(r, "hba"), hbd = num(r, "hbd");
          return mw != null && mw <= 500 && lp != null && lp <= 5
              && hba != null && hba <= 10 && hbd != null && hbd <= 5;
        }).length;
        const highQED = rows.filter((r) => (num(r, "qed") ?? -1) >= 0.5).length;
        const hergHi  = rows.filter((r) => (num(r, "herg") ?? 0) >= 0.5).length;
        const amesHi  = rows.filter((r) => (num(r, "ames") ?? 0) >= 0.5).length;
        admetBlock = {
          n: rows.length,
          passLipinski, highQED, hergHi, amesHi,
          meanMW:   meanOf("mw"),
          meanLogP: meanOf("logp"),
          meanQED:  meanOf("qed"),
        };
      }
    }

    // Hub-degree metrics from tool_ctp_network
    const ctp = results.find((r) => r.tool === "ctp_network");
    let netBlock = null;
    if (ctp) {
      const data = (ctp.result || {}).data || {};
      const m = data.metrics || {};
      const topHubs = data.nodes && data.nodes.length
        ? [...data.nodes].sort((a, b) => (b.degree || 0) - (a.degree || 0))
                          .slice(0, 3)
        : (m.top_by_degree || []).slice(0, 3);
      if (topHubs.length) {
        netBlock = {
          nNodes:   m.n_nodes ?? data.nodes?.length ?? 0,
          nEdges:   m.n_edges ?? data.edges?.length ?? 0,
          topHubs,
        };
      }
    }

    return { docking: dockingBlock, admet: admetBlock, network: netBlock };
  }, [run?.results]);

  if (!docking && !admet && !network) return null;

  return (
    <div data-testid="workspace-metrics-card"
         className="rounded-xl border border-[#5139ED]/25 bg-gradient-to-br from-[#5139ED]/8 to-[#8139ED]/4 p-3 mb-2 backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2">
        <Award size={13} className="text-[#a48bff]" />
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-[#a48bff]">
          Publication-grade summary
        </div>
        <div className="ml-auto text-[10px] italic text-slate-500">
          Same metrics baked into the PDF report
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">

        {/* Docking */}
        {docking && (
          <div data-testid="metrics-docking"
               className="rounded-lg border border-white/5 bg-black/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Beaker size={11} className="text-[#f472b6]" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#f472b6]">
                Docking
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <TrendingDown size={12} className="text-emerald-300" />
              <span className="text-[18px] font-bold text-emerald-200">
                {fmt(docking.best?.best_affinity, 2)}
              </span>
              <span className="text-[10px] text-slate-400">kcal/mol</span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-slate-400">
              Best: <span className="font-mono text-slate-200">
                {docking.best?.ligand_name} × {docking.best?.gene_symbol || docking.best?.receptor_uniprot}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                {docking.nStrong} strong (≤ −7)
              </span>
              <span className="rounded-full bg-slate-600/25 border border-slate-500/30 px-1.5 py-0.5 text-[10px] text-slate-300">
                {docking.nSuccess}/{docking.nPairs} pairs
              </span>
              {docking.meanHB > 0 && (
                <span className="rounded-full bg-slate-600/25 border border-slate-500/30 px-1.5 py-0.5 text-[10px] text-slate-300">
                  ⌀ {fmt(docking.meanHB, 1)} H-bonds
                </span>
              )}
            </div>
          </div>
        )}

        {/* ADMET */}
        {admet && (
          <div data-testid="metrics-admet"
               className="rounded-lg border border-white/5 bg-black/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Pill size={11} className="text-sky-300" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-sky-300">
                ADMET · Drug-likeness
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <ShieldCheck size={12} className="text-emerald-300" />
              <span className="text-[18px] font-bold text-emerald-200">
                {pct(admet.passLipinski, admet.n)}
              </span>
              <span className="text-[10px] text-slate-400">Lipinski Ro5</span>
            </div>
            <div className="mt-0.5 text-[10.5px] text-slate-400">
              QED ≥ 0.5: <span className="font-mono text-emerald-200">
                {pct(admet.highQED, admet.n)}
              </span> · mean QED <span className="font-mono">{fmt(admet.meanQED, 3)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-full bg-slate-600/25 border border-slate-500/30 px-1.5 py-0.5 text-[10px] text-slate-300">
                ⌀ MW {fmt(admet.meanMW, 0)} Da
              </span>
              <span className="rounded-full bg-slate-600/25 border border-slate-500/30 px-1.5 py-0.5 text-[10px] text-slate-300">
                ⌀ LogP {fmt(admet.meanLogP, 2)}
              </span>
              {(admet.hergHi > 0 || admet.amesHi > 0) && (
                <span title="Predicted hERG-block ≥ 0.5 / Ames mutagenicity ≥ 0.5"
                      className="rounded-full bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[10px] text-rose-200 inline-flex items-center gap-0.5">
                  <ShieldAlert size={9} />
                  {admet.hergHi} hERG · {admet.amesHi} Ames
                </span>
              )}
            </div>
          </div>
        )}

        {/* Network hubs */}
        {network && (
          <div data-testid="metrics-network"
               className="rounded-lg border border-white/5 bg-black/30 p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Network size={11} className="text-amber-300" />
              <div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                Network hubs
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mb-1">
              {network.nNodes} nodes · {network.nEdges} edges
            </div>
            <div className="space-y-0.5">
              {network.topHubs.map((h, i) => {
                const tint = h.type === "Compound" ? "text-[#a48bff]"
                           : h.type === "Target"   ? "text-emerald-200"
                           : "text-amber-200";
                return (
                  <div key={h.id || i}
                       className="flex items-center justify-between text-[11px]">
                    <span className={`font-mono ${tint} truncate max-w-[130px]`}
                          title={h.id}>{i + 1}. {h.id}</span>
                    <span className="font-mono text-slate-300 text-[10.5px]">
                      deg {h.degree}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
