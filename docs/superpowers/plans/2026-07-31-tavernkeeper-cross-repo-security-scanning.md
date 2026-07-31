# TavernKeeper Cross-Repository Security Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated TavernKeeper scanner that publishes exact-commit advisory reports and integrate those reports into Tavernary's generated catalog and project cards.

**Architecture:** Tavernary publishes a generated manifest of eligible GitHub repositories pinned to full commit SHAs. TavernKeeper consumes that manifest in GitHub Actions, checks out target code without executing it, runs bounded deterministic scanners plus an optional evidence-only model review, and publishes immutable reports; Tavernary separately imports a sanitized report index and labels cards with the exact scanned SHA.

**Tech Stack:** Node.js 24, TypeScript 6, Zod 4, Vitest 4, GitHub Actions, GitHub Pages, React 19, Next.js 16, Ajv 8, Gitleaks, OpenGrep, OSV-Scanner, zizmor, and optional MiniMax OpenAI-compatible chat completions.

## Global Constraints

- Target repository code, scripts, hooks, package managers, binaries, archives, containers, and tests are never executed.
- Every target and report is identified by a full lowercase 40-character Git commit SHA.
- Reports are advisory and use only `no-high-confidence-indicators`, `review-suggested`, `incomplete`, or `failed`; the product never labels a repository safe.
- Published findings contain paths, line numbers, rule identifiers, severities, fingerprints, and redacted evidence only; detected secret values and model credentials are never persisted.
- The standard scan covers the full checked-out tree deterministically and up to the latest 20 reachable commits for change context.
- Deep review is explicit, optional, cached by repository ID plus SHA plus model policy version, and bounded by configured file, byte, and token limits.
- TavernKeeper receives no Tavernary write credential; Tavernary imports only public, schema-valid report summaries on its own schedule.
- Missing optional scanner binaries produce `incomplete` coverage instead of silently passing.
- Tavernary remains a static GitHub Pages export and preserves catalog schema version 5 while adding an optional project property.
- All first-party GitHub Actions are pinned to full commit SHAs.

---

## File Structure

### Tavernary

- `scripts/security/tavernkeeper-targets.mjs`: builds the exact-SHA public target manifest from active GitHub sources and matching snapshots.
- `scripts/security/import-tavernkeeper-reports.mjs`: fetches, validates, identity-checks, and atomically writes the sanitized report index.
- `data/schemas/tavernkeeper-targets.schema.json`: target-manifest JSON Schema.
- `data/schemas/tavernkeeper-report-index.schema.json`: imported report-index JSON Schema.
- `data/security/tavernkeeper-reports.json`: committed sanitized summaries consumed during catalog generation.
- `public/security/tavernkeeper-targets.json`: ignored generated Pages artifact.
- `src/features/catalog/components/project-security-review.tsx`: accessible sibling report link, separate from the repository card anchor.
- `.github/workflows/import-tavernkeeper-reports.yml`: scheduled least-privilege importer.

### TavernKeeper

- `src/contracts/targets.ts`: Zod target manifest contract.
- `src/contracts/reports.ts`: Zod normalized finding, report, and public index contracts.
- `src/core/result.ts`: typed non-throwing service result.
- `src/inventory/inventory-handler.ts`: bounded, symlink-safe inventory and eligible text extraction.
- `src/scanners/static-rules.ts`: built-in high-signal credential-exfiltration and unsafe-install detectors.
- `src/scanners/external-tools.ts`: no-shell adapters for optional external scanner binaries.
- `src/model/minimax-review.ts`: optional redacted evidence review through an OpenAI-compatible endpoint.
- `src/git/checkout.ts`: exact-SHA, no-hooks, no-LFS, no-submodule checkout.
- `src/orchestrator/scan-handler.ts`: combines inventory, deterministic findings, tool coverage, and optional model findings.
- `src/report/report-writer.ts`: immutable JSON/HTML reports and deterministic public index.
- `src/cli/run-batch.ts`: manifest fetch, change selection, sequential scan, and report publication.
- `.github/workflows/scan.yml`: scheduled and manual scanning.
- `.github/workflows/deploy-pages.yml`: report-site deployment.

---

### Task 1: Tavernary Target Manifest Contract

