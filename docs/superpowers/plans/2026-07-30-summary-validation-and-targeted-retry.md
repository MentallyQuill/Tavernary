# Summary Validation and Targeted Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept source-grounded generated summaries between 120 and 220 characters without word or sentence rules, reject links, and spend up to five provider calls only on project intake and targeted bulk retries.

**Architecture:** Put the generated-summary text rules in one catalog contract used by runtime validation and provider schema constants. Put sequential generate/validate/repair behavior in a small bounded-attempt helper, then make each caller choose its budget explicitly: intake `5`, bulk primary `1`, bulk retry `5`, and unspecified callers `1`.

**Tech Stack:** Node.js 24 ESM, TypeScript declarations, Vitest, GitHub Actions workflow consumers

## Global Constraints

- Generated summaries contain 120–220 characters inclusive.
- Generated summaries are non-empty, single-line plain text without Markdown or list syntax.
- Generated summaries contain no URLs or recognizable domain-style links, with no domain exceptions.
- Word count, sentence count, and sentence structure are not acceptance criteria.
- Structured-output, source-evidence, allowed-tag, catalog-copy policy, and emoji checks remain authoritative.
- Each provider call returns one candidate; accept the first complete valid response.
- Do not truncate, splice, rank, or rewrite rejected candidates.
- Routine bulk primary enrichment receives one call total.
- New-project intake and targeted bulk retry receive five calls total.
- Only validation failures receive in-process repair calls; provider and source failures retain existing handling.
- Existing tag-only fallback and terminal `output-invalid` behavior remain.
- The catalog storage schema and owner-authored manual-summary contract do not change.

---

## File Structure

- Create `scripts/catalog/generated-summary-contract.mjs`: generated-summary length constants, URL/domain detection, and text validation.
- Create `scripts/catalog/generated-summary-contract.d.mts`: public constants and validator result type.
- Modify `scripts/catalog/tag-classification.mjs`: delegate generated summary text checks to the shared contract while preserving the no-README fallback and evidence checks.
- Modify `scripts/catalog/enrichment-provider.mjs`: use the shared length constants in the JSON schema and replace word/sentence prompt instructions.
- Create `scripts/catalog/enrichment-attempts.mjs`: generic bounded generate/validate/repair loop that does not retry thrown provider errors.
- Create `scripts/catalog/enrichment-attempts.d.mts`: typed interface for the bounded loop.
- Modify `scripts/catalog/enrich-readmes.mjs`: use the bounded loop, simplify repair diagnostics, and choose phase-specific attempt budgets.
- Modify `scripts/catalog/enrich-readmes.d.mts`: expose `maxProviderAttempts?: number` on direct enrichment options.
- Modify `scripts/submissions/generate-project-submission.mjs`: select five attempts for project intake and expose that selection to injected test clients.
- Modify `tests/unit/tag-classification.test.ts`: boundary, prose-shape, Markdown, and URL regression coverage.
- Modify `tests/unit/enrichment-contract.test.ts`: end-to-end generated-summary acceptance coverage through the complete enrichment contract.
- Modify `tests/unit/enrichment-provider.test.ts`: prompt and JSON-schema assertions.
- Create `tests/unit/enrichment-attempts.test.ts`: isolated bounded-loop behavior and provider-error coverage.
- Modify `tests/unit/enrich-readmes.test.ts`: direct and batch budget, latest-output repair, fallback, and telemetry coverage.
- Modify `tests/unit/enrich-readmes-cli.test.ts`: replace stale word/sentence diagnostics and verify primary/retry orchestration.
- Modify `tests/unit/generate-project-submission-cli.test.ts`: assert intake selects five total calls.
- Modify `docs/reference/project-record-schema.md`: distinguish the 1–220 storage contract from the stricter 120–220 automatic-generation contract.

---

### Task 1: Generated Summary Text Contract

