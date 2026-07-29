import { expect, test } from "vitest";

import type { ProjectPublicationTransaction } from "../../scripts/publication/project-publication-transaction.mjs";
import {
  ownerRequestBranch,
  parseOwnerRequestPullRequestMarker,
  planOwnerPrUpdate,
  renderOwnerRequestPullRequest,
} from "../../scripts/help/project-owner-pr.mjs";

const marker = {
  schema_version: 1 as const,
  issue_number: 123,
  project_id: "owner-alpha",
  operation: "edit-card" as const,
  repository_id: 42,
  authority_type: "repository-owner" as const,
  actor_login: "Owner",
  generated_head_sha: "a".repeat(40),
  generated_paths: ["data/registry/projects/owner-alpha.json"],
};

const transactionMarker: ProjectPublicationTransaction = {
  schema_version: 2 as const,
  operation: "edit-card" as const,
  producer: "project-owner-request" as const,
  publication_mode: "automatic" as const,
  issue_number: 123,
  project_ids: ["owner-alpha"],
  source_id: "github-42",
  source_identity: {
    type: "github" as const,
    canonical: "github:42",
    repository_id: 42,
  },
  actor: { id: 11, login: "Owner", type: "User" as const },
  authority_type: "repository-owner" as const,
  input_digest: "d".repeat(64),
  input_fingerprints: {
    projects: { "owner-alpha": "e".repeat(64) },
    source: null,
  },
  base_sha: "b".repeat(40),
  generated_head_sha: "a".repeat(40),
  generated_paths: marker.generated_paths,
  policy_version: "2026-07-29",
  copy_result: {
    mode: "preserve" as const,
    result: "accepted-with-light-edits" as const,
    change_reasons: ["punctuation-corrected"],
    policy_signal: "none" as const,
  },
};

const reviewFixture = {
  issueNumber: 123,
  projectName: "Alpha [Tool]",
  report: {
    schema_version: 1 as const,
    issue_number: 123,
    project_id: "owner-alpha",
    project_ids: ["owner-alpha"],
    source_id: "github-42",
    publication_mode: "automatic" as const,
    operation: "edit-card" as const,
    repository_id: 42,
    authority_type: "repository-owner" as const,
    actor_login: "Owner",
    submitted_summary: "New owner summary",
    published_summary: "New owner summary.",
    copy_result: {
      result: "accepted-with-light-edits" as const,
      change_reasons: ["punctuation-corrected"],
      policy_signal: "none" as const,
    },
    before: {
      summary: "Old summary.",
      enrichment_policy: "automatic",
    },
    after: {
      summary: "New owner summary.",
      enrichment_policy: "manual",
    },
    warnings: ["source-fingerprint-changed"],
    generated_paths: marker.generated_paths,
  },
  marker: transactionMarker,
};

function ownerPull({
  issueNumber = 122,
  projectId = "owner-alpha",
  repository = "Tavernary/Tavernary",
}: {
  issueNumber?: number;
  projectId?: string;
  repository?: string;
} = {}) {
  const pullMarker = {
    ...marker,
    issue_number: issueNumber,
    project_id: projectId,
    generated_paths: [`data/registry/projects/${projectId}.json`],
  };
  return {
    number: 88,
    html_url: "https://github.com/Tavernary/Tavernary/pull/88",
    body: [
      "<!-- tavernary-project-owner-pr",
      JSON.stringify(pullMarker),
      "-->",
    ].join("\n"),
    head: {
      ref: `automation/project-owner-request-${issueNumber}`,
      repo: { full_name: repository },
    },
  };
}

function submissionPull() {
  return {
    number: 89,
    html_url: "https://github.com/Tavernary/Tavernary/pull/89",
    body: [
      "<!-- tavernary-project-submission-pr",
      JSON.stringify({
        schema_version: 1,
        issue_number: 121,
        generated_head_sha: "b".repeat(40),
        generated_paths: ["data/registry/projects/owner-alpha.json"],
      }),
      "-->",
    ].join("\n"),
    head: {
      ref: "automation/project-submission-121",
      repo: { full_name: "Tavernary/Tavernary" },
    },
  };
}

