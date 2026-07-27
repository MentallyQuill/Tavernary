# Durable Enrichment Failure Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make catalog enrichment tolerate transient provider failures, preserve isolated failures as provisional records, and surface partial outcomes through one durable rolling GitHub issue.

**Architecture:** Wrap every preflight provider call in a bounded transient retry helper while retaining a configurable per-request timeout. Keep full-run project failures in the existing durable report, classify isolated terminal failures as `complete-with-errors`, and run a separate issue synchronizer only after the rollout itself completes successfully. The synchronizer consumes a small trusted rollout-result file plus the validated report, emits GitHub warnings, and creates, updates, reopens, or closes one marker-backed issue through `gh`.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, Vitest, GitHub Actions YAML, GitHub CLI

## Global Constraints

- Each preflight provider request gets at most four total attempts.
- Retry delays are exactly 5, 15, and 30 seconds.
- Retry only `provider-timeout`, `provider-network-error`, `provider-rate-limited`, and `provider-server-error`.
- The provider request timeout defaults to 120 seconds and is configurable in seconds.
- Full rollouts with only isolated terminal project failures conclude `complete-with-errors`, even when zero records were enriched.
- Canary success thresholds and publication approval remain unchanged.
- Systemic, state, write, publication, deployment, and notification failures remain fatal.
- Use one issue titled `Catalog enrichment errors`, labeled `catalog-enrichment-errors`, and identified by `<!-- tavernary:catalog-enrichment-errors -->`.
- Never put provider payloads, README content, credentials, repair hints, or other raw untrusted source text into Actions annotations or the issue.
- Preserve unrelated worktree changes.
- Do not commit unless the user separately authorizes a commit.

---

### Task 1: Retry transient preflight requests and expose the request timeout

**Files:**
- Modify: `tests/unit/enrichment-provider.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`
- Modify: `tests/unit/enrichment-orchestrator.test.ts`
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-orchestrator.mjs`
- Modify: `scripts/catalog/enrichment-orchestrator.d.mts`

**Interfaces:**
- Consumes: `EnrichmentProviderError.code`, `--timeout-seconds`, `MODEL_TIMEOUT_SECONDS`
- Produces: `PREFLIGHT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000]`, retry-aware `runPreflight`, and `RunCliOptions.sleep`

- [ ] **Step 1: Add failing provider-timeout tests**

Extend `tests/unit/enrichment-provider.test.ts` with a configurable-timeout
test while retaining the existing 120-second default test:

```ts
test("uses the configured timeout and reports its safe duration", async () => {
  vi.useFakeTimers();
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
    timeoutMs: 7_500,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  const rejection = expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-timeout",
    message: "The enrichment provider timed out after 7.5 seconds.",
  });
  await vi.advanceTimersByTimeAsync(7_500);
  await rejection;
});
```

- [ ] **Step 2: Add failing preflight retry tests**

In `tests/unit/enrich-readmes-cli.test.ts`, import
`EnrichmentProviderError` and add:

```ts
test.each([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
] as const)("preflight retries transient %s failures", async (code) => {
  const sleep = vi.fn(async () => {});
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new EnrichmentProviderError(code))
    .mockResolvedValue(providerOutput);

  await expect(
    runCli({
      mode: "preflight",
      providerConfiguration,
      provider: { generate },
      sleep,
      reportPath: null,
      now,
    }),
  ).resolves.toMatchObject({ status: "passed" });

  expect(generate).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(5_000);
});

test("preflight exhausts four transient attempts with bounded backoff", async () => {
  const sleep = vi.fn(async () => {});
  const generate = vi.fn(async () => {
    throw new EnrichmentProviderError("provider-timeout");
  });

  await expect(
    runCli({
      mode: "preflight",
      providerConfiguration,
      provider: { generate },
      sleep,
      reportPath: null,
      now,
    }),
  ).rejects.toMatchObject({ code: "provider-timeout" });

  expect(generate).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    5_000, 15_000, 30_000,
  ]);
});

