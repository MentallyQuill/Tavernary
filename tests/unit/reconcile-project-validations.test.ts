import { expect, test } from "vitest";

import {
  reconcileProjectValidations,
  runReconcileProjectValidationsCli,
} from "../../scripts/submissions/reconcile-project-validations.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";
import {
  PROJECT_VALIDATION_REGENERATION_GRACE_MS,
  PROJECT_VALIDATION_STATE_MARKER,
} from "../../scripts/submissions/project-validation-reconciliation.mjs";

const REPOSITORY = "MentallyQuill/Tavernary";
const HEAD_SHA = "c".repeat(40);
const NEXT_HEAD_SHA = "e".repeat(40);
const OLD_HEAD_SHA = "d".repeat(40);
const PUBLISHER_ACTOR_ID = 41_982_982;
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
  pullAuthorId = PUBLISHER_ACTOR_ID,
  pullAuthorType = "Bot",
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
  pullAuthorId?: number;
  pullAuthorType?: "Bot" | "User";
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
      id: pullAuthorId,
      node_id: "BOT_1",
      type: pullAuthorType,
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
  displayTitle,
  workflow = "ci.yml",
  runAttempt = 1,
  actorId = PUBLISHER_ACTOR_ID,
  actorType = "Bot",
}: {
  id: number;
  headSha?: string;
  headBranch?: string;
  conclusion: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  displayTitle?: string;
  workflow?:
    | "ci.yml"
    | "publish-project-transaction.yml"
    | "generate-project-submission.yml"
    | "generate-project-owner-request.yml";
  runAttempt?: number;
  actorId?: number;
  actorType?: "Bot" | "User";
}) {
  const publication = workflow === "publish-project-transaction.yml";
  const submissionGeneration = workflow === "generate-project-submission.yml";
  const ownerGeneration = workflow === "generate-project-owner-request.yml";
  const workflowName = publication
    ? "Projects: Publish validated transaction"
    : submissionGeneration
      ? "Project submissions: Create review PR"
      : ownerGeneration
        ? "Project owner requests: Create review PR"
        : "Site: Validate changes";
  const defaultDisplayTitle = submissionGeneration
    ? "Project #620: Create review PR"
    : ownerGeneration
      ? "Owner request #620: Create review PR"
      : `Site: Validate ${headBranch}`;
  return {
    id,
    node_id: `WFR_${id}`,
    name: workflowName,
    path: `.github/workflows/${workflow}`,
    display_title: displayTitle ?? defaultDisplayTitle,
    run_number: id,
    event: "workflow_dispatch",
    status,
    conclusion,
    workflow_id: publication
      ? 202
      : submissionGeneration
        ? 301
        : ownerGeneration
          ? 302
          : 101,
    check_suite_id: id + 10_000,
    check_suite_node_id: `CS_${id}`,
    head_branch: headBranch,
    head_sha: headSha,
    run_attempt: runAttempt,
    actor: {
      login: actorType === "Bot" ? "tavernary-publisher[bot]" : "maintainer",
      id: actorId,
      type: actorType,
    },
    created_at: createdAt,
    updated_at: updatedAt,
    html_url: `https://github.com/${REPOSITORY}/actions/runs/${id}`,
    url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}`,
    jobs_url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}/jobs`,
    rerun_url: `https://api.github.com/repos/${REPOSITORY}/actions/runs/${id}/rerun`,
    workflow_url: `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${publication ? 202 : submissionGeneration ? 301 : ownerGeneration ? 302 : 101}`,
  };
}

function statusFixture({
  id,
  context = "tavernary/publication-validation",
  state = "pending",
  description = "Exact-head validation is queued.",
  targetUrl = null,
}: {
  id: number;
  context?: string;
  state?: string;
  description?: string;
  targetUrl?: string | null;
}) {
  return {
    id,
    node_id: `STATUS_${id}`,
    url: `https://api.github.com/repos/${REPOSITORY}/statuses/${HEAD_SHA}`,
    state,
    description,
    target_url: targetUrl,
    context,
    created_at: new Date(NOW - id * 100).toISOString(),
    updated_at: new Date(NOW - id * 100).toISOString(),
    creator: {
      login: "tavernary-controller[bot]",
      id: 77,
      node_id: "BOT_77",
      type: "Bot",
      site_admin: false,
    },
  };
}

