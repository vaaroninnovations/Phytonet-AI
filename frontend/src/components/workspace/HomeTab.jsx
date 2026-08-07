// Home tab: hero chat bar, recent projects (rich cards), + right column of
// standalone module cards. Clicking a project or module opens a new tab.
import { useEffect, useState } from "react";
import { authApi } from "@/context/AuthContext";
import {
  Sparkles, Send, Beaker, Atom, Dna, FlaskConical, Microscope,
  MessageSquare, ArrowRight, Loader2,
} from "lucide-react";
import { SUGGESTIONS } from "@/components/research/EmptyState";

const MODULES = [
  { key: "phytonet-ai",   icon: Sparkles,     path: "/phytonet-ai",
    title: "PhytoNet AI Agent",
    blurb: "Guided end-to-end network-pharmacology workflow." },
  { key: "plant-db",      icon: Beaker,       path: "/plant-database",
    title: "Plant Database",
    blurb: "Phytochemicals & references across IMPPAT + LOTUS." },
  { key: "admet",         icon: FlaskConical, path: "/admet",
    title: "ADMET & Drug-Likeness",
    blurb: "Lipinski, PK, hERG, LD50 and 20+ properties." },
  { key: "target-pred",   icon: Atom,         path: "/compound-target-prediction",
    title: "Compound Target Prediction",
    blurb: "Predict protein targets with ChEMBL + Swiss + Open Targets." },
  { key: "disease-target",icon: Dna,          path: "/disease-target-identification",
    title: "Disease Target Prediction",
    blurb: "Genes associated with a disease from Open Targets." },
  { key: "docking",       icon: Microscope,   path: "/molecular-docking",
    title: "Molecular Docking",
    blurb: "AutoDock Vina bulk docking with pose viewer." },
];

function ProjectCard({ p, onOpen }) {
  return (
    <button
      data-testid={`home-project-${p.id}`}
      onClick={() => onOpen(p)}
      className="group flex flex-col text-left rounded-xl border border-white/10 bg-white/[0.04] p-4 hover:border-[#5139ED]/40 hover:bg-white/[0.07] transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13.5px] font-semibold text-slate-100 line-clamp-2">
          {p.title}
        </div>
        <ArrowRight size={13} className="text-slate-500 group-hover:text-[#a48bff] mt-0.5" />
      </div>
      {p.preview && (
        <div className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400 line-clamp-2">
          {p.preview}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={10} /> {p.message_count}
        </span>
        <span>·</span>
        <span>{p.updated_at ? new Date(p.updated_at).toLocaleDateString() : ""}</span>
      </div>
    </button>
  );
}

export function HomeTab({ user, onStartChat, onOpenProject, onOpenModule }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await authApi.get("/research/projects");
        setProjects(data || []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const submit = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await onStartChat(prompt);
      setInput("");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="home-tab" className="flex h-full w-full min-h-0">
      {/* LEFT — chat hero + recent projects (75%) */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6 lg:p-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#5139ED]/30 bg-[#5139ED]/10 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-widest text-[#a48bff]">
            <Sparkles size={11} /> AI Research Assistant
          </div>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-slate-100 leading-tight">
            {user?.first_name ? `Welcome back, ${user.first_name}.` : "Welcome back."}
          </h1>
          <p className="mt-1.5 text-[14px] text-slate-400">
            Describe a research question in plain language — I'll orchestrate
            the right modules and cite every source.
          </p>

          <div className="mt-5 flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.04] p-2 focus-within:border-[#5139ED] transition-colors">
            <textarea
              data-testid="home-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              rows={1}
              placeholder="Start a new research question — Enter to send…"
              className="flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none max-h-40"
            />
            <button
              data-testid="home-chat-send"
              onClick={submit}
              disabled={busy || !input.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-purple-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              New chat
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {SUGGESTIONS.slice(0, 4).map((s, i) => (
              <button key={i} data-testid={`home-suggestion-${i}`}
                      onClick={() => onStartChat(s.text)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11.5px] text-slate-200 hover:bg-white/10 hover:border-[#5139ED]/40 transition-colors">
                <Sparkles size={10} className="text-[#a48bff]" /> {s.text}
              </button>
            ))}
          </div>

          <div className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-slate-100">Recent Projects</h2>
              <span className="text-[11px] text-slate-500">
                {projects.length} total
              </span>
            </div>
            {loading ? (
              <div className="py-8 text-center"><Loader2 className="mx-auto animate-spin text-[#a48bff]" size={18} /></div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-[13px] text-slate-400">
                No projects yet — start a new chat above to begin.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.slice(0, 8).map((p) => (
                  <ProjectCard key={p.id} p={p} onOpen={onOpenProject} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — standalone module cards (25%) */}
      <aside data-testid="home-modules"
             className="hidden lg:flex w-[300px] xl:w-[340px] flex-shrink-0 flex-col border-l border-white/10 bg-black/30 backdrop-blur-xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#a48bff]">Standalone Modules</div>
          <div className="mt-0.5 text-[12px] text-slate-400">Skip the chat — go straight to a tool.</div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.key}
                data-testid={`home-module-${m.key}`}
                onClick={() => onOpenModule(m)}
                className="group w-full flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.09] hover:border-[#5139ED]/40 transition-all"
              >
                <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br from-[#5139ED]/30 to-[#8139ED]/20 flex items-center justify-center border border-[#5139ED]/30">
                  <Icon size={15} className="text-[#a48bff]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-slate-100 group-hover:text-white">{m.title}</div>
                  <div className="mt-0.5 text-[10.5px] leading-relaxed text-slate-400 line-clamp-2">{m.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
