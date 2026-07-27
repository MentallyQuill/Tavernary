# Contextual Frontend Eligibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add just-in-time Frontend eligibility guidance and make equivalent public source hosts valid for Frontend submissions.

**Architecture:** Keep disclosure state derived from the existing project-type and unlisted-Frontend controls. Generalize the existing external-source catalog path for Frontends while retaining GitHub-only validation for Extensions.

**Tech Stack:** React 19, TypeScript, Node.js ESM, Vitest, Testing Library, Playwright

## Global Constraints

- Show Frontend eligibility copy only at the two approved decision points.
- Require publicly accessible source code, but do not require an open-source license.
- Preserve GitHub-only Extension admission and existing Preset behavior.
- Do not add popularity or activity thresholds.

---

### Task 1: Contextual policy copy

**Files:**
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/app/about/page.tsx`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/e2e/contribution-links.spec.ts`

**Interfaces:**
- Consumes: `projectType` and `includeOtherFrontend` component state.
- Produces: rendered policy text at only the approved decision points.

- [ ] Add tests proving the policy is visible for `Frontend`, hidden for ordinary Extension and Preset paths, and visible after `Other or not listed`.
- [ ] Run the focused tests and confirm they fail because the disclosure copy is absent.
- [ ] Add the minimal conditional form copy and About policy section.
- [ ] Rerun the focused tests and confirm they pass.

### Task 2: Equivalent public source hosts

**Files:**
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `scripts/submissions/admission.mjs`
- Modify: `scripts/submissions/validate-submission.mjs`
- Modify: `scripts/submissions/frontend-reconciliation.mjs`
- Modify: `scripts/submissions/retry-frontend-dependencies.mjs`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/catalog/build.mjs`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/unit/project-submission-admission.test.ts`
- Test: `tests/unit/validate-submission.test.ts`
- Test: `tests/unit/frontend-reconciliation.test.ts`
- Test: `tests/unit/retry-frontend-dependencies.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`
- Test: `tests/unit/build-catalog.test.ts`

**Interfaces:**
- Consumes: generic `external` source identities already produced by `parseSourceIdentity`.
- Produces: URL-backed Frontend records and canonical URL matching for dependencies.

- [ ] Add focused tests for an accessible non-GitHub Frontend and for preserving the Extension GitHub requirement.
- [ ] Run those tests and confirm they fail at the existing GitHub-only gates.
- [ ] Permit external identities for Frontends, generate stable vocabulary IDs from their host identity, and render URL-backed Frontend records.
- [ ] Generalize Frontend dependency URL indexing and retry matching.
- [ ] Rerun focused tests, then the full repository check.
