# In-Flight Submission Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically close later submissions for the same canonical project source and prevent a second generated PR if early deduplication is bypassed.

**Architecture:** A focused open-submission inventory module will compare earlier admitted issues with the current resolved source through `sourceDuplicateKeys()`. Project triage will turn a positive match into a distinct in-flight duplicate decision. A separate pure PR-marker helper and a pre-push workflow step will reject overlapping source-owned registry or snapshot paths as a final invariant.

**Tech Stack:** Node.js 24 ES modules, TypeScript declaration files, GitHub REST API, GitHub Actions YAML, Vitest 4, PowerShell/npm.cmd

## Global Constraints

- Canonical source identity, not names or slugs, determines duplicates.
- GitHub repository ID is authoritative when available; normalized repository and URL keys remain fallbacks.
- The lowest eligible issue number wins.
- Only open issues carrying both `project-submission` and `issue-admitted` are candidates.
- Candidates carrying `duplicate-candidate` or `submission-declined` are excluded.
- A positive in-flight match closes only the later issue and never mutates the survivor.
- Inventory failure produces `submission-inventory-unavailable` and no generation dispatch.
- Candidate-resolution failure produces `candidate-scan-incomplete` without a false duplicate.
- The generation guard runs before `git commit` and `git push`.
- Preserve the existing catalog-duplicate behavior, regeneration safeguards, and unrelated worktree changes.
- Do not combine this work with the separate label-driven routing implementation plan.

---

### Task 1: Discover earlier canonical-source submissions

**Files:**

- Create: `scripts/submissions/inflight-submissions.mjs`
- Create: `scripts/submissions/inflight-submissions.d.mts`
- Create: `tests/unit/inflight-submissions.test.ts`

**Interfaces:**

- Consumes: resolved `SourceIdentity`, current issue number, repository name, injected GitHub request, and injected safe probe
- Produces: `findEarlierInflightSubmission(input): Promise<InflightSubmissionScan>`
- Produces: either `status: "ok"` with an optional match and warnings, or `status: "retryable"` with code `submission-inventory-unavailable`

- [ ] **Step 1: Write the failing inventory tests**

Create `tests/unit/inflight-submissions.test.ts` with fixtures for Project
manifests and GitHub issues:

```ts
import { expect, test, vi } from "vitest";

import { findEarlierInflightSubmission } from "../../scripts/submissions/inflight-submissions.mjs";

function projectBody(sourceUrl: string) {
  return [
    "### Project manifest",
    "```json",
    JSON.stringify({
      schema_version: 1,
      project_type: "extension",
      source_url: sourceUrl,
      name: "Example",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    }),
    "```",
  ].join("\n");
}

function issue(
  number: number,
  sourceUrl: string,
  labels = ["project-submission", "issue-admitted"],
) {
  return {
    number,
    html_url: `https://github.com/Tavernary/Tavernary/issues/${number}`,
    state: "open",
    title: `[Project submission] ${number}`,
    body: projectBody(sourceUrl),
    labels: labels.map((name) => ({ name })),
  };
}

const currentGithubIdentity = {
  kind: "github" as const,
  canonicalUrl: "https://github.com/NewOwner/NewName",
  repository: "NewOwner/NewName",
  repositoryId: 42,
  owner: "NewOwner",
  name: "NewName",
};