class FakeGitHub {
  pulls: Pull[];
  pullPages: Pull[][] | null = null;
  livePulls = new Map<number, Pull>();
  livePullReads = new Map<number, Pull[]>();
  issues = new Map<number, ReturnType<typeof issueFixture>>();
  liveIssueReads = new Map<number, ReturnType<typeof issueFixture>[]>();
  comments = new Map<number, JsonObject[]>();
  labels = new Map<string, JsonObject>();
  statuses = new Map<string, JsonObject[]>();
  validationPages = new Map<string, WorkflowRun[][]>();
  publicationPages: WorkflowRun[][] = [[]];
  generationPages = new Map<string, WorkflowRun[][]>();
  failures = new Map<string, Error & { status?: number }>();
  requests: Array<{ method: string; path: string; body?: JsonObject }> = [];
  onRequest:
    | ((request: { method: string; path: string; count: number }) => void)
    | null = null;
  requestCounts = new Map<string, number>();
  beforeIssueLabelMutation:
    ((issue: ReturnType<typeof issueFixture>) => void) | null = null;
  authenticatedUser = {
    login: "github-actions[bot]",
    id: 41_982_982,
    node_id: "BOT_41892982",
    type: "Bot",
    site_admin: false,
    name: "Tavernary Controller",
    company: null,
    blog: "",
    location: null,
    email: null,
    hireable: null,
    bio: null,
    twitter_username: null,
    public_repos: 0,
    public_gists: 0,
    followers: 0,
    following: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-08-23T00:00:00.000Z",
  };

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
    const requestKey = `${method} ${path}`;
    const count = (this.requestCounts.get(requestKey) ?? 0) + 1;
    this.requestCounts.set(requestKey, count);
    this.onRequest?.({ method, path, count });
    const failure = this.failures.get(`${method} ${path}`);
    if (failure) throw failure;

    const url = new URL(path, "https://api.github.test");
    const pathname = url.pathname;
    const page = Number(url.searchParams.get("page") ?? "1");

    if (method === "GET" && pathname === "/users/github-actions%5Bbot%5D") {
      return this.authenticatedUser;
    }
    if (method === "GET" && pathname === "/user") {
      return this.authenticatedUser;
    }
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
    const generationRunsMatch = pathname.match(
      new RegExp(
        `^/repos/${REPOSITORY}/actions/workflows/(generate-project-(?:submission|owner-request)\\.yml)/runs$`,
        "u",
      ),
    );
    if (method === "GET" && generationRunsMatch) {
      const pages = this.generationPages.get(generationRunsMatch[1]) ?? [[]];
      return {
        total_count: pages.flat().length,
        workflow_runs: pages[page - 1] ?? [],
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
      const number = Number(issueMatch[1]);
      const reads = this.liveIssueReads.get(number);
      if (reads?.length) return reads.shift();
      const issue = this.issues.get(number);
      if (issue) return issue;
    }
    const issueLabelsMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)/labels$`, "u"),
    );
    if ((method === "PUT" || method === "POST") && issueLabelsMatch) {
      const issue = this.issues.get(Number(issueLabelsMatch[1]));
      if (!issue) throw new Error(`Missing issue ${issueLabelsMatch[1]}`);
      if (this.beforeIssueLabelMutation) {
        const mutate = this.beforeIssueLabelMutation;
        this.beforeIssueLabelMutation = null;
        mutate(issue);
      }
      const names = body?.labels as string[];
      if (method === "PUT") {
        issue.labels = names.map((name, index) => ({
          id: 100 + index,
          node_id: `L_${100 + index}`,
          name,
          color: "ededed",
        }));
      } else {
        for (const name of names) {
          if (issue.labels.some((label) => label.name === name)) continue;
          issue.labels.push({
            id: 100 + issue.labels.length,
            node_id: `L_${100 + issue.labels.length}`,
            name,
            color: "ededed",
          });
        }
      }
      return issue.labels;
    }
    const issueLabelMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/issues/(\\d+)/labels/(.+)$`, "u"),
    );
    if (method === "DELETE" && issueLabelMatch) {
      const issue = this.issues.get(Number(issueLabelMatch[1]));
      if (!issue) throw new Error(`Missing issue ${issueLabelMatch[1]}`);
      if (this.beforeIssueLabelMutation) {
        const mutate = this.beforeIssueLabelMutation;
        this.beforeIssueLabelMutation = null;
        mutate(issue);
      }
      const name = decodeURIComponent(issueLabelMatch[2]);
      const index = issue.labels.findIndex((label) => label.name === name);
      if (index < 0) {
        const error = new Error(`Missing issue label ${name}`) as Error & {
          status?: number;
        };
        error.status = 404;
        throw error;
      }
      issue.labels.splice(index, 1);
      return null;
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
      const comment = {
        id: 50_000 + comments.length,
        node_id: `IC_${50_000 + comments.length}`,
        user: this.authenticatedUser,
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        ...body,
      };
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
    const statusesMatch = pathname.match(
      new RegExp(`^/repos/${REPOSITORY}/commits/([a-f0-9]{40})/statuses$`, "u"),
    );
    if (method === "GET" && statusesMatch) {
      const statuses = this.statuses.get(statusesMatch[1]) ?? [];
      const start = (page - 1) * 100;
      return statuses.slice(start, start + 100);
    }
    if (
      method === "POST" &&
      pathname.startsWith(`/repos/${REPOSITORY}/statuses/`)
    ) {
      const headSha = pathname.slice(pathname.lastIndexOf("/") + 1);
      const statuses = this.statuses.get(headSha) ?? [];
      const status = statusFixture({
        id: 70_000 + statuses.length,
        context: String(body?.context),
        state: String(body?.state),
        description: String(body?.description),
        targetUrl:
          typeof body?.target_url === "string" ? body.target_url : null,
      });
      statuses.unshift(status);
      this.statuses.set(headSha, statuses);
      return status;
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
    publisherActorId: PUBLISHER_ACTOR_ID,
  });
}

