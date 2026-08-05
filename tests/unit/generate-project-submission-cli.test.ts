import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, vi } from "vitest";

import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";
import {
  parseGenerateProjectSubmissionCli,
  prepareProjectSubmissionDraft,
  RedditSourceRetryScheduledError,
  runGenerateProjectSubmissionCli,
} from "../../scripts/submissions/generate-project-submission.mjs";
import { renderRedditRetryState } from "../../scripts/submissions/project-submission-retry-state.mjs";

function redditRateLimitFailure() {
  return {
    status: "failed" as const,
    reasonCode: "reddit-rate-limited",
    message: "The Reddit source request was rate limited.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  };
}

function redditSubmissionFixture(overrides: Record<string, unknown> = {}) {
  return {
    issue: {
      number: 165,
      state: "open",
      labels: [
        { name: "issue-admitted" },
        { name: "project-submission" },
        { name: "needs-maintainer-review" },
      ],
      user: { id: 73, login: "CommunityMember", type: "User" },
      author_association: "NONE",
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 4,
          project_type: "preset",
          primary_function: "preset",
          source_url:
            "https://www.reddit.com/r/SillyTavernAI/comments/1v9u18m/preset_introducing_freaky_frankenstein_50/",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
          preset_compatibility: {
            model_families: { known_ids: ["claude"], other: [] },
            completion_formats: ["chat-completion"],
          },
        }),
        "```",
      ].join("\n"),
    },
    now: "2026-07-30T18:00:00.000Z",
    sourceClients: {
      request: async () => {
        throw new Error("Canonical Reddit intake should not call GitHub.");
      },
      catalogData: {
        vocabulary: {
          frontends: [
            {
              id: "sillytavern",
              label: "SillyTavern",
              description: "Works with the SillyTavern roleplay frontend.",
            },
          ],
        },
        projects: [],
        sources: [],
      },
      issueComments: [],
      ...overrides,
    },
  };
}

function repositorySubmissionFixture({
  user,
  ownerId,
  metadata,
  enrich,
  copySummary,
}: {
  user: { id: number; login: string };
  ownerId: number;
  metadata: {
    summary: { mode: "automatic" } | { mode: "manual"; value: string };
    tags: { mode: "automatic" } | { mode: "manual"; values: string[] };
  };
  enrich: (input: unknown) => Promise<Record<string, unknown>>;
  copySummary: (input: unknown) => Promise<Record<string, unknown>>;
}) {
  const headSha = "b".repeat(40);
  return {
    issue: {
      number: 144,
      state: "open",
      labels: [{ name: "needs-maintainer-review" }],
      user,
      author_association: user.id === 2_625_904 ? "OWNER" : "NONE",
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 4,
          project_type: "extension",
          primary_function: "generation-reasoning",
          source_url: "https://github.com/Owner/Repo",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata,
        }),
        "```",
      ].join("\n"),
    },
    now: "2026-07-29T18:00:00.000Z",
    sourceClients: {
      request: async () => ({
        id: 42,
        owner: { id: ownerId, login: "Owner", type: "User" },
        name: "Repo",
        html_url: "https://github.com/Owner/Repo",
        visibility: "public",
        private: false,
        archived: false,
      }),
      catalogData: {
        vocabulary: {
          frontends: [
            {
              id: "sillytavern",
              label: "SillyTavern",
              description: "Works with the SillyTavern roleplay frontend.",
            },
          ],
        },
        projects: [],
        sources: [],
      },
      observe: async () => ({
        observations: [
          {
            sourceId: "github-42",
            repository: {
              id: 42,
              owner: "Owner",
              name: "Repo",
              url: "https://github.com/Owner/Repo",
              description: "Repository description.",
              defaultBranch: "main",
              headSha,
              headCommittedAt: "2026-07-29T17:00:00.000Z",
              archived: false,
              fork: false,
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
          },
        ],
        failures: [],
        usage: { requestCount: 1, pointCost: 2, remainingPoints: 4_998 },
      }),
      inspectActivity: async () => ({
        complete: false,
        activity: {
          evidence_head_sha: headSha,
          latest_source_activity_at: null,
          source_weeks: [],
          provisional_weeks: Array.from({ length: 12 }, () => false),
          latest_release_at: null,
          evidence_status: "provisional",
          baseline_completed_at: null,
          baseline_attempts: 0,
        },
        license: {
          status: "osi-approved",
          spdxId: "MIT",
          sourcePath: "LICENSE",
        },
        requestCount: 2,
        scan: null,
      }),
      fetchContributors: async () => ({
        accounts: [],
        requestCount: 1,
        method: "merged-pull-requests",
        baselineCompletedAt: null,
        refreshedAt: null,
        scan: null,
      }),
      enrich,
      copySummary,
    },
  };
}