async function scanGithub({
  issues,
  currentIssueNumber = 50,
  repositoryIds = { "NewOwner/NewName": 42 },
  pulls = [],
}: {
  issues: ReturnType<typeof issue>[];
  currentIssueNumber?: number;
  repositoryIds?: Record<string, number>;
  pulls?: Array<{ number: number; html_url: string }>;
}) {
  const request = vi.fn(async (path: string) => {
    if (path.includes("/issues?")) return issues;
    if (path.includes("/pulls?")) return pulls;
    const repository = path.replace("/repos/", "");
    const id = repositoryIds[repository];
    if (!id) throw Object.assign(new Error("not found"), { status: 404 });
    const [owner, name] = repository.split("/");
    return { id, owner: { login: owner }, name };
  });
  const result = await findEarlierInflightSubmission({
    repository: "Tavernary/Tavernary",
    currentIssueNumber,
    currentIdentity: currentGithubIdentity,
    request,
    probe: vi.fn(),
  });
  return { result, request };
}
```

Add a test proving the lowest earlier repository-ID match wins across a rename:

```ts
test("selects the lowest earlier issue by permanent GitHub repository ID", async () => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("/issues?")) {
      return [
        issue(18, "https://github.com/OldOwner/OldName"),
        issue(21, "https://github.com/NewOwner/NewName"),
        issue(30, "https://github.com/NewOwner/NewName"),
      ];
    }
    if (path === "/repos/OldOwner/OldName") {
      return { id: 42, owner: { login: "NewOwner" }, name: "NewName" };
    }
    if (path === "/repos/NewOwner/NewName") {
      return { id: 42, owner: { login: "NewOwner" }, name: "NewName" };
    }
    if (path.includes("/pulls?")) {
      return [{
        number: 19,
        html_url: "https://github.com/Tavernary/Tavernary/pull/19",
      }];
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  await expect(
    findEarlierInflightSubmission({
      repository: "Tavernary/Tavernary",
      currentIssueNumber: 30,
      currentIdentity: {
        kind: "github",
        canonicalUrl: "https://github.com/NewOwner/NewName",
        repository: "NewOwner/NewName",
        repositoryId: 42,
        owner: "NewOwner",
        name: "NewName",
      },
      request,
      probe: vi.fn(),
    }),
  ).resolves.toMatchObject({
    status: "ok",
    match: {
      issueNumber: 18,
      issueUrl: "https://github.com/Tavernary/Tavernary/issues/18",
      prNumber: 19,
      prUrl: "https://github.com/Tavernary/Tavernary/pull/19",
    },
  });
});
```

Add these complete focused cases:

```ts
test("treats slash case and dot-git variants as one GitHub source", async () => {
  const { result } = await scanGithub({
    issues: [issue(12, "https://github.com/NEWOWNER/NewName.git/")],
    repositoryIds: { "NEWOWNER/NewName": 42 },
  });
  expect(result).toMatchObject({
    status: "ok",
    match: { issueNumber: 12 },
  });
});

test("keeps forks distinct when repository IDs differ", async () => {
  const { result } = await scanGithub({
    issues: [issue(12, "https://github.com/ForkOwner/NewName")],
    repositoryIds: { "ForkOwner/NewName": 84 },
  });
  expect(result).toEqual({ status: "ok", match: null, warnings: [] });
});

test.each([
  {
    name: "Reddit",
    candidate: "https://old.reddit.com/r/SillyTavernAI/comments/abc123/example/",
    currentIdentity: {
      kind: "reddit" as const,
      canonicalUrl:
        "https://www.reddit.com/r/SillyTavernAI/comments/abc123/example/",
      postId: "abc123",
      subreddit: "SillyTavernAI",
      slug: "example",
    },
  },
  {
    name: "external",
    candidate: "https://example.com/projects/tool/",
    currentIdentity: {
      kind: "external" as const,
      canonicalUrl: "https://example.com/projects/tool",
      hostname: "example.com",
      pathSlug: "tool",
    },
  },
])("matches canonical $name identities", async ({ candidate, currentIdentity }) => {
  const request = vi.fn(async (path: string) => {
    if (path.includes("/issues?")) return [issue(12, candidate)];
    if (path.includes("/pulls?")) return [];
    throw new Error(`Unexpected request: ${path}`);
  });
  const result = await findEarlierInflightSubmission({
    repository: "Tavernary/Tavernary",
    currentIssueNumber: 50,
    currentIdentity,
    request,
    probe: vi.fn(),
  });
  expect(result).toMatchObject({
    status: "ok",
    match: { issueNumber: 12, prNumber: null, prUrl: null },
  });
});

test("excludes higher issues pull requests and terminal labels", async () => {
  const pullItem = {
    ...issue(10, "https://github.com/NewOwner/NewName"),
    pull_request: { url: "https://api.github.com/pulls/10" },
  };
  const { result } = await scanGithub({
    issues: [
      pullItem,
      issue(60, "https://github.com/NewOwner/NewName"),
      issue(11, "https://github.com/NewOwner/NewName", [
        "project-submission",
        "issue-admitted",
        "duplicate-candidate",
      ]),
      issue(12, "https://github.com/NewOwner/NewName", [
        "project-submission",
        "issue-admitted",
        "submission-declined",
      ]),
    ],
  });
  expect(result).toEqual({ status: "ok", match: null, warnings: [] });
});

test("paginates the open admitted issue inventory", async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) =>
    issue(index + 1, "https://github.com/ignored/repo", [
      "project-submission",
      "issue-admitted",
      "duplicate-candidate",
    ]),
  );
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("page=1")) return firstPage;
    if (path.endsWith("page=2")) {
      return [issue(101, "https://github.com/NewOwner/NewName")];
    }
    if (path === "/repos/NewOwner/NewName") {
      return { id: 42, owner: { login: "NewOwner" }, name: "NewName" };
    }
    if (path.includes("/pulls?")) return [];
    throw new Error(`Unexpected request: ${path}`);
  });
  const result = await findEarlierInflightSubmission({
    repository: "Tavernary/Tavernary",
    currentIssueNumber: 150,
    currentIdentity: currentGithubIdentity,
    request,
    probe: vi.fn(),
  });
  expect(result).toMatchObject({
    status: "ok",
    match: { issueNumber: 101 },
  });
  expect(request).toHaveBeenCalledWith(expect.stringContaining("page=2"));
});

