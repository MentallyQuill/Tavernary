# Catalog Tag System Schema v6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sparse capabilities with a corpus-derived Goals-and-Traits
taxonomy, independent summary/tag metadata policy, scalable filtering and
editing, and a complete evidence-backed catalog migration on the source-backed
project schema.

**Architecture:** Treat the Multi Projects source registry as the canonical
foundation and layer card-owned tags and metadata policy onto it. Keep
vocabulary, evidence collection, policy resolution, model contracts, UI
selection, and migration as small modules with explicit interfaces. Fetch raw
evidence once per source, classify each card independently, then perform one
deterministic canonical-data cutover.

**Tech Stack:** Node.js 24, TypeScript, React 19, Next.js 16, JSON Schema
draft-07, Vitest, Testing Library, Playwright, GitHub CLI, Prettier, ESLint.

## Global Constraints

- Use the isolated branch `codex/catalog-schema-v6` at
  `F:\git\Tavernary\.worktrees\catalog-schema-v6`.
- Do not merge to `main`.
- Integrate `codex/source-card-registry`; do not independently reimplement
  source extraction, source lifecycle, snapshot rekeying, or Multi Projects
  publication operations.
- The final canonical project contract is version 6 with `source_id`, `tags`,
  and independent `metadata_policy.summary` / `metadata_policy.tags`.
- Remove `capabilities`, `enrichment_policy`, and `enrichment_note`.
- Allow zero to six unique tags per card. Frontends, kind, model family, and
  completion format are not tags and do not count toward six.
- Goals use OR, traits use OR, and the two facets combine with AND.
- Root README is primary automatic evidence; repository description is
  secondary.
- Only verified personal repository owners and trusted Tavernary editors may
  establish manual summary or tag policy.
- Discard unauthorized manual summary and tag values completely.
- Semantic uncertainty is non-blocking; structural invalidity is blocking.
- Store raw evidence under ignored `local-data/catalog-evidence/` and refresh it
  only through explicit incremental commands.
- Never leave mixed version-5/version-6 canonical project records.
- Preserve project IDs, Kit references, source identity, ordering, and effective
  visibility through migration.
- Follow red-green-refactor for every production-code change.

---

## File and Responsibility Map

### New focused modules

- `data/schemas/tag-vocabulary.schema.json` — tracked vocabulary document
  contract.
- `data/vocabularies/tags.json` — final curated Goals-and-Traits vocabulary.
- `scripts/catalog/tag-vocabulary.mjs` — load, validate, index, hash, and strip
  classifier-only guidance.
- `scripts/catalog/tag-vocabulary.d.mts` — vocabulary interfaces.
- `scripts/catalog/catalog-evidence.mjs` — source-keyed incremental raw evidence
  collection.
- `scripts/catalog/catalog-evidence.d.mts` — evidence adapter and result types.
- `scripts/catalog/tag-classification.mjs` — bounded model-output validation and
  card-specific tag selection.
- `scripts/catalog/tag-classification.d.mts` — classifier request/result types.
- `scripts/catalog/metadata-policy.mjs` — independent automatic/manual policy
  predicates and trusted-note construction.
- `scripts/catalog/metadata-policy.d.mts` — policy types.
- `scripts/catalog/discover-tag-taxonomy.mjs` — local corpus candidate report.
- `scripts/catalog/backfill-project-tags.mjs` — deterministic classification
  application and migration report.
- `src/features/catalog/components/tag-browser.tsx` — bounded, searchable,
  faceted reusable selection UI.
- `src/features/catalog/tag-vocabulary.ts` — public vocabulary types and search
  helpers.
- `data/reports/tag-migration-report.json` — tracked final distribution and
  evidence summary.

### Existing seams to update after source-branch integration

- `data/schemas/project.schema.json`
- `scripts/catalog/validate.mjs`
- `scripts/catalog/build.mjs`
- `scripts/catalog/enrichment-contract.mjs`
- `scripts/catalog/enrich-readmes.mjs`
- `scripts/catalog/enrichment-provider.mjs`
- `scripts/catalog/enrichment-report.mjs`
- `src/features/catalog/catalog-types.ts`
- `src/features/catalog/catalog-query.ts`
- `src/features/catalog/catalog-selectors.ts`
- `src/features/catalog/components/filter-panel.tsx`
- `src/features/catalog/components/filter-controls.tsx`
- `src/features/catalog/components/active-query.tsx`
- `src/features/catalog/components/project-card.tsx`
- `src/features/catalog/components/catalog-page.tsx`
- `src/features/submissions/project-submission-manifest.mjs`
- `src/features/submissions/components/project-submission-builder.tsx`
- `scripts/submissions/submission-summary-authority.mjs`
- `scripts/submissions/draft-project-record.mjs`
- `src/lib/help/load-owner-project-options.ts`
- `src/features/help/project-owner-manifest.mjs`
- `src/features/help/components/project-owner-builder.tsx`
- `src/features/help/components/owner-card-fields.tsx`
- `src/features/help/components/source-card-batch-editor.tsx`
- `scripts/help/apply-project-owner-request.mjs`
- `scripts/help/triage-project-owner-request.mjs`
- `scripts/help/generate-project-owner-request.mjs`
- `.github/workflows/triage-submission.yml`
- `.github/workflows/generate-project-submission.yml`
- `.github/workflows/generate-project-owner-request.yml`
- `.github/workflows/publish-project-transaction.yml`
- `.gitignore`
- `package.json`
- `docs/reference/project-record-schema.md`
- `docs/reference/controlled-vocabularies.md`

---

### Task 1: Closed Tag Vocabulary Domain

**Files:**

- Create: `data/schemas/tag-vocabulary.schema.json`
- Create: `data/vocabularies/tags.json`
- Create: `scripts/catalog/tag-vocabulary.mjs`
- Create: `scripts/catalog/tag-vocabulary.d.mts`
- Create: `tests/unit/tag-vocabulary.test.ts`
- Modify: `scripts/catalog/validate.mjs`

