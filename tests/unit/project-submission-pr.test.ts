import { expect, test } from "vitest";

import {
  findSubmissionPathCollision,
  parseSubmissionPullRequestMarker,
  planSubmissionPrUpdate,
  renderSubmissionPullRequest,
  submissionBranch,
} from "../../scripts/submissions/project-submission-pr.mjs";

const marker = {
  schema_version: 1 as const,
  issue_number: 123,
  generated_head_sha: "a".repeat(40),
  generated_paths: [
    "data/registry/projects/owner-repo.json",
    "data/snapshots/github/owner-repo.json",
  ],
};

const reviewFixture = {
  issueNumber: 123,
  projectName: "Owner [Repo]",
  report: {
    schema_version: 1 as const,
    issue_number: 123,
    project_id: "owner-repo",
    submitted: {
      name: "Owner [Repo]",
      description: "Submitted description.",
    },
    observed: {
      repository: "Owner/Repo",
      repository_id: 42,
    },
    inferred: {
      primary_function: "generation-reasoning",
      capabilities: ["planning-reasoning"],
    },
    warnings: ["Repository is archived."],
  },
  marker,
};

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

test("uses one deterministic issue-owned branch", () => {
  expect(submissionBranch(123)).toBe("automation/project-submission-123");
});

test("renders the issue link, evidence groups, warnings, checklist, and marker", () => {
  const body = renderSubmissionPullRequest(reviewFixture);

  expect(body).toContain("Closes #123");
  expect(body).toContain("## Submitted");
  expect(body).toContain("## Observed");
  expect(body).toContain("## Inferred");
  expect(body).toContain("## Warnings");
  expect(body).toContain(
    "- [ ] Canonical source and permanent identity are correct",
  );
  expect(body).toContain("Owner \\[Repo\\]");
  expect(parseSubmissionPullRequestMarker(body)).toEqual(marker);
});

test("refuses to overwrite a maintainer-edited head", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: "maintainer",
      markerHeadSha: "generated",
      forceRegeneration: false,
      generatedContentChanged: true,
      generatedPaths: marker.generated_paths,
    }),
  ).toEqual({
    action: "conflict",
    message: expect.stringContaining("maintainer changes"),
  });
});

test("plans creation for an issue without a generated branch", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: null,
      markerHeadSha: null,
      forceRegeneration: false,
      generatedContentChanged: true,
      generatedPaths: marker.generated_paths,
    }),
  ).toEqual({
    action: "create",
    replacePaths: marker.generated_paths,
  });
});

test("updates an untouched generated head", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: "generated",
      markerHeadSha: "generated",
      forceRegeneration: false,
      generatedContentChanged: true,
      generatedPaths: marker.generated_paths,
    }),
  ).toEqual({
    action: "update",
    replacePaths: marker.generated_paths,
    forced: false,
  });
});

test("explicit force replaces only generated paths after divergence", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: "maintainer",
      markerHeadSha: "generated",
      forceRegeneration: true,
      generatedContentChanged: true,
      generatedPaths: marker.generated_paths,
    }),
  ).toEqual({
    action: "update",
    replacePaths: marker.generated_paths,
    forced: true,
  });
});

test("does nothing when generated content is unchanged", () => {
  expect(
    planSubmissionPrUpdate({
      remoteHeadSha: "generated",
      markerHeadSha: "generated",
      forceRegeneration: false,
      generatedContentChanged: false,
      generatedPaths: marker.generated_paths,
    }),
  ).toEqual({ action: "noop" });
});

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
      pulls: [
        {
          ...openPull({ number: 73, issueNumber: 72 }),
          body: "<!-- tavernary-project-submission-pr\nnot-json\n-->",
        },
      ],
    }),
  ).toBeNull();
});
