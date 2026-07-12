/**
 * Playwright regression suite for the Compound-Selection workflow
 * (Plant Database → Drug-Likeness Screening).
 *
 * NOTE: Kept as human-readable spec — used as a reference for the next
 * testing agent. To run under `npx playwright test`, wrap steps with
 * `test(...)` blocks. This file was authored by the testing agent for
 * iteration_4 verification.
 *
 * Covers:
 *   - Select-all header + row checkboxes
 *   - selection-count / proceed-count sync
 *   - Sticky proceed bar visibility gating on compounds.length
 *   - Search / source-filter / sort / pagination selection persistence
 *   - Confirmation dialog (modify vs continue)
 *   - localStorage persistence across reload + direct /drug-likeness nav
 *   - Empty state
 *
 * Base URL: REACT_APP_BACKEND_URL from /app/frontend/.env
 * Reset:    localStorage.removeItem('drSlash.selection.v1')
 */