test("parses the generation CLI boundary", () => {
  expect(
    parseGenerateProjectSubmissionCli([
      "--issue-number",
      "123",
      "--output-directory",
      "repo",
      "--report-path",
      "artifacts/admission-report.json",
    ]),
  ).toEqual({
    issueNumber: 123,
    outputDirectory: "repo",
    reportPath: "artifacts/admission-report.json",
  });
});

test("parses an optional Reddit retry-state artifact path", () => {
  expect(
    parseGenerateProjectSubmissionCli([
      "--issue-number",
      "165",
      "--output-directory",
      "repo",
      "--report-path",
      "artifacts/admission-report.json",
      "--retry-state-path",
      "artifacts/reddit-retry-state.json",
    ]),
  ).toMatchObject({
    issueNumber: 165,
    retryStatePath: "artifacts/reddit-retry-state.json",
  });
});

test("parses an optional sanitized failure-diagnostic artifact path", () => {
  expect(
    parseGenerateProjectSubmissionCli([
      "--issue-number",
      "255",
      "--output-directory",
      "repo",
      "--report-path",
      "artifacts/admission-report.json",
      "--failure-diagnostic-path",
      "artifacts/generation-failure.json",
    ]),
  ).toMatchObject({
    issueNumber: 255,
    failureDiagnosticPath: "artifacts/generation-failure.json",
  });
});

