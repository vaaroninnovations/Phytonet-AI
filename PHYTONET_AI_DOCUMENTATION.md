# PhytoNet AI — Technical & Functional Documentation

*A concise, scientifically accurate reference for manuscripts, presentations and internal documentation. All facts below are verified against the live codebase.*

---

## 1. What is PhytoNet AI?

**PhytoNet AI** is a production-grade, cloud-hosted network-pharmacology and computational drug-discovery platform for medicinal plants and natural products. It compresses the classical multi-tool phytochemical pipeline — compound harvest → target prediction → disease-target overlap → PPI + pathway enrichment → molecular docking → dynamics → scientific report — into a single, reproducible browser workflow driven by curated public bioactivity databases and modern computational tooling.

### 1.1 Purpose and primary use cases
* Rapid hypothesis generation for **plant-based drug discovery** (traditional medicine, ethnopharmacology, nutraceutical R&D).
* **Mechanism-of-action reconstruction** for a plant, a phytochemical or a formulation.
* **Repurposing** natural products against a disease phenotype.
* **Teaching / graduate research** — reproducible network-pharmacology projects with a full audit trail.

### 1.2 Target users
* Academic researchers in pharmacology, phytochemistry, ethnopharmacology, systems biology, bioinformatics.
* Nutraceutical / botanical R&D teams that need reproducible target-and-pathway evidence.
* Graduate students who need a well-documented pipeline without wiring together seven CLI tools.

### 1.3 Main scientific / research applications
| Application | PhytoNet AI capability |
|---|---|
| Phytochemical profiling | LOTUS-driven compound harvest with automatic SMILES / InChIKey standardisation |
| Compound–target discovery | ChEMBL bioactivity + BindingDB + Open Targets + RDKit Tanimoto consensus |
| Disease-target overlap | Open Targets + CTD + UniProt cross-reference |
| PPI network construction | STRING v12 API, per-species (human default) |
| Pathway & GO enrichment | KEGG (via Enrichr proxy) + GO Biological Process / Molecular Function / Cellular Component |
| Docking-based validation | AutoDock Vina, exhaustiveness 8, 9 poses per pair, batch across compounds and targets |
| Molecular dynamics *(v2.0)* | amber99sb-ildn force field configuration; GROMACS worker roadmap |
| Manuscript-ready reports | LLM-drafted scientific reports with cited data sources |

### 1.4 Differentiators vs conventional workflows
1. **No local software installation** — a browser is the only requirement; Vina, RDKit, STRING, ChEMBL, KEGG and OpenTargets are all wired in server-side.
2. **Fully reproducible** — every input, parameter, intermediate table, pose file and figure is versioned in the project.
3. **Consensus scoring** — target predictions collapse ChEMBL similarity + BindingDB + Open Targets + CTD + UniProt into a single 1★–5★ confidence, avoiding single-source bias.
4. **Cited AI narrative** — an LLM writes the "Introduction / Results / Discussion" narrative using **only the numeric evidence already computed**, not free-text hallucination.
5. **Node-metered pricing** — clear per-computation cost model instead of an all-or-nothing SaaS subscription.
6. **Cross-referenced audit trail** — every table row links back to its ChEMBL / UniProt / KEGG / PubMed identifier.

---

## 2. Complete PhytoNet AI Workflow

```
   ┌────────────┐
   │ 1. Plant / │ user enters plant name  OR  a compound list  OR  a target
   │ compound   │
   │ query      │
   └─────┬──────┘
         ▼
   ┌────────────────────┐
   │ 2. Phytochemical   │  LOTUS + user upload + curated seed
   │ collection         │  → RDKit standardisation → InChIKey dedup
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 3. ADMET / drug-   │  RDKit descriptors + Lipinski / Ghose / Veber /
   │ likeness filter    │  Egan / Muegge / QED + optional admet_ai NN
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 4. Target          │  ChEMBL similarity (Tanimoto)  +  BindingDB
   │ prediction         │  + Open Targets + CTD + UniProt annotation
   │ (consensus 1–5★)   │  → per-compound → merged target list
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 5. Disease targets │  Open Targets Platform (GraphQL v4)
   │                    │  + CTD Batch Query
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 6. Intersection    │  Predicted targets ∩ Disease targets
   │                    │  → "common therapeutic targets"
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 7. PPI network     │  STRING v12 (confidence ≥ 0.4 by default)
   │ + hub detection    │  → degree / betweenness → hub list
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 8. GO / KEGG       │  Enrichr → KEGG (hsa) + GO-BP / MF / CC
   │ enrichment         │  → adj. p ≤ 0.05, top N pathways
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 9. Molecular       │  AutoDock Vina · exhaustiveness 8 · 9 modes
   │ docking            │  ChEMBL/PDB structure resolver + grid autoboxing
   │ (batch)            │  → per-pose binding energy + interactions
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 10. MD (v2.0)      │  amber99sb-ildn — GROMACS worker roadmap
   └─────┬──────────────┘
         ▼
   ┌────────────────────┐
   │ 11. AI scientific  │  Claude Sonnet 4.5 (via llm_provider)
   │ report             │  → introduction · results · discussion · references
   └────────────────────┘
```

