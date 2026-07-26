# Preset Model and Completion Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add family-level model compatibility and completion-format metadata, discovery, cards, and Preset submission support across Tavernary's static catalog.

**Architecture:** Canonical Preset records own curated model-family and completion-format IDs. The catalog build resolves those IDs to labels and derives each Kit's model compatibility from its available Preset components. Project and Kit selectors share explicit compatibility matching semantics, while submission manifests and GitHub workflows carry claims into canonical records without inference.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Node.js 24 ESM, JSON Schema/Ajv, Vitest, Testing Library, Playwright.

## Global Constraints

- Use model-family metadata, not provider, product, generation, parameter-count, or performance-tier metadata.
- Initial public labels are Model-Agnostic, Claude, GPT, Gemini, Gemma, DeepSeek, GLM, MiniMax, MiMo, Kimi, Qwen, Llama, and Mistral.
- Model-Agnostic is mutually exclusive with named families.
- Every Preset declares at least one model family and at least one completion format.
- A Preset may support multiple named families and both completion formats.
- Named-family filters also match Model-Agnostic Presets.
- Explicit Model-Agnostic filters match only Model-Agnostic Presets.
- A Kit matches when at least one available included Preset matches.
- Kit metadata remains derived; canonical Kit records do not gain compatibility fields.
- Completion-format filtering applies to Presets, not Kits.
- Existing metadata must be source-backed; never infer compatibility from company, URL, filename, or repository topic.
- Preserve unrelated worktree changes.

---

## File Structure

### New files

- `data/vocabularies/model-families.json` — ordered model-family IDs, labels, descriptions, and search aliases.
- `data/vocabularies/completion-formats.json` — completion-format IDs, labels, and descriptions.
- `src/features/catalog/preset-compatibility.ts` — shared model-family and completion matching helpers.
- `tests/unit/preset-compatibility.test.ts` — semantic matching tests independent of UI.

### Primary modified files

- `data/schemas/project.schema.json` and `data/registry/projects/*.json` — canonical schema and nine Preset records.
- `scripts/catalog/build.mjs` and `src/features/catalog/catalog-types.ts` — built Preset metadata and derived Kit families.
- `src/features/catalog/catalog-query.ts`, `src/features/kits/kit-query.ts`, selectors, filter panels, active-query display, and page state wiring — URL-backed filtering.
- `src/features/catalog/components/project-card.tsx` — grouped Preset metadata chips and accessible text.
- `src/features/submissions/project-submission-manifest.{mjs,d.mts}` and `project-submission-builder.tsx` — schema-version-2 browser intake.
- `.github/ISSUE_TEMPLATE/01-project-submission.yml` and `scripts/submissions/*` — fallback intake, triage, admission, draft record, and PR checklist propagation.
- Focused unit/e2e/visual fixtures and tests adjacent to each changed contract.

---

### Task 1: Add canonical vocabularies and Preset schema

**Files:**
- Create: `data/vocabularies/model-families.json`
- Create: `data/vocabularies/completion-formats.json`
- Modify: `data/schemas/project.schema.json`
- Modify: `scripts/catalog/validate.mjs`
- Test: `tests/unit/validate-catalog.test.ts`
- Test: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Produces: curated `modelFamilies` and `completionFormats` vocabulary maps for the catalog build.
- Produces: canonical Preset fields `model_families: string[]` and `completion_formats: string[]`.

- [ ] **Step 1: Write failing schema and vocabulary tests**

Add fixtures proving:

```ts
expect(
  validateProject({
    ...preset,
    model_families: ["model-agnostic", "claude"],
    completion_formats: ["chat-completion"],
  }),
).toContain("model-agnostic cannot be combined");
```

