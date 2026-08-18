import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as core from "@tavernary/catalog-core";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const behaviorFixturePath = resolve(
  packageRoot,
  "fixtures/catalog-core-behavior-v1.json",
);

function searchFields(title: string, summary = ""): core.CatalogSearchFields {
  return {
    title: [title],
    aliases: [],
    source: [],
    summary: [summary],
    kind: [],
    primaryFunction: [],
    tags: [],
    frontends: [],
    compatibility: [],
    maintainers: [],
    relationships: [],
  };
}

function project(id: "alpha" | "beta" | "gamma"): core.CatalogProject {
  const properties = {
    alpha: {
      kind: "extension" as const,
      frontend: "sillytavern",
      latestSourceActivityAt: "2026-08-10T00:00:00.000Z",
      dormant: false,
      license: "osi-approved" as const,
      search: searchFields("Memory Tool"),
    },
    beta: {
      kind: "preset" as const,
      frontend: "sillytavern",
      latestSourceActivityAt: "2025-01-01T00:00:00.000Z",
      dormant: true,
      license: "proprietary" as const,
      search: searchFields("World Builder"),
    },
    gamma: {
      kind: "extension" as const,
      frontend: "risuai",
      latestSourceActivityAt: "2026-08-17T00:00:00.000Z",
      dormant: false,
      license: "missing" as const,
      search: searchFields("Gamma", "Memory and world utilities"),
    },
  }[id];
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    kind: properties.kind,
    metadataStatus: "curated",
    sourceStatus: "healthy",
    primaryFunction: "interface-workflow",
    summary: properties.search.summary[0],
    canonicalUrl: `https://example.com/${id}`,
    catalogedAt: `2026-01-0${id === "alpha" ? 1 : id === "beta" ? 2 : 3}T00:00:00.000Z`,
    catalogCohort: "standard",
    frontends: [
      {
        id: properties.frontend,
        label: properties.frontend,
        description: properties.frontend,
      },
    ],
    tags: [],
    search: properties.search,
    tavernKeeper: null,
    fork: null,
    attribution: null,
    activity: {
      latestSourceActivityAt: properties.latestSourceActivityAt,
      activeWeeks12: 1,
      weeklyActivity: null,
      evidenceStatus: "complete",
      dormant: properties.dormant,
    },
    latestReleaseAt: null,
    community: null,
    repositorySizeKb: null,
    license: {
      status: properties.license,
      label: properties.license,
      tooltip: properties.license,
    },
    preset: null,
    refreshedAt: "2026-08-18T00:00:00.000Z",
    staleSince: null,
    install: null,
  };
}

function kit(
  id: "kit-alpha" | "kit-beta",
  projects: Map<string, core.CatalogProject>,
): core.CatalogKit {
  const alpha = id === "kit-alpha";
  const projectIds = alpha
    ? ["alpha", "beta", "alpha"]
    : ["gamma", "beta", "gamma", "beta"];
  return {
    id,
    title: alpha ? "Alpha Kit" : "Beta Kit",
    description: alpha ? "Memory kit" : "World kit",
    author: { githubUserId: alpha ? 1 : 2, login: alpha ? "alpha" : "beta" },
    sourceIssueNumber: alpha ? 1 : 2,
    sourceIssueUrl: `https://example.com/${id}`,
    publishedAt: alpha
      ? "2026-01-01T00:00:00.000Z"
      : "2026-02-01T00:00:00.000Z",
    updatedAt: alpha ? "2026-08-01T00:00:00.000Z" : "2026-08-02T00:00:00.000Z",
    frontends: [
      {
        id: alpha ? "sillytavern" : "risuai",
        label: alpha ? "SillyTavern" : "RisuAI",
        description: "Frontend",
      },
    ],
    purposes: [
      {
        id: alpha ? "memory-retrieval" : "character-worldbuilding",
        label: alpha ? "Memory" : "Worldbuilding",
        description: "Purpose",
      },
    ],
    modelFamilies: [],
    components: projectIds.map((projectId) => ({
      projectId,
      name: projectId,
      kind: projects.get(projectId)?.kind ?? "extension",
      primaryFunction: "interface-workflow",
      availability: alpha ? "available" : "flagged",
      unavailableReason: alpha ? null : "Fixture",
      canonicalUrl: projects.get(projectId)?.canonicalUrl ?? null,
      project: projects.get(projectId) ?? null,
    })),
    supporterCount: 0,
    trendingScore: alpha ? 2 : 1,
    supportRefreshedAt: null,
    supportStale: false,
    flaggedProjectCount: alpha ? 0 : 1,
    search: searchFields(alpha ? "Alpha Kit" : "Beta Kit"),
  };
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(path) : [path];
      }),
    )
  ).flat();
}

