# Owner Summary and Reddit Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow blank owner summary proposals under automatic policy and give Reddit submissions three durable, automatic source-fetch waves before publishing a safe provisional placeholder.

**Architecture:** Keep owner validation conditional at both the React preflight and authoritative manifest boundary. Route Reddit intake through the existing enrichment adapter using a pure three-attempt source-wave helper; persist retry-wave state in the existing idempotent project-generation failure comment, dispatch due waves from a 15-minute scheduled workflow, and generate an explicit provisional placeholder only after the third exhausted wave.

**Tech Stack:** Node.js 24 ESM, TypeScript declaration files, React 19, Next.js 16, Vitest 4, Testing Library, GitHub Actions YAML, GitHub REST API.

## Global Constraints

- Blank owner summary text is valid only when `metadata.summary.mode` is `automatic`.
- Manual owner summaries remain required, normalized, and limited to 220 characters.
- Owner request application must still receive a non-empty resolved summary.
- Reddit evidence must use the existing bounded JSON/oEmbed adapter; never scrape Reddit HTML or use comments.
- Each Reddit wave makes at most three source-load attempts with 30-second and 60-second backoffs.
- A source-load attempt includes the adapter's JSON request and its identity-checked oEmbed fallback.
- Wave two becomes eligible one hour after wave one; wave three becomes eligible one hour after wave two.
- The scheduled dispatcher runs every 15 minutes, so due waves normally start within 60–75 minutes.
- Ordinary Reddit availability failures may degrade only after wave three.
- Malformed URLs, unsupported sources, and identity mismatches remain fail-closed.
- Provider-output retries remain governed by the existing independent provider-attempt budget.
- Placeholder records remain `metadata_status: "provisional"` with automatic summary and tag policy.
- Placeholder publication uses `copy_result: null`; it must not claim validated provider copy.
- Retry state and notices contain no Reddit body text, raw provider output, credentials, or policy-sensitive content.
- Do not alter unrelated untracked `.tmp-*-issue.md` files.

---

## File Structure

### Owner validation

- `src/features/help/components/project-owner-builder.tsx`: conditional browser preflight and human-readable review value.
- `src/features/help/components/owner-card-fields.tsx`: automatic-mode optionality hint.
- `src/features/help/project-owner-manifest.mjs`: authoritative conditional summary validation.
- `tests/unit/project-owner-builder.test.tsx`: browser regressions.
- `tests/unit/project-owner-manifest.test.ts`: manifest regressions.

### Reddit source wave

- `scripts/submissions/reddit-submission-source-wave.mjs`: pure bounded source-load loop and integrity classification.
- `scripts/submissions/reddit-submission-source-wave.d.mts`: typed public contract.
- `tests/unit/reddit-submission-source-wave.test.ts`: attempt, backoff, success, and blocking regressions.

### Durable retry state

- `scripts/submissions/project-submission-retry-state.mjs`: parse, validate, render, transition, list, and reconcile issue-backed retry state.
- `scripts/submissions/project-submission-retry-state.d.mts`: state and REST request types.
- `tests/unit/project-submission-retry-state.test.ts`: state-machine and idempotent comment regressions.

### Intake integration

- `scripts/submissions/generate-project-submission.mjs`: Reddit preliminary record, source wave, source-grounded enrichment, scheduled-error file, and placeholder generation.
- `scripts/submissions/generate-project-submission.d.mts`: source client, report, CLI, and retry-error types.
- `scripts/submissions/draft-project-record.mjs`: explicit provisional-summary input.
- `scripts/submissions/draft-project-record.d.mts`: provisional-summary and degradation types.
- `tests/unit/generate-project-submission-cli.test.ts`: live intake-boundary regressions.
- `tests/unit/draft-project-record.test.ts`: provisional placeholder record regression.

### Workflow automation

- `scripts/submissions/project-generation-failure.mjs`: embed retry state in the existing failure comment and preserve it across failure reconciliation.
- `scripts/submissions/project-generation-failure.d.mts`: optional Reddit retry-state input.
- `scripts/submissions/retry-project-submission-enrichment.mjs`: find and dispatch due retry waves.
- `scripts/submissions/retry-project-submission-enrichment.d.mts`: dispatcher types.
- `tests/unit/project-generation-failure.test.ts`: failure-comment integration.
- `tests/unit/retry-project-submission-enrichment.test.ts`: due-issue dispatch regressions.
- `.github/workflows/generate-project-submission.yml`: retry-state artifact path and success cleanup.
- `.github/workflows/retry-project-submission-enrichment.yml`: 15-minute scheduled dispatcher.
- `tests/unit/workflows.test.ts`: permissions, schedule, command, and concurrency contracts.

---

### Task 1: Make Owner Summary Validation Policy-Aware

**Files:**

- Modify: `src/features/help/components/project-owner-builder.tsx:144-172`
- Modify: `src/features/help/components/project-owner-builder.tsx:175-225`
- Modify: `src/features/help/components/owner-card-fields.tsx:141-187`
- Modify: `src/features/help/project-owner-manifest.mjs:200-290`
- Test: `tests/unit/project-owner-builder.test.tsx`
- Test: `tests/unit/project-owner-manifest.test.ts`

**Interfaces:**

- Consumes: `OwnerCardDraft.summary: string` and `OwnerCardDraft.metadata.summary.mode: "automatic" | "manual"`.
- Produces: `summaryReviewValue(summary: string, mode: OwnerMetadataMode): string`.
- Preserves: `normalizeProjectOwnerManifest(value, vocabularies): OwnerManifestValidation`.

- [ ] **Step 1: Add failing manifest tests for conditional summary validation**

Add focused cases beside the existing metadata-mode tests:

```ts
test("accepts blank automatic summary proposal", () => {
  expect(
    normalizeProjectOwnerManifest(
      editFixture({
        summary: "   ",
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      }),
      vocabularies,
    ),
  ).toMatchObject({
    valid: true,
    manifest: { proposed: { summary: "" } },
  });
});

test("rejects blank manual summary proposal", () => {
  expect(
    normalizeProjectOwnerManifest(
      editFixture({
        summary: "",
        metadata: {
          summary: { mode: "manual" },
          tags: { mode: "automatic" },
        },
      }),
      vocabularies,
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining(["Owner summary is required."]),
  });
});
```

- [ ] **Step 2: Run the manifest tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-manifest.test.ts
```

Expected: the automatic case fails with `Owner summary is required.`

- [ ] **Step 3: Make authoritative validation conditional**

Move metadata normalization before the summary-required check and change the
condition:

```js
const summary = normalizedSummary(value?.summary);
const metadata = normalizeMetadata(value?.metadata, errors);

if (!summary && metadata.summary.mode === "manual") {
  errors.push("Owner summary is required.");
}
if (summary.length > 220) {
  errors.push("Owner summary must be 220 characters or fewer.");
}
```

Keep the returned manifest shape unchanged:

```js
return {
  // existing fields
  summary,
  metadata,
  // existing fields
};
```

- [ ] **Step 4: Run the manifest tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-manifest.test.ts
```

Expected: all manifest tests pass.

- [ ] **Step 5: Add failing browser tests for automatic, manual, and review copy**

Replace the existing unconditional blank-summary expectation and add explicit
edit-card coverage:

