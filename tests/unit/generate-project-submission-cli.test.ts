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
          record: { id: "owner-repo", name: "Example" },
          snapshot: { project_id: "owner-repo" },
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
      "data/snapshots/github/owner-repo.json",
      "data/vocabularies/frontends.json",
    ]);
    expect(
      await readdir(resolve(outputDirectory, "data/registry/projects")),
    ).toEqual(["owner-repo.json"]);
    expect(
      await readdir(resolve(outputDirectory, "data/snapshots/github")),
    ).toEqual(["owner-repo.json"]);
    expect(JSON.parse(await readFile(reportPath, "utf8"))).toMatchObject({
      schema_version: 1,
      issue_number: 123,
      project_id: "owner-repo",
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("prepares a GitHub draft through injected source clients", async () => {
  const headSha = "a".repeat(40);
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
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 1,
          project_type: "extension",
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
        owner: { login: "Owner" },
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
      },
      observe: async () => ({
        observations: [
          {
            projectId: "submission-128",
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
      enrich: async () => ({
        status: "curated",
        summary:
          "Adds a structured repository tool for roleplay workflows and keeps its key controls accessible. It supports focused work without obscuring the surrounding conversation.",
        primary_function: "generation-reasoning",
        capabilities: ["planning-reasoning"],
      }),
    },
  });

  expect(draft.record).toMatchObject({
    id: "owner-repo",
    source: { repository_id: 42 },
    metadata_status: "curated",
  });
  expect(draft.snapshot).toMatchObject({
    schema_version: 2,
    project_id: "owner-repo",
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

test("prepares a generic external Frontend draft with its vocabulary entry", async () => {
  const draft = await prepareProjectSubmissionDraft({
    issue: {
      number: 129,
      state: "open",
      labels: [{ name: "needs-maintainer-review" }],
      body: [
        "### Project manifest",
        "",
        "```json",
        JSON.stringify({
          schema_version: 2,
          project_type: "frontend",
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
      },
    },
  });

  expect(draft).toMatchObject({
    record: {
      id: "example-com-nova",
      kind: "frontend",
      source: {
        type: "url",
        url: "https://example.com/nova",
      },
      frontends: ["nova-frontend"],
    },
    frontendVocabulary: {
      frontends: expect.arrayContaining([
        expect.objectContaining({
          id: "nova-frontend",
          label: "Nova Frontend",
        }),
      ]),
    },
  });
});
