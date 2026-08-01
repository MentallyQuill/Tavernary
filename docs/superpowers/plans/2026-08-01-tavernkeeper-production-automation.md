# TavernKeeper Production Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish TavernKeeper and Tavernary as a fully automated, exact-SHA repository-scanning system with staff-targeted scans, automated three-role finding validation, immutable report history, and the approved Tavernary scan-indicator experience.

**Architecture:** Tavernary publishes the authoritative V2 target manifest and is the only place a staff-targeted scan can begin. TavernKeeper consumes that manifest in isolated GitHub-hosted jobs, runs every required deterministic stage plus analyzer/challenger/arbiter model calls, publishes complete sanitized reports automatically through its scoped Publisher App, and wakes Tavernary to import V2 summaries and render local freshness state. Ordinary backlog work stays paused until the same production path is proven against Recursion and Wandlight, then drains in batches of five with concurrency two using Top-30, new-submission, and oldest-project lanes.

**Tech Stack:** Node.js 24, TypeScript 6 strict mode, Zod 4, Ajv 8, Vitest 4, React 19, Next.js 16 static export, Playwright 1.61, GitHub Actions, GitHub Pages, OpenAI-compatible Chat Completions, NanoGPT release configuration `deepseek/deepseek-v4-flash`

## Global Constraints

- The approved design at `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md` is authoritative.
- The earlier July 31 implementation plans are historical records; this delta plan supersedes their uncompleted checklists.
- Never execute target hooks, Actions, package scripts, dependencies, tests, builds, macros, containers, binaries, interpreters, submodules, or Git LFS content.
- GitHub-backed frontends, extensions, and System Presets are eligible. Codeberg, URL-only, Reddit, Google Drive, arbitrary websites, organization pages, and private repositories are unsupported in V2.
- Every report is bound to a positive immutable GitHub repository ID and one full lowercase 40-character SHA.
- Production has no per-scan human review, approval, dismissal, recoloring, or publication gate.
- Every applicable deterministic scanner and every required analyzer, challenger, and arbiter call must complete. Incomplete work publishes nothing.
- The configured endpoint, API key, and model remain runtime configuration. Do not append an endpoint route, substitute another model, or encode NanoGPT into architecture.
- Do not impose a fixed aggregate repository token cap or predicted job budget. Per-request context/output ceilings and hostile-input resource ceilings remain mandatory.
- Retry the same classified failure at T+1h, T+2h, and T+3h. Notify TavernKeeper staff only after the third retry fails.
- Public report results are only `teal` or `red`. Orange, gray, and dark teal are Tavernary presentation states.
- Preserve every immutable historical report. A newer clean result does not erase an older red result from history.
- Select at most five repositories per ordinary batch and run at most two repository scan jobs concurrently.
- Only a tracked immutable Tavernary scan-operator ID may begin a targeted scan, and the only accepted user input is one exact GitHub repository URL already backing a published Tavernary card.
- Treat every GitHub token as an opaque masked string. Never parse its prefix/length/JWT shape or store it in logs, caches, repository files, or artifacts.
- Use TDD for every code change and commit each independently testable task in its owning repository.

---

### Task 1: Reconcile the Live Baseline and Publisher App PR

**Files:**

- Modify: `F:/git/TavernKeeper/docs/operations.md`
- Modify: `F:/git/TavernKeeper/docs/architecture.md`
- Modify: `F:/git/Tavernary/docs/tavernkeeper-integration.md`
- Create: `F:/git/TavernKeeper/docs/development-rules.md`
- Create: `F:/git/Tavernary/docs/development-rules.md`

**Interfaces:**

- Consumes: TavernKeeper draft PR `#1` at `feature/tavernkeeper-v1`, Tavernary design commit `1c78e78a`.
- Produces: both default branches containing the scoped Publisher-App baseline and an explicit automation-first development rule.

- [ ] **Step 1: Prove TavernKeeper PR #1 is clean and current**

Run:

```powershell
gh pr checks 1 --repo MentallyQuill/TavernKeeper
gh pr view 1 --repo MentallyQuill/TavernKeeper --json isDraft,mergeStateStatus,headRefOid,baseRefOid
```

Expected: every required check passes and `mergeStateStatus` is `CLEAN`.

- [ ] **Step 2: Merge the scoped Publisher baseline**

Run:

```powershell
gh pr ready 1 --repo MentallyQuill/TavernKeeper
gh pr merge 1 --repo MentallyQuill/TavernKeeper --merge
git -C F:\git\TavernKeeper pull --ff-only origin main
```

Expected: TavernKeeper `main` contains the Publisher App commits and PR #1 is merged.

- [ ] **Step 3: Record the production development rule in both repositories**

Use this exact normative rule:

```markdown
# TavernKeeper Development Rules

Production scan evaluation and publication are fully automated. Development
canaries may be inspected while a new pipeline is being proven, but no
production scan, rescan, finding disposition, report publication, Tavernary
import, or card update may depend on human approval. Staff may change global,
versioned scanner policy through ordinary code review; staff may not dismiss,
edit, recolor, or supersede an individual report.
```

Update each architecture/operations document to link to its local rule and remove language that requires per-report adjudication or a canary-only production allowlist.

- [ ] **Step 4: Run documentation and workflow policy checks**

Run:

```powershell
npm --prefix F:\git\TavernKeeper run format:check
npm --prefix F:\git\TavernKeeper run workflows:check
npm --prefix F:\git\Tavernary run format:check
```

Expected: all commands pass.

- [ ] **Step 5: Commit the rule in each repository**

```text
docs: define automated scan publication
```

---

### Task 2: Introduce the Cross-Repository V2 Contracts

**Files:**

