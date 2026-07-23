// PhytoNet AI — Databases Hub
// A central knowledge index of every biological, chemical, pharmacological,
// structural, pathway, disease and phytochemical data source integrated
// into PhytoNet AI. Users can browse, filter and inspect each database
// (purpose, supported data, update cadence, API availability, citation,
// and how PhytoNet AI consumes it).
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search, ExternalLink, ArrowRight, BookOpen, Database as DatabaseIcon,
  Atom, Dna, FlaskConical, Beaker, Leaf, Pill, Microscope, Network,
  Layers, ShieldCheck, Cpu, Copy, Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";

/* ────────────────────────────── Data ────────────────────────────── */
const CATEGORIES = [
  { id: "all",         label: "All",             icon: DatabaseIcon },
  { id: "chemistry",   label: "Chemistry",       icon: Atom },
  { id: "target",      label: "Targets & PPI",   icon: Dna },
  { id: "disease",     label: "Disease",         icon: Microscope },
  { id: "pathway",     label: "Pathways",        icon: Network },
  { id: "structural",  label: "Structures",      icon: Layers },
  { id: "phyto",       label: "Phytochemistry",  icon: Leaf },
  { id: "pharma",      label: "Pharmacology",    icon: Pill },
];

const DBS = [
  {
    name: "PubChem",
    category: "chemistry",
    url: "https://pubchem.ncbi.nlm.nih.gov/",
    desc: "NCBI's public repository of chemical substances and their biological activities.",
    supports: ["CID lookup", "SMILES / InChI", "bioassay data", "structure similarity"],
    updates: "Daily",
    api: "REST / PUG-View",
    citation: "Kim S, et al. PubChem 2023. Nucleic Acids Res. 2022.",
    usedFor: "Compound identity resolution, SMILES normalisation, and cross-linking to bioactivity data throughout the AI Agent workflow.",
  },
  {
    name: "ChEMBL",
    category: "chemistry",
    url: "https://www.ebi.ac.uk/chembl/",
    desc: "EBI's manually curated database of bioactive molecules with drug-like properties.",
    supports: ["Bioactivity IC50/Ki", "target-ligand pairs", "ADMET", "clinical stage"],
    updates: "Quarterly",
    api: "REST",
    citation: "Mendez D, et al. ChEMBL. Nucleic Acids Res. 2019.",
    usedFor: "Ligand-target evidence weighting in Target Prediction and ADMET reference distributions.",
  },
  {
    name: "BindingDB",
    category: "chemistry",
    url: "https://www.bindingdb.org/",
    desc: "Public repository of measured binding affinities for drug-target interactions.",
    supports: ["Ki, Kd, IC50", "assay conditions", "target chains"],
    updates: "Weekly",
    api: "REST + downloads",
    citation: "Gilson MK, et al. BindingDB. Nucleic Acids Res. 2016.",
    usedFor: "Prior affinity distributions used to calibrate docking-derived binding scores.",
  },
  {
    name: "UniProt",
    category: "target",
    url: "https://www.uniprot.org/",
    desc: "Comprehensive protein sequence and functional annotation resource.",
    supports: ["Sequences", "GO annotations", "domain architecture", "cross-refs"],
    updates: "Every 8 weeks",
    api: "REST",
    citation: "The UniProt Consortium. Nucleic Acids Res. 2023.",
    usedFor: "Canonical gene ↔ protein ↔ organism mapping for every target in the network.",
  },
  {
    name: "GeneCards",
    category: "target",
    url: "https://www.genecards.org/",
    desc: "Integrated human gene database with functional, expression, and disease annotations.",
    supports: ["Gene summaries", "expression", "disease links", "aliases"],
    updates: "Continuously",
    api: "Partner API",
    citation: "Stelzer G, et al. Curr Protoc Bioinformatics. 2016.",
    usedFor: "Human gene annotation shown in Target Prediction results and Network Analysis tooltips.",
  },
  {
    name: "DisGeNET",
    category: "disease",
    url: "https://www.disgenet.org/",
    desc: "Curated gene–disease associations from public repositories and literature.",
    supports: ["GDA scores", "disease vocabulary", "publication evidence"],
    updates: "Twice a year",
    api: "REST + SPARQL",
    citation: "Piñero J, et al. Nucleic Acids Res. 2020.",
    usedFor: "Primary evidence source for Disease Target Prediction, with confidence-weighted scores.",
  },
  {
    name: "OMIM",
    category: "disease",
    url: "https://omim.org/",
    desc: "Online catalogue of human genes and genetic disorders authored at Johns Hopkins.",
    supports: ["Mendelian phenotypes", "gene-phenotype maps"],
    updates: "Daily",
    api: "REST (key required)",
    citation: "Amberger JS, et al. Nucleic Acids Res. 2019.",
    usedFor: "Rare-disease enrichment overlays in the disease-target module.",
  },
  {
    name: "Open Targets",
    category: "disease",
    url: "https://platform.opentargets.org/",
    desc: "Systematic drug-target-disease evidence platform (GSK/EMBL-EBI).",
    supports: ["Association scores", "evidence types", "tractability"],
    updates: "Every ~4 months",
    api: "GraphQL",
    citation: "Ochoa D, et al. Nucleic Acids Res. 2023.",
    usedFor: "Multi-source association scoring used in Disease Target Prediction and Network Analysis.",
  },
  {
    name: "DrugBank",
    category: "pharma",
    url: "https://go.drugbank.com/",
    desc: "Combined pharmaceutical and pharmacological knowledge base.",
    supports: ["Drug metadata", "ATC codes", "targets, enzymes, transporters"],
    updates: "Rolling",
    api: "REST (commercial)",
    citation: "Wishart DS, et al. Nucleic Acids Res. 2018.",
    usedFor: "Approved-drug context for network hubs and repurposing hypotheses.",
  },
  {
    name: "STRING",
    category: "pathway",
    url: "https://string-db.org/",
    desc: "Protein-protein interaction network with confidence-scored edges.",
    supports: ["PPIs", "co-expression", "text-mining", "experiments"],
    updates: "Yearly",
    api: "REST",
    citation: "Szklarczyk D, et al. Nucleic Acids Res. 2023.",
    usedFor: "Backbone PPI graph for Network Analysis and hub-gene identification.",
  },
  {
    name: "KEGG",
    category: "pathway",
    url: "https://www.genome.jp/kegg/",
    desc: "Kyoto Encyclopedia of Genes and Genomes — pathways, modules, and disease maps.",
    supports: ["Pathways", "modules", "orthology", "drug ↔ target"],
    updates: "Monthly",
    api: "REST (academic use free)",
    citation: "Kanehisa M, Goto S. Nucleic Acids Res. 2000.",
    usedFor: "Primary source for pathway enrichment charts and mechanism-of-action figures.",
  },
  {
    name: "Reactome",
    category: "pathway",
    url: "https://reactome.org/",
    desc: "Peer-reviewed pathway database maintained by EMBL-EBI, OICR and NYU.",
    supports: ["Curated pathways", "reactions", "SBGN maps"],
    updates: "Quarterly",
    api: "REST",
    citation: "Gillespie M, et al. Nucleic Acids Res. 2022.",
    usedFor: "Alternate pathway view offered alongside KEGG in enrichment results.",
  },
  {
    name: "WikiPathways",
    category: "pathway",
    url: "https://www.wikipathways.org/",
    desc: "Community-curated open pathway database.",
    supports: ["Pathways", "GPML export"],
    updates: "Continuously",
    api: "REST",
    citation: "Martens M, et al. Nucleic Acids Res. 2021.",
    usedFor: "Third-source enrichment for cross-validation of KEGG/Reactome findings.",
  },
  {
    name: "Gene Ontology (GO)",
    category: "pathway",
    url: "https://geneontology.org/",
    desc: "Structured, hierarchical vocabulary for gene function.",
    supports: ["BP, MF, CC terms", "IEA/experimental evidence"],
    updates: "Monthly",
    api: "REST + OWL",
    citation: "Ashburner M, et al. Nat Genet. 2000.",
    usedFor: "GO enrichment charts and functional summaries in the AI Report.",
  },
  {
    name: "Protein Data Bank (PDB)",
    category: "structural",
    url: "https://www.rcsb.org/",
    desc: "Global archive of experimentally-determined 3D structures.",
    supports: ["X-ray, cryo-EM, NMR", "assemblies", "ligands"],
    updates: "Weekly",
    api: "REST + Search API",
    citation: "Berman HM, et al. Nucleic Acids Res. 2000.",
    usedFor: "Receptor structures for Molecular Docking (AutoDock Vina).",
  },
  {
    name: "AlphaFold DB",
    category: "structural",
    url: "https://alphafold.ebi.ac.uk/",
    desc: "DeepMind × EMBL-EBI archive of predicted protein structures.",
    supports: ["Model + pLDDT", "PAE plots", "millions of proteins"],
    updates: "Periodic model refreshes",
    api: "REST",
    citation: "Varadi M, et al. Nucleic Acids Res. 2022.",
    usedFor: "Fallback receptor for docking when no experimental PDB is available.",
  },
  {
    name: "IMPPAT",
    category: "phyto",
    url: "https://cb.imsc.res.in/imppat/",
    desc: "Indian Medicinal Plants, Phytochemistry And Therapeutics database.",
    supports: ["Plant-phytochemical links", "traditional uses", "ADMET priors"],
    updates: "Versioned releases",
    api: "Bulk downloads",
    citation: "Mohanraj K, et al. Sci Rep. 2018.",
    usedFor: "Curated phytochemical library for the Plant Database module.",
  },
  {
    name: "NPASS",
    category: "phyto",
    url: "http://bidd.group/NPASS/",
    desc: "Natural Product Activity and Species Source database.",
    supports: ["Natural products", "activities", "species"],
    updates: "Versioned",
    api: "Downloads",
    citation: "Zeng X, et al. Nucleic Acids Res. 2018.",
    usedFor: "Species-of-origin annotation for compounds identified by LC-MS uploads.",
  },
  {
    name: "COCONUT",
    category: "phyto",
    url: "https://coconut.naturalproducts.net/",
    desc: "COlleCtion of Open Natural prodUcTs — largest open natural-product resource.",
    supports: ["Natural products", "InChIKeys", "sources"],
    updates: "Rolling",
    api: "REST",
    citation: "Sorokina M, et al. J Cheminform. 2021.",
    usedFor: "De-replication for LC-MS peaks and structural lookup.",
  },
  {
    name: "CMAUP",
    category: "phyto",
    url: "https://bidd.group/CMAUP/",
    desc: "Collective Molecular Activities of Useful Plants.",
    supports: ["Plant use categories", "compound-target evidence"],
    updates: "Versioned",
    api: "Downloads",
    citation: "Zeng X, et al. Nucleic Acids Res. 2019.",
    usedFor: "Prior evidence for plant → target linkages in the AI Agent orchestrator.",
  },
  {
    name: "Dr. Duke's Phytochemical DB",
    category: "phyto",
    url: "https://phytochem.nal.usda.gov/",
    desc: "USDA reference of plants, their phytochemicals and traditional activities.",
    supports: ["Plant-phytochemical-activity triples"],
    updates: "Historical, occasional updates",
    api: "Web search",
    citation: "Duke JA. USDA-ARS.",
    usedFor: "Traditional-use context in Plant Database detail views.",
  },
  {
    name: "KNApSAcK",
    category: "phyto",
    url: "http://www.knapsackfamily.com/",
    desc: "Compound-species relationships across the plant kingdom.",
    supports: ["Species ↔ metabolite", "molecular info"],
    updates: "Rolling",
    api: "Web + downloads",
    citation: "Afendi FM, et al. Plant Cell Physiol. 2012.",
    usedFor: "Alternative taxonomy source for phyto-metabolite lookups.",
  },
  {
    name: "FooDB",
    category: "phyto",
    url: "https://foodb.ca/",
    desc: "Comprehensive resource on food constituents, chemistry and biology.",
    supports: ["Food ↔ compound links", "nutritional data"],
    updates: "Periodic",
    api: "Downloads",
    citation: "Wishart Research Group. FooDB.",
    usedFor: "Diet-derived phytochemical context for nutraceutical hypotheses.",
  },
  {
    name: "SwissTargetPrediction",
    category: "target",
    url: "http://www.swisstargetprediction.ch/",
    desc: "Web tool that predicts likely macromolecular targets of small molecules.",
    supports: ["Target rankings", "probability scores"],
    updates: "Model refresh yearly",
    api: "Web (HTML)",
    citation: "Daina A, et al. Nucleic Acids Res. 2019.",
    usedFor: "One of the ensembled predictors behind Compound Target Prediction scores.",
  },
];

