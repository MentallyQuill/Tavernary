import { describe, expect, test, vi } from "vitest";

import {
  hasTerminalForkDependency,
  retryForkDependencies,
} from "../../scripts/submissions/retry-fork-dependencies.mjs";

function markerComment({
  repositoryId = 41,
  issueNumber = 201,
}: {
  repositoryId?: number;
  issueNumber?: number | null;
} = {}) {
  return {
    body: [
      "<!-- tavernary-project-submission-state",
      JSON.stringify({
        schema_version: 1,
        generated_title: "[Project submission] owner/child",
        status: "waiting-on-fork-parent",
        source_repository_id: 42,
        fork_dependency: {
          repository_id: repositoryId,
          name: "Parent",
          repository: "owner/parent",
          canonical_url: "https://github.com/owner/parent",
          issue_number: issueNumber,
        },
      }),
      "-->",
    ].join("\n"),
  };
}

const parentProject = {
  id: "parent",
  visibility: "published",
  source: {
    type: "github",
    repository: "owner/parent",
    repository_id: 41,
  },
};

describe("terminal fork dependency selection", () => {
  test.each(["published", "disabled", "quarantined"])(
    "resolves when the parent registry record is %s",
    (visibility) => {
      expect(
        hasTerminalForkDependency({
          comments: [markerComment()],
          projectsByRepositoryId: new Map([
            [41, { ...parentProject, visibility }],
          ]),
        }),
      ).toBe(true);
    },
  );

  test("resolves when the referenced upstream issue closed", () => {
    expect(
      hasTerminalForkDependency({
        comments: [markerComment()],
        projectsByRepositoryId: new Map(),
        closedUpstreamIssueNumber: 201,
      }),
    ).toBe(true);
  });

  test("ignores unrelated, open, or malformed dependencies", () => {
    expect(
      hasTerminalForkDependency({
        comments: [markerComment({ repositoryId: 99, issueNumber: 202 })],
        projectsByRepositoryId: new Map([[41, parentProject]]),
        closedUpstreamIssueNumber: 201,
      }),
    ).toBe(false);
    expect(
      hasTerminalForkDependency({
        comments: [markerComment()],
        projectsByRepositoryId: new Map(),
      }),
    ).toBe(false);
    expect(
      hasTerminalForkDependency({
        comments: [
          { body: "<!-- tavernary-project-submission-state\n{}\n-->" },
        ],
        projectsByRepositoryId: new Map([[41, parentProject]]),
      }),
    ).toBe(false);
  });
});

describe("fork dependency retry", () => {
  test("dispatches each eligible open child once across repeated pages", async () => {
    const issue = {
      number: 123,
      state: "open",
      labels: ["project-submission", "waiting-on-fork-parent"],
    };
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    const request = vi.fn(async (path: string, options = {}) => {
      const method = options.method ?? "GET";
      requests.push({ path, method, body: options.body });
      if (path.endsWith("&page=1")) {
        return [
          ...Array.from({ length: 99 }, (_, index) => ({
            number: 1000 + index,
            pull_request: {},
            state: "open",
          })),
          issue,
        ];
      }
      if (path.endsWith("&page=2")) return [issue];
      if (path.endsWith("/issues/123/comments?per_page=100")) {
        return [markerComment()];
      }
      if (path.endsWith("/dispatches")) return null;
      throw new Error(`Unexpected request ${method} ${path}`);
    });

    await expect(
      retryForkDependencies({
        repository: "Tavernary/Tavernary",
        ref: "main",
        projects: [parentProject],
        request,
      }),
    ).resolves.toEqual([123]);
    expect(
      requests.filter(({ path }) => path.endsWith("/dispatches")),
    ).toHaveLength(1);
  });

  test("skips closed children and unrelated still-open upstreams", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("/issues?")) {
        return [
          {
            number: 123,
            state: "closed",
            labels: ["project-submission", "waiting-on-fork-parent"],
          },
          {
            number: 124,
            state: "open",
            labels: ["project-submission", "waiting-on-fork-parent"],
          },
        ];
      }
      if (path.endsWith("/issues/124/comments?per_page=100")) {
        return [markerComment({ issueNumber: 202 })];
      }
      throw new Error(`Unexpected request ${path}`);
    });

    await expect(
      retryForkDependencies({
        repository: "Tavernary/Tavernary",
        ref: "main",
        projects: [],
        closedUpstreamIssueNumber: 201,
        request,
      }),
    ).resolves.toEqual([]);
  });
});
