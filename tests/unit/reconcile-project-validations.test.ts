import { expect, test } from "vitest";

import { reconcileProjectValidations } from "../../scripts/submissions/reconcile-project-validations.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";
import {
  PROJECT_VALIDATION_HANDOFF_GRACE_MS,
  PROJECT_VALIDATION_REGENERATION_GRACE_MS,
  PROJECT_VALIDATION_STATE_MARKER,
} from "../../scripts/submissions/project-validation-reconciliation.mjs";

const REPOSITORY = "MentallyQuill/Tavernary";
const HEAD_SHA = "c".repeat(40);
const NEXT_HEAD_SHA = "e".repeat(40);
const OLD_HEAD_SHA = "d".repeat(40);
const NOW = Date.parse("2026-08-23T12:00:00.000Z");

type JsonObject = Record<string, unknown>;
type Pull = ReturnType<typeof pullFixture>;
type WorkflowRun = ReturnType<typeof runFixture>;

function transactionFixture({
  issueNumber = 620,
  headSha = HEAD_SHA,
  publicationMode = "automatic",
  producer = "project-submission",
}: {
  issueNumber?: number;
  headSha?: string;
  publicationMode?: "automatic" | "manual";
  producer?: "project-submission" | "project-owner-request";
} = {}) {
  return createProjectPublicationTransaction({
    schema_version: 2,
    operation: "create",
    producer,
    publication_mode: publicationMode,
    issue_number: issueNumber,
    project_ids: ["example-project"],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor: { id: 1, login: "submitter", type: "User" },
    authority_type:
      publicationMode === "manual" ? "tavernary-staff" : "community-submitter",
    input_digest: "a".repeat(64),
    input_fingerprints: { projects: {}, source: null },
    base_sha: "b".repeat(40),
    generated_head_sha: headSha,
    generated_paths: [
      "data/registry/projects/example-project.json",
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
    ],
    policy_version: "2026-08-23",
    copy_result: null,
  });
}

function transactionBody(transaction = transactionFixture()) {
  return `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`;
}

function pullFixture({
  number = 620,
  state = "open",
  headSha = HEAD_SHA,
  transactionHeadSha = headSha,
  headRef = `automation/project-submission-${number}`,
  headRepository = REPOSITORY,
  baseRef = "main",
  body,
  publicationMode = "automatic",
  updatedAt = new Date(NOW).toISOString(),
}: {
  number?: number;
  state?: "open" | "closed";
  headSha?: string;
  transactionHeadSha?: string;
  headRef?: string;
  headRepository?: string;
  baseRef?: string;
  body?: string;
  publicationMode?: "automatic" | "manual";
  updatedAt?: string;
} = {}) {
  const transaction = transactionFixture({
    issueNumber: number,
    headSha: transactionHeadSha,
    publicationMode,
  });
  return {
    id: 1_000 + number,
    node_id: `PR_${number}`,
    number,
    state,
    locked: false,
    title: `Generated project transaction #${number}`,
    body: body ?? transactionBody(transaction),
    draft: false,
    html_url: `https://github.com/${REPOSITORY}/pull/${number}`,
    url: `https://api.github.com/repos/${REPOSITORY}/pulls/${number}`,
    issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${number}`,
    created_at: new Date(NOW - 60_000).toISOString(),
    updated_at: updatedAt,
    closed_at: state === "closed" ? updatedAt : null,
    merged_at: null,
    merge_commit_sha: null,
    user: {
      login: "github-actions[bot]",
      id: 41_982_982,
      node_id: "BOT_1",
      type: "Bot",
      site_admin: false,
    },
    head: {
      label: `MentallyQuill:${headRef}`,
      ref: headRef,
      sha: headSha,
      user: { login: "MentallyQuill", id: 2_625_904, type: "User" },
      repo: {
        id: 99,
        node_id: "R_99",
        name: "Tavernary",
        full_name: headRepository,
        private: false,
        fork: false,
        default_branch: "main",
      },
    },
    base: {
      label: `MentallyQuill:${baseRef}`,
      ref: baseRef,
      sha: "b".repeat(40),
      user: { login: "MentallyQuill", id: 2_625_904, type: "User" },
      repo: {
        id: 99,
        node_id: "R_99",
        name: "Tavernary",
        full_name: REPOSITORY,
        private: false,
        fork: false,
        default_branch: "main",
      },
    },
    labels: [],
    requested_reviewers: [],
    requested_teams: [],
  };
}

function issueFixture(number = 620) {
  return {
    id: 2_000 + number,
    node_id: `I_${number}`,
    number,
    state: "open",
    state_reason: null,
    title: `Project submission ${number}`,
    body: "Submitted project",
    user: {
      login: "submitter",
      id: 1,
      node_id: "U_1",
      type: "User",
      site_admin: false,
    },
    labels: [
      { id: 1, node_id: "L_1", name: "issue-admitted", color: "0e8a16" },
      {
        id: 2,
        node_id: "L_2",
        name: "project-submission",
        color: "1d76db",
      },
    ],
    assignee: null,
    assignees: [],
    milestone: null,
    locked: false,
    active_lock_reason: null,
    comments: 1,
    pull_request: null,
    closed_at: null,
    created_at: new Date(NOW - 120_000).toISOString(),
    updated_at: new Date(NOW - 60_000).toISOString(),
    html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
    url: `https://api.github.com/repos/${REPOSITORY}/issues/${number}`,
  };
}

