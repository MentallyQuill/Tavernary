import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  verifyHelpStaticRoutes,
  verifyStaticExport,
  verifyTavernKeeperStaticExport,
} from "../../scripts/verify-static-export.mjs";

const homepageTitle = "Tavernary · SillyTavern Tool Library";
const homepageDescription =
  "Discover open-source tools for SillyTavern and AI roleplay. Explore extensions, frontends, presets, and community-built Kits.";
const homepageMetadata = [
  `<title>${homepageTitle}</title>`,
  `<meta name="description" content="${homepageDescription}"/>`,
  `<meta property="og:description" content="${homepageDescription}"/>`,
  `<meta name="twitter:description" content="${homepageDescription}"/>`,
].join("");
const heading = (count: number) =>
  `${homepageMetadata}<h1>${count} projects</h1>`;
const repositoryRoot = resolve(import.meta.dirname, "../..");
const readRepositoryFile = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");
const tavernKeeperTargetVersion = (
  JSON.parse(readRepositoryFile("config/tavernkeeper-contract.json")) as {
    target_manifest_schema_version: 1 | 2 | 3;
  }
).target_manifest_schema_version;

const temporaryExports: string[] = [];

afterEach(() => {
  for (const directory of temporaryExports.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function helpExport({
  omit,
  securityHtml = "<main>Private report</main>",
}: {
  omit?: string;
  securityHtml?: string;
} = {}) {
  const outputDirectory = mkdtempSync(
    resolve(tmpdir(), "tavernary-help-export-"),
  );
  temporaryExports.push(outputDirectory);
  for (const route of [
    "help",
    "help/manage-project",
    "help/report-project",
    "help/report-website",
    "help/report-kit",
    "help/other",
  ]) {
    if (route === omit) continue;
    const directory = resolve(outputDirectory, route);
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "index.html"), "<main>Help</main>");
  }
  const securityDirectory = resolve(outputDirectory, "help/security");
  mkdirSync(securityDirectory, { recursive: true });
  writeFileSync(resolve(securityDirectory, "index.html"), securityHtml);
  return outputDirectory;
}

function tavernKeeperExport(manifest: unknown) {
  const outputDirectory = mkdtempSync(
    resolve(tmpdir(), "tavernary-tavernkeeper-export-"),
  );
  temporaryExports.push(outputDirectory);
  const securityDirectory = resolve(outputDirectory, "security");
  mkdirSync(securityDirectory, { recursive: true });
  writeFileSync(
    resolve(securityDirectory, "tavernkeeper-targets.json"),
    JSON.stringify(manifest),
  );
  return outputDirectory;
}

function validTavernKeeperRepository(overrides: Record<string, unknown> = {}) {
  const repository = {
    source_id: "github-42",
    provider: "github",
    repository_id: 42,
    repository: "fixture/catalog",
    target_sha: "a".repeat(40),
    canonical_url: "https://github.com/fixture/catalog",
    ...overrides,
  };
  return tavernKeeperTargetVersion >= 2
    ? {
        ...repository,
        project_kinds: ["extension"],
        catalog_priority: {
          top_30: false,
          first_cataloged_at: "2026-07-01T00:00:00.000Z",
          ...(tavernKeeperTargetVersion === 3 ? { popularity_rank: 1 } : {}),
        },
        ...overrides,
      }
    : repository;
}

function validTavernKeeperManifest(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: tavernKeeperTargetVersion,
    generated_at: "2026-07-31T12:00:00.000Z",
    repositories: [validTavernKeeperRepository()],
    ...overrides,
  };
}

