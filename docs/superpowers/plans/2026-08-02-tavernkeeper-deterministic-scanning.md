# TavernKeeper Deterministic Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace TavernKeeper's repository-wide model review with a fully deterministic scanner, policy, summary, V4 report, and Tavernary card pipeline, then prove Wandlight and Recursion live end to end.

**Architecture:** Tavernary first gains a backwards-compatible V4 preferred-index reader and V4 card projection. TavernKeeper then builds a content-addressed Scan Package V1 from exact-SHA inventory and required scanner results, derives reportability and prose deterministically, and publishes immutable V4 reports through the existing encrypted Publisher App path. All source chunking, model calls, model caches, provider workflows, deep mode, and model telemetry are removed before live canaries.

**Tech Stack:** Node.js 24, TypeScript 6, Zod 4, Vitest 4, Ajv, React 19, Next.js 16, GitHub Actions, GitHub Apps, GitHub Pages, Gitleaks, OpenGrep, OSV-Scanner, zizmor, Malcontent.

## Global Constraints

- The canonical design is `docs/superpowers/specs/2026-07-31-tavernkeeper-cross-repository-security-design.md` at Tavernary commit `912786f2` or later.
- TavernKeeper scan workflows make zero language-model requests and receive zero model-provider credentials.
- Target code, dependencies, hooks, builds, tests, Actions, binaries, containers, and package scripts are never executed.
- Required scanner failure, incomplete coverage, malformed evidence, schema failure, or publication failure publishes no report.
- No repository-size admission gate or degraded large-repository policy is introduced.
- Scanner policy V2 retains `batchSize: 5`, `maxParallel: 2`, and `maxCommits: 20`.
- V1, V2, and model-based V3 report contracts remain immutable; deterministic reports and indexes use schema V4.
- `red` means at least one medium-or-higher severity and medium-or-higher confidence finding; `teal` means none after complete coverage.
- Tavernary alone derives orange, gray, and unsupported presentation states.
- Production publication is fully automated and has no staff review or finding-dismissal gate.
- Tavernary's V4 reader must deploy before TavernKeeper publishes a V4 preferred index.
- Ordinary backlog processing remains staff-paused until Wandlight and Recursion pass live acceptance.

---

### Task 1: Add Tavernary V4 preferred-index validation

**Files:**
- Create: `data/schemas/tavernkeeper-report-index.v4.schema.json`
- Create: `tests/fixtures/tavernkeeper/report-index.v4.valid.json`
- Modify: `config/tavernkeeper-contract.json`
- Modify: `scripts/security/tavernkeeper-reports.mjs`
- Modify: `scripts/security/tavernkeeper-reports.d.mts`
- Modify: `tests/unit/tavernkeeper-reports.test.ts`
- Modify: `tests/unit/tavernkeeper-publication.test.ts`

**Interfaces:**
- Produces: `TavernKeeperReportV4`, `TavernKeeperReportIndexV4`, and V4 support in `validateReportIndex()`.
- Produces: canonical V4 report path `/TavernKeeper/reports/github/{repository_id}/{target_sha}/{scanner_policy_version}/{report_version}/`.
- Consumes: existing hardened JSON fetch, atomic tracked-snapshot write, active registry identity checks, and V1/V2 compatibility parsers.

- [ ] **Step 1: Add the failing valid-V4 fixture**

Create an index fixture whose entry has no `mode`, `prompt_policy_version`, or model fields and contains this V4 projection:

```json
{
  "schema_version": 4,
  "generated_at": "2026-08-02T12:00:00.000Z",
  "reports": [
    {
      "report_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "report_version": 1,
      "supersedes_report_id": null,
      "scanner_version": "1",
      "scanner_policy_version": "2",
      "rule_catalog_version": "1",
      "package_schema_version": 1,
      "source_id": "github-1285208664",
      "provider": "github",
      "repository_id": 1285208664,
      "repository": "MentallyQuill/Recursion",
      "target_sha": "1bce1fa73fe6c0fe8e767c773a832b94bb336720",
      "completed_at": "2026-08-02T12:00:00.000Z",
      "assessment_method": "deterministic-static-analysis",
      "result": "teal",
      "summary": {
        "headline": "No reportable concerns detected",
        "detail": "All required scanners completed at this commit, and no finding met TavernKeeper's reportable threshold."
      },
      "finding_counts": {
        "total": 1,
        "reportable": 0,
        "informational": 1,
        "reportable_severity": { "critical": 0, "high": 0, "medium": 0 },
        "severity": { "critical": 0, "high": 0, "medium": 0, "low": 1, "info": 0 },
        "confidence": { "high": 0, "medium": 1, "low": 0 },
        "policy_status": { "reportable": 0, "informational": 1 },
        "categories": [{ "category": "dependency-vulnerability", "count": 1 }]
      },
      "coverage": {
        "history_commits": 20,
        "inventory_files": 42,
        "inventory_bytes": 9001,
        "tools_completed": 5,
        "tools_not_applicable": 2,
        "evidence_validated": 1
      },
      "report_url": "https://mentallyquill.github.io/TavernKeeper/reports/github/1285208664/1bce1fa73fe6c0fe8e767c773a832b94bb336720/2/1/",
      "history_url": "https://mentallyquill.github.io/TavernKeeper/reports/github/1285208664/history/"
    }
  ]
}
```

