# README Enrichment Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsafe single-batch enrichment command with a tested MiniMax M3 preflight, five-card canary, stable chained rollout, and one bounded retry per failed card.

**Architecture:** Preserve the schema-v2 status-driven GitHub refresh architecture and add the repository short description to its existing batched GraphQL observation. Keep refresh responsible only for repository snapshots and enrichment responsible only for four editorial registry fields. When a healthy snapshot has no usable short description, enrichment fetches the README on demand at that snapshot's exact head SHA. A source-readiness boundary, deterministic README preparation, strict provider adapter, and committed run-state ledger drive fixed manifest batches instead of recalculating mutable indexes. GitHub Actions publishes each verified successful subset, resumes from committed state, and retries failed IDs once after the primary phase.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Ajv/JSON Schema, Vitest 4, Prettier, GitHub Actions, GitHub CLI, Next.js static export, and an OpenAI Chat Completions-compatible MiniMax M3 endpoint.

## Global Constraints

- Work only in the existing `feature/readme-catalog-enrichment` worktree until branch integration.
- Before Task 1, fetch and rebase the clean feature branch onto current `origin/main`, then rerun the existing unit and catalog checks.
- This repository is pre-alpha. Replace the unsafe `backfill`/`start_index` enrichment interface in place; do not add legacy compatibility.
- The expected model identifier is exactly `MiniMax-M3`.
- Each provider request has a 120-second timeout.
- A card receives at most one primary model call and one retry model call.
- Default batch size is 20 and default provider concurrency is four.
- Prepared README input is at most 8,000 characters.
- Summaries are exactly one factual sentence, target 12-24 words, maximum 140 characters, and contain no markdown or newlines.
- The exact confirmed-no-source fallback is `No README file found.`.
- A fallback is curated with `primary_function: "uncategorized"` and no capabilities.
- Missing, invalid, stale, unhealthy, or mismatched snapshots never produce the fallback.
- Non-GitHub records and already curated non-generic records remain untouched.
- Enrichment writes only `summary`, `metadata_status`, `primary_function`, and `capabilities`.
- Refresh stages only `data/snapshots/github/*.json` and `data/snapshots/github-refresh.json`.
- Refresh never probes README endpoints per repository; it obtains short descriptions through the existing batched GraphQL query.
- Enrichment treats only an authenticated README `404` at `repository.head_sha` as confirmation for `No README file found.`.
- Repository identity backfill is a distinct command, workflow, and commit.
- Do not begin catalog-wide source preparation until the live provider preflight and five-card canary pass.
- Never write API credentials, authorization headers, raw README text, full prompts, or raw provider responses to logs or reports.
- Preserve unrelated user changes and stage only task-owned files.

## File and responsibility map

**Create:**

- `scripts/catalog/readme-preparation.mjs` — deterministic untrusted README cleanup and 8,000-character bounding.
- `scripts/catalog/readme-preparation.d.mts` — public preparation signature.
- `scripts/catalog/enrichment-run-state.mjs` — immutable manifest creation, next-batch selection, phase transitions, retry queue, and aggregate counts.
- `scripts/catalog/enrichment-run-state.d.mts` — run-state and attempt-result types.
- `tests/unit/readme-preparation.test.ts` — cleanup and size-limit tests.
- `tests/unit/enrichment-provider.test.ts` — MiniMax M3 request, timeout, response, and redaction tests.
- `tests/unit/enrichment-run-state.test.ts` — stable primary/retry state-machine tests.
- `.github/workflows/backfill-repository-identities.yml` — separate targeted/full identity migration.

**Modify:**

- `scripts/catalog/readme-source.mjs` and `.d.mts` — snapshot readiness and explicit source-result union.
- `scripts/catalog/github-observer.mjs` and `.d.mts` — include GitHub short descriptions in existing batched GraphQL observations.
- `scripts/catalog/refresh-github.mjs` and `.d.mts` — persist the observed description in schema-v2 repository facts.
- `data/schemas/repository-snapshot.schema.json` — allow the nullable repository description without adding README provenance.
- `scripts/catalog/enrichment-provider.mjs` and `.d.mts` — strict MiniMax M3 provider and preflight metadata.
- `scripts/catalog/enrich-readmes.mjs` and `.d.mts` — bounded workers, partial success, preflight/canary/start/resume CLI modes.
- `scripts/catalog/enrichment-report.mjs` and `.d.mts` — durable sanitized run-state serialization and workflow summary.
- `scripts/catalog/backfill-repository-identities.mjs` — repeated project-ID filtering for canary preparation.
- `scripts/catalog/repository-identity-backfill.mjs` and `.d.mts` — optional allowed-ID set.
- `.github/workflows/enrich-catalog.yml` — preflight, canary, full initialization, resume, commit, deployment verification, and self-dispatch.
- `.github/workflows/refresh-catalog.yml` — preserve status-driven modes, dynamic baseline continuation, and snapshot-only publication.
- `.github/workflows/deploy-pages.yml` — ignore report-only pushes while continuing to deploy registry and snapshot changes.
- `tests/unit/readme-source.test.ts`
- `tests/unit/github-observer.test.ts`
- `tests/unit/refresh-github.test.ts`
- `tests/unit/enrich-readmes.test.ts`
- `tests/unit/enrich-readmes-cli.test.ts`
- `tests/unit/enrichment-report.test.ts`
- `tests/unit/enrichment-write-safety.test.ts`
- `tests/unit/repository-identity-backfill.test.ts`
- `tests/unit/refresh-github-workflow-safety.test.ts`
- `tests/unit/workflows.test.ts`
- `tests/e2e/catalog.spec.ts`

## Shared interfaces

Use these exact concepts across tasks:

```ts
type RegistryRecord = {
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  summary: string;
  metadata_status: "provisional" | "curated";
  visibility: string;
  frontends: string[];
  source: {
    type: "github";
    repository: string;
    repository_id: number | null;
  };
};

type GithubSnapshot = {
  schema_version: 2;
  project_id: string;
  source_health:
    | "healthy"
    | "unavailable"
    | "identity-change"
    | "deleted"
    | "private";
  stale_since: string | null;
  repository: {
    id: number;
    owner: string;
    name: string;
    head_sha: string;
    head_committed_at: string | null;
    description?: string | null;
    default_branch: string;
    url: string;
    archived: boolean;
    created_at: string;
    size_kb: number;
  };
};

type EnrichmentInput = {
  id: string;
  name: string;
  kind: string;
  repository: string;
  repositoryDescription: string | null;
  readmeText: string | null;
  frontends: string[];
  allowedPrimaryFunctions: Array<{ id: string; label?: string }>;
  allowedCapabilities: Array<{ id: string; label?: string }>;
};

type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  primary_function: string;
  capabilities: string[];
};

type SourceReasonCode =
  | "missing-snapshot"
  | "invalid-snapshot"
  | "unhealthy-source"
  | "stale-source"
  | "project-mismatch"
  | "repository-mismatch"
  | "identity-mismatch"
  | "missing-permanent-identity"
  | "readme-fetch-failed"
  | "readme-rate-limited"
  | "readme-server-error"
  | "readme-unusable";

type FailureReasonCode =
  | SourceReasonCode
  | "provider-timeout"
  | "provider-rate-limited"
  | "provider-server-error"
  | "provider-response-invalid"
  | "provider-model-mismatch"
  | "output-invalid"
  | "record-missing"
  | "record-ineligible";

type SourceReadiness =
  | { status: "ready"; snapshot: GithubSnapshot }
  | {
      status: "source-not-ready";
      reasonCode: SourceReasonCode;
      message: string;
    };

type EnrichmentSource =
  | {
      status: "ready";
      sourceKind: "description" | "readme";
      text: string;
      readmePath: string | null;
      readmeRef: string | null;
      repositoryId: number;
      headSha: string;
    }
  | {
      status: "fallback";
      sourceKind: "confirmed-fallback";
      repositoryId: number;
      headSha: string;
    }
  | {
      status: "source-not-ready" | "failed";
      reasonCode: SourceReasonCode;
      message: string;
    };

type ProviderResult = {
  output: EnrichmentOutput;
  metadata: {
    requestedModel: "MiniMax-M3";
    returnedModel: string | null;
    latencyMs: number;
  };
};

type EnrichmentProvider = {
  generate(input: EnrichmentInput): Promise<ProviderResult>;
};

type AttemptOutcome =
  | "enriched"
  | "fallback"
  | "source-not-ready"
  | "retry-pending"
  | "retry-enriched"
  | "retry-fallback"
  | "final-failure"
  | "skipped";

type ProjectAttemptResult = {
  id: string;
  phase: "primary" | "retry";
  outcome:
    | "enriched"
    | "fallback"
    | "source-not-ready"
    | "failed"
    | "skipped";
  output?: EnrichmentOutput;
  sourceKind?: "description" | "readme" | "confirmed-fallback";
  repositoryId?: number;
  headSha?: string;
  readmePath?: string | null;
  readmeRef?: string | null;
  provider?: ProviderResult["metadata"];
  reasonCode?: FailureReasonCode;
  message?: string;
};

type EnrichmentRunEntry = {
  id: string;
  attempt: 1 | 2;
  phase: "primary" | "retry";
  outcome: AttemptOutcome;
  source_kind?: "description" | "readme" | "confirmed-fallback";
  repository_id?: number;
  head_sha?: string;
  readme_path?: string | null;
  readme_ref?: string | null;
  requested_model?: "MiniMax-M3";
  returned_model?: string | null;
  reason_code?: FailureReasonCode;
  message?: string;
  completed_at: string;
};

type EnrichmentRunState = {
  schema_version: 1;
  run_id: string;
  mode: "canary" | "full";
  status: "running" | "passed" | "failed" | "complete";
  phase: "primary" | "retry" | "complete";
  expected_model: "MiniMax-M3";
  batch_size: number;
  concurrency: number;
  created_at: string;
  updated_at: string;
  manifest: string[];
  primary_cursor: number;
  retry_queue: string[];
  retry_cursor: number;
  attempts: Record<string, number>;
  entries: Record<string, EnrichmentRunEntry>;
  aggregates: Record<AttemptOutcome, number>;
};
```

---

### Task 1: Integrate schema-v2 descriptions and enforce source readiness

**Files:**

- Modify: `scripts/catalog/github-observer.mjs`
- Modify: `scripts/catalog/github-observer.d.mts`
- Modify: `scripts/catalog/refresh-github.mjs`
- Modify: `scripts/catalog/refresh-github.d.mts`
- Modify: `data/schemas/repository-snapshot.schema.json`
- Modify: `scripts/catalog/readme-source.mjs`
- Modify: `scripts/catalog/readme-source.d.mts`
- Test: `tests/unit/github-observer.test.ts`
- Test: `tests/unit/refresh-github.test.ts`
- Test: `tests/unit/readme-source.test.ts`

**Interfaces:**

- Produce `createSnapshotValidator(schema): (snapshot: unknown) => boolean`.
- Produce `assessSourceReadiness(record, snapshot, validateSnapshot): SourceReadiness`.
- Produce `loadReadmeSource(record, snapshot, options): Promise<EnrichmentSource>`.
- Consume an Ajv-compatible `validateSnapshot(snapshot): boolean` callback compiled once by the CLI.

- [ ] **Step 1: Write failing schema-v2 observation tests**

Assert that the existing batched GraphQL query requests `description`, the observer preserves a string or `null`, `repositoryFacts()` writes it into new schema-v2 snapshots, and the schema accepts both values. Assert that neither the observer nor refresh calls `/readme`.

- [ ] **Step 2: Run the observation tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts tests/unit/refresh-github.test.ts
```

Expected: FAIL because schema-v2 observations do not yet carry the GitHub short description.

- [ ] **Step 3: Add description to the optimized refresh path**

Add `description` to each repository selection in `github-observer.mjs`, preserve it in the parsed observation type, and copy it into `snapshot.repository` from `repositoryFacts()`. Add a nullable, optional `description` property to `repository-snapshot.schema.json` so checked-in snapshots remain valid during the rollout while every newly refreshed snapshot receives the field. Do not add README path, found, content, or provenance fields and do not add REST calls per repository.

- [ ] **Step 4: Replace null-source tests with explicit readiness cases**

Add a complete healthy schema-v2 fixture with `project_id`, `source_health`, `stale_since`, repository identity, `head_sha`, and an optional description. Add a table test:

```ts
const wrongRepository = {
  ...healthy,
  repository: { ...healthy.repository, owner: "Other" },
};
const wrongIdentity = {
  ...healthy,
  repository: { ...healthy.repository, id: 99 },
};
const recordWithoutId = {
  ...record,
  source: { ...record.source, repository_id: null },
};

