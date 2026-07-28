import { expect, test } from "vitest";

import {
  buildKitReconciliationLedger,
  classifyKitSubmissionHistory,
  parseReconciliationArgs,
  reconcileOwnedKitLabels,
  runKitReconciliation,
} from "../../scripts/submissions/kit-submission-reconciliation.mjs";
import type { GitHubKitIssue } from "../../scripts/submissions/kit-submission-reconciliation.mjs";

const createBody = (issueNumber = 18) =>
  [
    "### Kit title",
    "",
    "Ultimate Harry Potter",
    "",
    "### Kit description",
    "",
    "Everything you need.",
    "",
    "### Kit manifest",
    "",
    "```json",
    JSON.stringify({
      operation: "create",
      kit_id: null,
      title: "Ultimate Harry Potter",
      description: "Everything you need.",
      project_ids: [
        "sillytavern-sillytavern",
        "mentallyquill-st-wandlight",
        "mentallyquill-saga",
      ],
      source_issue_number: issueNumber,
    }),
    "```",
  ].join("\n");

const publishedKit = {
  schema_version: 1,
  id: "ultimate-harry-potter-18",
  status: "published",
  title: "Ultimate Harry Potter",
  description: "Everything you need.",
  author: { github_user_id: 42, login: "submitter" },
  source_issue_number: 18,
  project_ids: [
    "sillytavern-sillytavern",
    "mentallyquill-st-wandlight",
    "mentallyquill-saga",
  ],
  published_at: "2026-07-26T04:49:08.974Z",
  updated_at: "2026-07-26T05:11:00.922Z",
};

const editBody = [
  "### Kit title",
  "",
  "Ultimate Harry Potter",
  "",
  "### Kit description",
  "",
  "Everything you need.",
  "",
  "### Kit manifest",
  "",
  "```json",
  JSON.stringify({
    operation: "edit",
    kit_id: "ultimate-harry-potter-18",
    title: "Ultimate Harry Potter",
    description: "Everything you need.",
    project_ids: [
      "sillytavern-sillytavern",
      "mentallyquill-st-wandlight",
      "mentallyquill-saga",
    ],
  }),
  "```",
].join("\n");

const unpublishedBody = [
  "### Kit title",
  "",
  "Super Awesome Test Kit",
  "",
  "### Kit description",
  "",
  "Testing.",
  "",
  "### Kit manifest",
  "",
  "```json",
  JSON.stringify({
    operation: "create",
    kit_id: null,
    title: "Super Awesome Test Kit",
    description: "Testing.",
    project_ids: ["frontend", "extension-a", "extension-b", "extension-c"],
  }),
  "```",
].join("\n");

const projects = [
  { id: "frontend", kind: "frontend" },
  { id: "extension-a", kind: "extension" },
  { id: "extension-b", kind: "extension" },
  { id: "extension-c", kind: "extension" },
];

const historicalIssues = (): GitHubKitIssue[] => [
  {
    number: 18,
    state: "closed",
    state_reason: "not_planned",
    labels: [{ name: "needs-maintainer-review" }],
    body: createBody(),
    user: { id: 42, login: "submitter" },
  },
  {
    number: 19,
    state: "closed",
    state_reason: "duplicate",
    labels: [{ name: "issue-admitted" }],
    body: createBody(19),
    user: { id: 42, login: "submitter" },
  },
  {
    number: 20,
    state: "closed",
    state_reason: "not_planned",
    labels: [{ name: "issue-admitted" }],
    body: editBody,
    user: { id: 42, login: "submitter" },
  },
  {
    number: 109,
    state: "open",
    state_reason: null,
    labels: [{ name: "issue-admitted" }],
    body: unpublishedBody,
    user: { id: 42, login: "submitter" },
  },
];

test("classifies a canonical source issue as a published create", () => {
  expect(
    classifyKitSubmissionHistory({
      issue: {
        number: 18,
        state: "closed",
        state_reason: "not_planned",
        labels: [{ name: "needs-maintainer-review" }],
        body: createBody(),
        user: { id: 42, login: "submitter" },
      },
      projects: [],
      kits: [publishedKit],
      blockedUsers: { blocked: [] },
    }),
  ).toEqual({
    disposition: "published-create",
    desiredOwnedLabels: ["issue-admitted", "kit-submission", "kit-published"],
    desiredState: "closed",
    desiredStateReason: "completed",
    dispatch: false,
  });
});

test("classifies an exact canonical edit as already applied", () => {
  expect(
    classifyKitSubmissionHistory({
      issue: {
        number: 20,
        state: "closed",
        state_reason: "not_planned",
        labels: [{ name: "issue-admitted" }],
        body: editBody,
        user: { id: 42, login: "submitter" },
      },
      projects: [],
      kits: [publishedKit],
      blockedUsers: { blocked: [] },
    }),
  ).toEqual({
    disposition: "applied-edit",
    desiredOwnedLabels: ["issue-admitted", "kit-submission", "kit-published"],
    desiredState: "closed",
    desiredStateReason: "completed",
    dispatch: false,
  });
});

test("classifies a same-author create with a published project set as superseded", () => {
  expect(
    classifyKitSubmissionHistory({
      issue: {
        number: 19,
        state: "closed",
        state_reason: "duplicate",
        labels: [{ name: "issue-admitted" }],
        body: createBody(19),
        user: { id: 42, login: "submitter" },
      },
      projects: [],
      kits: [publishedKit],
      blockedUsers: { blocked: [] },
    }),
  ).toEqual({
    disposition: "superseded",
    desiredOwnedLabels: [
      "issue-admitted",
      "kit-submission",
      "duplicate-candidate",
    ],
    desiredState: "closed",
    desiredStateReason: null,
    dispatch: false,
  });
});

