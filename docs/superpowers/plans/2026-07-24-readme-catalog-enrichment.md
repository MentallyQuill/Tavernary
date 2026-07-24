# README-Based Catalog Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic GitHub-backed project summaries with concise README-derived descriptions and curated metadata without allowing future GitHub snapshot refreshes to overwrite registry editorial fields.

**Architecture:** GitHub refresh remains the factual source collector and writes only repository snapshots. A separate enrichment runner consumes snapshot facts plus the repository short description and README, asks a configured model provider for a strict one-sentence summary and controlled metadata, validates the result, and writes only canonical registry records. The static catalog continues to join registry records and snapshots.

**Tech Stack:** Node.js 24 ESM scripts, TypeScript declaration files, JSON Schema, Vitest, Prettier, GitHub Actions, Next.js static catalog build, and the repository's existing controlled vocabularies.

## Global Constraints

- GitHub refreshes must stage only `data/snapshots/github/*.json`; they must never rewrite `data/registry/projects/*.json`.
- Only GitHub-backed records participate; URL-backed records and the paused organization record remain untouched.
- Summaries are one factual sentence, 12-24 target words, 140-character hard maximum, and contain no newline or markdown.
- The exact no-source fallback is `No README file found.` and it is marked curated.
- Generated primary-function and capability IDs must exist in the checked-in vocabularies.
- Existing curated records must not be selected for overwrite unless an explicit enrichment command requests them.
- A failed enrichment record keeps its prior registry file and prevents publication of that record's batch.
- Existing unrelated worktree changes must not be staged.
- The model provider adapter reads `TAVERNARY_ENRICHMENT_API_URL`, `TAVERNARY_ENRICHMENT_API_KEY`, and `TAVERNARY_ENRICHMENT_MODEL` from the runtime environment; provider credentials never enter the repository.

## Shared input shapes

The plan uses these structural shapes across the Node.js modules:

```ts
type RegistryRecord = {
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  summary: string;
  metadata_status: "provisional" | "curated";
  source: {
    type: "github" | "github-organization" | "url";
    repository?: string;
    repository_id?: number | null;
    url?: string;
  };
  frontends: string[];
  primary_function: string;
  capabilities: string[];
  visibility: "published" | "hidden";
  refresh_policy: "automatic" | "paused";
};

type GithubSnapshot = {
  project_id: string;
  repository: {
    id: number;
    owner: string;
    name: string;
    url: string;
    default_branch: string;
    description: string | null;
    head_sha: string;
  };
  readme: { found: boolean; path: string | null; ref: string | null };
  source_health: "healthy" | "unavailable" | "identity-change" | "deleted" | "private";
};

type VocabularyEntry = { id: string; label: string; description: string };
type VocabularySet = {
  primaryFunctions: VocabularyEntry[];
  capabilities: VocabularyEntry[];
};
```

---

### Task 1: Extend GitHub snapshots with enrichment inputs

**Files:**
- Modify: `scripts/catalog/refresh-github.mjs:249-260, 312-377`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `data/schemas/repository-snapshot.schema.json:21-45`
- Test: `tests/unit/refresh-snapshot-format.test.ts`
- Test: `tests/unit/refresh-failure-recovery.test.ts`

**Interfaces:**
- Produce `repository.description: string | null`.
- Produce `readme: { found: boolean; path: string | null; ref: string | null }`.
- Preserve the existing snapshot fields and failure-recovery behavior.

- [ ] **Step 1: Write failing snapshot contract tests**

Add tests that construct a refreshed snapshot and assert the repository description and README provenance serialize, validate, and survive unchanged-source refreshes. Add a missing-README case with `found: false`, `path: null`, and the default-branch ref.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
npm.cmd test -- --run tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-failure-recovery.test.ts
```

Expected: FAIL because the snapshot builder and schema do not yet expose the enrichment inputs.

- [ ] **Step 3: Implement source collection**

Extend `repositoryFacts()` with the GitHub API `description`. Add an optional README API request for `/repos/{owner}/{repo}/readme`; treat 404, empty content, binary content, and inaccessible README content as `found: false` while retaining a healthy repository snapshot. Record the README path and default-branch ref without storing full README text in the public snapshot.

- [ ] **Step 4: Update declarations and schema**

Add the new object fields to the declaration file and JSON schema with `additionalProperties: false`. Keep `description` nullable and README provenance nullable when not found.

- [ ] **Step 5: Run focused tests and format**

Run:

```powershell
npm.cmd test -- --run tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-failure-recovery.test.ts
npm.cmd exec -- prettier --check scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/repository-snapshot.schema.json tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-failure-recovery.test.ts
```

Expected: all focused tests pass and Prettier reports all files matched.

- [ ] **Step 6: Commit the source-input contract**

```powershell
git add scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/repository-snapshot.schema.json tests/unit/refresh-snapshot-format.test.ts tests/unit/refresh-failure-recovery.test.ts
git commit -m "feat(catalog): capture README enrichment inputs"
```

---

### Task 2: Add the summary and metadata validator

**Files:**
- Create: `scripts/catalog/enrichment-contract.mjs`
- Create: `scripts/catalog/enrichment-contract.d.mts`
- Test: `tests/unit/enrichment-contract.test.ts`
- Modify: `data/schemas/project.schema.json:7-29`

**Interfaces:**

```ts
type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  primary_function: string;
  capabilities: string[];
};

