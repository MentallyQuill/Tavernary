# Search Plus OR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a literal `+` OR operator that unions ordinary Tavernary searches and round-trips through a shareable URL.

**Architecture:** Parse the raw field into independently normalized clauses, run each clause through the existing AND-based MiniSearch path, and merge duplicate cards at their best score. Keep the existing single `q` parameter and raw draft; standard URL encoding serializes the operator as `%2B`.

**Tech Stack:** TypeScript, MiniSearch, React 19, Vitest, Testing Library, Playwright, Next.js 16

## Global Constraints

- Preserve exactly what the user types in the visible search field while editing.
- Every nonempty `+` clause uses existing ordinary search behavior.
- Empty clauses are ignored and duplicate cards appear once at their best score.
- Add no exclusion, quoting, field-filter, precedence, or escape syntax.
- Preserve ordinary `?q=preset+freaky` form-URL semantics as a space-separated query.
- Keep Project and Kit search, filters, relevance transitions, corrections, and degraded fallback behavior.

---

### Task 1: Parse and execute OR expressions

**Files:**
- Modify: `src/features/search/search-normalization.ts:26-45`
- Modify: `src/features/search/catalog-search.ts:60-420`
- Test: `tests/unit/catalog-search.test.ts`

**Interfaces:**
- Produces: `searchClauses(value: string): string[]`
- Preserves: `searchMeaning(value: string): string`, now returning canonical clauses joined by `+`
- Preserves: `CatalogSearchIndex.search(query: string): CatalogSearchResults`
- Preserves: `exactAllTermSearch(documents, query): CatalogSearchResults`

- [ ] **Step 1: Write failing normalization and search tests**

Add assertions that name the breaks: losing the OR boundary, treating a
multi-word clause as OR, duplicating a card, retaining empty clauses, or
reverting degraded search to global AND.

```ts
expect(searchClauses("  preset freaky + memory ++ ")).toEqual([
  "preset freaky",
  "memory",
]);
expect(searchMeaning("preset freaky+memory")).toBe("preset freaky+memory");

const result = createCatalogSearchIndex(documents).search(
  "preset freaky+memory books",
);
expect(result.matches.map(({ id }) => id).sort()).toEqual([
  "freaky",
  "memory",
]);
expect(
  createCatalogSearchIndex(documents).search("preset missing+memory books")
    .matches.map(({ id }) => id),
).toEqual(["memory"]);
expect(
  createCatalogSearchIndex(documents).search("memory+memory books").matches,
).toHaveLength(1);
expect(
  exactAllTermSearch(documents, "preset freaky+memory books").matches
    .map(({ id }) => id)
    .sort(),
).toEqual(["freaky", "memory"]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-search.test.ts
```

Expected: FAIL because `searchClauses` is not exported and the current engine
normalizes `+` into a space before requiring every term globally.

- [ ] **Step 3: Add clause-aware normalization**

Implement the expression boundary without changing `searchTerms`:

```ts
export function searchClauses(value: string) {
  return value
    .split("+")
    .map((clause) => searchTerms(clause).join(" "))
    .filter(Boolean);
}

export function searchMeaning(value: string) {
  return searchClauses(value).join("+");
}
```

- [ ] **Step 4: Merge independently searched clause results**

Refactor the current single-query body into a clause operation. Merge matches
by ID, replacing an existing match only when the new score is greater, and
sort once after the union:

```ts
function mergeMatches(matches: CatalogSearchMatch[]) {
  const bestById = new Map<string, CatalogSearchMatch>();
  for (const match of matches) {
    const current = bestById.get(match.id);
    if (!current || match.score > current.score) bestById.set(match.id, match);
  }
  return [...bestById.values()].sort(
    (left, right) => right.score - left.score || left.id.localeCompare(right.id),
  );
}
```

Use `searchClauses(query)` in both MiniSearch and exact-token paths. Search
each clause with the existing `combineWith: "AND"`, term eligibility,
`matchScore`, and evidence logic. If any query execution throws, call the
clause-aware `degradedFallback(documents, query)` for the complete expression.

- [ ] **Step 5: Compose clause-local corrections**

Preserve uncorrected clauses and replace only clauses for which the existing
correction function returns a candidate:

```ts
const corrected = clauses.map(
  (clause) => correctionForQuery(miniSearch, clause) ?? clause,
);
const correction = corrected.some((clause, index) => clause !== clauses[index])
  ? corrected.join("+")
  : null;
```

Add a literal assertion such as:

```ts
expect(index.search("frankenstien+memory books").correction).toBe(
  "frankenstein+memory books",
);
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-search.test.ts tests/unit/catalog-search-relevance.test.ts tests/unit/catalog-selectors.test.ts tests/unit/search-sort-transition.test.ts
```

Expected: all selected test files pass with no failures.

- [ ] **Step 7: Commit the search engine behavior**

```powershell
git add src/features/search/search-normalization.ts src/features/search/catalog-search.ts tests/unit/catalog-search.test.ts
git commit -m "feat(search): add plus OR expressions"
```

---

### Task 2: Prove URL sharing and live catalog behavior

**Files:**
- Modify: `tests/unit/use-catalog-query.test.tsx`
- Modify: `tests/e2e/catalog.spec.ts`
- Modify: `docs/guides/using-the-catalog.md`

