# Owner Manual Metadata Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require verified owners to select manual authority before changing summaries or tags, and regenerate PR #234 with manual summary authority.

**Architecture:** `OwnerCardFields` receives immutable automatic summary/tag baselines from its parent, disables automatic controls, and restores the baseline whenever a policy returns to automatic. `normalizeProjectOwnerManifest` independently rejects changed automatic summary or tags on existing-card edits, so stale clients and hand-edited issue manifests cannot bypass the UI. The existing owner-request workflow remains the only writer for PR #234.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Node.js manifest normalization, GitHub Actions, GitHub CLI

## Global Constraints

- Summary and tag authority remain independent.
- Automatic values stay visible but read-only.
- Selecting manual unlocks the existing values for editing.
- Returning to automatic restores the original automatic values.
- A nonblank changed summary or changed tag selection cannot be submitted under automatic authority for `edit-card`.
- New-card automatic generation remains valid because no original catalog card exists.
- PR #234 changes summary authority to manual and leaves tag authority automatic.
- Do not change community-submission authority, enrichment prompts, or unrelated owner operations.

---

### Task 1: Lock automatic owner controls

**Files:**
- Modify: `src/features/catalog/components/tag-browser.tsx`
- Modify: `src/features/help/components/owner-card-fields.tsx`
- Modify: `src/features/help/components/project-owner-builder.tsx`
- Modify: `src/features/help/components/source-card-batch-editor.tsx`
- Test: `tests/unit/project-owner-builder.test.tsx`

**Interfaces:**
- `TagBrowser` consumes a new optional `disabled?: boolean` prop and disables its search, selected-tag removal buttons, tag chips, and facet disclosure buttons when true.
- `OwnerCardFields` consumes `automaticValues: Pick<OwnerCardDraft, "summary" | "tags">`.
- Project and batch builders supply automatic baselines from the selected catalog card; add-card tags are filtered to the draft's current kind before restoration.

- [ ] **Step 1: Replace the permissive owner-form regression test with failing lock/unlock tests**

  In `tests/unit/project-owner-builder.test.tsx`, replace `keeps automatic metadata policies while editing proposal context` with tests that assert:

  ```tsx
  expect(screen.getByRole("textbox", { name: /^Summary$/u })).toBeDisabled();
  expect(screen.getByLabelText("Tag search")).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "Creative writing" })).toBeDisabled();

  await user.selectOptions(screen.getByLabelText("Summary policy"), "manual");
  expect(screen.getByRole("textbox", { name: /^Summary$/u })).toBeEnabled();
  expect(screen.getByRole("textbox", { name: /^Summary$/u })).toHaveValue(
    "Alpha helps automate workflows.",
  );

  await user.selectOptions(screen.getByLabelText("Tag policy"), "manual");
  expect(screen.getByLabelText("Tag search")).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: "Creative writing" })).toBeEnabled();
  ```

  Add a second test that edits both manual fields, switches each policy back to automatic, and expects the original summary/tags to be restored and disabled. Keep the existing independent-manual-policy handoff test and extend it to assert the edited manual values in the generated manifest.

- [ ] **Step 2: Run the focused component test and verify RED**

  Run:

  ```powershell
  npm.cmd test -- --run tests/unit/project-owner-builder.test.tsx
  ```

  Expected: FAIL because automatic summary and tag controls are currently enabled and automatic restoration is absent.

- [ ] **Step 3: Add disabled support to `TagBrowser`**

  Add `disabled = false` to the component props and propagate it:

  ```tsx
  disabled={disabled}
  ```

  on the search, selected-tag removal buttons, and disclosure buttons. Compute chip state as:

  ```tsx
  const isDisabled = disabled || (!isSelected && atLimit);
  ```

- [ ] **Step 4: Lock and restore owner fields by policy**

  Add the baseline prop to `OwnerCardFields`:

  ```ts
  automaticValues: Pick<OwnerCardDraft, "summary" | "tags">;
  ```

  Set `disabled={card.metadata.summary.mode === "automatic"}` on `HelpTextArea` and `disabled={card.metadata.tags.mode === "automatic"}` on `TagBrowser`. When a policy select changes to automatic, update the policy and restore the baseline value in the same `onChange` call. For tags, filter `automaticValues.tags` through the current kind's applicable tag IDs before restoring.

  Supply baselines from `selected.editable` in `ProjectOwnerBuilder` and from `sourceCard.editable` in `SourceCardBatchEditor`:

  ```tsx
  automaticValues={{
    summary: selected.editable.summary,
    tags: selected.editable.tags,
  }}
  ```

