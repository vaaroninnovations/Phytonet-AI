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

## Implemented (2026-02-13 — Iter 19 · Auth + Priority Matrix + AI Report)

- **Modal-based JWT auth** (bcrypt + PyJWT + HttpOnly cookies + rate-limited login + email verification with dev-mode token in logs). Admin seeded from env (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). `SiteHeader` shows Sign In / Sign Up buttons for guests and a user avatar dropdown (Dashboard / My Projects / Downloads / Profile / Settings / Logout) when logged in. **Guarded downloads**: every `TableToolbar`, `FigureToolbar`, `CyToolbar` action + MD build + Report download passes through `requireAuth()` — a guest click opens the modal and the queued download resumes automatically after login. Sign-Up form covers all requested fields (role dropdown w/ 13 options, research-area 10, purpose-of-use 9 checkboxes, referral 14, plus ORCID + website).
- **Home hero CTA** renamed **"Plant Database" → "PhytoNet AI"**.
- **Cross-workflow context**: `NetworkContext` now carries `intersectingGenes`, `hubScores` (real CytoHubba output), `ppiResult`, `goTerms`, `dockingResults`, `mdConfig`. Every module publishes to context; downstream modules consume automatically — no re-uploads.
- **Docking Priority Matrix**: compound × hub-gene pairs (filtered to compound-target relationships that hit an intersecting hub gene). Weighted priority (ADMET 30 % · Target Confidence 30 % · Hub 25 % · Disease Assoc 15 %) with 5-star recommendation + `dock-priority-auto-select` (≥ 80). Hub score now uses **real CytoHubba MCC + Degree composite** from context (not a fallback).
- **Docking Summary cards** (6 metrics) + **user-editable MD affinity threshold** (`dock-md-threshold`, default −7 kcal/mol) + button rename **"Proceed to Molecular Dynamics"**.
- **MD page button** renamed **"Generate AI Research Report"**. MD config now published to context on build.
- **NEW Module 8 — AI Manuscript Generator** (`/scientific-report`). Aggregates every context field into an IMRAD workflow payload → Claude Sonnet 4.5 (via Emergent LLM key) generates a publication-ready manuscript. Downloads: **Markdown / HTML / PDF (weasyprint w/ reportlab fallback) / DOCX (python-docx)**. Backend routes `POST /api/report/generate` + `GET /api/report/download/{id}?fmt=md|html|pdf|docx`.
- **PCTDPPanel button** renamed **"Proceed to Molecular Docking →"** (auto-navigates on click).
- **Backend tests**: 14 new tests all pass (auth 3 + report 2 + network 5 + docking/MD 4). Report generation endpoint fully wired but LLM budget currently exhausted — user must top-up in Profile → Universal Key → Add Balance to actually generate manuscripts.

## Implemented (2026-02-14 — Iter 20 · Save/Resume Projects · MD Execution Engines · SMTP)

- **Save/Resume Projects (P2)** — full persistence of the workflow across sessions:
  - Backend `/app/backend/projects_service.py` — `POST /api/projects` (create), `GET` (list), `GET /{id}`, `PUT /{id}` (update / rename), `DELETE /{id}`, `POST /{id}/duplicate`, `POST /{id}/snapshot` (version), `GET /{id}/versions`, `POST /{id}/restore/{version_id}`, `POST /autosave`, `GET /autosave/latest`, `DELETE /autosave`, `POST /autosave/promote`. All require JWT auth (admin@phytonet.ai / Admin123!).
  - Two Mongo collections: `projects` (with `is_autosave` flag) + `project_versions` (rotated at 50/project).
  - Frontend `ProjectContext.jsx` — aggregates NetworkContext + ResultsContext + SelectionContext + WorkflowContext into an opaque `workflow_state` blob. **Auto-save debounced 2s** on any downstream change (only fires for authenticated users). Snapshot serialization is future-proof (backend never inspects state).
  - Frontend `SaveProjectMenu.jsx` (header) — Save · Save As… (name + description) · Snapshot version · Open My Projects.
  - Frontend `/projects` page (`MyProjects.jsx`) — card grid with Resume · Rename (inline) · Duplicate · History (version list w/ restore) · Delete. Empty state + refresh + loading.
  - Frontend `ResumeSessionModal.jsx` — auto-prompts on login when an autosave exists; Resume (applies snapshot + navigates to `current_step`) or Discard.
  - Backend pytest `test_projects_and_engines.py` — 6/6 pass (CRUD lifecycle, autosave upsert/get/delete, require-auth 401, MD engines endpoint, md build local + hpc_slurm produce correct extra files).
- **MD Execution Engine Abstraction (P2)** — pluggable engines in `/app/backend/execution_engines.py`:
  - `local`  → emits `execution/local/README.md` + `run_local.sh` (with OMP threads + optional CUDA + extra flags).
  - `hpc_slurm` → emits `execution/hpc_slurm/submit.sh` with real SBATCH directives (partition, nodes, ntasks/node, cpus/task, mem, gres:gpu:N, walltime, module load, mail-user).
  - `cloud` → provider-agnostic launch spec (`execution/cloud/{provider}/dispatch.json` + README) for AWS / Azure / GCP / RunPod / Lambda Labs. Design-only preview — no live dispatch yet.
  - `GET /api/md/engines` returns the schema (label, category, description, options) so the frontend renders the picker dynamically — adding a new engine requires zero frontend changes.
  - MolecularDynamics.jsx now has `md-engine-*` picker + `md-engine-opt-*` dynamic option fields; `POST /api/md/build` accepts `engine` + `engine_options`.
- **Real SMTP Email Verification (P1)** — multi-provider `/app/backend/email_service.py`:
  - Providers via `EMAIL_PROVIDER` env: **gmail** · **sendgrid** · **mailgun** · **ses** · **resend** · **smtp** (generic).
  - Env vars added (all optional — blank = dev-log): `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_TLS`, `FRONTEND_URL`.
  - `auth_service.py` — 24h token TTL (was 3d), sends via `BackgroundTasks`, still logs the verification link + returns `verification_token_dev` for dev workflows.
  - New public endpoint `POST /api/auth/resend-verification-public` — password-gated resend for users whose token expired *before* they could log in.
  - New page `/verify-email?token=…` — success/error UI + inline resend form.
  - Email HTML template with PhytoNet brand (glass gradient header · CTA button · 24h expiry copy · plain-text fallback).
- **Project autosave recovery** — every meaningful action triggers a debounced upsert to the user's autosave slot. On next login the `ResumeSessionModal` shows plant / disease / compound-count / current-step preview and offers Resume or Discard.
- Bug fix: `MyProjects.jsx` now waits for `authLoading===false` before opening the sign-in modal — previously the modal briefly re-opened for authenticated users during AuthContext hydration.
- Iter 20 test report: `/app/test_reports/iteration_20.json` — backend 11/11 pytest pass, frontend 95 % E2E (all P2 flows verified except MD engine picker end-to-end which requires an upstream workflow to reach `/molecular-dynamics` — engine schema itself verified via backend).

## Backlog / Next Actions (updated)

- **[BLOCKER for AI report]** Emergent LLM key budget exhausted. Top-up via Profile → Universal Key → Add Balance.
- P2: Wire real cloud dispatch (AWS Batch / RunPod / Lambda) — currently spec-only.
- P2: MD post-processing analysis (RMSD/RMSF/H-bonds) once trajectories return.
- P3: Refactor `server.py` (1600+ lines) into `/app/backend/routes/*` modules.
- P3: SaaS billing tier integration (Stripe) — gate deep computation behind paid plans.
- **Shared toolbars & utilities** (all in `/app/frontend/src/components/network/` and `/app/frontend/src/lib/`):
  - `TableToolbar` — universal CSV / XLSX / Copy-to-Clipboard for every table
  - `FigureToolbar` — universal SVG / PNG (300 & 600 dpi) / TIFF (300 & 600 dpi) / PDF (vector) + Fullscreen + Reset for every SVG figure. Publication-ready: font-family injected, title bar, viewBox preserved.
  - `CyToolbar` — layout selector (fcose · concentric · circle · breadthfirst · grid · cose-bilkent · dagre), Fit, ZoomIn/Out, Search, Highlight Neighbours, Hide/Show Labels, Fullscreen + full network exports (SVG via cytoscape-svg / PNG(300/600) / TIFF(300/600) / PDF / JPG / GraphML / GML / XGMML / Cytoscape .cyjs JSON)
  - `DataTable` — search / sort / column-filter / paginate; used across GO, KEGG, PCTDP
  - `HelpTip` — `?` icon w/ tooltip (used on every filter parameter)
  - `tableExporters.js`, `figureExporters.js` (UTIF-based TIFF), `enrichmentUtils.js` (BH / Bonferroni / fold enrichment / rich factor / correction methods), `pctdpBuilder.js`, `networkMetrics.js`, `cytoscapeSetup.js` (auto-registers fcose, cose-bilkent, dagre, svg extensions).
- **GO Enrichment — ShinyGO-style rebuild** (`GOPanel.jsx`): categories (BP/MF/CC), Top-N (10/20/30/Custom), Min Gene Count/Ratio/Fold Enrichment sliders, P-value + adjusted-P cutoffs, Multiple-testing correction (g:SCS / BH-FDR / Bonferroni / None — actually passes through to g:Profiler after the iter-17 `GoRequest` Pydantic fix), Sort-by / Color-by / Bubble-size-by. 7 visualisation checkboxes (Bar / Bubble / Dot / GO Chord / Gene-Term Network / Enrichment Map / Circular Chord) — Gene-Term & Enrichment Map are interactive Cytoscape networks with full CyToolbar. Backend `gprofiler_go()` now returns `fold_enrichment`, `gene_ratio`, `rich_factor` for every term.
- **KEGG Enrichment — ShinyGO-style rebuild** (`KEGGPanel.jsx`): Top-N + 4 sliders (gene count / ratio / rich factor / fold enrichment) + adjusted-P + raw-P cutoffs, correction method, sort/color/size selectors. 8 visualisation checkboxes (Bubble / Dot / Lollipop / Sankey / Bar / Gene-Pathway Network / Pathway Chord / Heatmap) — Gene-Pathway Network is interactive Cytoscape with full CyToolbar. Pathway selection checkboxes feed the PCTDP integrative graph.
- **PPI panel**: full CyToolbar with layout selector + all bitmap/vector exports + existing GraphML/GML/XGMML/JSON. Edges table gets TableToolbar (CSV/XLSX/Copy).
- **Hub panel**: TableToolbar on the 10-metric ranking table + NEW Hub Subgraph interactive network (induced subgraph of top-N by selected metric) with full CyToolbar.
- **Intersection & Venn**: TableToolbar on intersecting-targets table; Venn diagram continues to export SVG/PNG(300/600)/TIFF(300/600)/PDF.
- **NEW subsection PCTDP** (`PCTDPPanel.jsx`) — Plant → Compound → Target → Disease → KEGG Pathway integrative network. Auto-builds from NetworkContext (plant name, compounds, compound targets, disease, disease targets, intersecting genes, selected KEGG pathways). Node-type include checkboxes, dagre hierarchical layout by default, editable plant-name input. 8 metric summary cards (nodes / edges / avg degree / density / components / clustering coefficient / avg path length / diameter). Auto-Analyze button re-fits and computes centrality. Node table (id / type / display name / degree / betweenness / closeness / intersecting status) + Edge table (source / target / relationship / confidence / evidence / weight) — both searchable / sortable / filterable / paginated, with TableToolbar. Full CyToolbar on the network (all image + graph exports).
- **Cross-workflow context**: `NetworkContext` now carries `plantName` (auto-set on Plant Database search) and `selectedKeggPathways` (fed by KEGG panel).
- **Intersection matching** now falls back to UniProt-ID equality when gene_symbols differ (helps when Open Targets and ChEMBL emit different HGNC synonyms for the same protein).
- **Backend `GoRequest`** model fixed to accept `significance_method` (silently ignored before iter-17). Backend pytest 5/5 pass (test_ppi_network, test_kegg_enrich, test_go_enrich_all_ontologies, test_go_enrich_has_fold_enrichment_gene_ratio_rich_factor, test_go_enrich_accepts_correction_and_threshold_params).

## Backlog / Next Actions
- ✅ 2026-07-14 — P1: ChartStyleDrawer expansion — 5 themes (Light/Dark/Nature/Cell/B&W), per-chart overrides for 13 chart types, palette editor, grid/border/font/legend controls; wired into GO/KEGG bar+dot+lollipop charts.
- ✅ 2026-07-14 — P2: DOCX report exports fixed & upgraded (title param, tables, inline bold/italic/code, blockquotes, numbered lists).
- ✅ 2026-07-14 — Refactor: server.py 1755 → 1433 lines. Extracted `/app/backend/routes/{disease,network,docking,md,report}.py` using build_router() factory; 68/68 pytest passing, iteration_29.json all-green.

- P2 (remaining): Extend ChartStyle wiring to Cytoscape networks (PPI/Hub/Compound-Target/PCTDP/Gene-Pathway) — currently only enrichment charts consume it. Requires patching each Cytoscape stylesheet builder to read useAppliedStyle.
- P2: Add rate limiting (slowapi) + basic abuse protection (IP-based) on `/api/report/generate` and `/api/docking/run*`.
- P3: Accessibility audit (a11y) and security audit per production readiness checklist (Msg 379).
- P3: SaaS billing tier integration (Stripe) — gate deep computation behind paid plans.
- Refactor: continue extracting plants / lotus / admet / target routes from `server.py` (still 1433 lines).

**Manual (user-only) actions still pending:**
- 🔴 Verify Google OAuth end-to-end by clicking "Continue with Google" on the live URL.
- 🔴 Ship `/app/Dockerfile` via "Save to Github" so the deploy pipeline picks up AutoDock Vina.


## 2026-02-21 — Deployment Readiness ✅
- **Auth gate re-enabled for production**:
  - `/app/backend/.env` → `AUTH_GATE_ENABLED="on"`
  - `/app/frontend/src/context/AuthContext.jsx` → `export const AUTH_GATE_ENABLED = true;`
  - Verified: anon `/api/auth/me` → 401, admin login → 200, protected `/api/projects` requires cookie.
