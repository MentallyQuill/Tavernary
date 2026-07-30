import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

const githubSource = {
  id: "github-1001051404",
  type: "github",
  repository: "aikohanasaki/SillyTavern-MemoryBooks",
  repository_id: 1001051404,
} as const;

test("stores repository evidence once by immutable source identity", async () => {
  const { evidenceDirectory } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = resolve("local-data/catalog-evidence");

  expect(evidenceDirectory(root, githubSource)).toBe(
    resolve(root, "github", "1001051404"),
  );
  expect(() =>
    evidenceDirectory(root, {
      ...githubSource,
      repository_id: "../outside",
    } as unknown as typeof githubSource),
  ).toThrow("Evidence requires a GitHub or Codeberg repository source");
});

test("preserves raw README bytes and records source metadata", async () => {
  const { refreshCatalogEvidence } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));
  const readmeBytes = Buffer.from("# Raw README\n", "utf8");

  try {
    const report = await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch() {
          return {
            status: "fetched",
            readmeFilename: "README.md",
            readmeBytes,
            readmePath: "README.md",
            downloadUrl:
              "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/abc/README.md",
            repositoryDescription: "Structured memory extension.",
            defaultBranch: "main",
            commitSha: "a".repeat(40),
            etag: '"readme-etag"',
          };
        },
      },
      clock: () => "2026-07-29T21:00:00.000Z",
    });
    const directory = resolve(root, "github", "1001051404");

    expect(await readFile(resolve(directory, "README.md"))).toEqual(
      readmeBytes,
    );
    expect(
      JSON.parse(await readFile(resolve(directory, "source.json"), "utf8")),
    ).toEqual({
      schema_version: 1,
      provider: "github",
      source_id: "github-1001051404",
      repository_id: 1001051404,
      repository: "aikohanasaki/SillyTavern-MemoryBooks",
      default_branch: "main",
      readme_path: "README.md",
      readme_filename: "README.md",
      download_url:
        "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/abc/README.md",
      commit_sha: "a".repeat(40),
      etag: '"readme-etag"',
      content_sha256:
        "0481f890dc7503a559e2999fcd88ca5087a6e6112fd29373336691f40d06876d",
      repository_description: "Structured memory extension.",
      fetched_at: "2026-07-29T21:00:00.000Z",
      outcome: "fetched",
    });
    expect(report).toMatchObject({ fetched: 1, failed: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps README bytes and refreshes repository metadata when content is unchanged", async () => {
  const { refreshCatalogEvidence } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));
  const readmeBytes = Buffer.from("# Stable README\n", "utf8");
  const fetched = {
    status: "fetched" as const,
    readmeFilename: "README.md",
    readmeBytes,
    readmePath: "README.md",
    downloadUrl:
      "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/abc/README.md",
    repositoryDescription: "Structured memory extension.",
    defaultBranch: "main",
    commitSha: "b".repeat(40),
    etag: '"stable-etag"',
  };

  try {
    await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch() {
          return fetched;
        },
      },
      clock: () => "2026-07-29T21:00:00.000Z",
    });
    const before = await readFile(
      resolve(root, "github", "1001051404", "README.md"),
    );
    let request: { etag: string | null; commitSha: string | null } | undefined;

    const report = await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch(input) {
          request = input;
          return {
            status: "unchanged",
            checkedAt: "2026-07-29T22:00:00.000Z",
            repositoryDescription: "Updated repository description.",
            defaultBranch: "stable",
            commitSha: "b".repeat(40),
          };
        },
      },
    });
    const directory = resolve(root, "github", "1001051404");
    const metadata = JSON.parse(
      await readFile(resolve(directory, "source.json"), "utf8"),
    );

    expect(request).toMatchObject({
      etag: '"stable-etag"',
      commitSha: "b".repeat(40),
    });
    expect(await readFile(resolve(directory, "README.md"))).toEqual(before);
    expect(metadata).toMatchObject({
      default_branch: "stable",
      commit_sha: "b".repeat(40),
      repository_description: "Updated repository description.",
      fetched_at: "2026-07-29T21:00:00.000Z",
      checked_at: "2026-07-29T22:00:00.000Z",
      outcome: "unchanged",
    });
    expect(report).toMatchObject({
      fetched: 0,
      unchanged: 1,
      missing: 0,
      failed: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps the last valid corpus entry when refresh fails", async () => {
  const { refreshCatalogEvidence } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));
  const previousBytes = Buffer.from("# Last valid README\n", "utf8");
  const fetched = {
    status: "fetched" as const,
    readmeFilename: "README.md",
    readmeBytes: previousBytes,
    readmePath: "README.md",
    downloadUrl:
      "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/abc/README.md",
    repositoryDescription: "Structured memory extension.",
    defaultBranch: "main",
    commitSha: "c".repeat(40),
    etag: '"previous-etag"',
  };

  try {
    await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch() {
          return fetched;
        },
      },
      clock: () => "2026-07-29T21:00:00.000Z",
    });
    const directory = resolve(root, "github", "1001051404");
    const previousMetadata = await readFile(
      resolve(directory, "source.json"),
      "utf8",
    );

    const report = await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch() {
          throw new Error("GitHub unavailable");
        },
      },
    });

    expect(report).toMatchObject({
      fetched: 0,
      unchanged: 0,
      missing: 0,
      failed: 1,
      entries: [
        {
          sourceId: "github-1001051404",
          status: "failed",
          message: "GitHub unavailable",
        },
      ],
    });
    expect(await readFile(resolve(directory, "README.md"))).toEqual(
      previousBytes,
    );
    expect(await readFile(resolve(directory, "source.json"), "utf8")).toBe(
      previousMetadata,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomically replaces a previously fetched corpus entry", async () => {
  const { refreshCatalogEvidence } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));

  try {
    for (const revision of [
      {
        readmeBytes: Buffer.from("# First README\n", "utf8"),
        commitSha: "d".repeat(40),
        etag: '"first-etag"',
        fetchedAt: "2026-07-29T21:00:00.000Z",
      },
      {
        readmeBytes: Buffer.from("# Updated README\n", "utf8"),
        commitSha: "e".repeat(40),
        etag: '"updated-etag"',
        fetchedAt: "2026-07-29T22:00:00.000Z",
      },
    ]) {
      const report = await refreshCatalogEvidence({
        root,
        sources: [githubSource],
        adapter: {
          async fetch() {
            return {
              status: "fetched",
              readmeFilename: "README.md",
              readmeBytes: revision.readmeBytes,
              readmePath: "README.md",
              downloadUrl:
                "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/abc/README.md",
              repositoryDescription: "Structured memory extension.",
              defaultBranch: "main",
              commitSha: revision.commitSha,
              etag: revision.etag,
            };
          },
        },
        clock: () => revision.fetchedAt,
      });
      expect(report.failed).toBe(0);
    }

    const directory = resolve(root, "github", "1001051404");
    expect(await readFile(resolve(directory, "README.md"))).toEqual(
      Buffer.from("# Updated README\n", "utf8"),
    );
    expect(
      JSON.parse(await readFile(resolve(directory, "source.json"), "utf8")),
    ).toMatchObject({
      commit_sha: "e".repeat(40),
      etag: '"updated-etag"',
      fetched_at: "2026-07-29T22:00:00.000Z",
      outcome: "fetched",
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records a missing root README without treating it as a failed refresh", async () => {
  const { refreshCatalogEvidence } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));

  try {
    const report = await refreshCatalogEvidence({
      root,
      sources: [githubSource],
      adapter: {
        async fetch() {
          return {
            status: "missing",
            repositoryDescription: "Repository description only.",
            defaultBranch: "stable",
            commitSha: "d".repeat(40),
          };
        },
      },
      clock: () => "2026-07-29T23:00:00.000Z",
    });
    const directory = resolve(root, "github", "1001051404");

    expect(
      JSON.parse(await readFile(resolve(directory, "source.json"), "utf8")),
    ).toEqual({
      schema_version: 1,
      provider: "github",
      source_id: "github-1001051404",
      repository_id: 1001051404,
      repository: "aikohanasaki/SillyTavern-MemoryBooks",
      default_branch: "stable",
      readme_path: null,
      readme_filename: null,
      download_url: null,
      commit_sha: "d".repeat(40),
      etag: null,
      content_sha256: null,
      repository_description: "Repository description only.",
      fetched_at: "2026-07-29T23:00:00.000Z",
      outcome: "missing",
    });
    expect(report).toMatchObject({
      fetched: 0,
      unchanged: 0,
      missing: 1,
      failed: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses explicit full, source, and project refresh selectors", async () => {
  const { parseEvidenceArguments } =
    await import("../../scripts/catalog/catalog-evidence.mjs");

  expect(parseEvidenceArguments(["--all"])).toEqual({
    all: true,
    sourceIds: [],
    projectIds: [],
  });
  expect(
    parseEvidenceArguments([
      "--source",
      "github-1001051404",
      "--project",
      "memory-books",
      "--source",
      "codeberg-42",
    ]),
  ).toEqual({
    all: false,
    sourceIds: ["github-1001051404", "codeberg-42"],
    projectIds: ["memory-books"],
  });
  expect(() => parseEvidenceArguments([])).toThrow(
    "Choose --all, --source <id>, or --project <id>",
  );
  expect(() =>
    parseEvidenceArguments(["--all", "--source", "github-1001051404"]),
  ).toThrow("--all cannot be combined");
  expect(() => parseEvidenceArguments(["--unknown"])).toThrow(
    "Unknown argument: --unknown",
  );
});

test("resolves project selections through sources and deduplicates siblings", async () => {
  const { selectEvidenceSources } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const codebergSource = {
    id: "codeberg-42",
    type: "codeberg",
    repository: "owner/tool",
    repository_id: 42,
  } as const;
  const urlSource = {
    id: "url-project-page",
    type: "url",
    url: "https://example.com/project",
  } as const;
  const sources = [githubSource, codebergSource, urlSource];
  const projects = [
    { id: "memory-books", source_id: githubSource.id },
    { id: "memory-books-preset", source_id: githubSource.id },
    { id: "tool", source_id: codebergSource.id },
    { id: "project-page", source_id: urlSource.id },
  ];

  expect(
    selectEvidenceSources({
      sources,
      projects,
      selection: {
        all: false,
        sourceIds: [githubSource.id],
        projectIds: ["memory-books-preset", "tool"],
      },
    }),
  ).toEqual([githubSource, codebergSource]);
  expect(
    selectEvidenceSources({
      sources,
      projects,
      selection: { all: true, sourceIds: [], projectIds: [] },
    }),
  ).toEqual([githubSource, codebergSource]);
  expect(() =>
    selectEvidenceSources({
      sources,
      projects,
      selection: {
        all: false,
        sourceIds: [],
        projectIds: ["project-page"],
      },
    }),
  ).toThrow("Project project-page has no repository evidence source");
  expect(() =>
    selectEvidenceSources({
      sources,
      projects,
      selection: {
        all: false,
        sourceIds: ["github-missing"],
        projectIds: [],
      },
    }),
  ).toThrow("Unknown source: github-missing");
});

test("retains but never refreshes evidence for a delisted source", async () => {
  const { selectEvidenceSources } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const activeSource = { ...githubSource, status: "active" as const };
  const delistedSource = {
    ...githubSource,
    id: "github-99",
    repository: "owner/removed",
    repository_id: 99,
    status: "delisted" as const,
  };
  const sources = [activeSource, delistedSource];
  const projects = [
    { id: "active-card", source_id: activeSource.id },
    { id: "removed-card", source_id: delistedSource.id },
  ];

  expect(
    selectEvidenceSources({
      sources,
      projects,
      selection: { all: true, sourceIds: [], projectIds: [] },
    }),
  ).toEqual([activeSource]);
  expect(() =>
    selectEvidenceSources({
      sources,
      projects,
      selection: {
        all: false,
        sourceIds: [delistedSource.id],
        projectIds: [],
      },
    }),
  ).toThrow(`Source ${delistedSource.id} is permanently delisted`);
  expect(() =>
    selectEvidenceSources({
      sources,
      projects,
      selection: {
        all: false,
        sourceIds: [],
        projectIds: ["removed-card"],
      },
    }),
  ).toThrow("Project removed-card uses a permanently delisted source");
});

test("fetches GitHub README bytes through the CLI adapter and skips an unchanged head", async () => {
  const { createEvidenceAdapter } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const calls: string[] = [];
  const headSha = "f".repeat(40);
  const readmeBytes = Buffer.from("# Adapter README\n", "utf8");
  let repositoryDescription = "Structured memory extension.";
  const githubApi = async (endpoint: string) => {
    calls.push(endpoint);
    if (endpoint === "repos/aikohanasaki/SillyTavern-MemoryBooks") {
      return {
        id: 1001051404,
        default_branch: "main",
        description: repositoryDescription,
      };
    }
    if (
      endpoint === "repos/aikohanasaki/SillyTavern-MemoryBooks/commits/main"
    ) {
      return { sha: headSha };
    }
    if (
      endpoint ===
      `repos/aikohanasaki/SillyTavern-MemoryBooks/readme?ref=${headSha}`
    ) {
      return {
        name: "README.md",
        path: "README.md",
        download_url:
          "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/main/README.md",
        sha: "readme-blob",
        encoding: "base64",
        content: readmeBytes.toString("base64"),
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };
  const adapter = createEvidenceAdapter({
    githubApi,
    clock: () => "2026-07-30T00:00:00.000Z",
  });

  await expect(
    adapter.fetch({ source: githubSource, etag: null, commitSha: null }),
  ).resolves.toEqual({
    status: "fetched",
    readmeFilename: "README.md",
    readmeBytes,
    readmePath: "README.md",
    downloadUrl:
      "https://raw.githubusercontent.com/aikohanasaki/SillyTavern-MemoryBooks/main/README.md",
    repositoryDescription: "Structured memory extension.",
    defaultBranch: "main",
    commitSha: headSha,
    etag: "blob:readme-blob",
  });

  calls.length = 0;
  repositoryDescription = "Updated repository description.";
  await expect(
    adapter.fetch({
      source: githubSource,
      etag: "blob:readme-blob",
      commitSha: headSha,
    }),
  ).resolves.toEqual({
    status: "unchanged",
    checkedAt: "2026-07-30T00:00:00.000Z",
    repositoryDescription: "Updated repository description.",
    defaultBranch: "main",
    commitSha: headSha,
  });
  expect(calls).toEqual([
    "repos/aikohanasaki/SillyTavern-MemoryBooks",
    "repos/aikohanasaki/SillyTavern-MemoryBooks/commits/main",
  ]);
});

test("fetches Codeberg README bytes and records a missing root README", async () => {
  const { createEvidenceAdapter } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const source = {
    id: "codeberg-42",
    type: "codeberg" as const,
    repository: "owner/tool",
    repository_id: 42,
  };
  const headSha = "1".repeat(40);
  const readmeBytes = Buffer.from("# Codeberg README\n", "utf8");
  let hasReadme = true;
  const codebergApi = async (endpoint: string) => {
    if (endpoint === "repos/owner/tool") {
      return {
        id: 42,
        default_branch: "main",
        description: "A Codeberg project.",
      };
    }
    if (endpoint === "repos/owner/tool/commits?sha=main&page=1&limit=1") {
      return [{ sha: headSha }];
    }
    if (endpoint === `repos/owner/tool/contents?ref=${headSha}`) {
      return hasReadme
        ? [{ type: "file", name: "README.rst", path: "README.rst" }]
        : [];
    }
    if (endpoint === `repos/owner/tool/contents/README.rst?ref=${headSha}`) {
      return {
        name: "README.rst",
        path: "README.rst",
        download_url:
          "https://codeberg.org/owner/tool/raw/commit/abc/README.rst",
        sha: "codeberg-blob",
        encoding: "base64",
        content: readmeBytes.toString("base64"),
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };
  const adapter = createEvidenceAdapter({ codebergApi });

  await expect(
    adapter.fetch({ source, etag: null, commitSha: null }),
  ).resolves.toMatchObject({
    status: "fetched",
    readmeFilename: "README.rst",
    readmeBytes,
    commitSha: headSha,
    etag: "blob:codeberg-blob",
  });

  hasReadme = false;
  await expect(
    adapter.fetch({ source, etag: null, commitSha: null }),
  ).resolves.toEqual({
    status: "missing",
    repositoryDescription: "A Codeberg project.",
    defaultBranch: "main",
    commitSha: headSha,
  });
});

test("runs a project-targeted CLI refresh through the source registry", async () => {
  const { runCatalogEvidenceCli } =
    await import("../../scripts/catalog/catalog-evidence.mjs");
  const root = await mkdtemp(join(tmpdir(), "tavernary-evidence-"));
  const fetchedSourceIds: string[] = [];
  const messages: string[] = [];

  try {
    const report = await runCatalogEvidenceCli(
      ["--project", "memory-books-preset"],
      {
        root,
        registryContext: {
          sources: [githubSource],
          projects: [
            { id: "memory-books", source_id: githubSource.id },
            { id: "memory-books-preset", source_id: githubSource.id },
          ],
        },
        adapter: {
          async fetch({ source }) {
            fetchedSourceIds.push(source.id);
            return {
              status: "missing",
              repositoryDescription: "Description only.",
              defaultBranch: "main",
              commitSha: "e".repeat(40),
            };
          },
        },
        clock: () => "2026-07-30T01:00:00.000Z",
        logger: {
          log(message) {
            messages.push(message);
          },
        },
      },
    );

    expect(fetchedSourceIds).toEqual(["github-1001051404"]);
    expect(report).toMatchObject({ missing: 1, failed: 0 });
    expect(JSON.parse(messages[0])).toMatchObject({
      selected: 1,
      missing: 1,
      failed: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