- [ ] **Step 2: Add failing V4 schema and semantics tests**

Add named tests that assert:

```ts
expect(validateReportIndex(v4Fixture, registry)).toEqual(v4Fixture);
expect(() => validateReportIndex(withModelField(v4Fixture), registry)).toThrow();
expect(() => validateReportIndex(withCountsMismatch(v4Fixture), registry)).toThrow(
  "finding totals do not match",
);
expect(() => validateReportIndex(withUnsafeSummary(v4Fixture), registry)).toThrow(
  "summary is unsafe",
);
expect(() => validateReportIndex(withLegacyMode(v4Fixture), registry)).toThrow();
```

Also reject a V4 report URL containing the removed mode segment and preserve the last valid tracked snapshot when remote V4 input is invalid.

- [ ] **Step 3: Run the reader tests and verify RED**

Run:

```powershell
npm test -- tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-publication.test.ts
```

Expected: FAIL because schema version 4 is unsupported.

- [ ] **Step 4: Implement the V4 reader contract**

Add the V4 Ajv schema with `additionalProperties: false` at every object boundary. Add a V4 type whose summary and counts are:

```ts
interface TavernKeeperReportV4 {
  result: "teal" | "red";
  assessment_method: "deterministic-static-analysis";
  summary: { headline: string; detail: string };
  finding_counts: {
    total: number;
    reportable: number;
    informational: number;
    reportable_severity: Record<"critical" | "high" | "medium", number>;
    severity: Record<"critical" | "high" | "medium" | "low" | "info", number>;
    confidence: Record<"high" | "medium" | "low", number>;
    policy_status: Record<"reportable" | "informational", number>;
    categories: Array<{ category: string; count: number }>;
  };
}
```

In `assertReportCounts()`, require:

```js
counts.total === counts.reportable + counts.informational;
counts.total === counts.policy_status.reportable + counts.policy_status.informational;
counts.reportable === counts.policy_status.reportable;
sum(Object.values(counts.reportable_severity)) === counts.reportable;
report.result === (counts.reportable > 0 ? "red" : "teal");
```

Validate summary strings as trimmed, 1–120 and 1–400 characters, with no C0/C1 controls, bidi controls, `<`, or `>` characters. Preserve V1/V2 parsing but reject non-empty V1 entries as before. Set active scanner policy to `"2"` and the configured preferred index version to `4`.

- [ ] **Step 5: Run the reader tests and verify GREEN**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Commit the Tavernary V4 reader**

```powershell
git add data/schemas/tavernkeeper-report-index.v4.schema.json tests/fixtures/tavernkeeper/report-index.v4.valid.json config/tavernkeeper-contract.json scripts/security/tavernkeeper-reports.mjs scripts/security/tavernkeeper-reports.d.mts tests/unit/tavernkeeper-reports.test.ts tests/unit/tavernkeeper-publication.test.ts
git commit -m "feat(security): accept deterministic reports"
```

### Task 2: Project V4 summaries into Tavernary cards