- Create: `F:/git/TavernKeeper/schemas/tavernary-targets.v2.schema.json`
- Create: `F:/git/TavernKeeper/schemas/scan-report.v2.schema.json`
- Create: `F:/git/TavernKeeper/schemas/report-index.v2.schema.json`
- Modify: `F:/git/TavernKeeper/src/contracts/targets.ts`
- Modify: `F:/git/TavernKeeper/src/contracts/reports.ts`
- Modify: `F:/git/TavernKeeper/src/scanners/types.ts`
- Modify: `F:/git/TavernKeeper/reports/index.json`
- Modify: `F:/git/TavernKeeper/tests/contracts.test.ts`
- Modify: `F:/git/TavernKeeper/tests/fixtures/contracts/targets.valid.json`
- Modify: `F:/git/TavernKeeper/tests/fixtures/contracts/report.valid.json`
- Modify: `F:/git/TavernKeeper/tests/fixtures/contracts/index.valid.json`
- Create: `F:/git/Tavernary/data/schemas/tavernkeeper-targets.v2.schema.json`
- Create: `F:/git/Tavernary/data/schemas/tavernkeeper-report-index.v2.schema.json`
- Create: `F:/git/Tavernary/tests/fixtures/tavernkeeper/targets.v2.valid.json`
- Create: `F:/git/Tavernary/tests/fixtures/tavernkeeper/report-index.v2.valid.json`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-targets.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-reports.test.ts`

**Interfaces:**

- Consumes: frozen deployed V1 JSON contracts.
- Produces: `TargetManifestV2`, `ScanReportV2`, and `ReportIndexV2`; V1 remains accepted only during the ordered migration.

- [ ] **Step 1: Write failing V2 target-contract tests**

Assert this shape and reject missing/unsorted metadata:

```ts
expect(TargetManifestV2Schema.parse(fixture).repositories[0]).toMatchObject({
  project_kinds: ["preset"],
  catalog_priority: {
    top_30: false,
    first_cataloged_at: "2026-07-31T18:00:00.000Z",
  },
});
```

Also assert that `project_kinds` is sorted/unique and that repository IDs remain strictly increasing.

- [ ] **Step 2: Write failing V2 report-contract tests**

Use these exact public values:

```ts
export const PublicResultSchema = z.enum(["teal", "red"]);
export const AutomatedDispositionSchema = z.enum([
  "confirmed",
  "not-supported",
  "inconclusive",
]);
```

Require `history_url`, role policy identifiers, deterministic evidence-validation status, and mechanically derived teal/red results. Reject legacy `green`, `yellow`, `active`, `dismissed`, and staff-adjudication metadata from V2 reports.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/contracts.test.ts
npm --prefix F:\git\Tavernary test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/tavernkeeper-reports.test.ts
```

Expected: failures identify absent V2 schemas and legacy result/disposition values.

- [ ] **Step 4: Implement strict V2 contracts and migration readers**

Expose migration readers with these signatures:

```ts
export function parseTargetManifest(
  input: unknown,
): TargetManifestV1 | TargetManifestV2;
export function requireTargetManifestV2(
  input: TargetManifestV1 | TargetManifestV2,
): TargetManifestV2;
export function parseReportIndex(
  input: unknown,
): ReportIndexV1 | ReportIndexV2;
```

`parseTargetManifest` accepts V1 only during rollout without inventing V2
metadata. Reconciliation treats a valid V1 manifest as migration-waiting and
selects no work; every scan planner requires V2. Tavernary's importer accepts
the frozen empty V1 index or strict V2 until migration completes; every newly
generated report and index is V2.

- [ ] **Step 5: Derive V2 report results mechanically**

```ts
export function deriveResult(findings: FindingV2[]): "teal" | "red" {
  return findings.some(
    ({ disposition, severity, confidence }) =>
      disposition === "confirmed" &&
      ["critical", "high", "medium"].includes(severity) &&
      ["high", "medium"].includes(confidence),
  )
    ? "red"
    : "teal";
}
```

- [ ] **Step 6: Prove JSON Schema and TypeScript parity**

Run both fixtures through Zod and the vendored Ajv schemas, then compare the canonical schema fixtures byte-for-byte across repositories.

