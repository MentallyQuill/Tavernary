# Project Date Added Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-addressable Date Added project sort that orders filtered projects by their existing Tavernary catalog publication timestamp, newest first.

**Architecture:** Extend the existing project browse-sort contract with `date-added`, route it through the current query parser and serializer, and add one explicit comparator branch that delegates to the existing `catalogedAt` fallback order. Expose the value in the existing project toolbar; do not change generated data, project cards, search relevance, or Kit sorting.

**Tech Stack:** TypeScript 6, React 19, Next.js 16, Vitest, Testing Library.

## Global Constraints

- Preserve the established meaning and behavior of Recent Activity.
- Use `CatalogProject.catalogedAt`; do not derive or invent another timestamp.
- Sort newest first, then locale-aware project name, then stable project ID.
- Preserve automatic Relevance while a meaningful search is active and restore the remembered Date Added browse sort when search clears.
- Keep invalid sort values falling back to Recent Activity.
- Do not change Kit sort values or behavior.
- Do not migrate canonical or generated catalog data.

---

### Task 1: Add the Date Added project sort contract and behavior

**Files:**
- Modify: `tests/unit/catalog-selectors.test.ts`
- Modify: `tests/unit/search-sort-transition.test.ts`
- Modify: `tests/unit/catalog-toolbar.test.tsx`
- Modify: `src/features/catalog/catalog-query.ts`
- Modify: `src/features/catalog/catalog-selectors.ts`
- Modify: `src/features/catalog/components/catalog-toolbar.tsx`
- Modify: `docs/superpowers/plans/2026-08-02-project-date-added-sort.md`

**Interfaces:**
- Consumes: `CatalogProject.catalogedAt: string`, `fallbackOrder(left, right)`, `nextSearchSort(...)`, and the existing catalog URL query helpers.
- Produces: `CatalogBrowseSort` value `"date-added"`, URL form `sort=date-added`, and toolbar option label `Date Added`.

- [x] **Step 1: Add failing selector and URL contract tests**

Add a focused selector test whose activity order conflicts with its catalog date order:

```ts
test("sorts by date added newest-first with stable ties", () => {
  const sortable = [
    project("older-active", {
      name: "Zulu",
      catalogedAt: "2026-07-01T00:00:00Z",
      activity: {
        ...project("base").activity,
        latestSourceActivityAt: "2026-07-30T00:00:00Z",
      },
    }),
    project("newer", {
      name: "Beta",
      catalogedAt: "2026-07-03T00:00:00Z",
    }),
    project("same-date-alpha", {
      name: "alpha",
      catalogedAt: "2026-07-03T00:00:00Z",
    }),
  ];

  expect(
    selectProjects(
      sortable,
      { ...DEFAULT_QUERY, sort: "date-added" },
      context,
    ).map(({ id }) => id),
  ).toEqual(["same-date-alpha", "newer", "older-active"]);
});
```

Extend the catalog URL tests with:

```ts
expect(parseCatalogQuery("?sort=date-added").sort).toBe("date-added");
expect(
  serializeCatalogQuery({ ...DEFAULT_QUERY, sort: "date-added" }),
).toBe("sort=date-added");
```

- [x] **Step 2: Add failing toolbar and search-restoration tests**

Add a toolbar test that renders `query={{ ...DEFAULT_QUERY, sort: "date-added" }}`, asserts the project sort combobox has value `date-added`, finds the `Date Added` option, changes to it from the default query, and asserts `onSort` receives `"date-added"`.

In `search-sort-transition.test.ts`, import `type CatalogBrowseSort`, assign:

```ts
const dateAdded: CatalogBrowseSort = "date-added";
```

Then assert clearing a meaningful search returns `dateAdded` through `nextSearchSort`. This makes the test fail at the type contract before the new sort is added and proves the generic search transition preserves it afterward.

- [x] **Step 3: Run focused tests to verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-selectors.test.ts tests/unit/catalog-toolbar.test.tsx tests/unit/search-sort-transition.test.ts
```

Expected: FAIL because `date-added` is not an accepted `CatalogBrowseSort`, the URL parser rejects it, the selector uses Recent Activity, and the toolbar lacks the option.

- [x] **Step 4: Implement the minimal query contract**

In `catalog-query.ts`, add `"date-added"` to `CatalogBrowseSort` and `CATALOG_BROWSE_SORTS`. Leave `DEFAULT_CATALOG_BROWSE_SORT` as `"recent"`.

- [x] **Step 5: Implement the minimal selector branch**

In `sortProjects`, after the alphabetical branch and before activity-based branches, add:

```ts
if (sort === "date-added") {
  return fallbackOrder(left, right);
}
```

This reuses the established descending `catalogedAt`, name, and ID ordering.

- [x] **Step 6: Add the toolbar option**

In the project sort `<select>`, add:

```tsx
<option value="date-added">Date Added</option>
```

Place it after Recent Activity so the two recency concepts remain visible but distinct.

- [x] **Step 7: Run focused tests to verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-selectors.test.ts tests/unit/catalog-toolbar.test.tsx tests/unit/search-sort-transition.test.ts
```

Expected: all focused tests PASS.

- [x] **Step 8: Run formatting and type checks**

Run:

```powershell
npm.cmd exec prettier -- --check src/features/catalog/catalog-query.ts src/features/catalog/catalog-selectors.ts src/features/catalog/components/catalog-toolbar.tsx tests/unit/catalog-selectors.test.ts tests/unit/catalog-toolbar.test.tsx tests/unit/search-sort-transition.test.ts docs/superpowers/plans/2026-08-02-project-date-added-sort.md
npm.cmd run typecheck
```

Expected: both commands PASS. If Prettier reports only changed-file formatting, run the matching `npm.cmd exec prettier -- --write ...` command and re-run the check.

- [x] **Step 9: Run the full repository verification gate**

Run:

```powershell
npm.cmd run check
```

Expected: format, lint, palette, catalog validation/build, security report validation, typecheck, unit tests, production build, and static export verification all PASS.

- [x] **Step 10: Review and commit the implementation**

Inspect `git diff --check`, the scoped diff, and `git status --short`. Stage only the design/plan and Date Added implementation files, then commit with:

```text
feat(catalog): add date-added sort
```