```tsx
test("allows blank summary when Tavernary writes automatically", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Summary"));
  await user.selectOptions(
    screen.getByLabelText("Summary policy"),
    "automatic",
  );
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(
    screen.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
  expect(screen.getByText("Generated automatically")).toBeVisible();
});

test("requires summary when owner-authored policy is selected", async () => {
  const user = userEvent.setup();
  renderBuilder();
  await selectProject(user);
  await user.click(screen.getByRole("radio", { name: "Edit card details" }));
  await user.clear(screen.getByLabelText("Summary"));
  await user.selectOptions(screen.getByLabelText("Summary policy"), "manual");
  await user.click(screen.getByRole("button", { name: "Review request" }));

  expect(screen.getByRole("alert")).toHaveTextContent(
    "Owner summary is required.",
  );
});
```

For the existing invalid-card batch test, explicitly select `manual` before
asserting the blank summary error.

- [ ] **Step 6: Run the builder tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx
```

Expected: automatic blank preflight still rejects, and the review does not show
`Generated automatically`.

- [ ] **Step 7: Implement conditional browser preflight and review rendering**

Change `batchPreflight()`:

```tsx
if (
  !card.summary.trim() &&
  card.metadata.summary.mode === "manual"
) {
  errors.push(`${label}: Owner summary is required.`);
}
```

Add and use one review helper:

```tsx
function summaryReviewValue(
  summary: string,
  mode: "automatic" | "manual",
) {
  return summary || (mode === "automatic" ? "Generated automatically" : "");
}
```

Use it for both add-card and edit-card proposed summaries:

```tsx
<span>
  Summary:{" "}
  {summaryReviewValue(card.summary, card.metadata.summary.mode)}
</span>
```

```tsx
{
  label: "After: summary",
  value: summaryReviewValue(
    manifest.proposed.summary,
    manifest.proposed.metadata.summary.mode,
  ),
}
```

Add a conditional hint below the summary field:

```tsx
{card.metadata.summary.mode === "automatic" ? (
  <p className="help-hint">
    Optional: leave this blank and Tavernary will write the catalog summary
    from the source.
  </p>
) : null}
```

- [ ] **Step 8: Verify the owner workflow**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/generate-project-owner-request.test.ts
```

Expected: all focused owner tests pass, including downstream automatic metadata
generation.

- [ ] **Step 9: Commit the owner validation change**

```powershell
git add -- src/features/help/components/project-owner-builder.tsx src/features/help/components/owner-card-fields.tsx src/features/help/project-owner-manifest.mjs tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts
git commit -m "fix(owner): allow blank automatic summaries"
```

---

### Task 2: Add a Pure Three-Attempt Reddit Source Wave

**Files:**

- Create: `scripts/submissions/reddit-submission-source-wave.mjs`
- Create: `scripts/submissions/reddit-submission-source-wave.d.mts`
- Create: `tests/unit/reddit-submission-source-wave.test.ts`

**Interfaces:**

- Consumes: `loadEnrichmentSource(project, source, snapshot)`.
- Produces: `loadRedditSubmissionSourceWave(input): Promise<RedditSourceWaveResult>`.
- Produces: `redditSourceFailureClass(reasonCode): "availability" | "integrity"`.
- Constants: `REDDIT_SOURCE_BACKOFF_MS = [30_000, 60_000]`.

- [ ] **Step 1: Write failing tests for attempt count and backoff**

Create the test file with a reusable failure:

```ts
const failure = {
  status: "failed" as const,
  reasonCode: "reddit-rate-limited" as const,
  message: "The Reddit source request was rate limited.",
  sourceIdentity: "reddit:1v9u18m",
  redditPostId: "1v9u18m",
};

test("runs three source loads with 30s and 60s backoffs", async () => {
  const loadSource = vi.fn(async () => failure);
  const sleep = vi.fn(async () => undefined);

  await expect(
    loadRedditSubmissionSourceWave({
      project: { id: "reddit-1v9u18m" },
      source: {
        type: "url",
        url: "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/example/",
      },
      snapshot: null,
      loadSource,
      sleep,
    }),
  ).resolves.toEqual({
    status: "exhausted",
    failure,
    attempts: 3,
  });

  expect(loadSource).toHaveBeenCalledTimes(3);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    30_000,
    60_000,
  ]);
});
```

Add success and integrity cases:

```ts
test("stops at the first ready source", async () => {
  const ready = {
    status: "ready" as const,
    sourceKind: "reddit-body" as const,
    text: "Source-grounded Reddit post body.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  };
  const loadSource = vi
    .fn()
    .mockResolvedValueOnce(failure)
    .mockResolvedValueOnce(ready);

  await expect(
    loadRedditSubmissionSourceWave({
      project: { id: "reddit-1v9u18m" },
      source: { type: "url", url: "https://reddit.com/comments/1v9u18m" },
      snapshot: null,
      loadSource,
      sleep: async () => undefined,
    }),
  ).resolves.toEqual({ status: "ready", source: ready, attempts: 2 });
});

test.each([
  "unsupported-enrichment-source",
  "reddit-identity-mismatch",
] as const)("blocks integrity failure %s without retrying", async (reasonCode) => {
  const loadSource = vi.fn(async () => ({
    ...failure,
    reasonCode,
  }));
  await expect(
    loadRedditSubmissionSourceWave({
      project: {},
      source: {},
      snapshot: null,
      loadSource,
      sleep: async () => undefined,
    }),
  ).resolves.toMatchObject({
    status: "blocked",
    attempts: 1,
    failure: { reasonCode },
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/reddit-submission-source-wave.test.ts
```

Expected: import failure because the module does not exist.

- [ ] **Step 3: Implement the minimal source-wave module**

Create:

```js
import { loadEnrichmentSource } from "../catalog/enrichment-source.mjs";

export const REDDIT_SOURCE_BACKOFF_MS = Object.freeze([30_000, 60_000]);

const integrityFailures = new Set([
  "unsupported-enrichment-source",
  "reddit-identity-mismatch",
]);

export function redditSourceFailureClass(reasonCode) {
  return integrityFailures.has(reasonCode) ? "integrity" : "availability";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function loadRedditSubmissionSourceWave({
  project,
  source,
  snapshot = null,
  loadSource = loadEnrichmentSource,
  sleep = delay,
}) {
  let failure;
  for (let index = 0; index < 3; index += 1) {
    try {
      const result = await loadSource(project, source, snapshot);
      if (result?.status === "ready") {
        return { status: "ready", source: result, attempts: index + 1 };
      }
      failure =
        result?.status === "failed" &&
        typeof result.reasonCode === "string" &&
        typeof result.message === "string"
          ? result
          : {
              status: "failed",
              reasonCode: "reddit-response-invalid",
              message: "The Reddit source response is invalid.",
            };
    } catch {
      failure = {
        status: "failed",
        reasonCode: "reddit-fetch-failed",
        message: "The Reddit source request failed.",
      };
    }
    if (redditSourceFailureClass(failure?.reasonCode) === "integrity") {
      return { status: "blocked", failure, attempts: index + 1 };
    }
    if (index < REDDIT_SOURCE_BACKOFF_MS.length) {
      await sleep(REDDIT_SOURCE_BACKOFF_MS[index]);
    }
  }
  return { status: "exhausted", failure, attempts: 3 };
}
```