### 2.1 Step-by-step

| # | Step | User input | Automatic actions | Output |
|---|---|---|---|---|
| 1 | **Project creation** | Project name, hypothesis | New project doc; version 1 saved | project id, empty workspace |
| 2 | **Phytochemical collection** | Plant / compound query, or CSV/SDF upload | LOTUS API query; InChIKey de-dup; RDKit standardisation | Compound table (CID, SMILES, InChIKey, source) |
| 3 | **ADMET & drug-likeness** | *(none — auto-runs on the compound table)* | RDKit MW, LogP, TPSA, HBA/HBD, rot-B, QED; Lipinski / Ghose / Veber / Egan / Muegge flags; optional admet_ai deep-model predictions | Filtered druggable set + property table |
| 4 | **Target prediction** | Confidence threshold (1–5★, default 3) | ChEMBL Tanimoto sim; BindingDB potency; Open Targets association; UniProt / HGNC annotation; consensus star scoring | Ranked target list w/ UniProt IDs, gene symbols, evidence counts |
| 5 | **Disease targets** | Disease name or MeSH / EFO / MONDO ID | Open Targets GraphQL v4 + CTD batch query; UniProt reconciliation | Disease-target list w/ score |
| 6 | **Common target intersection** | *(none)* | Set intersection with union deduplication | "Compound × Target × Disease" mapping matrix |
| 7 | **PPI network** | Confidence cutoff (default 0.4), species (default *H. sapiens* / 9606) | STRING v12 API network; NetworkX degree + betweenness; hub selection | Nodes + edges JSON, interactive Cytoscape graph |
| 8 | **GO / KEGG enrichment** | *(none)* | Enrichr → KEGG_Human_2021 + GO Biological Process / Molecular Function / Cellular Component | Enrichment tables (term, adj-p, overlap, combined score); barplots |
| 9 | **Molecular docking** | Target list, PDB ID (or auto-pick), optional custom grid box | RDKit ligand prep → PDBQT; auto grid-box from co-crystal ligand or centroid; AutoDock Vina batch; interaction fingerprint | Per-pair table with 9 poses, binding energy (kcal/mol), 3Dmol.js viewer, interaction diagrams |
| 10 | **Molecular dynamics** *(preview)* | Selected pose | Server-side setup config (amber99sb-ildn). Full GROMACS worker execution is on the v2.0 roadmap and is currently **mocked**. | Trajectory placeholder; parameters exported |
| 11 | **AI scientific report** | *(one click)* | Prompt built strictly from computed tables. Claude Sonnet 4.5 drafts intro / results / discussion; every citation resolves to an existing DB identifier | Markdown + PDF-ready report |

---

## 3. Phytochemical Module (`routes/lotus.py`, `plants_seed.py`)

### 3.1 Data sources
* **LOTUS Natural Products Online** — `https://lotus.naturalproducts.net/api/search` (simple, exact-structure, substructure, molecular-weight endpoints).
* **User uploads** — CSV, SDF, or SMI files parsed with RDKit.
* **Curated plant seed** — a static, admin-editable catalogue of common medicinal plants used to bootstrap workflows.

### 3.2 Compound identification & standardisation
* SMILES canonicalised via RDKit; InChIKey computed as the primary dedup key.
* Salt-stripping and neutralisation handled by RDKit's `MolStandardize` pipeline.
* Missing structures re-resolved from LOTUS `exact-structure` (InChI) and, when needed, ChEMBL `molecule/{chembl_id}`.

### 3.3 Duplicate removal
* Two-level dedup: **InChIKey** first (definitive), then **LOTUS id** as fallback to catch upstream duplicates.

### 3.4 Filtering & validation
* Molecular-weight window configurable (LOTUS `molweight` endpoint).
* Compounds without a resolvable SMILES are flagged and *excluded* from downstream steps but kept in the compound table for audit.

