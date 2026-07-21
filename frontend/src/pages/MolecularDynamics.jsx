// Molecular Dynamics — v1.0 placeholder.
// Server-side MD execution + trajectory analytics ship in v2.0. This page
// intentionally exposes no upload, no execution, no partial dashboards —
// only a professional Coming Soon overview of what's coming.
import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import {
  Atom, ArrowRight, Clock, Cpu, Activity, BarChart3, GitBranch,
  Waves, Layers, Zap, Eye, Sparkles,
} from "lucide-react";

const CAPABILITIES = [
  { icon: Cpu,      label: "GROMACS Integration",              detail: "Server-side execution on GPU-backed workers." },
  { icon: Atom,     label: "Protein–Ligand MD Simulation",     detail: "Automated ACPYPE ligand parameterisation." },
  { icon: Activity, label: "RMSD",                             detail: "Backbone Root-Mean-Square Deviation." },
  { icon: BarChart3,label: "RMSF",                             detail: "Per-residue flexibility profile." },
  { icon: Waves,    label: "Radius of Gyration",               detail: "Compactness of the folded structure." },
  { icon: Layers,   label: "SASA",                             detail: "Solvent-Accessible Surface Area." },
  { icon: Zap,      label: "Hydrogen Bond Analysis",           detail: "Protein–ligand H-bond occupancy over time." },
  { icon: GitBranch,label: "Protein–Ligand Distance",          detail: "Centre-of-mass separation trajectory." },
  { icon: GitBranch,label: "Contact Analysis",                 detail: "Atomic contacts within 0.6 nm cut-off." },
  { icon: Sparkles, label: "Principal Component Analysis",     detail: "Dominant collective motions." },
  { icon: BarChart3,label: "Free Energy Landscape",            detail: "Gibbs free-energy surface along PC1/PC2." },
  { icon: Zap,      label: "MM-PBSA / MM-GBSA",                detail: "Binding free-energy decomposition." },
  { icon: Eye,      label: "Interactive 3D Trajectory Viewer", detail: "Mol* playback of the full simulation." },
];

export default function MolecularDynamics() {
  return (
    <WorkflowLayout>
      <main data-testid="md-coming-soon-page" className="mx-auto max-w-5xl px-6 pb-24 pt-14">
        {/* Header */}
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
              Module · 07
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
              Molecular Dynamics
            </h1>
          </div>
          <span
            data-testid="md-coming-soon-badge"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#F59E0B]/40 bg-[#FEF3C7] px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-[#92400E]"
          >
            <Clock className="h-3 w-3" />
            Coming in v2.0
          </span>
        </div>

        {/* Hero card */}
        <div
          data-testid="md-coming-soon-hero"
          className="mt-8 overflow-hidden rounded-3xl border border-[#E7E7F3] bg-gradient-to-br from-[#F5F3FE] via-white to-[#FAFAFF] p-8 shadow-[0_10px_40px_-20px_rgba(81,57,237,0.35)]"
        >
          <div className="flex items-start gap-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#5139ED] via-[#395AED] to-[#8139ED] text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]">
              <Atom className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B0B18]">
                Server-side Molecular Dynamics is arriving in the next release
              </h2>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-[#374151]">
                In PhytoNet AI v1.0 the workflow ends at Molecular Docking, and the
                <b> Report Generation </b>module compiles a publication-quality
                document from every completed step. Molecular Dynamics — including
                automated GROMACS execution, trajectory analytics and binding free
                energy calculations — is scheduled for <b>v2.0</b>, once GPU-backed
                workers and persistent trajectory storage are in place.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  data-testid="md-goto-report"
                  to="/ai-scientific-report"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-white shadow-[0_10px_30px_-10px_rgba(81,57,237,0.6)]"
                >
                  Continue to Report Generation
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  data-testid="md-back-to-docking"
                  to="/molecular-docking"
                  className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[13px] font-bold uppercase tracking-widest text-[#0B0B18] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                >
                  Back to Docking
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Capability grid */}
        <div className="mt-10">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            What's shipping in v2.0
          </p>
          <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#0B0B18]">
            Planned capabilities
          </h3>
          <div
            data-testid="md-capabilities"
            className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {CAPABILITIES.map((c) => (
              <div
                key={c.label}
                data-testid={`md-cap-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
                className="group rounded-2xl border border-[#E7E7F3] bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-[#5139ED]/40 hover:shadow-[0_10px_30px_-15px_rgba(81,57,237,0.3)]"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F5F3FE] text-[#5139ED] transition-colors group-hover:bg-[#5139ED] group-hover:text-white">
                    <c.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B0B18]">{c.label}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#64748B]">{c.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Roadmap timeline */}
        <div className="mt-10 rounded-3xl border border-[#E7E7F3] bg-white p-6">
          <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
            Release timeline
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0F7A47]">v1.0 · Now</p>
              <p className="mt-1 text-sm font-bold text-[#0B0B18]">Full network pharmacology</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                Plant Database → ADMET → Targets → Networks → Docking → Report Generation
              </p>
            </div>
            <div className="rounded-2xl border border-[#5139ED]/40 bg-[#F5F3FE] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">v2.0 · Next</p>
              <p className="mt-1 text-sm font-bold text-[#0B0B18]">Molecular Dynamics</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                GROMACS on GPU workers, live trajectory analytics, MM-PBSA binding free energy
              </p>
            </div>
            <div className="rounded-2xl border border-[#E7E7F3] bg-[#FAFAFF] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">v2.x · Later</p>
              <p className="mt-1 text-sm font-bold text-[#0B0B18]">Ensemble MD & QM/MM</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                Replica-exchange, metadynamics, hybrid quantum-classical binding refinement
              </p>
            </div>
          </div>
        </div>
      </main>
    </WorkflowLayout>
  );
}
