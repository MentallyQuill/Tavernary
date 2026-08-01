import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import {
  TAVERNKEEPER_REPORT_INDEX_URL,
  fetchAndValidateTavernKeeperIndex,
  validateReportIndex,
} from "../../scripts/security/tavernkeeper-reports.mjs";
import { importTavernKeeperReports } from "../../scripts/security/import-tavernkeeper-reports.mjs";

const fixturePath = resolve(
  "tests/fixtures/tavernkeeper/report-index.valid.json",
);
const producerRoot = "F:/git/TavernKeeper/.worktrees/tavernkeeper-v1";
const producerSchemaPath = resolve(
  producerRoot,
  "schemas/report-index.v1.schema.json",
);
const producerFixturePath = resolve(
  producerRoot,
  "tests/fixtures/contracts/index.valid.json",
);
const registry = [
  {
    id: "github-42",
    type: "github",
    status: "active",
    repository_id: 42,
    repository: "owner/repo",
  },
];

async function fixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

function publicDnsLookup() {
  return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
}

describe("TavernKeeper report-index importer", () => {
  test.skipIf(
    !existsSync(producerSchemaPath) || !existsSync(producerFixturePath),
  )(
    "vendors the reviewed producer schema and fixture as parsed parity copies",
    async () => {
      const [schema, producerSchema, index, producerIndex] = await Promise.all([
        readFile("data/schemas/tavernkeeper-report-index.schema.json", "utf8"),
        readFile(producerSchemaPath, "utf8"),
        readFile(fixturePath, "utf8"),
        readFile(producerFixturePath, "utf8"),
      ]);

      expect(JSON.parse(schema)).toEqual(JSON.parse(producerSchema));
      expect(JSON.parse(index)).toEqual(JSON.parse(producerIndex));
    },
  );

  test("fetches the configured index through a public same-origin JSON response", async () => {
    const index = await fixture();
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(JSON.stringify(index), {
            headers: { "content-type": "application/json" },
          }),
      }),
    ).resolves.toEqual(index);
  });

  test("rejects cross-origin redirects", async () => {
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(null, {
            headers: { location: "https://example.test/report-index.json" },
            status: 302,
          }),
      }),
    ).rejects.toThrow(/origin/u);
  });

  test("rejects content-length values over the response limit", async () => {
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response("{}", {
            headers: {
              "content-length": String(2 * 1024 * 1024 + 1),
              "content-type": "application/json",
            },
          }),
      }),
    ).rejects.toThrow(/size/u);
  });

  test("rejects streamed bodies over the response limit", async () => {
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
                controller.close();
              },
            }),
            { headers: { "content-type": "application/json" } },
          ),
      }),
    ).rejects.toThrow(/size/u);
  });

  test("rejects unknown report fields before accepting an index", async () => {
    const index = await fixture();
    index.reports[0].unexpected = true;

    expect(() => validateReportIndex(index, registry)).toThrow(/schema/u);
  });

  test("rejects a report whose repository identity conflicts with Tavernary", async () => {
    const index = await fixture();
    index.reports[0].repository = "owner/other";

    expect(() => validateReportIndex(index, registry)).toThrow(/identity/u);
  });

  test("rejects duplicate preferred report identities", async () => {
    const index = await fixture();
    index.reports.push({
      ...structuredClone(index.reports[0]),
      report_id: "d".repeat(64),
      mode: "deep",
    });

    expect(() => validateReportIndex(index, registry)).toThrow(/duplicate/u);
  });

  test("rejects duplicate report IDs across distinct preferred identities", async () => {
    const index = await fixture();
    index.reports.push({
      ...structuredClone(index.reports[0]),
      target_sha: "b".repeat(40),
      report_url:
        "https://mentallyquill.github.io/TavernKeeper/reports/github/42/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1/standard/1/",
    });

    expect(() => validateReportIndex(index, registry)).toThrow(/duplicate/u);
  });

  test("drops schema-valid reports for sources Tavernary no longer knows", async () => {
    const index = await fixture();
    index.reports[0].repository_id = 99;
    index.reports[0].source_id = "github-99";

    expect(validateReportIndex(index, registry).reports).toEqual([]);
  });

  test("preserves existing summaries when import validation fails", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "tavernkeeper-reports-"));
    const outputPath = resolve(directory, "summaries.json");
    const previousValidBytes =
      '{\n  "schema_version": 1,\n  "generated_at": "1970-01-01T00:00:00.000Z",\n  "reports": []\n}\n';
    await writeFile(outputPath, previousValidBytes);

    await expect(
      importTavernKeeperReports({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () =>
          new Response(JSON.stringify({ schema_version: 2, reports: [] }), {
            headers: { "content-type": "application/json" },
          }),
        outputPath,
        registry,
      }),
    ).rejects.toThrow(/schema/u);
    expect(await readFile(outputPath, "utf8")).toBe(previousValidBytes);
  });

  test("uses the fixed public report-index URL", () => {
    expect(TAVERNKEEPER_REPORT_INDEX_URL).toBe(
      "https://mentallyquill.github.io/TavernKeeper/reports/index.json",
    );
  });
});
