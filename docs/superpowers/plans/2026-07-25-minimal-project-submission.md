# Minimal Project Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nine-input project-submission issue form with Project
Type, Project URL, and an optional Anything we should know? field while
preserving automated URL validation and triage.

**Architecture:** Keep GitHub Issue Forms as the intake surface and keep
`validateSubmission(...)` as the validation boundary. Change only the form
headings consumed by `parseIssueFields(...)`; the validator continues to
enforce HTTPS, GitHub repository shape by project type, and duplicate
detection.

**Tech Stack:** GitHub Issue Forms YAML, Node.js 24 ES modules, TypeScript 6,
Vitest 4, YAML 2.

## Global Constraints

- The form has exactly three submitted fields: `Project Type`, `Project URL`,
  and `Anything we should know?`.
- `Project Type` and `Project URL` are required.
- `Anything we should know?` is optional and does not affect validation.
- Display this exact explanation: `GitHub repository URL required for
  Extensions and Frontends, not for Presets.`
- Frontends and Extensions require an exact public
  `https://github.com/owner/repository` source.
- System Presets may use another stable public HTTPS page.
- The complete issue title is `[Project submission]`; submitters do not enter
  a project name.
- Do not add client-side URL validation that GitHub Issue Forms do not support.
- Preserve the existing `validateSubmission(...)` behavior and validation
  comments.
- Do not stage or modify unrelated worktree changes.

---

## File Structure

- `.github/ISSUE_TEMPLATE/01-project-submission.yml` — owns the visible
  three-field submission contract and its static title.
- `scripts/submissions/triage-issue.mjs` — maps submitted Markdown headings to
  the existing validator input.
- `tests/unit/issue-forms.test.ts` — locks the exact fields, labels,
  required/optional states, title, explanatory copy, and URL placeholder.
- `tests/unit/triage-issue.test.ts` — locks parsing of the renamed headings and
  proves the optional note cannot affect validation input.
- `docs/contributing/submission-and-review.md` — tells contributors which
  information they provide and which metadata maintainers derive.

No changes are required in `scripts/submissions/validate-submission.mjs`,
`scripts/submissions/validate-submission.d.mts`, or
`scripts/submissions/triage-issue.d.mts`: the runtime input and exported types
remain `{ kind: string; sourceUrl: string }`.

### Task 1: Ship the three-field project intake

**Files:**

- Modify: `.github/ISSUE_TEMPLATE/01-project-submission.yml:1-81`
- Modify: `scripts/submissions/triage-issue.mjs:24-40`
- Modify: `tests/unit/issue-forms.test.ts:110-143`
- Modify: `tests/unit/triage-issue.test.ts:12-27`
- Modify: `docs/contributing/submission-and-review.md:23-42`

**Interfaces:**

- Consumes:
  `validateSubmission({ kind, sourceUrl, existingSources }): SubmissionValidation`
- Produces:
  `parseIssueFields(body: string): { kind: string; sourceUrl: string }`
- The `Anything we should know?` response remains in the public issue body for
  human review and is intentionally absent from the parser return value.

- [ ] **Step 1: Replace the broad form assertion with a failing exact-contract test**

Replace the existing
`project submissions state the source rules and required acknowledgements`
test in `tests/unit/issue-forms.test.ts` with:

```ts
test("project submission is a minimal three-field intake", async () => {
  const submission = parse(
    await readFile(resolve(templateDirectory, "01-project-submission.yml"), "utf8"),
  );
  const fields = submission.body.filter((field: { id?: string }) => field.id);

  expect(submission.title).toBe("[Project submission]");
  expect(fields.map((field: { id: string }) => field.id)).toEqual([
    "project-type",
    "project-url",
    "additional-context",
  ]);
  expect(
    fields.map(
      (field: { attributes: { label: string } }) => field.attributes.label,
    ),
  ).toEqual(["Project Type", "Project URL", "Anything we should know?"]);
  expect(fields[0].attributes.options).toEqual([
    "Frontend",
    "Extension",
    "System Preset",
  ]);
  expect(fields[0].validations.required).toBe(true);
  expect(fields[1].validations.required).toBe(true);
  expect(fields[1].attributes.placeholder).toBe(
    "https://github.com/owner/repository",
  );
  expect(fields[2].validations?.required ?? false).toBe(false);
  expect(submission.body[0].attributes.value).toContain(
    "GitHub repository URL required for Extensions and Frontends, not for Presets.",
  );
});
```

