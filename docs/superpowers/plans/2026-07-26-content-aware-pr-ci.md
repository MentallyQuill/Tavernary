# Content-Aware Pull Request CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route routine published-content pull requests through a focused catalog validation, build, and browser-smoke stack while retaining Tavernary's complete CI matrix for every application or mixed change.

**Architecture:** A pure repository-owned classifier is the single source of truth for content paths. The existing Linux `verify` job computes the complete branch diff, exports `content` or `full`, and conditionally runs package-owned check stacks; the existing Windows `visual` job runs only for `full`. Frozen catalog totals are replaced with generated-data expectations and durable invariants so content-only merges cannot make later full CI stale.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Vitest, npm scripts, GitHub Actions YAML, Playwright Chromium.

## Global Constraints

- Modify the existing `.github/workflows/ci.yml`; do not create another GitHub Action or workflow.
- Do not change project submission, Kit, refresh, enrichment, backfill, lifecycle, or deployment workflow behavior.
- Content routing is based on the complete changed-path set, never branch names, labels, authors, titles, or pull request prose.
- Empty, malformed, unknown, mixed, or unclassifiable diffs select `full`.
- Keep the existing workflow name `Site: Validate changes` and job name `verify`.
- Keep CI permissions exactly `contents: read`.
- Do not add a third-party path-filter Action or another dependency.
- Schemas, moderation data, reports, historical intake, docs, workflows, source, scripts, tests, and configuration select `full`.
- Do not commit during execution unless the user explicitly requests a commit.

---

## File Map

- Create `scripts/ci/classify-pr-paths.mjs`: pure path policy plus NUL-delimited CLI input.
- Create `scripts/ci/classify-pr-paths.d.mts`: public TypeScript contract for tests.
- Create `tests/unit/classify-pr-paths.test.ts`: exhaustive classifier behavior.
- Modify `tests/unit/validate-catalog.test.ts`: derive project totals from registry files.
- Modify `tests/unit/build-catalog.test.ts`: remove mutable whole-catalog totals while retaining output invariants.
- Modify `tests/unit/full-catalog-data.test.ts`: replace exact mutable distributions with domain validation.
- Modify `tests/unit/static-export-verification.test.ts`: use arbitrary fixture counts, not the live catalog total.
- Modify `tests/e2e/catalog.spec.ts`: derive live heading and card totals from generated catalog data.
- Modify `tests/e2e/static-export.spec.ts`: derive rendered totals from generated catalog data.
- Modify `tests/e2e/kits-empty.spec.ts`: derive the restored catalog total from generated data.
- Modify `package.json`: own the focused unit, browser, and aggregate content-check commands.
- Modify `tests/unit/workflows.test.ts`: specify routing, stable names, permissions, and full/content stacks.
- Modify `.github/workflows/ci.yml`: classify once and conditionally execute the two stacks.
- Modify `docs/superpowers/specs/2026-07-26-content-aware-pr-ci-design.md` only if implementation reveals a contract correction.

---

### Task 1: Implement the Published-Content Path Classifier

**Files:**

- Create: `scripts/ci/classify-pr-paths.mjs`
- Create: `scripts/ci/classify-pr-paths.d.mts`
- Create: `tests/unit/classify-pr-paths.test.ts`

**Interfaces:**

- Consumes: an iterable of repository-relative changed paths.
- Produces:

```ts
export type PullRequestCiRoute = "content" | "full";

export interface PullRequestCiClassification {
  route: PullRequestCiRoute;
  reason: "content-only" | "empty-diff" | "invalid-path" | "full-path";
  path?: string;
}

export function classifyPullRequestPaths(
  paths: Iterable<string>,
): PullRequestCiClassification;
```

- CLI: `node scripts/ci/classify-pr-paths.mjs --paths-file <file>` reads a
  NUL-delimited path file and prints only `content` or `full` to stdout.

- [ ] **Step 1: Write the failing classifier tests**

Create `tests/unit/classify-pr-paths.test.ts` with literal, table-driven
expectations:

