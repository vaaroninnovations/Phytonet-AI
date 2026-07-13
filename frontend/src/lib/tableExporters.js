// Universal table exporters: CSV, XLSX, Copy-to-clipboard.
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const escapeCSV = (v) => {
  if (v == null) return "";
  const s = typeof v === "string" ? v : Array.isArray(v) ? v.join(";") : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
};

export function rowsToCSV(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => escapeCSV(c.label ?? c.key)).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCSV(r[c.key])).join(",")).join("\n");
  return header + "\n" + body;
}

export function downloadCSV(rows, columns, filename = "table.csv") {
  const content = rowsToCSV(rows, columns);
  saveAs(new Blob([content], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadXLSX(rows, columns, filename = "table.xlsx", sheetName = "Sheet1") {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => c.label ?? c.key);
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = r[c.key];
      if (Array.isArray(v)) return v.join("; ");
      return v ?? "";
    })
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map((h) => ({ wch: Math.max(12, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([buf], { type: "application/octet-stream" }), filename);
}

export async function copyRowsToClipboard(rows, columns) {
  const cols = columns || Object.keys(rows[0] || {}).map((k) => ({ key: k, label: k }));
  const header = cols.map((c) => c.label ?? c.key).join("\t");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = r[c.key];
          if (Array.isArray(v)) return v.join("; ");
          return v ?? "";
        })
        .join("\t")
    )
    .join("\n");
  const text = header + "\n" + body;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${rows.length} rows to clipboard`);
  } catch (e) {
    toast.error("Clipboard copy failed");
  }
}
