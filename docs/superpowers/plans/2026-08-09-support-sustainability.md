# Tavernary Support and Sustainability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a responsive Ko-fi support flow, a transparent Support Tavernary page, an About-page sustainability summary, and safely aggregated monthly OpenAI usage.

**Architecture:** The static site reads a validated repository-owned usage snapshot. A Node script and monthly GitHub Action are the privileged boundary that query OpenAI with an Admin key and emit only Tavernary-project aggregates; React pages never receive credentials. The header links to the transparent Support page, which uses Ko-fi's compact official button widget plus a direct fallback action while shared editorial CSS keeps Support visually aligned with About.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Node.js 24, GitHub Actions, Vitest/Testing Library, Playwright

## Global Constraints

- The monthly operating target is exactly `$12`.
- Donations above current-month operating costs roll forward to future Tavernary operating costs.
- Public usage distinguishes `estimate` from `measured` and never publishes prompts, outputs, credentials, donor identities, or OpenAI identifiers.
- OpenAI usage queries require both `OPENAI_ADMIN_KEY` and `OPENAI_PROJECT_ID` and cover one completed UTC month.
- The initial estimate is 40,500,000 input tokens, 4,500,000 output tokens, 4,000 requests, and $13.50 at the July 30, 2026 GPT-5.6 Luna Standard rates.
- Public copy identifies `$12` as a deliberately simple community-funding goal, says Tavernary's owner intends to cover costs above it for now, distinguishes it from the `$13.50` uncached model-cost estimate, and notes that measured cost varies with caching and usage.
- Header order is `About`, `Help`, `Submit Project`, then Ko-fi; mobile is icon-only at `<=760px`.
- The header support link navigates to `/support/`, matches Submit Project's height, and uses Tavernary's shared desktop tooltip.
- The official button uses `Widget_2.js`, page code `I1F724I7NT`, Tavernary orange `#E18A24`, and a sandboxed `srcDoc` iframe; the direct fallback URL remains exactly as recorded in the design spec.
- Add no runtime dependency.
- GitHub Pages receives no Ko-fi webhook or donor data. Tavernary renders no
  full contribution panel, recent supporter feed, or native progress bar.

---

### Task 1: Monthly Usage Snapshot Contract and Updater

**Files:**
- Create: `data/support/monthly-usage.json`
- Create: `scripts/support/openai-usage.mjs`
- Create: `scripts/support/refresh-openai-usage.mjs`
- Create: `tests/unit/openai-usage.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `aggregateOpenAiUsage({ usagePages, costPages, period, generatedAt })` and `refreshOpenAiUsage({ fetch, env, now, outputPath })`.
- Snapshot records expose `kind`, `periodStart`, `periodEnd`, `generatedAt`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `requests`, `costUsd`, and `currency`.

- [x] Write tests using literal paginated usage/cost responses. Prove aggregation across buckets/pages, USD cost summation, stable newest-first history, required project scope, prior-complete-month boundaries, and rejection of malformed/cross-project data.
- [x] Run `npm.cmd exec vitest run tests/unit/openai-usage.test.ts` and verify failure because the module does not exist.
- [x] Implement pure response validation/aggregation, cursor pagination, fetch calls with `project_ids=$OPENAI_PROJECT_ID`, atomic JSON output, and a CLI entry point.
- [x] Seed the snapshot with the approved estimate and add `support:refresh-usage` to `package.json`.
- [x] Re-run the focused test and verify it passes.

### Task 2: Support Page and About Sustainability Copy

**Files:**
- Create: `src/app/support/page.tsx`
- Create: `src/features/support/support-data.ts`
- Create: `src/styles/support.css`
- Create: `tests/unit/support-page.test.tsx`
- Modify: `src/app/about/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `tests/unit/about-page.test.tsx`
- Modify: `tests/e2e/static-export.spec.ts`

**Interfaces:**
- `getLatestSupportUsage()` validates and formats the checked-in snapshot for server rendering.
- `/support/` renders the compact $12 target, rollover policy, cost-driver ranking, usage snapshot, Luna rationale, official Ko-fi button widget, and direct fallback action.

- [x] Write failing component tests for the Support page's exact operating target, rollover meaning, ranked costs, estimate label and metrics, Luna/alternative-model explanation, official Ko-fi widget, direct fallback URL, and absence of removed report/feed/full-panel sections. Extend the About test for its sustainability heading and `/support/` link.
- [x] Run the two component test files and verify the missing page/section failures.
- [x] Implement the validated data adapter and Support page using About's editorial structure plus compact metric cards.
- [x] Add the concise About section and import `support.css` globally.
- [x] Extend static-export coverage for `/support/`, then run focused unit tests and build/export coverage until green.

### Task 3: Accessible Ko-fi Header Link

**Files:**
- Create: `src/features/catalog/components/kofi-support.tsx`
- Create: `tests/unit/kofi-support.test.tsx`
- Modify: `src/features/catalog/components/site-header.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`
- Modify: `tests/e2e/contribution-links.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`

**Interfaces:**
- Produces `KoFiSupport(): React.JSX.Element` as a `/support/` link wrapped in the shared `Tooltip` component.

- [x] Write the failing component test for `/support/` navigation, accessible naming, decorative icon, and shared tooltip semantics.
- [x] Run it and verify failure while the component still renders a modal button.
- [x] Replace the modal component with a normal link and desktop tooltip; remove modal-only dependencies and styles.
- [x] Integrate it immediately after Submit Project and make its Tavernary-orange desktop/mobile geometry match Submit Project's height.
- [x] Extend browser tests for header order, desktop tooltip and navigation, mobile square geometry, and 320px overflow.
- [x] Run focused unit and Playwright tests until green.

### Task 4: Monthly OpenAI Publication Workflow

**Files:**
- Create: `.github/workflows/publish-openai-usage.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Scheduled at a fixed UTC time on day 2 and manually dispatchable; each run publishes the prior completed UTC month.
- Reads `OPENAI_ADMIN_KEY` and `OPENAI_PROJECT_ID` secrets, invokes `npm run support:refresh-usage`, validates, and publishes only `data/support/monthly-usage.json`.

- [x] Write a failing workflow test for the category-prefixed name/run name, minimal permissions, pinned checkout/setup actions, secret mapping, monthly schedule, scoped git add, full validation, and absence of secret values in command arguments/output.
- [x] Run the workflow test and verify failure because the workflow is absent.
- [x] Implement checkout, Node 24 setup, install, scoped refresh, repository check, retrying rebase/push, and exact deployment dispatch consistent with existing maintenance workflows.
- [x] Re-run workflow and updater tests until green.

### Task 5: Verification, Review, and Publication

**Files:** all changed files.

- [ ] Run Prettier on changed source files, then `npm.cmd run check`.
- [ ] Run focused Playwright coverage for contribution links, mobile, and static export.
- [ ] Start the production export and visually inspect `/support/` plus the header support link at desktop and 390px mobile widths.
- [ ] Run `git diff --check`, inspect `git status --short`, and compare the patch with every design requirement.
- [ ] Commit the implementation, push `codex/kofi-support-modal`, create a ready PR, wait for all GitHub checks, address failures, merge, and verify the exact merge commit on `origin/main`.
- [ ] Report the one-time setup still required: add repository secrets `OPENAI_ADMIN_KEY` and `OPENAI_PROJECT_ID`.
