# Project Submission Frontend Popularity Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort the Project Submit form's Supported frontends choices with the same shared frontend-card popularity contract used by the catalog filters.

**Architecture:** Keep catalog loading and option derivation in the server-rendered submission page. Load the catalog once, derive the existing submission option shape, and pass those options through `orderFrontendOptionsByPopularity` before rendering the unchanged client-side builder.

**Tech Stack:** TypeScript, React 19, Next.js 16 App Router, Vitest, Testing Library

## Global Constraints

- Reuse `orderFrontendOptionsByPopularity`; do not duplicate its comparator.
- Popularity comes only from matching `kind: "frontend"` cards and their `community.aggregate`.
- Scored options sort by descending aggregate; unscored options follow; ties resolve by label and ID.
- Search preserves the supplied order.
- Do not change selection order, manifest serialization, popularity calculations, validation, eligibility, or submission behavior.
- Do not display popularity values in the form.

---

## File Structure

- Modify `src/app/submit/project/page.tsx`: load the catalog once and order the derived submission frontend options with the shared helper.
- Modify `tests/unit/project-submission-builder.test.tsx`: add rendered page-level proof that the Supported frontends controls receive popularity order.

### Task 1: Reuse Frontend Popularity Ordering in Project Submit

**Files:**
- Modify: `src/app/submit/project/page.tsx`
- Test: `tests/unit/project-submission-builder.test.tsx`

**Interfaces:**
- Consumes: `orderFrontendOptionsByPopularity<T extends { id: string; label: string }>(options: readonly T[], projects: readonly CatalogProject[]): T[]`
- Produces: `ProjectSubmissionBuilder` receives `SubmissionFrontendOption[]` in shared popularity order.

- [ ] **Step 1: Write the failing rendered regression test**

Add the page import:

```tsx
import ProjectSubmissionPage from "@/app/submit/project/page";
```

Add this test after the cleanup hook:

```tsx
test("orders supported frontends by frontend-card popularity", async () => {
  const user = userEvent.setup();
  render(<ProjectSubmissionPage />);

  await user.selectOptions(screen.getByLabelText("Project Type"), "extension");

  const frontendChoices = screen.getAllByRole("checkbox");
  expect(frontendChoices[0]).toHaveAccessibleName("SillyTavern");
  expect(frontendChoices[1]).toHaveAccessibleName("Narrative Engine");
});
```

This renders the real server page, exposes Supported frontends by selecting
Extension, and asserts that the two highest-scored frontend identities precede
the form's previously alphabetical first choice.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-submission-builder.test.tsx
```

Expected: FAIL in `orders supported frontends by frontend-card popularity`
because the first checkbox is currently `Aikobots`, not `SillyTavern`.

- [ ] **Step 3: Apply the shared ordering helper**

In `src/app/submit/project/page.tsx`, add:

```tsx
import { orderFrontendOptionsByPopularity } from "@/features/catalog/frontend-option-order";
```

Inside `ProjectSubmissionPage`, load the catalog once and wrap the existing
option derivation:

```tsx
  const catalog = loadCatalog();
  const frontends: SubmissionFrontendOption[] =
    orderFrontendOptionsByPopularity(
      catalog.projects
        .filter((project) => project.kind === "frontend")
        .flatMap((project) => {
          const [selfCompatibility] = project.frontends;
          return selfCompatibility
            ? [
                {
                  id: selfCompatibility.id,
                  label: selfCompatibility.label,
                  canonicalUrl: project.canonicalUrl,
                },
              ]
            : [];
        }),
      catalog.projects,
    );
```

Remove the old alphabetical `.sort(...)`. Do not change
`ProjectSubmissionBuilder` or its props.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-submission-builder.test.tsx
```

Expected: PASS with the new rendered ordering test and all existing submission
builder tests green.

- [ ] **Step 5: Run relevant regression tests**

Run:

```powershell
npm.cmd test -- --run tests/unit/project-submission-builder.test.tsx tests/unit/frontend-option-order.test.ts tests/unit/frontend-filter-order.test.tsx
```

Expected: all tests PASS, proving the submission page and both existing filter
consumers retain the shared ordering contract.

- [ ] **Step 6: Run static and production verification**

Run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Expected: all three commands exit 0. The production build regenerates the
catalog and successfully exports `/submit/project/`.

- [ ] **Step 7: Review and commit the implementation**

Inspect only the intended implementation and test changes:

```powershell
git diff --check
git diff -- src/app/submit/project/page.tsx tests/unit/project-submission-builder.test.tsx
git status --short
```

Then stage only those two files and commit:

```powershell
git add -- src/app/submit/project/page.tsx tests/unit/project-submission-builder.test.tsx
git commit -m "feat(submissions): order frontends by popularity"
```
