// Tab bar — Home tab + closable dynamic tabs (chat / project / module).
import { Home, X, Sparkles, LayoutGrid, Beaker, FlaskConical,
         Dna, Atom, Microscope, FileText, Database, Waves } from "lucide-react";

const ICONS = {
  home:    Home,
  project: Sparkles,
  module:  LayoutGrid,
};

// Icon overrides for well-known standalone modules.
const MODULE_ICONS = {
  "/phytonet-ai":                Sparkles,
  "/plant-database":             Beaker,
  "/compound-target-prediction": Atom,
  "/disease-target-identification": Dna,
  "/admet":                       FlaskConical,
  "/molecular-docking":           Microscope,
  "/molecular-dynamics":          Waves,
  "/ai-scientific-report":        FileText,
  "/network-analysis":            LayoutGrid,
  "/resources":                   Database,
};

export function TabBar({ tabs, activeId, onActivate, onClose }) {
  return (
    <div data-testid="app-tabbar"
         className="flex items-end gap-0.5 border-b border-white/10 bg-black/50 px-3 pt-2 backdrop-blur-xl overflow-x-auto">
      {tabs.map((t) => {
        const active = t.id === activeId;
        const Icon = t.type === "module" && t.modulePath
                       ? (MODULE_ICONS[t.modulePath] || ICONS[t.type])
                       : ICONS[t.type];
        return (
          <div
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => onActivate(t.id)}
            className={`group relative flex-shrink-0 flex items-center gap-2 rounded-t-lg pl-3 pr-2 py-2 cursor-pointer transition-all min-w-[120px] max-w-[240px] ${
              active
                ? "bg-gradient-to-b from-[#141024] to-[#0B0B18] text-white border border-b-0 border-white/10 shadow-lg"
                : "bg-white/5 hover:bg-white/10 text-slate-300 border border-transparent"
            }`}
          >
            <Icon size={13} className={active ? "text-[#a48bff]" : "text-slate-400"} />
            <span className="truncate text-[12.5px] font-medium flex-1">{t.title}</span>
            {t.closable !== false && (
              <button
                data-testid={`tab-${t.id}-close`}
                onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
                className="opacity-40 hover:opacity-100 hover:bg-white/10 rounded p-0.5 flex-shrink-0"
                title="Close tab"
              >
                <X size={11} />
              </button>
            )}
            {active && (
              <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-gradient-to-r from-[#5139ED] to-[#8139ED]" />
            )}
          </div>
        );
      })}
    </div>
  );
}