**Interfaces:**

- Produces:
  - `validateTagVocabulary(value): { valid: boolean; errors: string[] }`
  - `indexTagVocabulary(value): Map<string, TagDefinition>`
  - `publicTagVocabulary(value): PublicTagDefinition[]`
  - `tagVocabularyHash(value): string`
  - `tagsForKind(value, kind): TagDefinition[]`
- `TagDefinition` contains `id`, `label`, `facet`, `description`, `aliases`,
  `applicable_kinds`, `inclusion_guidance`, and `exclusion_guidance`.

- [ ] **Step 1: Write failing vocabulary contract tests**

```ts
test("accepts unique goal and trait definitions", () => {
  expect(validateTagVocabulary(fixture).valid).toBe(true);
});

test.each([
  ["duplicate id", duplicateIdFixture],
  ["duplicate normalized alias", duplicateAliasFixture],
  ["unknown facet", unknownFacetFixture],
  ["empty guidance", emptyGuidanceFixture],
])("rejects %s", (_label, value) => {
  expect(validateTagVocabulary(value).valid).toBe(false);
});

test("strips classifier guidance from public definitions", () => {
  expect(publicTagVocabulary(fixture)[0]).not.toHaveProperty(
    "inclusion_guidance",
  );
});
```

- [ ] **Step 2: Run the vocabulary tests and confirm red**

Run:

```powershell
npx.cmd vitest run tests/unit/tag-vocabulary.test.ts
```

Expected: FAIL because `tag-vocabulary.mjs` and the schema do not exist.

- [ ] **Step 3: Implement the exact vocabulary schema and helpers**

Use this exported type:

```ts
export interface TagDefinition {
  id: string;
  label: string;
  facet: "goal" | "trait";
  description: string;
  aliases: string[];
  applicable_kinds: Array<"frontend" | "extension" | "preset">;
  inclusion_guidance: string[];
  exclusion_guidance: string[];
}
```

Normalize collision checks with `value.trim().toLocaleLowerCase()`. Hash the
canonical `JSON.stringify` representation with SHA-256. Preserve vocabulary
order for display while indexes use IDs. Create the initial tracked document as
`{ "schema_version": 1, "tags": [] }`; Task 11 replaces the empty collection
with the corpus-derived curated vocabulary before any canonical project cutover.

- [ ] **Step 4: Add vocabulary validation to catalog validation**

Load `data/vocabularies/tags.json` when no test fixture override is supplied and
prefix errors with `tags-vocabulary:`. Do not validate project tags in this task
because source-backed project schema integration occurs later.

- [ ] **Step 5: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/tag-vocabulary.test.ts tests/unit/validate-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add data/schemas/tag-vocabulary.schema.json data/vocabularies/tags.json scripts/catalog/tag-vocabulary.mjs scripts/catalog/tag-vocabulary.d.mts tests/unit/tag-vocabulary.test.ts scripts/catalog/validate.mjs
git commit -m "feat(catalog): add tag vocabulary contract"
```

---

### Task 2: Source-Keyed Raw Evidence Corpus

**Files:**

- Create: `scripts/catalog/catalog-evidence.mjs`
- Create: `scripts/catalog/catalog-evidence.d.mts`
- Create: `tests/unit/catalog-evidence.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Consumes source records with `id`, provider type, repository location, and
  immutable repository ID.
- Produces:
  - `evidenceDirectory(root, source): string`
  - `refreshCatalogEvidence(options): Promise<EvidenceRefreshReport>`
  - CLI flags `--all`, `--source <id>`, and `--project <id>`
- Adapter contract:

```ts
export interface EvidenceAdapter {
  fetch(input: {
    source: CatalogSource;
    etag: string | null;
    commitSha: string | null;
  }): Promise<
    | { status: "unchanged"; checkedAt: string }
    | {
        status: "fetched";
        readmeFilename: string;
        readmeBytes: Uint8Array;
        readmePath: string;
        downloadUrl: string;
        repositoryDescription: string | null;
        defaultBranch: string;
        commitSha: string;
        etag: string | null;
      }
    | { status: "missing"; repositoryDescription: string | null }
  >;
}
```

- [ ] **Step 1: Write failing path, byte-preservation, and refresh tests**

```ts
test("stores sibling evidence once by source identity", () => {
  expect(evidenceDirectory(root, githubSource)).toBe(
    resolve(root, "github", "1001051404"),
  );
});

test("preserves raw README bytes and source metadata", async () => {
  const result = await refreshCatalogEvidence(fixtureOptions);
  expect(await readFile(result.entries[0].readmePath)).toEqual(rawBytes);
  expect(JSON.parse(await readFile(result.entries[0].metadataPath, "utf8")))
    .toMatchObject({ source_id: "github-1001051404", content_sha256: hash });
});

test("keeps the last valid corpus entry when refresh fails", async () => {
  await expect(refreshCatalogEvidence(failingOptions)).resolves.toMatchObject({
    failed: 1,
  });
  expect(await readFile(existingReadme)).toEqual(previousBytes);
});
```