test("ignores a generated PR created by a different actor ID", async () => {
  const fake = new FakeGitHub([
    pullFixture({ pullAuthorId: PUBLISHER_ACTOR_ID + 1 }),
  ]);

  const summary = await reconcile(fake);

  expect(summary.results).toEqual([
    {
      pullNumber: 620,
      action: "ignore",
      reason: "untrusted-publisher-author",
    },
  ]);
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores the reserved generated-branch custody canary", async () => {
  const fake = new FakeGitHub([
    pullFixture({ number: 999, headRef: "automation/project-submission-0" }),
  ]);

  const summary = await reconcile(fake);

  expect(summary.results).toEqual([
    {
      pullNumber: 999,
      action: "ignore",
      reason: "reserved-canary",
    },
  ]);
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores a generated PR whose configured actor is not a Bot", async () => {
  const fake = new FakeGitHub([pullFixture({ pullAuthorType: "User" })]);

  const summary = await reconcile(fake);

  expect(summary.results).toEqual([
    {
      pullNumber: 620,
      action: "ignore",
      reason: "untrusted-publisher-author",
    },
  ]);
  expect(fake.mutationRequests()).toEqual([]);
});

test("requires a positive numeric Publisher actor ID", async () => {
  const fake = new FakeGitHub([pullFixture()]);

  await expect(
    reconcileProjectValidations({
      repository: REPOSITORY,
      request: fake.request,
      nowMs: NOW,
      publisherActorId: Number.NaN,
    }),
  ).rejects.toThrow("A numeric Publisher bot actor ID is required.");
  expect(fake.requests).toEqual([]);
});

test("ignores a transaction whose source issue is closed before planning", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.issues.get(620)!.state = "closed";

  const summary = await reconcile(fake);

  expect(summary.results).toEqual([
    {
      pullNumber: 620,
      issueNumber: 620,
      action: "ignore",
      reason: "issue-closed",
    },
  ]);
  expect(fake.mutationRequests()).toEqual([]);
  expect(
    fake.requests.some(({ path }) => path.includes("/actions/workflows/")),
  ).toBe(false);
});

test("ignores a transaction whose source issue author ID changed", async () => {
  const fake = new FakeGitHub([pullFixture()]);
  fake.issues.get(620)!.user.id = 2;

  const summary = await reconcile(fake);

  expect(summary.results[0]).toEqual({
    pullNumber: 620,
    issueNumber: 620,
    action: "ignore",
    reason: "issue-actor-mismatch",
  });
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores a transaction whose source issue author type changed", async () => {
  const fake = new FakeGitHub([pullFixture()]);
  fake.issues.get(620)!.user.type = "Bot";

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "ignore",
    reason: "issue-actor-mismatch",
  });
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores a transaction whose source issue author login changed", async () => {
  const fake = new FakeGitHub([pullFixture()]);
  fake.issues.get(620)!.user.login = "renamed-submitter";

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "ignore",
    reason: "issue-actor-mismatch",
  });
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores a transaction whose source issue admission was revoked", async () => {
  const fake = new FakeGitHub([pullFixture()]);
  fake.issues.get(620)!.labels = fake.issues
    .get(620)!
    .labels.filter(({ name }) => name !== "issue-admitted");

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "ignore",
    reason: "issue-no-longer-admitted",
  });
  expect(fake.mutationRequests()).toEqual([]);
});