- [ ] **Step 7: Run contract gates and commit in each repository**

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/contracts.test.ts
npm --prefix F:\git\TavernKeeper run typecheck
npm --prefix F:\git\Tavernary test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/tavernkeeper-reports.test.ts
```

Commit messages:

```text
feat(contracts): add automated scan v2
feat(security): accept TavernKeeper v2 contracts
```

---

### Task 3: Replace Single-Pass Review with Analyzer, Challenger, and Arbiter

**Files:**

- Create: `F:/git/TavernKeeper/src/model/role-contracts.ts`
- Create: `F:/git/TavernKeeper/src/model/analyzer.ts`
- Create: `F:/git/TavernKeeper/src/model/challenger.ts`
- Create: `F:/git/TavernKeeper/src/model/arbiter.ts`
- Create: `F:/git/TavernKeeper/src/model/evidence-validator.ts`
- Create: `F:/git/TavernKeeper/src/model/report-builder.ts`
- Modify: `F:/git/TavernKeeper/src/model/model-review.ts`
- Modify: `F:/git/TavernKeeper/src/model/chunk-cache.ts`
- Modify: `F:/git/TavernKeeper/src/orchestrator/scan-handler.ts`
- Modify: `F:/git/TavernKeeper/src/operations/telemetry.ts`
- Modify: `F:/git/TavernKeeper/src/config/policy.ts`
- Modify: `F:/git/TavernKeeper/config/scanner-policy.v1.json`
- Create: `F:/git/TavernKeeper/tests/model-roles.test.ts`
- Create: `F:/git/TavernKeeper/tests/evidence-validator.test.ts`
- Modify: `F:/git/TavernKeeper/tests/model-review.test.ts`
- Modify: `F:/git/TavernKeeper/tests/model-cache.test.ts`
- Modify: `F:/git/TavernKeeper/tests/scan-atomicity.test.ts`
- Modify: `F:/git/TavernKeeper/tests/scan-session.test.ts`
- Modify: `F:/git/TavernKeeper/tests/telemetry.test.ts`

**Interfaces:**

- Consumes: deterministic `ScannerFinding[]`, redacted `ModelChunk[]`, configured OpenAI-compatible transport.
- Produces: `reviewWithConfiguredModel(spec): Promise<AutomatedReview>` containing validated public findings, role policy IDs, completed role counts, and actual usage.

- [ ] **Step 1: Write failing role-isolation tests**

Use a request double that records role prompts and returns one analyzer claim, one challenger dispute, and one arbiter decision:

```ts
expect(calls.map(({ role }) => role)).toEqual([
  "analyzer",
  "challenger",
  "arbiter",
]);
expect(review.findings[0]?.disposition).toBe("not-supported");
```

Assert each role receives only its documented bounded context and cannot see provider credentials or raw unredacted secrets.

For a target whose `project_kinds` contains `preset`, assert the analyzer policy
explicitly reviews imported endpoints, headers, request bodies, prompt
manipulation, regex behavior, obfuscation, external downloads, and bundled
executables while deterministic scanners still cover the entire repository.

- [ ] **Step 2: Write failing deterministic-evidence tests**

Cover path mismatch, line-range escape, wrong segment digest, wrong SHA, missing deterministic finding, invented path, and altered fingerprint. Each must throw `MODEL_EVIDENCE_INVALID` with repository scope and publish no candidate.

- [ ] **Step 3: Run model tests and verify RED**

Run:

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/model-roles.test.ts tests/evidence-validator.test.ts tests/model-review.test.ts tests/model-cache.test.ts tests/scan-atomicity.test.ts
```

- [ ] **Step 4: Implement exact role contracts**

Use stable evidence references:

```ts
export interface EvidenceReference {
  path: string;
  lineStart: number | null;
  lineEnd: number | null;
  segmentId: string | null;
  contentDigest: string;
  targetSha: string;
}

export type ArbiterDisposition =
  | "confirmed"
  | "not-supported"
  | "inconclusive";
```

The analyzer must explicitly account for every deterministic finding. The challenger attempts to disprove every candidate. The arbiter receives the exact normalized claim, challenge, scanner evidence, and submitted context; it cannot change evidence identity.

- [ ] **Step 5: Implement deterministic evidence validation**

`validateArbiterDecision(decision, evidenceMap, targetSha)` must prove path, lines, segment/content digest, fingerprint, and SHA before constructing a public finding. Invalid evidence fails the entire repository scan.

- [ ] **Step 6: Make report construction deterministic**

Delete the model-based final synthesis path. `buildAutomatedReportFindings()` sorts validated findings by fingerprint, derives counts/results mechanically, and never performs a fourth model call.

- [ ] **Step 7: Version role prompts and cache keys**

Extend cache identity with:

```ts
{
  role: "analyzer" | "challenger" | "arbiter",
  rolePromptDigest: string,
  endpointOrigin: string,
  modelIdentifier: string,
  promptPolicyVersion: string,
  scannerPolicyVersion: string,
  inputDigest: string,
}
```

Cache only strict parsed, sanitized role results and usage. Never cache raw source, prompts, credentials, or raw provider responses.

Aggregate actual input/output/cache-read/reasoning usage across every role and
record analyzer, challenger, and arbiter completion counts without recording
provider payloads or repository excerpts.

- [ ] **Step 8: Enforce fail-closed role completion**

Any missing response, malformed result, unaccounted deterministic finding, unresolved review-level `inconclusive`, or evidence failure returns no candidate and enters the normal retry policy. Low/info inconclusive observations may remain visible but cannot affect teal/red derivation.

- [ ] **Step 9: Run the complete model/orchestrator gate and commit**

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/model-roles.test.ts tests/evidence-validator.test.ts tests/model-review.test.ts tests/model-cache.test.ts tests/scan-session.test.ts tests/scan-atomicity.test.ts
npm --prefix F:\git\TavernKeeper run typecheck
```

Commit:

```text
feat(model): automate finding validation
```

---

### Task 4: Remove Per-Report Staff Adjudication

**Files:**

- Delete: `F:/git/TavernKeeper/.github/workflows/adjudicate.yml`
- Delete: `F:/git/TavernKeeper/src/cli/adjudicate.ts`
- Delete: `F:/git/TavernKeeper/src/adjudication/adjudicate.ts`
- Delete: `F:/git/TavernKeeper/rules/dismissals.json`
- Delete: `F:/git/TavernKeeper/tests/adjudication.test.ts`
- Modify: `F:/git/TavernKeeper/package.json`
- Modify: `F:/git/TavernKeeper/.github/ISSUE_TEMPLATE/false-positive.yml`
- Modify: `F:/git/TavernKeeper/tests/appeal-template.test.ts`
- Modify: `F:/git/TavernKeeper/tests/workflows.test.ts`
- Modify: `F:/git/TavernKeeper/docs/operations.md`
- Modify: `F:/git/TavernKeeper/README.md`

**Interfaces:**

- Consumes: V2 automated dispositions from Task 3.
- Produces: no callable path capable of editing/dismissing one report; appeals can only motivate a global versioned policy correction.

- [ ] **Step 1: Write failing absence and appeal-safety tests**

```ts
expect(workflowNames).not.toContain("adjudicate.yml");
expect(packageJson.scripts).not.toHaveProperty("adjudicate");
expect(appealBody).toMatch(/global.*policy correction/iu);
expect(appealBody).not.toMatch(/dismiss|recolor|approve this report/iu);
```

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/appeal-template.test.ts tests/workflows.test.ts
```

