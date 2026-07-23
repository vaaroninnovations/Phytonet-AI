import { Loader2, Search, Download } from "lucide-react";

function SearchInput({ testid, icon, placeholder, value, onChange, onSubmit, loading }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border-2 border-[#E7E7F3] bg-white p-1.5 pl-5 focus-within:border-[#5139ED] focus-within:ring-4 focus-within:ring-[#5139ED]/15 transition-colors duration-200">
      {icon}
      <input
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent px-3 py-2.5 text-sm text-[#0B0B18] outline-none placeholder:text-[#B4B4CD]"
      />
      <button
        data-testid={`${testid}-submit`}
        onClick={onSubmit}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4127c9] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        Search
      </button>
    </div>
  );
}

function NumberField({ testid, label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-4 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#64748B]">
        {label}
      </span>
      <input
        data-testid={testid}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 border-none bg-transparent text-sm text-[#0B0B18] outline-none"
      />
    </label>
  );
}

function ExportButton({ label, testid, onClick, disabled }) {
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

export { SearchInput, NumberField, ExportButton };