Also prove Presets require both arrays, Frontends and Extensions cannot carry
them, IDs must exist in the vocabularies, and vocabulary IDs/aliases are
case-insensitively unique.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts
```

Expected: failures for missing vocabulary files and unsupported Preset fields.

- [ ] **Step 3: Add the two vocabularies**

Use this model-family order and identity:

```json
{
  "model_families": [
    {"id":"model-agnostic","label":"Model-Agnostic","aliases":["universal","any model"]},
    {"id":"claude","label":"Claude","aliases":["Anthropic","Opus","Sonnet","Haiku"]},
    {"id":"gpt","label":"GPT","aliases":["ChatGPT","OpenAI"]},
    {"id":"gemini","label":"Gemini","aliases":["Google Gemini"]},
    {"id":"gemma","label":"Gemma","aliases":["Google Gemma"]},
    {"id":"deepseek","label":"DeepSeek","aliases":[]},
    {"id":"glm","label":"GLM","aliases":["ChatGLM","Zhipu"]},
    {"id":"minimax","label":"MiniMax","aliases":[]},
    {"id":"mimo","label":"MiMo","aliases":["Xiaomi MiMo"]},
    {"id":"kimi","label":"Kimi","aliases":["Moonshot","Moonshot AI"]},
    {"id":"qwen","label":"Qwen","aliases":["Alibaba","Tongyi"]},
    {"id":"llama","label":"Llama","aliases":["Meta Llama"]},
    {"id":"mistral","label":"Mistral","aliases":["Mixtral"]}
  ]
}
```

Add concise descriptions to each production entry. Add completion entries for
`chat-completion` and `text-completion`.

- [ ] **Step 4: Advance and enforce the canonical schema**

Advance `schema_version` from `4` to `5`. Define both fields as unique,
non-empty string arrays. Use conditional schema rules to require them only for
`kind: preset` and forbid them otherwise. Extend catalog validation to reject
unknown IDs and the `model-agnostic` plus named-family combination with a
specific error.

- [ ] **Step 5: Run focused tests and confirm green**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts
npm.cmd run catalog:validate
```

The validation command may remain red only because the nine canonical Presets
have not yet been migrated; every new rule-specific unit test must pass.

- [ ] **Step 6: Commit the schema unit**

```powershell
git add data/vocabularies/model-families.json data/vocabularies/completion-formats.json data/schemas/project.schema.json scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts tests/unit/full-catalog-data.test.ts
git commit -m "feat(catalog): define preset compatibility"
```

### Task 2: Audit and migrate canonical Presets

**Files:**
- Modify: `data/registry/projects/daddytorgo-hash-frankengarage.json`
- Modify: `data/registry/projects/le-emotionalism-1-1-5-prompt.json`
- Modify: `data/registry/projects/mentallyquill-st-wandlight.json`
- Modify: `data/registry/projects/puras-director-v15.json`
- Modify: `data/registry/projects/purrfect-logic-4-max-mini.json`
- Modify: `data/registry/projects/realistic-frankenstein-preset.json`
- Modify: `data/registry/projects/village-maker-google-drive-prompt.json`
- Modify: `data/registry/projects/writers-block-4.json`
- Modify: `data/registry/projects/zorgonatis-stabs-edh.json`
- Test: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Consumes: canonical `model_families` and `completion_formats` from Task 1.
- Produces: schema-version-5 Preset records used by every later build and UI task.

- [ ] **Step 1: Add a failing full-data assertion**

Assert that every Preset is schema version 5, has at least one family and
format, never combines `model-agnostic`, and carries a source-backed value.

- [ ] **Step 2: Run the catalog validation and record all nine failures**

Run:

```powershell
npm.cmd run catalog:validate
```

Expected: each unmigrated Preset fails the new required-field/version contract.

- [ ] **Step 3: Audit each Preset source**

Read the canonical source URL and its public documentation. Record only claims
that identify a family or completion format. Treat SillyTavern instruct/text
presets as Text Completion only when the source says so; treat Chat Completion
only when the source says so. Use `model-agnostic` only for an explicit
cross-model or model-independent claim.

If a source does not establish either required dimension, stop on that record
and report the exact missing claim for maintainer classification.

- [ ] **Step 4: Migrate the nine records**