- [ ] **Step 5: Run the component test and verify GREEN**

  Run:

  ```powershell
  npm.cmd test -- --run tests/unit/project-owner-builder.test.tsx
  ```

  Expected: 19 or more tests pass with zero failures and no React warnings.

- [ ] **Step 6: Commit the UI behavior**

  ```powershell
  git add src/features/catalog/components/tag-browser.tsx src/features/help/components/owner-card-fields.tsx src/features/help/components/project-owner-builder.tsx src/features/help/components/source-card-batch-editor.tsx tests/unit/project-owner-builder.test.tsx
  git commit -m "fix(owner): gate metadata edits by policy"
  ```

### Task 2: Reject changed automatic edit manifests

**Files:**
- Modify: `src/features/help/project-owner-manifest.mjs`
- Test: `tests/unit/project-owner-manifest.test.ts`
- Test: `tests/unit/triage-project-owner-request.test.ts`

**Interfaces:**
- `normalizeEdit(value, vocabularies, errors)` compares normalized proposed summary/tags against normalized original values after field validation.
- It adds independent, user-facing errors without changing the normalized manifest shape.

- [ ] **Step 1: Write failing manifest invariant tests**

  Replace `accepts a blank automatic summary proposal` with three tests:

  ```ts
  test("rejects a changed summary under automatic authority", () => {
    const result = normalizeProjectOwnerManifest(
      editFixture({
        summary: "A changed owner summary.",
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
      }),
      vocabularies,
    );
    expect(result).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "Select manual summary policy before changing the owner summary.",
      ]),
    });
  });
  ```

  Add the equivalent changed-tags test with:

  ```ts
  "Select manual tag policy before changing owner tags."
  ```

  Add an unchanged-summary-and-tags automatic test that remains valid. Retain the existing blank-manual-summary failure and add/adjust a triage test proving the manifest error is surfaced before authority or generation work.

- [ ] **Step 2: Run focused manifest and triage tests and verify RED**

  Run:

  ```powershell
  npm.cmd test -- --run tests/unit/project-owner-manifest.test.ts tests/unit/triage-project-owner-request.test.ts
  ```

  Expected: FAIL because `normalizeEdit` currently permits changed automatic metadata.

- [ ] **Step 3: Implement independent edit invariants**

  After normalizing `original` and `proposed` in `normalizeEdit`, compare summary directly and tags as order-insensitive sets using the already sorted `comparableEditable` representation:

  ```js
  const comparableOriginal = comparableEditable(originalEditable);
  const comparableProposed = comparableEditable(proposed);

  if (
    proposed.metadata.summary.mode === "automatic" &&
    comparableOriginal.summary !== comparableProposed.summary
  ) {
    errors.push(
      "Select manual summary policy before changing the owner summary.",
    );
  }
  if (
    proposed.metadata.tags.mode === "automatic" &&
    JSON.stringify(comparableOriginal.tags) !==
      JSON.stringify(comparableProposed.tags)
  ) {
    errors.push("Select manual tag policy before changing owner tags.");
  }
  ```

  Reuse the comparable values for the existing no-op edit check.

- [ ] **Step 4: Run focused manifest, triage, apply, and generation tests and verify GREEN**

  Run:

  ```powershell
  npm.cmd test -- --run tests/unit/project-owner-manifest.test.ts tests/unit/triage-project-owner-request.test.ts tests/unit/apply-project-owner-request.test.ts tests/unit/generate-project-owner-request.test.ts
  ```

  Expected: all focused tests pass. Update only fixtures that intentionally exercise automatic generation; do not weaken the edit invariant.

- [ ] **Step 5: Commit the manifest contract**

  ```powershell
  git add src/features/help/project-owner-manifest.mjs tests/unit/project-owner-manifest.test.ts tests/unit/triage-project-owner-request.test.ts
  git commit -m "fix(owner): reject automatic metadata edits"
  ```

