// Multi-page PDF Simulation Report — jsPDF + autoTable.
// Snapshots on-page Recharts SVGs to embed real charts (no placeholder art).
// Produces a publication-ready report with:
//   • Cover page (branding, ligand + target metadata)
//   • Simulation configuration table
//   • Progress timeline
//   • Live Simulation Parameters — 4 chart snapshots
//   • Trajectory Analysis — up to 11 chart snapshots
//   • Summary Statistics table
//   • MM-PBSA section
//   • Reproducibility footer
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = "#5139ED";
const INK = "#0B0B18";
const MUTED = "#64748B";
const PAGE_W = 210;   // mm (A4)
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - 2 * MARGIN;

// ─────────────────────────────────────────────────────────
// SVG → PNG (via off-screen canvas). Returns dataURL.
// ─────────────────────────────────────────────────────────
async function svgToPngDataUrl(svgEl, scale = 2) {
  if (!svgEl) return null;
  const s = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([s], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const w = svgEl.clientWidth || Number(svgEl.getAttribute("width")) || 640;
    const h = svgEl.clientHeight || Number(svgEl.getAttribute("height")) || 320;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Find the SVG rendered inside a specific analysis card (data-testid="md-analysis-<key>").
function findChartSvg(cardKey) {
  const card = document.querySelector(`[data-testid="md-analysis-${cardKey}"]`);
  if (!card) return null;
  return card.querySelector("svg");
}

// ─────────────────────────────────────────────────────────
// Layout helpers
// ─────────────────────────────────────────────────────────
function newPage(doc, title) {
  doc.addPage();
  drawHeader(doc, title);
  return MARGIN + 22;
}

function drawHeader(doc, title) {
  // Brand strip
  doc.setFillColor(BRAND);
  doc.rect(0, 0, PAGE_W, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text("PhytoNet AI · Molecular Dynamics Report", MARGIN, 14);
  if (title) {
    doc.setFontSize(14);
    doc.setTextColor(INK);
    doc.text(title, MARGIN, 20);
    doc.setDrawColor(231, 231, 243);
    doc.line(MARGIN, 22, PAGE_W - MARGIN, 22);
  }
}

function drawFooter(doc) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    doc.text(`Generated ${new Date().toISOString().split("T")[0]}`, MARGIN, PAGE_H - 8);
  }
}

async function embedChart(doc, cardKey, title, yStart) {
  const svg = findChartSvg(cardKey);
  if (!svg) return { y: yStart, embedded: false };
  const dataUrl = await svgToPngDataUrl(svg, 2);
  if (!dataUrl) return { y: yStart, embedded: false };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(title, MARGIN, yStart);

  // Aim for ~85mm high charts (2 per page)
  const w = CONTENT_W;
  const h = 75;
  doc.setDrawColor(231, 231, 243);
  doc.roundedRect(MARGIN, yStart + 3, w, h, 2, 2);
  doc.addImage(dataUrl, "PNG", MARGIN + 2, yStart + 5, w - 4, h - 4, undefined, "FAST");
  return { y: yStart + h + 10, embedded: true };
}

// ─────────────────────────────────────────────────────────
// Main entry — builds and downloads the PDF.
// ─────────────────────────────────────────────────────────
export async function buildMDReportPdf({ compound, target, cfg, stats, results, mmpbsaText, stageStatus, pctComplete }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // ═══ Cover page ═══
  doc.setFillColor(BRAND);
  doc.rect(0, 0, PAGE_W, 6, "F");

  doc.setFillColor(245, 243, 254);
  doc.roundedRect(MARGIN, MARGIN + 15, CONTENT_W, 60, 4, 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(BRAND);
  doc.text("MOLECULAR DYNAMICS · SIMULATION REPORT", MARGIN + 6, MARGIN + 26);

  doc.setFontSize(24);
  doc.setTextColor(INK);
  const titleLines = doc.splitTextToSize(`${compound?.name || "Ligand"} × ${target?.gene_symbol || target?.uniprot_id || "Target"}`, CONTENT_W - 12);
  doc.text(titleLines, MARGIN + 6, MARGIN + 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text(`GROMACS · ${cfg.force_field?.toUpperCase()} · ${cfg.production_ns} ns @ ${cfg.temperature_K} K, ${cfg.pressure_bar} bar`, MARGIN + 6, MARGIN + 62);

  // Metadata card
  doc.setFontSize(11);
  doc.setTextColor(INK);
  autoTable(doc, {
    startY: MARGIN + 85,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2, lineColor: [231, 231, 243] },
    headStyles: { fillColor: [81, 57, 237], textColor: [255, 255, 255], fontStyle: "bold" },
    head: [["Field", "Value"]],
    body: [
      ["Protein",            target?.protein_name || target?.gene_symbol || "—"],
      ["UniProt ID",         target?.uniprot_id || "—"],
      ["PDB ID",             target?.pdb_id || "—"],
      ["Ligand name",        compound?.name || "—"],
      ["Ligand SMILES",      compound?.smiles || "—"],
      ["Force field",        cfg.force_field],
      ["Water model",        cfg.water_model],
      ["Box type",           cfg.box_type],
      ["Box padding",        `${cfg.box_padding_nm} nm`],
      ["Salt concentration", `${cfg.ion_concentration} M ${cfg.positive_ion}/${cfg.negative_ion}`],
      ["Temperature",        `${cfg.temperature_K} K`],
      ["Pressure",           `${cfg.pressure_bar} bar`],
      ["Time step",          `${cfg.dt_fs} fs`],
      ["Simulation time",    `${cfg.production_ns} ns (production)`],
      ["Equilibration",      `EM=${cfg.em_steps} steps · NVT=${cfg.nvt_ps} ps · NPT=${cfg.npt_ps} ps`],
    ],
  });

  // ═══ Simulation Progress ═══
  let y = newPage(doc, "1 · Simulation Progress");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  doc.text(`Overall completion: ${pctComplete}%`, MARGIN, y);
  // progress bar
  doc.setDrawColor(231, 231, 243);
  doc.setFillColor(241, 241, 250);
  doc.roundedRect(MARGIN, y + 3, CONTENT_W, 5, 2, 2, "F");
  const doneW = (CONTENT_W * (pctComplete || 0)) / 100;
  if (doneW > 0) {
    doc.setFillColor(BRAND);
    doc.roundedRect(MARGIN, y + 3, doneW, 5, 2, 2, "F");
  }
  y += 15;

  const stageRows = [
    ["1", "Protein Preparation",      stageStatus?.prep    || "pending"],
    ["2", "Topology Generation",      stageStatus?.topol   || "pending"],
    ["3", "Solvation",                stageStatus?.solvate || "pending"],
    ["4", "Ion Addition",             stageStatus?.ions    || "pending"],
    ["5", "Energy Minimization",      stageStatus?.em      || "pending"],
    ["6", "NVT Equilibration",        stageStatus?.nvt     || "pending"],
    ["7", "NPT Equilibration",        stageStatus?.npt     || "pending"],
    ["8", "Production MD",            stageStatus?.prod    || "pending"],
  ];
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [231, 231, 243] },
    headStyles: { fillColor: [81, 57, 237], textColor: [255, 255, 255] },
    head: [["#", "Stage", "Status"]],
    body: stageRows.map(([n, label, st]) => [n, label, st.toUpperCase()]),
    columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 40, halign: "center", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      const v = data.cell.raw?.toString().toLowerCase();
      if (v === "completed") { data.cell.styles.textColor = [22, 101, 52]; data.cell.styles.fillColor = [220, 252, 231]; }
      else if (v === "ready") { data.cell.styles.textColor = [146, 64, 14]; data.cell.styles.fillColor = [254, 243, 199]; }
      else                    { data.cell.styles.textColor = [100, 116, 139]; data.cell.styles.fillColor = [241, 241, 250]; }
    },
  });

  // ═══ Summary Statistics ═══
  y = newPage(doc, "2 · Summary Statistics");
  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [231, 231, 243] },
    headStyles: { fillColor: [81, 57, 237], textColor: [255, 255, 255] },
    head: [["Metric", "Mean", "Std", "Min", "Max", "Units"]],
    body: [
      ["RMSD (backbone)",         results?.rmsd?.stats,     "nm"],
      ["RMSF (per-residue)",      results?.rmsf?.stats,     "nm"],
      ["Radius of Gyration",      results?.rg?.stats,       "nm"],
      ["SASA",                    results?.sasa?.stats,     "nm²"],
      ["Hydrogen Bonds",          results?.hbond?.stats,    ""],
      ["Protein–Ligand Distance", results?.distance?.stats, "nm"],
      ["Temperature",             results?.temperature?.stats, "K"],
      ["Pressure",                results?.pressure?.stats,    "bar"],
      ["Density",                 results?.density?.stats,     "kg/m³"],
      ["Potential Energy",        results?.energy?.stats,      "kJ/mol"],
    ]
      .filter((r) => r[1])
      .map(([name, s, unit]) => [
        name,
        s.mean.toFixed(3), s.std.toFixed(3), s.min.toFixed(3), s.max.toFixed(3), unit,
      ]),
  });

  if (typeof stats?.mmpbsa === "number") {
    y = doc.lastAutoTable.finalY + 12;
    doc.setFillColor(245, 243, 254);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(BRAND);
    doc.text("Binding Free Energy (MM-PBSA / MM-GBSA)", MARGIN + 4, y + 8);
    doc.setFontSize(20);
    doc.setTextColor(INK);
    doc.text(`ΔG_bind = ${stats.mmpbsa.toFixed(2)} kJ/mol`, MARGIN + 4, y + 18);
  }

  // ═══ Live Simulation Parameters (4 charts) ═══
  y = newPage(doc, "3 · Live Simulation Parameters");
  const liveCharts = [
    ["temperature", "Temperature vs Time"],
    ["pressure",    "Pressure vs Time"],
    ["density",     "Density vs Time"],
    ["energy",      "Potential Energy vs Time"],
  ];
  for (const [k, t] of liveCharts) {
    if (!results?.[k]) continue;
    if (y > PAGE_H - 100) y = newPage(doc, "3 · Live Simulation Parameters (cont.)");
    const r = await embedChart(doc, k, t, y);
    y = r.y;
  }

  // ═══ Trajectory Analysis (11 charts) ═══
  y = newPage(doc, "4 · Trajectory Analysis");
  const trajCharts = [
    ["rmsd",     "RMSD"],
    ["rmsf",     "RMSF (per-residue)"],
    ["rg",       "Radius of Gyration (Rg)"],
    ["sasa",     "Solvent-Accessible Surface Area"],
    ["hbond",    "Hydrogen Bond Analysis"],
    ["distance", "Protein–Ligand Distance"],
    ["contacts", "Contact Analysis"],
    ["dssp",     "Secondary Structure (DSSP)"],
    ["pca",      "Principal Component Analysis (PCA)"],
    ["fel",      "Free Energy Landscape (FEL)"],
    ["mmpbsa",   "MM-PBSA / MM-GBSA"],
  ];
  for (const [k, t] of trajCharts) {
    // mmpbsa card is present as long as mmpbsaText is loaded
    const has = k === "mmpbsa" ? !!mmpbsaText : !!results?.[k];
    if (!has) continue;
    if (y > PAGE_H - 100) y = newPage(doc, "4 · Trajectory Analysis (cont.)");
    const r = await embedChart(doc, k, t, y);
    y = r.y;
  }

  // ═══ MM-PBSA raw text (if present) ═══
  if (mmpbsaText) {
    y = newPage(doc, "5 · MM-PBSA / MM-GBSA Raw Output");
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    doc.setTextColor(INK);
    const text = mmpbsaText.slice(0, 8000);   // keep reasonable
    const lines = doc.splitTextToSize(text, CONTENT_W);
    let cursor = y;
    for (const line of lines) {
      if (cursor > PAGE_H - MARGIN - 8) cursor = newPage(doc, "5 · MM-PBSA (cont.)");
      doc.text(line, MARGIN, cursor);
      cursor += 4;
    }
  }

  // ═══ Reproducibility ═══
  y = newPage(doc, "6 · Reproducibility & Methods");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(INK);
  const methods = [
    "System preparation. The receptor structure was fetched from RCSB PDB and cleaned of crystallographic waters and heteroatoms. Missing hydrogens were rebuilt by `gmx pdb2gmx` using the selected force field.",
    "Ligand parameterisation. GAFF parameters were derived via ACPYPE from the ligand SMILES; the resulting topology was merged with the protein topology using the shipped `merge_topology.py` helper.",
    "Solvation & ionisation. The complex was placed in a periodic box of the chosen shape with padding of " + cfg.box_padding_nm + " nm, solvated with the " + cfg.water_model.toUpperCase() + " water model, and neutralised with " + cfg.positive_ion + "/" + cfg.negative_ion + " ions at " + cfg.ion_concentration + " M.",
    "Minimisation. Steepest descent for up to " + cfg.em_steps + " steps, until the maximum force fell below 1000 kJ/(mol·nm).",
    "Equilibration. NVT (V-rescale thermostat, τ = 0.1 ps) for " + cfg.nvt_ps + " ps at " + cfg.temperature_K + " K, followed by NPT (Parrinello-Rahman barostat, τp = 2 ps) for " + cfg.npt_ps + " ps at " + cfg.pressure_bar + " bar.",
    "Production. " + cfg.production_ns + " ns MD with a " + cfg.dt_fs + " fs time step. Bonds involving hydrogen were constrained with LINCS; PME electrostatics with a 1.0 nm real-space cutoff; LJ cutoff 1.0 nm.",
    "Trajectory analysis. RMSD, RMSF, Rg, SASA, H-bonds, protein–ligand distances and secondary structure were computed with the GROMACS analysis suite (`gmx rms`, `gmx rmsf`, `gmx gyrate`, `gmx sasa`, `gmx hbond`, `gmx distance`, `do_dssp`).",
    "Free-energy landscape. PCA was performed on the C-α covariance matrix; the FEL was constructed by binning the top two principal components and taking −k_B T ln P(x, y).",
    "MM-PBSA. Binding free energies were estimated with g_mmpbsa (or gmx_MMPBSA) using single-trajectory approach on the production ensemble.",
  ];
  let cursor2 = y;
  for (const p of methods) {
    if (cursor2 > PAGE_H - MARGIN - 20) cursor2 = newPage(doc, "6 · Reproducibility & Methods (cont.)");
    const lines = doc.splitTextToSize(p, CONTENT_W);
    doc.text(lines, MARGIN, cursor2);
    cursor2 += lines.length * 4.6 + 3;
  }

  drawFooter(doc);
  const safe = (s) => (s || "").toString().replace(/[^A-Za-z0-9_.-]/g, "_");
  const filename = `MD_Report_${safe(compound?.name)}_x_${safe(target?.gene_symbol || target?.uniprot_id)}.pdf`;
  doc.save(filename);
}
