# Prefillable Project Submission Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every value collected by Tavernary appear in GitHub's project submission form without requiring contributors to repeat dropdown or checkbox selections.

**Architecture:** Keep the versioned JSON manifest as the machine-readable source of truth and make every readable GitHub field URL-prefillable. The transport serializes the complete manifest into text query parameters, the Issue Form replaces dropdowns and checkboxes with inputs or textareas, and fallback parsing accepts the new text representation while retaining old checkbox-markdown compatibility.

**Tech Stack:** TypeScript, JavaScript ES modules, GitHub Issue Forms YAML, Vitest, Playwright, GitHub CLI.

## Global Constraints

- Do not change the Tavernary submission builder's controls or vocabulary.
- Do not change the project submission manifest schema.
- Do not change admission, enrichment, review-PR, or publication behavior.
- The contributor must still review and create the GitHub issue manually.
- A valid non-empty embedded manifest remains authoritative.
- Invalid readable fallback values must fail validation; never guess or infer them.
- Preserve unrelated dirty-worktree changes.
- Use test-driven development: write each regression test and observe its expected failure before production edits.

## File Structure

- Modify `scripts/submissions/parse-project-submission.mjs`: parse the new newline/comma-delimited fallback fields, preserve old checkbox-body parsing, and reject invalid frontend-independent text.
- Modify `tests/unit/parse-project-submission.test.ts`: protect new fallback parsing, compatibility behavior, strict validation, and manifest precedence.
- Modify `src/features/submissions/submission-transport.ts`: serialize all readable fields and prioritize short identity/compatibility fields in oversized handoffs.
- Modify `tests/unit/project-submission-transport.test.ts`: protect complete query serialization, non-Preset omission, and oversized fallback priority.
- Modify `.github/ISSUE_TEMPLATE/01-project-submission.yml`: replace non-prefillable dropdowns and checkboxes with inputs and textareas using the same IDs and headings.
- Modify `tests/unit/issue-forms.test.ts`: protect the prefillable Issue Form contract.

---

### Task 1: Parse the all-text GitHub fallback contract

**Files:**

- Modify: `tests/unit/parse-project-submission.test.ts`
- Modify: `scripts/submissions/parse-project-submission.mjs`

**Interfaces:**

- Consumes: GitHub issue bodies with `###` headings and either legacy checkbox Markdown or newline/comma-delimited text.
- Produces: unchanged `parseProjectSubmissionIssue(body)` return values: `{ valid, source, manifest }` or `{ valid: false, source, errors }`.

- [ ] **Step 1: Write failing text-fallback tests**

Add tests that independently specify the new visible-body contract:

```ts
test("parses text Preset compatibility fields into manifest version 2", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
System Preset
### Project URL
https://github.com/Owner/Preset
### Project Name
Example
### Supported frontends
SillyTavern
### Frontend-independent
No
### Supported model families
claude
gemini
### Other model family
FutureModel
### Completion formats
chat-completion, text-completion
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: true,
    source: "headings",
    manifest: {
      schema_version: 2,
      project_type: "preset",
      frontend_independent: false,
      preset_compatibility: {
        model_families: {
          known_ids: ["claude", "gemini"],
          other: ["FutureModel"],
        },
        completion_formats: ["chat-completion", "text-completion"],
      },
    },
  });
});

test("rejects invalid frontend-independent fallback text", () => {
  expect(
    parseProjectSubmissionIssue(`
### Project Type
Frontend
### Project URL
https://github.com/Owner/Frontend
### Frontend-independent
Sometimes
### Project manifest
_No response_
`),
  ).toEqual({
    valid: false,
    source: "headings",
    errors: ["Frontend-independent must be Yes or No."],
  });
});

test("rejects unknown text compatibility values", () => {
  const result = parseProjectSubmissionIssue(`
### Project Type
System Preset
### Project URL
https://github.com/Owner/Preset
### Frontend-independent
No
### Supported model families
claude
unknown-family
### Completion formats
chat-completion
unknown-format
### Project manifest
_No response_
`);

  expect(result).toMatchObject({
    valid: false,
    source: "headings",
    errors: expect.arrayContaining([
      "Unknown model family: unknown-family.",
      "Unknown completion format: unknown-format.",
    ]),
  });
});
```