test("classifies a valid create without a canonical Kit as unpublished", () => {
  expect(
    classifyKitSubmissionHistory({
      issue: {
        number: 109,
        state: "open",
        state_reason: null,
        labels: [{ name: "issue-admitted" }],
        body: unpublishedBody,
        user: { id: 42, login: "submitter" },
      },
      projects,
      kits: [publishedKit],
      blockedUsers: { blocked: [] },
    }),
  ).toEqual({
    disposition: "unpublished-valid",
    desiredOwnedLabels: ["issue-admitted", "kit-submission"],
    desiredState: "open",
    desiredStateReason: null,
    dispatch: true,
  });
});

test("replaces only owned Kit labels idempotently", () => {
  const labels = reconcileOwnedKitLabels({
    currentLabels: [
      "documentation",
      "needs-maintainer-review",
      "kit-submission",
    ],
    desiredOwnedLabels: ["issue-admitted", "kit-submission", "kit-published"],
  });
  expect(labels).toEqual([
    "documentation",
    "issue-admitted",
    "kit-submission",
    "kit-published",
  ]);
  expect(
    reconcileOwnedKitLabels({
      currentLabels: labels,
      desiredOwnedLabels: ["issue-admitted", "kit-submission", "kit-published"],
    }),
  ).toEqual(labels);
});

test("builds a deterministic reconciliation ledger", () => {
  expect(
    buildKitReconciliationLedger({
      issues: historicalIssues(),
      projects,
      kits: [publishedKit],
      blockedUsers: { blocked: [] },
    }).map(({ issueNumber, disposition }) => ({
      issueNumber,
      disposition,
    })),
  ).toEqual([
    { issueNumber: 18, disposition: "published-create" },
    { issueNumber: 19, disposition: "superseded" },
    { issueNumber: 20, disposition: "applied-edit" },
    { issueNumber: 109, disposition: "unpublished-valid" },
  ]);
});

test("builds a dry-run ledger through the GitHub CLI adapter without mutation", async () => {
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    return JSON.stringify([historicalIssues()]);
  };

  const ledger = await runKitReconciliation({
    repository: "MentallyQuill/Tavernary",
    apply: false,
    gh,
    projects,
    kits: [publishedKit],
    blockedUsers: { blocked: [] },
  });

  expect(ledger).toHaveLength(4);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toEqual([
    "api",
    "--paginate",
    "--slurp",
    "--method",
    "GET",
    "repos/MentallyQuill/Tavernary/issues",
    "-f",
    "state=all",
    "-f",
    "per_page=100",
  ]);
});

test("applies labels, terminal states, and unpublished dispatch through GitHub CLI", async () => {
  const calls: Array<{ args: string[]; stdin?: string }> = [];
  const gh = async (args: string[], stdin?: string) => {
    calls.push({ args, stdin });
    if (args[0] === "api" && args.includes("--slurp")) {
      return JSON.stringify([historicalIssues()]);
    }
    if (args[0] === "label" && args[1] === "list") {
      return JSON.stringify([{ name: "project-submission" }]);
    }
    return "";
  };

  await runKitReconciliation({
    repository: "MentallyQuill/Tavernary",
    apply: true,
    gh,
    projects,
    kits: [publishedKit],
    blockedUsers: { blocked: [] },
  });

  expect(
    calls.filter(({ args }) => args[0] === "label" && args[1] === "create"),
  ).toHaveLength(2);
  expect(
    calls.filter(
      ({ args }) =>
        args[0] === "api" && args[2] === "PUT" && args.at(-2) === "--input",
    ),
  ).toHaveLength(4);
  expect(
    calls.filter(
      ({ args, stdin }) =>
        args[0] === "api" &&
        args[2] === "PATCH" &&
        stdin ===
          JSON.stringify({ state: "closed", state_reason: "completed" }),
    ),
  ).toHaveLength(2);
  expect(calls).toContainEqual({
    args: [
      "workflow",
      "run",
      "triage-kit-submission.yml",
      "--repo",
      "MentallyQuill/Tavernary",
      "--ref",
      "main",
      "-f",
      "issue_number=109",
    ],
    stdin: undefined,
  });
});

test("parses explicit reconciliation CLI arguments", () => {
  expect(
    parseReconciliationArgs(["--repo", "MentallyQuill/Tavernary", "--apply"]),
  ).toEqual({
    repository: "MentallyQuill/Tavernary",
    apply: true,
  });
  expect(() => parseReconciliationArgs([])).toThrow(
    "A GitHub repository is required.",
  );
});

test("does not rewrite an already reconciled label set in a different order", async () => {
  const issue = historicalIssues()[0];
  issue.state_reason = "completed";
  issue.labels = [
    { name: "kit-published" },
    { name: "issue-admitted" },
    { name: "kit-submission" },
  ];
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "api" && args.includes("--slurp")) {
      return JSON.stringify([[issue]]);
    }
    if (args[0] === "label" && args[1] === "list") {
      return JSON.stringify([
        { name: "kit-submission" },
        { name: "kit-withdrawal" },
      ]);
    }
    return "";
  };

  await runKitReconciliation({
    repository: "MentallyQuill/Tavernary",
    apply: true,
    gh,
    projects,
    kits: [publishedKit],
    blockedUsers: { blocked: [] },
  });

  expect(calls).toHaveLength(2);
});
