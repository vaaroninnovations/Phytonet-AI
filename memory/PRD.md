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