test("returns a retryable result when inventory listing fails", async () => {
  const result = await findEarlierInflightSubmission({
    repository: "Tavernary/Tavernary",
    currentIssueNumber: 50,
    currentIdentity: currentGithubIdentity,
    request: vi.fn().mockRejectedValue(new Error("GitHub 503")),
    probe: vi.fn(),
  });
  expect(result).toEqual({
    status: "retryable",
    code: "submission-inventory-unavailable",
    message: "GitHub 503",
  });
});

test("skips a malformed candidate and reports candidate-scan-incomplete", async () => {
  const malformed = { ...issue(12, "https://example.com"), body: "invalid" };
  const { result } = await scanGithub({ issues: [malformed] });
  expect(result).toMatchObject({ status: "ok", match: null });
  expect(result.status === "ok" && result.warnings).toEqual([
    expect.stringContaining("candidate-scan-incomplete: Issue #12"),
  ]);
});

test("returns the issue without a PR when generation has not started", async () => {
  const { result } = await scanGithub({
    issues: [issue(12, "https://github.com/NewOwner/NewName")],
    pulls: [],
  });
  expect(result).toMatchObject({
    status: "ok",
    match: { issueNumber: 12, prNumber: null, prUrl: null },
  });
});
```

- [ ] **Step 2: Run the new suite and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/inflight-submissions.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement label normalization and paginated inventory**

Create `scripts/submissions/inflight-submissions.mjs` with:

```js
import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { submissionBranch } from "./project-submission-pr.mjs";
import {
  parseSourceIdentity,
  resolveSourceIdentity,
  sourceDuplicateKeys,
} from "./source-identity.mjs";

const terminalLabels = new Set([
  "duplicate-candidate",
  "submission-declined",
]);

function issueLabels(issue) {
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

export async function listOpenAdmittedProjectSubmissions({
  repository,
  request,
}) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/issues?state=open&labels=project-submission%2Cissue-admitted&per_page=100&page=${page}`,
    );
    issues.push(...batch);
    if (batch.length < 100) return issues;
  }
}
```

- [ ] **Step 4: Implement bounded candidate identity resolution**

Add:

```js
async function candidateIdentity(issue, { request, probe }) {
  const parsed = parseProjectSubmissionIssue(issue.body ?? "");
  if (!parsed.valid) {
    throw new Error(`Issue #${issue.number} has no valid Project manifest.`);
  }
  const structural = parseSourceIdentity(parsed.manifest.source_url);
  try {
    if (structural.kind === "github") {
      const identity = await resolveSourceIdentity(structural, {
        resolveGithub: async (repository) => {
          const observed = await request(`/repos/${repository}`);
          return {
            id: observed.id,
            owner: observed.owner.login,
            name: observed.name,
          };
        },
      });
      return { identity };
    }
    const identity = await resolveSourceIdentity(structural, { probe });
    return { identity };
  } catch (error) {
    if (structural.kind !== "reddit-share") {
      return {
        identity: structural,
        warning: `candidate-scan-incomplete: Issue #${issue.number}: ${error.message}`,
      };
    }
    throw error;
  }
}