- [ ] **Step 2: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/catalog-evidence.test.ts
```

Expected: FAIL because the collector does not exist.

- [ ] **Step 3: Implement atomic source-keyed writes**

Write new content and `source.json` into a sibling temporary directory, fsync by
closing all handles, then rename into place. For a failed fetch, leave the old
directory untouched. For `unchanged`, update only checked metadata atomically.
Resolve `--project` through the source registry rather than creating a
project-keyed directory.

- [ ] **Step 4: Add ignored storage and explicit commands**

Add:

```gitignore
/local-data/catalog-evidence/
```

Add package scripts:

```json
"catalog:evidence:refresh": "node scripts/catalog/catalog-evidence.mjs",
"catalog:taxonomy:discover": "node scripts/catalog/discover-tag-taxonomy.mjs",
"catalog:tags:backfill": "node scripts/catalog/backfill-project-tags.mjs"
```

The latter two commands may point to files introduced in later tasks; do not run
them in this task.

- [ ] **Step 5: Run focused tests and ignore verification**

```powershell
npx.cmd vitest run tests/unit/catalog-evidence.test.ts
git check-ignore -v local-data/catalog-evidence/example/source.json
```

Expected: tests PASS and Git reports the new ignore rule.

- [ ] **Step 6: Commit**

```powershell
git add .gitignore package.json scripts/catalog/catalog-evidence.mjs scripts/catalog/catalog-evidence.d.mts tests/unit/catalog-evidence.test.ts
git commit -m "feat(catalog): cache raw source evidence"
```

---

### Task 3: Independent Metadata Policy and Tag Output Contract

**Files:**

- Create: `scripts/catalog/metadata-policy.mjs`
- Create: `scripts/catalog/metadata-policy.d.mts`
- Create: `scripts/catalog/tag-classification.mjs`
- Create: `scripts/catalog/tag-classification.d.mts`
- Create: `tests/unit/metadata-policy.test.ts`
- Create: `tests/unit/tag-classification.test.ts`
- Modify: `scripts/submissions/submission-summary-authority.mjs`
- Modify: `scripts/submissions/submission-summary-authority.d.mts`

**Interfaces:**

- Produces:
  - `automaticMetadataPolicy()`
  - `manualMetadataPolicy(authorityType)`
  - `metadataFieldsToGenerate(record): Array<"summary" | "tags">`
  - `resolveRequestedMetadata({ request, authority }): ResolvedMetadataRequest`
  - `validateTagSelection({ tags, vocabulary, kind }): ValidationResult`
  - `validateTagGenerationOutput(output, request): ValidationResult`
- Rename authority export without breaking consumers:
  - `classifySubmissionMetadataAuthority(input)`
  - retain `classifySubmissionSummaryAuthority` as a temporary forwarding alias
    until all consumers migrate in Task 9.

- [ ] **Step 1: Write failing policy matrix and authority tests**

```ts
test.each([
  ["automatic", "automatic", ["summary", "tags"]],
  ["manual", "automatic", ["tags"]],
  ["automatic", "manual", ["summary"]],
  ["manual", "manual", []],
])("%s/%s generates only automatic fields", (summary, tags, expected) => {
  expect(metadataFieldsToGenerate(recordWith(summary, tags))).toEqual(expected);
});

test("discards unauthorized manual values", () => {
  expect(
    resolveRequestedMetadata({
      request: manualRequest,
      authority: { authorityType: "community-submitter" },
    }),
  ).toEqual({
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  });
});
```

- [ ] **Step 2: Write failing tag-output tests**

```ts
test("accepts zero through six unique supported tags", () => {
  expect(validateTagSelection(validInput).valid).toBe(true);
});

test.each([
  ["seven tags", sevenTags],
  ["duplicate tags", duplicateTags],
  ["unknown tag", unknownTag],
  ["wrong project kind", wrongKind],
])("rejects %s", (_label, tags) => {
  expect(validateTagSelection({ ...baseInput, tags }).valid).toBe(false);
});
```

- [ ] **Step 3: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/metadata-policy.test.ts tests/unit/tag-classification.test.ts tests/unit/submission-summary-authority.test.ts
```

Expected: FAIL for missing modules and renamed export.

- [ ] **Step 4: Implement exact policy objects**

Automatic:

```js
{ mode: "automatic" }
```

Manual owner:

```js
{ mode: "manual", note: "Verified repository owner selection." }
```

Manual staff:

```js
{ mode: "manual", note: "Trusted Tavernary editor selection." }
```

Reject user-supplied notes. Validate generated tag entries as
`{ id, evidence: string[] }` and return canonical `tags: string[]` separately
from diagnostic evidence.

- [ ] **Step 5: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/metadata-policy.test.ts tests/unit/tag-classification.test.ts tests/unit/submission-summary-authority.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add scripts/catalog/metadata-policy.mjs scripts/catalog/metadata-policy.d.mts scripts/catalog/tag-classification.mjs scripts/catalog/tag-classification.d.mts scripts/submissions/submission-summary-authority.mjs scripts/submissions/submission-summary-authority.d.mts tests/unit/metadata-policy.test.ts tests/unit/tag-classification.test.ts tests/unit/submission-summary-authority.test.ts
git commit -m "feat(catalog): split metadata policy"
```

---

### Task 4: Reusable Bounded Tag Browser

**Files:**

- Create: `src/features/catalog/tag-vocabulary.ts`
- Create: `src/features/catalog/components/tag-browser.tsx`
- Create: `tests/unit/tag-browser.test.tsx`
- Modify: `src/styles/catalog.css`
- Modify: `src/styles/responsive.css`

**Interfaces:**

```ts
export interface PublicTagDefinition {
  id: string;
  label: string;
  facet: "goal" | "trait";
  description: string;
  aliases: string[];
  applicable_kinds: ProjectKind[];
}

export function searchTags(
  tags: PublicTagDefinition[],
  query: string,
): PublicTagDefinition[];
```

```tsx
<TagBrowser
  tags={tags}
  selected={selected}
  onToggle={onToggle}
  maxSelections={6}
  counts={counts}
  searchLabel="Search goals and traits"
  limitLabel="6 tags maximum"
/>
```

- [ ] **Step 1: Write failing search, grouping, pinning, and limit tests**

```tsx
test("searches labels, aliases, and descriptions", async () => {
  render(<Harness />);
  await user.type(screen.getByRole("searchbox"), "persistent context");
  expect(screen.getByLabelText("Maintain long-term memory")).toBeVisible();
});

test("pins selected tags and prevents a seventh selection", async () => {
  render(<Harness initialSelected={sixIds} />);
  expect(screen.getByText("6 / 6 selected")).toBeVisible();
  expect(screen.getByLabelText("Generate images")).toBeDisabled();
});

