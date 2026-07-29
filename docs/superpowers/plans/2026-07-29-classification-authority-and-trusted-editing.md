# Classification Authority and Trusted Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project classification human-owned, remove Uncategorized,
reconcile the 37 affected records, and authorize reviewed Tavernary staff edits
for any project card or Kit without weakening provenance or validation.

**Architecture:** A shared kind/function contract becomes the single source of
truth for browser forms, manifests, canonical validation, catalog queries, and
owner edits. Project submission schema v3 carries the submitter's authoritative
Extension category; enrichment writes only summary, status, and capabilities,
while an optional intake-only classification review can emit a non-mutating
warning. A checked-in immutable-ID staff registry augments existing personal
repository-owner authority and is reused by project-owner and Kit workflows.

**Tech Stack:** TypeScript 6, React 19, Next.js 16 static export, Node.js 24
ES modules, Vitest, Playwright, JSON vocabularies and registries, GitHub Actions,
GitHub CLI.

## Global Constraints

- Frontends always use `primary_function: "frontend"`.
- System Presets always use `primary_function: "preset"`.
- Only Extensions expose a primary-function selector.
- Extension primary functions are limited to the six approved functional
  categories.
- The submitted Extension category is authoritative.
- Model classification review may warn but never mutate `primary_function`.
- Scheduled, retry, fallback, and forced enrichment never mutate
  `primary_function`.
- `uncategorized` must be absent from canonical data, public navigation, and
  accepted query state after migration.
- Project-owner requests remain reviewed PRs.
- Trusted staff authority requires a reviewed immutable GitHub user ID and a
  current trusted host-repository association.
- Trusted Kit edits preserve Kit ID, author, source issue, publication date,
  and reaction identity.
- Preserve the static-first architecture; add no account system, runtime API,
  database, or broad GitHub administration token.
- Preserve unrelated work and edit generated catalog output only through the
  catalog builder.

---

## File structure

### New shared units

- `src/features/catalog/primary-function-contract.mjs`
  - Exports structural and Extension category constants.
  - Validates one `kind` / `primary_function` pair.
- `src/features/catalog/primary-function-contract.d.mts`
  - Types the shared classification contract.
- `scripts/submissions/classification-review-notice.mjs`
  - Produces idempotent issue comment and label mutations from an intake
    classification review.
- `scripts/submissions/classification-review-notice.d.mts`
  - Types the notice planner.
- `scripts/maintenance/trusted-editor-authority.mjs`
  - Validates the checked-in trusted-editor registry and authorizes refreshed
    GitHub issue actors.
- `scripts/maintenance/trusted-editor-authority.d.mts`
  - Types trusted-editor records and authorization results.
- `data/maintenance/trusted-tavernary-editors.json`
  - Stores reviewed immutable GitHub IDs and roles.
- `data/schemas/trusted-tavernary-editors.schema.json`
  - Validates that authority file.

### Existing seams

- Submission browser and manifest:
  `src/features/submissions/components/project-submission-builder.tsx`,
  `src/features/submissions/project-submission-manifest.mjs`,
  `src/features/submissions/submission-transport.ts`.
- Submission automation:
  `scripts/submissions/parse-project-submission.mjs`,
  `scripts/submissions/draft-project-record.mjs`,
  `scripts/submissions/generate-project-submission.mjs`,
  `scripts/submissions/project-submission-pr.mjs`.
- Enrichment:
  `scripts/catalog/enrichment-contract.mjs`,
  `scripts/catalog/enrichment-provider.mjs`,
  `scripts/catalog/enrich-readmes.mjs`.
- Project owner:
  `src/features/help/components/project-owner-builder.tsx`,
  `src/features/help/project-owner-manifest.mjs`,
  `src/lib/help/load-owner-project-options.ts`,
  `scripts/help/project-owner-authority.mjs`,
  `scripts/help/triage-project-owner-request.mjs`,
  `scripts/help/apply-project-owner-request.mjs`.
- Kits:
  `scripts/submissions/validate-kit-submission.mjs`,
  `scripts/submissions/triage-kit-issue.mjs`,
  `scripts/kits/apply-submission.mjs`.
- Canonical validation and public query:
  `scripts/catalog/validate.mjs`,
  `scripts/catalog/build.mjs`,
  `src/features/catalog/catalog-query.ts`,
  `src/features/catalog/catalog-selectors.ts`.

---

### Task 1: Establish the shared classification contract

**Files:**

- Create:
  `src/features/catalog/primary-function-contract.mjs`
- Create:
  `src/features/catalog/primary-function-contract.d.mts`
- Create:
  `tests/unit/primary-function-contract.test.ts`
- Modify:
  `data/vocabularies/primary-functions.json`

**Interfaces:**

- Produces:
  `STRUCTURAL_PRIMARY_FUNCTIONS: Readonly<Record<"frontend" | "preset", string>>`
- Produces:
  `EXTENSION_PRIMARY_FUNCTION_IDS: readonly string[]`
- Produces:
  `classificationError(kind: string, primaryFunction: string): string | null`
- Produces vocabulary entries with `id`, `label`, and `description`.

- [ ] **Step 1: Write the failing matrix tests**