```ts
import { describe, expect, test } from "vitest";

import { classifyPullRequestPaths } from "../../scripts/ci/classify-pr-paths.mjs";

describe("pull request CI path classification", () => {
  test.each([
    "data/registry/projects/example-extension.json",
    "data/registry/projects/example-frontend.json",
    "data/registry/projects/example-preset.json",
    "data/registry/kits/example-kit.json",
    "data/snapshots/github/example-extension.json",
    "data/snapshots/github/kits/example-kit.json",
    "data/snapshots/github-refresh.json",
    "data/vocabularies/frontends.json",
    "data/vocabularies/model-families.json",
    "data/vocabularies/completion-formats.json",
  ])("routes published content %s through focused CI", (path) => {
    expect(classifyPullRequestPaths([path])).toEqual({
      route: "content",
      reason: "content-only",
    });
  });

  test("routes multiple published content files together", () => {
    expect(
      classifyPullRequestPaths([
        "data/registry/projects/example.json",
        "data/snapshots/github/example.json",
        "data/vocabularies/frontends.json",
      ]),
    ).toEqual({ route: "content", reason: "content-only" });
  });

  test.each([
    "src/features/catalog/components/project-card.tsx",
    "scripts/catalog/build.mjs",
    "tests/unit/build-catalog.test.ts",
    ".github/workflows/ci.yml",
    "data/schemas/project.schema.json",
    "data/moderation/blocked-github-users.json",
    "data/reports/enrichment-report.json",
    "data/catalog/projects.json",
    "docs/README.md",
    "package.json",
  ])("routes non-content path %s through full CI", (path) => {
    expect(classifyPullRequestPaths([path])).toEqual({
      route: "full",
      reason: "full-path",
      path,
    });
  });

  test("routes mixed content and code through full CI", () => {
    expect(
      classifyPullRequestPaths([
        "data/registry/projects/example.json",
        "src/app/page.tsx",
      ]),
    ).toEqual({
      route: "full",
      reason: "full-path",
      path: "src/app/page.tsx",
    });
  });

  test.each([
    [],
    [""],
    ["   "],
    ["../data/registry/projects/example.json"],
    ["/data/registry/projects/example.json"],
    ["data/registry/projects/nested/example.json"],
    ["data/registry/projects/example.yaml"],
  ])("fails closed for malformed paths %#", (paths) => {
    expect(classifyPullRequestPaths(paths).route).toBe("full");
  });

  test("normalizes Windows path separators", () => {
    expect(
      classifyPullRequestPaths([
        "data\\registry\\projects\\example-extension.json",
      ]),
    ).toEqual({ route: "content", reason: "content-only" });
  });
});
```

- [ ] **Step 2: Run the classifier tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/classify-pr-paths.test.ts
```

Expected: FAIL because `scripts/ci/classify-pr-paths.mjs` does not exist.

- [ ] **Step 3: Implement the minimal pure classifier**

Create `scripts/ci/classify-pr-paths.mjs`:

```js
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const contentPatterns = [
  /^data\/registry\/projects\/[^/]+\.json$/u,
  /^data\/registry\/kits\/[^/]+\.json$/u,
  /^data\/snapshots\/github\/[^/]+\.json$/u,
  /^data\/snapshots\/github\/kits\/[^/]+\.json$/u,
  /^data\/snapshots\/github-refresh\.json$/u,
  /^data\/vocabularies\/[^/]+\.json$/u,
];

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function classifyPullRequestPaths(paths) {
  const normalized = [...paths].map((path) => normalizePath(String(path)));
  if (normalized.length === 0) {
    return { route: "full", reason: "empty-diff" };
  }

  for (const path of normalized) {
    if (!path || path.trim() !== path || path.startsWith("/") || path.includes("..")) {
      return { route: "full", reason: "invalid-path", path };
    }
    if (!contentPatterns.some((pattern) => pattern.test(path))) {
      return { route: "full", reason: "full-path", path };
    }
  }

  return { route: "content", reason: "content-only" };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--paths-file") {
    throw new Error("Usage: classify-pr-paths.mjs --paths-file <file>");
  }
  const buffer = await readFile(argv[1]);
  const paths = buffer
    .toString("utf8")
    .split("\0")
    .filter((path, index, all) => path.length > 0 || index < all.length - 1);
  process.stdout.write(classifyPullRequestPaths(paths).route);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

