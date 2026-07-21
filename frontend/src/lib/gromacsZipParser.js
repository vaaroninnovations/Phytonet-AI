// Uploads a ZIP of GROMACS output (rmsd.xvg, rmsf.xvg, gyrate.xvg, sasa.xvg,
// hbond.xvg, temperature.xvg, pressure.xvg, density.xvg, energy.xvg, distance.xvg,
// dssp.xvg, pca.xvg, fel.xvg, mmpbsa.txt/xvg, md.gro, md.xtc, md.edr, md.log …)
// and returns a normalized results object.
import JSZip from "jszip";
import { parseXvg, xvgToChart, xvgStats } from "@/lib/xvgParser";

// Match filenames to canonical result keys.
// Users may name their files anything — we match on substrings & extensions.
const XVG_KEYS = [
  { key: "rmsd",         patterns: [/rmsd/i] },
  { key: "rmsf",         patterns: [/rmsf/i] },
  { key: "rg",           patterns: [/gyrate/i, /\brg\b/i, /radius[_-]?of[_-]?gyration/i] },
  { key: "sasa",         patterns: [/sasa/i, /area/i] },
  { key: "hbond",        patterns: [/hbnum/i, /hbond/i, /\bhb\b/i] },
  { key: "distance",     patterns: [/dist(?!ance).*|distance/i, /^dist\./i] },
  { key: "contacts",     patterns: [/contacts?/i, /mindist/i] },
  { key: "dssp",         patterns: [/dssp/i, /ss\.xvg$/i] },
  { key: "pca",          patterns: [/^pca/i, /2dproj/i, /proj/i] },
  { key: "fel",          patterns: [/\bfel\b/i, /freeenergy/i, /gibbs/i] },
  { key: "temperature",  patterns: [/temperature/i, /\btemp\b/i] },
  { key: "pressure",     patterns: [/pressure/i, /\bpres\b/i] },
  { key: "density",      patterns: [/density/i, /\bdens\b/i] },
  { key: "energy",       patterns: [/potential/i, /energy/i, /\bpe\b/i] },
];

function classify(filename) {
  const base = filename.split("/").pop() || filename;
  const lower = base.toLowerCase();
  if (!lower.endsWith(".xvg")) return null;
  for (const { key, patterns } of XVG_KEYS) {
    if (patterns.some((p) => p.test(lower))) return key;
  }
  return null;
}

/**
 * @param {File|Blob} file
 * @returns {Promise<{results:object, files:{final_pdb?:string, mmpbsa?:string}, filesList:string[]}>}
 */
export async function parseGromacsResultsZip(file) {
  const zip = await JSZip.loadAsync(file);
  const results = {};
  const files = {};
  const filesList = [];
  const entries = Object.values(zip.files).filter((z) => !z.dir);

  for (const entry of entries) {
    filesList.push(entry.name);
    const base = entry.name.toLowerCase();
    // XVG parsing
    const key = classify(entry.name);
    if (key) {
      const text = await entry.async("string");
      const parsed = parseXvg(text);
      results[key] = {
        chart: xvgToChart(parsed),
        stats: xvgStats(parsed, 1),
        meta: parsed.meta,
        raw: text,       // kept for CSV export
        source: entry.name,
      };
      continue;
    }
    // Final PDB (any .gro or .pdb near end of trajectory naming)
    if (base.endsWith(".pdb")) {
      files.final_pdb = await entry.async("string");
      continue;
    }
    // MM-PBSA text/summary (common outputs from gmx_MMPBSA_ana or g_mmpbsa)
    if (/mmpbsa|mm[_-]?gbsa/i.test(base) && (base.endsWith(".txt") || base.endsWith(".csv") || base.endsWith(".dat"))) {
      files.mmpbsa = await entry.async("string");
      continue;
    }
  }

  return { results, files, filesList };
}
