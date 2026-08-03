# TavernKeeper Contextual Assessment V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scanner-only grading with exact-SHA deterministic evidence, TavernKeeper file-centered contextual review, and Tavernary Luna synthesis while resetting the invalid Recursion and Wandlight reports.

**Architecture:** TavernKeeper retains its isolated scanner and publisher pipeline but restores the hardened OpenAI-compatible client, builds one context group per flagged file, validates one assessment per candidate, and publishes V5 technical reports. Tavernary imports complete V5 reports, synthesizes a strict project-level assessment through its existing model-provider boundary, enforces deterministic evidence floors, and publishes only a compact card projection. The rollout resets the two invalid V4 canaries first, then deploys the V5 reader before the V5 writer and proves both projects end to end.

**Tech Stack:** Node.js 24, TypeScript 6, Zod 4, Vitest 4, AJV, OpenAI-compatible Chat Completions, NanoGPT, DeepSeek V4 Flash, GPT-5.6 Luna, GitHub Actions, GitHub Pages, React 19, Next.js 16

## Global Constraints

- Production is fully automated; there is no staff dismissal, recoloring, or publication gate.
- Deterministic scanners locate candidates and preserve evidence but do not assign the final project risk.
- Every deterministic candidate receives one validated contextual assessment before V5 publication.
- The initial TavernKeeper model is configured as `deepseek/deepseek-v4-flash-0731:thinking`; code and contracts remain model-agnostic.
- Tavernary uses its configured strict-JSON Luna provider for repository synthesis and validates an evidence floor after the response.
- `risk_level` is `low`, `material`, or `high`, rendered teal, orange, or red. Freshness is separate.
- Gray means eligible but not assessed. Super-dark teal means unsupported.
- Report/index V5 is the only accepted report contract. Target Manifest V2 remains unchanged.
- No target code, dependency, package script, build, Action, binary, macro, or container executes.
- No raw secret, hidden model reasoning, raw provider response, or untrusted scanner prose is published.
- Missing coverage, context, assessment, citation, schema validity, or publication produces no degraded result.
- An initial failure receives delayed retries at T+1, T+2, and T+3 hours before TavernKeeper staff notification.
- Batches contain at most five repositories; ordinary backlog scanning remains paused through canary acceptance.
- Do not modify the user's dirty Tavernary `main` worktree. Use isolated branches/worktrees in both repositories.

---

### Task 1: Remove the invalid public canaries

**Files:**

- Modify: TavernKeeper `reports/index.json`
- Delete: TavernKeeper `reports/github/1254077407/**`
- Delete: TavernKeeper `reports/github/1285208664/**`
- Modify: Tavernary `data/security/tavernkeeper-report-summaries.json`
- Test: TavernKeeper `tests/site-build.test.ts`
- Test: TavernKeeper `tests/publisher.test.ts`
- Test: Tavernary `tests/unit/tavernkeeper-reports.test.ts`
- Test: Tavernary `tests/unit/tavernkeeper-status.test.ts`

**Interfaces:**

- Consumes: current V4 public index and Tavernary tracked summary.
- Produces: an empty current public report set and gray `unscanned` card states for Recursion and Wandlight.

- [ ] **Step 1: Add failing reset assertions**

Add tests that load the tracked files and assert the invalid repository IDs and SHAs are absent:

```ts
expect(JSON.stringify(index)).not.toContain("1254077407");
expect(JSON.stringify(index)).not.toContain("1285208664");
expect(JSON.stringify(index)).not.toContain(
  "1bce1fa73fe6c0fe8e767c773a832b94bb336720",
);
expect(JSON.stringify(index)).not.toContain(
  "2d4f818c2ad5855b0faff387d88c3f64479865c6",
);
```

For active GitHub sources with healthy SHAs and no report, assert:

```ts
expect(status).toMatchObject({ state: "gray", reason: "unscanned" });
```

- [ ] **Step 2: Run focused tests and observe the existing reports fail them**