**Files:**
- Modify: `src/features/catalog/tavernkeeper-status.ts`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/components/tavernkeeper-scan-indicator.tsx`
- Modify: `src/features/catalog/components/tavernkeeper-history-strip.tsx`
- Modify: `scripts/catalog/build.mjs`
- Modify: `tests/unit/tavernkeeper-status.test.ts`
- Modify: `tests/unit/tavernkeeper-scan-indicator.test.tsx`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: `TavernKeeperReportV4` from Task 1.
- Produces: `TavernKeeperReportSummary` with `summary`, `reportableSeverity`, and no `mode`.
- Preserves: exact heading `TavernKeeper Scan Results`, scan icon placement, history strip, full report/history links, and red/teal/orange/gray/unsupported colors.

- [ ] **Step 1: Write failing status-projection tests**

Replace deep-mode preference tests with V4 supersession tests and add:

```ts
expect(currentTeal.report?.summary.detail).toContain("no finding met");
expect(staleTeal).toMatchObject({ state: "orange", reason: "outdated-clean" });
expect(staleRed).toMatchObject({ state: "red", reason: "outdated-concerning" });
expect(staleRed.report?.result).toBe("red");
expect(history.every((entry) => !("mode" in entry))).toBe(true);
```

Assert policy `1` reports are ignored after policy `2` activation and that the newest V4 `report_version`/`report_id` wins for a repeated SHA.

- [ ] **Step 2: Write failing panel-copy tests**

Make the V4 fixture detail visible and require stale wording separately:

```ts
expect(panel).toHaveTextContent(redReport.summary.detail);
expect(stalePanel).toHaveTextContent("This report covers an older commit");
expect(panel).not.toHaveTextContent(/model|prompt|token|deep scan/iu);
expect(panel).not.toHaveTextContent(/\b(?:safe|trusted|verified|certified)\b/iu);
```

Keep assertions for `TavernKeeper Scan Results`, exact SHA, nonzero critical/high/medium counts, `View full report`, and `View full scan history`.

- [ ] **Step 3: Run focused card tests and verify RED**

```powershell
npm test -- tests/unit/tavernkeeper-status.test.ts tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/build-catalog.test.ts
```

Expected: FAIL because current types require mode and generate hard-coded model-era copy.

- [ ] **Step 4: Implement the V4 status projection**

Define the card projection as:

```ts
export interface TavernKeeperReportSummary {
  reportId: string;
  result: "teal" | "red";
  scannedSha: string;
  scannedAt: string;
  scannerPolicyVersion: string;
  summary: { headline: string; detail: string };
  reportUrl: string;
  historyUrl: string;
  reportableSeverity: { critical: number; high: number; medium: number };
}
```

Use the remote deterministic detail for current teal/red results. Append a fixed Tavernary freshness sentence for stale teal and stale red. Never change stale red to orange. History accessible names include result, date, SHA, and scanner-policy version but no mode.

- [ ] **Step 5: Run focused card tests and scan UI gates**

```powershell
npm test -- tests/unit/tavernkeeper-status.test.ts tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/build-catalog.test.ts
npm run test:scan
```

Expected: PASS.

- [ ] **Step 6: Commit the Tavernary V4 card projection**

```powershell
git add src/features/catalog/tavernkeeper-status.ts src/features/catalog/catalog-types.ts src/features/catalog/components/tavernkeeper-scan-indicator.tsx src/features/catalog/components/tavernkeeper-history-strip.tsx scripts/catalog/build.mjs tests/unit/tavernkeeper-status.test.ts tests/unit/tavernkeeper-scan-indicator.test.tsx tests/unit/build-catalog.test.ts tests/e2e/catalog.spec.ts
git commit -m "feat(catalog): render deterministic scans"
```

### Task 3: Verify and deploy the Tavernary V4 reader first

**Files:**
- Modify: `docs/tavernkeeper-integration.md`
- Verify: all Tavernary files changed in Tasks 1–2 and the canonical design/plan commits.

**Interfaces:**
- Produces: live Tavernary deployment that accepts V4 before TavernKeeper can publish it.
- Does not consume or publish any V4 report yet; the current empty V2 snapshot remains valid during reader-first rollout.

- [ ] **Step 1: Update the integration summary**

Document that the target manifest stays V2, preferred report index becomes V4, policy becomes V2, and Tavernary derives freshness but not the security conclusion. Mark V1/V2/model-V3 report contracts historical.

- [ ] **Step 2: Run the full Tavernary gate**

```powershell
npm run check
npm run test:scan-e2e
npm run test:scan-visual
git diff --check
git status --short
```

Expected: all checks pass; only intentional committed files exist.

- [ ] **Step 3: Push, open, and merge the Tavernary reader PR**

```powershell
git push -u origin codex/tavernkeeper-deterministic-spec
gh pr create --base main --head codex/tavernkeeper-deterministic-spec --title "feat(security): accept deterministic TavernKeeper reports" --body "Deploy the V4 reader before TavernKeeper's writer. This PR publishes no scan result; it adds V4 validation, deterministic summary projection, and the approved canonical design. Verification: npm run check, npm run test:scan-e2e, npm run test:scan-visual."
$tavernaryPr = gh pr view --json number --jq .number
gh pr checks $tavernaryPr --watch
gh pr merge $tavernaryPr --merge --delete-branch
```

The reviewed PR body must state reader-first sequencing, V4 compatibility, zero reports published by this PR, tests run, and the follow-up TavernKeeper writer dependency.

- [ ] **Step 4: Prove the exact Tavernary deployment**

Verify the merge SHA's CI and Pages workflows, the Pages environment deployment SHA, a fresh `https://tavernary.org` response, and hydrated gray/unsupported scan controls. Do not begin TavernKeeper publication until this proof passes.

### Task 4: Add TavernKeeper scanner policy V2 and Scan Package V1

**Files:**
- Create: `config/scanner-policy.v2.json`
- Create: `src/contracts/scan-package.ts`
- Create: `tests/scan-package.test.ts`
- Modify: `src/config/policy.ts`
- Modify: `src/inventory/classify.ts`
- Modify: `src/orchestrator/scan-handler.ts`
- Modify: `tests/policy.test.ts`
- Modify: `tests/classify.test.ts`
- Modify: `tests/scan-atomicity.test.ts`

**Interfaces:**
- Produces: `ScanPackageV1Schema`, `buildScanPackage()`, `validateScanPackageEvidence()`, and `scanPackageDigest()`.
- Produces: policy V2 with queue/history/inventory/command/retry fields and no `model` member.
- Renames: inventory `modelEligible` to `firstPartyText` throughout active production code.

- [ ] **Step 1: Write failing policy-V2 tests**

Assert:

```ts
expect(policy.version).toBe("2");
expect(policy.queue).toEqual({ batchSize: 5, maxParallel: 2 });
expect(policy.history.maxCommits).toBe(20);
expect(policy).not.toHaveProperty("model");
expect(() => parsePolicy({ ...policy, model: {} })).toThrow();
```

- [ ] **Step 2: Write failing Scan Package tests**

Cover canonical ordering, stable digest, tool completeness, finding-origin coverage, path membership, line-range validity, fingerprint recomputation, count preservation, and rejection of raw-source-like fields:

```ts
expect(scanPackageDigest(buildScanPackage(inputA))).toBe(
  scanPackageDigest(buildScanPackage(inputBWithDifferentInputOrder)),
);
expect(() => validateScanPackageEvidence(packageWithUnknownPath)).toThrow(
  "finding path",
);
expect(() => ScanPackageV1Schema.parse({ ...valid, raw_source: "secret" })).toThrow();
```