function runFixture({
  id,
  headSha = HEAD_SHA,
  headBranch = "automation/project-submission-620",
  conclusion,
  status = conclusion === null ? "in_progress" : "completed",
  createdAt = new Date(NOW - id * 1_000).toISOString(),
  updatedAt = createdAt,
  displayTitle = `Site: Validate ${headBranch}`,
  workflow = "ci.yml",
  runAttempt = 1,
}: {
  id: number;
  headSha?: string;
  headBranch?: string;
  conclusion: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  displayTitle?: string;
  workflow?: "ci.yml" | "publish-project-transaction.yml";
  runAttempt?: number;
}) {
  const publication = workflow === "publish-project-transaction.yml";
  return {
    id,
    node_id: `WFR_${id}`,
    name: publication
      ? "Projects: Publish validated transaction"
      : "Site: Validate changes",
    path: `.github/workflows/${workflow}`,
    display_title: displayTitle,
    run_number: id,
    event: "workflow_dispatch",
    status,
    conclusion,
    workflow_id: publication ? 202 : 101,
    check_suite_id: id + 10_000,
    check_suite_node_id: `CS_${id}`,
    head_branch: headBranch,
    head_sha: headSha,
    run_attempt: runAttempt,
    created_at: createdAt,
    updated_at: updatedAt,
    html_url: `https://github.com/${REPOSITORY}/actions/runs/${id}`,
    url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}`,
    jobs_url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}/jobs`,
    rerun_url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}/rerun`,
    workflow_url: `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${publication ? 202 : 101}`,
  };
}

class FakeGitHub {
  pulls: Pull[];
  pullPages: Pull[][] | null = null;
  livePulls = new Map<number, Pull>();
  livePullReads = new Map<number, Pull[]>();
  issues = new Map<number, ReturnType<typeof issueFixture>>();
  comments = new Map<number, JsonObject[]>();
  labels = new Map<string, JsonObject>();
  validationPages = new Map<string, WorkflowRun[][]>();
  publicationPages: WorkflowRun[][] = [[]];
  failures = new Map<string, Error & { status?: number }>();
  requests: Array<{ method: string; path: string; body?: JsonObject }> = [];

  constructor(pulls: Pull[]) {
    this.pulls = pulls;
    for (const pull of pulls) {
      this.livePulls.set(pull.number, pull);
      this.issues.set(pull.number, issueFixture(pull.number));
      this.comments.set(pull.number, [
        {
          id: 9_000 + pull.number,
          node_id: `IC_${pull.number}`,
          body: "A contributor comment that the controller must preserve.",
          user: { login: "submitter", id: 1, type: "User" },
          created_at: new Date(NOW - 30_000).toISOString(),
          updated_at: new Date(NOW - 30_000).toISOString(),
          html_url: `https://github.com/${REPOSITORY}/issues/${pull.number}#issuecomment-1`,
        },
      ]);
    }
    this.labels.set("submission-validation-retrying", {
      id: 10,
      node_id: "L_10",
      name: "submission-validation-retrying",
      color: "fbca04",
      description:
        "Tavernary is automatically retrying this exact generated head.",
    });
    this.labels.set("submission-validation-blocked", {
      id: 11,
      node_id: "L_11",
      name: "submission-validation-blocked",
      color: "d93f0b",
      description:
        "Automatic exact-head validation or publication attempts are exhausted.",
    });
  }

  mutationRequests() {
    return this.requests.filter(({ method }) => method !== "GET");
  }

  request = async (path: string, options: JsonObject = {}) => {
    const method = String(options.method ?? "GET");
    const body =
      typeof options.body === "string"
        ? (JSON.parse(options.body) as JsonObject)
        : undefined;
    this.requests.push({ method, path, ...(body ? { body } : {}) });
    const failure = this.failures.get(`${method} ${path}`);
    if (failure) throw failure;

    const url = new URL(path, "https://api.github.test");
    const pathname = url.pathname;
    const page = Number(url.searchParams.get("page") ?? "1");

    if (method === "GET" && pathname === `/repos/${REPOSITORY}`) {
      return {
        id: 99,
        node_id: "R_99",
        name: "Tavernary",
        full_name: REPOSITORY,
        private: false,
        fork: false,
        default_branch: "main",
      };
    }
    if (method === "GET" && pathname === `/repos/${REPOSITORY}/pulls`) {
      const pages = this.pullPages ?? [this.pulls];
      return pages[page - 1] ?? [];
    }
    const livePullMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/pulls/(\\d+)$`, "u"),
    );
    if (method === "GET" && livePullMatch) {
      const number = Number(livePullMatch[1]);
      const reads = this.livePullReads.get(number);
      if (reads?.length) return reads.shift();
      const pull = this.livePulls.get(number);
      if (pull) return pull;
    }
    if (
      method === "GET" &&
      pathname === `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs`
    ) {
      const branch = url.searchParams.get("branch") ?? "";
      return {
        total_count: (this.validationPages.get(branch) ?? [[]]).flat().length,
        workflow_runs:
          (this.validationPages.get(branch) ?? [[]])[page - 1] ?? [],
      };
    }
    if (
      method === "GET" &&
      pathname ===
        `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/runs`
    ) {
      return {
        total_count: this.publicationPages.flat().length,
        workflow_runs: this.publicationPages[page - 1] ?? [],
      };
    }
    const labelMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/labels/(.+)$`, "u"),
    );
    if (method === "GET" && labelMatch) {
      const name = decodeURIComponent(labelMatch[1]);
      const label = this.labels.get(name);
      if (label) return label;
      const error = new Error(`Missing label ${name}`) as Error & {
        status?: number;
      };
      error.status = 404;
      throw error;
    }
    if (method === "POST" && pathname === `/repos/${REPOSITORY}/labels`) {
      this.labels.set(String(body?.name), body ?? {});
      return body;
    }
    if (method === "PATCH" && labelMatch) {
      const name = decodeURIComponent(labelMatch[1]);
      this.labels.set(name, { ...this.labels.get(name), ...body });
      return this.labels.get(name);
    }
    const issueMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)$`, "u"),
    );
    if (method === "GET" && issueMatch) {
      const issue = this.issues.get(Number(issueMatch[1]));
      if (issue) return issue;
    }
    const issueLabelsMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)/labels$`, "u"),
    );
    if (method === "PUT" && issueLabelsMatch) {
      const issue = this.issues.get(Number(issueLabelsMatch[1]));
      if (!issue) throw new Error(`Missing issue ${issueLabelsMatch[1]}`);
      issue.labels = (body?.labels as string[]).map((name, index) => ({
        id: 100 + index,
        node_id: `L_${100 + index}`,
        name,
        color: "ededed",
      }));
      return issue.labels;
    }
    const commentsMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)/comments$`, "u"),
    );
    if (method === "GET" && commentsMatch) {
      const comments = this.comments.get(Number(commentsMatch[1])) ?? [];
      const start = (page - 1) * 100;
      return comments.slice(start, start + 100);
    }
    if (method === "POST" && commentsMatch) {
      const number = Number(commentsMatch[1]);
      const comments = this.comments.get(number) ?? [];
      const comment = { id: 50_000 + comments.length, ...body };
      comments.push(comment);
      this.comments.set(number, comments);
      return comment;
    }
    const commentMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/comments/(\\d+)$`, "u"),
    );
    if (method === "PATCH" && commentMatch) {
      for (const comments of this.comments.values()) {
        const comment = comments.find(
          ({ id }) => id === Number(commentMatch[1]),
        );
        if (comment) {
          Object.assign(comment, body);
          return comment;
        }
      }
    }
    if (
      method === "POST" &&
      pathname.startsWith(`/repos/${REPOSITORY}/statuses/`)
    ) {
      return { id: 70_000, ...body };
    }
    if (
      method === "POST" &&
      (pathname.includes("/actions/workflows/") ||
        pathname.includes("/actions/runs/"))
    ) {
      return null;
    }
    throw new Error(`Unhandled fake GitHub request: ${method} ${path}`);
  };
}