test("renders separate Goals and Traits groups in a bounded region", () => {
  render(<Harness tags={hundredTagFixture} />);
  expect(screen.getByRole("group", { name: "Goals" })).toBeVisible();
  expect(screen.getByRole("group", { name: "Traits" })).toBeVisible();
  expect(screen.getByTestId("tag-results")).toHaveClass("tag-results-bounded");
});
```

- [ ] **Step 2: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/tag-browser.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement public search helpers and component**

Normalize search over `label`, `description`, and every alias. Render selected
tags before unselected results without duplicating them. Keep Goals and Traits
as semantic fieldsets. Disable only unselected tags at the limit so selected
tags remain removable.

- [ ] **Step 4: Add bounded responsive styling**

Use a stable `.tag-results-bounded` block with `max-block-size: min(24rem, 45vh)`
and `overflow-y: auto`. Preserve visible focus, minimum 44px touch targets, and
the existing metadata chip visual language.

- [ ] **Step 5: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/tag-browser.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/features/catalog/tag-vocabulary.ts src/features/catalog/components/tag-browser.tsx src/styles/catalog.css src/styles/responsive.css tests/unit/tag-browser.test.tsx
git commit -m "feat(ui): add bounded tag browser"
```

---

### Task 5: Integrate the Source-Registry Foundation

**Files:**

- Integrate: branch `codex/source-card-registry`
- Preserve: all files from Tasks 1–4
- Resolve only: conflicts that touch shared imports, package scripts,
  `.gitignore`, or shared styles

**Interfaces:**

- Consumes the source task's:
  - canonical `data/registry/sources/*.json`;
  - project `source_id`;
  - source-backed catalog join;
  - source-owned snapshots and refresh;
  - `listing_status`;
  - source-aware Help manifests and publication transactions; and
  - add-card draft framework.
- Produces one branch where all subsequent tag work targets source-backed
  records.

- [ ] **Step 1: Verify the source branch checkpoint and status**

```powershell
git log codex/source-card-registry --oneline --decorate -10
git status --short
```

Expected: source history contains coordination commit `dcf18a1d`; both
worktrees are clean; the source task has reported its implementation
verification checkpoint.

- [ ] **Step 2: Merge the source branch into the tag branch**

```powershell
git merge --no-ff codex/source-card-registry
```

Do not merge either branch into `main`.

- [ ] **Step 3: Resolve shared-file conflicts by preserving both contracts**

For `package.json`, retain source commands plus the three tag commands. For
`.gitignore`, retain source rules plus `/local-data/catalog-evidence/`. For
styles, retain source Help additions and the tag rules in `catalog.css` and
`responsive.css`. Do not restore inline project source, project-owned refresh,
capabilities, or legacy enrichment policy.

- [ ] **Step 4: Build the generated catalog and run the source baseline**

```powershell
npm.cmd run catalog:build
npm.cmd test
```

Expected: all source-registry tests and Tasks 1–4 tests PASS before any combined
migration edits.

- [ ] **Step 5: Commit conflict resolution if Git did not create the merge
      commit automatically**

```powershell
git add package.json .gitignore src/styles/catalog.css src/styles/responsive.css
git commit -m "merge: integrate source registry"
```

---

### Task 6: Final Version-6 Schema and Deterministic Tag Backfill

**Files:**

- Modify: `data/schemas/project.schema.json`
- Modify: `scripts/catalog/validate.mjs`
- Create: `scripts/catalog/backfill-project-tags.mjs`
- Create: `scripts/catalog/backfill-project-tags.d.mts`
- Create: `tests/unit/backfill-project-tags.test.ts`
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**

- Produces:
  - `planTagBackfill(input): TagBackfillPlan`
  - `applyTagBackfill(plan, { write }): Promise<TagBackfillReport>`
  - CLI dry-run by default; `--write` required for canonical changes.
- Reads classifier result files keyed by project ID and validates their
  vocabulary hash before applying them.

- [ ] **Step 1: Write failing combined-schema tests**

```ts
test("requires combined v6 tags and independent metadata policy", async () => {
  const result = await validateCatalog({ records: [combinedV6Fixture] });
  expect(result.errors).toEqual([]);
});

test.each(["capabilities", "enrichment_policy", "enrichment_note"])(
  "rejects removed field %s",
  async (field) => {
    const result = await validateCatalog({
      records: [{ ...combinedV6Fixture, [field]: fieldValue(field) }],
    });
    expect(result.errors.join("\n")).toContain("additional properties");
  },
);
```

- [ ] **Step 2: Write failing migration tests**

```ts
test("preserves migrated summary policy and keeps tags independent", () => {
  expect(
    planTagBackfill(sourceBackedManualSummaryFixture).project.metadata_policy,
  ).toEqual({
    summary: { mode: "manual", note: migratedTrustedNote },
    tags: { mode: "automatic" },
  });
});

test("fails the whole plan when one classifier result is missing", () => {
  expect(() => planTagBackfill(incompleteInput)).toThrow(
    "missing tag result for",
  );
});
```

- [ ] **Step 3: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/validate-catalog.test.ts tests/unit/backfill-project-tags.test.ts
```

Expected: FAIL because the final combined validators and migration do not exist.

- [ ] **Step 4: Implement exact schema validation**

Require `tags` with `maxItems: 6` and `uniqueItems: true`. Define
`metadata_policy.summary` and `.tags` using `oneOf` exact automatic/manual
objects. Add catalog-level checks for vocabulary existence and applicable kind.
Reject any canonical record whose schema version differs from 6.

- [ ] **Step 5: Implement deterministic dry-run/write backfill**

Sort projects by ID, tags by vocabulary order, and report keys
lexicographically. Require a classifier result and matching vocabulary hash for
every automatic tag field. Preserve explicit manual tag selections supplied by
trusted migration input. Write all project files through a temporary staging
directory only after the complete candidate validates.

- [ ] **Step 6: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/validate-catalog.test.ts tests/unit/backfill-project-tags.test.ts tests/unit/full-catalog-data.test.ts
```