- [ ] **Step 3: Run focused package tests and verify RED**

```powershell
npm test -- tests/policy.test.ts tests/classify.test.ts tests/scan-package.test.ts tests/scan-atomicity.test.ts
```

Expected: FAIL because policy V2 and Scan Package V1 do not exist.

- [ ] **Step 4: Implement policy V2 and Scan Package V1**

`scanner-policy.v2.json` preserves the V1 non-model ceilings and removes the entire `model` object. `ScanPackageV1Schema` contains target identity, history, policy/rule versions, complete inventory file metadata, exclusion totals, required tool states, sorted normalized findings, and evidence-validation totals. It contains no file content or raw scanner output.

Canonicalize arrays by tool order, portable path, and finding fingerprint before hashing. Recompute every finding fingerprint from origin, rule, path, lines, and evidence SHA and require every finding origin to map to a completed/applicable scanner.

- [ ] **Step 5: Run focused package tests and verify GREEN**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Commit policy V2 and package boundary**

```powershell
git add config/scanner-policy.v2.json src/contracts/scan-package.ts src/config/policy.ts src/inventory/classify.ts src/orchestrator/scan-handler.ts tests/scan-package.test.ts tests/policy.test.ts tests/classify.test.ts tests/scan-atomicity.test.ts
git commit -m "feat(scan): add deterministic package"
```

### Task 5: Add deterministic V4 findings, summaries, and reports

**Files:**
- Create: `src/policy/rule-descriptions.ts`
- Create: `src/report/deterministic-report.ts`
- Create: `tests/rule-descriptions.test.ts`
- Create: `tests/deterministic-report.test.ts`
- Modify: `src/contracts/reports.ts`
- Modify: `scripts/generate-contract-schemas.ts`
- Create: `schemas/scan-report.v4.schema.json`
- Create: `schemas/report-index.v4.schema.json`
- Create: `tests/fixtures/contracts/report.v4.valid.json`
- Create: `tests/fixtures/contracts/index.v4.valid.json`
- Modify: `tests/contracts.test.ts`

**Interfaces:**
- Consumes: validated `ScanPackageV1` from Task 4.
- Produces: `FindingV4Schema`, `FindingCountsV4Schema`, `DeterministicSummarySchema`, `ScanReportV4Schema`, `ReportIndexV4Schema`, `deriveV4Result()`, and `buildDeterministicReport()`.
- Produces: `RULE_CATALOG_VERSION = "1"` and exact/fallback descriptions for only known scanner origins.

- [ ] **Step 1: Write failing finding-policy tests**

Assert medium/high, high/medium, and critical/high findings are `reportable`; medium/low, low/high, and info/high are `informational`. Assert unknown origins fail:

```ts
expect(classifyFinding({ severity: "medium", confidence: "medium" })).toBe("reportable");
expect(classifyFinding({ severity: "medium", confidence: "low" })).toBe("informational");
expect(() => describeFinding({ ...finding, origin: "unknown" })).toThrow(
  "unsupported finding origin",
);
```

- [ ] **Step 2: Write failing report and summary tests**

Require exact deterministic outputs for empty, informational-only, and red packages:

```ts
expect(teal.result).toBe("teal");
expect(teal.summary.headline).toBe("No reportable concerns detected");
expect(red.result).toBe("red");
expect(red.finding_counts.reportable).toBe(2);
expect(red.summary.detail).toContain("2 reportable concerns");
expect(buildDeterministicReport(redPackage)).toEqual(
  buildDeterministicReport(structuredClone(redPackage)),
);
```

Reject secrets, HTML, controls, source excerpts, count mismatches, wrong target SHAs, duplicate fingerprints, and any model-era field.

- [ ] **Step 3: Run contract/report tests and verify RED**

```powershell
npm test -- tests/rule-descriptions.test.ts tests/deterministic-report.test.ts tests/contracts.test.ts
```

Expected: FAIL because V4 contracts and renderer do not exist.

- [ ] **Step 4: Implement trusted rule descriptions**

Define exact TavernKeeper static-rule descriptions plus versioned generic adapters for `gitleaks`, `opengrep`, `osv-scanner`, `zizmor`, and `malcontent`. Templates may interpolate only validated rule ID, package/advisory identifier, version, path, and fixed version fields already normalized by trusted adapters. Do not accept scanner prose as a template.

- [ ] **Step 5: Implement V4 contracts and report builder**

Use `assessment_method: "deterministic-static-analysis"`, no mode or prompt fields, and no model/disposition/adjudication fields. Build counts from V4 findings and derive result exclusively from `policy_status`. The summary is capped at 120/400 characters and passes the sanitizer before schema parsing. Report identity hashing excludes operationally variable fields only where existing supersession semantics require it; identical assessment inputs retain identical security content.

- [ ] **Step 6: Generate schemas and verify GREEN**

```powershell
npm run contracts:generate
npm test -- tests/rule-descriptions.test.ts tests/deterministic-report.test.ts tests/contracts.test.ts
```

Expected: generated V1–V3 schemas remain byte-for-byte unchanged; V4 schemas and tests pass.

- [ ] **Step 7: Commit the deterministic V4 report model**