function identitiesOverlap(left, right) {
  const leftKeys = new Set(sourceDuplicateKeys(left));
  return sourceDuplicateKeys(right).some((key) => leftKeys.has(key));
}
```

Normalize the return so successful resolution and structural fallback both
produce `{ identity, warning?: string }`.

- [ ] **Step 5: Implement deterministic match and optional PR lookup**

Add:

```js
export async function findEarlierInflightSubmission({
  repository,
  currentIssueNumber,
  currentIdentity,
  request,
  probe,
}) {
  let issues;
  try {
    issues = await listOpenAdmittedProjectSubmissions({
      repository,
      request,
    });
  } catch (error) {
    return {
      status: "retryable",
      code: "submission-inventory-unavailable",
      message: error.message,
    };
  }

  const warnings = [];
  const candidates = issues
    .filter((issue) => {
      const labels = issueLabels(issue);
      return (
        !issue.pull_request &&
        issue.state === "open" &&
        issue.number < currentIssueNumber &&
        labels.includes("project-submission") &&
        labels.includes("issue-admitted") &&
        !labels.some((label) => terminalLabels.has(label))
      );
    })
    .sort((left, right) => left.number - right.number);

  for (const issue of candidates) {
    try {
      const resolved = await candidateIdentity(issue, { request, probe });
      if (resolved.warning) warnings.push(resolved.warning);
      if (!identitiesOverlap(currentIdentity, resolved.identity)) continue;

      const owner = repository.split("/")[0];
      const head = `${owner}:${submissionBranch(issue.number)}`;
      let pull = null;
      try {
        const pulls = await request(
          `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(head)}&per_page=1`,
        );
        pull = pulls[0] ?? null;
      } catch (error) {
        warnings.push(
          `candidate-scan-incomplete: PR lookup for issue #${issue.number}: ${error.message}`,
        );
      }
      return {
        status: "ok",
        match: {
          issueNumber: issue.number,
          issueUrl: issue.html_url,
          prNumber: pull?.number ?? null,
          prUrl: pull?.html_url ?? null,
          identity: resolved.identity,
        },
        warnings,
      };
    } catch (error) {
      warnings.push(
        `candidate-scan-incomplete: Issue #${issue.number}: ${error.message}`,
      );
    }
  }

  return { status: "ok", match: null, warnings };
}
```

- [ ] **Step 6: Add exact declaration types**

Create `scripts/submissions/inflight-submissions.d.mts` with:

```ts
import type { SafeProbeOptions, SafeProbeResult } from "./safe-source-fetch.mjs";
import type { SourceIdentity } from "./source-identity.mjs";
export type InflightSubmissionGitHubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export interface InflightSubmissionMatch {
  issueNumber: number;
  issueUrl: string;
  prNumber: number | null;
  prUrl: string | null;
  identity: SourceIdentity;
}

export type InflightSubmissionScan =
  | {
      status: "ok";
      match: InflightSubmissionMatch | null;
      warnings: string[];
    }
  | {
      status: "retryable";
      code: "submission-inventory-unavailable";
      message: string;
    };

export function listOpenAdmittedProjectSubmissions(input: {
  repository: string;
  request: InflightSubmissionGitHubRequest;
}): Promise<any[]>;

export function findEarlierInflightSubmission(input: {
  repository: string;
  currentIssueNumber: number;
  currentIdentity: SourceIdentity;
  request: InflightSubmissionGitHubRequest;
  probe: (
    url: string,
    options?: SafeProbeOptions,
  ) => Promise<SafeProbeResult>;
}): Promise<InflightSubmissionScan>;
```

- [ ] **Step 7: Run the new suite and confirm GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/inflight-submissions.test.ts
```

Expected: all inventory, identity, winner, warning, and pagination tests pass.

- [ ] **Step 8: Commit open-submission discovery**

```powershell
git add -- scripts/submissions/inflight-submissions.mjs scripts/submissions/inflight-submissions.d.mts tests/unit/inflight-submissions.test.ts
git commit -m "feat(submissions): discover open duplicates"
```

### Task 2: Close later duplicates during Project triage

**Files:**

- Modify: `scripts/submissions/admission.mjs:19-45`
- Modify: `scripts/submissions/admission.d.mts:14-63`
- Modify: `scripts/submissions/triage-issue.mjs:120-250,632-720`
- Modify: `scripts/submissions/triage-issue.d.mts:17-105`
- Modify: `tests/unit/project-submission-admission.test.ts:18-68`
- Modify: `tests/unit/triage-issue.test.ts:234-268,515-783`

**Interfaces:**

- Consumes: `InflightSubmissionMatch` and scan warnings from Task 1
- Produces: `ProjectSubmissionDecision` status `inflight-duplicate`
- Produces: stable duplicate comment, `duplicate-candidate`, closed later issue, and `admitted=false` workflow output

- [ ] **Step 1: Write the failing admission decision test**

Add to `tests/unit/project-submission-admission.test.ts`:

```ts
test("recognizes an in-flight duplicate before admission", () => {
  const inflightDuplicate = {
    issueNumber: 72,
    issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
    prNumber: 73,
    prUrl: "https://github.com/Tavernary/Tavernary/pull/73",
    identity: githubIdentity,
  };

  expect(
    evaluateProjectSubmission(
      admittedFixture({ inflightDuplicate }),
    ),
  ).toMatchObject({
    status: "inflight-duplicate",
    existingSubmission: {
      issueNumber: 72,
      prNumber: 73,
    },
  });
});
```

Extend the existing permanent catalog duplicate test to also supply
`inflightDuplicate` and assert that `status: "duplicate"` still wins.

- [ ] **Step 2: Run admission tests and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts
```

Expected: FAIL because the input and decision unions do not support an
in-flight match.

- [ ] **Step 3: Add the in-flight decision after catalog duplicate evaluation**

In `scripts/submissions/admission.mjs`, preserve the existing published
duplicate check, then add:

```js
  if (input.inflightDuplicate) {
    return {
      status: "inflight-duplicate",
      identity: input.identity,
      existingSubmission: input.inflightDuplicate,
    };
  }
