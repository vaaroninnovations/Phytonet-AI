// PhytoNet AI — Premium homepage.
// Full rewrite (Iter 21). Sections: Hero · Stats · Features · Workflow · Why ·
// Screenshot · Plant Preview · Modules · How It Works · Trust · Testimonials ·
// FAQ · Final CTA. Design: minimal white background, Manrope headlines,
// Plus Jakarta Sans body, soft gradients + glassmorphism only where appropriate.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, Check, ChevronRight, ChevronDown,
  Sparkles, ShieldCheck, GitBranch, Layers, Atom, Dna, Network,
  Search, FlaskConical, FileText, Video, Image as ImageIcon, Beaker,
  Microscope, Brain, Zap, BookOpen, Github, Linkedin, Twitter,
  Play, Leaf, Cpu, Activity, Database, Workflow, Star, Quote,
} from "lucide-react";
import HeroVisual from "@/components/HeroVisual";
import BrandLogo from "@/components/BrandLogo";
import { useAuth } from "@/context/AuthContext";

/* ────────────────────────────── HERO ────────────────────────────── */
function Hero() {
  const { openModal, user } = useAuth();
  return (
    <section data-testid="hero" className="relative overflow-hidden pt-16 pb-24 lg:pt-24">
      {/* Blurred colour orbs */}
      <div aria-hidden className="brand-blur absolute -left-40 top-0 h-[420px] w-[420px] bg-[#5139ED]" />
      <div aria-hidden className="brand-blur absolute -right-32 top-40 h-[380px] w-[380px] bg-[#2BB673]" />

      {/* Dot grid background */}
      <div aria-hidden className="absolute inset-0 dot-grid opacity-[0.35]"
           style={{ maskImage: "radial-gradient(ellipse at center, black 35%, transparent 78%)",
                    WebkitMaskImage: "radial-gradient(ellipse at center, black 35%, transparent 78%)" }} />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/70 px-3.5 py-1.5 text-[11px] font-semibold text-[#374151] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[#5139ED]" />
            Explainable AI for computational pharmacology
          </span>

          <h1 className="font-headline mt-6 text-[44px] leading-[1.05] tracking-[-0.03em] text-[#111827] sm:text-[56px] lg:text-[64px]">
            <span className="gradient-text">AI Scientist</span> for<br/>
            Medicinal Plant<br/>
            Drug Discovery
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#374151] sm:text-[17px]">
            Transform medicinal plant research into reproducible discoveries using explainable AI,
            network pharmacology, cheminformatics, molecular biology, and automated scientific workflows.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/phytonet-ai"
              data-testid="hero-primary-cta"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(81,57,237,0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-12px_rgba(81,57,237,0.85)]"
            >
              Start Research
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/phytonet-ai"
              data-testid="hero-secondary-cta"
              className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/70 px-6 py-3.5 text-[14px] font-semibold text-[#111827] backdrop-blur transition-all hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              Explore Plant Database
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-3 text-[12.5px] font-semibold text-[#374151] sm:grid-cols-4">
            {["Explainable AI", "Network Pharmacology", "Reproducible Science", "Commercial Friendly"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-[#2BB673]/12 text-[#2BB673]">
                  <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

/* ─────────────── RESEARCH MODULES (below Hero) ─────────────── */
const RESEARCH_MODULES = [
  {
    id: "ai-agent",
    title: "PhytoNet AI Agent",
    desc: "Full end-to-end workflow — from plant selection through docking to a publication-ready AI report.",
    cta: "Launch AI Workflow",
    to: "/phytonet-ai",
    icon: Sparkles,
    tint: "#5139ED",
    accent: "from-[#5139ED]/12 to-[#8139ED]/6",
    flagship: true,
  },
  {
    id: "plant-database",
    title: "Plant Database",
    desc: "Search 12,000+ medicinal plants with taxonomy, traditional uses, and phytochemistry.",
    cta: "Explore Database",
    to: "/plant-database",
    icon: Leaf,
    tint: "#2BB673",
    accent: "from-[#2BB673]/12 to-[#2BB673]/4",
  },
  {
    id: "compound-target",
    title: "Compound Target Prediction",
    desc: "Predict likely macromolecular targets from a SMILES — ensembled scores across 250 M+ associations.",
    cta: "Predict Targets",
    to: "/compound-target-prediction",
    icon: Atom,
    tint: "#0EA5E9",
    accent: "from-[#0EA5E9]/12 to-[#0EA5E9]/4",
  },
  {
    id: "disease-target",
    title: "Disease Target Prediction",
    desc: "Rank disease-associated genes with DisGeNET + Open Targets evidence and confidence tiers.",
    cta: "Explore Disease Targets",
    to: "/disease-target-prediction",
    icon: Dna,
    tint: "#F97316",
    accent: "from-[#F97316]/10 to-[#F97316]/4",
  },
  {
    id: "admet",
    title: "ADMET Prediction",
    desc: "Absorption, distribution, metabolism, excretion & toxicity endpoints from a single SMILES or batch.",
    cta: "Predict ADMET",
    to: "/admet",
    icon: FlaskConical,
    tint: "#8139ED",
    accent: "from-[#8139ED]/12 to-[#8139ED]/4",
  },
  {
    id: "drug-likeness",
    title: "Drug-Likeness Prediction",
    desc: "Lipinski, Veber, PAINS & bioavailability filters with a transparent composite score.",
    cta: "Evaluate Drug-Likeness",
    to: "/drug-likeness",
    icon: Beaker,
    tint: "#EAB308",
    accent: "from-[#EAB308]/10 to-[#EAB308]/4",
  },
  {
    id: "databases",
    title: "Databases",
    desc: "Central index of every biological, chemical and pharmacological source we integrate.",
    cta: "Browse Databases",
    to: "/databases",
    icon: Database,
    tint: "#0F172A",
    accent: "from-[#0F172A]/8 to-[#0F172A]/3",
  },
];

function ResearchModuleCard({ mod, index }) {
  const Icon = mod.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-all hover:border-[${mod.tint}]/30 hover:shadow-[0_28px_60px_-24px_rgba(15,23,42,0.18)] ${mod.flagship ? "sm:col-span-2 lg:col-span-2" : ""}`}
      data-testid={`module-card-${mod.id}`}
    >
      {/* soft glow */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br ${mod.accent} blur-2xl transition-opacity duration-500 group-hover:opacity-100`}
        style={{ opacity: 0.6 }}
      />
      {mod.flagship && (
        <span className="absolute right-5 top-5 rounded-full border border-[#5139ED]/25 bg-[#5139ED]/8 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#5139ED]">
          Flagship
        </span>
      )}

      <div className="relative flex items-center gap-3">
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-105"
          style={{
            backgroundColor: `${mod.tint}14`,
            color: mod.tint,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-headline text-[17px] font-bold tracking-tight text-[#111827]">
          {mod.title}
        </h3>
      </div>

      <p className="relative mt-4 text-[13.5px] leading-relaxed text-[#4B5563]">{mod.desc}</p>

      <div className="relative mt-6 flex items-end justify-between">
        <Link
          to={mod.to}
          data-testid={`module-cta-${mod.id}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold text-white shadow-[0_10px_24px_-14px_rgba(15,23,42,0.4)] transition-transform hover:-translate-y-0.5"
          style={{ backgroundColor: mod.tint }}
        >
          {mod.cta}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
          Standalone
        </span>
      </div>
    </motion.div>
  );
}

function ResearchModules() {
  return (
    <section
      id="research-modules"
      data-testid="research-modules"
      className="relative overflow-hidden border-t border-[#E7E7F3] bg-gradient-to-b from-white via-[#FAF9FF] to-white py-20"
    >
      <div aria-hidden className="brand-blur absolute -left-24 top-10 h-[360px] w-[360px] bg-[#5139ED] opacity-40" />
      <div aria-hidden className="brand-blur absolute -right-24 bottom-10 h-[320px] w-[320px] bg-[#2BB673] opacity-40" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5139ED] backdrop-blur">
              <Layers className="h-3.5 w-3.5" />
              Research Modules
            </span>
            <h2 className="font-headline mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[#111827] sm:text-[40px]">
              Every capability, <span className="gradient-text">available on its own</span>.
            </h2>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#4B5563]">
              Launch the complete AI workflow — or jump straight into any single module. Same
              components, same backend, no duplication.
            </p>
          </div>
          <Link
            to="/phytonet-ai"
            data-testid="research-modules-run-all"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white/70 px-4 py-2.5 text-[13px] font-semibold text-[#111827] backdrop-blur transition hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            Run the full workflow <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {RESEARCH_MODULES.map((mod, i) => (
            <ResearchModuleCard key={mod.id} mod={mod} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── STATS ─────────────────────────── */
function AnimatedCounter({ end, suffix = "", duration = 1.8, format = (v) => Math.round(v).toLocaleString() }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const startTs = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - startTs) / (duration * 1000));
      setVal(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration]);
  return <span ref={ref}>{format(val)}{suffix}</span>;
}

function Stats() {
  const items = [
    { label: "Medicinal Plants",       end: 12000,      suffix: "+", format: (v) => Math.round(v).toLocaleString() },
    { label: "Natural Compounds",      end: 1.8,        suffix: "M+", format: (v) => v.toFixed(1) },
    { label: "Target Associations",    end: 250,        suffix: "M+", format: (v) => Math.round(v).toLocaleString() },
    { label: "Integrated Databases",   end: 400,        suffix: "+",  format: (v) => Math.round(v).toLocaleString() },
  ];
  return (
    <section data-testid="stats" className="border-y border-[#E7E7F3] bg-white/60 py-14 backdrop-blur-sm">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
        {items.map((s, i) => (
          <motion.div key={s.label}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="text-center md:text-left"
          >
            <p className="font-headline text-[32px] tracking-tight text-[#111827] sm:text-[40px]">
              <AnimatedCounter end={s.end} suffix={s.suffix} format={s.format} />
            </p>
            <p className="mt-1 text-[12px] font-semibold uppercase tracking-widest text-[#6B7280]">{s.label}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── FEATURES ─────────────────────────── */
const FEATURES = [
  { icon: Beaker,       title: "Compound Extraction",         body: "Extract phytochemicals from IMPPAT, LOTUS & PubChem in parallel." },
  { icon: Dna,          title: "Target Prediction",           body: "Predict protein targets via ligand similarity + bioactivity mining." },
  { icon: Microscope,   title: "Disease Target Mining",       body: "Aggregate Open Targets, CTD, NCBI Gene & UniProt annotations." },
  { icon: Network,      title: "Network Pharmacology",        body: "Auto-generate Plant-Compound-Target-Disease-Pathway networks." },
  { icon: Layers,       title: "GO & KEGG Enrichment",        body: "g:Profiler + Enrichr KEGG_2021_Human with publication figures." },
  { icon: Activity,     title: "Protein Interaction Networks",body: "Interactive STRING PPI with CytoHubba (10 hub-scoring metrics)." },
  { icon: Atom,         title: "Molecular Docking",           body: "AutoDock Vina + Meeko + OpenBabel across compound×target grid." },
  { icon: ShieldCheck,  title: "ADMET Prediction",            body: "Drug-likeness, ADME and toxicity scored with medicinal-chem rules." },
  { icon: FileText,     title: "AI Report Writer",            body: "Claude-generated IMRAD manuscripts exported as MD/PDF/DOCX." },
];
function Features() {
  return (
    <section id="features" data-testid="features" className="relative py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Platform</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            Everything you need for AI-powered<br className="hidden md:block" /> network pharmacology
          </h2>
          <p className="mt-4 max-w-xl text-[15px] text-[#374151]">
            Twelve first-class research modules — from phytochemical extraction to a Nature-style
            graphical abstract — orchestrated by a single explainable AI scientist.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.06 }}
              className="group relative overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white p-6 transition-all hover:-translate-y-1 hover:border-transparent hover:shadow-[0_20px_60px_-25px_rgba(81,57,237,0.4)]"
            >
              {/* Gradient border on hover */}
              <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{ padding: 1, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }} />
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#5139ED]/10 via-[#395AED]/8 to-[#8139ED]/10 text-[#5139ED] transition-all group-hover:from-[#5139ED] group-hover:via-[#395AED] group-hover:to-[#8139ED] group-hover:text-white">
                <f.icon className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <h3 className="font-headline mt-5 text-[17px] font-extrabold text-[#111827]">{f.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7280]">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── WORKFLOW TIMELINE ─────────────────────────── */
const WORKFLOW = [
  "Ask Research Question",
  "Collect Plant Data",
  "Predict Targets",
  "Disease Intersection",
  "PPI Network",
  "GO / KEGG",
  "Interpret Results",
  "Generate Figures",
  "Write Manuscript",
];
function WorkflowTimeline() {
  return (
    <section id="workflow" data-testid="workflow-timeline" className="relative bg-[#F8FAFC] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">The AI Scientist</p>
            <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
              A single AI orchestrates your entire workflow
            </h2>
          </div>
          <p className="max-w-md text-[14px] text-[#374151]">
            Every step is transparent, evidence-linked and reproducible. Data flows automatically from
            each step to the next — no manual exports.
          </p>
        </div>

        <div className="relative mt-14 overflow-x-auto">
          <div className="absolute left-8 right-8 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-[#5139ED]/30 to-transparent lg:block" />
          <ol className="relative flex min-w-full gap-4 lg:justify-between">
            {WORKFLOW.map((step, i) => (
              <motion.li key={step}
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="relative flex min-w-[140px] flex-col items-center text-center"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full border border-[#E7E7F3] bg-white text-[13px] font-extrabold text-[#5139ED] shadow-[0_6px_20px_-8px_rgba(81,57,237,0.35)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-3 max-w-[130px] text-[12.5px] font-semibold text-[#111827]">{step}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── WHY PHYTONET ─────────────────────────── */
function Why() {
  const cards = [
    { icon: Brain,      title: "Explainable AI",       body: "Every prediction ships with provenance, evidence and a linkable citation. No black boxes." },
    { icon: GitBranch,  title: "Reproducible Science", body: "One-click snapshot every workflow. Autosaved sessions restore compound tables, docking scores and figures." },
    { icon: Cpu,        title: "Integrated Platform",  body: "One canvas replaces a dozen tools — cheminformatics, PPI, docking, GROMACS, manuscript writing." },
  ];
  return (
    <section id="why" data-testid="why" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Why PhytoNet AI</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            Built for scientists who care about rigor
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map((c, i) => (
            <motion.div key={c.title}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="rounded-3xl border border-[#E7E7F3] bg-gradient-to-br from-white to-[#F8FAFC] p-8 shadow-[0_1px_2px_rgba(11,11,24,0.03)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#5139ED]/10 to-[#8139ED]/10 text-[#5139ED]">
                <c.icon className="h-5 w-5" strokeWidth={2.4} />
              </span>
              <h3 className="font-headline mt-6 text-[20px] text-[#111827]">{c.title}</h3>
              <p className="mt-3 text-[14px] leading-relaxed text-[#374151]">{c.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── SCREENSHOT / DASHBOARD PREVIEW ─────────────────────────── */
function ScreenshotSection() {
  const floats = [
    { top: "-6%",  left: "-4%",  label: "Compound",         value: "Curcumin",   pct: "MW 368.4", tone: "#5139ED" },
    { top: "-6%",  right: "-4%", label: "Protein",          value: "AKT1",       pct: "★ 5.0",    tone: "#395AED" },
    { top: "42%",  left: "-8%",  label: "Network",          value: "412 edges",  pct: "STRING 900", tone: "#8139ED" },
    { top: "42%",  right: "-8%", label: "Enrichment",       value: "PI3K/AKT",   pct: "p 1e-17",  tone: "#2BB673" },
    { bottom:"-6%",left: "-4%",  label: "Docking Score",    value: "−9.2 kcal",  pct: "Vina 1.2", tone: "#5139ED" },
    { bottom:"-6%",right:"-4%",  label: "Graphical Abstract",value:"Ready",      pct: "Nature",   tone: "#8139ED" },
  ];
  return (
    <section id="dashboard" data-testid="screenshot" className="relative overflow-hidden py-24">
      <div aria-hidden className="brand-blur absolute left-1/4 top-10 h-[280px] w-[280px] bg-[#395AED]" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Dashboard</p>
          <h2 className="font-headline mx-auto mt-3 max-w-3xl text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            A single workspace for every insight
          </h2>
        </div>

        <div className="relative mx-auto mt-16 max-w-[960px]">
          {/* Browser mockup */}
          <div className="relative overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white shadow-[0_40px_80px_-30px_rgba(11,11,24,0.25)]">
            <div className="flex items-center gap-2 border-b border-[#E7E7F3] bg-[#F8FAFC] px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
              <div className="ml-4 flex-1">
                <div className="mx-auto max-w-md rounded-full border border-[#E7E7F3] bg-white px-4 py-1 text-[11px] font-mono text-[#6B7280]">
                  phytonet.ai / workspace / curcuma-longa × t2dm
                </div>
              </div>
            </div>
            <div className="relative aspect-[16/9] bg-white p-6">
              {/* Fake dashboard content — pure SVG */}
              <div className="grid h-full grid-cols-3 gap-4">
                {["Compound × Target", "Hub Scoring", "KEGG Enrichment"].map((title, i) => (
                  <div key={title} className="flex flex-col overflow-hidden rounded-2xl border border-[#E7E7F3]">
                    <div className="border-b border-[#F1F1FA] bg-[#F8FAFC] px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">{title}</p>
                    </div>
                    <div className="flex-1 p-3">
                      {i === 0 && <MiniHeatmap />}
                      {i === 1 && <MiniBars />}
                      {i === 2 && <MiniBubbles />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Floating UI cards */}
          {floats.map((f) => (
            <motion.div key={f.label}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="absolute z-10 hidden w-40 rounded-2xl border border-[#E7E7F3] bg-white/95 p-3 shadow-[0_18px_40px_-14px_rgba(11,11,24,0.25)] backdrop-blur md:block"
              style={{ top: f.top, left: f.left, right: f.right, bottom: f.bottom }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: f.tone }} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B7280]">{f.label}</p>
              </div>
              <p className="mt-1 font-headline text-[15px] font-extrabold text-[#111827]">{f.value}</p>
              <p className="text-[10px] text-[#6B7280]">{f.pct}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
function MiniHeatmap() {
  const cols = 8, rows = 5;
  return (
    <div className="grid h-full gap-0.5" style={{ gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)` }}>
      {Array.from({ length: cols * rows }).map((_, i) => {
        const v = (Math.sin(i * 1.3) + 1) / 2;
        return <div key={i} className="rounded-[2px]" style={{ background: `rgba(81,57,237,${0.1 + v * 0.7})` }} />;
      })}
    </div>
  );
}
function MiniBars() {
  const heights = [55, 82, 68, 91, 48, 76, 60, 88];
  return (
    <div className="flex h-full items-end gap-1.5">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-[#5139ED] via-[#395AED] to-[#8139ED]" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
function MiniBubbles() {
  const b = [
    { x: 20, y: 60, r: 14, c: "#5139ED" }, { x: 45, y: 40, r: 22, c: "#8139ED" },
    { x: 70, y: 55, r: 10, c: "#395AED" }, { x: 55, y: 75, r: 16, c: "#2BB673" },
    { x: 30, y: 30, r: 8,  c: "#8139ED" },
  ];
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full">
      {b.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} opacity="0.55" />)}
    </svg>
  );
}

/* ─────────────────────────── PLANT DATABASE PREVIEW ─────────────────────────── */
const PLANTS = [
  { name: "Ashwagandha",         latin: "Withania somnifera",    compounds: 342, targets: 1290, diseases: 45,  color: "#5139ED" },
  { name: "Terminalia arjuna",   latin: "Terminalia arjuna",     compounds: 214, targets:  980, diseases: 32,  color: "#395AED" },
  { name: "Tinospora cordifolia",latin: "Tinospora cordifolia",  compounds: 176, targets:  742, diseases: 28,  color: "#8139ED" },
  { name: "Withania somnifera",  latin: "Withania somnifera",    compounds: 388, targets: 1410, diseases: 51,  color: "#2BB673" },
  { name: "Lycopodium clavatum", latin: "Lycopodium clavatum",   compounds:  92, targets:  312, diseases: 18,  color: "#5139ED" },
];
function PlantPreview() {
  return (
    <section id="plant-preview" data-testid="plant-preview" className="relative bg-[#F8FAFC] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Plant Database</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            17,000+ medicinal plants, one query away
          </h2>
        </div>

        <div className="mx-auto mt-10 max-w-2xl">
          <div className="flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white p-1.5 shadow-[0_6px_24px_-10px_rgba(11,11,24,0.1)]">
            <div className="pl-3 text-[#9CA3AF]"><Search className="h-4 w-4" /></div>
            <input
              data-testid="plant-search-input" type="text" placeholder="Search medicinal plants…"
              className="flex-1 border-none bg-transparent px-2 py-2 text-[14px] text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none"
            />
            <Link to="/phytonet-ai" data-testid="plant-search-go"
                  className="inline-flex items-center gap-1 rounded-full bg-[#5139ED] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#4127c9]">
              Search<ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {PLANTS.map((p, i) => (
            <motion.div key={p.name}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="group rounded-3xl border border-[#E7E7F3] bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(81,57,237,0.35)]"
            >
              <div className="grid h-24 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg, ${p.color}22, ${p.color}08)` }}>
                <Leaf className="h-9 w-9" style={{ color: p.color }} strokeWidth={1.8} />
              </div>
              <h3 className="font-headline mt-4 text-[15px] text-[#111827]">{p.name}</h3>
              <p className="mt-0.5 font-mono text-[10.5px] italic text-[#6B7280]">{p.latin}</p>
              <div className="mt-4 grid grid-cols-3 gap-1 text-center">
                {[{ v: p.compounds, l: "Cpd" }, { v: p.targets, l: "Tgt" }, { v: p.diseases, l: "Dis" }].map((s) => (
                  <div key={s.l} className="rounded-lg bg-[#F8FAFC] py-1.5">
                    <p className="font-headline text-[13px] font-extrabold text-[#111827]">{s.v}</p>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[#9CA3AF]">{s.l}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── AI ASSISTANT HERO ─────────────────────────── */
function AssistantHero() {
  return (
    <section id="assistant" data-testid="assistant-hero" className="relative isolate overflow-hidden py-24">
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED]" />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-6 lg:grid-cols-2">
        <div className="text-white">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> New · One-Click Analysis
          </span>
          <h2 className="font-headline mt-4 text-[36px] leading-[1.05] tracking-tight sm:text-[48px]">
            Meet the PhytoNet AI Assistant
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/90">
            Skip the module-by-module workflow. Enter a plant and a disease — the Assistant runs the
            entire pipeline (compounds → targets → PPI → enrichment → docking → manuscript) and delivers
            a publication-ready PDF automatically.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#2BB673] px-3 py-1.5 text-[12px] font-extrabold text-white">
            🎁 Free One-Time Use
          </div>
          <p className="mt-3 max-w-lg text-[12.5px] text-white/80">
            Every registered user receives one complimentary Assistant run. Additional runs will be
            enabled through subscription plans soon.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link data-testid="assistant-launch" to="/ai-assistant"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[14px] font-extrabold text-[#5139ED] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)] hover:-translate-y-0.5">
              Launch AI Assistant<ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#assistant-compare" className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-[14px] font-semibold text-white backdrop-blur hover:bg-white/20">
              Compare with Agent
            </a>
          </div>
        </div>
        <div className="relative">
          <div className="mx-auto max-w-md rounded-3xl border border-white/20 bg-white/10 p-6 backdrop-blur-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Input</p>
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[12px] text-white">
                Plant · <span className="font-mono">Withania somnifera</span>
              </div>
              <div className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[12px] text-white">
                Disease · <span className="font-mono">Type 2 Diabetes</span>
              </div>
            </div>
            <div className="my-4 border-t border-white/20" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Auto-generated</p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-white">
              {["Phytochemical extraction", "ADMET screening", "Target prediction", "Disease intersection",
                "PPI + hub scoring", "GO / KEGG enrichment", "Publication manuscript"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="h-3 w-3 text-[#2BB673]" strokeWidth={3.5} />{t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── AGENT vs ASSISTANT ─────────────────────────── */
function AgentVsAssistant() {
  const rows = [
    ["Workflow",             "Module-by-module",         "Fully automated"],
    ["User Input",           "Multiple selections",      "Plant + Disease + LC-MS (optional)"],
    ["Customization",        "Full manual control",      "Publication-ready defaults"],
    ["Report Generation",    "Manual",                    "Automatic"],
    ["Figure Interpretation","Optional",                  "Automatic"],
    ["Publication PDF",      "Manual export",             "Generated automatically"],
    ["Intended Users",       "Advanced researchers",     "Beginners, clinicians, rapid analysis"],
  ];
  return (
    <section id="assistant-compare" data-testid="assistant-compare" className="py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Two ways to work</p>
          <h2 className="font-headline mt-3 text-[32px] leading-[1.08] tracking-tight text-[#111827] sm:text-[40px]">
            PhytoNet AI Agent vs Assistant
          </h2>
        </div>
        <div className="mt-10 overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white">
          <div className="grid grid-cols-3 border-b border-[#E7E7F3] bg-[#FAFAFF]">
            <div className="p-5 text-[11px] font-bold uppercase tracking-widest text-[#6B7280]">Feature</div>
            <div className="p-5 text-[13px] font-extrabold text-[#0B0B18]">PhytoNet AI Agent</div>
            <div className="p-5 text-[13px] font-extrabold text-[#5139ED]">PhytoNet AI Assistant</div>
          </div>
          {rows.map(([f, a, b]) => (
            <div key={f} className="grid grid-cols-3 border-b border-[#F1F1FA] last:border-0">
              <div className="p-5 text-[13px] font-semibold text-[#0B0B18]">{f}</div>
              <div className="p-5 text-[13px] text-[#374151]">{a}</div>
              <div className="p-5 text-[13px] font-semibold text-[#5139ED]">{b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── HOW IT WORKS ─────────────────────────── */
function HowItWorks() {
  const steps = [
    { n: "01", title: "Choose a medicinal plant", body: "Pick from 17,000+ plants or upload your LC-MS data." },
    { n: "02", title: "AI builds research workflow", body: "Explainable agents plan every downstream step." },
    { n: "03", title: "Runs every analysis",         body: "Targets, disease intersection, PPI, enrichment, docking, MD." },
    { n: "04", title: "Publication-ready outputs",   body: "Manuscript, graphical abstract, figures — all exportable." },
  ];
  return (
    <section id="how" data-testid="how-it-works" className="relative overflow-hidden py-24">
      <div aria-hidden className="brand-blur absolute right-0 top-40 h-[300px] w-[300px] bg-[#8139ED]" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">How It Works</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            From plant to publication in four steps
          </h2>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div key={s.n}
              initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className="rounded-3xl border border-[#E7E7F3] bg-white p-7"
            >
              <span className="font-headline text-[42px] font-extrabold text-transparent" style={{ WebkitTextStroke: "1.5px #5139ED" }}>{s.n}</span>
              <h3 className="font-headline mt-4 text-[19px] text-[#111827]">{s.title}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B7280]">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── TRUST ─────────────────────────── */
function Trust() {
  const groups = ["Academic Researchers", "Universities", "Drug Discovery Teams", "Biotech Startups"];
  const logos = ["Aster", "Helix Bio", "MolLab", "Nord Sci", "Vertex Rx", "Prism", "Kepler", "Aurora"];
  return (
    <section data-testid="trust" className="border-y border-[#E7E7F3] bg-white py-14">
      <div className="mx-auto max-w-7xl px-6 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#6B7280]">
          Trusted by {groups.join(" · ")}
        </p>
        <div className="mt-8 grid grid-cols-2 items-center gap-6 sm:grid-cols-4 lg:grid-cols-8">
          {logos.map((n) => (
            <div key={n} className="opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0">
              <div className="font-headline text-[15px] font-extrabold tracking-tight text-[#374151]">
                {n}<span className="text-[#5139ED]">.</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── TESTIMONIALS ─────────────────────────── */
const TESTIMONIALS = [
  { name: "Dr. Priya Menon",     inst: "IISc Bengaluru · Computational Biology", initials: "PM",
    body: "PhytoNet AI collapsed a 4-week manual pipeline into one afternoon. The provenance trail alone is worth the switch." },
  { name: "Prof. Marc Wallach",  inst: "ETH Zürich · Systems Pharmacology",      initials: "MW",
    body: "Best AI-generated methods sections I've seen. Every claim is linked to a real dataset — that's rare." },
  { name: "Dr. Yuki Tanaka",     inst: "Osaka Uni · Drug Discovery",             initials: "YT",
    body: "The docking priority matrix combined with hub scoring is a genuinely new way to triage compounds." },
];
function Testimonials() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((v) => (v + 1) % TESTIMONIALS.length), 6000);
    return () => clearInterval(t);
  }, []);
  return (
    <section data-testid="testimonials" className="bg-[#F8FAFC] py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Testimonials</p>
        <h2 className="font-headline mt-3 text-[32px] leading-[1.08] tracking-tight text-[#111827] sm:text-[40px]">
          Loved by working scientists
        </h2>

        <div className="relative mt-10 overflow-hidden">
          <motion.div className="flex" animate={{ x: `${-idx * 100}%` }} transition={{ duration: 0.6, ease: "easeInOut" }}>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="w-full shrink-0 px-2">
                <div className="mx-auto max-w-2xl rounded-3xl border border-[#E7E7F3] bg-white p-9 text-left shadow-[0_20px_50px_-20px_rgba(11,11,24,0.15)]">
                  <Quote className="h-6 w-6 text-[#5139ED]/40" />
                  <p className="mt-4 text-[17px] leading-relaxed text-[#111827]">"{t.body}"</p>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#5139ED] to-[#8139ED] text-[13px] font-bold text-white">{t.initials}</span>
                    <div>
                      <p className="font-headline text-[13.5px] font-extrabold text-[#111827]">{t.name}</p>
                      <p className="text-[11.5px] text-[#6B7280]">{t.inst}</p>
                    </div>
                    <div className="ml-auto flex text-[#F5B301]">{[0,1,2,3,4].map(i => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}</div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
          <div className="mt-6 flex justify-center gap-1.5">
            {TESTIMONIALS.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} aria-label={`Show testimonial ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-[#5139ED]" : "w-1.5 bg-[#D5D5E8]"}`} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */
const FAQS = [
  { q: "Is PhytoNet AI free to use?",
    a: "Yes — the platform is publicly accessible for exploration. An account (free) is required only for saving projects and downloading exports." },
  { q: "Which databases do you integrate?",
    a: "IMPPAT, LOTUS, PubChem, ChEMBL, BindingDB, UniProt, Open Targets, CTD, NCBI Gene, STRING, KEGG, g:Profiler, and Enrichr — all queried live, no static snapshots." },
  { q: "How is the AI explainable?",
    a: "Every prediction ships with provenance: source database, evidence type, similarity metric or p-value. The AI Scientist Report cites methods and numbers directly." },
  { q: "Can I run molecular dynamics on my HPC?",
    a: "Yes. The MD module now generates environment-specific packages for local machines, SLURM HPC clusters, and cloud GPU instances (AWS/Azure/GCP/RunPod/Lambda specs)." },
  { q: "Is my data private?",
    a: "Yes. Project data is scoped to your account. We never share workflow_state, compound tables or manuscripts with third parties." },
];
function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" data-testid="faq" className="py-24">
      <div className="mx-auto max-w-3xl px-6">
        <p className="font-body text-center text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">FAQ</p>
        <h2 className="font-headline mt-3 text-center text-[32px] leading-[1.08] tracking-tight text-[#111827] sm:text-[40px]">
          Frequently asked questions
        </h2>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <div key={f.q} className="overflow-hidden rounded-2xl border border-[#E7E7F3] bg-white">
              <button
                data-testid={`faq-${i}`}
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
              >
                <span className="font-headline text-[15px] font-extrabold text-[#111827]">{f.q}</span>
                <ChevronDown className={`h-4 w-4 text-[#5139ED] transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              <motion.div
                initial={false}
                animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }}
                className="overflow-hidden"
              >
                <p className="px-6 pb-5 text-[14px] leading-relaxed text-[#374151]">{f.a}</p>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── FINAL CTA ─────────────────────────── */
function FinalCTA() {
  return (
    <section data-testid="final-cta" className="relative isolate overflow-hidden py-24">
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED]" />
      <div aria-hidden className="absolute inset-0 -z-10 opacity-30 dot-grid" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)" }} />
      <div className="mx-auto max-w-4xl px-6 text-center text-white">
        <h2 className="font-headline text-[36px] leading-[1.06] tracking-tight sm:text-[52px]">
          Ready to accelerate your research?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-white/85">
          Start building AI-powered medicinal plant discoveries today. No credit card required.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link data-testid="final-cta-start" to="/phytonet-ai"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[14px] font-extrabold text-[#5139ED] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)] hover:-translate-y-0.5">
            Start Research<ArrowRight className="h-4 w-4" />
          </Link>
          <a data-testid="final-cta-docs" href="#faq"
             className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3.5 text-[14px] font-semibold text-white backdrop-blur hover:bg-white/20">
            View Documentation
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── PAGE ─────────────────────────── */
export default function Home() {
  useEffect(() => {
    document.title = "PhytoNet AI | AI Scientist for Medicinal Plant Drug Discovery";
    // meta description
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
    m.setAttribute("content",
      "AI-powered medicinal plant research platform integrating network pharmacology, target prediction, cheminformatics, enrichment analysis, AI manuscript generation, graphical abstracts, and scientific workflows.");
  }, []);

  return (
    <main data-testid="home-page" className="relative overflow-hidden bg-white">
      <Hero />
      <ResearchModules />
      <AssistantHero />
      <AgentVsAssistant />
      <Stats />
      <Features />
      <WorkflowTimeline />
      <Why />
      <ScreenshotSection />
      <PlantPreview />
      <HowItWorks />
      <Trust />
      <Testimonials />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
