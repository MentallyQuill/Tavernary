# TavernKeeper Source-Tree Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TavernKeeper popover's linked short SHA open the exact GitHub source tree so users can browse or download the assessed repository snapshot.

**Architecture:** Treat the source-tree URL as card presentation data derived only from the already validated GitHub repository identity and target SHA. Rename the card summary contract from `commitUrl` to `treeUrl`, update the popover's accessible link contract, and align the current Tavernary authority documents with the already approved lean popover. Leave TavernKeeper producers, schemas, imports, scanners, queues, reports, and generated catalog data unchanged. Release through the existing `main` Pages workflow and certify the exact deployed SHA plus the hydrated Recursion link.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, Vitest with Testing Library, Playwright, GitHub Actions, GitHub Pages, GitHub CLI.

## Global Constraints

- Implement in an isolated worktree so concurrent main-checkout work is untouched.
- Change only Tavernary presentation data, card rendering, tests, current authority documentation, and this plan; do not change TavernKeeper producer or report contracts.
- Rename `TavernKeeperReportSummary.commitUrl` to `treeUrl`; do not retain a misleading compatibility alias.
- Generate `https://github.com/{repository}/tree/{full target SHA}` from validated `repository` and `target_sha` fields.
- Keep the visible link text as the seven-character SHA plus the existing decorative external-link arrow.
- Set the exact accessible name to `Browse scanned source at commit {full SHA} on GitHub`.
- Preserve `target="_blank"` and `rel="noopener noreferrer"`.
- Keep `malicious_evidence` in the synthesis/data contract while documenting that the concise popover does not render it.
- Document that the compact history strip and full-history link appear only when at least two assessments exist; a one-entry history renders neither.
- Do not change layout, CSS, or visual snapshots unless verification proves an unintended visual difference.
- Run the complete local gate, merge into `main`, push, monitor the exact Pages workflow, and live-verify Recursion's hydrated link.

---

## File map

- `src/features/catalog/tavernkeeper-status.ts` — rename and derive the explicit source-tree presentation URL.
- `src/features/catalog/components/tavernkeeper-scan-indicator.tsx` — consume `treeUrl` and expose the approved accessible link name.
- `tests/unit/tavernkeeper-status.test.ts` — prove exact `/tree/{sha}` derivation.
- `tests/unit/project-card.test.tsx` — keep the typed project-card fixture aligned with the renamed summary contract.
- `tests/unit/tavernkeeper-scan-indicator.test.tsx` — prove link semantics, focus order, visible SHA, and external-link safety.
- `tests/e2e/catalog.spec.ts` — prove hydrated cards emit exact GitHub tree URLs and approved accessible names.
- `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md` — align section 19.2 and history behavior with the lean popover while preserving the synthesis field.
- `docs/tavernkeeper-integration.md` — describe the concise card contract and conditional history accurately.
- `docs/tavernkeeper-live-acceptance.md` — record the accepted source-tree link and absence of one-entry history UI.
- `docs/superpowers/plans/2026-08-03-tavernkeeper-source-tree-link.md` — record this implementation and release procedure.

---

### Task 1: Rename the card link contract and target exact source trees

**Files:**
- Modify: `src/features/catalog/tavernkeeper-status.ts:43-62,163-185`
- Modify: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx:360-385`
- Test: `tests/unit/tavernkeeper-status.test.ts:233-250`
- Test: `tests/unit/project-card.test.tsx:145-165`
- Test: `tests/unit/tavernkeeper-scan-indicator.test.tsx:20-50,125-160,410-455`
- Test: `tests/e2e/catalog.spec.ts:1195-1210`

**Interfaces:**
- Consumes: `TavernKeeperAssessedReport.repository: string` and `target_sha: string`, accepted only after the existing GitHub/source/policy identity checks.
- Produces: `TavernKeeperReportSummary.treeUrl: string` and the accessible popover link `Browse scanned source at commit {full SHA} on GitHub`.

- [ ] **Step 1: Write the failing status projection assertion**

Replace the `commitUrl` expectation in `projects the concise final assessment without technical findings` with:

```ts
treeUrl: `https://github.com/owner/repo/tree/${currentSha}`,
```

Add this assertion after the object match so the old property cannot survive the rename:

```ts
expect(status.report).not.toHaveProperty("commitUrl");
```

- [ ] **Step 2: Run the status test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-status.test.ts
```

Expected: FAIL because `treeUrl` is absent and the current object still exposes `commitUrl`.

- [ ] **Step 3: Rename and derive the summary field**

Change the interface field:

```ts
treeUrl: string;
```

Change the `summarize` projection:

```ts
treeUrl: `https://github.com/${report.repository}/tree/${report.target_sha}`,
```

Do not change `TavernKeeperAssessedReport`, report JSON, schemas, or import logic.

- [ ] **Step 4: Update typed fixtures to the new source-tree contract**

In `project-card.test.tsx`, replace the fixture field with:

```ts
treeUrl:
  "https://github.com/owner/repository/tree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
