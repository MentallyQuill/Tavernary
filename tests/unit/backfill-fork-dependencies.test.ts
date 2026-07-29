import { describe, expect, test, vi } from "vitest";

import {
  applyForkDependencyBackfill,
  observeForkBackfillParents,
  planForkDependencyBackfill,
} from "../../scripts/submissions/backfill-fork-dependencies.mjs";

function project(
  id: string,
  repositoryId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: id,
    kind: "extension",
    primary_function: "interface-workflow",
    summary: `${id} summary`,
    listing_status: "active",
    source_id: `github-${repositoryId}`,
    frontends: ["sillytavern"],
    model_families: [],
    completion_formats: [],
    ...overrides,
  };
}

function source(
  id: string,
  repositoryId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `github-${repositoryId}`,
    type: "github",
    repository: `owner/${id}`,
    repository_id: repositoryId,
    status: "active",
    refresh_policy: "automatic",
    ...overrides,
  };
}

function snapshot(
  sourceId: string,
  repositoryId: number,
  parent: {
    id: number;
    owner: string;
    name: string;
    url: string;
  } | null,
) {
  return {
    schema_version: 4,
    provider: "github",
    source_id: sourceId,
    repository: {
      id: repositoryId,
      owner: "owner",
      name: sourceId,
      url: `https://github.com/owner/${sourceId}`,
      fork: true,
      parent,
    },
    contributors: { accounts: [], refreshed_at: "2026-07-27T00:00:00Z" },
    activity_scan: { next_page: 2 },
    activity: { evidence_status: "complete", latest_release_at: null },
    community: {
      stargazers_count: 1,
      forks_count: 2,
      subscribers_count: 3,
      aggregate: 6,
    },
    license: { status: "osi-approved", spdx_id: "MIT", source_path: "LICENSE" },
    source_health: "healthy",
    refreshed_at: "2026-07-27T00:00:00Z",
    stale_since: null,
  };
}

const parent = {
  id: 41,
  owner: "upstream",
  name: "parent",
  url: "https://github.com/upstream/parent",
};

describe("fork dependency backfill planning", () => {
  test("selects only eligible children and deduplicates missing parents by ID", () => {
    const projects = [
      project("child-b", 43),
      project("child-a", 42),
      project("manual", 44),
      project("disabled", 45, { listing_status: "retired" }),
      project("url-source", 46, {
        source_id: "url-source",
      }),
    ];
    const sources = [
      source("child-b", 43),
      source("child-a", 42),
      source("manual", 44, { refresh_policy: "paused" }),
      source("disabled", 45),
      {
        id: "url-source",
        type: "url",
        url: "https://example.com/preset",
        status: "active",
        refresh_policy: "paused",
      },
    ];
    const snapshots = [
      snapshot("github-43", 43, parent),
      snapshot("github-42", 42, parent),
      snapshot("github-44", 44, parent),
      snapshot("github-45", 45, parent),
      snapshot("url-source", 46, parent),
    ];

    expect(
      planForkDependencyBackfill({ projects, sources, snapshots }),
    ).toEqual([
      expect.objectContaining({
        parentRepositoryId: 41,
        parentName: "parent",
        parentRepository: "upstream/parent",
        dependentProjectIds: ["child-a", "child-b"],
        manifest: expect.objectContaining({
          schema_version: 3,
          project_type: "extension",
          primary_function: "interface-workflow",
          source_url: "https://github.com/upstream/parent",
          name: "parent",
          frontends: { known_ids: ["sillytavern"], other: [] },
        }),
      }),
    ]);
  });

  test("skips parents already present in any registry visibility", () => {
    expect(
      planForkDependencyBackfill({
        projects: [
          project("child", 42),
          project("parent-project", 41, { listing_status: "quarantined" }),
        ],
        sources: [source("child", 42), source("parent-project", 41)],
        snapshots: [snapshot("github-42", 42, parent)],
      }),
    ).toEqual([]);
  });

  test("fails closed when children disagree on the parent project kind", () => {
    expect(() =>
      planForkDependencyBackfill({
        projects: [
          project("extension-child", 42),
          project("preset-child", 43, {
            kind: "preset",
            model_families: ["claude"],
            completion_formats: ["chat-completion"],
          }),
        ],
        sources: [source("extension-child", 42), source("preset-child", 43)],
        snapshots: [
          snapshot("github-42", 42, parent),
          snapshot("github-43", 43, parent),
        ],
      }),
    ).toThrow(/incompatible child kinds/iu);
  });

  test("fails closed when child forks disagree on the parent primary function", () => {
    expect(() =>
      planForkDependencyBackfill({
        projects: [
          project("workflow-child", 42),
          project("memory-child", 43, {
            primary_function: "memory-retrieval",
          }),
        ],
        sources: [source("workflow-child", 42), source("memory-child", 43)],
        snapshots: [
          snapshot("github-42", 42, parent),
          snapshot("github-43", 43, parent),
        ],
      }),
    ).toThrow(/incompatible child primary functions/iu);
  });

  test("sorts candidates by numeric parent repository ID", () => {
    const laterParent = {
      id: 99,
      owner: "later",
      name: "later",
      url: "https://github.com/later/later",
    };
    expect(
      planForkDependencyBackfill({
        projects: [project("later-child", 50), project("child", 42)],
        sources: [source("later-child", 50), source("child", 42)],
        snapshots: [
          snapshot("github-50", 50, laterParent),
          snapshot("github-42", 42, parent),
        ],
      }).map(({ parentRepositoryId }) => parentRepositoryId),
    ).toEqual([41, 99]);
  });

  test("re-observes only known legacy fork records and preserves snapshot evidence", async () => {
    const legacy = snapshot("github-42", 42, null);
    const ordinary = {
      ...snapshot("github-43", 43, null),
      repository: {
        ...snapshot("github-43", 43, null).repository,
        fork: false,
      },
    };
    const observe = vi.fn().mockResolvedValue({
      observations: [
        {
          sourceId: "github-42",
          repository: {
            id: 42,
            owner: "owner",
            name: "legacy",
            url: "https://github.com/owner/legacy",
            description: null,
            defaultBranch: "main",
            headSha: "a".repeat(40),
            headCommittedAt: "2026-07-27T00:00:00.000Z",
            archived: false,
            fork: true,
            parent,
            createdAt: "2026-01-01T00:00:00.000Z",
            sizeKb: 10,
          },
          community: {
            stargazersCount: 46,
            forksCount: 4,
            subscribersCount: 2,
          },
          latestReleaseAt: null,
          coarseLicenseSpdxId: "MIT",
        },
      ],
      failures: [],
      usage: { requestCount: 1, pointCost: 2, remainingPoints: 4000 },
    });

    const result = await observeForkBackfillParents({
      projects: [project("legacy", 42), project("ordinary", 43)],
      sources: [source("legacy", 42), source("ordinary", 43)],
      snapshots: [legacy, ordinary],
      token: "token",
      observe,
      now: "2026-07-28T00:00:00.000Z",
    });

    expect(observe).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "github-42" })],
      expect.objectContaining({ token: "token" }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.updatedSnapshots[0]).toMatchObject({
      repository: { parent },
      community: {
        stars_count: 46,
        forks_count: 4,
        watchers_count: 2,
        aggregate: 52,
      },
      contributors: legacy.contributors,
      activity_scan: legacy.activity_scan,
      activity: legacy.activity,
      license: legacy.license,
    });
    expect(
      Number.isInteger(result.updatedSnapshots[0].community.aggregate),
    ).toBe(true);
  });
});