Run in TavernKeeper:

```powershell
npm.cmd test -- tests/site-build.test.ts tests/publisher.test.ts
```

Run in Tavernary:

```powershell
npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-status.test.ts
```

Expected: FAIL because the two V4 reports are still tracked.

- [ ] **Step 3: Remove the current reports and reset Tavernary**

Delete both report/history trees, set TavernKeeper's current index to:

```json
{
  "schema_version": 4,
  "generated_at": "2026-08-02T00:00:00.000Z",
  "reports": []
}
```

Set Tavernary's tracked summary to the same empty V4 envelope during the reset interval. Do not edit Git history or Actions logs.

- [ ] **Step 4: Run focused and static-export tests**

Run TavernKeeper focused tests plus `npm.cmd run site:build`. Run Tavernary focused tests plus `npm.cmd run catalog:build` and `npm.cmd run verify:export`.

Expected: PASS, with no public/report bundle reference to either invalid SHA.

- [ ] **Step 5: Commit and deploy the reset in producer-then-consumer order**

Commit TavernKeeper:

```text
fix(reports): remove invalid canary scans
```

Commit Tavernary:

```text
fix(security): reset invalid scan summaries
```

Merge TavernKeeper first so scheduled V4 import sees an empty valid index, then merge Tavernary. Verify both live cards show `Not assessed` before continuing.

---

### Task 2: Add TavernKeeper contextual-review contracts and evidence contexts

**Files:**

- Restore/adapt from commit `0abcab4`: TavernKeeper `src/model/openai-compatible-client.ts`
- Restore/adapt from commit `0abcab4`: TavernKeeper `src/model/redaction.ts`
- Create: TavernKeeper `src/context/ecosystem-context.ts`
- Create: TavernKeeper `src/context/evidence-context.ts`
- Create: TavernKeeper `src/model/contextual-review-contract.ts`
- Create: TavernKeeper `tests/evidence-context.test.ts`
- Create: TavernKeeper `tests/contextual-review-contract.test.ts`
- Restore/adapt: TavernKeeper `tests/model-review.test.ts`
- Modify: TavernKeeper `src/scanners/static-rules.ts`
- Modify: TavernKeeper `tests/static-rules.test.ts`

**Interfaces:**

- Consumes: normalized `Finding[]`, inventory classification, exact checkout root, target identity, and configured provider settings.
- Produces: `buildEvidenceContextGroups(spec): Promise<EvidenceContextGroup[]>`, `ContextualAssessmentSchema`, `ContextualReviewResponseSchema`, and `requestTextCompletion`.

- [ ] **Step 1: Write failing contract tests**

Require one strict assessment per candidate:

```ts
const assessment = ContextualAssessmentSchema.parse({
  candidate_id: "candidate-000001",
  evidence_ids: ["evidence-000001"],
  disposition: "expected_behavior",
  impact: "none",
  exploitability: "unlikely",
  confidence: "high",
  recommended_risk: "low",
  technical_explanation: "The request sends user-selected lore text to the configured model endpoint.",
  layman_explanation: "This is the extension's expected model request.",
  developer_action: "none",
  locations: [{ path: "src/client.ts", line_start: 20, line_end: 25 }],
});
```

Reject unknown fields, duplicate candidate IDs, missing candidates, invalid line ranges, uncited paths, unsafe text, and `needs_more_context` inside a completed response.

- [ ] **Step 2: Write failing evidence-context tests**

Fixtures must prove that one group contains all findings for one file plus:

```ts
expect(group).toMatchObject({
  path: "src/client.ts",
  file_role: "production",
  target_sha: target.target_sha,
  ecosystem_context_version: "sillytavern-community-v1",
});
expect(group.candidates).toHaveLength(2);
expect(group.context.source).toContain("async function sendRequest");
expect(group.context.imports).toContain('import { getToken } from "./settings";');
```

