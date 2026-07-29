import { describe, expect, test } from "vitest";

import {
  detectOwnerRequestConflict,
  verifyProjectOwnerAuthority,
} from "../../scripts/help/project-owner-authority.mjs";

function githubRecord(
  source: Record<string, unknown> = {},
  record: Record<string, unknown> = {},
) {
  return {
    schema_version: 5,
    id: "owner-alpha",
    name: "Alpha",
    kind: "extension",
    summary: "The original summary.",
    source: {
      type: "github",
      repository: "Owner/Alpha",
      repository_id: 42,
      ...source,
    },
    ...record,
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
    record: githubRecord(),
    repository: githubIdentity(repositoryPatch),
  };
}

describe("exact project-owner authority", () => {
  test("admits the current personal owner case-insensitively", () => {
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
      "organization suite records",
      githubRecord({
        type: "github-organization",
        organization: "Owner",
        url: "https://github.com/Owner",
        repository: undefined,
        repository_id: undefined,
      }),
    ],
    [
      "external URL records",
      githubRecord({
        type: "url",
        url: "https://example.com/alpha",
        repository: undefined,
        repository_id: undefined,
      }),
    ],
    [
      "repositories without stored identities",
      githubRecord({ repository_id: null }),
    ],
  ])("rejects %s", (_name, candidate) => {
    expect(
      verifyProjectOwnerAuthority({
        ...authorityFixture(),
        record: candidate,
      }),
    ).toMatchObject({ authorized: false });
  });

  test("requires all three repository IDs to be equal positive integers", () => {
    for (const candidate of [
      { manifestRepositoryId: 0 },
      { manifestRepositoryId: 99 },
      { record: githubRecord({ repository_id: 99 }) },
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

function editManifest(
  proposed: Record<string, unknown> = {},
  sourceFingerprint = "a".repeat(64),
) {
  return {
    operation: "edit-card" as const,
    source_fingerprint: sourceFingerprint,
    original: {
      kind: "extension",
      name: "Alpha",
      summary: "The original summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
    },
    proposed: {
      name: "Alpha",
      summary: "Owner-authored summary.",
      frontends: ["sillytavern"],
      primary_function: "interface-workflow",
      capabilities: ["automation"],
      model_families: [],
      completion_formats: [],
      ...proposed,
    },
  };
}

describe("owner request conflict detection", () => {
  test("rejects a current change that overlaps a requested field", () => {
    expect(
      detectOwnerRequestConflict({
        manifest: editManifest(),
        record: githubRecord({}, { summary: "Maintainer-edited summary." }),
        currentFingerprint: "b".repeat(64),
      }),
    ).toEqual({
      conflict: true,
      reasonCode: "stale-owner-request",
      fields: ["summary"],
      warnings: [],
    });
  });

  test("warns without conflicting when fingerprint drift is outside requested fields", () => {
    expect(
      detectOwnerRequestConflict({
        manifest: editManifest(),
        record: githubRecord({}, { name: "Maintainer-renamed Alpha" }),
        currentFingerprint: "b".repeat(64),
      }),
    ).toEqual({
      conflict: false,
      warnings: ["source-fingerprint-changed"],
    });
  });

  test("reports no warning when the current fingerprint still matches", () => {
    expect(
      detectOwnerRequestConflict({
        manifest: editManifest({}, "c".repeat(64)),
        record: githubRecord(),
        currentFingerprint: "c".repeat(64),
      }),
    ).toEqual({ conflict: false, warnings: [] });
  });

  test("compares only the current source location for a same-ID move", () => {
    const manifest = {
      operation: "move-source" as const,
      source_fingerprint: "a".repeat(64),
      original: { repository: "Owner/Alpha", repository_id: 42 },
      proposed: { repository: "Owner/Alpha-Renamed", repository_id: 42 },
    };

    expect(
      detectOwnerRequestConflict({
        manifest,
        record: githubRecord({}, { summary: "A concurrent editorial change." }),
        currentFingerprint: "b".repeat(64),
      }),
    ).toEqual({
      conflict: false,
      warnings: ["source-fingerprint-changed"],
    });
    expect(
      detectOwnerRequestConflict({
        manifest,
        record: githubRecord({ repository: "Owner/Alpha-Elsewhere" }),
        currentFingerprint: "b".repeat(64),
      }),
    ).toMatchObject({
      conflict: true,
      reasonCode: "stale-owner-request",
      fields: ["repository"],
    });
  });
});
