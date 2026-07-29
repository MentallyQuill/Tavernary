import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import {
  buildTagCandidateReport,
  createTaxonomyDiscoveryProvider,
  discoverTagTaxonomy,
  loadTaxonomyCorpus,
  runTagTaxonomyDiscoveryCli,
  writeTagCandidateReport,
} from "../../scripts/catalog/discover-tag-taxonomy.mjs";

const observations = [
  {
    projectId: "memory-extension",
    kind: "extension" as const,
    candidates: [
      {
        phrase: "Long-term memory",
        canonicalPhrase: "Persistent memory",
        facet: "goal" as const,
        aliases: ["Memory books"],
        evidence: ["readme:42-55"],
      },
    ],
  },
  {
    projectId: "memory-preset",
    kind: "preset" as const,
    candidates: [
      {
        phrase: "Persistent memory",
        canonicalPhrase: "Persistent memory",
        facet: "goal" as const,
        aliases: ["Context retention"],
        evidence: ["readme:12-18"],
      },
    ],
  },
  {
    projectId: "local-frontend",
    kind: "frontend" as const,
    candidates: [
      {
        phrase: "Local first",
        canonicalPhrase: "Local-first",
        facet: "trait" as const,
        aliases: ["Offline friendly"],
        evidence: ["readme:3-7"],
      },
    ],
  },
];

test("normalizes repeated candidate concepts into a deterministic report", () => {
  expect(buildTagCandidateReport([...observations].reverse())).toEqual({
    schema_version: 1,
    project_count: 3,
    candidates: [
      {
        id: "persistent-memory",
        label: "Persistent memory",
        facet: "goal",
        frequency: 2,
        applicable_kinds: ["extension", "preset"],
        representative_projects: [
          {
            project_id: "memory-extension",
            evidence: ["readme:42-55"],
          },
          {
            project_id: "memory-preset",
            evidence: ["readme:12-18"],
          },
        ],
        aliases: ["Context retention", "Long-term memory", "Memory books"],
        warnings: [
          "Merged candidate phrases: Long-term memory | Persistent memory",
        ],
      },
      {
        id: "local-first",
        label: "Local-first",
        facet: "trait",
        frequency: 1,
        applicable_kinds: ["frontend"],
        representative_projects: [
          {
            project_id: "local-frontend",
            evidence: ["readme:3-7"],
          },
        ],
        aliases: ["Local first", "Offline friendly"],
        warnings: [],
      },
    ],
  });
});

test("flags the same normalized concept proposed in both facets", () => {
  const report = buildTagCandidateReport([
    ...observations,
    {
      projectId: "memory-trait",
      kind: "extension" as const,
      candidates: [
        {
          phrase: "Persistent-memory",
          canonicalPhrase: "Persistent memory",
          facet: "trait" as const,
          aliases: [],
          evidence: ["readme:9"],
        },
      ],
    },
  ]);

  expect(
    report.candidates
      .filter(({ id }) => id === "persistent-memory")
      .map(({ facet, warnings }) => ({ facet, warnings })),
  ).toEqual([
    {
      facet: "goal",
      warnings: expect.arrayContaining([
        "Candidate ID also appears as trait; review whether to merge or split.",
      ]),
    },
    {
      facet: "trait",
      warnings: [
        "Candidate ID also appears as goal; review whether to merge or split.",
      ],
    },
  ]);
});

test("discovers cards in bounded batches while sharing source evidence", async () => {
  const batches: unknown[] = [];
  const cards = [
    {
      id: "memory-extension",
      source_id: "github-42",
      name: "Memory Extension",
      kind: "extension" as const,
    },
    {
      id: "memory-preset",
      source_id: "github-42",
      name: "Memory Preset",
      kind: "preset" as const,
    },
    {
      id: "local-frontend",
      source_id: "codeberg-9",
      name: "Local Frontend",
      kind: "frontend" as const,
    },
  ];
  const evidenceBySource = new Map([
    [
      "github-42",
      {
        readme: "# Shared memory README",
        repositoryDescription: "Memory tools.",
      },
    ],
    [
      "codeberg-9",
      {
        readme: "# Local frontend README",
        repositoryDescription: null,
      },
    ],
  ]);

  const report = await discoverTagTaxonomy({
    cards,
    evidenceBySource,
    batchSize: 2,
    provider: {
      async discover(input) {
        batches.push(input);
        return input.projects.map((project) => ({
          projectId: project.id,
          kind: project.kind,
          candidates:
            project.id === "local-frontend"
              ? [observations[2].candidates[0]]
              : [observations[0].candidates[0]],
        }));
      },
    },
  });

  expect(batches).toHaveLength(2);
  expect(batches[0]).toMatchObject({
    sources: [
      {
        sourceId: "codeberg-9",
        readme: "# Local frontend README",
      },
      {
        sourceId: "github-42",
        readme: "# Shared memory README",
      },
    ],
  });
  expect(report.project_count).toBe(3);
  expect(
    report.candidates.find(({ id }) => id === "persistent-memory")?.frequency,
  ).toBe(2);
});

