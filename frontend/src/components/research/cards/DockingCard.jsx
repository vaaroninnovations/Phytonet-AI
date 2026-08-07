// DockingCard — top compounds × top targets docking results with inline
// 3Dmol interactive complex viewer per row.
import { Fragment, useMemo, useState } from "react";
import {
  Beaker, ChevronDown, ChevronUp, TrendingDown, FileSpreadsheet,
} from "lucide-react";
import DockingViewer from "../../DockingViewer";
import { trigger } from "./_helpers";

export function DockingCard({ data, message }) {
  const jobId    = data?.job_id || "";
  const metrics  = data?.metrics || {};
  const rows     = useMemo(() => {
    const list = (data?.results || []).slice();
    list.sort((a, b) => {
      const av = (a.error || a.best_affinity == null) ? Infinity : a.best_affinity;
      const bv = (b.error || b.best_affinity == null) ? Infinity : b.best_affinity;
      return av - bv;
    });
    return list;
  }, [data?.results]);

  const [expandedPair, setExpandedPair] = useState(null);

  const strengthBadge = (aff) => {
    if (aff == null) return { label: "—", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
    if (aff <= -9)   return { label: "Very strong", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" };
    if (aff <= -7)   return { label: "Strong",      cls: "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" };
    if (aff <= -5)   return { label: "Moderate",    cls: "bg-amber-500/15  text-amber-200  border-amber-400/30" };
    return              { label: "Weak",        cls: "bg-rose-500/15   text-rose-200   border-rose-400/30" };
  };

  const dlCSV = () => {
    const header = ["compound", "gene", "uniprot", "pdb",
                    "best_affinity_kcal_per_mol", "n_modes", "pair_id",
                    "error"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        JSON.stringify(r.ligand_name || ""),
        JSON.stringify(r.gene_symbol || ""),
        JSON.stringify(r.receptor_uniprot || ""),
        JSON.stringify(r.pdb_id || r.receptor_pdb || ""),
        (r.best_affinity != null ? Number(r.best_affinity).toFixed(3) : ""),
        (r.poses || []).length,
        JSON.stringify(r.pair_id || ""),
        JSON.stringify(r.error || ""),
      ].join(","));
    }
    trigger(new Blob([lines.join("\n")],
      { type: "text/csv;charset=utf-8;" }), "docking_results.csv");
  };

  return (
    <div data-testid="docking-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Beaker className="h-4 w-4 text-[#f472b6]" />
        <div className="text-[15px] font-semibold text-slate-100">
          Molecular Docking · Top compounds × Top targets
        </div>
        {metrics.streaming_done != null && metrics.streaming_total != null
          && metrics.streaming_done < metrics.streaming_total && (
          <span data-testid="docking-streaming-badge"
                className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-[10.5px] font-semibold text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
            Streaming · {metrics.streaming_done}/{metrics.streaming_total}
          </span>
        )}
        {metrics.n_strong != null && (
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
            {metrics.n_strong} strong binder{metrics.n_strong === 1 ? "" : "s"} (≤ −7 kcal/mol)
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-slate-400 mb-3">{message}</div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {[
          { label: "Pairs",          value: metrics.n_pairs,   color: "text-slate-100" },
          { label: "Succeeded",      value: metrics.n_success, color: "text-emerald-300" },
          { label: "Failed",         value: metrics.n_failed,  color: metrics.n_failed ? "text-rose-300" : "text-slate-300" },
          { label: "Strong (≤−7)",   value: metrics.n_strong,  color: "text-emerald-200" },
          { label: "Best affinity",
            value: (metrics.best_affinity != null
                     ? `${Number(metrics.best_affinity).toFixed(2)}` : "—"),
            color: "text-[#a48bff]" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-white/5 bg-black/25 px-3 py-2 text-center">
            <div className={`text-[18px] font-bold ${s.color}`}>{s.value ?? "—"}</div>
            <div className="text-[10.5px] uppercase tracking-widest text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {metrics.best_pair && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11.5px] text-emerald-200">
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Best binder: <span className="font-mono font-semibold">{metrics.best_pair}</span> at <span className="font-mono font-semibold">{Number(metrics.best_affinity).toFixed(2)}</span> kcal/mol</span>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">
          Ranked results ({rows.length})
        </div>
        <button data-testid="docking-download-csv" onClick={dlCSV}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] font-semibold text-slate-200 hover:bg-white/10">
          <FileSpreadsheet size={10} /> CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/5 bg-black/25">
        <table className="w-full text-[11.5px]">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Compound</th>
              <th className="px-3 py-2 text-left">Gene</th>
              <th className="px-3 py-2 text-left">PDB</th>
              <th className="px-3 py-2 text-right">Affinity (kcal/mol)</th>
              <th className="px-3 py-2 text-center">Strength</th>
              <th className="px-3 py-2 text-center">Modes</th>
              <th className="px-3 py-2 text-center">3D View</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const badge = strengthBadge(r.best_affinity);
              const isOpen = expandedPair === r.pair_id;
              const hasError = !!r.error;
              return (
                <Fragment key={r.pair_id || i}>
                  <tr
                      data-testid={`docking-row-${i}`}
                      className={`border-t border-white/5 ${hasError ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2 text-slate-100">{r.ligand_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-emerald-200">{r.gene_symbol || r.receptor_uniprot || "—"}</td>
                    <td className="px-3 py-2 font-mono text-amber-200">{r.pdb_id || r.receptor_pdb || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-100">
                      {hasError ? "—" : (r.best_affinity != null
                        ? Number(r.best_affinity).toFixed(2) : "—")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                        {hasError ? "Failed" : badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-300">
                      {hasError ? "—" : ((r.poses || []).length || "—")}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {!hasError && r.pair_id && (
                        <button
                          data-testid={`docking-view3d-${i}`}
                          onClick={() => setExpandedPair(isOpen ? null : r.pair_id)}
                          className="inline-flex items-center gap-1 rounded-md border border-[#5139ED]/40 bg-[#5139ED]/20 px-2 py-1 text-[10.5px] font-semibold text-[#c4b5fd] hover:bg-[#5139ED]/30">
                          {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                          {isOpen ? "Hide" : "View 3D"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && !hasError && (
                    <tr key={`${r.pair_id}-viewer`} className="bg-black/40">
                      <td colSpan={8} className="px-3 py-3">
                        <div data-testid={`docking-viewer-wrap-${i}`}
                             className="rounded-xl bg-white/95 p-2">
                          <DockingViewer
                            jobId={jobId}
                            pairId={r.pair_id}
                            ligandName={r.ligand_name}
                            receptor={`${r.gene_symbol || r.receptor_uniprot} (${r.pdb_id || r.receptor_pdb})`}
                            bestAffinity={r.best_affinity}
                            interactions={r.interactions || {}}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-500">
                  No docking results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {metrics.n_failed > 0 && (
        <div className="mt-2 text-[10.5px] text-rose-300">
          {metrics.n_failed} pair(s) failed — usually because a target has no
          reviewed PDB structure or the ligand rejected receptor prep.
        </div>
      )}
    </div>
  );
}