test("preflight does not retry non-transient provider failures", async () => {
  const sleep = vi.fn(async () => {});
  const generate = vi.fn(async () => {
    throw new EnrichmentProviderError("provider-authentication-failed");
  });

  await expect(
    runCli({
      mode: "preflight",
      providerConfiguration,
      provider: { generate },
      sleep,
      reportPath: null,
      now,
    }),
  ).rejects.toMatchObject({ code: "provider-authentication-failed" });

  expect(generate).toHaveBeenCalledOnce();
  expect(sleep).not.toHaveBeenCalled();
});
```

Add a repair-path test whose first response is structurally invalid, whose
first repair request times out, and whose retried repair returns
`providerOutput`. Assert three provider calls and one 5-second sleep. This
proves the retry wrapper covers both logical preflight requests.

- [ ] **Step 3: Add failing CLI and orchestrator propagation tests**

Extend the existing `cliOptions` test:

```ts
expect(
  cliOptions(["--mode", "preflight", "--timeout-seconds", "180"]),
).toMatchObject({
  mode: "preflight",
  timeoutMs: 180_000,
});
```

In `tests/unit/enrichment-orchestrator.test.ts`, construct
`createProductionOperations` with `timeoutSeconds: 180`, call
`operations.preflight()`, and assert that the captured npm arguments contain:

```ts
["run", "catalog:enrich", "--", "--mode", "preflight", "--timeout-seconds", "180"]
```

Add a validation test asserting that `timeoutSeconds: 0` throws
`model timeout seconds must be a positive number`.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-orchestrator.test.ts
```

Expected: FAIL because transient provider errors are not retried, the custom
timeout message still says 120 seconds, and timeout CLI propagation does not
exist.

- [ ] **Step 5: Implement safe configurable timeout diagnostics**

Change `EnrichmentProviderError` to accept controlled details:

```js
function safeProviderMessage(code, details = {}) {
  if (
    code === "provider-timeout" &&
    Number.isFinite(details.timeoutMs) &&
    details.timeoutMs > 0
  ) {
    return `The enrichment provider timed out after ${details.timeoutMs / 1_000} seconds.`;
  }
  return (
    safeProviderMessages[code] ?? "The enrichment provider failed."
  );
}

export class EnrichmentProviderError extends Error {
  constructor(code, diagnosticCode = null, details = {}) {
    super(safeProviderMessage(code, details));
    this.name = "EnrichmentProviderError";
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}
```

When aborting a request, construct the timeout error with:

```js
new EnrichmentProviderError("provider-timeout", null, { timeoutMs });
```

Update `enrichment-provider.d.mts` so the constructor accepts:

```ts
constructor(
  code: ProviderErrorCode,
  diagnosticCode?: string | null,
  details?: { timeoutMs?: number },
);
```

- [ ] **Step 6: Implement the preflight retry boundary**

Add near `preflightInput` in `enrich-readmes.mjs`:

```js
export const PREFLIGHT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

const transientPreflightCodes = new Set([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
]);

async function generatePreflight(provider, input, sleep) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await provider.generate(input);
    } catch (error) {
      const delay = PREFLIGHT_RETRY_DELAYS_MS[attempt];
      if (!transientPreflightCodes.has(error?.code) || delay === undefined) {
        throw error;
      }
      await sleep(delay);
    }
  }
}
```

Change `runPreflight` to accept `sleep` and replace both direct
`provider.generate(...)` calls with `generatePreflight(...)`. In `runCli`,
define:

```js
const sleep =
  options.sleep ??
  ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
```

and call `runPreflight(provider, sleep)`.

Add `sleep?: (milliseconds: number) => Promise<void>` to `RunCliOptions` and
declare `PREFLIGHT_RETRY_DELAYS_MS` as `readonly [5000, 15000, 30000]`.

- [ ] **Step 7: Parse and propagate timeout seconds**

In `cliOptions`, return:

```js
timeoutMs: Number(value("--timeout-seconds", 120)) * 1_000,
```

In `createProductionOperations`, parse
`options.timeoutSeconds ?? process.env.MODEL_TIMEOUT_SECONDS ?? 120`, reject
non-finite or non-positive values, and append:

```js
const providerArguments = ["--timeout-seconds", String(timeoutSeconds)];
```

to preflight, canary, start, and resume `catalog:enrich` invocations. Add
`timeoutSeconds?: number` to `createProductionOperations` declarations.

- [ ] **Step 8: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 9: Review checkpoint**

Run `git diff --check` and inspect only the Task 1 files. Do not commit.

---

### Task 2: Treat fully handled isolated failures as complete-with-errors

**Files:**
- Modify: `tests/unit/enrichment-run-state.test.ts`
- Modify: `scripts/catalog/enrichment-run-state.mjs`

**Interfaces:**
- Consumes: existing `failureScope(reasonCode)` and full-run terminal entries
- Produces: `complete-with-errors` whenever a fully accounted full run has no systemic errors but has at least one unresolved entry

- [ ] **Step 1: Change the zero-success regression expectation**

Replace `fails a full rollout that produces no successful records` with:

```ts
test("completes with errors when every full-rollout record remains provisional", () => {
  const initial = createEnrichmentRunState({
    mode: "full",
    manifest: ["a", "b"],
    runId: "zero-success",
    now,
  });
  const state = applyAttemptResults(
    initial,
    [
      {
        id: "a",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "unhealthy-source",
      },
      {
        id: "b",
        phase: "primary",
        outcome: "source-not-ready",
        reasonCode: "stale-source",
      },
    ],
    later,
  );

  expect(state).toMatchObject({
    status: "complete-with-errors",
    phase: "complete",
    aggregates: { "source-not-ready": 2 },
  });
});
```

Retain the parameterized authentication, model-mismatch, and write-failure
tests unchanged.

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-run-state.test.ts
```

Expected: FAIL because `terminalState` returns `failed` when
`successfulCount === 0`.

- [ ] **Step 3: Remove only the obsolete zero-success fatal branch**

In `terminalState`, retain the canary threshold and systemic checks, but delete:

```js
if (successfulCount === 0) return "failed";
```

Do not change `failureScope`, canary behavior, fully-accounted validation, or
the `complete` condition.

- [ ] **Step 4: Run run-state and orchestrator tests**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/enrichment-rollout-plan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Run `git diff --check` and inspect only the Task 2 diff. Do not commit.

---

### Task 3: Build the sanitized rolling-issue synchronizer

**Files:**
- Create: `scripts/catalog/enrichment-issue.mjs`
- Create: `scripts/catalog/enrichment-issue.d.mts`
- Create: `tests/unit/enrichment-issue.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `{ status: "complete" | "complete-with-errors" }`,
  `EnrichmentRunState`, `GITHUB_REPOSITORY`, `GITHUB_RUN_ID`,
  `GITHUB_SERVER_URL`, `RUNNER_TEMP`, and `gh`
- Produces: `buildEnrichmentIssueNotice(input)`,
  `syncEnrichmentIssue(input)`, warning annotations, and the
  `catalog:report-enrichment-errors` command

- [ ] **Step 1: Write failing pure notice-builder tests**

Create `tests/unit/enrichment-issue.test.ts` with fixtures for a completed
rollout and a `complete-with-errors` report. Assert:

```ts
expect(
  buildEnrichmentIssueNotice({
    rolloutResult: { status: "complete-with-errors" },
    report,
    runUrl:
      "https://github.com/MentallyQuill/Tavernary/actions/runs/123",
    runAt: "2026-07-27T18:00:00.000Z",
  }),
).toMatchObject({
  title: "Catalog enrichment errors",
  label: "catalog-enrichment-errors",
  marker: "<!-- tavernary:catalog-enrichment-errors -->",
  unresolved: [
    {
      id: "project-a",
      outcome: "final-failure",
      reasonCode: "provider-timeout",
    },
  ],
});
```

Assert the body contains the run link and sanitized table, but does not contain
fixture values placed in `repair_hint`, `provider.raw`, or README-like extra
fields. Put `@maintainer|line\n<script>` in the fixture message and assert the
result breaks the mention, escapes `|`, flattens whitespace, and contains no
HTML tag.

Add cases proving:

- `status: "complete"` produces no unresolved rows even when passed an older
  report;
- manual exclusions do not appear;
- only `source-not-ready`, `final-failure`, and `skipped` are unresolved;
- a mismatched or non-terminal report is rejected for
  `complete-with-errors`.

- [ ] **Step 2: Write failing `gh` synchronization tests**

Use an injected `runCommand` spy and temporary `writeFile` spy. Cover:

```ts
await syncEnrichmentIssue({
  notice,
  repository: "MentallyQuill/Tavernary",
  bodyPath: "C:/tmp/catalog-enrichment-errors.md",
  runCommand,
  writeFile,
});
```

Assert the exact lifecycle:

- always run `gh label create catalog-enrichment-errors --repo ... --color
  b60205 --description "Automatic catalog enrichment has unresolved
  projects." --force`;
- list all labeled issues as JSON;
- create when no marker-backed issue exists;
- update an existing open issue;
- reopen then update an existing closed issue;
- close an existing open issue on a clean run;
- no-op for a clean run with no matching issue;
- reject more than one marker-backed issue;
- throw a controlled error when any required `gh` command fails.

- [ ] **Step 3: Run the new test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-issue.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement the pure notice builder**

Create `scripts/catalog/enrichment-issue.mjs` with these exported constants and
functions:

```js
export const ENRICHMENT_ISSUE_TITLE = "Catalog enrichment errors";
export const ENRICHMENT_ISSUE_LABEL = "catalog-enrichment-errors";
export const ENRICHMENT_ISSUE_MARKER =
  "<!-- tavernary:catalog-enrichment-errors -->";

const unresolvedOutcomes = new Set([
  "source-not-ready",
  "final-failure",
  "skipped",
]);

function sanitizeDetail(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/gu, "")
    .replace(/@/gu, "@\u200b")
    .replace(/\|/gu, "\\|")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}
```

`buildEnrichmentIssueNotice` must read only `id`, `outcome`, `reason_code`, and
`message` from unresolved report entries, sort rows by project ID, and build:

```md
<!-- tavernary:catalog-enrichment-errors -->
# Catalog enrichment errors

Latest completed run: [GitHub Actions run](RUN_URL)
Completed at: RUN_AT

| Project | Outcome | Reason | Detail |
| --- | --- | --- | --- |
| ... |
```

Also return one annotation per unresolved row in this controlled form:

```text
::warning title=Catalog enrichment unresolved::PROJECT_ID remained provisional (REASON_CODE).
```

- [ ] **Step 5: Implement the GitHub CLI lifecycle**

Implement `syncEnrichmentIssue` around an injected command runner. Use only
these command forms:

```text
gh label create catalog-enrichment-errors --repo OWNER/REPO --color b60205 --description "Automatic catalog enrichment has unresolved projects." --force
gh issue list --repo OWNER/REPO --state all --label catalog-enrichment-errors --limit 100 --json number,title,state,body
gh issue create --repo OWNER/REPO --title "Catalog enrichment errors" --label catalog-enrichment-errors --body-file BODY_PATH
gh issue reopen NUMBER --repo OWNER/REPO
gh issue edit NUMBER --repo OWNER/REPO --title "Catalog enrichment errors" --add-label catalog-enrichment-errors --body-file BODY_PATH
gh issue close NUMBER --repo OWNER/REPO --reason completed --comment "Resolved by RUN_URL."
```

Select an issue only when both its title and hidden marker match. Write the
body with `node:fs/promises.writeFile`; never pass the body as a shell
argument. On nonzero command status, throw only the command name and exit code,
not raw stderr.

- [ ] **Step 6: Add the CLI entrypoint and declarations**

The CLI accepts:

```text
--result-path PATH
--report-path PATH
```

It reads the trusted result file, reads the report only for
`complete-with-errors`, derives the run URL from
`${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`,
prints annotations, and synchronizes the issue.

Declare the exported constants, notice types, and function signatures in
`enrichment-issue.d.mts`. Add:

```json
"catalog:report-enrichment-errors": "node scripts/catalog/enrichment-issue.mjs"
```

to `package.json`.

- [ ] **Step 7: Run issue tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-issue.test.ts
```

Expected: PASS.

- [ ] **Step 8: Review checkpoint**

Run `git diff --check` and inspect the issue body and command arguments for
secret or untrusted-text exposure. Do not commit.

---

### Task 4: Wire trusted rollout results, warnings, and issue synchronization into Actions

**Files:**
- Modify: `tests/unit/enrichment-orchestrator.test.ts`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `scripts/catalog/enrichment-orchestrator.mjs`
- Modify: `scripts/catalog/enrichment-orchestrator.d.mts`
- Modify: `.github/workflows/enrich-catalog.yml`

**Interfaces:**
- Consumes: successful `runEnrichmentRollout` result and
  `MODEL_TIMEOUT_SECONDS`
- Produces: `$RUNNER_TEMP/enrichment-rollout-result.json`, workflow warning
  annotations, and synchronized rolling issue state

- [ ] **Step 1: Write failing rollout-result persistence tests**

Export a `runMain(options)` seam from the orchestrator. Test it with injected
operations and `writeText`:

```ts
const fixture = recordingOperations({
  plans: ["start-full"],
  full: [
    {
      status: "complete-with-errors",
      progress: "complete:1",
      checkpointCommit: "d".repeat(40),
    },
  ],
});
const writeText = vi.fn(async () => {});
await expect(
  runMain({
    operations: fixture.operations,
    runnerTemp: "C:/runner",
    writeText,
  }),
).resolves.toEqual({ status: "complete-with-errors" });