**Files:**
- Create: `scripts/catalog/generated-summary-contract.mjs`
- Create: `scripts/catalog/generated-summary-contract.d.mts`
- Modify: `scripts/catalog/tag-classification.mjs:62-102`
- Modify: `scripts/catalog/enrichment-provider.mjs:10-18,119-195`
- Test: `tests/unit/tag-classification.test.ts`
- Test: `tests/unit/enrichment-contract.test.ts`
- Test: `tests/unit/enrichment-provider.test.ts`

**Interfaces:**
- Produces: `GENERATED_SUMMARY_MIN_LENGTH = 120`
- Produces: `GENERATED_SUMMARY_MAX_LENGTH = 220`
- Produces: `generatedSummaryTextErrors(value: unknown): string[]`
- Consumes: existing `validateTagGenerationOutput(...)` and `validateEnrichmentOutput(...)` contracts

- [ ] **Step 1: Add failing generated-summary boundary and content tests**

Add a helper and parameterized cases to `tests/unit/tag-classification.test.ts`:

```ts
function summaryOutput(value: string) {
  return {
    summary: { value, evidence: ["readme:1-4"] },
  };
}

test.each([
  ["119 characters", "A".repeat(119), "summary value must be at least 120 characters"],
  ["221 characters", "A".repeat(221), "summary value must be 220 characters or fewer"],
  [
    "absolute URL",
    `${"Source-grounded catalog text ".repeat(5)}https://example.com`,
    "summary value must not contain URLs or domain-style links",
  ],
  [
    "protocol-relative URL",
    `${"Source-grounded catalog text ".repeat(5)}//example.com/path`,
    "summary value must not contain URLs or domain-style links",
  ],
  [
    "www address",
    `${"Source-grounded catalog text ".repeat(5)}www.example.com`,
    "summary value must not contain URLs or domain-style links",
  ],
  [
    "bare domain",
    `${"Source-grounded catalog text ".repeat(5)}example.com`,
    "summary value must not contain URLs or domain-style links",
  ],
] as const)("rejects generated summary %s", (_label, value, message) => {
  const result = validateTagGenerationOutput(summaryOutput(value), {
    fields: ["summary"],
    vocabulary,
    kind: "extension",
  });
  expect(result).toMatchObject({ valid: false });
  if (!result.valid) expect(result.errors).toContain(message);
});

test.each([
  "A".repeat(120),
  "B".repeat(220),
  `${"Natural source-grounded prose ".repeat(5)}without forced punctuation`.slice(
    0,
    150,
  ),
])("accepts generated summary text without word or sentence rules", (value) => {
  expect(
    validateTagGenerationOutput(summaryOutput(value), {
      fields: ["summary"],
      vocabulary,
      kind: "extension",
    }),
  ).toMatchObject({ valid: true, summary: value });
});
```

Retain explicit cases for line breaks and Markdown/list syntax. Add an
`enrichment-contract.test.ts` case that wraps a 120-character value in the full
copy diagnostics and expects `{ valid: true }`, proving the copy-policy layer
does not reintroduce the deleted word or sentence rules.

- [ ] **Step 2: Run the focused tests and verify the new expectations fail**

Run:

```powershell
npx.cmd vitest run tests/unit/tag-classification.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts
```

Expected: FAIL because 119-character, one-sentence, and URL-bearing summaries
still satisfy the old validator differently, and the provider schema still has
`minLength: 1`.

- [ ] **Step 3: Implement the shared generated-summary text contract**

Create `scripts/catalog/generated-summary-contract.mjs`:

```js
export const GENERATED_SUMMARY_MIN_LENGTH = 120;
export const GENERATED_SUMMARY_MAX_LENGTH = 220;