Keep the existing legacy-checkbox test unchanged. It is the compatibility
proof for issues created before this change.

- [ ] **Step 2: Run the focused parser tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/parse-project-submission.test.ts
```

Expected: the new text compatibility test fails because `checkedIds()` ignores
plain text; the strict boolean test fails because every value except `Yes`
currently becomes `false`.

- [ ] **Step 3: Implement minimal dual-format parsing**

In `scripts/submissions/parse-project-submission.mjs`, replace the
checkbox-only ID path with helpers shaped as follows:

```js
function fieldValues(value) {
  const lines = value.split(/\r?\n/u);
  const hasCheckboxMarkup = lines.some((line) =>
    /^-\s+\[[ xX]\]\s+/u.test(line),
  );
  if (hasCheckboxMarkup) return checkedValues(value);
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function fieldIds(value, options) {
  const byLabel = new Map(
    options.flatMap((option) => [
      [option.id.toLocaleLowerCase(), option.id],
      [option.label.toLocaleLowerCase(), option.id],
    ]),
  );
  return fieldValues(value).map(
    (entry) => byLabel.get(entry.toLocaleLowerCase()) ?? entry,
  );
}
```

Use `fieldIds()` for both model families and completion formats. Preserving
unknown entries lets `normalizeProjectSubmissionManifest()` produce the
existing explicit unknown-ID errors instead of silently dropping bad input.

Before normalizing fallback headings, validate the required boolean text:

```js
const frontendIndependentValue = (
  fields.get("Frontend-independent") ?? ""
).trim();
if (!/^(?:yes|no)$/iu.test(frontendIndependentValue)) {
  return {
    valid: false,
    source: "headings",
    errors: ["Frontend-independent must be Yes or No."],
  };
}
```

Set `frontend_independent` from the validated value:

```js
frontend_independent: frontendIndependentValue.toLowerCase() === "yes",
```

- [ ] **Step 4: Run the focused parser tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/parse-project-submission.test.ts
```

Expected: all parser tests pass, including the existing checkbox-Markdown test
and embedded-manifest precedence tests.

- [ ] **Step 5: Commit the parser slice**

```powershell
git add -- scripts/submissions/parse-project-submission.mjs tests/unit/parse-project-submission.test.ts
git commit -m "fix(submissions): parse text fallback fields"
```

### Task 2: Serialize every builder value into the GitHub handoff

**Files:**

- Modify: `tests/unit/project-submission-transport.test.ts`
- Modify: `src/features/submissions/submission-transport.ts`

**Interfaces:**

- Consumes: `ProjectSubmissionManifest` version 1 or 2.
- Produces: unchanged `openProjectSubmission(formUrl, manifest): Promise<"prefilled" | "clipboard">`.
- Produces query keys: `project-type`, `project-url`, `project-name`, `project-description`, `supported-frontends`, `frontend-independent`, `additional-context`, `supported-model-families`, `other-model-family`, `completion-formats`, and `project-manifest`.

- [ ] **Step 1: Write failing complete-handoff tests**

Add a dedicated Preset fixture:

```ts
const presetManifest = {
  ...manifest,
  schema_version: 2 as const,
  project_type: "preset" as const,
  frontends: {
    known_ids: ["sillytavern", "lumiverse"],
    other: [],
  },
  preset_compatibility: {
    model_families: {
      known_ids: ["model-agnostic", "claude"],
      other: ["FutureModel"],
    },
    completion_formats: ["chat-completion", "text-completion"],
  },
};
```

Add these tests:

```ts
test("prefills every Preset compatibility field", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    presetManifest,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(Object.fromEntries(opened.searchParams)).toMatchObject({
    "project-type": "System Preset",
    "frontend-independent": "No",
    "supported-model-families": "model-agnostic\nclaude",
    "other-model-family": "FutureModel",
    "completion-formats": "chat-completion\ntext-completion",
  });
});

test("omits Preset-only fields for Extensions", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    manifest,
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.has("supported-model-families")).toBe(false);
  expect(opened.searchParams.has("other-model-family")).toBe(false);
  expect(opened.searchParams.has("completion-formats")).toBe(false);
});

test("keeps short identity and compatibility fields in oversized handoffs", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  await openProjectSubmission(
    "https://github.com/example/repo/issues/new",
    {
      ...presetManifest,
      description: "x".repeat(7_100),
      additional_context: "y".repeat(7_100),
    },
  );

  const opened = new URL(String(open.mock.calls[0]?.[0]));
  expect(opened.searchParams.get("project-type")).toBe("System Preset");
  expect(opened.searchParams.get("supported-model-families")).toBe(
    "model-agnostic\nclaude",
  );
  expect(opened.searchParams.get("completion-formats")).toBe(
    "chat-completion\ntext-completion",
  );
});
```

- [ ] **Step 2: Run the transport tests and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-transport.test.ts
```

Expected: the complete Preset handoff test fails because compatibility query
parameters do not exist. The non-Preset omission test should already pass and
acts as a constraint on the minimal implementation.

- [ ] **Step 3: Implement complete readable serialization**

In `src/features/submissions/submission-transport.ts`, order common prefills so
short identity fields precede optional long prose:

```ts
const prefills: Array<[string, string]> = [
  ["project-type", displayKind(manifest.project_type)],
  ["project-url", manifest.source_url],
  ["project-name", manifest.name ?? ""],
  ["frontend-independent", manifest.frontend_independent ? "Yes" : "No"],
];
```

For Presets, append compatibility before descriptive prose:

```ts
if (manifest.project_type === "preset") {
  const compatibility = manifest.preset_compatibility;
  prefills.push(
    [
      "supported-model-families",
      compatibility?.model_families.known_ids.join("\n") ?? "",
    ],
    [
      "other-model-family",
      compatibility?.model_families.other[0] ?? "",
    ],
    [
      "completion-formats",
      compatibility?.completion_formats.join("\n") ?? "",
    ],
  );
}
```

Append remaining readable fields in this order:

```ts
prefills.push(
  ["supported-frontends", readableFrontendSelection(manifest)],
  ["project-description", manifest.description ?? ""],
  ["additional-context", manifest.additional_context ?? ""],
);
return prefills;
```

Keep the manifest-first URL construction and clipboard fallback behavior
unchanged.

- [ ] **Step 4: Run transport and parser tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit the transport slice**

```powershell
git add -- src/features/submissions/submission-transport.ts tests/unit/project-submission-transport.test.ts
git commit -m "fix(submissions): prefill complete handoff"
```

### Task 3: Make the GitHub Issue Form entirely prefillable

**Files:**

- Modify: `tests/unit/issue-forms.test.ts`
- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml`

**Interfaces:**

- Consumes: the query keys emitted by `openProjectSubmission()`.
- Produces: an Issue Form whose builder-supplied controls are only `input` or `textarea` types with unchanged IDs and headings.

- [ ] **Step 1: Replace option assertions with failing control-contract assertions**

In `tests/unit/issue-forms.test.ts`, replace assertions on dropdown/checkbox
options with:

```ts
expect(fields.map((field: { type: string }) => field.type)).toEqual([
  "input",
  "input",
  "input",
  "textarea",
  "textarea",
  "input",
  "textarea",
  "textarea",
  "input",
  "textarea",
  "textarea",
]);
expect(fields[0].attributes.placeholder).toBe(
  "Frontend, Extension, or System Preset",
);
expect(fields[0].attributes.description).toContain(
  "Frontend, Extension, or System Preset",
);
expect(fields[0].validations.required).toBe(true);
expect(fields[5].attributes.placeholder).toBe("Yes or No");
expect(fields[5].validations.required).toBe(true);
expect(fields[7].attributes.description).toContain(
  "one canonical family ID per line",
);
expect(fields[9].attributes.description).toContain(
  "one canonical format ID per line",
);
```

Retain assertions for field order, headings, URL placeholder, external
metadata guidance, and optional Preset compatibility fields.

- [ ] **Step 2: Run the Issue Form test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts
```

Expected: the type list reports `dropdown` for Project Type and
Frontend-independent and `checkboxes` for both compatibility groups.

- [ ] **Step 3: Convert every non-prefillable Issue Form field**

In `.github/ISSUE_TEMPLATE/01-project-submission.yml`, change Project Type to:

```yaml
  - type: input
    id: project-type
    attributes:
      label: Project Type
      description: Enter Frontend, Extension, or System Preset.
      placeholder: Frontend, Extension, or System Preset
    validations:
      required: true
```

Change Frontend-independent to:

```yaml
  - type: input
    id: frontend-independent
    attributes:
      label: Frontend-independent
      description: Enter Yes only when a System Preset does not depend on a particular frontend; otherwise enter No.
      placeholder: Yes or No
    validations:
      required: true
```

Change Supported model families to:

```yaml
  - type: textarea
    id: supported-model-families
    attributes:
      label: Supported model families
      description: >-
        System Presets only. Enter one canonical family ID per line:
        model-agnostic, claude, gpt, gemini, gemma, deepseek, glm, minimax,
        mimo, kimi, qwen, llama, or mistral.
    validations:
      required: false
```

Change Completion formats to:

```yaml
  - type: textarea
    id: completion-formats
    attributes:
      label: Completion formats
      description: >-
        System Presets only. Enter one canonical format ID per line:
        chat-completion or text-completion.
    validations:
      required: false
```

Do not change field IDs, labels, order, manifest rendering, or unrelated Issue
Forms.

- [ ] **Step 4: Run all focused submission tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/triage-issue.test.ts
```

Expected: all focused submission tests pass.

- [ ] **Step 5: Format and re-run the focused tests**

Run:

```powershell
npx.cmd prettier --write .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/parse-project-submission.mjs src/features/submissions/submission-transport.ts tests/unit/issue-forms.test.ts tests/unit/parse-project-submission.test.ts tests/unit/project-submission-transport.test.ts
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/project-submission-transport.test.ts tests/unit/parse-project-submission.test.ts tests/unit/project-submission-manifest.test.ts tests/unit/triage-issue.test.ts
```

Expected: Prettier completes without errors and all focused tests pass again.

- [ ] **Step 6: Commit the Issue Form slice**

```powershell
git add -- .github/ISSUE_TEMPLATE/01-project-submission.yml tests/unit/issue-forms.test.ts
git commit -m "fix(submissions): make GitHub form prefillable"
```

### Task 4: Verify the integrated handoff

**Files:**

- Verify only; no planned production-file changes.

**Interfaces:**

- Consumes: the completed parser, transport, and Issue Form contract.
- Produces: local regression evidence and, after the Issue Form reaches the default branch, read-only live GitHub evidence.

- [ ] **Step 1: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
all Vitest suites, production build, and static export verification pass.

- [ ] **Step 2: Inspect the final scoped diff**

Run:

```powershell
git status --short
git diff HEAD~3 -- .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/parse-project-submission.mjs src/features/submissions/submission-transport.ts tests/unit/issue-forms.test.ts tests/unit/parse-project-submission.test.ts tests/unit/project-submission-transport.test.ts
git diff --check HEAD~3..HEAD
```

Expected: only the six scoped implementation/test files differ across the
three implementation commits; unrelated pre-existing worktree changes remain
unstaged and unmodified.

- [ ] **Step 3: Verify the deployed GitHub form after publication**

Use GitHub CLI to confirm the default branch contains the new Issue Form:

```powershell
gh api repos/MentallyQuill/Tavernary/contents/.github/ISSUE_TEMPLATE/01-project-submission.yml --jq '.content' |
  ForEach-Object { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($_)) }
```

Expected: `project-type` and `frontend-independent` are `input`; supported
model families and completion formats are `textarea`.

Then open one generated version-2 Preset handoff URL in the authenticated
browser without creating an issue. Read the rendered values and confirm:

```text
Project Type: System Preset
Frontend-independent: No
Supported model families:
model-agnostic
claude
Other model family: FutureModel
Completion formats:
chat-completion
text-completion
Project manifest: valid serialized version-2 manifest
```

If the implementation has not reached the default branch, report this live
proof as pending publication rather than claiming it passed. Do not submit a
test issue.

- [ ] **Step 4: Record completion evidence**

Report:

- focused test command and passing file/test counts;
- full `npm.cmd run check` result;
- implementation commit hashes;
- live GitHub form result or explicit pending-publication status; and
- confirmation that unrelated dirty-worktree files were preserved.
