import { expect, test } from "vitest";

import {
  findSubmissionPathCollision,
  parseSubmissionPullRequestMarker,
  planSubmissionPrUpdate,
  renderSubmissionPullRequest,
  submissionBranch,
} from "../../scripts/submissions/project-submission-pr.mjs";

const marker = {
  schema_version: 2 as const,
  operation: "create" as const,
  producer: "project-submission" as const,
  publication_mode: "automatic" as const,
  issue_number: 123,
  project_ids: ["owner-repo"],
  source_id: "github-42",
  source_identity: {
    type: "github" as const,
    canonical: "github:42",
    repository_id: 42,
  },
  actor: { id: 11, login: "Submitter", type: "User" as const },
  authority_type: "community-submitter" as const,
  input_digest: "d".repeat(64),
  input_fingerprints: { projects: {}, source: null },
  base_sha: "b".repeat(40),
  generated_head_sha: "a".repeat(40),
  generated_paths: [
    "data/registry/projects/owner-repo.json",
    "data/registry/sources/github-42.json",
    "data/snapshots/github/github-42.json",
  ],
  policy_version: "2026-07-29",
  copy_result: null,
};

const reviewFixture = {
  issueNumber: 123,
  projectName: "Owner [Repo]",
  report: {
    schema_version: 1 as const,
    issue_number: 123,
    project_id: "owner-repo",
    source_id: "github-42",
    source_provider: "github" as const,
    submitted: {
      source_url: "https://github.com/envy-ai/ai_rpg",
      metadata: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    },
    observed: {
      repository: "Owner/Repo",
      repository_id: 42,
      canonical_url: "https://example.com/a_(b)?x=1&y=2",
    },
    inferred: {
      primary_function: "generation-reasoning",
      tags: ["add-structured-reasoning"],
    },
    metadata_authority: null,
    publication_mode: "automatic" as const,
    copy_mode: null,
    copy_result: null,
    copy_review_status: null,
    copy_review_reason_code: null,
    input_digest: "d".repeat(64),
    source_identity: marker.source_identity,
    actor: marker.actor,
    classificationReview: null,
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
  expect(body).toContain(
    "- **Source url:** [https://github.com/envy-ai/ai\\_rpg](<https://github.com/envy-ai/ai_rpg>)",
  );
  expect(body).toContain(
    "- **Canonical url:** [https://example.com/a\\_\\(b\\)?x=1&y=2](<https://example.com/a_(b)?x=1&y=2>)",
  );
  expect(parseSubmissionPullRequestMarker(body)).toEqual(marker);
});

test("renders unavailable verified-owner copy as a manual review transaction", () => {
  const manualMarker = {
    ...marker,
    publication_mode: "manual" as const,
    authority_type: "repository-owner" as const,
  };
  const body = renderSubmissionPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      metadata_authority: {
        authorityType: "repository-owner" as const,
        actorId: 11,
        actorLogin: "Submitter",
      },
      publication_mode: "manual" as const,
      copy_review_status: "unavailable" as const,
      copy_review_reason_code: "copy-review-unavailable" as const,
    },
    marker: manualMarker,
  });

  expect(body).toContain("Contextual catalog-copy review was unavailable");
  expect(body).toContain("catalog-required whitespace normalization");
  expect(body).toContain(
    "A maintainer must inspect the owner wording before merging",
  );
  expect(body).not.toContain(
    "Eligible transactions publish automatically after required checks pass.",
  );
});

test("renders a dedicated non-mutating classification mismatch warning", () => {
  const body = renderSubmissionPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      classificationReview: {
        status: "possible-mismatch",
        submitted_primary_function: "memory-retrieval",
        suggested_primary_function: "interface-workflow",
        explanation:
          "The source primarily describes user-facing editing controls.",
      },
    },
  });

  expect(body).toContain("## Classification review");
  expect(body).toContain("Memory and retrieval");
  expect(body).toContain("Interface and workflow");
  expect(body).toContain("submitted value remains");
  expect(body).toContain(
    "- [ ] Possible primary-function mismatch was reviewed",
  );
});

test("does not render a mismatch checklist item for unavailable review", () => {
  const body = renderSubmissionPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      classificationReview: {
        status: "classification-check-unavailable",
        submitted_primary_function: "generation-reasoning",
        suggested_primary_function: null,
        explanation: "The optional classification check was unavailable.",
      },
    },
  });

  expect(body).not.toContain(
    "- [ ] Possible primary-function mismatch was reviewed",
  );
});

test("renders invalid URL diagnostics safely instead of throwing", () => {
  const body = renderSubmissionPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      submitted: {
        ...reviewFixture.report.submitted,
        source_url: "not_[a]_url",
      },
    },
  });

  expect(body).toContain("- **Source url:** not\\_\\[a\\]\\_url");
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

test("blocks two ordinary submissions that would create the same source path", () => {
  expect(
    findSubmissionPathCollision({
      repository: "Tavernary/Tavernary",
      issueNumber: 74,
      generatedPaths: [
        "data/registry/projects/alternate-card.json",
        "data/registry/sources/github-42.json",
      ],
      pulls: [
        openPull({
          number: 73,
          issueNumber: 72,
          paths: [
            "data/registry/projects/owner-repo.json",
            "data/registry/sources/github-42.json",
          ],
        }),
      ],
    }),
  ).toMatchObject({
    issueNumber: 72,
    paths: ["data/registry/sources/github-42.json"],
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
