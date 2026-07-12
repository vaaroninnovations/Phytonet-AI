import { Link } from "react-router-dom";
import { ArrowUpRight, Sparkles, ChevronRight, Rocket } from "lucide-react";
import { motion } from "framer-motion";

const PIPELINE_STEPS = [
  "Plant Database / LC-MS",
  "Compound Standardization",
  "Toxicity Prediction",
  "Drug-Likeness Screening",
  "Target Prediction",
  "Disease Target Identification",
  "Network Analysis",
  "Molecular Docking",
  "Molecular Dynamics",
  "AI Scientific Report",
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
              to="/phytonet-ai"
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

      {/* PhytoNet AI — single premium feature card */}
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
              One AI Scientist,
              <br />
              one continuous workflow.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-[#64748B]">
            A single agentic system takes a medicinal plant or LC-MS input
            through every stage — from compound standardization to a
            publication-ready scientific report.
          </p>
        </div>

        <PhytoNetAICard />
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
              to="/phytonet-ai"
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

function PhytoNetAICard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
    >
      <Link
        to="/phytonet-ai"
        data-testid="phytonet-ai-card"
        className="group relative block overflow-hidden rounded-3xl border border-[#E7E7F3] bg-white p-8 shadow-[0_20px_60px_-30px_rgba(81,57,237,0.35)] transition-all duration-300 hover:-translate-y-1 hover:border-[#5139ED]/30 hover:shadow-[0_30px_80px_-30px_rgba(81,57,237,0.5)] md:p-12"
      >
        {/* Ambient orbs inside the card */}
        <div
          className="brand-orb"
          style={{
            background: "#5139ED",
            width: 320,
            height: 320,
            top: -120,
            left: -100,
            opacity: 0.28,
          }}
        />
        <div
          className="brand-orb"
          style={{
            background: "#395AED",
            width: 260,
            height: 260,
            bottom: -100,
            right: -80,
            opacity: 0.25,
          }}
        />
        <div
          className="brand-orb"
          style={{
            background: "#8139ED",
            width: 220,
            height: 220,
            top: "45%",
            right: "20%",
            opacity: 0.14,
          }}
        />

        <div className="relative grid gap-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-14">
          {/* Left: title, subtitle, description, CTA */}
          <div className="flex min-w-0 flex-col justify-between">
            <div>
              <div
                data-testid="phytonet-badge"
                className="inline-flex items-center gap-2 rounded-full border border-[#5139ED]/20 bg-[#5139ED]/8 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#5139ED]"
              >
                <Sparkles className="h-3 w-3" />
                End-to-end AI scientist
              </div>
              <h3
                data-testid="phytonet-title"
                className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-[#0B0B18] sm:text-5xl"
              >
                <span aria-hidden="true" className="mr-2">
                  🧬
                </span>
                PhytoNet AI Scientist
              </h3>
              <p
                data-testid="phytonet-subtitle"
                className="mt-4 font-heading text-lg font-semibold text-[#1E1E33] sm:text-xl"
              >
                End-to-End AI Scientist for Medicinal Plant Network
                Pharmacology
              </p>
              <p
                data-testid="phytonet-description"
                className="mt-5 max-w-xl text-[15px] leading-relaxed text-[#4B5563]"
              >
                PhytoNet AI performs the complete medicinal plant network
                pharmacology workflow. It supports both public phytochemical
                databases and experimentally identified LC-MS compounds, then
                automatically executes toxicity prediction, drug-likeness
                screening, target prediction, disease target analysis, network
                construction, molecular docking, molecular dynamics simulation,
                and AI report generation.
              </p>
            </div>

            <div className="mt-10">
              <span
                data-testid="phytonet-launch-btn"
                className="inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-8 py-4 text-base font-semibold text-white shadow-[0_16px_40px_-16px_rgba(81,57,237,0.7)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-[#4127c9]"
              >
                <Rocket className="h-4 w-4" />
                <span aria-hidden="true">🚀</span> Launch PhytoNet AI
                <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <p className="mt-3 text-xs text-[#64748B]">
                Click anywhere on this card to launch the pipeline.
              </p>
            </div>
          </div>

          {/* Right: workflow */}
          <div
            data-testid="phytonet-workflow"
            className="relative flex flex-col rounded-2xl border border-[#F1F1FA] bg-white/70 p-6 backdrop-blur"
          >
            <p className="font-heading text-[10px] font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Pipeline
            </p>
            <ol className="mt-4 space-y-1.5">
              {PIPELINE_STEPS.map((step, i) => (
                <li
                  key={step}
                  data-testid={`phytonet-step-${i}`}
                  className="flex items-center gap-3"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] font-mono text-[10px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(81,57,237,0.6)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex-1 rounded-lg border border-[#F1F1FA] bg-white px-3 py-2 text-sm font-medium text-[#0B0B18]">
                    {step}
                  </span>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className="h-3 w-3 shrink-0 rotate-90 text-[#5139ED]/40" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