Expected: PASS against fixtures; production data is not written yet.

- [ ] **Step 7: Commit**

```powershell
git add data/schemas/project.schema.json scripts/catalog/validate.mjs scripts/catalog/backfill-project-tags.mjs scripts/catalog/backfill-project-tags.d.mts tests/unit/validate-catalog.test.ts tests/unit/backfill-project-tags.test.ts tests/unit/full-catalog-data.test.ts
git commit -m "feat(catalog): enforce combined schema v6"
```

---

### Task 7: TavernAI Tag Classification and Enrichment

**Files:**

- Modify: `scripts/catalog/enrichment-contract.mjs`
- Modify: `scripts/catalog/enrichment-contract.d.mts`
- Modify: `scripts/catalog/enrichment-provider.mjs`
- Modify: `scripts/catalog/enrichment-provider.d.mts`
- Modify: `scripts/catalog/enrich-readmes.mjs`
- Modify: `scripts/catalog/enrich-readmes.d.mts`
- Modify: `scripts/catalog/enrichment-report.mjs`
- Modify: `scripts/catalog/enrichment-report.d.mts`
- Modify: `tests/unit/enrichment-contract.test.ts`
- Modify: `tests/unit/enrichment-provider.test.ts`
- Modify: `tests/unit/enrich-readmes.test.ts`
- Modify: `tests/unit/enrichment-report.test.ts`

**Interfaces:**

- Consumes `metadataFieldsToGenerate`, public/classifier vocabulary, and one
  source evidence payload.
- Provider input includes
  `requestedFields: Array<"summary" | "tags">`,
  `allowedTags: TagDefinition[]`, and `vocabularyHash`.
- Output includes only requested fields plus existing copy-policy diagnostics.

- [ ] **Step 1: Write failing independent-field contract tests**

```ts
test("validates tags without requiring summary when only tags were requested", () => {
  expect(
    validateEnrichmentOutput(tagsOnlyOutput, context({ fields: ["tags"] })),
  ).toEqual({ valid: true });
});

test("rejects a manual field returned by the provider", () => {
  expect(
    validateEnrichmentOutput(summaryAndTags, context({ fields: ["tags"] }))
      .errors,
  ).toContain("summary was not requested");
});
```

- [ ] **Step 2: Write failing orchestration tests**

```ts
test("loads source evidence once and classifies sibling cards independently", async () => {
  await enrichRecords([extensionSibling, presetSibling], options);
  expect(sourceLoader).toHaveBeenCalledTimes(1);
  expect(provider.generate).toHaveBeenCalledTimes(2);
});

test("keeps a manual summary while refreshing automatic tags", async () => {
  const result = await enrichRecord(manualSummaryRecord, options);
  expect(result.summary).toBe(manualSummaryRecord.summary);
  expect(result.tags).toEqual(["maintain-long-term-memory"]);
});
```

- [ ] **Step 3: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-report.test.ts
```

Expected: FAIL on capability-shaped output and coupled summary requirements.

- [ ] **Step 4: Replace capability output with bounded tags**

Validate tag IDs, evidence references, applicable kinds, uniqueness, and six-tag
limit through `tag-classification.mjs`. Keep existing summary style/copy
validation only when summary is requested.

- [ ] **Step 5: Update provider prompts**

State:

```text
Use the root README as primary evidence and repository description as
secondary evidence. Select zero to six allowed tag IDs. Do not invent a tag,
infer a sibling card's behavior, or force a selection when evidence is
insufficient.
```

Include classifier guidance but not unrelated corpus content. Require compact
source/line evidence for each selected tag.

- [ ] **Step 6: Update writes and durable reports**

Write only automatic fields. Preserve manual fields byte-for-byte. Record
requested fields, final tags, evidence, vocabulary hash, repair outcome, and
source ID. After one malformed tag repair, use `tags: []` with a diagnostic
rather than a staff alert.

- [ ] **Step 7: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-report.test.ts tests/unit/enrichment-orchestrator.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add scripts/catalog/enrichment-contract.mjs scripts/catalog/enrichment-contract.d.mts scripts/catalog/enrichment-provider.mjs scripts/catalog/enrichment-provider.d.mts scripts/catalog/enrich-readmes.mjs scripts/catalog/enrich-readmes.d.mts scripts/catalog/enrichment-report.mjs scripts/catalog/enrichment-report.d.mts tests/unit/enrichment-contract.test.ts tests/unit/enrichment-provider.test.ts tests/unit/enrich-readmes.test.ts tests/unit/enrichment-report.test.ts
git commit -m "feat(catalog): generate independent tags"
```

---

### Task 8: Catalog Payload, Cards, Query, and Scalable Filtering

**Files:**

- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/filter-controls.tsx`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/catalog/components/active-query.tsx`
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `tests/unit/build-catalog.test.ts`
- Modify: `tests/unit/use-catalog-query.test.tsx`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Create: `tests/unit/filter-panel.test.tsx`
- Modify: `tests/unit/project-card.test.tsx`
- Create: `tests/unit/active-query.test.tsx`

**Interfaces:**

- `CatalogProject.tags: CatalogTag[]`
- `CatalogTag` extends public tag definition without classifier guidance.
- `CatalogQuery.tags: string[]`
- Canonical URL uses repeated `tag`.
- Selector helper:

```ts
export function matchesSelectedTags(
  selectedIds: string[],
  projectTagIds: string[],
  vocabulary: PublicTagDefinition[],
): boolean;
```

- [ ] **Step 1: Write failing build and payload tests**

```ts
test("publishes tag metadata without classifier guidance", async () => {
  const catalog = await buildCatalog(fixture);
  expect(catalog.projects[0].tags[0]).toMatchObject({
    id: "maintain-long-term-memory",
    facet: "goal",
  });
  expect(JSON.stringify(catalog)).not.toContain("inclusion_guidance");
});
```

