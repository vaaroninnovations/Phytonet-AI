# Theme Audit — 2026-10-01

Comprehensive dark/light audit across every public, module, and authenticated route.

## Methodology
Used a Playwright crawler to visit each route, flip the theme via `[data-testid="theme-toggle"]`, capture screenshots at 1920×900, and probe computed styles for suspiciously-close text/background pairs. False positives were filtered out by inspecting the actual images (gradients, mix-blend-mode text clips, and intentionally-dark accent cards fire the heuristic but are correct).

## Routes audited
Public: `/`, `/pricing`, `/resources`, `/documentation`, `/referrals/leaderboard`
Modules (light-authored, flip to dark): `/plant-database`, `/compound-target-prediction`, `/disease-target-identification`, `/admet`, `/drug-likeness`, `/molecular-docking`, `/molecular-dynamics`, `/network-analysis`, `/ai-scientific-report`, `/dock`, `/phytonet-ai`
Authenticated: `/app`, `/dashboard`, `/projects`
Overlays: Auth modal (sign-in / create-account)

## Real bugs found & fixed

| # | Page / Theme | Issue | Root cause | Fix |
|---|---|---|---|---|
| 1 | `/documentation` LIGHT | Hero banner `bg-[#0F0E24]/70` + TOC `bg-[#12102E]/70` stayed dark; title "PHYTONET AI / Documentation" barely visible | My light remap only had `/85` and `/60` variants of the dark hex colors | Added `/70` opacity variants to the light remap |
| 2 | Workflow module pages DARK (plant-db, admet, docking, dynamics, network-analysis, ai-scientific-report, phytonet-ai, drug-likeness, dte, compound-target-prediction) | WorkflowSidebar stayed white with light text — unreadable | My dark remap of `.bg-white` only covered `/60, /70, /80`; sidebar uses `.bg-white/85` and `.bg-white/90` | Added `/85` + `/90` to the dark remap |
| 3 | `/dock` DARK | Protocol Validation ("Redocking + RMSD") panel header gradient `from-[#F5F5FC] to-white` stayed white | My dark remap had `bg-[#F5F5FC]` but not the `from-[#F5F5FC]` gradient-stop variant | Added gradient-stop remap for `from-[#F5F5FC]`, `from-[#F8FAFC]`, and generic `to-white` in dark mode |

## False positives (verified correct)
- Gradient text clips like "sharing PhytoNet AI" (color: transparent, bg-clip: text) — intentional
- Active workflow-sidebar step pill (purple-on-purple with white text) — nested bg not captured by probe
- CTA buttons with gradient fill (`Buy plan`, `Download PDF`, `CONTINUE TO REPORT GENERATION`) — probe reads `rgb(255,255,255)` text but misses the gradient bg
- Auth modal — dark glass card by design in both themes (consistent login branding across platforms)

## Pages verified as fully adaptive after fixes
Every public and module route now flips correctly between light and dark. Workflow sidebars, panel headers, protocol validation cards, pricing cards, workspace tabs, hero cards, and the keep-dark Automate card all respect the active theme (keep-dark cards intentionally stay purple with white text in both themes).

## Known acceptable
- Code blocks (`<pre>`) keep a dark background in both themes — common convention and preserves syntax-highlight contrast.
- Walkthrough screenshot frames in `/documentation` keep a tinted dark surround because the embedded PNGs are themselves dark previews.
- Auth modal is deliberately a dark glass card in both themes.
