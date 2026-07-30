import { expect, test } from "vitest";

import { generateProjectSubmission } from "../../scripts/submissions/generate-project-submission.mjs";

const record = {
  schema_version: 6,
  id: "owner-repo",
  name: "Repository Tool",
  kind: "extension",
  summary: "A factual project summary.",
  metadata_status: "curated",
  source_id: "github-42",
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  tags: ["add-structured-reasoning"],
  cataloged_at: "2026-07-25T18:00:00.000Z",
  catalog_cohort: "standard",
  listing_status: "active",
  listing_status_reason: null,
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  },
};
const source = {
  schema_version: 1 as const,
  id: "github-42",
  type: "github" as const,
  repository: "Owner/Repo",
  repository_id: 42,
  status: "active" as const,
  status_reason: null,
  refresh_policy: "automatic" as const,
};

const snapshot = {
  schema_version: 4,
  provider: "github",
  source_id: "github-42",
  repository: { id: 42 },
};

test("writes Codeberg records and snapshots to provider-qualified paths", async () => {
  const codebergRecord = {
    ...record,
    id: "targren-lumiverse-swipescrubber",
    source_id: "codeberg-1699613",
  };
  const codebergSource = {
    ...source,
    id: "codeberg-1699613",
    type: "codeberg" as const,
    repository: "targren/Lumiverse-SwipeScrubber",
    repository_id: 1699613,
  };
  const codebergSnapshot = {
    ...snapshot,
    provider: "codeberg",
    source_id: codebergSource.id,
    repository: { id: 1699613 },
  };

  const generated = await generateProjectSubmission({
    issueNumber: 112,
    draft: {
      record: codebergRecord,
      source: codebergSource,
      snapshot: codebergSnapshot,
      submitted: {},
      observed: {},
      inferred: {},
      warnings: [],
    },
  });

  expect(generated.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "data/registry/projects/targren-lumiverse-swipescrubber.json",
        value: expect.objectContaining({
          source_id: "codeberg-1699613",
        }),
      }),
      expect.objectContaining({
        path: "data/registry/sources/codeberg-1699613.json",
        value: codebergSource,
      }),
      expect.objectContaining({
        path: "data/snapshots/codeberg/codeberg-1699613.json",
        value: expect.objectContaining({
          schema_version: 4,
          provider: "codeberg",
        }),
      }),
    ]),
  );
  expect(generated.report).toMatchObject({ source_provider: "codeberg" });
});

test("returns only deterministic canonical submission files and its report", async () => {
  const generated = await generateProjectSubmission({
    issueNumber: 123,
    draft: {
      record,
      source,
      snapshot,
      submitted: {
        project_type: "extension",
        source_url: "https://github.com/Owner/Repo",
        name: "Repository Tool",
        description: null,
        frontends: { known_ids: ["sillytavern"], other: [] },
        frontend_independent: false,
        additional_context: null,
      },
      observed: {
        repository: "Owner/Repo",
        repository_id: 42,
      },
      inferred: {
        project_id: "owner-repo",
        primary_function: "generation-reasoning",
      },
      classificationReview: {
        status: "possible-mismatch",
        submitted_primary_function: "generation-reasoning",
        suggested_primary_function: "interface-workflow",
        explanation:
          "The source primarily describes user-facing editing controls.",
      },
      summaryAuthority: {
        authorityType: "repository-owner",
        actorId: 11,
        actorLogin: "Owner",
      },
      copyResult: {
        result: "accepted-with-light-edits",
        change_reasons: ["punctuation-corrected"],
        policy_signal: "none",
      },
      warnings: [],
    },
  });

  expect(generated.files).toEqual([
    {
      path: "data/registry/projects/owner-repo.json",
      value: record,
    },
    {
      path: "data/registry/sources/github-42.json",
      value: source,
    },
    {
      path: "data/snapshots/github/github-42.json",
      value: snapshot,
    },
  ]);
  expect(generated.files.map(({ path }) => path)).not.toContain(
    "src/generated/catalog.json",
  );
  expect(generated.files.map(({ path }) => path)).not.toContain(
    "data/catalog/projects.json",
  );
  expect(generated.report).toMatchObject({
    schema_version: 1,
    issue_number: 123,
    project_id: "owner-repo",
    summary_authority: {
      authorityType: "repository-owner",
      actorId: 11,
      actorLogin: "Owner",
    },
    copy_result: {
      result: "accepted-with-light-edits",
      change_reasons: ["punctuation-corrected"],
      policy_signal: "none",
    },
    classificationReview: {
      status: "possible-mismatch",
      submitted_primary_function: "generation-reasoning",
      suggested_primary_function: "interface-workflow",
      explanation:
        "The source primarily describes user-facing editing controls.",
    },
  });
  expect(JSON.stringify(generated)).not.toContain("raw_provider_output");
});

test("fails closed when a snapshot belongs to a different source", async () => {
  await expect(
    generateProjectSubmission({
      issueNumber: 123,
      draft: {
        record,
        source,
        snapshot: { ...snapshot, source_id: "github-99" },
        submitted: {},
        observed: {},
        inferred: {},
        warnings: [],
      },
    }),
  ).rejects.toThrow("source and snapshot records do not match");
});

test("preserves a generated GitHub bot actor in the audit report", async () => {
  const generated = await generateProjectSubmission({
    issueNumber: 152,
    draft: {
      record,
      source,
      snapshot,
      submitted: {},
      observed: {},
      inferred: {},
      summaryAuthority: {
        authorityType: "community-submitter",
        actorId: 41_898_282,
        actorLogin: "github-actions[bot]",
        actorType: "Bot",
      },
      warnings: [],
    },
  });

  expect(generated.report.actor).toEqual({
    id: 41_898_282,
    login: "github-actions[bot]",
    type: "Bot",
  });
});

test("includes a sorted vocabulary update only for a frontend proposal", async () => {
  const generated = await generateProjectSubmission({
    issueNumber: 124,
    draft: {
      record: {
        ...record,
        id: "owner-frontend",
        kind: "frontend",
        frontends: ["nova"],
        primary_function: "frontend",
      },
      source,
      frontendVocabulary: {
        frontends: [
          {
            id: "sillytavern",
            label: "SillyTavern",
            description: "Works with the SillyTavern roleplay frontend.",
          },
          {
            id: "nova",
            label: "Nova",
            description: "Works with the Nova roleplay frontend.",
          },
        ],
      },
      submitted: {},
      observed: {},
      inferred: {},
      warnings: [],
    },
  });

  expect(generated.files.map(({ path }) => path)).toEqual([
    "data/registry/projects/owner-frontend.json",
    "data/registry/sources/github-42.json",
    "data/vocabularies/frontends.json",
  ]);
  expect(
    (
      generated.files[2].value as {
        frontends: Array<{ id: string }>;
      }
    ).frontends.map(({ id }) => id),
  ).toEqual(["nova", "sillytavern"]);
});