const CAT_COLOR = {
  chemistry:  { bg: "bg-[#5139ED]/8",  fg: "text-[#5139ED]"  },
  target:     { bg: "bg-[#0EA5E9]/8",  fg: "text-[#0EA5E9]"  },
  disease:    { bg: "bg-[#F97316]/8",  fg: "text-[#F97316]"  },
  pathway:    { bg: "bg-[#8139ED]/8",  fg: "text-[#8139ED]"  },
  structural: { bg: "bg-[#EF4444]/8",  fg: "text-[#EF4444]"  },
  phyto:      { bg: "bg-[#2BB673]/8",  fg: "text-[#2BB673]"  },
  pharma:     { bg: "bg-[#EAB308]/10", fg: "text-[#B45309]"  },
};

/* ─────────────────────────── Card ─────────────────────────── */
function DBCard({ db, index }) {
  const [copied, setCopied] = useState(false);
  const color = CAT_COLOR[db.category] || CAT_COLOR.chemistry;

  const copyCite = async () => {
    try {
      await navigator.clipboard.writeText(db.citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  return (
    <motion.article
      data-testid={`db-card-${db.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.45, delay: (index % 8) * 0.03, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="group relative flex flex-col rounded-2xl border border-[#E7E7F3] bg-white/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-sm transition-all hover:border-[#5139ED]/40 hover:shadow-[0_18px_40px_-24px_rgba(81,57,237,0.35)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${color.bg} ${color.fg}`}>
            <DatabaseIcon className="h-4 w-4" />
          </span>
          <h3 className="font-headline text-[15px] font-bold tracking-tight text-[#111827]">
            {db.name}
          </h3>
        </div>
        <a
          href={db.url}
          target="_blank"
          rel="noreferrer"
          data-testid={`db-open-${db.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition hover:bg-[#F1F5F9] hover:text-[#5139ED]"
          aria-label={`Open ${db.name} website`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-[#4B5563]">{db.desc}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[11.5px]">
        <div>
          <dt className="font-semibold uppercase tracking-wider text-[#94A3B8]">Updates</dt>
          <dd className="mt-0.5 text-[#374151]">{db.updates}</dd>
        </div>
        <div>
          <dt className="font-semibold uppercase tracking-wider text-[#94A3B8]">API</dt>
          <dd className="mt-0.5 text-[#374151]">{db.api}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">Supported data</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {db.supports.map((s) => (
            <li key={s} className="rounded-full border border-[#E7E7F3] bg-white px-2.5 py-0.5 text-[11px] text-[#374151]">
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-[#E7E7F3] bg-[#F8FAFC] p-3">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-[#5139ED]">
          Used in PhytoNet AI
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#374151]">{db.usedFor}</p>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11.5px] text-[#64748B]">
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          <span className="line-clamp-1">{db.citation}</span>
        </span>
        <button
          type="button"
          onClick={copyCite}
          data-testid={`db-cite-${db.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
          className="ml-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[#5139ED] transition hover:bg-[#5139ED]/8"
          aria-label={`Copy citation for ${db.name}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Cite"}
        </button>
      </div>
    </motion.article>
  );
}

/* ───────────────────────── Page ───────────────────────── */
export default function DatabasesHub() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return DBS.filter((db) => {
      if (cat !== "all" && db.category !== cat) return false;
      if (!query) return true;
      const hay = [
        db.name, db.desc, db.category, db.usedFor,
        ...db.supports,
      ].join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [q, cat]);

  const countByCat = useMemo(() => {
    const m = { all: DBS.length };
    for (const db of DBS) m[db.category] = (m[db.category] || 0) + 1;
    return m;
  }, []);

  return (
    <main data-testid="databases-hub-page" className="relative overflow-hidden bg-white">
      {/* ── Header ── */}
      <section className="relative overflow-hidden border-b border-[#E7E7F3] bg-gradient-to-b from-[#F5F3FF] via-white to-white pb-16 pt-16">
        <div aria-hidden className="brand-blur absolute -left-32 top-0 h-[360px] w-[360px] bg-[#5139ED]" />
        <div aria-hidden className="brand-blur absolute -right-24 top-24 h-[300px] w-[300px] bg-[#2BB673]" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5139ED]">
            <DatabaseIcon className="h-3.5 w-3.5" />
            Central Knowledge Hub
          </div>
          <h1 className="font-headline mt-3 text-[36px] font-bold tracking-[-0.02em] text-[#111827] sm:text-[44px]">
            Every database <span className="gradient-text">that powers PhytoNet AI</span>
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-[#4B5563]">
            Browse each biological, chemical, pharmacological, structural, pathway and phytochemical
            data source integrated into the platform. Every entry tells you what it stores, how often
            it updates, whether it exposes an API, and exactly where PhytoNet AI consumes it.
          </p>

          {/* Search + category chips */}
          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
              <Input
                data-testid="db-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search databases (e.g. KEGG, target, structure)…"
                className="h-11 rounded-full border-[#E7E7F3] bg-white pl-10 text-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {CATEGORIES.map((c) => {
                const Ic = c.icon;
                const active = cat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCat(c.id)}
                    data-testid={`db-cat-${c.id}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                      active
                        ? "border-[#5139ED] bg-[#5139ED] text-white shadow-[0_10px_24px_-14px_rgba(81,57,237,0.7)]"
                        : "border-[#E7E7F3] bg-white/70 text-[#374151] hover:border-[#5139ED]/40 hover:text-[#5139ED]"
                    }`}
                  >
                    <Ic className="h-3.5 w-3.5" />
                    {c.label}
                    <span className={`ml-1 rounded-full px-1.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-[#F1F5F9] text-[#64748B]"}`}>
                      {countByCat[c.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Grid ── */}
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mb-5 flex items-center justify-between text-[13px] text-[#64748B]">
          <span data-testid="db-count">
            Showing <strong className="text-[#111827]">{filtered.length}</strong> of {DBS.length} databases
          </span>
          <Link
            to="/phytonet-ai"
            data-testid="db-cta-launch-ai"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E7F3] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#111827] transition hover:border-[#5139ED]/40 hover:text-[#5139ED]"
          >
            Launch AI Workflow <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div data-testid="db-empty" className="rounded-2xl border border-dashed border-[#E7E7F3] bg-white/70 p-16 text-center">
            <p className="text-[14px] text-[#64748B]">No databases match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((db, i) => (
              <DBCard key={db.name} db={db} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* ── Footer CTA ── */}
      <section className="border-t border-[#E7E7F3] bg-[#F8FAFC] py-14">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-[#2BB673]" />
          <h2 className="font-headline mt-3 text-[24px] font-bold tracking-tight text-[#111827]">
            Missing a database you'd like to see indexed?
          </h2>
          <p className="mt-3 text-[14px] text-[#4B5563]">
            Every integration in PhytoNet AI is peer-reviewed and cross-linked. If your workflow
            relies on a source we haven't listed, let us know and we'll evaluate it for the next release.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/phytonet-ai"
              data-testid="db-footer-launch"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#5139ED] via-[#395AED] to-[#8139ED] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_10px_28px_-10px_rgba(81,57,237,0.65)] transition-transform hover:-translate-y-0.5"
            >
              Launch AI Workflow <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/"
              data-testid="db-footer-home"
              className="inline-flex items-center gap-2 rounded-full border border-[#E7E7F3] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#111827] transition hover:border-[#5139ED]/40 hover:text-[#5139ED]"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
