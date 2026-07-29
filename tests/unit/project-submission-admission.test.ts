import { expect, test, vi } from "vitest";

import { evaluateProjectSubmission } from "../../scripts/submissions/admission.mjs";
import { inspectProjectSubmissionSource } from "../../scripts/submissions/triage-issue.mjs";

const manifest = {
  schema_version: 3 as const,
  project_type: "extension" as const,
  primary_function: "interface-workflow",
  source_url: "https://github.com/NewOwner/NewName",
  name: "Example",
  description: null,
  frontends: { known_ids: ["sillytavern"], other: [] },
  frontend_independent: false,
  additional_context: null,
};

const githubIdentity = {
  kind: "repository" as const,
  provider: "github" as const,
  canonicalUrl: "https://github.com/NewOwner/NewName",
  repository: "NewOwner/NewName",
  repositoryId: 1285208664,
  owner: "NewOwner",
  name: "NewName",
};

const codebergManifest = {
  ...manifest,
  source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
};

test("resolves Codeberg submissions through the repository provider", async () => {
  const resolve = vi.fn(async (identity) => ({
    ...identity,
    repositoryId: 1699613,
  }));
  const inspected = await inspectProjectSubmissionSource(codebergManifest, {
    providers: { codeberg: { resolve } },
    request: vi.fn(),
    probe: vi.fn(),
  });
  const decision = evaluateProjectSubmission(
    admittedFixture({
      manifest: codebergManifest,
      identity: inspected.identity,
      sourceProbe: inspected.sourceProbe,
      repository: inspected.repository,
    }),
  );

  expect(decision).toMatchObject({
    status: "admitted",
    identity: {
      kind: "repository",
      provider: "codeberg",
      repository: "targren/Lumiverse-SwipeScrubber",
      repositoryId: 1699613,
    },
  });
});

test.each([
  [404, "definitive"],
  [429, "retryable"],
] as const)(
  "classifies Codeberg resolution status %s",
  async (status, result) => {
    const resolve = vi.fn(async () => {
      throw Object.assign(new Error(`Codeberg ${status}`), { status });
    });
    await expect(
      inspectProjectSubmissionSource(codebergManifest, {
        providers: { codeberg: { resolve } },
        request: vi.fn(),
        probe: vi.fn(),
      }),
    ).resolves.toMatchObject({ sourceProbe: { status: result } });
  },
);

function admittedFixture(overrides = {}) {
  return {
    manifest,
    identity: githubIdentity,
    sourceProbe: { status: "ok" as const, httpStatus: 200 },
    repository: {
      visibility: "public" as const,
      archived: false,
      fork: false,
      parent: null,
    },
    forkDependency: { status: "none" as const },
    existingSources: [],
    frontendResolution: {
      status: "resolved" as const,
      ids: ["sillytavern"],
      warnings: [],
    },
    warnings: [],
    ...overrides,
  };
}

test("waits for an immediate fork parent before admitting the child", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        forkDependency: {
          status: "waiting",
          dependency: {
            repositoryId: 41,
            name: "parent",
            repository: "owner/parent",
            canonicalUrl: "https://github.com/owner/parent",
            issueNumber: 201,
          },
        },
      }),
    ),
  ).toEqual({
    status: "waiting-on-fork-parent",
    dependency: {
      repositoryId: 41,
      name: "parent",
      repository: "owner/parent",
      canonicalUrl: "https://github.com/owner/parent",
      issueNumber: 201,
    },
  });
});

test("admits a cycle-safe stop with an explicit maintainer warning", () => {
  const decision = evaluateProjectSubmission(
    admittedFixture({
      forkDependency: {
        status: "not-listed",
        dependency: {
          repositoryId: 41,
          name: "parent",
          repository: "owner/parent",
          canonicalUrl: "https://github.com/owner/parent",
          issueNumber: null,
        },
        attention: "cycle",
      },
    }),
  );

  expect(decision).toMatchObject({
    status: "admitted",
    warnings: [
      "Fork ancestry contains a repeated repository ID and requires maintainer review.",
    ],
  });
});

test("closes a permanent repository-ID duplicate before PR generation", () => {
  const decision = evaluateProjectSubmission(
    admittedFixture({
      inflightDuplicate: {
        issueNumber: 72,
        issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
        prNumber: 73,
        prUrl: "https://github.com/Tavernary/Tavernary/pull/73",
        identity: githubIdentity,
      },
      existingSources: [
        {
          id: "github-1285208664",
          name: "OldOwner/OldName",
          canonicalUrl: "https://github.com/OldOwner/OldName",
          projectIds: ["old-owner-old-name", "preset-variant"],
          identity: {
            ...githubIdentity,
            canonicalUrl: "https://github.com/OldOwner/OldName",
            repository: "OldOwner/OldName",
            owner: "OldOwner",
            name: "OldName",
          },
        },
      ],
    }),
  );

  expect(decision).toMatchObject({
    status: "duplicate",
    existingSource: {
      id: "github-1285208664",
      projectIds: ["old-owner-old-name", "preset-variant"],
    },
  });
});

test("recognizes an in-flight duplicate before admission", () => {
  const inflightDuplicate = {
    issueNumber: 72,
    issueUrl: "https://github.com/Tavernary/Tavernary/issues/72",
    prNumber: 73,
    prUrl: "https://github.com/Tavernary/Tavernary/pull/73",
    identity: githubIdentity,
  };

  expect(
    evaluateProjectSubmission(admittedFixture({ inflightDuplicate })),
  ).toMatchObject({
    status: "inflight-duplicate",
    existingSubmission: {
      issueNumber: 72,
      prNumber: 73,
    },
  });
});