- **deployment_agent** health check: **PASS** — no blockers.
  - ✅ All secrets in env vars (no hardcoded values in source)
  - ✅ Supervisor config correct for FastAPI+React+Mongo
  - ✅ `craco start` frontend script valid
  - ✅ CORS `*` acceptable
  - ✅ MongoDB via env vars only
  - ✅ Google OAuth redirect URI in `.env` (auto-updated by platform on deploy)
  - ✅ No compilation errors
- **Ready to deploy** via the "Deploy" button in the chat toolbar.

**Post-deploy manual steps for user:**
- 🔴 Update Google OAuth Console → Authorized Redirect URIs with the new production domain
- 🔴 Verify Groq API key balance and Resend sender domain in production
- 🔴 Ensure `/app/Dockerfile` is pushed via "Save to Github" so AutoDock Vina/Open Babel/GROMACS are baked into the deployment image (self-healing `deps_check.py` is a fallback but Docker layer install is preferred)



## 2026-02-22 — Code Review Fixes (HIGH + MEDIUMs) ✅

Deployment readiness re-check + functional code review completed. Applied blocking fixes only (LOWs deferred).

**Deployment**
- ✅ Removed `.env` / `.env.*` / `*.env` from `/app/.gitignore` — env files must be tracked so Emergent's build injects prod values.
- 🔴 Remaining deployment blocker: heavy ML stack in `backend/requirements.txt` (`torch`, `admet_ai`, `chemprop`, `pytorch-lightning`). Exceeds Emergent's 250m CPU / 1Gi memory / 2 replica limits. **Requires product decision** — strip to "Coming Soon (v2.0)" like MD, refactor to external ML API, or self-host with GPU/large-memory infra.

**Code Review — Confirmed defects fixed**
- 🔴 HIGH — `backend/docking_service.py:761-766`: error-placeholder `DockResult(..., pdb_id=...)` used non-existent field, raising `TypeError` and crashing entire docking batches when any target lacked a PDB structure. Fixed by using `receptor_pdb=` (correct dataclass field).
- 🟠 MEDIUM — `frontend/src/pages/DiseaseTargets.jsx`: `doExport`/`onContinue` used `displayed` (filtered view) instead of `rows`; genes selected before a filter tightened were silently dropped from Network Analysis. Now filters `rows` by `selected`.
- 🟠 MEDIUM — `frontend/src/pages/MolecularDocking.jsx`: SSE `error` events weren't appended to results table, and header showed "job undefined". Now (1) captures `job_id` from first `pair_done`, (2) appends failed pairs as result rows so users can see/download them, and (3) conditionally omits "job …" text when no id yet.

**Regression protection**
- New test `backend/tests/test_docking_no_receptor.py` — asserts `run_docking_batch` returns a graceful error row (not raises) when no PDB structure is found. ✅ Passes.

**LOW defects — deferred (per user)**
- SSE reader lacks `AbortController`/unmount cancellation in `MolecularDocking.jsx`.
- Dead branch + duplicate aromatic-ring recomputation in `docking_service.py:406-423`.
- `reportBuilder.js` fixed section numbers create TOC gaps; "Table undefined" when `hubScores` yields zero rows.

**Next Action Items**
- Product decision on ML deployment blocker (see options above).
- P1 backlog: refactor large components (`PlantDatabase.jsx`, `MolecularDocking.jsx`, `DiseaseTargets.jsx`).
- P2 backlog: Molecular Dynamics server-side execution (v2.0).


## 2026-02-22 — Hostinger VPS Deployment Setup ✅

User chose self-host on Hostinger (≥ 8 GB VPS, keep full ML stack). Generated production deployment files at repo root.

**New files:**
- `/app/docker-compose.yml` — 6 services (mongodb, redis, backend, celery_worker, celery_beat, frontend), all on `phytonet-net` bridge network with named volumes for `mongo_data`, `mongo_config`, `redis_data`, `dock_jobs`, `md_jobs`.
- `/app/.env.example` — templated env with required/optional sections, generation commands for `JWT_SECRET`/`SESSION_SECRET`.
- `/app/frontend/Dockerfile` — multi-stage build: Node 20 builder → nginx:alpine runtime (~40 MB image). CRA `REACT_APP_BACKEND_URL` inlined via `--build-arg` (default: same-origin, nginx proxies `/api`).
- `/app/frontend/nginx.conf` — SPA fallback, gzip, long-lived cache for `/static/`, reverse-proxy `/api/*` and `/auth/*` to `backend:8001`. SSE-friendly (`proxy_buffering off`, 1 h read/send timeout). `/healthz` for container liveness.
- `/app/backend/celery_app.py` — Celery scaffolding (broker/backend on Redis, empty `include` list, `phytonet.ping` health task). `beat_schedule = {}` for future periodic jobs.
- `/app/README-DEPLOY.md` — 12-section deployment guide (VPS sizing, one-time server setup, secret generation, TLS via Caddy/Certbot, ops runbook, Celery how-to, troubleshooting matrix, security checklist).

**Config decisions:**
- Kept **MongoDB** (per user choice 1a) — no data-layer refactor.
- Redis + Celery worker + beat added as **scaffolding only** (2b) — no tasks registered yet.
- Frontend served via **nginx multi-stage** (3a) — production-grade, tiny image.
- Backend uses existing `/app/Dockerfile` (Vina + OpenBabel + GROMACS + full ML stack, ≥ 8 GB RAM target — user choice 5a).
- Added `celery==5.3.6` and `redis==5.0.4` to `backend/requirements.txt`.
- `.gitignore`: kept `.env*` ignored (correct for self-host — never commit real secrets), added `!.env.example` exception so the template is trackable.

**Ports & networking:**
- Frontend host `${FRONTEND_PORT:-3000}` → container 3000 (nginx)
- Backend host `${BACKEND_PORT:-8001}` → container 8001 (uvicorn)
- MongoDB/Redis exposed only inside the compose network (no host binding) → correct security posture.

**Verified:**
- `docker-compose.yml` parses cleanly (all 6 services enumerated).
- `.env.example` contains all required keys (`ADMIN_EMAIL`, `JWT_SECRET`, `MONGO_URL`, `REDIS_URL`, `CELERY_BROKER_URL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GROQ_API_KEY`).
- `backend.celery_app` imports cleanly with broker `redis://redis:6379/0`.
- Backend `/api/health` still 200 in preview.

**GitHub push:**
User must use **"Save to Github"** in the chat toolbar — the sandbox has no push credentials. Files ready to be committed.

**Next Action Items**
- Click **"Save to Github"** to publish deployment files.
- On the Hostinger VPS follow `README-DEPLOY.md` §§ 1-6.
- After first boot, verify Celery ping: `docker compose exec backend python -c "from backend.celery_app import celery_app; print(celery_app.send_task('phytonet.ping').get(timeout=5))"` → `pong`.



## 2026-02-23 — Modular Platform Architecture ✅

Reorganised PhytoNet AI into a modular research platform without touching the Hero or existing workflow logic.

**Homepage — `pages/Home.jsx`**
- Hero preserved verbatim (no redesign).
- **New `ResearchModules` section** injected immediately below Hero, above `AssistantHero`. Glassmorphism cards with Framer-Motion hover animations (`whileHover={y:-6}`), color-tinted icon chips, "STANDALONE" tags, and a flagship badge on the AI Agent card (which spans 2 columns on md+ screens).
- 7 cards with correct CTAs and routes:
  - PhytoNet AI Agent → `/phytonet-ai` (flagship)
  - Plant Database → `/plant-database`
  - Compound Target Prediction → `/compound-target-prediction`
  - Disease Target Prediction → `/disease-target-prediction`
  - ADMET Prediction → `/admet`
  - Drug-Likeness Prediction → `/drug-likeness`
  - Databases → `/databases`

**Standalone routes — `App.js`**
- Removed the `Navigate` redirect from `/plant-database → /phytonet-ai`; page now renders `PlantDatabase.jsx` standalone.
- Added aliases (no code duplication — same underlying component):
  - `/compound-target-prediction` → `TargetPrediction`
  - `/disease-target-prediction` → `DiseaseTargets`
  - `/admet` → `DrugLikeness` (the existing page already handles ADMET + drug-likeness — single source of truth)
- All 8 routes verified with `curl` → 200.

**New Databases Hub — `pages/DatabasesHub.jsx`**
- Route: `/databases`.
- Curated index of **24 databases** across 7 categories (Chemistry, Targets & PPI, Disease, Pathways, Structures, Phytochemistry, Pharmacology).
- Each card: description, supported data pills, update cadence, API availability, citation with copy-to-clipboard button, and a "Used in PhytoNet AI" panel explaining exactly how the source is consumed.
- Client-side search + category chips with counts, empty-state, launch-workflow CTA.
- Includes: PubChem, ChEMBL, BindingDB, UniProt, GeneCards, DisGeNET, OMIM, Open Targets, DrugBank, STRING, KEGG, Reactome, WikiPathways, GO, PDB, AlphaFold, IMPPAT, NPASS, COCONUT, CMAUP, Dr. Duke's DB, KNApSAcK, FooDB, SwissTargetPrediction.

**No component duplication**
- Standalone module pages render the exact same components already used inside the AI Agent workflow. The AI Agent orchestrates them via `WorkflowLayout`; the standalone routes render the same page components without the workflow wrapper.

**Verified**
- Frontend compiles cleanly (webpack: 1 pre-existing lint warning, no new errors).
- Home page: 7 module cards enumerated in DOM with correct hrefs.
- `/plant-database`, `/databases`, `/admet` all render without redirect.

**Files touched**
- `frontend/src/pages/Home.jsx` — added `ResearchModules` section (defined between `Hero` and `Stats`).
- `frontend/src/App.js` — new routes, dropped Navigate redirect.
- `frontend/src/pages/DatabasesHub.jsx` — new (498 lines).

**Next Action Items**
- Optional polish: reuse `data-testid` conventions for `/admet` route so future testing can distinguish it from `/drug-likeness`.
- P1 refactor still pending: large page components.
- P2 backlog: MD server-side execution (v2.0).



## 2026-02-23 (pm) — Standalone Module Independence ✅

Fixed the "standalone modules still leak into the AI Agent workflow" architectural bug.

**Root cause found by direct code trace:**
- Every module page (`PlantDatabase`, `DrugLikeness`, `TargetPrediction`, `DiseaseTargets`) rendered inside `<WorkflowLayout>` which shows the workflow sidebar with step trackers.
- Every "Continue" button unconditionally called `markComplete("current-step")` + `navigate("/next-step")` — pushing standalone users into the guided flow.
- ADMET/`DrugLikeness` and `TargetPrediction` hard-blocked with an empty state ("Complete the previous step") when no compounds were pre-selected from the workflow — making them unusable as standalone tools.

**Fixes**
- **`hooks/useIsStandalone.js`** (new) — reads `useLocation()` against a `STANDALONE_ROUTES` set (`/plant-database`, `/admet`, `/drug-likeness`, `/compound-target-prediction`, `/disease-target-prediction`).
- **`components/WorkflowLayout.jsx`** — now conditional: renders the sidebar in workflow mode, and a plain full-width container (`data-standalone="true"`) in standalone mode.
- **`components/standalone/StandaloneSMILESInput.jsx`** (new, ~200 lines) — reusable input card with three entry points: paste SMILES textarea, CSV/XLSX batch upload (dynamic import of `xlsx`), and "Load curated examples". Accepts an `onCommit(compounds)` prop so each page decides which context store receives the compounds (SelectionContext for ADMET, NetworkContext for TargetPrediction).
- **Home cards reordered** to 6 items per spec: PhytoNet AI Agent → Plant Database → **ADMET & Drug-Likeness (merged)** → Compound Target Prediction → Disease Target Prediction → Databases. Standalone Drug-Likeness card removed (module unified with ADMET as user requested).
- **Per-page workflow guards** — every `markComplete()` + `navigate("/next-step")` call now returns early when `standalone === true`, showing a success toast referencing the export buttons instead of pushing to the next module.
- **Standalone entry points wired** — `DrugLikeness` and `TargetPrediction` empty states now render `StandaloneSMILESInput` when accessed via a standalone route. `DiseaseTargets` already has a disease-name search as its primary input, so no empty-state change needed. `PlantDatabase` already renders as its own page with search — the CTA is now context-aware ("Save Selection" standalone vs "Proceed to Drug-Likeness Screening" in workflow).

**Verified end-to-end**
- `/admet` — Standalone input UI shows immediately (Paste SMILES + Batch upload + Load examples). No workflow sidebar (`data-standalone="true"`).
- `/compound-target-prediction` — Clicking "Load curated examples" toasts "3 compounds loaded" → Target Prediction fires immediately, progress bar advances, no workflow chrome.
- Home cards enumerate in the correct 6-item order.
- All 9 routes return 200; frontend compiles clean (1 pre-existing lint warning, unchanged).

**Files touched**
- `frontend/src/hooks/useIsStandalone.js` (new)
- `frontend/src/components/WorkflowLayout.jsx` (conditional layout)
- `frontend/src/components/standalone/StandaloneSMILESInput.jsx` (new, reusable input)
- `frontend/src/pages/Home.jsx` (card reorder + ADMET merge)
- `frontend/src/pages/PlantDatabase.jsx` (context-aware CTA)
- `frontend/src/pages/DrugLikeness.jsx` (standalone empty state + Continue guard)
- `frontend/src/pages/TargetPrediction.jsx` (standalone empty state + Continue guard)
- `frontend/src/pages/DiseaseTargets.jsx` (Continue guard only — already had own search input)

**Deferred to a follow-up task (P2 feature scope, not architectural)**
- Plant Database search extensions (by family, compound, disease, target, traditional use) + CSV upload for batch plant-name lookup.
- Compound Target Prediction extra input types (MOL, SDF).
- Extended drug-likeness output panels (Ghose, Egan, Muegge, QED, SA, Lead-likeness, MedChem Alerts) — some already computed under the hood; needs UI surfacing.
- Databases hub category groupings (already filterable by category; explicit visual grouping deferred).

**Next Action Items**
- Optional: `testing_agent_v3_fork` sweep to confirm no regression in the AI Agent workflow path.
- Push via **Save to Github**.



## 2026-02-23 (pm-2) — Molecular Docking as Standalone Module ✅

Added Molecular Docking to the modular platform, matching the same standalone-independence pattern applied to the other modules.