**Interfaces:**
- Consumes: `searchMeaning(value)` and `CatalogSearchIndex.search(query)` from Task 1
- Verifies: existing `parseCatalogQuery`, `serializeCatalogQuery`, and raw search draft behavior
- Produces: documented user syntax and browser regression coverage

- [ ] **Step 1: Add the URL round-trip regression test**

Exercise the real hook and browser history rather than duplicating
`URLSearchParams` logic:

```ts
test("round-trips a literal plus operator through the shared URL", () => {
  window.history.replaceState(null, "", "/?q=vectfox%2Bsummaryception");
  const replaceState = vi.spyOn(window.history, "replaceState");
  const { result } = renderHook(() => useCatalogQuery());

  expect(result.current.query.search).toBe("vectfox+summaryception");

  act(() => {
    result.current.setQuery({
      ...result.current.query,
      search: "Stab's Directives+Directive",
    });
  });

  expect(replaceState).toHaveBeenLastCalledWith(
    null,
    "",
    "/?q=Stab%27s+Directives%2BDirective",
  );
});
```

Also retain the existing `/?q=preset+freaky` expectation to prove form-URL
spaces remain backward compatible.

- [ ] **Step 2: Run the query-state test**

Run:

```powershell
npm.cmd test -- tests/unit/use-catalog-query.test.tsx tests/unit/search-sort-transition.test.ts
```

Expected: both files pass. The URL encoding behavior already belongs to the
existing serializer; this is a characterization and regression gate.

- [ ] **Step 3: Add the focused browser scenario**

Add a test to `tests/e2e/catalog.spec.ts` that fills the real search field,
asserts both result families, inspects the encoded URL, reloads it, and proves
the multi-word clause:

```ts
test("shares plus OR searches with normal clause behavior", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("vectfox+summaryception");
  await expect(page.getByRole("heading", { name: "VectFox", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Extension-Summaryception",
    exact: true,
  })).toBeVisible();
  await expect(page).toHaveURL(/q=vectfox%2Bsummaryception/iu);

  await page.reload();
  await expect(search).toHaveValue("vectfox+summaryception");

  await search.fill("Stab's Directives+Directive");
  await expect(page.getByRole("heading", {
    name: "Stab's Directives",
    exact: true,
  })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Directive", exact: true }))
    .toBeVisible();
});
```

- [ ] **Step 4: Document only the approved operator**

Add this bullet under **Search and filters** in
`docs/guides/using-the-catalog.md`:

```markdown
- Join ordinary searches with `+` to show results matching any clause. For
  example, `vectfox+summaryception` shows matches for either search, while
  `Stab's Directives+Directive` keeps normal all-word matching inside each
  clause. Copied catalog URLs preserve the complete expression.
```

- [ ] **Step 5: Run focused unit and browser verification**

Run:

```powershell
npm.cmd test -- tests/unit/catalog-search.test.ts tests/unit/use-catalog-query.test.tsx tests/unit/search-sort-transition.test.ts
npm.cmd run test:e2e -- --grep "shares plus OR searches"
```

Expected: focused unit files and the new Chromium browser scenario pass.

- [ ] **Step 6: Commit URL, browser, and documentation coverage**

```powershell
git add tests/unit/use-catalog-query.test.tsx tests/e2e/catalog.spec.ts docs/guides/using-the-catalog.md
git commit -m "test(search): cover shared OR queries"
```

---

### Task 3: Verify, publish, and merge

**Files:**
- Verify all files changed by Tasks 1 and 2

**Interfaces:**
- Consumes: the complete feature branch
- Produces: a reviewed GitHub PR merged into `main`

- [ ] **Step 1: Run the complete local verification gate**

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:export
npm.cmd run test:e2e -- --grep "shares plus OR searches"
```

Expected: every command exits zero; the unit suite reports no failures and the
focused browser scenario passes.

- [ ] **Step 2: Inspect scope and commit history**

```powershell
git status -sb
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: only the approved design, plan, search behavior, tests, and user guide
are present; the worktree is clean.

- [ ] **Step 3: Push and open a ready PR**

```powershell
git push -u origin codex/search-plus-or
gh pr create --base main --head codex/search-plus-or --title "Add plus OR catalog searches" --body "Adds + as an OR operator between normal Tavernary searches. Preserves all-term matching inside each clause and percent-encodes the operator in shareable URLs. Verified with focused search browser coverage and the full local validation gate."
```

The PR body summarizes syntax, URL behavior, user impact, and exact verification
commands. The user explicitly requested merge, so create a ready PR rather than
the publishing workflow's default draft.

- [ ] **Step 4: Confirm checks and merge the PR**

```powershell
$prNumber = gh pr view --json number --jq '.number'
gh pr checks $prNumber --watch
gh pr merge $prNumber --merge --delete-branch
```

Expected: all required checks pass and GitHub reports the PR merged.

- [ ] **Step 5: Verify merged source and remote state**

```powershell
gh pr view $prNumber --json state,mergedAt,mergeCommit,url,headRefName,baseRefName
gh api repos/MentallyQuill/Tavernary/commits/main --jq '{sha:.sha,message:.commit.message,date:.commit.author.date}'
```

Expected: PR state is `MERGED`, the merge commit exists on `main`, and its SHA
matches the current remote-main head returned by the API.
