# Preset Model Recommendation Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Model-Agnostic coexist with named model recommendations while making every model-family filter match only explicitly declared tags.

**Architecture:** Keep the existing `model_families` array and make the shared matcher a plain exact-membership OR matcher. Remove exclusivity at both canonical-catalog and submission boundaries, then migrate Wandlight to the four approved tags and rebuild the generated catalog. Preset selectors, Kit selectors, and facet counts continue consuming the same shared matcher so one semantic change governs every discovery path.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, Vitest 4, Playwright 1.61, Node.js 24, JSON/AJV catalog validation

## Global Constraints

- `model-agnostic` may coexist with named model-family IDs.
- `model=claude` matches only records whose model-family collection explicitly contains `claude`.
- `model=model-agnostic` matches only records whose model-family collection explicitly contains `model-agnostic`.
- Multiple selected model families retain OR semantics.
- Model-family filters continue combining with other dimensions using AND semantics.
- Kit model-family metadata remains the union of available Preset component tags.
- Omitted named families mean "not explicitly recommended," not "incompatible."
- Do not add another compatibility field, scoring, ranking, vocabulary value, dependency, or interaction pattern.
- Do not change completion-format behavior.
- Do not reclassify any Preset other than Wandlight.
- Wandlight's ordered model-family IDs are `model-agnostic`, `claude`, `glm`, and `deepseek`.
- Preserve unrelated dirty-worktree files; stage only paths named in each task.
- Use `npm.cmd` commands on Windows and Node.js `>=24 <25`.

---

## File Structure

- `src/features/catalog/preset-compatibility.ts` owns exact model-family and completion-format matching.
- `tests/unit/preset-compatibility.test.ts` proves the shared matching truth table.
- `tests/unit/catalog-selectors.test.ts` proves project filtering consumes exact tags.
- `tests/unit/kit-selectors.test.ts` proves Kit filtering and Kit facet counts consume exact tags.
- `scripts/catalog/validate.mjs` validates canonical registry model-family IDs without imposing agnostic exclusivity.
- `tests/unit/validate-catalog.test.ts` proves combined canonical tags are accepted while unknown IDs remain rejected.
- `src/features/submissions/project-submission-manifest.mjs` normalizes and validates submitted compatibility metadata without imposing agnostic exclusivity.
- `tests/unit/project-submission-manifest.test.ts` proves combined known and unlisted selections survive normalization.
- `src/features/submissions/components/project-submission-builder.tsx` permits combined selections and explains broad usability versus recommendations.
- `tests/unit/project-submission-builder.test.tsx` proves combined selections persist and serialize.
- `.github/ISSUE_TEMPLATE/01-project-submission.yml` gives fallback submitters the same semantics.
- `tests/unit/issue-forms.test.ts` prevents fallback-form copy from restoring exclusivity.
- `data/registry/projects/mentallyquill-st-wandlight.json` owns Wandlight's approved canonical tags.
- `src/generated/catalog.json` is the ignored deterministic application
  catalog rebuilt from the registry and verified without being committed.
- `tests/unit/full-catalog-data.test.ts` locks Wandlight's canonical tags.
- `tests/e2e/catalog.spec.ts` proves Claude filtering counts explicit tags and renders Wandlight's complete metadata.

---

### Task 1: Make Model Filtering Exact Everywhere

**Files:**
- Modify: `tests/unit/preset-compatibility.test.ts`
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/kit-selectors.test.ts`
- Modify: `src/features/catalog/preset-compatibility.ts`

**Interfaces:**
- Consumes: `matchesModelFamilies(selected: string[], available: string[]): boolean`
- Produces: exact-membership OR semantics used unchanged by project selectors, Kit selectors, and both filter-count paths

- [ ] **Step 1: Replace the helper tests with the approved truth table**

In `tests/unit/preset-compatibility.test.ts`, replace the old agnostic-expansion assertion and retain completion coverage:

```ts
test("named filters do not expand Model-Agnostic metadata", () => {
  expect(matchesModelFamilies(["claude"], ["model-agnostic"])).toBe(false);
});

test("the Model-Agnostic filter requires its explicit tag", () => {
  expect(matchesModelFamilies(["model-agnostic"], ["claude"])).toBe(false);
});

test("a combined-tag Preset matches each explicit filter", () => {
  const available = ["model-agnostic", "claude", "glm", "deepseek"];

  for (const selected of available) {
    expect(matchesModelFamilies([selected], available)).toBe(true);
  }
  expect(matchesModelFamilies(["gpt"], available)).toBe(false);
});

