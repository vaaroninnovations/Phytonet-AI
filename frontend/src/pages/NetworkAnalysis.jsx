import { Link } from "react-router-dom";
import WorkflowLayout from "@/components/WorkflowLayout";
import { useNetwork } from "@/context/NetworkContext";
import { useWorkflow } from "@/context/WorkflowContext";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Network, Users, Dna, Sparkles } from "lucide-react";

export default function NetworkAnalysis() {
  const { compoundTargets, diseaseTargets, selectedDisease, selectedCompounds } =
    useNetwork();
  const { markComplete } = useWorkflow();

  useEffect(() => {
    if (compoundTargets.length && diseaseTargets.length) {
      markComplete("target-prediction");
      markComplete("disease-target-identification");
    }
  }, [compoundTargets.length, diseaseTargets.length, markComplete]);

  // Shared genes between compound targets and disease targets → candidate hubs.
  const shared = useMemo(() => {
    if (!compoundTargets.length || !diseaseTargets.length) return [];
    const dset = new Set(diseaseTargets.map((r) => r.gene_symbol));
    const seen = new Set();
    const out = [];
    for (const c of compoundTargets) {
      if (dset.has(c.gene_symbol) && !seen.has(c.gene_symbol)) {
        seen.add(c.gene_symbol);
        out.push(c.gene_symbol);
      }
    }
    return out;
  }, [compoundTargets, diseaseTargets]);

  const hasData = compoundTargets.length > 0 || diseaseTargets.length > 0;

  return (
    <WorkflowLayout>
      <main
        data-testid="network-analysis-page"
        className="mx-auto max-w-7xl px-6 pb-24 pt-14"
      >
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          Module · 05
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B0B18] sm:text-5xl">
          Network Analysis
        </h1>
        <p className="mt-3 max-w-2xl text-[#64748B]">
          Compound–target–disease network construction. Hub extraction, degree
          distribution and enrichment analytics coming next; the transferred
          selections are ready and cached below.
        </p>

        {!hasData ? (
          <div
            data-testid="network-empty"
            className="mt-10 rounded-3xl border border-[#E7E7F3] bg-white p-8 text-center"
          >
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#5139ED]/10 text-[#5139ED]">
              <Network className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-[#0B0B18]">
              Waiting on upstream selections
            </h2>
            <p className="mt-2 text-sm text-[#64748B]">
              Complete Compound Target Identification and Disease Target
              Identification first.
            </p>
            <Link
              to="/target-prediction"
              data-testid="back-to-target"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#5139ED] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4127c9]"
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Target Prediction
            </Link>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div
              data-testid="network-summary"
              className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4"
            >
              <StatCard
                icon={<Sparkles className="h-4 w-4" />}
                label="Input compounds"
                value={selectedCompounds.length}
                testid="stat-compounds"
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="Compound targets"
                value={compoundTargets.length}
                testid="stat-compound-targets"
              />
              <StatCard
                icon={<Dna className="h-4 w-4" />}
                label={selectedDisease?.name || "Disease targets"}
                value={diseaseTargets.length}
                testid="stat-disease-targets"
              />
              <StatCard
                icon={<Network className="h-4 w-4" />}
                label="Shared hubs"
                value={shared.length}
                testid="stat-shared"
                emphasis
              />
            </div>

            {/* Shared hub genes */}
            <div
              data-testid="shared-hubs-card"
              className="mt-6 rounded-3xl border border-[#E7E7F3] bg-white p-5 md:p-6"
            >
              <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
                Compound ∩ Disease · Candidate hubs
              </p>
              <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-[#0B0B18]">
                {shared.length} genes appear in both target sets
              </h2>
              {shared.length === 0 ? (
                <p className="mt-3 text-xs text-[#64748B]">
                  No overlap between compound targets and disease targets — the
                  next module will still map the full bipartite network.
                </p>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {shared.map((g) => (
                    <span
                      key={g}
                      data-testid={`hub-${g}`}
                      className="rounded-full bg-gradient-to-r from-[#5139ED]/10 via-[#395AED]/10 to-[#8139ED]/10 px-3 py-1 font-mono text-[12px] font-bold text-[#5139ED] ring-1 ring-inset ring-[#5139ED]/25"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Data preview */}
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <PreviewCard
                title="Compound → Target"
                testid="preview-compound-targets"
                rows={compoundTargets.slice(0, 8).map((r) => [
                  r.compound_name,
                  r.gene_symbol,
                  r.confidence,
                ])}
                headers={["Compound", "Gene", "Conf"]}
                total={compoundTargets.length}
              />
              <PreviewCard
                title="Disease → Target"
                testid="preview-disease-targets"
                rows={diseaseTargets.slice(0, 8).map((r) => [
                  r.gene_symbol,
                  r.protein_name?.slice(0, 40) || "—",
                  r.confidence,
                ])}
                headers={["Gene", "Protein", "Conf"]}
                total={diseaseTargets.length}
              />
            </div>
          </>
        )}
      </main>
    </WorkflowLayout>
  );
}

function StatCard({ icon, label, value, testid, emphasis }) {
  return (
    <div
      data-testid={testid}
      className={`rounded-3xl border p-4 ${
        emphasis
          ? "border-[#5139ED]/30 bg-gradient-to-br from-[#5139ED]/8 via-[#395AED]/8 to-[#8139ED]/8"
          : "border-[#E7E7F3] bg-white"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#5139ED]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-[#0B0B18]">{value}</div>
    </div>
  );
}

function PreviewCard({ title, rows, headers, total, testid }) {
  return (
    <div
      data-testid={testid}
      className="rounded-3xl border border-[#E7E7F3] bg-white p-5"
    >
      <div className="flex items-center justify-between">
        <p className="font-heading text-xs font-bold uppercase tracking-[0.24em] text-[#5139ED]">
          {title}
        </p>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#8139ED]">
          {total} rows
        </span>
      </div>
      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-[#F1F1FA] text-[#64748B]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-widest"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[#F1F1FA]">
              {r.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-[#0B0B18]">
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
