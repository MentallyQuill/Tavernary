# Kit Edit Reaction Initialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let approved Kit edits initialize community support using the canonical Kit identity without weakening publication failure handling.

**Architecture:** The apply-submission script will emit the canonical `kit_id` as a GitHub Actions output. The publication workflow will pass that ID to the reaction refresher, which will enforce required initialization by Kit ID while continuing to fetch reactions from the Kit's immutable source issue.

**Tech Stack:** Node.js 24, JavaScript ES modules, TypeScript declaration files, Vitest, GitHub Actions YAML

## Global Constraints

- Preserve canonical Kit IDs and immutable `source_issue_number` values.
- Keep first-snapshot failure fatal for the Kit currently being published.
- Preserve stale-snapshot recovery for unrelated Kits.
- Preserve scheduled refresh behavior when no required Kit identity is supplied.
- Do not touch the unrelated repository-snapshot changes already in the worktree.

---

### Task 1: Emit the applied canonical Kit ID

**Files:**
- Modify: `tests/unit/apply-kit-submission.test.ts`
- Modify: `scripts/kits/apply-submission.mjs`
- Modify: `scripts/kits/apply-submission.d.mts`

**Interfaces:**
- Consumes: the canonical `CanonicalKit` returned by `applyKitSubmission`
- Produces: `writeAppliedKitOutput(path: string, kit: CanonicalKit): Promise<void>`, writing `kit_id=<canonical id>` to the GitHub Actions output file

- [ ] **Step 1: Write the failing output test**

Add a test using a temporary output file:

```ts
test("emits the canonical Kit ID for workflow consumers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-kit-output-"));
  const output = join(directory, "output.txt");

  await writeAppliedKitOutput(output, existing);

  expect(await readFile(output, "utf8")).toBe("kit_id=original-200\n");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/apply-kit-submission.test.ts
```

Expected: FAIL because `writeAppliedKitOutput` is not exported.

- [ ] **Step 3: Implement the minimal output writer**

Import `appendFile`, export the writer, and invoke it after the canonical record is atomically written:

```js
export async function writeAppliedKitOutput(path, kit) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(path, `kit_id=${kit.id}\n`, "utf8");
}
```

```js
await atomicWrite(resolve("data/registry/kits", `${record.id}.json`), record);
await writeAppliedKitOutput(process.env.GITHUB_OUTPUT, record);
```

Add the exact function signature to `apply-submission.d.mts`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/apply-kit-submission.test.ts
```

Expected: all apply-submission tests PASS.

### Task 2: Require reaction initialization by canonical Kit ID

**Files:**
- Modify: `tests/unit/refresh-kit-reactions.test.ts`
- Modify: `scripts/kits/refresh-reactions.mjs`
- Modify: `scripts/kits/refresh-reactions.d.mts`

**Interfaces:**
- Consumes: optional `requiredKitId: string`
- Produces: the existing `Promise<KitSupportSnapshot[]>`, failing when the required published Kit is absent or its reaction fetch fails

- [ ] **Step 1: Write the failing edit regression test**

Add one test where the required Kit ID and immutable source issue intentionally differ:

```ts
test("initializes an edited Kit by canonical ID and fetches its source issue", async () => {
  const editedKit = {
    ...kit,
    id: "super-awesome-test-kit-109",
    source_issue_number: 109,
  };
  const fetchPage = vi.fn().mockResolvedValue([]);

  await expect(
    refreshKitReactions({
      kits: [editedKit],
      snapshots: [],
      blockedUsers: { blocked: [] },
      fetchPage,
      now,
      requiredKitId: editedKit.id,
    }),
  ).resolves.toMatchObject([
    {
      kit_id: editedKit.id,
      source_issue_number: 109,
    },
  ]);
  expect(fetchPage).toHaveBeenCalledWith({
    kit: editedKit,
    page: 1,
    perPage: 100,
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/refresh-kit-reactions.test.ts
```

Expected: FAIL because `requiredKitId` is ignored.

- [ ] **Step 3: Implement Kit-ID enforcement**

Replace `requiredKitIssueNumber` with `requiredKitId` in the function, fatal-fetch guard, absent-required-Kit guard, environment parsing, and declaration file:

```js
if (kit.id === requiredKitId) {
  throw new Error(`Unable to initialize Kit ${kit.id} support`, {
    cause: error,
  });
}
```

```js
if (
  requiredKitId !== undefined &&
  !kits.some((kit) => kit.status === "published" && kit.id === requiredKitId)
) {
  throw new Error(`Published Kit ${requiredKitId} was not found`);
}
```

Read the CLI value from `process.env.REQUIRED_KIT_ID`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/refresh-kit-reactions.test.ts
```

Expected: all reaction-refresh tests PASS.

### Task 3: Wire the canonical Kit ID through the publication workflow

**Files:**
- Modify: `tests/unit/workflows.test.ts`
- Modify: `.github/workflows/apply-kit-submission.yml`

**Interfaces:**
- Consumes: `${{ steps.apply.outputs.kit_id }}`
- Produces: `REQUIRED_KIT_ID` for `scripts/kits/refresh-reactions.mjs`

- [ ] **Step 1: Update the workflow contract test first**

Require the apply step to expose outputs and the support step to consume the canonical ID:

```ts
expect(apply?.id).toBe("apply");
expect(support.env).toMatchObject({
  GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
  REQUIRED_KIT_ID: "${{ steps.apply.outputs.kit_id }}",
});
expect(support.env).not.toHaveProperty("REQUIRED_KIT_ISSUE_NUMBER");
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because the workflow still passes `REQUIRED_KIT_ISSUE_NUMBER`.

- [ ] **Step 3: Implement the minimal workflow wiring**

Give the apply step `id: apply` and replace the support environment variable:

```yaml
- name: Re-fetch, revalidate, and apply approved issue
  id: apply
  run: node scripts/kits/apply-submission.mjs
```

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  REQUIRED_KIT_ID: ${{ steps.apply.outputs.kit_id }}
```

- [ ] **Step 4: Run the focused workflow test and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: all workflow tests PASS.

### Task 4: Verify the complete fix

**Files:**
- Verify only; no new files

**Interfaces:**
- Consumes: Tasks 1–3
- Produces: regression and repository-wide verification evidence

- [ ] **Step 1: Run all focused regression suites together**

Run:

```powershell
npm.cmd test -- tests/unit/apply-kit-submission.test.ts tests/unit/refresh-kit-reactions.test.ts tests/unit/refresh-failure-recovery.test.ts tests/unit/workflows.test.ts tests/unit/kit-publication-workflow-hardening.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run formatting and diff checks**

Run:

```powershell
npm.cmd exec prettier -- --check scripts/kits/apply-submission.mjs scripts/kits/apply-submission.d.mts scripts/kits/refresh-reactions.mjs scripts/kits/refresh-reactions.d.mts tests/unit/apply-kit-submission.test.ts tests/unit/refresh-kit-reactions.test.ts tests/unit/workflows.test.ts .github/workflows/apply-kit-submission.yml
git diff --check
```

Expected: both commands exit successfully.

- [ ] **Step 3: Run the full repository gate**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck, unit tests, application build, and static-export verification all PASS.

- [ ] **Step 4: Inspect final scope**

Run:

```powershell
git status --short
git diff --stat HEAD
```

Expected: only the planned Kit publication files plus the user's pre-existing repository-snapshot files are modified.
