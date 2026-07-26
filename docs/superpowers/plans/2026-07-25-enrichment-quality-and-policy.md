# Enrichment Quality and Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce warmer, fuller catalog summaries at temperature `0.95`, automate GitHub-hosted presets, and make per-project manual enrichment locks impossible for normal, forced, retried, or stale runs to overwrite.

**Architecture:** Extend canonical project schema version 4 with explicit enrichment policy fields, then centralize policy defaults and guards in a small catalog module shared by intake and enrichment. Persist the requested selection scope and manual exclusions in durable rollout reports so the existing single GitHub Action can safely process pending records or perform the one-time all-automatic re-enrichment without losing its scope across canary, deployment, full-run, or resume boundaries.

**Tech Stack:** Node.js 24 ESM, JSON Schema draft-07 with Ajv, Vitest, Prettier, Playwright, GitHub Actions YAML, existing static catalog pipeline.

## Global Constraints

- Send provider temperature exactly `0.95`.
- Ready-source summaries contain exactly two sentences, 24-36 words, no Markdown, and at most 220 characters.
- Preserve the deterministic `No README file found.` fallback outside the ready-source sentence and word-count checks.
- `enrichment_policy` is required and is exactly `automatic` or `manual`.
- A manual record requires a non-empty `enrichment_note`; an automatic record omits it.
- GitHub repositories default to `automatic`, including System Presets.
- URL and GitHub-organization sources default to `manual`.
- `refresh_policy` remains independent from `enrichment_policy`.
- Manual policy wins over normal selection, all-automatic selection, force, retry, canary, targeted runs, stale manifests, and concurrent policy edits.
- Administrative enrichment policy must not be emitted into `src/generated/catalog.json` or rendered in the browser.
- Do not add dependencies or a browser administration UI.
- Keep the existing four-line standard summary and one-line compact summary treatments.

---

## File Map

- `data/schemas/project.schema.json`: canonical version-4 record shape, summary ceiling, and source-policy invariants.
- `data/registry/projects/*.json`: canonical policy values for all 211 current records.
- `scripts/catalog/enrichment-policy.mjs`: shared defaults, manual-exclusion projection, and fail-closed write guard.
- `scripts/catalog/enrichment-policy.d.mts`: TypeScript declarations for the shared policy module.
- `scripts/catalog/intake-migration.mjs`: source-derived policy defaults for reproducible intake migration.
- `scripts/catalog/enrichment-contract.mjs`: ready-source summary validation.
- `scripts/catalog/enrichment-provider.mjs`: prompt, strict response schema, and temperature request.
- `scripts/catalog/enrich-readmes.mjs`: eligibility, targeted skip results, force propagation, and atomic write protection.
- `scripts/catalog/enrich-readmes.d.mts`: selection mode, policy, and result declarations.
- `scripts/catalog/enrichment-run-state.mjs`: durable selection scope and manual-exclusion state.
- `scripts/catalog/enrichment-run-state.d.mts`: report-state types.
- `scripts/catalog/enrichment-report.mjs`: backward-compatible report validation and sanitized manual-exclusion output.
- `scripts/catalog/enrichment-rollout-plan.mjs`: scope-aware eligible counts and terminal-report replacement.
- `scripts/catalog/enrichment-rollout-plan.d.mts`: planner input/output declarations.
- `scripts/catalog/select-enrichment-canary.mjs`: scope-aware automatic-only canary selection.
- `scripts/catalog/select-enrichment-canary.d.mts`: canary selection declarations.
- `scripts/catalog/enrichment-orchestrator.mjs`: one frozen selection scope propagated through every subprocess.
- `scripts/catalog/enrichment-orchestrator.d.mts`: production-operation options.
- `.github/workflows/enrich-catalog.yml`: easy `pending` versus `all-automatic` workflow input and manual-exclusion summary.
- `docs/maintenance/operations-runbook.md`: maintainer editing and rollout instructions.
- `docs/architecture/catalog-data-model.md`: canonical policy ownership.
- `docs/architecture/catalog-lifecycle.md`: source-based default behavior.
- `docs/reference/catalog-statuses-and-manifests.md`: durable report fields and meanings.
- Focused tests under `tests/unit/` and `tests/e2e/catalog.spec.ts`: red-green coverage for every boundary above.

---

### Task 1: Version the canonical project schema and migrate current records

**Files:**
- Modify: `data/schemas/project.schema.json`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `data/registry/projects/*.json`
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `tests/unit/build-catalog.test.ts`

**Interfaces:**
- Consumes: existing canonical project records with `schema_version: 3`.
- Produces: schema-version-4 records with `enrichment_policy`, optional `enrichment_note`, and a 220-character summary ceiling.

- [ ] **Step 1: Write failing schema and production-data tests**

Update the `validRecord` fixture in `tests/unit/validate-catalog.test.ts` to use:

```ts
const validRecord = {
  schema_version: 4,
  id: "valid-preset",
  name: "Valid Preset",
  kind: "preset",
  summary: "A valid test fixture.",
  metadata_status: "curated",
  source: {
    type: "github",
    repository: "example/valid-preset",
    repository_id: 1,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: ["prompt-engineering"],
  cataloged_at: "2026-07-23T00:00:00Z",
  catalog_cohort: "seed",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};
```

Add explicit schema tests:

```ts
test("requires an explicit enrichment policy", async () => {
  const { enrichment_policy: _removed, ...record } = validRecord;
  const result = await validateCatalog({ records: [record] });
  expect(result.errors.join("\n")).toContain(
    "valid-preset: schema must have required property 'enrichment_policy'",
  );
});

test("requires a note only for manual enrichment", async () => {
  const missingNote = await validateCatalog({
    records: [{ ...validRecord, enrichment_policy: "manual" }],
  });
  expect(missingNote.errors.join("\n")).toContain("enrichment_note");

  const automaticWithNote = await validateCatalog({
    records: [
      {
        ...validRecord,
        enrichment_policy: "automatic",
        enrichment_note: "This note must not be retained.",
      },
    ],
  });
  expect(automaticWithNote.errors.join("\n")).toContain("enrichment_note");
});

test("requires non-GitHub sources to remain manual", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        source: {
          type: "url",
          url: "https://example.com/preset",
          published_at: null,
          version: null,
          artifact_size_bytes: null,
          license_status: "missing",
          license_spdx_id: null,
        },
        refresh_policy: "paused",
        enrichment_policy: "automatic",
      },
    ],
  });
  expect(result.errors.join("\n")).toContain("enrichment_policy");
});

test("allows a documented manual GitHub exception", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        enrichment_policy: "manual",
        enrichment_note: "Bundled repository requires manual curation.",
      },
    ],
  });
  expect(result.errors).toEqual([]);
});
```

