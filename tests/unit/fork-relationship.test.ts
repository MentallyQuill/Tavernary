import { describe, expect, test } from "vitest";

import { resolveForkRelationship } from "../../scripts/catalog/fork-relationship.mjs";

const parent = {
  schema_version: 5,
  id: "coneja-chibi-vecthare",
  name: "VectHare",
  visibility: "published",
  source: {
    type: "github",
    repository: "Coneja-Chibi/VectHare",
    repository_id: 9001,
  },
};

function forkSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    project_id: "child",
    source_health: "healthy",
    repository: {
      id: 1000,
      fork: true,
      parent: {
        id: 9001,
        owner: "Coneja-Chibi",
        name: "VectHare",
        url: "https://github.com/Coneja-Chibi/VectHare",
      },
    },
    ...overrides,
  };
}

function resolve({
  snapshot = forkSnapshot(),
  parentRecord = parent,
  publicProjectIds = new Set(["coneja-chibi-vecthare"]),
}: {
  snapshot?: ReturnType<typeof forkSnapshot> | null;
  parentRecord?: typeof parent | null;
  publicProjectIds?: Set<string>;
} = {}) {
  return resolveForkRelationship({
    snapshot,
    recordsByRepositoryId: new Map(
      parentRecord ? [[parentRecord.source.repository_id, parentRecord]] : [],
    ),
    publicProjectIds,
  });
}

describe("fork relationship resolution", () => {
  test.each([
    [
      1,
      [{ id: "parent-card", name: "Parent Card" }],
      {
        parentName: "Parent Card",
        parentProjectId: "parent-card",
        parentUrl: null,
        status: "published",
      },
    ],
    [
      2,
      [
        { id: "parent-extension", name: "Parent Extension" },
        { id: "parent-preset", name: "Parent Preset" },
      ],
      {
        parentName: "VectHare",
        parentProjectId: null,
        parentUrl: "https://github.com/Coneja-Chibi/VectHare",
        status: "repository",
      },
    ],
    [
      0,
      [],
      {
        parentName: "VectHare",
        parentProjectId: null,
        parentUrl: null,
        status: "unavailable",
      },
    ],
  ])(
    "resolves a source-backed parent with %i public sibling cards",
    (_count, publicParents, expected) => {
      const source = {
        id: "github-9001",
        type: "github" as const,
        repository: "Coneja-Chibi/VectHare",
        repository_id: 9001,
      };

      expect(
        resolveForkRelationship({
          snapshot: { ...forkSnapshot(), provider: "github" },
          sourcesByRepositoryKey: new Map([["github:9001", source]]),
          publicProjectsBySourceId: new Map([[source.id, publicParents]]),
        }),
      ).toEqual(expected);
    },
  );

  test("resolves a published parent by immutable repository ID", () => {
    expect(resolve()).toEqual({
      parentName: "VectHare",
      parentProjectId: "coneja-chibi-vecthare",
      parentUrl: null,
      status: "published",
    });
  });

  test("uses the registry name after a parent repository rename", () => {
    expect(
      resolve({
        snapshot: forkSnapshot({
          repository: {
            ...forkSnapshot().repository,
            parent: {
              ...forkSnapshot().repository.parent,
              owner: "Old-Owner",
              name: "Old-Name",
              url: "https://github.com/Old-Owner/Old-Name",
            },
          },
        }),
      }),
    ).toEqual({
      parentName: "VectHare",
      parentProjectId: "coneja-chibi-vecthare",
      parentUrl: null,
      status: "published",
    });
  });

  test("keeps only the registry name for a disabled parent", () => {
    expect(
      resolve({
        parentRecord: { ...parent, visibility: "disabled" },
        publicProjectIds: new Set(),
      }),
    ).toEqual({
      parentName: "VectHare",
      parentProjectId: null,
      parentUrl: null,
      status: "not-listed",
    });
  });

  test("keeps only the observed name for an unknown parent", () => {
    expect(
      resolve({ parentRecord: null, publicProjectIds: new Set() }),
    ).toEqual({
      parentName: "VectHare",
      parentProjectId: null,
      parentUrl: null,
      status: "not-listed",
    });
  });

  test("marks last-known provenance unavailable for a stale child snapshot", () => {
    expect(
      resolve({
        snapshot: forkSnapshot({ source_health: "unavailable" }),
      }),
    ).toEqual({
      parentName: "VectHare",
      parentProjectId: null,
      parentUrl: null,
      status: "unavailable",
    });
  });

  test("returns no relationship for a non-fork", () => {
    expect(
      resolve({
        snapshot: forkSnapshot({
          repository: {
            ...forkSnapshot().repository,
            fork: false,
            parent: null,
          },
        }),
      }),
    ).toBeNull();
  });

  test("returns no relationship for a fork without an observed parent", () => {
    expect(
      resolve({
        snapshot: forkSnapshot({
          repository: {
            ...forkSnapshot().repository,
            parent: null,
          },
        }),
      }),
    ).toBeNull();
  });

  test("returns no relationship for a self-link", () => {
    expect(
      resolve({
        snapshot: forkSnapshot({
          repository: {
            ...forkSnapshot().repository,
            parent: {
              ...forkSnapshot().repository.parent,
              id: 1000,
            },
          },
        }),
      }),
    ).toBeNull();
  });
});
