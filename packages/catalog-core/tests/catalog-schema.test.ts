import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CatalogValidationError,
  parseCatalogV7,
  parseCatalogV8,
} from "../src/catalog-schema";
import { parseInstallContract } from "../src/install-contract";

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../fixtures/${name}.json`,
      ),
      "utf8",
    ),
  );
}

describe("parseInstallContract", () => {
  it("accepts the exact SillyTavern git contract", () => {
    const contract = {
      kind: "sillytavern-extension-git",
      repositoryUrl: "https://github.com/example/alpha.git",
      branch: null,
      manifestPath: "manifest.json",
      folderName: "alpha",
    };
    expect(parseInstallContract(contract)).toEqual(contract);
  });

  it.each([
    [
      "credentials",
      "https://user:secret@github.com/example/alpha.git",
      "alpha",
    ],
    ["query", "https://github.com/example/alpha.git?ref=main", "alpha"],
    ["fragment", "https://github.com/example/alpha.git#readme", "alpha"],
    ["scheme", "file:///example/alpha.git", "alpha"],
    ["encoded separator", "https://github.com/example%2Falpha.git", "alpha"],
    ["encoded control", "https://github.com/example/alpha%00.git", "alpha"],
    ["encoded newline", "https://github.com/example/alpha%0A.git", "alpha"],
    ["encoded delete", "https://github.com/example/alpha%7F.git", "alpha"],
    [
      "double-encoded separator",
      "https://github.com/example%252Falpha.git",
      "alpha",
    ],
    [
      "double-encoded backslash",
      "https://github.com/example%255Calpha.git",
      "alpha",
    ],
    ["unsafe folder", "https://github.com/example/alpha.git", "../alpha"],
  ])("rejects %s", (_label, repositoryUrl, folderName) => {
    expect(() =>
      parseInstallContract({
        kind: "sillytavern-extension-git",
        repositoryUrl,
        branch: null,
        manifestPath: "manifest.json",
        folderName,
      }),
    ).toThrow();
  });
});

it("parses a schema-7 catalog fixture", async () => {
  const value = await fixture("catalog-v7-valid");
  expect(parseCatalogV7(value)).toEqual(value);
});

async function catalogWithReport({
  includeCoverage,
  schemaVersion,
}: {
  includeCoverage: boolean;
  schemaVersion: 7 | 8;
}) {
  const value = structuredClone(
    (await fixture("catalog-v7-valid")) as {
      schemaVersion: number;
      projects: Array<Record<string, unknown>>;
      kits: Array<Record<string, unknown>>;
    },
  );
  const report = {
    reportId: "c".repeat(64),
    riskLevel: "low",
    headline: "Low concern",
    summary: "No material concern was observed.",
    minorCautions: 0,
    materialConcerns: 0,
    highDanger: 0,
    maliciousEvidence: "",
    citedFindingIds: [],
    scannedSha: "a".repeat(40),
    treeUrl: `https://github.com/example/alpha/tree/${"a".repeat(40)}`,
    scannedAt: "2026-08-18T12:00:00.000Z",
    assessedAt: "2026-08-18T12:01:00.000Z",
    scannerPolicyVersion: "5",
    contextualReviewPolicyVersion: "5",
    synthesisPolicyVersion: "5",
    synthesisModel: "deterministic-policy-v5",
    dangerBasis: "none",
    assessmentSource: "deterministic_regrade",
    reportUrl: "https://example.com/report/",
    technicalHistoryUrl: null,
    ...(includeCoverage ? { javascriptAnalysisStatus: "incomplete" } : {}),
  };
  value.schemaVersion = schemaVersion;
  value.projects[0]!.tavernKeeper = {
    state: "teal",
    riskLevel: "low",
    freshness: "current",
    currentSha: "a".repeat(40),
    report,
    history: [report],
    historyUrl: "/security/tavernkeeper/history/github-42/",
  };
  return value;
}

