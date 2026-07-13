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
- P1: Step 3 — Target Prediction (SwissTargetPrediction / STITCH)
- P1: Step 4 — Disease Target Identification (OMIM / DisGeNET / GeneCards)
- P2: Step 5 — Network Analysis (cytoscape.js + STRING PPI)
- P2: Step 6 — Molecular Docking (AutoDock Vina)
- P2: Step 7 — Molecular Dynamics (GROMACS)
- P2: Step 8 — AI Scientific Report generation
- P3: SaaS auth + billing tiers
- Refactor: DrugLikeness.jsx (1462 lines) → extract FilterCard/ResultsTable/ScoreBreakdown into `/components/druglikeness/*`
- Refactor: split `server.py` into `/app/backend/routes/*`, models into `/app/backend/models/*`