test("writes only declared repository files and the external report", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "tavernary-submission-"));
  const outputDirectory = resolve(temporary, "repository");
  const reportPath = resolve(temporary, "artifacts/admission-report.json");
  try {
    const result = await runGenerateProjectSubmissionCli({
      issueNumber: 123,
      outputDirectory,
      reportPath,
      fetchIssue: async () => ({
        number: 123,
        state: "open",
        labels: [{ name: "submission-retryable" }],
        body: "fixture",
      }),
      sourceClients: {
        prepareDraft: async () => ({
          record: {
            id: "owner-repo",
            name: "Example",
            source_id: "github-42",
          },
          source: {
            schema_version: 1,
            id: "github-42",
            type: "github",
            repository: "owner/repo",
            repository_id: 42,
            status: "active",
            status_reason: null,
            refresh_policy: "automatic",
          },
          snapshot: {
            schema_version: 4,
            provider: "github",
            source_id: "github-42",
          },
          frontendVocabulary: {
            frontends: [
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
        }),
      },
      clock: () => "2026-07-25T18:00:00.000Z",
    });

    expect(result.files.map(({ path }) => path)).toEqual([
      "data/registry/projects/owner-repo.json",
      "data/registry/sources/github-42.json",
      "data/snapshots/github/github-42.json",
      "data/vocabularies/frontends.json",
    ]);
    expect(
      await readdir(resolve(outputDirectory, "data/registry/projects")),
    ).toEqual(["owner-repo.json"]);
    expect(
      await readdir(resolve(outputDirectory, "data/snapshots/github")),
    ).toEqual(["github-42.json"]);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
      schema_version: 1,
      issue_number: 123,
      project_id: "owner-repo",
      source_id: "github-42",
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("recovers an admitted v3 owner request without leaking manual copy to enrichment", async () => {
  const headSha = "a".repeat(40);
  const copySummary = vi.fn(async () => ({
    summary: "Submitted description.",
    result: "accepted-unchanged" as const,
    change_reasons: [],
    policy_signal: "none" as const,
  }));
  const enrich = vi.fn(async (_input: unknown) => ({
    status: "curated" as const,
    summary:
      "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
    tags: ["add-structured-reasoning"],
    classification_review: {
      status: "possible-mismatch" as const,
      suggested_primary_function: "interface-workflow",
      explanation:
        "The source primarily describes user-facing editing controls.",
    },
    result: "accepted-unchanged" as const,
    change_reasons: [],
    policy_signal: "none" as const,
  }));
  const fetchContributors = vi.fn(async () => ({
    accounts: [
      { login: "Owner", type: "User" },
      { login: "LeRobber", type: "User" },
    ],
    requestCount: 1,
    method: "merged-pull-requests",
    baselineCompletedAt: null,
    refreshedAt: null,
    scan: {
      nextPage: 3,
      cutoffAt: null,
      targetWatermark: "2026-07-25T18:00:00.000Z",
    },
  }));
  const draft = await prepareProjectSubmissionDraft({
    issue: {
      number: 128,
      state: "open",
      labels: [{ name: "submission-retryable" }],
      user: { id: 11, login: "owner" },
      author_association: "NONE",
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 3,
          project_type: "extension",
          primary_function: "memory-retrieval",
          source_url: "https://github.com/Owner/Repo",
          name: "Repository Tool",
          description: "Submitted description.",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
        }),
        "```",
      ].join("\n"),
    },
    now: "2026-07-25T18:00:00.000Z",
    sourceClients: {
      request: async () => ({
        id: 42,
        owner: { id: 11, login: "Owner", type: "User" },
        name: "Repo",
        html_url: "https://github.com/Owner/Repo",
        visibility: "public",
        private: false,
        archived: false,
      }),
      catalogData: {
        vocabulary: {
          frontends: [
            {
              id: "sillytavern",
              label: "SillyTavern",
              description: "Works with the SillyTavern roleplay frontend.",
            },
          ],
        },
        projects: [],
        sources: [],
      },
      observe: async () => ({
        observations: [
          {
            sourceId: "github-42",
            repository: {
              id: 42,
              owner: "Owner",
              name: "Repo",
              url: "https://github.com/Owner/Repo",
              description: "Repository description.",
              defaultBranch: "main",
              headSha,
              headCommittedAt: "2026-07-25T17:00:00.000Z",
              archived: false,
              fork: true,
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
          },
        ],
        failures: [],
        usage: { requestCount: 1, pointCost: 2, remainingPoints: 4_998 },
      }),
      inspectActivity: async () => ({
        complete: false,
        activity: {
          evidence_head_sha: headSha,
          latest_source_activity_at: null,
          source_weeks: [],
          provisional_weeks: Array.from({ length: 12 }, () => false),
          latest_release_at: null,
          evidence_status: "provisional",
          baseline_completed_at: null,
          baseline_attempts: 0,
        },
        license: {
          status: "osi-approved",
          spdxId: "MIT",
          sourcePath: "LICENSE",
        },
        requestCount: 2,
        scan: {
          head_sha: headSha,
          cutoff_at: "2026-05-01T00:00:00.000Z",
          next_page: 2,
          next_index: 0,
          resolved_weeks: [],
        },
      }),
      fetchContributors,
      copySummary,
      enrich,
    },
  });

  expect(draft.record).toMatchObject({
    id: "owner-repo",
    source_id: "github-42",
    metadata_status: "curated",
    primary_function: "memory-retrieval",
    tags: ["add-structured-reasoning"],
    metadata_policy: {
      summary: {
        mode: "manual",
        note: "Verified repository owner selection.",
      },
      tags: { mode: "automatic" },
    },
  });
  expect(draft.source).toMatchObject({
    id: "github-42",
    repository_id: 42,
  });
  expect(draft.metadataAuthority).toEqual({
    authorityType: "repository-owner",
    actorId: 11,
    actorLogin: "owner",
  });
  expect(draft.copyResult).toEqual({
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });
  expect(draft.copyMode).toBe("preserve");
  expect(draft.classificationReview).toMatchObject({
    status: "possible-mismatch",
    submitted_primary_function: "memory-retrieval",
    suggested_primary_function: "interface-workflow",
  });
  expect(enrich).toHaveBeenCalledWith(
    expect.objectContaining({
      classificationReviewRequest: {
        submittedPrimaryFunction: "memory-retrieval",
        allowedPrimaryFunctions: expect.arrayContaining([
          expect.objectContaining({ id: "memory-retrieval" }),
          expect.objectContaining({ id: "interface-workflow" }),
        ]),
      },
      metadataAuthority: {
        authorityType: "repository-owner",
        actorId: 11,
        actorLogin: "owner",
      },
      metadataRequest: {
        summary: { mode: "manual", value: "Submitted description." },
        tags: { mode: "automatic" },
      },
      requestedFields: ["tags"],
      protectedTerms: expect.arrayContaining([
        "Repo",
        "Owner",
        "Repo",
        "SillyTavern",
      ]),
    }),
  );
  expect(enrich.mock.calls[0]?.[0]).not.toHaveProperty("submittedDescription");
  expect(copySummary).toHaveBeenCalledWith(
    expect.objectContaining({
      authorityType: "repository-owner",
      submittedSummary: "Submitted description.",
      policyVersion: expect.any(String),
    }),
  );
  expect(draft.snapshot).toMatchObject({
    schema_version: 4,
    provider: "github",
    source_id: "github-42",
    activity: { evidence_status: "provisional" },
    contributors: {
      accounts: [
        { login: "Owner", type: "User" },
        { login: "LeRobber", type: "User" },
      ],
      method: "merged-pull-requests",
      baseline_completed_at: null,
      scan: {
        next_page: 3,
        cutoff_at: null,
        target_watermark: "2026-07-25T18:00:00.000Z",
      },
    },
  });
  expect(fetchContributors).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: "Owner",
      name: "Repo",
      fork: true,
    }),
    { now: "2026-07-25T18:00:00.000Z", previous: undefined },
  );
});