---

## 4. Target Prediction Module (`target_service.py`)

### 4.1 Technology stack
| Step | Source |
|---|---|
| Similarity search | ChEMBL REST `/similarity/{smiles}/{threshold}` |
| Bioactivity retrieval | ChEMBL `/activity` (human single-protein, pChEMBL ≥ 5) |
| Complementary evidence | BindingDB REST, Open Targets Platform v4 (GraphQL), CTD Batch Query |
| Protein annotation | UniProt REST, HGNC REST |
| Chemistry | RDKit Morgan fingerprint (r=2, 2048 bits), Tanimoto |

### 4.2 Consensus confidence (1–5★)
```
5★  ≥ 3 supporting DBs + experimental evidence + strong potency (pChEMBL ≥ 7)
4★  ≥ 2 supporting DBs + numeric activity
3★  1 DB with experimental activity  OR  ≥ 2 DBs (in-silico)
2★  ≥ 1 DB predicted-only
1★  weak similarity hit, no potency
```

### 4.3 Filtering, species and ranking
* **Species** — human by default (organism = *Homo sapiens*); user can restrict to species-specific ChEMBL activities.
* **pChEMBL threshold** — activities filtered to numeric pChEMBL ≥ 5 (μM potency or better).
* **Tanimoto cutoff** — default 40% ChEMBL similarity (`SIM_MIN`) to keep the neighbour set biologically meaningful.
* Targets ranked by ★ then by supporting-DB count then by max pChEMBL.

---

## 5. Disease-Target & Network Pharmacology (`disease_service.py`, `network_service.py`)

### 5.1 Disease-target retrieval
* **Open Targets Platform** — GraphQL v4 (`api.platform.opentargets.org`) queries a disease EFO/MONDO id → target list with `overallAssociationScore`.
* **CTD** — `ctdbase.org/tools/batchQuery.go` chemical-disease-target support.
* **UniProt / HGNC** used to reconcile identifiers.

### 5.2 Compound–target relationships & common-target logic
* For each disease and each compound, the module intersects **predicted targets ∩ disease targets** to yield the "common therapeutic targets" set that drives everything downstream.

### 5.3 PPI network
* **STRING v12** REST (`string-db.org/api`) — confidence cutoff configurable (default 0.4).
* NetworkX computes **degree**, **betweenness centrality** and identifies **hub proteins** (top-percentile by degree, default 90th).

### 5.4 Enrichment (GO + KEGG)
* KEGG pathway list primed from `rest.kegg.jp/list/pathway/hsa` (cached).
* Enrichment via **Enrichr** proxy against `KEGG_2021_Human`, `GO_Biological_Process_2023`, `GO_Molecular_Function_2023`, `GO_Cellular_Component_2023`.
* **Statistical filter** — Benjamini-Hochberg adjusted p ≤ 0.05, top N (default 25).

---

## 6. Molecular Docking Module (`docking_service.py`, `docking_render.py`, `docking_validation.py`)

### 6.1 Docking engine
* **AutoDock Vina** command-line binary (resolved via `deps_check.vina_path()`).
* Default parameters — `--exhaustiveness 8 --num_modes 9`, seed pinned for reproducibility.

### 6.2 Protein & ligand preparation
* Ligands: RDKit → PDBQT via internal converter (protonation at pH 7.4).
* Proteins: PDB fetched from **RCSB** (`files.rcsb.org`) → cleaned (waters, ions, alt-conformers) → PDBQT with polar hydrogens.

### 6.3 PDB selection
* Auto-select: query UniProt → SIFTS-mapped PDB structures ranked by resolution.
* Manual override: user can pin any 4-letter PDB code per target.

### 6.4 Grid-box generation
* **Auto** — centroid of the co-crystal ligand ± user-controlled padding (default 6 Å); if no co-crystal ligand, blind box around whole cavity via cavity-detection.
* **Manual** — full XYZ center + size UI in the docking page.

### 6.5 Binding energy, poses & interactions
* 9 poses per pair, energy in kcal/mol parsed from `vina.log`.
* Per-pose interaction analysis (H-bonds, hydrophobic, π-stacking) rendered in the 3Dmol.js viewer.

### 6.6 Validation
* `docking_validation.py` provides **redocking** of the co-crystal ligand and reports **RMSD to native pose**, plus a warning banner if RMSD > 2 Å.

---

## 7. AI Component

