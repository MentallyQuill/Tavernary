import { expect, test } from "vitest";

import { draftProjectRecord } from "../../scripts/submissions/draft-project-record.mjs";

const admittedGithubExtension = {
  status: "admitted" as const,
  manifest: {
    schema_version: 4 as const,
    project_type: "extension" as const,
    primary_function: "generation-reasoning",
    source_url: "https://github.com/Owner/Repo",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    metadata: {
      summary: { mode: "automatic" as const },
      tags: { mode: "automatic" as const },
    },
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
  provider: "github" as const,
  sourceId: "github-42",
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
    starsCount: 3,
    forksCount: 2,
    watchersCount: 1,
  },
  latestReleaseAt: null,
  coarseLicenseSpdxId: "MIT",
};

const snapshot = {
  schema_version: 4 as const,
  provider: "github" as const,
  source_id: "github-42",
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

test("drafts a source-backed GitHub card with permanent identity", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    enrichment: {
      status: "curated",
      summary:
        "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "confirmed",
        suggested_primary_function: "generation-reasoning",
        explanation: null,
      },
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    schema_version: 6,
    id: "owner-repo",
    name: "Repo",
    kind: "extension",
    metadata_status: "curated",
    source_id: "github-42",
    frontends: ["sillytavern"],
    primary_function: "generation-reasoning",
    tags: ["add-structured-reasoning"],
    catalog_cohort: "standard",
    listing_status: "active",
    listing_status_reason: null,
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(result.source).toMatchObject({
    schema_version: 1,
    id: "github-42",
    type: "github",
    repository: "Owner/Repo",
    repository_id: observation.repository.id,
    status: "active",
    refresh_policy: "automatic",
  });
});

test("keeps a submitted primary function when intake review suggests a mismatch", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        primary_function: "memory-retrieval",
      },
    },
    observation,
    snapshot,
    enrichment: {
      status: "curated",
      summary:
        "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "possible-mismatch",
        suggested_primary_function: "interface-workflow",
        explanation:
          "The source primarily describes user-facing editing controls.",
      },
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.primary_function).toBe("memory-retrieval");
  expect(result.classificationReview).toEqual({
    status: "possible-mismatch",
    submitted_primary_function: "memory-retrieval",
    suggested_primary_function: "interface-workflow",
    explanation: "The source primarily describes user-facing editing controls.",
  });
});

test("protects a preserved repository-owner summary from scheduled enrichment", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        metadata: {
          summary: {
            mode: "manual" as const,
            value: "Submitted description.",
          },
          tags: { mode: "automatic" as const },
        },
      },
    },
    observation,
    snapshot,
    metadataAuthority: {
      authorityType: "repository-owner",
      actorId: 11,
      actorLogin: "Owner",
    },
    metadataRequest: {
      summary: { mode: "manual", value: "Submitted description." },
      tags: { mode: "automatic" },
    },
    enrichment: {
      status: "curated",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "confirmed",
        suggested_primary_function: "generation-reasoning",
        explanation: null,
      },
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    summary: "Submitted description.",
    metadata_status: "curated",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(result.copyResult).toBeNull();
});

test("normalizes catalog-forbidden whitespace in a preserved owner summary", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        metadata: {
          summary: {
            mode: "manual" as const,
            value: "First sentence.\n\nSecond sentence.",
          },
          tags: { mode: "automatic" as const },
        },
      },
    },
    observation,
    snapshot,
    enrichment: null,
    metadataAuthority: {
      authorityType: "repository-owner",
      actorId: 11,
      actorLogin: "Owner",
    },
    metadataRequest: {
      summary: {
        mode: "manual",
        value: "First sentence.\n\nSecond sentence.",
      },
      tags: { mode: "automatic" },
    },
    publishedSummary: "First sentence.\n\nSecond sentence.",
    copyRequired: false,
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.summary).toBe("First sentence. Second sentence.");
});

test("keeps synthesized owner intake eligible for automatic enrichment", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    metadataAuthority: {
      authorityType: "repository-owner",
      actorId: 11,
      actorLogin: "Owner",
    },
    enrichment: {
      status: "curated",
      summary:
        "Repository evidence defines this structured roleplay tool and its purpose. Its documented controls support focused work while keeping the surrounding conversation accessible.",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "confirmed",
        suggested_primary_function: "generation-reasoning",
        explanation: null,
      },
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.metadata_policy).toEqual({
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  });
});

test("keeps manual tags independent from automatic summary generation", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    metadataAuthority: {
      authorityType: "repository-owner",
      actorId: 11,
      actorLogin: "Owner",
    },
    metadataRequest: {
      summary: { mode: "automatic" },
      tags: {
        mode: "manual",
        values: ["manage-context-limits", "retrieve-relevant-context"],
      },
    },
    enrichment: {
      status: "curated",
      summary:
        "Repository evidence defines this structured roleplay tool and its purpose. Its documented controls support focused work while keeping the surrounding conversation accessible.",
      classification_review: {
        status: "confirmed",
        suggested_primary_function: "generation-reasoning",
        explanation: null,
      },
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    metadata_status: "curated",
    tags: ["manage-context-limits", "retrieve-relevant-context"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
    },
  });
  expect(result.copyResult).toEqual({
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });
});