```powershell
git add src/policy/rule-descriptions.ts src/report/deterministic-report.ts src/contracts/reports.ts scripts/generate-contract-schemas.ts schemas/scan-report.v4.schema.json schemas/report-index.v4.schema.json tests/rule-descriptions.test.ts tests/deterministic-report.test.ts tests/contracts.test.ts tests/fixtures/contracts/report.v4.valid.json tests/fixtures/contracts/index.v4.valid.json
git commit -m "feat(report): build deterministic V4"
```

### Task 6: Replace the model phase with deterministic finalization

**Files:**
- Modify: `src/orchestrator/session.ts`
- Modify: `src/orchestrator/scan-handler.ts`
- Modify: `src/cli/prepare-target.ts`
- Modify: `src/cli/finalize-target.ts`
- Modify: `src/cli/transition-result.ts`
- Modify: `src/cli/transition.ts`
- Modify: `src/cli/reconcile.ts`
- Modify: `src/cli/targeted-scan.ts`
- Modify: `src/cli/staff-request.ts`
- Modify: `src/queue/backlog.ts`
- Modify: `tests/scan-session.test.ts`
- Modify: `tests/scan-atomicity.test.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/cli-io.test.ts`
- Modify: `tests/backlog.test.ts`

**Interfaces:**
- Consumes: `buildScanPackage()` and `buildDeterministicReport()`.
- Produces: `prepareTargetSession()` followed directly by `finalizePreparedSession()`; no `SessionReview`, review JSON, manifest freshness rejection, or provider environment.
- Produces: scan requests with one implicit deterministic mode and scanner policy `"2"`.

- [ ] **Step 1: Rewrite session tests to the two-phase contract and verify RED**

Require prepare to persist sanitized inventory/scanner evidence and finalize to recheck exact HEAD, build the package, and write one candidate:

```ts
const prepared = await prepareTargetSession(spec);
const finalized = await finalizePreparedSession({
  sessionRoot,
  output: candidatePath,
  completedAt,
  verifyHead,
});
expect(finalized.status).toBe("completed");
expect(readCandidate()).toMatchObject({ schema_version: 4, result: "teal" });
expect(reviewTransport).not.toHaveBeenCalled();
```

Add a SHA-churn test proving the report still publishes the acquired SHA after the manifest advances. Add head-mismatch, missing tool, and evidence mismatch tests proving no candidate is written.

- [ ] **Step 2: Run orchestration tests and verify RED**

```powershell
npm test -- tests/scan-session.test.ts tests/scan-atomicity.test.ts tests/cli.test.ts tests/cli-io.test.ts tests/backlog.test.ts
```

Expected: FAIL because finalization still requires model review JSON.

- [ ] **Step 3: Refactor prepared-session persistence**

Persist only target, project kinds, history, inventory metadata, classification, canonical scanner runs/findings, policy versions, and session identity. Remove selected source files, chunks, evidence manifests for model prompts, endpoint/model/cache identity, and review state. Keep raw checkout data outside the persisted sanitized session.

- [ ] **Step 4: Refactor finalization and transitions**

Make `finalize-target` accept only the output path, reverify exact `HEAD`, construct Scan Package V1, build Report V4, sanitize it, and atomically write the candidate. Make transition assembly read only `candidate.json` and `phase-error.json`. Preserve repository/system error classification and encrypted candidate handoff.

- [ ] **Step 5: Remove mode from requests and bump policy**

`ScanRequestSchema` retains target metadata, reason, report version, superseded ID, and previous SHAs. Reconcile, targeted scans, and policy campaigns always use scanner policy `"2"`; no mode is accepted or emitted. A target already covered by policy V2 is coalesced normally.

- [ ] **Step 6: Run orchestration tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Commit deterministic orchestration**

```powershell
git add src/orchestrator/session.ts src/orchestrator/scan-handler.ts src/cli/prepare-target.ts src/cli/finalize-target.ts src/cli/transition-result.ts src/cli/transition.ts src/cli/reconcile.ts src/cli/targeted-scan.ts src/cli/staff-request.ts src/queue/backlog.ts tests/scan-session.test.ts tests/scan-atomicity.test.ts tests/cli.test.ts tests/cli-io.test.ts tests/backlog.test.ts
git commit -m "refactor(scan): finalize without models"
```

### Task 7: Publish V4 reports, histories, and summaries

**Files:**
- Modify: `src/publish/publisher.ts`
- Modify: `src/publish/report-path.ts`
- Modify: `src/publish/sanitize.ts`
- Modify: `src/publish/render-report.ts`
- Modify: `src/publish/render-history.ts`
- Modify: `src/cli/build-site.ts`
- Modify: `reports/index.json`
- Modify: `tests/publisher.test.ts`
- Modify: `tests/report-path.test.ts`
- Modify: `tests/report-sanitize.test.ts`
- Modify: `tests/report-render.test.ts`

**Interfaces:**
- Consumes: `ScanReportV4Schema` and `ReportIndexV4Schema`.
- Produces: V4 immutable path without a mode segment, preferred index V4, script-free report/history HTML, and compact summary projection consumed by Tavernary.
- Preserves: encrypted one-day artifact, serialized prevalidation, rollback, Publisher App commit, and Pages verification.

- [ ] **Step 1: Write failing V4 path and publisher tests**

Assert:

```ts
expect(reportPath(v4Report)).toBe(
  "reports/github/1285208664/1bce1fa73fe6c0fe8e767c773a832b94bb336720/2/1",
);
expect(publishedIndex.schema_version).toBe(4);
expect(publishedIndex.reports[0]).not.toHaveProperty("mode");
expect(publishedIndex.reports[0].summary).toEqual(v4Report.summary);
```

Add rollback tests for a mixed valid/invalid V4 batch and supersession tests for forced rescans at the same SHA.

- [ ] **Step 2: Write failing renderer/sanitizer tests**

Require HTML to show exact SHA, deterministic method, completed tools, exclusions, reportable/informational findings, rule explanations, remediation, and advisory disclaimer. Reject script/style injection, raw secrets, controls, model fields, and target-provided HTML.

- [ ] **Step 3: Run publication tests and verify RED**

```powershell
npm test -- tests/publisher.test.ts tests/report-path.test.ts tests/report-sanitize.test.ts tests/report-render.test.ts
```

Expected: FAIL because the publisher projects model-based V3 into index V2.

- [ ] **Step 4: Implement V4 path, projection, and rendering**

Keep V1–V3 historical readers but accept only V4 candidates for new publication. Project only V4 card fields into Index V4. Render every string through existing escaping and sanitizer boundaries. History orders reports by completed time/report identity and keeps red history visible after a later teal correction.

- [ ] **Step 5: Reset the tracked empty preferred index to V4**

Run the site builder so the publisher creates a canonical empty V4 index:

```powershell
npm run site:build
```

Then validate the generated empty index without hand-authoring its timestamp:

```powershell
$index = Get-Content -Raw reports/index.json | ConvertFrom-Json
if ($index.schema_version -ne 4 -or $index.reports.Count -ne 0) { throw "Expected an empty V4 report index" }
[DateTimeOffset]::ParseExact($index.generated_at, "yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture)
```

- [ ] **Step 6: Run publication tests and verify GREEN**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 7: Commit V4 publication**

```powershell
git add src/publish src/cli/build-site.ts reports/index.json tests/publisher.test.ts tests/report-path.test.ts tests/report-sanitize.test.ts tests/report-render.test.ts
git commit -m "feat(publish): publish deterministic V4"
```

### Task 8: Remove all model, provider, cache, and deep-mode runtime surfaces