- [ ] **Step 2: Write failing query and selector tests**

```ts
test("uses OR within facets and AND between facets", () => {
  expect(matchesSelectedTags([goalA, goalB, traitA], [goalB, traitA], vocab))
    .toBe(true);
  expect(matchesSelectedTags([goalA, traitA], [goalA], vocab)).toBe(false);
});

test("normalizes a valid legacy capability to canonical tag params", () => {
  const parsed = parseCatalogQuery("?capability=automation", vocab);
  expect(parsed.tags).toEqual(["automated-workflow"]);
  expect(serializeCatalogQuery(parsed)).toContain("tag=automated-workflow");
});
```

- [ ] **Step 3: Write failing filter and card tests**

Render a one-hundred-tag fixture and assert one search box, Goals/Traits
headings, pinned selected chips, bounded results, counts, and tag chips on
cards. Assert there is no `Show more` control in Goals & traits.

- [ ] **Step 4: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/build-catalog.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/filter-panel.test.tsx tests/unit/project-card.test.tsx
```

Expected: FAIL because catalog consumers still use capabilities.

- [ ] **Step 5: Build tag-aware public data and search text**

Join tag IDs through `publicTagVocabulary`. Include labels, aliases, and
descriptions in search text. Remove capability payload generation.

- [ ] **Step 6: Replace capability query state and selectors**

Parse repeated `tag` values against the vocabulary. Split selected IDs into
goal/trait sets at match time. Accept a legacy capability ID only when it
exactly matches one unique normalized tag alias; the vocabulary's alias
collision rule makes this deterministic. Always serialize `tag`.

- [ ] **Step 7: Use `TagBrowser` in the filter panel and cards**

Rename the section to **Goals & traits**. Pass per-tag project counts. Keep
selected tags pinned. Replace card capability chips and accessibility
descriptions with tag equivalents.

- [ ] **Step 8: Run focused tests**

```powershell
npm.cmd run catalog:build
npx.cmd vitest run tests/unit/build-catalog.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/filter-panel.test.tsx tests/unit/project-card.test.tsx tests/unit/active-query.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add scripts/catalog/build.mjs src/features/catalog/catalog-types.ts src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components/filter-controls.tsx src/features/catalog/components/filter-panel.tsx src/features/catalog/components/active-query.tsx src/features/catalog/components/project-card.tsx src/features/catalog/components/catalog-page.tsx tests/unit/build-catalog.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/catalog-selectors.test.ts tests/unit/filter-panel.test.tsx tests/unit/project-card.test.tsx tests/unit/active-query.test.tsx
git commit -m "feat(catalog): filter by goals and traits"
```

---

### Task 9: Public Submission Metadata Choices and Authority

**Files:**

- Modify: `src/features/submissions/project-submission-manifest.mjs`
- Modify: `src/features/submissions/project-submission-manifest.d.mts`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/features/submissions/submission-transport.ts`
- Modify: `scripts/submissions/submission-summary-authority.mjs`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/generate-project-submission.yml`
- Modify: `tests/unit/project-submission-manifest.test.ts`
- Modify: `tests/unit/project-submission-builder.test.tsx`
- Modify: `tests/unit/submission-summary-authority.test.ts`
- Modify: `tests/unit/draft-project-record.test.ts`
- Modify: `tests/unit/generate-project-submission.test.ts`
- Modify: `tests/unit/workflows.test.ts`
- Modify: `tests/e2e/project-submission.spec.ts`

**Interfaces:**

Submission manifest advances to version 4:

```ts
metadata: {
  summary:
    | { mode: "automatic" }
    | { mode: "manual"; value: string };
  tags:
    | { mode: "automatic" }
    | { mode: "manual"; values: string[] };
}
```

The manifest carries requested mode, not trusted provenance.

- [ ] **Step 1: Write failing manifest and authority tests**

Assert exact version-4 keys, 220-character summary limit, six-tag limit,
vocabulary validation, and absence of user-supplied policy note. Assert
community authority resolves both manual fields to automatic and deletes their
values.

- [ ] **Step 2: Write failing form tests**

```tsx
test("defaults both metadata fields to Tavernary automation", () => {
  render(<ProjectSubmissionBuilder {...props} />);
  expect(screen.getByLabelText("Description choice")).toHaveValue("automatic");
  expect(screen.getByLabelText("Tag choice")).toHaveValue("automatic");
  expect(screen.queryByLabelText("Short description")).not.toBeInTheDocument();
});

test("reveals bounded manual controls and explains authority", async () => {
  await chooseManualSummaryAndTags();
  expect(screen.getByText(/root README first/i)).toBeVisible();
  expect(screen.getAllByText(/only.*repository owner.*Tavernary staff/i))
    .toHaveLength(2);
  expect(screen.getByText("0 / 6 selected")).toBeVisible();
});
```

- [ ] **Step 3: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/submission-summary-authority.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/workflows.test.ts
```

Expected: FAIL on manifest version and missing controls.

- [ ] **Step 4: Implement contextual dropdowns and source-derived name**

Use existing described-dropdown styling. Remove ordinary editable display name.
Derive name from resolved source observation before drafting. Render manual
summary and `TagBrowser` only for their selected modes. Preserve existing
primary function, frontend, Preset compatibility, and additional-context
controls.

- [ ] **Step 5: Resolve authority before using values**

Call `classifySubmissionMetadataAuthority`. For community submitters, construct
automatic requests and never pass their manual values to the model prompt,
record draft, report, or PR. For owner/staff, construct exact manual policy
notes through `manualMetadataPolicy`.

- [ ] **Step 6: Generate only automatic fields and package final v6 card**

Use root README first and repository description second. When both summary and
tags are automatic, use one provider request. Preserve independent modes in the
generated transaction.

- [ ] **Step 7: Update workflow path and manifest guards**

