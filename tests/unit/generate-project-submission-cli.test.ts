import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, vi } from "vitest";

import {
  parseGenerateProjectSubmissionCli,
  prepareProjectSubmissionDraft,
  runGenerateProjectSubmissionCli,
} from "../../scripts/submissions/generate-project-submission.mjs";

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
        labels: [{ name: "needs-maintainer-review" }],
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

test("prepares a GitHub draft through injected source clients", async () => {
  const headSha = "a".repeat(40);
  const enrich = vi.fn(async () => ({
    status: "curated" as const,
    summary:
      "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
    capabilities: ["planning-reasoning"],
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
      labels: [{ name: "needs-maintainer-review" }],
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
      enrich,
    },
  });

  expect(draft.record).toMatchObject({
    id: "owner-repo",
    source_id: "github-42",
    metadata_status: "curated",
    primary_function: "memory-retrieval",
    enrichment_policy: "manual",
    enrichment_note:
      "Catalog summary preserved from repository-owner submission issue #128.",
  });
  expect(draft.source).toMatchObject({
    id: "github-42",
    repository_id: 42,
  });
  expect(draft.summaryAuthority).toEqual({
    authorityType: "repository-owner",
    actorId: 11,
    actorLogin: "owner",
  });
  expect(draft.copyResult).toEqual({
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });
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
      summaryAuthority: {
        authorityType: "repository-owner",
        actorId: 11,
        actorLogin: "owner",
      },
      summaryMode: "preserve",
      submittedDescription: "Submitted description.",
      protectedTerms: expect.arrayContaining([
        "Repository Tool",
        "Owner",
        "Repo",
        "SillyTavern",
      ]),
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
          schema_version: 3,
          project_type: "extension",
          primary_function: "interface-workflow",
          source_url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
          name: "Swipe Scrubber",
          description: "Swipe controls.",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
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
        capabilities: ["message-navigation"],
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
            schema_version: 3,
            project_type: "frontend",
            primary_function: "frontend",
            source_url: "https://example.com/nova",
            name: "Nova Frontend",
            description: "A public-source roleplay frontend.",
            frontends: { known_ids: [], other: [] },
            frontend_independent: false,
            additional_context: null,
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
