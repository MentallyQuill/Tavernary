# Automatic Kit Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically publish valid Kit creates and edits while blocking a narrow Tavernary-owned set of severe slurs in Kit titles and descriptions in both the browser and GitHub workflows.

**Architecture:** Add one browser-safe severe-language policy and matcher to the Kit domain, so `validateKitDraft(...)` and `validateKitSubmission(...)` enforce identical rules. Keep admission, triage, and publication as separate GitHub Actions boundaries: valid triage dispatches the existing serialized publisher, which revalidates, applies idempotently, pushes `main`, requests exact-SHA Pages deployment, and only then labels and closes the issue.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 6, Node.js 24 ESM, Vitest 4, Testing Library, Playwright 1.61, GitHub Actions YAML, GitHub CLI.

## Global Constraints

- Preserve the static GitHub-native architecture; add no backend, account system, database, external moderation service, or runtime profanity dependency.
- Use one checked-in Tavernary-owned English policy shared by browser and GitHub validation.
- Block only unmistakable severe identity-based slurs; allow common profanity including `damn`, `ass`, and `shit`, general adult-content/anatomy terms, ordinary insults, and ambiguous terms.
- Normalize Unicode compatibility forms, combining marks, capitalization, documented basic number/symbol substitutions, and punctuation or whitespace inserted between letters.
- Do not use fuzzy edit distance or arbitrary substring matching.
- Never echo the matched blocked term in user-facing validation.
- Keep all current identity, blocked-user, ownership, withdrawal, project, composition, length, markup/link, and exact-duplicate checks.
- Keep near-duplicate Kit composition as a non-blocking warning.
- Only a successful registry push and accepted exact-SHA Pages dispatch constitute publication; post-publication label and issue-closure failures are warnings.
- Preserve unrelated worktree changes and do not create or switch branches without explicit user approval.
- The authority is `docs/superpowers/specs/2026-07-26-automatic-kit-publication-design.md`.

## File Structure

- `src/features/kits/severe-language-policy.mjs`: canonical severe-term data,
  normalization, compiled matching, and the public boolean matcher.
- `src/features/kits/severe-language-policy.d.mts`: typed ESM surface for browser
  and Node consumers.
- `src/features/kits/kit-domain.mjs`: adds field-specific policy errors to the
  existing Kit validation result.
- `src/features/kits/components/kit-builder.tsx`: maps policy errors to the
  existing title/description accessible error regions and focus order.
- `scripts/submissions/validate-kit-submission.mjs`: continues to reuse
  `validateKitDraft(...)`, giving GitHub triage and publication the same policy.
- `scripts/submissions/triage-kit-issue.mjs`: changes valid-state labeling and
  emits publication outputs.
- `.github/workflows/triage-kit-submission.yml`: dispatches publication from a
  valid triage output with write-free registry permissions.
- `scripts/kits/apply-submission.mjs`: makes unchanged edit application
  idempotent.
- `.github/workflows/apply-kit-submission.yml`: closes the issue only after the
  exact-SHA deployment dispatch, with warning-only bookkeeping failures.
- Existing Kit contributor and operations documents: describe the automatic
  path, severe-language gate, correction flow, and recovery boundary.

---

### Task 1: Shared Severe-Language Policy and Kit-Domain Validation

**Files:**
- Create: `src/features/kits/severe-language-policy.mjs`
- Create: `src/features/kits/severe-language-policy.d.mts`
- Create: `tests/unit/severe-language-policy.test.ts`
- Modify: `src/features/kits/kit-domain.mjs`
- Test: `tests/unit/kit-domain.test.ts`

**Interfaces:**
- Consumes: plain Kit title/description strings.
- Produces:
  `containsDisallowedKitLanguage(value: string): boolean`.
- Produces these exact `validateKitDraft(...)` errors:
  `Title contains language Tavernary doesn't allow.` and
  `Description contains language Tavernary doesn't allow.`

- [ ] **Step 1: Write matcher tests that define the narrow policy**