Extend `expectCatalogContract` in `tests/unit/full-catalog-data.test.ts`:

```ts
expect(countBy(records, (record) => record.enrichment_policy)).toEqual({
  automatic: 204,
  manual: 7,
});

for (const record of records) {
  if (record.enrichment_policy === "automatic") {
    expect(record.enrichment_note, record.id).toBeUndefined();
  } else {
    expect(record.enrichment_note?.trim().length, record.id).toBeGreaterThan(0);
  }
}

for (const id of [
  "daddytorgo-hash-frankengarage",
  "mentallyquill-st-wandlight",
  "zorgonatis-stabs-edh",
]) {
  expect(records.find((record) => record.id === id)?.enrichment_policy).toBe(
    "automatic",
  );
}

expect(
  records.find((record) => record.id === "tavern-rpg-suite"),
).toMatchObject({
  enrichment_policy: "manual",
  enrichment_note: "Multi-repository suite; requires manual curation.",
});
```

Change the presentation ceiling assertion from 140 to 220. Add a
`tests/unit/build-catalog.test.ts` assertion that the generated project does not
have `enrichmentPolicy` or `enrichmentNote` properties.

- [ ] **Step 2: Run the schema tests to verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts
```

Expected: FAIL because schema version 4 and enrichment policy fields are not
defined, and current records do not contain the policy.

- [ ] **Step 3: Implement schema version 4 and its conditional rules**

In `data/schemas/project.schema.json`:

```json
"required": [
  "schema_version",
  "id",
  "name",
  "kind",
  "summary",
  "metadata_status",
  "source",
  "frontends",
  "primary_function",
  "capabilities",
  "cataloged_at",
  "catalog_cohort",
  "visibility",
  "visibility_reason",
  "refresh_policy",
  "enrichment_policy"
]
```

Use these properties:

```json
"schema_version": { "const": 4 },
"summary": { "type": "string", "minLength": 1, "maxLength": 220 },
"enrichment_policy": { "enum": ["automatic", "manual"] },
"enrichment_note": {
  "type": "string",
  "minLength": 1,
  "maxLength": 240
}
```

Append these conditions to the existing `allOf` array:

```json
{
  "if": {
    "properties": {
      "enrichment_policy": { "const": "manual" }
    },
    "required": ["enrichment_policy"]
  },
  "then": { "required": ["enrichment_note"] }
},
{
  "if": {
    "properties": {
      "enrichment_policy": { "const": "automatic" }
    },
    "required": ["enrichment_policy"]
  },
  "then": {
    "not": { "required": ["enrichment_note"] }
  }
},
{
  "if": {
    "properties": {
      "source": {
        "properties": {
          "type": { "enum": ["url", "github-organization"] }
        },
        "required": ["type"]
      }
    },
    "required": ["source"]
  },
  "then": {
    "properties": {
      "enrichment_policy": { "const": "manual" }
    }
  }
}
```

Update the Tavern RPG Suite invariant in `scripts/catalog/validate.mjs` so its
required tuple also includes `record.enrichment_policy === "manual"` and the
exact approved note.

- [ ] **Step 4: Mechanically migrate all canonical records**

Run this one-time Node rewrite from the repository root:

```powershell
@'
const fs = require("node:fs");
const path = require("node:path");
const directory = "data/registry/projects";
for (const name of fs.readdirSync(directory).filter((value) => value.endsWith(".json"))) {
  const file = path.join(directory, name);
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  record.schema_version = 4;
  delete record.enrichment_note;
  if (record.source.type === "github") {
    record.enrichment_policy = "automatic";
  } else if (record.source.type === "github-organization") {
    record.enrichment_policy = "manual";
    record.enrichment_note = "Multi-repository suite; requires manual curation.";
  } else {
    record.enrichment_policy = "manual";
    record.enrichment_note = "External URL source; requires manual curation.";
  }
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}
'@ | node
npx.cmd prettier --write data/registry/projects data/schemas/project.schema.json
```

- [ ] **Step 5: Run focused validation and data tests**

Run:

```powershell
npx.cmd vitest run tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts
npm.cmd run catalog:validate
```

Expected: PASS with 211 records, 204 automatic GitHub records, 7 manual
records, and no policy fields in generated browser projects.

- [ ] **Step 6: Commit the canonical policy migration**

```powershell
git add data/schemas/project.schema.json scripts/catalog/validate.mjs data/registry/projects tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts
git commit -m "feat(catalog): add enrichment policies"
```

---

### Task 2: Centralize source defaults and future intake behavior

**Files:**
- Create: `scripts/catalog/enrichment-policy.mjs`
- Create: `scripts/catalog/enrichment-policy.d.mts`
- Create: `tests/unit/enrichment-policy.test.ts`
- Modify: `scripts/catalog/intake-migration.mjs`
- Modify: `tests/unit/intake-migration.test.ts`

**Interfaces:**
- Consumes: a project `source` object and canonical records.
- Produces:
  - `MANUAL_ENRICHMENT_REASON_CODE = "manual-enrichment-policy"`
  - `defaultEnrichmentFields(source)`
  - `isAutomaticEnrichment(record)`
  - `manualEnrichmentExclusions(records)`
  - `ManualEnrichmentPolicyError`
  - `assertAutomaticEnrichment(record)`

- [ ] **Step 1: Write failing shared-policy tests**

Create `tests/unit/enrichment-policy.test.ts`:

```ts
import { expect, test } from "vitest";

import {
  MANUAL_ENRICHMENT_REASON_CODE,
  ManualEnrichmentPolicyError,
  assertAutomaticEnrichment,
  defaultEnrichmentFields,
  manualEnrichmentExclusions,
} from "../../scripts/catalog/enrichment-policy.mjs";

test("derives source-based defaults without inspecting project kind", () => {
  expect(defaultEnrichmentFields({ type: "github" })).toEqual({
    enrichment_policy: "automatic",
  });
  expect(defaultEnrichmentFields({ type: "url" })).toEqual({
    enrichment_policy: "manual",
    enrichment_note: "External URL source; requires manual curation.",
  });
  expect(defaultEnrichmentFields({ type: "github-organization" })).toEqual({
    enrichment_policy: "manual",
    enrichment_note: "Multi-repository suite; requires manual curation.",
  });
});