test("ignores a transaction whose source issue route no longer matches", async () => {
  const fake = new FakeGitHub([pullFixture()]);
  const issue = fake.issues.get(620)!;
  issue.labels = issue.labels.filter(
    ({ name }) => name !== "project-submission",
  );
  issue.labels.push({
    id: 3,
    node_id: "L_3",
    name: "project-owner-request",
    color: "5319e7",
  });

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "ignore",
    reason: "issue-route-mismatch",
  });
  expect(fake.mutationRequests()).toEqual([]);
});

test("rechecks source issue admission immediately before dispatch", async () => {
  const pull = pullFixture();
  const admitted = issueFixture();
  const revoked = issueFixture();
  revoked.labels = revoked.labels.filter(
    ({ name }) => name !== "issue-admitted",
  );
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[]]);
  fake.liveIssueReads.set(620, [admitted, revoked]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "ignore",
    outcome: "stale",
    reason: "issue-no-longer-admitted",
  });
  expect(fake.mutationRequests()).toEqual([]);
  expect(
    fake.requestCounts.get(
      `GET /repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(pull.head.ref)}&event=workflow_dispatch&per_page=100&page=1`,
    ),
  ).toBe(1);
});

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

test("does not dispatch validation when a late current-head CI run appears", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  const inventoryPath = `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(pull.head.ref)}&event=workflow_dispatch&per_page=100&page=1`;
  fake.validationPages.set(pull.head.ref, [[]]);
  fake.onRequest = ({ method, path, count }) => {
    if (method === "GET" && path === inventoryPath && count === 2) {
      fake.validationPages.set(pull.head.ref, [
        [runFixture({ id: 2, conclusion: null })],
      ]);
    }
  };

  const summary = await reconcile(fake);

  expect(fake.requestCounts.get(`GET ${inventoryPath}`)).toBe(2);
  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "validating",
    outcome: "superseded",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" && path.endsWith("/ci.yml/dispatches"),
    ),
  ).toBe(false);
});

test("a state projection failure does not prevent safe validation recovery", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[]]);
  fake.failures.set(
    `POST /repos/${REPOSITORY}/issues/620/comments`,
    new Error("Comment projection unavailable"),
  );

  const summary = await reconcile(fake);

  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/dispatches`,
    body: { ref: pull.head.ref },
  });
  expect(summary.results[0]).toMatchObject({
    action: "validate",
    outcome: "applied",
    projectionError: "Comment projection unavailable",
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
    method: "POST",
    path: `/repos/${REPOSITORY}/issues/620/labels`,
    body: {
      labels: ["submission-validation-retrying"],
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

test("does not post an identical exact-context status on repeat reconciliation", async () => {
  const pull = pullFixture();
  const activeValidation = runFixture({ id: 61, conclusion: null });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[activeValidation]]);

  await reconcile(fake);
  const controllerStatus = fake.statuses.get(HEAD_SHA)?.[0];
  expect(controllerStatus).toBeDefined();
  fake.statuses.set(HEAD_SHA, [
    ...Array.from({ length: 100 }, (_, index) =>
      statusFixture({
        id: 80_000 + index,
        context: `unrelated/check-${index}`,
        description: `Unrelated status ${index}`,
      }),
    ),
    controllerStatus!,
  ]);

  await reconcile(fake);

  expect(
    fake.requests.filter(
      ({ method, path }) =>
        method === "POST" &&
        path === `/repos/${REPOSITORY}/statuses/${HEAD_SHA}`,
    ),
  ).toHaveLength(1);
  expect(fake.requests).toContainEqual({
    method: "GET",
    path: `/repos/${REPOSITORY}/commits/${HEAD_SHA}/statuses?per_page=100&page=2`,
  });
});

test("preserves a foreign spoofed marker and creates a controller-owned comment", async () => {
  const pull = pullFixture();
  const activeValidation = runFixture({ id: 62, conclusion: null });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[activeValidation]]);
  fake.comments.set(620, [
    {
      id: 12_345,
      node_id: "IC_SPOOF",
      body: `${PROJECT_VALIDATION_STATE_MARKER}\n{"schema_version":1}\n-->\nSpoofed state`,
      user: {
        login: "submitter",
        id: 1,
        node_id: "U_1",
        type: "User",
        site_admin: false,
      },
      created_at: new Date(NOW - 30_000).toISOString(),
      updated_at: new Date(NOW - 30_000).toISOString(),
      html_url: `https://github.com/${REPOSITORY}/issues/620#issuecomment-12345`,
    },
  ]);

  await reconcile(fake);

  expect(fake.requestCounts.get("GET /users/github-actions%5Bbot%5D")).toBe(1);
  expect(fake.requestCounts.get("GET /user")).toBeUndefined();
  expect(fake.requests).not.toContainEqual(
    expect.objectContaining({
      method: "PATCH",
      path: `/repos/${REPOSITORY}/issues/comments/12345`,
    }),
  );
  expect(fake.requests).toContainEqual(
    expect.objectContaining({
      method: "POST",
      path: `/repos/${REPOSITORY}/issues/620/comments`,
      body: expect.objectContaining({
        body: expect.stringContaining(PROJECT_VALIDATION_STATE_MARKER),
      }),
    }),
  );
  expect(fake.comments.get(620)?.[0]?.body).toContain("Spoofed state");
});