- [ ] **Step 2: Rename the parser fixture and prove optional context is ignored**

Replace the first test in `tests/unit/triage-issue.test.ts` with:

```ts
test("parses only the minimal fields used by automated triage", () => {
  expect(
    parseIssueFields(`
### Project Type

Extension

### Project URL

https://github.com/MentallyQuill/Recursion

### Anything we should know?

This is an unusual installation.
`),
  ).toEqual({
    kind: "Extension",
    sourceUrl: "https://github.com/MentallyQuill/Recursion",
  });
});
```

- [ ] **Step 3: Run the focused tests and verify the new contract fails**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/triage-issue.test.ts
```

Expected: FAIL because the current form title, field IDs, labels, and parser
headings still use the broad intake contract.

- [ ] **Step 4: Replace the project-submission form with the minimal YAML**

Replace `.github/ISSUE_TEMPLATE/01-project-submission.yml` with:

```yaml
name: Submit a project
description: Propose a public AI roleplay project for maintainer review.
title: "[Project submission]"
labels:
  - project-submission
body:
  - type: markdown
    attributes:
      value: |
        GitHub repository URL required for Extensions and Frontends, not for Presets.
  - type: dropdown
    id: project-type
    attributes:
      label: Project Type
      options:
        - Frontend
        - Extension
        - System Preset
    validations:
      required: true
  - type: input
    id: project-url
    attributes:
      label: Project URL
      placeholder: https://github.com/owner/repository
    validations:
      required: true
  - type: textarea
    id: additional-context
    attributes:
      label: Anything we should know?
      description: Optional context that may help us review this project.
    validations:
      required: false
```

- [ ] **Step 5: Update the parser to consume the new headings**

Change only the returned field lookups in
`scripts/submissions/triage-issue.mjs`:

```js
  return {
    kind: fields.get("Project Type") ?? "",
    sourceUrl: fields.get("Project URL") ?? "",
  };
```

Do not parse `Anything we should know?`; the issue body already preserves it
for maintainers.

- [ ] **Step 6: Document the submitter/maintainer responsibility boundary**

Replace project steps 1 and 2 in
`docs/contributing/submission-and-review.md` with:

```markdown
1. The submitter provides the Project Type, Project URL, and any optional
   context. Automation checks URL validity, source eligibility, and obvious
   duplicates.
2. A maintainer derives and validates the catalog metadata:
   - Frontends and Extensions require a public GitHub repo.
   - System Presets may use another stable public HTTPS page.
   - `id`, `kind`, `summary`, `capabilities`, and `frontends` must be internally
     consistent.
```

- [ ] **Step 7: Run focused form, parser, and validator tests**

Run:

```powershell
npm.cmd test -- tests/unit/issue-forms.test.ts tests/unit/triage-issue.test.ts tests/unit/validate-submission.test.ts
```

Expected: PASS. The validator suite must still prove malformed or non-HTTPS
URLs receive `needs-information`, Frontends and Extensions require exact GitHub
repository paths, System Presets allow non-GitHub HTTPS pages, and duplicates
receive `duplicate-candidate`.

- [ ] **Step 8: Run repository verification**

Run:

```powershell
npm.cmd run check
```

Expected: PASS for formatting, lint, palette audit, catalog validation/build,
typecheck, unit tests, production build, and static-export verification. If an
unrelated dirty worktree change causes a failure, record the exact failing file
and rerun the focused submission tests to preserve scoped evidence.

- [ ] **Step 9: Review and commit only submission-related files**

Run:

```powershell
git diff --check -- .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/triage-issue.mjs tests/unit/issue-forms.test.ts tests/unit/triage-issue.test.ts docs/contributing/submission-and-review.md
git diff -- .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/triage-issue.mjs tests/unit/issue-forms.test.ts tests/unit/triage-issue.test.ts docs/contributing/submission-and-review.md
git add -- .github/ISSUE_TEMPLATE/01-project-submission.yml scripts/submissions/triage-issue.mjs tests/unit/issue-forms.test.ts tests/unit/triage-issue.test.ts docs/contributing/submission-and-review.md
git commit -m "feat(submissions): minimize project intake"
```

Expected: the commit contains exactly the five listed files and none of the
pre-existing unrelated worktree changes.