**Files:**
- Delete: `src/model/`
- Delete: `src/cli/review-target.ts`
- Delete: `src/cli/provider-check.ts`
- Delete: `src/cli/deep-scan.ts`
- Delete: `.github/workflows/provider-check.yml`
- Delete: `.github/workflows/deep-scan.yml`
- Delete: model/provider/cache/deep tests under `tests/`
- Modify: `.github/workflows/scan-and-publish.yml`
- Modify: `.github/workflows/staff-operations.yml`
- Modify: `.github/workflows/policy-rescan.yml`
- Modify: `package.json`
- Modify: `scripts/check-workflow-policy.mjs`
- Modify: `src/operations/telemetry.ts`
- Modify: `tests/telemetry.test.ts`
- Modify: `tests/workflows.test.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `docs/development-rules.md`

**Interfaces:**
- Consumes: deterministic prepare/finalize flow from Task 6.
- Produces: workflows with no model secrets, cache restore/save, provider steps, review JSON, deep input, token telemetry, or provider documentation.
- Preserves: scanner environment, artifact encryption key, wake Apps, Publisher App, batch size five, concurrency two, retries, Pages, and backlog continuation.

- [ ] **Step 1: Write failing workflow-policy assertions**

Require the active workflow tree and package scripts to contain none of:

```ts
for (const forbidden of [
  "TAVERNKEEPER_API_ENDPOINT",
  "TAVERNKEEPER_API_KEY",
  "TAVERNKEEPER_MODEL",
  "tavernkeeper-model-cache",
  "Review with configured model",
  "provider-check",
  "deep-scan",
]) expect(activeRuntimeText).not.toContain(forbidden);
```

Require `scan-and-publish.yml` to call prepare then finalize directly and still upload an encrypted outcome on every path.

- [ ] **Step 2: Write failing telemetry tests**

Define scan telemetry with package digest, result, findings, inventory, and tools, and assert there is no `model`, `usage`, `cache`, `promptPolicy`, or chunk counter.

- [ ] **Step 3: Run workflow/telemetry tests and verify RED**

```powershell
npm test -- tests/workflows.test.ts tests/telemetry.test.ts
npm run workflows:check
```

Expected: FAIL while model/deep surfaces remain.

- [ ] **Step 4: Simplify the production workflow**

Delete cache restore/save and configured-model review. `Prepare exact target` receives no provider credentials; `Finalize deterministic report` receives only session/checkout/error paths. Transition input excludes `review.json`; plaintext cleanup excludes model files. Keep scanner secrets limited to artifact encryption and publisher/wake credentials in their existing steps.

- [ ] **Step 5: Delete runtime surfaces and simplify telemetry**

Remove the complete `src/model` tree and its tests rather than leaving dormant spend paths. Remove provider/deep CLIs, workflows, package scripts, allowlists, docs, and test fixtures. Telemetry records scanner durations/status, inventory, package/report versions, result/counts, retry, publication, and queue metrics only.

- [ ] **Step 6: Update operator documentation**

Document policy V2, V4 reports, deterministic summaries, zero provider secrets, one scan mode, and the unchanged three-retry incident flow. Mark historical provider-check design documents superseded rather than editing their recorded history.

- [ ] **Step 7: Run workflow/telemetry tests and verify GREEN**

Run the Step 3 commands. Expected: PASS.

- [ ] **Step 8: Commit runtime removal**

```powershell
git add -A
git commit -m "refactor(runtime): remove model scanning" -m "Deterministic scanners and policy now own the full assessment. Remove source review, provider credentials, caches, deep mode, and token telemetry so routine scans cannot spend model tokens."
```

### Task 9: Rebuild end-to-end fixtures and run TavernKeeper release gates

**Files:**
- Modify: `tests/e2e/scan-fixtures.test.ts`
- Modify: `tests/fixtures/hostile-tree/` only where a deterministic red/teal case is missing
- Modify: `tests/fixtures/contracts/` generated/validated fixtures from Tasks 5–7
- Verify: `scripts/smoke-scanners.ts`
- Verify: all TavernKeeper source, test, config, workflow, schema, docs, report, and state files.

**Interfaces:**
- Produces: release evidence for real deterministic tools, hostile-data safety, V4 publication, and zero model runtime.
- Does not alter `operations/state.json` by hand; old live retry state is cleared through protected staff operations after deployment.

- [ ] **Step 1: Replace the model stub in the hostile E2E fixture**

Run real inventory, classification, static rules, package construction, V4 report derivation, sanitization, publication, and history. Deterministically replace only exact checkout/history and external scanner process adapters. Assert the hostile secret marker appears nowhere in session, candidate, report, index, site, or telemetry output.

- [ ] **Step 2: Add explicit teal and red E2E expectations**

```ts
expect(tealReport).toMatchObject({
  schema_version: 4,
  assessment_method: "deterministic-static-analysis",
  result: "teal",
});
expect(redReport.finding_counts.reportable).toBeGreaterThan(0);
expect(redReport.result).toBe("red");
expect(JSON.stringify(redReport)).not.toMatch(/model|prompt_policy|input_tokens/iu);
```

- [ ] **Step 3: Run the full local TavernKeeper gate**

```powershell
npm run check
npm run test:e2e
npm run build
npm run scanners:verify
npm run scanners:smoke
git diff --check
git status --short
```

Expected: all gates pass. If a pinned real scanner needs Linux, record the local platform limitation and require the corresponding GitHub Actions check before merge; do not represent a skipped tool as passed.

- [ ] **Step 4: Run a zero-runtime-reference audit**

```powershell
rg -n -i "TAVERNKEEPER_API|configured model|model cache|provider-check|deep-scan|max_tokens|input_tokens|reasoning_tokens" src config package.json .github/workflows scripts tests README.md docs/architecture.md docs/operations.md docs/development-rules.md
```

Expected: no active-runtime hits. Historical superseded design/plan documents may retain explanatory history only.

- [ ] **Step 5: Commit E2E and release-gate updates**

```powershell
git add tests scripts README.md docs
git commit -m "test(scan): prove deterministic pipeline"
```

### Task 10: Review, merge, and deploy TavernKeeper V4

**Files:**
- Verify: TavernKeeper feature branch diff against current `origin/main`.
- External state: TavernKeeper PR, protected environments, Actions runs, Pages deployment, and obsolete retry entries.

**Interfaces:**
- Requires: live Tavernary V4 reader proof from Task 3.
- Produces: deployed TavernKeeper deterministic writer with ordinary backlog still staff-paused.

- [ ] **Step 1: Review the complete diff against the canonical design**

Confirm every design section maps to code/tests, V1–V3 schemas did not change, no unrelated operational report commits were reverted, and current `operations/state.json` mutations from Publisher workflows are preserved during rebase/merge.

- [ ] **Step 2: Push, open, and run the TavernKeeper PR**

```powershell
git push -u origin codex/deterministic-scanning
gh pr create --base main --head codex/deterministic-scanning --title "feat: replace model review with deterministic scans" --body "Replace source-wide model review with scanner policy V2, Scan Package V1, and Report/Index V4. Remove provider credentials, model caches, deep mode, and token telemetry. Tavernary's V4 reader is already live. Verification: npm run check, npm run test:e2e, npm run build, npm run scanners:verify, npm run scanners:smoke."
$tavernKeeperPr = gh pr view --json number --jq .number
gh pr checks $tavernKeeperPr --watch
```

The PR body must list policy V2, Scan Package V1, Report/Index V4, removed model surfaces, security invariants, local checks, and reader-first Tavernary deployment proof.

- [ ] **Step 3: Merge and prove the TavernKeeper deployment**

```powershell
gh pr merge $tavernKeeperPr --merge --delete-branch
```

Watch post-merge CI and Pages deployment for the exact merge SHA. Fetch the public index and prove `schema_version: 4`, an empty reports list before canaries, canonical digest, and no unexpected operational resume.

- [ ] **Step 4: Clear obsolete model-era retry state without resuming backlog**

Run the existing protected `staff-operations.yml` `retry` operation once for repository ID `1254077407` (Wandlight) and once for `1285208664` (Recursion). Verify the Publisher App commit removes those retry entries and clears the stale transient circuit breaker while preserving:

```json
{
  "coverage_started_at": null,
  "pause": { "kind": "staff", "reason_code": "INITIAL_ROLLOUT" }
}
```

- [ ] **Step 5: Remove unused provider secrets after deployment proof**

List protected environment secret names, then delete exactly `TAVERNKEEPER_API_ENDPOINT`, `TAVERNKEEPER_API_KEY`, and `TAVERNKEEPER_MODEL` from every TavernKeeper environment where present. Do not alter `TAVERNKEEPER_ARTIFACT_KEY`, wake-App credentials, or Publisher-App credentials. Re-run workflow-policy checks remotely to prove no workflow requests the removed secrets.

```powershell
$retiredSecrets = @("TAVERNKEEPER_API_ENDPOINT", "TAVERNKEEPER_API_KEY", "TAVERNKEEPER_MODEL")
foreach ($environmentName in @("tavernkeeper-scanner", "tavernkeeper-staff")) {
  $presentSecrets = @(gh secret list --repo MentallyQuill/TavernKeeper --env $environmentName --json name --jq '.[].name')
  foreach ($secretName in $retiredSecrets) {
    if ($presentSecrets -contains $secretName) {
      gh secret delete $secretName --repo MentallyQuill/TavernKeeper --env $environmentName
    }
  }
}
```

### Task 11: Run Wandlight and Recursion through the real production pipeline

**Files:**
- External state: Tavernary targeted-scan workflow, TavernKeeper scan/publish/deploy runs, Tavernary import/deploy runs, TavernKeeper Pages, and live Tavernary cards.
- No source changes unless a live failure demonstrates a reproducible defect; any fix returns to a failing test and a new reviewed PR.

**Interfaces:**
- Consumes: exact GitHub URLs through Tavernary's staff-only action.
- Produces: two immutable V4 reports, two histories, imported Tavernary summaries, and hydrated live card panels.

- [ ] **Step 1: Dispatch Wandlight from Tavernary**

Use exact input:

```text
https://github.com/MentallyQuill/Wandlight
```

Verify Tavernary resolves repository ID `1254077407`, sends an input-free wake, and TavernKeeper acquires the manifest SHA rather than accepting a workflow-supplied SHA.

- [ ] **Step 2: Follow Wandlight through every stage**

Require exact checkout, inventory, every applicable scanner, Scan Package V1, deterministic V4 report, encrypted artifact, Publisher App commit, Pages deploy, Tavernary wake/import, Tavernary Pages deploy, and live hydration. Confirm no provider network step or model-token telemetry exists.

- [ ] **Step 3: Dispatch and follow Recursion**

Repeat Steps 1–2 with:

```text
https://github.com/MentallyQuill/Recursion
```

and repository ID `1285208664`.

- [ ] **Step 4: Verify TavernKeeper Pages**

For both reports verify schema V4, repository ID/name, exact SHA, policy `2`, all tool states, inventory/exclusions, evidence totals, result/count invariants, deterministic summary, finding details, script-free HTML, history ordering, canonical immutable URLs, and preferred-index entries.

- [ ] **Step 5: Verify the live Tavernary UI**

In a fresh browser session prove for both cards:

- Scan icon immediately follows the final visible title character.
- Long titles reserve icon space before ellipsis.
- Hover, keyboard focus, click, and touch open the same panel.
- Heading is exactly `TavernKeeper Scan Results`.
- The deterministic detail, exact SHA link, nonzero red severities, history strip, full report link, and `View full scan history` link are correct.
- State is teal/red for a current SHA or orange only for a stale teal SHA.
- No safety-certification language appears.
- Mobile Safari behavior remains responsive and non-modal.

- [ ] **Step 6: Record exact live evidence**

Capture both scanned SHAs, report URLs, history URLs, TavernKeeper run IDs/SHAs, Tavernary import/deploy run IDs/SHAs, current live card states, and fresh HTTP/browser proof. Do not report completion to the user until both projects pass.

### Task 12: Resume and monitor the ordinary deterministic backlog

**Files:**
- External state: TavernKeeper protected staff operation and subsequent reconciliations.
- No code changes unless monitoring reveals a tested defect.

**Interfaces:**
- Requires: both live canaries accepted in Task 11.
- Produces: ordinary Top-30/new/old processing with batches of five and concurrency two.

- [ ] **Step 1: Resume operations once**

Run protected `staff-operations.yml` with `operation=resume`. Verify the Publisher App records a non-null immutable `coverage_started_at`, clears the initial staff pause, and dispatches reconciliation.

- [ ] **Step 2: Verify queue ordering and limits**

Confirm the first ordinary batch selects at most five repositories, runs at most two jobs concurrently, prioritizes the current Top 30, and does not apply a repository-size gate.

- [ ] **Step 3: Monitor the first continued batches**

Track scanner runtimes, repository/system failures, oldest pending age, report colors, Pages deployments, and Tavernary imports. Protective scanner ceiling failures publish nothing and enter the approved retry path; they never trigger reduced coverage.

- [ ] **Step 4: Stop only on a real system failure**

If the circuit breaker engages, preserve fail-closed behavior and follow the one-, two-, and three-hour schedule. Do not manually manufacture a successful report or bypass evidence validation.

- [ ] **Step 5: Deliver the final user handoff**

Lead with Wandlight and Recursion's live publication status and direct links. Include exact SHAs and concise results, confirm zero model calls/tokens, summarize the merged PRs and checks, state whether the ordinary backlog is active, and identify any remaining operational issue without calling incomplete work complete.
