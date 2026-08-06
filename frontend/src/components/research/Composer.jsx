// Research Workspace — Chat composer (input + drag-drop upload)
import { useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";

export function Composer({ onSend, onAttach, disabled, attachments, onRemoveAttach }) {
  const [value, setValue] = useState("");
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue("");
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onAttach(files);
  };

  return (
    <div className="border-t border-white/10 bg-black/30 backdrop-blur-xl p-4">
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((a, i) => (
            <span key={i} data-testid={`attach-chip-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-200">
              <Paperclip size={10} />
              {a.name}
              <span className="text-slate-500">
                {a.kind}{a.extracted?.length ? ` · ${a.extracted.length} SMILES` : ""}
              </span>
              <button onClick={() => onRemoveAttach(i)}
                      className="text-slate-500 hover:text-rose-300"><X size={11}/></button>
            </span>
          ))}
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex items-end gap-2 rounded-2xl border p-2 transition-colors ${
          dragging ? "border-[#5139ED] bg-[#5139ED]/5" : "border-white/15 bg-white/5"
        }`}>
        <button onClick={() => fileRef.current?.click()}
                data-testid="composer-attach-btn"
                className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-slate-100"
                title="Attach file (SMILES, CSV, XLSX, MOL, SDF)">
          <Paperclip size={16} />
        </button>
        <input ref={fileRef} type="file" hidden multiple
               accept=".smi,.txt,.csv,.xlsx,.xls,.mol,.sdf"
               onChange={(e) => onAttach(Array.from(e.target.files || []))} />
        <textarea
          data-testid="composer-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          disabled={disabled}
          placeholder={dragging ? "Drop files to attach…" : "Describe your research question — Enter to send, Shift+Enter for a new line…"}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-40"
        />
        <button data-testid="composer-send-btn"
                onClick={submit}
                disabled={disabled || !value.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 disabled:opacity-40">
          {disabled ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
