# TavernKeeper Immediate-Danger Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve red for deterministic immediate-danger evidence, guarantee
that every valid red report publishes on Tavernary, reset the four obsolete red
reports, and rescan their current exact commits.

**Architecture:** TavernKeeper contextual policy 2 validates item-level high
recommendations against an exact evidence predicate. Tavernary independently
derives the project level and structured danger basis from the validated V5
report, treats model prose as optional enrichment, and publishes a static
fallback when enrichment fails. The release uses a paused durable queue,
ordered cross-repository merges, an exact four-report reset, protected targeted
workflows, and live exact-SHA verification.

**Tech Stack:** TypeScript 6, Node.js 24, React 19, Next.js 16, Zod, Vitest,
Playwright, GitHub Actions, GitHub CLI, GitHub Pages.

## Global Constraints

- Red means immediate user danger at the exact scanned commit.
- Critical dependency severity alone never selects red.
- Red danger basis is `malicious_or_compromised`,
  `critical_exploitable_vulnerability`, or `mixed`.
- Valid technical reports always publish on Tavernary even when optional prose
  synthesis fails.
- Red never automatically hides, quarantines, delists, or downranks a project.
- Scanner policy remains `3`; TavernKeeper contextual policy becomes `2` with
  prompt `contextual-review-v2`.
- TavernKeeper Technical Report and Preferred Index remain V5.
- Tavernary tracked summary schema becomes V6 and synthesis policy becomes `4`.
- Only the four report identities listed in the approved design may be deleted.
- Use TDD for every behavior change and preserve unrelated worktree/user files.

---

### Task 1: Tavernary deterministic advisory contract

**Files:**
- Modify: `scripts/security/tavernkeeper-assessment-contract.mjs`
- Modify: `scripts/security/tavernkeeper-assessment-contract.d.mts`
- Modify: `tests/unit/tavernkeeper-synthesis.test.ts`

**Interfaces:**
- Produces: `deriveProjectAdvisory(items): { risk_level, danger_basis }`
- Produces: `buildDeterministicAssessment(report): TavernaryAssessment`
- Changes: `validateTavernaryAssessment()` requires the model risk to equal the
  deterministic project risk; interaction prose cannot elevate it.