async function reconcile(fake: FakeGitHub) {
  return reconcileProjectValidations({
    repository: REPOSITORY,
    request: fake.request,
    nowMs: NOW,
  });
}

test("dispatches exact-head validation when the automatic PR has no run", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[]]);

  const summary = await reconcile(fake);

  expect(summary.results).toContainEqual(
    expect.objectContaining({
      pullNumber: 620,
      issueNumber: 620,
      action: "validate",
      outcome: "applied",
    }),
  );
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/dispatches`,
    body: { ref: "automation/project-submission-620" },
  });
});

test("projects retry state and dispatches another current-head validation", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [
    [runFixture({ id: 11, conclusion: "failure" })],
  ]);

  await reconcile(fake);

  expect(fake.requests).toContainEqual({
    method: "PUT",
    path: `/repos/${REPOSITORY}/issues/620/labels`,
    body: {
      labels: [
        "issue-admitted",
        "project-submission",
        "submission-validation-retrying",
      ],
    },
  });
  expect(fake.requests).toContainEqual(
    expect.objectContaining({
      method: "POST",
      path: `/repos/${REPOSITORY}/issues/620/comments`,
      body: expect.objectContaining({
        body: expect.stringContaining(PROJECT_VALIDATION_STATE_MARKER),
      }),
    }),
  );
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/statuses/${HEAD_SHA}`,
    body: {
      state: "pending",
      context: "tavernary/publication-validation",
      description: "Retrying exact-head validation (1 of 3).",
      target_url: `https://github.com/${REPOSITORY}/actions/runs/11`,
    },
  });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/dispatches`,
    body: { ref: pull.head.ref },
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method !== "GET" && path.endsWith("/issues/comments/9620"),
    ),
  ).toBe(false);
});

test("blocks exhausted validation attempts without another dispatch", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [
    [
      runFixture({ id: 11, conclusion: "failure" }),
      runFixture({ id: 12, conclusion: "cancelled" }),
      runFixture({ id: 13, conclusion: "timed_out" }),
    ],
  ]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "block",
    state: "validation-blocked",
    attempts: 3,
    outcome: "applied",
  });
  expect(fake.requests).toContainEqual({
    method: "PUT",
    path: `/repos/${REPOSITORY}/issues/620/labels`,
    body: {
      labels: [
        "issue-admitted",
        "project-submission",
        "submission-validation-blocked",
      ],
    },
  });
  expect(fake.requests).toContainEqual(
    expect.objectContaining({
      method: "POST",
      path: `/repos/${REPOSITORY}/statuses/${HEAD_SHA}`,
      body: expect.objectContaining({
        state: "failure",
        context: "tavernary/publication-validation",
      }),
    }),
  );
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" && path.endsWith("/ci.yml/dispatches"),
    ),
  ).toBe(false);
});

test("repairs a missing Publisher handoff after the success grace period", async () => {
  const pull = pullFixture();
  const validation = runFixture({
    id: 21,
    conclusion: "success",
    updatedAt: new Date(
      NOW - PROJECT_VALIDATION_HANDOFF_GRACE_MS - 1,
    ).toISOString(),
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({ action: "publish" });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/dispatches`,
    body: { ref: "main", inputs: { validation_run_id: "21" } },
  });
});

