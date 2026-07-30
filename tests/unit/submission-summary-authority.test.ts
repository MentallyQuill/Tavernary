import { expect, test } from "vitest";

import {
  classifySubmissionMetadataAuthority,
  classifySubmissionSummaryAuthority,
  resolveSubmissionMetadataRequest,
} from "../../scripts/submissions/submission-summary-authority.mjs";

const trustedEditorRegistry = {
  schema_version: 1 as const,
  editors: [
    {
      github_user_id: 7,
      login: "TavernaryMaintainer",
      role: "maintainer" as const,
    },
  ],
};

const githubSource = {
  kind: "repository" as const,
  provider: "github" as const,
  canonicalUrl: "https://github.com/ProjectOwner/Project",
  repository: "ProjectOwner/Project",
  repositoryId: 42,
  owner: "ProjectOwner",
  name: "Project",
};

test("uses immutable IDs to recognize a personal GitHub repository owner", () => {
  expect(
    classifySubmissionSummaryAuthority({
      issueActor: { id: 11, login: "projectowner" },
      authorAssociation: "NONE",
      sourceIdentity: githubSource,
      repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
      trustedEditorRegistry,
    }),
  ).toEqual({
    authorityType: "repository-owner",
    actorId: 11,
    actorLogin: "projectowner",
  });
});

test.each([
  [
    "mismatched actor ID",
    {
      issueActor: { id: 12, login: "Collaborator" },
      authorAssociation: "NONE",
      sourceIdentity: githubSource,
      repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
    },
  ],
  [
    "collaborator association",
    {
      issueActor: { id: 12, login: "Collaborator" },
      authorAssociation: "COLLABORATOR",
      sourceIdentity: githubSource,
      repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
    },
  ],
  [
    "organization owner",
    {
      issueActor: { id: 11, login: "ProjectOrg" },
      authorAssociation: "NONE",
      sourceIdentity: githubSource,
      repositoryOwner: { id: 11, login: "ProjectOrg", type: "Organization" },
    },
  ],
  [
    "Codeberg repository",
    {
      issueActor: { id: 11, login: "ProjectOwner" },
      authorAssociation: "NONE",
      sourceIdentity: { ...githubSource, provider: "codeberg" as const },
      repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
    },
  ],
  [
    "missing owner ID",
    {
      issueActor: { id: 11, login: "ProjectOwner" },
      authorAssociation: "NONE",
      sourceIdentity: githubSource,
      repositoryOwner: {
        id: null,
        login: "ProjectOwner",
        type: "User",
      },
    },
  ],
] as const)("%s remains a community submitter", (_name, input) => {
  expect(
    classifySubmissionSummaryAuthority({
      ...input,
      trustedEditorRegistry,
    }),
  ).toMatchObject({ authorityType: "community-submitter" });
});

test("requires both the trusted-editor registry and host association for staff", () => {
  const base = {
    issueActor: { id: 7, login: "tavernarymaintainer" },
    sourceIdentity: githubSource,
    repositoryOwner: {
      id: 7,
      login: "TavernaryMaintainer",
      type: "User",
    },
    trustedEditorRegistry,
  };

  expect(
    classifySubmissionSummaryAuthority({
      ...base,
      authorAssociation: "MEMBER",
    }),
  ).toEqual({
    authorityType: "tavernary-staff",
    actorId: 7,
    actorLogin: "tavernarymaintainer",
  });
  expect(
    classifySubmissionSummaryAuthority({
      ...base,
      authorAssociation: "NONE",
      repositoryOwner: {
        id: 99,
        login: "DifferentOwner",
        type: "User",
      },
    }),
  ).toEqual({
    authorityType: "community-submitter",
    actorId: 7,
    actorLogin: "tavernarymaintainer",
  });
});

test("staff authority wins before a matching repository-owner route", () => {
  expect(
    classifySubmissionSummaryAuthority({
      issueActor: { id: 7, login: "TavernaryMaintainer" },
      authorAssociation: "OWNER",
      sourceIdentity: githubSource,
      repositoryOwner: {
        id: 7,
        login: "TavernaryMaintainer",
        type: "User",
      },
      trustedEditorRegistry,
    }),
  ).toMatchObject({ authorityType: "tavernary-staff" });
});

test("retains the summary authority name as a forwarding alias", () => {
  const input = {
    issueActor: { id: 11, login: "projectowner" },
    authorAssociation: "NONE",
    sourceIdentity: githubSource,
    repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
    trustedEditorRegistry,
  };

  expect(classifySubmissionSummaryAuthority(input)).toEqual(
    classifySubmissionMetadataAuthority(input),
  );
});

test("retains an immutable GitHub bot actor for generated submissions", () => {
  expect(
    classifySubmissionSummaryAuthority({
      issueActor: {
        id: 41_898_282,
        login: "github-actions[bot]",
        type: "Bot",
      },
      authorAssociation: "CONTRIBUTOR",
      sourceIdentity: githubSource,
      repositoryOwner: { id: 11, login: "ProjectOwner", type: "User" },
      trustedEditorRegistry,
    }),
  ).toEqual({
    authorityType: "community-submitter",
    actorId: 41_898_282,
    actorLogin: "github-actions[bot]",
    actorType: "Bot",
  });
});

test("honors independent manual metadata only for an authorized owner", () => {
  const requested = {
    summary: { mode: "manual" as const, value: "Owner summary." },
    tags: {
      mode: "manual" as const,
      values: ["automate-workflows", "creative-writing"],
    },
  };

  expect(
    resolveSubmissionMetadataRequest({
      requested,
      authority: {
        authorityType: "repository-owner",
        actorId: 11,
        actorLogin: "projectowner",
      },
    }),
  ).toEqual(requested);
});

test("discards community manual values before drafting or generation", () => {
  expect(
    resolveSubmissionMetadataRequest({
      requested: {
        summary: { mode: "manual", value: "Untrusted summary." },
        tags: { mode: "manual", values: ["automate-workflows"] },
      },
      authority: {
        authorityType: "community-submitter",
        actorId: 12,
        actorLogin: "contributor",
      },
    }),
  ).toEqual({
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  });
});