**Changes**
- `hooks/useIsStandalone.js` — `/molecular-docking` added to `STANDALONE_ROUTES`.
- `pages/Home.jsx` — new Molecular Docking card inserted at position 6 (between Disease Target Prediction and Databases). Icon: `Microscope`, tint `#DB2777` (magenta). CTA: "Run Docking".
- `components/standalone/StandaloneDockingInput.jsx` — **new**, ~230 lines. Ligand textarea + CSV/XLSX batch upload, Target textarea (UniProt or gene symbol) with UniProt-format detection, "Load curated examples" (Curcumin/Withaferin A/Quercetin × TNF/IL6). On commit, pushes into `useNetwork().setSelectedCompounds`, `setCompoundTargets`, `setIntersectingGenes` so the existing docking priority matrix + engine renders immediately.
- `pages/MolecularDocking.jsx`:
  - Renders `StandaloneDockingInput` in the empty-state when `standalone && noInputs`.
  - `markComplete("molecular-docking")` gated by `!standalone`.
  - "Proceed to Molecular Dynamics" link hidden in standalone mode.

**Final homepage card order (7):**
1. PhytoNet AI Agent (flagship)
2. Plant Database
3. ADMET & Drug-Likeness Prediction
4. Compound Target Prediction
5. Disease Target Prediction
6. Molecular Docking
7. Databases

**Verified**
- Home cards enumerate in exact order via DOM check.
- `/molecular-docking` opens with `data-standalone="true"` on `WorkflowLayout`, sidebar hidden (0 `<aside>` elements), `standalone-docking-input` mounted, both textareas + upload + examples buttons wired.
- Frontend compiles clean (1 pre-existing lint warning, unchanged).

**Deferred (P2, out of scope for this architectural pass)**
- Extra ligand input formats: MOL, MOL2, SDF file parsing (backend supports MOL/SDF via Open Babel; UI stub required).
- Custom PDB upload (user-supplied receptor structure) — backend can already consume `pdb_id` override; upload UI + BLOB pipe required.
- Advanced settings panel on the input step: docking engine choice, custom binding-site coordinates, flexibility flags (backend already exposes `exhaustiveness`, `num_modes`, `box_padding` via existing controls after inputs are loaded).
- Batch job progress dashboard with queue/ETA (currently SSE stream shows live progress once run starts).

**Next Action Items**
- Push via **Save to Github**.
- Rebuild frontend on Hostinger: `git pull && docker compose up -d --build frontend`.
- Consider a `testing_agent_v3_fork` regression sweep across the 7 module routes.



## 2026-02-23 (pm-3) — Intelligent Docking Assistant ✅

Transformed the standalone Molecular Docking entry from a raw paste-SMILES form into an intelligent lookup assistant. Users now type a compound *name* and a gene/protein *name*; the platform resolves everything (SMILES, InChI, IUPAC, UniProt, PDBs) automatically.

**New backend endpoints** (`server.py` after `/api/health`)
- `GET /api/compound/lookup?name=…` — resolves compound name via `_pubchem_full()` (PubChem PUG-REST). Returns canonical/isomeric SMILES, InChI, InChIKey, molecular formula/weight, IUPAC name, PubChem CID + URL, top 12 synonyms, and best-effort ChEBI ID.
- `GET /api/target/resolve?query=…&organism=…` — hits UniProt REST search restricted to reviewed entries with `gene_exact:` or `protein_name:` predicates. Returns UniProt accession + entry name, canonical protein name, up to 6 gene symbols, organism, sequence length, function text (with PubMed IDs), diseases, up to 20 cross-referenced PDB IDs, and the UniProt URL.

**Frontend API wrappers** (`lib/api.js`)
- `compoundLookup(name)` → GET `/api/compound/lookup`
- `targetResolve(query, organism = "Homo sapiens")` → GET `/api/target/resolve`

**Frontend rewrite** — `components/standalone/StandaloneDockingInput.jsx` (~340 lines)
- Two-column resolver grid: Compound (green tint) + Target (magenta tint).
- Each resolver: input with search icon, Enter-to-resolve, Loader2 spinner during lookup, dedicated result card with all resolved fields, "Clear" X button.
- **CompoundCard**: formula, MW, PubChem CID, InChIKey, monospace SMILES box, synonym chips, PubChem external link.
- **TargetCard**: UniProt, sequence length, PDB grid with best pick highlighted with `★`, function text panel with PubMed refs, UniProt external link. If no PDBs exist, notes "will use AlphaFold fallback".
- **Advanced mode collapse**: paste-override inputs for SMILES / UniProt ID / PDB ID — override the resolved values on commit.
- Gradient "Load & continue to docking" CTA pushes into NetworkContext (`setSelectedCompounds`, `setCompoundTargets`, `setIntersectingGenes`) so the existing AutoDock Vina pipeline renders unchanged.

**Verified end-to-end**
- `Curcumin` → CID 969516, canonical SMILES `COC1=C(C=CC(=C1)C=CC(=O)CC(=O)CC2=CC(=C(C=C2)O)OC)O`, MW 368.40, IUPAC name, InChIKey, 6 synonyms rendered.
- `EGFR` → P00533, 1210 aa, protein name "Epidermal growth factor receptor", 20 PDBs with 1IVO auto-picked, function paragraph rendered with PubMed citations.
- All handled by two REST calls (`~500 ms compound`, `~800 ms target`) — no shell-out, no additional MongoDB reads, no additional Python deps.

**Files touched**
- `backend/server.py` — 2 new endpoints (compound/lookup, target/resolve)
- `frontend/src/lib/api.js` — 2 new API wrappers
- `frontend/src/components/standalone/StandaloneDockingInput.jsx` — complete rewrite (raw paste → intelligent assistant)

**Deferred (P2 feature scope)**
- SDF / MOL / MOL2 / PDB file upload (RDKit already loaded; upload UI + BLOB parse required)
- Auto-execute Target Prediction pipeline after compound resolves (surface predicted targets as a "quick-pick" list next to manual target search)
- PDB structure ranking modal (resolution + ligand-present + method filter — currently top PDB from UniProt XREF order is selected)
- AlphaFold model auto-fetch when no experimental PDB exists (backend hook needed)
- Advanced settings panel: binding-box coordinates, flexibility toggles (backend already exposes these via existing controls after inputs are loaded)

**Next Action Items**
- Push via **Save to Github**.
- Rebuild on Hostinger: `git pull && docker compose up -d --build backend frontend`.
- Consider testing_agent_v3_fork for the new compound/target lookup endpoints.



## 2026-02-23 (pm-4) — Node Credit System (Phase 1: core infrastructure) ✅

Shipped Phase 1 of the monetisation stack per user brief (1a · 2c · 3a · 4a · 5a).

**Backend — new centralised service** `backend/routes/nodes.py`
- Endpoints (all mounted under `/api/nodes`):
  - `GET /balance` — returns `{ balance, lifetime_used, lifetime_purchased, welcome_bonus_granted, module_costs }`.
  - `POST /charge` — atomic debit with idempotency by `job_id`. Uses conditional Mongo update `nodes_balance >= amount` so concurrent debits can't overdraw. Returns 402 with `{ error: "insufficient_nodes", balance, required }` when balance too low.
  - `GET /history` — paginated ledger newest-first, filterable by `direction=debit|credit`.
  - `GET /pricing` — static INR plans (₹250/10, ₹500/25 [Most Popular], ₹1000/60).
  - `POST /purchase-intent` — shell endpoint; records intent in `purchase_intents` collection with `status: "coming_soon"` (real Razorpay wires up in Phase 3).
- **Module cost registry** — single `MODULE_COSTS` dict is the source of truth for both server + client. Free modules absent from map (implicit cost = 0). Adding a new premium module is one line.
- **Welcome bonus** — 100 nodes granted:
  - On email register (`auth_service.register`) — added to user doc at creation.
  - On Google OAuth first login (`google_oauth.py`) — added at doc creation.
  - Backfill for existing users on first `/balance` call (idempotent via `welcome_bonus_granted` flag) + ledger entry.
- **Ledger** collection `node_transactions`: immutable append-only rows with `{user_id, direction, amount, balance_after, module, workflow, job_id, reason, meta, at}`.

**Frontend — context, badge, modals**
- `context/NodeContext.jsx` — global provider. Fetches balance on mount, exposes `costFor(moduleId)`, `preflight(moduleId, workflow)` (auto-pops insufficient modal), `charge({module, amount, jobId, workflow, reason})`. Threshold toasts at 20 / 10 / 5 / 0 fire only on downward crossings.
- `components/nodes/NodeBadge.jsx` — navbar chip with `<GoldenLeaf />` icon (CSS gradient over `Leaf`), colour-coded pill: green >30, orange 10-30, red <10. Click → popover with balance, "Recharge nodes", "Usage history", "Dashboard".
- `components/nodes/NodeModals.jsx`:
  - `<PurchaseNodesModal />` — 3-card pricing grid, Research card highlighted with "Most Popular" gradient badge, ₹/node computed, "Buy plan" writes purchase intent + shows "coming soon" toast.
  - `<InsufficientNodesModal />` — auto-shows when `NodeContext.insufficient` is set. "Recharge now" chains into purchase modal.
  - `<ChargeConfirmationDialog />` — imperative pre-run confirmation ("This will consume X nodes · Current balance Y · After run Z").

**Wire-in — 2 premium modules**
- **PhytoNet AI Agent** (`pages/AIAssistant.jsx`): Launch button reads cost from `costFor("phytonet-ai-agent")` → shows "Launch AI Assistant · 10 nodes". `onStart` runs preflight; if OK, opens ChargeConfirmationDialog. On confirm, kicks off `assistantRun` then fires `chargeNodes({job_id: run.id, ...})` — idempotent so ledger stays correct on retries.
- **Molecular Docking** (`pages/MolecularDocking.jsx`): Run button shows "Run docking · 5 nodes". Same preflight + ChargeConfirmationDialog pattern. Charge fires after the SSE `done` event with the stream `job_id` for idempotency.

**Global mount** — `App.js` wraps everything in `<NodeProvider>` immediately inside `<AuthProvider>` so `useAuth()` is available. `<PurchaseNodesModal />` + `<InsufficientNodesModal />` are mounted at the root — any child can open them via context.

**Verified end-to-end (screenshot):**
- Admin login → NodeBadge shows "Nodes: 100" in green tier ✅
- Click badge → popover with recharge / history / dashboard ✅
- Click "Recharge nodes" → 3 pricing cards render correctly (₹250/₹500/₹1000; ₹25/₹20/₹16.7 per node; Research card highlighted) ✅
- Info footer explains payment gateway is being configured ✅
- Backend `/api/nodes/balance` returns 100, `/api/nodes/pricing` returns 3 INR plans ✅

