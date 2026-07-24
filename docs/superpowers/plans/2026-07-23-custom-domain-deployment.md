# Custom-domain deployment implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Tavernary at the custom-domain root without broken asset URLs.

**Architecture:** The Pages workflow explicitly selects a root deployment by
setting `TAVERNARY_BASE_PATH` to an empty string. Static-export verification
enforces that root deployments contain only root-relative Next.js assets.

**Tech Stack:** Next.js static export, GitHub Actions, Vitest, Playwright

## Global constraints

- Preserve explicit non-root `TAVERNARY_BASE_PATH` support.
- Do not alter catalog behavior or visual design.
- Verify the deployed custom domain, not only the local export.

---

### Task 1: Enforce the root-asset export contract

**Files:**
- Modify: `tests/unit/static-export-verification.test.ts`
- Modify: `scripts/verify-static-export.mjs`

**Interfaces:**
- Consumes: `verifyStaticExport(html: string, basePath?: string): void`
- Produces: rejection of repository-prefixed Next.js assets for root builds

- [ ] Add a test expecting `verifyStaticExport()` to reject
  `/Tavernary/_next/` when `basePath` is empty.
- [ ] Run `npm.cmd test -- tests/unit/static-export-verification.test.ts` and
  confirm the new assertion fails with “function did not throw.”
- [ ] Replace the root-mode early return with asset extraction that requires
  at least one `/_next/` URL and rejects any URL not beginning with
  `/_next/`.
- [ ] Rerun the focused test and confirm all cases pass.

### Task 2: Force the Pages build to use the custom-domain root

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `TAVERNARY_BASE_PATH` in `next.config.ts`
- Produces: a Pages build with `basePath === ""`

- [ ] Add a test reading `.github/workflows/deploy-pages.yml` and asserting
  that the `build` job defines `TAVERNARY_BASE_PATH: ""`.
- [ ] Run `npm.cmd test -- tests/unit/workflows.test.ts` and
  confirm it fails because the environment entry is missing.
- [ ] Add the empty-string environment entry to the Pages `build` job.
- [ ] Rerun the focused test and confirm it passes.

### Task 3: Verify and deploy

**Files:**
- Verify: generated `out/index.html`

**Interfaces:**
- Consumes: root-mode workflow and verifier
- Produces: styled `tavernary.org` production deployment

- [ ] Run `npm.cmd run check`, `npm.cmd run test:e2e`, and
  `npm.cmd run test:visual`.
- [ ] Confirm `out/index.html` references `/_next/` and contains no
  `/Tavernary/_next/`.
- [ ] Commit the implementation and push it fast-forward to `main`.
- [ ] Monitor the Pages workflow to a successful conclusion.
- [ ] Confirm the live HTML, CSS, and JavaScript return 200 and visually
  inspect the rendered desktop site.
- [ ] Recheck HTTPS certificate status and report it separately.