- [ ] **Step 1: Add failing advisory decision-table tests**

  Cover low, material, malicious red, vulnerability red, mixed red, a critical
  but merely plausible dependency, and model attempts to raise or lower risk.
  Assert this exact shape:

  ```js
  expect(deriveProjectAdvisory(items)).toEqual({
    risk_level: "high",
    danger_basis: "critical_exploitable_vulnerability",
  });
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run:
  `npm.cmd test -- tests/unit/tavernkeeper-synthesis.test.ts`

  Expected: failure because `deriveProjectAdvisory` and deterministic fallback
  do not exist and interaction escalation is still allowed.

- [ ] **Step 3: Implement the pure projector and fallback**

  The qualifying predicates are:

  ```js
  const malicious =
    item.disposition === "credible_malicious_behavior" &&
    item.confidence === "high";
  const exploitable =
    item.disposition === "material_vulnerability" &&
    item.confidence === "high" &&
    item.impact === "critical" &&
    item.exploitability === "readily_exploitable";
  ```

  High is returned only when either predicate is present; mixed is returned
  when both are present. Otherwise any `material_vulnerability` is material and
  expected/minor-only reports are low. Build deterministic policy-owned copy,
  exact validated counts, required candidate citations, and no interaction
  chains.

- [ ] **Step 4: Require exact deterministic risk**

  Replace the lowerable-floor/rank logic with equality against
  `deriveProjectAdvisory(reportItems(report)).risk_level`. Use
  `below_evidence_floor` for a lower model result and
  `unsupported_escalation` for a higher result.

- [ ] **Step 5: Run focused tests GREEN and commit**

  Run:
  `npm.cmd test -- tests/unit/tavernkeeper-synthesis.test.ts`

  Commit:
  `feat(security): derive immediate-danger risk`

### Task 2: Tavernary nonblocking synthesis publication

**Files:**
- Modify: `scripts/security/tavernkeeper-reports.mjs`
- Modify: `scripts/security/tavernkeeper-reports.d.mts`
- Modify: `scripts/security/tavernkeeper-synthesis.mjs`
- Modify: `scripts/security/tavernkeeper-synthesis.d.mts`
- Modify: `scripts/security/import-tavernkeeper-reports.mjs`
- Modify: `scripts/security/import-tavernkeeper-reports.d.mts`
- Modify: `scripts/security/tavernkeeper-import-state.mjs`
- Modify: `scripts/security/tavernkeeper-import-state.d.mts`
- Modify: `tests/unit/tavernkeeper-reports.test.ts`
- Modify: `tests/unit/tavernkeeper-import-state.test.ts`
- Modify: `data/security/tavernkeeper-report-summaries.json`

**Interfaces:**
- Stored summary V6 adds top-level report fields
  `danger_basis: DangerBasis` and
  `assessment_source: "model" | "deterministic_fallback"`.
- `trackedEntry(entry, synthesis, advisory, source)` persists those fields.
- A known `TavernKeeperSynthesisError` produces a preferred deterministic entry
  and a nonblocking incident instead of omitting the report.

- [ ] **Step 1: Replace blocking-quarantine tests with failing fallback tests**

  For invalid output, provider timeout/rate limit/server/network errors, and
  provider-security errors, assert:

  ```ts
  expect(outcome.snapshot.preferred_report_ids).toContain(entry.report_id);
  expect(outcome.snapshot.reports[0]).toMatchObject({
    danger_basis: "critical_exploitable_vulnerability",
    assessment_source: "deterministic_fallback",
    assessment: { risk_level: "high" },
  });
  ```

  Keep digest/origin/schema/evidence failures blocking. Assert one failed
  narrative does not stop later valid imports.

- [ ] **Step 2: Run focused tests and verify RED**

  Run:
  `npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-import-state.test.ts`

- [ ] **Step 3: Implement V6 storage and fallback reconciliation**

  Bump `TAVERNKEEPER_SYNTHESIS_POLICY_VERSION` to `4`. Validate upstream
  Technical Report/Index as V5 but stored snapshots as schema 6. Add the two
  required stored fields. Catch only known synthesis errors; create the
  deterministic assessment with `synthesis_model: "deterministic-policy-v4"`,
  preserve a sanitized incident, add the report to preferred IDs, and continue
  the batch. Unknown programming errors still fail the batch.

- [ ] **Step 4: Migrate tracked data mechanically**

  Set the root snapshot to `schema_version: 6`. Every existing low/material
  entry receives `danger_basis: "none"` and `assessment_source: "model"`.
  Validate the resulting file with the production reader; do not modify report
  identities, timestamps, model names, prose, or preferred IDs.

- [ ] **Step 5: Update incident semantics**

  Retain durable sanitized failure state and explicit retry capability, but do
  not let it filter preferred IDs or prevent a matching fallback entry. Resolve
  obsolete policy-3 quarantines under synthesis policy 4.

- [ ] **Step 6: Run focused tests GREEN and commit**

  Run:
  `npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-import-state.test.ts tests/unit/tavernkeeper-synthesis.test.ts`

  Commit:
  `fix(security): publish deterministic scan fallback`

### Task 3: Tavernary danger-basis UI and policy copy

**Files:**
- Modify: `src/features/catalog/tavernkeeper-status.ts`
- Modify: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Modify: `src/app/about/page.tsx`
- Modify: `.github/workflows/import-tavernkeeper-reports.yml`
- Modify: `tests/unit/tavernkeeper-status.test.ts`
- Modify: `tests/unit/tavernkeeper-scan-indicator.test.tsx`
- Modify: `tests/unit/about-page.test.tsx`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md`

**Interfaces:**
- `TavernKeeperReportSummary.dangerBasis` exposes the stored structured value.
- Red public label is `Immediate danger`.
- Red popovers render a `Danger basis` row with fixed policy-owned text.

- [ ] **Step 1: Add failing UI and documentation tests**

  Assert red accessible text says `Immediate danger`, the malicious and
  vulnerability bases render different text, material does not imply malware,
  About says red remains listed for awareness, and workflow incidents say
  `narrative enrichment` rather than report quarantine.

- [ ] **Step 2: Run focused tests and verify RED**

  Run:
  `npm.cmd test -- tests/unit/tavernkeeper-status.test.ts tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/about-page.test.tsx tests/unit/workflows.test.ts`

