# Daily Reddit Retry Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the Reddit submission retry poller from every 15 minutes to once daily at 07:37 UTC.

**Architecture:** Keep the existing GitHub Actions polling workflow and retry dispatcher unchanged. Update only the workflow schedule contract and its repository test so eligible retries are checked by one daily sweep.

**Tech Stack:** GitHub Actions YAML, TypeScript, Vitest

## Global Constraints

- Run the scheduled dispatcher once daily at 07:37 UTC with cron `37 7 * * *`.
- Preserve manual `workflow_dispatch` recovery.
- Preserve all Reddit retry eligibility, state, dispatch, and terminal fallback behavior.
- Do not modify the unrelated untracked provider-reliability plan.

---

### Task 1: Change the retry poll cadence

**Files:**
- Modify: `tests/unit/workflows.test.ts:896-900`
- Modify: `.github/workflows/retry-project-submission-enrichment.yml:4-7`

**Interfaces:**
- Consumes: the YAML workflow parser helper `workflow("retry-project-submission-enrichment")`
- Produces: `on.schedule` equal to `[{ cron: "37 7 * * *" }]`

- [ ] **Step 1: Write the failing workflow-contract test**

Replace the existing cadence assertion with:

```ts
test("checks for due Reddit submissions once daily", async () => {
  const retry = await workflow("retry-project-submission-enrichment");

  expect(retry.on.schedule).toEqual([{ cron: "37 7 * * *" }]);
  expect(retry.on.workflow_dispatch).toBeNull();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because the workflow still exposes `[{ cron: "*/15 * * * *" }]`.

- [ ] **Step 3: Implement the daily workflow schedule**

Change the schedule to:

```yaml
on:
  schedule:
    - cron: "37 7 * * *"
  workflow_dispatch:
```

- [ ] **Step 4: Run focused verification**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, catalog validation/build, typecheck, unit tests, production build, and static export all pass.

- [ ] **Step 6: Review the final diff**

Run:

```powershell
git diff --check
git diff -- .github/workflows/retry-project-submission-enrichment.yml tests/unit/workflows.test.ts docs/superpowers/plans/2026-07-31-daily-reddit-retry-sweep.md
git status --short
```

Expected: only the planned workflow, contract test, and implementation plan are changed; the pre-existing untracked provider-reliability plan remains untouched.