- [ ] **Step 3: Delete adjudication surfaces and update documentation**

The false-positive Issue Form still accepts immutable report ID, finding fingerprint, and maintainer evidence. It states that the existing report remains immutable and that only a global reviewed policy change can cause an automatic rescan.

- [ ] **Step 4: Scan the repository for forbidden production concepts**

Run:

```powershell
rg -n -i "adjudicate|staff dismissal|per-report approval|green|yellow" F:\git\TavernKeeper\src F:\git\TavernKeeper\.github F:\git\TavernKeeper\docs F:\git\TavernKeeper\README.md
```

Expected: no production adjudication path and no legacy public-result wording outside explicit V1 migration documentation.

- [ ] **Step 5: Run checks and commit**

```text
refactor(reports): remove manual adjudication
```

---

### Task 5: Publish Immutable Repository History

**Files:**

- Modify: `F:/git/TavernKeeper/src/publish/report-path.ts`
- Modify: `F:/git/TavernKeeper/src/publish/publisher.ts`
- Modify: `F:/git/TavernKeeper/src/publish/render-report.ts`
- Create: `F:/git/TavernKeeper/src/publish/render-history.ts`
- Modify: `F:/git/TavernKeeper/src/site/build-site.ts`
- Modify: `F:/git/TavernKeeper/tests/report-path.test.ts`
- Modify: `F:/git/TavernKeeper/tests/publisher.test.ts`
- Modify: `F:/git/TavernKeeper/tests/report-render.test.ts`
- Create: `F:/git/TavernKeeper/tests/history-render.test.ts`
- Modify: `F:/git/TavernKeeper/tests/site-build.test.ts`

**Interfaces:**

- Consumes: validated V2 candidate reports.
- Produces: immutable report pages, V2 preferred index entries for older SHAs, and `reports/github/{repositoryId}/history/` pages.

- [ ] **Step 1: Write failing preferred-history tests**

```ts
expect(index.reports.map(({ target_sha }) => target_sha)).toEqual([
  oldSha,
  currentSha,
]);
expect(index.reports[0]?.history_url).toBe(
  "https://mentallyquill.github.io/TavernKeeper/reports/github/42/history/",
);
```

Assert newest deep outranks standard for the same repository/SHA/policy, later report version resolves same-mode corrections, and superseded reports remain on the full history page.

- [ ] **Step 2: Write failing immutable history-page tests**

Assert script-free escaped HTML, exact SHA links, result text, completion date, policy/mode, every immutable report URL, restrictive CSP, and no raw finding excerpts.

