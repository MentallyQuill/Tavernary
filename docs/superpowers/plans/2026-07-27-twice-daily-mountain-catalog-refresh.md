# Twice-Daily Mountain Catalog Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run catalog source refreshes at 6:17 AM and 6:17 PM Mountain time every day.

**Architecture:** Keep the existing refresh workflow and manual dispatch path unchanged. Replace its single UTC cron with one timezone-aware schedule using `America/Denver`, lock that schedule in the existing workflow safety test, and synchronize every maintained documentation reference.

**Tech Stack:** GitHub Actions YAML, IANA timezone scheduling, Vitest, `yaml`

## Global Constraints

- Scheduled refreshes run at exactly 6:17 AM and 6:17 PM Mountain time.
- Use the IANA timezone `America/Denver` so GitHub handles MST and MDT.
- Preserve all manual dispatch inputs, refresh behavior, concurrency, and publication behavior.
- Keep the minute offset at `17`.

---

### Task 1: Implement and verify the twice-daily schedule

**Files:**
- Modify: `tests/unit/refresh-github-workflow-safety.test.ts`
- Modify: `.github/workflows/refresh-catalog.yml`
- Modify: `README.md`
- Modify: `docs/maintenance/operations-runbook.md`
- Modify: `docs/maintenance/github-actions-user-guides.md`
- Modify: `docs/architecture/system-overview.md`

**Interfaces:**
- Consumes: GitHub Actions `on.schedule` entries with `cron` and `timezone`
- Produces: `[{ cron: "17 6,18 * * *", timezone: "America/Denver" }]`

- [ ] **Step 1: Write the failing schedule test**

Add this test after `workflowSource` in
`tests/unit/refresh-github-workflow-safety.test.ts`:

```ts
test("runs scheduled refreshes at 6:17 AM and PM Mountain time", async () => {
  const document = parse(await readFile(refreshPath, "utf8")) as {
    on: {
      schedule: Array<{
        cron: string;
        timezone: string;
      }>;
    };
  };

  expect(document.on.schedule).toEqual([
    {
      cron: "17 6,18 * * *",
      timezone: "America/Denver",
    },
  ]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/refresh-github-workflow-safety.test.ts
```

Expected: FAIL because the workflow still contains `17 7 * * *` without a
timezone.

- [ ] **Step 3: Update the workflow schedule**

Replace the schedule in `.github/workflows/refresh-catalog.yml` with:

```yaml
  schedule:
    - cron: "17 6,18 * * *"
      timezone: "America/Denver"
```

- [ ] **Step 4: Update maintained schedule documentation**

Make these exact wording changes:

- `README.md`: replace “runs incremental refreshes once daily” with “runs
  incremental refreshes twice daily at 6:17 AM and 6:17 PM Mountain time.”
- `docs/maintenance/operations-runbook.md`: replace the UTC cron bullet with
  `Schedule: 6:17 AM and 6:17 PM America/Denver via timezone-aware cron
  (17 6,18 * * *).`
- `docs/maintenance/github-actions-user-guides.md`: replace the old cron
  parenthetical with `6:17 AM and 6:17 PM America/Denver`.
- `docs/architecture/system-overview.md`: replace “Daily scheduled refresh”
  with “Twice-daily scheduled refresh at 6:17 AM and 6:17 PM Mountain time”.

- [ ] **Step 5: Run focused workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run workflow and formatting verification**

Run:

```powershell
npm.cmd run format:check
npm.cmd test -- tests/unit/refresh-github-workflow-safety.test.ts tests/unit/workflows.test.ts
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the implementation**

```powershell
git add -- .github/workflows/refresh-catalog.yml tests/unit/refresh-github-workflow-safety.test.ts README.md docs/maintenance/operations-runbook.md docs/maintenance/github-actions-user-guides.md docs/architecture/system-overview.md
git commit -m "ci(catalog): refresh twice daily"
```