**Files:**
- Create: `scripts/security/tavernkeeper-targets.mjs`
- Create: `scripts/security/tavernkeeper-targets.d.mts`
- Create: `data/schemas/tavernkeeper-targets.schema.json`
- Modify: `scripts/catalog/build.mjs`
- Modify: `.gitignore`
- Test: `tests/unit/tavernkeeper-targets.test.ts`

**Interfaces:**
- Consumes: source records with `type: "github"` and repository snapshots with `repository.head_sha`.
- Produces: `buildTavernKeeperTargets({ sources, snapshots, generatedAt }): TavernKeeperTargetManifest` and `public/security/tavernkeeper-targets.json`.

- [ ] **Step 1: Write the failing target-selection test**

```ts
expect(buildTavernKeeperTargets({ sources, snapshots, generatedAt })).toEqual({
  schema_version: 1,
  generated_at: generatedAt,
  repositories: [{
    source_id: "github-42",
    provider: "github",
    repository_id: 42,
    repository: "owner/repo",
    target_sha: "a".repeat(40),
    canonical_url: "https://github.com/owner/repo",
  }],
});
```

- [ ] **Step 2: Run `npm test -- tests/unit/tavernkeeper-targets.test.ts` and confirm the missing-module failure**

- [ ] **Step 3: Implement strict GitHub-only target selection, stable repository sorting, and atomic output writing**

```js
export function buildTavernKeeperTargets({ sources, snapshots, generatedAt }) {
  const snapshotsBySource = new Map(snapshots.map((value) => [value.source_id, value]));
  const repositories = sources.flatMap((source) => {
    const snapshot = snapshotsBySource.get(source.id);
    if (source.type !== "github" || !snapshot || snapshot.source_health !== "healthy") return [];
    return [{ source_id: source.id, provider: "github", repository_id: source.repository_id,
      repository: source.repository, target_sha: snapshot.repository.head_sha,
      canonical_url: snapshot.repository.url }];
  }).sort((left, right) => left.repository_id - right.repository_id);
  return { schema_version: 1, generated_at: new Date(generatedAt).toISOString(), repositories };
}
```

- [ ] **Step 4: Run the focused test and `npm run catalog:build`; confirm the generated manifest validates and contains full SHAs**

- [ ] **Step 5: Commit the Tavernary target contract**

```bash
git add .gitignore data/schemas/tavernkeeper-targets.schema.json scripts/security tests/unit/tavernkeeper-targets.test.ts scripts/catalog/build.mjs
git commit -m "feat(security): publish exact-SHA scan targets"
```

### Task 2: TavernKeeper Contracts and Safe Inventory

**Files:**
- Create: `F:/git/TavernKeeper/package.json`
- Create: `F:/git/TavernKeeper/tsconfig.json`
- Create: `F:/git/TavernKeeper/src/core/result.ts`
- Create: `F:/git/TavernKeeper/src/contracts/targets.ts`
- Create: `F:/git/TavernKeeper/src/contracts/reports.ts`
- Create: `F:/git/TavernKeeper/src/inventory/inventory-handler.ts`
- Test: `F:/git/TavernKeeper/tests/contracts.test.ts`
- Test: `F:/git/TavernKeeper/tests/inventory.test.ts`

**Interfaces:**
- Consumes: Tavernary target manifest version 1 and an absolute checkout directory.
- Produces: `TargetManifestSchema`, `ScanReportSchema`, `ReportIndexSchema`, `Result<T>`, and `inventoryRepository(spec): Promise<Result<Inventory>>`.

- [ ] **Step 1: Write failing contract and symlink/budget inventory tests**

```ts
expect(TargetManifestSchema.safeParse(validManifest).success).toBe(true);
expect(TargetManifestSchema.safeParse({ ...validManifest, repositories: [{ ...target, target_sha: "main" }] }).success).toBe(false);
expect((await inventoryRepository({ root, maxFiles: 1, maxTotalBytes: 1024, maxFileBytes: 512 })).ok).toBe(false);
expect(inventory.files.some((file) => file.path === "outside-link")).toBe(false);
```

- [ ] **Step 2: Run `npm test -- tests/contracts.test.ts tests/inventory.test.ts` and confirm missing-module failures**

