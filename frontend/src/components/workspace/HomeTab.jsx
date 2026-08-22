// Home tab: hero chat bar, recent projects (rich cards), + right sidebar
// with a prominent "PhytoNet Automate" card and grouped standalone modules.
// Clicking a project or module opens a new tab.
import { useEffect, useState } from "react";
import { authApi } from "@/context/AuthContext";
import { useNodes } from "@/context/NodeContext";
import {
  Sparkles, Send, Beaker, Atom, Dna, FlaskConical, Microscope, Network,
  MessageSquare, ArrowRight, ChevronRight, Loader2, Zap, LifeBuoy, Coins,
} from "lucide-react";
import { SUGGESTIONS } from "@/components/research/EmptyState";
import { useFeedbackTrigger } from "@/components/feedback/FeedbackDialog";

// Automated workflow entry — replaces the old "PhytoNet AI Agent" module row.
const AUTOMATE = {
  key: "phytonet-automate",
  path: "/phytonet-ai",
  title: "PhytoNet Automate",
  blurb:
    "Run complete computational research workflows automatically. PhytoNet Automate connects the required modules, processes each step in sequence, and delivers integrated results.",
};

// Standalone tools — grouped into three domains with their own accent colour.
// Colour semantics: green = Discovery, amber = Evaluation, purple = Analysis.
const STANDALONE_GROUPS = [
  {
    key: "discovery",
    label: "Discovery",
    accent: "#2BB673",
    accentBg: "rgba(43,182,115,0.14)",
    accentRing: "rgba(43,182,115,0.35)",
    modules: [
      { key: "plant-db", icon: Beaker, path: "/plant-database",
        title: "Plant Database",
        blurb: "Explore phytochemicals and scientific references." },
      { key: "target-pred", icon: Atom, path: "/compound-target-prediction",
        title: "Compound Target Prediction",
        blurb: "Predict potential protein targets." },
      { key: "disease-target", icon: Dna, path: "/disease-target-prediction",
        title: "Disease Target Prediction",
        blurb: "Identify disease-associated genes and targets." },
    ],
  },
  {
    key: "evaluation",
    label: "Evaluation",
    accent: "#F59E0B",
    accentBg: "rgba(245,158,11,0.14)",
    accentRing: "rgba(245,158,11,0.35)",
    modules: [
      { key: "admet", icon: FlaskConical, path: "/admet",
        title: "ADMET & Drug-Likeness",
        blurb: "Evaluate pharmacokinetic and drug-like properties." },
      { key: "docking", icon: Microscope, path: "/dock",
        title: "Molecular Docking",
        blurb: "Protein–ligand docking and interaction analysis." },
    ],
  },
  {
    key: "analysis",
    label: "Analysis",
    accent: "#8139ED",
    accentBg: "rgba(129,57,237,0.16)",
    accentRing: "rgba(129,57,237,0.40)",
    modules: [
      { key: "network", icon: Network, path: "/network-analysis",
        title: "Network & Pathway Analysis",
        blurb: "PPI, GO, KEGG, enrichment and pathway analysis." },
    ],
  },
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

      {/* RIGHT — Automate card + grouped standalone modules + footer chips */}
      <RightSidebar onOpenModule={onOpenModule} />
    </div>
  );
}

