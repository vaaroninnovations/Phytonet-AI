# Dr. / — Network Pharmacology SaaS

## Original Problem Statement
Build a production-ready SaaS web application for Network Pharmacology with a
modern, clean, scientific interface (white background, palette #5139ED /
#8139ED / #395AED, glassmorphism, rounded, premium SaaS look).
Home page: hero "Dr. /", subheading "Your Research AI Assistant", description,
primary CTA "Plant Database", 8 feature cards.
Plant Database page: search medicinal plants → IMPPAT + LOTUS in parallel;
LOTUS APIs (simple/exact/substructure/molweight); user-selectable output
fields; sortable/searchable/paginated results table; export CSV/XLSX/JSON.

## User Choices (2026-02-09)
- Scope: full Home + fully-functional Plant Database, other feature cards "Coming soon"
- IMPPAT: real HTML scraping (BeautifulSoup)
- Auth: public, no login
- Structure rendering: SmilesDrawer (client-side)
- Fonts: Sora + Plus Jakarta Sans + Inter

## Architecture
- Backend: FastAPI (`/app/backend/server.py`) — httpx + BeautifulSoup scrapes IMPPAT
  listing / detail / physchem pages in parallel; wraps LOTUS REST APIs.
  Endpoints: `/api/plant/search`, `/api/lotus/simple`, `/api/lotus/exact`,
  `/api/lotus/substructure`, `/api/lotus/molweight`, `/api/health`.
- Frontend: React (CRA + craco). Routes `/`, `/plant-database`, `/tool/:slug`.
  SmilesDrawer canvas for structure cells, xlsx + file-saver for exports,
  framer-motion for entrance animations, sonner for toasts.
- No auth. No DB writes (Mongo client wired only for future use).

## Implemented (2026-02-09)
- Home hero, 8-feature grid (1 Live + 7 Coming Soon), how-it-works ribbon, CTA
- Plant Database with 5 search modes (Plant / LOTUS simple/exact/substructure/molweight)
- 8 selectable output fields (compound name, structure, formula, weight, IMPPAT ID, SMILES, InChI, InChI Key)
- Results table: search-within, sort, pagination, row count, loading skeleton, empty state, progress bar
- Exports CSV/XLSX/JSON
- IMPPAT scraper with parallel enrichment (max 12 concurrent), formula derived from InChI
- Sticky glass header, sticky footer, sonner toaster
- All interactive elements have data-testid

## Implemented (2026-02-12)
- 9-step persistent WorkflowSidebar across all modules
- LC-MS Upload (.csv/.xlsx) with PubChem/LOTUS SMILES enrichment
- Automatic Compound Standardization (PubChem/ChEBI/LOTUS dedupe)
- Step 2 — ADMET & Drug-Likeness Analysis via local `admet-ai` (async polling)
- **ADMET Configurable Scoring Engine** (2026-02-12):
  - Compact `ScoringConfigPanel` — editable weights (Drug-Likeness 35% / ADME 35% / Toxicity 30%) with live total badge; scoring disabled when total ≠ 100
  - Final Score (0–100) + Star Assessment + Ranking + expandable per-row breakdown

## Implemented (2026-02-13)
- **Steps 3 & 4 — Compound & Disease Target Identification** (real database integrations, no proprietary APIs):
  - Backend service `/app/backend/target_service.py`: RDKit Morgan fingerprint → ChEMBL similarity search + bioactivity extraction → BindingDB → UniProt annotation → HGNC gene normalization. Consensus 1–5★ confidence combines multi-source evidence + pChEMBL potency + Tanimoto similarity. Ligand-similarity approach chosen over DeepPurpose install (PyTorch/DGL heavy) — declared transparently as "DeepPurpose (RDKit-similarity)" in supporting DBs
  - Backend service `/app/backend/disease_service.py`: Open Targets Platform GraphQL (associatedTargets) + CTD batch API + NCBI Gene E-utilities + UniProt Disease annotation, all merged and normalized via HGNC. Live query returns 261 T2DM-associated genes in ~5s (cached) / ~60s cold
  - New endpoints: `POST /api/target/predict`, `GET /api/target/status/{job_id}`, `GET /api/disease/search`, `GET /api/disease/targets` with MongoDB caching (`target_cache_v1`, `disease_cache_v1`) — 7-day TTL
  - New pages: `TargetPrediction.jsx`, `DiseaseTargets.jsx`, `NetworkAnalysis.jsx`
  - `NetworkContext` propagates `selectedCompounds` (from ADMET) → `compoundTargets` → `diseaseTargets` → Network Analysis
  - Filters with (?) tooltips: confidence · protein class · protein family · supporting DB · experimental evidence · organism (compound side); min-score · min-confidence · evidence · DB · protein class (disease side)
  - Auto-Select with configurable ★ threshold (default 4★), human-only, dedup
  - CSV / Excel exports with full traceability (compound name, SMILES, gene, UniProt, confidence, evidence, sources)
  - Sidebar renamed: "Target Prediction" → **"Compound Target Identification"** to match user's spec
  - Verified 100% backend + Disease frontend flow (iteration_15.json). Target compound flow validated at empty-state, sidebar, and backend-API level; full end-to-end walkthrough usable in the app but requires ~2 min due to real external API latency

- **Universal sortable columns** (2026-02-13):
  - Reusable hook `/app/frontend/src/lib/useSortable.js` + `<SortableTh />` component
  - 3-state click cycle per column: **asc (↑) → desc (↓) → default (⇅)**
  - Type-aware sorting: numbers → numerical, booleans → boolean, everything else → `localeCompare` with `numeric:true` (so AKT1 < AKT2 < AKT10 not AKT1 < AKT10 < AKT2)
  - Null / undefined values always sort to the END regardless of direction
  - Applied to: Plant Database Results (3-state cycle now on 8 columns), ADME Results / Toxicity Results / Drug-Likeness Results (all shared `ResultsTable` gets sortable Rank / Score / Assessment / Compound + every dynamic ADMET column), Target Prediction Results (9 columns), Disease Targets Results (8 columns)
  - Composes correctly with search, filters, pagination, row selection, and CSV/Excel export — export honours the visible sorted order
  - Live verified: on Type-2-Diabetes disease targets, Gene column ⇅ → ↑ **ABCC8** → ↓ **ZMIZ1** → ⇅ back to default **KCNJ11**

- **Network Analysis — Subsections 1, 2, 3, 5 shipped; 4 (GO) scaffolded** (2026-02-13):
  - New page structure: left sub-navigation with 5 gated subsections; active is highlighted, completed shows green ✓, future steps are locked
  - **Target Intersection Analysis — FULLY IMPLEMENTED**:
    - Auto-computes compound-targets ∩ disease-targets from upstream `NetworkContext`
    - Publication-quality **SVG Venn diagram** (2-set, purple/violet fills, plant/disease labels)
    - Native downloads: **SVG · PNG 300/600 dpi · TIFF 300/600 dpi · PDF** (jsPDF + UTIF, all client-side)
    - Intersecting Targets table with 3-state sortable columns, checkboxes, CSV + Excel export
  - **PPI Analysis — FULLY IMPLEMENTED**: `POST /api/ppi/network` proxies STRING REST (`https://string-db.org/api/tsv-no-header/network`). Interactive Cytoscape.js graph with force-directed cose layout, zoom/pan/drag/select. Controls for min score (150/400/700/900), network type (functional/physical), first-shell interactors, remove-isolated toggle. CSV export of edge list with per-channel scores. Live test: 5 seeds → 8 edges (AKT1-MAPK1 0.988, TP53-MAPK1 0.998)
  - **Hub Gene Analysis — 3 of 10 algorithms shipped**: Degree, Betweenness (Brandes O(V·E)), Closeness (Wasserman-Faust) — all client-side in `/app/frontend/src/lib/hubScoring.js`. Metric picker, Top-N configurable, sortable table, CSV export. Remaining 7 algorithms (MCC / MNC / DMNC / EPC / Stress / Radiality / Bottleneck) roadmapped
  - **GO Enrichment**: placeholder card (g:Profiler REST wiring next)
  - **KEGG Enrichment — FULLY IMPLEMENTED**: `POST /api/kegg/enrich` proxies Enrichr (KEGG_2021_Human library). Pathway table + bubble plot (−log10 P × pathway, size = gene count). Filters: Top-N + Max adj-P. CSV export. Live test: 8-gene query → 155 enriched pathways (top: Pancreatic cancer p=6.9e-17, 7 overlap genes)

- **ADMET page 3-section reorganization** (no visual redesign):
  - `ADME Analysis Filters` grouped into Absorption / Distribution / Metabolism / Excretion rows → dynamic `ADME Results` table
  - `Toxicity Analysis Filters` (Genetic / Cardiac / Hepatic / Dermal / Clinical / Acute) → dynamic `Toxicity Results` table
  - `Drug-Likeness Assessment Filters` (Rules + Numeric properties, incl. Pfizer 3/75 + GSK 4/400) → `Common Drug-Likeness Criteria` reference card → dynamic `Drug-Likeness Results` table
  - Every parameter has a (?) tooltip via Radix + shadcn Tooltip explaining meaning, preferred outcome, and acceptable range
  - Per-section dynamic column logic: no active filter → all columns; any active filter → only selected columns (behaves independently per section)
  - CYP dropdowns dynamically expose Substrate/Non-substrate only for CYPs with substrate data in ADMET-AI (2C9 / 2D6 / 3A4); others show 3-option (Any / Inhibitor / Non-inhibitor)
  - Parameter registry at `/app/frontend/src/lib/admetParams.js` — future ADMET endpoints slot in without UI changes
  - Verified 37/37 by testing agent (iteration_13.json)

- **ADMET module enhancements** (iteration_14, 2026-02-13):
  - Toxicity filter card converted to a flat horizontal grid layout (no sub-categories)
  - LD50 (mg/kg) derived column added to Toxicity Results — computed client-side as 10^(-prediction) × MW × 1000; shares LD50 filter key
  - **Auto Analyse** button in the Scoring Configuration card — one-click applies published medicinal-chemistry criteria (Lipinski/Veber/Ghose/Egan/Muegge/Pfizer/GSK + numeric thresholds; high HIA/PAMPA/bioavailability; CYP non-inhibitor; non-AMES/hERG/DILI/carcinogenicity/skin/clintox; LD50 ≥ ~100 mg/kg-equivalent)
  - Final Auto Analysis ranked table showing Rank / Compound / Final Score / Drug-Likeness Assessment / Overall ADMET Assessment / ★ Recommendation + "Recommended for Downstream: Yes/No"
  - Export now includes DL Assessment, Overall ADMET Assessment, Final Recommendation, and Recommended-for-Downstream flag

- **Plant Database top-row layout** (2026-02-13):
  - Plant Database Search card (75% width, `md:col-span-3`) + Experimental LC-MS Data card (25% width, `md:col-span-1`) sit side-by-side on desktop with matching heights (grid `items-stretch` + inner `h-full flex-col`)
  - Mobile: stacks vertically (search first, LC-MS second) via `grid-cols-1`
  - LC-MS card gets a compact mode (`compact` prop) with a condensed drop-zone, no "Required columns" chip row, and the new helper copy "Upload experimentally identified LC-MS phytochemical data for downstream analysis."
  - All existing functionality unchanged (parse, PubChem/LOTUS enrichment, populate compound table)

## Backlog / Next Actions
- P2: Step 5 — Network Analysis full graph (cytoscape.js + STRING PPI + hub scoring; transfer/summary scaffold in place)
- P2: Step 6 — Molecular Docking (AutoDock Vina)
- P2: Step 7 — Molecular Dynamics (GROMACS)
- P2: Step 8 — AI Scientific Report generation
- P3: SaaS auth + billing tiers
- Refactor: DrugLikeness.jsx (1772 lines) + TargetPrediction.jsx + DiseaseTargets.jsx (~700+ each) → extract shared FilterCard / ResultsTable / AutoSelectCard / ProceedBar into `/components/*`
- Refactor: split `server.py` into `/app/backend/routes/*`, models into `/app/backend/models/*`
