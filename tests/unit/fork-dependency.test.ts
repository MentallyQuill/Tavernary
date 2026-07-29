import { describe, expect, test, vi } from "vitest";

import {
  classifyForkDependency,
  ensureForkParentSubmission,
  parseForkUpstreamMarker,
  renderForkParentIssue,
} from "../../scripts/submissions/fork-dependency.mjs";
import { parseProjectSubmissionIssue } from "../../scripts/submissions/parse-project-submission.mjs";

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
  listing_status: "active",
  source_id: "github-41",
};
const parentSource = {
  id: "github-41",
  type: "github",
  repository: "renamed-owner/renamed-parent",
  repository_id: 41,
};

const childManifest = {
  schema_version: 3 as const,
  project_type: "preset" as const,
  primary_function: "preset",
  source_url: "https://github.com/owner/child",
  name: "Child",
  description: "Child description.",
  frontends: { known_ids: ["sillytavern"], other: [] },
  frontend_independent: false,
  additional_context: "Child context.",
  preset_compatibility: {
    model_families: { known_ids: ["claude"], other: [] },
    completion_formats: ["chat-completion"],
  },
};

function classify(
  overrides: Partial<Parameters<typeof classifyForkDependency>[0]> = {},
) {
  return classifyForkDependency({
    repository,
    projects: [],
    sources: [],
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
    expect(
      classify({ projects: [parentProject], sources: [parentSource] }),
    ).toEqual({
      status: "published",
      parentProjectId: "parent-project",
    });
  });

  test.each(["retired", "quarantined"])(
    "treats a %s parent as terminally not listed",
    (listingStatus) => {
      expect(
        classify({
          projects: [{ ...parentProject, listing_status: listingStatus }],
          sources: [parentSource],
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

describe("fork parent submission issues", () => {
  test("renders a normal review issue with bounded ancestry provenance", () => {
    const issue = renderForkParentIssue({
      dependency,
      dependentIssueNumber: 123,
      manifest: childManifest,
      ancestryRepositoryIds: [42],
    });

    expect(issue.title).toBe("[Project submission] owner/parent");
    expect(issue.labels).toEqual(["issue-admitted", "project-submission"]);
    expect(parseForkUpstreamMarker(issue.body)).toEqual({
      schema_version: 1,
      repository_id: 41,
      dependent_issue_number: 123,
      ancestry_repository_ids: [42, 41],
    });
    expect(parseProjectSubmissionIssue(issue.body)).toMatchObject({
      valid: true,
      source: "manifest",
      manifest: {
        project_type: "preset",
        source_url: "https://github.com/owner/parent",
        name: "parent",
        frontends: childManifest.frontends,
        preset_compatibility: childManifest.preset_compatibility,
      },
    });
    expect(issue.body).toContain(
      "automatically discovered as the immediate upstream of #123",
    );
    expect(issue.body).toContain(
      "Maintainers must correct any inherited classification before merge.",
    );
    expect(issue.body).not.toMatch(/edit this issue|provide|respond/iu);
  });

  test("rejects repeated or over-limit ancestry before rendering", () => {
    expect(() =>
      renderForkParentIssue({
        dependency,
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: [42, 41],
      }),
    ).toThrow(/repeated repository ID/iu);
    expect(() =>
      renderForkParentIssue({
        dependency,
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: Array.from(
          { length: 16 },
          (_, index) => 100 + index,
        ),
      }),
    ).toThrow(/16-repository automation limit/iu);
  });

  test("creates one upstream issue and reuses it on repeated execution", async () => {
    const requests: Array<{
      path: string;
      method: string;
      body?: string;
    }> = [];
    let createdIssue: { number: number; body: string } | null = null;
    const request = vi.fn(async (path: string, options = {}) => {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (path.includes("/issues?")) return createdIssue ? [createdIssue] : [];
      if (path.endsWith("/issues/201") && createdIssue) return createdIssue;
      if (path.endsWith("/issues") && method === "POST") {
        createdIssue = {
          number: 201,
          body: JSON.parse(options.body).body,
        };
        return createdIssue;
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    });

    const first = await ensureForkParentSubmission({
      repository: "Tavernary/Tavernary",
      dependency,
      dependentIssueNumber: 123,
      manifest: childManifest,
      ancestryRepositoryIds: [42],
      request,
    });
    const second = await ensureForkParentSubmission({
      repository: "Tavernary/Tavernary",
      dependency: { ...dependency, issueNumber: 201 },
      dependentIssueNumber: 123,
      manifest: childManifest,
      ancestryRepositoryIds: [42],
      request,
    });

    expect(first).toEqual({
      issueNumber: 201,
      state: "created",
      dispatchTriage: true,
    });
    expect(second).toEqual({
      issueNumber: 201,
      state: "open",
      dispatchTriage: false,
    });
    expect(
      requests.filter(
        ({ path, method }) => path.endsWith("/issues") && method === "POST",
      ),
    ).toHaveLength(1);
  });

  test("reuses a repository-ID match from paginated stable state comments", async () => {
    const unrelatedPullRequests = Array.from({ length: 100 }, (_, index) => ({
      number: 1000 + index,
      pull_request: {},
      state: "open",
    }));
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("&page=1")) return unrelatedPullRequests;
      if (path.endsWith("&page=2")) {
        return [{ number: 301, state: "open", labels: ["project-submission"] }];
      }
      if (path.endsWith("/issues/301/comments?per_page=100")) {
        return [
          {
            body: [
              "<!-- tavernary-project-submission-state",
              JSON.stringify({
                schema_version: 1,
                generated_title: "[Project submission] owner/parent",
                status: "admitted",
                source_repository_id: 41,
              }),
              "-->",
            ].join("\n"),
          },
        ];
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await expect(
      ensureForkParentSubmission({
        repository: "Tavernary/Tavernary",
        dependency,
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: [42],
        request,
      }),
    ).resolves.toEqual({
      issueNumber: 301,
      state: "open",
      dispatchTriage: false,
    });
  });

  test.each([
    ["merged", [] as string[], "merged"],
    ["declined", ["submission-declined"], "declined"],
  ])(
    "recognizes a closed %s upstream outcome",
    async (_name, labels, state) => {
      const body = renderForkParentIssue({
        dependency,
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: [42],
      }).body;
      const request = vi.fn(async (path: string) => {
        if (path.endsWith("/issues/201")) {
          return { number: 201, state: "closed", labels, body };
        }
        throw new Error(`Unexpected request ${path}`);
      });

      await expect(
        ensureForkParentSubmission({
          repository: "Tavernary/Tavernary",
          dependency: { ...dependency, issueNumber: 201 },
          dependentIssueNumber: 123,
          manifest: childManifest,
          ancestryRepositoryIds: [42],
          request,
        }),
      ).resolves.toEqual({
        issueNumber: 201,
        state,
        dispatchTriage: false,
      });
    },
  );

  test("requests triage again for a retryable open upstream", async () => {
    const body = renderForkParentIssue({
      dependency,
      dependentIssueNumber: 123,
      manifest: childManifest,
      ancestryRepositoryIds: [42],
    }).body;
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/issues/201")) {
        return {
          number: 201,
          state: "open",
          labels: ["submission-retryable"],
          body,
        };
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await expect(
      ensureForkParentSubmission({
        repository: "Tavernary/Tavernary",
        dependency: { ...dependency, issueNumber: 201 },
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: [42],
        request,
      }),
    ).resolves.toEqual({
      issueNumber: 201,
      state: "open",
      dispatchTriage: true,
    });
  });

  test("ignores malformed and mismatched markers before creating", async () => {
    const request = vi.fn(async (path: string, options = {}) => {
      const method = options.method ?? "GET";
      if (path.includes("/issues?")) {
        return [
          {
            number: 301,
            state: "open",
            body: [
              "<!-- tavernary-fork-upstream",
              '{"schema_version":1,"repository_id":0}',
              "-->",
            ].join("\n"),
          },
          { number: 302, state: "open", body: "" },
        ];
      }
      if (path.endsWith("/issues/301/comments?per_page=100")) return [];
      if (path.endsWith("/issues/302/comments?per_page=100")) {
        return [
          {
            body: [
              "<!-- tavernary-project-submission-state",
              JSON.stringify({
                schema_version: 1,
                generated_title: null,
                status: "admitted",
                source_repository_id: 999,
              }),
              "-->",
            ].join("\n"),
          },
        ];
      }
      if (path.endsWith("/issues") && method === "POST") {
        return { number: 303 };
      }
      throw new Error(`Unexpected request ${method} ${path}`);
    });

    await expect(
      ensureForkParentSubmission({
        repository: "Tavernary/Tavernary",
        dependency,
        dependentIssueNumber: 123,
        manifest: childManifest,
        ancestryRepositoryIds: [42],
        request,
      }),
    ).resolves.toEqual({
      issueNumber: 303,
      state: "created",
      dispatchTriage: true,
    });
  });
});
