import { expect, test } from "vitest";

import { draftProjectRecord } from "../../scripts/submissions/draft-project-record.mjs";

const admittedGithubExtension = {
  status: "admitted" as const,
  manifest: {
    schema_version: 1 as const,
    project_type: "extension" as const,
    source_url: "https://github.com/Owner/Repo",
    name: "Repository Tool",
    description: "Submitted description.",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
  },
  identity: {
    kind: "repository" as const,
    provider: "github" as const,
    canonicalUrl: "https://github.com/Owner/Repo",
    repository: "Owner/Repo",
    repositoryId: 42,
    owner: "Owner",
    name: "Repo",
  },
  frontendIds: ["sillytavern"],
  warnings: [],
};

const observation = {
  projectId: "owner-repo",
  repository: {
    id: 42,
    owner: "Owner",
    name: "Repo",
    url: "https://github.com/Owner/Repo",
    description: "Repository description.",
    defaultBranch: "main",
    headSha: "a".repeat(40),
    headCommittedAt: "2026-07-25T17:00:00.000Z",
    archived: false,
    fork: false,
    parent: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sizeKb: 12,
  },
  community: {
    stargazersCount: 3,
    forksCount: 2,
    subscribersCount: 1,
  },
  latestReleaseAt: null,
  coarseLicenseSpdxId: "MIT",
};

const snapshot = {
  schema_version: 3 as const,
  provider: "github" as const,
  project_id: "owner-repo",
  repository: {
    id: 42,
    owner: "Owner",
    name: "Repo",
    url: "https://github.com/Owner/Repo",
    description: "Repository description.",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-25T17:00:00.000Z",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 12,
  },
  source_health: "healthy" as const,
  activity: {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional" as const,
    baseline_completed_at: null,
    baseline_attempts: 0,
  },
  community: {
    stars_count: 3,
    forks_count: 2,
    watchers_count: 1,
    aggregate: 6,
  },
  license: {
    status: "osi-approved" as const,
    spdx_id: "MIT",
    source_path: "LICENSE",
  },
  refreshed_at: "2026-07-25T18:00:00.000Z",
  stale_since: null,
};

test("drafts a schema-v4 GitHub project with permanent identity", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    enrichment: {
      status: "curated",
      summary:
        "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
      primary_function: "generation-reasoning",
      capabilities: ["planning-reasoning"],
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    schema_version: 5,
    id: "owner-repo",
    name: "Repository Tool",
    kind: "extension",
    metadata_status: "curated",
    source: {
      type: "github",
      repository: "Owner/Repo",
      repository_id: observation.repository.id,
    },
    frontends: ["sillytavern"],
    primary_function: "generation-reasoning",
    capabilities: ["planning-reasoning"],
    catalog_cohort: "standard",
    visibility: "published",
    visibility_reason: null,
    refresh_policy: "automatic",
    enrichment_policy: "automatic",
  });
});

test("falls back to submitted description when enrichment is unavailable", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    enrichment: {
      status: "failed",
      code: "provider-timeout",
      message: "The enrichment provider timed out.",
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    summary: "Submitted description.",
    metadata_status: "provisional",
    primary_function: "uncategorized",
    capabilities: [],
  });
  expect(result.warnings).toContain(
    "Automated enrichment failed: The enrichment provider timed out.",
  );
});

test("drafts external presets with manual source policy", async () => {
  const result = await draftProjectRecord({
    admitted: {
      status: "admitted",
      manifest: {
        schema_version: 1,
        project_type: "preset",
        source_url: "https://example.com/presets/Nova/",
        name: "Nova Preset",
        description: "A submitted external system preset.",
        frontends: { known_ids: [], other: [] },
        frontend_independent: true,
        additional_context: null,
      },
      identity: {
        kind: "external",
        canonicalUrl: "https://example.com/presets/Nova",
        hostname: "example.com",
        pathSlug: "Nova",
      },
      frontendIds: [],
      warnings: [],
    },
    observation: null,
    snapshot: null,
    enrichment: null,
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    id: "example-com-presets-nova",
    kind: "preset",
    source: {
      type: "url",
      url: "https://example.com/presets/Nova",
      published_at: null,
      version: null,
      artifact_size_bytes: null,
      license_status: "pending",
      license_spdx_id: null,
    },
    refresh_policy: "paused",
    enrichment_policy: "manual",
    enrichment_note: "External URL source; requires manual curation.",
  });
  expect(result.snapshot).toBeUndefined();
});