**Deferred (Phase 2+ per user choice 1a)**
- Dedicated `/pricing` page (Phase 2).
- Dashboard redesign — usage table, recharge table, projects/downloads panels, charts (Phase 2).
- Live Razorpay integration (Phase 3 — waits on user's Razorpay key).
- Client-side download gate: every download button should call `useAuth().guard(() => download())` — quick pass through the pages (~30 min follow-up, not blocking).
- Auto-refresh balance polling after external purchases (needs webhook, comes with Razorpay).

**Files touched**
- `backend/routes/nodes.py` (new, ~230 lines) · `backend/server.py` (mount router) · `backend/auth_service.py` (welcome bonus at register) · `backend/google_oauth.py` (welcome bonus at OAuth first login)
- `frontend/src/lib/api.js` (5 new wrappers)
- `frontend/src/context/NodeContext.jsx` (new, ~130 lines)
- `frontend/src/components/nodes/NodeBadge.jsx` (new, golden-leaf indicator + popover)
- `frontend/src/components/nodes/NodeModals.jsx` (new, purchase + insufficient + charge-confirm)
- `frontend/src/components/SiteHeader.jsx` (mount NodeBadge next to user avatar)
- `frontend/src/App.js` (NodeProvider + global modals)
- `frontend/src/pages/AIAssistant.jsx` (preflight + confirmation + charge on start)
- `frontend/src/pages/MolecularDocking.jsx` (preflight + confirmation + charge on done)

**Next Action Items**
- Push via **Save to Github**
- Optional Phase 2: dedicated /pricing page + dashboard redesign.
- Phase 3 (payments): call `integration_playbook_expert_v2` with "Razorpay" once user shares intent to enable purchases; wire the response into `POST /api/nodes/purchase-intent`.



## 2026-02-23 (pm-5) — Intelligent Compound Resolution across ADMET / Drug-Likeness / Target Prediction ✅

Extended the compound-name lookup previously exclusive to Molecular Docking to every standalone module that consumes SMILES. Backend endpoint (`/api/compound/lookup` — added earlier for the docking assistant) is reused unchanged; the frontend `StandaloneSMILESInput.jsx` was rewritten into a tabbed intelligent-lookup component. Because ADMET, Drug-Likeness and Compound Target Prediction all mount the same component, a single edit lit up **three modules simultaneously**.

**New `StandaloneSMILESInput.jsx` — 3 tabs (single component, ~330 lines):**
1. **By name (recommended, default)** — text input → hits `/api/compound/lookup` → resolved compound chip is appended to a growing batch (name, PubChem CID, MW, formula, InChIKey, canonical SMILES). Each chip is dismissible with an X button. "Analyze N compounds" CTA commits the batch. Curated examples button as instant fallback.
2. **Paste SMILES** — original textarea flow preserved for power users.
3. **Batch upload** — CSV/XLSX with `Name` and/or `SMILES` columns. Rows missing SMILES but having a `Name` are **auto-resolved via PubChem** in sequence with a live progress bar (`Resolving compounds — X/Y`). An amber "N compounds could not be resolved" panel lists every failed row with the reason — the successful rows still commit normally so a partial upload isn't wasted.

**Where it's used now (no per-page changes needed — same component)**
- `/admet` — ADMET & Drug-Likeness Analysis
- `/drug-likeness` — same page (alias)
- `/compound-target-prediction` — Compound Target Prediction (via `onCommit` prop routing compounds to `NetworkContext.setSelectedCompounds`)

**Preserved existing pipelines** — every resolved row still goes through the same `SelectionContext.setMany()` / `NetworkContext.setSelectedCompounds()` bridge as before, so ADMET / Drug-Likeness / Target Prediction execute their existing pipelines unmodified. Just the entry point got smarter.

**Verified end-to-end** (screenshot on `/admet`)
- 3 tabs render, "By name" active by default.
- `Curcumin` → chip with CID 969516, 368.40 g/mol.
- `Quercetin` → chip with CID 5280343, 302.23 g/mol.
- Toast "Resolved 'Quercetin' → CID 5280343" fired.
- "Analyze 2 compounds" CTA visible.
- No changes required to any downstream prediction code.

**Batch upload auto-resolve** — for CSV/XLSX files:
- Rows with SMILES pass through untouched.
- Rows with only a `Name` are resolved one-by-one against PubChem (throttled to avoid rate limits) with an in-UI progress bar.
- Unresolvable rows are surfaced in a dismissible amber list; resolved rows still commit so the analysis isn't blocked by partial input.

**Files touched**
- `frontend/src/components/standalone/StandaloneSMILESInput.jsx` — complete rewrite (paste-only → tabbed intelligent lookup)

**Next Action Items**
- Push via **Save to Github**
- Rebuild on Hostinger: `git pull && docker compose up -d --build frontend`
- Optional: extend the same "By name" tab to the docking `StandaloneDockingInput` batch flow (currently that page has its own dual-column resolver — parity item, not a bug).



## 2026-02-23 (pm-6) — Dashboard, Profile & Settings Pages ✅

Every menu item in the account dropdown now navigates to a fully functional page.

**New backend endpoint** (`auth_service.py`)
- `PATCH /api/auth/me` — allow-listed field update. Accepts profile fields (`first_name`, `last_name`, `username`, `institution`, `department`, `designation`, `country`, `orcid`, `google_scholar`, `researchgate`, `bio`, `avatar_url`) and preferences (`theme_pref`, `language_pref`, `timezone_pref`, `date_format_pref`, `notify_email`, `notify_workflow`, `notify_low_nodes`, `notify_updates`, `download_format_pref`, `auto_save_projects`). Any other keys are silently dropped. Returns the refreshed user document.

**Frontend — 3 new pages**
- `pages/Dashboard.jsx` (`/dashboard`) — Account card (avatar + name + email + account type + verified badge + member-since + "Edit profile"), gold Node Balance panel (welcome bonus / purchased / consumed / remaining), 4 stat cards (AI Agent Runs, Docking Jobs, Saved Projects, Downloads), Usage History table (from `/api/nodes/history`, debits), Recharge History table (credits), Saved Projects list (from `listProjects()` with shape-tolerant normaliser), prominent gradient "Buy Nodes" button that opens the existing PurchaseNodesModal.
- `pages/Profile.jsx` (`/profile`) — Read-only header (email · account type · verified), 10 editable text inputs (first/last name, username, institution, department, designation, country, ORCID, Google Scholar, ResearchGate) + bio textarea. Save/Discard buttons; dirty-state tracking. Connected-accounts block shows Google OAuth state. Backed by `PATCH /api/auth/me`.
- `pages/Settings.jsx` (`/settings`) — 6 grouped sections (Appearance, Notifications, Privacy & Security, Downloads, Language & Region, Account Management). Custom `<ToggleRow>` and `<SelectRow>` primitives. Sticky "Save settings" button. Persisted via `PATCH /api/auth/me`.

**Dropdown navigation wiring** — `SiteHeader.jsx`
- Dashboard → `/dashboard` (previously no-op)
- My Projects → `/my-projects` (fixed from `/projects` which had no route)
- Downloads → `/dashboard#downloads`
- Profile → `/profile` (previously no-op)
- Settings → `/settings` (previously no-op)

**Auth protection** — each page checks `useAuth().user` in a `useEffect`; unauthenticated users are redirected to `/` (the app's login modal shows via `openModal()` from anywhere).

**API wrappers** (`lib/api.js`) — `updateProfile(payload)` → PATCH.

**Verified end-to-end** (screenshots)
- `/dashboard`: 4 stat cards, Node Balance panel (100 nodes), Recharge History table shows welcome_bonus +100 entry, 1 saved project rendered, Buy Nodes button opens PurchaseNodesModal ✅
- `/profile`: 13 profile testid inputs, save button, connected-accounts block ✅
- `/settings`: 6 sections, 10 preference controls, theme/language/timezone dropdowns, sticky save bar ✅
- Bug caught + fixed during smoke test: `projects.slice is not a function` when `listProjects()` returns non-array shape — now shape-tolerant.

**Files touched**
- `backend/auth_service.py` — added `PATCH /me`
- `frontend/src/lib/api.js` — `updateProfile` wrapper
- `frontend/src/pages/Dashboard.jsx` (new)
- `frontend/src/pages/Profile.jsx` (new)
- `frontend/src/pages/Settings.jsx` (new)
- `frontend/src/components/SiteHeader.jsx` — dropdown navigation
- `frontend/src/App.js` — 3 new routes

**Next Action Items**
- Push via **Save to Github**
- Rebuild on Hostinger: `git pull && docker compose up -d --build backend frontend`
- Optional P2: monthly-activity chart on Dashboard (Chart.js is already loaded elsewhere), 2FA rollout, invoice PDF downloads on Recharge History.



## 2026-02-23 — Golden Leaf Aesthetic Pass

**User instruction:** *"the colors should match with website colors and node token icon is a golden leaf represented where necessary"*

**Root cause found:** `GoldenLeaf` previously used `WebkitBackgroundClip: text` on a lucide-react `<Leaf>` (which is a stroke-based icon). Background-clip only paints the fill, so the icon was practically invisible at ≤16px on the small NavBar pill and label rows.

**Fix — proper SVG gradient stroke**
- Replaced `GoldenLeaf` in `components/nodes/NodeBadge.jsx` with an inline `<svg>` using `<linearGradient>` on both stroke and 18%-opacity fill. Gradient renders cleanly from 12px → 220px.
- Kept the same public API (`size`, `className`) plus a `solid` prop for future dark-mode variants.

**Fix — NavBar pill**
- Changed tier colours to keep the badge **always gold-toned** (amber gradient at 30+, orange at 10-30, red under 10). Currency icon is now always visually gold, balance tier is expressed via border shade + `AlertTriangle`.
- Bumped icon from 13 → 16 px, added `tabular-nums`, `uppercase "nodes"` sub-label at ≥sm.

**Fix — Dashboard hero**
- Balance card now: 44px gold leaf next to the huge "100" number, decorative 220px watermark leaf at 8% opacity, amber gradient background (`#FFFBEB → #FEF3C7`).
- Recharge History `+100` row prefixed with a 12px leaf, amber `#B45309` text (instead of emerald).

**Fix — CTA buttons**
- `AIAssistant.jsx` launch button — leaf between "Launch AI Assistant ·" and cost.
- `MolecularDocking.jsx` run button — leaf between "Run docking ·" and cost.

**Verified via screenshots**
- Nav pill, popover, Dashboard hero, Recharge History row, Purchase Modal (all 3 tiers) — golden leaf visible everywhere. Colours match site palette (violet primary + amber gold for currency).

**Files touched**
- `frontend/src/components/nodes/NodeBadge.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/AIAssistant.jsx`
- `frontend/src/pages/MolecularDocking.jsx`

**Next Action Items**
- P1: Refactor `NetworkAnalysis.jsx` (2505 lines), `DrugLikeness.jsx` (1805), `PlantDatabase.jsx` (1196) into per-page folders — user-approved plan.
- P2: Wire Razorpay/Stripe payment gateway for node recharge (UI ready, checkout still returns "coming soon").
- P2: Molecular Dynamics server-side execution (Celery/GROMACS scaffolding already in `docker-compose.yml`).


## 2026-02-23 — P1 Refactor Complete: 3 large pages → per-page folders

**Approved plan (user):** Split three large page components into `pages/<Name>/index.jsx + parts/*` with **zero logic changes**, then E2E-test via testing agent.

**Refactor deltas**

| File | Before | After | Parts extracted |
|---|---|---|---|
| `PlantDatabase.jsx` | 1202 L | folder | `inputs.jsx` (SearchInput/NumberField/ExportButton), `CellValue.jsx`, `tableStates.jsx` (LoadingRows/EmptyState) |
| `DrugLikeness.jsx` | 1821 L | folder | `HelpTip`, `ScoringConfigPanel` (+WeightInput), `FilterCards` (FilterCard/FilterControl/groupByCategory/DrugLikenessFilterCard/CriteriaCard), `tableComponents` (ResultsTable/RowRender/ParamCell/StarRow/formatObserved/ScoreBreakdown/Th/ProbCell/BoolCell), `ExportBtn`, `AutoAnalysisCard`, `EmptySelection` |
| `NetworkAnalysis.jsx` | 2506 L | folder | `common` (SubsectionNav/Stat/DlBtn/PlaceholderPanel), `IntersectionPanel`, `PPIPanel`, `HubPanel` (+HubSubgraphNetwork), `GOPanel` (+GOBarChart/GODotPlot/GOChordPlot), `KeggPanel` (+KEGGDotPlot/KEGGLollipopChart/KEGGSankey) |

Total: 3 files → 3 folders (17 new part files). Webpack picks folder `index.jsx` because the original `.jsx` file was deleted, so `App.js` imports (`@/pages/PlantDatabase`, etc.) resolve unchanged.

**E2E test verdict — `iteration_37.json`: 100% pass**
- Dashboard, Node Badge popover, Golden Leaf: ✅
- `/plant-database`: 5 mode tabs, mode swap, real Curcuma-longa search returning 242 compounds (121 IMPPAT · 64 LOTUS · 57 Both), SmilesDrawer canvases (50 rendered), CSV/Excel/JSON exports: ✅
- `/phytonet-ai` step 1: WorkflowSidebar + all 8 workflow-step test-ids present, LC-MS top-right slot: ✅
- `/admet` standalone: StandaloneSMILESInput + curated examples loads scoring config, all 3 weight inputs, ADME filters w/ Absorption/Distribution/Metabolism/Excretion rows, auto-analyse: ✅
- `/network-analysis`: gated PlaceholderPanel behaves correctly: ✅

**Files touched (17 new + 3 removed)**
- `frontend/src/pages/PlantDatabase/` — `index.jsx` + `parts/{inputs,CellValue,tableStates}.jsx`
- `frontend/src/pages/DrugLikeness/` — `index.jsx` + `parts/{HelpTip,ScoringConfigPanel,FilterCards,tableComponents,ExportBtn,AutoAnalysisCard,EmptySelection}.jsx`
- `frontend/src/pages/NetworkAnalysis/` — `index.jsx` + `parts/{common,IntersectionPanel,PPIPanel,HubPanel,GOPanel,KeggPanel}.jsx`
- Deleted: original `PlantDatabase.jsx`, `DrugLikeness.jsx`, `NetworkAnalysis.jsx`

**P2 follow-ups noted by testing agent (deferred)**
- PlantDatabase `index.jsx` still ~999 L — could extract results-table + pagination into `parts/ResultsSection.jsx` to reach <700 L.
- DrugLikeness `index.jsx` (~669 L) and NetworkAnalysis `index.jsx` (~315 L) fine, but could push more panel content into parts.
- Pre-existing hydration warning `<span> cannot be a child of <option>` (from tooling instrumentation on the `page-size` select) — not a refactor regression; benign.

**Next Action Items**
- P2: Wire Razorpay/Stripe payment gateway for node recharge.
- P2: Molecular Dynamics server-side execution (Celery/GROMACS).
- P3: Further sub-splits if any main `index.jsx` becomes hard to navigate again.


## 2026-02-25 — AI Report Redesign · Session A (Builder UI + selection contract)

User approved the multi-session split (all 4 phases across 3 sessions). Session A ships:

**Frontend — `pages/AIScientificReport.jsx` full rewrite**
- Renamed to **"Report Builder"** — modular per-module selection
- All 15 spec modules: Plant Database, Phytochemical Standardization, Compound Library, Drug-likeness, ADMET, Target Prediction, Disease Targets, Compound-Target Network, Network Analysis, PPI, Hub Genes, GO, KEGG, Molecular Docking, Molecular Dynamics
- Data-availability detection: modules without data auto-greyed, checkbox disabled, cannot be selected — no fabrication path exists
- Per-module 4-toggle: Methods · Tables · Figures · AI Interpretation (all default-on when included)
- Auto Report ID `PN-YYYYMMDD-6charnanoid` (uppercase alphanum, ambiguous chars removed)
- Bulk "Select all with data" / "Clear all"
- Live preview outline that respects selection
- Full "PhytoNet AI-Generated Analysis Report" disclaimer footer

**Backend contract — `lib/reportBuilder.js`**
- `buildReportDoc({ workflow, user, projectTitle, scientificName, reportId, include, includedIds })` — new params
- Post-filter pass drops sections whose module isn't in `includedIds`, prunes unreferenced tables/figures, and honours per-module toggles for Methods/Tables/Figures/Interpretation
- Backwards compatible — if `includedIds` is not supplied, behaves exactly like v1 (all-data-included)
- `doc.meta.selection` and `doc.meta.includedModules` snapshot the choices for downstream PDF/DOCX renderers

**Next (Session B)**
- Per-module Methods templates parametrised from actual workflow config (databases, versions, thresholds)
- Per-module Results generators: summary + top-N table + "full dataset as CSV" caveat
- Figure integration reusing existing module plot code (ADMET radar, GO/KEGG bubble plots, PPI, docking-pose)
- Claude Sonnet 4.5 per-module AI Interpretation via Emergent LLM key + Overall Summary

**Next (Session C)**
- Rewrite PDF pipeline to WeasyPrint (HTML→PDF fidelity)
- Drag-and-drop section reorder
- Editable DOCX tables
- Automatic cross-refs, section/table/figure numbering polish


## 2026-02-25 — AI Report Redesign · Session B (Methods + AI Interpretation)

**Frontend `reportBuilder.js`**: Methods block expanded from 8 → 12 module templates covering all 15 spec modules (Plant DB, Phyto-Std, Compound Library, Drug-likeness, ADMET, Target Prediction, Disease Targets, CT-Network, Network Analysis, PPI, Hub, GO, KEGG, Docking, MD). 10 new bibliography entries (RDKit, QED, BindingDB, CytoHubba, Enrichr, Meeko, GROMACS, Amber99, ACPYPE). Truncated tables now show `"Showing top N of M; full dataset available as downloadable CSV"`.

**AI Interpretation pipeline**: `buildReportDoc` accepts `aiInterpret={per_module, overall}`. The filter pass injects Claude Sonnet 4.5 text into each Results subsection under "**AI Interpretation.**" (italic) and splices an "Overall Summary" section after Results with auto-renumbering. Fallback safety: strings starting with `"No results generated"` or `"Overall summary unavailable"` are silently dropped.

**Frontend `AIScientificReport.jsx`**: PDF/DOCX generation first calls `POST /api/report/interpret` for every module with the AI toggle on. Overall Summary only requested when ≥2 modules opt in.

**PDF/DOCX renderers**: Both now render `sub.interpretation` as an italic paragraph with brand-purple `AI Interpretation.` label prefix.

**Backend `routes/report.py`**: New `POST /api/report/interpret` — Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via `emergentintegrations` + `EMERGENT_LLM_KEY`. Runs per-module in parallel with `Semaphore(4)`. Hard no-fabrication guard: modules with empty data return `"No results generated for this analysis."` WITHOUT calling the LLM. `_fallback_slices()` condenses workflow into per-module top-20 blobs so prompts stay small.

**End-to-end verified**: Withania somnifera + Alzheimer disease payload → 3 detailed per-module interpretations + 1 Overall Summary from `anthropic/claude-sonnet-4-5-20250929`.

**Files touched**: `reportBuilder.js`, `reportPdf.js`, `reportDocx.js`, `AIScientificReport.jsx`, `api.js`, `backend/routes/report.py`.

**Session C remaining**: WeasyPrint PDF, drag-drop reorder, editable DOCX tables, figure embedding from existing plots, cross-ref polish.


## 2026-02-25 — AI Report Redesign · Session C (Figures + DOCX polish + Cross-refs)

**Editable DOCX tables** (`reportDocx.js`): tables were already native `docx.Table` (fully editable). Polish applied — alternating row shading (`#F5F3FE` lavender on odd rows), bold white text on brand-purple header row, brand-purple `#5139ED` heavier bottom border under the header row (BorderStyle.SINGLE, size 12), thin `#E5E7EB` grid elsewhere, right-alignment for numeric cells (data-columns only, first column stays left).

**Figure embedding** (new `lib/reportFigures.js` + integration into PDF/DOCX):
- `renderFigureToPng({ type:"hbar", data, xLabel, reverse })` — offscreen `<canvas>`-based horizontal-bar renderer that handles negative values (docking), positive log values (GO/KEGG), long labels (28-char truncation) and value annotations. Returns a `data:image/png;base64,…` URL usable by both jsPDF `.addImage()` and docx `ImageRun`.
- **Docking Results** now embeds a top-10 binding-affinity chart (ΔG kcal/mol, brand-purple bars extending leftward from zero for the negative axis) with caption cross-referencing the accompanying table.
- **GO Enrichment** embeds a top-10 −log₁₀(q) bar chart.
- **KEGG Enrichment** embeds the same for selected pathways.
- Every figure gets an auto-numbered `Fn` id and appears in the body with an italic `Figure n. Title — Caption` line, matching the Table style.

**Automatic cross-references + numbering polish** (`reportBuilder.js` filter pass):
- After the module-selection filter drops sections, tables and figures are **renumbered sequentially** (`T1, T2, T3…` / `F1, F2, F3…`) so surviving numbers never skip.
- Every body/paragraph/interpretation string is scanned for `"Table N"` and `"Figure N"` references and rewritten to match the new numbering — with a two-pass staging (`__T_N__` intermediate token) to prevent cascade collisions.
- `doc.tables` and `doc.figures` arrays are re-keyed in sync.
- The `Overall Summary` section (Session B) sits between Results and References and is included in the section auto-renumbering.

**Files touched**
- `frontend/src/lib/reportFigures.js` (new)
- `frontend/src/lib/reportBuilder.js` (renumber pass + figure specs on docking/GO/KEGG)
- `frontend/src/lib/reportPdf.js` (`drawFigure` helper)
- `frontend/src/lib/reportDocx.js` (`ImageRun` embedding + zebra-stripe table polish)

**Verified**: page compiles clean, all 4 restored-workflow modules auto-selected with all 4 sub-toggles enabled. Cross-refs will now be correct even with arbitrary module selections.

Report Redesign complete: **Sessions A + B + C shipped**. WeasyPrint rewrite + drag-drop reorder deferred as they're lower-impact than the shipped scope.


## 2026-07-28 — Single Super Admin Architecture ✅

Complete Platform Administration Backbone shipped per user's spec:
- **Single super admin only** — no RBAC, no invites, no multi-admin. Seeded from env.
- **Separate auth namespace** — `/api/admin/*` and admin_access_token / admin_refresh_token cookies fully isolated from regular user auth.
- **Optional 2FA** — supports BOTH TOTP (authenticator app) and Email OTP; admin picks.
- **Comprehensive Audit Log** — every login / logout / settings mutation / 2FA action recorded to `admin_audit_logs` collection.
- **Settings Dashboard** — 5 live-editable groups (Branding, SMTP, OAuth, Node Pricing, Feature Flags).

**Backend** (all in `/app/backend`):
- `admin_service.py` (330 L) — JWT (audience="admin", 30 min access / 8 h refresh, iat+jti for distinct refreshes), bcrypt hashing, brute-force lockout (KEYED BY EMAIL ONLY — critical fix: k8s ingress rotates client IPs and defeated IP-based locking), TOTP via pyotp + QR generation, email OTP via existing email_service, password reset (mock SMTP → link logged), platform_settings CRUD, audit log writer.
- `routes/admin.py` (485 L) — all `/api/admin/*` endpoints (login/logout/refresh/me, 2FA setup/confirm/verify/disable, password reset flows, audit log listing with q+status filters, per-key settings CRUD, dashboard stats, users read-only listing).
- `server.py` wiring at lines 1289-1313; startup init at line 1349 (indexes + super admin seed + default settings).
- New env: `SUPER_ADMIN_EMAIL="superadmin@phytonet.ai"`, `SUPER_ADMIN_PASSWORD="SuperAdmin@2026!"`, `SUPER_ADMIN_JWT_SECRET` (falls back to JWT_SECRET).
- MongoDB collections: `admin_audit_logs`, `admin_login_attempts` (TTL 24h), `admin_email_otp` (TTL 10m), `admin_password_reset_tokens` (TTL 1h), `platform_settings`.
- pyotp + qrcode[pil] added to requirements.txt.

**Frontend** (all in `/app/frontend/src/pages/admin` + `/context/AdminAuthContext.jsx`):
- `AdminAuthContext` — separate React context; state = null | admin | false; supports 2FA challenge flow.
- `AdminLogin.jsx` — 2-step form: credentials → optional 2FA code input (auto-detects method + auto-sends email OTP when applicable).
- `AdminLayout.jsx` — persistent dark-themed sidebar (Dashboard, Users, Audit Log, Settings, Profile) + Outlet + route protection.
- `AdminDashboard.jsx` — 4 stat cards (users, signups, projects, nodes-consumed) + recent activity table + security posture panel.
- `AdminUsers.jsx` — paginated read-only users list; password_hash / totp_secret NEVER included in API response.
- `AdminAuditLog.jsx` — searchable + status-filterable log table with pagination.
- `AdminSettings.jsx` — 5-tab settings panel (Branding, SMTP, OAuth, Node Pricing, Feature Flags); SMTP password write-only.
- `AdminProfile.jsx` — change password + enable/disable 2FA (TOTP with QR + secret display OR Email OTP flow).
- `AdminPasswordReset.jsx` — public forgot-password + reset-password routes.
- `App.js` — SiteChrome wrapper hides main SiteHeader/SiteFooter on `/admin/*` routes; nested route group under `/admin/*` with layout.

**Testing**: `backend/tests/test_admin_super.py` — 30 tests covering login (success/negative/lockout), session (me/refresh/logout), change password, TOTP full lifecycle, Email OTP setup+verify+disable, forgot+reset, audit log filtering, settings (with SMTP password masking assertion), dashboard, users listing, and regression on regular `/api/auth/login`. 23/24 pass (95%); 1 remaining failure is a pytest-xdist parallel-worker race on shared 2FA state (product code is correct — TOTP test passes standalone; verified via curl 6× bad password → 5×401 + 1×429 lockout).

**Bugs found + fixed by testing agent this iteration**:
- CRITICAL: brute-force lockout defeated because k8s ingress rotates client IPs (10.208.151.74 / .75) — fixed by keying lockout on email only (single-admin threat model).
- 2× tz-naive vs tz-aware datetime compare 500s in `verify_email_otp` and `reset_password` — fixed.
- Added `iat`/`jti` claims to admin JWTs so `refresh` always issues a distinct token even within the same wall-clock second.

**Test credentials updated** in `/app/memory/test_credentials.md`:
- Super admin: `superadmin@phytonet.ai` / `SuperAdmin@2026!` — console at `/admin/login`.
- Regular admin unchanged: `admin@phytonet.ai` / `Admin123!` — main site.

**Next Action Items**
- P2: Wire Razorpay/Stripe payment gateway for node recharge (Node Pricing tab already editable via admin settings; only checkout call is mocked).
- P2: Molecular Dynamics server-side execution (Celery/GROMACS scaffolding present).
- P3: Test-suite hygiene — refactor `test_admin_super.py` to eliminate parallel-worker state races on admin's 2FA state (add xdist_group markers, or use per-worker synthetic admin accounts).
- P3: Wire admin's `platform_settings` back to runtime behaviour (e.g., feature_flags.maintenance_mode should actually enable maintenance page; branding.app_name should render in SiteHeader).


## 2026-07-28 — Admin User Management ✅

Extended the admin Users page from read-only to full user lifecycle management. Every mutation is protected against touching the super admin, and every action writes an `admin.user_*` audit entry.

**Backend** (`/app/backend/routes/admin.py` — 6 new endpoints):
- `GET /api/admin/users/{id}` — full user detail + last 20 node ledger rows + project count
- `PATCH /api/admin/users/{id}` — edit first/last name, username, role, institution, department, country, designation, email_verified
- `POST /api/admin/users/{id}/suspend` — sets `is_suspended: true` + reason; user login endpoint now returns 403 with the reason
- `POST /api/admin/users/{id}/unsuspend` — clears the flag
- `POST /api/admin/users/{id}/reset-password` — admin force-sets a new password (min 8 chars); user must be notified out-of-band
- `POST /api/admin/users/{id}/nodes/adjust` — grant/deduct nodes (`delta` between -100k and +100k); balance can never go below 0; ledger entry with `module: "admin_adjustment"` + admin email in meta
- `DELETE /api/admin/users/{id}` — hard delete + cascade cleanup (projects, versions, node_transactions, tokens)
- List endpoint now supports `?verified=true|false` and `?suspended=true|false` filters

**User login gate** (`/app/backend/auth_service.py`): suspended users receive 403 with their configured suspension reason at `/api/auth/login`.

**Super-admin protection**: every mutation endpoint calls `_protect_super_admin(u)` which returns 403 if the target user has `is_super_admin=True` or matches `SUPER_ADMIN_EMAIL`. Verified via curl.

**Frontend**:
- `pages/admin/UserDetailModal.jsx` (new, ~400 L) — modal with: profile overview grid, editable form (8 fields + verified checkbox), 4 action buttons (Suspend/Reactivate, Reset password, Adjust nodes, Delete user), suspended-banner, and recent-node-activity table with credit/debit color coding.
- `pages/admin/AdminUsers.jsx` — added verified + suspended filter dropdowns, click-row-to-open behaviour, status column now shows suspended/verified/unverified pills, super admin marked with amber shield icon.

**Testing**: full end-to-end verified via curl for all 6 endpoints (200s on happy path, 403 for super-admin protection). Frontend flow verified via Playwright (list render, modal open, edit save, adjust +25 nodes, suspend, unsuspend all successful).

**MOCKED**: password reset does NOT auto-email the user — admin must communicate the new password out-of-band (UI includes a note). Full user notification email can be wired later.

**Next Action Items**
- P2: Continue MD Execution work per user's earlier question (still pending decision on option a/b/c/d/e).
- P3: Optional — send a notification email when admin resets a user's password (once SMTP is production-configured on Hostinger).
- P3: Cross-user audit-log filtering (search audit log by target user).


## Implemented (2026-02-15) — PlantInfoCard Layout & Download Button
Refined the botanical Plant Information card per user request:
- **Layout**: single hero image (Whole Plant) on the LEFT (2/5 width) with the "Traditional medicinal uses" description on the RIGHT (3/5 width). The second "Medicinal Part Used" tile was removed for a cleaner reading experience; the medicinal part is now surfaced as a pill badge ("Part used: Root", etc.) beneath the description.
- **Lightbox Download**: added a `Camera`-icon "Download image" pill floating at the top-left of the lightbox modal. Clicking it triggers a real "Save As" via `fetch → blob → <a download>` when CORS permits; if Wikimedia blocks the fetch, it falls back to opening the original-resolution file in a new tab so the user can right-click → Save.
- **File cleanup**: dropped the `fetchArticleImages`/`WIKI_MEDIALIST` helper (no longer needed with a single image), removed unused `medicinalPartUrl`, and updated the top-of-file docstring.

**File**: `/app/frontend/src/pages/PlantDatabase/parts/PlantInfoCard.jsx`

**Verification**: screenshot on `Withania somnifera` confirms the new left/right layout and the download pill inside the lightbox.

## Implemented (2026-02-15) — Standalone Workflow Information Card

Every standalone module (`/plant-database`, `/admet`, `/compound-target-prediction`, `/disease-target-prediction`, `/dock`) now renders a sticky **Workflow Information Card** on the left column (25-30% width, 300-340px). The main module UI occupies the right column (70-75%). On mobile the card stacks above the content and can be collapsed via a chevron toggle. Guided workflow (`/phytonet-ai`) is unaffected — it continues to render the step-tracker sidebar.

**New files**
- `/app/frontend/src/components/WorkflowInfoCard.jsx` — sticky glass-morphism card with numbered vertical timeline (6 default steps: Input → Data Validation → Processing → Analysis → Results → Download/Export), progress ribbon ("Step X of Y" + %), Lucide-icon step markers with active/done state colouring, supported-databases chip row, and mobile collapse toggle.

**Modified files**
- `/app/frontend/src/components/WorkflowLayout.jsx` — accepts optional `moduleInfo` and `currentStep` props. When standalone + moduleInfo → renders 2-column responsive layout (sticky info card left + children right). Legacy behaviour preserved when props are omitted.
- `/app/frontend/src/pages/PlantDatabase/index.jsx` — new `hasOuterLayout` prop; when true the outer wrapper is owned by the parent (PhytoNetAI guided flow). Direct route wraps itself in WorkflowLayout with moduleInfo.
- `/app/frontend/src/pages/PhytoNetAI.jsx` — passes `hasOuterLayout` to avoid double-wrapping.
- `/app/frontend/src/pages/DrugLikeness/index.jsx`, `/app/frontend/src/pages/TargetPrediction.jsx`, `/app/frontend/src/pages/DiseaseTargets.jsx`, `/app/frontend/src/pages/MolecularDocking.jsx` — each declares `moduleInfo` (title, tag, description, supported databases) and derives `currentStep` (0-5) from its own state (loading, results, selection counts). Passed to WorkflowLayout.

**Per-module supported databases**
- Plant Database: IMPPAT · LOTUS · PubChem · InChI
- ADMET & Drug-Likeness: ADMET-AI · Chemprop · Lipinski Ro5 · Veber · Ghose
- Compound Target Prediction: ChEMBL · SwissTargetPrediction · UniProt · STITCH · PubChem BioAssay
- Disease Target Identification: Open Targets · CTD · NCBI Gene · UniProt · HGNC
- Molecular Docking: AutoDock Vina · RCSB PDB · Meeko · RDKit · UniProt

**Backend/analysis pipeline**: unchanged. Purely frontend enhancement.

**Verification**: screenshotted all 5 standalone routes at desktop viewport; step highlighting updates live as the researcher progresses (verified on `/plant-database` — Step 1 (Input) → Step 4 (Analysis) after a Withania somnifera search).



## Implemented (2026-02-04) — AI Research Assistant (Chat-first Workspace)

Delivered Phase-1 + Phase-2 in a single session per user's Option (b) choice.

**Route** `/research` (`/phytonet-ai` and every existing standalone module
remain fully functional and unchanged — zero regressions confirmed by
testing agent iteration 41).

**Backend**
- `research_service.py` — modular planner + tool registry + executor:
  - `plan(prompt, history, project_id, attachments)` → Claude Sonnet 4.5
    (`claude-sonnet-4-5-20250929` via Emergent LLM Key) returns a JSON
    envelope classifying intent as `plan | followup | chat`.
  - `TOOL_REGISTRY` — 7 tools, each an httpx wrapper around an EXISTING
    endpoint (`/api/plant/search`, `/api/lotus/simple`,
    `/api/compound/lookup`, `/api/target/resolve`, `/api/disease/search`,
    `/api/disease/targets`, `/api/admet/predict`). AI never fabricates —
    every result comes from an existing module.
  - `interpret(plan, results, project_id)` — a second Claude call produces
    a concise scientific interpretation after every run.
  - Robust JSON parser handles ```json fences and stray prose.
- `/app/backend/routes/research.py` — HTTP endpoints (cookie-auth via
  `auth_service.make_get_current_user`):
  - `POST /api/research/projects` (create) · `GET` (list) · `GET/{pid}`
    (fetch with messages+runs) · `DELETE /{pid}` (remove).
  - `POST /{pid}/message` — persists user message, calls planner, appends
    assistant message + creates pending run if plan is produced. Auto-sets
    project title on first plan.
  - `POST /{pid}/execute/{run_id}` — kicks off `BackgroundTask` executor
    that iterates steps, updates run doc after every step so the client's
    poller can render live progress.
  - `GET /{pid}/status/{run_id}` — poll endpoint.
  - `POST /{pid}/upload` — multipart file upload. Parses SMILES from `.smi`
    / `.txt` / `.csv` / `.xlsx`. Passes MOL/SDF through raw for downstream
    modules. Returns `{name, kind, size, content_preview, extracted}`.
- MongoDB collection `research_projects` schema:
  `{_id, user_id, title, messages:[{role, text, mode?, run_id?, plan?,
   title?, created_at, attachments?}], runs:[{id, title, status, reasoning,
   plan:[{id,tool,label,args,status}], results:[{...,result:{card,data,message}}],
   interpretation, created_at, completed_at}], created_at, updated_at}`.

**Frontend**
- `/app/frontend/src/pages/ResearchWorkspace.jsx` (~700 lines, dark
  glassmorphism theme):
  - Left `Sidebar` — "New Research" gradient button, project history with
    unread count + relative timestamps + delete affordance.
  - Center `Chat` — messages stream with distinct user/AI bubbles.
    `ChatMessage` renders `PlanCard`, one or more `ResultCard`s (compound
    table, target table, disease table, ADMET table, compound/target
    details JSON), and auto-scrolls on new content.
  - Right `VizPanel` — collapsible aside (auto-opens when a run completes),
    shows the same result cards + a green "Interpretation" summary from
    Claude.
  - `Composer` — textarea + paperclip attach + drag-and-drop file zone.
    Enter sends, Shift+Enter for a newline. Attachment chips above input
    with parsed-SMILES count.
  - `SuggestedPromptsGrid` — 6 tiles: Withania somnifera, Quercetin
    targets, Type-2-diabetes genes, Curcumin ADMET, Turmeric vs Ginger,
    anti-inflammatory turmeric workflow. Clicking a tile spins up a new
    project and auto-sends the prompt.
  - Auto-executes on `mode="plan"`, polls `/status` every 2s, opens viz
    panel on `completed | failed`.
- `/app/frontend/src/App.js` — `/research` route registered.
- `/app/frontend/src/pages/PhytoNet.jsx` — Modules gallery now leads with
  the "AI Research Assistant" flagship card (link to `/research`) and
  keeps the classic linear workflow as a secondary card.

**Environment**
- `EMERGENT_LLM_KEY` added to `/app/backend/.env` for Claude Sonnet 4.5.

**Verification (testing agent iterations 40 → 41)**
- Backend: 11/11 pytest cases pass (CRUD, planner classifies plan /
  followup / chat correctly, execute+poll completes with real IMPPAT/LOTUS
  data, CSV SMILES extraction, auth guard, and full regression against
  existing endpoints).
- Frontend: 95% pass — login, new project, plan card, auto-execute → real
  81 compounds for Withania somnifera, JSON download, suggested prompts,
  CSV attach with SMILES count, all page regressions clean.
- Remaining minor UX fix applied: viz-panel breakpoint dropped from `xl`
  → `lg` so it appears on any standard desktop, and `setVizRun` now reads
  the fresh full-run doc after refetch instead of the lean status payload.

**NOT DONE (per user's explicit "do NOT implement yet" list)**
- PDF report generation
- Collaboration / sharing
- Retry engine on failed steps
- Saved-project filters
- Multi-agent execution
- Background scheduling

## Implemented (2026-02-04) — Marketing Video Suite

Produced 7 landscape 16:9 (1920×1080) MP4s with narration voice-over, served
under `/api/videos/*.mp4` via FastAPI StaticFiles mount.

**Pipeline** (`/app/scripts/videos/`):
1. Narration text scripts per module (`narration_scripts.py`).
2. gTTS renders each script to `audio/*.mp3` (~150 wpm, US English).
3. Playwright records live app sessions to `raw/*.webm` at 1920×1080
   (`record_01_plant_database.py`, `record_all.py`).
4. `mux.py` runs ffmpeg to pad the video with the last frame until it
   matches audio length, applies a soft fade in/out, overlays a
   3-second purple title-card in the top-left corner, transcodes to
   H.264/AAC MP4 in `final/`.

**Videos delivered**
| Slug                       | Length | Size   |
|----------------------------|--------|--------|
| 01_plant_database.mp4      | 81 s   | 5.2 MB |
| 02_target_prediction.mp4   | 69 s   | 2.0 MB |
| 03_disease_targets.mp4     | 64 s   | 2.6 MB |
| 04_admet.mp4               | 69 s   | 2.2 MB |
| 05_molecular_docking.mp4   | 71 s   | 2.0 MB |
| 06_ai_agent.mp4            | 78 s   | 4.4 MB |
| 07_walkthrough.mp4         | 133 s  | 9.5 MB |

**Files added**
- `/app/scripts/videos/narration_scripts.py`
- `/app/scripts/videos/record_01_plant_database.py`
- `/app/scripts/videos/record_all.py`
- `/app/scripts/videos/mux.py`
- `/app/backend/server.py` — mounted `/api/videos` static route.

**Notes**
- Narration currently uses gTTS. Can be upgraded to OpenAI TTS ("marin"/"cedar")
  via Emergent LLM Key by swapping the gTTS call in `mux.py`.
- Sora 2 hero video was requested but not attempted this session (playbook
  status uncertain for Emergent Universal Key at time of build).

## Fix (2026-02-04) — Welcome mail delivery unblocked

**Root cause**: Resend account was in sandbox mode (`onboarding@resend.dev`
FROM), which blocks delivery to any recipient other than the account owner
(SMTP 550). Verification + welcome emails were dispatched from the app but
rejected by Resend.

**Fix**: Verified `phytonetai.com` on Resend, rotated to a new API key, and
updated `backend/.env`:
```
EMAIL_PROVIDER="resend"
EMAIL_FROM="PhytoNet AI <hello@phytonetai.com>"
SMTP_USERNAME="resend"
SMTP_PASSWORD="<set-on-vps-only>"
```

**Verified**: End-to-end signup delivers both emails:
- `[EMAIL] Sent to vaaroninnovations@gmail.com via resend (Verify your PhytoNet AI account)`
- `[EMAIL] Sent to vaaroninnovations@gmail.com via resend (Welcome to PhytoNet AI — your workspace is ready)`

Also unblocks: password-reset emails, 2FA/OTP mail, and admin replies to
contact-form submitters.

## Implemented (2026-02-04) — Admin Reply From Inbox + Welcome Email (P0)

**Welcome email on signup**
- New `welcome_email_html()` template in `email_service.py` — warm onboarding
  card matching the brand palette, mentions the 10-node welcome bonus, links
  to the four core modules, and prompts a reply.
- `auth_service.dispatch_welcome_email()` helper (public) fires:
  - Right after password register (`POST /api/auth/register`) via
    BackgroundTasks (so registration returns instantly).
  - Right after Google OAuth first-time signup in `google_oauth.py` (sync,
    since OAuth returns a 302 redirect).
- Verified: two SMTP send attempts (verification + welcome) are logged on
  every fresh signup.

**Admin reply from inbox**
- New endpoint `POST /api/admin/contact/messages/{id}/reply` with body
  `{subject?, body}`. Sends the email via the existing multi-provider
  `email_service.send_email()`, appends a reply record to the message's
  `replies` array `{by, subject, body, sent_at, delivered, provider,
  delivery_note}`, flips status to `replied`, and audit-logs the action.
- `admin_reply_email_html()` template quotes the original inquiry so
  recipients get full context.
- Reply persistence is unconditional — even when the SMTP provider fails the
  outgoing note is stored with `delivered:false` + `delivery_note` so the
  thread never loses history.
- Frontend: `AdminContact.jsx` drawer now shows a "Sent replies (N)" thread
  (delivered / failed badges, timestamp, provider) plus a reply composer
  (subject + body + Send reply). Toast surfaces delivery outcome.
- Verified end-to-end: admin login → open message → send reply → email
  delivered via Resend → thread updated, status becomes `replied`.

**Files changed**
- `/app/backend/email_service.py` — added `welcome_email_html()` and
  `admin_reply_email_html()` templates.
- `/app/backend/auth_service.py` — added `dispatch_welcome_email()`; called
  in `POST /api/auth/register`.
- `/app/backend/google_oauth.py` — welcome email fires on new Google signups.
- `/app/backend/routes/contact.py` — `ContactReplyPayload`,
  `POST .../reply`, `replies[]` in the serializer, top-level
  `import email_service`.
- `/app/frontend/src/pages/admin/AdminContact.jsx` — reply thread UI +
  composer + delivery-status toast.

## Implemented (2026-02-04) — Contact Spam Guard (P0)

Three defense layers added to public `POST /api/contact`:

1. **Per-IP rate limit** — 5 messages / rolling hour, 20 / rolling day. Returns
   HTTP 429 with a friendly retry message. Trusts `X-Forwarded-For` first hop.
2. **Honeypot field** — hidden `website` input that only bots auto-fill.
   Submissions with a non-empty value silently return 200 `{ok: true, id:
   "honeypot"}` and are never persisted.
3. **Friendly math captcha** — `GET /api/contact/challenge` issues a signed
   challenge (`{challenge_id, question: "What is 9 − 2?"}`). Answer verified
   server-side, single-use, 10-minute TTL (`contact_challenges` collection
   with TTL index). Frontend fetches a fresh captcha on mount and after each
   successful submit, with a Refresh button.

**Files changed**
- `/app/backend/routes/contact.py` — added challenge endpoint, honeypot check,
  rate-limit guard, and `initialize(db)` for the TTL index.
- `/app/backend/server.py` — startup calls `_contact_routes.initialize(db)`.
- `/app/frontend/src/pages/Home.jsx` — `ContactForm` fetches the challenge,
  renders an inline captcha widget + hidden honeypot, and sends both fields.

**Verification**: curl tests confirmed:
- Missing captcha → 422
- Valid submit → 200 (persisted)
- Captcha replay → 400 "Captcha expired or invalid"
- Honeypot filled → 200 with id="honeypot" (not persisted)
- Wrong captcha answer → 400 "Incorrect captcha answer"
- 6th submit from same IP in an hour → 429 rate-limited

## Implemented (2026-02-04) — Homepage FAQ Redesign & Contact System (P0)

**Frontend**
- `/app/frontend/src/pages/Home.jsx`: FAQ section rebuilt as a responsive 2-column
  layout — FAQ accordion (LEFT) + Contact form (RIGHT), single-column on mobile.
  New `ContactForm()` component POSTs to `/api/contact`, has full validation +
  success/error banners (form uses `noValidate` so custom JS validation surfaces
  the `contact-error` banner correctly).
- `/app/frontend/src/pages/admin/AdminLayout.jsx`: added sidebar entry
  "Contact Messages" (`data-testid="admin-nav-contact"`).
- `/app/frontend/src/pages/admin/AdminContact.jsx`: new Super Admin dashboard
  with summary cards (Total / New / Read / Replied), status + search filters,
  paginated table, detail drawer with status change, admin-notes save, and
  permanent delete.
- `/app/frontend/src/App.js`: registered `/admin/contact` route.

**Backend**
- `/app/backend/routes/contact.py`: new module exposing two routers:
  - Public `POST /api/contact` (no auth) → inserts into `contact_messages`.
  - Admin `GET/PATCH/DELETE /api/admin/contact/*` (cookie-based admin auth).
  - `GET /admin/contact/messages/{id}` auto-flips status `new → read` on first
    open. All mutations are audit-logged.
- `/app/backend/server.py`: mounted both routers under `/api`.

**Schema (`contact_messages`)**: `{name, email, institution, subject, message,
status: new|read|replied, admin_notes, created_at, updated_at, ip, user_agent}`.

**Verification**: `testing_agent_v3_fork` iteration 39 — 14/14 backend pytest
cases pass, all admin + public frontend flows pass. `test_credentials.md`
corrected to `superadmin@phytonet.ai / SuperAdmin@2026!`.

## Backlog (updated 2026-02-04)
- P1 — Inject ADMET / Docking Validation outputs into the AI Scientific Report.
- P2 — Molecular Dynamics server-side execution via GROMACS + Celery workers.
- P2 — PDF Fact Sheet for the Plant Information card (one-click printable).
- P2 (nice-to-have) — Rate-limit or CAPTCHA on public `POST /api/contact` (currently trivially spammable).

## 2026-02-06 — AI Research Assistant Phase 1 Closeout ✅

Validated + fixed the three pending features that were injected but untested in
the previous handoff (Pathway Enrichment · Cytoscape Network · Save & Share).

**Backend fixes (`research_service.py`)**
- `tool_pathway_enrichment` `_extract_rows` helper — the previous
  `kegg.get("terms") or kegg.get("results") or kegg or []` fallback tried to
  slice the raw KEGG dict when both keys were missing (KEGG returns
  `{"pathways": [...]}`), raising `unhashable type: 'slice'`. New helper
  handles `pathways` / `terms` / `results` / `rows` and plain-list responses.
- `_auto_pick_compounds` now falls back to single-compound `compound_lookup`
  results (canonical_smiles / isomeric_smiles) so
  `[compound_lookup → target_predict]` chains propagate SMILES automatically.
  Fixes the "Target prediction needs at least one compound" error surfaced by
  the iteration-42 testing agent.

**Frontend additions**
- `pages/ResearchWorkspace.jsx` — new `ProjectHeader` component with a Share
  button (`data-testid=share-project-btn`) that toggles a popover
  (`data-testid=share-popover`) with public URL input, copy button, and
  disable-sharing action.
- `pages/SharedResearch.jsx` — new public read-only page rendering the shared
  project's title, messages, run status, and per-tool step summary. No auth
  required.
- `App.js` — `/research/shared/:slug` route registered.
- Small tweak: `enrichment_table` renderer accepts `adj_p_value` fallback so
  KEGG rows show the correct adjusted p-value.

**End-to-end verified**
- Pathway enrichment on `AKT1, EGFR, TP53, TNF, IL6` → 152 KEGG + 200 GO rows,
  card renders with pathway names + p-values.
- `Predict protein targets for Curcumin` → plan `[compound_lookup, target_predict]`
  auto-chains; 19 compound/target nodes, 18 edges rendered by Cytoscape.
- Share button generates `/research/shared/<slug>` URL; unauth fetch returns
  title + messages + runs with `user_id` redacted; disable clears the slug.

**Files touched**
- `backend/research_service.py`
- `frontend/src/pages/ResearchWorkspace.jsx`
- `frontend/src/pages/SharedResearch.jsx` (new)
- `frontend/src/App.js`

**Next Action Items**
- P1 — Inject ADMET / Docking Validation outputs into the AI Scientific Report.
- P2 — Split ResearchWorkspace.jsx (~1170 lines) into components/research/*.
- P2 — AI Research Assistant Phase 2 (PDF report gen, retry engine, filters).
- P2 — Molecular Dynamics server-side execution via GROMACS + Celery.

## 2026-02-06 (pm) — /research Refactor + Retry-Failed-Step ✅

**Refactor** — Split the 1170-line `ResearchWorkspace.jsx` into a thin (270 L)
orchestrator + `components/research/*.jsx`:
- `Sidebar.jsx` (71 L) — projects list + New Research button.
- `Composer.jsx` (77 L) — chat input + drag-drop upload + attachments chips.
- `ProjectHeader.jsx` (93 L) — title + Share popover (copy / open / disable).
- `ChatMessage.jsx` (64 L) — user/assistant bubble, plan card, next steps.
- `VizPanel.jsx` (51 L) — right-side viz + interpretation + next steps.
- `EmptyState.jsx` (49 L) — hero + SuggestedPromptsGrid.
- `cards.jsx` (533 L) — PlanCard (now with per-step Retry button), TableCard,
  ResultCard (compound/target/disease/admet/enrichment/details), NetworkCard
  (Cytoscape compound-target graph), + CSV/Excel/JSON download helpers.
- Behavior preserved 1-for-1 (verified: 100 % iteration_43 backend + 7/7 UI).

**Retry Failed Step (option b — "resume from failed step")**
- Backend `POST /api/research/projects/{pid}/retry/{run_id}/{step_id}` —
  finds the target step, resets it + every downstream step to `pending`
  (clears their progress), truncates `results` to strictly-earlier successes,
  flips run to `running`, kicks off `_execute_in_background` via
  `BackgroundTasks`. Returns `{ok, retried_from, reset_steps}`.
- `_execute_in_background` now short-circuits any step whose stored
  `plan[idx].status == 'done'` — pulls its previous result out of
  `run.results` and appends without re-running. So on retry, upstream done
  steps stay untouched while the failed step + downstream re-execute.
- Frontend PlanCard renders a `data-testid=plan-step-{i}-retry` amber pill
  next to any step with `status === "error"`. Clicking it fires
  `POST /research/projects/{pid}/retry/{run_id}/{step_id}`, toasts "Retrying
  from failed step…", and switches the button to a spinner until polling
  detects `completed` / `failed`.

**Small polish**
- Cytoscape `line-color` now uses `#8139ED` + `line-opacity: 0.33` (dropping
  the invalid 8-digit hex that produced a console warning).

**Verified end-to-end** (iteration_43)
- Backend pytest 4/4 pass (create project, plan-execute, retry-step,
  bad-step 404).
- Frontend Playwright 7/7 pass (workspace load · sidebar · project header +
  Share · composer · plan / msg / network cards · retry-step UI end-to-end
  via forced-failure MongoDB injection · VizPanel post-completion).

**Files touched**
- `backend/routes/research.py` — retry_step endpoint + prior-step reuse.
- `frontend/src/components/research/*.jsx` — 7 new files (Sidebar, Composer,
  ProjectHeader, ChatMessage, VizPanel, EmptyState, cards).
- `frontend/src/pages/ResearchWorkspace.jsx` — trimmed to composition + hooks.

**Next Action Items**
- P1 — AI Report enrichment with real ADMET + docking numbers.
- P2 — Extract NetworkCard.jsx into its own file so cytoscape can be
  React.lazy()-code-split (cards.jsx is still 533 L).
- P2 — AI Research Assistant Phase 2 (PDF export · saved-project filters ·
  multi-agent · scheduling).

## 2026-02-06 (evening) — Tabbed /app Workspace ✅

Major UX overhaul: introduced a browser-tab-style shell at `/app` that becomes
the logged-in landing surface after the marketing homepage's "Start Free
Analysis" CTA. Home page itself is untouched.

**New route `/app`** (guarded by auth — guest is bounced to `/` + login modal)
- Header tabbar with a permanent **Home** tab (non-closable) plus dynamic
  project / module tabs. Up to 12 tabs, horizontal scroll beyond.
- Tabs stay MOUNTED (`display:none` when inactive) so chat state, scroll
  positions, and iframe navigation are preserved when switching.

**Home tab**
- 75%-width main area: hero chat bar (`home-chat-input` + `home-chat-send`),
  4 suggested prompts, Recent Projects grid (rich cards with title, preview,
  message count, updated_at).
- 25%-width right column: 9 standalone module cards (PhytoNet AI, Plant DB,
  Compound→Target, Disease Targets, ADMET, Docking, MD, Report, Databases).
  Clicking a module opens it as a new tab.

**Project tab (split-pane workspace)**
- LEFT pane: chat messages, plan cards, composer, suggested next steps,
  retry-step buttons. `ChatMessage` gets a `hideResults` prop so results no
  longer render inline.
- RIGHT pane: aggregated `ResultCard` outputs across every run (tables,
  network Cytoscape, images), plus latest interpretation.
- **Draggable divider** via new `SplitPane` component. Ratio bounded to
  [0.22 – 0.78] and persisted per-tab.

**Module tab**
- Loads the standalone page (`/plant-database`, `/admet`, `/molecular-docking`,
  etc.) inside an `<iframe>` with a small toolbar showing the path + an
  "Open standalone" out-link.
- Iframe source has `?embed=1` appended; `SiteChrome` now hides the outer
  `SiteHeader` + `SiteFooter` when `embed=1` is present, so users no longer
  see stacked headers.

**Persistence** (via `useTabState`, keyed on `user.id`)
- Open tabs list · active tab id · panel-size ratio per tab · scroll positions
  (left / right) per tab. All serialized to `localStorage` key
  `phytonet.app.tabs.v1.<userId>`.

**Homepage CTA rewiring** (`Home.jsx`)
- Three "Start Free Analysis" buttons (`hero-primary-cta`, `why-choose-cta`,
  `final-cta-start`) converted from `<Link to="/phytonet-ai">` to buttons
  that call `guard(() => navigate("/app"))`. Guest → auth modal; authed →
  direct navigate.
- Design/placement of the buttons is unchanged.

**Files added**
- `frontend/src/pages/AppWorkspace.jsx`  (main orchestrator)
- `frontend/src/hooks/useTabState.js`
- `frontend/src/components/workspace/TabBar.jsx`
- `frontend/src/components/workspace/HomeTab.jsx`
- `frontend/src/components/workspace/ProjectTab.jsx`
- `frontend/src/components/workspace/ModuleTab.jsx`
- `frontend/src/components/workspace/SplitPane.jsx`

**Files edited**
- `frontend/src/App.js` (added `/app` + `/workspace` routes; SiteChrome
  respects `?embed=1`)
- `frontend/src/pages/Home.jsx` (Start Free Analysis CTAs)
- `frontend/src/components/research/ChatMessage.jsx` (`hideResults` prop)

**Regression-safe**
- `/research`, `/research/shared/:slug`, `/dashboard`, `/phytonet-ai`, and all
  standalone modules unchanged. Backend untouched.

**Verified end-to-end** (iteration_44)
- 30/30 frontend checks pass (guest→login redirect, Home layout, project tab
  split pane, drag + persistence, module iframe + tab-switching state
  preservation, close-tab rules, multi-tab reload persistence, regression).

**Next Action Items**
- Optional: fix invalid `<span>` inside `<option>` in SiteChrome (minor
  console warning).
- P1 — AI Report enrichment with real ADMET + docking numbers.
- P2 — Extract `NetworkCard.jsx` into its own file for React.lazy split.
- P2 — Phase 2 assistant (PDF export, filters, scheduling).

## 2026-02-06 (late pm) — Fix: Chat Blank & Flicker on First Send ✅

Bug (from user screen recording): after clicking a suggestion or typing in the
Home chat bar, the newly-opened project tab showed a blank chat area with only
a "Planning with Claude Sonnet 4.5…" spinner for ~4 s. The user's message
never appeared. Closing and reopening the project made it "look normal".

**Root cause** — React 18 Strict-Mode dev double-invoked the `load(projectId)`
effect. Both fetches were in flight; whichever resolved *last* called
`setProject(data)` and overwrote:
1. the optimistic user-message bubble we had just added, AND
2. any real messages the send POST had already returned.

The user perceived this as flicker or blank chat until the tab was
closed/reopened (fresh mount, no race).

**Fix (`ProjectTab.jsx`)**
- Converted the load useEffect to an abort-safe pattern with `let alive =
  true`; any pending fetch is discarded when the cleanup runs.
- Kept the optimistic setProject for the user message so it appears within
  ~50 ms of clicking send/suggestion (no more "empty" gap).

**Fix (`useTabState.js`)**
- `initialPrompt` is now stripped from tabs before persisting to
  localStorage — otherwise, on reload, the tab would auto-fire the prompt
  again and create duplicate messages.

**Verified** — t=1 s: user bubble present · t=6 s: real plan card + first
result · t=10 s: interpretation + 164 compounds table · No flicker.

**Files touched**
- `frontend/src/components/workspace/ProjectTab.jsx`
- `frontend/src/hooks/useTabState.js`

## 2026-02-06 (very late) — Unified /app Header ✅

Bug/UX: `/app` was showing two stacked headers — the outer white `SiteHeader`
with brand + top nav + right-side controls, then a separate dark tabbar
below it. Users wanted ONE combined header.

**Fix**
- `SiteChrome` (`App.js`) now also hides `SiteHeader` + `SiteFooter` on any
  `/app*` path (same treatment as `/admin`).
- `AppWorkspace` root switched from `fixed inset-0 top-16` → `fixed inset-0`
  now that no outer header takes 4rem.
- `components/workspace/TabBar.jsx` rewritten as the single unified header:
  - **Left**: `BrandLogo` + "PhytoNet AI" wordmark, linked to `/`.
  - **Middle**: horizontally-scrollable tab strip (Home + N project/module
    tabs).
  - **Right**: `Search ⌘K` button, `SaveProjectMenu`, `NodeBadge`, and an
    `AvatarMenu` dropdown carrying the exact same links as SiteHeader
    (Dashboard, My Projects, Downloads, Profile, Settings, Logout).

Verified visually: one clean dark bar with brand → tabs → right controls, no
stacked-header duplication. Testids preserved (`site-header` no longer
present, `app-header` is the sole source).

**Files touched**
- `frontend/src/App.js` (SiteChrome hides on `/app*`)
- `frontend/src/pages/AppWorkspace.jsx` (removed top-16 offset)
- `frontend/src/components/workspace/TabBar.jsx` (unified header with all
  right-side controls)

**Next Action Items**
- Wire ⌘K Search to actually search projects/modules.
- Consider a subtle drop-shadow under the header when scrolling long tabs.

## 2026-02-06 (deep night) — Fix: Flicker During Long Runs ✅

Bug: even after the previous "blank chat" fix, the workspace still visibly
flickered / redrew every ~1 s while a run was in progress. The user pointed
this out with the note "flickering issue persisted".

**Root cause** — three cumulative issues:
1. `startPolling` unconditionally called `setProject(...)` every second even
   when the run's status/plan/results were byte-for-byte identical between
   polls. Every setState blew away referential equality for `project.runs`,
   forcing all downstream memos, `ChatMessage` children, and `ResultCard`s to
   re-render.
2. `NetworkCard`'s useEffect (`[network]`) tore down and rebuilt the
   Cytoscape instance on every render because `network` was a fresh object
   reference each poll — visible as a brief empty flash of the graph.
3. `ResultCard` re-rendered its full JSX tree (including 100-plus-row
   tables) on every parent re-render.

**Fix**
- `startPolling` (`ProjectTab.jsx`) now stringifies a compact signature of
  `{status, plan[id/status/detail], results[id/status]}` and only calls
  `setProject` when the signature actually changes. Confirmed: a 20 s run
  now triggers ~2-3 real state updates instead of ~20.
- `NetworkCard` (`cards.jsx`) wrapped in `React.memo` with a custom compare
  that treats two networks as equal when nodes/edges IDs match — no more
  cytoscape destroy/recreate churn.
- `ResultCard` wrapped in `React.memo` with a signature over `card`,
  `message`, main row count, and edge count. Idempotent completed results
  now bail out of re-render entirely.

**Verified** — 32 s smoke test: 13 poll requests, only ~3 state updates,
NetworkCard/tables stable, no visible flicker. Final DOM identical to
non-polling baseline.

**Files touched**
- `frontend/src/components/workspace/ProjectTab.jsx` (polling signature)
- `frontend/src/components/research/cards.jsx` (memoised NetworkCard +
  ResultCard, added `memo` import)

## 2026-02-06 (late) — Streaming Interpretation ✅

Feature: the assistant's scientific interpretation now streams token-by-token
into the right-pane "Writing Interpretation…" card while a run is finishing —
the chat feels alive instead of showing a blank spinner during the ~5-10 s
Claude call.

**Backend**
- `research_service.interpret_stream()` — new async generator that uses
  `LlmChat.stream_message()` and yields `TextDelta.content` chunks.
- `routes/research._execute_in_background()` now consumes that stream and
  writes the growing text to `runs.$.interpretation` every ~40 characters,
  flipping `runs.$.interp_streaming` between `True` (during) and `False`
  (final). The status endpoint already returned `interpretation`; it now
  also exposes `interp_streaming` via `_serialize_run`.

**Frontend**
- `ProjectTab.startPolling` — polling loop tightened to 700 ms (was 1000 ms)
  and its signature now also tracks interpretation length + streaming flag,
  so growing text is surfaced without spurious re-renders on unchanged
  polls. Flicker fix from earlier iteration still applies.
- New right-pane card renders the interpretation with a **LIVE** pill and a
  blinking caret (`animate-caret` keyframe added to `index.css`) while
  `interp_streaming` is true. Card flips to a static "Latest Interpretation"
  the moment streaming ends.

**Verified end-to-end** — On a Quercetin target-prediction run:
- t≈+4 s: interpretation length grew from 0 → 122 chars, badge became
  visible.
- t≈+9 s: 967 chars, still streaming.
- t≈+11 s: run flipped to `completed`, badge disappeared, final
  interpretation message appended to left-pane chat.
Playwright snapshot confirmed the LIVE pill + text growth + caret animation.

**Files touched**
- `backend/research_service.py`  (added `interpret_stream`)
- `backend/routes/research.py`   (executor uses stream + flushes;
                                  `_serialize_run` exposes `interp_streaming`)
- `frontend/src/components/workspace/ProjectTab.jsx` (700 ms poll, sig
                                  extended, streaming card w/ caret)
- `frontend/src/index.css`       (`@keyframes caret-blink`)

**Next Action Items**
- Plan streaming (harder — planner output is strict JSON, would need
  natural-language rationale prefix).
- Server-Sent-Events channel to eliminate polling entirely (nice-to-have).

## 2026-02-06 (deepest night) — Flicker: Real Root Causes ✅

The prior polling-signature + memo fixes reduced re-renders but did NOT
eliminate the flicker. User reported it still occurred (a) after a compound
prompt executes in a new project and (b) while scrolling in old projects.

Three real culprits identified via a MutationObserver instrumented on the
whole `/app` workspace:

1. **Scroll → React re-render cascade**. `onScroll` fired
   `setScrollPos` on the parent `useTabState` on every wheel tick. That
   invalidated `state` → `AppWorkspace` re-rendered → every ProjectTab
   received new prop refs → Cytoscape canvas repainted. During even a
   short scroll, dozens of full-tree renders fired.
   FIX — Scroll persistence rewired to a component-local ref +
   direct `localStorage` write (debounced 500 ms). Zero React state is
   touched during scroll, so zero re-renders.

2. **Scrollbar-width jitter during interpretation streaming**. As
   interpretation text grew past the viewport, the automatic overflow
   scrollbar appeared, shifting the pane's effective width by ~15 px.
   Cytoscape's ResizeObserver picked it up and re-fit the graph — every
   time. Same on the left pane when messages grew.
   FIX — Both panes now use `overflow-y-scroll` + `scrollbar-gutter:
   stable` so a scrollbar column is always reserved.

3. **Cytoscape ambient repaints**. Added `textureOnViewport: true`,
   `motionBlur: false`, `pixelRatio: 1`, `autoungrabify: true`,
   `hideEdgesOnViewport: false` to freeze the graph unless the underlying
   node/edge set actually changes.

Verified with the same MutationObserver harness:
- 3 s of continuous scrolling: **0 DOM mutations** (was ~100+).
- 5 s of idle on a project with a network: **0 DOM mutations** (was 59).

**Files touched**
- `frontend/src/pages/AppWorkspace.jsx`   (dropped `savedScroll`/
  `onScrollChange` props to ProjectTab)
- `frontend/src/components/workspace/ProjectTab.jsx` (scroll persistence
  via ref + localStorage; `scrollbar-gutter: stable` on both panes)
- `frontend/src/components/research/cards.jsx` (cytoscape init options
  tightened; NetworkCard still memoised from prior iteration)


## 2026-02-06 (iter 45) — CTP Network Interactivity ✅

Completed the paused work from iter-44. `CTPNetworkCard` in
`/app/frontend/src/components/research/cards.jsx` now supports:

- **Live Top-N sliders** (`ctp-slider-kegg`, `ctp-slider-go`) — client-side
  re-filter using `data.raw.{kegg,go,targets}` payload already shipped by
  `tool_ctp_network`. Reset button snaps to 20/20 (or the available cap).
- **First-degree neighborhood isolation** — tap any node in the Cytoscape
  canvas (or a `ctp-hub-*` pill button) to dim non-neighbors and highlight
  the focus + immediate neighbours. Banner (`ctp-isolation-banner`) shows
  the isolated node id with a Clear button. Tapping empty canvas also
  clears. Uses `cy.batch()` + class swaps so Cytoscape never re-mounts.
- Top hubs strip now recomputes live from client-side graph (falls back to
  server metrics for legacy runs without `data.raw`).

Verified 100% by testing agent (`iteration_45.json`): fresh CTP run at
5/5 sliders → 41 nodes, at 20/20 → 56 nodes, at max/max → 140 nodes/520
edges/122 pathways. Downloads (CSV/JSON/GraphML/PNG) still work. No console
errors during slider drags or isolation toggling.

**Deferred bug (pre-existing, flagged by testing agent for follow-up):**
- `tool_ctp_network` reports `n_compounds=0, n_targets=0` in its metrics
  even when 18 target_predict rows exist upstream. Compound/target
  extraction heuristic likely misses a field name on the current
  target_predict output shape. Client-side re-derivation agrees with the
  server, so the fix belongs in `tool_ctp_network` (not the card).


## 2026-02-06 (iter 46) — Docking inside AI Research Assistant ✅

Added a new `docking` tool to the Research Assistant orchestrator so the
platform can automatically run AutoDock Vina docking of the top compounds
× top target genes right inside the workspace results pane.

**Backend — `/app/backend/research_service.py`**
- New `tool_docking(top_compounds=5, top_genes=3, exhaustiveness=8,
  num_modes=9, box_padding=8.0)`:
  - Ranks compounds by QED / drug-likeness from a prior `admet_predict`
    step (falls back to any earlier compound source via `_auto_pick_compounds`).
  - Ranks target genes from `target_predict` by evidence count + best
    score, further biased by CTP hub-degree if a `ctp_network` step has
    already run. Each gene carries its UniProt ID so
    `docking_service.run_docking_batch` can auto-fetch a PDB structure.
  - Calls the existing `docking_service.run_docking_batch(...)` — same
    AutoDock Vina pipeline that powers `/molecular-docking`.
  - Returns `card: "docking"` with `job_id`, `metrics`, `results`
    (ranked), `receptors`.
- Registered in `TOOL_REGISTRY`.
- **Auto-append policy** (in `plan()`): when the LLM plan contains BOTH
  `target_predict` AND `admet_predict` but no `docking`, a docking step
  is appended after CTP.
- `execute_step` wires `prior_results` + `project_context` into the tool
  (mirrors the `ctp_network` pattern).

**Frontend — `/app/frontend/src/components/research/cards.jsx`**
- New `DockingCard` component (routed via `card === "docking"`):
  - 5 summary pills: Pairs / Succeeded / Failed / Strong (≤−7 kcal/mol) /
    Best affinity.
  - "Best binder" banner (compound × gene at N kcal/mol).
  - Ranked results table sorted by `best_affinity` ascending, with columns
    Compound · Gene · PDB · Affinity · Strength badge · Modes · 3D View.
  - Per-row `View 3D` button expands the existing `DockingViewer`
    (3Dmol.js complex + 2D interactions + downloads) inline in the table.
  - CSV export.
  - Error rows render at reduced opacity with a "Failed" badge — no crash
    on partial batches.

**Testing** — `iteration_46.json`: backend pytest 2/2 pass
(`test_iter46_docking_autoappend.py` confirms plan auto-append works).
Frontend static contract verified. Live end-to-end docking run was
deferred (10+ min AutoDock Vina batch cost). Two seeded projects
`TEST_iter46_docking_autoappend` are ready for a manual run.

**Note on node consumption:** Per user brief, docking runs inside the
Research Assistant are charged at the chat / project level (complexity-
based), not per-tool — no separate node debit was added.

**Next Action Items**
- Optional live-render manual verification: open a seeded
  `TEST_iter46_docking_autoappend` project → Run plan → verify
  `docking-card` renders and `docking-view3d-0` opens the inline 3D viewer.
- Fix pre-existing metric bug in `tool_ctp_network`
  (`n_compounds=0/n_targets=0`) surfaced in iter-45 report.
- P1: AI Report enrichment — bake real ADMET / docking / CTP metrics into
  the AI Scientific Report.
- P1: Wire ⌘K command palette to search open tabs & past projects.


## 2026-02-06 (iter 47) — Docking Live Verify + CTP Metric Fix ✅

**Docking end-to-end verified in the AI Research Assistant.**
Reset the seeded `TEST_iter46_docking_autoappend` run with
`top_compounds=1, top_genes=1, exhaustiveness=4`, executed it via
`POST /api/research/projects/{pid}/execute/{run_id}`, and eyeballed the
resulting `DockingCard` + inline `DockingViewer`:

- 4-step chain (compound_lookup → admet_predict → target_predict →
  docking) completed cleanly (~2 min end-to-end).
- Best binder: **Curcumin × ALOX5 (PDB 7TTK) at −7.86 kcal/mol** —
  correctly labelled "Strong" (≤ −7 threshold).
- DockingCard renders every element from the spec: 5 summary pills,
  best-binder banner, ranked results table, CSV export.
- `View 3D` button expands the existing `DockingViewer` inline: full 3Dmol.js
  cartoon complex with H-bond distance labels, LigPlot-style 2D
  interaction diagram, 16-interaction table (5 H-bonds + hydrophobic
  + π-stacking), and all download formats (Complex PDB / Pose PDBQT-PDB /
  All poses / Interactions CSV-JSON / PNG-TIFF-PDF snapshots).

**Fixed two docking data bugs surfaced during live verify:**
1. **Empty `gene_symbol` on result rows** — my tool_docking was keying the
   `uid_to_gene` lookup off `r.get("uniprot_id")` but `DockResult` carries
   the field as `receptor_uniprot`. Fixed to prefer `receptor_uniprot`.
2. **Ligand rendered as SMILES prefix** ("COC1=C(C=CC(=C1)C=CC" instead of
   "Curcumin") — ADMET rows lose the friendly name (compound_name empty).
   Added a `smiles_to_name` index built from any prior `compound_lookup`
   step; docking now labels ligands as their PubChem name whenever
   available and title-cases lowercase inputs ("curcumin" → "Curcumin").

**Fixed pre-existing CTP metric bug** (`n_compounds=0/n_targets=0` on
healthy runs — flagged in iter-45 report). `tool_ctp_network` was
bailing out with `if not c or not gene: continue` whenever a target
row was missing a display `compound_name`. Now falls back to
`canonical_smiles[:20]` (or a stable "Compound" placeholder) so a valid
gene never gets dropped from the graph.

**Files touched**
- `/app/backend/research_service.py`
  - `tool_docking`: added `smiles_to_name` backfill from compound_lookup,
    fixed UniProt key mismatch on result rows, wired through `receptor_uniprot`
    everywhere in the metrics summary.
  - `tool_ctp_network`: relaxed compound-side extraction so targets aren't
    lost when the display name is missing.

**Next Action Items**
- P1: AI Report enrichment — bake real ADMET / docking / CTP-network
  metrics into the AI Scientific Report so it feels publication-ready.
- P1: Wire ⌘K command palette to search open tabs and past projects.
- P2: Refactor `cards.jsx` (now 1600+ lines) — split DockingCard,
  CTPNetworkCard, EnrichmentCard, IntersectionVennCard into their own
  files under `/app/frontend/src/components/research/cards/`.
