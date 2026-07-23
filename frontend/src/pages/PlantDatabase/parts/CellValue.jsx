import StructureCanvas from "@/components/StructureCanvas";
import { compoundKey } from "@/context/SelectionContext";

function CellValue({ field, row, onEdit }) {
  if (field === "structure") {
    return <StructureCanvas smiles={row.smiles} size={160} />;
  }
  if (field === "status") {
    const st = row.status;
    if (!st) return <span className="text-[#B4B4CD]">—</span>;
    const map = {
      standardized: {
        label: "Standardized",
        cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      },
      manual_review: {
        label: "Requires Manual Review",
        cls: "bg-amber-50 text-amber-700 ring-amber-200",
      },
      duplicate_removed: {
        label: "Duplicate Removed",
        cls: "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3] line-through",
      },
    };
    const m = map[st] || { label: st, cls: "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]" };
    return (
      <span
        data-testid={`status-${compoundKey(row)}`}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${m.cls}`}
      >
        {m.label}
      </span>
    );
  }
  if (field === "source") {
    const src = row.source || "";
    const notFound = row.not_found || src.endsWith("not found");
    const color = notFound
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : src === "IMPPAT"
      ? "bg-[#5139ED]/10 text-[#5139ED] ring-[#5139ED]/20"
      : src === "LOTUS"
      ? "bg-[#395AED]/10 text-[#395AED] ring-[#395AED]/20"
      : src.startsWith("LC-MS")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : src.includes("+")
      ? "bg-gradient-to-r from-[#5139ED] to-[#395AED] text-white ring-transparent"
      : "bg-[#F1F1FA] text-[#64748B] ring-[#E7E7F3]";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ring-inset ${color}`}
      >
        {src || "—"}
      </span>
    );
  }
  if (field === "smiles") {
    const v = row.smiles;
    const isLcms = (row.source || "").startsWith("LC-MS");
    if (!v) {
      if (isLcms && onEdit) {
        return (
          <input
            data-testid={`smiles-edit-${compoundKey(row)}`}
            defaultValue=""
            placeholder="SMILES Not Available — paste to edit"
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) onEdit({ smiles: val, not_found: false });
            }}
            className="w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1 font-mono text-[11px] text-amber-900 outline-none placeholder:text-amber-500 focus:border-[#5139ED] focus:ring-1 focus:ring-[#5139ED]/30"
          />
        );
      }
      return <span className="text-[#B4B4CD]">—</span>;
    }
    return (
      <span
        className="font-mono text-[11px] leading-tight text-[#1E1E33]"
        title={v}
      >
        {v.length > 60 ? `${v.slice(0, 60)}…` : v}
      </span>
    );
  }
  if (field === "inchi") {
    const v = row[field];
    if (!v) return <span className="text-[#B4B4CD]">—</span>;
    return (
      <span
        className="font-mono text-[11px] leading-tight text-[#1E1E33]"
        title={v}
      >
        {v.length > 60 ? `${v.slice(0, 60)}…` : v}
      </span>
    );
  }
  if (field === "molecular_weight") {
    return row.molecular_weight ? (
      <span className="font-mono text-[12px]">
        {Number(row.molecular_weight).toFixed(2)}
      </span>
    ) : (
      <span className="text-[#B4B4CD]">—</span>
    );
  }
  const v = row[field];
  return v ? (
    <span>{v}</span>
  ) : (
    <span className="text-[#B4B4CD]">—</span>
  );
}

export { CellValue };