```

In `scripts/submissions/admission.d.mts`, import
`InflightSubmissionMatch`, add optional
`inflightDuplicate?: InflightSubmissionMatch | null` to
`ProjectSubmissionAdmissionInput`, and add:

```ts
  | {
      status: "inflight-duplicate";
      identity: SourceIdentity;
      existingSubmission: InflightSubmissionMatch;
    }
```

to `ProjectSubmissionDecision`.

- [ ] **Step 4: Confirm the admission suite is GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-admission.test.ts
```

Expected: published and in-flight duplicate precedence tests pass.

- [ ] **Step 5: Write failing triage rendering tests**

Add a `buildProjectSubmissionTriage` test using:

```ts
const decision = {
  status: "inflight-duplicate" as const,
  identity: {
    kind: "github" as const,
    canonicalUrl: "https://github.com/owner/repo",
    repository: "owner/repo",
    repositoryId: 42,
    owner: "owner",
    name: "repo",
  },
  existingSubmission: {
    issueNumber: 72,
    issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
    prNumber: 73,
    prUrl: "https://github.com/Tavernary/Tavernary/pull/73",
    identity: {
      kind: "github" as const,
      canonicalUrl: "https://github.com/owner/repo",
      repository: "owner/repo",
      repositoryId: 42,
      owner: "owner",
      name: "repo",
    },
  },
};
```

Assert exactly:

```ts
expect(mutation).toMatchObject({
  labels: expect.arrayContaining(["project-submission", "duplicate-candidate"]),
  close: true,
  closeReason: "not_planned",
  dispatchGeneration: false,
});
expect(mutation.labels).not.toContain("needs-maintainer-review");
expect(mutation.labels).not.toContain("submission-pr-open");
expect(mutation.commentBody).toContain("issue #72");
expect(mutation.commentBody).toContain("PR #73");
expect(mutation.commentBody).toContain("review continues");
```

Add a second rendering test where `prNumber` and `prUrl` are `null`; it must
link the surviving issue without rendering an undefined PR.

- [ ] **Step 6: Run triage tests and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/triage-issue.test.ts
```

Expected: FAIL because `decisionLabel`, `decisionComment`, and close handling do
not recognize `inflight-duplicate`.

- [ ] **Step 7: Render and close the in-flight duplicate state**

In `scripts/submissions/triage-issue.mjs`:

```js
function decisionLabel(decision, currentLabels) {
  if (
    decision.status === "admitted" &&
    currentLabels.includes("submission-pr-open")
  ) {
    return "submission-pr-open";
  }
  return {
    admitted: "needs-maintainer-review",
    duplicate: "duplicate-candidate",
    "inflight-duplicate": "duplicate-candidate",
    "needs-information": "needs-information",
    retryable: "submission-retryable",
  }[decision.status];
}
```

Add to `decisionComment`:

```js
  if (decision.status === "inflight-duplicate") {
    const existing = decision.existingSubmission;
    const issueLink = `[issue #${existing.issueNumber}](${existing.issueUrl})`;
    const prLink =
      existing.prNumber && existing.prUrl
        ? ` and [PR #${existing.prNumber}](${existing.prUrl})`
        : "";
    return `This source already has an earlier admitted submission at ${issueLink}${prLink}; review continues there. This later duplicate has been closed.`;
  }
```

Change closure predicates to:

```js
  const closesAsDuplicate = ["duplicate", "inflight-duplicate"].includes(
    decision.status,
  );
```

Use `closesAsDuplicate` for `close` and `closeReason`.

- [ ] **Step 8: Integrate inventory before the admission decision**

Import `findEarlierInflightSubmission` into
`scripts/submissions/triage-issue.mjs`. After current source inspection and
before `evaluateProjectSubmission`, run:

```js
    const inflightScan =
      inspection.identity && inspection.sourceProbe.status === "ok"
        ? await findEarlierInflightSubmission({
            repository,
            currentIssueNumber: issue.number,
            currentIdentity: inspection.identity,
            request,
            probe,
          })
        : { status: "ok", match: null, warnings: [] };

    if (inflightScan.status === "retryable") {
      decision = {
        status: "retryable",
        code: inflightScan.code,
        message: inflightScan.message,
      };
    } else {
      decision = evaluateProjectSubmission({
        manifest: parsed.manifest,
        identity: inspection.identity,
        sourceProbe: inspection.sourceProbe,
        repository: inspection.repository,
        existingProjects: data.projects
          .map(projectSubmissionExistingProject)
          .filter((project) => project !== null),
        inflightDuplicate: inflightScan.match,
        frontendResolution,
        errors: inspection.errors,
        warnings: inflightScan.warnings,
      });
    }
