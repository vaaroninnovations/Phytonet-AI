// DOCX renderer for the deterministic Report doc — uses `docx` npm library.
// Produces cover page, TOC, numbered headings, tables and page numbers.
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer,
  PageNumber, PageBreak, ShadingType, LevelFormat, TabStopType, TabStopPosition,
} from "docx";

const BRAND_HEX = "5139ED";
const MUTED_HEX = "64748B";

function p(text, opts = {}) {
  return new Paragraph({
    ...opts,
    children: [new TextRun({ text: text || "", ...(opts.run || {}) })],
  });
}

function heading(text, level, num) {
  const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  return new Paragraph({
    heading: map[level] || HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text: num ? `${num}  ` : "", bold: true, color: BRAND_HEX }),
      new TextRun({ text, bold: true, color: "0B0B18" }),
    ],
  });
}

function docxTable(t) {
  const width = { size: 100, type: WidthType.PERCENTAGE };
  const border = { style: BorderStyle.SINGLE, size: 4, color: "E7E7F3" };
  const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const head = new TableRow({
    tableHeader: true,
    children: t.columns.map((c) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: BRAND_HEX, color: "auto" },
      children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });
  const rows = t.rows.map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18, color: "0B0B18" })] })],
    })),
  }));
  return new Table({ rows: [head, ...rows], width, borders });
}

// ─────────────────────────────────────────────────────────
// Main entry — returns { blob, filename }
// ─────────────────────────────────────────────────────────
export async function renderReportDocx(reportDoc) {
  const meta = reportDoc.meta;

  // ── Cover page paragraphs
  const cover = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 240, after: 60 },
      children: [new TextRun({
        text: "PHYTONET AI · SCIENTIFIC RESEARCH REPORT",
        bold: true, color: BRAND_HEX, size: 22,
      })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({
        text: "Network Pharmacology · Publication-quality workflow report",
        color: MUTED_HEX, size: 18,
      })],
    }),
    new Paragraph({
      spacing: { before: 400, after: 240 },
      children: [new TextRun({ text: meta.projectTitle, bold: true, size: 48, color: "0B0B18" })],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: "", color: BRAND_HEX })],
      border: { top: { style: BorderStyle.SINGLE, size: 24, color: BRAND_HEX } },
    }),
  ];
  const metaRows = [
    ["Plant name",       meta.plantName],
    ["Scientific name",  meta.scientificName],
    ["Disease context",  meta.diseaseName || "—"],
    ["Prepared by",      meta.userName],
    ["Date",             meta.date],
    ["Platform",         meta.brand],
  ];
  metaRows.forEach(([k, v]) => {
    cover.push(new Paragraph({
      spacing: { after: 60 },
      tabStops: [{ type: TabStopType.LEFT, position: 3000 }],
      children: [
        new TextRun({ text: k.toUpperCase(), bold: true, color: MUTED_HEX, size: 18 }),
        new TextRun({ text: "\t" + (v || "—"), color: "0B0B18", size: 22 }),
      ],
    }));
  });
  cover.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Table of Contents (static rendering — no field codes)
  const toc = [heading("Table of Contents", 1)];
  reportDoc.sections.forEach((sec) => {
    toc.push(new Paragraph({
      spacing: { after: 60 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: `${sec.number}  `, bold: true, color: BRAND_HEX }),
        new TextRun({ text: sec.title, bold: true, color: "0B0B18" }),
      ],
    }));
    (sec.subsections || []).forEach((sub, i) => {
      toc.push(new Paragraph({
        spacing: { after: 40 }, indent: { left: 400 },
        children: [
          new TextRun({ text: `${sec.number}.${i + 1}  ${sub.title}`, color: MUTED_HEX }),
        ],
      }));
    });
  });
  toc.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Body sections
  const body = [];
  reportDoc.sections.forEach((sec) => {
    body.push(heading(sec.title, 1, sec.number));
    (sec.paragraphs || []).forEach((par) => body.push(p(par, { spacing: { after: 120 } })));
    (sec.subsections || []).forEach((sub, i) => {
      body.push(heading(sub.title, 2, `${sec.number}.${i + 1}`));
      (sub.body || sub.paragraphs || []).forEach((par) => body.push(p(par, { spacing: { after: 120 } })));
      if (sub.table) {
        body.push(new Paragraph({
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({ text: `Table ${sub.table.id.slice(1)}. `, bold: true, italics: true, color: BRAND_HEX }),
            new TextRun({ text: sub.table.title, italics: true, color: MUTED_HEX }),
          ],
        }));
        body.push(docxTable(sub.table));
        if (sub.table.caption) {
          body.push(new Paragraph({
            spacing: { before: 60, after: 200 },
            children: [new TextRun({ text: sub.table.caption, italics: true, color: MUTED_HEX, size: 16 })],
          }));
        }
      }
    });
    if (sec.refs) {
      sec.refs.forEach((r) => {
        body.push(new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: `[${r.id}] `, bold: true, color: BRAND_HEX }),
            new TextRun({ text: r.text, color: "0B0B18" }),
          ],
        }));
      });
    }
    if (sec.keyvals) {
      body.push(docxTable({
        columns: ["Parameter", "Value"],
        rows: sec.keyvals.map((k) => [k.label, k.value]),
      }));
    }
    body.push(new Paragraph({ children: [new PageBreak()] }));
  });

  // ── Assemble Document
  const doc = new Document({
    creator: "PhytoNet AI",
    title: meta.projectTitle,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        heading1: { run: { font: "Calibri", size: 32, bold: true, color: "0B0B18" }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: "Calibri", size: 26, bold: true, color: "0B0B18" }, paragraph: { spacing: { before: 200, after: 100 } } },
        heading3: { run: { font: "Calibri", size: 22, bold: true, color: "0B0B18" } },
      },
    },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                new TextRun({ text: meta.brand || "PhytoNet AI", color: MUTED_HEX, size: 16 }),
                new TextRun({ text: `\t${meta.plantName || ""}`, color: MUTED_HEX, size: 16 }),
              ],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
              children: [
                new TextRun({ text: `Generated ${new Date().toISOString().split("T")[0]} · PhytoNet AI`, color: MUTED_HEX, size: 14 }),
                new TextRun({ text: "\tPage ", color: MUTED_HEX, size: 14 }),
                new TextRun({ children: [PageNumber.CURRENT], color: MUTED_HEX, size: 14 }),
                new TextRun({ text: " of ", color: MUTED_HEX, size: 14 }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED_HEX, size: 14 }),
              ],
            })],
          }),
        },
        children: [...cover, ...toc, ...body],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safe = (s) => (s || "report").replace(/[^A-Za-z0-9_.-]/g, "_");
  return { blob, filename: `${safe(meta.plantName)}_PhytoNet_AI_Report.docx` };
}