export function validateEnrichmentOutput(
  output: EnrichmentOutput,
  vocabularies: VocabularySet,
): { valid: true } | { valid: false; errors: string[] };
```

- [ ] **Step 1: Write failing validator tests**

Cover a valid one-sentence summary, the exact fallback, over-140-character output, more than 24 words, newlines, markdown/list syntax, multiple sentence endings, unknown vocabulary IDs, and a non-curated status.

- [ ] **Step 2: Run the validator tests and verify failure**

Run:

```powershell
npm.cmd test -- --run tests/unit/enrichment-contract.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement deterministic validation**

Reject empty summaries, line breaks, markdown markers, list prefixes, text over 140 characters, summaries outside the 12-24 target word range except the exact fallback, multiple sentence boundaries, and vocabulary IDs missing from `frontends.json`, `primary-functions.json`, or `capabilities.json`. Allow the exact fallback as a valid curated output.

- [ ] **Step 4: Add schema-level metadata rules**

Keep the project schema's existing enum for `metadata_status`, and add validation tests ensuring enriched outputs use `curated`, controlled function IDs, and controlled capability IDs.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrichment-contract.test.ts
npm.cmd exec -- prettier --check scripts/catalog/enrichment-contract.mjs scripts/catalog/enrichment-contract.d.mts tests/unit/enrichment-contract.test.ts data/schemas/project.schema.json
git add scripts/catalog/enrichment-contract.mjs scripts/catalog/enrichment-contract.d.mts tests/unit/enrichment-contract.test.ts data/schemas/project.schema.json
git commit -m "feat(catalog): validate enriched project metadata"
```

---

### Task 3: Build the README source loader and provider boundary

**Files:**
- Create: `scripts/catalog/readme-source.mjs`
- Create: `scripts/catalog/readme-source.d.mts`
- Test: `tests/unit/readme-source.test.ts`

**Interfaces:**

```ts
type ReadmeSource = {
  repositoryDescription: string | null;
  readmeText: string | null;
  readmePath: string | null;
  readmeRef: string | null;
};

export async function loadReadmeSource(
  record: RegistryRecord,
  snapshot: GithubSnapshot,
  options?: { github?: GithubClient },
): Promise<ReadmeSource>;
```

- [ ] **Step 1: Write failing source-loader tests**

Use a fake GitHub client to cover short-description precedence, README fallback, missing README, empty README, binary README, default-branch retrieval, and an existing snapshot with no README provenance.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/readme-source.test.ts
```

Expected: FAIL because the loader module does not exist.

- [ ] **Step 3: Implement source loading**

Use the snapshot's repository identity and default branch. Prefer a non-empty repository description as the primary input, otherwise fetch and decode the README through the GitHub API. Normalize BOMs and line endings, strip binary content and obvious badge-only content, and return `null` when no usable text exists. Do not invent text from the project name.

- [ ] **Step 4: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/readme-source.test.ts
npm.cmd exec -- prettier --check scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/readme-source.test.ts
git add scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/readme-source.test.ts
git commit -m "feat(catalog): load README enrichment sources"
```

---

### Task 4: Add model-assisted enrichment with a strict provider adapter

**Files:**
- Create: `scripts/catalog/enrich-readmes.mjs`
- Create: `scripts/catalog/enrich-readmes.d.mts`
- Create: `scripts/catalog/enrichment-provider.mjs`
- Create: `scripts/catalog/enrichment-provider.d.mts`
- Test: `tests/unit/enrich-readmes.test.ts`

**Interfaces:**

```ts
type EnrichmentInput = {
  id: string;
  name: string;
  kind: string;
  repository: string;
  repositoryDescription: string | null;
  readmeText: string | null;
  frontends: string[];
  allowedPrimaryFunctions: VocabularyEntry[];
  allowedCapabilities: VocabularyEntry[];
};