/* ─────────── Right sidebar ─────────── */
function RightSidebar({ onOpenModule }) {
  const { balance } = useNodes();
  const openFeedback = useFeedbackTrigger();
  const NODE_TARGET = 1000; // shown as the sidebar bar's ceiling
  const pct = Math.min(100, Math.max(0, (Number(balance) / NODE_TARGET) * 100));

  return (
    <aside
      data-testid="home-sidebar"
      className="hidden lg:flex w-[320px] xl:w-[360px] flex-shrink-0 flex-col border-l border-white/10 bg-[#0B0A1D]/70 backdrop-blur-xl"
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded">
        {/* ── PhytoNet Automate hero card ── */}
        <button
          type="button"
          data-testid={`home-module-${AUTOMATE.key}`}
          onClick={() => onOpenModule(AUTOMATE)}
          className="group relative w-full overflow-hidden rounded-2xl border border-[#8139ED]/40 bg-gradient-to-br from-[#2A1F6F] via-[#5139ED]/40 to-[#8139ED]/30 p-4 text-left shadow-[0_20px_50px_-20px_rgba(129,57,237,0.6),0_0_0_1px_rgba(129,57,237,0.15)_inset] transition-transform hover:-translate-y-0.5"
        >
          {/* Radial glow accent */}
          <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,#c4b5fd,transparent_75%)] opacity-30 blur-2xl" />
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#c4b5fd] backdrop-blur">
            <Zap size={10} /> Automated Workflow
          </div>
          <div className="flex items-center gap-2 text-white">
            <Zap size={16} className="text-[#c4b5fd]" />
            <div className="font-headline text-[15px] font-bold">{AUTOMATE.title}</div>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/80">
            {AUTOMATE.blurb}
          </p>
          {/* Compact workflow visualisation */}
          <div className="mt-3 flex flex-wrap items-center gap-1 text-[10px] font-semibold text-white/85">
            {["Input", "Modules", "Execute", "Analyze", "Results"].map((step, i, arr) => (
              <span key={step} className="inline-flex items-center gap-1">
                <span className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5">{step}</span>
                {i < arr.length - 1 && <ChevronRight size={10} className="text-white/40" />}
              </span>
            ))}
          </div>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#5139ED] transition-colors group-hover:bg-[#F0EAFE]">
            Explore Automated Workflows
            <ArrowRight size={12} />
          </div>
        </button>

        {/* ── Standalone modules ── */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
            Standalone Modules
          </div>
          <div className="mt-0.5 text-[11px] text-white/50">
            Run individual computational tools independently.
          </div>
        </div>

        {STANDALONE_GROUPS.map((g) => (
          <div key={g.key} className="space-y-1.5">
            <div
              className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.22em]"
              style={{ color: g.accent }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.accent }} />
              {g.label}
            </div>
            {g.modules.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  data-testid={`home-module-${m.key}`}
                  onClick={() => onOpenModule(m)}
                  className="group w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:bg-white/[0.06]"
                  style={{ boxShadow: `inset 0 0 0 0 ${g.accentRing}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = g.accentRing; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
                >
                  <span
                    className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg"
                    style={{ background: g.accentBg, color: g.accent, boxShadow: `0 0 0 1px ${g.accentRing} inset` }}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-white group-hover:text-white">{m.title}</div>
                    <div className="text-[10.5px] leading-snug text-white/55 line-clamp-2">{m.blurb}</div>
                  </div>
                  <ChevronRight size={13} className="text-white/30 group-hover:text-white/70" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Bottom section — nodes + support ── */}
      <div className="border-t border-white/10 bg-black/40 p-4">
        <div className="mb-1.5 flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-widest text-white/55">
          <span className="inline-flex items-center gap-1.5"><Coins size={11} className="text-[#F5C05A]" /> Node balance</span>
          <span data-testid="home-node-balance" className="font-mono text-white">
            {balance} / {NODE_TARGET}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#F5C05A]"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          data-testid="home-buy-nodes"
          onClick={() => window.dispatchEvent(new CustomEvent("open-purchase-nodes"))}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-3 py-2 text-[11.5px] font-bold text-white hover:-translate-y-0.5 transition-transform"
        >
          <Coins size={12} /> Buy Nodes
        </button>
        <div className="mt-3 text-center text-[10.5px] text-white/60">
          Need help?
        </div>
        <button
          data-testid="home-support"
          onClick={() => openFeedback("phytonet-ai-agent")}
          className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11.5px] font-semibold text-white/85 hover:bg-white/[0.08]"
        >
          <LifeBuoy size={12} /> Feedback &amp; Support
        </button>
      </div>
    </aside>
  );
}