Require manifest version 4 and exact allowed keys. Preserve exact-actor,
exact-head, exact-file-set, and duplicate-source admission rules from the
source-registry branch.

- [ ] **Step 8: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/submission-summary-authority.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/features/submissions/project-submission-manifest.mjs src/features/submissions/project-submission-manifest.d.mts src/features/submissions/components/project-submission-builder.tsx src/features/submissions/submission-transport.ts scripts/submissions/submission-summary-authority.mjs scripts/submissions/draft-project-record.mjs scripts/submissions/draft-project-record.d.mts scripts/submissions/generate-project-submission.mjs .github/ISSUE_TEMPLATE/01-project-submission.yml .github/workflows/triage-submission.yml .github/workflows/generate-project-submission.yml tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/submission-summary-authority.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/workflows.test.ts tests/e2e/project-submission.spec.ts
git commit -m "feat(submissions): choose metadata authority"
```

---

### Task 10: Owner Editing and Multi-Card Draft Metadata

**Files:**

- Modify: `src/lib/help/load-owner-project-options.ts`
- Modify: `src/features/help/project-owner-manifest.mjs`
- Modify: `src/features/help/project-owner-manifest.d.mts`
- Modify: `src/features/help/components/owner-card-fields.tsx`
- Modify: `src/features/help/components/source-card-batch-editor.tsx`
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `scripts/help/apply-project-owner-request.mjs`
- Modify: `scripts/help/triage-project-owner-request.mjs`
- Modify: `scripts/help/generate-project-owner-request.mjs`
- Modify: `src/styles/help.css`
- Modify: `tests/unit/project-owner-manifest.test.ts`
- Modify: `tests/unit/project-owner-builder.test.tsx`
- Modify: `tests/unit/apply-project-owner-request.test.ts`
- Modify: `tests/unit/triage-project-owner-request.test.ts`
- Modify: `tests/unit/generate-project-owner-request.test.ts`
- Modify: `tests/e2e/help-project-owner.spec.ts`

**Interfaces:**

- Owner project options expose `tags` and `metadataPolicy`.
- Card edit proposals carry complete `summary`, `tags`, and
  `metadata_policy`.
- Each add-card draft has independent `metadata.summary` and `metadata.tags`
  requests; both default automatic.

- [ ] **Step 1: Write failing owner-editor tests**

Assert capability controls are absent, the tag browser enforces six, summary and
tag modes change independently, and generated notes cannot come from form
input.

- [ ] **Step 2: Write failing add-card draft tests**

```tsx
test("clones values without cloning metadata provenance", async () => {
  render(<AddCardsBuilder sourceCard={manualSourceCard} />);
  expect(summaryChoice(0)).toHaveValue("automatic");
  expect(tagChoice(0)).toHaveValue("automatic");
  expect(draftTags(0)).toEqual(manualSourceCard.tags);
});

test("enforces six tags on each draft rather than the batch", async () => {
  render(<AddCardsBuilder draftCount={2} />);
  await selectSixTags(0);
  expect(unselectedTag(0)).toBeDisabled();
  expect(unselectedTag(1)).toBeEnabled();
});
```

- [ ] **Step 3: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/apply-project-owner-request.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts
```

Expected: FAIL on legacy capabilities/provenance behavior.

- [ ] **Step 4: Replace owner capability editing with tag/policy editing**

Load the public vocabulary once. Reuse `TagBrowser`. Switching manual to
automatic schedules generation; switching automatic to manual requires the
current bounded value and creates trusted provenance during triage.

- [ ] **Step 5: Update add-card drafts**

Keep cloned summary/tag values as editable seeds, but initialize both requested
modes to automatic and omit notes. Resolve final provenance from verified actor
authority for every draft. Keep the source branch's one-to-ten atomic batch and
one-unresolved-request invariants.

- [ ] **Step 6: Update apply and publication guards**

Apply only exact validated policy objects. Preserve source/card fingerprints and
the source task's operation-specific file allowlists. A stale vocabulary hash
invalidates the request rather than reinterpreting old IDs.

- [ ] **Step 7: Run focused tests**

```powershell
npx.cmd vitest run tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/apply-project-owner-request.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/help/load-owner-project-options.ts src/features/help/project-owner-manifest.mjs src/features/help/project-owner-manifest.d.mts src/features/help/components/owner-card-fields.tsx src/features/help/components/source-card-batch-editor.tsx src/features/help/components/project-owner-builder.tsx scripts/help/apply-project-owner-request.mjs scripts/help/triage-project-owner-request.mjs scripts/help/generate-project-owner-request.mjs src/styles/help.css tests/unit/project-owner-manifest.test.ts tests/unit/project-owner-builder.test.tsx tests/unit/apply-project-owner-request.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts tests/unit/workflows.test.ts tests/e2e/help-project-owner.spec.ts
git commit -m "feat(help): edit independent card metadata"
```

---

### Task 11: Corpus Discovery, Curated Taxonomy, and Complete Catalog Pass

**Files:**

- Create: `scripts/catalog/discover-tag-taxonomy.mjs`
- Create: `scripts/catalog/discover-tag-taxonomy.d.mts`
- Create: `tests/unit/discover-tag-taxonomy.test.ts`
- Modify: `data/vocabularies/tags.json`
- Modify: every `data/registry/projects/*.json`
- Create: `data/reports/tag-migration-report.json`
- Modify: `docs/reference/project-record-schema.md`
- Modify: `docs/reference/controlled-vocabularies.md`

**Interfaces:**

- Discovery output is local and contains candidate ID, facet, frequency,
  applicable kinds, representative project IDs/evidence, aliases, and
  merge/split warnings.
- Final classifier results are keyed by project ID and vocabulary hash.

- [ ] **Step 1: Write failing deterministic discovery tests**

Use a three-source fixture with synonyms and repeated goals. Assert normalized
candidate counts, representative evidence, stable sorting, and no automatic
write to `tags.json`.