Create the matching declaration in
`scripts/ci/classify-pr-paths.d.mts` using the interface above.

- [ ] **Step 4: Run classifier tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/classify-pr-paths.test.ts
```

Expected: all classifier cases PASS.

- [ ] **Step 5: Exercise the real NUL-delimited CLI**

Create a temporary NUL-delimited file using PowerShell, invoke the actual CLI,
then delete only that explicit temporary file:

```powershell
$ciPathsFile = Join-Path $env:TEMP "tavernary-ci-paths-$PID.bin"
[System.IO.File]::WriteAllBytes(
  $ciPathsFile,
  [System.Text.Encoding]::UTF8.GetBytes(
    "data/registry/projects/example.json`0data/snapshots/github/example.json`0"
  )
)
node scripts/ci/classify-pr-paths.mjs --paths-file $ciPathsFile
Remove-Item -LiteralPath $ciPathsFile
```

Expected stdout: `content`.

- [ ] **Step 6: Checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

Expected: only the classifier implementation, declaration, test, and previously
approved design/plan documents are new or modified.

---

### Task 2: Remove Mutable Whole-Catalog Count Locks

**Files:**

- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `tests/unit/static-export-verification.test.ts`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/static-export.spec.ts`
- Modify: `tests/e2e/kits-empty.spec.ts`

**Interfaces:**

- Consumes: current registry files and `src/generated/catalog.json`.
- Produces: assertions whose expected counts come from source/generated data,
  while preserving uniqueness, validation, sorting, URL, and visibility
  contracts.

- [ ] **Step 1: Add generated-catalog count helpers for browser tests**

Reuse the parsed `catalog` object already present in `tests/e2e/catalog.spec.ts`.
In the other affected Playwright files, read
`src/generated/catalog.json` with `readFileSync` and `resolve`, matching the
existing pattern in `catalog.spec.ts`. Define:

```ts
const projectCount = catalog.projects.length;
const projectHeading = `${projectCount} ${
  projectCount === 1 ? "project" : "projects"
}`;
```

Use the correct relative path for each test directory. Replace only live catalog
totals:

```ts
await expect(
  page.getByRole("heading", { name: projectHeading }),
).toBeVisible();
await expect(page.locator(".project-card")).toHaveCount(projectCount);
```

For canonical links:

```ts
await expect(page.locator('.project-card[href^="https://"]')).toHaveCount(
  projectCount,
);
```

Do not change fixed fixture counts or product-rule limits.

- [ ] **Step 2: Make unit expectations independent of mutable totals**

In `tests/unit/validate-catalog.test.ts`, derive the expected count directly
from registry JSON filenames:

```ts
const expectedProjectCount = await countJsonFiles("data/registry/projects");
expect(result.projectCount).toBe(expectedProjectCount);
```

In `tests/unit/build-catalog.test.ts`, rename the live-catalog test to:

```ts
test("builds every eligible public card with valid source states", async () => {
```

Remove exact total, exact source-distribution total, and exact manual-ID-list
assertions. Retain these independent invariants:

```ts
expect(catalog.projects.length).toBeGreaterThan(0);
expect(new Set(catalog.projects.map(({ id }) => id)).size).toBe(
  catalog.projects.length,
);
expect(catalog.projects.map(({ id }) => id)).toEqual(
  [...catalog.projects.map(({ id }) => id)].sort(),
);
expect(
  Object.keys(sourceStatuses).every((status) =>
    ["healthy", "manual", "pending", "stale"].includes(status),
  ),
).toBe(true);
```

Retain focused known-record assertions only when they verify transformation
behavior rather than the catalog's mutable membership.

In `tests/unit/full-catalog-data.test.ts`, replace exact `records.length`,
kind distribution, source distribution, and enrichment-policy distribution
objects with:

```ts
expect(records.length).toBeGreaterThan(0);
expect(ids.size).toBe(records.length);

for (const record of records) {
  expect(["extension", "frontend", "preset"], record.id).toContain(record.kind);
  expect(["github", "github-organization", "url"], record.id).toContain(
    record.source.type,
  );
  expect(["automatic", "manual"], record.id).toContain(
    record.enrichment_policy,
  );
}
```

Keep rules that every automatic record omits `enrichment_note`, every manual
record supplies it, URL licensing is valid, IDs are unique, and all records
validate.

In `tests/unit/static-export-verification.test.ts`, use arbitrary fixture
counts such as `7` and `12`; test the parser's behavior rather than the live
catalog's total.

- [ ] **Step 3: Run focused unit and browser tests to expose incorrect edits**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/static-export-verification.test.ts
npm.cmd run build
npm.cmd run test:e2e -- tests/e2e/static-export.spec.ts tests/e2e/kits-empty.spec.ts
```

Expected: all modified assertions PASS against the current catalog.

- [ ] **Step 4: Scan for remaining mutable live totals**

Run:

```powershell
rg -n '211 projects|toHaveCount\(211\)|toHaveLength\(211\)|toBe\(211\)|github: 204|automatic: 204' tests
```

Expected: no live-catalog count locks remain. Any remaining numeric count must
belong to a fixed fixture or product rule and be documented by its test name.

- [ ] **Step 5: Checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

---

### Task 3: Define the Focused Content Check Stack

**Files:**

- Modify: `package.json`
- Test: the focused unit and browser suites selected by the scripts.

**Interfaces:**

- Produces:

```json
{
  "test:content": "vitest run tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/validate-kits.test.ts tests/unit/static-export-verification.test.ts",
  "test:content-e2e": "node scripts/run-playwright.mjs tests/e2e/static-export.spec.ts",
  "check:content": "npm run format:check && npm run catalog:validate && npm run catalog:build && npm run test:content && npm run build && npm run verify:export"
}
```

- [ ] **Step 1: Add a failing package-script contract test**

Add a test to `tests/unit/workflows.test.ts` that reads `package.json` and
asserts the three exact script boundaries:

```ts
test("owns the focused content checks in package scripts", async () => {
  const packageDocument = JSON.parse(await readFile("package.json", "utf8"));
  expect(packageDocument.scripts["test:content"]).toContain(
    "tests/unit/validate-catalog.test.ts",
  );
  expect(packageDocument.scripts["test:content"]).toContain(
    "tests/unit/validate-kits.test.ts",
  );
  expect(packageDocument.scripts["test:content-e2e"]).toBe(
    "node scripts/run-playwright.mjs tests/e2e/static-export.spec.ts",
  );
  expect(packageDocument.scripts["check:content"]).toContain(
    "npm run catalog:validate",
  );
  expect(packageDocument.scripts["check:content"]).toContain("npm run build");
  expect(packageDocument.scripts["check:content"]).not.toContain("npm test");
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because the content scripts do not exist.

- [ ] **Step 3: Add the package-owned content scripts**

Add the exact scripts under `package.json`'s existing `"scripts"` object:

```json
"test:content": "vitest run tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/validate-kits.test.ts tests/unit/static-export-verification.test.ts",
"test:content-e2e": "node scripts/run-playwright.mjs tests/e2e/static-export.spec.ts",
"check:content": "npm run format:check && npm run catalog:validate && npm run catalog:build && npm run test:content && npm run build && npm run verify:export"
```

- [ ] **Step 4: Run the package contract and complete content stack**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
npm.cmd run check:content
npx.cmd playwright install chromium
npm.cmd run test:content-e2e
```

Expected: contract test PASS; content static/unit/build/export checks PASS;
focused Chromium smoke PASS.

- [ ] **Step 5: Record the focused stack size and duration**

Capture the number of Vitest tests and Playwright tests printed by the commands.
The result must be materially below the complete 800-plus test matrix and must
contain exactly the intended catalog validation/build/render coverage.

- [ ] **Step 6: Checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

---

### Task 4: Route the Existing CI Workflow

**Files:**

- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `classify-pr-paths.mjs --paths-file`, `npm run check:content`,
  `npm run test:content-e2e`, existing full scripts.
- Produces: `jobs.verify.outputs.route` with `content` or `full`.

- [ ] **Step 1: Replace the monolithic workflow expectation with route contracts**

Update the existing `keeps CI read-only and runs every local gate` test and add
focused tests that assert:

```ts
test("keeps one read-only CI workflow with a stable verify job", async () => {
  const ci = await workflow("ci");
  expect(ci.permissions).toEqual({ contents: "read" });
  expect(ci.jobs.verify).toBeDefined();
  expect(ci.jobs.verify.outputs.route).toContain("steps.route.outputs.route");
});

test("classifies pull request and dispatched branch diffs fail closed", async () => {
  const source = await readFile(
    resolve(workflowDirectory, "ci.yml"),
    "utf8",
  );
  expect(source).toContain("github.event.pull_request.base.sha");
  expect(source).toContain("github.event.pull_request.head.sha");
  expect(source).toContain("git merge-base origin/main HEAD");
  expect(source).toContain("classify-pr-paths.mjs --paths-file");
  expect(source).toContain('route="full"');
});

test("runs mutually selected content and full Linux stacks", async () => {
  const ci = await workflow("ci");
  const steps = ci.jobs.verify.steps as Array<{
    if?: string;
    run?: string;
  }>;
  expect(steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        if: "steps.route.outputs.route == 'content'",
        run: "npm run check:content",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'full'",
        run: "npm run check",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'content'",
        run: "npm run test:content-e2e",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'full'",
        run: "npm run test:e2e",
      }),
    ]),
  );
});

