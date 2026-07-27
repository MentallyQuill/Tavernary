# Provisional Frontend Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production catalog invariant accept structurally classified provisional frontends while preserving strict fallback requirements for every other provisional project.

**Architecture:** Keep the submission generator unchanged because it already preserves the known `frontend` classification and has focused unit coverage. Add a synthetic full-catalog regression, then narrow the full-catalog invariant so only provisional frontend records may use `primary_function: "frontend"`; all provisional capabilities remain empty.

**Tech Stack:** TypeScript, Vitest, Node.js, npm, GitHub Actions

## Global Constraints

- Do not change catalog schemas, generated records, enrichment behavior, or unrelated submission handling.
- Provisional frontend records use `primary_function: "frontend"`.
- Other provisional records use `primary_function: "uncategorized"`.
- Every provisional record has an empty `capabilities` array.
- Preserve unrelated changes in the main checkout.

---

### Task 1: Align the full-catalog provisional invariant

**Files:**
- Modify: `tests/unit/full-catalog-data.test.ts:243`
- Test: `tests/unit/full-catalog-data.test.ts`

**Interfaces:**
- Consumes: `loadRegistryRecords(): Promise<CatalogRecord[]>` and `expectCatalogContract(records: CatalogRecord[]): void`
- Produces: a catalog invariant that accepts `primary_function: "frontend"` only when `record.kind === "frontend"` and `record.metadata_status === "provisional"`

- [ ] **Step 1: Write the failing regression**

Add this test inside `describe("full catalog data", ...)`:

```ts
test("accepts structural primary functions for provisional frontends", async () => {
  const records = await loadRegistryRecords();
  const existingFrontend = records.find((record) => record.kind === "frontend");
  expect(existingFrontend).toBeDefined();

  const provisionalFrontend = structuredClone(existingFrontend!);
  provisionalFrontend.id = "provisional-frontend-contract-fixture";
  provisionalFrontend.metadata_status = "provisional";
  provisionalFrontend.primary_function = "frontend";
  provisionalFrontend.capabilities = [];

  expectCatalogContract([...records, provisionalFrontend]);
});
```

- [ ] **Step 2: Run the regression and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts -t "accepts structural primary functions for provisional frontends"
```

Expected: FAIL at the unconditional provisional assertion with `expected 'frontend' to be 'uncategorized'`.

- [ ] **Step 3: Implement the conditional invariant**

Replace the unconditional primary-function assertion with:

```ts
for (const record of provisionalRecords) {
  expect(record.primary_function).toBe(
    record.kind === "frontend" ? "frontend" : "uncategorized",
  );
  expect(record.capabilities).toEqual([]);
}
```

- [ ] **Step 4: Run the regression and focused suite**

Run:

```powershell
npm.cmd test -- tests/unit/full-catalog-data.test.ts
npm.cmd run check:content
```

Expected: both commands exit 0 with no failed tests.

- [ ] **Step 5: Run the full repository verification**

Run:

```powershell
npm.cmd run check
git diff --check
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- tests/unit/full-catalog-data.test.ts docs/superpowers/plans/2026-07-27-provisional-frontend-contract.md
git commit -m "fix(ci): allow provisional frontend function"
```

### Task 2: Publish and verify the affected PRs

**Files:**
- No repository file changes.

**Interfaces:**
- Consumes: the verified implementation commit from Task 1
- Produces: GitHub check results for PRs 83 and 94 using the corrected invariant

- [ ] **Step 1: Push the fix branch**

Run:

```powershell
git push -u origin codex/fix-provisional-frontend-contract
```

Expected: the remote branch is updated successfully.

- [ ] **Step 2: Integrate the fix where both generated PRs can use it**

Use the GitHub CLI to open and merge the focused fix PR into `main`, then update
the generated submission branches from the new `main` without altering their
generated catalog files.

- [ ] **Step 3: Re-run and watch PR checks**

Run:

```powershell
gh pr checks 83 --watch
gh pr checks 94 --watch
```

Expected: the `verify` and `visual` checks complete successfully for both PRs.