describe("CatalogCore contract", () => {
  it("exports the complete headless contract", () => {
    expect(Object.keys(core).sort()).toEqual(
      expect.arrayContaining([
        "createCatalogSearchIndex",
        "deriveTavernKeeperCardStatus",
        "parseCatalogQuery",
        "parseCatalogV7",
        "selectKits",
        "selectProjects",
        "serializeCatalogQuery",
      ]),
    );
  });

  it("has no framework, host, or filesystem dependency", async () => {
    const files = (await sourceFiles(resolve(packageRoot, "src"))).filter(
      (path) => path.endsWith(".ts"),
    );
    const source = (
      await Promise.all(files.map((path) => readFile(path, "utf8")))
    ).join("\n");

    expect(source).not.toMatch(
      /(?:from\s+["'](?:react|next\/|node:fs)|\b(?:window|document)\.(?:addEventListener|body|createElement|getElementById|querySelector)|["']@\/)/u,
    );
  });

  it("executes every shared behavior fixture", async () => {
    const fixtures = JSON.parse(
      await readFile(behaviorFixturePath, "utf8"),
    ) as {
      queryCases: Array<{
        input: string;
        expectedSearch: string;
        expectedFrontends: string[];
        expectedKinds: core.CatalogKind[];
      }>;
      searchCases: Array<{ query: string; expectedIds: string[] }>;
      projectCases: Array<{
        input: string;
        scores?: Record<string, number>;
        expectedIds: string[];
      }>;
      kitCases: Array<{ input: string; expectedIds: string[] }>;
      tavernKeeper: { expectedState: string; expectedFreshness: string };
    };

    for (const fixture of fixtures.queryCases) {
      const query = core.parseCatalogQuery(fixture.input);
      expect(query.search).toBe(fixture.expectedSearch);
      expect(query.frontends).toEqual(fixture.expectedFrontends);
      expect(query.kinds).toEqual(fixture.expectedKinds);
      expect(
        core.parseCatalogQuery(core.serializeCatalogQuery(query)).search,
      ).toBe(fixture.expectedSearch);
    }

    const documents: core.CatalogSearchDocument[] = [
      { id: "alpha", ...searchFields("Memory Tool") },
      { id: "beta", ...searchFields("World Builder") },
      {
        id: "gamma",
        ...searchFields("Gamma", "Memory and world utilities"),
      },
    ];
    const index = core.createCatalogSearchIndex(documents);
    for (const fixture of fixtures.searchCases) {
      expect(index.search(fixture.query).matches.map(({ id }) => id)).toEqual(
        fixture.expectedIds,
      );
    }

    const projects = [project("gamma"), project("beta"), project("alpha")];
    const projectsById = new Map(projects.map((item) => [item.id, item]));
    for (const fixture of fixtures.projectCases) {
      const query = core.parseCatalogQuery(fixture.input);
      const normalizedQuery = core.searchMeaning(query.search);
      const searchResults = fixture.scores
        ? {
            normalizedQuery,
            matches: Object.entries(fixture.scores).map(([id, score]) => ({
              id,
              score,
              evidence: [],
            })),
            correction: null,
            degraded: false,
          }
        : undefined;
      expect(
        core
          .selectProjects(
            [...projects],
            query,
            { now: "2026-08-18T00:00:00.000Z" },
            searchResults,
          )
          .map(({ id }) => id),
      ).toEqual(fixture.expectedIds);
    }

    const kits = [
      kit("kit-beta", projectsById),
      kit("kit-alpha", projectsById),
    ];
    for (const fixture of fixtures.kitCases) {
      const query = core.parseCatalogQuery(fixture.input);
      expect(
        core
          .selectKits([...kits], query.kits, query.search)
          .map(({ id }) => id),
      ).toEqual(fixture.expectedIds);
    }

    const sha = "a".repeat(40);
    const status = core.deriveTavernKeeperCardStatus({
      source: {
        id: "github-1",
        type: "github",
        status: "active",
        repository: "example/alpha",
        repository_id: 1,
      },
      snapshot: {
        provider: "github",
        source_health: "healthy",
        stale_since: null,
        repository: { id: 1, head_sha: sha },
      },
      preferredReportIds: ["report-1"],
      assessedReports: [
        {
          report_id: "report-1",
          source_id: "github-1",
          provider: "github",
          repository_id: 1,
          repository: "example/alpha",
          target_sha: sha,
          scanner_policy_version:
            core.ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION,
          contextual_review_policy_version: "1",
          completed_at: "2026-08-18T00:00:00.000Z",
          assessed_at: "2026-08-18T00:01:00.000Z",
          synthesis_policy_version: "1",
          synthesis_model: "fixture",
          danger_basis: "none",
          assessment_source: "model",
          report_url: "https://example.com/report",
          assessment: {
            risk_level: "material",
            headline: "Potential concern",
            summary: "Review before installing.",
            minor_cautions: 0,
            material_concerns: 1,
            high_danger: 0,
            malicious_evidence: "",
            cited_finding_ids: ["finding-1"],
            interaction_chains: [],
          },
        },
      ],
    });
    expect(status.state).toBe(fixtures.tavernKeeper.expectedState);
    expect(status.freshness).toBe(fixtures.tavernKeeper.expectedFreshness);
  });
});
