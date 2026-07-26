import { expect, test } from "vitest";

import { generateProjectSubmission } from "../../scripts/submissions/generate-project-submission.mjs";

const record = {
  schema_version: 4,
  id: "owner-repo",
  name: "Repository Tool",
  kind: "extension",
  summary: "A factual project summary.",
  metadata_status: "curated",
  source: {
    type: "github",
    repository: "Owner/Repo",
    repository_id: 42,
  },
  frontends: ["sillytavern"],
  primary_function: "generation-reasoning",
  capabilities: ["planning-reasoning"],
  cataloged_at: "2026-07-25T18:00:00.000Z",
  catalog_cohort: "standard",
  visibility: "published",
  visibility_reason: null,
  refresh_policy: "automatic",
  enrichment_policy: "automatic",
};

const snapshot = {
  schema_version: 2,
  project_id: "owner-repo",
  repository: { id: 42 },
};

test("returns only deterministic canonical submission files and its report", async () => {
  const generated = await generateProjectSubmission({
    issueNumber: 123,
    draft: {
      record,
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
      warnings: [],
    },
  });

  expect(generated.files).toEqual([
    {
      path: "data/registry/projects/owner-repo.json",
      value: record,
    },
    {
      path: "data/snapshots/github/owner-repo.json",
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
  });
  expect(JSON.stringify(generated)).not.toContain("submitter");
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
    "data/vocabularies/frontends.json",
  ]);
  expect(
    (
      generated.files[1].value as {
        frontends: Array<{ id: string }>;
      }
    ).frontends.map(({ id }) => id),
  ).toEqual(["nova", "sillytavern"]);
});