Add historical-evidence, test-fixture, same-file grouping, source redaction, coherent scope splitting, and prompt-injection fixtures.

- [ ] **Step 3: Restore the hardened provider client**

Restore only the endpoint validation, DNS/redirect hardening, Bearer authentication, response bounds, beta thinking-response compatibility, usage accounting, and plain-text/JSON parsing required by this design. Do not restore the former whole-repository reviewer, cache, analyzer/challenger roles, or old report contracts.

- [ ] **Step 4: Implement ecosystem and evidence context**

Export:

```ts
export const ECOSYSTEM_CONTEXT_VERSION = "sillytavern-community-v1";
export function ecosystemContext(): string;

export async function buildEvidenceContextGroups(spec: {
  checkoutRoot: string;
  target: Target;
  findings: Finding[];
  inventory: Inventory;
  projectKinds: string[];
}): Promise<EvidenceContextGroup[]>;
```

Sort by portable path and candidate fingerprint. Use enclosing functions/classes, imports, nearby constants, direct source/sink context, bounded README/manifest purpose, and role classification. Redact secret values before serialization.

- [ ] **Step 5: Repair known deterministic false-positive classes**

Change startup rules to match actual normalized startup paths, dynamic execution to require recognized process/shell APIs, and credential transmission to require a plausible sensitive source and sink relation. Preserve these as candidate rules rather than final severities.

- [ ] **Step 6: Run focused tests**