Set:

```json
"schema_version": 5,
"model_families": ["source-backed-family"],
"completion_formats": ["source-backed-format"]
```

Keep all unrelated canonical metadata byte-for-byte equivalent after
formatting.

- [ ] **Step 5: Validate the complete canonical dataset**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd test -- tests/unit/full-catalog-data.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the migration**

```powershell
git add data/registry/projects tests/unit/full-catalog-data.test.ts
git commit -m "chore(catalog): classify preset compatibility"
```

### Task 3: Build labeled Preset metadata and derived Kit families

**Files:**
- Create: `src/features/catalog/preset-compatibility.ts`
- Modify: `scripts/catalog/build.mjs`
- Modify: `src/features/catalog/catalog-types.ts`
- Modify: `src/features/kits/kit-types.ts`
- Test: `tests/unit/build-catalog.test.ts`
- Test: `tests/unit/preset-compatibility.test.ts`
- Modify fixtures: `tests/fixtures/visual-catalog.json`
- Modify fixtures: `tests/fixtures/kits/projects.json`
- Modify fixtures: `tests/fixtures/kits/records.json`

**Interfaces:**
- Produces: `matchesModelFamilies(selected: string[], available: string[]): boolean`.
- Produces: `matchesCompletionFormats(selected: string[], available: string[]): boolean`.
- Produces: `CatalogProject.preset.modelFamilies`, `completionFormats`, and `CatalogKit.modelFamilies`.

- [ ] **Step 1: Write failing semantic helper tests**

Cover:

```ts
expect(matchesModelFamilies(["claude"], ["model-agnostic"])).toBe(true);
expect(matchesModelFamilies(["model-agnostic"], ["claude"])).toBe(false);
expect(matchesModelFamilies(["claude", "gpt"], ["gpt"])).toBe(true);
expect(matchesCompletionFormats(["chat-completion"], ["text-completion"])).toBe(false);
```

- [ ] **Step 2: Write failing build tests**

Assert that Preset aliases enter `searchableText`, non-Presets retain
`preset: null`, a Kit unions families from all available Presets, and flagged
Preset components do not contribute families.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm.cmd test -- tests/unit/preset-compatibility.test.ts tests/unit/build-catalog.test.ts
```

- [ ] **Step 4: Implement compatibility helpers and build mappings**

Implement empty-selection passthrough and Model-Agnostic asymmetry in the
shared helper. Load both vocabularies in `build.mjs`, label Preset arrays, add
labels and aliases to search text, and derive Kit model families from
`component.project?.preset?.modelFamilies`.

- [ ] **Step 5: Update catalog and Kit types plus deterministic fixtures**

Use:

```ts
interface PresetMetadata {
  version: string | null;
  publishedAt: string | null;
  artifactSizeBytes: number | null;
  modelFamilies: CatalogLabel[];
  completionFormats: CatalogLabel[];
}
```

Add `modelFamilies: CatalogLabel[]` to `CatalogKit`.

- [ ] **Step 6: Run focused tests and rebuild**

```powershell
npm.cmd test -- tests/unit/preset-compatibility.test.ts tests/unit/build-catalog.test.ts
npm.cmd run catalog:build
npm.cmd run typecheck
```

- [ ] **Step 7: Commit the build unit**

```powershell
git add scripts/catalog/build.mjs src/features/catalog/preset-compatibility.ts src/features/catalog/catalog-types.ts src/features/kits/kit-types.ts tests/unit/preset-compatibility.test.ts tests/unit/build-catalog.test.ts tests/fixtures data/catalog/projects.json
git commit -m "feat(catalog): build preset compatibility"
```

### Task 4: Add project and Kit filter semantics

**Files:**
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/filter-panel.tsx`
- Modify: `src/features/catalog/components/active-query.tsx`
- Modify: `src/features/catalog/components/catalog-page.tsx`
- Modify: `src/features/kits/kit-query.ts`
- Modify: `src/features/kits/kit-selectors.ts`
- Modify: `src/features/kits/components/kit-filter-panel.tsx`
- Create: `tests/unit/catalog-query.test.ts`
- Create: `tests/unit/active-query.test.tsx`
- Test: `tests/unit/kit-query.test.ts`
- Test: `tests/unit/kit-selectors.test.ts`
- Test: `tests/unit/catalog-selectors.test.ts`
- Test: `tests/unit/kit-filter-panel.test.tsx`