function planInput(overrides: Record<string, unknown> = {}) {
  return {
    issueNumber: 123,
    projectId: "owner-alpha",
    operation: "edit-card" as const,
    repositoryId: 42,
    authorityType: "repository-owner" as const,
    actorLogin: "Owner",
    repository: "Tavernary/Tavernary",
    remoteHeadSha: null,
    markerHeadSha: null,
    existingMarker: null,
    generatedContentChanged: true,
    forceRegeneration: false,
    generatedPaths: marker.generated_paths,
    pulls: [],
    ...overrides,
  };
}

function existingOwnerMarker(markerOverrides: Record<string, unknown> = {}) {
  return {
    kind: "project-owner",
    marker: { ...marker, ...markerOverrides },
  };
}

test("uses one deterministic owner issue branch", () => {
  expect(ownerRequestBranch(123)).toBe("automation/project-owner-request-123");
});

test("renders verified identity, before/after values, and policy effects", () => {
  const body = renderOwnerRequestPullRequest(reviewFixture);
  expect(body).toContain("Closes #123");
  expect(body).toContain("Verified repository owner: `Owner`");
  expect(body).toContain("## Before");
  expect(body).toContain("## After");
  expect(body).toContain("Enrichment policy");
  expect(body).toContain("## Catalog copy");
  expect(body).toContain("limited preservation edits");
  expect(body).toContain("Punctuation corrected");
  expect(body).toContain("Alpha \\[Tool\\]");
  expect(parseOwnerRequestPullRequestMarker(body)).toEqual(transactionMarker);
});

test("accepts a trusted staff marker without repository identity", () => {
  const staffMarker = {
    ...transactionMarker,
    source_identity: null,
    authority_type: "tavernary-staff" as const,
    actor: {
      ...transactionMarker.actor,
      login: "MentallyQuill",
    },
  };
  const body = renderOwnerRequestPullRequest({
    ...reviewFixture,
    report: {
      ...reviewFixture.report,
      repository_id: null,
      authority_type: "tavernary-staff",
      actor_login: "MentallyQuill",
    },
    marker: staffMarker,
  });

  expect(body).toContain("Authorized Tavernary staff actor: `MentallyQuill`");
  expect(parseOwnerRequestPullRequestMarker(body)).toEqual(staffMarker);
});

test("bounds and escapes untrusted Markdown without creating a second marker", () => {
  const body = renderOwnerRequestPullRequest({
    ...reviewFixture,
    projectName: `x\n<!-- tavernary-project-owner-pr\n${"z".repeat(600)}`,
    report: {
      ...reviewFixture.report,
      after: {
        summary: "```sh\nrm -rf /\n```\n# injected",
      },
    },
  });

  expect(
    body.match(/<!-- tavernary-project-publication-transaction/gu),
  ).toHaveLength(1);
  expect(body).not.toContain("```sh");
  expect(body).not.toContain("\n# injected");
  expect(body.length).toBeLessThan(6_000);
});

test("accepts only the exact operation-owned generated paths", () => {
  const moveMarker = {
    ...marker,
    operation: "move-source" as const,
    generated_paths: [
      "data/registry/projects/owner-alpha.json",
      "data/snapshots/github/owner-alpha.json",
    ],
  };
  const body = [
    "<!-- tavernary-project-owner-pr",
    JSON.stringify(moveMarker),
    "-->",
  ].join("\n");
  expect(parseOwnerRequestPullRequestMarker(body)).toEqual(moveMarker);

  for (const generated_paths of [
    ["data/registry/projects/other.json"],
    ["data/registry/projects/owner-alpha.json", "scripts/injected.mjs"],
    [
      "data/registry/projects/owner-alpha.json",
      "data/snapshots/github/owner-alpha.json",
    ],
  ]) {
    const invalid = {
      ...marker,
      generated_paths,
    };
    expect(
      parseOwnerRequestPullRequestMarker(
        [
          "<!-- tavernary-project-owner-pr",
          JSON.stringify(invalid),
          "-->",
        ].join("\n"),
      ),
    ).toBeNull();
  }
});