### Task 3: Correct and regenerate PR #234

**Files:**
- External update: GitHub issue `MentallyQuill/Tavernary#233`
- External verification: GitHub pull request `MentallyQuill/Tavernary#234`

**Interfaces:**
- Issue field `Owner request manifest` is the authoritative workflow input.
- `.github/workflows/generate-project-owner-request.yml` accepts `issue_number=233` on `main` and updates the existing automation branch/PR.

- [ ] **Step 1: Re-read live issue and PR state**

  Run with authenticated network access:

  ```powershell
  gh auth status
  gh issue view 233 --repo MentallyQuill/Tavernary --json body,state,labels,url
  gh pr view 234 --repo MentallyQuill/Tavernary --json state,headRefName,headRefOid,body,files,statusCheckRollup,url
  ```

  Confirm issue #233 still contains exactly one proposed summary mode set to automatic and proposed tags remain unchanged from original.

- [ ] **Step 2: Update only proposed summary authority**

  Use `gh api` to replace the exact `proposed.metadata.summary.mode` occurrence with `manual`, preserving the original block and tag mode. Abort if the expected body structure or replacement count differs.

- [ ] **Step 3: Verify the authoritative issue manifest**

  Re-read issue #233 and parse the fenced JSON. Confirm:

  ```json
  {
    "proposed": {
      "summary": "All-in-one RP toolkit with World State, NPC Knowledge Tracker, Story Arc Planner, Session Chronicler and NPC Interiority. Helps AI remember, plan, and act consistently across long stories.",
      "metadata": {
        "summary": { "mode": "manual" },
        "tags": { "mode": "automatic" }
      }
    }
  }
  ```

- [ ] **Step 4: Dispatch and watch supported regeneration**

  Run:

  ```powershell
  gh workflow run generate-project-owner-request.yml --repo MentallyQuill/Tavernary --ref main -f issue_number=233
  gh run list --repo MentallyQuill/Tavernary --workflow generate-project-owner-request.yml --event workflow_dispatch --limit 3 --json databaseId,status,conclusion,createdAt,url,headSha
  gh run watch <run-id> --repo MentallyQuill/Tavernary --exit-status
  ```

  Expected: generation completes successfully and updates PR #234 rather than opening a duplicate.

- [ ] **Step 5: Verify PR transaction truth**

  Re-read PR #234, its diff, and its marker. Confirm the registry record contains `metadata_policy.summary.mode: manual`, `metadata_policy.tags.mode: automatic`, and the manual summary result. Confirm the PR `After` section agrees and required checks complete successfully.

### Task 4: Full verification and handoff

**Files:**
- Verify all changed code, tests, spec, and plan

**Interfaces:**
- The feature branch remains separate from automation PR #234.
- No unrelated generated catalog or dependency files are committed.

- [ ] **Step 1: Run formatting, lint, type, focused, and full test verification**

  Run:

  ```powershell
  npx.cmd prettier --check src/features/catalog/components/tag-browser.tsx src/features/help/components/owner-card-fields.tsx src/features/help/components/project-owner-builder.tsx src/features/help/components/source-card-batch-editor.tsx src/features/help/project-owner-manifest.mjs tests/unit/project-owner-builder.test.tsx tests/unit/project-owner-manifest.test.ts tests/unit/triage-project-owner-request.test.ts docs/superpowers/specs/2026-08-03-owner-manual-metadata-controls-design.md docs/superpowers/plans/2026-08-03-owner-manual-metadata-controls.md
  npm.cmd run lint
  npm.cmd run typecheck
  npm.cmd test
  git diff --check main...HEAD
  ```

  Expected: every command exits zero; the full test count is at least the 2,256-test baseline.

- [ ] **Step 2: Audit repository scope**

  Run:

  ```powershell
  git status --short
  git diff --stat main...HEAD
  git log --oneline main..HEAD
  ```

  Confirm only the design, plan, owner UI/manifest code, and focused tests changed.

- [ ] **Step 3: Report integration state**

  Report the feature branch and commits separately from PR #234's regenerated automation branch. Do not claim the form fix is deployed until its branch is explicitly merged and Pages deployment is verified.