Declare the exact result union in the `.d.mts` file, using
`RedditEnrichmentSource` from
`scripts/catalog/reddit-enrichment-source.d.mts`.

- [ ] **Step 4: Verify the source wave**

Run:

```powershell
npm.cmd test -- tests/unit/reddit-submission-source-wave.test.ts tests/unit/reddit-enrichment-source.test.ts
```

Expected: all attempt-loop and existing adapter tests pass.

- [ ] **Step 5: Commit the source-wave unit**

```powershell
git add -- scripts/submissions/reddit-submission-source-wave.mjs scripts/submissions/reddit-submission-source-wave.d.mts tests/unit/reddit-submission-source-wave.test.ts
git commit -m "feat(submissions): add Reddit source waves"
```

---

### Task 3: Add Durable Reddit Retry State

**Files:**

- Create: `scripts/submissions/project-submission-retry-state.mjs`
- Create: `scripts/submissions/project-submission-retry-state.d.mts`
- Create: `tests/unit/project-submission-retry-state.test.ts`

**Interfaces:**

- Produces: `REDDIT_RETRY_MARKER`.
- Produces: `normalizeRedditRetryState(value, expected): RedditRetryState | null`.
- Produces: `parseRedditRetryState(body, expected): RedditRetryState | null`.
- Produces: `planRedditRetryTransition(input): RedditRetryTransition`.
- Produces: `renderRedditRetryState(state): string`.
- Produces: `loadRedditRetryState(comments, expected): RedditRetryState | null`; `expected.sourceIdentity` is optional only for the dispatcher, which validates it immediately after parsing the admitted manifest.
- Produces: `upsertRedditRetryComment(input): Promise<void>`.
- State fields: `schema_version`, `issue_number`, `source_identity`, `completed_waves`, `next_eligible_retry_at`, `last_reason_code`, `updated_at`, `outcome`.

- [ ] **Step 1: Write failing state-machine tests**

Create tests for the first, second, and third failures. Define the reusable state
fixture in this test file:

```ts
function pendingState(
  overrides: Partial<RedditRetryState> = {},
): RedditRetryState {
  return {
    schema_version: 1,
    issue_number: 165,
    source_identity: "reddit:1v9u18m",
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending",
    ...overrides,
  };
}
```

```ts
test("schedules wave two one hour after first-wave exhaustion", () => {
  expect(
    planRedditRetryTransition({
      current: null,
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-rate-limited",
      now: "2026-07-30T18:00:00.000Z",
    }),
  ).toEqual({
    action: "schedule",
    state: {
      schema_version: 1,
      issue_number: 165,
      source_identity: "reddit:1v9u18m",
      completed_waves: 1,
      next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
      last_reason_code: "reddit-rate-limited",
      updated_at: "2026-07-30T18:00:00.000Z",
      outcome: "pending",
    },
  });
});

test("schedules wave three one hour after second-wave exhaustion", () => {
  const current = pendingState({
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
  });
  expect(
    planRedditRetryTransition({
      current,
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-server-error",
      now: "2026-07-30T19:05:00.000Z",
    }),
  ).toMatchObject({
    action: "schedule",
    state: {
      completed_waves: 2,
      next_eligible_retry_at: "2026-07-30T20:05:00.000Z",
    },
  });
});

test("selects placeholder after third-wave exhaustion", () => {
  expect(
    planRedditRetryTransition({
      current: pendingState({ completed_waves: 2 }),
      issueNumber: 165,
      sourceIdentity: "reddit:1v9u18m",
      reasonCode: "reddit-post-unavailable",
      now: "2026-07-30T20:10:00.000Z",
    }),
  ).toMatchObject({
    action: "placeholder",
    state: {
      completed_waves: 3,
      next_eligible_retry_at: null,
      outcome: "placeholder",
    },
  });
});
```

Add parsing tests that reject unknown keys, invalid dates, issue mismatches,
source mismatches, wave counts outside `1..3`, and marker text containing a
different Reddit identity.

- [ ] **Step 2: Run the state tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-retry-state.test.ts
```

Expected: import failure because the state module does not exist.

- [ ] **Step 3: Implement exact state parsing and transitions**

Use one hidden marker:

```js
export const REDDIT_RETRY_MARKER =
  "<!-- tavernary-reddit-submission-retry";

const stateKeys = new Set([
  "schema_version",
  "issue_number",
  "source_identity",
  "completed_waves",
  "next_eligible_retry_at",
  "last_reason_code",
  "updated_at",
  "outcome",
]);
```

Render exact JSON inside the marker:

```js
export function renderRedditRetryState(state) {
  return [
    REDDIT_RETRY_MARKER,
    JSON.stringify(state),
    "-->",
  ].join("\n");
}
```

Advance using integer waves and one-hour ISO arithmetic:

```js
const completedWaves = (current?.completed_waves ?? 0) + 1;
const terminal = completedWaves >= 3;
const state = {
  schema_version: 1,
  issue_number: issueNumber,
  source_identity: sourceIdentity,
  completed_waves: completedWaves,
  next_eligible_retry_at: terminal
    ? null
    : new Date(new Date(now).getTime() + 3_600_000).toISOString(),
  last_reason_code: reasonCode,
  updated_at: new Date(now).toISOString(),
  outcome: terminal ? "placeholder" : "pending",
};
return { action: terminal ? "placeholder" : "schedule", state };
```

`normalizeRedditRetryState()` owns exact-key and invariant validation.
`parseRedditRetryState()` extracts marker JSON and delegates to it.
`loadRedditRetryState()` searches only comments containing the project-generation
failure marker and returns the single retry marker that passes exact-key, type,
date, issue-number, and optional source-identity validation. Multiple valid
markers fail closed by returning `null`.

`upsertRedditRetryComment()` must re-read the issue and every paginated comment
page before mutation, reparse the current admitted manifest, require the issue
to remain open/admitted/project-submission without `needs-information` or
`submission-declined`, and verify that the manifest, existing marker, and input
state all identify the same Reddit post. A `pending` input is rejected after
`submission-pr-open`; terminal `source-ready` and `placeholder` cleanup may run
after the review PR has moved the issue to that label. PATCH the existing
project-generation failure comment when present and return `noop` when it is
absent. Its request body is always
`JSON.stringify({ body: renderedComment })`. This function is used only for
success/placeholder cleanup; failed waves remain owned by
`reconcileProjectGenerationFailure()` in Task 5.

- [ ] **Step 4: Add failing idempotent reconciliation tests**

Test that the existing failure comment is patched, not duplicated. Define these
test helpers above the case:

```ts
function admittedIssue(number: number) {
  return {
    number,
    state: "open",
    body: [
      "### Project manifest",
      "",
      "```json",
      JSON.stringify({
        schema_version: 4,
        project_type: "preset",
        primary_function: "preset",
        source_url: "https://www.reddit.com/comments/1v9u18m/",
        frontends: { known_ids: ["sillytavern"], other: [] },
        frontend_independent: false,
        additional_context: null,
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
        preset_compatibility: {
          model_families: { known_ids: ["claude"], other: [] },
          completion_formats: ["chat-completion"],
        },
      }),
      "```",
    ].join("\n"),
    labels: [
      { name: "issue-admitted" },
      { name: "project-submission" },
      { name: "submission-retryable" },
    ],
  };
}

