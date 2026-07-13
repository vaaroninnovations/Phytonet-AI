import { Download, Copy } from "lucide-react";
import {
  downloadCSV,
  downloadXLSX,
  copyRowsToClipboard,
} from "@/lib/tableExporters";
import { requireAuth } from "@/context/AuthContext";

/** Reusable CSV / XLSX / Copy toolbar for any table.
 *  Props: rows (array), columns ([{key,label}]), basename (string).
 */
export function TableToolbar({ rows, columns, basename = "table", testidPrefix }) {
  const disabled = !rows || rows.length === 0;
  const tp = testidPrefix || basename.replace(/\W+/g, "-");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        data-testid={`${tp}-csv`}
        onClick={() => requireAuth(() => downloadCSV(rows, columns, `${basename}.csv`))}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] disabled:opacity-40"
      >
        <Download className="h-3 w-3" /> CSV
      </button>
      <button
        data-testid={`${tp}-xlsx`}
        onClick={() => requireAuth(() => downloadXLSX(rows, columns, `${basename}.xlsx`))}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] disabled:opacity-40"
      >
        <Download className="h-3 w-3" /> Excel
      </button>
      <button
        data-testid={`${tp}-copy`}
        onClick={() => requireAuth(() => copyRowsToClipboard(rows, columns))}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full border border-[#E7E7F3] bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/50 hover:text-[#5139ED] disabled:opacity-40"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
    </div>
  );
}
