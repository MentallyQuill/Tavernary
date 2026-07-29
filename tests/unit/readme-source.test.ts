import { afterEach, expect, test, vi } from "vitest";

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
  schema_version: 3,
  provider: "github",
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

const codebergRecord = {
  id: "targren-lumiverse-swipescrubber",
  source: {
    type: "codeberg",
    repository: "targren/Lumiverse-SwipeScrubber",
    repository_id: 1699613,
  },
};

const codebergSnapshot = {
  ...healthy,
  schema_version: 3,
  provider: "codeberg",
  project_id: codebergRecord.id,
  repository: {
    ...healthy.repository,
    id: 1699613,
    owner: "targren",
    name: "Lumiverse-SwipeScrubber",
    url: "https://codeberg.org/targren/Lumiverse-SwipeScrubber",
  },
};

const validateSnapshot = (value: unknown) =>
  (value as { schema_version?: number })?.schema_version === 3;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("loads a Codeberg README through the repository provider", async () => {
  const readRootReadme = vi.fn().mockResolvedValue({
    path: "README.md",
    content: Buffer.from("# Swipe Scrubber").toString("base64"),
    encoding: "base64",
  });
  const result = await loadReadmeSource(codebergRecord, codebergSnapshot, {
    validateSnapshot: (value) =>
      (value as { schema_version?: number })?.schema_version === 3,
    providers: {
      codeberg: { readRootReadme },
    },
  });
  expect(readRootReadme).toHaveBeenCalledWith({
    repository: "targren/Lumiverse-SwipeScrubber",
    ref: codebergSnapshot.repository.head_sha,
  });
  expect(result).toMatchObject({
    status: "ready",
    sourceKind: "readme",
    readmePath: "README.md",
  });
});

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

test("prefers usable README content over a repository description", async () => {
  const github = vi.fn(async () => ({
    path: "README.md",
    encoding: "base64",
    content: Buffer.from(
      "# ParamSentinel\n\nDisables unsupported sampler parameters.",
    ).toString("base64"),
  }));
  const source = await loadReadmeSource(record, healthy, {
    validateSnapshot,
    github,
  });

  expect(github).toHaveBeenCalledWith("/repos/Creator/Project/readme", {
    ref: "a".repeat(40),
  });
  expect(source).toMatchObject({
    status: "ready",
    sourceKind: "readme",
    text: "# ParamSentinel\n\nDisables unsupported sampler parameters.",
    repositoryDescription: "A short project description.",
    readmeText: "# ParamSentinel\n\nDisables unsupported sampler parameters.",
    readmePath: "README.md",
    readmeRef: "a".repeat(40),
    readmeIdentity: `github:creator/project@${"a".repeat(40)}:README.md`,
  });
});

test("uses the repository description when README is confirmed missing", async () => {
  await expect(
    loadReadmeSource(record, healthy, {
      validateSnapshot,
      github: async () => null,
    }),
  ).resolves.toMatchObject({
    status: "ready",
    sourceKind: "description",
    text: "A short project description.",
    readmePath: null,
    readmeRef: "a".repeat(40),
  });
});

test("uses the repository description when README content is unusable", async () => {
  await expect(
    loadReadmeSource(record, healthy, {
      validateSnapshot,
      github: async () => ({ encoding: "base64", content: "%" }),
    }),
  ).resolves.toMatchObject({
    status: "ready",
    sourceKind: "description",
    text: "A short project description.",
  });
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
    readmeIdentity: `github:creator/project@${"a".repeat(40)}:docs/README.md`,
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

test("fails closed before a README request when GitHub authentication is unavailable", async () => {
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GH_TOKEN", "");
  const fetchImpl = vi.fn();
  vi.stubGlobal("fetch", fetchImpl);

  await expect(
    loadReadmeSource(record, {
      ...healthy,
      repository: { ...healthy.repository, description: null },
    }),
  ).resolves.toMatchObject({
    status: "failed",
    reasonCode: "readme-authentication-failed",
  });
  expect(fetchImpl).not.toHaveBeenCalled();
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