test("discards unauthorized manual metadata before the record and report", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    metadataAuthority: {
      authorityType: "community-submitter",
      actorId: 29,
      actorLogin: "community-user",
    },
    metadataRequest: {
      summary: { mode: "manual", value: "Unauthorized private wording." },
      tags: { mode: "manual", values: ["unauthorized-tag"] },
    },
    enrichment: {
      status: "curated",
      summary:
        "Repository evidence defines the project without using untrusted submitter copy.",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "confirmed",
        suggested_primary_function: "generation-reasoning",
        explanation: null,
      },
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    summary:
      "Repository evidence defines the project without using untrusted submitter copy.",
    tags: ["add-structured-reasoning"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(result.submitted).toMatchObject({
    metadata: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(JSON.stringify(result)).not.toContain("Unauthorized private wording");
  expect(JSON.stringify(result)).not.toContain("unauthorized-tag");
});

test("drafts fully manual trusted metadata without an enrichment warning", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    metadataAuthority: {
      authorityType: "tavernary-staff",
      actorId: 7,
      actorLogin: "maintainer",
    },
    metadataRequest: {
      summary: { mode: "manual", value: "Maintainer-curated summary." },
      tags: { mode: "manual", values: ["add-structured-reasoning"] },
    },
    enrichment: null,
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record).toMatchObject({
    summary: "Maintainer-curated summary.",
    tags: ["add-structured-reasoning"],
    metadata_status: "curated",
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Trusted Tavernary editor selection.",
      },
      tags: {
        mode: "manual",
        note: "Trusted Tavernary editor selection.",
      },
    },
  });
  expect(result.classificationReview).toBeNull();
  expect(result.warnings).toEqual([]);
});

test("stores only a bounded plain-text mismatch explanation", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation,
    snapshot,
    enrichment: {
      status: "curated",
      summary:
        "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
      tags: ["add-structured-reasoning"],
      classification_review: {
        status: "possible-mismatch",
        suggested_primary_function: "interface-workflow",
        explanation: `<script>\n${"source evidence ".repeat(30)}</script>`,
      },
    },
    now: "2026-07-25T18:00:00.000Z",
  });
  const explanation = result.classificationReview?.explanation ?? "";

  expect(explanation.length).toBeLessThanOrEqual(240);
  expect(explanation).not.toMatch(/[\r\n<>]/u);
});

test("falls back to repository description when enrichment is unavailable", async () => {
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
    summary: "Repository description.",
    metadata_status: "provisional",
    primary_function: "generation-reasoning",
    tags: [],
  });
  expect(result.warnings).toContain(
    "Automated enrichment failed: The enrichment provider timed out.",
  );
  expect(result.warnings).toContain(
    "The optional classification check was unavailable; the submitted primary function was preserved.",
  );
  expect(result.classificationReview).toEqual({
    status: "classification-check-unavailable",
    submitted_primary_function: "generation-reasoning",
    suggested_primary_function: null,
    explanation: "The optional classification check was unavailable.",
  });
});

test("reports why required catalog copy could not be validated", async () => {
  await expect(
    draftProjectRecord({
      admitted: admittedGithubExtension,
      observation,
      snapshot,
      enrichment: {
        status: "failed",
        code: "provider-timeout",
        message: "The enrichment provider timed out.",
      },
      copyRequired: true,
      now: "2026-07-25T18:00:00.000Z",
    }),
  ).rejects.toThrow(
    "Validated catalog copy is required before this project can be drafted: The enrichment provider timed out.",
  );
});

test("drafts external presets with manual source policy", async () => {
  const result = await draftProjectRecord({
    admitted: {
      status: "admitted",
      manifest: {
        schema_version: 4,
        project_type: "preset",
        primary_function: "preset",
        source_url: "https://example.com/presets/Nova/",
        frontends: { known_ids: [], other: [] },
        frontend_independent: true,
        additional_context: null,
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
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
    source_id: "url-example-com-presets-nova",
  });
  expect(result.source).toMatchObject({
    id: "url-example-com-presets-nova",
    type: "url",
    url: "https://example.com/presets/Nova",
    published_at: null,
    version: null,
    artifact_size_bytes: null,
    license_status: "pending",
    license_spdx_id: null,
    refresh_policy: "paused",
  });
  expect(result.record).toMatchObject({
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "External URL source; requires manual curation.",
      },
      tags: {
        mode: "manual",
        note: "External URL source; requires manual curation.",
      },
    },
  });
  expect(result.snapshot).toBeUndefined();
});