test("keeps transient source failures retryable", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        sourceProbe: {
          status: "retryable",
          code: "source-timeout",
          message: "The source request timed out.",
        },
      }),
    ),
  ).toEqual({
    status: "retryable",
    code: "source-timeout",
    message: "The source request timed out.",
  });
});

test("keeps malformed submissions open for correction", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        identity: null,
        errors: ["Canonical source URL must be a valid HTTPS URL."],
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["Canonical source URL must be a valid HTTPS URL."],
    suggestions: [],
    frontendDependencies: [],
  });
});

test("treats a definitive missing source as correctable information", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        sourceProbe: {
          status: "definitive",
          code: "source-not-found",
          message: "The submitted source returned HTTP 404.",
        },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["The submitted source returned HTTP 404."],
    suggestions: [],
    frontendDependencies: [],
  });
});

test("requires repository sources to be public", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        repository: { visibility: "private", archived: false },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["Project repositories must be public and accessible."],
    suggestions: [],
    frontendDependencies: [],
  });
});

test("keeps unknown frontend selections open with suggestions", () => {
  const suggestions = [
    {
      submitted: "Tavern",
      candidates: [
        { id: "tavern-ai", label: "TavernAI" },
        { id: "tavern-ui", label: "TavernUI" },
      ],
    },
  ];

  expect(
    evaluateProjectSubmission(
      admittedFixture({
        frontendResolution: {
          status: "needs-information",
          errors: ["Unknown frontend: Tavern."],
          suggestions,
        },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["Unknown frontend: Tavern."],
    suggestions,
    frontendDependencies: [],
  });
});

test("preserves missing frontend dependencies for triage", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        frontendResolution: {
          status: "needs-information",
          errors: [
            "Aikobots is not currently indexed as a Tavernary frontend.",
          ],
          suggestions: [],
          dependencies: [
            {
              name: "Aikobots",
              canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
              repository: "aikohanasaki/Aikobots",
            },
          ],
        },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["Aikobots is not currently indexed as a Tavernary frontend."],
    suggestions: [],
    frontendDependencies: [
      {
        name: "Aikobots",
        canonicalUrl: "https://github.com/aikohanasaki/Aikobots",
        repository: "aikohanasaki/Aikobots",
      },
    ],
  });
});

test("admits archived repositories with a maintainer warning", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        repository: { visibility: "public", archived: true },
        frontendResolution: {
          status: "resolved",
          ids: ["sillytavern"],
          warnings: ["Interpreted ST as SillyTavern."],
        },
        warnings: ["No SPDX license was detected."],
      }),
    ),
  ).toMatchObject({
    status: "admitted",
    frontendIds: ["sillytavern"],
    warnings: [
      "No SPDX license was detected.",
      "Interpreted ST as SillyTavern.",
      "Repository is archived.",
    ],
  });
});

test("requires extensions to use supported repository providers", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        identity: {
          kind: "external",
          canonicalUrl: "https://example.com/tool",
          hostname: "example.com",
          pathSlug: "tool",
        },
        repository: undefined,
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["Extensions require a public GitHub or Codeberg repository."],
    suggestions: [],
    frontendDependencies: [],
  });
});

test("admits a public Codeberg Extension repository", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        manifest: {
          ...manifest,
          source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
        },
        identity: {
          kind: "repository",
          provider: "codeberg",
          canonicalUrl: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
          repository: "targren/Lumiverse-SwipeScrubber",
          repositoryId: 1699613,
          owner: "targren",
          name: "Lumiverse-SwipeScrubber",
        },
      }),
    ),
  ).toMatchObject({
    status: "admitted",
    identity: {
      kind: "repository",
      provider: "codeberg",
      repositoryId: 1699613,
    },
  });
});

test("admits a public external Frontend source for maintainer review", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        manifest: {
          ...manifest,
          project_type: "frontend",
          source_url: "https://codeberg.org/example/frontend",
          frontends: { known_ids: [], other: [] },
        },
        identity: {
          kind: "external",
          canonicalUrl: "https://codeberg.org/example/frontend",
          hostname: "codeberg.org",
          pathSlug: "frontend",
        },
        repository: undefined,
        frontendResolution: {
          status: "resolved",
          ids: [],
          warnings: [],
        },
      }),
    ),
  ).toMatchObject({
    status: "admitted",
    frontendIds: [],
  });
});

test("keeps legacy preset submissions open until compatibility is supplied", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        manifest: {
          ...manifest,
          schema_version: 3,
          project_type: "preset",
          primary_function: "preset",
        },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: [
      "System Presets require supported model families and completion formats.",
    ],
    suggestions: [],
  });
});

test("keeps unlisted model families out of canonical project drafts", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        manifest: {
          ...manifest,
          schema_version: 3,
          project_type: "preset",
          primary_function: "preset",
          preset_compatibility: {
            model_families: {
              known_ids: ["claude"],
              other: ["FutureModel"],
            },
            completion_formats: ["chat-completion"],
          },
        },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: [
      'Unlisted model family "FutureModel" requires maintainer reconciliation before publication.',
    ],
    suggestions: [],
  });
});
