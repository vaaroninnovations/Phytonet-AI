import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Leaf, Loader2, Search, Sparkles } from "lucide-react";

/**
 * Autocomplete input for plant names. Debounced fetch against
 * /api/plants/autocomplete. Selecting an option calls onSubmit(name).
 */
export default function PlantAutocomplete({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
}) {
  const [matches, setMatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [popular, setPopular] = useState([]);
  const [fetching, setFetching] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  // Load popular plants once
  useEffect(() => {
    api
      .get("/plants/autocomplete", { params: { q: "", limit: 6 } })
      .then((r) => setPopular(r.data.matches || []))
      .catch(() => {});
  }, []);

  // Debounced fetch
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setMatches([]);
      return;
    }
    setFetching(true);
    const t = setTimeout(() => {
      api
        .get("/plants/autocomplete", { params: { q, limit: 8 } })
        .then((r) => setMatches(r.data.matches || []))
        .catch(() => setMatches([]))
        .finally(() => setFetching(false));
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const listItems = value.trim() ? matches : popular;

  const handleKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(listItems.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && listItems[highlight]) {
        const name = listItems[highlight].name;
        onChange(name);
        setOpen(false);
        onSubmit(name);
      } else {
        setOpen(false);
        onSubmit();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const pick = (name) => {
    onChange(name);
    setOpen(false);
    onSubmit(name);
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex w-full items-center gap-2 rounded-full border-2 border-[#E7E7F3] bg-white p-1.5 pl-5 focus-within:border-[#5139ED] focus-within:ring-4 focus-within:ring-[#5139ED]/15 transition-colors duration-200">
        <Leaf className="h-5 w-5 text-[#5139ED]" />
        <input
          ref={inputRef}
          data-testid="plant-input"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="flex-1 border-none bg-transparent px-3 py-2.5 text-sm text-[#0B0B18] outline-none placeholder:text-[#B4B4CD]"
        />
        {fetching && <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#B4B4CD]" />}
        <button
          data-testid="plant-input-submit"
          onClick={() => {
            setOpen(false);
            onSubmit();
          }}
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

      {open && listItems.length > 0 && (
        <div
          data-testid="autocomplete-list"
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 max-h-80 overflow-auto rounded-2xl border border-[#E7E7F3] bg-white p-1.5 shadow-[0_20px_60px_-20px_rgba(81,57,237,0.35)]"
        >
          {!value.trim() && (
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">
              <Sparkles className="h-3 w-3" />
              Popular plants
            </div>
          )}
          {listItems.map((m, i) => (
            <button
              key={m.name}
              data-testid={`autocomplete-option-${i}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m.name);
              }}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                highlight === i
                  ? "bg-[#5139ED]/8 text-[#5139ED]"
                  : "text-[#0B0B18] hover:bg-[#F5F5FC]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Leaf className="h-3.5 w-3.5 opacity-70" />
                <span className="font-medium italic">{m.name}</span>
              </span>
              {m.imppat_hits > 0 && (
                <span className="rounded-full bg-[#5139ED]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#5139ED]">
                  {m.imppat_hits} hits
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
