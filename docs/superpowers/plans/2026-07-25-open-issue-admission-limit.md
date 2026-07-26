# Open Issue Admission Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit each external GitHub account to 10 open Tavernary issues while preserving unlimited edits, immediate validation, and unrestricted access for new accounts.

**Architecture:** Add a pure admission-policy module and a thin GitHub issue-event adapter. A new workflow labels admitted issues or neutrally closes excess issues; Project and Kit triage then begins from the admission label and uses per-issue concurrency to collapse obsolete edit runs.

**Tech Stack:** GitHub issue forms, GitHub Actions, GitHub REST API, Node.js 24 ESM, TypeScript declaration files, Vitest, YAML workflow contract tests.

## Global Constraints

- Count every open issue in `MentallyQuill/Tavernary` for the same GitHub numeric user ID.
- Exclude pull requests from the count.
- Admit the oldest 10 issues, ordered by `created_at` and then issue number.
- Exempt `OWNER`, `MEMBER`, and `COLLABORATOR` author associations.
- Do not restrict accounts by age.
- Do not count edits or comments as additional issues.
- Do not add a daily quota, CAPTCHA, backend service, or new user blocklist.
- Keep the existing Kit blocked-user validation unchanged.
- Excess issues receive a neutral explanation and close; they do not create an account-level moderation record.
- Admission runs on both `opened` and `reopened`.
- Admission lookup failures fail open and allow normal triage.
- Project and Kit validation requires `issue-admitted`.
- Keep pinned Node.js 24 setup and remove `npm ci` from repeated submission triage.
- Preserve the unrelated untracked `docs/superpowers/plans/2026-07-25-about-page-visitor-features.md`.

---

## File Structure

- Create `scripts/submissions/issue-admission.mjs` — pure admission ordering, trusted-association bypass, constants, and limit-comment construction.
- Create `scripts/submissions/issue-admission.d.mts` — public TypeScript contract for the pure admission module.
- Create `scripts/submissions/admit-issue.mjs` — GitHub event parsing, paginated open-issue lookup, label/comment synchronization, and close/reopen handling.
- Create `scripts/submissions/admit-issue.d.mts` — injected GitHub-request and event types for adapter tests.
- Create `.github/workflows/admit-issue.yml` — admission entrypoint for opened and reopened issues.
- Create `tests/unit/issue-admission.test.ts` — pure policy regressions.
- Create `tests/unit/admit-issue.test.ts` — GitHub adapter and fail-open regressions.
- Modify `.github/workflows/triage-submission.yml` — validate admitted Project issues on initial label or edit, with per-issue concurrency and no dependency install.
- Modify `.github/workflows/triage-kit-submission.yml` — validate admitted Kit issues on initial label or edit, with per-issue concurrency and no dependency install.
- Modify `tests/unit/workflows.test.ts` — admission and triage workflow contracts.
- Modify `docs/contributing/submission-and-review.md` — contributor-facing queue-cap behavior.
- Modify `docs/contributing/kits.md` — clarify that Kit issues share the repository-wide cap.
- Modify `docs/maintenance/operations-runbook.md` — maintainer operations and recovery behavior.

---

### Task 1: Pure Open-Issue Admission Policy

**Files:**

- Create: `scripts/submissions/issue-admission.mjs`
- Create: `scripts/submissions/issue-admission.d.mts`
- Create: `tests/unit/issue-admission.test.ts`

**Interfaces:**

- Consumes: GitHub issue summaries with `number`, `created_at`, `user.id`, and optional `pull_request`.
- Produces: `OPEN_ISSUE_LIMIT`, `ISSUE_ADMISSION_LABEL`, `ISSUE_LIMIT_LABEL`, `ISSUE_LIMIT_MARKER`, `decideIssueAdmission(...)`, and `buildIssueLimitComment()`.

- [ ] **Step 1: Write the failing pure-policy tests**

Create `tests/unit/issue-admission.test.ts`:

```ts
import { expect, test } from "vitest";

import {
  buildIssueLimitComment,
  decideIssueAdmission,
  ISSUE_ADMISSION_LABEL,
  ISSUE_LIMIT_LABEL,
  OPEN_ISSUE_LIMIT,
} from "../../scripts/submissions/issue-admission.mjs";

function issue(
  number: number,
  userId = 42,
  options: { pullRequest?: boolean; createdAt?: string } = {},
) {
  return {
    number,
    created_at:
      options.createdAt ?? `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
    user: { id: userId },
    ...(options.pullRequest ? { pull_request: { url: "https://example.test" } } : {}),
  };
}

test("admits the oldest ten open issues for one numeric identity", () => {
  const openItems = Array.from({ length: 11 }, (_, index) => issue(index + 1));

  expect(
    decideIssueAdmission({
      currentIssue: issue(10),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    reason: "within-limit",
    admittedIssueNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  });
  expect(
    decideIssueAdmission({
      currentIssue: issue(11),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({ admitted: false, reason: "over-limit" });
});

test("counts every issue type while excluding pull requests and other users", () => {
  const openItems = [
    ...Array.from({ length: 9 }, (_, index) => issue(index + 1)),
    issue(10, 42, { pullRequest: true }),
    issue(11, 99),
    issue(12),
  ];

  expect(
    decideIssueAdmission({
      currentIssue: issue(12),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    openIssueCount: 10,
  });
});

test("restores admission when an older issue closes", () => {
  const openItems = Array.from({ length: 10 }, (_, index) =>
    issue(index + 2),
  );

  expect(
    decideIssueAdmission({
      currentIssue: issue(11),
      openItems,
      authorAssociation: "NONE",
    }),
  ).toMatchObject({
    admitted: true,
    openIssueCount: 10,
  });
});

test.each(["OWNER", "MEMBER", "COLLABORATOR"])(
  "exempts trusted association %s",
  (authorAssociation) => {
    expect(
      decideIssueAdmission({
        currentIssue: issue(50),
        openItems: Array.from({ length: 50 }, (_, index) => issue(index + 1)),
        authorAssociation,
      }),
    ).toMatchObject({ admitted: true, reason: "trusted" });
  },
);

test("uses issue number to break equal creation timestamps", () => {
  const createdAt = "2026-07-25T12:00:00Z";
  const openItems = Array.from({ length: 11 }, (_, index) =>
    issue(11 - index, 42, { createdAt }),
  );

  expect(
    decideIssueAdmission({
      currentIssue: issue(11, 42, { createdAt }),
      openItems,
      authorAssociation: "NONE",
    }).admitted,
  ).toBe(false);
});

test("publishes stable admission constants and neutral recovery copy", () => {
  expect(OPEN_ISSUE_LIMIT).toBe(10);
  expect(ISSUE_ADMISSION_LABEL).toBe("issue-admitted");
  expect(ISSUE_LIMIT_LABEL).toBe("issue-limit-reached");
  expect(buildIssueLimitComment()).toBe(
    [
      "<!-- tavernary-open-issue-limit -->",
      "Tavernary keeps at most 10 issues open per external GitHub account at one time.",
      "",
      "This issue was closed because this account already has 10 older open issues. Close or resolve one of those issues, then reopen this issue to use the available slot.",
    ].join("\n"),
  );
});
```

- [ ] **Step 2: Run the policy tests and verify the missing-module failure**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts
```

Expected: FAIL because `scripts/submissions/issue-admission.mjs` does not exist.

- [ ] **Step 3: Implement the pure policy**

Create `scripts/submissions/issue-admission.mjs`:

```js
export const OPEN_ISSUE_LIMIT = 10;
export const ISSUE_ADMISSION_LABEL = "issue-admitted";
export const ISSUE_LIMIT_LABEL = "issue-limit-reached";
export const ISSUE_LIMIT_MARKER = "<!-- tavernary-open-issue-limit -->";

const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function decideIssueAdmission({
  currentIssue,
  openItems,
  authorAssociation,
}) {
  if (trustedAssociations.has(authorAssociation)) {
    return {
      admitted: true,
      reason: "trusted",
      openIssueCount: 0,
      admittedIssueNumbers: [],
    };
  }

  const authorIssues = openItems
    .filter(
      (item) =>
        !item.pull_request && item.user?.id === currentIssue.user?.id,
    )
    .sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.number - right.number,
    );
  const admittedIssueNumbers = authorIssues
    .slice(0, OPEN_ISSUE_LIMIT)
    .map((item) => item.number);

  return {
    admitted: admittedIssueNumbers.includes(currentIssue.number),
    reason: admittedIssueNumbers.includes(currentIssue.number)
      ? "within-limit"
      : "over-limit",
    openIssueCount: authorIssues.length,
    admittedIssueNumbers,
  };
}

export function buildIssueLimitComment() {
  return [
    ISSUE_LIMIT_MARKER,
    "Tavernary keeps at most 10 issues open per external GitHub account at one time.",
    "",
    "This issue was closed because this account already has 10 older open issues. Close or resolve one of those issues, then reopen this issue to use the available slot.",
  ].join("\n");
}
```

Create `scripts/submissions/issue-admission.d.mts`:

```ts
export const OPEN_ISSUE_LIMIT: 10;
export const ISSUE_ADMISSION_LABEL: "issue-admitted";
export const ISSUE_LIMIT_LABEL: "issue-limit-reached";
export const ISSUE_LIMIT_MARKER: "<!-- tavernary-open-issue-limit -->";

export interface AdmissionIssue {
  number: number;
  created_at: string;
  user: { id: number };
  pull_request?: unknown;
}

export interface AdmissionDecision {
  admitted: boolean;
  reason: "trusted" | "within-limit" | "over-limit";
  openIssueCount: number;
  admittedIssueNumbers: number[];
}

export function decideIssueAdmission(input: {
  currentIssue: AdmissionIssue;
  openItems: AdmissionIssue[];
  authorAssociation: string;
}): AdmissionDecision;

export function buildIssueLimitComment(): string;
```

- [ ] **Step 4: Run the policy tests and typecheck**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts
npm.cmd run typecheck
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the policy module**

```powershell
git add -- scripts/submissions/issue-admission.mjs scripts/submissions/issue-admission.d.mts tests/unit/issue-admission.test.ts
git commit -m "feat(issues): define admission policy"
```

---

### Task 2: GitHub Admission Adapter and Workflow

**Files:**

- Create: `scripts/submissions/admit-issue.mjs`
- Create: `scripts/submissions/admit-issue.d.mts`
- Create: `.github/workflows/admit-issue.yml`
- Create: `tests/unit/admit-issue.test.ts`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Consumes: Task 1's `decideIssueAdmission(...)`, labels, marker, and comment builder.
- Produces: `processIssueAdmission({ event, request })`, `listOpenIssues(...)`, and the `admit-issue` workflow.

- [ ] **Step 1: Write failing adapter tests**

Create `tests/unit/admit-issue.test.ts` with an injected request recorder:

```ts
import { expect, test, vi } from "vitest";

import {
  listOpenIssues,
  processIssueAdmission,
} from "../../scripts/submissions/admit-issue.mjs";

function event(number = 11, association = "NONE") {
  return {
    action: "opened",
    repository: { full_name: "MentallyQuill/Tavernary" },
    issue: {
      number,
      state: "open",
      created_at: `2026-07-25T00:${String(number).padStart(2, "0")}:00Z`,
      author_association: association,
      user: { id: 42, login: "submitter" },
      labels: [],
    },
  };
}

test("paginates open issues and preserves numeric identity data", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    number: index + 1,
    created_at: "2026-07-25T00:00:00Z",
    user: { id: 42 },
  }));
  const request = vi
    .fn()
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce([
      {
        number: 101,
        created_at: "2026-07-25T00:00:00Z",
        user: { id: 42 },
      },
    ]);

  await expect(
    listOpenIssues({
      repository: "MentallyQuill/Tavernary",
      creator: "submitter",
      request,
    }),
  ).resolves.toHaveLength(101);
  expect(request).toHaveBeenNthCalledWith(
    2,
    "/repos/MentallyQuill/Tavernary/issues?state=open&creator=submitter&per_page=100&page=2",
  );
});

test("admits an issue within the oldest ten", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, index) => ({
        number: index + 1,
        created_at: `2026-07-25T00:${String(index + 1).padStart(2, "0")}:00Z`,
        user: { id: 42 },
      })),
    )
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);

  await expect(
    processIssueAdmission({ event: event(10), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "within-limit" });
  expect(request.mock.calls.map(([path]) => path)).toContain(
    "/repos/MentallyQuill/Tavernary/issues/10/labels/issue-limit-reached",
  );
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/10/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("closes the eleventh issue and reuses one marker comment", async () => {
  const openIssues = Array.from({ length: 11 }, (_, index) => ({
    number: index + 1,
    created_at: `2026-07-25T00:${String(index + 1).padStart(2, "0")}:00Z`,
    user: { id: 42 },
  }));
  const request = vi.fn(async (path: string, options?: { method?: string }) => {
    if (path.includes("?state=open")) return openIssues;
    if (path.endsWith("/comments") && !options?.method) return [];
    return null;
  });

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: false, reason: "over-limit" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11",
    {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
    },
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path === "/repos/MentallyQuill/Tavernary/issues/11/comments" &&
        options?.method === "POST" &&
        options.body.includes("tavernary-open-issue-limit"),
    ),
  ).toBe(true);
});

test("rechecks a reopened issue and updates an existing marker comment", async () => {
  const openIssues = Array.from({ length: 11 }, (_, index) => ({
    number: index + 1,
    created_at: `2026-07-25T00:${String(index + 1).padStart(2, "0")}:00Z`,
    user: { id: 42 },
  }));
  const reopened = event(11);
  reopened.action = "reopened";
  const request = vi.fn(async (path: string, options?: { method?: string }) => {
    if (path.includes("?state=open")) return openIssues;
    if (path.endsWith("/comments") && !options?.method) {
      return [
        {
          id: 700,
          body: "<!-- tavernary-open-issue-limit -->\nOld copy",
        },
      ];
    }
    return null;
  });

  await processIssueAdmission({ event: reopened, request });

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/comments/700",
    expect.objectContaining({ method: "PATCH" }),
  );
  expect(
    request.mock.calls.some(
      ([path, options]) =>
        path.endsWith("/issues/11/comments") && options?.method === "POST",
    ),
  ).toBe(false);
});

test("fails open when the open-issue lookup fails", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("GitHub 503"))
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);

  await expect(
    processIssueAdmission({ event: event(11), request }),
  ).resolves.toMatchObject({ admitted: true, reason: "lookup-failed" });
  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/issues/11/labels",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ labels: ["issue-admitted"] }),
    }),
  );
});

test("trusted collaborators bypass lookup and admission limits", async () => {
  const request = vi.fn().mockResolvedValue(null);

  await expect(
    processIssueAdmission({
      event: event(50, "COLLABORATOR"),
      request,
    }),
  ).resolves.toMatchObject({ admitted: true, reason: "trusted" });
  expect(
    request.mock.calls.some(([path]) => path.includes("?state=open")),
  ).toBe(false);
});
```

The implementation may use named helper functions for label and comment
synchronization, but tests must assert observable REST requests rather than
private helper structure.

- [ ] **Step 2: Add failing workflow-contract assertions**

In `tests/unit/workflows.test.ts`:

1. Add `"admit-issue"` to the first-party action pinning list.
2. Add this test:

```ts
test("admits opened and reopened issues before submission triage", async () => {
  const admission = await workflow("admit-issue");
  const source = await readFile(
    resolve(workflowDirectory, "admit-issue.yml"),
    "utf8",
  );

  expect(admission.on.issues.types).toEqual(["opened", "reopened"]);
  expect(admission.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
  expect(admission.concurrency).toEqual({
    group: "issue-admission-${{ github.event.issue.number }}",
    "cancel-in-progress": false,
  });
  expect(source).toContain("node scripts/submissions/admit-issue.mjs");
  expect(source).not.toContain("npm ci");
});
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
npm.cmd test -- tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
```

Expected: FAIL because the adapter and workflow do not exist.

- [ ] **Step 4: Implement the GitHub adapter**

Create `scripts/submissions/admit-issue.mjs`.

The exported pagination boundary must be:

```js
export async function listOpenIssues({ repository, creator, request }) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/issues?state=open&creator=${encodeURIComponent(creator)}&per_page=100&page=${page}`,
    );
    issues.push(...batch);
    if (batch.length < 100) return issues;
  }
}
```

The adapter must:

```js
export async function processIssueAdmission({ event, request }) {
  const repository = event.repository.full_name;
  const currentIssue = event.issue;
  let decision;

  if (["OWNER", "MEMBER", "COLLABORATOR"].includes(
    currentIssue.author_association,
  )) {
    decision = {
      admitted: true,
      reason: "trusted",
      openIssueCount: 0,
      admittedIssueNumbers: [],
    };
  } else {
    try {
      const openItems = await listOpenIssues({
        repository,
        creator: currentIssue.user.login,
        request,
      });
      decision = decideIssueAdmission({
        currentIssue,
        openItems,
        authorAssociation: currentIssue.author_association,
      });
    } catch (error) {
      console.warn(`Admission lookup failed open: ${error.message}`);
      decision = {
        admitted: true,
        reason: "lookup-failed",
        openIssueCount: 0,
        admittedIssueNumbers: [],
      };
    }
  }

  await ensureAdmissionLabels(repository, request);
  if (decision.admitted) {
    await removeOwnedLabel(
      repository,
      currentIssue.number,
      ISSUE_LIMIT_LABEL,
      request,
    );
    await addOwnedLabel(
      repository,
      currentIssue.number,
      ISSUE_ADMISSION_LABEL,
      request,
    );
    return decision;
  }

  await removeOwnedLabel(
    repository,
    currentIssue.number,
    ISSUE_ADMISSION_LABEL,
    request,
  );
  await addOwnedLabel(
    repository,
    currentIssue.number,
    ISSUE_LIMIT_LABEL,
    request,
  );
  await synchronizeLimitComment(repository, currentIssue.number, request);
  await request(`/repos/${repository}/issues/${currentIssue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  });
  return decision;
}
```

Use the existing triage scripts' REST conventions:

- `Accept: application/vnd.github+json`;
- bearer `GITHUB_TOKEN`;
- `X-GitHub-Api-Version: 2022-11-28`;
- `204` returns `null`;
- non-success responses throw an error with `status`;
- label creation ignores `422`;
- owned-label removal ignores `404`;
- comment lookup uses `?per_page=100`;
- a comment containing `ISSUE_LIMIT_MARKER` is patched instead of duplicated.

Export `listOpenIssues` and `processIssueAdmission`. The command-line `main()`
reads `GITHUB_EVENT_PATH`, calls the fetch-backed request wrapper, and ignores
events without an issue payload.

Create `scripts/submissions/admit-issue.d.mts`:

```ts
import type {
  AdmissionDecision,
  AdmissionIssue,
} from "./issue-admission.mjs";

export interface AdmissionEvent {
  action: "opened" | "reopened";
  repository: { full_name: string };
  issue: AdmissionIssue & {
    state: string;
    author_association: string;
    user: { id: number; login: string };
    labels: Array<string | { name: string }>;
  };
}

export type GitHubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export function listOpenIssues(input: {
  repository: string;
  creator: string;
  request: GitHubRequest;
}): Promise<AdmissionIssue[]>;

export function processIssueAdmission(input: {
  event: AdmissionEvent;
  request: GitHubRequest;
}): Promise<
  AdmissionDecision | {
    admitted: true;
    reason: "lookup-failed";
    openIssueCount: 0;
    admittedIssueNumbers: [];
  }
>;
```

- [ ] **Step 5: Add the admission workflow**

Create `.github/workflows/admit-issue.yml`:

```yaml
name: Admit public issue

on:
  issues:
    types:
      - opened
      - reopened

permissions:
  contents: read
  issues: write

concurrency:
  group: issue-admission-${{ github.event.issue.number }}
  cancel-in-progress: false

jobs:
  admit:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - name: Apply open-issue admission policy
        run: node scripts/submissions/admit-issue.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
npm.cmd run typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the adapter and workflow**

```powershell
git add -- scripts/submissions/admit-issue.mjs scripts/submissions/admit-issue.d.mts .github/workflows/admit-issue.yml tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts
git commit -m "feat(issues): enforce open issue cap"
```

---

### Task 3: Admission-Gated Project and Kit Triage

**Files:**

- Modify: `.github/workflows/triage-submission.yml`
- Modify: `.github/workflows/triage-kit-submission.yml`
- Modify: `tests/unit/workflows.test.ts`

**Interfaces:**

- Consumes: Task 2's `issue-admitted` label event.
- Produces: immediate initial validation, admitted-edit validation, and per-issue cancellation of obsolete runs.

- [ ] **Step 1: Replace the old triage workflow expectations with failing admission-gate expectations**

Update the existing `"triage can label issues but cannot write repository content"`
test in `tests/unit/workflows.test.ts`:

```ts
test("triage validates admitted submissions without installing dependencies", async () => {
  for (const name of ["triage-submission", "triage-kit-submission"]) {
    const document = await workflow(name);
    const source = await readFile(
      resolve(workflowDirectory, `${name}.yml`),
      "utf8",
    );

    expect(document.on.issues.types).toEqual(["labeled", "edited"]);
    expect(document.permissions).toEqual({
      contents: "read",
      issues: "write",
    });
    expect(document.concurrency["cancel-in-progress"]).toBe(true);
    expect(document.concurrency.group).toContain(
      "${{ github.event.issue.number }}",
    );
    expect(source).toContain("issue-admitted");
    expect(source).toContain("github.event.issue.state == 'open'");
    expect(source).toContain(
      "github.event.label.name == 'issue-admitted'",
    );
    expect(source).toContain("github.event.action == 'edited'");
    expect(source).not.toContain("npm ci");
    expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
  }
});
```

- [ ] **Step 2: Run the workflow test and verify it fails on old triggers**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because triage still uses `opened`/`edited`, lacks concurrency,
and runs `npm ci`.

- [ ] **Step 3: Gate Project triage on admission**

Change `.github/workflows/triage-submission.yml` to:

```yaml
name: Triage project submission

on:
  issues:
    types:
      - labeled
      - edited

permissions:
  contents: read
  issues: write

concurrency:
  group: triage-project-${{ github.event.issue.number }}
  cancel-in-progress: true

jobs:
  validate:
    if: >-
      startsWith(github.event.issue.title, '[Project submission]') &&
      github.event.issue.state == 'open' &&
      contains(github.event.issue.labels.*.name, 'issue-admitted') &&
      (
        github.event.action == 'edited' ||
        (
          github.event.action == 'labeled' &&
          github.event.label.name == 'issue-admitted'
        )
      )
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
      - name: Validate and label submission
        run: node scripts/submissions/triage-issue.mjs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Gate Kit triage on admission**

Apply the same trigger, admission expression, and dependency-install removal to
`.github/workflows/triage-kit-submission.yml`, retaining:

```yaml
concurrency:
  group: triage-kit-${{ github.event.issue.number }}
  cancel-in-progress: true
```

and:

```yaml
- name: Validate and label Kit submission
  run: node scripts/submissions/triage-kit-issue.mjs
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 5: Run workflow and triage regressions**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts tests/unit/triage-issue.test.ts tests/unit/validate-submission.test.ts tests/unit/validate-kit-submission.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit admission-gated triage**

```powershell
git add -- .github/workflows/triage-submission.yml .github/workflows/triage-kit-submission.yml tests/unit/workflows.test.ts
git commit -m "ci(submissions): gate triage on admission"
```

---

### Task 4: Contributor and Maintainer Documentation

**Files:**

- Modify: `docs/contributing/submission-and-review.md`
- Modify: `docs/contributing/kits.md`
- Modify: `docs/maintenance/operations-runbook.md`

**Interfaces:**

- Consumes: Tasks 1-3 behavior and exact label names.
- Produces: public expectations and maintainer recovery instructions.

- [ ] **Step 1: Write failing documentation assertions**

Add a focused test to `tests/unit/issue-admission.test.ts`:

```ts
import { readFile } from "node:fs/promises";

test("documents the shared public issue cap and maintainer recovery", async () => {
  const contributing = await readFile(
    "docs/contributing/submission-and-review.md",
    "utf8",
  );
  const kits = await readFile("docs/contributing/kits.md", "utf8");
  const operations = await readFile(
    "docs/maintenance/operations-runbook.md",
    "utf8",
  );

  expect(contributing).toContain("10 open issues");
  expect(contributing).toContain("all public issue types");
  expect(contributing).toContain("Closing an issue restores one slot");
  expect(kits).toContain("repository-wide open-issue limit");
  expect(operations).toContain("issue-admitted");
  expect(operations).toContain("issue-limit-reached");
  expect(operations).toContain("opened` and `reopened");
  expect(operations).toContain("fails open");
});
```

- [ ] **Step 2: Run the documentation assertion and verify it fails**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts
```

Expected: FAIL because the three documents do not describe admission.

- [ ] **Step 3: Document the contributor contract**

Add an `Open issue limit` section to
`docs/contributing/submission-and-review.md` with this substance:

```markdown
## Open issue limit

External GitHub accounts may keep up to 10 Tavernary issues open at one time.
The limit spans all public issue types; edits and comments do not consume
additional slots. Closing an issue restores one slot immediately.

If an account already has 10 older open issues, Tavernary closes the newer issue
with a neutral explanation. The author may close or resolve another issue and
then reopen the limited issue. New and established GitHub accounts follow the
same rule.
```

- [ ] **Step 4: Document Kit and maintainer behavior**

Add this sentence under `Submit a new Kit` in `docs/contributing/kits.md`:

```markdown
Kit submissions share Tavernary's repository-wide open-issue limit with every
other public issue type. Editing an admitted Kit submission does not consume
another slot.
```

Add an `Issue admission` subsection under `Issue intake and triage` in
`docs/maintenance/operations-runbook.md` covering:

- `admit-issue.yml` runs on `opened` and `reopened`;
- `issue-admitted` allows initial Project/Kit triage;
- `issue-limit-reached` records a per-issue queue decision, not an account
  block;
- oldest-10 ordering uses creation time and issue number;
- owner/member/collaborator bypass;
- lookup failure fails open;
- closing an issue restores capacity without resetting stored counters because
  there are no counters;
- rerun a failed admission workflow after GitHub API recovery;
- do not manually publish a submission that never passed its normal Project or
  Kit validation.

- [ ] **Step 5: Run documentation and workflow tests**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts tests/unit/workflows.test.ts
npx.cmd prettier --check docs/contributing/submission-and-review.md docs/contributing/kits.md docs/maintenance/operations-runbook.md
```

Expected: all commands PASS.

- [ ] **Step 6: Commit documentation**

```powershell
git add -- docs/contributing/submission-and-review.md docs/contributing/kits.md docs/maintenance/operations-runbook.md tests/unit/issue-admission.test.ts
git commit -m "docs(issues): explain admission limit"
```

---

### Task 5: Full Verification and Scope Audit

**Files:**

- Verify only; no planned production edits.

**Interfaces:**

- Consumes: all prior task outputs.
- Produces: completion evidence and a clean scope review.

- [ ] **Step 1: Run the complete focused admission and submission suite**

Run:

```powershell
npm.cmd test -- tests/unit/issue-admission.test.ts tests/unit/admit-issue.test.ts tests/unit/workflows.test.ts tests/unit/triage-issue.test.ts tests/unit/validate-submission.test.ts tests/unit/validate-kit-submission.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run repository-wide verification**

Run:

```powershell
npm.cmd run check
```

Expected: formatting, lint, palette audit, catalog validation/build, typecheck,
unit tests, static build, and export verification all PASS.

- [ ] **Step 3: Check whitespace and inspect the complete feature diff**

Run:

```powershell
git diff --check HEAD~4..HEAD
git diff --stat HEAD~4..HEAD
git status --short
```

Expected:

- no whitespace errors;
- only admission, triage workflow, tests, and the three approved documentation
  files appear in the four implementation commits;
- `docs/superpowers/plans/2026-07-25-about-page-visitor-features.md` remains
  untouched and untracked unless the user changes it independently.

- [ ] **Step 4: Record live workflow limitations in the handoff**

The completion report must distinguish:

- repository tests proving policy and workflow contracts;
- GitHub Actions syntax being parsed by the repository tests; and
- live `issues.opened`, `issues.reopened`, label, comment, and close behavior
  remaining unexercised until the workflows run on GitHub.

Do not create a disposable public issue without explicit user authorization.
