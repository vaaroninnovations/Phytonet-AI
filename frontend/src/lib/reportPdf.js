// Publication-quality PDF renderer for the deterministic Report doc.
// Cover · TOC · numbered headings · figure/table numbering · page numbers.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const BRAND = [81, 57, 237];
const INK = [11, 11, 24];
const MUTED = [100, 116, 139];
const PAGE_W = 210, PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - 2 * MARGIN;

function drawHeader(doc, meta) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(meta.brand || "PhytoNet AI", MARGIN, 11);
  doc.text(meta.plantName || "", PAGE_W - MARGIN, 11, { align: "right" });
  doc.setDrawColor(231, 231, 243);
  doc.line(MARGIN, 13, PAGE_W - MARGIN, 13);
}

function drawFooter(doc) {
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
    doc.text(`Generated ${new Date().toISOString().split("T")[0]} · PhytoNet AI`, MARGIN, PAGE_H - 8);
  }
}

function ensureSpace(doc, cursor, need, meta) {
  if (cursor + need > PAGE_H - MARGIN - 12) {
    doc.addPage();
    drawHeader(doc, meta);
    return MARGIN + 8;
  }
  return cursor;
}

function drawHeading(doc, cursor, num, title, level = 1, meta) {
  const size = level === 1 ? 16 : level === 2 ? 12 : 10.5;
  const space = level === 1 ? 10 : 6;
  cursor = ensureSpace(doc, cursor, size + space, meta);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setTextColor(...INK);
  doc.text(`${num}  ${title}`, MARGIN, cursor);
  if (level === 1) {
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, cursor + 1.5, MARGIN + 25, cursor + 1.5);
  }
  return cursor + space + 1;
}

function drawParagraph(doc, cursor, text, meta) {
  if (!text) return cursor;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(text, CONTENT_W);
  const need = lines.length * 5;
  cursor = ensureSpace(doc, cursor, need, meta);
  doc.text(lines, MARGIN, cursor);
  return cursor + need + 2;
}

function drawTable(doc, cursor, table, meta) {
  cursor = ensureSpace(doc, cursor, 20, meta);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`Table ${table.id.slice(1)}. ${table.title}`, MARGIN, cursor);
  cursor += 4;
  autoTable(doc, {
    startY: cursor,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [231, 231, 243] },
    headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: "bold" },
    head: [table.columns],
    body: table.rows,
    tableWidth: CONTENT_W,
    didDrawPage: () => drawHeader(doc, meta),
  });
  cursor = (doc.lastAutoTable?.finalY || cursor) + 4;
  if (table.caption) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const capLines = doc.splitTextToSize(table.caption, CONTENT_W);
    doc.text(capLines, MARGIN, cursor);
    cursor += capLines.length * 3.8 + 2;
  }
  return cursor + 3;
}

// ─────────────────────────────────────────────────────────
// Main entry
// ─────────────────────────────────────────────────────────
export function renderReportPdf(reportDoc) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const meta = reportDoc.meta;

  // ═══ Cover Page ═══
  // Full-bleed brand strip
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 55, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text("PHYTONET AI · SCIENTIFIC RESEARCH REPORT", MARGIN, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Network Pharmacology · Publication-quality workflow report", MARGIN, 30);

  // Title block
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const titleLines = doc.splitTextToSize(meta.projectTitle, PAGE_W - 2 * MARGIN);
  doc.text(titleLines, MARGIN, 90);

  // Divider
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 130, MARGIN + 35, 130);

  // Meta block
  const rowY = 145;
  const rows = [
    ["Plant name",       meta.plantName],
    ["Scientific name",  meta.scientificName],
    ["Disease context",  meta.diseaseName || "—"],
    ["Prepared by",      meta.userName],
    ["Date",             meta.date],
    ["Platform",         meta.brand],
  ];
  doc.setFontSize(10);
  rows.forEach((r, i) => {
    const y = rowY + i * 9;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(r[0].toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.setFontSize(11);
    doc.text(String(r[1] || "—"), MARGIN + 55, y);
    doc.setFontSize(10);
  });

  // Footer strip
  doc.setFillColor(245, 243, 254);
  doc.rect(0, PAGE_H - 26, PAGE_W, 26, "F");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("This document is machine-generated from real workflow data. No values are fabricated.", MARGIN, PAGE_H - 15);

  // ═══ Table of Contents ═══
  doc.addPage();
  drawHeader(doc, meta);
  let y = MARGIN + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("Table of Contents", MARGIN, y);
  y += 12;

  doc.setFontSize(10);
  reportDoc.sections.forEach((sec) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(`${sec.number}  ${sec.title}`, MARGIN, y);
    y += 6;
    if (sec.subsections) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED);
      sec.subsections.forEach((sub, i) => {
        doc.text(`     ${sec.number}.${i + 1}  ${sub.title}`, MARGIN, y);
        y += 5;
      });
    }
    y += 2;
  });

  // ═══ Body sections ═══
  reportDoc.sections.forEach((sec) => {
    doc.addPage();
    drawHeader(doc, meta);
    let cursor = MARGIN + 10;
    cursor = drawHeading(doc, cursor, sec.number, sec.title, 1, meta);

    if (sec.paragraphs) {
      sec.paragraphs.forEach((p) => { cursor = drawParagraph(doc, cursor, p, meta); });
    }

    if (sec.subsections) {
      sec.subsections.forEach((sub, i) => {
        const subNum = `${sec.number}.${i + 1}`;
        cursor = drawHeading(doc, cursor, subNum, sub.title, 2, meta);
        (sub.body || sub.paragraphs || []).forEach((p) => { cursor = drawParagraph(doc, cursor, p, meta); });
        if (sub.table) cursor = drawTable(doc, cursor, sub.table, meta);
      });
    }

    if (sec.refs) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      sec.refs.forEach((r) => {
        cursor = ensureSpace(doc, cursor, 10, meta);
        const label = `[${r.id}] `;
        const labelW = doc.getTextWidth(label);
        doc.setFont("helvetica", "bold");
        doc.text(label, MARGIN, cursor);
        doc.setFont("helvetica", "normal");
        const text = doc.splitTextToSize(r.text, CONTENT_W - labelW);
        doc.text(text, MARGIN + labelW, cursor);
        cursor += text.length * 5 + 2;
      });
    }

    if (sec.keyvals) {
      autoTable(doc, {
        startY: cursor,
        margin: { left: MARGIN, right: MARGIN },
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2, lineColor: [231, 231, 243] },
        headStyles: { fillColor: BRAND, textColor: [255, 255, 255] },
        head: [["Parameter", "Value"]],
        body: sec.keyvals.map((k) => [k.label, k.value]),
      });
    }
  });

  drawFooter(doc);
  const safe = (s) => (s || "report").replace(/[^A-Za-z0-9_.-]/g, "_");
  return { blob: doc.output("blob"), filename: `${safe(meta.plantName)}_PhytoNet_AI_Report.pdf` };
}