test("runs Windows visual and Kit checks only for full CI", async () => {
  const ci = await workflow("ci");
  expect(ci.jobs.visual.needs).toBe("verify");
  expect(ci.jobs.visual.if).toBe(
    "needs.verify.outputs.route == 'full'",
  );
});

test("does not install a path-filter action", async () => {
  const ci = await workflow("ci");
  expect(
    allSteps(ci).some((step) => step.uses?.includes("paths-filter")),
  ).toBe(false);
});
```

Keep the existing assertions proving all full commands and Windows runner
selection remain present.

- [ ] **Step 2: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: routing tests FAIL because `ci.yml` has no classifier output or
conditional stacks.

- [ ] **Step 3: Add fail-closed classification to the existing verify job**

Modify `.github/workflows/ci.yml`:

```yaml
jobs:
  verify:
    runs-on: ubuntu-latest
    outputs:
      route: ${{ steps.route.outputs.route }}
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
        with:
          fetch-depth: 0
      - name: Classify changed paths
        id: route
        shell: bash
        env:
          EVENT_NAME: ${{ github.event_name }}
          PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -u
          route="full"
          paths_file="${RUNNER_TEMP}/ci-changed-paths.bin"
          base_sha=""
          head_sha=""

          if [[ "$EVENT_NAME" == "pull_request" ]]; then
            base_sha="$PR_BASE_SHA"
            head_sha="$PR_HEAD_SHA"
          elif git fetch origin main &&
            base_sha="$(git merge-base origin/main HEAD)" &&
            head_sha="$(git rev-parse HEAD)"; then
            :
          fi

          if [[ -n "$base_sha" && -n "$head_sha" ]] &&
            git cat-file -e "${base_sha}^{commit}" &&
            git cat-file -e "${head_sha}^{commit}" &&
            git diff --name-only -z "$base_sha" "$head_sha" > "$paths_file"; then
            classified="$(
              node scripts/ci/classify-pr-paths.mjs --paths-file "$paths_file"
            )" || classified="full"
            if [[ "$classified" == "content" || "$classified" == "full" ]]; then
              route="$classified"
            fi
          fi

          echo "route=$route" >> "$GITHUB_OUTPUT"
          echo "Selected CI route: $route"