test("preserves a trusted staff summary while leaving manual tags untouched", async () => {
  const enrich = vi.fn(async () => {
    throw new Error("Manual metadata must not enter enrichment.");
  });
  const copySummary = vi.fn(async () => ({
    summary: "Staff-authored summary.",
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));
  const draft = await prepareProjectSubmissionDraft(
    repositorySubmissionFixture({
      user: { id: 2_625_904, login: "MentallyQuill" },
      ownerId: 11,
      metadata: {
        summary: { mode: "manual", value: "Staff-authored summary." },
        tags: {
          mode: "manual",
          values: ["add-structured-reasoning"],
        },
      },
      enrich,
      copySummary,
    }),
  );

  expect(enrich).not.toHaveBeenCalled();
  expect(copySummary).toHaveBeenCalledWith(
    expect.objectContaining({
      authorityType: "tavernary-staff",
      submittedSummary: "Staff-authored summary.",
    }),
  );
  expect(draft.record).toMatchObject({
    summary: "Staff-authored summary.",
    tags: ["add-structured-reasoning"],
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
  expect(draft.copyMode).toBe("preserve");
});

test("keeps automatic tags when a verified owner supplies a manual summary", async () => {
  const copySummary = vi.fn(async () => ({
    summary: "Owner-authored summary.",
    result: "accepted-unchanged" as const,
    change_reasons: [],
    policy_signal: "none" as const,
  }));
  const fixture = repositorySubmissionFixture({
    user: { id: 11, login: "Owner" },
    ownerId: 11,
    metadata: {
      summary: { mode: "manual", value: "Owner-authored summary." },
      tags: { mode: "automatic" },
    },
    enrich: async () => {
      throw new Error("The injected provider path should own enrichment.");
    },
    copySummary,
  });
  const sourceClients = fixture.sourceClients as Record<string, unknown>;
  delete sourceClients.enrich;
  sourceClients.enrichmentProvider = {
    generate: async () => ({
      output: {
        tags: [
          {
            id: "add-structured-reasoning",
            evidence: ["readme:1-3"],
          },
        ],
      },
      metadata: {
        requestedModel: "fixture-model",
        returnedModel: "fixture-model",
        latencyMs: 1,
      },
    }),
  };
  sourceClients.loadEnrichmentSource = async () => ({
    status: "ready",
    sourceKind: "readme",
    sourceIdentity: "github:Owner/Repo",
    text: "The extension adds structured reasoning to roleplay workflows.",
    repositoryDescription: "Repository description.",
    readmeText:
      "The extension adds structured reasoning to roleplay workflows.",
    readmePath: "README.md",
    readmeRef: "b".repeat(40),
    readmeIdentity: `github:Owner/Repo@${"b".repeat(40)}:README.md`,
    repositoryId: 42,
    headSha: "b".repeat(40),
  });

  const draft = await prepareProjectSubmissionDraft(fixture);

  expect(draft.record).toMatchObject({
    summary: "Owner-authored summary.",
    tags: ["add-structured-reasoning"],
  });
});

test("routes unavailable verified-owner copy review to manual publication", async () => {
  const submittedSummary = [
    "You pick a sentence boundary and write your reply there.",
    "The original remainder stays available as non-canonical reference.",
  ].join("\n\n");
  const copySummary = vi.fn(async () => {
    throw new EnrichmentProviderError("provider-timeout", null, {
      latencyMs: 900,
    });
  });
  const enrich = vi.fn(async () => {
    throw new Error("Manual metadata must not enter enrichment.");
  });

  const draft = await prepareProjectSubmissionDraft(
    repositorySubmissionFixture({
      user: { id: 11, login: "Owner" },
      ownerId: 11,
      metadata: {
        summary: { mode: "manual", value: submittedSummary },
        tags: {
          mode: "manual",
          values: ["add-structured-reasoning"],
        },
      },
      enrich,
      copySummary,
    }),
  );

  expect(draft.record.summary).toBe(submittedSummary.replace(/\s+/gu, " "));
  expect(draft.copyResult).toBeNull();
  expect(draft.copyReviewStatus).toBe("unavailable");
  expect(draft.copyReviewReasonCode).toBe("copy-review-unavailable");
  expect(draft.copyReviewDiagnostic).toEqual({
    failure_phase: "initial-provider",
    failure_code: "provider-timeout",
    diagnostic_code: null,
    attempt_count: 1,
    latency_ms: 900,
  });
  expect(draft.publicationMode).toBe("manual");
});

test("discards community manual metadata before synthesized enrichment", async () => {
  const enrich = vi.fn(async () => ({
    status: "curated",
    summary:
      "Synthesized source-grounded summary for the repository. It describes the verified workflow without using community prose.",
    tags: ["add-structured-reasoning"],
    classification_review: {
      status: "confirmed",
      suggested_primary_function: "generation-reasoning",
      explanation: null,
    },
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));
  const copySummary = vi.fn(async () => {
    throw new Error("Unauthorized copy must not reach preservation.");
  });
  const draft = await prepareProjectSubmissionDraft(
    repositorySubmissionFixture({
      user: { id: 77, login: "Community" },
      ownerId: 11,
      metadata: {
        summary: {
          mode: "manual",
          value: "Do not send this community text to a model.",
        },
        tags: {
          mode: "manual",
          values: ["maintain-long-term-memory"],
        },
      },
      enrich,
      copySummary,
    }),
  );

  expect(copySummary).not.toHaveBeenCalled();
  expect(enrich).toHaveBeenCalledWith(
    expect.objectContaining({
      requestedFields: ["summary", "tags"],
      maxProviderAttempts: 5,
      metadataRequest: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    }),
  );
  expect(JSON.stringify(enrich.mock.calls)).not.toContain(
    "Do not send this community text to a model.",
  );
  expect(JSON.stringify(draft)).not.toContain(
    "Do not send this community text to a model.",
  );
  expect(draft.record).toMatchObject({
    summary:
      "Synthesized source-grounded summary for the repository. It describes the verified workflow without using community prose.",
    tags: ["add-structured-reasoning"],
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "automatic" },
    },
  });
  expect(draft.copyMode).toBe("synthesize");
});

test("prepares a Codeberg draft through the repository provider", async () => {
  const headSha = "1".repeat(40);
  const provider = {
    resolve: vi.fn(async (identity) => ({
      ...identity,
      repositoryId: 1699613,
    })),
    observe: vi.fn(async (records) => ({
      observations: [
        {
          provider: "codeberg",
          sourceId: records[0].id,
          repository: {
            id: 1699613,
            owner: "targren",
            name: "Lumiverse-SwipeScrubber",
            url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
            description: "Swipe controls.",
            defaultBranch: "master",
            headSha,
            headCommittedAt: "2026-07-25T17:00:00.000Z",
            archived: false,
            fork: false,
            parent: null,
            createdAt: "2026-05-01T00:00:00.000Z",
            sizeKb: 409,
          },
          community: { starsCount: 0, forksCount: 0, watchersCount: 1 },
          latestReleaseAt: null,
          coarseLicenseSpdxId: null,
        },
      ],
      failures: [],
      usage: { requestCount: 2, pointCost: 0, remainingPoints: 1_998 },
    })),
    inspectActivity: vi.fn(async ({ activity }) => ({
      complete: false,
      activity,
      license: {
        status: "missing",
        spdxId: null,
        sourcePath: null,
      },
      requestCount: 2,
      scan: null,
    })),
    collectContributors: vi.fn(async () => ({
      accounts: [{ provider: "codeberg", login: "targren", type: "User" }],
      requestCount: 3,
      method: "commit-and-merged-pull-request-authors",
      baselineCompletedAt: "2026-07-25T18:00:00.000Z",
      refreshedAt: "2026-07-25T18:00:00.000Z",
      scan: null,
    })),
  };
  const draft = await prepareProjectSubmissionDraft({
    issue: {
      number: 112,
      state: "open",
      labels: [{ name: "needs-maintainer-review" }],
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 4,
          project_type: "extension",
          primary_function: "interface-workflow",
          source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
        }),
        "```",
      ].join("\n"),
    },
    now: "2026-07-25T18:00:00.000Z",
    sourceClients: {
      providers: { codeberg: provider },
      request: vi.fn(),
      catalogData: {
        vocabulary: {
          frontends: [
            {
              id: "sillytavern",
              label: "SillyTavern",
              description: "Works with the SillyTavern roleplay frontend.",
            },
          ],
        },
        projects: [],
        sources: [],
      },
      enrich: async () => ({
        status: "curated",
        summary: "Adds concise swipe controls for roleplay conversations.",
        tags: ["organize-chats-and-messages"],
        classification_review: {
          status: "confirmed",
          suggested_primary_function: "interface-workflow",
          explanation: null,
        },
        result: "accepted-unchanged",
        change_reasons: [],
        policy_signal: "none",
      }),
    },
  });

  expect(draft.record).toMatchObject({
    id: "targren-lumiverse-swipescrubber",
    source_id: "codeberg-1699613",
  });
  expect(draft.source).toMatchObject({
    id: "codeberg-1699613",
    type: "codeberg",
    repository: "targren/Lumiverse-SwipeScrubber",
    repository_id: 1699613,
  });
  expect(draft.snapshot).toMatchObject({
    schema_version: 4,
    provider: "codeberg",
    source_id: "codeberg-1699613",
  });
});