type EnrichmentProvider = {
  generate(input: EnrichmentInput): Promise<EnrichmentOutput>;
};

export async function enrichRecord(
  record: RegistryRecord,
  snapshot: GithubSnapshot,
  provider: EnrichmentProvider,
): Promise<EnrichmentOutput>;
```

- [ ] **Step 1: Write failing enrichment tests**

Use a fake provider to assert that the loader receives the short description and README, the provider receives only the allowed vocabulary entries, curated records are skipped by default, the fallback is produced when both sources are unavailable, and provider failures leave the source record unchanged.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes.test.ts
```

Expected: FAIL because the enrichment modules do not exist.

- [ ] **Step 3: Implement the provider contract**

Create a provider adapter with a strict structured-output request. The prompt must require one factual sentence, 12-24 words, 140 characters maximum, no markdown, no unsupported claims, one controlled primary-function ID, and zero or more controlled capability IDs. Include the exact fallback rule for missing source text. Keep provider configuration outside registry files and inject it through the CLI/runtime.

- [ ] **Step 4: Implement record selection and enrichment**

Select only published GitHub records with `metadata_status: provisional`, a generic intake summary, or an explicit `--force` request. Preserve existing curated summaries by default. Validate the provider result before returning it; do not silently truncate model output because truncation can change meaning.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes.test.ts
npm.cmd exec -- prettier --check scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts tests/unit/enrich-readmes.test.ts
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts tests/unit/enrich-readmes.test.ts
git commit -m "feat(catalog): generate README project metadata"
```

---

### Task 5: Add atomic registry writes and enrichment reporting

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Create: `scripts/catalog/enrichment-report.mjs`
- Create: `scripts/catalog/enrichment-report.d.mts`
- Test: `tests/unit/enrichment-report.test.ts`
- Test: `tests/unit/enrichment-write-safety.test.ts`

**Interfaces:**

```ts
type EnrichmentReport = {
  generated_at: string;
  selected: number;
  enriched: string[];
  fallback: string[];
  skipped: string[];
  failed: Array<{ id: string; reason: string }>;
};

export async function writeEnrichedRecord(
  path: string,
  record: RegistryRecord,
  output: EnrichmentOutput,
): Promise<void>;
```

- [ ] **Step 1: Write failing write-safety tests**

Assert that the writer changes only the target registry file, preserves source identity and non-editorial fields, writes valid JSON in repository formatting, and refuses to overwrite a record when validation fails.

- [ ] **Step 2: Implement atomic writes and report generation**

Write to a sibling temporary file, rename into place, and generate a report with enriched, fallback, skipped, and failed IDs. A failed record keeps its original file. Exit nonzero when any record fails so the workflow cannot publish a partial invalid batch.

- [ ] **Step 3: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrichment-report.test.ts tests/unit/enrichment-write-safety.test.ts
npm.cmd exec -- prettier --check scripts/catalog/enrich-readmes.mjs scripts/catalog/enrichment-report.mjs scripts/catalog/enrichment-report.d.mts tests/unit/enrichment-report.test.ts tests/unit/enrichment-write-safety.test.ts
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrichment-report.mjs scripts/catalog/enrichment-report.d.mts tests/unit/enrichment-report.test.ts tests/unit/enrichment-write-safety.test.ts
git commit -m "feat(catalog): publish enrichment reports safely"
```

---

### Task 6: Add the enrichment CLI and batch controls

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `package.json:scripts`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Test: `tests/unit/enrich-readmes-cli.test.ts`

**Interfaces:**

```text
npm run catalog:enrich -- --mode backfill --start-index 0 --batch-size 20
npm run catalog:enrich -- --project-id <id>
npm run catalog:enrich -- --force --project-id <id>
```

- [ ] **Step 1: Write failing CLI tests**

Cover default batch size 20, deterministic sorted selection, `--project-id`, `--force`, report output, and refusal to include non-GitHub sources.

- [ ] **Step 2: Implement CLI selection and execution**

Load registry records, snapshots, and vocabularies from the canonical data directories. Use the same zero-based backfill semantics as `catalog:refresh`. Require the provider configuration for records needing generation; use the exact fallback without a provider when both source texts are unavailable.

