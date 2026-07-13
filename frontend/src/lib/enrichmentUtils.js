// Enrichment statistics helpers used by GO/KEGG panels.

export function benjaminiHochberg(pvals) {
  // Returns FDR-adjusted p-values in the same order as input.
  const n = pvals.length;
  if (n === 0) return [];
  const idx = pvals.map((_, i) => i).sort((a, b) => pvals[a] - pvals[b]);
  const adj = new Array(n).fill(0);
  let prev = 1;
  for (let k = n - 1; k >= 0; k--) {
    const i = idx[k];
    const raw = pvals[i] * n / (k + 1);
    const v = Math.min(prev, raw);
    adj[i] = Math.min(1, v);
    prev = adj[i];
  }
  return adj;
}

export function bonferroni(pvals) {
  const n = pvals.length;
  return pvals.map((p) => Math.min(1, (p || 0) * n));
}

/** ShinyGO-style Fold Enrichment = (k / n) / (K / N)  */
export function foldEnrichment({ intersection_size, query_size, term_size, effective_domain_size }) {
  if (!query_size || !term_size || !effective_domain_size) return 0;
  const geneRatio = intersection_size / query_size;
  const bgRatio = term_size / effective_domain_size;
  return bgRatio > 0 ? geneRatio / bgRatio : 0;
}

/** KEGG rich factor = intersection / term_size (fraction of the pathway covered). */
export function richFactor({ gene_count, term_size, overlap_size }) {
  const num = gene_count ?? overlap_size ?? 0;
  return term_size ? num / term_size : 0;
}

export const CORRECTION_METHODS = [
  { key: "g_SCS", label: "g:SCS (default)" },
  { key: "fdr", label: "Benjamini–Hochberg (FDR)" },
  { key: "bonferroni", label: "Bonferroni" },
  { key: "none", label: "None (raw P)" },
];
