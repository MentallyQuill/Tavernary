import { expect, test, vi } from "vitest";

import {
  hasResolvableFrontendDependency,
  indexedFrontendUrls,
  retryFrontendDependencies,
} from "../../scripts/submissions/retry-frontend-dependencies.mjs";

function markerComment(
  dependencies: Array<{
    name: string;
    canonical_url: string;
    repository?: string;
  }>,
) {
  return [
    "<!-- tavernary-project-submission-state",
    JSON.stringify({
      schema_version: 1,
      generated_title: "[Project submission] owner/repo",
      status: "needs-information",
      frontend_dependencies: dependencies,
    }),
    "-->",
  ].join("\n");
}

test("matches dependencies by canonical frontend repository URL", () => {
  const indexedUrls = indexedFrontendUrls([
    {
      id: "aikobots",
      name: "Aikobots",
      kind: "frontend",
      source: { type: "github", repository: "aikohanasaki/Aikobots" },
      frontends: ["aikobots"],
    },
  ]);

  expect(
    hasResolvableFrontendDependency({
      indexedUrls,
      comments: [
        {
          body: markerComment([
            {
              name: "Aikobots",
              canonical_url: "https://github.com/AIKOHANASAKI/Aikobots/",
              repository: "aikohanasaki/Aikobots",
            },
          ]),
        },
      ],
    }),
  ).toBe(true);
});

test("matches dependencies by canonical external Frontend URL", () => {
  const indexedUrls = indexedFrontendUrls([
    {
      id: "nova",
      name: "Nova",
      kind: "frontend",
      source: { type: "url", url: "https://codeberg.org/example/nova" },
      frontends: ["nova"],
    },
  ]);

  expect(
    hasResolvableFrontendDependency({
      indexedUrls,
      comments: [
        {
          body: markerComment([
            {
              name: "Nova",
              canonical_url: "https://codeberg.org/example/nova/",
            },
          ]),
        },
      ],
    }),
  ).toBe(true);
});

test("dispatches ordinary triage only for matching blocked issues", async () => {
  const request = vi.fn(async (path: string, options = {}) => {
    if (path.includes("/issues?")) {
      return [
        {
          number: 23,
          state: "open",
          labels: ["project-submission", "needs-information"],
        },
      ];
    }
    if (path.endsWith("/issues/23/comments?per_page=100")) {
      return [
        {
          body: markerComment([
            {
              name: "Aikobots",
              canonical_url: "https://github.com/aikohanasaki/Aikobots",
              repository: "aikohanasaki/Aikobots",
            },
          ]),
        },
      ];
    }
    if (path.endsWith("/triage-submission.yml/dispatches")) return {};
    throw new Error(`Unexpected request: ${path} ${JSON.stringify(options)}`);
  });

  await expect(
    retryFrontendDependencies({
      repository: "MentallyQuill/Tavernary",
      ref: "main",
      projects: [
        {
          id: "aikobots",
          name: "Aikobots",
          kind: "frontend",
          source: { type: "github", repository: "aikohanasaki/Aikobots" },
          frontends: ["aikobots"],
        },
      ],
      request,
    }),
  ).resolves.toEqual([23]);

  expect(request).toHaveBeenCalledWith(
    "/repos/MentallyQuill/Tavernary/actions/workflows/triage-submission.yml/dispatches",
    {
      method: "POST",
      body: JSON.stringify({
        ref: "main",
        inputs: { issue_number: "23" },
      }),
    },
  );
});