```ts
import {
  EXTENSION_PRIMARY_FUNCTION_IDS,
  classificationError,
} from "@/features/catalog/primary-function-contract.mjs";

test.each([
  ["frontend", "frontend"],
  ["preset", "preset"],
  ["extension", "memory-retrieval"],
  ["extension", "interface-workflow"],
])("accepts %s / %s", (kind, primaryFunction) => {
  expect(classificationError(kind, primaryFunction)).toBeNull();
});

test.each([
  ["frontend", "interface-workflow"],
  ["preset", "generation-reasoning"],
  ["extension", "frontend"],
  ["extension", "preset"],
  ["extension", "uncategorized"],
])("rejects %s / %s", (kind, primaryFunction) => {
  expect(classificationError(kind, primaryFunction)).not.toBeNull();
});

expect(EXTENSION_PRIMARY_FUNCTION_IDS).toEqual([
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
]);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/primary-function-contract.test.ts
```

Expected: FAIL because the shared contract module does not exist.

- [ ] **Step 3: Implement the minimal shared contract**

```js
export const STRUCTURAL_PRIMARY_FUNCTIONS = Object.freeze({
  frontend: "frontend",
  preset: "preset",
});

export const EXTENSION_PRIMARY_FUNCTION_IDS = Object.freeze([
  "memory-retrieval",
  "generation-reasoning",
  "character-worldbuilding",
  "rpg-systems",
  "interface-workflow",
  "developer-infrastructure",
]);

const extensionFunctions = new Set(EXTENSION_PRIMARY_FUNCTION_IDS);

export function classificationError(kind, primaryFunction) {
  if (kind === "frontend") {
    return primaryFunction === "frontend"
      ? null
      : "Frontends must use primary function frontend.";
  }
  if (kind === "preset") {
    return primaryFunction === "preset"
      ? null
      : "System Presets must use primary function preset.";
  }
  if (kind === "extension") {
    return extensionFunctions.has(primaryFunction)
      ? null
      : "Extensions must use one approved Extension primary function.";
  }
  return "Project kind is invalid.";
}
```

Add `preset` and the approved definitions to
`primary-functions.json`. Retain `uncategorized` temporarily in this task so
the pre-migration canonical catalog remains buildable; Task 7 removes it after
all records are corrected.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/primary-function-contract.test.ts
npx.cmd prettier --check src/features/catalog/primary-function-contract.mjs src/features/catalog/primary-function-contract.d.mts data/vocabularies/primary-functions.json tests/unit/primary-function-contract.test.ts
```

Expected: all focused tests and formatting checks pass.

- [ ] **Step 5: Commit the shared contract**

```powershell
git add -- src/features/catalog/primary-function-contract.mjs src/features/catalog/primary-function-contract.d.mts data/vocabularies/primary-functions.json tests/unit/primary-function-contract.test.ts
git commit -m "feat(catalog): define classification contract"
```

---

### Task 2: Carry authoritative classification through project submission

**Files:**

- Modify:
  `src/features/submissions/project-submission-manifest.mjs`
- Modify:
  `src/features/submissions/project-submission-manifest.d.mts`
- Modify:
  `src/features/submissions/components/project-submission-builder.tsx`
- Modify:
  `src/features/submissions/submission-transport.ts`
- Modify:
  `scripts/submissions/parse-project-submission.mjs`
- Modify:
  `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify:
  `tests/unit/project-submission-manifest.test.ts`
- Modify:
  `tests/unit/project-submission-builder.test.tsx`
- Modify:
  `tests/unit/project-submission-transport.test.ts`
- Modify:
  `tests/unit/parse-project-submission.test.ts`
- Modify:
  `tests/e2e/project-submission.spec.ts`

**Interfaces:**

- Consumes:
  `STRUCTURAL_PRIMARY_FUNCTIONS`,
  `EXTENSION_PRIMARY_FUNCTION_IDS`,
  `classificationError`.
- Produces:
  `ProjectSubmissionManifest` schema version 3 with required
  `primary_function: string`.
- Produces readable GitHub field `Primary function`.

- [ ] **Step 1: Write failing manifest and form tests**

Add focused expectations:

```ts
expect(
  normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: "extension",
    primary_function: "memory-retrieval",
    source_url: "https://github.com/example/memory",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
  }),
).toMatchObject({
  valid: true,
  manifest: { primary_function: "memory-retrieval" },
});

expect(
  normalizeProjectSubmissionManifest({
    schema_version: 3,
    project_type: "extension",
    primary_function: "frontend",
    source_url: "https://github.com/example/bad",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
  }),
).toMatchObject({ valid: false });
```

Browser tests must prove:

- Extension shows **Primary function** with six options.
- Frontend and System Preset do not show the control.
- Submitted manifests use `frontend`, `preset`, or the exact selected
  Extension value.
- Changing type replaces stale values.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts
```

Expected: FAIL because schema v3 and `primary_function` do not exist.

- [ ] **Step 3: Implement schema v3 and the conditional control**

Normalize the field before returning a manifest:

```js
const submittedPrimaryFunction =
  typeof value?.primary_function === "string"
    ? value.primary_function.trim()
    : "";