test("caches the installation-token-supported Actions bot identity lookup", async () => {
  const first = pullFixture({ number: 623 });
  const second = pullFixture({ number: 624 });
  const fake = new FakeGitHub([first, second]);
  fake.validationPages.set(first.head.ref, [
    [
      runFixture({
        id: 63,
        conclusion: null,
        headBranch: first.head.ref,
      }),
    ],
  ]);
  fake.validationPages.set(second.head.ref, [
    [
      runFixture({
        id: 64,
        conclusion: null,
        headBranch: second.head.ref,
      }),
    ],
  ]);

  await reconcile(fake);

  expect(fake.requestCounts.get("GET /users/github-actions%5Bbot%5D")).toBe(1);
  expect(fake.requestCounts.get("GET /user")).toBeUndefined();
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
    method: "POST",
    path: `/repos/${REPOSITORY}/issues/620/labels`,
    body: {
      labels: ["submission-validation-blocked"],
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

test("counts every completed validation run_attempt toward the head budget", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [
    [runFixture({ id: 17, conclusion: "failure", runAttempt: 3 })],
  ]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "block",
    state: "validation-blocked",
    attempts: 3,
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" && path.endsWith("/ci.yml/dispatches"),
    ),
  ).toBe(false);
});

test("mutates only owned labels and preserves concurrent foreign label changes", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [
    [
      runFixture({ id: 14, conclusion: "failure" }),
      runFixture({ id: 15, conclusion: "cancelled" }),
      runFixture({ id: 16, conclusion: "timed_out" }),
    ],
  ]);
  fake.beforeIssueLabelMutation = (issue) => {
    issue.labels = issue.labels.filter(
      ({ name }) => name !== "project-submission",
    );
    issue.labels.push({
      id: 90,
      node_id: "L_90",
      name: "concurrent-review",
      color: "5319e7",
    });
  };

  await reconcile(fake);

  const firstLabelMutations = fake.requests.filter(
    ({ method, path }) =>
      method !== "GET" && path.includes(`/issues/620/labels`),
  );
  expect(firstLabelMutations).toEqual([
    {
      method: "POST",
      path: `/repos/${REPOSITORY}/issues/620/labels`,
      body: { labels: ["submission-validation-blocked"] },
    },
  ]);
  expect(fake.issues.get(620)?.labels.map(({ name }) => name)).toEqual([
    "issue-admitted",
    "concurrent-review",
    "submission-validation-blocked",
  ]);

  await reconcile(fake);

  expect(
    fake.requests.filter(
      ({ method, path }) =>
        method !== "GET" && path.includes(`/issues/620/labels`),
    ),
  ).toHaveLength(firstLabelMutations.length);
});

