import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// Centralized auth guard for every download originating from this module.
// Reuses the existing global installed by AuthContext (`window.__phytonet_auth`)
// so we don't duplicate authentication logic or open a new modal system.
function guardedSave(blob, filename) {
  const doIt = () => saveAs(blob, filename);
  const g = typeof window !== "undefined" ? window.__phytonet_auth : null;
  if (g && typeof g.guard === "function") {
    g.guard(doIt);
  } else {
    // Pre-mount fallback (SSR / very early boot) — permit the download.
    doIt();
  }
}

const stripFields = (rows, fields) =>
  rows.map((r) => {
    const o = {};
    fields.forEach((f) => (o[f.label] = r[f.key] ?? ""));
    return o;
  });

export function exportCSV(rows, fields, filename = "compounds.csv") {
  const data = stripFields(rows, fields);
  const ws = XLSX.utils.json_to_sheet(data);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  guardedSave(blob, filename);
}

export function exportXLSX(rows, fields, filename = "compounds.xlsx") {
  const data = stripFields(rows, fields);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Compounds");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  guardedSave(new Blob([out], { type: "application/octet-stream" }), filename);
}

export function exportJSON(rows, fields, filename = "compounds.json") {
  const data = stripFields(rows, fields);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  guardedSave(blob, filename);
}
