import { expect, test } from "vitest";

import {
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