expect(writeText).toHaveBeenCalledWith(
  join("C:/runner", "enrichment-rollout-result.json"),
  '{"status":"complete-with-errors"}\n',
);
```

Add a rejection test asserting that no result file is written when
`runEnrichmentRollout` throws.

- [ ] **Step 2: Write failing workflow contract tests**

Update `tests/unit/workflows.test.ts` to expect:

```ts
expect(enrich.permissions).toEqual({
  contents: "write",
  actions: "write",
  issues: "write",
});
expect(inputs.model_timeout_seconds).toEqual({
  description: "Per-model-request timeout in seconds.",
  type: "number",
  default: 120,
});
expect(source).toContain(
  "MODEL_TIMEOUT_SECONDS: ${{ inputs.model_timeout_seconds || 120 }}",
);
expect(source).toContain("npm run catalog:report-enrichment-errors");
expect(source).toContain("enrichment-rollout-result.json");
```

Update `tests/unit/refresh-github-workflow-safety.test.ts` to assert the
rollout step still has the five-hour job timeout and the issue synchronization
step receives only `GH_TOKEN`.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-orchestrator.test.ts tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because result persistence, timeout input, issue permission,
and reporting step do not exist.

- [ ] **Step 4: Persist only successful rollout conclusions**

Refactor the CLI entrypoint through:

```js
export async function runMain(options = {}) {
  const operations =
    options.operations ?? createProductionOperations(options);
  const result = await runEnrichmentRollout(operations);
  const runnerTemp = options.runnerTemp ?? process.env.RUNNER_TEMP;
  if (runnerTemp) {
    const writeText = options.writeText ?? writeFile;
    await writeText(
      join(runnerTemp, "enrichment-rollout-result.json"),
      `${JSON.stringify(result)}\n`,
    );
  }
  return result;
}
```

Call `runMain()` from the existing non-dry-run CLI path. Add the `runMain`
signature to `enrichment-orchestrator.d.mts`.

- [ ] **Step 5: Update the workflow contract**

In `.github/workflows/enrich-catalog.yml`:

1. Add `issues: write` under permissions.
2. Add the numeric `model_timeout_seconds` dispatch input with default `120`.
3. Add `MODEL_TIMEOUT_SECONDS` to the durable rollout step.
4. Add this step immediately after the rollout:

```yaml
      - name: Report unresolved enrichment projects
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: >-
          npm run catalog:report-enrichment-errors --
          --result-path "$RUNNER_TEMP/enrichment-rollout-result.json"
          --report-path data/reports/enrichment-report.json
```

Do not use `if: always()` on this step. Its default success condition ensures
that a systemically failed rollout neither updates nor closes the rolling
issue. Keep the existing sanitized workflow summary step under `if: always()`.

- [ ] **Step 6: Run focused integration tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-orchestrator.test.ts tests/unit/enrichment-issue.test.ts tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: PASS.

- [ ] **Step 7: Review checkpoint**

Parse `.github/workflows/enrich-catalog.yml` through the tests, run
`git diff --check`, and confirm `GH_TOKEN` is scoped only to steps that need
GitHub CLI access. Do not commit.

---

### Task 5: Document the operator-visible failure contract and run the full gate

**Files:**
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/maintenance/github-actions-user-guides.md`
- Modify: `docs/reference/catalog-enrichment-report.md`

**Interfaces:**
- Consumes: final retry, conclusion, timeout, summary, and rolling-issue behavior
- Produces: current operator guidance matching the executable workflow

- [ ] **Step 1: Update maintained operator documentation**

Add these exact operational facts:

- `model_timeout_seconds` defaults to 120 and applies to each provider request,
  not the batch or five-hour job.
- Preflight transient calls get three retries after the initial attempt with
  5-, 15-, and 30-second delays.
- Isolated project failures remain provisional and produce a green
  `complete-with-errors` run after durable retries.
- The Action remains red for systemic configuration, authentication, model,
  state, publication, deployment, or issue-synchronization failures.
- `Catalog enrichment errors` is one rolling issue that is updated or reopened
  for unresolved terminal projects and closed after a clean completed run.
- First-attempt errors that recover never appear in the issue.

In `docs/reference/catalog-enrichment-report.md`, define both `complete` and
`complete-with-errors` and correct the existing statement that `failed` is
canary-only.

- [ ] **Step 2: Run formatting and focused tests**

Run:

```powershell
npm.cmd run format
npm.cmd test -- tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/enrichment-issue.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build,
typecheck, all Vitest tests, Next.js build, and static export verification
exit 0.

- [ ] **Step 4: Inspect final scope and safety**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Confirm:

- only the design, plan, implementation, tests, workflow, and maintained
  enrichment documentation changed;
- no raw provider output or source text can enter annotations or issues;
- a single timeout cannot fail preflight;
- exhausted preflight retries and systemic errors still fail closed;
- full isolated failures remain provisional and conclude
  `complete-with-errors`; and
- no commit was created.