describe("verifyStaticExport", () => {
  test("documents and exposes the catalog search certification contract", () => {
    const packageJson = JSON.parse(readRepositoryFile("package.json")) as {
      scripts: Record<string, string>;
    };
    const usingCatalogGuide = readRepositoryFile(
      "docs/guides/using-the-catalog.md",
    );
    const catalogDataModel = readRepositoryFile(
      "docs/architecture/catalog-data-model.md",
    );
    const systemOverview = readRepositoryFile(
      "docs/architecture/system-overview.md",
    );
    const productionHandoff = readRepositoryFile(
      "docs/architecture/production-development-handoff.md",
    );

    expect(packageJson.scripts["search:benchmark"]).toBe(
      "vitest run tests/benchmarks/catalog-search-benchmark.test.ts --reporter=verbose",
    );
    expect(usingCatalogGuide).toContain("all meaningful words");
    expect(usingCatalogGuide).toContain("Relevance");
    expect(catalogDataModel).toContain("structured search fields");
    expect(systemOverview).toContain("MiniSearch");
    expect(productionHandoff).not.toContain(["searchable", "Text"].join(""));
  });

  test("accepts a catalog heading split by React server-rendering comments", () => {
    expect(() =>
      verifyStaticExport(
        `${homepageMetadata}<h1>37<!-- --> <!-- -->projects</h1><script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("accepts any numeric project heading", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("accepts root Next assets when no base path is configured", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/_next/static/app.js\"></script>`,
        "",
      ),
    ).not.toThrow();
  });

  test("rejects repository-prefixed Next assets for a root deployment", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(214)}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "",
      ),
    ).toThrow("root-relative Next.js asset URLs");

    expect(() => verifyStaticExport(heading(37), "")).toThrow(
      "root-relative Next.js asset URLs",
    );
  });

  test("requires prefixed Next assets and rejects root-only assets for a project page", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/Tavernary/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).not.toThrow();

    expect(() =>
      verifyStaticExport(
        `${heading(37)}<script src=\"/_next/static/app.js\"></script>`,
        "/Tavernary",
      ),
    ).toThrow("root-only Next.js asset URLs");

    expect(() => verifyStaticExport(heading(37), "/Tavernary")).toThrow(
      "configured base path",
    );
  });

  test("rejects exports that leak intake-only metadata", () => {
    expect(() =>
      verifyStaticExport(
        `${heading(37)}<div data-debug="submitted_at catalog_intake"></div><script src="/_next/static/app.js"></script>`,
        "",
      ),
    ).toThrow("intake-only metadata");
  });

  test("requires the complete Help route inventory and keeps security private", async () => {
    await expect(verifyHelpStaticRoutes(helpExport())).resolves.toBeUndefined();
    await expect(
      verifyHelpStaticRoutes(helpExport({ omit: "help/report-kit" })),
    ).rejects.toThrow(/help[\\/]report-kit[\\/]index.html/u);
    await expect(
      verifyHelpStaticRoutes(
        helpExport({ securityHtml: '<a href="/issues/new">Public issue</a>' }),
      ),
    ).rejects.toThrow("public issue form");
  });

  test("requires the exported TavernKeeper target manifest to exist and validate", async () => {
    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport(validTavernKeeperManifest()),
      ),
    ).resolves.toBeUndefined();

    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport({
          schema_version: tavernKeeperTargetVersion,
          repositories: [],
        }),
      ),
    ).rejects.toThrow("TavernKeeper target manifest is invalid");
  });

  test("rejects an invalid TavernKeeper repository", async () => {
    const manifest = validTavernKeeperManifest({
      repositories: [
        validTavernKeeperRepository({ repository: "not a repository" }),
      ],
    });
    await expect(
      verifyTavernKeeperStaticExport(tavernKeeperExport(manifest)),
    ).rejects.toThrow("TavernKeeper target manifest is invalid");
  });

  test("rejects unexpected TavernKeeper manifest properties", async () => {
    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport(
          validTavernKeeperManifest({
            repositories: [validTavernKeeperRepository({ unexpected: true })],
          }),
        ),
      ),
    ).rejects.toThrow("TavernKeeper target manifest is invalid");
  });

  test("rejects duplicate or incomplete V3 popularity ranks", async () => {
    if (tavernKeeperTargetVersion !== 3) return;
    const first = validTavernKeeperRepository();
    const second = validTavernKeeperRepository({
      source_id: "github-84",
      repository_id: 84,
      repository: "fixture/second",
      target_sha: "b".repeat(40),
      canonical_url: "https://github.com/fixture/second",
      catalog_priority: {
        top_30: true,
        first_cataloged_at: "2026-07-02T00:00:00.000Z",
        popularity_rank: 1,
      },
    });

    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport(
          validTavernKeeperManifest({ repositories: [first, second] }),
        ),
      ),
    ).rejects.toThrow("complete unique sequence");
  });

  test("rejects invalid TavernKeeper date-time and URI formats", async () => {
    const validRepository = validTavernKeeperRepository();
    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport(
          validTavernKeeperManifest({ generated_at: "not-a-date" }),
        ),
      ),
    ).rejects.toThrow("TavernKeeper target manifest is invalid");
    await expect(
      verifyTavernKeeperStaticExport(
        tavernKeeperExport(
          validTavernKeeperManifest({
            repositories: [{ ...validRepository, canonical_url: "not-a-uri" }],
          }),
        ),
      ),
    ).rejects.toThrow("TavernKeeper target manifest is invalid");
  });

  test("rejects a missing or malformed exported TavernKeeper manifest", async () => {
    const missing = mkdtempSync(resolve(tmpdir(), "tavernary-missing-export-"));
    temporaryExports.push(missing);
    await expect(verifyTavernKeeperStaticExport(missing)).rejects.toThrow();

    const malformed = tavernKeeperExport({});
    writeFileSync(
      resolve(malformed, "security", "tavernkeeper-targets.json"),
      "{ definitely not json",
    );
    await expect(verifyTavernKeeperStaticExport(malformed)).rejects.toThrow();
  });

  test("rejects stale or incomplete homepage metadata", () => {
    const rootAsset = '<script src="/_next/static/app.js"></script>';

    expect(() =>
      verifyStaticExport(
        `${heading(37).replace(homepageTitle, "Tavernary")}${rootAsset}`,
        "",
      ),
    ).toThrow("homepage title and description metadata");

    expect(() =>
      verifyStaticExport(
        `${heading(37).replace(
          `<meta property="og:description" content="${homepageDescription}"/>`,
          "",
        )}${rootAsset}`,
        "",
      ),
    ).toThrow("homepage title and description metadata");
  });
});
