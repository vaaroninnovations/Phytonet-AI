// GROMACS XVG file parser — client-side.
// XVG files are Grace format: `#` comments, `@` directives, then numeric columns.
// See: https://manual.gromacs.org/current/reference-manual/file-formats.html#xvg

export function parseXvg(text) {
  const meta = { title: "", subtitle: "", xaxis: "", yaxis: "", legends: [] };
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("@")) {
      // @    title "RMSD"
      // @    xaxis  label "Time (ps)"
      // @    yaxis  label "RMSD (nm)"
      // @ s0 legend "Protein"
      const t = line.match(/^@\s+title\s+"([^"]+)"/i);
      if (t) { meta.title = t[1]; continue; }
      const s = line.match(/^@\s+subtitle\s+"([^"]+)"/i);
      if (s) { meta.subtitle = s[1]; continue; }
      const x = line.match(/^@\s+xaxis\s+label\s+"([^"]+)"/i);
      if (x) { meta.xaxis = x[1]; continue; }
      const y = line.match(/^@\s+yaxis\s+label\s+"([^"]+)"/i);
      if (y) { meta.yaxis = y[1]; continue; }
      const lg = line.match(/^@\s+s\d+\s+legend\s+"([^"]+)"/i);
      if (lg) { meta.legends.push(lg[1]); continue; }
      continue;
    }
    // numeric data row
    const cols = line.split(/\s+/).map(Number);
    if (cols.some((n) => Number.isNaN(n))) continue;
    rows.push(cols);
  }
  return { meta, rows };
}

// Convert XVG rows to Recharts-friendly array [{x, y0, y1, …}].
// Assumes column 0 is x (time). Downsamples if > maxPoints for chart perf.
export function xvgToChart(parsed, maxPoints = 800) {
  const { rows } = parsed;
  if (!rows.length) return [];
  const step = Math.max(1, Math.floor(rows.length / maxPoints));
  const out = [];
  for (let i = 0; i < rows.length; i += step) {
    const r = rows[i];
    const obj = { x: r[0] };
    for (let c = 1; c < r.length; c++) obj[`y${c - 1}`] = r[c];
    out.push(obj);
  }
  return out;
}

// Compute mean, min, max, std of a numeric column across all rows.
export function xvgStats(parsed, col = 1) {
  const vals = parsed.rows.map((r) => r[col]).filter((v) => Number.isFinite(v));
  const n = vals.length;
  if (!n) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const variance = vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  return { n, mean, min, max, std: Math.sqrt(variance) };
}
