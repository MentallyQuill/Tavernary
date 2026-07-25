import { expect, test, vi } from "vitest";

import {
  assessSourceReadiness,
  loadReadmeSource,
} from "../../scripts/catalog/readme-source.mjs";

const record = {
  id: "fixture",
  source: {
    type: "github",
    repository: "Creator/Project",
    repository_id: 42,
  },
};

const healthy = {
  schema_version: 2,
  project_id: "fixture",
  source_health: "healthy",
  stale_since: null,
  repository: {
    id: 42,
    owner: "Creator",
    name: "Project",
    url: "https://github.com/Creator/Project",
    default_branch: "main",
    head_sha: "a".repeat(40),
    head_committed_at: "2026-07-23T12:00:00.000Z",
    description: "A short project description.",
    archived: false,
    created_at: "2026-01-01T00:00:00.000Z",
    size_kb: 10,
  },
};

const validateSnapshot = (value: unknown) =>
  (value as { schema_version?: number })?.schema_version === 2;

test.each([
  ["missing snapshot", undefined, "missing-snapshot", record],
  [
    "invalid schema",
    { ...healthy, schema_version: 1 },
    "invalid-snapshot",
    record,
  ],
  [
    "unhealthy source",
    { ...healthy, source_health: "unavailable" },
    "unhealthy-source",
    record,
  ],
  [
    "stale source",
    { ...healthy, stale_since: "2026-07-24T00:00:00.000Z" },
    "stale-source",
    record,
  ],
  [
    "wrong project",
    { ...healthy, project_id: "other" },
    "project-mismatch",
    record,
  ],
  [
    "wrong repository",
    {
      ...healthy,
      repository: { ...healthy.repository, owner: "Other" },
    },
    "repository-mismatch",
    record,
  ],
  [
    "wrong identity",
    {
      ...healthy,
      repository: { ...healthy.repository, id: 99 },
    },
    "identity-mismatch",
    record,
  ],
  [
    "missing permanent identity",
    healthy,
    "missing-permanent-identity",
    {
      ...record,
      source: { ...record.source, repository_id: null },
    },
  ],
] as const)(
  "%s never becomes a fallback",
  async (_name, snapshot, reasonCode, candidateRecord) => {
    expect(
      assessSourceReadiness(candidateRecord, snapshot, validateSnapshot),
    ).toMatchObject({
      status: "source-not-ready",
      reasonCode,
    });

    await expect(
      loadReadmeSource(candidateRecord, snapshot, {
        validateSnapshot,
        github: vi.fn(),
      }),
    ).resolves.toMatchObject({
      status: "source-not-ready",
      reasonCode,
    });
  },
);

test("prefers a non-empty repository description without fetching README", async () => {
  const github = vi.fn();
  const source = await loadReadmeSource(record, healthy, {
    validateSnapshot,
    github,
  });

  expect(source).toEqual({
    status: "ready",
    sourceKind: "description",
    text: "A short project description.",
    repositoryDescription: "A short project description.",
    readmeText: null,
    readmePath: null,
    readmeRef: null,
    repositoryId: 42,
    headSha: "a".repeat(40),
  });
  expect(github).not.toHaveBeenCalled();
});

test("loads README content at the snapshot head SHA", async () => {
  const github = vi.fn(async () => ({
    path: "docs/README.md",
    encoding: "base64",
    content: Buffer.from("\uFEFF# Project\r\n\r\nUseful tool.\n").toString(
      "base64",
    ),
  }));
  const source = await loadReadmeSource(
    record,
    {
      ...healthy,
      repository: { ...healthy.repository, description: null },
    },
    { validateSnapshot, github },
  );

  expect(github).toHaveBeenCalledWith("/repos/Creator/Project/readme", {
    ref: "a".repeat(40),
  });
  expect(source).toEqual({
    status: "ready",
    sourceKind: "readme",
    text: "# Project\n\nUseful tool.",
    repositoryDescription: null,
    readmeText: "# Project\n\nUseful tool.",
    readmePath: "docs/README.md",
    readmeRef: "a".repeat(40),
    repositoryId: 42,
    headSha: "a".repeat(40),
  });
});

test("uses the exact fallback only for an authenticated README 404", async () => {
  await expect(
    loadReadmeSource(
      record,
      {
        ...healthy,
        repository: { ...healthy.repository, description: null },
      },
      { validateSnapshot, github: async () => null },
    ),
  ).resolves.toEqual({
    status: "fallback",
    sourceKind: "confirmed-fallback",
    repositoryId: 42,
    headSha: "a".repeat(40),
    readmePath: null,
    readmeRef: "a".repeat(40),
  });
});

test.each([
  [
    "rate limiting",
    async () => {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    },
    "readme-rate-limited",
  ],
  [
    "server failure",
    async () => {
      throw Object.assign(new Error("server failed"), { status: 503 });
    },
    "readme-server-error",
  ],
  [
    "malformed payload",
    async () => ({ encoding: "base64", content: "%" }),
    "readme-unusable",
  ],
  [
    "binary payload",
    async () => ({
      encoding: "base64",
      content: Buffer.from([0, 1, 2]).toString("base64"),
    }),
    "readme-unusable",
  ],
  [
    "empty payload",
    async () => ({ encoding: "base64", content: "" }),
    "readme-unusable",
  ],
] as const)("%s remains retryable", async (_name, github, reasonCode) => {
  const source = await loadReadmeSource(
    record,
    {
      ...healthy,
      repository: { ...healthy.repository, description: null },
    },
    { validateSnapshot, github },
  );

  expect(source).toMatchObject({ status: "failed", reasonCode });
  expect(source.status).not.toBe("fallback");
});