```

In `tavernkeeper-scan-indicator.test.tsx`, replace the `scanReport` fixture field with:

```ts
treeUrl:
  "https://github.com/owner/repository/tree/abc1234def5678abc1234def5678abc1234def5678",
```

- [ ] **Step 5: Write the failing component link assertions**

Replace every old link query with:

```ts
const sourceTreeLink = within(panel).getByRole("link", {
  name: `Browse scanned source at commit ${redReport.scannedSha} on GitHub`,
});
expect(sourceTreeLink).toHaveTextContent(redReport.scannedSha.slice(0, 7));
expect(sourceTreeLink).toHaveAttribute("href", redReport.treeUrl);
expect(sourceTreeLink).toHaveAttribute("target", "_blank");
expect(sourceTreeLink).toHaveAttribute(
  "rel",
  expect.stringContaining("noopener"),
);
```

Update both forward and reverse keyboard-focus assertions to query the same approved accessible name.

- [ ] **Step 6: Run the component test and verify RED**

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-scan-indicator.test.tsx
```

Expected: FAIL because the component still exposes `View scanned commit ...` and reads `commitUrl`.

- [ ] **Step 7: Update the popover link**

Replace the link attributes with:

```tsx
aria-label={`Browse scanned source at commit ${report.scannedSha} on GitHub`}
href={report.treeUrl}
```

Keep the existing `ref`, keyboard handler, short-SHA child content, decorative arrow, new-tab target, and `noopener noreferrer` relationship unchanged.

- [ ] **Step 8: Update the hydrated E2E contract**

Replace the accessible-name and URL assertions with:

```ts
const sourceTreeLink = panel.getByRole("link", {
  name: /Browse scanned source at commit [0-9a-f]{40} on GitHub/u,
});
await expect(sourceTreeLink).toHaveAttribute(
  "href",
  /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{40}$/u,
);
await expect(sourceTreeLink).toHaveAttribute("target", "_blank");
await expect(sourceTreeLink).toHaveAttribute("rel", /\bnoopener\b/u);
```

- [ ] **Step 9: Prove the renamed contract is complete**

Run:

```powershell
rg -n "commitUrl|View scanned commit|github\.com/.*/commit/" src tests
```

Expected: exit code 1 with no matches.

Run:

```powershell
npx.cmd vitest run tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx tests/unit/tavernkeeper-scan-indicator.test.tsx
npm.cmd run typecheck
npm.cmd run test:scan-e2e
```

Expected: 0 failures; the focused browser matrix passes on Chromium, WebKit, and mobile projects.

- [ ] **Step 10: Confirm no visual baseline changed**

Run:

```powershell
npm.cmd run test:scan-visual
git status --short
```

Expected: visual tests pass without modified PNG snapshots; only the planned TypeScript, test, authority-documentation, and plan files are changed.

- [ ] **Step 11: Commit the implementation**

```powershell
git add src/features/catalog/tavernkeeper-status.ts src/features/catalog/components/tavernkeeper-scan-indicator.tsx tests/unit/tavernkeeper-status.test.ts tests/unit/project-card.test.tsx tests/unit/tavernkeeper-scan-indicator.test.tsx tests/e2e/catalog.spec.ts
git commit -m "fix(tavernkeeper): browse scanned source trees"
```

---

### Task 2: Align the current popover authority documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md:655-685,708-719`
- Modify: `docs/tavernkeeper-integration.md:33-45`
- Modify: `docs/tavernkeeper-live-acceptance.md:52-63`

**Interfaces:**
- Consumes: the approved lean-popover behavior and source-tree-link contract.
- Produces: current authority text that distinguishes retained assessment data from the smaller card presentation.

- [ ] **Step 1: Update the cross-repository security design**

In section 19.2, describe the assessed-project panel as containing the grade, one- or two-sentence summary, counts qualifier, exact scanned SHA source-tree link, scan metadata, freshness, the report link, and history UI only when at least two assessments exist.

Remove the malicious-evidence statement from the panel-content list. Add an explicit sentence that `malicious_evidence` remains part of the synthesis/data contract but is not rendered in the concise panel. In section 19.4, state that the compact strip and `View full scan history` link are omitted for a one-entry history and shown from the second assessment onward.

- [ ] **Step 2: Update the integration guide**

Replace the obsolete panel inventory with the same concise presentation contract. Describe the linked exact SHA as the source-tree link, preserve the `malicious_evidence` contract explicitly, and make the history-strip/link threshold unambiguous.

- [ ] **Step 3: Update live acceptance**

Record that the accepted card exposes the exact scanned SHA as a source-tree link. Replace the one-entry history claim with the accepted threshold: one retained assessment shows neither the strip nor the full-history link; both appear when a second assessment exists.

- [ ] **Step 4: Prove obsolete current-authority claims are gone**

Run:

```powershell
rg -n "malicious-evidence statement|compact one-entry history strip|Compact final-assessment history strip" docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md docs/tavernkeeper-integration.md docs/tavernkeeper-live-acceptance.md
```