- [ ] **Step 3: Run report tests and verify RED**

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/publisher.test.ts tests/report-render.test.ts tests/history-render.test.ts tests/site-build.test.ts
```

- [ ] **Step 4: Implement preferred selection and deterministic history pages**

Expose:

```ts
export function selectPreferredReports(reports: ScanReportV2[]): ReportIndexEntryV2[];
export function renderRepositoryHistory(input: RepositoryHistory): string;
```

The index keeps the preferred conclusion for every SHA under the active policy. The history page lists every immutable report, including superseded and older-policy reports.

- [ ] **Step 5: Publish atomically**

Prevalidate the whole batch, reject existing immutable paths, write report JSON/HTML and history pages, rebuild `reports/index.json`, then commit all generated state as one serialized Publisher-App transaction.

- [ ] **Step 6: Run checks and commit**

```text
feat(reports): publish immutable scan history
```

---

### Task 6: Unify Automatic Scan Workflows and Add Targeted Scans

**Files:**

- Create: `F:/git/TavernKeeper/.github/workflows/scan-and-publish.yml`
- Create: `F:/git/TavernKeeper/.github/workflows/targeted-scan.yml`
- Modify: `F:/git/TavernKeeper/.github/workflows/reconcile.yml`
- Modify: `F:/git/TavernKeeper/.github/workflows/deep-scan.yml`
- Modify: `F:/git/TavernKeeper/.github/workflows/policy-rescan.yml`
- Modify: `F:/git/TavernKeeper/.github/workflows/retry.yml`
- Modify: `F:/git/TavernKeeper/.github/workflows/deploy-pages.yml`
- Create: `F:/git/TavernKeeper/src/cli/targeted-scan.ts`
- Create: `F:/git/TavernKeeper/src/publish/encrypted-transport.ts`
- Modify: `F:/git/TavernKeeper/src/queue/backlog.ts`
- Modify: `F:/git/TavernKeeper/src/operations/state.ts`
- Modify: `F:/git/TavernKeeper/src/cli/reconcile.ts`
- Modify: `F:/git/TavernKeeper/src/cli/staff-request.ts`
- Modify: `F:/git/TavernKeeper/scripts/check-workflow-policy.mjs`
- Modify: `F:/git/TavernKeeper/docs/operations.md`
- Modify: `F:/git/TavernKeeper/tests/backlog.test.ts`
- Modify: `F:/git/TavernKeeper/tests/operations-state.test.ts`
- Modify: `F:/git/TavernKeeper/tests/workflows.test.ts`
- Create: `F:/git/TavernKeeper/tests/encrypted-transport.test.ts`

**Interfaces:**

- Consumes: repository-ID routing hint plus the live Tavernary V2 manifest.
- Produces: one reusable automatic scan/publish workflow used by ordinary, retry, targeted standard, deep, and policy-rescan entry points.

- [ ] **Step 1: Write failing priority-lane tests**

Seed `coverage_started_at` and assert this exact order:

```ts
expect(plan.targets.map(({ lane, target }) => [lane, target.repository_id])).toEqual([
  ["top-30", 30],
  ["new-submission", 44],
  ["old-project", 2],
]);
expect(plan.targets).toHaveLength(5);
```

Assert old projects sort by `first_cataloged_at`, arrivals sort within the new lane, retries return to their source lane, age boosting prevents starvation, and `max-parallel` remains two.

- [ ] **Step 2: Write failing targeted-authority tests**

Assert `targeted-scan.yml` accepts only `repository_id`, checks `github.actor_id` against `vars.TAVERNARY_WAKE_APP_BOT_ID`, refetches the public manifest, and rejects IDs/names/SHAs not present there. It must not accept URL, branch, SHA, model, mode, priority, budget, or clone URL inputs.

- [ ] **Step 3: Write failing encrypted-transport tests**

Round-trip candidate/transition JSON with authenticated encryption, reject wrong keys/tampering, and assert uploaded artifacts contain ciphertext only. The encryption key is `TAVERNKEEPER_ARTIFACT_KEY` in the unattended scanner environment and never appears in an output or artifact.

- [ ] **Step 4: Run queue/workflow tests and verify RED**

```powershell
npm --prefix F:\git\TavernKeeper test -- tests/backlog.test.ts tests/operations-state.test.ts tests/workflows.test.ts tests/encrypted-transport.test.ts
```

- [ ] **Step 5: Implement the reusable production path**

`scan-and-publish.yml` performs prepare, configured-model review, finalize, encrypted transport, serialized schema/sanitizer validation, Publisher-App commit, Pages deployment, public-index verification, and Tavernary wake. It has no environment reviewer or approval job between a complete candidate and publication.

- [ ] **Step 6: Implement the targeted standard entry point**

`targeted-scan.yml` resolves the repository ID from the live manifest and calls the reusable path with `mode: standard`. It runs outside the paused ordinary backlog, coalesces an already active identical repository/SHA, and publishes a complete result automatically.

- [ ] **Step 7: Preserve exact SHA when the repository advances mid-scan**

Keep the pre-model freshness check for queued work. Once model review begins, finish and publish the exact scanned SHA even if Tavernary advances; freshness is Tavernary presentation logic, not a publisher rejection.

- [ ] **Step 8: Enforce retry/circuit behavior**

Repository failures continue unrelated work. Model auth/quota/provider-wide failure stops remaining work and engages the circuit breaker. Intermediate failures create no Issue; retry three failure creates one deduplicated TavernKeeper staff Issue.

- [ ] **Step 9: Run workflow and full TavernKeeper checks, then commit**

```powershell
npm --prefix F:\git\TavernKeeper run check
```

Commit:

```text
feat(workflows): automate targeted scan pipeline
```

---

### Task 7: Publish V2 Tavernary Targets and Resolve Staff URL Requests

**Files:**

- Modify: `F:/git/Tavernary/scripts/security/tavernkeeper-targets.mjs`
- Modify: `F:/git/Tavernary/scripts/security/tavernkeeper-targets.d.mts`
- Modify: `F:/git/Tavernary/scripts/catalog/build.mjs`
- Modify: `F:/git/Tavernary/scripts/verify-static-export.mjs`
- Create: `F:/git/Tavernary/config/tavernkeeper-contract.json`
- Create: `F:/git/Tavernary/scripts/security/resolve-tavernkeeper-scan-request.mjs`
- Create: `F:/git/Tavernary/scripts/security/resolve-tavernkeeper-scan-request.d.mts`
- Create: `F:/git/Tavernary/config/tavernkeeper-scan-operators.json`
- Create: `F:/git/Tavernary/.github/workflows/targeted-tavernkeeper-scan.yml`
- Modify: `F:/git/Tavernary/.github/workflows/deploy-pages.yml`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-targets.test.ts`
- Create: `F:/git/Tavernary/tests/unit/resolve-tavernkeeper-scan-request.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/workflows.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/static-export-verification.test.ts`

**Interfaces:**

- Consumes: active source registry, project registry, healthy snapshots, current popularity ordering, one workflow input `repository_url`, and `github.actor_id`.
- Produces: V2 target manifest plus a validated non-authoritative TavernKeeper dispatch containing only `repository_id`.

- [ ] **Step 1: Write failing V2 target-generation tests**

Assert GitHub-backed presets remain eligible and deduplicated repository entries contain:

```js
{
  project_kinds: ["extension", "preset"],
  catalog_priority: {
    top_30: true,
    first_cataloged_at: "2026-07-01T00:00:00.000Z",
  },
}
```

Derive kinds and oldest catalog date from every published card sharing the source. Mark `top_30` if any backed card is in the current popularity Top 30.

- [ ] **Step 2: Write failing URL/actor-resolution tests**

```js
expect(resolveScanRequest({
  repositoryUrl: "https://github.com/MentallyQuill/Recursion",
  actorId: approvedId,
  sources,
  projects,
})).toEqual({
  sourceId: recursionSource.id,
  repositoryId: recursionSource.repository_id,
  repositoryUrl: "https://github.com/MentallyQuill/Recursion",
});
```