- [ ] **Step 3: Add the npm command and run focused tests**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes-cli.test.ts
npm.cmd exec -- prettier --check package.json scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts tests/unit/enrich-readmes-cli.test.ts
```

Expected: all CLI tests pass.

- [ ] **Step 4: Commit the CLI**

```powershell
git add package.json scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts tests/unit/enrich-readmes-cli.test.ts
git commit -m "feat(catalog): add README enrichment batches"
```

---

### Task 7: Protect the GitHub refresh workflow and add enrichment publication

**Files:**
- Modify: `.github/workflows/refresh-catalog.yml`
- Create: `.github/workflows/enrich-catalog.yml`
- Test: `tests/unit/workflows.test.ts`
- Test: `tests/unit/refresh-github-workflow-safety.test.ts`

**Interfaces:**
- `refresh-catalog.yml` stages only `data/snapshots/github/*.json`.
- `enrich-catalog.yml` stages only `data/registry/projects/*.json` and its report.
- Both workflows use bounded `workflow_dispatch` inputs and the existing serialized catalog concurrency group.

- [ ] **Step 1: Write failing workflow safety tests**

Assert that the refresh workflow does not contain registry paths in `git add`, that the enrichment workflow does not stage snapshots, that both workflows use `npm run check`, and that the enrichment workflow publishes only after the enrichment command succeeds.

- [ ] **Step 2: Make snapshot commits resilient to concurrent main updates**

Before the refresh workflow pushes, fetch and rebase `origin/main` with a bounded retry loop. If a snapshot conflict occurs, fail with a project/file-specific message rather than force-pushing or touching registry content. Keep the existing backfill continuation gated on a successful commit.

- [ ] **Step 3: Add the enrichment workflow**

Run the enrichment CLI with the configured provider secret/model settings, validate the generated registry, run the full check, commit only registry files and the machine-readable report, push, and dispatch deployment. Keep generated summaries in the registry so later refreshes cannot overwrite them.

- [ ] **Step 4: Run workflow tests and commit**

```powershell
npm.cmd test -- --run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
npm.cmd exec -- prettier --check .github/workflows/refresh-catalog.yml .github/workflows/enrich-catalog.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git add .github/workflows/refresh-catalog.yml .github/workflows/enrich-catalog.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git commit -m "ci(catalog): separate snapshot and metadata publication"
```

---

### Task 8: Verify card presentation and complete the enrichment rollout

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`
- Test: `tests/e2e/catalog.spec.ts`
- Test: `tests/visual/catalog.visual.spec.ts`
- Test: `tests/unit/build-catalog.test.ts`

- [ ] **Step 1: Add summary rendering assertions**

Assert that a generated summary is present, the exact fallback renders without the provisional-details state, and the summary element remains within the existing four-line clamp at standard and compact card widths.

- [ ] **Step 2: Add full-catalog acceptance assertions**

During partial rollout, assert no generated record has invalid summary shape. At completion, assert every published GitHub-backed record has `metadata_status: curated`, a non-template summary, valid vocabulary IDs, and either a README-derived source or the exact fallback.

- [ ] **Step 3: Run the verification suite**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run catalog:validate
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:export
npm.cmd run test:e2e -- tests/e2e/catalog.spec.ts
npm.cmd run test:visual -- tests/visual/catalog.visual.spec.ts
```

Expected: all commands pass, generated card summaries are fully legible, and no registry file is changed by a snapshot-only refresh.

- [ ] **Step 4: Run the bounded enrichment batches**

Start the enrichment workflow in batches of 20 for the 204 GitHub-backed repository records. Confirm each batch's report, commit, validation, and deployment before advancing. Record the final counts of enriched summaries, fallback summaries, skipped records, and failures.

- [ ] **Step 5: Commit rollout evidence**

Commit the final enrichment report and any acceptance-test updates separately from generated registry content, then verify the deployed catalog contains the final summaries and hidden provisional state.

---

## Final self-review checklist

- Every design decision has a task: source precedence, fallback, automatic publication, four-line summary limit, curated state, overwrite protection, GitHub-only scope, and post-refresh verification.
- The refresh and enrichment workflows have disjoint write sets.
- Every new module has a declared interface and focused tests before implementation.
- No task relies on a model response without deterministic schema and presentation validation.
- No task changes non-GitHub records or hosts README contents publicly.