function requestHarness({
  issue,
  comments,
}: {
  issue: ReturnType<typeof admittedIssue>;
  comments: Array<{ id: number; body: string }>;
}) {
  return vi.fn(
    async (path: string, options?: Record<string, unknown>) => {
      if (path.endsWith(`/issues/${issue.number}`)) return issue;
      if (
        path.endsWith(
          `/issues/${issue.number}/comments?per_page=100`,
        )
      ) {
        return comments;
      }
      if (
        path.includes("/issues/comments/") &&
        options?.method === "PATCH"
      ) {
        return {};
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  );
}
```

```ts
test("upserts retry state into the existing generation failure comment", async () => {
  const request = requestHarness({
    issue: admittedIssue(165),
    comments: [{
      id: 44,
      body: [
        "<!-- tavernary-project-generation-failure:project-submission -->",
        "Old failure.",
        renderRedditRetryState(pendingState()),
      ].join("\n"),
    }],
  });

  await upsertRedditRetryComment({
    repository: "MentallyQuill/Tavernary",
    issueNumber: 165,
    state: pendingState({
      next_eligible_retry_at: null,
      updated_at: "2026-07-30T19:10:00.000Z",
      outcome: "source-ready",
    }),
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/1",
    request,
  });

  const patch = request.mock.calls.find(
    ([path, options]) =>
      path.endsWith("/issues/comments/44") &&
      options?.method === "PATCH",
  );
  expect(patch).toBeDefined();
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
    body: expect.stringContaining(REDDIT_RETRY_MARKER),
  });
});
```

Also assert that closed, needs-information, identity-mismatched, and
`pending` plus submission-pr-open issues are not mutated. Add one terminal
submission-pr-open case proving successful cleanup is permitted.

The validator accepts only these internally consistent states:

- `pending`: `completed_waves` is `1` or `2` and
  `next_eligible_retry_at` is a valid ISO timestamp;
- `placeholder`: `completed_waves` is `3` and
  `next_eligible_retry_at` is `null`;
- `source-ready`: `completed_waves` is `1` or `2` and
  `next_eligible_retry_at` is `null`.

An initial-wave source success has no durable retry marker and therefore does
not create a `source-ready` state comment.

- [ ] **Step 5: Verify durable state**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-retry-state.test.ts
```

Expected: all parser, transition, and reconciliation tests pass.

- [ ] **Step 6: Commit the retry-state unit**

```powershell
git add -- scripts/submissions/project-submission-retry-state.mjs scripts/submissions/project-submission-retry-state.d.mts tests/unit/project-submission-retry-state.test.ts
git commit -m "feat(submissions): persist Reddit retry state"
```

---

### Task 4: Route Reddit Intake Through Enrichment and Placeholder Degradation

**Files:**

- Modify: `scripts/submissions/generate-project-submission.mjs:305-613`
- Modify: `scripts/submissions/generate-project-submission.d.mts`
- Modify: `scripts/submissions/draft-project-record.mjs:83-95`
- Modify: `scripts/submissions/draft-project-record.mjs:239-330`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Test: `tests/unit/generate-project-submission-cli.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`

**Interfaces:**

- Consumes: `loadRedditSubmissionSourceWave()` from Task 2.
- Consumes: `loadRedditRetryState()` and `planRedditRetryTransition()` from Task 3.
- Produces: `RedditSourceRetryScheduledError` with `code`, `retryState`, `attempts`, and sanitized `message`.
- Produces: `redditPlaceholderSummary(kind): string`.
- Adds: `draftProjectRecord({ provisionalSummary, provisionalWarning })`.
- Adds report field: `reddit_retry: { outcome, wave_number, max_waves, completed_waves, attempts, next_eligible_retry_at, reason_code } | null`.

- [ ] **Step 1: Add a failing draft-record placeholder test**

Extract the admitted Reddit decision already used by
`"drafts Reddit presets with a readable name from the permalink slug"` into a
file-level `admittedRedditPreset` constant, then reuse it here:

```ts
test("uses an explicit provisional Reddit placeholder without claiming curated copy", async () => {
  const draft = await draftProjectRecord({
    admitted: admittedRedditPreset,
    observation: null,
    snapshot: null,
    enrichment: null,
    provisionalSummary:
      "A preset shared through Reddit. Tavernary could not retrieve the post description after repeated attempts, so source details remain temporarily unavailable.",
    provisionalWarning:
      "Reddit source remained unavailable after three retry waves.",
    now: "2026-07-30T20:10:00.000Z",
  });

  expect(draft.record).toMatchObject({
    summary: expect.stringContaining("shared through Reddit"),
    metadata_status: "provisional",
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(draft.copyResult).toBeNull();
  expect(draft.warnings).toContain(
    "Reddit source remained unavailable after three retry waves.",
  );
});
```