test("hands a successful validation to Publisher immediately", async () => {
  const pull = pullFixture();
  const validation = runFixture({
    id: 21,
    conclusion: "success",
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

test("does not dispatch publication when a late Publisher run appears", async () => {
  const pull = pullFixture();
  const validation = runFixture({
    id: 24,
    conclusion: "success",
  });
  const publisherPath = `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/runs?event=workflow_dispatch&per_page=100&page=1`;
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.onRequest = ({ method, path, count }) => {
    if (method === "GET" && path === publisherPath && count === 2) {
      fake.publicationPages = [
        [
          runFixture({
            id: 25,
            conclusion: null,
            workflow: "publish-project-transaction.yml",
            displayTitle: "Project publication for validation #24",
            headSha: "f".repeat(40),
            headBranch: "main",
          }),
        ],
      ];
    }
  };

  const summary = await reconcile(fake);

  expect(fake.requestCounts.get(`GET ${publisherPath}`)).toBe(2);
  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "publishing",
    outcome: "superseded",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("aggregates Publisher runs for every successful validation on the head", async () => {
  const pull = pullFixture();
  const olderValidation = runFixture({
    id: 26,
    conclusion: "success",
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
    updatedAt: new Date(NOW - 20 * 60_000).toISOString(),
  });
  const newerValidation = runFixture({
    id: 27,
    conclusion: "success",
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
    updatedAt: new Date(NOW - 10 * 60_000).toISOString(),
  });
  const activePublisher = runFixture({
    id: 28,
    conclusion: null,
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #26",
    headSha: "f".repeat(40),
    headBranch: "main",
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[newerValidation, olderValidation]]);
  fake.publicationPages = [[activePublisher]];

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "publishing",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test.each(["failure", "cancelled"])(
  "re-dispatches a %s Publisher from the exact validation",
  async (conclusion) => {
    const pull = pullFixture();
    const validation = runFixture({ id: 31, conclusion: "success" });
    const publisher = runFixture({
      id: 32,
      conclusion,
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
      path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/dispatches`,
      body: { ref: "main", inputs: { validation_run_id: "31" } },
    });
  },
);

test("queues publication while another project Publisher run is active", async () => {
  const pull = pullFixture();
  const validation = runFixture({ id: 37, conclusion: "success" });
  const otherPublisher = runFixture({
    id: 38,
    conclusion: null,
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #999",
    headSha: "f".repeat(40),
    headBranch: "main",
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[otherPublisher]];

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "publication-queued",
    outcome: "observed",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("dispatches at most one Publisher mutation per reconciliation pass", async () => {
  const first = pullFixture({ number: 620 });
  const second = pullFixture({
    number: 621,
    headSha: NEXT_HEAD_SHA,
    transactionHeadSha: NEXT_HEAD_SHA,
  });
  const fake = new FakeGitHub([first, second]);
  fake.validationPages.set(first.head.ref, [
    [runFixture({ id: 39, conclusion: "success" })],
  ]);
  fake.validationPages.set(second.head.ref, [
    [
      runFixture({
        id: 40,
        conclusion: "success",
        headSha: NEXT_HEAD_SHA,
        headBranch: second.head.ref,
      }),
    ],
  ]);

  const summary = await reconcile(fake);

  expect(summary.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ pullNumber: 620, action: "publish" }),
      expect.objectContaining({
        pullNumber: 621,
        action: "wait",
        state: "publication-queued",
      }),
    ]),
  );
  expect(
    fake.requests.filter(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toHaveLength(1);
});

test("does not rerun Publisher when a late active attempt appears", async () => {
  const pull = pullFixture();
  const validation = runFixture({ id: 34, conclusion: "success" });
  const failedPublisher = runFixture({
    id: 35,
    conclusion: "failure",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #34",
    headSha: "f".repeat(40),
    headBranch: "main",
  });
  const activePublisher = runFixture({
    id: 36,
    conclusion: null,
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #34",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 1_000).toISOString(),
  });
  const publisherPath = `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/runs?event=workflow_dispatch&per_page=100&page=1`;
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[failedPublisher]];
  fake.onRequest = ({ method, path, count }) => {
    if (method === "GET" && path === publisherPath && count === 2) {
      fake.publicationPages = [[failedPublisher, activePublisher]];
    }
  };

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "publishing",
    outcome: "superseded",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("routes stale regeneration through Publisher for the exact validation", async () => {
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
    path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/dispatches`,
    body: {
      ref: "main",
      inputs: { validation_run_id: "41" },
    },
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.includes("/actions/workflows/generate-project-submission.yml/"),
    ),
  ).toBe(false);
});

test("waits while a Publisher-launched generation run is active", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 47, conclusion: "success" });
  const publisher = runFixture({
    id: 48,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #47",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
    updatedAt: old,
  });
  const generation = runFixture({
    id: 49,
    conclusion: null,
    workflow: "generate-project-submission.yml",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [[generation]]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "regenerating",
    runId: 49,
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("late-action replanning refreshes generation runs before dispatch", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 61, conclusion: "success" });
  const publisher = runFixture({
    id: 62,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #61",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
    updatedAt: old,
  });
  const generation = runFixture({
    id: 63,
    conclusion: null,
    workflow: "generate-project-submission.yml",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  });
  const generationPath = `/repos/${REPOSITORY}/actions/workflows/generate-project-submission.yml/runs?event=workflow_dispatch&per_page=100&page=1`;
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [[]]);
  fake.onRequest = ({ method, path, count }) => {
    if (method === "GET" && path === generationPath && count === 2) {
      fake.generationPages.set("generate-project-submission.yml", [
        [generation],
      ]);
    }
  };

  const summary = await reconcile(fake);

  expect(fake.requestCounts.get(`GET ${generationPath}`)).toBe(2);
  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "regenerating",
    outcome: "superseded",
    runId: 63,
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("ignores generation runs outside the exact Publisher issue boundary", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 64, conclusion: "success" });
  const publisherCreatedAt = new Date(NOW - 30 * 60_000).toISOString();
  const publisher = runFixture({
    id: 65,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #64",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: publisherCreatedAt,
    updatedAt: old,
  });
  const exact = runFixture({
    id: 66,
    conclusion: null,
    workflow: "generate-project-submission.yml",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  });
  const untrusted = [
    { ...exact, id: 67, name: "Wrong workflow" },
    { ...exact, id: 68, path: ".github/workflows/other.yml" },
    { ...exact, id: 69, event: "workflow_run" },
    { ...exact, id: 70, display_title: "Project #621: Create review PR" },
    { ...exact, id: 71, actor: { ...exact.actor, id: PUBLISHER_ACTOR_ID + 1 } },
    {
      ...exact,
      id: 72,
      actor: { ...exact.actor, type: "User" as const },
    },
    {
      ...exact,
      id: 73,
      created_at: new Date(NOW - 40 * 60_000).toISOString(),
    },
  ];
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [untrusted]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({ action: "regenerate" });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/dispatches`,
    body: { ref: "main", inputs: { validation_run_id: "64" } },
  });
});

test("retries a failed generation through Publisher below the head budget", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 50, conclusion: "success" });
  const publisher = runFixture({
    id: 51,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #50",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
    updatedAt: old,
  });
  const generation = runFixture({
    id: 52,
    conclusion: "failure",
    workflow: "generate-project-submission.yml",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [[generation]]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "regenerate",
    state: "retrying-regeneration",
    attempts: 1,
    runId: 52,
  });
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/dispatches`,
    body: { ref: "main", inputs: { validation_run_id: "50" } },
  });
});

test("blocks after three failed generation runs for the current head", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 53, conclusion: "success" });
  const publisher = runFixture({
    id: 54,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #53",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 30 * 60_000).toISOString(),
    updatedAt: old,
  });
  const generations = [55, 56, 57].map((id, index) =>
    runFixture({
      id,
      conclusion: "failure",
      workflow: "generate-project-submission.yml",
      headSha: "f".repeat(40),
      headBranch: "main",
      createdAt: new Date(NOW - (10 - index) * 60_000).toISOString(),
    }),
  );
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [generations]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "block",
    state: "regeneration-blocked",
    attempts: 3,
    runId: 57,
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("blocks a successful generation that leaves the old head unchanged", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 58, conclusion: "success" });
  const publisher = runFixture({
    id: 59,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #58",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 30 * 60_000).toISOString(),
    updatedAt: old,
  });
  const generation = runFixture({
    id: 60,
    conclusion: "success",
    workflow: "generate-project-submission.yml",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 20 * 60_000).toISOString(),
    updatedAt: old,
  });
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[publisher]];
  fake.generationPages.set("generate-project-submission.yml", [[generation]]);

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "block",
    state: "regeneration-blocked",
    attempts: 1,
    runId: 60,
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/publish-project-transaction.yml/dispatches"),
    ),
  ).toBe(false);
});

