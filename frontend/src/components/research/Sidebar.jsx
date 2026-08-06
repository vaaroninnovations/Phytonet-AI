// Research Workspace — Projects sidebar
import { Plus, Loader2, MessageSquare, Trash2 } from "lucide-react";

function fmtWhen(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  } catch { return ""; }
}

export function Sidebar({ projects, activeId, onSelect, onNew, onDelete, loading }) {
  return (
    <aside data-testid="research-sidebar"
           className="hidden lg:flex w-72 flex-shrink-0 flex-col border-r border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="p-4">
        <button
          data-testid="research-new-project"
          onClick={onNew}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/20 hover:shadow-xl transition-all"
        >
          <Plus size={16} /> New Research
        </button>
      </div>
      <div className="px-4 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        Research History
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {loading && <div className="px-3 py-6 text-center text-xs text-slate-500">
          <Loader2 className="mx-auto animate-spin" size={14} />
        </div>}
        {!loading && projects.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No projects yet. Start a new research to begin.
          </div>
        )}
        {projects.map((p) => (
          <div key={p.id}
               data-testid={`project-row-${p.id}`}
               onClick={() => onSelect(p.id)}
               className={`group flex items-start justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                 activeId === p.id
                   ? "bg-[#5139ED]/20 border border-[#5139ED]/40"
                   : "hover:bg-white/5 border border-transparent"
               }`}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-slate-100">{p.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-slate-500">
                <MessageSquare size={10} /> {p.message_count}
                <span>·</span>
                {fmtWhen(p.updated_at)}
              </div>
            </div>
            <button
              data-testid={`delete-project-${p.id}`}
              onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
              className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"
              title="Delete project"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