- [ ] **Step 2: Run the draft test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/draft-project-record.test.ts
```

Expected: the draft still uses `No README file found.` and omits the explicit
warning.

- [ ] **Step 3: Add explicit provisional-summary support**

Update fallback selection without weakening `copyRequired`:

```js
function fallbackSummary(input, request) {
  return boundedSummary(
    (request.summary.mode === "manual" ? request.summary.value : "") ||
      input.provisionalSummary?.trim() ||
      input.observation?.repository?.description?.trim() ||
      "No README file found.",
  );
}
```

Append only a sanitized caller-owned warning:

```js
if (typeof input.provisionalWarning === "string") {
  warnings.push(input.provisionalWarning);
}
```

Expose `copyResult: acceptedCopy` as the current returned draft already does;
do not fabricate a copy result for the placeholder.

- [ ] **Step 4: Add failing Reddit intake tests**

Import `renderRedditRetryState` for the third-wave case. Add these complete
fixtures to `generate-project-submission-cli.test.ts`:

```ts
function redditRateLimitFailure() {
  return {
    status: "failed" as const,
    reasonCode: "reddit-rate-limited",
    message: "The Reddit source request was rate limited.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  };
}

function redditSubmissionFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    issue: {
      number: 165,
      state: "open",
      labels: [
        { name: "issue-admitted" },
        { name: "project-submission" },
        { name: "needs-maintainer-review" },
      ],
      user: { id: 73, login: "CommunityMember", type: "User" },
      author_association: "NONE",
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 4,
          project_type: "preset",
          primary_function: "preset",
          source_url:
            "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/preset_introducing_freaky_frankenstein_50/",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
          preset_compatibility: {
            model_families: { known_ids: ["claude"], other: [] },
            completion_formats: ["chat-completion"],
          },
        }),
        "```",
      ].join("\n"),
    },
    now: "2026-07-30T18:00:00.000Z",
    sourceClients: {
      request: async () => {
        throw new Error("Canonical Reddit intake should not call GitHub.");
      },
      catalogData: {
        vocabulary: {
          frontends: [{
            id: "sillytavern",
            label: "SillyTavern",
            description: "Works with the SillyTavern roleplay frontend.",
          }],
        },
        projects: [],
        sources: [],
      },
      issueComments: [],
      ...overrides,
    },
  };
}
```

Success test:

```ts
test("generates Reddit metadata from the submitted post body", async () => {
  const loadEnrichmentSource = vi.fn(async () => ({
    status: "ready",
    sourceKind: "reddit-body",
    text: "Freaky Frankenstein is a roleplay preset with documented controls.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  }));
  const enrich = vi.fn(async () => ({
    status: "curated",
    summary:
      "Freaky Frankenstein is a roleplay preset with documented controls and structured prompting behavior for compatible SillyTavern configurations.",
    tags: [],
    classification_review: null,
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));

  const draft = await prepareProjectSubmissionDraft(
    redditSubmissionFixture({ loadEnrichmentSource, enrich }),
  );

  expect(loadEnrichmentSource).toHaveBeenCalled();
  expect(enrich).toHaveBeenCalledWith(
    expect.objectContaining({
      requestedFields: ["summary", "tags"],
      maxProviderAttempts: 5,
    }),
  );
  expect(draft.record).toMatchObject({
    id: "reddit-1v9u18m",
    metadata_status: "curated",
    summary: expect.stringContaining("Freaky Frankenstein"),
  });
});
```

Wave-one exhaustion test:

```ts
test("returns durable retry state after the first exhausted Reddit wave", async () => {
  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        loadEnrichmentSource: async () => redditRateLimitFailure(),
        sleep: async () => undefined,
        issueComments: [],
      }),
    ),
  ).rejects.toMatchObject({
    code: "reddit-source-retry-scheduled",
    retryState: {
      completed_waves: 1,
      next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    },
    attempts: 3,
  });
});
```

Third-wave placeholder and identity-block tests must assert:

```ts
const thirdWave = redditSubmissionFixture({
  loadEnrichmentSource: async () => redditRateLimitFailure(),
  sleep: async () => undefined,
  issueComments: [{
    id: 44,
    body: renderRedditRetryState({
      schema_version: 1,
      issue_number: 165,
      source_identity: "reddit:1v9u18m",
      completed_waves: 2,
      next_eligible_retry_at: "2026-07-30T18:00:00.000Z",
      last_reason_code: "reddit-rate-limited",
      updated_at: "2026-07-30T17:00:00.000Z",
      outcome: "pending",
    }),
  }],
});
const placeholderDraft = await prepareProjectSubmissionDraft(thirdWave);
expect(placeholderDraft.record.metadata_status).toBe("provisional");
expect(placeholderDraft.record.summary).toContain("shared through Reddit");
expect(placeholderDraft.copyResult).toBeNull();
expect(placeholderDraft.redditRetry).toMatchObject({
  outcome: "placeholder",
  completed_waves: 3,
  attempts: 3,
});

await expect(
  prepareProjectSubmissionDraft(
    redditSubmissionFixture({
      loadEnrichmentSource: async () => ({
        ...redditRateLimitFailure(),
        reasonCode: "reddit-identity-mismatch",
      }),
      sleep: async () => undefined,
    }),
  ),
).rejects.toMatchObject({ code: "reddit-identity-mismatch" });
```

- [ ] **Step 5: Run Reddit intake tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts
```

Expected: the non-repository branch never calls the Reddit source loader and
returns provisional `No README file found.` metadata.

- [ ] **Step 6: Implement Reddit-specific intake without changing generic URLs**

Add the exact public helpers:

```js
export class RedditSourceRetryScheduledError extends Error {
  constructor({ state, attempts }) {
    super(
      attempts === 0
        ? `Reddit source retry is not eligible until ${state.next_eligible_retry_at}.`
        : `Reddit source remains unavailable after ${attempts} attempts; the next retry is eligible after ${state.next_eligible_retry_at}.`,
    );
    this.name = "RedditSourceRetryScheduledError";
    this.code = "reddit-source-retry-scheduled";
    this.retryState = state;
    this.attempts = attempts;
  }
}

export function redditPlaceholderSummary(kind) {
  if (!["frontend", "extension", "preset"].includes(kind)) {
    throw new Error("Reddit placeholder project kind is invalid.");
  }
  return `A ${kind} shared through Reddit. Tavernary could not retrieve the post description after repeated attempts, so source details remain temporarily unavailable.`;
}
```

Create the preliminary record before the non-repository return. For canonical
Reddit identities, carry the already-validated manual-summary result into the
preliminary draft:

```js
const preliminary = await draftProjectRecord({
  admitted: decision,
  observation: null,
  snapshot: null,
  enrichment: null,
  frontendVocabulary: data.vocabulary,
  frontendProjects: data.projects,
  metadataAuthority,
  metadataRequest,
  ...(manualSummaryCopy
    ? {
        publishedSummary: manualSummaryCopy.publishedSummary,
        copyResult: manualSummaryCopy.copyResult,
        copyMode: manualSummaryCopy.mode,
      }
    : {}),
  now,
});

if (decision.identity.kind !== "reddit") {
  assertProjectIdAvailable(preliminary.record, data.projects);
  return withPublicationMetadata(preliminary, decision);
}
```

Derive `requestedFields = metadataFieldsToGenerate(preliminary.record)`. If it
is empty, return the manual preliminary draft without fetching Reddit.

For automatic fields, add these private helpers to fetch the current issue and
all comment pages and to revalidate the canonical Reddit manifest:

```js
async function loadProjectSubmissionRetryContext({
  repository,
  issueNumber,
  request,
}) {
  if (!repository) {
    throw new Error("GITHUB_REPOSITORY is required for Reddit retry state.");
  }
  const issue = await request(
    `/repos/${repository}/issues/${issueNumber}`,
  );
  const comments = [];
  for (let page = 1; ; page += 1) {
    const suffix = page === 1 ? "" : `&page=${page}`;
    const current = await request(
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100${suffix}`,
    );
    comments.push(...current);
    if (current.length < 100) break;
  }
  return { issue, comments };
}

function assertCurrentRedditRetryContext(
  issue,
  { issueNumber, sourceIdentity },
) {
  const labels = issueLabels(issue);
  if (
    issue?.number !== issueNumber ||
    issue?.state !== "open" ||
    !labels.includes("issue-admitted") ||
    !labels.includes("project-submission") ||
    labels.includes("needs-information") ||
    labels.includes("submission-declined") ||
    !labels.some((label) =>
      [
        "needs-maintainer-review",
        "submission-retryable",
        "submission-pr-open",
      ].includes(label),
    )
  ) {
    throw new Error("Submission issue is no longer admitted.");
  }
  const parsed = parseProjectSubmissionIssue(issue.body ?? "", {
    allowLegacyV3: true,
  });
  if (!parsed.valid) throw new Error(parsed.errors.join(" "));
  const identity = parseSourceIdentity(parsed.manifest.source_url);
  if (
    identity.kind !== "reddit" ||
    `reddit:${identity.postId.toLowerCase()}` !== sourceIdentity
  ) {
    const error = new Error("Reddit retry source identity changed.");
    error.code = "reddit-identity-mismatch";
    throw error;
  }
}
```

Then load and validate the current marker:

```js
const sourceIdentity = `reddit:${decision.identity.postId.toLowerCase()}`;
const loadRetryContext =
  sourceClients.loadRetryContext ??
  (() =>
    loadProjectSubmissionRetryContext({
      repository: process.env.GITHUB_REPOSITORY,
      issueNumber: issue.number,
      request,
    }));