Reject query strings, fragments, `.git`, non-GitHub hosts, redirects, case-mismatched noncanonical URLs, unlisted repositories, unsupported sources, unpublished sources, and actors absent from the numeric-ID allowlist.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
npm --prefix F:\git\Tavernary test -- tests/unit/tavernkeeper-targets.test.ts tests/unit/resolve-tavernkeeper-scan-request.test.ts tests/unit/workflows.test.ts
```

- [ ] **Step 4: Implement the target producer and resolver**

Expose:

```ts
export function resolveScanRequest(input: {
  repositoryUrl: string;
  actorId: number;
  operators: readonly number[];
  sources: readonly SourceRecord[];
  projects: readonly ProjectRecord[];
}): { sourceId: string; repositoryId: number; repositoryUrl: string };
```

The target builder accepts an explicit tracked contract version from
`config/tavernkeeper-contract.json`. It can emit the frozen V1 shape during the
consumer-first rollout or strict V2 after the flip; it never emits a hybrid.
The resolver derives identity from tracked Tavernary data and never passes the
user URL downstream.

- [ ] **Step 5: Implement the staff-only targeted Action**

The workflow:

1. validates `github.actor_id` and the exact URL;
2. dispatches `refresh-catalog.yml` in `project` mode for the resolved source;
3. waits for that refresh and any resulting deployment;
4. checks out the resulting Tavernary `main` SHA;
5. reads the healthy refreshed snapshot SHA;
6. polls the public V2 manifest until repository ID/name/SHA match;
7. creates the destination-only wake App token; and
8. dispatches TavernKeeper `targeted-scan.yml` with only `repository_id`.

- [ ] **Step 6: Prove spend-abuse boundaries**

Workflow-policy tests require Actions write plus the numeric-ID allowlist, forbid public event triggers, forbid requester-provided scan options, and pin every third-party Action to a full commit SHA.

- [ ] **Step 7: Run focused/full checks and commit**

```text
feat(security): add staff-targeted repository scans
```

---

### Task 8: Import V2 History and Derive Tavernary Presentation State

**Files:**

- Modify: `F:/git/Tavernary/scripts/security/tavernkeeper-reports.mjs`
- Modify: `F:/git/Tavernary/scripts/security/tavernkeeper-reports.d.mts`
- Modify: `F:/git/Tavernary/scripts/security/import-tavernkeeper-reports.mjs`
- Modify: `F:/git/Tavernary/data/security/tavernkeeper-report-summaries.json`
- Modify: `F:/git/Tavernary/src/features/catalog/tavernkeeper-status.ts`
- Modify: `F:/git/Tavernary/src/features/catalog/catalog-types.ts`
- Modify: `F:/git/Tavernary/scripts/catalog/build.mjs`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-reports.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-status.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/build-catalog.test.ts`

**Interfaces:**

- Consumes: validated V2 preferred entries for all SHAs.
- Produces: `TavernKeeperCardStatus` with teal/orange/red/gray/unsupported state, current/older report, and at most twelve recent conclusions.

- [ ] **Step 1: Write failing state-table tests**

Assert this exact derivation order:

```ts
expect(stateOf(unsupported)).toMatchObject({ state: "unsupported" });
expect(stateOf(currentTeal)).toMatchObject({ state: "teal", reason: "current" });
expect(stateOf(currentRed)).toMatchObject({ state: "red", reason: "current" });
expect(stateOf(staleRed)).toMatchObject({ state: "red", reason: "outdated-concern" });
expect(stateOf(staleTeal)).toMatchObject({ state: "orange", reason: "outdated-clean" });
expect(stateOf(unscanned)).toMatchObject({ state: "gray", reason: "unscanned" });
expect(stateOf(unavailablePriorRed)).toMatchObject({ state: "red", reason: "source-unavailable" });
expect(stateOf(unavailablePriorTeal)).toMatchObject({ state: "gray", reason: "source-unavailable" });
```

- [ ] **Step 2: Write failing history-selection tests**

Select the newest twelve preferred conclusions, order oldest-left/newest-right, retain old red conclusions, exclude superseded duplicates from the compact strip, and keep the full history URL.

- [ ] **Step 3: Run focused tests and verify RED**

```powershell
npm --prefix F:\git\Tavernary test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-status.test.ts tests/unit/build-catalog.test.ts
```

- [ ] **Step 4: Implement strict import and local derivation**

```ts
export type TavernKeeperVisualState =
  | "teal"
  | "orange"
  | "red"
  | "gray"
  | "unsupported";
```

Match repository ID first, then source ID and canonical full name. Derive current SHA only from a healthy Tavernary snapshot. Never trust a remote freshness/color claim. Preserve the prior valid import if fetch or validation fails.

- [ ] **Step 5: Run checks and commit**

```text
feat(catalog): derive TavernKeeper scan history
```

---

### Task 9: Finish the Scan Icon, Concise Popover, and History Strip

**Files:**

- Modify: `F:/git/Tavernary/src/components/icons/tavernkeeper-scan-icon.tsx`
- Modify: `F:/git/Tavernary/src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Create: `F:/git/Tavernary/src/features/catalog/components/tavernkeeper-history-strip.tsx`
- Modify: `F:/git/Tavernary/src/features/catalog/components/project-card.tsx`
- Modify: `F:/git/Tavernary/src/styles/catalog.css`
- Modify: `F:/git/Tavernary/src/styles/tokens.css`
- Modify: `F:/git/Tavernary/tests/unit/tavernkeeper-scan-indicator.test.tsx`
- Modify: `F:/git/Tavernary/tests/unit/project-card.test.tsx`
- Modify: `F:/git/Tavernary/tests/e2e/catalog.spec.ts`
- Modify: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-desktop-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-desktop-ellipsized-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-compact-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-compact-ellipsized-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-phone-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-indicator-phone-ellipsized-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-desktop-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-desktop-ellipsized-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-compact-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-compact-ellipsized-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-phone-short-win32.png`
- Replace: `F:/git/Tavernary/tests/visual/catalog.visual.spec.ts-snapshots/scan-popover-phone-ellipsized-win32.png`

**Interfaces:**

- Consumes: `TavernKeeperCardStatus` from Task 8.
- Produces: inline `scan-fill` button immediately after the title's final visible character and an accessible non-modal popover headed `TavernKeeper Scan Results`.