test("multiple selected model families use OR semantics", () => {
  expect(matchesModelFamilies(["claude", "gpt"], ["gpt"])).toBe(true);
});
```

- [ ] **Step 2: Add project-selector integration coverage**

In `tests/unit/catalog-selectors.test.ts`, add two Preset fixtures after the
existing `projects` array:

```ts
const agnosticPreset = project("agnostic-preset", {
  kind: "preset",
  preset: {
    version: null,
    publishedAt: null,
    artifactSizeBytes: null,
    modelFamilies: [label("model-agnostic")],
    completionFormats: [label("chat-completion")],
  },
});
const recommendedPreset = project("recommended-preset", {
  kind: "preset",
  preset: {
    version: null,
    publishedAt: null,
    artifactSizeBytes: null,
    modelFamilies: [label("model-agnostic"), label("claude")],
    completionFormats: [label("chat-completion")],
  },
});
```

Add a local helper beside `project()`:

```ts
const label = (id: string) => ({ id, label: id, description: id });
```

Then add this test:

```ts
test("filters Presets by explicit model recommendation tags", () => {
  expect(
    selectProjects(
      [agnosticPreset, recommendedPreset],
      { ...DEFAULT_QUERY, modelFamilies: ["claude"] },
      context,
    ).map(({ id }) => id),
  ).toEqual(["recommended-preset"]);

  expect(
    selectProjects(
      [agnosticPreset, recommendedPreset],
      { ...DEFAULT_QUERY, modelFamilies: ["model-agnostic"] },
      context,
    ).map(({ id }) => id),
  ).toEqual(["agnostic-preset", "recommended-preset"]);
});
```

- [ ] **Step 3: Add Kit filtering and facet-count coverage**

In `tests/unit/kit-selectors.test.ts`, add:

```ts
test("filters and counts Kits by explicit model recommendation tags", () => {
  const agnostic = kit("agnostic", {
    modelFamilies: [label("model-agnostic")],
  });
  const recommended = kit("recommended", {
    modelFamilies: [label("model-agnostic"), label("claude")],
  });
  const modelKits = [agnostic, recommended];

  expect(
    selectKits(modelKits, {
      ...DEFAULT_KIT_QUERY,
      modelFamilies: ["claude"],
    }).map(({ id }) => id),
  ).toEqual(["recommended"]);
  expect(
    countKitsForFilter(
      modelKits,
      DEFAULT_KIT_QUERY,
      "modelFamilies",
      "claude",
    ),
  ).toBe(1);
  expect(
    countKitsForFilter(
      modelKits,
      DEFAULT_KIT_QUERY,
      "modelFamilies",
      "model-agnostic",
    ),
  ).toBe(2);
});
```

- [ ] **Step 4: Run the focused tests to verify the old shortcut fails**

Run:

```powershell
npm.cmd test -- tests/unit/preset-compatibility.test.ts tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
```

Expected: FAIL because `matchesModelFamilies(["claude"], ["model-agnostic"])` is still `true`, causing the helper, project, and Kit expectations to include the agnostic-only fixtures.

- [ ] **Step 5: Reduce the shared matcher to exact OR membership**

Replace `matchesModelFamilies` in `src/features/catalog/preset-compatibility.ts` with:

```ts
export function matchesModelFamilies(selected: string[], available: string[]) {
  return (
    selected.length === 0 ||
    selected.some((family) => available.includes(family))
  );
}
```

Do not change `matchesCompletionFormats`.

- [ ] **Step 6: Run the focused tests**

Run:

```powershell
npm.cmd test -- tests/unit/preset-compatibility.test.ts tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit exact matching**

```powershell
git add -- src/features/catalog/preset-compatibility.ts tests/unit/preset-compatibility.test.ts tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts
git commit -m "fix: match explicit model recommendations"
```

---

### Task 2: Permit Combined Tags at Validation and Submission Boundaries

