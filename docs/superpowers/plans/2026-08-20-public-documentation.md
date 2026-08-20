# Tavernary public documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Tavernary's public documentation in plain language with a screenshot-led README, visitor task guides, contributor guidance, and an explicit “Bounding the Problem” product story.

**Architecture:** Keep the public layer in the root README, `docs/README.md`, visitor guides, and contributor guides. Store deterministic browser captures in `docs/assets/screenshots/`; keep architecture, maintenance, reference, legal, and security docs technical. Use the README as the visual overview and task guides as the detailed source of truth.

**Tech Stack:** Markdown, PNG screenshots from Playwright/local browser states, existing Next.js static export, PowerShell/rg audits, and the repository npm verification scripts.

**Spec:** `docs/superpowers/specs/2026-08-20-public-documentation-design.md`

## Global Constraints

- Write for visitors, players, project authors, Kit authors, and contributors who may not know GitHub or repository vocabulary.
- Keep **Bounding the Problem** in `README.md`; write it from the supplied raw text without copying the conversation or adding the screenshot.
- Tavernary is a discovery index, not a file host, code host, marketplace, publishing platform, blog, forum, or social network.
- TavernKeeper results are evidence and safety awareness for a source revision, not an endorsement, certification, or simple safety truth label.
- Explain popularity and Sustained Activity in nearby plain language or tooltips.
- Do not claim that Tavernary installs, hosts, supports, or owns listed projects.
- Preserve the technical architecture, maintenance, reference, legal, security, and historical docs.
- Leave unrelated `src/generated/catalog.json` untouched.

---

### Task 1: Build the visual README and public documentation index

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Create: `docs/assets/screenshots/` image files as captured in Task 2

**Interfaces:**
- Consumes: the product boundaries and screenshot map in the spec.
- Produces: the visual entry point and task-oriented index used by every later public guide.

- [ ] **Step 1: Rewrite `README.md` as a short visual welcome page.**

  Put the plain one-sentence explanation and current project status first. Add the wide catalog image, a short three-part “what you can do” tour, the first five-minute path, and links to the public guides. Keep repository/developer commands in a compact contributor section instead of leading with implementation details.

- [ ] **Step 2: Add the original `Bounding the Problem` section.**

  Place it near the product explanation. Explain the focused vision, the discovery/evaluation boundary, Companion’s connected role, the reason risk signals must stay meaningful, and the rule that new features must serve the product direction. Do not reproduce the source conversation as a transcript.

- [ ] **Step 3: Rewrite `docs/README.md` as “What do you want to do?”**

  Link to starting, browsing, Kits, Help, submitting, contributing, troubleshooting, and the words-to-know page. Separate public guides from technical maintainer docs with clear labels.

- [ ] **Step 4: Audit entry-point links.**

  Use PowerShell to extract local Markdown targets and report missing files. Fix any stale path, including the existing broken TavernKeeper integration link.

### Task 2: Capture and verify documentation screenshots

**Files:**
- Create: `docs/assets/screenshots/catalog-wide.png`
- Create: `docs/assets/screenshots/catalog-phone.png`
- Create: `docs/assets/screenshots/search-and-filters.png`
- Create: `docs/assets/screenshots/project-card.png`
- Create: `docs/assets/screenshots/kits-wide.png`
- Create: `docs/assets/screenshots/kit-builder.png`
- Create: `docs/assets/screenshots/help-hub.png`
- Create: `docs/assets/screenshots/project-review.png`

**Interfaces:**
- Consumes: existing deterministic catalog, Kit, Help, and submission browser fixtures.
- Produces: safe repository-local PNGs referenced by the README and public guides.

- [ ] **Step 1: Identify deterministic routes and fixtures.**

  Use the current Playwright helpers and fixture data in `tests/e2e/` and `tests/visual/`; do not capture private accounts, provider credentials, or uncontrolled live GitHub content.

- [ ] **Step 2: Capture wide and phone catalog states.**

  Wait for `.catalog-shell[data-hydrated="true"]`, stabilize time-dependent labels where the existing visual tests do so, and capture only the catalog surface needed for documentation.

- [ ] **Step 3: Capture search/filter, Kit, Help, and project-review states.**

  Use the existing accessible role selectors and wait for the relevant surface before capture. Keep each image focused on the action being taught.

- [ ] **Step 4: Inspect every image.**

  Verify the images are legible at their intended README/doc width, contain no secrets or private text, and show the current UI rather than stale baselines.

### Task 3: Rewrite visitor guides