- [ ] **Step 3: Implement typed projection and copy**

  Map danger bases to:

  ```ts
  {
    malicious_or_compromised: "Credible malicious or compromised behavior",
    critical_exploitable_vulnerability:
      "Critical, readily exploitable vulnerability",
    mixed: "Malicious or compromised behavior and an exploitable vulnerability",
  }
  ```

  Show the row only for high reports. Update canonical design sections 4.2,
  15.3, 17, 17.1, publication, testing, and completion so the older document
  agrees with the approved corrective design.

- [ ] **Step 4: Run focused tests GREEN and commit**

  Commit:
  `feat(security): explain immediate danger`

### Task 4: Tavernary verification, PR, merge, and deployment

**Files:**
- Verify all Tavernary files changed in Tasks 1-3.

- [ ] **Step 1: Run repository gates**

  Run `npm.cmd run check` and the focused scan browser/visual commands required
  by CI. Verify generated catalog data exists before typecheck.

- [ ] **Step 2: Review the complete diff**

  Confirm no unrelated registry/catalog data changed, the four projects remain
  listed, technical-report failures remain fail-closed, and every known
  synthesis failure has a preferred fallback test.

- [ ] **Step 3: Push and open a ready PR**

  Push `codex/immediate-danger-policy-design`, open a ready PR against Tavernary
  `main`, and record its URL/head SHA. Do not use a draft PR.

- [ ] **Step 4: Verify checks and merge**

  Wait for all required GitHub checks. Address failures through new commits,
  then merge through the protected repository and record the merge SHA.

- [ ] **Step 5: Verify Tavernary Pages**

  Verify the Pages workflow/environment deploys the exact merge SHA. Use a
  fresh request and hydrated browser check for the About copy and a deterministic
  report fixture/card projection.

### Task 5: TavernKeeper contextual policy 2

**Files:**
- Rename: `config/contextual-review.v1.json` to
  `config/contextual-review.v2.json`
- Modify: `src/config/policy.ts`
- Modify: `src/model/contextual-prompt.ts`
- Modify: `src/model/contextual-review-contract.ts`
- Modify: `src/cli/scan.ts` and every runtime policy path found by
  `rg "contextual-review\\.v1|contextual-review-v1"`
- Modify: `tests/contextual-prompt.test.ts`
- Modify: `tests/contextual-review-contract.test.ts`
- Modify: `tests/contextual-review.test.ts`
- Modify: version-sensitive fixtures/tests found by the same search.

**Interfaces:**
- `ContextualReviewPolicy` accepts only version `2`, prompt
  `contextual-review-v2`, schema `contextual-assessment-v1`.
- `riskContradictsDisposition()` enforces the approved immediate-danger item
  predicate.

- [ ] **Step 1: Add failing policy and contract tests**

  Reject material high when confidence is medium, impact is high, or
  exploitability is plausible. Reject credible malicious behavior below high
  confidence. Accept only high-confidence credible malicious behavior and
  high-confidence critical readily exploitable material vulnerabilities as
  high.

- [ ] **Step 2: Run focused tests and verify RED**

  Run:
  `npm.cmd test -- tests/contextual-prompt.test.ts tests/contextual-review-contract.test.ts tests/contextual-review.test.ts`

- [ ] **Step 3: Implement policy 2**

  Update the versioned config, runtime paths, policy schema, prompt constants,
  and validator. Add explicit prompt language requiring shipped-version,
  runtime-reachability, attacker-control, and concrete-harm analysis for
  dependency advisories.

- [ ] **Step 4: Run focused tests GREEN and commit**

  Commit:
  `fix(policy): reserve red for immediate danger`

### Task 6: TavernKeeper presentation, queue priority, and documentation

**Files:**
- Modify: `src/site/presentation.ts`
- Modify: `src/site/render-landing.ts`
- Modify: `src/publish/render-report.ts`
- Modify: `src/publish/render-history.ts`
- Modify: `src/queue/backlog.ts`
- Modify: `tests/site-presentation.test.ts`
- Modify: `tests/site-build.test.ts`
- Modify: `tests/backlog.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/superpowers/specs/2026-08-03-tavernkeeper-reports-site-design.md`

**Interfaces:**
- Site risk labels become low/material/immediate-danger with explicit red basis.
- Due `staff_requested` queue entries sort before ordinary due entries, then by
  ticket.