- [ ] **Step 1: Write failing copy and content tests**

Use these exact state sentences:

```ts
const copy = {
  teal: "No review-level concerns found at this commit.",
  red: "TavernKeeper found review-level concerns.",
  orange:
    "The last completed scan found no review-level concerns, but it does not cover the repository's current commit. An updated scan is pending.",
  unscanned: "This project hasn't been scanned by TavernKeeper.",
  unsupported:
    "TavernKeeper scanning is not supported for this project's source.",
} as const;
```

The heading is exactly `TavernKeeper Scan Results`. Only red shows nonzero confirmed critical/high/medium counts. Never render `safe`, `trusted`, `verified`, `protected`, or `certified`.

- [ ] **Step 2: Write failing history and interaction tests**

Assert at most twelve blocks, accessible labels with result/date/short SHA/policy, oldest-left/newest-right, red history preserved, and both `View full report` and `View full scan history` links. Prove hover, focus, touch, Escape, outside click, focus transfer through both links, one-open-at-a-time behavior, viewport collision, and reduced motion.

- [ ] **Step 3: Write failing placement tests**

Assert `data-icon="scan-fill"`, the title ellipsizes before the icon, the icon follows the final visible title character, and whole-card repository navigation contains no nested button/link.

- [ ] **Step 4: Run focused component/browser tests and verify RED**

```powershell
npm --prefix F:\git\Tavernary test -- tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/project-card.test.tsx
npm --prefix F:\git\Tavernary run test:scan-e2e
```

- [ ] **Step 5: Implement the five visual states**

Use Tavernary theme tokens: teal for current clean, orange for outdated clean, red for concern, gray for eligible unscanned/unavailable, and a perceptible super-dark teal for unsupported. Color is never the only signal; every trigger has `aria-label="TavernKeeper scan: ..."`.

- [ ] **Step 6: Implement the compact history strip**

Each block represents one scan, not one week. Historical blocks use teal/red only. Reuse the twelve-week activity strip's compact geometry without reusing week-bucket semantics.

- [ ] **Step 7: Update visual baselines after direct inspection**

Run desktop, compact, and phone cases for short and ellipsized titles. Inspect each image before accepting it; verify icon alignment, popover collision, legibility of dark-teal unsupported state, and history-strip density.

- [ ] **Step 8: Run focused/full checks and commit**

```text
feat(catalog): show TavernKeeper scan progression
```

---

### Task 10: Prove Opaque GitHub Installation Tokens

**Files:**

- Create temporarily: `F:/git/Tavernary/.github/workflows/tavernkeeper-token-compat.yml`
- Create temporarily: `F:/git/Tavernary/.github/workflows/tavernkeeper-token-compat-receiver.yml`
- Create temporarily: `F:/git/TavernKeeper/.github/workflows/token-compat.yml`
- Create temporarily: `F:/git/TavernKeeper/.github/workflows/token-compat-receiver.yml`
- Create: `F:/git/Tavernary/tests/unit/tavernkeeper-token-policy.test.ts`
- Create: `F:/git/TavernKeeper/tests/token-policy.test.ts`
- Modify: `F:/git/Tavernary/tests/unit/workflows.test.ts`
- Modify: `F:/git/TavernKeeper/tests/workflows.test.ts`

**Interfaces:**

- Consumes: both wake App credentials and TavernKeeper Publisher App credentials.
- Produces: live proof that classic and approximately 520-character stateless installation tokens work with wake and Publisher consumers; production contains no override header.

- [ ] **Step 1: Add failing opaque-token policy tests**

Use synthetic tokens over 600 characters and assert masking/passing without prefix or length validation. Search production code/workflows for `ghs_`, token-length regexes, JWT decoding, and substring truncation.

- [ ] **Step 2: Add temporary compatibility workflows**

Mint tokens directly through GitHub's installation-token endpoint with each header:

```text
X-GitHub-Stateless-S2S-Token: enabled
X-GitHub-Stateless-S2S-Token: disabled
```

Immediately mask each token. Use wake tokens to dispatch the opposite
repository's no-op receiver workflow. Exercise Publisher tokens through the
same `GH_TOKEN` plus `gh auth setup-git` credential path as report publication,
then run `git push --dry-run origin HEAD:main` so the long token reaches GitHub
without changing repository contents.

- [ ] **Step 3: Run both live formats for all three Apps**

Capture only run IDs, conclusions, actor IDs, and format labels. Never print token values or lengths.

- [ ] **Step 4: Remove temporary override workflows**

Delete both compatibility workflow files after evidence is captured. Keep unit/workflow policy tests that enforce opaque handling and forbid the override header in production.

- [ ] **Step 5: Run checks and commit permanent tests**

Commit messages:

```text
test(security): enforce opaque app tokens
test(auth): enforce opaque app tokens
```

---

### Task 11: Run the Ordered Cross-Repository Contract Migration

**Files:**

- No planned source changes. If a release gate fails, stop this task and add a
  focused RED/GREEN correction step to the owning earlier task before retrying
  migration.

**Interfaces:**

- Consumes: passing feature branches in both repositories.
- Produces: Tavernary and TavernKeeper default branches/Pages deployments on compatible V2 code without a broken intermediate contract.

- [ ] **Step 1: Run complete local gates**

```powershell
npm --prefix F:\git\TavernKeeper run check
npm --prefix F:\git\Tavernary run check
```

Expected: all unit, integration, workflow, build, static-export, and Playwright policy gates pass.

- [ ] **Step 2: Deploy Tavernary's V2 report consumer while retaining the V1 target producer**