- [ ] **Step 3: Implement Zod schemas, typed results, deterministic path ordering, `lstat`-based symlink exclusion, and hard budgets**

```ts
export type Result<T, C extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: { code: C; message: string } };
```

- [ ] **Step 4: Run the focused tests and `npm run typecheck`; confirm passing contracts and no followed symlinks**

- [ ] **Step 5: Commit the TavernKeeper foundation**

```bash
git add package.json package-lock.json tsconfig.json src tests
git commit -m "feat: add scan contracts and safe inventory"
```

### Task 3: Deterministic Scanners and Exact Checkout

**Files:**
- Create: `F:/git/TavernKeeper/src/git/checkout.ts`
- Create: `F:/git/TavernKeeper/src/scanners/static-rules.ts`
- Create: `F:/git/TavernKeeper/src/scanners/external-tools.ts`
- Test: `F:/git/TavernKeeper/tests/checkout.test.ts`
- Test: `F:/git/TavernKeeper/tests/static-rules.test.ts`
- Test: `F:/git/TavernKeeper/tests/external-tools.test.ts`

**Interfaces:**
- Consumes: a GitHub repository slug, full SHA, inventory text samples, and an injected `CommandRunner`.
- Produces: `checkoutExactTarget(spec): Promise<Result<CheckoutResult>>`, `scanStaticRules(files): Finding[]`, and `runExternalTools(spec): Promise<ToolRun[]>`.

- [ ] **Step 1: Write failing tests that assert argument-array execution, SHA validation, redaction, and incomplete missing-tool coverage**

```ts
expect(calls).toContainEqual(expect.objectContaining({ command: "git", args: ["checkout", "--detach", fullSha] }));
expect(findings[0].evidence).not.toContain("ghp_secretvalue");
expect(missingTool).toMatchObject({ status: "unavailable", findings: [] });
```

- [ ] **Step 2: Run the three focused test files and confirm missing implementations**

- [ ] **Step 3: Implement checkout with `GIT_LFS_SKIP_SMUDGE=1`, disabled hooks, no submodules, no shell, and a maximum 20-commit log; implement normalized built-in rules and adapters for Gitleaks, OpenGrep, OSV-Scanner, zizmor, and malcontent**

```ts
const environment = { ...baseEnvironment, GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" };
await runner.run("git", ["-c", "core.hooksPath=/dev/null", "checkout", "--detach", targetSha], { cwd, environment });
```

- [ ] **Step 4: Run focused tests, typecheck, and confirm every finding fingerprint is stable across repeated runs**

- [ ] **Step 5: Commit the deterministic scanner slice**

```bash
git add src/git src/scanners tests
git commit -m "feat: scan exact commits without executing targets"
```

### Task 4: Optional MiniMax Evidence Review and Orchestration

**Files:**
- Create: `F:/git/TavernKeeper/src/model/minimax-review.ts`
- Create: `F:/git/TavernKeeper/src/orchestrator/scan-handler.ts`
- Test: `F:/git/TavernKeeper/tests/minimax-review.test.ts`
- Test: `F:/git/TavernKeeper/tests/scan-handler.test.ts`

**Interfaces:**
- Consumes: normalized deterministic findings, redacted snippets, recent change metadata, scan mode, and injected `fetch`.
- Produces: `reviewEvidence(spec): Promise<Result<ModelReview, ModelReviewErrorCode>>` and `scanRepository(spec): Promise<Result<ScanReport>>`.

- [ ] **Step 1: Write failing tests for model-disabled standard scans, strict JSON validation, token/file caps, and status derivation**

```ts
expect(fetchMock).not.toHaveBeenCalled();
expect(report.status).toBe("incomplete");
expect(report.coverage.tools.find((tool) => tool.name === "gitleaks")?.status).toBe("unavailable");
expect(JSON.stringify(requestBody)).not.toContain("ghp_secretvalue");
```

- [ ] **Step 2: Run focused tests and confirm missing-module failures**