function addKitProject(value: Awaited<ReturnType<typeof catalogWithReport>>) {
  const project = structuredClone(value.projects[0]!);
  value.kits = [
    {
      id: "kit-alpha",
      title: "Alpha Kit",
      description: "A fixture Kit.",
      author: { githubUserId: 42, login: "example" },
      sourceIssueNumber: 42,
      sourceIssueUrl: "https://github.com/example/catalog/issues/42",
      publishedAt: "2026-08-18T12:00:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
      frontends: [],
      purposes: [],
      modelFamilies: [],
      components: [
        {
          projectId: project.id,
          name: project.name,
          kind: project.kind,
          primaryFunction: project.primaryFunction,
          availability: "available",
          unavailableReason: null,
          canonicalUrl: project.canonicalUrl,
          project,
        },
      ],
      supporterCount: null,
      trendingScore: null,
      supportRefreshedAt: null,
      supportStale: false,
      flaggedProjectCount: 0,
      search: project.search,
    },
  ];
}

it("requires and preserves JavaScript analysis coverage in schema 8", async () => {
  const value = await catalogWithReport({
    includeCoverage: true,
    schemaVersion: 8,
  });
  const parsed = parseCatalogV8(value);

  expect(parsed.projects[0]!.tavernKeeper?.report).toMatchObject({
    javascriptAnalysisStatus: "incomplete",
  });
  await expect(
    Promise.resolve(
      catalogWithReport({ includeCoverage: false, schemaVersion: 8 }),
    ).then((missing) => parseCatalogV8(missing)),
  ).rejects.toThrow(CatalogValidationError);
});

it("normalizes schema-7 report coverage to unavailable without accepting the v8 field", async () => {
  const value = await catalogWithReport({
    includeCoverage: false,
    schemaVersion: 7,
  });
  expect(parseCatalogV7(value).projects[0]!.tavernKeeper?.report).toMatchObject(
    {
      javascriptAnalysisStatus: null,
    },
  );

  const invalid = await catalogWithReport({
    includeCoverage: true,
    schemaVersion: 7,
  });
  expect(() => parseCatalogV7(invalid)).toThrow(CatalogValidationError);
});

it("normalizes schema-7 coverage for projects embedded in Kits", async () => {
  const value = await catalogWithReport({
    includeCoverage: false,
    schemaVersion: 7,
  });
  addKitProject(value);

  const parsed = parseCatalogV7(value);
  const project = parsed.kits[0]!.components[0]!.project;
  expect(project?.tavernKeeper?.report).toMatchObject({
    javascriptAnalysisStatus: null,
  });
  expect(project?.tavernKeeper?.history[0]).toMatchObject({
    javascriptAnalysisStatus: null,
  });
});

it("reports an invalid install URL at the public field path", async () => {
  const value = await fixture("catalog-v7-invalid-install-url");
  const error = (() => {
    try {
      parseCatalogV7(value);
      return null;
    } catch (cause) {
      return cause;
    }
  })();

  expect(error).toBeInstanceOf(CatalogValidationError);
  expect(error).toMatchObject({
    issues: [
      expect.objectContaining({ path: "projects[0].install.repositoryUrl" }),
    ],
  });
});

it.each([
  ["unsafe project URL", "canonicalUrl", "javascript:alert(1)"],
  ["malformed search fields", "search", { title: "not-an-array" }],
  ["unexpected project field", "unexpected", true],
])(
  "rejects %s before the catalog enters the cache",
  async (_name, field, next) => {
    const value = structuredClone(
      (await fixture("catalog-v7-valid")) as {
        projects: Array<Record<string, unknown>>;
      },
    );
    value.projects[0]![field] = next;

    expect(() => parseCatalogV7(value)).toThrow(CatalogValidationError);
  },
);

it("rejects a backslash-relative navigation URL that resolves off origin", async () => {
  const value = structuredClone(
    (await fixture("catalog-v7-valid")) as {
      projects: Array<Record<string, unknown>>;
    },
  );
  value.projects[0]!.tavernKeeper = {
    state: "gray",
    riskLevel: null,
    freshness: "unassessed",
    currentSha: null,
    report: null,
    history: [],
    historyUrl: "/\\evil.example/x",
  };

  expect(() => parseCatalogV7(value)).toThrow(CatalogValidationError);
});