test.each([
  ["missing snapshot", undefined, "missing-snapshot"],
  ["invalid schema", { ...healthy, schema_version: 0 }, "invalid-snapshot"],
  ["unhealthy", { ...healthy, source_health: "unavailable" }, "unhealthy-source"],
  ["stale", { ...healthy, stale_since: "2026-07-24T00:00:00.000Z" }, "stale-source"],
  ["wrong project", { ...healthy, project_id: "other" }, "project-mismatch"],
  ["wrong repository", wrongRepository, "repository-mismatch"],
  ["wrong identity", wrongIdentity, "identity-mismatch"],
  ["missing identity", healthy, "missing-permanent-identity", recordWithoutId],
])("%s never becomes a fallback", async (_name, candidate, reasonCode, candidateRecord = record) => {
  const source = await loadReadmeSource(candidateRecord, candidate, {
    validateSnapshot: (value) => value?.schema_version === 2,
  });
  expect(source).toMatchObject({ status: "source-not-ready", reasonCode });
});
```

Also assert:

- a healthy non-empty description is returned without a README request;
- a healthy absent/null description requests `/repos/{owner}/{name}/readme?ref={head_sha}`;
- a successful README records the returned path and requested head-SHA ref;
- a README `404` returns `status: "fallback"`;
- HTTP 429, HTTP 5xx, timeout/network failure, malformed base64, binary data, empty text, and unusable text return `status: "failed"` rather than fallback.

- [ ] **Step 5: Run the source tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/readme-source.test.ts
```

Expected: FAIL because the transplanted loader expects snapshot-v1 README provenance and fetches from the mutable default branch.

- [ ] **Step 6: Implement the schema-v2 readiness decision tree**

Build `createSnapshotValidator()` with Ajv using the same URI and UTC date-time formats as `scripts/catalog/validate.mjs`. Implement ordered checks so the first failure returns a controlled reason:

```js
export function assessSourceReadiness(record, snapshot, validateSnapshot) {
  if (!snapshot) return notReady("missing-snapshot");
  if (!validateSnapshot(snapshot)) return notReady("invalid-snapshot");
  if (snapshot.project_id !== record.id) return notReady("project-mismatch");
  if (snapshot.source_health !== "healthy") return notReady("unhealthy-source");
  if (snapshot.stale_since !== null) return notReady("stale-source");
  if (record.source.repository_id == null)
    return notReady("missing-permanent-identity");

  const expected = record.source.repository.toLowerCase();
  const received =
    `${snapshot.repository.owner}/${snapshot.repository.name}`.toLowerCase();
  if (expected !== received) return notReady("repository-mismatch");
  if (record.source.repository_id !== snapshot.repository.id)
    return notReady("identity-mismatch");

  return { status: "ready-to-load", snapshot };
}
```

Use controlled public messages such as `Snapshot source is unavailable.` rather than raw exception text.

- [ ] **Step 7: Make source selection explicit**

Return:

- `status: "ready", sourceKind: "description"` for a non-empty repository description;
- `status: "ready", sourceKind: "readme"` after successful retrieval;
- `status: "fallback"` only for an authenticated GitHub `404`;
- `status: "failed"` for every other fetch, decode, or preparation problem.

Fetch the README using `snapshot.repository.head_sha` as the URL-encoded `ref` so the content matches the snapshot revision. Never fall back to the mutable default branch. Keep README path and ref on the `EnrichmentSource` result for report generation only.

- [ ] **Step 8: Update declarations and run focused tests**

```powershell
npm.cmd test -- --run tests/unit/github-observer.test.ts tests/unit/refresh-github.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts
npx.cmd prettier --check scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/repository-snapshot.schema.json scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/github-observer.test.ts tests/unit/refresh-github.test.ts tests/unit/readme-source.test.ts
```

Expected: all focused tests pass and formatting matches.

- [ ] **Step 9: Commit the schema-v2 source boundary**

```powershell
git add scripts/catalog/github-observer.mjs scripts/catalog/github-observer.d.mts scripts/catalog/refresh-github.mjs scripts/catalog/refresh-github.d.mts data/schemas/repository-snapshot.schema.json scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/github-observer.test.ts tests/unit/refresh-github.test.ts tests/unit/readme-source.test.ts tests/unit/enrich-readmes.test.ts
git commit -m "fix(catalog): gate enrichment sources"
```

---

### Task 2: Bound and sanitize README input

**Files:**

- Create: `scripts/catalog/readme-preparation.mjs`
- Create: `scripts/catalog/readme-preparation.d.mts`
- Create: `tests/unit/readme-preparation.test.ts`
- Modify: `scripts/catalog/readme-source.mjs`
- Modify: `scripts/catalog/readme-source.d.mts`

**Interfaces:**

```ts
export function prepareReadmeText(
  raw: string,
  options?: { maxCharacters?: number },
): string | null;
```

- [ ] **Step 1: Write deterministic cleaning tests**

Cover UTF-8 text containing badges, linked images, HTML comments, `<script>`/`<style>` blocks, fenced code, install commands, navigation boilerplate, Overview/Features/Usage sections, whitespace, and embedded instructions such as `Ignore previous instructions`.