### 7.1 Where AI is used
| Component | Type |
|---|---|
| **Target prediction** | *ML feature-engineering* — RDKit Morgan fingerprints + Tanimoto; consensus scoring is a rule-based aggregation, **not** a neural net. |
| **ADMET (optional deep model)** | `admet_ai` neural predictor for endpoints where RDKit descriptors alone are insufficient. |
| **AI Scientific Report** | **Claude Sonnet 4.5** (`claude-sonnet-4-5-20250929`) via `llm_provider.py`. Prompt is built strictly from already-computed tables — the LLM never generates numbers. |
| **Assistant helpers** | LLM answers user chat questions about their own project data (RAG over the project tables). |

### 7.2 Where AI is **not** used
* Docking (AutoDock Vina — a physics-based search).
* PPI network construction (STRING API).
* Enrichment (Enrichr statistics).
* Compound harvest (LOTUS API).
* Molecular dynamics (classical MD).

### 7.3 What the LLM specifically contributes
1. Drafts the **narrative sections** of the scientific report from the numeric evidence.
2. Provides **natural-language chat** over the user's project.
3. Explains individual figures and rows on request.
4. **Cites** every claim to a database identifier already present in the project.

### 7.4 Model routing
The `llm_provider.py` wrapper is dual-backend:
* Direct **Anthropic SDK** when `ANTHROPIC_API_KEY` is present (self-hosted / Hostinger).
* **Emergent Universal Key** otherwise (managed platform).
Both routes resolve to the same Claude Sonnet 4.5 model id.

---

## 8. Automation & Human-in-the-Loop

### 8.1 Fully automated
* Compound harvest, dedup, standardisation.
* ADMET descriptor computation.
* Target prediction and consensus scoring.
* Disease-target retrieval.
* Intersection + PPI + enrichment.
* Docking-pair enumeration, ligand/protein prep, Vina execution, log parsing, interaction analysis.
* Report drafting.

### 8.2 Sequential auto-chaining
Yes — the project workflow proceeds step-by-step from a single input (plant / disease). Every step blocks on the previous and passes its output forward through the project store.

### 8.3 Researcher intervention
* Choosing which star-threshold to accept from the target list.
* Overriding auto-picked PDB codes.
* Manually setting docking grid box, if desired.
* Approving the AI report before download.

### 8.4 Error handling & data-quality safeguards
* Failing API calls → retried with exponential back-off, then surfaced as a per-row error flag (row is kept for audit but excluded from downstream).
* Bad SMILES → parsed and marked; never propagated to Vina.
* Vina failures → captured in `vina.log` and reported in the results table.

---

## 9. Databases & External Resources

| Resource | Access | Purpose |
|---|---|---|
| LOTUS Natural Products | REST API | Natural-product compounds |
| ChEMBL | REST API (data v34+) | Similarity + bioactivity |
| BindingDB | REST API | Complementary binding data |
| Open Targets Platform | GraphQL v4 | Disease-target associations |
| CTD (Comparative Toxicogenomics DB) | Batch Query API | Chemical–disease–target evidence |
| UniProt | REST API | Protein annotation |
| HGNC | REST API | Gene-symbol reconciliation |
| STRING | v12 REST API | PPI networks |
| KEGG | REST + Enrichr proxy | Pathway lists (`hsa`) |
| GO | Enrichr `GO_*_2023` | Ontology enrichment |
| RCSB PDB | `files.rcsb.org` | 3-D protein structures |
| NCBI eUtils / PubMed | REST | Literature evidence |
| AutoDock Vina | Local binary | Docking engine |
| RDKit 2026.03 | Python | Cheminformatics |
| Claude Sonnet 4.5 | Anthropic SDK / Emergent Universal Key | Report generation, chat |

---

## 10. Results and Outputs

Per step the platform produces:

* **Tables** — CSV / JSON for every compound, target, disease-target, PPI edge, enrichment term and docking pose.
* **Graphs** — Cytoscape interactive PPI, GO/KEGG bar charts (Recharts), docking energy heatmap.
* **3-D viewers** — 3Dmol.js (WebGL) for docking poses and protein-ligand complexes.
* **Reports** — AI-drafted Markdown, exportable to PDF.
* **Session download** — every intermediate artefact (compound table, target table, PPI json, Vina logs, PDBQT files, images) is downloadable.
* **Reproducibility** — every project stores the exact parameters, seed and API responses, and can be re-run from the exact same inputs.

---

## 11. Project Management (`projects_service.py`)