```

Do not reuse the classifier's stdout for shell execution. Accept only the two
literal route values before writing the output.

- [ ] **Step 4: Conditionally run the Linux stacks**

Keep setup and Chromium installation shared, then replace the monolithic steps:

```yaml
      - name: Run focused content checks
        if: steps.route.outputs.route == 'content'
        run: npm run check:content
      - name: Run complete static and unit checks
        if: steps.route.outputs.route == 'full'
        run: npm run check
      - name: Install Chromium
        run: npx playwright install --with-deps chromium
      - name: Run focused content browser smoke
        if: steps.route.outputs.route == 'content'
        run: npm run test:content-e2e
      - name: Run complete browser tests
        if: steps.route.outputs.route == 'full'
        run: npm run test:e2e
```

- [ ] **Step 5: Gate the existing Windows visual job**

Add only this job condition:

```yaml
  visual:
    needs: verify
    if: needs.verify.outputs.route == 'full'
    runs-on: windows-latest
```

Do not alter any Windows build, browser, visual, or Kit step.

- [ ] **Step 6: Run workflow and classifier tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/classify-pr-paths.test.ts tests/unit/workflows.test.ts
```

Expected: all classifier and workflow routing contracts PASS.

- [ ] **Step 7: Parse the actual YAML and inspect both route commands**

Run:

```powershell
node --input-type=module -e "import fs from 'node:fs'; import { parse } from 'yaml'; const ci=parse(fs.readFileSync('.github/workflows/ci.yml','utf8')); console.log(JSON.stringify({outputs:ci.jobs.verify.outputs,verify:ci.jobs.verify.steps.map(({name,if:condition,run})=>({name,if:condition,run})),visualIf:ci.jobs.visual.if},null,2));"
```

Expected: valid YAML; stable `verify`; both conditional stacks; visual condition
equals the full-route expression.

- [ ] **Step 8: Checkpoint without committing**

Run:

```powershell
git diff --check
git status --short
```

---

### Task 5: Complete Regression Verification

**Files:**

- Verify all modified files.
- Modify the design spec only if verified implementation differs from its
  contract.

**Interfaces:**

- Produces: evidence that the focused route and unchanged full route both pass
  locally.

- [ ] **Step 1: Run the focused content stack**

Run:

```powershell
npm.cmd run check:content
npm.cmd run test:content-e2e
```

Expected: all content validation, generation, focused unit, build, export, and
browser checks PASS.

- [ ] **Step 2: Run the complete static and unit gate**

Run:

```powershell
npm.cmd run check
```

Expected: complete formatting, lint, palette, catalog, typecheck, unit, build,
and export checks PASS.

- [ ] **Step 3: Run the complete browser suite**

Run:

```powershell
npm.cmd run test:e2e
```

Expected: all application browser tests PASS.

- [ ] **Step 4: Run the Windows visual and Kit suites**

Run:

```powershell
npm.cmd run test:visual
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
npm.cmd run test:kits-visual
```

Expected: catalog visual, Kit fixture build, Kit browser, and Kit visual suites
PASS without production changes to those paths.

- [ ] **Step 5: Perform path-route mutation checks**

Invoke the real classifier CLI with separate NUL-delimited files and confirm:

- project plus snapshot returns `content`;
- Kit plus Kit snapshot returns `content`;
- project plus `src/app/page.tsx` returns `full`;
- schema-only returns `full`;
- empty file returns `full`.

Expected: every result matches the fail-closed design.

- [ ] **Step 6: Review workflow scope**

Run:

```powershell
git diff --name-only
git diff -- .github/workflows
```

Expected: `.github/workflows/ci.yml` is the only modified workflow. Existing
submission, Kit, refresh, enrichment, backfill, lifecycle, and deployment
workflows have no diff.

- [ ] **Step 7: Final whitespace and status checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated user files modified.

- [ ] **Step 8: Report without committing**

Report:

- exact focused Vitest and Playwright counts;
- complete gate results;
- classifier mutation results;
- workflow-scope proof;
- any skipped test with its concrete reason.

Do not commit or push unless the user explicitly asks.