Expected: exit code 1 with no matches.

Then run:

```powershell
rg -n "malicious_evidence|source-tree|at least two|second assessment" docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md docs/tavernkeeper-integration.md docs/tavernkeeper-live-acceptance.md
npx.cmd prettier --check docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md docs/tavernkeeper-integration.md docs/tavernkeeper-live-acceptance.md
```

Expected: the affirmative contract terms are present and formatting passes.

- [ ] **Step 5: Commit the authority alignment**

```powershell
git add docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md docs/tavernkeeper-integration.md docs/tavernkeeper-live-acceptance.md
git commit -m "docs(tavernkeeper): align concise popover contract"
```

---

### Task 3: Run the full gate, publish, and certify the live Recursion link

**Files:**
- Verify: all tracked repository files through existing validation/build/test commands.
- Verify live: `https://tavernary.org/` and the hydrated Recursion TavernKeeper popover.

**Interfaces:**
- Consumes: the Task 1 commit on a named feature branch, the current `main`, `origin/main`, the `Site: Deploy to GitHub Pages` workflow, and the GitHub Pages environment.
- Produces: a clean synchronized `main`, a successful Pages deployment for its exact SHA, and live evidence that Recursion links to the exact requested tree URL.

- [ ] **Step 1: Run the complete local gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog/report validation, catalog build, typecheck, all unit tests, production build, and static-export verification PASS.

- [ ] **Step 2: Audit branch and main before integration**

Run from both the feature worktree and main checkout as appropriate:

```powershell
git status -sb
git log --oneline main..HEAD
git worktree list --porcelain
```

Expected: feature worktree clean; only the planned implementation commit is ahead of the spec/plan base. Preserve every unrelated active worktree and stop on overlapping dirty main files.

- [ ] **Step 3: Integrate into current main and verify the merged result**

Update main with `git pull --ff-only`. If main advanced with non-overlapping concurrent work, inspect the diff and use a normal merge of the feature branch; do not reset or discard either line of work.

Run on merged main:

```powershell
npm.cmd test
npm.cmd run typecheck
git status -sb
```

Expected: 0 failures and a clean main checkout ahead of or synchronized with `origin/main`.

- [ ] **Step 4: Push the exact main SHA**

Run:

```powershell
gh auth status
git push origin main
git rev-parse HEAD
gh api repos/MentallyQuill/Tavernary/commits/main --jq '.sha'
```

Expected: local HEAD, remote main, and the recorded release SHA are identical.

- [ ] **Step 5: Monitor every workflow for the pushed SHA**

Run:

```powershell
gh run list --commit <release-sha> --limit 20 --json databaseId,workflowName,status,conclusion,headSha,url,event
```

Poll each relevant nonterminal run with:

```powershell
gh run view <run-id> --json status,conclusion,headSha,jobs,url,workflowName
```

Expected: the `Site: Deploy to GitHub Pages` run for the exact SHA reaches `completed/success`; any other push-triggered run for the SHA also reaches a successful terminal state or is explicitly shown to be irrelevant.

- [ ] **Step 6: Verify the Pages environment deployment for the exact SHA**

Query deployments and the newest status:

```powershell
gh api "repos/MentallyQuill/Tavernary/deployments?sha=<release-sha>&environment=github-pages"
gh api "repos/MentallyQuill/Tavernary/deployments/<deployment-id>/statuses" --jq '.[0]'
```

Expected: newest deployment status is `success`, its environment URL is `https://tavernary.org/`, and the deployment payload resolves to the release SHA.

- [ ] **Step 7: Make a fresh live request**

Request `https://tavernary.org/?t=<release-sha>` with cache bypass headers.

Expected: HTTP 200 from the public origin after the successful deployment.

- [ ] **Step 8: Live-verify the hydrated Recursion interaction**

In a fresh browser page:

1. Open `https://tavernary.org/?q=Recursion&t=<release-sha>`.
2. Wait for `.catalog-shell[data-hydrated="true"]`.
3. Locate the Recursion project card and open `TavernKeeper scan: Low concern; current.`.
4. Locate the link named `Browse scanned source at commit 1bce1fa73fe6c0fe8e767c773a832b94bb336720 on GitHub`.
5. Confirm its exact `href` is:

```text
https://github.com/MentallyQuill/Recursion/tree/1bce1fa73fe6c0fe8e767c773a832b94bb336720
```

6. Confirm the visible text remains `1bce1fa` plus its decorative external-link arrow, and no console error appears.

- [ ] **Step 9: Clean up only the owned implementation worktree**

After successful merge and merged-main verification, remove only the source-tree-link worktree, prune its stale registration if necessary, and delete only its fully merged local feature branch. Preserve every unrelated worktree and branch.

- [ ] **Step 10: Record the release proof**

Report the exact deployed SHA, Pages workflow URL and run ID, Pages deployment ID/status, fresh HTTP result, live Recursion link, full-gate results, and whether main is clean and synchronized.