test("writes only the ignored candidate report and never the tracked vocabulary", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-taxonomy-"));
  const vocabularyPath = resolve(root, "tags.json");
  const outputPath = resolve(root, "local-data", "tag-candidates.json");
  const trackedVocabulary = '{ "schema_version": 1, "tags": [] }\n';

  try {
    await writeFile(vocabularyPath, trackedVocabulary);
    const report = buildTagCandidateReport(observations);
    await writeTagCandidateReport(report, outputPath);

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report);
    expect(await readFile(vocabularyPath, "utf8")).toBe(trackedVocabulary);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requests bounded structured goal and trait candidates from the provider", async () => {
  const requests: unknown[] = [];
  const provider = createTaxonomyDiscoveryProvider({
    apiUrl: "https://provider.test/v1/chat/completions",
    apiKey: "secret",
    model: "taxonomy-model",
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          model: "taxonomy-model",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  projects: [
                    {
                      project_id: "memory-extension",
                      candidates: [
                        {
                          phrase: "Long-term memory",
                          canonical_phrase: "Persistent memory",
                          facet: "goal",
                          aliases: ["Memory books"],
                          evidence: ["README documents durable memory books."],
                        },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });

  const result = await provider.discover({
    sources: [
      {
        sourceId: "github-42",
        readme: "# Memory\nDurable memory books.",
        repositoryDescription: "Secondary description.",
      },
    ],
    projects: [
      {
        id: "memory-extension",
        sourceId: "github-42",
        name: "Memory Extension",
        kind: "extension",
      },
    ],
  });

  expect(result).toEqual([
    {
      ...observations[0],
      candidates: [
        {
          ...observations[0].candidates[0],
          evidence: ["README documents durable memory books."],
        },
      ],
    },
  ]);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    model: "taxonomy-model",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tavernary_tag_taxonomy_discovery",
        strict: true,
        schema: {
          additionalProperties: false,
          properties: {
            projects: {
              maxItems: 1,
              items: {
                properties: {
                  project_id: {
                    enum: ["memory-extension"],
                  },
                  candidates: {
                    maxItems: 12,
                    items: {
                      properties: {
                        facet: { enum: ["goal", "trait"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  expect(
    (requests[0] as { messages: Array<{ content: string }> }).messages[0]
      .content,
  ).toContain("README");
});

test("loads source-deduplicated README evidence from the ignored corpus", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-taxonomy-corpus-"));
  const projectsDirectory = resolve(root, "data/registry/projects");
  const sourcesDirectory = resolve(root, "data/registry/sources");
  const evidenceDirectory = resolve(
    root,
    "local-data/catalog-evidence/github/42",
  );

  try {
    await Promise.all([
      mkdir(projectsDirectory, { recursive: true }),
      mkdir(sourcesDirectory, { recursive: true }),
      mkdir(evidenceDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        resolve(projectsDirectory, "memory-extension.json"),
        JSON.stringify({
          id: "memory-extension",
          name: "Memory Extension",
          kind: "extension",
          source_id: "github-42",
        }),
      ),
      writeFile(
        resolve(projectsDirectory, "memory-preset.json"),
        JSON.stringify({
          id: "memory-preset",
          name: "Memory Preset",
          kind: "preset",
          source_id: "github-42",
        }),
      ),
      writeFile(
        resolve(sourcesDirectory, "github-42.json"),
        JSON.stringify({
          id: "github-42",
          type: "github",
          repository_id: 42,
          repository: "owner/repository",
        }),
      ),
      writeFile(
        resolve(evidenceDirectory, "README.md"),
        "# Shared memory README\n",
      ),
      writeFile(
        resolve(evidenceDirectory, "source.json"),
        JSON.stringify({
          source_id: "github-42",
          provider: "github",
          repository_id: 42,
          readme_filename: "README.md",
          repository_description: "Memory tools.",
          outcome: "fetched",
        }),
      ),
    ]);

    const corpus = await loadTaxonomyCorpus({ repositoryRoot: root });

    expect(corpus.cards).toHaveLength(2);
    expect(corpus.evidenceBySource).toEqual(
      new Map([
        [
          "github-42",
          {
            readme: "# Shared memory README\n",
            repositoryDescription: "Memory tools.",
          },
        ],
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses discovery when repository evidence has not been cached", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-taxonomy-corpus-"));
  const projectsDirectory = resolve(root, "data/registry/projects");
  const sourcesDirectory = resolve(root, "data/registry/sources");

  try {
    await Promise.all([
      mkdir(projectsDirectory, { recursive: true }),
      mkdir(sourcesDirectory, { recursive: true }),
    ]);
    await writeFile(
      resolve(projectsDirectory, "memory-extension.json"),
      JSON.stringify({
        id: "memory-extension",
        name: "Memory Extension",
        kind: "extension",
        source_id: "github-42",
      }),
    );
    await writeFile(
      resolve(sourcesDirectory, "github-42.json"),
      JSON.stringify({
        id: "github-42",
        type: "github",
        repository_id: 42,
        repository: "owner/repository",
      }),
    );

    await expect(loadTaxonomyCorpus({ repositoryRoot: root })).rejects.toThrow(
      "Missing cached evidence for github-42; run catalog:evidence:refresh",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runs full-corpus discovery and writes the local candidate report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-taxonomy-cli-"));
  const outputPath = resolve(root, "tag-candidates.json");
  const logs: string[] = [];

  try {
    const report = await runTagTaxonomyDiscoveryCli(["--batch-size", "2"], {
      repositoryRoot: root,
      outputPath,
      corpus: {
        cards: [
          {
            id: "memory-extension",
            name: "Memory Extension",
            kind: "extension",
            source_id: "github-42",
          },
        ],
        evidenceBySource: new Map([
          [
            "github-42",
            {
              readme: "# Memory",
              repositoryDescription: null,
            },
          ],
        ]),
      },
      provider: {
        async discover() {
          return [observations[0]];
        },
      },
      logger: {
        log(message: string) {
          logs.push(message);
        },
      },
    });

    expect(report.project_count).toBe(1);
    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(report);
    expect(logs).toEqual([
      JSON.stringify({
        projects: 1,
        candidates: 1,
        output: outputPath,
      }),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