```

Keep the existing final live issue/body recheck after this scan.

- [ ] **Step 9: Update process-level request fixtures and add an end-to-end unit**

For each Project `processProjectSubmissionTriage` request mock in
`tests/unit/triage-issue.test.ts`, return `[]` when the path starts with:

```ts
"/repos/Tavernary/Tavernary/issues?state=open&labels=project-submission%2Cissue-admitted"
```

This applies to:

- `processes an admitted issue through injected GitHub mutations`
- `accepts a manually customized project title after routing`
- `does not apply a stale decision after the issue body changes`
- `does not dispatch after the routing label is revoked` when inventory is
  reached

Then add a process-level test where issue #74 resolves to repository ID `42`,
the inventory contains admitted issue #72 with the same source, and the PR
lookup returns PR #73. Assert:

```ts
expect(decision.status).toBe("inflight-duplicate");
expect(outputs).toEqual({ admitted: "false", issue_number: "74" });
expect(requests).toContainEqual(
  expect.objectContaining({
    path: "/repos/Tavernary/Tavernary/issues/74",
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  }),
);
expect(requests).toContainEqual(
  expect.objectContaining({
    path: "/repos/Tavernary/Tavernary/issues/74/labels",
    method: "POST",
    body: JSON.stringify({ labels: ["duplicate-candidate"] }),
  }),
);
```

Also add a process test where inventory listing throws. Assert
`submission-retryable`, `admitted=false`, and no generator dispatch output.

- [ ] **Step 10: Update declarations and confirm focused GREEN**

Update `scripts/submissions/triage-issue.d.mts` only where the expanded
`ProjectSubmissionDecision` union flows through existing marker/mutation types;
do not add a second duplicate-decision shape.

Run:

```powershell
npm.cmd test -- tests/unit/inflight-submissions.test.ts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts
```

Expected: all discovery, decision, rendering, mutation, and process tests pass.

- [ ] **Step 11: Commit triage integration**

```powershell
git add -- scripts/submissions/admission.mjs scripts/submissions/admission.d.mts scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts
git commit -m "fix(submissions): close in-flight duplicates"
```

### Task 3: Reject generated-path collisions before push

**Files:**

- Modify: `scripts/submissions/project-submission-pr.mjs:84-110`
- Modify: `scripts/submissions/project-submission-pr.d.mts:1-46`
- Modify: `tests/unit/project-submission-pr.test.ts:1-135`
- Modify: `.github/workflows/generate-project-submission.yml:139-194`
- Modify: `tests/unit/workflows.test.ts:697-743`

**Interfaces:**

- Consumes: current issue number, intended generated paths, repository full name, and open REST PR objects
- Produces: `findSubmissionPathCollision(input): GeneratedPathCollision | null`
- Guarantees: the workflow performs collision inspection before any generated commit or push

- [ ] **Step 1: Write failing pure collision tests**

Import `findSubmissionPathCollision` in
`tests/unit/project-submission-pr.test.ts` and add:

```ts
function openPull({
  number,
  issueNumber,
  paths = marker.generated_paths,
  repository = "Tavernary/Tavernary",
  branch = `automation/project-submission-${issueNumber}`,
}: {
  number: number;
  issueNumber: number;
  paths?: string[];
  repository?: string;
  branch?: string;
}) {
  return {
    number,
    html_url: `https://github.com/Tavernary/Tavernary/pull/${number}`,
    body: [
      "<!-- tavernary-project-submission-pr",
      JSON.stringify({
        schema_version: 1,
        issue_number: issueNumber,
        generated_head_sha: "b".repeat(40),
        generated_paths: paths,
      }),
      "-->",
    ].join("\n"),
    head: {
      ref: branch,
      repo: { full_name: repository },
    },
  };
}

test("finds an overlapping trusted generated PR", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: marker.generated_paths,
      pulls: [openPull({ number: 73, issueNumber: 72 })],
    }),
  ).toMatchObject({
    issueNumber: 72,
    prNumber: 73,
    paths: marker.generated_paths,
  });
});
```

Add these complete trust-boundary cases:

```ts
test("ignores the current issue PR during regeneration", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 72,
      generatedPaths: marker.generated_paths,
      pulls: [openPull({ number: 73, issueNumber: 72 })],
    }),
  ).toBeNull();
});

test("ignores non-overlapping generated paths", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: marker.generated_paths,
      pulls: [
        openPull({
          number: 73,
          issueNumber: 72,
          paths: ["data/registry/projects/other-project.json"],
        }),
      ],
    }),
  ).toBeNull();
});

