// PhytoNet AI — Homepage.
// Complete redesign to a Clinical Cyber / Premium Scientific AI archetype
// (per /app/design_guidelines.json). Sections: Hero · Trust band · AI
// Assistant showcase · Modules bento · Workflow walkthrough · FAQ · Final CTA.
// Dark surfaces, structural borders, live tickers in accent green, sharp cards.
// Preserves all existing routes, auth flows, and data-testid contracts.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Sparkles, ChevronDown, Zap, Activity,
  Terminal, Network, Beaker, FlaskConical, Atom, Dna, Target, Microscope,
  ShieldCheck, Database, Cpu, Radio,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/* ──────────────── SHARED ATOMS ─────────────── */
function Kicker({ children, className = "" }) {
  return (
    <p className={`font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#E7E7F3]/70 ${className}`}>
      {children}
    </p>
  );
}

function LiveDot({ color = "#2BB673" }) {
  return (
    <span aria-hidden className="relative inline-flex h-2 w-2 items-center justify-center">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

/* ─────────────────────── HERO ─────────────────────── */
function Hero() {
  const { guard } = useAuth();
  const navigate = useNavigate();
  const goApp = () => guard(() => navigate("/app"));

  // "Nodes computed" odometer — a subtle live counter that anchors the
  // scientific-platform framing. Ticks up every 1.4s so it feels alive
  // without being distracting.
  const [count, setCount] = useState(1_452_093);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => c + Math.floor(Math.random() * 40 + 3)), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <section data-testid="home-hero"
             className="relative overflow-hidden bg-[#0F0E24] text-[#FAFAFF]">
      {/* Subtle radial + grid — sets the "clinical cyber" texture without
          resorting to a full-screen gradient. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.06]"
             style={{ backgroundImage:
               "linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)",
               backgroundSize: "56px 56px" }} />
        <div className="absolute left-1/3 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,#5139ED,transparent_75%)] opacity-25 blur-3xl" />
        <div className="absolute right-0 bottom-[-160px] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,#2BB673,transparent_70%)] opacity-15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-16 lg:pt-20 lg:pb-24">
        <motion.div className="max-w-3xl"
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FAFAFF]/10 bg-[#FAFAFF]/[0.03] px-3 py-1.5 text-[11px] font-body font-semibold uppercase tracking-[0.16em] text-[#E7E7F3]/80">
            <LiveDot /> Research intelligence · v2.0
          </div>

          <h1 className="mt-6 font-headline text-[44px] leading-[1.02] tracking-[-0.02em] text-[#FAFAFF] sm:text-[60px] lg:text-[76px]">
            Decode complex biology<br/>
            <span className="bg-gradient-to-r from-[#c4b5fd] via-[#8139ED] to-[#5139ED] bg-clip-text text-transparent">
              with PhytoNet AI.
            </span>
          </h1>

          <p className="mt-6 max-w-xl font-body text-[15.5px] leading-relaxed text-[#E7E7F3]/85">
            The natural-language research intelligence platform for pharmacologists,
            phytochemists and drug-discovery scientists. Plan multi-step network-pharmacology
            workflows in plain English — target prediction, ADMET, docking, enrichment —
            or dive into any module directly.
          </p>

          {/* Ticker + CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button type="button" data-testid="hero-launch-workspace" onClick={goApp}
                    className="group inline-flex items-center gap-2 rounded-lg bg-[#5139ED] px-5 py-3 text-[13.5px] font-bold text-white transition hover:bg-[#4128d4] hover:-translate-y-0.5">
              Launch Workspace <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
            <Link to="/research" data-testid="hero-open-assistant"
                  className="inline-flex items-center gap-2 rounded-lg border border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.04] px-5 py-3 text-[13.5px] font-semibold text-[#E7E7F3] hover:bg-[#FAFAFF]/[0.08] transition">
              <Terminal className="h-4 w-4" /> Try the AI Assistant
            </Link>
            <Link to="/pricing" data-testid="hero-view-pricing"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#c4b5fd] hover:text-white">
              View pricing <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Live counter — subtle, always ticking */}
          <div className="mt-10 inline-flex items-center gap-3 rounded-lg border border-[#2BB673]/25 bg-[#2BB673]/[0.06] px-3.5 py-2">
            <LiveDot />
            <div className="flex items-baseline gap-2">
              <span className="font-body text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#2BB673]">
                Nodes computed
              </span>
              <span data-testid="hero-nodes-counter"
                    className="font-headline text-[15px] font-bold tabular-nums text-[#FAFAFF]">
                {count.toLocaleString()}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      <a href="#trust" aria-label="Scroll to trust band"
         className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[#E7E7F3]/50 hover:text-white">
        <ChevronDown className="h-5 w-5 animate-bounce" />
      </a>
    </section>
  );
}

/* ─────────────────────── TRUST BAND ─────────────────────── */
const DATA_SOURCES = [
  "TCMSP", "LOTUS", "ChEMBL", "PubChem", "KEGG", "DisGeNET", "AlphaFold", "RCSB PDB",
  "Reactome", "STRING", "UniProt", "SwissADME", "AutoDock Vina",
];

function TrustBand() {
  return (
    <section id="trust" data-testid="home-trust"
             className="relative border-y border-[#FAFAFF]/10 bg-[#0B0918] py-10 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <Kicker className="mb-5 text-center">Data integrated from</Kicker>
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0B0918] to-transparent z-10" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0B0918] to-transparent z-10" />
          <div className="flex gap-12 animate-[marquee_38s_linear_infinite] hover:[animation-play-state:paused]">
            {[...DATA_SOURCES, ...DATA_SOURCES].map((src, i) => (
              <span key={i} className="whitespace-nowrap font-headline text-[16px] font-semibold tracking-wide text-[#E7E7F3]/55 hover:text-[#E7E7F3]">
                {src}
              </span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </section>
  );
}

/* ─────────────────── AI ASSISTANT SHOWCASE ─────────────────── */
function AssistantShowcase() {
  return (
    <section data-testid="home-assistant" className="relative bg-[#0F0E24] py-32 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
        <img src="https://images.unsplash.com/photo-1678845536613-5cf0ec5245cd?crop=entropy&cs=srgb&fm=jpg&w=1600&q=60"
             alt="" className="h-full w-full object-cover mix-blend-lighten" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F0E24] via-[#0F0E24]/70 to-[#0F0E24]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 grid grid-cols-12 gap-12">
        {/* Left copy */}
        <div className="col-span-12 lg:col-span-5">
          <Kicker>AI Research Assistant</Kicker>
          <h2 className="mt-3 font-headline text-[36px] leading-[1.05] tracking-tight text-[#FAFAFF] sm:text-[44px]">
            From query to pharmacological insight —{" "}
            <span className="text-[#2BB673]">in seconds.</span>
          </h2>
          <p className="mt-5 max-w-md font-body text-[14.5px] leading-relaxed text-[#E7E7F3]/80">
            Ask in plain English. The assistant drafts a workflow plan, previews the
            node cost, and executes across compound resolution, ADMET, target prediction,
            docking, and pathway enrichment — streaming results back to you as they land.
          </p>
          <ul className="mt-6 space-y-2 text-[13px] text-[#E7E7F3]/85">
            {[
              "Plan preview + explicit node-cost estimate before you run",
              "Live 'Nodes used X / Y' ticker & per-step progress",
              "AlphaFold fallback for targets missing an RCSB structure",
              "Shareable scientific report generated on completion",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#c4b5fd]" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <Link to="/research" data-testid="assistant-cta"
                className="mt-8 inline-flex items-center gap-2 rounded-lg border border-[#5139ED]/40 bg-[#5139ED]/15 px-5 py-3 text-[13px] font-bold text-white hover:bg-[#5139ED]/25 transition">
            <Terminal className="h-4 w-4" /> Explore the Assistant <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Right — mock chat terminal */}
        <div className="col-span-12 lg:col-span-7">
          <div className="rounded-xl border border-[#FAFAFF]/10 bg-[#0B0918] overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
            {/* Chrome */}
            <div className="flex items-center gap-2 border-b border-[#FAFAFF]/10 bg-[#12102E]/80 px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-3 font-body text-[11px] uppercase tracking-[0.18em] text-[#E7E7F3]/50">
                phytonet.ai / research
              </span>
            </div>

            {/* Chat body */}
            <div className="space-y-4 p-5 font-body text-[13px] text-[#E7E7F3]">
              {/* User message */}
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#FAFAFF]/10 text-[10px] font-bold uppercase text-[#c4b5fd]">RS</span>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-[#E7E7F3]/50">You</div>
                  <div className="mt-1">Find phytochemicals from <em className="text-[#c4b5fd]">Withania somnifera</em> that target IL-6, then dock the top 3 hits.</div>
                </div>
              </div>

              {/* Assistant plan preview */}
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#5139ED] text-white">
                  <Cpu className="h-3 w-3" />
                </span>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-[#E7E7F3]/50">Assistant · plan preview</div>
                  <div className="mt-2 rounded-lg border border-[#5139ED]/25 bg-[#5139ED]/[0.06] p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#c4b5fd]">Execution plan · 4 steps</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#2BB673]/15 border border-[#2BB673]/30 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-widest text-[#2BB673]">
                        <Zap className="h-2.5 w-2.5" /> ~14 nodes ≈ ₹115
                      </span>
                    </div>
                    <ol className="space-y-1.5 text-[12.5px]">
                      {[
                        ["plant_search",   "Fetch compounds for Withania somnifera",    "free"],
                        ["target_predict", "Predict targets for top 5 hero compounds",  "1n"],
                        ["disease_targets","Filter to IL-6 pathway",                    "1n"],
                        ["docking",        "Dock top 3 compounds × IL-6 receptor",      "9n · 3p"],
                      ].map(([tool, label, cost], i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-[#E7E7F3]/50 tabular-nums text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                          <span className="text-[10px] uppercase tracking-wider text-[#c4b5fd]/70">{tool}</span>
                          <span className="text-[#E7E7F3]/90 flex-1">{label}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${
                            cost === "free"
                              ? "bg-[#2BB673]/15 text-[#2BB673]"
                              : "bg-[#5139ED]/20 text-[#c4b5fd]"
                          }`}>{cost}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* Live progress */}
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#F59E0B]/20 text-[#F59E0B]">
                  <Radio className="h-3 w-3" />
                </span>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-widest text-[#E7E7F3]/50">Running · step 4/4</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12.5px]">
                    <LiveDot color="#F59E0B" />
                    <span>Docking withaferin A × IL-6 receptor · pair 2 of 3 · vina</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#FAFAFF]/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#5139ED] to-[#2BB673] animate-pulse"
                         style={{ width: "72%" }} />
                  </div>
                  <div className="mt-1 flex justify-between text-[10.5px] text-[#E7E7F3]/50">
                    <span>Nodes used: 10 / 14</span>
                    <span>72%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── MODULES BENTO GRID ─────────────────── */
const MODULES = [
  { icon: Beaker,        label: "Plant Database",        to: "/plant-database",      accent: "#2BB673",
    tag: "Free",        desc: "TCMSP + LOTUS + Wikipedia. Compounds, structures, taxonomy, uses." },
  { icon: Atom,          label: "Compound Analysis",     to: "/compound-analysis",   accent: "#c4b5fd",
    tag: "Free",        desc: "Resolve, cluster and inspect any bioactive molecule with property panels." },
  { icon: Target,        label: "Target Prediction",     to: "/target-prediction",   accent: "#8139ED",
    tag: "1 node",      desc: "SEA-style multi-target prediction across UniProt families with confidence bands." },
  { icon: FlaskConical,  label: "ADMET & Druglikeness",  to: "/admet-druglikeness",  accent: "#F59E0B",
    tag: "1 node",      desc: "Absorption, distribution, metabolism, excretion, toxicity — SwissADME + local rules." },
  { icon: Microscope,    label: "Molecular Docking",     to: "/molecular-docking",   accent: "#EC4899",
    tag: "3 nodes/pair",desc: "AutoDock Vina with concurrent batching + AlphaFold fallback for missing PDBs." },
  { icon: Dna,           label: "Disease Targets",       to: "/disease-targets",     accent: "#0EA5E9",
    tag: "1 node",      desc: "DisGeNET + KEGG mapping — take a disease and get its druggable target profile." },
];

function ModulesGrid() {
  return (
    <section data-testid="home-modules" className="relative bg-[#0B0918] py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-12 gap-8 items-end">
          <div className="col-span-12 lg:col-span-6">
            <Kicker>Standalone Modules</Kicker>
            <h2 className="mt-3 font-headline text-[36px] leading-[1.05] tracking-tight text-[#FAFAFF] sm:text-[44px]">
              A complete <span className="text-[#c4b5fd]">computational biology</span> toolkit.
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-6 lg:pl-8">
            <p className="max-w-lg font-body text-[14.5px] leading-relaxed text-[#E7E7F3]/75">
              Prefer to run one step at a time? Every capability is available as a
              focused, standalone page with deep-dive UI, exportable results, and
              per-run pricing. Discovery tools stay free forever.
            </p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border border-[#FAFAFF]/8">
          {MODULES.map((m) => (
            <div key={m.to} data-testid={`module-${m.to.replace(/^\//, "")}`}
                 className="group relative p-7 border-b border-r border-[#FAFAFF]/8 last:border-r-0 bg-[#0F0E24] transition">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition"
                   style={{ background: `radial-gradient(400px circle at 50% 0%, ${m.accent}12, transparent 60%)` }} />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border" style={{ borderColor: `${m.accent}55`, background: `${m.accent}12`, color: m.accent }}>
                    <m.icon className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-[#FAFAFF]/15 bg-[#FAFAFF]/5 px-2 py-0.5 text-[10px] font-body uppercase tracking-widest text-[#E7E7F3]/70">
                    {m.tag}
                  </span>
                </div>
                <h3 className="mt-5 font-headline text-[20px] font-bold text-[#FAFAFF]">{m.label}</h3>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-[#E7E7F3]/70">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── WORKFLOW WALKTHROUGH ─────────────────── */
const WORKFLOW_STEPS = [
  { n: "01", title: "Query", body: "Frame your research question in plain English or pick a preset (e.g. \"Screen Withania somnifera against inflammation targets\")." },
  { n: "02", title: "Plan",  body: "The assistant proposes an executable pipeline with per-step node costs. You approve, tweak, or drill into any step." },
  { n: "03", title: "Run",   body: "Steps stream in parallel: compound resolution → target prediction → ADMET → docking → enrichment. Live progress; retryable failures." },
  { n: "04", title: "Report",body: "A publication-ready scientific report is generated with figures, citations, and a shareable URL. Export to PDF anytime." },
];

function Workflow() {
  return (
    <section data-testid="home-workflow" className="relative bg-[#0F0E24] py-32">
      <div className="mx-auto max-w-7xl px-6 grid grid-cols-12 gap-12">
        <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-24 self-start">
          <Kicker>How PhytoNet AI Works</Kicker>
          <h2 className="mt-3 font-headline text-[36px] leading-[1.05] tracking-tight text-[#FAFAFF] sm:text-[44px]">
            Four steps.<br/><span className="text-[#2BB673]">Zero glue-code.</span>
          </h2>
          <p className="mt-5 font-body text-[14.5px] leading-relaxed text-[#E7E7F3]/75">
            A single workflow, from natural-language brief to shareable report.
            No pipeline plumbing. No format-conversion tax.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-8 space-y-8">
          {WORKFLOW_STEPS.map((s, i) => (
            <motion.div key={s.n}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5, delay: i * 0.05 }}
                        className="relative rounded-lg border border-[#FAFAFF]/10 bg-[#12102E]/60 p-6 lg:p-8">
              <div className="flex items-start gap-6">
                <div className="font-headline text-[44px] font-bold leading-none text-[#5139ED] tabular-nums">{s.n}</div>
                <div>
                  <h3 className="font-headline text-[22px] font-bold text-[#FAFAFF]">{s.title}</h3>
                  <p className="mt-2 font-body text-[14px] leading-relaxed text-[#E7E7F3]/75 max-w-xl">{s.body}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── FAQ ─────────────────────── */
const FAQS = [
  { q: "What is PhytoNet AI, and who is it for?",
    a: "PhytoNet AI is a research intelligence platform for pharmacologists, phytochemists and drug-discovery scientists. It integrates target prediction, ADMET, docking, pathway enrichment and AI-driven scientific reporting into a single natural-language workflow." },
  { q: "How is this different from ChatGPT or generic AI chatbots?",
    a: "The AI Research Assistant plans and executes real network-pharmacology tools (AutoDock Vina, SEA-style prediction, SwissADME, KEGG/DisGeNET) — not a language model hallucinating results. Every step has an audit trail and cited data sources." },
  { q: "What data sources does the platform integrate?",
    a: "TCMSP, LOTUS, ChEMBL, PubChem, KEGG, DisGeNET, AlphaFold, RCSB PDB, Reactome, STRING, UniProt, SwissADME — with more added regularly." },
  { q: "How does the node-based pricing work?",
    a: "You buy nodes as a one-time bundle or subscribe to PhytoNet Pro. Free discovery tools (Plant Database, Disease Search) never charge. Analysis modules cost 1-3 nodes per step. Full transparency — every plan preview shows the exact cost before you run." },
  { q: "Can I export reports for publication?",
    a: "Yes. Every completed workflow generates a shareable scientific report with figures, citations, and metadata. PDF export + shareable-URL are built in; institutional licensing is available for teams." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" data-testid="home-faq"
             className="relative bg-[#0B0918] py-32 border-t border-[#FAFAFF]/8">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <Kicker>FAQ</Kicker>
          <h2 className="mt-3 font-headline text-[36px] leading-[1.05] tracking-tight text-[#FAFAFF] sm:text-[44px]">
            Common questions.
          </h2>
        </div>
        <div className="mt-10 space-y-2">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={i} data-testid={`faq-item-${i}`}
                   className={`rounded-lg border transition ${isOpen ? "border-[#5139ED]/40 bg-[#12102E]" : "border-[#FAFAFF]/10 bg-[#0F0E24]"}`}>
                <button type="button" onClick={() => setOpen(isOpen ? -1 : i)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left">
                  <span className="font-headline text-[15.5px] font-semibold text-[#FAFAFF]">{f.q}</span>
                  <ChevronDown className={`h-4 w-4 flex-shrink-0 text-[#c4b5fd] transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="border-t border-[#FAFAFF]/8 px-5 py-4 font-body text-[13.5px] leading-relaxed text-[#E7E7F3]/80">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── FINAL CTA ─────────────────────── */
function FinalCTA() {
  const { guard } = useAuth();
  const navigate = useNavigate();
  const goApp = () => guard(() => navigate("/app"));
  return (
    <section data-testid="home-final-cta" className="relative overflow-hidden bg-[#0F0E24] py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
           style={{ backgroundImage:
             "radial-gradient(circle at 20% 30%, #5139ED 0px, transparent 30%), radial-gradient(circle at 80% 70%, #2BB673 0px, transparent 25%)" }} />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <Kicker className="text-center">Ready to begin</Kicker>
        <h2 className="mt-4 font-headline text-[44px] leading-[0.98] tracking-[-0.02em] text-[#FAFAFF] sm:text-[68px] lg:text-[92px]">
          Accelerate your <br/>
          <span className="bg-gradient-to-r from-[#c4b5fd] via-[#8139ED] to-[#5139ED] bg-clip-text text-transparent">
            drug discovery pipeline.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl font-body text-[15px] leading-relaxed text-[#E7E7F3]/80">
          Start with 10 free nodes. No credit card. Cancel anytime. The complete
          network-pharmacology stack, in a single research-grade workspace.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button type="button" data-testid="final-cta-start" onClick={goApp}
                  className="group inline-flex items-center gap-2 rounded-lg bg-[#5139ED] px-6 py-4 text-[14px] font-bold text-white hover:bg-[#4128d4] hover:-translate-y-0.5 transition">
            Start Researching <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
          <Link to="/research" data-testid="final-cta-assistant"
                className="inline-flex items-center gap-2 rounded-lg border border-[#FAFAFF]/15 bg-[#FAFAFF]/[0.04] px-6 py-4 text-[14px] font-semibold text-[#FAFAFF] hover:bg-[#FAFAFF]/[0.08] transition">
            <Terminal className="h-4 w-4" /> Try the AI Assistant
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── PAGE ─────────────────────── */
export default function Home() {
  const { hash } = useLocation();

  useEffect(() => {
    document.title = "PhytoNet AI | Research Intelligence for Drug Discovery";
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content",
      "PhytoNet AI is the natural-language research intelligence platform for pharmacologists and drug-discovery scientists — network pharmacology, target prediction, ADMET, docking and AI-generated scientific reports.");
  }, []);

  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); return; }
    const id = hash.replace(/^#/, "");
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (++tries < 20) setTimeout(tick, 80);
    };
    const t = setTimeout(tick, 60);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <main data-testid="home-page" className="relative bg-[#0F0E24] overflow-hidden">
      <Hero />
      <TrustBand />
      <AssistantShowcase />
      <ModulesGrid />
      <Workflow />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