test("rejects a generic external Frontend before source probing", async () => {
  await expect(
    prepareProjectSubmissionDraft({
      issue: {
        number: 129,
        state: "open",
        labels: [{ name: "needs-maintainer-review" }],
        body: [
          "### Project manifest",
          "",
          "```json",
          JSON.stringify({
            schema_version: 4,
            project_type: "frontend",
            primary_function: "frontend",
            source_url: "https://example.com/nova",
            frontends: { known_ids: [], other: [] },
            frontend_independent: false,
            additional_context: null,
            metadata: {
              summary: { mode: "automatic" },
              tags: { mode: "automatic" },
            },
          }),
          "```",
        ].join("\n"),
      },
      now: "2026-07-25T18:00:00.000Z",
      sourceClients: {
        request: async () => {
          throw new Error("GitHub should not be requested.");
        },
        probe: async () => ({
          status: 200,
          finalUrl: "https://example.com/nova",
        }),
        catalogData: {
          vocabulary: {
            frontends: [
              {
                id: "sillytavern",
                label: "SillyTavern",
                description: "Works with the SillyTavern roleplay frontend.",
              },
            ],
          },
          projects: [],
          sources: [],
        },
      },
    }),
  ).rejects.toThrow(
    "Frontends and Extensions require a public GitHub or Codeberg repository.",
  );
});