test("reruns failed Publisher jobs below the per-head attempt limit", async () => {
  const pull = pullFixture();
  const validation = runFixture({ id: 31, conclusion: "success" });
  const publisher = runFixture({
    id: 32,
    conclusion: "failure",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #31",
    headSha: "f".repeat(40),
    headBranch: "main",
    runAttempt: 2,
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "retry-publication",
    attempts: 2,
  });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/runs/32/rerun-failed-jobs`,
  });
});

test("dispatches regeneration for a stale automatic transaction", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 41, conclusion: "success" });
  const publisher = runFixture({
    id: 42,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #41",
    headSha: "f".repeat(40),
    headBranch: "main",
    updatedAt: old,
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({ action: "regenerate" });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/generate-project-submission.yml/dispatches`,
    body: {
      ref: "main",
      inputs: { issue_number: "620", force_regeneration: "false" },
    },
  });
});

test("ignores manual, malformed, fork-owned, changed-head, and closed PRs", async () => {
  const pulls = [
    pullFixture({ number: 701, publicationMode: "manual" }),
    pullFixture({ number: 702, body: "No signed transaction" }),
    pullFixture({ number: 703, headRepository: "attacker/fork" }),
    pullFixture({
      number: 704,
      headSha: NEXT_HEAD_SHA,
      transactionHeadSha: HEAD_SHA,
    }),
    pullFixture({ number: 705, state: "closed" }),
  ];
  const fake = new FakeGitHub(pulls);

  const summary = await reconcile(fake);

  expect(summary.results).toHaveLength(5);
  expect(summary.results.every(({ action }) => action === "ignore")).toBe(true);
  expect(fake.mutationRequests()).toEqual([]);
});

