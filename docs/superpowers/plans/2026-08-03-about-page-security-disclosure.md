# About-page Security Disclosure Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the About-page safety disclosure to describe TavernKeeper's advisory scans and link visitors to its published GitHub Pages documentation.

**Architecture:** Keep the change at the public About-page content boundary. Add one inline external link in `src/app/about/page.tsx`, extend the focused About-page test to assert the wording and destination, and deploy through the existing GitHub Pages workflow after the full project check passes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Prettier, ESLint, GitHub Actions Pages deployment.

## Global Constraints

- Say that eligible GitHub listings may be scanned by TavernKeeper; do not imply every listing is scanned.
- Describe scan results as advisory and explicitly state that they are not a guarantee that a project is safe or free of harmful behavior.
- Link the first visible `TavernKeeper` mention to `https://mentallyquill.github.io/TavernKeeper/`.
- Preserve the existing review-your-own-project and secrets-handling guidance.
- Keep the edit content-only; do not change scan behavior, catalog data, or security policy.
- Respect the repository Node floor of `>=24 <25` and run the full `npm.cmd run check` gate before deployment.
- Push only the reviewed `main` branch; do not open a pull request unless requested.

---

### Task 1: Update the About-page disclosure and deploy it

**Files:**
- Modify: `src/app/about/page.tsx` in the `#safety-security` section
- Modify: `tests/unit/about-page.test.tsx`
- Create: `docs/superpowers/plans/2026-08-03-about-page-security-disclosure.md`

**Interfaces:**
- Consumes: the existing About-page safety section and TavernKeeper Pages URL.
- Produces: an inline external `TavernKeeper` link and a tested advisory-scan disclosure.

- [ ] **Step 1: Add focused failing assertions**

  Extend `tests/unit/about-page.test.tsx` to assert that the rendered About page contains a link named `TavernKeeper` with the exact Pages URL and contains the advisory wording that scan results are not a guarantee of safety or freedom from harmful behavior.

- [ ] **Step 2: Run the focused test and verify it fails for the old copy**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/about-page.test.tsx
  ```

  Expected: the existing About test passes, while the new TavernKeeper link/advisory assertions fail because the old copy says Tavernary does not security-scan projects and has no TavernKeeper link.

- [ ] **Step 3: Apply the minimal copy and link change**

  Replace the outdated sentence in `src/app/about/page.tsx` with:

  ```tsx
  Tavernary is an independent directory of third-party projects. Listings
  are not endorsements, certifications, or guarantees of safety. Eligible
  GitHub listings may be scanned by{" "}
  <a href="https://mentallyquill.github.io/TavernKeeper/">TavernKeeper</a>,
  an advisory security-scanning system, but scan results are not a guarantee
  that a project is safe or free of harmful behavior. Tavernary does not host,
  install, or execute listed projects, and cannot guarantee their code,
  dependencies, releases, installers, or behavior.
  ```

  Keep the following paragraph unchanged.

- [ ] **Step 4: Run focused verification and formatting checks**

  Run:

  ```powershell
  npm.cmd test -- tests/unit/about-page.test.tsx
  npm.cmd run format:check -- src/app/about/page.tsx tests/unit/about-page.test.tsx docs/superpowers/plans/2026-08-03-about-page-security-disclosure.md
  ```

  Expected: the focused test passes and Prettier reports no formatting issues.

- [ ] **Step 5: Run the full repository check**

  Run:

  ```powershell
  npm.cmd run check
  ```

  Expected: format, lint, palette, catalog, security-report, typecheck, unit-test, build, and static-export gates all exit successfully.

- [ ] **Step 6: Commit, push, and verify deployment**

  Review the diff and status, then run:

  ```powershell
  git add src/app/about/page.tsx tests/unit/about-page.test.tsx docs/superpowers/plans/2026-08-03-about-page-security-disclosure.md
  git commit -m "docs: update About security disclosure"
  git push origin main
  gh run list --workflow deploy-pages.yml --limit 3 --json databaseId,status,conclusion,headSha,url
  ```

  Expected: the commit contains only the plan, About-page copy/link, and focused test; `main` is pushed; the Pages workflow runs for the pushed commit and completes successfully. Confirm the deployed page contains the new advisory wording and TavernKeeper link before reporting deployment complete.