Create `tests/unit/severe-language-policy.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  containsDisallowedKitLanguage,
  severeLanguageTerms,
} from "@/features/kits/severe-language-policy.mjs";

describe("Kit severe-language policy", () => {
  test.each(["nigger", "kike", "faggot", "tranny", "retard"])(
    "blocks representative severe term %s",
    (term) => {
      expect(containsDisallowedKitLanguage(`A ${term} Kit`)).toBe(true);
    },
  );

  test.each([
    "NIGGER",
    "n!i!g!g!e!r",
    "n i g g e r",
    "n1gg3r",
    "fa\u0301ggot",
  ])("blocks normalized disguise %s", (text) => {
    expect(containsDisallowedKitLanguage(text)).toBe(true);
  });

  test.each([
    "Damn Good Stories",
    "Badass Character Kit",
    "This shit actually works.",
    "Assassin toolkit",
    "Classic adult roleplay tools.",
    "Retardant material reference",
  ])("allows intentionally permitted text %s", (text) => {
    expect(containsDisallowedKitLanguage(text)).toBe(false);
  });

  test("keeps the policy explicit, unique, and normalized", () => {
    expect(severeLanguageTerms.length).toBeGreaterThan(0);
    expect(new Set(severeLanguageTerms).size).toBe(severeLanguageTerms.length);
    expect(severeLanguageTerms).toEqual(
      [...severeLanguageTerms].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    expect(
      severeLanguageTerms.every((term) => /^[a-z]+$/u.test(term)),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the matcher test and verify the missing module failure**

Run:

```powershell
npx.cmd vitest run tests/unit/severe-language-policy.test.ts
```

Expected: FAIL because
`src/features/kits/severe-language-policy.mjs` does not exist.

- [ ] **Step 3: Implement the explicit policy and normalization matcher**

Create `src/features/kits/severe-language-policy.mjs` with the reviewed initial
policy. Keep plural and alternate forms explicit so the matcher never needs
stemming:

```js
export const severeLanguageTerms = Object.freeze([
  "chink",
  "chinks",
  "coon",
  "coons",
  "dyke",
  "dykes",
  "fag",
  "faggot",
  "faggots",
  "fags",
  "gook",
  "gooks",
  "kike",
  "kikes",
  "mongoloid",
  "nigga",
  "niggas",
  "nigger",
  "niggers",
  "paki",
  "pakis",
  "raghead",
  "ragheads",
  "retard",
  "retards",
  "shemale",
  "shemales",
  "spic",
  "spics",
  "trannies",
  "tranny",
  "towelhead",
  "towelheads",
  "wetback",
  "wetbacks",
]);

const substitutions = Object.freeze({
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
});

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizeForPolicy(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[013457@$]/gu, (character) => substitutions[character]);
}

const separator = String.raw`[\p{P}\p{S}\s_]*`;
const termPatterns = severeLanguageTerms.map((term) => {
  const body = [...term].map(escapePattern).join(separator);
  return new RegExp(
    String.raw`(?<![\p{L}\p{N}])${body}(?![\p{L}\p{N}])`,
    "u",
  );
});

export function containsDisallowedKitLanguage(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const normalized = normalizeForPolicy(value);
  return termPatterns.some((pattern) => pattern.test(normalized));
}
```

Create `src/features/kits/severe-language-policy.d.mts`:

```ts
export const severeLanguageTerms: readonly string[];
export function containsDisallowedKitLanguage(value: string): boolean;
```

Do not export the normalizer or compiled expressions. The boolean matcher is the
only policy decision interface.

- [ ] **Step 4: Run the matcher tests and fix only matcher defects**

Run:

```powershell
npx.cmd vitest run tests/unit/severe-language-policy.test.ts
```

Expected: PASS. If `n!i!g!g!e!r` fails, inspect the normalized text and compiled
separator expression; do not add fuzzy matching.

- [ ] **Step 5: Add failing Kit-domain tests for both public text fields**

Append to `tests/unit/kit-domain.test.ts`:

```ts
test("rejects severe language in title and description", () => {
  const titleResult = validateKitDraft(
    {
      operation: "create",
      kitId: null,
      title: "N1gg3r Story Kit",
      description: "A compact story stack.",
      projectIds: ["frontend", "memory", "preset"],
    },
    projects,
  );
  const descriptionResult = validateKitDraft(
    {
      operation: "create",
      kitId: null,
      title: "Story Kit",
      description: "A f.a.g.g.o.t story stack.",
      projectIds: ["frontend", "memory", "preset"],
    },
    projects,
  );

  expect(titleResult.errors).toContain(
    "Title contains language Tavernary doesn't allow.",
  );
  expect(descriptionResult.errors).toContain(
    "Description contains language Tavernary doesn't allow.",
  );
});

test.each(["Damn Good Kit", "Badass Kit", "This shit works."])(
  "allows common profanity in Kit text: %s",
  (text) => {
    expect(
      validateKitDraft(
        {
          operation: "create",
          kitId: null,
          title: text,
          description: text,
          projectIds: ["frontend", "memory", "preset"],
        },
        projects,
      ).errors,
    ).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("language Tavernary doesn't allow"),
      ]),
    );
  },
);
```

- [ ] **Step 6: Run the Kit-domain tests and verify the new cases fail**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-domain.test.ts
```

Expected: FAIL because `validateKitDraft(...)` does not yet call the matcher.

- [ ] **Step 7: Add the shared policy errors to `validateKitDraft(...)`**