```powershell
npm.cmd test -- tests/static-rules.test.ts tests/evidence-context.test.ts tests/contextual-review-contract.test.ts tests/model-review.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```text
feat(review): build contextual evidence groups
```

---

### Task 3: Run and validate per-file contextual review

**Files:**

- Create: TavernKeeper `src/model/contextual-review.ts`
- Create: TavernKeeper `src/model/contextual-prompt.ts`
- Create: TavernKeeper `src/model/review-coverage.ts`
- Create: TavernKeeper `tests/contextual-review.test.ts`
- Create: TavernKeeper `tests/contextual-prompt.test.ts`
- Modify: TavernKeeper `src/config/policy.ts`
- Create: TavernKeeper `config/contextual-review.v1.json`
- Modify: TavernKeeper `tests/policy.test.ts`

**Interfaces:**

- Consumes: `EvidenceContextGroup[]`, provider configuration, and versioned context/prompt policy.
- Produces: `reviewEvidenceGroups(spec): Promise<CompletedContextualReview>` with exactly one assessment per candidate and validated related observations.

- [ ] **Step 1: Write failing orchestration tests**

For two file groups, assert two model calls and complete coverage:

```ts
expect(calls).toHaveLength(2);
expect(result.coverage).toEqual({ required: 3, completed: 3 });
expect(result.assessments.map((item) => item.candidate_id)).toEqual([
  "candidate-000001",
  "candidate-000002",
  "candidate-000003",
]);
```

Test valid fenced JSON, plain JSON, content-part arrays, beta thinking envelopes, `needs_more_context`, malformed JSON, unknown evidence, duplicate assessments, missing assessments, provider mismatch, quota failure, and secret-shaped output.

- [ ] **Step 2: Write prompt-authority tests**

Assert the system prompt contains the versioned ecosystem context, allowed dispositions, output schema, and the rule that repository content is untrusted data. Assert README/source prompt injection appears only inside the delimited user-data payload and cannot change the schema.

- [ ] **Step 3: Implement file-group review**

Export:

```ts
export async function reviewEvidenceGroups(spec: {
  groups: EvidenceContextGroup[];
  provider: ContextualReviewProvider;
  policy: ContextualReviewPolicy;
}): Promise<CompletedContextualReview>;
```

Request one JSON object per group without requiring provider-native strict JSON. Extract at most one object, validate locally, and bind every citation to supplied evidence. On `needs_more_context`, call the context expander and retry that group. Never coerce an unresolved result to low risk.

- [ ] **Step 4: Implement bounded retries and stable diagnostics**

Malformed or context-incomplete repository responses receive bounded immediate retries inside the scan. Authentication, quota, endpoint, and systemic failures return a sanitized classified error to the existing delayed retry/circuit-breaker layer. The configured model never silently changes within one report.

- [ ] **Step 5: Run focused tests**

```powershell
npm.cmd test -- tests/contextual-review.test.ts tests/contextual-prompt.test.ts tests/policy.test.ts tests/model-review.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat(review): assess every scanner candidate
```

---

### Task 4: Replace TavernKeeper V4 with Technical Report V5

**Files:**

- Rewrite: TavernKeeper `src/contracts/reports.ts`
- Modify: TavernKeeper `src/contracts/scan-package.ts`
- Replace: TavernKeeper `src/report/deterministic-report.ts` with `src/report/contextual-report.ts`
- Modify: TavernKeeper `src/publish/sanitize.ts`
- Modify: TavernKeeper `src/publish/report-path.ts`
- Modify: TavernKeeper `src/publish/publisher.ts`
- Modify: TavernKeeper `src/publish/render-report.ts`
- Modify: TavernKeeper `src/publish/render-history.ts`
- Modify: TavernKeeper `src/site/build-site.ts`
- Modify: TavernKeeper `scripts/generate-contract-schemas.ts`
- Create: TavernKeeper `schemas/scan-report.v5.schema.json`
- Create: TavernKeeper `schemas/report-index.v5.schema.json`
- Replace: TavernKeeper `tests/fixtures/contracts/report.v4.valid.json` with `report.v5.valid.json`
- Replace: TavernKeeper `tests/fixtures/contracts/index.v4.valid.json` with `index.v5.valid.json`
- Modify: TavernKeeper `tests/contracts.test.ts`
- Modify: TavernKeeper `tests/report-render.test.ts`
- Modify: TavernKeeper `tests/publisher.test.ts`
- Modify: TavernKeeper `tests/report-path.test.ts`
- Modify: TavernKeeper `tests/history-render.test.ts`

**Interfaces:**

- Consumes: complete scan package and `CompletedContextualReview`.
- Produces: `ScanReportV5Schema`, `ReportIndexV5Schema`, `buildContextualReport`, immutable V5 JSON/HTML, and compact preferred index entries.

- [ ] **Step 1: Write failing V5 contract tests**

Require:

```ts
expect(report).toMatchObject({
  schema_version: 5,
  assessment_method: "deterministic-evidence-contextual-review",
  ecosystem_context_version: "sillytavern-community-v1",
  review_coverage: { required: report.candidates.length, completed: report.candidates.length },
});
```

Assert all candidate IDs are unique, all assessments map one-to-one, all evidence and locations exist, counts are internally consistent, provider/model identifiers are bounded, and raw secrets/model responses are rejected.

- [ ] **Step 2: Implement V5 schemas and report builder**

Remove V4 result, reportable threshold, and deterministic summary from the active contract. Preserve scanner severity as evidence. Add counts for disposition, impact, exploitability, confidence, and recommended item risk. The V5 index contains identity, versions, digest, counts, and report/history URLs but not a final Tavernary color.

- [ ] **Step 3: Change immutable report paths**

Use:

```ts
`reports/github/${repositoryId}/${targetSha}/${scannerPolicyVersion}/${reportId}/`
```

Require the URL and digest to match the exact report object.

- [ ] **Step 4: Render the approachable technical report**

Render material/high assessments first, then minor cautions, then a collapsed expected-match section. Each article shows layman's explanation, scanner reason, technical assessment, effect, developer action, exact GitHub line link, and scanner metadata. Keep the document script-free with the existing restrictive CSP.

- [ ] **Step 5: Generate and verify V5 JSON schemas**

```powershell
npm.cmd run contracts:generate
npm.cmd test -- tests/contracts.test.ts tests/report-render.test.ts tests/publisher.test.ts tests/report-path.test.ts tests/history-render.test.ts
```

Expected: PASS and no V4 schema accepted by the active parser.

- [ ] **Step 6: Commit**

```text
feat(reports): publish contextual V5 evidence
```

---

### Task 5: Integrate contextual review into TavernKeeper workflows

**Files:**

- Modify: TavernKeeper `src/orchestrator/session.ts`
- Modify: TavernKeeper `src/orchestrator/scan-handler.ts`
- Modify: TavernKeeper `src/cli/prepare-target.ts`
- Create: TavernKeeper `src/cli/review-target.ts`
- Modify: TavernKeeper `src/cli/finalize-target.ts`
- Modify: TavernKeeper `src/cli/transition.ts`
- Modify: TavernKeeper `src/cli/transition-result.ts`
- Modify: TavernKeeper `src/operations/telemetry.ts`
- Modify: TavernKeeper `.github/workflows/scan-and-publish.yml`
- Restore/adapt: TavernKeeper `.github/workflows/provider-check.yml`
- Restore/adapt: TavernKeeper `src/model/provider-check.ts`
- Restore/adapt: TavernKeeper `src/cli/provider-check.ts`
- Modify: TavernKeeper `package.json`
- Modify: TavernKeeper `scripts/check-workflow-policy.mjs`
- Modify: TavernKeeper `tests/scan-session.test.ts`
- Modify: TavernKeeper `tests/scan-atomicity.test.ts`
- Modify: TavernKeeper `tests/workflows.test.ts`
- Restore/adapt: TavernKeeper `tests/provider-compatibility.test.ts`

**Interfaces:**

- Consumes: Task 2-4 context/review/report modules and existing encrypted publisher transport.
- Produces: prepare -> review -> finalize workflow separation in which provider secrets exist only in the review step.

- [ ] **Step 1: Write failing session and workflow tests**

Require `prepare-target` to emit a source-free session manifest plus local evidence-context files, `review-target` to emit validated assessments, and `finalize-target` to reject any missing candidate. Assert the model key is present only in the review and provider-check steps.

- [ ] **Step 2: Implement the three-phase scan**

Preparation performs exact checkout, inventory, scanners, normalization, and context construction. Review calls the configured provider and writes only the validated assessment envelope. Finalization rechecks exact HEAD, joins the scan package and review, builds V5, sanitizes it, and creates the encrypted candidate.

- [ ] **Step 3: Configure the review environment**

Use protected `tavernkeeper-scanner` secrets:

```yaml
TAVERNKEEPER_API_ENDPOINT: ${{ secrets.TAVERNKEEPER_API_ENDPOINT }}
TAVERNKEEPER_API_KEY: ${{ secrets.TAVERNKEEPER_API_KEY }}
TAVERNKEEPER_MODEL: ${{ secrets.TAVERNKEEPER_MODEL }}
```

Authenticate with `Authorization: Bearer <key>` and accept the already configured chat-completions endpoint. No output or summary contains secret values.

- [ ] **Step 4: Restore the provider check**

The protected provider-check action performs one benign contextual-review request against the configured model and validates the local response schema. It must not publish a report or change operational state.

- [ ] **Step 5: Preserve retries, pause, batching, and atomic publication**

Keep initial staff pause, five-repository batches, bounded repository concurrency, encrypted handoff, Publisher App writes, T+1/T+2/T+3 delayed retries, and system circuit breaker. Model quota/token exhaustion is a system failure; no degraded candidate is created.

- [ ] **Step 6: Run focused tests**

```powershell
npm.cmd test -- tests/scan-session.test.ts tests/scan-atomicity.test.ts tests/workflows.test.ts tests/provider-compatibility.test.ts tests/retry.test.ts tests/telemetry.test.ts
npm.cmd run workflows:check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```text
feat(scan): require contextual review
```