- [ ] **Step 1: Add failing site and queue tests**

  Assert immediate-danger copy and danger basis on red pages. Assert critical
  plausible dependency evidence is material. Assert a higher-ticket staff
  request is selected before a lower-ticket ordinary entry while delayed staff
  work, emergency pause, and retry protection remain unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

  Run:
  `npm.cmd test -- tests/site-presentation.test.ts tests/site-build.test.ts tests/backlog.test.ts`

- [ ] **Step 3: Implement presentation and scheduling**

  Add a report-item advisory projector using the same decision table. Replace
  `High concern`/`High danger` project-level copy with `Immediate danger` and
  fixed basis text. Sort available queue entries by
  `Number(right.staff_requested === true) - Number(left.staff_requested === true)`
  and then ticket.

- [ ] **Step 4: Reconcile public documentation**

  State that red projects stay published for awareness, severity alone does not
  select red, and staff-targeted work receives queue priority without bypassing
  safety holds.

- [ ] **Step 5: Run focused tests GREEN and commit**

  Commit:
  `feat(site): distinguish immediate danger`

### Task 7: TavernKeeper verification, PR, merge, and deployment

- [ ] **Step 1: Run the complete TavernKeeper gate**

  Run the repository's full formatting, lint, typecheck, unit,
  workflow-policy, package, and production-site build commands from
  `package.json`/README.

- [ ] **Step 2: Review the complete diff**

  Confirm scanner policy remains 3, Report/Index remain V5, contextual policy
  is 2 everywhere, no report artifact is deleted yet, and queue priority cannot
  bypass holds.

- [ ] **Step 3: Push, open a ready PR, verify checks, and merge**

  Record PR URL, head SHA, merge SHA, and required check conclusions.

- [ ] **Step 4: Verify Pages deploys the policy merge SHA**

  Verify fresh report-site policy copy and that the four existing reports are
  still present immediately before the reset.

### Task 8: Exact four-report reset PR

**Files:**
- Modify: `reports/index.json`
- Delete: the four approved immutable report directories.
- Delete: each corresponding single-entry repository history directory.
- Regenerate: `.site` only through the supported build; do not hand-edit it.

- [ ] **Step 1: Reverify destructive targets and queue state**

  Compare repository ID, SHA, report ID, report count, and history count to the
  approved table. Verify no active scan targets those IDs. Pause through the
  supported staff operation if not already paused.

- [ ] **Step 2: Remove only exact matching artifacts**

  Fail if any identity differs or any history contains more than the one
  approved entry. Remove four preferred-index entries, four immutable trees,
  and four now-empty history trees.

- [ ] **Step 3: Rebuild and verify locally**

  Run report/index validation and the production site build. Assert all four IDs
  and old URLs are absent and unrelated report count equals prior count minus
  four.

- [ ] **Step 4: Commit, push, open a ready reset PR, verify, and merge**

  Use a dedicated reset commit. Record PR URL, head/merge SHA, and checks.

- [ ] **Step 5: Verify Pages deletion live**

  Confirm fresh index no longer contains the four IDs, old report/history URLs
  return not found, and unrelated report pages still load.

### Task 9: Reconciliation, four rescans, and live completion

- [ ] **Step 1: Reconcile Tavernary**

  Dispatch the protected import workflow. Verify the four obsolete incidents
  resolve, no old summary is preferred, and Tavernary main remains valid.

- [ ] **Step 2: Dispatch four protected targeted workflows**

  Dispatch the canonical URLs from the approved design one at a time through
  Tavernary's `targeted-tavernkeeper-scan.yml`. Record workflow run IDs.

- [ ] **Step 3: Verify durable queue entries**

  Confirm refreshed exact SHA, `staff_requested: true`, unique repository ID,
  and staff-first ordering for all four before resuming.

- [ ] **Step 4: Resume and monitor scans**

  Resume through the supported staff workflow. Follow all four through scan,
  contextual policy 2, publication, Pages, Tavernary import, and Tavernary
  deployment. Do not hardcode an expected color.

- [ ] **Step 5: Perform live exact-SHA UI verification**

  For every project, record report ID/digest, contextual policy 2, scanner
  policy 3, public technical report, current SHA/freshness, Tavernary summary,
  and hydrated desktop/mobile popover. If any result is red, prove it remains
  listed and displays the correct danger basis.

- [ ] **Step 6: Close out**

  Confirm the ordinary queue is running, unrelated work was preserved, all PRs
  are merged, all production SHAs are recorded, and the approved definition of
  done is satisfied.
