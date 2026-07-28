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
  kind: "repository" as const,
  provider: "github" as const,
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
      return [
        {
          number: 19,
          html_url: "https://github.com/Tavernary/Tavernary/pull/19",
        },
      ];
    }
    throw new Error(`Unexpected request: ${path}`);
  });

  await expect(
    findEarlierInflightSubmission({
      repository: "Tavernary/Tavernary",
      currentIssueNumber: 30,
      currentIdentity: currentGithubIdentity,
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
    candidate:
      "https://old.reddit.com/r/SillyTavernAI/comments/abc123/example/",
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
])(
  "matches canonical $name identities",
  async ({ candidate, currentIdentity }) => {
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
  },
);

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