const lineBreak = /[\r\n\u2028\u2029]/u;
const markdownOrList =
  /```|`|[*_#[\]>]|^\s*(?:[-*+]\s|\d+[.)]\s)/mu;
const urlOrDomain =
  /(?:\b(?:https?:\/\/|www\.)\S+|(?:^|[\s([{"'])\/\/[a-z0-9][^\s]*|(?:^|[\s([{"'])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?=$|[\s/:?#),.!;'"}}\]]))/iu;

export function generatedSummaryTextErrors(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return ["summary value must be a non-empty string"];
  }
  const errors = [];
  if (value.length < GENERATED_SUMMARY_MIN_LENGTH) {
    errors.push(
      `summary value must be at least ${GENERATED_SUMMARY_MIN_LENGTH} characters`,
    );
  }
  if (value.length > GENERATED_SUMMARY_MAX_LENGTH) {
    errors.push(
      `summary value must be ${GENERATED_SUMMARY_MAX_LENGTH} characters or fewer`,
    );
  }
  if (lineBreak.test(value)) {
    errors.push("summary value must not contain line breaks");
  }
  if (markdownOrList.test(value)) {
    errors.push("summary value must not contain markdown or list syntax");
  }
  if (urlOrDomain.test(value)) {
    errors.push("summary value must not contain URLs or domain-style links");
  }
  return errors;
}
```

Create `scripts/catalog/generated-summary-contract.d.mts`:

```ts
export const GENERATED_SUMMARY_MIN_LENGTH: 120;
export const GENERATED_SUMMARY_MAX_LENGTH: 220;
export function generatedSummaryTextErrors(value: unknown): string[];
```

In `tag-classification.mjs`, import `generatedSummaryTextErrors`. Preserve the
special `"No README file found."` path before applying the shared generated
contract, then replace the old word, length, line, Markdown, and sentence block
with:

```js
errors.push(...generatedSummaryTextErrors(value));
```

Keep `evidenceErrors(...)` unchanged.

- [ ] **Step 4: Update the provider prompt and JSON schema**

Import both shared length constants into `enrichment-provider.mjs`. Replace the
summary paragraph with:

```text
For summary, write one natural source-grounded plain-text description between 120 and 220 characters inclusive. Do not include line breaks, Markdown, list syntax, URLs, or domain-style links. Explain the project's purpose and a distinctive source-supported workflow, capability, or benefit without enforcing a word count or sentence count. Include at least one compact evidence reference.
```

Change the summary schema value to:

```js
value: {
  type: "string",
  minLength: GENERATED_SUMMARY_MIN_LENGTH,
  maxLength: GENERATED_SUMMARY_MAX_LENGTH,
},
```

Update `tests/unit/enrichment-provider.test.ts` to expect
`{ type: "string", minLength: 120, maxLength: 220 }`, require the prompt to
mention `120` through `220` and no URLs, and explicitly assert it does not
contain `24-36`, `24-30`, or `exactly two sentences`.

- [ ] **Step 5: Run focused tests and format the changed files**

Run:

```powershell
npx.cmd prettier --write scripts/catalog/generated-summary-contract.mjs scripts/catalog/generated-summary-contract.d.mts scripts/catalog/tag-classification.mjs scripts/catalog/enrichment-provider.mjs tests/unit/tag-classification.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts
npx.cmd vitest run tests/unit/tag-classification.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the generated-summary contract**

```powershell
git add scripts/catalog/generated-summary-contract.mjs scripts/catalog/generated-summary-contract.d.mts scripts/catalog/tag-classification.mjs scripts/catalog/enrichment-provider.mjs tests/unit/tag-classification.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts
git commit -m "fix(enrichment): simplify summary contract"
```

---

### Task 2: Reusable Bounded Attempt Loop

**Files:**
- Create: `scripts/catalog/enrichment-attempts.mjs`
- Create: `scripts/catalog/enrichment-attempts.d.mts`
- Create: `tests/unit/enrichment-attempts.test.ts`

**Interfaces:**
- Produces: `generateValidatedEnrichment<TInput, TOutput, TMetadata>(options)`
- Consumes: `generate(input)`, `validate(output)`, and
  `repair(input, validation, output)` callbacks
- Returns: the last `{ output, metadata, validation }`, whether valid or
  exhausted
- Throws: provider/transport errors immediately without another call

- [ ] **Step 1: Write failing bounded-loop tests**

Create `tests/unit/enrichment-attempts.test.ts` with:

```ts
import { expect, test, vi } from "vitest";

import { generateValidatedEnrichment } from "../../scripts/catalog/enrichment-attempts.mjs";

test("returns the first valid response within the attempt budget", async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ output: { value: "bad-1" }, metadata: { call: 1 } })
    .mockResolvedValueOnce({ output: { value: "bad-2" }, metadata: { call: 2 } })
    .mockResolvedValueOnce({ output: { value: "good" }, metadata: { call: 3 } });
  const result = await generateValidatedEnrichment({
    initialInput: { repair: 0 },
    maxAttempts: 5,
    generate,
    validate: (output) =>
      output.value === "good"
        ? { valid: true }
        : { valid: false, errors: [output.value] },
    repair: (input) => ({ repair: input.repair + 1 }),
  });
  expect(result).toMatchObject({
    output: { value: "good" },
    metadata: { call: 3 },
    validation: { valid: true },
  });
  expect(generate).toHaveBeenCalledTimes(3);
});

test("returns the fifth invalid response without making a sixth call", async () => {
  const generate = vi.fn(async () => ({
    output: { value: `bad-${generate.mock.calls.length}` },
    metadata: {},
  }));
  const result = await generateValidatedEnrichment({
    initialInput: {},
    maxAttempts: 5,
    generate,
    validate: (output) => ({ valid: false, errors: [output.value] }),
    repair: (input, validation, output) => ({
      ...input,
      repair: { validation, rejected: output.value },
    }),
  });
  expect(result.validation).toMatchObject({
    valid: false,
    errors: ["bad-5"],
  });
  expect(generate).toHaveBeenCalledTimes(5);
});

test("does not retry a thrown provider failure", async () => {
  const generate = vi.fn(async () => {
    throw Object.assign(new Error("provider failed"), {
      code: "provider-timeout",
    });
  });
  await expect(
    generateValidatedEnrichment({
      initialInput: {},
      maxAttempts: 5,
      generate,
      validate: () => ({ valid: true }),
      repair: (input) => input,
    }),
  ).rejects.toMatchObject({ code: "provider-timeout" });
  expect(generate).toHaveBeenCalledOnce();
});

test.each([0, -1, 1.5, Number.NaN])(
  "rejects invalid maximum attempt value %s",
  async (maxAttempts) => {
    await expect(
      generateValidatedEnrichment({
        initialInput: {},
        maxAttempts,
        generate: vi.fn(),
        validate: vi.fn(),
        repair: vi.fn(),
      }),
    ).rejects.toThrow(
      "maximum enrichment attempts must be a positive integer",
    );
  },
);
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-attempts.test.ts
```

Expected: FAIL because `scripts/catalog/enrichment-attempts.mjs` does not
exist.

- [ ] **Step 3: Implement the bounded loop**

Create `scripts/catalog/enrichment-attempts.mjs`:

```js
export async function generateValidatedEnrichment({
  initialInput,
  maxAttempts = 1,
  generate,
  validate,
  repair,
}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maximum enrichment attempts must be a positive integer");
  }
  let input = initialInput;
  let latest;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const generated = await generate(input);
    const validation = validate(generated.output);
    latest = { ...generated, validation };
    if (validation.valid || attempt === maxAttempts) return latest;
    input = repair(input, validation, generated.output);
  }
  throw new Error("enrichment attempt loop ended unexpectedly");
}
```

Create `scripts/catalog/enrichment-attempts.d.mts` with generic input, output,
metadata, and the discriminated validation union:

```ts
export type EnrichmentValidation =
  | { valid: true }
  | {
      valid: false;
      errors?: string[];
      message?: string;
      repairHint?: string;
    };

export function generateValidatedEnrichment<TInput, TOutput, TMetadata>(options: {
  initialInput: TInput;
  maxAttempts?: number;
  generate(input: TInput): Promise<{ output: TOutput; metadata: TMetadata }>;
  validate(output: TOutput): EnrichmentValidation;
  repair(
    input: TInput,
    validation: Extract<EnrichmentValidation, { valid: false }>,
    output: TOutput,
  ): TInput;
}): Promise<{
  output: TOutput;
  metadata: TMetadata;
  validation: EnrichmentValidation;
}>;
```

- [ ] **Step 4: Format and run the bounded-loop tests**

Run:

```powershell
npx.cmd prettier --write scripts/catalog/enrichment-attempts.mjs scripts/catalog/enrichment-attempts.d.mts tests/unit/enrichment-attempts.test.ts
npx.cmd vitest run tests/unit/enrichment-attempts.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the bounded loop**

```powershell
git add scripts/catalog/enrichment-attempts.mjs scripts/catalog/enrichment-attempts.d.mts tests/unit/enrichment-attempts.test.ts
git commit -m "refactor(enrichment): bound provider attempts"
```

---

### Task 3: Intake and Bulk Retry Budgets

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs:87-189,344-473,475-679`
- Modify: `scripts/catalog/enrich-readmes.d.mts:137-158`
- Modify: `scripts/submissions/generate-project-submission.mjs:516-577`
- Modify: `tests/unit/enrich-readmes.test.ts:517-675,700-830`
- Modify: `tests/unit/enrich-readmes-cli.test.ts:352-392,530-640`
- Modify: `tests/unit/generate-project-submission-cli.test.ts:534-597`

**Interfaces:**
- Consumes: `generateValidatedEnrichment(...)` from Task 2
- Produces: `EnrichmentOptions.maxProviderAttempts?: number`
- Produces: conservative direct-enrichment default of one call
- Produces: submission intake budget `5`
- Produces: bulk `primary` budget `1`, bulk `retry` budget `5`

- [ ] **Step 1: Add failing direct-enrichment and submission budget tests**

In `tests/unit/enrich-readmes.test.ts`, replace the old fixed three-call tests
with an explicit five-call intake-style test:

```ts
test("uses up to five calls and the latest invalid output", async () => {
  const invalid = Array.from({ length: 4 }, (_, index) => ({
    ...outputFor({
      requestedFields: ["summary", "tags"],
      allowedTags: vocabularies.tags,
    }),
    summary: {
      value: `Rejected ${index + 1} ${"x".repeat(210)}`,
      evidence: ["readme:1-3"],
    },
  }));
  const valid = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const responses = [...invalid, valid];
  const generate = vi.fn(async () => ({
    output: responses[generate.mock.calls.length - 1],
    metadata: providerMetadata,
  }));

  await expect(
    enrichRecord(record, sourceRecord, snapshot, { generate }, {
      vocabularies,
      loadSource: async () => readySource(),
      maxProviderAttempts: 5,
    }),
  ).resolves.toEqual(valid);
  expect(generate).toHaveBeenCalledTimes(5);
  expect(generate.mock.calls[4]?.[0].repair).toMatchObject({
    rejectedSummary: invalid[3].summary.value,
  });
});
```

Add a separate default-budget test with an always-invalid response and no
`maxProviderAttempts`; expect `output-invalid` and exactly one provider call.
Update the tag-fallback test to expect one call under the conservative default,
because fallback is evaluated after budget exhaustion.

In `tests/unit/generate-project-submission-cli.test.ts`, extend the injected
`enrich` assertion:

```ts
expect(enrich).toHaveBeenCalledWith(
  expect.objectContaining({
    requestedFields: ["summary", "tags"],
    maxProviderAttempts: 5,
  }),
);
```

- [ ] **Step 2: Add failing bulk primary and targeted-retry tests**

In `tests/unit/enrich-readmes.test.ts`, add:

```ts
test("bulk primary uses one call and returns output-invalid", async () => {
  const generate = vi.fn(async () => ({
    output: {
      ...outputFor({
        requestedFields: ["summary", "tags"],
        allowedTags: vocabularies.tags,
      }),
      summary: {
        value: "Too short.",
        evidence: ["readme:1-3"],
      },
    },
    metadata: providerMetadata,
  }));
  const [result] = await runEnrichmentBatch({
    projectIds: ["fixture"],
    recordsById: { fixture: record },
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "primary",
    provider: { generate },
    validateSnapshot: () => true,
    vocabularies,
    loadSource: async () => readySource(),
    writeRecord: vi.fn(),
  });
  expect(result).toMatchObject({
    outcome: "failed",
    reasonCode: "output-invalid",
    providerCallCount: 1,
    providerRepairCallCount: 0,
  });
  expect(generate).toHaveBeenCalledOnce();
});

test("bulk retry stops on the fifth valid response", async () => {
  const valid = outputFor({
    requestedFields: ["summary", "tags"],
    allowedTags: vocabularies.tags,
  });
  const generate = vi.fn(async () => ({
    output:
      generate.mock.calls.length === 5
        ? valid
        : {
            ...valid,
            summary: {
              value: "Too short.",
              evidence: ["readme:1-3"],
            },
          },
    metadata: providerMetadata,
  }));
  const [result] = await runEnrichmentBatch({
    projectIds: ["fixture"],
    recordsById: { fixture: record },
    sourcesById: { [sourceRecord.id]: sourceRecord },
    snapshotsBySourceId: { [sourceRecord.id]: snapshot },
    phase: "retry",
    provider: { generate },
    validateSnapshot: () => true,
    vocabularies,
    loadSource: async () => readySource(),
    writeRecord: vi.fn(),
    previousEntries: {
      fixture: {
        reason_code: "output-invalid",
        message: "summary value must be at least 120 characters",
      },
    } as never,
  });
  expect(result).toMatchObject({
    outcome: "enriched",
    providerCallCount: 5,
  });
  expect(generate).toHaveBeenCalledTimes(5);
});
```

Add an all-invalid retry case that expects five calls, the fifth response's
error, and no sixth call. Update CLI orchestration tests so the primary failure
enters `retry-pending`, while the resumed retry phase can make five calls for
that item. Assert already enriched primary items are not called again.

- [ ] **Step 3: Run the integration tests and verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission-cli.test.ts
```

Expected: FAIL because direct enrichment still defaults to three calls, batch
primary still performs an immediate repair, retry cannot reach five calls, and
submission does not expose the five-call budget.

- [ ] **Step 4: Integrate the bounded loop into direct enrichment**

Import `generateValidatedEnrichment` in `enrich-readmes.mjs`. In
`enrichRecord(...)`, replace the hard-coded `repairAttempt < 2` loop with:

```js
const generated = await generateValidatedEnrichment({
  initialInput: input,
  maxAttempts: options.maxProviderAttempts ?? 1,
  generate: (providerInput) => provider.generate(providerInput),
  validate: (candidate) =>
    validateOutput(candidate, record, vocabularies, input),
  repair: validationRepairInput,
});
let output = generated.output;
let validation = generated.validation;
```

Preserve the existing tag-only fallback after exhaustion. If validation remains
invalid, throw `output-invalid` with the latest validation message. Add
`maxProviderAttempts?: number` to the `enrichRecord` options in
`enrich-readmes.d.mts`.

Remove `summaryMeasurements(...)`. Update `validationRepairInput(...)` so a
rejected summary produces:

```js
const summaryGuidance =
  rejectedSummary === undefined
    ? validation.repairHint
    : `The rejected summary has ${rejectedSummary.length} characters. ${validation.repairHint} Keep the replacement between 120 and 220 characters as single-line plain text without Markdown, list syntax, URLs, or domain-style links.`;
```

In the repair-hint mapping, add the below-minimum and URL messages, preserve the
maximum, line, Markdown, evidence, and tag messages, and delete all word-count
and sentence-count branches.

- [ ] **Step 5: Integrate phase-specific budgets into batch enrichment**

In `processProject(...)`, call the shared bounded loop only for ready
source-backed provider output:

```js
const generated = await generateValidatedEnrichment({
  initialInput: providerInput,
  maxAttempts: phase === "retry" ? 5 : 1,
  generate,
  validate: (candidate) =>
    validateOutput(candidate, record, vocabularies, providerInput),
  repair: validationRepairInput,
});
output = generated.output;
providerMetadata = generated.metadata;
validation = generated.validation;
```

Keep the existing `generate(...)` telemetry wrapper around the provider. It
must increment actual calls and repair calls, including a targeted retry's
first request when that request already contains repair context from the prior
run. Preserve immediate return on thrown provider errors and existing rate
limit accounting.

Remove the duplicated one-repair branch at current lines 624–643. Run tag-only
fallback only after the selected budget is exhausted.

- [ ] **Step 6: Select five calls from project submission**

In `prepareProjectSubmissionDraft(...)`, define:

```js
const maxProviderAttempts = 5;
```

Include `maxProviderAttempts` in the object passed to an injected
`sourceClients.enrich(...)`, and pass it in the options object supplied to
`enrichRecord(...)`. This makes the production choice explicit and observable
in the existing injected-client tests.

- [ ] **Step 7: Replace stale word/sentence fixtures and diagnostics**

Update `tests/unit/enrich-readmes.test.ts` and
`tests/unit/enrich-readmes-cli.test.ts`:

- use under-120, over-220, URL, evidence, or tag defects instead of word-count
  and sentence-count defects;
- expect repair text to report character count and the 120–220/no-link rule;
- preserve preflight's existing single validation repair and transport retry
  behavior;
- update provider-call and repair-call aggregate counts for the new bulk
  primary/retry budgets.

Do not edit historical design or plan documents that describe the superseded
contract.

- [ ] **Step 8: Format and run all focused enrichment and submission tests**

Run:

```powershell
npx.cmd prettier --write scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/submissions/generate-project-submission.mjs tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission-cli.test.ts
npx.cmd vitest run tests/unit/enrichment-attempts.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission-cli.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 9: Commit the call-budget integration**

```powershell
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/submissions/generate-project-submission.mjs tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission-cli.test.ts
git commit -m "fix(submissions): target enrichment retries"
```

---

### Task 4: Contract Documentation and Complete Verification

**Files:**
- Modify: `docs/reference/project-record-schema.md:10-13`
- Verify: all files changed by Tasks 1–3

**Interfaces:**
- Consumes: the implemented 120–220 generated-summary contract and explicit
  call budgets
- Produces: user-facing reference text that does not misstate the unchanged
  catalog storage schema

- [ ] **Step 1: Update the schema reference**

Keep the existing storage requirement and add the generation distinction:

```markdown
- `summary`: 1-220 characters. Automatically generated summaries must be
  120-220 characters, single-line plain text without Markdown, list syntax,
  URLs, or domain-style links. Manual summaries retain the storage contract.
```

- [ ] **Step 2: Scan active code, tests, and reference docs for stale rules**

Run:

```powershell
rg -n '24.?36|exactly two sentences|24.?30 words|160.?200 characters|three provider calls|two validation-repair' scripts tests/unit docs/reference
```

Expected: no active prompt, validator, repair-hint, unit-test, or reference-doc
matches for the removed word/sentence contract. If a test name or fixture still
asserts the deleted behavior, update it before continuing.

- [ ] **Step 3: Run focused tests once more**

Run:

```powershell
npx.cmd vitest run tests/unit/tag-classification.test.ts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrichment-attempts.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/generate-project-submission-cli.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 4: Run the full repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all unit tests, production build, and export verification PASS.

- [ ] **Step 5: Inspect the final diff and scope**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the planned enrichment, submission, test,
type declaration, and reference-doc files are changed.

- [ ] **Step 6: Commit the reference update and any verification-only cleanup**

```powershell
git add docs/reference/project-record-schema.md
git commit -m "docs(catalog): document generated summaries"
```

If focused verification required code or test cleanup, include only those
directly related files in this commit and explain the reason in the commit
body.

---

## Completion Evidence

Before reporting completion:

1. Record the focused Vitest file count and pass count.
2. Record the final `npm.cmd run check` exit code and major gate results.
3. Confirm `git diff --check` is clean.
4. Confirm provider-call assertions prove primary `1`, intake `5` maximum, and
   targeted retry `5` maximum.
5. Confirm URL tests cover absolute, protocol-relative, `www.`, and bare-domain
   forms.
6. Confirm no runtime or test assertion enforces word count or sentence count.
7. Report any existing unrelated worktree changes separately and leave them
   untouched.