test("generates Reddit metadata from the submitted post body", async () => {
  const loadEnrichmentSource = vi.fn(async () => ({
    status: "ready" as const,
    sourceKind: "reddit-body",
    text: "Freaky Frankenstein is a roleplay preset with documented controls.",
    sourceIdentity: "reddit:1v9u18m",
    redditPostId: "1v9u18m",
  }));
  const enrich = vi.fn(async () => ({
    status: "curated",
    summary:
      "Freaky Frankenstein is a roleplay preset with documented controls and structured prompting behavior for compatible SillyTavern configurations.",
    tags: [],
    classification_review: null,
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  }));

  const draft = await prepareProjectSubmissionDraft(
    redditSubmissionFixture({ loadEnrichmentSource, enrich }),
  );

  expect(loadEnrichmentSource).toHaveBeenCalled();
  expect(enrich).toHaveBeenCalledWith(
    expect.objectContaining({
      requestedFields: ["summary", "tags"],
      maxProviderAttempts: 5,
      enrichmentSource: expect.objectContaining({
        sourceKind: "reddit-body",
      }),
    }),
  );
  expect(draft.record).toMatchObject({
    id: "reddit-1v9u18m",
    metadata_status: "curated",
    summary: expect.stringContaining("Freaky Frankenstein"),
  });
});