---

### Task 6: Add Tavernary V5 import and Luna project synthesis

**Files:**

- Create: Tavernary `data/schemas/tavernkeeper-report-index.v5.schema.json`
- Create: Tavernary `data/schemas/tavernkeeper-scan-report.v5.schema.json`
- Delete: Tavernary `data/schemas/tavernkeeper-report-index.v4.schema.json`
- Rewrite: Tavernary `scripts/security/tavernkeeper-reports.mjs`
- Modify: Tavernary `scripts/security/tavernkeeper-reports.d.mts`
- Create: Tavernary `scripts/security/tavernkeeper-assessment-contract.mjs`
- Create: Tavernary `scripts/security/tavernkeeper-synthesis-provider.mjs`
- Create: Tavernary `scripts/security/tavernkeeper-synthesis.mjs`
- Modify: Tavernary `scripts/security/import-tavernkeeper-reports.mjs`
- Modify: Tavernary `scripts/security/import-tavernkeeper-reports.d.mts`
- Replace: Tavernary `tests/fixtures/tavernkeeper/report-index.v4.valid.json` with `report-index.v5.valid.json`
- Create: Tavernary `tests/fixtures/tavernkeeper/scan-report.v5.valid.json`
- Modify: Tavernary `tests/unit/tavernkeeper-reports.test.ts`
- Create: Tavernary `tests/unit/tavernkeeper-synthesis.test.ts`
- Modify: Tavernary `.github/workflows/import-tavernkeeper-reports.yml`