test("does not regenerate when a late Publisher attempt appears", async () => {
  const old = new Date(
    NOW - PROJECT_VALIDATION_REGENERATION_GRACE_MS - 1,
  ).toISOString();
  const pull = pullFixture({ updatedAt: old });
  const validation = runFixture({ id: 44, conclusion: "success" });
  const completedPublisher = runFixture({
    id: 45,
    conclusion: "success",
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #44",
    headSha: "f".repeat(40),
    headBranch: "main",
    updatedAt: old,
  });
  const activePublisher = runFixture({
    id: 46,
    conclusion: null,
    workflow: "publish-project-transaction.yml",
    displayTitle: "Project publication for validation #44",
    headSha: "f".repeat(40),
    headBranch: "main",
    createdAt: new Date(NOW - 1_000).toISOString(),
  });
  const publisherPath = `/repos/${REPOSITORY}/actions/workflows/publish-project-transaction.yml/runs?event=workflow_dispatch&per_page=100&page=1`;
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[validation]]);
  fake.publicationPages = [[completedPublisher]];
  fake.onRequest = ({ method, path, count }) => {
    if (method === "GET" && path === publisherPath && count === 2) {
      fake.publicationPages = [[completedPublisher, activePublisher]];
    }
  };

  const summary = await reconcile(fake);

  expect(summary.results[0]).toMatchObject({
    action: "wait",
    state: "publishing",
    outcome: "superseded",
  });
  expect(
    fake.requests.some(
      ({ method, path }) =>
        method === "POST" &&
        path.endsWith("/generate-project-submission.yml/dispatches"),
    ),
  ).toBe(false);
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