* Projects stored in MongoDB with `_id` → user id mapping.
* `GET /api/projects` — user's list; `GET /api/projects/{id}` — full state.
* **Autosave** every ~30 s; server keeps the last **N** version snapshots.
* Parameters, inputs, intermediate tables, figures and final report are all inside the project doc (or blob-referenced).
* Projects can be **duplicated** and **re-run** with identical parameters (deterministic where possible).

---

## 12. Quality Control & Validation

* **Input validation** — RDKit sanitisation on every SMILES, MW / atom-count sanity checks.
* **Retry + circuit-breaker** on all external APIs.
* **Docking validation** — optional co-crystal redocking with RMSD reported.
* **Enrichment stats** — Benjamini-Hochberg FDR ≤ 0.05.
* **Audit trail** — every row carries its source identifier; the project's `versions` array preserves the history.
* **Consent gates** — the AI report shows the exact numeric tables it cited alongside the narrative.

---

## 13. Performance

| Dataset | Approx. wall time |
|---|---|
| Small (≤ 25 compounds, 1 disease) | 3 – 6 min end-to-end (excl. docking) |
| Medium (26 – 100 compounds, 1 – 3 diseases) | 12 – 30 min |
| Large (> 100 compounds, batch docking) | Hours; MD-class jobs deferred to worker queue |
| Docking pair (Vina, exh 8, 9 modes) | 15 – 60 s per pair on a modern CPU |

Practical ceilings:
* Compound list ≤ 2 000 rows (soft cap for interactive UI).
* Docking batch ≤ 500 pairs per project run (queue-managed).
* MD execution currently **mocked** — GROMACS worker is on the v2.0 roadmap.

---

## 14. Security & Data Privacy

* Auth: email/password (bcrypt + JWT) and **Emergent-managed Google OAuth 2.0**.
* **Data are user-scoped** — every query includes the authenticated user id.
* Uploaded research data are **never** used to train models.
* Passwords hashed with bcrypt; JWT with 24 h expiry; refresh via login.
* MongoDB access is `internal-only`; ingress is TLS-terminated at the Kubernetes edge; secrets loaded from `.env` (never committed).
* Backups: MongoDB snapshot policy at the infrastructure layer.
* Retention: user can delete a project at any time → hard-delete of the document.

---

