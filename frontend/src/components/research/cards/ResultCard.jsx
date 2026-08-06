// ResultCard — routes a step result to the matching card component
// based on `result.card`.
import { memo } from "react";
import { TableCard } from "./TableCard";
import { NetworkCard } from "./NetworkCard";
import { CTPNetworkCard } from "./CTPNetworkCard";
import { DockingCard } from "./DockingCard";
import { EnrichmentCard } from "./EnrichmentCard";
import { IntersectionVennCard } from "./IntersectionVennCard";

function ResultCardImpl({ result, onOpen }) {
  const card = result?.card;
  const d = result?.data || {};
  const msg = result?.message || "";
  if (card === "compound_table") {
    const rows = d.compounds || [];
    return <TableCard testid="compound-table" title="Compounds" subtitle={msg}
      rows={rows} downloadBase="compounds" onOpen={onOpen}
      columns={[
        { key: "compound_name", label: "Name",
          tooltip: "Compound name from source database",
          render: (r) => r.compound_name || r.name || r.iupac_name || "—" },
        { key: "molecular_formula", label: "Formula",
          tooltip: "Molecular formula (Hill notation)",
          render: (r) => r.molecular_formula || "—" },
        { key: "molecular_weight", label: "MW (Da)",
          tooltip: "Molecular weight in daltons",
          render: (r) => (r.molecular_weight || "").toString().slice(0, 8) || "—" },
        { key: "smiles", label: "SMILES",
          tooltip: "Canonical SMILES structure",
          render: (r) => <span className="font-mono text-[11px]">{(r.smiles || r.canonical_smiles || "—").slice(0, 32)}</span> },
        { key: "source", label: "Source",
          tooltip: "Origin database (IMPPAT / LOTUS / PubChem)",
          render: (r) => r.source || r.lotus_id ? "LOTUS" : r.imppat_id ? "IMPPAT" : "—" },
      ]} />;
  }
  if (card === "target_table") {
    const rows = d.targets || [];
    const network = d.network;
    const fmt = (v, n = 2) => (v === null || v === undefined || v === "") ? "—"
      : typeof v === "number" ? v.toFixed(n) : String(v);
    return <>
      <TableCard testid="target-table" title="Predicted Targets" subtitle={msg}
        rows={rows} downloadBase="targets" onOpen={onOpen}
        columns={[
          { key: "compound_name", label: "Compound",
            tooltip: "Query compound (from prior step)",
            render: (r) => r.compound_name || r.query_compound || "—" },
          { key: "gene", label: "Gene",
            tooltip: "Predicted target gene symbol (HGNC)",
            render: (r) => r.gene || r.gene_symbol || r.symbol || "—" },
          { key: "uniprot", label: "UniProt",
            tooltip: "UniProt accession of the predicted protein target",
            render: (r) => r.uniprot_id || r.uniprot || "—" },
          { key: "target_name", label: "Target Name",
            tooltip: "Full name of the predicted protein",
            render: (r) => (r.target_name || r.pref_name || "").slice(0, 40) || "—" },
          { key: "similarity", label: "Similarity",
            tooltip: "Tanimoto similarity to the nearest known ChEMBL ligand (0-1)",
            render: (r) => fmt(r.similarity, 2) },
          { key: "pchembl", label: "pChEMBL",
            tooltip: "-log10(activity in M) of the nearest ChEMBL bioactivity (higher = more potent)",
            render: (r) => fmt(r.pchembl, 2) },
          { key: "score", label: "Score",
            tooltip: "Overall confidence score (0-1)",
            render: (r) => fmt(r.score ?? r.overall_score, 3) },
          { key: "source", label: "Source",
            tooltip: "Evidence source (ChEMBL / SwissTargetPrediction / Open Targets)",
            render: (r) => r.source || (r.sources || []).join(", ") || "—" },
        ]} />
      {network && network.nodes && network.nodes.length > 0 && (
        <NetworkCard network={network} />
      )}
    </>;
  }
  if (card === "disease_table") {
    const rows = d.hits || [];
    return <TableCard testid="disease-table" title="Disease Search" subtitle={msg}
      rows={rows} downloadBase="diseases" onOpen={onOpen}
      columns={[
        { key: "name", label: "Disease",
          tooltip: "Disease / condition name",
          render: (r) => r.name || r.disease_name || r.label || "—" },
        { key: "id", label: "ID",
          tooltip: "Cross-reference ID (EFO / MONDO / DisGeNET)",
          render: (r) => r.disease_id || r.efo_id || r.mondo_id || r.id || "—" },
        { key: "score", label: "Score",
          tooltip: "Match relevance score from Open Targets",
          render: (r) => (r.score ?? "").toString().slice(0, 6) },
      ]} />;
  }
  if (card === "admet_table") {
    const rows = Array.isArray(d.results) ? d.results : (d.rows || d.compounds || []);
    const fmt = (v, digits = 2) => (v === null || v === undefined || v === "") ? "—" :
      typeof v === "number" ? v.toFixed(digits) : String(v);
    const pass = (v) => v === true ? <span className="text-emerald-400">✓</span>
                        : v === false ? <span className="text-rose-400">✗</span>
                        : "—";
    const ld50mgkg = (r) => {
      const raw = r.ld50 ?? r["ld50_log"] ?? null;
      if (raw === null || raw === undefined || raw === "") return "—";
      const n = Number(raw);
      if (Number.isNaN(n)) return "—";
      const mgkg = n > 20 ? n : Math.pow(10, n);
      return mgkg.toLocaleString(undefined, { maximumFractionDigits: 0 });
    };
    return <TableCard testid="admet-table" title="ADMET & Drug-Likeness" subtitle={msg}
      rows={rows} downloadBase="admet" onOpen={onOpen}
      groups={[
        { label: "Identity",       span: 2, className: "text-slate-400" },
        { label: "Drug-Likeness",  span: 4, className: "text-emerald-300" },
        { label: "ADME",           span: 6, className: "text-sky-300" },
        { label: "Toxicity",       span: 4, className: "text-rose-300" },
      ]}
      columns={[
        { key: "compound_name", label: "Name",
          tooltip: "Compound name from IMPPAT / LOTUS / PubChem",
          render: (r) => r.compound_name || "—" },
        { key: "smiles", label: "SMILES",
          tooltip: "Canonical SMILES string",
          render: (r) => <span className="font-mono text-[11px]">{(r.smiles || "").slice(0, 24)}</span> },
        { key: "mw", label: "MW (Da)",
          tooltip: "Molecular weight in daltons. Lipinski threshold: ≤500 Da.",
          render: (r) => fmt(r.mw, 1) },
        { key: "logp", label: "logP",
          tooltip: "Octanol-water partition coefficient. Lipinski threshold: ≤5.",
          render: (r) => fmt(r.logp) },
        { key: "qed", label: "QED",
          tooltip: "Quantitative Estimate of Drug-likeness (0-1, higher is better).",
          render: (r) => fmt(r.qed, 3) },
        { key: "lipinski_pass", label: "Lipinski Ro5",
          tooltip: "Passes Lipinski's Rule of Five: MW≤500, logP≤5, HBD≤5, HBA≤10.",
          render: (r) => pass(r.lipinski_pass) },
        { key: "tpsa", label: "TPSA (Å²)",
          tooltip: "Topological polar surface area in Ų. Veber threshold: ≤140 Å².",
          render: (r) => fmt(r.tpsa, 1) },
        { key: "hba", label: "HBA",
          tooltip: "Hydrogen bond acceptors. Lipinski threshold: ≤10.",
          render: (r) => fmt(r.hba, 0) },
        { key: "hbd", label: "HBD",
          tooltip: "Hydrogen bond donors. Lipinski threshold: ≤5.",
          render: (r) => fmt(r.hbd, 0) },
        { key: "hia", label: "HIA",
          tooltip: "Human intestinal absorption probability (0-1).",
          render: (r) => fmt(r.hia, 2) },
        { key: "bbb", label: "BBB",
          tooltip: "Blood-brain barrier permeability probability (0-1).",
          render: (r) => fmt(r.bbb, 2) },
        { key: "caco2", label: "Caco-2 (log)",
          tooltip: "Caco-2 cell permeability, log10(10⁻⁶ cm/s).",
          render: (r) => fmt(r.caco2, 2) },
        { key: "ld50", label: "LD50 (mg/kg)",
          tooltip: "Rat oral median lethal dose. Higher = safer (>2000 = low toxicity).",
          render: (r) => ld50mgkg(r) },
        { key: "herg", label: "hERG",
          tooltip: "hERG cardiotoxicity probability (0-1). Lower = safer.",
          render: (r) => fmt(r.herg, 2) },
        { key: "ames", label: "Ames",
          tooltip: "Ames mutagenicity probability (0-1). Lower = safer.",
          render: (r) => fmt(r.ames, 2) },
        { key: "dili", label: "DILI",
          tooltip: "Drug-induced liver injury probability (0-1). Lower = safer.",
          render: (r) => fmt(r.dili, 2) },
      ]} />;
  }
  if (card === "enrichment_table") {
    return <EnrichmentCard data={d} message={msg} />;
  }
  if (card === "intersection_venn") {
    return <IntersectionVennCard data={d} message={msg} />;
  }
  if (card === "ctp_network") {
    return <CTPNetworkCard data={d} message={msg} />;
  }
  if (card === "docking") {
    return <DockingCard data={d} message={msg} />;
  }
  if (card === "compound_details" || card === "target_details") {
    return <div data-testid={card}
                className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-4 text-[13px] backdrop-blur-sm">
      <div className="text-[15px] font-semibold text-slate-100">
        {card === "target_details" ? "Target Details" : "Compound Details"}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{msg}</div>
      <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/40 p-3 text-[11.5px] leading-relaxed text-slate-300">
{JSON.stringify(d, null, 2)}
      </pre>
    </div>;
  }
  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] text-slate-300">
      {msg || "Result"}
    </div>
  );
}

// Result payloads (from completed steps) are immutable — bail out of
// re-render entirely when the same result object is passed again.
export const ResultCard = memo(ResultCardImpl, (prev, next) => {
  const a = prev.result, b = next.result;
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.card !== b.card) return false;
  // Cheap structural signature — good enough for the polling use-case
  // (server returns idempotent completed step results).
  const sig = (r) => JSON.stringify({
    m: r.message || "",
    n: (r.data?.compounds || r.data?.targets || r.data?.hits ||
        r.data?.results || r.data?.rows || r.data?.kegg ||
        r.data?.common || r.data?.nodes || []).length,
    e: (r.data?.network?.edges || r.data?.edges || []).length,
    c: (r.data?.common || []).length,
  });
  return sig(a) === sig(b);
});