test("plans create, safe update, and no-op without auto-merge state", () => {
  expect(planOwnerPrUpdate(planInput())).toEqual({
    action: "create",
    replacePaths: marker.generated_paths,
  });
  expect(
    planOwnerPrUpdate(
      planInput({
        remoteHeadSha: "a".repeat(40),
        markerHeadSha: "a".repeat(40),
        existingMarker: existingOwnerMarker(),
      }),
    ),
  ).toEqual({
    action: "update",
    replacePaths: marker.generated_paths,
  });
  expect(
    planOwnerPrUpdate(
      planInput({
        remoteHeadSha: "a".repeat(40),
        markerHeadSha: "a".repeat(40),
        existingMarker: existingOwnerMarker(),
        generatedContentChanged: false,
      }),
    ),
  ).toEqual({ action: "noop" });
});

test("refuses both ordinary and explicit regeneration after maintainer divergence", () => {
  for (const forceRegeneration of [false, true]) {
    expect(
      planOwnerPrUpdate(
        planInput({
          remoteHeadSha: "b".repeat(40),
          markerHeadSha: "a".repeat(40),
          existingMarker: existingOwnerMarker(),
          forceRegeneration,
        }),
      ),
    ).toMatchObject({
      action: "conflict",
      reasonCode: "maintainer-divergence",
    });
  }
});

test.each([
  ["missing marker", null],
  ["marker kind", { kind: "project-submission", marker: { ...marker } }],
  ["issue", existingOwnerMarker({ issue_number: 999 })],
  ["project", existingOwnerMarker({ project_id: "other-project" })],
  ["operation", existingOwnerMarker({ operation: "delist" })],
  ["repository", existingOwnerMarker({ repository_id: 99 })],
  ["authority", existingOwnerMarker({ authority_type: "tavernary-staff" })],
  ["actor", existingOwnerMarker({ actor_login: "OtherOwner" })],
  [
    "paths",
    existingOwnerMarker({
      generated_paths: ["data/registry/projects/other-project.json"],
    }),
  ],
])(
  "refuses update when existing %s ownership does not match",
  (_kind, value) => {
    expect(
      planOwnerPrUpdate(
        planInput({
          remoteHeadSha: "a".repeat(40),
          markerHeadSha: "a".repeat(40),
          existingMarker: value,
        }),
      ),
    ).toMatchObject({
      action: "conflict",
      reasonCode: "existing-marker-mismatch",
    });
  },
);

test("rejects path collisions with open owner and project-submission PRs", () => {
  for (const pull of [ownerPull(), submissionPull()]) {
    expect(planOwnerPrUpdate(planInput({ pulls: [pull] }))).toMatchObject({
      action: "conflict",
      reasonCode: "generated-path-collision",
      collision: {
        prNumber: pull.number,
        paths: marker.generated_paths,
      },
    });
  }
});

test("treats a same-number project-submission PR as a collision", () => {
  const pull = {
    ...submissionPull(),
    body: submissionPull().body.replace(
      '"issue_number":121',
      '"issue_number":123',
    ),
    head: {
      ...submissionPull().head,
      ref: "automation/project-submission-123",
    },
  };

  expect(planOwnerPrUpdate(planInput({ pulls: [pull] }))).toMatchObject({
    action: "conflict",
    reasonCode: "generated-path-collision",
    collision: { prNumber: 89 },
  });
});

test("ignores the current issue, non-overlap, and fork marker spoofing", () => {
  expect(
    planOwnerPrUpdate(
      planInput({
        pulls: [
          ownerPull({ issueNumber: 123 }),
          ownerPull({ projectId: "other-project" }),
          ownerPull({ repository: "attacker/Tavernary" }),
        ],
      }),
    ),
  ).toMatchObject({ action: "create" });
});

test("ignores an explicitly closed generated pull request", () => {
  expect(
    planOwnerPrUpdate(
      planInput({
        pulls: [{ ...ownerPull(), state: "closed" }],
      }),
    ),
  ).toMatchObject({ action: "create" });
});

test("fails closed on caller-supplied generated paths", () => {
  expect(() =>
    planOwnerPrUpdate(
      planInput({
        generatedPaths: [
          "data/registry/projects/owner-alpha.json",
          "../../workflow.yml",
        ],
      }),
    ),
  ).toThrow("generated paths");
});