Push/merge the importer/status/UI consumer slice first. Watch every workflow for its exact SHA and prove Tavernary.org still hydrates with the existing empty V1 index.

- [ ] **Step 3: Deploy TavernKeeper's V1/V2 target consumer and V2 producer**

Keep ordinary scanning paused. Merge/push TavernKeeper, watch CI and Pages, and verify the public V2 empty index digest plus the absence of any degraded or legacy report.

- [ ] **Step 4: Flip Tavernary's public target producer to V2**

Deploy the exact source SHA, verify `https://tavernary.org/security/tavernkeeper-targets.json` against the built digest, and confirm TavernKeeper's scheduled/input-free reconciliation accepts it while paused.

- [ ] **Step 5: Prove both wake directions and six-hour fallbacks**

Capture run IDs for Tavernary-to-TavernKeeper wake, TavernKeeper-to-Tavernary wake, and both scheduled recovery paths. A missed best-effort wake must be repairable by reconciliation without changing authoritative data.

---

### Task 12: Run Real Model-Backed Recursion and Wandlight Scans End to End

**Files:**

- Record: `F:/git/Tavernary/docs/tavernkeeper-live-acceptance.md`

No source modification is part of acceptance. If live evidence exposes a
defect, return to the owning implementation task, reproduce it with a failing
test, commit the correction, rerun both complete gates, and restart acceptance
from Step 1.

**Interfaces:**

- Consumes: production Tavernary targeted Action, live V2 manifest, production TavernKeeper scanner/provider credentials, public Pages sites.
- Produces: two fully automated public scan reports, Tavernary imports, deployed card states, compact history, and end-to-end evidence.

- [ ] **Step 1: Run a development preflight without publication**

Use Recursion through the same scanners/model roles with publication disabled only for this development canary. Inspect sanitized evidence for parser, redaction, false-positive, and report-format defects. Fix global code/policy defects; do not add repository-specific suppressions.

- [ ] **Step 2: Trigger the production Recursion scan from Tavernary**

Run `targeted-tavernkeeper-scan.yml` with:

```text
https://github.com/MentallyQuill/Recursion
```

Watch the targeted refresh, public V2 target, TavernKeeper scan, three model roles, automatic Publisher commit, TavernKeeper Pages, Tavernary wake/import, Tavernary Pages deployment, and exact card hydration.

- [ ] **Step 3: Verify Recursion's immutable evidence**

Confirm repository ID/name, exact scanned SHA, policy/model IDs, all required scanner coverage, analyzer/challenger/arbiter completion, mechanical result, sanitized report, history URL, public index identity, and no raw secret/source excerpt.

- [ ] **Step 4: Visually inspect Tavernary.org for Recursion**

At desktop and phone widths, inspect the live card, inline scan icon, long-title reservation if applicable, hover/focus/touch popover, exact copy, report/history links, state color, keyboard path, and compact history strip.

- [ ] **Step 5: Repeat the complete production path for Wandlight**

Use:

```text
https://github.com/MentallyQuill/Wandlight
```

The workflow and code contain no hardcoded allowlist for either canary.

- [ ] **Step 6: Prove SHA drift behavior**

Against a controlled fixture or a naturally advanced canary, prove that an in-progress report publishes for its exact scanned SHA, stale teal renders orange, stale red remains red, and a forced newer targeted scan replaces current presentation without erasing history.

- [ ] **Step 7: Record exact acceptance evidence**

Document source commits, workflow run IDs, Pages deployment IDs, public report IDs/URLs, scanned SHAs, Tavernary deployed SHA, screenshots inspected, and every release-gate result without recording secrets or raw source excerpts.

---

### Task 13: Enable the Ordinary Backlog and Complete the Final Audit

**Files:**

- Modify: `F:/git/TavernKeeper/operations/state.json`
- Modify: `F:/git/TavernKeeper/docs/operations.md`
- Modify: `F:/git/Tavernary/docs/tavernkeeper-live-acceptance.md`

**Interfaces:**

- Consumes: successful Recursion/Wandlight production acceptance.
- Produces: active automated Top-30/new/old coverage and requirement-by-requirement completion proof.

- [ ] **Step 1: Prove synthetic five-repository batching before live activation**

Run fixtures with more than ten repositories and assert batches never exceed five, concurrent scan jobs never exceed two, duplicate repository/SHA requests coalesce, continuations drain remaining work, and a large repository receives more chunks rather than degraded coverage.

- [ ] **Step 2: Enable the ordinary backlog**

Record `coverage_started_at`, clear only the approved initial rollout pause through the staff operation, and let the derived queue select every eligible GitHub source using the three priority lanes. Do not add a repository allowlist or 20-MB eligibility gate.

- [ ] **Step 3: Verify the first live ordinary batch**

Confirm no more than five selected targets, no more than two simultaneous scans, exact-SHA acquisition, normal retries, automatic publication, Tavernary import, and preserved public state for any incomplete repository.

- [ ] **Step 4: Audit every explicit requirement**

Build a table mapping each approved design section and each task above to authoritative evidence: source path, test name, GitHub check/run, exact deployment SHA, public contract/report, and hydrated UI behavior. Treat missing or indirect evidence as incomplete and continue work until every row is proven.

- [ ] **Step 5: Confirm clean integration state**

Verify both default branches match their remotes, no required feature PR remains open, no production workflow contains a human report gate or token override header, all public contracts validate, all live links work, and unrelated user-owned worktrees/files remain preserved.

- [ ] **Step 6: Mark the overall goal complete only after the audit passes**

The final handoff must separately report Tavernary source/deployment SHA, TavernKeeper source/deployment SHA, workflow evidence, live scanned SHAs/report URLs, UI/visual evidence, and any operational monitoring that remains routine rather than incomplete development.