**Interfaces:**
- Consumes: matching helpers and built compatibility metadata from Task 3.
- Produces: repeatable `model` parameters for projects/Kits and `completion` parameters for projects.

- [ ] **Step 1: Write failing query round-trip tests**

Prove stable serialization:

```ts
expect(serializeCatalogQuery(parseCatalogQuery(
  "?category=preset&model=claude&model=gpt&completion=chat-completion",
))).toBe("category=preset&model=claude&model=gpt&completion=chat-completion");
```

Also prove unknown values are ignored and Kit model filters remain in
`query.kits.modelFamilies`, not the project query.

- [ ] **Step 2: Write failing selector and count tests**

Cover named-family matching of Model-Agnostic, explicit agnostic specificity,
multi-value OR, model-plus-completion AND, derived Kit matching, and semantic
counts.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm.cmd test -- tests/unit/catalog-query.test.ts tests/unit/kit-query.test.ts tests/unit/kit-selectors.test.ts tests/unit/catalog-selectors.test.ts tests/unit/active-query.test.tsx tests/unit/kit-filter-panel.test.tsx
```

- [ ] **Step 4: Extend query types and URL parsing**

Add:

```ts
CatalogQuery.modelFamilies: string[];
CatalogQuery.completionFormats: string[];
KitQuery.modelFamilies: string[];
```

Validate values from the vocabulary IDs and serialize them as stable sorted
repeatable `model` and `completion` parameters.

- [ ] **Step 5: Implement selectors and semantic counts**

Use `matchesModelFamilies` and `matchesCompletionFormats` instead of generic
array intersection. Extend `KitArrayFilter` with `modelFamilies`.

- [ ] **Step 6: Add filter controls and active tokens**

Within project **Capabilities & characteristics**, render labeled chip
subgroups for capabilities, Model family, and Completion format. Add Kit
**Capabilities & characteristics** with Model family only. Reuse existing
`FilterGroup` chip controls and add the smallest wrapper/label support needed
for accessible subgroup names.

- [ ] **Step 7: Run focused tests and typecheck**

```powershell
npm.cmd test -- tests/unit/catalog-query.test.ts tests/unit/kit-query.test.ts tests/unit/kit-selectors.test.ts tests/unit/catalog-selectors.test.ts tests/unit/active-query.test.tsx tests/unit/kit-filter-panel.test.tsx
npm.cmd run typecheck
```

- [ ] **Step 8: Commit the filtering unit**

```powershell
git add src/features/catalog src/features/kits tests/unit/catalog-query.test.ts tests/unit/kit-query.test.ts tests/unit/kit-selectors.test.ts tests/unit/catalog-selectors.test.ts tests/unit/active-query.test.tsx tests/unit/kit-filter-panel.test.tsx
git commit -m "feat(filters): add preset compatibility"
```

### Task 5: Render Preset compatibility on cards

**Files:**
- Modify: `src/features/catalog/components/project-card.tsx`
- Modify: `src/styles/catalog.css`
- Test: `tests/unit/project-card.test.tsx`
- Test: `tests/visual/catalog.visual.spec.ts`

**Interfaces:**
- Consumes: labeled `project.preset.modelFamilies` and `completionFormats`.
- Produces: grouped visible chips and accessible compatibility description.

- [ ] **Step 1: Write failing rendered-card tests**

Render a Preset supporting Claude/GPT and both formats. Assert visible chips,
group labels, and accessible text. Render a non-Preset and assert compatibility
groups are absent.

- [ ] **Step 2: Run focused tests and confirm red**

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
```