**Interfaces:**

- Consumes: TavernKeeper V5 index/report, Tavernary registry, current target identity, and existing enrichment provider secrets.
- Produces: validated strict `TavernaryAssessment`, evidence floor, and tracked schema-V5 card projection.

- [ ] **Step 1: Write failing V5 import tests**

Assert the importer fetches the compact index, then each unseen immutable report with the existing hardened origin/redirect/size controls. Reject V1-V4, digest mismatch, unsafe report paths, wrong repository identity, incomplete review coverage, unknown candidates, invalid counts, duplicate preferred identities, and inactive sources.

- [ ] **Step 2: Write failing synthesis-contract tests**

Require:

```js
{
  risk_level: "low",
  headline: "Low concern",
  summary: "The reviewed behavior matches the extension's stated purpose, with two minor hardening cautions.",
  minor_cautions: 2,
  material_concerns: 0,
  high_danger: 0,
  malicious_evidence: "No evidence of malicious behavior was identified.",
  cited_finding_ids: ["candidate-000002", "candidate-000004"],
  interaction_chains: []
}
```

Reject uncited claims, unknown finding IDs, unsafe prose, count mismatch, a grade below the evidence floor, and an escalation without a cited interaction chain.

- [ ] **Step 3: Implement deterministic evidence floors**

Export:

```js
export function deriveEvidenceFloor(assessments) {
  if (assessments.some(isHighFloor)) return "high";
  if (assessments.some(isMaterialFloor)) return "material";
  return "low";
}
```

`isHighFloor` covers high-confidence credible malicious behavior and high-confidence critical readily exploitable vulnerabilities. `isMaterialFloor` covers medium-or-higher-confidence material vulnerabilities.

- [ ] **Step 4: Implement strict Luna synthesis**

Reuse `createStructuredProviderTransport` with `response_format.type = "json_schema"`, schema name `tavernary_tavernkeeper_assessment_v1`, temperature `0`, and the existing `TAVERNARY_ENRICHMENT_API_URL`, `TAVERNARY_ENRICHMENT_API_KEY`, and `TAVERNARY_ENRICHMENT_MODEL` secrets. The system prompt says Luna is synthesizing validated assessments, not rescanning code, and every claim must cite V5 finding IDs.

- [ ] **Step 5: Make import fail closed**

Only after V5 validation, Luna synthesis, floor validation, and atomic write succeeds may the tracked snapshot change. On failure preserve the prior snapshot. First-time projects remain unassessed; prior assessments remain stale.

