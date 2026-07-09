import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

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
  saveAs(blob, filename);
}

export function exportXLSX(rows, fields, filename = "compounds.xlsx") {
  const data = stripFields(rows, fields);
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Compounds");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  saveAs(new Blob([out], { type: "application/octet-stream" }), filename);
}

export function exportJSON(rows, fields, filename = "compounds.json") {
  const data = stripFields(rows, fields);
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  saveAs(blob, filename);
}