test("returns durable retry state after the first exhausted Reddit wave", async () => {
  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        loadEnrichmentSource: async () => redditRateLimitFailure(),
        sleep: async () => undefined,
        issueComments: [],
      }),
    ),
  ).rejects.toMatchObject({
    code: "reddit-source-retry-scheduled",
    retryState: {
      completed_waves: 1,
      next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    },
    attempts: 3,
  });
});

test("does not consume a Reddit source wave before the retry is due", async () => {
  const loadEnrichmentSource = vi.fn(async () => redditRateLimitFailure());
  const retryState = {
    schema_version: 1 as const,
    issue_number: 165,
    source_identity: "reddit:1v9u18m" as const,
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending" as const,
  };

  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        loadEnrichmentSource,
        issueComments: [
          {
            id: 44,
            body: [
              "<!-- tavernary-project-generation-failure:project-submission -->",
              renderRedditRetryState(retryState),
            ].join("\n"),
          },
        ],
      }),
    ),
  ).rejects.toMatchObject({
    code: "reddit-source-retry-scheduled",
    attempts: 0,
  });
  expect(loadEnrichmentSource).not.toHaveBeenCalled();
});

test("fails closed on a malformed persisted Reddit retry marker", async () => {
  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        loadEnrichmentSource: async () => redditRateLimitFailure(),
        issueComments: [
          {
            id: 44,
            body: [
              "<!-- tavernary-project-generation-failure:project-submission -->",
              "<!-- tavernary-reddit-submission-retry",
              '{"schema_version":1,"unexpected":"field"}',
              "-->",
            ].join("\n"),
          },
        ],
      }),
    ),
  ).rejects.toThrow("Reddit retry state is invalid.");
});

test("uses the newer durable state when another wave finishes concurrently", async () => {
  const issue = redditSubmissionFixture().issue;
  const first = {
    schema_version: 1 as const,
    issue_number: 165,
    source_identity: "reddit:1v9u18m" as const,
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T18:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T17:00:00.000Z",
    outcome: "pending" as const,
  };
  const newer = {
    ...first,
    completed_waves: 2,
    next_eligible_retry_at: "2026-07-30T20:00:00.000Z",
    updated_at: "2026-07-30T18:05:00.000Z",
  };
  const context = vi
    .fn()
    .mockResolvedValueOnce({
      issue,
      comments: [
        {
          id: 44,
          body: [
            "<!-- tavernary-project-generation-failure:project-submission -->",
            renderRedditRetryState(first),
          ].join("\n"),
        },
      ],
    })
    .mockResolvedValueOnce({
      issue,
      comments: [
        {
          id: 44,
          body: [
            "<!-- tavernary-project-generation-failure:project-submission -->",
            renderRedditRetryState(newer),
          ].join("\n"),
        },
      ],
    });

  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        issueComments: undefined,
        loadRetryContext: context,
        loadEnrichmentSource: async () => redditRateLimitFailure(),
        sleep: async () => undefined,
      }),
    ),
  ).rejects.toMatchObject({
    code: "reddit-source-retry-scheduled",
    retryState: { completed_waves: 2 },
  });
  expect(context).toHaveBeenCalledTimes(2);
});