## 15. Technical Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Client)                            │
│  React 19 · TailwindCSS · shadcn/Radix · Framer-Motion 11 · Cytoscape   │
│  3Dmol.js 2.5 (WebGL protein viewers) · Recharts (statistics graphs)    │
└─────────────┬────────────────────────────────────────────────────────────┘
              │   HTTPS  /api/*   (JWT bearer or session cookie)
              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       FastAPI backend (Python 3.11+)                     │
│   routes/  → research · target · disease · network · docking · md ·     │
│              lotus · nodes · admin · referrals · report · feedback      │
│                                                                          │
│   services/ → target_service · disease_service · network_service ·      │
│              docking_service · admet_service · report_service ·         │
│              projects_service · assistant_service · llm_provider        │
│                                                                          │
│   deps    → RDKit 2026.3 · scikit-learn 1.9 · torch 2.13 · networkx 3.6│
│   celery  → 5.3.6 (background docking / heavy jobs)                     │
└─────────────┬────────────────────────────────────────────────────────────┘
              │
   ┌──────────┼───────────────────────────────────────────────────────────┐
   ▼          ▼                                                            ▼
┌──────┐  ┌───────────────────────────┐                     ┌─────────────────────────┐
│Mongo │  │  External Public APIs      │                     │  Compute helpers        │
│(Motor│  │  ChEMBL · BindingDB ·      │                     │  AutoDock Vina (CLI)    │
│ 3.3) │  │  Open Targets · CTD ·      │                     │  admet_ai (optional NN) │
└──────┘  │  UniProt · HGNC · STRING · │                     │  GROMACS (v2.0)         │
          │  KEGG · Enrichr · LOTUS ·  │                     └─────────────────────────┘
          │  RCSB PDB · NCBI eUtils    │                                  ▲
          └──────────────┬─────────────┘                                  │
                         │                                                │
                         ▼                                                │
        ┌────────────────────────────────────┐                            │
        │  LLM Provider (llm_provider.py)    │────────────────────────────┘
        │  • Anthropic SDK (direct)          │
        │  • Emergent Universal Key (fallb.) │
        │  → Claude Sonnet 4.5               │
        └────────────────────────────────────┘
```

### 15.1 Stack summary
| Layer | Choice |
|---|---|
| Front-end | React 19, TailwindCSS, shadcn/Radix, Framer-Motion 11, Cytoscape 3.34, 3Dmol.js 2.5.5, Recharts 3.6 |
| Back-end | FastAPI, Motor 3.3.1, Celery 5.3.6, Pydantic v2 |
| Database | MongoDB (per-user projects; snapshot backups) |
| Chemistry | RDKit 2026.3.3 |
| ML | scikit-learn 1.9.0, PyTorch 2.13.0 + Lightning 2.6.5 (feature engineering / optional ADMET) |
| Docking | AutoDock Vina binary |
| MD *(v2.0)* | GROMACS force field: `amber99sb-ildn` |
| LLM | Anthropic SDK 0.121.0 (Claude Sonnet 4.5, `claude-sonnet-4-5-20250929`) |
| Auth | JWT (bcrypt) + Emergent-managed Google OAuth 2.0 |
| Payments | Razorpay (subscriptions + one-time bundles) |
| Deployment | Kubernetes; supervisor-managed FastAPI + React; production replicable on Hostinger via direct-Anthropic mode |

---

## 16. Current Version & Roadmap

| Status | Feature |
|---|---|
| **Live** | Plant Database, ADMET / drug-likeness, Target Prediction, Disease Targets, Common-Target intersection, PPI + Hub identification, GO / KEGG enrichment, Batch Docking (Vina), AI Scientific Report, Project autosave + version history, Referral program, Command Palette (⌘K), Node-metered billing |
| **Recently added** (Feb 2026) | Dual-backend LLM (Anthropic direct + Emergent Universal Key), Razorpay auto-renew subscriptions, Admin Sales & Metrics dashboards, Admin Promo CRUD, RESEARCH20 first-time discount, Referral leaderboard, Dark clinical-cyber marketing pages, Hero 3D ribbon with slow perspective drift, Fit-to-content Figure Customization drawer, Collapsible drawer sections |
| **In development / roadmap** | Server-side GROMACS MD workers (v2.0), PDF Fact Sheet export, "Download report" one-click PDF, Command-palette "Recent Views", Cheminformatics-native LLM function-calling for chat, Multi-agent execution for the workflow |

---

## 17. Recommended Manuscript / Presentation Description

> **PhytoNet AI** is a cloud-hosted, node-metered network-pharmacology and drug-discovery platform for medicinal plants and natural products. Beginning from a plant, phytochemical set or disease phenotype, PhytoNet AI orchestrates the full computational pipeline in a browser: LOTUS-driven compound harvest and RDKit standardisation → ADMET / drug-likeness filtering → consensus target prediction across ChEMBL Tanimoto similarity, BindingDB potency, Open Targets and CTD (aggregated into a 1★–5★ score) → disease-target overlap via Open Targets and CTD → STRING v12 PPI construction with degree- and betweenness-based hub identification → GO and KEGG enrichment through Enrichr with Benjamini-Hochberg FDR control → batch AutoDock Vina docking (exhaustiveness 8, 9 poses per pair) with automatic PDB retrieval, RDKit ligand preparation and interaction analysis in an embedded 3Dmol.js viewer.
>
> The platform combines **classical computational tools** (RDKit, AutoDock Vina, NetworkX, scikit-learn, Enrichr, STRING v12) with a **narrowly-scoped LLM layer** (Claude Sonnet 4.5, invoked via a dual-backend Anthropic / Emergent-Universal-Key wrapper) that drafts the manuscript-quality scientific report *strictly from the numerical evidence already computed*, cites every claim to its source identifier, and never generates numbers. All intermediates — compound tables, target tables, PPI JSON, Vina logs, pose PDBQTs, figures — are versioned inside the user's project and are individually downloadable, making every analysis fully reproducible.
>
> Delivered as a FastAPI + Motor / MongoDB back-end with a React 19 + TailwindCSS front-end (shadcn/Radix, Framer-Motion, Cytoscape, 3Dmol.js), PhytoNet AI runs entirely in the browser and requires no local software. Common use cases include mechanism-of-action reconstruction for a medicinal plant, natural-product repurposing against a disease phenotype, teaching reproducible network-pharmacology projects, and industry R&D screening of botanical libraries — with a per-computation node-cost model, an auditable trail of every data source and API call, and a Kubernetes-native architecture that is currently in production and can be self-hosted on Hostinger via the direct-Anthropic mode.

---
