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
  Play, PlayCircle, Leaf, Cpu, Activity, Database, Workflow, Star, Quote,
  Target, HeartPulse, Waves,
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
            Medicinal Plant Research<br/>
            &amp; Drug Discovery
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-[#374151] sm:text-[17px]">
            Transform LC-MS data into biological insights with AI. Identify phytochemicals, predict
            protein targets, analyze disease pathways, perform molecular docking, and generate
            publication-ready reports—all in one integrated platform.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/phytonet-ai"
              data-testid="hero-primary-cta"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(81,57,237,0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_22px_48px_-12px_rgba(81,57,237,0.85)]"
            >
              Start Free Analysis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how"
              data-testid="hero-secondary-cta"
              className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/70 px-6 py-3.5 text-[14px] font-semibold text-[#111827] backdrop-blur transition-all hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              <PlayCircle className="h-4 w-4" />
              Watch Demo
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] font-semibold text-[#374151]">
            {["No coding required", "Cloud-based", "Publication-ready"].map((t) => (
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

/* ─────────────────────────── WHY CHOOSE PHYTONET AI ─────────────────────────── */
const TRADITIONAL_PAIN = [
  "Multiple disconnected software",
  "Manual data transfer",
  "Separate scientific databases",
  "Repeated file conversion",
  "Manual result interpretation",
  "Time-consuming repeat analyses",
  "Difficult to reproduce",
  "Weeks of work",
];

const PHYTONET_STEPS = [
  { icon: Activity,      label: "Upload LC-MS Data",       desc: "Drag-and-drop or paste; auto-parses mzML, CSV & Excel.",         tone: "#5139ED" },
  { icon: FlaskConical,  label: "Identify Compounds",      desc: "PubChem & LOTUS resolution with SMILES, InChI, structure.",     tone: "#5139ED" },
  { icon: ShieldCheck,   label: "Drug-Likeness & ADMET",   desc: "Lipinski, Veber, Ghose + full ADMET panel scored per rule.",    tone: "#395AED" },
  { icon: Target,        label: "Target Prediction",       desc: "ChEMBL similarity + BindingDB + UniProt evidence-linked hits.", tone: "#395AED" },
  { icon: HeartPulse,    label: "Disease Target Analysis", desc: "DisGeNET · OMIM · TTD cross-reference for translational focus.",tone: "#8139ED" },
  { icon: Network,       label: "Network Pharmacology",    desc: "Compound-target-disease graph with hubs & bridges.",            tone: "#8139ED" },
  { icon: GitBranch,     label: "GO & KEGG Enrichment",    desc: "Pathway analysis with p-values, dot plots and Sankey.",         tone: "#5139ED" },
  { icon: Atom,          label: "Molecular Docking",       desc: "AutoDock Vina · auto receptor prep · publication-ready poses.", tone: "#395AED" },
  { icon: Waves,         label: "Molecular Dynamics",      desc: "GROMACS RMSD/RMSF trajectories for stability profiling.",       tone: "#8139ED" },
  { icon: FileText,      label: "AI Report Generation",    desc: "One-click manuscript, figures & graphical abstract.",           tone: "#2BB673" },
];

function WhyChoose() {
  return (
    <section id="why-phytonet" data-testid="why-choose" className="relative overflow-hidden bg-gradient-to-b from-white via-[#FAFAFF] to-white py-24">
      <div aria-hidden className="brand-blur absolute -left-40 top-20 h-[420px] w-[420px] bg-[#5139ED]" />
      <div aria-hidden className="brand-blur absolute -right-32 bottom-40 h-[380px] w-[380px] bg-[#2BB673]" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* ── Section header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">Why Choose</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            Why Choose <span className="gradient-text">PhytoNet AI?</span>
          </h2>
          <p className="mt-5 text-[14.5px] leading-relaxed text-[#374151]">
            Traditional medicinal plant research requires switching between multiple software tools,
            databases, and manual data processing. PhytoNet AI brings the entire workflow together
            into one intelligent platform — faster, more accurately, with reproducible results.
          </p>
        </div>

        {/* ── Two-column comparison (35 / 65) ── */}
        <div className="mt-16 grid grid-cols-1 items-start gap-6 lg:grid-cols-[35fr_65fr] lg:gap-8">
          {/* Left — Traditional Research (dark violet card, brand palette) */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F0E24] via-[#1E1B4B] to-[#12102E] p-7 shadow-[0_20px_60px_-20px_rgba(30,27,75,0.65)]">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#8139ED]/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" />
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-red-300">Traditional Research</p>
            <h3 className="font-headline mt-2 text-[22px] leading-tight text-white">The old way, in fragments.</h3>
            <ul className="relative mt-6 space-y-2.5">
              {TRADITIONAL_PAIN.map((t) => (
                <li key={t} className="flex items-start gap-3 text-[13.5px] text-white/85">
                  <span aria-hidden className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.6)]" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <p className="font-headline text-[13px] text-white">Time to first insight</p>
              <p className="mt-1 text-[11px] text-white/70">Typical published network-pharmacology study</p>
              <p className="mt-2 font-headline text-[32px] font-extrabold text-red-400">2–6 weeks</p>
            </div>
          </div>

          {/* Right — PhytoNet AI vertical timeline */}
          <div className="relative rounded-3xl border border-[#E7E7F3] bg-white p-7 shadow-[0_20px_60px_-24px_rgba(81,57,237,0.35)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">PhytoNet AI Workflow</p>
                <h3 className="font-headline mt-1 text-[22px] leading-tight text-[#111827]">One connected pipeline — 10 steps, zero handoffs.</h3>
              </div>
              <span className="hidden shrink-0 rounded-full bg-gradient-to-r from-[#5139ED] to-[#8139ED] px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white sm:inline-flex">
                Automated
              </span>
            </div>

            <ol className="relative pl-4">
              {/* Central gradient spine */}
              <span aria-hidden className="absolute left-[26px] top-1 bottom-1 w-[2px] bg-gradient-to-b from-[#5139ED]/70 via-[#8139ED]/40 to-[#2BB673]/60" />

              {PHYTONET_STEPS.map((s, i) => (
                <motion.li
                  key={s.label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.35 }}
                  className="group relative flex items-center gap-4 py-1"
                >
                  {/* Node dot */}
                  <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/60 bg-white shadow-[0_6px_18px_-8px_rgba(81,57,237,0.45)] transition-transform group-hover:scale-105">
                    <span
                      className="absolute inset-0 -z-10 rounded-xl opacity-90"
                      style={{ background: `linear-gradient(135deg, ${s.tone}18, ${s.tone}05)` }}
                    />
                    <s.icon className="h-[17px] w-[17px]" strokeWidth={2.2} style={{ color: s.tone }} />
                  </span>

                  {/* Text + hover reveal */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.tone }}>
                        Step {String(i + 1).padStart(2, "0")}
                      </span>
                      <p className="text-[14px] font-semibold text-[#0F172A]">{s.label}</p>
                    </div>
                    <p className="max-h-0 overflow-hidden text-[12.5px] leading-relaxed text-[#64748B] transition-[max-height,opacity,margin] duration-300 opacity-0 group-hover:mt-0.5 group-hover:max-h-16 group-hover:opacity-100">
                      {s.desc}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>

        {/* ── Highlight banner ── */}
        <div className="mt-14 rounded-3xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] p-8 text-white sm:p-12">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-white/80">The PhytoNet Promise</p>
              <h3 className="font-headline mt-2 text-[28px] leading-[1.1] tracking-tight sm:text-[36px]">
                From Raw LC-MS Data to Biological Insights
              </h3>
              <p className="mt-3 text-[14.5px] font-semibold text-white/90">
                One platform. One workflow. One report.
              </p>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-white/80">
                Everything required for medicinal plant research — from compound identification to
                molecular dynamics and AI-powered report generation.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "10", v: "Automated steps" },
                { k: "1", v: "Unified platform" },
                { k: "0", v: "Manual exports" },
              ].map((s) => (
                <div key={s.v} className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
                  <p className="font-headline text-[32px] font-extrabold leading-none">{s.k}</p>
                  <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-widest text-white/80">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Final callout ── */}
        <div className="mt-10 rounded-3xl border border-[#5139ED]/20 bg-[#5139ED]/[0.04] p-6 text-center sm:p-8">
          <p className="font-headline text-[18px] font-semibold text-[#0F172A] sm:text-[20px]">
            Why switch between multiple software and databases?
          </p>
          <p className="mx-auto mt-2 max-w-3xl text-[13.5px] leading-relaxed text-[#374151]">
            PhytoNet AI integrates every stage of medicinal plant research into a single AI-powered
            platform, enabling faster discoveries, reproducible analyses, and publication-ready outputs.
          </p>
          <Link
            to="/phytonet-ai"
            data-testid="why-choose-cta"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-6 py-3 text-[13px] font-bold text-white shadow-[0_14px_36px_-10px_rgba(81,57,237,0.6)] transition-all hover:-translate-y-0.5"
          >
            Start Free Analysis
            <ArrowRight className="h-4 w-4" />
          </Link>
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
    id: "admet-druglikeness",
    title: "ADMET & Drug-Likeness Prediction",
    desc: "Combined ADMET endpoints plus Lipinski, Veber, Ghose, Egan, Muegge, QED and MedChem alerts — for single SMILES or batch.",
    cta: "Predict ADMET",
    to: "/admet",
    icon: FlaskConical,
    tint: "#8139ED",
    accent: "from-[#8139ED]/12 to-[#8139ED]/4",
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
    id: "molecular-docking",
    title: "Molecular Docking",
    desc: "AutoDock Vina docking with auto receptor prep from RCSB PDB, batch ligands, interaction analysis and 3D visualisation.",
    cta: "Run Docking",
    to: "/molecular-docking",
    icon: Microscope,
    tint: "#DB2777",
    accent: "from-[#DB2777]/10 to-[#DB2777]/4",
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
    { n: "01", icon: Activity,     label: "LC-MS Data",             tone: "#5139ED" },
    { n: "02", icon: FlaskConical, label: "Compound Identification", tone: "#5139ED" },
    { n: "03", icon: ShieldCheck,  label: "Drug-Likeness & ADMET",   tone: "#395AED" },
    { n: "04", icon: Target,       label: "Target Prediction",       tone: "#395AED" },
    { n: "05", icon: HeartPulse,   label: "Disease Targets",         tone: "#8139ED" },
    { n: "06", icon: Network,      label: "Network Pharmacology",    tone: "#8139ED" },
    { n: "07", icon: GitBranch,    label: "GO / KEGG Analysis",      tone: "#5139ED" },
    { n: "08", icon: Atom,         label: "Molecular Docking",       tone: "#395AED" },
    { n: "09", icon: Waves,        label: "Molecular Dynamics",      tone: "#8139ED" },
    { n: "10", icon: FileText,     label: "AI Report",               tone: "#2BB673" },
  ];
  return (
    <section id="how" data-testid="how-it-works" className="relative overflow-hidden py-24">
      <div aria-hidden className="brand-blur absolute right-0 top-40 h-[300px] w-[300px] bg-[#8139ED]" />
      <div aria-hidden className="brand-blur absolute -left-32 bottom-24 h-[280px] w-[280px] bg-[#5139ED]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">How It Works</p>
          <h2 className="font-headline mt-3 text-[36px] leading-[1.08] tracking-tight text-[#111827] sm:text-[44px]">
            From LC-MS to publication — <span className="gradient-text">10 automated steps</span>
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-[#374151]">
            Data flows automatically from each step to the next. Every stage is transparent,
            evidence-linked and reproducible — no manual exports.
          </p>
        </div>

        {/* ─── Desktop: horizontal snake grid (5 × 2) with connectors ─── */}
        <ol className="mt-16 hidden lg:grid lg:grid-cols-5 lg:gap-x-3 lg:gap-y-14">
          {steps.map((s, i) => {
            const row = Math.floor(i / 5);         // 0 or 1
            const col = i % 5;                     // 0..4
            const displayCol = row === 1 ? 4 - col : col;   // snake: row 2 reverses
            const isLastInRow = displayCol === 4;
            const isFirstInRow = displayCol === 0;
            const goesRight = row === 0;
            return (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
                className="relative flex flex-col items-center text-center"
                style={{ gridColumnStart: displayCol + 1, gridRow: row + 1 }}
              >
                {/* Connector to next node (horizontal arrow) */}
                {i < steps.length - 1 && !(goesRight ? isLastInRow : isFirstInRow) && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-8 hidden items-center lg:flex"
                    style={goesRight
                      ? { left: "calc(50% + 32px)", right: "calc(-50% + 32px)" }
                      : { right: "calc(50% + 32px)", left: "calc(-50% + 32px)" }}
                  >
                    <span className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#5139ED]/40 to-transparent" />
                    <ArrowRight
                      className="absolute h-3.5 w-3.5 text-[#5139ED]"
                      style={goesRight ? { right: -2 } : { left: -2, transform: "rotate(180deg)" }}
                    />
                  </span>
                )}

                {/* Downward connector at end of row 1 → start of row 2 */}
                {i === 4 && (
                  <span aria-hidden className="pointer-events-none absolute right-[10%] top-[70px] hidden h-16 items-center lg:flex">
                    <span className="h-full w-[2px] bg-gradient-to-b from-[#5139ED]/40 to-transparent" />
                  </span>
                )}

                {/* Node card */}
                <div
                  className="group relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/60 bg-white shadow-[0_10px_28px_-14px_rgba(81,57,237,0.5)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_36px_-14px_rgba(81,57,237,0.65)]"
                >
                  <span
                    className="absolute inset-0 -z-10 rounded-2xl opacity-90"
                    style={{ background: `linear-gradient(135deg, ${s.tone}18, ${s.tone}05)` }}
                  />
                  <s.icon className="h-6 w-6" strokeWidth={2.2} style={{ color: s.tone }} />
                  <span
                    className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold text-white shadow"
                    style={{ background: `linear-gradient(135deg, ${s.tone}, #0B0B18)` }}
                  >
                    {s.n}
                  </span>
                </div>
                <p className="mt-3 max-w-[130px] text-[12.5px] font-semibold leading-tight text-[#111827]">
                  {s.label}
                </p>
              </motion.li>
            );
          })}
        </ol>

        {/* ─── Mobile / tablet: vertical column with ↓ arrows ─── */}
        <ol className="mt-14 flex flex-col items-center gap-4 lg:hidden">
          {steps.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.35 }}
              className="flex w-full max-w-md flex-col items-center"
            >
              <div className="flex w-full items-center gap-4 rounded-2xl border border-[#E7E7F3] bg-white p-4 shadow-[0_6px_20px_-10px_rgba(81,57,237,0.35)]">
                <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                     style={{ background: `linear-gradient(135deg, ${s.tone}20, ${s.tone}08)` }}>
                  <s.icon className="h-5 w-5" strokeWidth={2.2} style={{ color: s.tone }} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.tone }}>Step {s.n}</span>
                  <p className="mt-0.5 text-[14px] font-semibold text-[#111827]">{s.label}</p>
                </div>
              </div>
              {i < steps.length - 1 && (
                <ChevronDown className="my-1 h-4 w-4 text-[#5139ED]/50" strokeWidth={2.5} />
              )}
            </motion.li>
          ))}
        </ol>
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
      <WhyChoose />
      <ResearchModules />
      <AssistantHero />
      <AgentVsAssistant />
      <Stats />
      <Features />
      <ScreenshotSection />
      <HowItWorks />
      <Trust />
      <Testimonials />
      <FAQ />
      <FinalCTA />
    </main>
  );
}