test("paginates pull, validation, Publisher, and generation inventories", async () => {
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
  const unrelatedGenerations = Array.from({ length: 100 }, (_, index) =>
    runFixture({
      id: 4_000 + index,
      conclusion: "success",
      workflow: "generate-project-submission.yml",
      displayTitle: `Project #${5_000 + index}: Create review PR`,
      headSha: "f".repeat(40),
      headBranch: "main",
    }),
  );
  const fake = new FakeGitHub([...fillerPulls, pull]);
  fake.pullPages = [fillerPulls, [pull]];
  fake.validationPages.set(branch, [oldHeadRuns, [validation]]);
  fake.publicationPages = [unrelatedPublishers, [publisher]];
  fake.generationPages.set("generate-project-submission.yml", [
    unrelatedGenerations,
    [],
  ]);

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
  expect(fake.requests).toContainEqual({
    method: "GET",
    path: `/repos/${REPOSITORY}/actions/workflows/generate-project-submission.yml/runs?event=workflow_dispatch&per_page=100&page=2`,
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

test("CLI requires TAVERNARY_PUBLISHER_BOT_ID before inventory", async () => {
  const fake = new FakeGitHub([pullFixture()]);

  await expect(
    runReconcileProjectValidationsCli({
      env: {
        GITHUB_REPOSITORY: REPOSITORY,
        GITHUB_TOKEN: "test-token",
      },
      request: fake.request,
      nowMs: NOW,
      write: () => undefined,
    }),
  ).rejects.toThrow(
    "TAVERNARY_PUBLISHER_BOT_ID must be a positive numeric bot ID.",
  );
  expect(fake.requests).toEqual([]);
});

test("CLI finishes every candidate and exits nonzero after an action error", async () => {
  const broken = pullFixture({ number: 950 });
  const healthy = pullFixture({ number: 951 });
  const fake = new FakeGitHub([broken, healthy]);
  const brokenPath = `/repos/${REPOSITORY}/actions/workflows/ci.yml/runs?branch=${encodeURIComponent(broken.head.ref)}&event=workflow_dispatch&per_page=100&page=1`;
  fake.failures.set(`GET ${brokenPath}`, new Error("Actions unavailable"));
  fake.validationPages.set(healthy.head.ref, [[]]);
  const output: string[] = [];

  const exitCode = await runReconcileProjectValidationsCli({
    env: {
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_TOKEN: "test-token",
      TAVERNARY_PUBLISHER_BOT_ID: String(PUBLISHER_ACTOR_ID),
    },
    request: fake.request,
    nowMs: NOW,
    write: (value) => output.push(value),
  });

  expect(exitCode).toBe(1);
  expect(JSON.parse(output[0]).results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ pullNumber: 950, action: "error" }),
      expect.objectContaining({ pullNumber: 951, action: "validate" }),
    ]),
  );
  expect(fake.requests).toContainEqual({
    method: "POST",
    path: `/repos/${REPOSITORY}/actions/workflows/ci.yml/dispatches`,
    body: { ref: healthy.head.ref },
  });
});

test("CLI exits nonzero after a required state projection fails", async () => {
  const pull = pullFixture();
  const fake = new FakeGitHub([pull]);
  fake.validationPages.set(pull.head.ref, [[]]);
  fake.failures.set(
    `POST /repos/${REPOSITORY}/issues/620/comments`,
    new Error("Comment projection unavailable"),
  );

  const exitCode = await runReconcileProjectValidationsCli({
    env: {
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_TOKEN: "test-token",
      TAVERNARY_PUBLISHER_BOT_ID: String(PUBLISHER_ACTOR_ID),
    },
    request: fake.request,
    nowMs: NOW,
    write: () => undefined,
  });

  expect(exitCode).toBe(1);
});
