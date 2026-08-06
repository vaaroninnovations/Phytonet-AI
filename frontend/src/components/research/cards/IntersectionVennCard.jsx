// IntersectionVennCard — predicted vs disease gene Venn diagram +
// intersection table.
import { ChartDownloadBar } from "./_helpers";

export function IntersectionVennCard({ data, message }) {
  const pred        = data?.predicted_gene_symbols || [];
  const dz          = data?.disease_gene_symbols   || [];
  const common      = data?.common                 || [];
  const commonRows  = data?.targets                || [];
  const totalPred   = pred.length;
  const totalDz     = dz.length;
  const totalCommon = common.length;
  return (
    <div data-testid="intersection-venn-card"
         className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <div className="text-[15px] font-semibold text-slate-100">
          Predicted ∩ Disease Genes
        </div>
        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-300">
          {totalCommon} common
        </span>
        {data?.disease_name && (
          <span className="text-[11px] text-slate-500">· {data.disease_name}</span>
        )}
      </div>
      <div className="text-[11.5px] text-slate-400">{message}</div>

      <div className="mt-3">
        <ChartDownloadBar svgSelector="[data-testid=venn-svg]"
                          filenameBase="venn_intersection" />
        <div className="flex justify-center">
        <svg viewBox="0 0 380 200" width="100%" style={{maxWidth: 480}}
             data-testid="venn-svg" role="img" aria-label="Intersection Venn diagram">
          <defs>
            <linearGradient id="vennA" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#5139ED" stopOpacity="0.42"/>
              <stop offset="1" stopColor="#8139ED" stopOpacity="0.28"/>
            </linearGradient>
            <linearGradient id="vennB" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#059669" stopOpacity="0.42"/>
              <stop offset="1" stopColor="#22c55e" stopOpacity="0.28"/>
            </linearGradient>
          </defs>
          <circle cx="140" cy="100" r="82" fill="url(#vennA)"
                  stroke="#a48bff" strokeWidth="1.5" />
          <circle cx="240" cy="100" r="82" fill="url(#vennB)"
                  stroke="#34d399" strokeWidth="1.5" />
          <text x="90"  y="100" textAnchor="middle" fontSize="20"
                fill="#e2e8f0" fontWeight="700">{totalPred - totalCommon}</text>
          <text x="90"  y="122" textAnchor="middle" fontSize="10"
                fill="#a48bff">Predicted only</text>
          <text x="290" y="100" textAnchor="middle" fontSize="20"
                fill="#e2e8f0" fontWeight="700">{totalDz - totalCommon}</text>
          <text x="290" y="122" textAnchor="middle" fontSize="10"
                fill="#34d399">Disease only</text>
          <text x="190" y="102" textAnchor="middle" fontSize="26"
                fill="#f0fdf4" fontWeight="800"
                data-testid="venn-common-count">{totalCommon}</text>
          <text x="190" y="122" textAnchor="middle" fontSize="10"
                fill="#fef3c7">Common</text>
          <text x="70"  y="35" textAnchor="middle" fontSize="11"
                fill="#a48bff" fontWeight="700">Compound targets</text>
          <text x="310" y="35" textAnchor="middle" fontSize="11"
                fill="#34d399" fontWeight="700">Disease genes</text>
        </svg>
        </div>
      </div>

      {common.length > 0 && (
        <div className="mt-3">
          <div className="text-[10.5px] font-bold uppercase tracking-widest text-emerald-300 mb-1.5">
            Common genes ({common.length})
          </div>
          <div data-testid="common-genes-pills"
               className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {common.map((g) => (
              <span key={g}
                    className="inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {commonRows.length > 0 && (
        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-lg border border-white/5 bg-black/20">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-black/70 backdrop-blur-sm z-10">
              <tr className="text-[10.5px] uppercase tracking-wider text-slate-400 border-b border-white/10">
                <th className="text-left py-2 px-3">Gene</th>
                <th className="text-left py-2 px-3">Protein</th>
                <th className="text-left py-2 px-3">UniProt</th>
                <th className="text-left py-2 px-3">Assoc.</th>
                <th className="text-left py-2 px-3">Class</th>
              </tr>
            </thead>
            <tbody>
              {commonRows.map((r, i) => (
                <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="py-1.5 px-3 font-semibold text-emerald-200">
                    {r.gene_symbol || r.gene || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-200 truncate max-w-[280px]"
                      title={r.protein_name || ""}>
                    {r.protein_name || r.pref_name || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-300 font-mono">
                    {r.uniprot_id || "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-200">
                    {r.association_score != null ? Number(r.association_score).toFixed(2) : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-300">
                    {r.protein_class || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {commonRows.length === 0 && totalCommon === 0 && (
        <div className="mt-3 text-[12px] italic text-slate-500 text-center">
          No overlap between the predicted targets and this disease's gene panel.
        </div>
      )}
    </div>
  );
}