- [ ] **Step 6: Run focused tests**

```powershell
npm.cmd test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-synthesis.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```text
feat(security): synthesize V5 scan results
```

---

### Task 7: Separate Tavernary risk from freshness in the card UI

**Files:**

- Rewrite: Tavernary `src/features/catalog/tavernkeeper-status.ts`
- Modify: Tavernary `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Modify: Tavernary `src/features/catalog/components/tavernkeeper-history-strip.tsx`
- Create: Tavernary `src/app/security/tavernkeeper/history/[sourceId]/page.tsx`
- Modify: Tavernary `src/styles/catalog.css`
- Modify: Tavernary `src/styles/tokens.css`
- Modify: Tavernary `src/app/help/security/page.tsx`
- Modify: Tavernary `docs/tavernkeeper-integration.md`
- Modify: Tavernary `tests/unit/tavernkeeper-status.test.ts`
- Modify: Tavernary `tests/unit/tavernkeeper-scan-indicator.test.tsx`
- Modify: Tavernary `tests/e2e/catalog.spec.ts`
- Create: Tavernary `tests/unit/tavernkeeper-history-page.test.tsx`
- Modify: Tavernary `tests/visual/catalog.visual.spec.ts`

**Interfaces:**

- Consumes: tracked Tavernary V5 final assessments.
- Produces: `TavernKeeperCardStatus` with independent `riskLevel`, `state`, and `freshness`, plus the approved concise panel and final-grade history.

- [ ] **Step 1: Write failing status tests**

Assert current/stale combinations preserve risk color:

```ts
expect(derive(currentLow)).toMatchObject({ state: "teal", freshness: "current" });
expect(derive(staleLow)).toMatchObject({ state: "teal", freshness: "stale" });
expect(derive(staleMaterial)).toMatchObject({ state: "orange", freshness: "stale" });
expect(derive(staleHigh)).toMatchObject({ state: "red", freshness: "stale" });
```

Gray remains only unassessed/unavailable without a prior assessment; unsupported remains super-dark teal.

- [ ] **Step 2: Implement status and history types**

Store final assessment `risk_level`, headline, summary, caution counts, malicious-evidence text, exact report ID/SHA, model/policy versions, report URL, Tavernary history URL, and assessed time. History selects the newest twelve final Tavernary assessments and never includes the deleted V4 canaries.

- [ ] **Step 3: Update the concise panel**

Keep the exact heading `TavernKeeper Scan Results`. Show grade, one- or two-sentence summary, caution count, malicious-evidence statement, exact SHA/date, current/stale text, grade history, and full report/history links. Do not render technical finding rows on the card.

Create `/security/tavernkeeper/history/{source_id}/` as the full public final-assessment history. Each entry shows Tavernary's grade and summary, assessment time, exact SHA, policy/model identity, and its bound TavernKeeper technical report. TavernKeeper's own history remains the technical-report history.

- [ ] **Step 4: Add the independent stale marker**

Keep the scan icon inline immediately after the final title character and retain its risk color. Add a small clock marker and an accessible name including both risk and freshness. Preserve keyboard, hover, focus, click/tap, and Escape behavior.

- [ ] **Step 5: Run component and browser tests**

```powershell
npm.cmd test -- tests/unit/tavernkeeper-status.test.ts tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/tavernkeeper-history-page.test.tsx
npm.cmd run test:scan-e2e
npm.cmd run test:scan-visual
```

Expected: PASS after intentional snapshot updates; mobile and ellipsized titles retain the inline icon.

- [ ] **Step 6: Commit**

```text
feat(catalog): show contextual scan risk
```

---

### Task 8: Align operations, documentation, and complete verification

**Files:**

- Modify: TavernKeeper `README.md`
- Modify: TavernKeeper `docs/architecture.md`
- Modify: TavernKeeper `docs/operations.md`
- Modify: TavernKeeper `docs/development-rules.md`
- Modify: Tavernary `docs/tavernkeeper-integration.md`
- Modify: Tavernary `SECURITY.md`
- Modify: both repositories' workflow-policy and contract tests as required