- [ ] **Step 3: Implement an OpenAI-compatible MiniMax request using `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, and `MINIMAX_MODEL`; parse the response with Zod and merge model findings without allowing the model to lower deterministic severities**

```ts
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxOutputTokens }),
});
```

- [ ] **Step 4: Run focused tests and typecheck; confirm disabled/malformed model review degrades to `incomplete` without losing deterministic findings**

- [ ] **Step 5: Commit model review and orchestration**

```bash
git add src/model src/orchestrator tests
git commit -m "feat: add bounded optional evidence review"
```

### Task 5: Immutable Reports, Batch CLI, and TavernKeeper Automation

**Files:**
- Create: `F:/git/TavernKeeper/src/report/report-writer.ts`
- Create: `F:/git/TavernKeeper/src/cli/run-batch.ts`
- Create: `F:/git/TavernKeeper/tests/report-writer.test.ts`
- Create: `F:/git/TavernKeeper/tests/run-batch.test.ts`
- Create: `F:/git/TavernKeeper/.github/workflows/ci.yml`
- Create: `F:/git/TavernKeeper/.github/workflows/scan.yml`
- Create: `F:/git/TavernKeeper/.github/workflows/deploy-pages.yml`
- Create: `F:/git/TavernKeeper/README.md`
- Create: `F:/git/TavernKeeper/SECURITY.md`
- Create: `F:/git/TavernKeeper/LICENSE`

**Interfaces:**
- Consumes: target manifest URL, existing report index, scan mode, batch limit, and `scanRepository`.
- Produces: `reports/github/{repository_id}/{target_sha}/report.json`, matching `index.html`, `reports/index.json`, and `npm run scan`.

- [ ] **Step 1: Write failing tests for immutable paths, sanitized HTML, changed-SHA selection, and stable index ordering**

```ts
expect(reportPath).toContain(`/github/42/${fullSha}/report.json`);
expect(html).not.toContain("ghp_secretvalue");
expect(selected.map((target) => target.target_sha)).toEqual([newSha]);
```

- [ ] **Step 2: Run focused tests and confirm missing implementations**

- [ ] **Step 3: Implement atomic JSON writes, escaped static HTML, index reconstruction, manifest fetch, rescan policy, batch limits, and sequential temporary-directory cleanup**

```ts
const reportDirectory = join(outputRoot, "github", String(target.repository_id), target.target_sha);
await writeAtomic(join(reportDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
```

- [ ] **Step 4: Add pinned CI, scheduled/manual scan, and Pages workflows; run `npm run check` and parse all workflow YAML in tests**

- [ ] **Step 5: Commit TavernKeeper publication**

```bash
git add .github README.md SECURITY.md LICENSE src tests package.json package-lock.json
git commit -m "feat: publish immutable TavernKeeper reports"
```

### Task 6: Tavernary Report Import and Catalog Mapping

**Files:**
- Create: `data/schemas/tavernkeeper-report-index.schema.json`
- Create: `data/security/tavernkeeper-reports.json`
- Create: `scripts/security/import-tavernkeeper-reports.mjs`
- Create: `scripts/security/import-tavernkeeper-reports.d.mts`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `package.json`
- Test: `tests/unit/import-tavernkeeper-reports.test.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/validate-catalog.test.ts`

**Interfaces:**
- Consumes: public TavernKeeper report index plus current source registry and snapshots.
- Produces: sanitized local index and `CatalogProject.securityReview: CatalogSecurityReview | null` with `freshness: "current" | "outdated"`.

- [ ] **Step 1: Write failing tests for schema rejection, host/path allowlisting, source identity matching, secret-field stripping, shared-source mapping, and freshness**

```ts
expect(result.ok).toBe(true);
expect(JSON.stringify(result.index)).not.toContain("findings");
expect(catalog.projects[0].securityReview).toMatchObject({ targetSha: oldSha, freshness: "outdated" });
expect(catalog.projects[1].securityReview).toEqual(catalog.projects[0].securityReview);
```

- [ ] **Step 2: Run the three focused test files and confirm missing contract failures**

- [ ] **Step 3: Implement strict import validation and atomic writes; validate the committed index in catalog validation; map one report summary to every public card backed by its source**

```ts
export interface CatalogSecurityReview {
  status: "no-high-confidence-indicators" | "review-suggested" | "incomplete" | "failed";
  targetSha: string;
  scannedAt: string;
  reportUrl: string;
  mode: "standard" | "deep";
  freshness: "current" | "outdated";
  summary: { critical: number; high: number; medium: number; low: number; info: number };
}
```

- [ ] **Step 4: Run focused tests, `npm run catalog:validate`, `npm run catalog:build`, and `npm run typecheck`**

- [ ] **Step 5: Commit the Tavernary import contract**

```bash
git add data/security data/schemas scripts/security scripts/catalog src/features/catalog/catalog-types.ts package.json tests/unit
git commit -m "feat(security): import TavernKeeper scan summaries"
```

### Task 7: Tavernary Card Link and Import Workflow

**Files:**
- Create: `src/features/catalog/components/project-security-review.tsx`
- Modify: `src/features/catalog/components/project-grid.tsx`
- Modify: `src/styles/catalog.css`
- Create: `.github/workflows/import-tavernkeeper-reports.yml`
- Modify: `tests/unit/project-card.test.tsx`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**
- Consumes: `CatalogProject.securityReview`.
- Produces: a sibling link labeled `TavernKeeper · {sha7}` and a six-hour scheduled import workflow with `contents: write` only.

- [ ] **Step 1: Write failing UI and workflow tests for separate anchors, exact SHA label, outdated wording, no pending badge, pinned actions, and importer-before-commit ordering**

```tsx
expect(screen.getByRole("link", { name: /TavernKeeper report.*abcdef0.*outdated/i })).toHaveAttribute("href", reportUrl);
expect(screen.getByRole("link", { name: "Memory Tool" })).not.toContainElement(reportLink);
expect(screen.queryByText(/not scanned/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run `npm test -- tests/unit/project-card.test.tsx tests/unit/workflows.test.ts` and confirm failures**

- [ ] **Step 3: Implement the compact squared sibling link and layout spacing; implement the pinned scheduled/manual workflow that imports, validates, tests, commits only the sanitized index when changed, rebases, pushes, and dispatches Pages**

```tsx
<a className={`project-security-review ${review.freshness}`} href={review.reportUrl}
  target="_blank" rel="noopener noreferrer" aria-label={accessibleLabel}>
  TavernKeeper <span aria-hidden="true">·</span> {review.targetSha.slice(0, 7)}
</a>
```

- [ ] **Step 4: Run focused tests, `npm run check`, and inspect the static export for `security/tavernkeeper-targets.json`**

- [ ] **Step 5: Commit the Tavernary UI and automation**

```bash
git add .github/workflows/import-tavernkeeper-reports.yml src/features/catalog/components src/styles/catalog.css tests/unit
git commit -m "feat(security): link exact-SHA scan reports"
```

### Task 8: Cross-Repository Contract and Threat-Model Verification

**Files:**
- Modify: `README.md`
- Create: `docs/tavernkeeper-integration.md`
- Modify: `F:/git/TavernKeeper/README.md`
- Modify: `F:/git/TavernKeeper/SECURITY.md`

**Interfaces:**
- Consumes: both checked-in schemas, sample generated target manifest, and sample report index.
- Produces: operator documentation and evidence that both repositories agree on version 1 contracts.

- [ ] **Step 1: Add a cross-contract test that parses Tavernary's generated manifest with TavernKeeper and parses a TavernKeeper index with Tavernary's importer**

```ts
expect(TargetManifestSchema.parse(JSON.parse(manifestText)).schema_version).toBe(1);
expect((await sanitizeReportIndex(index, registry)).ok).toBe(true);
```

- [ ] **Step 2: Run the cross-contract test and confirm it fails before fixture wiring**

- [ ] **Step 3: Document status semantics, exact-SHA freshness, scanner coverage, no-execution boundary, report retention, model data flow, required secrets, and incident reporting**

```markdown
TavernKeeper reports what it observed at one immutable commit. A current report is not a guarantee that a repository is safe, and an outdated report says nothing about later commits.
```

- [ ] **Step 4: Run both repositories' complete check suites, inspect both git diffs, and scan for leaked credential-shaped strings**

```bash
npm run check
rg -n "(ghp_|github_pat_|sk-[A-Za-z0-9])" . --glob '!package-lock.json'
```

- [ ] **Step 5: Commit verified documentation and contract proof**

```bash
git add README.md docs/tavernkeeper-integration.md tests
git commit -m "docs(security): define TavernKeeper trust boundary"
```