const initialRetryContext = sourceClients.issueComments
  ? { issue, comments: sourceClients.issueComments }
  : await loadRetryContext();
assertCurrentRedditRetryContext(initialRetryContext.issue, {
  issueNumber: issue.number,
  sourceIdentity,
});
const currentRetryState = loadRedditRetryState(
  initialRetryContext.comments,
  { issueNumber: issue.number, sourceIdentity },
);
```

If a pending marker is not yet due, throw
`RedditSourceRetryScheduledError({ state: currentRetryState, attempts: 0 })`
before running a source wave. In production, fetch comments with paginated
GitHub REST calls using `GITHUB_REPOSITORY`; tests inject `issueComments`.
Immediately after an exhausted wave, re-read the issue and comments, require
the issue to remain open/admitted/project-submission/retryable, and ensure the
marker has not changed before advancing it. Add an injectable
`loadRetryContext(): Promise<{ issue, comments }>` client so the concurrency
test can deterministically simulate a changed marker.

Run the source wave and branch explicitly:

```js
const wave = await loadRedditSubmissionSourceWave({
  project: preliminary.record,
  source: preliminary.source,
  snapshot: null,
  loadSource:
    sourceClients.loadEnrichmentSource ?? loadEnrichmentSource,
  sleep: sourceClients.sleep,
});

if (wave.status === "blocked") {
  const error = new Error(wave.failure.message);
  error.code = wave.failure.reasonCode;
  throw error;
}

if (wave.status === "exhausted") {
  const freshRetryContext = sourceClients.issueComments
    ? { issue, comments: sourceClients.issueComments }
    : await loadRetryContext();
  assertCurrentRedditRetryContext(freshRetryContext.issue, {
    issueNumber: issue.number,
    sourceIdentity,
  });
  const freshRetryState = loadRedditRetryState(
    freshRetryContext.comments,
    { issueNumber: issue.number, sourceIdentity },
  );
  if (
    (freshRetryState?.updated_at ?? null) !==
    (currentRetryState?.updated_at ?? null)
  ) {
    if (freshRetryState?.outcome === "pending") {
      throw new RedditSourceRetryScheduledError({
        state: freshRetryState,
        attempts: wave.attempts,
      });
    }
    throw new Error("Reddit retry state changed during the source wave.");
  }
  const transition = planRedditRetryTransition({
    current: freshRetryState,
    issueNumber: issue.number,
    sourceIdentity,
    reasonCode: wave.failure.reasonCode,
    now,
  });
  if (transition.action === "schedule") {
    throw new RedditSourceRetryScheduledError({
      state: transition.state,
      attempts: wave.attempts,
    });
  }
  return withPublicationMetadata(
    {
      ...(await draftProjectRecord({
        admitted: decision,
        observation: null,
        snapshot: null,
        enrichment: null,
        frontendVocabulary: data.vocabulary,
        frontendProjects: data.projects,
        metadataAuthority,
        metadataRequest,
        ...(manualSummaryCopy
          ? {
              publishedSummary: manualSummaryCopy.publishedSummary,
              copyResult: manualSummaryCopy.copyResult,
              copyMode: manualSummaryCopy.mode,
            }
          : {}),
        provisionalSummary: redditPlaceholderSummary(
          decision.manifest.project_type,
        ),
        provisionalWarning:
          "Reddit source remained unavailable after three retry waves.",
        copyRequired: manualSummaryCopy !== null,
        now,
      })),
      redditRetry: {
        outcome: "placeholder",
        wave_number: 3,
        max_waves: 3,
        completed_waves: transition.state.completed_waves,
        attempts: wave.attempts,
        next_eligible_retry_at: null,
        reason_code: wave.failure.reasonCode,
      },
    },
    decision,
  );
}
```

On source success, preserve the existing injected-enricher path:

```js
const vocabularies = await loadEnrichmentVocabularies();
const protectedTerms = protectedTermsForSubmission({
  record: preliminary.record,
  decision,
  data,
  submittedDescription: "",
});
const maxProviderAttempts = 5;

if (sourceClients.enrich) {
  enrichment = requestedEnrichmentResult(
    await sourceClients.enrich({
      record: preliminary.record,
      source: preliminary.source,
      snapshot: null,
      metadataAuthority,
      metadataRequest,
      requestedFields,
      maxProviderAttempts,
      protectedTerms,
    }),
    requestedFields,
  );
}
```

Otherwise call the existing provider path with the already-loaded source
injected so `enrichRecord()` does not fetch Reddit a fourth time:

```js
const enrichmentProvider = createEnrichmentProvider({
  apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
  apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
  model: process.env.TAVERNARY_ENRICHMENT_MODEL,
});
const output = await enrichRecord(
  preliminary.record,
  preliminary.source,
  null,
  enrichmentProvider,
  {
    vocabularies,
    maxProviderAttempts,
    protectedTerms,
    loadSource: async () => wave.source,
  },
);
```

Draft the ready result with `copyRequired:
manualSummaryCopy !== null || requestedFields.includes("summary")` and attach
only this sanitized report object:

```js
redditRetry: {
  outcome: "source-ready",
  wave_number: (currentRetryState?.completed_waves ?? 0) + 1,
  max_waves: 3,
  completed_waves: currentRetryState?.completed_waves ?? 0,
  attempts: wave.attempts,
  next_eligible_retry_at: null,
  reason_code: null,
},
```

Add the exact matching fields to `GeneratedSubmissionDraft` and
`GeneratedSubmissionReport`; `generateProjectSubmission()` maps the draft
object to `report.reddit_retry ?? null`. Import `parseSourceIdentity` alongside
`isRepositoryIdentity`.

- [ ] **Step 7: Add CLI retry-state file coverage**

Extend the CLI parser whitelist and `GenerateProjectSubmissionCliOptions` with
optional `--retry-state-path` / `retryStatePath`. Wrap only the
`prepareDraft()` call in `runGenerateProjectSubmissionCli()` so that it writes
`error.retryState` with `formatJson()` when the caught error has
`code === "reddit-source-retry-scheduled"` and a retry-state path was supplied,
then rethrows. Test that
`runGenerateProjectSubmissionCli()` writes only sanitized state when it catches
`RedditSourceRetryScheduledError`, then rethrows:

```ts
await expect(runGenerateProjectSubmissionCli(options)).rejects.toMatchObject({
  code: "reddit-source-retry-scheduled",
});
expect(JSON.parse(await readFile(retryStatePath, "utf8"))).toEqual({
  schema_version: 1,
  issue_number: 165,
  source_identity: "reddit:1v9u18m",
  completed_waves: 1,
  next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
  last_reason_code: "reddit-rate-limited",
  updated_at: "2026-07-30T18:00:00.000Z",
  outcome: "pending",
});
```

The state file must not contain Reddit text or provider output.

- [ ] **Step 8: Verify intake and record generation**

Run:

```powershell
npm.cmd test -- tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/reddit-submission-source-wave.test.ts
```

Expected: Reddit source-grounded, scheduled, placeholder, and integrity paths
pass; repository and generic external paths remain unchanged.

- [ ] **Step 9: Commit Reddit intake integration**

```powershell
git add -- scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts
git commit -m "feat(submissions): enrich Reddit intake"
```

---

### Task 5: Reconcile Failures and Dispatch Due Retry Waves

**Files:**

- Modify: `scripts/submissions/project-generation-failure.mjs:38-180`
- Modify: `scripts/submissions/project-generation-failure.d.mts`
- Create: `scripts/submissions/retry-project-submission-enrichment.mjs`
- Create: `scripts/submissions/retry-project-submission-enrichment.d.mts`
- Test: `tests/unit/project-generation-failure.test.ts`
- Create: `tests/unit/retry-project-submission-enrichment.test.ts`
- Modify: `.github/workflows/generate-project-submission.yml`
- Create: `.github/workflows/retry-project-submission-enrichment.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Consumes: Task 3 retry-state parser, renderer, and reconciler.
- Produces: `retryDueProjectSubmissionEnrichment(input): Promise<number[]>`.
- Extends: `reconcileProjectGenerationFailure({ redditRetryState })`.
- Workflow schedule: `*/15 * * * *`.