**Interfaces:**

- Consumes: completed V5 implementation.
- Produces: consistent operator documentation and full local verification evidence.

- [ ] **Step 1: Remove stale production terminology**

Search both repositories for scanner-only conclusions, `reportable` project grading, stale-orange semantics, V4 acceptance, manual review language, and deleted report URLs. Keep only explicit migration prose describing their removal.

- [ ] **Step 2: Document exact operator behavior**

Document model configuration, Bearer authentication, evidence grouping, ecosystem context, no-degraded-output rule, initial plus three delayed attempts, staff-only incidents, five-repository batches, forced rescans, no human disposition, V5 binding, Luna floors, and current/stale presentation.

- [ ] **Step 3: Run TavernKeeper complete verification**

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run build
```

Expected: formatting, typecheck, all Vitest suites, workflow policy, E2E, and build pass.

- [ ] **Step 4: Run Tavernary complete verification**

```powershell
npm.cmd run check
npm.cmd run test:scan-e2e
```

Expected: formatting, lint, palette audit, catalog/report validation, typecheck, all tests, production build, static export, and scan browsers pass.

- [ ] **Step 5: Inspect final diffs**

In each repository run `git diff --check` and `git status --short`. Confirm no checkout, raw model response, report candidate, cache, secret, generated canary report, or unrelated user file is staged.

- [ ] **Step 6: Commit documentation and verification guards**

```text
docs(security): document contextual scans
```

---

### Task 9: Publish reader-first and prove the live canaries

**Files:**

- Record: Tavernary `docs/tavernkeeper-live-acceptance.md`
- Verify remotely: both repositories' PRs, checks, Pages deployments, provider check, exact V5 reports, index, Tavernary assessments, and hydrated cards

**Interfaces:**

- Consumes: verified independent Tavernary and TavernKeeper branches and existing configured GitHub Apps/model secrets.
- Produces: live proof for Recursion and Wandlight while the ordinary backlog remains paused.

- [ ] **Step 1: Merge the Tavernary V5 reader first**

Push, open, check, and merge the Tavernary branch. Verify the exact Pages deployment remains gray for both canaries. Do not dispatch a scan yet.

- [ ] **Step 2: Merge the TavernKeeper V5 writer**

Push, open, check, and merge the TavernKeeper branch. Verify Pages serves an empty valid V5 index and no deleted V4 report URL.

- [ ] **Step 3: Run the TavernKeeper provider check**

Dispatch the protected action with the configured endpoint, rotated key, and `deepseek/deepseek-v4-flash-0731:thinking`. Verify authentication, response parsing, schema validation, and sanitized diagnostics.

- [ ] **Step 4: Run Recursion through the general targeted action**

Use Recursion's canonical GitHub URL in Tavernary's staff-only action. Watch exact-SHA refresh, manifest deployment, TavernKeeper wake, all scanners, contextual file review, V5 publication, Tavernary wake/import, Luna synthesis, floor validation, commit, Pages deployment, and card hydration.

- [ ] **Step 5: Verify Recursion live**

Record the exact target SHA, TavernKeeper report ID/URL/digest, scanner and assessment counts, Tavernary final risk/summary/citations, both deployment SHAs, freshness, panel, report link, history link, and accessibility. Confirm the deleted V4 red result is absent.

- [ ] **Step 6: Repeat for Wandlight**

Run the same general action using Wandlight's canonical URL. Record the same evidence and confirm no repository-specific allowlist exists.

- [ ] **Step 7: Keep backlog paused and record acceptance**

Do not resume ordinary scanning automatically. Commit the live acceptance record after both canaries pass. Backlog resume is a separate protected operational action after this implementation is proven.

- [ ] **Step 8: Commit the live record**

```text
docs(security): record contextual canaries
```