**Files:**
- Modify: `docs/guides/what-is-tavernary.md`
- Modify: `docs/guides/using-the-catalog.md`
- Create: `docs/guides/getting-started.md`
- Create: `docs/guides/kits.md`
- Create: `docs/guides/getting-help.md`
- Create: `docs/guides/words-to-know.md`

**Interfaces:**
- Consumes: the README vocabulary and screenshots from Tasks 1–2.
- Produces: complete visitor guidance for discovery, evaluation, Kits, Help, and common terms.

- [ ] **Step 1: Write `getting-started.md` around the first five minutes.**

  Explain opening the site, searching, reading a card, following the source link, understanding activity and scan context, and knowing what Tavernary does not do.

- [ ] **Step 2: Rewrite `what-is-tavernary.md`.**

  Use a simple “Tavernary is / Tavernary is not” structure. Explain the creator/source boundary and TavernKeeper without promising safety.

- [ ] **Step 3: Rewrite `using-the-catalog.md`.**

  Cover search, `+` queries, filters, sorting, card anatomy, popularity, Sustained Activity, incomplete metadata, scan notes, licenses, and the source link. Add focused screenshots and explain controls that need clarification.

- [ ] **Step 4: Write `kits.md`.**

  Explain what a Kit is, how to browse and inspect one, how community support works, and how a player can create or share one through the site. Keep “saved collection” separate from “installed software.”

- [ ] **Step 5: Write `getting-help.md`.**

  Explain the Help hub routes, public versus private reports, third-party project support boundaries, and the smallest useful next action for each problem.

- [ ] **Step 6: Write `words-to-know.md`.**

  Define catalog, project, frontend, extension, preset, Kit, source, popularity, Sustained Activity, TavernKeeper, scan evidence, pending enrichment, and published/provisional in one or two short sentences each.

### Task 4: Rewrite contributor guides in plain language

**Files:**
- Modify: `docs/contributing/contribution-overview.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/contributing/kits.md`
- Modify: `docs/contributing/development-setup.md`

**Interfaces:**
- Consumes: public terminology from Tasks 1 and 3.
- Produces: contributor instructions that are readable without removing required technical boundaries.

- [ ] **Step 1: Rewrite the contribution overview as a route chooser.**

  Start with project submission, Kit creation, listing corrections, website reports, documentation, and code contributions. Explain which Help or site path to choose.

- [ ] **Step 2: Rewrite submission and review as a story.**

  Explain what Tavernary prepares, what GitHub does, what automation checks, what a contributor can change, and what happens when a request needs information or is declined.

- [ ] **Step 3: Rewrite Kit contribution guidance.**

  Explain create, edit, report, and withdrawal paths in direct language. Keep exact limits and ownership/authority rules visible.

- [ ] **Step 4: Rewrite development setup without hiding commands.**

  Add a short “before you start” explanation, then keep Node, install, test, browser, and Kit fixture commands exact. Link back to the public guides for product vocabulary.

### Task 5: Verify the public documentation set

**Files:**
- Inspect: `README.md`, `docs/README.md`, `docs/guides/*.md`, `docs/contributing/*.md`
- Inspect: `docs/assets/screenshots/*.png`
- Test: existing content/help tests and repository checks

**Interfaces:**
- Consumes: all public docs and assets from Tasks 1–4.
- Produces: an evidence-backed, scoped documentation change.

- [ ] **Step 1: Check Markdown links.**

  Resolve every relative link from its source file and report missing targets. Skip external URLs, anchors, and root site routes that are intentionally runtime paths.

- [ ] **Step 2: Check screenshot paths and file sizes.**

  Extract every `docs/assets/screenshots/*.png` reference, confirm the file exists, and reject empty files.

- [ ] **Step 3: Scan for stale public claims.**

  Review matches for `safe`, `approved`, `guaranteed`, `install`, `host`, `marketplace`, `TavernKeeper`, `popularity`, and `Sustained Activity`. Rewrite any sentence that overstates authority or turns scan color into a safety verdict.

- [ ] **Step 4: Run focused checks.**

  Run `git diff --check`, `npm.cmd run format:check`, relevant content/help tests, and the documentation screenshot/browser checks.

- [ ] **Step 5: Run the full repository gate.**

  Run `npm.cmd test` and, if the screenshot capture changes tracked runtime inputs, run `npm.cmd run check:content` or `npm.cmd run check` as appropriate. Report local tests separately from hosted deployment proof.

- [ ] **Step 6: Inspect the final scoped diff.**

  Confirm the change contains the public docs, new screenshots, and approved spec/plan only. Confirm `src/generated/catalog.json` remains the user-owned untracked file and is not staged.