- [ ] **Step 1: Add failing failure-comment tests**

Add an optional state to the existing plan test:

```ts
test("embeds sanitized Reddit retry state in the existing failure comment", () => {
  const redditRetryState = {
    schema_version: 1,
    issue_number: 166,
    source_identity: "reddit:1v9u18m",
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending",
  };
  const plan = planProjectGenerationFailure({
    issue: issue([
      "issue-admitted",
      "project-submission",
      "needs-maintainer-review",
    ]),
    producer: "project-submission",
    ownedPull: null,
    runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/8",
    reasonCode: "reddit-source-retry-scheduled",
    redditRetryState,
  });

  expect(plan.commentBody).toContain(REDDIT_RETRY_MARKER);
  expect(plan.commentBody).toContain('"completed_waves":1');
  expect(plan.commentBody).not.toContain("Reddit post body");
});
```

- [ ] **Step 2: Run the failure tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-generation-failure.test.ts
```

Expected: retry state is ignored by the failure comment.

- [ ] **Step 3: Embed retry state in the existing idempotent comment**

Import `renderRedditRetryState()` and append it only for project submissions:

```js
const ordinaryRetryText =
  desired === "submission-pr-open"
    ? "An owned review pull request already exists, so review continues there."
    : "This request is retryable after the generation problem is corrected.";
const retryStateBlock =
  input.producer === "project-submission" && input.redditRetryState
    ? ["", renderRedditRetryState(input.redditRetryState)]
    : [];

const commentBody = [
  commentMarker,
  "Generation stopped before publication, so no catalog change was published.",
  "",
  `Reason category: \`${input.reasonCode ?? "generation-failed"}\``,
  ...retryStateBlock,
  "",
  `[View the failed GitHub Actions run](${input.runUrl})`,
  "",
  input.redditRetryState
    ? `Tavernary will retry automatically after ${input.redditRetryState.next_eligible_retry_at}.`
    : ordinaryRetryText,
].join("\n");
```

Read `REDDIT_RETRY_STATE_PATH` only when it exists, parse it through the exact
`normalizeRedditRetryState()` validator with the current issue number, and pass
the normalized object into reconciliation. When valid state exists, set the
displayed reason code to `reddit-source-retry-scheduled` and use the state's
stable failure code only inside the sanitized retry block. Invalid state files
fail closed without publishing their contents.

- [ ] **Step 4: Write failing dispatcher tests**

Create a request harness with four issues: due, not due, identity-mismatched,
and closed. The due case must dispatch only issue `165`:

```ts
await expect(
  retryDueProjectSubmissionEnrichment({
    repository: "MentallyQuill/Tavernary",
    ref: "main",
    now: "2026-07-30T19:05:00.000Z",
    request,
  }),
).resolves.toEqual([165]);

expect(request).toHaveBeenCalledWith(
  "/repos/MentallyQuill/Tavernary/actions/workflows/generate-project-submission.yml/dispatches",
  {
    method: "POST",
    body: JSON.stringify({
      ref: "main",
      inputs: {
        issue_number: "165",
        force_regeneration: "false",
      },
    }),
  },
);
```

Assert pagination, pull-request exclusion, required labels, exact source
identity, `outcome: "pending"`, and `next_eligible_retry_at <= now`.

- [ ] **Step 5: Run the dispatcher test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/retry-project-submission-enrichment.test.ts
```

Expected: import failure because the dispatcher module does not exist.

- [ ] **Step 6: Implement the due retry dispatcher**

Follow the paginated request pattern in
`retry-frontend-dependencies.mjs`:

```js
export async function retryDueProjectSubmissionEnrichment({
  repository,
  ref = "main",
  now,
  request,
}) {
  const dispatched = [];
  for (let page = 1; ; page += 1) {
    const issues = await request(
      `/repos/${repository}/issues?state=open&labels=issue-admitted%2Cproject-submission%2Csubmission-retryable&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      if (issue.pull_request || issue.state !== "open") continue;
      const comments = await request(
        `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
      );
      const parsed = parseProjectSubmissionIssue(issue.body ?? "", {
        allowLegacyV3: true,
      });
      if (!parsed.valid) continue;
      let identity;
      try {
        identity = parseSourceIdentity(parsed.manifest.source_url);
      } catch {
        continue;
      }
      if (identity.kind !== "reddit") continue;
      const state = loadRedditRetryState(comments, {
        issueNumber: issue.number,
        sourceIdentity: `reddit:${identity.postId.toLowerCase()}`,
      });
      if (
        !state ||
        state.outcome !== "pending" ||
        new Date(state.next_eligible_retry_at).getTime() >
          new Date(now).getTime()
      ) {
        continue;
      }
      await request(
        `/repos/${repository}/actions/workflows/generate-project-submission.yml/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({
            ref,
            inputs: {
              issue_number: String(issue.number),
              force_regeneration: "false",
            },
          }),
        },
      );
      dispatched.push(issue.number);
    }
    if (issues.length < 100) break;
  }
  return dispatched;
}
```

Import `parseProjectSubmissionIssue`, `parseSourceIdentity`, and
`loadRedditRetryState`. Replace the single comments request shown above with a
local pagination helper using the existing `per_page=100` / `page=N` pattern;
the state marker may not be on page one. Query issues with all three required
labels:
`issue-admitted,project-submission,submission-retryable`. Reject issues that
also carry `needs-information`, `submission-declined`, or
`submission-pr-open`.

The CLI requires `GITHUB_REPOSITORY` and `GITHUB_TOKEN` and uses the same
bounded GitHub REST helper conventions as other submission retry scripts.

- [ ] **Step 7: Add failing workflow-contract tests**

Extend the workflow name maps with:

```ts
"retry-project-submission-enrichment":
  "Project submissions: Retry Reddit enrichment",

