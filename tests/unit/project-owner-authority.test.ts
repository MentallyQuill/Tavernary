import { describe, expect, test } from "vitest";

import {
  detectOwnerRequestConflict,
  verifyProjectOwnerAuthority,
} from "../../scripts/help/project-owner-authority.mjs";

function githubSource(source: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "Owner/Alpha",
    repository_id: 42,
    status: "active",
    status_reason: null,
    refresh_policy: "automatic",
    ...source,
  };
}

function githubIdentity(repository: Record<string, unknown> = {}) {
  return {
    id: 42,
    fullName: "Owner/Alpha",
    htmlUrl: "https://github.com/Owner/Alpha",
    visibility: "public",
    owner: { login: "Owner", type: "User" },
    ...repository,
  };
}

function authorityFixture(repositoryPatch: Record<string, unknown> = {}) {
  return {
    issueAuthor: "owner",
    manifestRepositoryId: 42,
    source: githubSource(),
    repository: githubIdentity(repositoryPatch),
  };
}

describe("exact project-owner authority", () => {
  test("admits the current personal repository owner case-insensitively", () => {
    expect(verifyProjectOwnerAuthority(authorityFixture())).toEqual({
      authorized: true,
      authorityType: "repository-owner",
      actorLogin: "owner",
      ownerLogin: "Owner",
    });
  });

  test.each([
    ["organization", { owner: { login: "Org", type: "Organization" } }],
    ["wrong author", { owner: { login: "Other", type: "User" } }],
    ["private", { visibility: "private" }],
    ["identity mismatch", { id: 99 }],
  ])("rejects %s", (_name, repositoryPatch) => {
    expect(
      verifyProjectOwnerAuthority(authorityFixture(repositoryPatch)),
    ).toMatchObject({ authorized: false });
  });

  test.each([
    [
      "organization sources",
      {
        ...githubSource(),
        type: "github-organization",
        organization: "Owner",
        url: "https://github.com/Owner",
        repository: undefined,
        repository_id: undefined,
      },
    ],
    [
      "external URL sources",
      {
        ...githubSource(),
        type: "url",
        url: "https://example.com/alpha",
        repository: undefined,
        repository_id: undefined,
      },
    ],
    [
      "sources without stored identities",
      githubSource({ repository_id: null }),
    ],
  ])("rejects %s", (_name, source) => {
    expect(
      verifyProjectOwnerAuthority({
        ...authorityFixture(),
        source,
      }),
    ).toMatchObject({ authorized: false });
  });

  test("requires stored, manifest, and API repository IDs to match", () => {
    for (const candidate of [
      { manifestRepositoryId: 0 },
      { manifestRepositoryId: 99 },
      { source: githubSource({ repository_id: 99 }) },
      { repository: githubIdentity({ id: 0 }) },
    ]) {
      expect(
        verifyProjectOwnerAuthority({ ...authorityFixture(), ...candidate }),
      ).toMatchObject({ authorized: false });
    }
  });

  test("never treats related identity evidence as owner authority", () => {
    expect(
      verifyProjectOwnerAuthority({
        ...authorityFixture({
          owner: { login: "ActualOwner", type: "User" },
          commitAuthors: ["requester"],
          collaborators: ["requester"],
          maintainers: ["requester"],
        }),
        issueAuthor: "requester",
        author_association: "COLLABORATOR",
        profileName: "ActualOwner",
        email: "actualowner@example.com",
        rightsHolder: true,
      }),
    ).toMatchObject({ authorized: false });
  });
});

describe("operation-scoped owner request conflict detection", () => {
  test.each(["edit-card", "retire-card", "restore-card"] as const)(
    "uses the card fingerprint for %s",
    (operation) => {
      expect(
        detectOwnerRequestConflict({
          manifest: {
            operation,
            project_fingerprint: "a".repeat(64),
          },
          project: { id: "owner-alpha" },
          currentProjectFingerprint: "a".repeat(64),
        }),
      ).toEqual({ conflict: false, warnings: [] });

      expect(
        detectOwnerRequestConflict({
          manifest: {
            operation,
            project_fingerprint: "a".repeat(64),
          },
          project: { id: "owner-alpha" },
          currentProjectFingerprint: "b".repeat(64),
        }),
      ).toEqual({
        conflict: true,
        reasonCode: "stale-owner-request",
        fields: ["project_fingerprint"],
        warnings: [],
      });
    },
  );

  test.each(["add-cards", "move-source", "delist-source"] as const)(
    "uses the shared source fingerprint for %s",
    (operation) => {
      expect(
        detectOwnerRequestConflict({
          manifest: {
            operation,
            source_fingerprint: "c".repeat(64),
          },
          source: githubSource(),
          currentSourceFingerprint: "c".repeat(64),
        }),
      ).toEqual({ conflict: false, warnings: [] });

      expect(
        detectOwnerRequestConflict({
          manifest: {
            operation,
            source_fingerprint: "c".repeat(64),
          },
          source: githubSource(),
          currentSourceFingerprint: "d".repeat(64),
        }),
      ).toEqual({
        conflict: true,
        reasonCode: "stale-owner-request",
        fields: ["source_fingerprint"],
        warnings: [],
      });
    },
  );

  test("does not let a sibling card edit stale a source-wide request", () => {
    expect(
      detectOwnerRequestConflict({
        manifest: {
          operation: "add-cards",
          source_fingerprint: "e".repeat(64),
        },
        source: githubSource(),
        currentSourceFingerprint: "e".repeat(64),
        currentProjectFingerprint: "f".repeat(64),
      }),
    ).toEqual({ conflict: false, warnings: [] });
  });
});
