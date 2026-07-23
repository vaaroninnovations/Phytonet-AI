import { Download } from "lucide-react";

function ExportBtn({ label, testid, onClick, disabled }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-2 text-xs font-semibold text-[#0B0B18] transition-colors hover:border-[#5139ED]/40 hover:text-[#5139ED] disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

// ─────────────────── Auto Analysis (final ranked) card ─────────────────

export { ExportBtn };
