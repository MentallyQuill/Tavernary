# Staff Manage Non-GitHub Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let trusted Tavernary staff submit the existing project-owner maintenance workflow for active listings from Reddit and other sources, while preserving GitHub owner verification for ordinary owners.

**Architecture:** Make source identity in the owner manifest represent both GitHub and non-GitHub registry sources. The static form will prepare card-maintenance requests for any active source, while GitHub automation remains the authority: trusted staff are admitted first; non-staff authors must still pass the existing personal GitHub owner check. Source additions, delisting, and repository moves remain GitHub-only because they depend on source-wide or immutable GitHub identity.

**Tech Stack:** Next.js/React, TypeScript, ESM JavaScript workflow helpers, Vitest, Playwright.

## Global Constraints

- Do not add Tavernary accounts, OAuth, or frontend identity inference.
- Do not weaken ordinary GitHub owner verification.
- Trusted staff authority remains immutable GitHub user ID plus trusted association.
- Use red-green-refactor for every behavior change.
- Preserve the existing manifest handoff and exact-path publication workflow.

---

### Task 1: Generalize manifest source identity

**Files:**
- Modify: `src/features/help/project-owner-manifest.mjs`
- Test: `tests/unit/project-owner-manifest.test.ts`

- [ ] Add a failing test proving a staff-shaped manifest with `repository_id: null` is valid when the source context is a non-GitHub registry source.
- [ ] Run the focused manifest test and verify the failure is the current positive-integer/GitHub-only validation.
- [ ] Update source-context validation to require a positive immutable repository ID only for GitHub sources, and require `repository_id: null` for other sources.
- [ ] Run the focused test and the existing manifest suite.

### Task 2: Allow active non-GitHub cards in the builder

**Files:**
- Modify: `src/lib/help/load-owner-project-options.ts`, `src/features/help/components/project-owner-builder.tsx`
- Test: `tests/unit/load-owner-project-options.test.ts`, `tests/unit/project-owner-builder.test.tsx`, `tests/e2e/help-project-owner.spec.ts`

- [ ] Add a failing unit/UI test showing an active Reddit listing exposes card maintenance operations and creates a manifest with `repository_id: null`.
- [ ] Run the focused tests and verify they fail because `eligibleShape` currently removes all operations and `candidateManifest` requires a repository.
- [ ] Keep `eligibleShape` as the GitHub-owner eligibility signal, but let active sources expose edit/retire/restore; keep add-cards, delist-source, and repository moves GitHub-only.
- [ ] Build manifests from the selected source identity without fabricating a GitHub repository ID.
- [ ] Add explanatory copy distinguishing GitHub owner verification from staff review.
- [ ] Run focused unit and Playwright tests.

### Task 3: Permit trusted staff application for non-GitHub sources

**Files:**
- Modify: `scripts/help/triage-project-owner-request.mjs`, `scripts/help/apply-project-owner-request.mjs`, `scripts/help/generate-project-owner-request.mjs`
- Test: `tests/unit/triage-project-owner-request.test.ts`, `tests/unit/apply-project-owner-request.test.ts`, `tests/unit/generate-project-owner-request.test.ts`

- [ ] Add a failing triage test for a trusted staff issue author on a non-GitHub source.
- [ ] Run the focused triage test and verify it fails at manifest/source identity normalization.
- [ ] Admit trusted staff before attempting repository-owner verification, while leaving non-staff non-GitHub requests rejected.
- [ ] Generalize current-source matching for non-GitHub sources and keep move-source explicitly GitHub-only.
- [ ] Ensure generation does not load or write a GitHub snapshot for non-GitHub card/source maintenance.
- [ ] Run focused workflow helper tests.

### Task 4: Full verification and documentation alignment

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`, `docs/contributing/submission-and-review.md`
- Test: relevant existing unit/e2e suites

- [ ] Add a regression assertion that the GitHub issue form tells staff and owners which GitHub identity is required.
- [ ] Run `npm.cmd test -- --runInBand` or the repository’s supported full test command, plus the project-owner Playwright suite and `git diff --check`.
- [ ] Review the final diff for preserved owner rejection, staff authorization, and no fabricated GitHub identity.