**Files:**
- Modify: `tests/unit/validate-catalog.test.ts`
- Modify: `scripts/catalog/validate.mjs`
- Modify: `tests/unit/project-submission-manifest.test.ts`
- Modify: `src/features/submissions/project-submission-manifest.mjs`
- Modify: `tests/unit/project-submission-builder.test.tsx`
- Modify: `src/features/submissions/components/project-submission-builder.tsx`
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`
- Modify: `tests/unit/issue-forms.test.ts`

**Interfaces:**
- Consumes: canonical `model_families: string[]` and manifest `preset_compatibility.model_families.{known_ids,other}`
- Produces: combined Model-Agnostic plus named-family selections preserved through browser and GitHub fallback intake

- [ ] **Step 1: Change the canonical validation test from rejection to acceptance**

In `tests/unit/validate-catalog.test.ts`, replace the exclusivity test with:

```ts
test("accepts Model-Agnostic combined with recommended families", async () => {
  const result = await validateCatalog({
    records: [
      {
        ...validRecord,
        model_families: ["model-agnostic", "claude", "glm", "deepseek"],
      },
    ],
  });

  expect(result.errors).toEqual([]);
});
```

Keep the unknown-family test unchanged.

- [ ] **Step 2: Add manifest normalization coverage for combined known and unlisted families**

Append to `tests/unit/project-submission-manifest.test.ts`:

```ts
test("preserves Model-Agnostic with recommended and unlisted families", () => {
  expect(
    normalizeProjectSubmissionManifest({
      schema_version: 2,
      project_type: "preset",
      source_url: "https://github.com/Owner/Preset",
      name: "Preset",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude", "model-agnostic"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion"],
      },
    }),
  ).toMatchObject({
    valid: true,
    manifest: {
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude"],
          other: ["FutureModel"],
        },
      },
    },
  });
});
```

- [ ] **Step 3: Replace the builder exclusivity test with combined-selection behavior**

Replace the test beginning `requires an enabled unlisted model family and keeps it exclusive` in `tests/unit/project-submission-builder.test.tsx` with two tests.

The first retains field validation:

```ts
test("requires a name when the unlisted model-family option is enabled", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.click(screen.getByLabelText("Other model family"));
  await user.type(screen.getByLabelText("Project URL"), "https://example.com/preset");
  await user.type(screen.getByLabelText("Project Name (required)"), "Preset");
  await user.type(
    screen.getByLabelText("Short Description (required)"),
    "A preset.",
  );
  await user.click(screen.getByLabelText("Chat Completion"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(openProjectSubmission).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Other model family name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
```

The second proves combined serialization:

```ts
test("serializes Model-Agnostic with recommended and unlisted families", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionBuilder frontends={frontends} />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "preset");
  await user.type(
    screen.getByLabelText("Project URL"),
    "https://github.com/example/preset",
  );
  await user.click(screen.getByLabelText("Model-Agnostic"));
  await user.click(screen.getByLabelText("Claude"));
  await user.click(screen.getByLabelText("Other model family"));
  await user.type(screen.getByLabelText("Other model family name"), "FutureModel");
  await user.click(screen.getByLabelText("Chat Completion"));
  await user.click(screen.getByRole("button", { name: "Continue to GitHub" }));

  expect(screen.getByLabelText("Model-Agnostic")).toBeChecked();
  expect(screen.getByLabelText("Claude")).toBeChecked();
  expect(openProjectSubmission).toHaveBeenCalledWith(
    "https://github.com/MentallyQuill/Tavernary/issues/new",
    expect.objectContaining({
      preset_compatibility: {
        model_families: {
          known_ids: ["model-agnostic", "claude"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion"],
      },
    }),
  );
});
```

- [ ] **Step 4: Add a fallback-form copy assertion**

In `tests/unit/issue-forms.test.ts`, after the supported-frontends assertions, add:

```ts
expect(fields[7].attributes.description).toContain(
  "Model-Agnostic may be combined with tested or recommended families",
);
expect(fields[7].attributes.description).not.toContain(
  "must be selected alone",
);
```

- [ ] **Step 5: Run the focused tests to verify all exclusivity boundaries fail**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/issue-forms.test.ts
```

Expected: FAIL because catalog validation and manifest normalization reject combined tags, builder toggles clear selections, and the fallback issue form still says Model-Agnostic must be selected alone.

- [ ] **Step 6: Remove the canonical exclusivity check**

Delete only this conditional from `scripts/catalog/validate.mjs`:

```js
if (
  record.model_families?.includes("model-agnostic") &&
  record.model_families.length > 1
) {
  errors.push(
    `${id}: model-agnostic cannot be combined with named model families`,
  );
}
```

Retain unknown-ID validation and schema uniqueness.

- [ ] **Step 7: Remove the manifest exclusivity check**

Delete only this conditional from `src/features/submissions/project-submission-manifest.mjs`:

```js
if (
  modelFamilies.includes("model-agnostic") &&
  (modelFamilies.length > 1 || otherModelFamilies.length > 0)
) {
  errors.push(
    "Model-Agnostic cannot be combined with another model family.",
  );
}
```

Retain required selections, unknown-ID validation, case-insensitive unlisted-family deduplication, and the 60-character limit.

- [ ] **Step 8: Make every builder selection independent**

Replace `toggleModelFamily` in `src/features/submissions/components/project-submission-builder.tsx` with:

```ts
function toggleModelFamily(id: string) {
  setModelFamilies((current) =>
    current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id],
  );
}
```

In the `Other model family` checkbox handler, remove the branch that filters
`model-agnostic` out of `modelFamilies`. Keep clearing `otherModelFamily` when
the checkbox is disabled.

Replace the helper paragraph:

```tsx
<p>
  Select Model-Agnostic for broad usability, plus every model family this
  Preset is tested with or recommended for.
</p>
```

- [ ] **Step 9: Update the GitHub fallback copy**

In `.github/ISSUE_TEMPLATE/01-project-submission.yml`, replace the
`supported-model-families` description with:

```yaml
description: System Presets only. Model-Agnostic may be combined with tested or recommended families.
```

Do not change field IDs or options, so parsing remains backward compatible.

- [ ] **Step 10: Run the focused tests**

Run:

```powershell
npm.cmd test -- tests/unit/validate-catalog.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/project-submission-builder.test.tsx tests/unit/issue-forms.test.ts
```

Expected: PASS.

- [ ] **Step 11: Search for stale executable exclusivity rules**

Run:

```powershell
rg -n -i "model-agnostic.*(cannot|must be selected alone)|cannot be combined with.*model family" src scripts .github tests
```

Expected: no matches. Historical design/plan documents are intentionally outside this search and must not be rewritten.

- [ ] **Step 12: Commit boundary and submission changes**

```powershell
git add -- scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts src/features/submissions/project-submission-manifest.mjs tests/unit/project-submission-manifest.test.ts src/features/submissions/components/project-submission-builder.tsx tests/unit/project-submission-builder.test.tsx .github/ISSUE_TEMPLATE/01-project-submission.yml tests/unit/issue-forms.test.ts
git commit -m "feat: allow agnostic model recommendations"
```

---

### Task 3: Migrate Wandlight and Rebuild the Catalog

**Files:**
- Modify: `tests/unit/full-catalog-data.test.ts`
- Modify: `data/registry/projects/mentallyquill-st-wandlight.json`
- Verify: `src/generated/catalog.json` (generated and ignored)
- Modify: `tests/e2e/catalog.spec.ts`

**Interfaces:**
- Consumes: canonical Wandlight registry record and `npm.cmd run catalog:build`
- Produces: generated Wandlight `preset.modelFamilies` metadata and browser-visible chips for `model-agnostic`, `claude`, `glm`, and `deepseek`

- [ ] **Step 1: Extend the full-catalog record type and write the failing Wandlight assertion**

Add this optional property to `CatalogRecord` in
`tests/unit/full-catalog-data.test.ts`:

```ts
model_families?: string[];
```

Inside `expectCatalogContract`, add:

```ts
expect(
  records.find((record) => record.id === "mentallyquill-st-wandlight")
    ?.model_families,
).toEqual(["model-agnostic", "claude", "glm", "deepseek"]);
```

- [ ] **Step 2: Update browser expectations to exact Claude tags and visible Wandlight metadata**

In `tests/e2e/catalog.spec.ts`, change `claudePresetCount` to:

```ts
const claudePresetCount = catalog.projects.filter(
  ({ kind, preset }) =>
    kind === "preset" &&
    (preset?.modelFamilies.some(({ id }) => id === "claude") ?? false),
).length;
```

In the model-filtering test, assert the Claude facet count uses exact tags:

```ts
await expect(
  presetModelGroup.getByLabel("Claude", { exact: true }).closest("label"),
).toHaveTextContent(`Claude${claudePresetCount}`);
```

After asserting Wandlight is visible, add:

```ts
const wandlightCard = page.getByRole("link", {
  name: "Wandlight",
  exact: true,
});
for (const label of ["Model-Agnostic", "Claude", "GLM", "DeepSeek"]) {
  await expect(wandlightCard.getByText(label, { exact: true })).toBeVisible();
}
await expect(wandlightCard).toHaveAccessibleDescription(
  /Supported model families: Model-Agnostic, Claude, GLM, DeepSeek\./u,
);
```

- [ ] **Step 3: Run the data test to verify Wandlight has not been migrated**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts
```

Expected: FAIL with Wandlight's actual model-family array equal to only `["model-agnostic"]`.

- [ ] **Step 4: Update the canonical Wandlight record**

In `data/registry/projects/mentallyquill-st-wandlight.json`, replace:

```json
"model_families": ["model-agnostic"]
```

with:

```json
"model_families": ["model-agnostic", "claude", "glm", "deepseek"]
```

Do not modify any other Preset record.

- [ ] **Step 5: Validate and rebuild deterministic catalog output**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd run catalog:build
```

Expected: both commands exit 0; the generated catalog changes only where
Wandlight metadata, searchable text, and derived Kit model-family unions
require it.

- [ ] **Step 6: Inspect canonical and generated scope**

Run:

```powershell
git diff -- data/registry/projects/mentallyquill-st-wandlight.json
Select-String -Path src/generated/catalog.json -Pattern '"id": "mentallyquill-st-wandlight"' -Context 0,70
```

Expected: the registry diff contains exactly the four approved IDs. Generated
changes contain Wandlight's four labels/aliases and any Kit unions derived from
Wandlight; no unrelated project metadata changes. `src/generated/catalog.json`
remains ignored and is not staged.

- [ ] **Step 7: Run catalog and browser coverage**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts tests/unit/build-catalog.test.ts
node scripts/run-playwright.mjs tests/e2e/catalog.spec.ts
```

Expected: PASS, including exact Claude counts, shareable query reload, Wandlight
visibility, all four Wandlight chips, and the derived Kit result.

- [ ] **Step 8: Commit the Wandlight migration**

```powershell
git add -- data/registry/projects/mentallyquill-st-wandlight.json tests/unit/full-catalog-data.test.ts tests/e2e/catalog.spec.ts
git commit -m "data: add Wandlight model recommendations"
```

---

### Task 4: Run the Full Verification Gate

**Files:**
- Verify only; modify earlier task files only if a failing check exposes a defect in this feature

**Interfaces:**
- Consumes: all three implementation commits
- Produces: repository-wide evidence that exact matching, submissions, catalog data, static export, and browser behavior agree

- [ ] **Step 1: Run formatting and static checks**

Run:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
```

Expected: all PASS.

- [ ] **Step 2: Run catalog validation and all unit tests**

Run:

```powershell
npm.cmd run catalog:validate
npm.cmd test
```

Expected: all PASS.

- [ ] **Step 3: Build and verify the static export**

Run:

```powershell
npm.cmd run build
npm.cmd run verify:export
```

Expected: both PASS with a valid static export.

- [ ] **Step 4: Run affected catalog browser coverage**

Run:

```powershell
node scripts/run-playwright.mjs tests/e2e/catalog.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Confirm scope and clean staging state**

Run:

```powershell
git status --short
git log -4 --oneline
```

Expected: only pre-existing unrelated untracked files remain. The recent
history contains the exact-matching, submission-boundary, Wandlight-data, and
design commits; no feature files remain modified or staged.

- [ ] **Step 6: Commit any verification-only correction**

Skip this step when Step 5 is clean. If a verification failure required an
in-scope correction, stage only its named files and commit:

```powershell
git add -- src/features/catalog/preset-compatibility.ts tests/unit/preset-compatibility.test.ts tests/unit/catalog-selectors.test.ts tests/unit/kit-selectors.test.ts scripts/catalog/validate.mjs tests/unit/validate-catalog.test.ts src/features/submissions/project-submission-manifest.mjs tests/unit/project-submission-manifest.test.ts src/features/submissions/components/project-submission-builder.tsx tests/unit/project-submission-builder.test.tsx .github/ISSUE_TEMPLATE/01-project-submission.yml tests/unit/issue-forms.test.ts data/registry/projects/mentallyquill-st-wandlight.json tests/unit/full-catalog-data.test.ts tests/e2e/catalog.spec.ts
git commit -m "fix: complete model recommendation filtering"
```

Re-run the command that exposed the failure, then repeat Steps 1-5.
