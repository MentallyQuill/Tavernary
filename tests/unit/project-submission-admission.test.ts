import { expect, test } from "vitest";

import { evaluateProjectSubmission } from "../../scripts/submissions/admission.mjs";

const manifest = {
  schema_version: 1 as const,
  project_type: "extension" as const,
  source_url: "https://github.com/NewOwner/NewName",
  name: "Example",
  description: null,
  frontends: { known_ids: ["sillytavern"], other: [] },
  frontend_independent: false,
  additional_context: null,
};

const githubIdentity = {
  kind: "github" as const,
  canonicalUrl: "https://github.com/NewOwner/NewName",
  repository: "NewOwner/NewName",
  repositoryId: 1285208664,
  owner: "NewOwner",
  name: "NewName",
};

function admittedFixture(overrides = {}) {
  return {
    manifest,
    identity: githubIdentity,
    sourceProbe: { status: "ok" as const, httpStatus: 200 },
    repository: {
      visibility: "public" as const,
      archived: false,
    },
    existingProjects: [],
    frontendResolution: {
      status: "resolved" as const,
      ids: ["sillytavern"],
      warnings: [],
    },
    warnings: [],
    ...overrides,
  };
}

test("closes a permanent repository-ID duplicate before PR generation", () => {
  const decision = evaluateProjectSubmission(
    admittedFixture({
      existingProjects: [
        {
          id: "old-owner-old-name",
          name: "Existing project",
          canonicalUrl: "https://github.com/OldOwner/OldName",
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
    existingProject: { id: "old-owner-old-name" },
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

test("requires GitHub repositories to be public", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        repository: { visibility: "private", archived: false },
      }),
    ),
  ).toEqual({
    status: "needs-information",
    errors: ["GitHub project repositories must be public and accessible."],
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
      "GitHub repository is archived.",
    ],
  });
});

test("requires frontends and extensions to use GitHub repositories", () => {
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
    errors: ["Frontends and Extensions require a public GitHub repository."],
    suggestions: [],
    frontendDependencies: [],
  });
});

test("keeps legacy preset submissions open until compatibility is supplied", () => {
  expect(
    evaluateProjectSubmission(
      admittedFixture({
        manifest: {
          ...manifest,
          schema_version: 1,
          project_type: "preset",
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
          schema_version: 2,
          project_type: "preset",
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