test("publishes a provisional placeholder after the third exhausted Reddit wave", async () => {
  const retryState = {
    schema_version: 1 as const,
    issue_number: 165,
    source_identity: "reddit:1v9u18m" as const,
    completed_waves: 2,
    next_eligible_retry_at: "2026-07-30T18:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T17:00:00.000Z",
    outcome: "pending" as const,
  };
  const draft = await prepareProjectSubmissionDraft(
    redditSubmissionFixture({
      loadEnrichmentSource: async () => redditRateLimitFailure(),
      sleep: async () => undefined,
      issueComments: [
        {
          id: 44,
          body: [
            "<!-- tavernary-project-generation-failure:project-submission -->",
            renderRedditRetryState(retryState),
          ].join("\n"),
        },
      ],
    }),
  );

  expect(draft.record.metadata_status).toBe("provisional");
  expect(draft.record.summary).toContain("shared through Reddit");
  expect(draft.copyResult).toBeNull();
  expect(draft.redditRetry).toMatchObject({
    outcome: "placeholder",
    completed_waves: 3,
    attempts: 3,
  });
});

test("blocks a Reddit source response for a different post", async () => {
  await expect(
    prepareProjectSubmissionDraft(
      redditSubmissionFixture({
        loadEnrichmentSource: async () => ({
          ...redditRateLimitFailure(),
          reasonCode: "reddit-identity-mismatch",
        }),
        sleep: async () => undefined,
      }),
    ),
  ).rejects.toMatchObject({ code: "reddit-identity-mismatch" });
});

test("writes only sanitized retry state when Reddit generation is rescheduled", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "tavernary-reddit-retry-"));
  const state = {
    schema_version: 1 as const,
    issue_number: 165,
    source_identity: "reddit:1v9u18m" as const,
    completed_waves: 1,
    next_eligible_retry_at: "2026-07-30T19:00:00.000Z",
    last_reason_code: "reddit-rate-limited",
    updated_at: "2026-07-30T18:00:00.000Z",
    outcome: "pending" as const,
  };
  const retryStatePath = resolve(
    temporary,
    "artifacts/reddit-retry-state.json",
  );
  try {
    await expect(
      runGenerateProjectSubmissionCli({
        issueNumber: 165,
        outputDirectory: resolve(temporary, "repository"),
        reportPath: resolve(temporary, "artifacts/admission-report.json"),
        retryStatePath,
        fetchIssue: async () => ({
          number: 165,
          state: "open",
          labels: [{ name: "submission-retryable" }],
          body: "fixture",
        }),
        sourceClients: {
          prepareDraft: async () => {
            const error = new RedditSourceRetryScheduledError({
              state,
              attempts: 3,
            });
            Object.assign(error, {
              rawRedditText: "Reddit post body",
              providerOutput: { secret: true },
            });
            throw error;
          },
        },
        clock: () => "2026-07-30T18:00:00.000Z",
      }),
    ).rejects.toMatchObject({
      code: "reddit-source-retry-scheduled",
    });

    expect(JSON.parse(await readFile(retryStatePath, "utf8"))).toEqual(state);
    const serialized = await readFile(retryStatePath, "utf8");
    expect(serialized).not.toContain("Reddit post body");
    expect(serialized).not.toContain("secret");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("writes only a sanitized reason code when required copy generation fails", async () => {
  const temporary = await mkdtemp(
    join(tmpdir(), "tavernary-generation-failure-"),
  );
  const failureDiagnosticPath = resolve(
    temporary,
    "artifacts/generation-failure.json",
  );
  try {
    await expect(
      runGenerateProjectSubmissionCli({
        issueNumber: 255,
        outputDirectory: resolve(temporary, "repository"),
        reportPath: resolve(temporary, "artifacts/admission-report.json"),
        failureDiagnosticPath,
        fetchIssue: async () => ({
          number: 255,
          state: "open",
          labels: [{ name: "submission-retryable" }],
          body: "fixture",
        }),
        sourceClients: {
          prepareDraft: async () => {
            throw Object.assign(new Error("REJECTED GENERATED COPY"), {
              code: "output-invalid",
              providerOutput: { secret: true },
            });
          },
        },
        clock: () => "2026-08-04T22:04:25.000Z",
      }),
    ).rejects.toMatchObject({ code: "output-invalid" });

    const serialized = await readFile(failureDiagnosticPath, "utf8");
    expect(JSON.parse(serialized)).toEqual({
      schema_version: 1,
      reason_code: "output-invalid",
    });
    expect(serialized).not.toContain("REJECTED GENERATED COPY");
    expect(serialized).not.toContain("secret");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
