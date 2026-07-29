import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test, vi } from "vitest";

import {
  CodebergRepositoryProvider,
  runCodebergSmoke,
} from "../../scripts/catalog/codeberg-repository-provider.mjs";

async function fixture(name: string) {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), `tests/fixtures/codeberg/${name}.json`),
      "utf8",
    ),
  );
}

const record = {
  id: "codeberg-1699613",
  type: "codeberg" as const,
  repository: "targren/Lumiverse-SwipeScrubber",
  repository_id: 1699613,
  status: "active" as const,
  refresh_policy: "automatic" as const,
};

test("smoke verifies public identity and a 40-character head", async () => {
  const repository = await fixture("repository");
  const commits = await fixture("commits");
  const logger = { log: vi.fn() };
  const result = await runCodebergSmoke(record.repository, {
    request: vi
      .fn()
      .mockResolvedValueOnce({ data: repository })
      .mockResolvedValueOnce({ data: commits }),
    logger,
  });

  expect(result).toEqual({
    provider: "codeberg",
    repositoryId: 1699613,
    repository: "targren/Lumiverse-SwipeScrubber",
    public: true,
    headSha: "111978ba6fcbc5236c060be2b2ad7484833145b9",
  });
  expect(logger.log).toHaveBeenCalledWith(
    expect.stringContaining("provider=codeberg"),
  );
});

function activity() {
  return {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional" as const,
    baseline_completed_at: null,
    baseline_attempts: 0,
  };
}

test("normalizes a Codeberg repository observation", async () => {
  const repository = await fixture("repository");
  const commits = await fixture("commits");
  const releases = await fixture("releases");
  const request = vi.fn(async (path: string) => {
    if (path.includes("/commits?")) return { data: commits.slice(0, 1) };
    if (path.includes("/releases?")) return { data: releases };
    return { data: repository };
  });
  const provider = new CodebergRepositoryProvider({ request });

  await expect(provider.observe([record])).resolves.toEqual({
    observations: [
      {
        provider: "codeberg",
        sourceId: "codeberg-1699613",
        repository: expect.objectContaining({
          id: 1699613,
          owner: "targren",
          name: "Lumiverse-SwipeScrubber",
          defaultBranch: "master",
          headSha: "111978ba6fcbc5236c060be2b2ad7484833145b9",
          archived: false,
          sizeKb: 409,
        }),
        community: {
          starsCount: 0,
          forksCount: 0,
          watchersCount: 1,
        },
        latestReleaseAt: null,
        coarseLicenseSpdxId: null,
      },
    ],
    failures: [],
    usage: expect.objectContaining({ requestCount: expect.any(Number) }),
  });
});

test("feeds Codeberg commit details into meaningful activity inspection", async () => {
  const commits = await fixture("commits");
  const detail = await fixture("commit-detail");
  const contents = await fixture("root-contents");
  const request = vi.fn(async (path: string) => {
    if (path.includes("/commits?")) return { data: commits.slice(0, 1) };
    if (path.includes("/git/commits/")) return { data: detail };
    if (path.endsWith("/contents/LICENSE.md?ref=head")) {
      return {
        data: {
          path: "LICENSE.md",
          encoding: "base64",
          content: Buffer.from(
            "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy",
          ).toString("base64"),
        },
      };
    }
    if (path.endsWith("/contents?ref=head")) return { data: contents };
    throw new Error(`Unexpected path: ${path}`);
  });
  const provider = new CodebergRepositoryProvider({ request });

  const inspected = await provider.inspectActivity({
    repository: record.repository,
    expectedHeadSha: "head",
    now: "2026-07-27T00:00:00.000Z",
    activity: activity(),
    scan: null,
  });

  expect(inspected.complete).toBe(true);
  expect(inspected.activity.latest_source_activity_at).toBe(
    "2026-07-21T14:45:42.000Z",
  );
  expect(inspected.license).toMatchObject({
    status: "osi-approved",
    spdxId: "MIT",
  });
});

test("collects only linked Codeberg contributor accounts", async () => {
  const commits = await fixture("commits");
  const pulls = await fixture("pulls");
  const user = await fixture("user");
  const request = vi.fn(async (path: string) => {
    if (path.includes("/commits?")) return { data: commits };
    if (path.includes("/pulls?")) return { data: pulls };
    if (path === "/users/targren") return { data: user };
    throw new Error(`Unexpected path: ${path}`);
  });
  const provider = new CodebergRepositoryProvider({ request });

  const result = await provider.collectContributors(
    {
      id: 1699613,
      owner: "targren",
      name: "Lumiverse-SwipeScrubber",
      url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
      description: null,
      defaultBranch: "master",
      headSha: "head",
      headCommittedAt: null,
      archived: false,
      fork: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      sizeKb: 409,
    },
    { now: "2026-07-27T00:00:00.000Z", previous: null },
  );

  expect(result).toMatchObject({
    accounts: [{ provider: "codeberg", login: "targren", type: "User" }],
    method: "commit-and-merged-pull-request-authors",
  });
  expect(JSON.stringify(result)).not.toContain("Unlinked Author");
  expect(JSON.stringify(result)).not.toContain("private@example.test");
});
