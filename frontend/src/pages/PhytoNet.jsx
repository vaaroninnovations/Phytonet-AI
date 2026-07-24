// PhytoNet — Research Modules directory page.
// Every capability of PhytoNet AI is exposed as a standalone module here, plus
// a shortcut to the flagship AI Agent workflow.
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles, Leaf, FlaskConical, Atom, Dna, Microscope, Database, Layers,
  ArrowRight, ArrowUpRight,
} from "lucide-react";

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
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/60 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl transition-all hover:shadow-[0_28px_60px_-24px_rgba(15,23,42,0.18)] ${mod.flagship ? "sm:col-span-2 lg:col-span-2" : ""}`}
      data-testid={`module-card-${mod.id}`}
    >
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
          style={{ backgroundColor: `${mod.tint}14`, color: mod.tint }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="font-headline text-[17px] font-bold tracking-tight text-[#111827]">{mod.title}</h3>
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

export default function PhytoNet() {
  return (
    <main data-testid="phytonet-modules-page" className="min-h-screen bg-[#FAFAFF]">
      <section className="relative overflow-hidden border-b border-[#E7E7F3] bg-gradient-to-b from-white via-[#FAF9FF] to-white py-20 sm:py-24">
          <div aria-hidden className="brand-blur absolute -left-24 top-10 h-[360px] w-[360px] bg-[#5139ED] opacity-40" />
          <div aria-hidden className="brand-blur absolute -right-24 bottom-10 h-[320px] w-[320px] bg-[#2BB673] opacity-40" />

          <div className="relative mx-auto max-w-7xl px-6">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5139ED] backdrop-blur">
                  <Layers className="h-3.5 w-3.5" />
                  Research Modules
                </span>
                <h1 className="font-headline mt-4 text-[36px] font-bold leading-[1.1] tracking-[-0.02em] text-[#111827] sm:text-[48px]">
                  Every capability, <span className="gradient-text">available on its own</span>.
                </h1>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#4B5563]">
                  Launch the complete AI workflow — or jump straight into any single module.
                  Same components, same backend, no duplication.
                </p>
              </div>
              <Link
                to="/phytonet-ai"
                data-testid="phytonet-run-all"
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
    </main>
  );
}