const admittedRedditPreset = {
  status: "admitted" as const,
  manifest: {
    schema_version: 4 as const,
    project_type: "preset" as const,
    primary_function: "preset",
    source_url:
      "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/preset_introducing_freaky_frankenstein_50/",
    frontends: { known_ids: ["sillytavern"], other: [] },
    frontend_independent: false,
    additional_context: null,
    metadata: {
      summary: { mode: "automatic" as const },
      tags: { mode: "automatic" as const },
    },
    preset_compatibility: {
      model_families: {
        known_ids: ["claude"],
        other: [],
      },
      completion_formats: ["chat-completion"],
    },
  },
  identity: {
    kind: "reddit" as const,
    canonicalUrl:
      "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/preset_introducing_freaky_frankenstein_50/",
    postId: "1v9u18m",
    subreddit: "SillyTavernAI",
    slug: "preset_introducing_freaky_frankenstein_50",
  },
  frontendIds: ["sillytavern"],
  warnings: [],
};

test("drafts Reddit presets with a readable name from the permalink slug", async () => {
  const result = await draftProjectRecord({
    admitted: admittedRedditPreset,
    observation: null,
    snapshot: null,
    enrichment: null,
    now: "2026-07-30T13:50:33.000Z",
  });

  expect(result.record).toMatchObject({
    id: "reddit-1v9u18m",
    name: "Preset Introducing Freaky Frankenstein 50",
    source_id: "url-reddit-1v9u18m",
  });
});

test("uses an explicit provisional Reddit placeholder without claiming curated copy", async () => {
  const result = await draftProjectRecord({
    admitted: admittedRedditPreset,
    observation: null,
    snapshot: null,
    enrichment: null,
    provisionalSummary:
      "A preset shared through Reddit. Tavernary could not retrieve the post description after repeated attempts, so source details remain temporarily unavailable.",
    provisionalWarning:
      "Reddit source remained unavailable after three retry waves.",
    now: "2026-07-30T13:50:33.000Z",
  });

  expect(result.record).toMatchObject({
    summary: expect.stringContaining("shared through Reddit"),
    metadata_status: "provisional",
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(result.copyResult).toBeNull();
  expect(result.warnings).toContain(
    "Reddit source remained unavailable after three retry waves.",
  );
});

test("drafts a frontend and its vocabulary proposal together", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        project_type: "frontend",
        primary_function: "frontend",
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
    frontends: ["repo"],
    primary_function: "frontend",
  });
  expect(result.frontendVocabulary?.frontends).toContainEqual({
    id: "repo",
    label: "Repo",
    description: "Works with the Repo roleplay frontend.",
  });
});

test("reuses an existing frontend identity when redrafting the same source", async () => {
  const result = await draftProjectRecord({
    admitted: {
      ...admittedGithubExtension,
      manifest: {
        ...admittedGithubExtension.manifest,
        project_type: "frontend",
        primary_function: "frontend",
        frontends: { known_ids: [], other: [] },
      },
      frontendIds: [],
    },
    observation,
    snapshot,
    enrichment: null,
    frontendVocabulary: {
      frontends: [
        {
          id: "repo-owner",
          label: "Repo",
          description: "Works with the Repo roleplay frontend.",
        },
      ],
    },
    frontendProjects: [
      {
        id: "owner-repo",
        kind: "frontend",
        source_id: "github-42",
        frontends: ["repo-owner"],
      },
    ],
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.frontends).toEqual(["repo-owner"]);
  expect(result.frontendVocabulary).toBeUndefined();
});

test("drafts an external Frontend with manual source policy", async () => {
  const result = await draftProjectRecord({
    admitted: {
      status: "admitted",
      manifest: {
        schema_version: 4,
        project_type: "frontend",
        primary_function: "frontend",
        source_url: "https://codeberg.org/example/nova",
        frontends: { known_ids: [], other: [] },
        frontend_independent: false,
        additional_context: null,
        metadata: {
          summary: { mode: "automatic" },
          tags: { mode: "automatic" },
        },
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
    source_id: "url-codeberg-org-example-nova",
  });
  expect(result.source).toMatchObject({
    id: "url-codeberg-org-example-nova",
    type: "url",
    url: "https://codeberg.org/example/nova",
    license_status: "pending",
    refresh_policy: "paused",
  });
  expect(result.record).toMatchObject({
    frontends: ["nova"],
    primary_function: "frontend",
    metadata_policy: {
      summary: { mode: "manual" },
      tags: { mode: "manual" },
    },
  });
});

test("keeps external project IDs distinct across source owners", async () => {
  const draft = async (owner: string) =>
    draftProjectRecord({
      admitted: {
        status: "admitted",
        manifest: {
          schema_version: 4,
          project_type: "frontend",
          primary_function: "frontend",
          source_url: `https://codeberg.org/${owner}/nova`,
          frontends: { known_ids: [], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
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

test("bounds a repository fallback summary to the project schema limit", async () => {
  const result = await draftProjectRecord({
    admitted: admittedGithubExtension,
    observation: {
      ...observation,
      repository: {
        ...observation.repository,
        description: "word ".repeat(60),
      },
    },
    snapshot,
    enrichment: null,
    now: "2026-07-25T18:00:00.000Z",
  });

  expect(result.record.summary.length).toBeLessThanOrEqual(220);
});

export { admittedGithubExtension, observation, snapshot };