test("ignores shared vocabulary path overlap", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: ["data/vocabularies/frontends.json"],
      pulls: [
        openPull({
          number: 73,
          issueNumber: 72,
          paths: ["data/vocabularies/frontends.json"],
        }),
      ],
    }),
  ).toBeNull();
});

test("ignores fork marker spoofing", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: marker.generated_paths,
      pulls: [
        openPull({
          number: 73,
          issueNumber: 72,
          repository: "attacker/Tavernary",
        }),
      ],
    }),
  ).toBeNull();
});

test("ignores a marker on an unexpected branch", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: marker.generated_paths,
      pulls: [
        openPull({
          number: 73,
          issueNumber: 72,
          branch: "feature/not-owned-by-submission",
        }),
      ],
    }),
  ).toBeNull();
});

test("ignores malformed markers", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: marker.generated_paths,
      pulls: [{
        ...openPull({ number: 73, issueNumber: 72 }),
        body: "<!-- tavernary-project-submission-pr\nnot-json\n-->",
      }],
    }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run PR-marker tests and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-pr.test.ts
```

Expected: FAIL because `findSubmissionPathCollision` does not exist.

- [ ] **Step 3: Implement the pure trusted collision guard**

Add to `scripts/submissions/project-submission-pr.mjs`:

```js
export function findSubmissionPathCollision({
  repository,
  issueNumber,
  generatedPaths,
  pulls,
}) {
  const sourceOwnedPath = (path) =>
    /^data\/registry\/projects\/[^/]+\.json$/u.test(path) ||
    /^data\/snapshots\/github\/[^/]+\.json$/u.test(path);
  const intended = new Set(generatedPaths.filter(sourceOwnedPath));
  for (const pull of pulls) {
    const marker = parseSubmissionPullRequestMarker(pull.body ?? "");
    if (
      !marker ||
      marker.issue_number === issueNumber ||
      pull.head?.repo?.full_name?.toLowerCase() !== repository.toLowerCase() ||
      pull.head?.ref !== submissionBranch(marker.issue_number)
    ) {
      continue;
    }
    const paths = marker.generated_paths.filter(
      (path) => sourceOwnedPath(path) && intended.has(path),
    );
    if (paths.length === 0) continue;
    return {
      issueNumber: marker.issue_number,
      prNumber: pull.number,
      prUrl: pull.html_url,
      paths,
    };
  }
  return null;
}
```

Declare:

```ts
export interface GeneratedPathCollision {
  issueNumber: number;
  prNumber: number;
  prUrl: string;
  paths: string[];
}

export function findSubmissionPathCollision(input: {
  repository: string;
  issueNumber: number;
  generatedPaths: string[];
  pulls: Array<{
    number: number;
    html_url: string;
    body?: string | null;
    head?: { ref?: string; repo?: { full_name?: string | null } | null };
  }>;
}): GeneratedPathCollision | null;
```

- [ ] **Step 4: Run PR-marker tests and confirm GREEN**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-pr.test.ts
```

Expected: trusted overlap is detected and all current/fork/branch/malformed
cases are ignored.

- [ ] **Step 5: Write failing workflow-order assertions**

Extend `generates submission PRs with scoped permissions and manual recovery`
in `tests/unit/workflows.test.ts`:

```ts
expect(source).toContain("Prepare generated path set");
expect(source).toContain("Reject conflicting open submission paths");
expect(source).toContain("findSubmissionPathCollision");
expect(source).toContain("gh api --paginate --slurp");
expect(source).toContain("generated-paths.txt");
expect(source.indexOf("Reject conflicting open submission paths")).toBeLessThan(
  source.indexOf("git commit -m"),
);
expect(source.indexOf("Reject conflicting open submission paths")).toBeLessThan(
  source.indexOf("git push origin"),
);
```

- [ ] **Step 6: Run workflow tests and confirm RED**

Run:

```powershell
npm.cmd test -- tests/unit/workflows.test.ts
```

Expected: FAIL because generated paths are prepared inside the commit step and
there is no open-PR collision inspection.

- [ ] **Step 7: Extract generated-path preparation before commit**

In `.github/workflows/generate-project-submission.yml`, insert after catalog
validation:

```yaml
      - name: Prepare generated path set
        id: paths
        shell: bash
        run: |
          set -euo pipefail
          project_id="$(node -p "JSON.parse(require('fs').readFileSync(process.env.RUNNER_TEMP + '/admission-report.json','utf8')).project_id")"
          generated_paths=("data/registry/projects/${project_id}.json")
          if [[ -f "data/snapshots/github/${project_id}.json" ]]; then
            generated_paths+=("data/snapshots/github/${project_id}.json")
          fi
          if [[ -n "$(git status --porcelain -- data/vocabularies/frontends.json)" ]]; then
            generated_paths+=("data/vocabularies/frontends.json")
          fi
          while IFS= read -r previous_path; do
            [[ -z "$previous_path" ]] && continue
            case "$previous_path" in
              data/registry/projects/*.json|data/snapshots/github/*.json|data/vocabularies/frontends.json)
                generated_paths+=("$previous_path")
                ;;
              *)
                echo "::error::Refusing unsafe generated path: $previous_path"
                exit 1
                ;;
            esac
          done < "${RUNNER_TEMP}/previous-generated-paths.txt"
          mapfile -t generated_paths < <(printf '%s\n' "${generated_paths[@]}" | sort -u)
          printf '%s\n' "${generated_paths[@]}" > "${RUNNER_TEMP}/generated-paths.txt"
          echo "project_id=$project_id" >> "$GITHUB_OUTPUT"
```

Remove this exact path-building block from `Commit generated paths`. That step
must instead begin with:

```bash
mapfile -t generated_paths < "${RUNNER_TEMP}/generated-paths.txt"
git add -- "${generated_paths[@]}"
```

Set `PROJECT_ID: ${{ steps.paths.outputs.project_id }}` in the commit step and
write `project_id=$PROJECT_ID` to its outputs.

- [ ] **Step 8: Add the fail-closed open-PR inspection**

Insert between path preparation and commit:

```yaml
      - name: Reject conflicting open submission paths
        shell: bash
        run: |
          set -euo pipefail
          pulls_path="${RUNNER_TEMP}/open-project-submission-pr-pages.json"
          gh api --paginate --slurp \
            "repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100" \
            > "$pulls_path"
          node --input-type=module -e "
            import fs from 'node:fs';
            import { findSubmissionPathCollision } from './scripts/submissions/project-submission-pr.mjs';
            const pages = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
            const generatedPaths = fs.readFileSync(process.argv[2], 'utf8')
              .split(/\r?\n/u).filter(Boolean);
            const collision = findSubmissionPathCollision({
              repository: process.env.GITHUB_REPOSITORY,
              issueNumber: Number(process.env.ISSUE_NUMBER),
              generatedPaths,
              pulls: pages.flat(),
            });
            if (collision) {
              throw new Error(
                'Generated paths already belong to issue #' +
                collision.issueNumber + ' and PR #' + collision.prNumber +
                ': ' + collision.prUrl + ' (' + collision.paths.join(', ') + ')',
              );
            }
          " "$pulls_path" "${RUNNER_TEMP}/generated-paths.txt"
```

Do not add `continue-on-error`; API or parse failures must stop before commit.

- [ ] **Step 9: Run focused workflow and collision suites**

Run:

```powershell
npm.cmd test -- tests/unit/project-submission-pr.test.ts tests/unit/workflows.test.ts
```

Expected: all collision trust-boundary and workflow-order tests pass.

- [ ] **Step 10: Run complete static and unit verification**

Run each command independently:

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
```

Expected: every command exits `0`. If an unrelated pre-existing failure
appears, preserve its exact output and confirm every focused suite from Tasks
1-3 still passes before changing scope.

- [ ] **Step 11: Inspect the complete implementation diff**

Run:

```powershell
git diff --check
git status --short
git diff -- scripts/submissions/inflight-submissions.mjs scripts/submissions/inflight-submissions.d.mts scripts/submissions/admission.mjs scripts/submissions/admission.d.mts scripts/submissions/triage-issue.mjs scripts/submissions/triage-issue.d.mts scripts/submissions/project-submission-pr.mjs scripts/submissions/project-submission-pr.d.mts tests/unit/inflight-submissions.test.ts tests/unit/project-submission-admission.test.ts tests/unit/triage-issue.test.ts tests/unit/project-submission-pr.test.ts .github/workflows/generate-project-submission.yml tests/unit/workflows.test.ts
```

Expected: no whitespace errors, no edits outside the fourteen named
implementation files, and no unrelated staged changes.

- [ ] **Step 12: Commit the generation invariant**

```powershell
git add -- scripts/submissions/project-submission-pr.mjs scripts/submissions/project-submission-pr.d.mts tests/unit/project-submission-pr.test.ts .github/workflows/generate-project-submission.yml tests/unit/workflows.test.ts
git commit -m "fix(submissions): guard generated path claims"
```

- [ ] **Step 13: Verify the three implementation commits**

Run:

```powershell
git log -3 --oneline
git show --stat --oneline HEAD~2
git show --stat --oneline HEAD~1
git show --stat --oneline HEAD
git status --short
```

Expected: discovery, triage integration, and generation guard are separate
commits; the worktree contains only explicitly preserved unrelated changes.