const primaryFunction =
  STRUCTURAL_PRIMARY_FUNCTIONS[projectType] ?? submittedPrimaryFunction;
const classification = classificationError(projectType, primaryFunction);
if (classification) errors.push(classification);
```

In the builder:

```tsx
{projectType === "extension" ? (
  <div className="submission-field">
    <label htmlFor="project-primary-function">Primary function</label>
    <select
      id="project-primary-function"
      value={primaryFunction}
      onChange={(event) => setPrimaryFunction(event.target.value)}
    >
      <option value="">Select a primary function</option>
      {extensionPrimaryFunctions.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
    <ul
      id="project-primary-function-help"
      className="submission-option-help"
    >
      {extensionPrimaryFunctions.map((option) => (
        <li key={option.id}>
          <strong>{option.label}:</strong> {option.description}
        </li>
      ))}
    </ul>
  </div>
) : null}
```

Set `aria-describedby="project-primary-function-help"` on the select so every
approved definition remains visible and associated with the control. Increment
browser-generated manifests to schema version 3 and prefill
`primary-function`.

Direct schema-v1/v2 submissions without a category return a correction error:

```text
Project submission must be updated with a primary function.
```

Do not infer a category for legacy input.

- [ ] **Step 4: Run unit and targeted browser tests**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts
npm.cmd run catalog:build
npm.cmd run test:e2e -- project-submission.spec.ts
```

Expected: all targeted tests pass, including conditional rendering and the
complete handoff manifest.

- [ ] **Step 5: Commit submission classification**

```powershell
git add -- src/features/submissions .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/parse-project-submission.mjs tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts tests/e2e/project-submission.spec.ts
git commit -m "feat(submissions): trust selected category"
```

---

### Task 3: Remove primary-function writes from enrichment

**Files:**

- Modify:
  `scripts/catalog/enrichment-contract.mjs`
- Modify:
  `scripts/catalog/enrichment-contract.d.mts`
- Modify:
  `scripts/catalog/enrichment-provider.mjs`
- Modify:
  `scripts/catalog/enrichment-provider.d.mts`
- Modify:
  `scripts/catalog/enrich-readmes.mjs`
- Modify:
  `scripts/catalog/enrich-readmes.d.mts`
- Modify:
  `tests/unit/enrichment-contract.test.ts`
- Modify:
  `tests/unit/enrichment-provider.test.ts`
- Modify:
  `tests/unit/enrich-readmes.test.ts`
- Modify:
  `tests/unit/enrich-readmes-cli.test.ts`
- Modify:
  `tests/unit/enrichment-write-safety.test.ts`

**Interfaces:**

- Produces:
  `EnrichmentOutput` with `summary`, `metadata_status`, `capabilities`, and
  nullable `classification_review`.
- Produces:
  `ClassificationReviewRequest | null` on enrichment input.
- Guarantees:
  `writeEnrichedRecord()` never assigns `primary_function`.

- [ ] **Step 1: Write failing write-safety and output-contract tests**

```ts
test("forced enrichment preserves primary function", async () => {
  const original = fixtureRecord({
    primary_function: "memory-retrieval",
    metadata_status: "curated",
  });
  await writeFixture(original);

  await writeEnrichedRecord(path, original, {
    summary: validSummary,
    metadata_status: "curated",
    capabilities: ["automation"],
    classification_review: {
      status: "possible-mismatch",
      suggested_primary_function: "interface-workflow",
      explanation: "The source emphasizes navigation.",
    },
  });

  expect((await readFixture()).primary_function).toBe("memory-retrieval");
});
```

Provider tests must reject a top-level `primary_function`, require
`classification_review: null` when no intake review was requested, and accept
the bounded review object only for a requested Extension review.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-write-safety.test.ts
```

Expected: FAIL because enrichment still requires and writes
`primary_function`.

- [ ] **Step 3: Change the provider and write contracts**

Use this output shape:

```ts
export type ClassificationReview =
  | null
  | {
      status: "confirmed" | "possible-mismatch";
      suggested_primary_function: string;
      explanation: string | null;
    };

export type EnrichmentOutput = {
  summary: string;
  metadata_status: "curated";
  capabilities: string[];
  classification_review: ClassificationReview;
};
```

The provider prompt says:

- when `classificationReviewRequest` is absent, return
  `classification_review: null`;
- when present, compare the submitted category to the supplied six definitions;
- never use isolated keyword matching;
- `confirmed` repeats the submitted ID and uses `explanation: null`;
- `possible-mismatch` supplies one different allowed Extension ID and a
  source-grounded explanation of at most 240 characters.

Change the enriched write exactly to:

```js
const updated = {
  ...current,
  summary: output.summary,
  metadata_status: output.metadata_status,
  capabilities: output.capabilities,
};
```

Fallback enrichment returns summary/status/capabilities with a null review.
Delete primary-function validation, repair hints, default output, and report
fields from scheduled enrichment.

- [ ] **Step 4: Verify every enrichment mode**

Run:

```powershell
npm.cmd test -- tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts tests/unit/enrichment-orchestrator.test.ts tests/unit/enrichment-run-state.test.ts
```

Expected: all pending, retry, fallback, manual-exclusion, and forced-mode tests
pass while preserving primary function.

- [ ] **Step 5: Commit enrichment authority**

```powershell
git add -- scripts/catalog/enrichment-contract.mjs scripts/catalog/enrichment-contract.d.mts scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrich-readmes-cli.test.ts tests/unit/enrichment-write-safety.test.ts
git commit -m "fix(enrichment): preserve classification"
```

---

### Task 4: Surface non-mutating intake classification warnings

**Files:**

- Create:
  `scripts/submissions/classification-review-notice.mjs`
- Create:
  `scripts/submissions/classification-review-notice.d.mts`
- Create:
  `tests/unit/classification-review-notice.test.ts`
- Modify:
  `scripts/submissions/draft-project-record.mjs`
- Modify:
  `scripts/submissions/draft-project-record.d.mts`
- Modify:
  `scripts/submissions/generate-project-submission.mjs`
- Modify:
  `scripts/submissions/generate-project-submission.d.mts`
- Modify:
  `scripts/submissions/project-submission-pr.mjs`
- Modify:
  `scripts/submissions/project-submission-pr.d.mts`
- Modify:
  `.github/workflows/generate-project-submission.yml`
- Modify:
  `tests/unit/draft-project-record.test.ts`
- Modify:
  `tests/unit/generate-project-submission.test.ts`
- Modify:
  `tests/unit/project-submission-pr.test.ts`
- Modify:
  `tests/unit/workflows.test.ts`

**Interfaces:**

- Consumes:
  schema-v3 `manifest.primary_function`.
- Consumes:
  `EnrichmentOutput.classification_review`.
- Produces:
  generated record whose primary function always equals the submitted value.
- Produces:
  `classificationReview` in the sanitized generation report.
- Produces:
  `planClassificationReviewNotice(input)` for idempotent issue mutations.

- [ ] **Step 1: Write failing authority and warning tests**

```ts
test("model mismatch never changes the submitted primary function", async () => {
  const draft = await draftProjectRecord(
    fixtureInput({
      manifest: { primary_function: "memory-retrieval" },
      enrichment: {
        status: "curated",
        summary: validSummary,
        capabilities: ["automation"],
        classification_review: {
          status: "possible-mismatch",
          suggested_primary_function: "interface-workflow",
          explanation: "The source emphasizes navigation.",
        },
      },
    }),
  );

  expect(draft.record.primary_function).toBe("memory-retrieval");
  expect(draft.report.classification_review.status).toBe("possible-mismatch");
});
```

Notice tests cover:

- mismatch adds/updates one marker comment and `classification-review`;
- confirmed removes a stale owned label/comment;
- unavailable review produces an ordinary warning but no mismatch label;
- all rendered values are bounded and sanitized.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/classification-review-notice.test.ts
```

Expected: FAIL because the draft still takes primary function from enrichment
and no notice planner exists.

- [ ] **Step 3: Make the manifest authoritative**

Build record classification only from admission:

```js
const primaryFunction = admitted.manifest.primary_function;

const record = {
  // existing identity and metadata
  kind: admitted.manifest.project_type,
  primary_function: primaryFunction,
};
```

When calling `enrichRecord` during generation, pass a classification review
request only for Extensions:

```js
classificationReviewRequest:
  parsed.manifest.project_type === "extension"
    ? {
        submittedPrimaryFunction: parsed.manifest.primary_function,
        allowedPrimaryFunctions: extensionPrimaryFunctionVocabulary,
      }
    : null;
```

Copy only the sanitized review result into the generated report. Render a
dedicated PR warning with submitted and suggested labels and add a checklist
item only on mismatch.

- [ ] **Step 4: Add idempotent issue synchronization**

Use a stable marker:

```js
export const classificationReviewMarker =
  "<!-- tavernary-classification-review -->";
```

The planner returns exact desired label and comment mutations. Update
`generate-project-submission.yml` after generation and before PR publication
to:

1. read the trusted generation report;
2. ensure the `classification-review` label exists;
3. refresh the current issue;
4. apply the planner's exact owned-label state; and
5. create, update, or remove only the marker comment.

Workflow output must not echo raw source or model payloads.

- [ ] **Step 5: Run focused workflow and generation tests**

Run:

```powershell
npm.cmd test -- tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts tests/unit/classification-review-notice.test.ts tests/unit/workflows.test.ts
```

Expected: all tests pass and the record always retains the submitted category.

- [ ] **Step 6: Commit intake review**

```powershell
git add -- scripts/submissions/classification-review-notice.mjs scripts/submissions/classification-review-notice.d.mts scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/generate-project-submission.mjs scripts/submissions/generate-project-submission.d.mts scripts/submissions/project-submission-pr.mjs scripts/submissions/project-submission-pr.d.mts .github/workflows/generate-project-submission.yml tests/unit/classification-review-notice.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/generate-project-submission-cli.test.ts tests/unit/project-submission-pr.test.ts tests/unit/workflows.test.ts
git commit -m "feat(submissions): flag category mismatches"
```

---

### Task 5: Add reviewed trusted-editor authority to project-owner requests

**Files:**

- Create:
  `data/maintenance/trusted-tavernary-editors.json`
- Create:
  `data/schemas/trusted-tavernary-editors.schema.json`
- Create:
  `scripts/maintenance/trusted-editor-authority.mjs`
- Create:
  `scripts/maintenance/trusted-editor-authority.d.mts`
- Create:
  `tests/unit/trusted-editor-authority.test.ts`
- Modify:
  `src/lib/help/load-owner-project-options.ts`
- Modify:
  `src/app/help/manage-project/page.tsx`
- Modify:
  `src/features/help/components/project-owner-builder.tsx`
- Modify:
  `src/features/help/project-owner-manifest.mjs`
- Modify:
  `src/features/help/project-owner-manifest.d.mts`
- Modify:
  `.github/ISSUE_TEMPLATE/08-project-owner-request.yml`
- Modify:
  `scripts/help/project-owner-authority.mjs`
- Modify:
  `scripts/help/project-owner-authority.d.mts`
- Modify:
  `scripts/help/triage-project-owner-request.mjs`
- Modify:
  `scripts/help/generate-project-owner-request.mjs`
- Modify:
  `scripts/help/project-owner-pr.mjs`
- Modify:
  `scripts/help/apply-project-owner-request.mjs`
- Modify:
  `scripts/help/apply-project-owner-request.d.mts`
- Modify:
  `scripts/catalog/validate.mjs`
- Modify:
  `.github/workflows/triage-project-owner-request.yml`
- Modify:
  `.github/workflows/generate-project-owner-request.yml`
- Modify:
  `tests/unit/load-owner-project-options.test.ts`
- Modify:
  `tests/unit/project-owner-builder.test.tsx`
- Modify:
  `tests/unit/project-owner-manifest.test.ts`
- Modify:
  `tests/unit/project-owner-authority.test.ts`
- Modify:
  `tests/unit/triage-project-owner-request.test.ts`
- Modify:
  `tests/unit/generate-project-owner-request.test.ts`
- Modify:
  `tests/unit/project-owner-pr.test.ts`
- Modify:
  `tests/unit/apply-project-owner-request.test.ts`
- Modify:
  `tests/unit/validate-catalog.test.ts`

**Interfaces:**

- Produces:
  `TrustedEditorRegistry` schema version 1.
- Produces:
  `verifyTrustedEditor({ actor, association, registry })`.
- Extends project-owner authority result with
  `authorityType: "repository-owner" | "tavernary-staff"` and
  `actorLogin`.
- Allows nullable repository identity only when the current record/source and
  selected operation do not require it.

- [ ] **Step 1: Write failing trusted-editor tests**

```ts
const registry = {
  schema_version: 1,
  editors: [
    {
      github_user_id: 2625904,
      login: "MentallyQuill",
      role: "owner",
    },
  ],
};

expect(
  verifyTrustedEditor({
    actor: { id: 2625904, login: "MentallyQuill" },
    association: "OWNER",
    registry,
  }),
).toMatchObject({ authorized: true, role: "owner" });

expect(
  verifyTrustedEditor({
    actor: { id: 99, login: "Other" },
    association: "COLLABORATOR",
    registry,
  }),
).toMatchObject({ authorized: false });
```

Add owner-triage tests proving an allowlisted staff actor can edit Codeberg,
external, organization-owned, missing-repository-ID, and disabled card shapes,
while an ordinary requester still fails the existing personal-owner checks.

- [ ] **Step 2: Run authority tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/trusted-editor-authority.test.ts tests/unit/project-owner-authority.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/project-owner-builder.test.tsx
```

Expected: FAIL because the registry and staff authority route do not exist.

- [ ] **Step 3: Implement the reviewed immutable-ID registry**

Use:

```json
{
  "schema_version": 1,
  "editors": [
    {
      "github_user_id": 2625904,
      "login": "MentallyQuill",
      "role": "owner"
    }
  ]
}
```

Validate unique positive IDs, unique case-insensitive logins, and roles limited
to `owner`, `admin`, or `maintainer`. Authorization requires both an exact ID
match and current `OWNER`, `MEMBER`, or `COLLABORATOR` association.

- [ ] **Step 4: Generalize owner manifests and selection**

Load options from canonical registry records rather than only public generated
catalog cards. Keep ordinary-owner eligibility metadata, but do not disable
selection or edit controls for staff-only shapes.

For `edit-card` and `delist`, allow `repository_id: null` in the manifest when
the canonical record lacks one. `move-source` continues requiring the existing
positive immutable GitHub repository ID.

Render Primary function as:

```tsx
{selected.kind === "extension" ? (
  <HelpSelectField
    id="owner-primary-function"
    label="Primary function"
    value={primaryFunction}
    onChange={(event) => setPrimaryFunction(event.target.value)}
    hint={
      <ul className="help-option-definitions">
        {extensionPrimaryFunctions.map((option) => (
          <li key={option.id}>
            <strong>{option.label}:</strong> {option.description}
          </li>
        ))}
      </ul>
    }
  >
    {extensionPrimaryFunctions.map((option) => (
      <option key={option.id} value={option.id}>
        {option.label}
      </option>
    ))}
  </HelpSelectField>
) : (
  <HelpTextField
    id="owner-primary-function"
    label="Primary function"
    value={STRUCTURAL_PRIMARY_FUNCTIONS[selected.kind]}
    readOnly
  />
)}
```

Triage checks staff authority first. If it fails, run the unchanged personal
repository-owner verification. Reports and PR markers store authority type and
authenticated actor.

- [ ] **Step 5: Preserve enrichment policy for classification-only edits**

Write failing tests before changing `applyProjectOwnerRequest`:

```ts
expect(
  applyProjectOwnerRequest(primaryFunctionOnlyEdit).record.enrichment_policy,
).toBe("automatic");

expect(
  applyProjectOwnerRequest(summaryEdit).record.enrichment_policy,
).toBe("manual");
```

Only changes to `summary` or `capabilities` set curated/manual enrichment
fields. Primary function, name, frontends, and Preset compatibility changes
preserve existing enrichment policy and metadata status.

- [ ] **Step 6: Run the complete owner workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/trusted-editor-authority.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-authority.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/validate-catalog.test.ts tests/unit/workflows.test.ts
npm.cmd run catalog:build
npm.cmd run test:e2e -- help-project-owner.spec.ts
```

Expected: owner and trusted-staff paths pass; staff-only cards remain rejected
for untrusted actors. Catalog validation accepts the checked-in registry and
rejects duplicate IDs, duplicate case-insensitive logins, non-positive IDs,
and roles outside `owner`, `admin`, or `maintainer`.

- [ ] **Step 7: Commit trusted project editing**

```powershell
git add -- data/maintenance/trusted-tavernary-editors.json data/schemas/trusted-tavernary-editors.schema.json scripts/maintenance src/lib/help/load-owner-project-options.ts src/app/help/manage-project/page.tsx src/features/help/components/project-owner-builder.tsx src/features/help/project-owner-manifest.mjs src/features/help/project-owner-manifest.d.mts .github/ISSUE_TEMPLATE/08-project-owner-request.yml scripts/help scripts/catalog/validate.mjs .github/workflows/triage-project-owner-request.yml .github/workflows/generate-project-owner-request.yml tests/unit/trusted-editor-authority.test.ts tests/unit/load-owner-project-options.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-authority.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/project-owner-pr.test.ts tests/unit/validate-catalog.test.ts tests/unit/workflows.test.ts tests/e2e/help-project-owner.spec.ts
git commit -m "feat(help): authorize trusted card edits"
```

---

### Task 6: Authorize trusted Kit edits without changing provenance

**Files:**

- Modify:
  `scripts/submissions/validate-kit-submission.mjs`
- Modify:
  `scripts/submissions/validate-kit-submission.d.mts`
- Modify:
  `scripts/submissions/triage-kit-issue.mjs`
- Modify:
  `scripts/kits/apply-submission.mjs`
- Modify:
  `scripts/kits/apply-submission.d.mts`
- Modify:
  `tests/unit/validate-kit-submission.test.ts`
- Modify:
  `tests/unit/triage-kit-issue.test.ts`
- Modify:
  `tests/unit/apply-kit-submission.test.ts`
- Modify:
  `tests/unit/kit-automatic-publication-workflow.test.ts`

**Interfaces:**

- Consumes:
  `verifyTrustedEditor()` and the trusted-editor registry from Task 5.
- Produces edit authority:
  `"author" | "tavernary-staff"`.
- Guarantees staff edits preserve immutable Kit provenance.

- [ ] **Step 1: Write failing staff-edit and provenance tests**

```ts
const validation = validateKitSubmission({
  manifest: JSON.stringify(staffEditManifest),
  actor: {
    id: 2625904,
    login: "MentallyQuill",
    association: "OWNER",
  },
  trustedEditors,
  projects,
  kits: [anotherAuthorsKit],
  blockedUsers,
});

expect(validation).toMatchObject({
  valid: true,
  editAuthority: "tavernary-staff",
});
```

Apply tests assert:

```ts
expect(updated).toMatchObject({
  id: existing.id,
  author: existing.author,
  source_issue_number: existing.source_issue_number,
  published_at: existing.published_at,
});
expect(updated.title).toBe("Staff-corrected title");
```

Also prove an unlisted `COLLABORATOR` and an allowlisted actor with `NONE`
association are rejected.

- [ ] **Step 2: Run focused Kit tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/validate-kit-submission.test.ts tests/unit/triage-kit-issue.test.ts tests/unit/apply-kit-submission.test.ts
```

Expected: FAIL because only the original Kit author is accepted.

- [ ] **Step 3: Thread refreshed authority through triage and apply**

Include `issue.user.id`, `issue.user.login`, and
`issue.author_association` in both validation calls. Load and validate the
checked-in trusted-editor registry in triage and final apply.

Return `editAuthority` only after all normal Kit validation succeeds. The final
apply path re-fetches the issue and recomputes the authority; it does not trust
an earlier output or manifest flag.

- [ ] **Step 4: Preserve provenance in the apply result**

```js
const author =
  editAuthority === "author"
    ? { ...existingKit.author, login: issue.user.login }
    : structuredClone(existingKit.author);

return {
  ...existingKit,
  title,
  description,
  author,
  project_ids: [...manifest.project_ids],
  updated_at: now,
};
```

Do not copy issue number, issue author, or submission-time identity into
canonical Kit provenance for a staff edit.

- [ ] **Step 5: Run Kit unit and workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/validate-kit-submission.test.ts tests/unit/triage-kit-issue.test.ts tests/unit/apply-kit-submission.test.ts tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: author edits, staff edits, rejection paths, and validated automatic
publication all pass.

- [ ] **Step 6: Commit trusted Kit editing**

```powershell
git add -- scripts/submissions/validate-kit-submission.mjs scripts/submissions/validate-kit-submission.d.mts scripts/submissions/triage-kit-issue.mjs scripts/kits/apply-submission.mjs scripts/kits/apply-submission.d.mts tests/unit/validate-kit-submission.test.ts tests/unit/triage-kit-issue.test.ts tests/unit/apply-kit-submission.test.ts tests/unit/kit-automatic-publication-workflow.test.ts
git commit -m "feat(kits): authorize trusted edits"
```

---

### Task 7: Reconcile canonical data and remove Uncategorized

**Files:**

- Modify:
  `data/registry/projects/*.json` for the exact 37 records listed in the design
- Modify:
  `data/vocabularies/primary-functions.json`
- Modify:
  `scripts/catalog/validate.mjs`
- Modify:
  `scripts/catalog/build.mjs`
- Modify:
  `src/features/catalog/catalog-query.ts`
- Modify:
  `src/features/catalog/catalog-selectors.ts`
- Modify:
  `src/components/icons/category-icon.tsx`
- Modify:
  `package.json`
- Delete:
  `scripts/catalog/intake-migration.mjs`
- Delete:
  `scripts/catalog/intake-migration.d.mts`
- Delete:
  `scripts/catalog/migrate-intake.mjs`
- Delete:
  `scripts/catalog/migrate-intake.d.mts`
- Modify:
  `tests/unit/validate-catalog.test.ts`
- Modify:
  `tests/unit/build-catalog.test.ts`
- Modify:
  `tests/unit/full-catalog-data.test.ts`
- Modify:
  `tests/unit/catalog-selectors.test.ts`
- Modify:
  `tests/unit/use-catalog-query.test.tsx`
- Modify:
  `tests/unit/kit-domain.test.ts`
- Delete:
  `tests/unit/intake-migration.test.ts`
- Modify:
  `tests/e2e/catalog.spec.ts`

**Interfaces:**

- Consumes:
  `classificationError()` from Task 1.
- Produces:
  canonical registry with no Uncategorized values.
- Produces:
  category navigation containing structural Frontends/Presets plus six
  Extension categories.

- [ ] **Step 1: Write failing whole-catalog invariants**

```ts
test("every project obeys the kind/function contract", async () => {
  const records = await loadRegistryProjects();
  expect(
    records.flatMap((record) => {
      const error = classificationError(record.kind, record.primary_function);
      return error ? [`${record.id}: ${error}`] : [];
    }),
  ).toEqual([]);
});

test("canonical taxonomy has no Uncategorized state", async () => {
  expect(primaryFunctions.map(({ id }) => id)).not.toContain("uncategorized");
  expect(records.some((record) => record.primary_function === "uncategorized"))
    .toBe(false);
});
```

Add query tests proving `?category=uncategorized` parses to no selected category
and cannot serialize back.

- [ ] **Step 2: Run content tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts tests/unit/validate-catalog.test.ts tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx
```

Expected: FAIL with the 37 affected records and existing Uncategorized query
option.

- [ ] **Step 3: Apply the exact 37-record migration**

Set all 14 Presets to `preset`, the two structurally incorrect Frontends to
`frontend`, and the 21 Extension values to the exact mappings in:

```text
docs/superpowers/specs/2026-07-29-classification-authority-and-trusted-editing-design.md
```

Do not rewrite summaries, capabilities, policies, timestamps, visibility,
source identity, or snapshots during this migration.

- [ ] **Step 4: Remove Uncategorized and enforce canonical validation**

Delete the vocabulary entry and category-navigation option. Replace scattered
kind/function checks with `classificationError()` at registry validation and
catalog build boundaries.

Retire the completed seed-only `catalog:migrate` command and its
`intake-migration` / `migrate-intake` modules and tests. That historical path
has no submitter classification input and therefore cannot meet the new
authority contract without inventing an Extension category. Remove
`catalog:migrate` from `package.json`; current submission schema v3 is the only
supported intake path.

Remove `uncategorized` from the `CategoryIcon` name union and replace the
catalog end-to-end test for that button with an assertion that the category
strip contains exactly All Projects, Frontends, System Presets, and the six
Extension categories.

Keep query compatibility safe:

```ts
parseCatalogQuery(new URLSearchParams("category=uncategorized")).category ===
  "";
```

Frontends and Presets filter by `kind`; six Extension categories filter by
`primaryFunction`.

Update provisional-record tests so `metadata_status: "provisional"` requires
an authoritative structural or submitted classification rather than
`uncategorized`.

- [ ] **Step 5: Verify canonical content and query behavior**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd run test:content
npm.cmd test -- tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/kit-domain.test.ts
npm.cmd run test:e2e -- catalog.spec.ts
```

Expected: 302 projects build, all content tests pass, and no generated category
or purpose label is Uncategorized.

- [ ] **Step 6: Commit the migration**

```powershell
git add -- data/registry/projects data/vocabularies/primary-functions.json scripts/catalog/validate.mjs scripts/catalog/build.mjs src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/components/icons/category-icon.tsx package.json tests/unit/validate-catalog.test.ts tests/unit/build-catalog.test.ts tests/unit/full-catalog-data.test.ts tests/unit/catalog-selectors.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/kit-domain.test.ts tests/e2e/catalog.spec.ts
git add -u -- scripts/catalog/intake-migration.mjs scripts/catalog/intake-migration.d.mts scripts/catalog/migrate-intake.mjs scripts/catalog/migrate-intake.d.mts tests/unit/intake-migration.test.ts
git commit -m "fix(catalog): reconcile project categories"
```

Commit body:

```text
Replace model-owned and uncategorized classifications with structural
Frontend/Preset values and source-reviewed Extension categories.

Remove Uncategorized after reconciling all 37 affected records.
```

---

### Task 8: Align documentation, complete end-to-end proof, and run the full gate

**Files:**

- Modify:
  `docs/architecture/catalog-lifecycle.md`
- Modify:
  `docs/architecture/production-development-handoff.md`
- Modify:
  `docs/reference/project-record-schema.md`
- Modify:
  `docs/reference/catalog-enrichment-report.md`
- Modify:
  `docs/contributing/submission-and-review.md`
- Modify:
  `docs/maintenance/github-actions-user-guides.md`
- Modify:
  `tests/unit/project-submission-docs.test.ts`
- Modify:
  `tests/unit/help-docs.test.ts`
- Modify:
  `tests/unit/kit-maintenance-docs.test.ts`
- Modify:
  relevant E2E assertions in
  `tests/e2e/project-submission.spec.ts`,
  `tests/e2e/help-project-owner.spec.ts`, and
  `tests/kits-e2e/kits.spec.ts`

**Interfaces:**

- Documents the final runtime truth only.
- Produces complete local verification evidence before completion.

- [ ] **Step 1: Write failing documentation-contract tests**

Require documentation to state:

- submitter classification is authoritative;
- Frontend/Preset values are structural;
- model mismatch warnings do not mutate;
- enrichment cannot change primary function;
- staff authority uses the reviewed editor registry;
- staff Kit edits preserve provenance; and
- Uncategorized no longer exists.

- [ ] **Step 2: Run documentation tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-docs.test.ts tests/unit/help-docs.test.ts tests/unit/kit-maintenance-docs.test.ts
```

Expected: FAIL until the operational and contributor documentation is updated.

- [ ] **Step 3: Update documentation to match runtime truth**

Remove the prior four-field enrichment ownership statement everywhere it is
present. Describe the new three-field enrichment write boundary and the
intake-only classification warning.

Document trusted-editor registry maintenance as a reviewed change using
immutable IDs. Do not claim that issue association alone establishes staff
authority.

Document the current validated automatic Kit publication behavior rather than
inventing a separate manual approval step.

- [ ] **Step 4: Run focused end-to-end tests**

Run:

```powershell
npm.cmd run catalog:build
npm.cmd run test:e2e -- project-submission.spec.ts help-project-owner.spec.ts
npm.cmd run build:test-kits
npm.cmd run test:kits-e2e
```

Expected:

- Extension submission carries its selected category;
- Frontend/Preset submission is structural;
- owner editor exposes Extension categories only;
- the Kit builder continues to emit the same edit manifest, while staff
  authorization and canonical-author preservation remain proven by the focused
  unit and workflow tests from Task 6.

- [ ] **Step 5: Run the full repository gate**

Run:

```powershell
npm.cmd run check
git diff --check
git status --short
```

Expected:

- formatting, lint, palette audit, catalog validation, catalog build,
  typecheck, all unit tests, production build, and static export verification
  pass;
- `git diff --check` prints nothing;
- status contains only intentional implementation and documentation changes.

- [ ] **Step 6: Review the final diff against the approved spec**

Confirm:

- all 37 records match the spec;
- no enrichment write includes `primary_function`;
- no form offers an invalid kind/function pair;
- no untrusted actor bypasses project or Kit ownership;
- no staff Kit edit changes provenance;
- no Uncategorized UI, query, vocabulary, or canonical value remains; and
- issue/PR warning text contains no raw provider or source payload.

- [ ] **Step 7: Commit documentation and final proof**

```powershell
git add -- docs tests/unit/project-submission-docs.test.ts tests/unit/help-docs.test.ts tests/unit/kit-maintenance-docs.test.ts tests/e2e/project-submission.spec.ts tests/e2e/help-project-owner.spec.ts tests/kits-e2e/kits.spec.ts
git commit -m "docs: explain classification authority"
```

- [ ] **Step 8: Invoke completion verification and branch finishing**

Use `superpowers:verification-before-completion` with the fresh outputs from
Step 5. After verification passes, use
`superpowers:finishing-a-development-branch` to present integration options.