At the top of `src/features/kits/kit-domain.mjs`, import:

```js
import { containsDisallowedKitLanguage } from "./severe-language-policy.mjs";
```

After length checks and before composition checks, add:

```js
if (containsDisallowedKitLanguage(title)) {
  errors.push("Title contains language Tavernary doesn't allow.");
}
if (containsDisallowedKitLanguage(draft.description)) {
  errors.push("Description contains language Tavernary doesn't allow.");
}
```

Use the trimmed `title` already computed. Pass the complete description so
obfuscating with leading/trailing separators cannot change the decision.

- [ ] **Step 8: Run focused shared-policy and domain tests**

Run:

```powershell
npx.cmd vitest run tests/unit/severe-language-policy.test.ts tests/unit/kit-domain.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the shared policy boundary**

```powershell
git add -- src/features/kits/severe-language-policy.mjs src/features/kits/severe-language-policy.d.mts src/features/kits/kit-domain.mjs tests/unit/severe-language-policy.test.ts tests/unit/kit-domain.test.ts
git commit -m "feat(kits): add severe language policy"
```

---

### Task 2: Accessible Kit Builder Submission Blocking

**Files:**
- Modify: `src/features/kits/components/kit-builder.tsx`
- Test: `tests/unit/kit-builder.test.tsx`
- Test: `tests/kits-e2e/kits.spec.ts`

**Interfaces:**
- Consumes the exact Task 1 errors from `validateKitDraft(...)`.
- Produces field-level error rendering through the existing Title and
  Description `aria-describedby` regions.
- Preserves `onSubmit: () => void`; blocked text must prevent that callback.

- [ ] **Step 1: Write failing component tests for title and description policy errors**

Add a test beside
`"uses stable labels and reveals validation only after interaction"` in
`tests/unit/kit-builder.test.tsx`:

```tsx
test("blocks severe title and description text with field-level focus", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  const { rerender } = render(
    <KitBuilder
      draft={{ ...validDraft, title: "N1gg3r Story Kit" }}
      projects={projects}
      originalProjectIds={[]}
      onUpdate={() => undefined}
      onSubmit={onSubmit}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Submit Kit" }));
  const title = screen.getByRole("textbox", { name: "Title" });
  expect(title).toHaveFocus();
  expect(title).toHaveAttribute("aria-invalid", "true");
  expect(
    screen.getByText("Title contains language Tavernary doesn't allow."),
  ).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();

  rerender(
    <KitBuilder
      draft={{
        ...validDraft,
        title: "Story Kit",
        description: "A f.a.g.g.o.t story stack.",
      }}
      projects={projects}
      originalProjectIds={[]}
      onUpdate={() => undefined}
      onSubmit={onSubmit}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Submit Kit" }));
  const description = screen.getByRole("textbox", { name: "Description" });
  expect(description).toHaveFocus();
  expect(description).toHaveAttribute("aria-invalid", "true");
  expect(
    screen.getByText("Description contains language Tavernary doesn't allow."),
  ).toBeVisible();
  expect(onSubmit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the component test and verify field routing fails**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

Expected: FAIL because the builder currently recognizes only errors beginning
with `Title must` and `Description must`, so the policy errors are rendered as
composition errors and focus is not transferred.

- [ ] **Step 3: Generalize field-error classification without changing copy**

In `src/features/kits/components/kit-builder.tsx`, replace the exact
`startsWith("Title must")` and `startsWith("Description must")` checks with:

```ts
const titleError = errors.find((error) => error.startsWith("Title "));
const descriptionError = errors.find((error) =>
  error.startsWith("Description "),
);
```

Keep `compositionErrors`, touched state, submit-attempt state,
`aria-describedby`, `aria-invalid`, and the existing focus callback unchanged.
Do not disable the Submit button; its submit handler is the accessible error
reveal path.

- [ ] **Step 4: Run component tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-builder.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add a rendered browser regression proving GitHub never opens**

In `tests/kits-e2e/kits.spec.ts`, add a desktop test. Install this before the
first navigation:

```ts
await page.addInitScript(() => {
  Object.defineProperty(window, "open", {
    configurable: true,
    value: (...args: unknown[]) => {
      (window as Window & { __kitOpenCalls?: unknown[][] }).__kitOpenCalls ??=
        [];
      (
        window as Window & { __kitOpenCalls: unknown[][] }
      ).__kitOpenCalls.push(args);
      return null;
    },
  });
});
```

Fill Title with `N1gg3r Story Kit`, fill a valid Description, ensure the fixture
Kit has a valid project stack, click Submit Kit, then assert. Use the existing
`selectProject(...)` helper and this exact setup:

```ts
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(sitePath());
await selectProject(page, "Fixture Frontend");
await selectProject(page, "Fixture Tool 02");
await selectProject(page, "Fixture Tool 03");
await page.getByRole("button", { name: "Add 3 projects to Kit" }).click();
await page
  .getByRole("button", { name: /Open Kit Builder, 3 projects in draft/ })
  .click();
await page
  .getByLabel("Title", { exact: true })
  .fill("N1gg3r Story Kit");
await page
  .getByLabel("Description", { exact: true })
  .fill("A complete storytelling stack.");
await page.getByRole("button", { name: "Submit Kit" }).click();
```

Then assert:

```ts
await expect(
  page.getByText("Title contains language Tavernary doesn't allow."),
).toBeVisible();
await expect(page.getByLabel("Title", { exact: true })).toBeFocused();
expect(
  await page.evaluate(
    () =>
      (window as Window & { __kitOpenCalls?: unknown[][] }).__kitOpenCalls ??
      [],
  ),
).toEqual([]);
```

Do not create a second browser fixture.

- [ ] **Step 6: Build the Kit test export and run the focused browser test**

Run:

```powershell
npm.cmd run build:test-kits
node scripts/run-playwright.mjs --config playwright.kits.config.ts kits.spec.ts --grep "blocks severe"
```

Expected: PASS with no popup or GitHub navigation.

- [ ] **Step 7: Commit the browser behavior**

```powershell
git add -- src/features/kits/components/kit-builder.tsx tests/unit/kit-builder.test.tsx tests/kits-e2e/kits.spec.ts
git commit -m "feat(kits): block severe submission text"
```

---

### Task 3: Server Revalidation and Machine-Readable Triage Output

**Files:**
- Modify: `scripts/submissions/triage-kit-issue.mjs`
- Modify: `scripts/submissions/triage-kit-issue.d.mts`
- Test: `tests/unit/validate-kit-submission.test.ts`
- Test: `tests/unit/triage-issue.test.ts`

**Interfaces:**
- Consumes Task 1 `validateKitDraft(...)` transitively through
  `validateKitSubmission(...)`.
- Produces
  `kitTriageOutputs(validation, issue): { publish: string; issue_number: string }`.
- Produces GitHub Action outputs `publish=true|false` and `issue_number=<n>`.
- Valid state label becomes `kit-publication-ready`; invalid labels remain
  `needs-information` or `duplicate-candidate`.

- [ ] **Step 1: Add server-validator tests for severe text and common profanity**

Append to `tests/unit/validate-kit-submission.test.ts`:

```ts
test("rechecks severe language from the GitHub manifest", () => {
  expect(
    validate(
      JSON.stringify({
        ...JSON.parse(create),
        title: "N1gg3r Story Kit",
      }),
    ),
  ).toMatchObject({
    valid: false,
    labels: ["needs-information"],
    errors: expect.arrayContaining([
      "Title contains language Tavernary doesn't allow.",
    ]),
  });
  expect(
    validate(
      JSON.stringify({
        ...JSON.parse(create),
        description: "A f.a.g.g.o.t story stack.",
      }),
    ),
  ).toMatchObject({
    valid: false,
    errors: expect.arrayContaining([
      "Description contains language Tavernary doesn't allow.",
    ]),
  });
});

test.each(["Damn Good Kit", "Badass Kit", "This shit works."])(
  "keeps common profanity valid on GitHub: %s",
  (text) => {
    expect(
      validate(
        JSON.stringify({
          ...JSON.parse(create),
          title: text,
          description: text,
        }),
      ).valid,
    ).toBe(true);
  },
);
```

These should already pass once Task 1 is complete, proving the validator uses
the shared domain path rather than a second word list.

- [ ] **Step 2: Add failing triage-output and valid-label tests**

Import `kitTriageOutputs` in the Kit section of
`tests/unit/triage-issue.test.ts`, then add:

```ts
test("emits publication outputs only for a valid Kit", () => {
  const manifest = {
    operation: "create" as const,
    kit_id: null,
    title: "Story Kit",
    description: "A complete storytelling stack.",
    project_ids: ["frontend", "memory", "writer"],
  };
  expect(
    kitTriageOutputs(
      {
        valid: true,
        manifest,
        labels: ["kit-publication-ready"],
        errors: [],
        warnings: [],
      },
      { number: 241 },
    ),
  ).toEqual({ publish: "true", issue_number: "241" });
  expect(
    kitTriageOutputs(
      {
        valid: false,
        manifest: null,
        labels: ["needs-information"],
        errors: ["Title contains language Tavernary doesn't allow."],
        warnings: [],
      },
      { number: 241 },
    ),
  ).toEqual({ publish: "false", issue_number: "241" });
});
```

Update the existing successful Kit synchronization expectation from
`needs-maintainer-review` to `kit-publication-ready`. Add an assertion that the
successful validation comment says:

```text
Automated validation passes. Tavernary is publishing this Kit.
```

- [ ] **Step 3: Run the focused server tests and verify the output helper fails**

Run:

```powershell
npx.cmd vitest run tests/unit/validate-kit-submission.test.ts tests/unit/triage-issue.test.ts
```

Expected: FAIL on the missing `kitTriageOutputs` export and old valid-state
label/comment.

- [ ] **Step 4: Implement ready-state labeling and outputs**

In `scripts/submissions/triage-kit-issue.mjs`:

1. Replace `needs-maintainer-review` in `triageLabels` with:

```js
"kit-publication-ready": {
  color: "0e8a16",
  description: "Kit passed automation and is queued for publication.",
},
```

2. Change the valid comment lead to:

```js
"Automated validation passes. Tavernary is publishing this Kit.",
```

3. Export:

```js
export function kitTriageOutputs(validation, issue) {
  return {
    publish: String(validation.valid),
    issue_number: String(issue.number),
  };
}
```

4. At the end of `main()`, after `synchronizeKitSubmission(...)`, append the
outputs when `GITHUB_OUTPUT` exists:

```js
if (process.env.GITHUB_OUTPUT) {
  const outputs = kitTriageOutputs(validation, event.issue);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
}
```

Add `appendFile` to the existing `node:fs/promises` import.

In `scripts/submissions/validate-kit-submission.mjs`, change only the successful
label from `needs-maintainer-review` to `kit-publication-ready`; preserve
`duplicate-candidate` as the additional label for non-blocking near duplicates.

Update `scripts/submissions/triage-kit-issue.d.mts`:

```ts
export function kitTriageOutputs(
  validation: KitSubmissionValidation,
  issue: { number: number },
): { publish: string; issue_number: string };
```

- [ ] **Step 5: Run server tests**

Run:

```powershell
npx.cmd vitest run tests/unit/validate-kit-submission.test.ts tests/unit/triage-issue.test.ts
```

Expected: PASS, including near-duplicate validation with
`["kit-publication-ready", "duplicate-candidate"]`.

- [ ] **Step 6: Commit the server triage contract**

```powershell
git add -- scripts/submissions/triage-kit-issue.mjs scripts/submissions/triage-kit-issue.d.mts scripts/submissions/validate-kit-submission.mjs tests/unit/validate-kit-submission.test.ts tests/unit/triage-issue.test.ts
git commit -m "feat(kits): expose automatic publish decision"
```

---

### Task 4: Automatic Publication Workflow Dispatch

**Files:**
- Modify: `.github/workflows/triage-kit-submission.yml`
- Create: `tests/unit/kit-automatic-publication-workflow.test.ts`

**Interfaces:**
- Consumes Task 3 outputs
  `steps.triage.outputs.publish` and `steps.triage.outputs.issue_number`.
- Produces a `workflow_dispatch` request for `apply-kit-submission.yml` on
  `main`.
- Keeps the triage job registry-read-only: `contents: read`.

- [ ] **Step 1: Write the failing workflow contract test**

Create `tests/unit/kit-automatic-publication-workflow.test.ts`:

```ts
import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("valid Kit triage dispatches serialized publication automatically", async () => {
  const source = await readFile(
    ".github/workflows/triage-kit-submission.yml",
    "utf8",
  );
  const workflow = parse(source) as {
    permissions: Record<string, string>;
    jobs: {
      validate: {
        steps: Array<{
          id?: string;
          name?: string;
          if?: string;
          run?: string;
        }>;
      };
    };
  };

  expect(workflow.permissions.contents).toBe("read");
  expect(workflow.permissions.actions).toBe("write");
  const triage = workflow.jobs.validate.steps.find(
    (step) => step.name === "Validate and label Kit submission",
  );
  expect(triage?.id).toBe("triage");
  const publish = workflow.jobs.validate.steps.find(
    (step) => step.name === "Publish valid Kit",
  );
  expect(publish?.if).toContain(
    "steps.triage.outputs.publish == 'true'",
  );
  expect(publish?.run).toContain(
    "gh workflow run apply-kit-submission.yml",
  );
  expect(publish?.run).toContain("--ref main");
  expect(publish?.run).toContain(
    '-f issue_number="$ISSUE_NUMBER"',
  );
});
```

- [ ] **Step 2: Run the workflow test and verify it fails**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-automatic-publication-workflow.test.ts
```

Expected: FAIL because triage has no `actions: write`, no `triage` step ID, and
no publication dispatch step.

- [ ] **Step 3: Wire valid triage to the existing publisher**

In `.github/workflows/triage-kit-submission.yml`:

1. Add `actions: write` under top-level permissions, leaving `contents: read`.
2. Add `id: triage` to `Validate and label Kit submission`.
3. Add immediately after validation:

```yaml
      - name: Publish valid Kit
        if: steps.triage.outputs.publish == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ISSUE_NUMBER: ${{ steps.triage.outputs.issue_number }}
        run: >
          gh workflow run apply-kit-submission.yml
          --ref main
          -f issue_number="$ISSUE_NUMBER"
```

Do not dispatch on labels alone. The machine-readable result from the same
validation run is authoritative.

- [ ] **Step 4: Run workflow and triage tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/validate-kit-submission.test.ts tests/unit/triage-issue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit automatic dispatch**

```powershell
git add -- .github/workflows/triage-kit-submission.yml tests/unit/kit-automatic-publication-workflow.test.ts
git commit -m "feat(kits): publish valid submissions automatically"
```

---

### Task 5: Idempotent Edit Retries and Post-Deployment Issue Closure

**Files:**
- Modify: `scripts/kits/apply-submission.mjs`
- Test: `tests/unit/apply-kit-submission.test.ts`
- Modify: `.github/workflows/apply-kit-submission.yml`
- Test: `tests/unit/kit-publication-workflow-hardening.test.ts`
- Test: `tests/unit/kit-workflow-git-recovery.test.ts`

**Interfaces:**
- Consumes the existing
  `applyKitSubmission({ manifest, issue, existingKit, now })`.
- Produces the original `existingKit` unchanged when an edit changes no
  canonical author-controlled field and the displayed login is unchanged.
- Produces warning-only `kit-published` label and completed issue closure after
  exact-SHA Pages dispatch.

- [ ] **Step 1: Write the failing unchanged-edit unit test**

Append to `tests/unit/apply-kit-submission.test.ts`:

```ts
test("treats an unchanged edit retry as a timestamp-preserving no-op", () => {
  const result = applyKitSubmission({
    manifest: {
      operation: "edit",
      kit_id: existing.id,
      title: existing.title,
      description: existing.description,
      project_ids: existing.project_ids,
    },
    issue,
    existingKit: existing,
    now,
  });

  expect(result).toBe(existing);
  expect(result.updated_at).toBe("2026-07-01T00:00:00.000Z");
});
```

- [ ] **Step 2: Run apply tests and verify the timestamp changes**

Run:

```powershell
npx.cmd vitest run tests/unit/apply-kit-submission.test.ts
```

Expected: FAIL because the edit path always returns a new record with
`updated_at: now`.

- [ ] **Step 3: Implement exact edit idempotence**

In the edit branch of `scripts/kits/apply-submission.mjs`, after ownership and
withdrawal checks, normalize the incoming author-controlled values once:

```js
const title = manifest.title.trim();
const description = manifest.description.trim();
const unchanged =
  existingKit.title === title &&
  existingKit.description === description &&
  existingKit.author.login === issue.user.login &&
  JSON.stringify(existingKit.project_ids) ===
    JSON.stringify(manifest.project_ids);
if (unchanged) return existingKit;
```

Use `title` and `description` in the changed return value. Project order is
canonical and therefore order changes are real edits.

- [ ] **Step 4: Run apply and recovery tests**

Run:

```powershell
npx.cmd vitest run tests/unit/apply-kit-submission.test.ts tests/unit/kit-workflow-git-recovery.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add a filesystem-level unchanged-edit recovery test**

In `tests/unit/kit-workflow-git-recovery.test.ts`, add a case modeled on the
existing create retry. Seed a published Kit, clone current `main`, call
`applyKitSubmission(...)` with an edit manifest identical to the seeded Kit,
write the returned record, and assert:

```ts
expect(git(rerun, "status", "--porcelain")).toBe("");
expect(retried.updated_at).toBe(published.updated_at);
```

This proves atomic serialization of an unchanged return does not create a
registry diff.

- [ ] **Step 6: Add failing publication-finalization workflow assertions**

Extend `tests/unit/kit-publication-workflow-hardening.test.ts`:

```ts
test("closes a published Kit issue only after exact-SHA deployment dispatch", async () => {
  const steps = await publicationSteps();
  const deploy = steps.findIndex(
    (step) => step.name === "Deploy updated catalog",
  );
  const finalize = steps.findIndex(
    (step) => step.name === "Finalize published issue",
  );

  expect(finalize).toBeGreaterThan(deploy);
  expect(steps[finalize]?.run).toContain(
    'gh issue close "${{ inputs.issue_number }}" --reason completed',
  );
  expect(steps[finalize]?.run).toContain(
    "::warning title=Kit publication bookkeeping::",
  );
});
```

Update the existing warning-only bookkeeping test to find
`Finalize published issue` rather than `Mark issue published`, and retain its
label assertions.

- [ ] **Step 7: Run the workflow hardening test and verify it fails**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: FAIL because the workflow does not close the issue and the step still
uses the old name.

- [ ] **Step 8: Finalize and close the issue after deployment dispatch**

In `.github/workflows/apply-kit-submission.yml`, rename
`Mark issue published` to `Finalize published issue`. Keep the label creation
and label application warning-only. After label application, add:

```bash
if ! gh issue close "${{ inputs.issue_number }}" --reason completed; then
  echo "::warning title=Kit publication bookkeeping::The Kit was published and deployment was requested, but issue #${{ inputs.issue_number }} could not be closed."
fi
```

Do not add `continue-on-error` to the deployment step. Do not close the issue
before deployment dispatch. The finalization shell block itself must return
success after emitting warnings.

- [ ] **Step 9: Run apply, recovery, and workflow tests**

Run:

```powershell
npx.cmd vitest run tests/unit/apply-kit-submission.test.ts tests/unit/kit-workflow-git-recovery.test.ts tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit retry and lifecycle hardening**

```powershell
git add -- scripts/kits/apply-submission.mjs .github/workflows/apply-kit-submission.yml tests/unit/apply-kit-submission.test.ts tests/unit/kit-workflow-git-recovery.test.ts tests/unit/kit-publication-workflow-hardening.test.ts
git commit -m "feat(kits): finalize automatic publication"
```

---

### Task 6: Contributor and Maintainer Documentation

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/05-kit-submission.yml`
- Modify: `docs/contributing/kits.md`
- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/maintenance/kits.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Test: `tests/unit/kit-maintenance-docs.test.ts`

**Interfaces:**
- Consumes the complete automatic workflow from Tasks 1-5.
- Produces one consistent public and maintainer description: valid Kits publish
  automatically; rejected issues remain open for correction; reports,
  withdrawals, and emergency safety repair remain separate.

- [ ] **Step 1: Write failing documentation contract tests**

Add to `tests/unit/kit-maintenance-docs.test.ts`:

```ts
test("documents automatic Kit publication and severe-language revalidation", async () => {
  const [form, contributorGuide, submissionFlow, maintenance, runbook] =
    await Promise.all([
      readFile(".github/ISSUE_TEMPLATE/05-kit-submission.yml", "utf8"),
      readFile("docs/contributing/kits.md", "utf8"),
      readFile("docs/contributing/submission-and-review.md", "utf8"),
      readFile("docs/maintenance/kits.md", "utf8"),
      readFile("docs/maintenance/operations-runbook.md", "utf8"),
    ]);
  const publicCopy = `${form}\n${contributorGuide}\n${submissionFlow}`;

  expect(publicCopy).toMatch(/publish(?:es|ed)? automatically/i);
  expect(publicCopy).toMatch(/title and (?:description|summary)/i);
  expect(publicCopy).toMatch(/severe language/i);
  expect(publicCopy).toMatch(/edit the issue/i);
  expect(publicCopy).not.toMatch(/Kit.*maintainer review/i);

  expect(maintenance).toContain("## Safety repair");
  expect(runbook).toContain("kit-publication-ready");
  expect(runbook).toContain("apply-kit-submission.yml");
  expect(runbook).toMatch(/closes the source issue/i);
  expect(runbook).toMatch(/exact.*SHA/i);
});
```

- [ ] **Step 2: Run the docs test and verify stale manual-review copy fails**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-maintenance-docs.test.ts
```

Expected: FAIL on missing automatic-publication and severe-language copy, plus
existing statements that Kit publication waits for maintainer review.

- [ ] **Step 3: Update the issue form and public contributor flow**

In `.github/ISSUE_TEMPLATE/05-kit-submission.yml`:

- Change the description to `Create a new Kit or submit an author revision for automatic validation and publication.`
- Replace the introductory Markdown with:

```text
Build a new Kit in Tavernary, or use **Edit Kit** on a published Kit, before submitting this form. Valid submissions publish automatically. Tavernary checks the title and description for severe language in the builder and rechecks the manifest here. If validation fails, edit this issue to correct it and automation will retry.
```

In `docs/contributing/kits.md`, replace pending-review language with the exact
sequence: builder validation, GitHub issue admission, server revalidation,
automatic publication, exact-SHA deployment request, and completed issue
closure. State that common profanity is not the target of the narrow severe
language policy and that the matched term is not echoed.

In the Kits section of `docs/contributing/submission-and-review.md`, replace the
maintainer-review bullets with:

```markdown
- Kit creates and author-owned edits use `05-kit-submission.yml`.
- `triage-kit-submission.yml` validates the latest manifest, including the same
  severe-language policy used by the Kit Builder.
- A valid issue dispatches `apply-kit-submission.yml` automatically. The
  publisher revalidates, writes the registry record, runs repository gates,
  pushes `main`, requests exact-SHA Pages deployment, and closes the issue.
- A correctable validation failure remains open. Edit the issue and automation
  reruns without consuming another issue slot.
```

Keep Project submission's PR and maintainer-review model distinct.

- [ ] **Step 4: Update maintainer operations without weakening safety repair**

In `docs/maintenance/kits.md`, describe normal Kit publication as automatic and
retain the existing `## Safety repair` section verbatim except for any opening
sentence that incorrectly says all normal edits wait for review.

In `docs/maintenance/operations-runbook.md`:

- Replace `needs-maintainer-review` in the Kit workflow with
  `kit-publication-ready`.
- Document that triage dispatches `apply-kit-submission.yml` on valid output.
- Document the publisher's second validation, global `kit-registry`
  concurrency, idempotent unchanged edits, exact-SHA deploy request, and
  completed issue closure.
- Document recovery: correct invalid issues by editing them; rerun a failed
  publisher; do not hand-edit generated registry artifacts.
- Preserve report and withdrawal procedures unchanged.

- [ ] **Step 5: Run documentation and workflow tests**

Run:

```powershell
npx.cmd vitest run tests/unit/kit-maintenance-docs.test.ts tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit documentation**

```powershell
git add -- .github/ISSUE_TEMPLATE/05-kit-submission.yml docs/contributing/kits.md docs/contributing/submission-and-review.md docs/maintenance/kits.md docs/maintenance/operations-runbook.md tests/unit/kit-maintenance-docs.test.ts
git commit -m "docs(kits): explain automatic publication"
```

---

### Task 7: Integrated Verification and Static Export Proof

**Files:**
- Modify only files identified by failures attributable to Tasks 1-6.
- Verify: all focused Kit tests, full repository gate, and rendered Kit browser
  flow.

**Interfaces:**
- Consumes all prior task deliverables.
- Produces fresh evidence that the shared policy, browser block, server
  revalidation, workflow dispatch, publication lifecycle, docs, and static
  export agree.

- [ ] **Step 1: Run the complete focused unit/workflow suite**

Run:

```powershell
npx.cmd vitest run tests/unit/severe-language-policy.test.ts tests/unit/kit-domain.test.ts tests/unit/kit-builder.test.tsx tests/unit/validate-kit-submission.test.ts tests/unit/triage-issue.test.ts tests/unit/kit-automatic-publication-workflow.test.ts tests/unit/apply-kit-submission.test.ts tests/unit/kit-workflow-git-recovery.test.ts tests/unit/kit-publication-workflow-hardening.test.ts tests/unit/kit-maintenance-docs.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the complete repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: PASS through Prettier, ESLint, palette audit, catalog validation,
catalog build, type checking, all Vitest tests, Next.js production build, and
static-export verification.

If this exposes a pre-existing failure, record its exact command and output
separately. Fix only failures caused by this feature.

- [ ] **Step 3: Rebuild and run the focused rendered Kit flow**

Run:

```powershell
npm.cmd run build:test-kits
node scripts/run-playwright.mjs --config playwright.kits.config.ts kits.spec.ts --grep "blocks severe"
```

Expected: PASS; field-level validation is visible, focus is correct, and
`window.open` has no calls.

- [ ] **Step 4: Run the complete Kit E2E suite**

Run:

```powershell
npm.cmd run test:kits-e2e
```

Expected: PASS with all Kit creation, editing, draft persistence, selection,
inspection, and submission behavior intact.

- [ ] **Step 5: Inspect final scope and repository state**

Run:

```powershell
git status --short
git diff --check
git log -8 --oneline
```

Expected: no uncommitted implementation files, no whitespace errors, and the
task commits present in order. Preserve any unrelated user-owned changes if the
worktree was not clean at execution start.

## Completion Checklist

- [ ] Browser and server import the same severe-language matcher and policy.
- [ ] Common profanity remains allowed and false-positive fixtures pass.
- [ ] Kit Builder blocks GitHub opening and focuses the correct field.
- [ ] GitHub-edited title/description receives the same policy check.
- [ ] Valid triage automatically dispatches the serialized publisher.
- [ ] Near duplicates warn but publish; exact duplicates remain blocked.
- [ ] Unchanged edit retries preserve `updated_at` and create no registry diff.
- [ ] Exact-SHA Pages dispatch precedes issue label and closure bookkeeping.
- [ ] Validation/publication failures keep the issue open.
- [ ] Reports, withdrawals, Projects, ranking, and enrichment are unchanged.
- [ ] Focused tests, `npm run check`, and complete Kit E2E all pass.