"retry-project-submission-enrichment": [
  "Project submissions:",
  "Retry due Reddit enrichment",
],
```

The first entry belongs in `expectedNames`; the second belongs in
`expectedRunNameParts`. Add `"retry-project-submission-enrichment"` to the
workflow list in the pinned-actions test.

Add a focused workflow test:

```ts
test("retries due Reddit submissions every fifteen minutes", async () => {
  const retry = await workflow("retry-project-submission-enrichment");
  expect(retry.on.schedule).toEqual([{ cron: "*/15 * * * *" }]);
  expect(retry.on.workflow_dispatch).toBeNull();
  expect(retry.permissions).toEqual({
    contents: "read",
    issues: "read",
    actions: "write",
  });
  expect(retry.concurrency).toEqual({
    group: "retry-project-submission-enrichment",
    "cancel-in-progress": false,
  });
  expect(
    allSteps(retry).some((step) =>
      step.run?.includes(
        "node scripts/submissions/retry-project-submission-enrichment.mjs",
      ),
    ),
  ).toBe(true);
});
```

Also assert the generation workflow passes
`--retry-state-path "${RUNNER_TEMP}/project-submission-retry-state.json"` and
the failure step exposes that same path as `REDDIT_RETRY_STATE_PATH`.

- [ ] **Step 8: Run workflow tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/project-generation-failure.test.ts tests/unit/retry-project-submission-enrichment.test.ts
```

Expected: the new workflow is absent and the generation workflow does not
carry retry state into reconciliation.

- [ ] **Step 9: Add the workflows**

Create `.github/workflows/retry-project-submission-enrichment.yml`:

```yaml
name: "Project submissions: Retry Reddit enrichment"
run-name: "Project submissions: Retry due Reddit enrichment"

on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions:
  contents: read
  issues: read
  actions: write

concurrency:
  group: retry-project-submission-enrichment
  cancel-in-progress: false

jobs:
  retry:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - name: Dispatch due Reddit submission retries
        run: node scripts/submissions/retry-project-submission-enrichment.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Update the generation CLI call and failure reconciliation environment with the
same runner-temp retry-state path:

```yaml
node scripts/submissions/generate-project-submission.mjs \
  --issue-number "$ISSUE_NUMBER" \
  --output-directory "$GITHUB_WORKSPACE" \
  --report-path "${RUNNER_TEMP}/admission-report.json" \
  --retry-state-path "${RUNNER_TEMP}/project-submission-retry-state.json"
```

After the existing PR creation/update and issue-label transition, add a
`Reconcile Reddit retry success` step guarded by the same PR-step condition. It
reads the admission report, exits
without mutation when `reddit_retry` is null or when no existing retry marker
exists, and otherwise invokes `upsertRedditRetryComment()` with a normalized
`source-ready` or `placeholder` terminal state and the current Actions run URL.
The upsert re-reads the issue and comments itself; it patches the existing
generation-failure comment and never creates a second comment on success. Add a
direct CLI entry point to
`scripts/submissions/project-submission-retry-state.mjs` using:

```yaml
env:
  ADMISSION_REPORT_PATH: ${{ runner.temp }}/admission-report.json
  GENERATION_RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
run: node scripts/submissions/project-submission-retry-state.mjs
```

- [ ] **Step 10: Verify automated retry contracts**

Run:

```powershell
npm.cmd test -- tests/unit/project-generation-failure.test.ts tests/unit/project-submission-retry-state.test.ts tests/unit/retry-project-submission-enrichment.test.ts tests/unit/workflows.test.ts
```

Expected: all state, dispatcher, failure, and workflow tests pass.

- [ ] **Step 11: Commit workflow automation**

```powershell
git add -- scripts/submissions/project-generation-failure.mjs scripts/submissions/project-generation-failure.d.mts scripts/submissions/retry-project-submission-enrichment.mjs scripts/submissions/retry-project-submission-enrichment.d.mts tests/unit/project-generation-failure.test.ts tests/unit/retry-project-submission-enrichment.test.ts .github/workflows/generate-project-submission.yml .github/workflows/retry-project-submission-enrichment.yml tests/unit/workflows.test.ts
git commit -m "feat(submissions): schedule Reddit retries"
```

---

### Task 6: Verify the Complete Change

**Files:**

- Verify: all files from Tasks 1–5
- Reference: `docs/superpowers/specs/2026-07-30-owner-summary-and-reddit-retry-design.md`

**Interfaces:**

- Confirms the complete browser → manifest → owner generation path.
- Confirms the complete Reddit issue → source wave → durable retry → placeholder/publication proposal path.

- [ ] **Step 1: Format the touched files**

Run:

```powershell
npm.cmd exec prettier -- --write src/features/help/components/project-owner-builder.tsx src/features/help/components/owner-card-fields.tsx src/features/help/project-owner-manifest.mjs scripts/submissions/reddit-submission-source-wave.mjs scripts/submissions/reddit-submission-source-wave.d.mts scripts/submissions/project-submission-retry-state.mjs scripts/submissions/project-submission-retry-state.d.mts scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/project-generation-failure.mjs scripts/submissions/project-generation-failure.d.mts scripts/submissions/retry-project-submission-enrichment.mjs scripts/submissions/retry-project-submission-enrichment.d.mts tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/reddit-submission-source-wave.test.ts tests/unit/project-submission-retry-state.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts tests/unit/project-generation-failure.test.ts tests/unit/retry-project-submission-enrichment.test.ts tests/unit/workflows.test.ts .github/workflows/generate-project-submission.yml .github/workflows/retry-project-submission-enrichment.yml
```

Expected: Prettier completes without error.

- [ ] **Step 2: Run all focused regression tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/reddit-enrichment-source.test.ts tests/unit/reddit-submission-source-wave.test.ts tests/unit/project-submission-retry-state.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/generate-project-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/project-generation-failure.test.ts tests/unit/retry-project-submission-enrichment.test.ts tests/unit/workflows.test.ts tests/unit/project-publication-transaction.test.ts
```

Expected: every focused regression passes.

- [ ] **Step 3: Build generated catalog data required by typecheck and UI tests**

Run:

```powershell
npm.cmd run catalog:build
```

Expected: generated catalog completes without validation errors. Do not
hand-edit `src/generated/catalog.json`.

- [ ] **Step 4: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all Vitest tests, Next.js production build, and static-export verification pass.

- [ ] **Step 5: Inspect the final diff and repository state**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only task-related files differ; unrelated
`.tmp-*-issue.md` files remain untouched.

- [ ] **Step 6: Commit any verification-only formatting changes**

If Step 1 changed files after the task commits:

```powershell
git add -- src/features/help/components/project-owner-builder.tsx src/features/help/components/owner-card-fields.tsx src/features/help/project-owner-manifest.mjs scripts/submissions/reddit-submission-source-wave.mjs scripts/submissions/reddit-submission-source-wave.d.mts scripts/submissions/project-submission-retry-state.mjs scripts/submissions/project-submission-retry-state.d.mts scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/project-generation-failure.mjs scripts/submissions/project-generation-failure.d.mts scripts/submissions/retry-project-submission-enrichment.mjs scripts/submissions/retry-project-submission-enrichment.d.mts tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/reddit-submission-source-wave.test.ts tests/unit/project-submission-retry-state.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/draft-project-record.test.ts tests/unit/project-generation-failure.test.ts tests/unit/retry-project-submission-enrichment.test.ts tests/unit/workflows.test.ts .github/workflows/generate-project-submission.yml .github/workflows/retry-project-submission-enrichment.yml
git commit -m "style(submissions): format Reddit retry flow"
```

If Step 1 produced no post-commit diff, skip this commit.