- [ ] **Step 2: Run and confirm red**

```powershell
npx.cmd vitest run tests/unit/discover-tag-taxonomy.test.ts
```

Expected: FAIL because the discovery command does not exist.

- [ ] **Step 3: Implement local candidate discovery**

Read raw evidence and card context, invoke the existing provider in bounded
batches, normalize candidate phrases, and write
`local-data/catalog-evidence/tag-candidates.json`. Do not modify tracked
vocabulary data.

- [ ] **Step 4: Run the explicit full evidence refresh**

Use the GitHub CLI/API-backed adapter with network permission:

```powershell
npm.cmd run catalog:evidence:refresh -- --all
```

Expected report: every active repository source is `fetched`, `unchanged`, or
explicitly `missing`; transient failures are retried and then listed without
destroying prior evidence.

- [ ] **Step 5: Produce and inspect the candidate report**

```powershell
npm.cmd run catalog:taxonomy:discover
```

Review recurring goals/traits, synonyms, ambiguous boundaries, kind
applicability, and representative evidence. Curate
`data/vocabularies/tags.json` with stable user-facing concepts. Do not target a
count mechanically; reject one-off or non-discovery implementation details.

- [ ] **Step 6: Classify every project against the closed vocabulary**

```powershell
npm.cmd run catalog:tags:backfill -- --all
```

The dry run must produce one result per card, zero to six evidence-backed IDs,
and the current vocabulary hash.

- [ ] **Step 7: Review the distribution before write**

Inspect:

- zero-tag cards and their missing/insufficient evidence;
- tags used by only one card;
- tags applied across incompatible kinds;
- cards at the six-tag ceiling;
- sibling cards with suspiciously identical selections; and
- any repair or invalid-output diagnostics.

Revise vocabulary guidance and rerun classification when evidence shows a
systematic boundary problem. Do not fill zero-tag cards merely to eliminate
zeros.

- [ ] **Step 8: Apply the complete canonical pass**

```powershell
npm.cmd run catalog:tags:backfill -- --all --write
```

Expected: every project is valid combined v6, no legacy capability/enrichment
field remains, and `data/reports/tag-migration-report.json` matches the applied
files.

- [ ] **Step 9: Update reference documentation**

Document exact schema, policy objects, tag vocabulary fields, source-keyed
evidence location, explicit refresh commands, filtering semantics, and
owner/staff authority.

- [ ] **Step 10: Run migration and full-data gates**

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npx.cmd vitest run tests/unit/backfill-project-tags.test.ts tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts tests/unit/validate-catalog.test.ts
```

Expected: PASS with the complete production registry.

- [ ] **Step 11: Commit the taxonomy and coordinated data cutover**

```powershell
git add data/vocabularies/tags.json data/registry/projects data/reports/tag-migration-report.json scripts/catalog/discover-tag-taxonomy.mjs scripts/catalog/discover-tag-taxonomy.d.mts tests/unit/discover-tag-taxonomy.test.ts docs/reference/project-record-schema.md docs/reference/controlled-vocabularies.md
git commit -m "feat(catalog)!: migrate cards to tag schema" -m "Replace capabilities and coupled enrichment policy with evidence-backed tags and independent summary/tag policy across the complete canonical registry."
```

---

### Task 12: Complete Verification and Merge-Readiness Review

**Files:**

- Verify all changed files.
- Update only failing tests or documentation whose failure demonstrates an
  unmet approved requirement.

**Interfaces:**

- Produces fresh evidence for every acceptance criterion and a clean
  merge-ready branch.

- [ ] **Step 1: Run focused feature suites**

```powershell
npx.cmd vitest run tests/unit/tag-vocabulary.test.ts tests/unit/catalog-evidence.test.ts tests/unit/metadata-policy.test.ts tests/unit/tag-classification.test.ts tests/unit/tag-browser.test.tsx tests/unit/backfill-project-tags.test.ts tests/unit/discover-tag-taxonomy.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/project-owner-builder.test.tsx tests/unit/filter-panel.test.tsx tests/unit/catalog-query.test.ts tests/unit/catalog-selectors.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the repository's complete verification**

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all unit tests, production build, and static export verification PASS.

- [ ] **Step 3: Run rendered desktop and mobile checks**

Start the production-compatible local server through the repository's existing
Playwright harness. Verify:

- the Goals & traits filter with the production vocabulary;
- search by alias and description;
- selected-chip pinning and removal;
- OR-within/AND-between result behavior;
- bounded scrolling at desktop and mobile widths;
- six tag chips on a dense card;
- public submission automatic defaults and conditional manual fields;
- owner editing with independent policy modes; and
- a two-draft add-card batch with independent six-tag limits.

Capture screenshots under the existing ignored test-artifact path and inspect
them for overflow, obscured controls, focus visibility, and mobile sheet
scrolling.

- [ ] **Step 4: Audit migration and source integration**

```powershell
rg -n '"schema_version": 5|"capabilities"|"enrichment_policy"|"enrichment_note"' data/registry/projects
git diff main...HEAD -- data/registry/projects data/registry/sources data/snapshots data/vocabularies data/reports
```

Expected: the search returns no canonical project hits; source records and
snapshots reflect the integrated source migration; every project change is
accounted for by the combined cutover.

- [ ] **Step 5: Review the final diff**

Use `superpowers:requesting-code-review`. Resolve every correctness, authority,
migration, workflow-safety, accessibility, or test-coverage finding. Re-run the
affected focused tests and then `npm.cmd run check`.

- [ ] **Step 6: Confirm branch state**

```powershell
git status --short
git log --oneline --decorate main..HEAD
git diff --check main...HEAD
```

Expected: clean worktree, intentional commits only, and no whitespace errors.

- [ ] **Step 7: Stop before merge**

Report the branch, commit range, migration counts/distribution, focused and full
verification evidence, rendered checks, known non-blocking limitations, and
that the branch is ready to merge. Do not merge to `main`.