- [ ] **Step 3: Implement grouped metadata**

Reuse current chip markup and tokens. Add semantic wrappers labeled
`Supported model families` and `Completion formats`; do not introduce new
color families or model logos.

- [ ] **Step 4: Run unit and visual coverage**

```powershell
npm.cmd test -- tests/unit/project-card.test.tsx
npm.cmd run test:visual -- catalog.visual.spec.ts
```

- [ ] **Step 5: Commit the card unit**

```powershell
git add src/features/catalog/components/project-card.tsx src/styles/catalog.css tests/unit/project-card.test.tsx tests/visual/catalog.visual.spec.ts
git commit -m "feat(cards): show preset compatibility"
```

### Task 6: Add schema-version-2 Preset submission UI

**Files:**
- Modify: `src/features/submissions/project-submission-manifest.mjs`
- Modify: `src/features/submissions/project-submission-manifest.d.mts`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `src/app/submit/project/page.tsx`
- Modify: `src/styles/submission.css`
- Test: `tests/unit/project-submission-manifest.test.ts`
- Test: `tests/unit/project-submission-builder.test.tsx`
- Test: `tests/e2e/project-submission.spec.ts`

**Interfaces:**
- Produces: version-2 `ProjectSubmissionManifest`.
- Produces: `preset_compatibility.model_families.known_ids`, `.other`, and `.completion_formats`.
- Preserves: normalization of version-1 manifests for open-issue compatibility.

- [ ] **Step 1: Write failing manifest tests**

Prove:

```ts
const result = normalizeProjectSubmissionManifest({
  schema_version: 2,
  project_type: "preset",
  preset_compatibility: {
    model_families: { known_ids: ["claude"], other: [] },
    completion_formats: ["chat-completion", "text-completion"],
  },
  // existing required fields
});
expect(result).toMatchObject({ valid: true });
```

Also cover missing selections, unknown IDs, case-insensitive other-family
deduplication, Model-Agnostic exclusivity, non-Preset omission, and version-1
normalization.

- [ ] **Step 2: Write failing builder tests**