test("projects stable sorted manual exclusions", () => {
  expect(
    manualEnrichmentExclusions([
      {
        id: "zeta",
        enrichment_policy: "manual",
        enrichment_note: "Zeta requires review.",
      },
      { id: "automatic", enrichment_policy: "automatic" },
      {
        id: "alpha",
        enrichment_policy: "manual",
        enrichment_note: "Alpha requires review.",
      },
    ]),
  ).toEqual([
    {
      id: "alpha",
      reason_code: MANUAL_ENRICHMENT_REASON_CODE,
      enrichment_note: "Alpha requires review.",
    },
    {
      id: "zeta",
      reason_code: MANUAL_ENRICHMENT_REASON_CODE,
      enrichment_note: "Zeta requires review.",
    },
  ]);
});

test("fails closed for manual or missing policy", () => {
  for (const record of [
    {
      id: "manual",
      enrichment_policy: "manual",
      enrichment_note: "Requires review.",
    },
    { id: "missing" },
  ]) {
    expect(() => assertAutomaticEnrichment(record)).toThrow(
      ManualEnrichmentPolicyError,
    );
  }
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-policy.test.ts
```

Expected: FAIL because `scripts/catalog/enrichment-policy.mjs` does not exist.

- [ ] **Step 3: Implement the shared policy module**

Create `scripts/catalog/enrichment-policy.mjs`:

```js
export const MANUAL_ENRICHMENT_REASON_CODE = "manual-enrichment-policy";

const URL_NOTE = "External URL source; requires manual curation.";
const ORGANIZATION_NOTE =
  "Multi-repository suite; requires manual curation.";

export function defaultEnrichmentFields(source) {
  if (source?.type === "github") {
    return { enrichment_policy: "automatic" };
  }
  return {
    enrichment_policy: "manual",
    enrichment_note:
      source?.type === "github-organization" ? ORGANIZATION_NOTE : URL_NOTE,
  };
}

export function isAutomaticEnrichment(record) {
  return record?.enrichment_policy === "automatic";
}

export function manualEnrichmentExclusions(records) {
  return records
    .filter((record) => record?.enrichment_policy === "manual")
    .map((record) => ({
      id: record.id,
      reason_code: MANUAL_ENRICHMENT_REASON_CODE,
      enrichment_note: record.enrichment_note,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export class ManualEnrichmentPolicyError extends Error {
  constructor(record) {
    super("Registry record requires manual enrichment.");
    this.name = "ManualEnrichmentPolicyError";
    this.code = MANUAL_ENRICHMENT_REASON_CODE;
    this.enrichmentNote = record?.enrichment_note;
  }
}

export function assertAutomaticEnrichment(record) {
  if (!isAutomaticEnrichment(record)) {
    throw new ManualEnrichmentPolicyError(record);
  }
}
```

Declare the exact shapes in `scripts/catalog/enrichment-policy.d.mts`, including
the error's `code` and `enrichmentNote` properties.

- [ ] **Step 4: Apply the same defaults during intake migration**

In `scripts/catalog/intake-migration.mjs`, import
`defaultEnrichmentFields`. Change `toRecord` to spread the defaults after
`refresh_policy`:

```js
refresh_policy:
  record.source_url || record.source_type === "organization"
    ? "paused"
    : "automatic",
...defaultEnrichmentFields(source),
```

Update all exact record expectations in `tests/unit/intake-migration.test.ts`
to `schema_version: 4` and add:

```ts
enrichment_policy: "automatic",
```

for GitHub sources, or:

```ts
enrichment_policy: "manual",
enrichment_note: "External URL source; requires manual curation.",
```

for URL sources. Add an organization assertion using the organization note.

- [ ] **Step 5: Run policy and migration tests**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-policy.test.ts tests/unit/intake-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit source-derived defaults**

```powershell
git add scripts/catalog/enrichment-policy.mjs scripts/catalog/enrichment-policy.d.mts scripts/catalog/intake-migration.mjs tests/unit/enrichment-policy.test.ts tests/unit/intake-migration.test.ts
git commit -m "feat(catalog): centralize enrichment policy"
```

---

### Task 3: Raise summary quality and send temperature 0.95

**Files:**
- Modify: `scripts/catalog/enrichment-contract.mjs`
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `tests/unit/enrichment-contract.test.ts`
- Modify: `tests/unit/enrichment-provider.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`
- Modify: `tests/unit/enrichment-write-safety.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Consumes: provider output with `summary`, `metadata_status`, `primary_function`, and `capabilities`.
- Produces: validated two-sentence ready-source summaries and an OpenAI-compatible request body containing `temperature: 0.95`.

- [ ] **Step 1: Replace the contract fixture and write failing boundary tests**

Use this shared valid text in the affected fixtures:

```ts
const validSummary =
  "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.";
```

It is exactly two sentences, 24 words, and below 220 characters.

In `tests/unit/enrichment-contract.test.ts`, replace the one-sentence test with:

```ts
test("accepts a natural two-sentence curated enrichment", () => {
  expect(
    validateEnrichmentOutput(
      { ...valid, summary: validSummary },
      vocabularies,
    ),
  ).toEqual({ valid: true });
});
```

Use table cases that assert rejection for:

```ts
[
  ["one sentence", "This summary remains one sentence despite containing enough ordinary words to satisfy the previous catalog enrichment contract for generated project descriptions."],
  ["three sentences", "Fixture organizes prompt workflows for SillyTavern projects. It automates routine setup for creators. It also keeps complex configuration work clear and accessible throughout."],
  ["too few words", "Fixture organizes prompt workflows. It keeps setup clear."],
  ["too many words", `${"useful ".repeat(37)}. Another sentence follows.`],
  ["over 220 characters", `${"A".repeat(190)}. ${"B".repeat(35)}.`],
]
```

Retain coverage for newlines, Markdown, unknown vocabulary IDs, and the exact
fallback.

In `tests/unit/enrichment-provider.test.ts`, add:

```ts
expect(body.temperature).toBe(0.95);
expect(body.messages[0].content).toMatch(/exactly two complete sentences/iu);
expect(body.messages[0].content).toMatch(/24-36 words/iu);
expect(body.messages[0].content).toMatch(/220 characters/iu);
expect(body.response_format.json_schema.schema.properties.summary).toMatchObject({
  type: "string",
  maxLength: 220,
});
```

- [ ] **Step 2: Run contract and provider tests to verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts
```

Expected: FAIL on the old 12-24 word, 140-character, one-sentence contract and
the absent temperature.

- [ ] **Step 3: Implement the new summary validator**

In `scripts/catalog/enrichment-contract.mjs`, change the ready-source checks to:

```js
if (summary.length > 220)
  errors.push("summary must be 220 characters or fewer");
if (wordCount(summary) < 24 || wordCount(summary) > 36) {
  errors.push("summary must contain between 24 and 36 words");
}

const endings = summary.match(/[.!?](?=\s|$)/gu) ?? [];
if (endings.length !== 2 || !/[.!?]$/u.test(summary.trim())) {
  errors.push("summary must be exactly two sentences");
}
```

Keep the fallback return before these checks.

Update `validateOutput` repair hints in `scripts/catalog/enrich-readmes.mjs`:

```js
if (error === "summary must be 220 characters or fewer") {
  return "Summary must be at most 220 characters.";
}
if (error === "summary must contain between 24 and 36 words") {
  return "Summary must contain 24-36 words.";
}
if (error === "summary must be exactly two sentences") {
  return "Summary must be exactly two complete sentences.";
}
```

- [ ] **Step 4: Update the provider prompt, response schema, and request**

Replace the summary portion of `systemPrompt` in
`scripts/catalog/enrichment-provider.mjs` with these requirements:

```text
Write exactly two complete sentences totaling 24-36 words and at most 220 characters. Use natural, informative prose with no markdown, popularity language, promotional hype, or unsupported claims. The first sentence identifies the project and its primary purpose. The second describes a distinctive source-supported workflow, capability, or user benefit.
```

Change the response schema summary property to:

```js
summary: { type: "string", maxLength: 220 },
```

Add the explicit request member immediately after `model`:

```js
model: configuration.model,
temperature: 0.95,
```

- [ ] **Step 5: Update affected enrichment fixtures to the valid summary**

Replace ready-source output summaries in:

- `tests/unit/enrich-readmes.test.ts`
- `tests/unit/enrich-readmes-cli.test.ts`
- `tests/unit/enrichment-write-safety.test.ts`
- `tests/unit/full-catalog-data.test.ts`

with `validSummary` or the identical literal. Do not replace the deterministic
fallback fixture.

- [ ] **Step 6: Run focused enrichment tests**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/full-catalog-data.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the summary contract**

```powershell
git add scripts/catalog/enrichment-contract.mjs scripts/catalog/enrichment-provider.mjs scripts/catalog/enrich-readmes.mjs tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/full-catalog-data.test.ts
git commit -m "feat(catalog): improve enrichment summaries"
```

---

### Task 4: Enforce manual policy at selection, execution, and write boundaries

**Files:**
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-run-state.mjs`
- Modify: `scripts/catalog/enrichment-run-state.d.mts`
- Modify: `scripts/catalog/enrichment-report.mjs`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`
- Modify: `tests/unit/enrichment-write-safety.test.ts`
- Modify: `tests/unit/enrichment-report.test.ts`

**Interfaces:**
- Consumes: shared policy functions from Task 2.
- Produces:
  - `selectEnrichmentRecords(records, { force })` that always requires `automatic`.
  - `runEnrichmentBatch({ force })`.
  - skipped result code `manual-enrichment-policy`.
  - atomic writes that re-read and enforce the current on-disk policy.

- [ ] **Step 1: Write failing selection and execution tests**

In `tests/unit/enrich-readmes.test.ts`, add `enrichment_policy: "automatic"` to
the base record and add:

```ts
test("includes an automatic GitHub preset and excludes manual GitHub records even when forced", () => {
  const automaticPreset = {
    ...record,
    id: "preset",
    kind: "preset",
    enrichment_policy: "automatic",
  };
  const manual = {
    ...record,
    id: "manual",
    metadata_status: "curated",
    enrichment_policy: "manual",
    enrichment_note: "Bundled repository requires manual curation.",
  };

  expect(
    selectEnrichmentRecords([manual, automaticPreset], { force: true }).map(
      ({ id }) => id,
    ),
  ).toEqual(["preset"]);
});

test("does not call the provider for a manual record", async () => {
  const generate = vi.fn();
  await expect(
    enrichRecord(
      {
        ...record,
        enrichment_policy: "manual",
        enrichment_note: "Requires manual curation.",
      },
      snapshot,
      { generate },
      { force: true, vocabularies },
    ),
  ).resolves.toBeNull();
  expect(generate).not.toHaveBeenCalled();
});

test("reports an explicitly targeted manual record as skipped", async () => {
  const result = await runEnrichmentBatch({
    projectIds: ["manual"],
    recordsById: {
      manual: {
        ...record,
        id: "manual",
        enrichment_policy: "manual",
        enrichment_note: "Requires manual curation.",
      },
    },
    snapshotsById: {},
    phase: "primary",
    vocabularies,
    provider: { generate: vi.fn() },
    validateSnapshot: () => true,
  });

  expect(result).toEqual([
    {
      id: "manual",
      phase: "primary",
      outcome: "skipped",
      reasonCode: "manual-enrichment-policy",
      enrichmentNote: "Requires manual curation.",
      message: "Registry record requires manual enrichment.",
    },
  ]);
});
```

- [ ] **Step 2: Write a failing stale-write test**

In `tests/unit/enrichment-write-safety.test.ts`, add automatic policy to the
base record and add:

```ts
test("re-reads and refuses a record changed to manual after selection", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-enrichment-"));
  const path = join(root, "fixture.json");
  const manual = {
    ...record,
    enrichment_policy: "manual",
    enrichment_note: "Maintainer locked this record.",
  };
  const original = JSON.stringify(manual, null, 2);
  await writeFile(path, original);

  await expect(writeEnrichedRecord(path, record, output)).rejects.toMatchObject({
    code: "manual-enrichment-policy",
    enrichmentNote: "Maintainer locked this record.",
  });
  expect(await readFile(path, "utf8")).toBe(original);
});
```

- [ ] **Step 3: Run the guard tests to verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
```

Expected: FAIL because manual policy is not checked and the write boundary still
updates the file.

- [ ] **Step 4: Implement fail-closed eligibility and targeted skip results**

Import the Task 2 policy functions into `scripts/catalog/enrich-readmes.mjs`.
Change `isEligible` to:

```js
function isEligible(record, force = false) {
  if (
    !isAutomaticEnrichment(record) ||
    record.visibility !== "published" ||
    record.source?.type !== "github"
  ) {
    return false;
  }
  if (force || record.metadata_status === "provisional") return true;
  return genericSummaries.has(record.summary);
}
```

Use one module-level `genericSummaries` set rather than duplicating it.

At the start of `enrichRecord`, return `null` unless
`isAutomaticEnrichment(record)` is true. At the start of `processProject`,
return the exact skipped result from Step 1 when the record is manual, before
the generic ineligible branch.

Add `force = false` to `runEnrichmentBatch`, pass it to `processProject`, and
use `isEligible(record, force)` so all-automatic runs can process curated
automatic records without weakening manual locks.

- [ ] **Step 5: Enforce the current on-disk policy during atomic writes**

In `writeEnrichedRecord`, place the policy assertion immediately after reading
the file and before building `updated`:

```js
const current = JSON.parse(await readFile(path, "utf8"));
assertAutomaticEnrichment(current);
const updated = {
  ...current,
  summary: output.summary,
  metadata_status: output.metadata_status,
  primary_function: output.primary_function,
  capabilities: output.capabilities,
};
```

In `processProject`, preserve manual policy errors as skipped:

```js
try {
  await writeRecord(record, output, vocabularies);
} catch (error) {
  if (error?.code === MANUAL_ENRICHMENT_REASON_CODE) {
    return {
      id,
      phase,
      outcome: "skipped",
      reasonCode: MANUAL_ENRICHMENT_REASON_CODE,
      enrichmentNote: error.enrichmentNote,
      message: error.message,
      ...sourceProvenance(source),
    };
  }
  return {
    id,
    phase,
    outcome: "failed",
    reasonCode: "write-failed",
    message: "Validated enrichment could not be written.",
    ...sourceProvenance(source),
    ...(providerMetadata ? { provider: providerMetadata } : {}),
  };
}
```

Extend `ProjectAttemptResult` with `enrichmentNote?: string` and map it to
`enrichment_note` in `entryForResult`. Allow `enrichment_note` through
`sanitizedEntry` and add the safe report message:

```js
"manual-enrichment-policy": "Registry record requires manual enrichment.",
```

- [ ] **Step 6: Run all boundary and report tests**

Run:

```powershell
npx.cmd vitest run tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/enrichment-report.test.ts
```

Expected: PASS, including targeted manual skips and stale on-disk policy
changes.

- [ ] **Step 7: Commit the policy guards**

```powershell
git add scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-run-state.mjs scripts/catalog/enrichment-run-state.d.mts scripts/catalog/enrichment-report.mjs tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/enrichment-report.test.ts
git commit -m "fix(catalog): protect manual enrichment"
```

---

### Task 5: Persist pending versus all-automatic rollout scope

**Files:**
- Modify: `scripts/catalog/enrichment-run-state.mjs`
- Modify: `scripts/catalog/enrichment-run-state.d.mts`
- Modify: `scripts/catalog/enrichment-report.mjs`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-rollout-plan.mjs`
- Modify: `scripts/catalog/enrichment-rollout-plan.d.mts`
- Modify: `scripts/catalog/select-enrichment-canary.mjs`
- Modify: `scripts/catalog/select-enrichment-canary.d.mts`
- Modify: `scripts/catalog/enrichment-orchestrator.mjs`
- Modify: `scripts/catalog/enrichment-orchestrator.d.mts`
- Modify: `tests/unit/enrichment-run-state.test.ts`
- Modify: `tests/unit/enrichment-report.test.ts`
- Modify: `tests/unit/enrichment-rollout-plan.test.ts`
- Modify: `tests/unit/select-enrichment-canary.test.ts`
- Modify: `tests/unit/enrichment-orchestrator.test.ts`
- Modify: `tests/unit/enrich-readmes-cli.test.ts`

**Interfaces:**
- Produces selection type `"pending" | "all-automatic"`.
- Adds durable report fields:
  - `selection_mode`
  - `manual_exclusions`
- Adds CLI option `--selection-mode`.
- Maps `all-automatic` to `force: true` only after automatic-policy filtering.

- [ ] **Step 1: Write failing run-state and backward-compatibility tests**

Add to `tests/unit/enrichment-run-state.test.ts`:

```ts
test("freezes selection mode and manual exclusions in new state", () => {
  const state = createEnrichmentRunState({
    mode: "full",
    manifest: ["automatic"],
    runId: "run",
    now,
    model,
    selectionMode: "all-automatic",
    manualExclusions: [
      {
        id: "manual",
        reason_code: "manual-enrichment-policy",
        enrichment_note: "Requires review.",
      },
    ],
  });

  expect(state.selection_mode).toBe("all-automatic");
  expect(state.manual_exclusions).toEqual([
    {
      id: "manual",
      reason_code: "manual-enrichment-policy",
      enrichment_note: "Requires review.",
    },
  ]);
});
```

Add to `tests/unit/enrichment-report.test.ts`:

```ts
test("hydrates old reports as pending with no manual exclusions", () => {
  const legacy = structuredClone(reportFixture);
  delete legacy.selection_mode;
  delete legacy.manual_exclusions;
  expect(validateEnrichmentReport(legacy)).toMatchObject({
    selection_mode: "pending",
    manual_exclusions: [],
  });
});
```

Add rejection tests for unsupported selection modes, duplicate manual IDs,
missing notes, and a manual ID appearing in the manifest.

- [ ] **Step 2: Run run-state and report tests to verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts
```

Expected: FAIL because neither field exists.

- [ ] **Step 3: Persist and validate the new report fields**

Add:

```js
const selectionModes = new Set(["pending", "all-automatic"]);
```

to `scripts/catalog/enrichment-run-state.mjs`. Validate
`input.selectionMode ?? "pending"` and normalize manual exclusions into a
sorted, frozen array with unique IDs, the exact reason code, and non-empty
notes. Reject overlap with the manifest.

Return:

```js
selection_mode: selectionMode,
manual_exclusions: manualExclusions,
```

from `createEnrichmentRunState`, and preserve both fields in every cloning
transition.

In `validateEnrichmentReport`, hydrate older reports before validation:

```js
value.selection_mode ??= "pending";
value.manual_exclusions ??= [];
```

Include the fields in `createEnrichmentReport`. Update `.d.mts` declarations
with:

```ts
export type EnrichmentSelectionMode = "pending" | "all-automatic";

export type ManualEnrichmentExclusion = {
  id: string;
  reason_code: "manual-enrichment-policy";
  enrichment_note: string;
};
```

- [ ] **Step 4: Write failing scope-aware CLI, planner, and canary tests**

Add tests asserting:

- `selectRepresentativeCanaryIds(records, snapshots, { selectionMode: "pending" })`
  excludes curated automatic records.
- `all-automatic` includes curated automatic GitHub presets but still excludes
  manual GitHub records.
- `createEnrichmentRolloutPlan` reports `eligible_count: 204` and
  `manual_exclusion_count: 7` for an all-automatic catalog fixture.
- a running report with a different selection mode is rejected.
- terminal reports from another selection mode are ignored so a fresh canary
  begins.
- `runCli({ mode: "resume" })` uses the report's frozen selection mode.
- `cliOptions(["--selection-mode", "all-automatic"])` returns the exact mode.

Use automatic policy in every eligible fixture and manual policy plus note in
every exclusion fixture.

- [ ] **Step 5: Implement scope-aware selection and durable CLI behavior**

In `scripts/catalog/enrich-readmes.mjs`:

```js
function forceForSelectionMode(selectionMode) {
  if (!["pending", "all-automatic"].includes(selectionMode)) {
    throw new Error(`unsupported enrichment selection mode: ${selectionMode}`);
  }
  return selectionMode === "all-automatic";
}
```

Parse:

```js
selectionMode: value("--selection-mode", "pending"),
```

For a new canary or full state, pass:

```js
selectionMode: options.selectionMode ?? "pending",
manualExclusions: manualEnrichmentExclusions(records),
```

Build eligible IDs with:

```js
const force = forceForSelectionMode(selectionMode);
const eligibleIds = selectEnrichmentRecords(records, { force }).map(
  ({ id }) => id,
);
```

When processing a batch, derive `force` from `state.selection_mode`, not from
the current process environment. Reject a supplied mode that differs from a
running report.

In `scripts/catalog/select-enrichment-canary.mjs`, accept
`options.selectionMode`, pass `force: selectionMode === "all-automatic"` to
`selectEnrichmentRecords`, and read the CLI value from
`process.env.ENRICHMENT_SELECTION_MODE ?? "pending"`.

- [ ] **Step 6: Make planning and authorization selection-mode aware**

In `scripts/catalog/enrichment-rollout-plan.mjs`, calculate:

```js
const force = input.selectionMode === "all-automatic";
const eligibleCount = selectEnrichmentRecords(input.records, { force }).length;
const manualExclusionCount = manualEnrichmentExclusions(input.records).length;
```

Return both counts. Treat a running report with another selection mode as an
error. Treat terminal canary and full reports from another selection mode as
stale authorization and start a fresh canary.

In `runPlannerCli`, resolve the requested scope exactly once:

```js
const selectionMode =
  options.selectionMode ??
  process.env.ENRICHMENT_SELECTION_MODE ??
  "pending";
```

Pass it into `createEnrichmentRolloutPlan` and declare it in
`scripts/catalog/enrichment-rollout-plan.d.mts`.

Extend `assertFullRolloutAllowed` to receive the expected selection mode and
require the passed canary to match it. Update all callers and declaration
files.

- [ ] **Step 7: Freeze one selection mode in the orchestrator**

In `createProductionOperations`, validate:

```js
const selectionMode =
  options.selectionMode ?? process.env.ENRICHMENT_SELECTION_MODE ?? "pending";
if (!["pending", "all-automatic"].includes(selectionMode)) {
  throw new Error(`Unsupported enrichment selection mode: ${selectionMode}`);
}
const selectionArguments = ["--selection-mode", selectionMode];
```

Append `...selectionArguments` to planner environment or CLI calls for canary,
authorization, start, and resume. Pass the environment to
`catalog:select-canary` so it draws from the same scope.

Update `scripts/catalog/enrichment-orchestrator.d.mts`:

```ts
selectionMode?: "pending" | "all-automatic";
```

Assert the exact argument propagation in
`tests/unit/enrichment-orchestrator.test.ts`.

- [ ] **Step 8: Run the durable rollout test group**

Run:

```powershell
npx.cmd vitest run tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/select-enrichment-canary.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/enrich-readmes-cli.test.ts
```

Expected: PASS with selection scope preserved across new runs and resumes.

- [ ] **Step 9: Commit durable selection scope**

```powershell
git add scripts/catalog/enrichment-run-state.mjs scripts/catalog/enrichment-run-state.d.mts scripts/catalog/enrichment-report.mjs scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-rollout-plan.mjs scripts/catalog/enrichment-rollout-plan.d.mts scripts/catalog/select-enrichment-canary.mjs scripts/catalog/select-enrichment-canary.d.mts scripts/catalog/enrichment-orchestrator.mjs scripts/catalog/enrichment-orchestrator.d.mts tests/unit/enrichment-run-state.test.ts tests/unit/enrichment-report.test.ts tests/unit/enrichment-rollout-plan.test.ts tests/unit/select-enrichment-canary.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/enrich-readmes-cli.test.ts
git commit -m "feat(catalog): persist enrichment scope"
```

---

### Task 6: Expose the easy workflow control and document maintenance

**Files:**
- Modify: `.github/workflows/enrich-catalog.yml`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/architecture/catalog-data-model.md`
- Modify: `docs/architecture/catalog-lifecycle.md`
- Modify: `docs/reference/catalog-statuses-and-manifests.md`

**Interfaces:**
- Consumes: durable selection modes and `manual_exclusions` from Task 5.
- Produces: one GitHub Action input named `enrichment_scope` with choices
  `pending` and `all-automatic`, plus sanitized action summaries.

- [ ] **Step 1: Write failing workflow-contract tests**

In `tests/unit/workflows.test.ts`, assert:

```ts
expect(inputs.enrichment_scope).toEqual({
  description: "Choose pending records or re-enrich every automatic record.",
  type: "choice",
  options: ["pending", "all-automatic"],
  default: "pending",
});
expect(source).toContain(
  "ENRICHMENT_SELECTION_MODE: ${{ inputs.enrichment_scope || 'pending' }}",
);
expect(source).toContain("Manual exclusions:");
expect(source).toContain("manual_exclusions");
```

Retain the single durable orchestrator assertion in
`tests/unit/refresh-github-workflow-safety.test.ts`.

- [ ] **Step 2: Run workflow tests to verify they fail**

Run:

```powershell
npx.cmd vitest run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because the input and environment variable do not exist.

- [ ] **Step 3: Add the workflow choice and sanitized summary**

Under `workflow_dispatch.inputs` in `.github/workflows/enrich-catalog.yml`:

```yaml
enrichment_scope:
  description: Choose pending records or re-enrich every automatic record.
  type: choice
  options:
    - pending
    - all-automatic
  default: pending
```

Add:

```yaml
ENRICHMENT_SELECTION_MODE: ${{ inputs.enrichment_scope || 'pending' }}
```

to the rollout environment.

Extend both full and canary summary commands with:

```js
'\n- Selection scope: '+(r.selection_mode||'pending')
+'\n- Manual exclusions: '+(r.manual_exclusions||[]).length
```

Render a sanitized manual-exclusion table from `manual_exclusions` with columns
`Project`, `Reason`, and `Note`, using the existing `cell` escaping function.

- [ ] **Step 4: Document the project toggle and source defaults**

Add this maintainer example to `docs/maintenance/operations-runbook.md`:

```json
"enrichment_policy": "manual",
"enrichment_note": "Multi-repository suite; requires manual curation."
```

Document that returning to automatic requires:

```json
"enrichment_policy": "automatic"
```

with `enrichment_note` removed. State that `all-automatic` does not override
manual policy and is intended for provider-contract migrations such as this
one-time summary rewrite.

Document the canonical ownership, defaults, report fields, and distinction from
`refresh_policy` in the three architecture/reference files listed above.

- [ ] **Step 5: Run workflow and formatting checks**

Run:

```powershell
npx.cmd vitest run tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts
npx.cmd prettier --check .github/workflows/enrich-catalog.yml docs/maintenance/operations-runbook.md docs/architecture/catalog-data-model.md docs/architecture/catalog-lifecycle.md docs/reference/catalog-statuses-and-manifests.md
```

Expected: PASS.

- [ ] **Step 6: Commit the maintainer workflow**

```powershell
git add .github/workflows/enrich-catalog.yml tests/unit/workflows.test.ts tests/unit/refresh-github-workflow-safety.test.ts docs/maintenance/operations-runbook.md docs/architecture/catalog-data-model.md docs/architecture/catalog-lifecycle.md docs/reference/catalog-statuses-and-manifests.md
git commit -m "feat(ci): expose enrichment scope"
```

---

### Task 7: Verify card presentation and the complete local contract

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify when fixture compilation requires the new canonical shape:
  - `tests/unit/incremental-refresh.test.ts`
  - `tests/unit/project-visibility-reason.test.ts`
  - `tests/unit/refresh-github-contributors.test.ts`
  - `tests/unit/refresh-github-description.test.ts`

**Interfaces:**
- Consumes: version-4 records and the 220-character summary contract.
- Produces: local proof that expanded summaries fit standard cards, remain
  one-line in compact cards, and preserve their full tooltip text.

- [ ] **Step 1: Strengthen the presentation test with near-limit prose**

In `tests/e2e/catalog.spec.ts`, use:

```ts
const expectedSummary =
  "Fixture coordinates persistent memories for SillyTavern conversations. It reviews recent context, selects useful details, and supplies focused guidance that keeps characters and unfolding scenes consistent over time.";
```

This fixture is 216 characters and 27 words. Keep desktop `1440` and mobile
`390` viewport checks for:

```ts
await expect(summary).toHaveCSS("-webkit-line-clamp", "4");
await expect(summary).toHaveCSS("overflow", "hidden");
expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
```

After switching to compact cards, inject the same text, assert `nowrap`,
`ellipsis`, and `hidden`. Keep the existing compact-card tooltip assertion
against the card's real summary so the test verifies that the one-line display
still exposes its complete underlying text.

- [ ] **Step 2: Run the focused browser test**

Run:

```powershell
npm.cmd run test:e2e -- catalog.spec.ts
```

Expected: PASS at standard desktop, standard mobile, and compact presentation.

- [ ] **Step 3: Run the full unit suite and repair only fixture-shape failures**

Run:

```powershell
npm.cmd test
```

Before running it, update canonical record fixtures in
`tests/unit/incremental-refresh.test.ts`,
`tests/unit/project-visibility-reason.test.ts`,
`tests/unit/refresh-github-contributors.test.ts`, and
`tests/unit/refresh-github-description.test.ts` to:

```ts
schema_version: 4,
enrichment_policy: "automatic",
```

Then run the command. Expected: PASS. Do not add enrichment policy to generated
browser models or unrelated Kit-only fixtures.

- [ ] **Step 4: Run the repository verification gate**

Run:

```powershell
npm.cmd run check
```

Expected: PASS for format, lint, palette audit, catalog validation, catalog
build, typecheck, unit tests, production build, and static-export verification.

- [ ] **Step 5: Review the final implementation diff**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~6..HEAD
git diff HEAD~6..HEAD -- data/registry/projects/tavern-rpg-suite.json data/schemas/project.schema.json scripts/catalog/enrichment-policy.mjs scripts/catalog/enrichment-provider.mjs scripts/catalog/enrich-readmes.mjs .github/workflows/enrich-catalog.yml
```

Expected: only the planned schema, records, enrichment pipeline, workflow,
tests, and documentation changed. Tavern RPG Suite is manual with its approved
note.

- [ ] **Step 6: Commit presentation or fixture-only adjustments**

If Step 1 or Step 3 changed files:

```powershell
git add tests/e2e/catalog.spec.ts tests/unit/incremental-refresh.test.ts tests/unit/project-visibility-reason.test.ts tests/unit/refresh-github-contributors.test.ts tests/unit/refresh-github-description.test.ts
git commit -m "test(catalog): verify expanded summaries"
```

If only a subset changed, stage only that subset.

---

### Task 8: Publish and perform the one-time all-automatic rollout

**Files:**
- Generated by the action: `data/reports/enrichment-canary.json`
- Generated by the action: `data/reports/enrichment-report.json`
- Generated by the action: automatic records under `data/registry/projects/*.json`
- Must remain unchanged: all manual records under `data/registry/projects/*.json`

**Interfaces:**
- Consumes: the merged implementation and configured provider/GitHub secrets.
- Produces: two-sentence summaries for all 204 automatic GitHub-backed records,
  including the three GitHub-hosted presets, with 7 manual exclusions reported
  and untouched.

- [ ] **Step 1: Record the pre-rollout commit and push main**

Run:

```powershell
$preRolloutCommit = git rev-parse HEAD
$preRolloutCommit | Set-Content -LiteralPath C:\tmp\tavernary-pre-rollout-commit.txt
git push origin main
```

Expected: push succeeds and `$preRolloutCommit` identifies the implementation
boundary.

- [ ] **Step 2: Dispatch the single action in all-automatic mode**

Run:

```powershell
gh workflow run enrich-catalog.yml --ref main -f enrichment_scope=all-automatic -f batch_size=20 -f model_concurrency=4
Start-Sleep -Seconds 5
$runId = gh run list --workflow enrich-catalog.yml --branch main --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

Expected: the durable action completes successfully after its canary,
deployment proof, full rollout, publication, and final deployment proof.

- [ ] **Step 3: If the action fails, capture the exact failing evidence**

Run:

```powershell
gh run view $runId --json databaseId,status,conclusion,headSha,url,jobs
gh run view $runId --log-failed
```

Expected on failure: the failing job and sanitized error are visible. Diagnose
from that evidence, add a regression test for the observed defect, patch,
re-run the focused local test and `npm.cmd run check`, push, and dispatch the
same `all-automatic` scope again. Do not switch records to automatic or bypass
manual guards to make the run pass.

- [ ] **Step 4: Synchronize the action-authored commits**

Run:

```powershell
git pull --rebase origin main
```

Expected: local main contains the action's canary, full enrichment, report, and
deployment-record commits.

- [ ] **Step 5: Verify report scope and catalog accounting**

Run:

```powershell
@'
const fs = require("node:fs");
const path = require("node:path");
const directory = "data/registry/projects";
const records = fs.readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
const automatic = records.filter((record) => record.enrichment_policy === "automatic");
const manual = records.filter((record) => record.enrichment_policy === "manual");
const canary = JSON.parse(fs.readFileSync("data/reports/enrichment-canary.json", "utf8"));
const full = JSON.parse(fs.readFileSync("data/reports/enrichment-report.json", "utf8"));
const attempted = new Set([...canary.manifest, ...full.manifest]);
const successfulOutcomes = new Set([
  "enriched",
  "fallback",
  "retry-enriched",
  "retry-fallback",
]);
const entries = [...Object.values(canary.entries), ...Object.values(full.entries)];
const unsuccessful = entries
  .filter((entry) => !successfulOutcomes.has(entry.outcome))
  .map((entry) => ({ id: entry.id, outcome: entry.outcome, reason: entry.reason_code }));
const summary = {
  automatic: automatic.length,
  manual: manual.length,
  attempted: attempted.size,
  successful: entries.length - unsuccessful.length,
  unsuccessful,
  canary_scope: canary.selection_mode,
  full_scope: full.selection_mode,
  canary_manual_exclusions: canary.manual_exclusions.length,
  full_manual_exclusions: full.manual_exclusions.length,
  tavern_rpg_suite: records.find((record) => record.id === "tavern-rpg-suite"),
};
console.log(JSON.stringify(summary, null, 2));
if (automatic.length !== 204) process.exitCode = 1;
if (manual.length !== 7) process.exitCode = 1;
if (attempted.size !== 204) process.exitCode = 1;
if (entries.length !== 204) process.exitCode = 1;
if (unsuccessful.length !== 0) process.exitCode = 1;
if (canary.selection_mode !== "all-automatic") process.exitCode = 1;
if (full.selection_mode !== "all-automatic") process.exitCode = 1;
if (canary.manual_exclusions.length !== 7) process.exitCode = 1;
if (full.manual_exclusions.length !== 7) process.exitCode = 1;
'@ | node
```

Expected: 204 automatic records, 7 manual records, 204 successful unique
attempted IDs, `all-automatic` in both reports, and 7 exclusions in both
reports.

- [ ] **Step 6: Verify every automatic result and every manual lock**

Run:

```powershell
$preRolloutCommit = Get-Content -LiteralPath C:\tmp\tavernary-pre-rollout-commit.txt
$manualPaths = Get-ChildItem -LiteralPath data/registry/projects -Filter *.json |
  Where-Object {
    (Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json).enrichment_policy -eq "manual"
  } |
  ForEach-Object {
    "data/registry/projects/$($_.Name)"
  }
git diff --exit-code "$preRolloutCommit..HEAD" -- $manualPaths

@'
const fs = require("node:fs");
const path = require("node:path");
const directory = "data/registry/projects";
const records = fs.readdirSync(directory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
const failures = [];
for (const record of records.filter((entry) => entry.enrichment_policy === "automatic")) {
  if (record.summary === "No README file found.") continue;
  const words = record.summary.trim().split(/\s+/u).filter(Boolean).length;
  const sentences = record.summary.match(/[.!?](?=\s|$)/gu) ?? [];
  if (
    record.metadata_status !== "curated" ||
    record.summary.length > 220 ||
    words < 24 ||
    words > 36 ||
    sentences.length !== 2 ||
    /[\r\n\u2028\u2029]/u.test(record.summary)
  ) {
    failures.push(record.id);
  }
}
const suite = records.find((record) => record.id === "tavern-rpg-suite");
if (
  suite.enrichment_policy !== "manual" ||
  suite.enrichment_note !== "Multi-repository suite; requires manual curation."
) {
  failures.push("tavern-rpg-suite-policy");
}
console.log(JSON.stringify({ failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
'@ | node
npm.cmd run catalog:validate
```

Expected: no manual-file diff, no summary-contract failures, and valid catalog
data.

- [ ] **Step 7: Verify production deployment and return to pending defaults**

Run:

```powershell
gh run list --workflow deploy-pages.yml --branch main --limit 5 --json databaseId,displayTitle,status,conclusion,headSha,url
```

Expected: the deployment recorded in `data/reports/enrichment-report.json`
completed successfully for the report's published checkpoint. Future manual
dispatches require no special cleanup because `enrichment_scope` defaults back
to `pending`.