describe("fork dependency backfill apply gate", () => {
  const candidate = {
    parentRepositoryId: 41,
    parentName: "parent",
    parentRepository: "upstream/parent",
    dependentProjectIds: ["child"],
    dependentRepositoryIds: [42],
    manifest: {
      schema_version: 3 as const,
      project_type: "extension" as const,
      primary_function: "interface-workflow",
      source_url: "https://github.com/owner/child",
      name: "child",
      description: null,
      frontends: { known_ids: ["sillytavern"], other: [] },
      frontend_independent: false,
      additional_context: null,
    },
  };

  test("dry-run reports candidates without mutations", async () => {
    const request = vi.fn();
    await expect(
      applyForkDependencyBackfill({
        candidates: [candidate],
        repository: "Tavernary/Tavernary",
        request,
        apply: false,
      }),
    ).resolves.toMatchObject({
      mode: "dry-run",
      candidates: [candidate],
      createdIssueNumbers: [],
      reusedIssueNumbers: [],
      terminalIssueNumbers: [],
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("apply creates serially and a second apply reuses the same issue", async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    let upstreamIssue: Record<string, unknown> | null = null;
    const request = vi.fn(async (path: string, options = {}) => {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (path.includes("/issues?"))
        return upstreamIssue ? [upstreamIssue] : [];
      if (path.endsWith("/issues") && method === "POST") {
        const rendered = JSON.parse(options.body);
        upstreamIssue = {
          number: 201,
          state: "open",
          labels: rendered.labels,
          body: rendered.body,
        };
        return upstreamIssue;
      }
      if (path.endsWith("/dispatches") && method === "POST") return null;
      throw new Error(`Unexpected request ${method} ${path}`);
    });

    const first = await applyForkDependencyBackfill({
      candidates: [candidate],
      repository: "Tavernary/Tavernary",
      request,
      apply: true,
      updatedSnapshotPaths: ["data/snapshots/github/child.json"],
    });
    const second = await applyForkDependencyBackfill({
      candidates: [candidate],
      repository: "Tavernary/Tavernary",
      request,
      apply: true,
      updatedSnapshotPaths: ["data/snapshots/github/child.json"],
    });

    expect(first).toMatchObject({
      mode: "apply",
      createdIssueNumbers: [201],
      reusedIssueNumbers: [],
      terminalIssueNumbers: [],
      updatedSnapshotPaths: ["data/snapshots/github/child.json"],
    });
    expect(second).toMatchObject({
      mode: "apply",
      createdIssueNumbers: [],
      reusedIssueNumbers: [201],
      terminalIssueNumbers: [],
    });
    expect(
      requests.filter(
        ({ path, method }) => path.endsWith("/issues") && method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      requests.filter(({ path }) => path.endsWith("/dispatches")),
    ).toHaveLength(1);
  });

  test("apply reports terminal upstream issues without dispatching", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("/issues?")) {
        return [
          {
            number: 201,
            state: "closed",
            labels: ["project-submission", "submission-declined"],
            body: [
              "<!-- tavernary-fork-upstream",
              JSON.stringify({
                schema_version: 1,
                repository_id: 41,
                dependent_project_ids: ["child"],
                ancestry_repository_ids: [42, 41],
              }),
              "-->",
            ].join("\n"),
          },
        ];
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await expect(
      applyForkDependencyBackfill({
        candidates: [candidate],
        repository: "Tavernary/Tavernary",
        request,
        apply: true,
      }),
    ).resolves.toMatchObject({
      terminalIssueNumbers: [201],
      createdIssueNumbers: [],
      reusedIssueNumbers: [],
    });
  });
});
