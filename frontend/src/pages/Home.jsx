import { Link } from "react-router-dom";
import {
  FlaskConical,
  Crosshair,
  Network,
  Share2,
  BarChart3,
  Atom,
  Waves,
  FileText,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

const FEATURES = [
  {
    slug: "compound-extractor",
    title: "Compound Extractor",
    desc: "Mine phytochemicals from IMPPAT, LOTUS and PubChem in a single sweep.",
    icon: FlaskConical,
    active: true,
  },
  {
    slug: "target-identification",
    title: "Target Identification",
    desc: "Predict protein targets via SwissTargetPrediction & STITCH.",
    icon: Crosshair,
  },
  {
    slug: "network-pharmacology",
    title: "Network Pharmacology",
    desc: "Compound–target–disease graphs with community detection.",
    icon: Network,
  },
  {
    slug: "ppi",
    title: "Protein Interaction Networks",
    desc: "STRING PPI construction, hub scoring & topology metrics.",
    icon: Share2,
  },
  {
    slug: "enrichment",
    title: "GO & KEGG Enrichment",
    desc: "Functional and pathway enrichment with adjustable FDR.",
    icon: BarChart3,
  },
  {
    slug: "docking",
    title: "Molecular Docking",
    desc: "AutoDock Vina pipelines for virtual screening at scale.",
    icon: Atom,
  },
  {
    slug: "md",
    title: "Molecular Dynamics",
    desc: "GROMACS-ready systems, trajectory summaries and RMSD/RMSF.",
    icon: Waves,
  },
  {
    slug: "report",
    title: "AI Scientific Report Generator",
    desc: "Publication-quality figures + narrative auto-drafted per run.",
    icon: FileText,
  },
];

export default function Home() {
  return (
    <main data-testid="home-page" className="relative overflow-hidden bg-white">
      {/* ambient orbs */}
      <div
        className="brand-orb"
        style={{
          background: "#5139ED",
          width: 420,
          height: 420,
          top: -140,
          left: -120,
        }}
      />
      <div
        className="brand-orb"
        style={{
          background: "#395AED",
          width: 380,
          height: 380,
          top: 60,
          right: -140,
        }}
      />
      <div
        className="brand-orb"
        style={{
          background: "#8139ED",
          width: 340,
          height: 340,
          top: 380,
          left: "40%",
          opacity: 0.18,
        }}
      />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-20 md:pt-28">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-grid bg-grid-fade" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 mx-auto max-w-3xl text-center"
        >
          <div
            data-testid="hero-pill"
            className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/80 px-4 py-1.5 text-xs font-medium text-[#5139ED] shadow-sm backdrop-blur"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Agentic pipeline · phytochem → publication
          </div>

          <h1
            data-testid="hero-headline"
            className="font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-[#0B0B18] sm:text-7xl md:text-8xl"
          >
            Dr. <span className="text-[#5139ED]">/</span>
          </h1>

          <p
            data-testid="hero-subhead"
            className="mt-6 font-heading text-2xl font-semibold text-[#1E1E33] sm:text-3xl"
          >
            Your Research AI Assistant
          </p>

          <p
            data-testid="hero-description"
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#4B5563] sm:text-lg"
          >
            Rather than manually integrating numerous public databases and
            standalone software packages, <span className="brand-underline">Dr. /</span>{" "}
            employs specialized agents that communicate through an intelligent
            orchestration engine. Each tool performs a dedicated scientific
            task, automatically passing validated outputs to the next stage —
            creating a fully automated, reproducible computational pipeline.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/plant-database"
              data-testid="hero-cta-plant-database"
              className="group inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-7 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#4127c9]"
            >
              Plant Database
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <a
              href="#agents"
              data-testid="hero-cta-agents"
              className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white/70 px-7 py-3.5 text-sm font-semibold text-[#0B0B18] backdrop-blur transition-colors duration-200 hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              See the agents
              <ChevronRight className="h-4 w-4" />
            </a>
          </div>
        </motion.div>

        {/* metric strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="relative z-10 mx-auto mt-20 grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4"
        >
          {[
            ["17,000+", "Phytochemicals"],
            ["4,010", "Medicinal plants"],
            ["270k+", "Natural products"],
            ["8", "Autonomous agents"],
          ].map(([k, v]) => (
            <div
              key={v}
              className="glass rounded-2xl px-5 py-4 text-center"
            >
              <div className="font-display text-2xl font-bold text-[#0B0B18]">
                {k}
              </div>
              <div className="mt-1 text-xs uppercase tracking-widest text-[#64748B]">
                {v}
              </div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Features grid */}
      <section
        id="agents"
        data-testid="features-section"
        className="relative mx-auto max-w-7xl px-6 pb-24"
      >
        <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              The pipeline
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
              Eight agents, one continuous
              <br />
              scientific workflow.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[#64748B]">
            Every card below is a specialized agent. Outputs are validated and
            handed to the next stage automatically — no ad-hoc scripts, no
            spreadsheets in between.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.slug} f={f} index={i} />
          ))}
        </div>
      </section>

      {/* How it works ribbon */}
      <section
        data-testid="ribbon-section"
        className="relative border-y border-[#E7E7F3] bg-[#FAFAFF]"
      >
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Query a plant",
                d: "Enter any medicinal plant. Dr. / dispatches simultaneous requests to IMPPAT and LOTUS.",
              },
              {
                n: "02",
                t: "Agents orchestrate",
                d: "Each agent enriches the payload with structures, targets, networks and enrichments.",
              },
              {
                n: "03",
                t: "Publish results",
                d: "Sorted, exportable tables, high-resolution figures and an auto-drafted narrative.",
              },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-4">
                <span className="font-mono text-sm text-[#5139ED]">{s.n}</span>
                <div>
                  <div className="font-heading text-lg font-semibold text-[#0B0B18]">
                    {s.t}
                  </div>
                  <p className="mt-1 text-sm text-[#64748B]">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white p-10 shadow-[0_20px_60px_-30px_rgba(81,57,237,0.35)] md:p-14">
          <div
            className="brand-orb"
            style={{
              background: "#5139ED",
              width: 260,
              height: 260,
              top: -80,
              right: -60,
              opacity: 0.35,
            }}
          />
          <div className="relative">
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Start with data
            </p>
            <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0B0B18] sm:text-4xl">
              Search a medicinal plant.
              <br className="hidden sm:block" /> Retrieve every phytochemical
              in seconds.
            </h3>
            <p className="mt-4 max-w-xl text-sm text-[#64748B]">
              A unified compound extractor over IMPPAT + LOTUS with exact,
              substructure and molecular-weight search modes. Export to Excel,
              CSV or JSON.
            </p>
            <Link
              to="/plant-database"
              data-testid="cta-plant-database"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0B0B18] px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5 hover:bg-[#1E1E33]"
            >
              Open Plant Database
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({ f, index }) {
  const Icon = f.icon;
  const Wrap = f.active ? Link : "div";
  const wrapProps = f.active
    ? { to: "/plant-database", "data-testid": `feature-${f.slug}` }
    : { "data-testid": `feature-${f.slug}` };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.5 }}
    >
      <Wrap
        {...wrapProps}
        className={`group relative flex h-full flex-col justify-between rounded-2xl border p-6 transition-all duration-300 ${
          f.active
            ? "cursor-pointer border-[#E7E7F3] bg-white hover:-translate-y-1 hover:border-[#5139ED]/30 hover:shadow-[0_20px_40px_-20px_rgba(81,57,237,0.35)]"
            : "border-[#E7E7F3] bg-[#FAFAFF]"
        }`}
      >
        <div>
          <div className="flex items-center justify-between">
            <span
              className={`grid h-11 w-11 place-items-center rounded-xl ${
                f.active
                  ? "bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_6px_18px_-6px_rgba(81,57,237,0.65)]"
                  : "bg-white text-[#5139ED] border border-[#E7E7F3]"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            {f.active ? (
              <span className="rounded-full bg-[#5139ED]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">
                Live
              </span>
            ) : (
              <span className="rounded-full bg-[#E7E7F3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
                Soon
              </span>
            )}
          </div>
          <h3 className="mt-6 font-heading text-lg font-semibold text-[#0B0B18]">
            {f.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#64748B]">
            {f.desc}
          </p>
        </div>
        <div
          className={`mt-6 flex items-center gap-1 text-xs font-semibold ${
            f.active ? "text-[#5139ED]" : "text-[#B4B4CD]"
          }`}
        >
          {f.active ? "Launch agent" : "In development"}
          {f.active && (
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          )}
        </div>
      </Wrap>
    </motion.div>
  );
}