test("drafts a frontend and its vocabulary proposal together", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        project_type: "frontend",
        name: "Nova Frontend",
        frontends: { known_ids: [], other: [] },
      },
      frontendIds: [],
    },
    observation,
    snapshot,
    enrichment: {
      status: "failed",
      code: "provider-unavailable",
      message: "No provider configured.",
    },
    frontendVocabulary: {
      frontends: [
        {
          id: "sillytavern",
          label: "SillyTavern",
          description: "Works with the SillyTavern roleplay frontend.",
        },
      ],
    },
    frontendProjects: [],
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    kind: "frontend",
    frontends: ["nova-frontend"],
    primary_function: "frontend",
  });
  expect(result.frontendVocabulary?.frontends).toContainEqual({
    id: "nova-frontend",
    label: "Nova Frontend",
    description: "Works with the Nova Frontend roleplay frontend.",
  });
});

test("drafts an external Frontend with manual source policy", async () => {
  const result = await draftProjectRecord({
    admitted: {
      status: "admitted",
      manifest: {
        schema_version: 2,
        project_type: "frontend",
        source_url: "https://codeberg.org/example/nova",
        name: "Nova Frontend",
        description: "A public-source roleplay frontend.",
        frontends: { known_ids: [], other: [] },
        frontend_independent: false,
        additional_context: null,
      },
      identity: {
        kind: "external",
        canonicalUrl: "https://codeberg.org/example/nova",
        hostname: "codeberg.org",
        pathSlug: "nova",
      },
      frontendIds: [],
      warnings: [],
    },
    observation: null,
    snapshot: null,
    enrichment: null,
    frontendVocabulary: {
      frontends: [
        {
          id: "sillytavern",
          label: "SillyTavern",
          description: "Works with the SillyTavern roleplay frontend.",
        },
      ],
    },
    frontendProjects: [],
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    id: "codeberg-org-example-nova",
    kind: "frontend",
    source: {
      type: "url",
      url: "https://codeberg.org/example/nova",
      license_status: "pending",
    },
    frontends: ["nova-frontend"],
    primary_function: "frontend",
    refresh_policy: "paused",
    enrichment_policy: "manual",
  });
});

test("keeps external project IDs distinct across source owners", async () => {
  const draft = async (owner: string) =>
    draftProjectRecord({
      admitted: {
        status: "admitted",
        manifest: {
          schema_version: 2,
          project_type: "frontend",
          source_url: `https://codeberg.org/${owner}/nova`,
          name: "Nova Frontend",
          description: "A public-source roleplay frontend.",
          frontends: { known_ids: [], other: [] },
          frontend_independent: false,
          additional_context: null,
        },
        identity: {
          kind: "external",
          canonicalUrl: `https://codeberg.org/${owner}/nova`,
          hostname: "codeberg.org",
          pathSlug: "nova",
        },
        frontendIds: [],
        warnings: [],
      },
      observation: null,
      snapshot: null,
      enrichment: null,
      frontendVocabulary: { frontends: [] },
      frontendProjects: [],
      now: "2026-07-25T18:00:00.000Z",
    });

  const [alice, bob] = await Promise.all([draft("alice"), draft("bob")]);

  expect(alice.record.id).toBe("codeberg-org-alice-nova");
  expect(bob.record.id).toBe("codeberg-org-bob-nova");
});

test("refuses to draft a GitHub record when permanent identity changed", async () => {
  await expect(
    draftProjectRecord({
      admitted: admittedGithubExtension,
      observation: {
        ...observation,
        repository: { ...observation.repository, id: 43 },
      },
      snapshot,
      enrichment: null,
      now: "2026-07-25T18:00:00.000Z",
    }),
  ).rejects.toThrow(/permanent repository identity/iu);
});

test("bounds a submitted fallback summary to the project schema limit", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        description: "word ".repeat(60),
      },
    },
    observation,
    snapshot,
    enrichment: null,
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.summary.length).toBeLessThanOrEqual(220);
});

export { admittedGithubExtension, observation, snapshot };
