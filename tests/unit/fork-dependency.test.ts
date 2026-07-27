import { describe, expect, test } from "vitest";

import { classifyForkDependency } from "../../scripts/submissions/fork-dependency.mjs";

const dependency = {
  repositoryId: 41,
  name: "parent",
  repository: "owner/parent",
  canonicalUrl: "https://github.com/owner/parent",
  issueNumber: null,
};

const repository = {
  visibility: "public" as const,
  archived: false,
  fork: true,
  parent: {
    repositoryId: 41,
    name: "parent",
    repository: "owner/parent",
    canonicalUrl: "https://github.com/owner/parent",
  },
};

const parentProject = {
  id: "parent-project",
  name: "Curated Parent",
  kind: "extension",
  visibility: "published",
  source: {
    type: "github",
    repository: "renamed-owner/renamed-parent",
    repository_id: 41,
  },
};

function classify(
  overrides: Partial<Parameters<typeof classifyForkDependency>[0]> = {},
) {
  return classifyForkDependency({
    repository,
    projects: [],
    priorSubmission: null,
    ancestryRepositoryIds: [42],
    ...overrides,
  });
}

describe("fork submission dependency classification", () => {
  test("returns none for a non-fork or missing parent metadata", () => {
    expect(
      classify({
        repository: { ...repository, fork: false, parent: null },
      }),
    ).toEqual({ status: "none" });
    expect(
      classify({
        repository: { ...repository, parent: null },
      }),
    ).toEqual({ status: "none" });
  });

  test("finds a published parent by immutable repository ID across renames", () => {
    expect(classify({ projects: [parentProject] })).toEqual({
      status: "published",
      parentProjectId: "parent-project",
    });
  });

  test.each(["disabled", "quarantined"])(
    "treats a %s parent as terminally not listed",
    (visibility) => {
      expect(
        classify({
          projects: [{ ...parentProject, visibility }],
        }),
      ).toEqual({
        status: "not-listed",
        dependency,
      });
    },
  );

  test("waits for an unknown public parent review", () => {
    expect(classify()).toEqual({
      status: "waiting",
      dependency,
    });
  });

  test("treats a declined upstream submission as not listed", () => {
    expect(
      classify({
        priorSubmission: {
          issueNumber: 201,
          state: "declined",
        },
      }),
    ).toEqual({
      status: "not-listed",
      dependency: { ...dependency, issueNumber: 201 },
    });
  });

  test("waits on an existing open upstream submission", () => {
    expect(
      classify({
        priorSubmission: {
          issueNumber: 201,
          state: "open",
        },
      }),
    ).toEqual({
      status: "waiting",
      dependency: { ...dependency, issueNumber: 201 },
    });
  });

  test("waits for a merged upstream to appear in the checked-out registry", () => {
    expect(
      classify({
        priorSubmission: {
          issueNumber: 201,
          state: "merged",
        },
      }),
    ).toEqual({
      status: "waiting",
      dependency: { ...dependency, issueNumber: 201 },
    });
  });

  test("stops a repeated ancestor before creating a cycle", () => {
    expect(classify({ ancestryRepositoryIds: [42, 41] })).toEqual({
      status: "not-listed",
      dependency,
      attention: "cycle",
    });
  });

  test("stops before creating a seventeenth ancestry hop", () => {
    expect(
      classify({
        ancestryRepositoryIds: Array.from(
          { length: 16 },
          (_, index) => 100 + index,
        ),
      }),
    ).toEqual({
      status: "not-listed",
      dependency,
      attention: "depth-limit",
    });
  });
});