Assert Preset-only visibility, exclusive selection, both-format selection,
unlisted-family validation, clearing on project-type switch, field-level error
placement, and exact serialized version-2 handoff.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx
```

- [ ] **Step 4: Implement versioned manifest normalization**

Use a discriminated union for schema versions 1 and 2. Emit version 2 from the
builder. Limit each unlisted family to 60 trimmed plain-text characters and
deduplicate with `toLocaleLowerCase()`.

- [ ] **Step 5: Implement the Preset-only form sections**

Pass model and completion vocabularies from the submit page. Reuse submission
checkbox/chip patterns. Model-Agnostic clears named/unlisted state; named or
unlisted selection clears Model-Agnostic.

- [ ] **Step 6: Run unit and browser tests**

```powershell
npm.cmd test -- tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx
npm.cmd run test:e2e -- project-submission.spec.ts
```

- [ ] **Step 7: Commit the builder unit**

```powershell
git add src/features/submissions src/app/submit/project/page.tsx src/styles/submission.css tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/e2e/project-submission.spec.ts
git commit -m "feat(submit): collect preset compatibility"
```

### Task 7: Carry compatibility through GitHub intake

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `scripts/submissions/parse-project-submission.mjs`
- Modify: `scripts/submissions/validate-submission.mjs`
- Modify: `scripts/submissions/validate-submission.d.mts`
- Modify: `scripts/submissions/admission.mjs`
- Modify: `scripts/submissions/admission.d.mts`
- Modify: `scripts/submissions/draft-project-record.mjs`
- Modify: `scripts/submissions/draft-project-record.d.mts`
- Modify: `scripts/submissions/generate-project-submission.mjs`
- Modify: `scripts/submissions/project-submission-pr.mjs`
- Test: `tests/unit/parse-project-submission.test.ts`
- Test: `tests/unit/validate-submission.test.ts`
- Test: `tests/unit/draft-project-record.test.ts`
- Test: `tests/unit/generate-project-submission.test.ts`
- Test: `tests/unit/project-submission-pr.test.ts`
- Test: `tests/unit/issue-forms.test.ts`

**Interfaces:**
- Consumes: normalized version-2 manifest from Task 6.
- Produces: schema-version-5 draft Preset records with reconciled curated IDs.
- Preserves: version-1 Preset submissions as parseable but incomplete.

- [ ] **Step 1: Write failing fallback-parser and admission tests**

Cover known families, Model-Agnostic, unlisted family, both completion formats,
and version-1 Preset routing to `needs-information`.

- [ ] **Step 2: Write failing draft-record and PR tests**

Assert exact propagation to:

```json
"model_families": ["claude"],
"completion_formats": ["chat-completion"]
```

Assert unlisted families cannot reach a canonical draft until reconciled.

- [ ] **Step 3: Run focused tests and confirm red**

```powershell
npm.cmd test -- tests/unit/parse-project-submission.test.ts tests/unit/validate-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/issue-forms.test.ts
```

- [ ] **Step 4: Extend the fallback issue form**

Use GitHub checkboxes for the curated families and completion formats, plus
separate Model-Agnostic and unlisted-family inputs. Keep copy explicit that an
unlisted family is a review request, not automatic vocabulary admission.

- [ ] **Step 5: Implement parse, validation, admission, and draft propagation**

Normalize fallback headings into manifest version 2. Validate IDs against the
same vocabulary data used by catalog validation. Carry reconciled arrays
through admitted submission types and emit project schema version 5.

- [ ] **Step 6: Update the maintainer checklist**

Add checks that family claims are source-backed, unlisted values are
reconciled, and completion format is confirmed.

- [ ] **Step 7: Run the intake test slice**

```powershell
npm.cmd test -- tests/unit/parse-project-submission.test.ts tests/unit/validate-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/issue-forms.test.ts
```

- [ ] **Step 8: Commit the intake unit**

```powershell
git add .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions tests/unit/parse-project-submission.test.ts tests/unit/validate-submission.test.ts tests/unit/draft-project-record.test.ts tests/unit/generate-project-submission.test.ts tests/unit/project-submission-pr.test.ts tests/unit/issue-forms.test.ts
git commit -m "feat(intake): validate preset compatibility"
```

### Task 8: Verify integrated desktop, mobile, and static behavior

**Files:**
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `tests/e2e/mobile.spec.ts`
- Modify: `tests/kits-e2e/kits.spec.ts`
- Modify: `tests/visual/catalog.visual.spec.ts`
- Modify: `tests/kits-e2e/kits.visual.spec.ts`
- Modify: generated `data/catalog/projects.json`

**Interfaces:**
- Consumes: all completed feature units.
- Produces: full regression and static-export evidence.

- [ ] **Step 1: Add integrated browser scenarios**

Exercise a named family that includes a Model-Agnostic result, explicit
Model-Agnostic specificity, completion filtering, combined dimensions,
derived Kit model filtering, active tokens, URL reload persistence, and mobile
filter sheets.

- [ ] **Step 2: Rebuild deterministic data**

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
npm.cmd run build:test-kits
```

- [ ] **Step 3: Run focused browser and visual suites**

```powershell
npm.cmd run test:e2e -- catalog.spec.ts mobile.spec.ts project-submission.spec.ts
npm.cmd run test:kits-e2e
npm.cmd run test:visual -- catalog.visual.spec.ts
npm.cmd run test:kits-visual
```

- [ ] **Step 4: Run the repository gate**

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
unit tests, production static build, and export verification all pass.

- [ ] **Step 5: Inspect the final diff**

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm only feature files and pre-existing unrelated worktree changes appear.

- [ ] **Step 6: Commit integrated test evidence**

```powershell
git add tests/e2e tests/kits-e2e tests/visual data/catalog/projects.json
git commit -m "test: verify preset compatibility flows"
```