test("paginates pull, validation, and Publisher run inventories completely", async () => {
  const fillerPulls = Array.from({ length: 100 }, (_, index) =>
    pullFixture({
      number: 800 + index,
      headRef: `contributor/branch-${index}`,
    }),
  );
  const pull = pullFixture({ number: 920 });
  const branch = pull.head.ref;
  const validation = runFixture({
    id: 51,
    conclusion: "success",
    headBranch: branch,
  });
  const oldHeadRuns = Array.from({ length: 100 }, (_, index) =>
    runFixture({
      id: 1_000 + index,
      conclusion: "failure",
      headSha: OLD_HEAD_SHA,
      headBranch: branch,
    }),
  );
  const unrelatedPublishers = Array.from({ length: 100 }, (_, index) =>
    runFixture({
      id: 2_000 + index,
      conclusion: "success",
      workflow: "publish-project-transaction.yml",
      displayTitle: `Project publication for validation #${3_000 + index}`,
      headSha: "f".repeat(40),
      headBranch: "main",
    }),
  );
  const publisher = runFixture({
    id: 52,
    conclusion: "failure",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #51",
    headSha: "f".repeat(40),
    headBranch: "main",
  });
  const fake = new FakeGitHub([...fillerPulls, pull]);
  fake.pullPages = [fillerPulls, [pull]];
  fake.validationPages.set(branch, [oldHeadRuns, [validation]]);
  fake.publicationPages = [unrelatedPublishers, [publisher]];

  const summary = await reconcile(fake);

  expect(summary.results.at(-1)).toMatchObject({
    pullNumber: 920,
    action: "retry-publication",
  });
  expect(fake.requests).toContainEqual({
    method: "GET",
    path: `/repos/${REPOSITORY}/pulls?state=open&per_page=100&page=2`,
  });
  expect(fake.requests).toContainEqual({
    method: "GET",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=100&page=2`,
  });
  expect(fake.requests).toContainEqual({
    method: "GET",
    path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/runs?event=workflow_dispatch&per_page=100&page=2`,
  });
});

test("a guarded live read prevents stale mutation without aborting other PRs", async () => {
  const stalePull = pullFixture({ number: 930 });
  const currentPull = pullFixture({ number: 931 });
  const fake = new FakeGitHub([stalePull, currentPull]);
  fake.validationPages.set(stalePull.head.ref, [[]]);
  fake.validationPages.set(currentPull.head.ref, [[]]);
  fake.livePullReads.set(930, [
    pullFixture({ number: 930, headSha: NEXT_HEAD_SHA }),
  ]);

  const summary = await reconcile(fake);

  expect(summary.results).toContainEqual(
    expect.objectContaining({ pullNumber: 930, outcome: "stale" }),
  );
  expect(summary.results).toContainEqual(
    expect.objectContaining({
      pullNumber: 931,
      action: "validate",
      outcome: "applied",
    }),
  );
  expect(
    fake.requests.some(
      ({ method, path, body }) =>
        method !== "GET" &&
        (path.includes("/issues/930") || body?.ref === stalePull.head.ref),
    ),
  ).toBe(false);
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/dispatches`,
    body: { ref: currentPull.head.ref },
  });
});

test("one candidate error does not abort unrelated reconciliation", async () => {
  const broken = pullFixture({ number: 940 });
  const healthy = pullFixture({ number: 941 });
  const fake = new FakeGitHub([broken, healthy]);
  const brokenPath = `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(broken.head.ref)}&event=workflow_dispatch&per_page=100&page=1`;
  fake.failures.set(
    brokenPath.startsWith("GET ") ? brokenPath : `GET ${brokenPath}`,
    new Error("Actions unavailable"),
  );
  fake.validationPages.set(healthy.head.ref, [[]]);

  const summary = await reconcile(fake);

  expect(summary.results).toContainEqual(
    expect.objectContaining({
      pullNumber: 940,
      action: "error",
      error: "Actions unavailable",
    }),
  );
  expect(summary.results).toContainEqual(
    expect.objectContaining({
      pullNumber: 941,
      action: "validate",
      outcome: "applied",
    }),
  );
});