```ts
const noisyReadme = `
# Fixture
[![badge](badge.svg)](https://example.test)
<!-- navigation -->
<script>ignorePreviousInstructions()</script>

## Overview
Coordinates character memories across chats.

## Installation
\`\`\`sh
npm install
\`\`\`

## Features
- Reviews stored memories before generation.
`;

test("keeps descriptive sections but removes executable and visual noise", () => {
  const prepared = prepareReadmeText(noisyReadme);
  expect(prepared).toContain("# Fixture");
  expect(prepared).toContain("## Overview");
  expect(prepared).toContain("Coordinates character memories across chats.");
  expect(prepared).not.toMatch(/badge|npm install|<script>|```/i);
});

test("caps prepared input at exactly 8000 characters", () => {
  expect(prepareReadmeText(`# Tool\n\n${"Useful project details. ".repeat(1000)}`))
    .toHaveLength(8000);
});
```

The injection sentence may remain as quoted source data if it is in a descriptive paragraph; provider hardening in Task 3 prevents following it. Script/style and code instructions must be removed.

- [ ] **Step 2: Run the new tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/readme-preparation.test.ts
```

Expected: FAIL because the preparation module does not exist.

- [ ] **Step 3: Implement deterministic preparation**

Use ordered transformations:

```js
const DEFAULT_MAX_CHARACTERS = 8000;
const USEFUL_HEADINGS = /^(overview|about|purpose|features?|usage|what it does)$/iu;

export function prepareReadmeText(raw, options = {}) {
  const maximum = options.maxCharacters ?? DEFAULT_MAX_CHARACTERS;
  const normalized = raw
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, "")
    .replace(/```[\s\S]*?```/gu, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/<img\b[^>]*>/giu, "");

  const selected = selectIntroductionAndUsefulSections(
    normalized,
    USEFUL_HEADINGS,
  );
  const compact = selected.replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
  return compact.length === 0 ? null : compact.slice(0, maximum);
}
```

Implement `selectIntroductionAndUsefulSections()` in the same focused module. Keep the title and opening prose, then include recognized descriptive sections in source order until the character limit is reached.

- [ ] **Step 4: Route decoded README text through preparation**

Call `prepareReadmeText(decoded)` from `readme-source.mjs`. When a successful README response cannot be prepared into usable text, return:

```js
{
  status: "failed",
  reasonCode: "readme-unusable",
  message: "The recorded README did not contain usable UTF-8 description text.",
}
```

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/readme-preparation.test.ts tests/unit/readme-source.test.ts
npx.cmd prettier --check scripts/catalog/readme-preparation.mjs scripts/catalog/readme-preparation.d.mts scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/readme-preparation.test.ts tests/unit/readme-source.test.ts
git add scripts/catalog/readme-preparation.mjs scripts/catalog/readme-preparation.d.mts scripts/catalog/readme-source.mjs scripts/catalog/readme-source.d.mts tests/unit/readme-preparation.test.ts tests/unit/readme-source.test.ts
git commit -m "fix(catalog): bound README model input"
```

---

### Task 3: Harden and verify the MiniMax M3 provider

**Files:**

- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Create: `tests/unit/enrichment-provider.test.ts`

**Interfaces:**

```ts
export const EXPECTED_ENRICHMENT_MODEL: "MiniMax-M3";
export const ENRICHMENT_TIMEOUT_MS: 120000;

export function validateProviderConfiguration(input: {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
}): { apiUrl: string; apiKey: string; model: "MiniMax-M3" };

export function createEnrichmentProvider(options: {
  apiUrl: string;
  apiKey: string;
  model: "MiniMax-M3";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}): {
  generate(input: EnrichmentInput): Promise<ProviderResult>;
};
```

- [ ] **Step 1: Write provider contract tests**

Assert:

- missing URL, key, or model fails before `fetch`;
- any model other than `MiniMax-M3` fails closed;
- the request body contains `"model":"MiniMax-M3"`;
- the system prompt calls repository content untrusted data and says not to follow embedded instructions;
- the request uses strict JSON Schema;
- response metadata returns requested model, optional returned model, and latency;
- absent `choices[0].message.content`, malformed JSON, 429, and 5xx become controlled provider errors;
- authorization values and raw payloads never appear in thrown messages.

```ts
expect(body.messages[0].content).toMatch(/untrusted reference data/i);
expect(body.messages[0].content).toMatch(/do not follow.*instructions/i);
expect(body.model).toBe("MiniMax-M3");
expect(result.metadata).toEqual({
  requestedModel: "MiniMax-M3",
  returnedModel: "MiniMax-M3",
  latencyMs: 250,
});
```

- [ ] **Step 2: Write and verify the 120-second abort test**

Use fake timers and a fetch stub that rejects when its signal aborts:

```ts
vi.useFakeTimers();
const pending = provider.generate(input);
await vi.advanceTimersByTimeAsync(120_000);
await expect(pending).rejects.toMatchObject({ code: "provider-timeout" });
vi.useRealTimers();
```

Run:

```powershell
npm.cmd test -- --run tests/unit/enrichment-provider.test.ts
```

Expected: FAIL because configuration enforcement, timeout, metadata, and safe errors do not exist.

- [ ] **Step 3: Implement strict configuration and controlled errors**

Add `EnrichmentProviderError` with controlled codes:

```js
const safeProviderMessages = {
  "provider-timeout": "The enrichment provider timed out after 120 seconds.",
  "provider-rate-limited": "The enrichment provider returned HTTP 429.",
  "provider-server-error": "The enrichment provider returned a server error.",
  "provider-response-invalid": "The enrichment provider returned invalid structured content.",
};
```

Do not include response bodies or credential-bearing request data.

- [ ] **Step 4: Implement the abort signal and metadata**

Create one `AbortController` per call, pass `signal`, clear the timer in `finally`, parse the current Chat Completions-compatible response, and return:

```js
{
  output: JSON.parse(content),
  metadata: {
    requestedModel: EXPECTED_ENRICHMENT_MODEL,
    returnedModel:
      typeof payload.model === "string" ? payload.model : null,
    latencyMs: now() - startedAt,
  },
}
```

If `payload.model` exists and is not `MiniMax-M3`, fail with `provider-model-mismatch`.

- [ ] **Step 5: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrichment-provider.test.ts tests/unit/enrichment-contract.test.ts
npx.cmd prettier --check scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts tests/unit/enrichment-provider.test.ts
git add scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts tests/unit/enrichment-provider.test.ts
git commit -m "fix(catalog): harden MiniMax enrichment"
```

---

### Task 4: Add immutable enrichment run state

**Files:**

- Create: `scripts/catalog/enrichment-run-state.mjs`
- Create: `scripts/catalog/enrichment-run-state.d.mts`
- Create: `tests/unit/enrichment-run-state.test.ts`

**Interfaces:**

```ts
export function createEnrichmentRunState(input: {
  mode: "canary" | "full";
  manifest: string[];
  runId: string;
  now: string;
  batchSize?: number;
  concurrency?: number;
}): EnrichmentRunState;

export function selectNextRunBatch(state: EnrichmentRunState): {
  phase: "primary" | "retry";
  projectIds: string[];
  attempt: 1 | 2;
};

export function applyAttemptResults(
  state: EnrichmentRunState,
  results: ProjectAttemptResult[],
  now: string,
): EnrichmentRunState;

export function assertFullRolloutAllowed(
  previous: EnrichmentRunState,
): void;
```

- [ ] **Step 1: Write the mutable-pagination regression test**

```ts
test("attempts every frozen manifest ID even after earlier records become curated", () => {
  const ids = (count: number, offset = 0) =>
    Array.from(
      { length: count },
      (_, index) => `project-${String(index + offset).padStart(3, "0")}`,
    );
  const successes = (projectIds: string[]) =>
    projectIds.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    }));

  let state = createEnrichmentRunState({
    mode: "full",
    manifest: ids(60),
    runId: "run-1",
    now: "2026-07-24T00:00:00.000Z",
    batchSize: 20,
  });
  expect(selectNextRunBatch(state).projectIds).toEqual(ids(20, 0));
  state = applyAttemptResults(
    state,
    successes(ids(20, 0)),
    "2026-07-24T00:01:00.000Z",
  );
  expect(selectNextRunBatch(state).projectIds).toEqual(ids(20, 20));
});
```

Add tests for alphabetical deduplication, immutable manifest, primary cursor advancement, failure queue ordering, primary-to-retry transition, attempt counts of one then two, final failure, resume from serialized state, and terminal completion.

- [ ] **Step 2: Add canary state tests**

Assert exactly five unique IDs are required, canary does not silently self-expand, all success produces `status: "passed"`, failed primary results move to retry, failed retry produces `status: "failed"`, and `assertFullRolloutAllowed()` accepts only a passed MiniMax M3 canary.

- [ ] **Step 3: Run the state tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts
```

Expected: FAIL because the durable state module does not exist.

- [ ] **Step 4: Implement pure state transitions**

Keep every function free of filesystem and network effects. `selectNextRunBatch()` slices only `state.manifest` or `state.retry_queue`. `applyAttemptResults()`:

- increments the phase cursor for every attempted ID;
- sets attempt count to one or two;
- appends a primary failure exactly once to `retry_queue`;
- translates retry success to `retry-enriched`/`retry-fallback`;
- translates retry failure to `final-failure`;
- marks a successful canary `passed`;
- marks a canary with terminal failures `failed`;
- marks a full run `complete` after retry exhaustion even when final failures remain.

- [ ] **Step 5: Recompute aggregates from entries**

Do not increment stored counters imperatively. Rebuild all outcome counts from `entries` after each transition so resumption cannot drift.

- [ ] **Step 6: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts
npx.cmd prettier --check scripts/catalog/enrichment-run-state.mjs scripts/catalog/enrichment-run-state.d.mts tests/unit/enrichment-run-state.test.ts
git add scripts/catalog/enrichment-run-state.mjs scripts/catalog/enrichment-run-state.d.mts tests/unit/enrichment-run-state.test.ts
git commit -m "feat(catalog): persist enrichment rollout state"
```

---

### Task 5: Process partial-success batches with bounded concurrency

**Files:**

- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/enrichment-write-safety.test.ts`

**Interfaces:**

```ts
export function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]>;

export function runEnrichmentBatch(input: {
  projectIds: string[];
  recordsById: Record<string, RegistryRecord>;
  snapshotsById: Record<string, GithubSnapshot>;
  phase: "primary" | "retry";
  provider: EnrichmentProvider;
  validateSnapshot: (snapshot: unknown) => boolean;
  concurrency?: number;
  writeRecord?: typeof writeEnrichedRecord;
}): Promise<ProjectAttemptResult[]>;
```

- [ ] **Step 1: Rewrite batch tests around project results**

Replace the old aggregate arrays with ordered per-project results. Cover enriched, fallback, source-not-ready, skipped, and failed outcomes in one mixed batch.

```ts
expect(results.map(({ id, outcome }) => ({ id, outcome }))).toEqual([
  { id: "description", outcome: "enriched" },
  { id: "fallback", outcome: "fallback" },
  { id: "stale", outcome: "source-not-ready" },
  { id: "offline", outcome: "failed" },
]);
```

Assert only enriched/fallback records call `writeRecord`, and source-not-ready/failed records preserve their original files.

- [ ] **Step 2: Add the concurrency ceiling test**

Use a deferred provider:

```ts
vi.useFakeTimers();
let active = 0;
let maximum = 0;
const generate = vi.fn(async () => {
  active += 1;
  maximum = Math.max(maximum, active);
  await new Promise((resolve) => setTimeout(resolve, 10));
  active -= 1;
  return {
    output: {
      summary:
        "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
      metadata_status: "curated" as const,
      primary_function: "developer-infrastructure",
      capabilities: ["automation"],
    },
    metadata: {
      requestedModel: "MiniMax-M3" as const,
      returnedModel: "MiniMax-M3",
      latencyMs: 10,
    },
  };
});

const pending = runEnrichmentBatch({
  projectIds: Array.from({ length: 12 }, (_, index) => `project-${index}`),
  recordsById,
  snapshotsById,
  phase: "primary",
  provider: { generate },
  validateSnapshot: () => true,
  concurrency: 4,
  writeRecord: vi.fn(async () => {}),
});
await vi.advanceTimersByTimeAsync(100);
await pending;
expect(maximum).toBe(4);
vi.useRealTimers();
```

Populate `recordsById` and `snapshotsById` from the existing healthy fixture for all 12 IDs. Also assert output order matches `projectIds` even when promises resolve out of order.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
```

Expected: FAIL because processing is serial and the old API cannot represent source-not-ready separately.

- [ ] **Step 4: Implement the worker pool**

Use a shared numeric cursor and at most `Math.min(limit, items.length)` workers. Reject limits below one or above eight; production defaults to four.

- [ ] **Step 5: Implement isolated project processing**

For each ID:

1. Find the frozen-manifest registry record.
2. Recheck eligibility and classify unexpected absence as `skipped`.
3. Load the explicit source union.
4. Return fallback without a provider call.
5. Submit ready text to the provider.
6. Validate the provider output.
7. Reject `uncategorized` when ready source text exists.
8. Atomically write only the four editorial fields.
9. Return controlled metadata and source provenance.

Catch errors per project and convert them to controlled `failed` results. Do not throw the entire batch because one record failed.

- [ ] **Step 6: Preserve write isolation under concurrent completion**

Retain `writeEnrichedRecord()`'s read-current-file, four-field merge, temporary file, and atomic rename. Extend its test to compare every non-editorial key before and after concurrent batch writes.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/enrichment-contract.test.ts
npx.cmd prettier --check scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
git commit -m "feat(catalog): isolate enrichment batch results"
```

---

### Task 6: Add preflight, canary, start, and resume CLI modes

**Files:**

- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-report.mjs`
- Modify: `scripts/catalog/enrichment-report.d.mts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`
- Modify: `tests/unit/enrichment-report.test.ts`

**Interfaces:**

```text
npm run catalog:enrich -- --mode preflight
npm run catalog:enrich -- --mode canary --project-id id-1 ... --project-id id-5
npm run catalog:enrich -- --mode start
npm run catalog:enrich -- --mode resume
```

`data/reports/enrichment-report.json` becomes the durable run-state ledger for canary/full modes. Preflight writes no repository file.

- [ ] **Step 1: Write CLI mode and argument tests**

Assert:

- `preflight` rejects missing secrets or any model except `MiniMax-M3`;
- `preflight` performs exactly one synthetic provider call and invokes no source loader/writer;
- `canary` requires exactly five unique explicit IDs;
- canary can be manually resumed only for its retry queue;
- `start` refuses unless the current report is a passed canary;
- `start` freezes the current eligible ID manifest once;
- `resume` rejects absent, malformed, canary, failed, or completed full state;
- `resume` selects the next fixed state batch;
- record-level failures return a valid report without making the CLI exit nonzero.

- [ ] **Step 2: Write report safety tests**

Build a report entry containing a multiline error, fake bearer token, README text, and provider response. Assert serialized output contains only the controlled reason code/message:

```ts
expect(JSON.stringify(report)).not.toMatch(
  /Bearer|api-key|Ignore previous instructions|choices|authorization/i,
);
expect(report.entries.fixture).toMatchObject({
  outcome: "retry-pending",
  reason_code: "provider-server-error",
  message: "The enrichment provider returned a server error.",
});
```

Assert deterministic object-key ordering and aggregate totals after JSON round-trip.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-report.test.ts
```

Expected: FAIL because only `backfill` mode and the old lossy report exist.

- [ ] **Step 4: Implement provider preflight**

Use a fixed synthetic input with checked-in vocabulary IDs and a harmless description:

```js
const preflightInput = {
  id: "provider-preflight",
  name: "Provider preflight",
  kind: "extension",
  repository: "tavernary/provider-preflight",
  repositoryDescription:
    "A synthetic source used only to verify structured catalog enrichment.",
  readmeText: null,
  frontends: ["sillytavern"],
  allowedPrimaryFunctions: vocabularies.primaryFunctions,
  allowedCapabilities: vocabularies.capabilities,
};
```

Validate the returned enrichment object and print one sanitized JSON summary with connection, requested model, returned model, latency, and validation status. Do not create `data/reports`. For canary/start/resume modes, load `data/schemas/repository-snapshot.schema.json` once and pass `createSnapshotValidator(schema)` to the batch runner.

- [ ] **Step 5: Implement canary state**

On the first `canary` invocation, create state from the five explicit IDs and process primary attempts. If the same canary state is running in retry phase, process only its retry IDs. Never dispatch continuation from the CLI.

Write passed/failed/running state atomically to `data/reports/enrichment-report.json`.

- [ ] **Step 6: Implement full start and resume**

`start` loads and validates the passed canary report, selects eligible GitHub records once, sorts IDs, creates a new full state, and processes its first primary batch. `resume` loads that full state and selects only `selectNextRunBatch(state).projectIds`.

Remove `startIndex`, `batchSize` slicing, and the old `backfill` mode. Keep batch size and concurrency as validated initialization options with defaults 20 and four.

- [ ] **Step 7: Keep per-record failures publishable**

The CLI exits nonzero only for fatal configuration, invalid state, corrupted files, failed write, or catalog-wide contract problems. Provider/source failures are committed in state and returned with exit code zero so GitHub Actions can publish successful siblings and continue.

- [ ] **Step 8: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-report.test.ts tests/unit/enrichment-run-state.test.ts tests/unit/enrich-readmes.test.ts
npx.cmd prettier --check scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-report.mjs scripts/catalog/enrichment-report.d.mts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-report.test.ts
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-report.mjs scripts/catalog/enrichment-report.d.mts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-report.test.ts
git commit -m "feat(catalog): resume enrichment rollouts"
```

---

### Task 7: Add separate targeted repository-identity preparation

**Files:**

- Modify: `scripts/catalog/backfill-repository-identities.mjs`
- Modify: `scripts/catalog/repository-identity-backfill.mjs`
- Modify: `scripts/catalog/repository-identity-backfill.d.mts`
- Modify: `tests/unit/repository-identity-backfill.test.ts`
- Create: `.github/workflows/backfill-repository-identities.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

```text
npm run catalog:backfill-identities -- --write
npm run catalog:backfill-identities -- --write --project-id id-1 ... --project-id id-5
```

- [ ] **Step 1: Write identity-filter tests**

Assert an allowed-ID set updates only matching records and reports non-selected records as skipped:

```ts
const result = backfillRepositoryIdentities(records, snapshots, {
  projectIds: new Set(["canary-a", "canary-b"]),
});
expect(result.updated.map(({ id }) => id)).toEqual(["canary-a", "canary-b"]);
expect(result.updated).not.toContainEqual(expect.objectContaining({ id: "other" }));
```

Assert duplicate/unknown CLI IDs fail before writing and that full mode with no IDs retains existing all-record behavior.

- [ ] **Step 2: Run the focused test and verify failure**

```powershell
npm.cmd test -- --run tests/unit/repository-identity-backfill.test.ts
```

Expected: FAIL because the backfill cannot target the five canary records.

- [ ] **Step 3: Implement repeated project-ID filtering**

Parse every `--project-id` occurrence, validate uniqueness and existence, filter before projection, and preserve existing healthy snapshot and identity-conflict checks. Keep `--write` explicit.

- [ ] **Step 4: Write workflow contract tests**

Require the new workflow to:

- accept newline-separated `project_ids`, with an empty value meaning all;
- share `catalog-refresh` concurrency;
- run the validated identity command;
- run `npm run catalog:validate`;
- stage only `data/registry/projects/*.json`;
- never stage snapshots or enrichment reports;
- use the same bounded fetch/rebase/push loop;
- never trigger full enrichment automatically.

- [ ] **Step 5: Preserve the optimized refresh workflow contract**

Keep `refresh-catalog.yml` on its existing schema-v2 `incremental`, `baseline`, `project`, and `forensic` modes. Existing tests must continue proving that baseline continuation is driven by `counts.provisional`, project mode does not self-expand, no arithmetic index or hard-coded catalog size exists, and only snapshots plus `github-refresh.json` are staged.

- [ ] **Step 6: Create the identity workflow**

Convert non-empty input lines into repeated `--project-id` arguments:

```bash
args=(--write)
while IFS= read -r project_id; do
  [[ -z "$project_id" ]] || args+=(--project-id "$project_id")
done <<< "$PROJECT_IDS"
npm run catalog:backfill-identities -- "${args[@]}"
```

Commit only when registry files changed, and use `chore(catalog): backfill repository identities`.

- [ ] **Step 7: Run focused tests and commit**

```powershell
npm.cmd test -- --run tests/unit/repository-identity-backfill.test.ts tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
npx.cmd prettier --check scripts/catalog/backfill-repository-identities.mjs scripts/catalog/repository-identity-backfill.mjs scripts/catalog/repository-identity-backfill.d.mts tests/unit/repository-identity-backfill.test.ts .github/workflows/backfill-repository-identities.yml tests/unit/workflows.test.ts
git add scripts/catalog/backfill-repository-identities.mjs scripts/catalog/repository-identity-backfill.mjs scripts/catalog/repository-identity-backfill.d.mts tests/unit/repository-identity-backfill.test.ts .github/workflows/backfill-repository-identities.yml tests/unit/workflows.test.ts
git commit -m "ci(catalog): isolate identity backfill"
```

---

### Task 8: Chain verified enrichment batches in GitHub Actions

**Files:**

- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`

**Interfaces:**

Workflow inputs:

```yaml
mode:
  options: [preflight, canary, start, resume]
project_ids:
  description: Five newline-separated project IDs for canary mode.
batch_size:
  default: 20
concurrency:
  default: 4
```

- [ ] **Step 1: Write workflow tests before editing YAML**

Assert:

- all four modes are present and `start_index`/`force` are absent;
- all provider secrets are passed only to the enrichment step;
- preflight cannot stage, commit, deploy, or dispatch;
- canary requires five IDs and cannot self-dispatch;
- start/resume use the report state rather than arithmetic indexes;
- registry and report are staged, snapshots are not;
- registry changes are detected separately from report-only changes;
- report-only pushes do not trigger Pages;
- mixed-result full batches can commit and continue;
- continuation dispatches only when mode is `start`/`resume` and report status is not complete;
- the full workflow shares `catalog-refresh`;
- canary waits for the Pages run associated with its pushed commit and fails if deployment fails.

- [ ] **Step 2: Run workflow tests and verify failure**

```powershell
npm.cmd test -- --run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because the workflow exposes mutable indexes and has no preflight, canary, or continuation.

- [ ] **Step 3: Replace mutable workflow inputs**

Build CLI arguments from `mode`, repeated canary IDs, batch size, and concurrency. Hard-code the expected model check in application code; pass the secret value without printing it.

For `canary`, run preflight first in the same job. If preflight fails, no card is processed.

- [ ] **Step 4: Publish partial success and durable state**

After the CLI returns:

1. Run `npm run check`.
2. Record whether `data/registry/projects` changed.
3. Stage only registry JSON files and `data/reports/enrichment-report.json`.
4. Commit even when only state changed.
5. Rebase/push with three bounded attempts.
6. Let the push-triggered Pages workflow deploy registry changes.

Do not dispatch `deploy-pages.yml` separately; the push already starts it.

- [ ] **Step 5: Avoid report-only deployments**

Add:

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "data/reports/**"
```

to `deploy-pages.yml`. A commit containing both registry and report files still deploys; a cursor/report-only commit does not.

- [ ] **Step 6: Enforce the canary deployment gate**

When canary registry files changed, capture the pushed SHA, poll `gh run list --workflow deploy-pages.yml --commit "$PUSHED_SHA"` for the corresponding run ID, then call:

```bash
gh run watch "$DEPLOY_RUN_ID" --exit-status
```

After deployment succeeds, read the report and fail the workflow unless `mode == "canary"` and `status == "passed"`. This preserves successful canary publication while preventing full rollout authorization after a partial/failed canary.

- [ ] **Step 7: Dispatch only the next full state batch**

After a successful push, inspect the committed report:

```bash
status=$(jq -r '.status' data/reports/enrichment-report.json)
run_mode=$(jq -r '.mode' data/reports/enrichment-report.json)
if [[ "$run_mode" == "full" && "$status" == "running" ]]; then
  gh workflow run enrich-catalog.yml --ref main -f mode=resume
fi
```

The run-state module, not YAML arithmetic, controls whether the next invocation processes primary or retry IDs.

- [ ] **Step 8: Write a sanitized workflow summary**

Render requested/returned model, run ID, phase, cursor, aggregate outcomes, and failed/source-not-ready IDs. Read values from sanitized preflight output or report only.

- [ ] **Step 9: Run workflow tests and commit**

```powershell
npm.cmd test -- --run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts tests/unit/enrich-readmes-cli.test.ts
npx.cmd prettier --check .github/workflows/enrich-catalog.yml .github/workflows/deploy-pages.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git add .github/workflows/enrich-catalog.yml .github/workflows/deploy-pages.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git commit -m "ci(catalog): chain verified enrichment batches"
```

---

### Task 9: Prove catalog, card, and refresh isolation end to end

**Files:**

- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/unit/enrichment-write-safety.test.ts`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `docs/superpowers/specs/2026-07-24-readme-enrichment-reliability-design.md`

**Interfaces:**

- No new runtime interface.
- Produce final automated evidence for the approved acceptance criteria.

- [ ] **Step 1: Add a rendered summary-fit test**

Use a valid 140-character, one-sentence fixture and assert its full text remains present, its computed line clamp is four, and its scroll height does not exceed its client height at standard card width.

```ts
const expectedSummary =
  "Coordinates persistent character memories, reviews relevant context, and supplies concise guidance for consistent SillyTavern conversations.";
const summary = card.locator(".card-summary");
await expect(summary).toHaveText(expectedSummary);
const dimensions = await summary.evaluate((element) => ({
  clientHeight: element.clientHeight,
  scrollHeight: element.scrollHeight,
}));
expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
```

- [ ] **Step 2: Add refresh-after-enrichment isolation coverage**

Write an enriched registry fixture, run snapshot refresh/build behavior, and assert the four editorial fields are byte-for-byte unchanged while snapshot facts change.

- [ ] **Step 3: Run focused browser and unit tests**

```powershell
npm.cmd test -- --run tests/unit/enrichment-write-safety.test.ts tests/unit/refresh-github-workflow-safety.test.ts
npm.cmd run test:e2e -- --grep "enriched summary"
```

Expected: PASS.

- [ ] **Step 4: Run the entire repository gate**

```powershell
npm.cmd run check
npm.cmd run test:e2e
npm.cmd run test:visual
```

Expected:

- formatting, lint, palette audit, catalog validation, catalog build, typecheck, unit tests, Next.js build, and static export verification all pass;
- all browser and visual tests pass;
- no provider network call occurs in deterministic test suites.

- [ ] **Step 5: Run dry-run state simulations**

Execute focused state tests with 206 synthetic IDs, deterministic failures in both primary and retry phases, and assertions that every ID appears exactly once in primary and only failed IDs appear once in retry:

```powershell
npm.cmd test -- --run tests/unit/enrichment-run-state.test.ts -t "simulates the full catalog without skips or duplicate calls"
```

Expected: PASS with 206 primary attempts and only the seeded failures receiving second attempts.

- [ ] **Step 6: Update design status and commit verification**

Change the design status from `Approved design` to `Implemented; live rollout gated by provider preflight and canary`. Record the deterministic command results without claiming the live gates passed.

```powershell
git add tests/e2e/catalog.spec.ts tests/unit/enrichment-write-safety.test.ts tests/unit/refresh-github-workflow-safety.test.ts docs/superpowers/specs/2026-07-24-readme-enrichment-reliability-design.md
git commit -m "test(catalog): verify enrichment rollout safety"
```

- [ ] **Step 7: Request code review**

Use `superpowers:requesting-code-review` against the complete branch diff. Resolve all correctness findings, rerun the affected focused tests, then rerun `npm.cmd run check`.

---

### Task 10: Run the live MiniMax M3 preflight and five-card canary

**Files:**

- Runtime evidence: GitHub Actions runs for `enrich-catalog.yml`, `refresh-catalog.yml`, `backfill-repository-identities.yml`, and `deploy-pages.yml`
- Published evidence: `data/reports/enrichment-report.json` and five rendered cards on the production Pages site

**Interfaces:**

- GitHub Actions secrets already configured:
  - `TAVERNARY_ENRICHMENT_API_URL`
  - `TAVERNARY_ENRICHMENT_API_KEY`
  - `TAVERNARY_ENRICHMENT_MODEL`

- [ ] **Step 1: Integrate the reviewed implementation**

Use `superpowers:finishing-a-development-branch`. Merge only after the complete deterministic gate passes and verify the final branch contains current `origin/main`.

- [ ] **Step 2: Dispatch the non-publishing provider preflight**

```powershell
gh workflow run enrich-catalog.yml --ref main -f mode=preflight
$preflightRun = gh run list --workflow enrich-catalog.yml --limit 1 --json databaseId --jq ".[0].databaseId"
gh run watch $preflightRun --exit-status
```

Verify the sanitized summary states:

- connection succeeded;
- requested model is `MiniMax-M3`;
- returned model is `MiniMax-M3` when the endpoint supplies it;
- strict output validation passed;
- no registry, snapshot, or report file was committed.

Stop here and diagnose before any source preparation if the preflight fails.

- [ ] **Step 3: Select five explicit canary IDs**

Inspect current healthy GitHub snapshots and choose five published provisional IDs covering repository description, README, extension classification, another GitHub-backed kind when available, and a likely no-README fallback when available. Store the exact five values in a PowerShell array named `$canaryIds`, record them in the operator notes, and do not expand beyond five.

- [ ] **Step 4: Refresh only the five canary snapshots**

Dispatch `refresh-catalog.yml` once per selected ID:

```powershell
$canaryIds | ForEach-Object {
  gh workflow run refresh-catalog.yml --ref main -f mode=project -f "project_id=$_"
}
```

Wait for all five runs. Verify each committed schema-v2 snapshot is healthy, non-stale, identity-matching, contains the exact head SHA, and contains `repository.description` as a string or `null`. Verify the refresh runs made no per-repository README calls.

- [ ] **Step 5: Backfill only the five canary identities**

Dispatch `backfill-repository-identities.yml` with the five newline-separated IDs:

```powershell
$canaryInput = $canaryIds -join "`n"
gh workflow run backfill-repository-identities.yml --ref main -f "project_ids=$canaryInput"
```

Verify exactly those eligible registry files received permanent IDs and no editorial fields changed.

- [ ] **Step 6: Dispatch the five-card canary**

Run `enrich-catalog.yml` in `canary` mode with the same five newline-separated IDs:

```powershell
gh workflow run enrich-catalog.yml --ref main -f mode=canary -f "project_ids=$canaryInput"
```

The workflow repeats provider preflight, processes the five cards through the production path, commits successful outputs and report state, waits for deployment, and passes only when all five have terminal success.

- [ ] **Step 7: Inspect canary evidence**

Verify:

- the report records requested model `MiniMax-M3`;
- every canary attempt count is one unless a manual canary retry was required;
- no card exceeds two attempts;
- descriptions are factual and fit completely inside the four-line tile area;
- categories and capabilities are plausible controlled values;
- fallback copy is exact when exercised;
- unrelated registry records remain unchanged;
- the production Pages deployment contains all successful canary tiles.

Do not begin catalog-wide preparation until this inspection passes.

- [ ] **Step 8: Prove refresh cannot overwrite canary editorial data**

Refresh one enriched canary project again, wait for its snapshot commit/deployment, and compare the registry record before/after. The four editorial fields must be unchanged.

- [ ] **Step 9: Pause at the full-rollout gate**

Present the preflight run, canary run, deploy run, five card IDs, report outcomes, and rendered-card inspection to the user. The next authorized sequence is:

1. refresh all remaining GitHub snapshots with the finalized status-driven baseline workflow so short descriptions are populated;
2. run full repository-identity backfill;
3. verify the source-not-ready inventory;
4. dispatch enrichment `start`;
5. monitor automatic primary and retry batches to `complete`.

Do not execute that catalog-wide sequence until the canary evidence has been accepted.
