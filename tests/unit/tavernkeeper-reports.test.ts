import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

import * as reportValidation from "../../scripts/security/tavernkeeper-reports.mjs";
import {
  TAVERNKEEPER_REPORT_INDEX_URL,
  fetchAndValidateTavernKeeperIndex,
  validateReportIndex,
} from "../../scripts/security/tavernkeeper-reports.mjs";
import { importTavernKeeperReports } from "../../scripts/security/import-tavernkeeper-reports.mjs";
import { validateStoredTavernKeeperReports } from "../../scripts/security/validate-tavernkeeper-reports.mjs";

const legacyFixturePath = resolve(
  "tests/fixtures/tavernkeeper/report-index.valid.json",
);
const fixturePath = resolve(
  "tests/fixtures/tavernkeeper/report-index.v2.valid.json",
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

function response(index: unknown) {
  return new Response(JSON.stringify(index), {
    headers: { "content-type": "application/json" },
  });
}

async function withinTestDeadline<T>(promise: Promise<T>, timeoutMs = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("test deadline exceeded")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function storedSummaryRoot(
  index: unknown,
  sources: Array<Record<string, unknown>>,
) {
  const root = await mkdtemp(resolve(tmpdir(), "tavernkeeper-stored-"));
  await Promise.all([
    mkdir(resolve(root, "data/registry/sources"), { recursive: true }),
    mkdir(resolve(root, "data/security"), { recursive: true }),
  ]);
  await Promise.all([
    ...sources.map((entry, index) =>
      writeFile(
        resolve(root, "data/registry/sources", `${index}.json`),
        `${JSON.stringify(entry, null, 2)}\n`,
      ),
    ),
    writeFile(
      resolve(root, "data/security/tavernkeeper-report-summaries.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    ),
  ]);
  return root;
}

describe("TavernKeeper report-index importer", () => {
  test("pins the vendored V2 schema and fixture to reviewed producer digests", async () => {
    const [schema, index] = await Promise.all([
      readFile("data/schemas/tavernkeeper-report-index.v2.schema.json"),
      readFile(fixturePath),
    ]);

    expect(createHash("sha256").update(schema).digest("hex")).toBe(
      "4b4696e1775bd9b41ff645f603bb0639acabc79c813f30d67fcbc8a748488e5f",
    );
    expect(createHash("sha256").update(index).digest("hex")).toBe(
      "8bacda5dc4a8ae7c6c3ab6577e7e9c30bb89045b0a09d7c82d6c2c02a31e4503",
    );
  });

  test.skipIf(
    !existsSync(producerSchemaPath) || !existsSync(producerFixturePath),
  )(
    "vendors the reviewed producer schema and fixture as parsed parity copies",
    async () => {
      const [schema, producerSchema, index, producerIndex] = await Promise.all([
        readFile("data/schemas/tavernkeeper-report-index.schema.json", "utf8"),
        readFile(producerSchemaPath, "utf8"),
        readFile(legacyFixturePath, "utf8"),
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
        fetchImpl: async () => response(index),
      }),
    ).resolves.toEqual(index);
  });

  test("accepts a strict V2 automated report index", async () => {
    const index = await fixture();

    expect(validateReportIndex(index, registry)).toEqual(index);
  });

  test("rejects V2 actionable severity totals that conflict with actionable findings", async () => {
    const index = await fixture();
    index.reports[0].finding_counts.actionable_severity.high = 0;

    expect(() => validateReportIndex(index, registry)).toThrow(
      /finding totals/u,
    );
  });

  test("rejects impossible teal totals whose marginals require an actionable finding", async () => {
    const index = await fixture();
    index.reports[0].result = "teal";
    index.reports[0].finding_counts.actionable = 0;
    index.reports[0].finding_counts.actionable_severity.high = 0;

    expect(() => validateReportIndex(index, registry)).toThrow(
      /finding totals/u,
    );
  });

  test("rejects impossible red totals with no review-confidence finding", async () => {
    const index = await fixture();
    index.reports[0].finding_counts.confidence = {
      high: 0,
      medium: 0,
      low: 1,
    };

    expect(() => validateReportIndex(index, registry)).toThrow(
      /finding totals/u,
    );
  });

  test("rejects legacy result and disposition fields from V2", async () => {
    const index = await fixture();
    index.reports[0].result = "yellow";
    index.reports[0].finding_counts.disposition = {
      active: 1,
      dismissed: 0,
    };

    expect(() => validateReportIndex(index, registry)).toThrow(/schema/u);
  });

  test("accepts only the frozen empty V1 index during migration", async () => {
    const emptyV1 = {
      schema_version: 1,
      generated_at: "2026-07-31T12:10:00.000Z",
      reports: [],
    };
    const populatedV1 = JSON.parse(await readFile(legacyFixturePath, "utf8"));

    expect(validateReportIndex(emptyV1, registry)).toEqual(emptyV1);
    expect(() => validateReportIndex(populatedV1, registry)).toThrow(
      /migration/u,
    );
  });

  test("requires canonical UTC timestamps in V2", async () => {
    const index = await fixture();
    index.generated_at = "2026-07-31T12:10:00+00:00";
    index.reports[0].completed_at = "2026-07-31T06:05:00-06:00";

    expect(() => validateReportIndex(index, registry)).toThrow(/schema/u);
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

  test("follows a same-origin reports redirect through the vetted lookup boundary", async () => {
    const index = await fixture();
    const requests: string[] = [];
    const lookupAddresses: string[] = [];
    let responseNumber = 0;

    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => {
          throw new Error("unbound fetch transport was used");
        },
        requestImpl: async (url, options) => {
          requests.push(url);
          await new Promise<void>((resolveLookup, rejectLookup) => {
            options.lookup("mentallyquill.github.io", {}, (error, address) => {
              if (error) {
                rejectLookup(error);
                return;
              }
              if (typeof address !== "string") {
                rejectLookup(
                  new Error("bound lookup did not return one address"),
                );
                return;
              }
              lookupAddresses.push(address);
              resolveLookup();
            });
          });
          responseNumber += 1;
          return responseNumber === 1
            ? new Response(null, {
                headers: { location: "/TavernKeeper/reports/index-v1.json" },
                status: 302,
              })
            : response(index);
        },
      }),
    ).resolves.toEqual(index);
    expect(requests).toEqual([
      TAVERNKEEPER_REPORT_INDEX_URL,
      "https://mentallyquill.github.io/TavernKeeper/reports/index-v1.json",
    ]);
    expect(lookupAddresses).toEqual(["8.8.8.8", "8.8.8.8"]);
  });

  test("rejects a third same-origin redirect", async () => {
    let redirects = 0;
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: publicDnsLookup,
        fetchImpl: async () => {
          redirects += 1;
          return new Response(null, {
            headers: { location: "/TavernKeeper/reports/next.json" },
            status: 302,
          });
        },
      }),
    ).rejects.toThrow(/redirect limit/u);
    expect(redirects).toBe(3);
  });

  test("rejects private DNS answers before the request transport runs", async () => {
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: async () => [{ address: "127.0.0.1", family: 4 }],
        fetchImpl: async () => {
          throw new Error("request transport should not run");
        },
      }),
    ).rejects.toThrow(/resolve publicly/u);
  });

  test.each(["2606:4700:4700::1111", "2001:200::1"])(
    "allows allocated global-unicast IPv6 answer %s to reach the report transport",
    async (address) => {
      const index = await fixture();
      let requests = 0;

      await expect(
        fetchAndValidateTavernKeeperIndex({
          dnsLookup: async () => [{ address, family: 6 }],
          fetchImpl: async () => {
            requests += 1;
            return response(index);
          },
        }),
      ).resolves.toEqual(index);
      expect(requests).toBe(1);
    },
  );

  test.each([
    "0:0:0:0:0:0:0:1",
    "fe90::1",
    "febf::1",
    "ff02::1",
    "fec0::1",
    "feff::1",
    "::ffff:7f00:1",
    "::ffff:8.8.8.8",
    "::c0a8:101",
    "100::1",
    "64:ff9b:1::1",
    "2001::1",
    "2002::1",
    "2d00::1",
    "3000::1",
    "3fff::1",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "198.51.100.1",
  ])("rejects non-public report-index DNS address %s", async (address) => {
    await expect(
      fetchAndValidateTavernKeeperIndex({
        dnsLookup: async () => [
          { address, family: address.includes(":") ? 6 : 4 },
        ],
        fetchImpl: async () => {
          throw new Error("request transport should not run");
        },
      }),
    ).rejects.toThrow(/resolve publicly/u);
  });

  test("bounds report-index DNS under the per-hop deadline", async () => {
    await expect(
      withinTestDeadline(
        fetchAndValidateTavernKeeperIndex({
          dnsLookup: async () => new Promise(() => {}),
          timeoutMs: 10,
        }),
      ),
    ).rejects.toThrow(/timed out/u);
  });

  test("bounds a report-index request that ignores the abort signal", async () => {
    await expect(
      withinTestDeadline(
        fetchAndValidateTavernKeeperIndex({
          dnsLookup: publicDnsLookup,
          requestImpl: async () => new Promise(() => {}),
          timeoutMs: 10,
        }),
      ),
    ).rejects.toThrow(/timed out/u);
  });

  test("bounds a report-index body that never yields", async () => {
    await expect(
      withinTestDeadline(
        fetchAndValidateTavernKeeperIndex({
          dnsLookup: publicDnsLookup,
          fetchImpl: async () =>
            new Response(
              new ReadableStream({
                pull() {
                  return new Promise(() => {});
                },
              }),
              { headers: { "content-type": "application/json" } },
            ),
          timeoutMs: 10,
        }),
      ),
    ).rejects.toThrow(/timed out/u);
  });

  test("does not await cancellation after rejecting an oversized report stream", async () => {
    await expect(
      withinTestDeadline(
        fetchAndValidateTavernKeeperIndex({
          dnsLookup: publicDnsLookup,
          fetchImpl: async () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
                },
                cancel() {
                  return new Promise(() => {});
                },
              }),
              { headers: { "content-type": "application/json" } },
            ),
          timeoutMs: 10,
        }),
      ),
    ).rejects.toThrow(/size/u);
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

  test.each([
    [
      "repository ID",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/99/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/standard/1/",
    ],
    [
      "target SHA",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/1/standard/1/",
    ],
    [
      "scanner policy",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0/standard/1/",
    ],
    [
      "mode",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/deep/1/",
    ],
    [
      "report version",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/standard/2/",
    ],
    [
      "extra suffix",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/standard/1/index.html",
    ],
    [
      "missing trailing slash",
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/standard/1",
    ],
  ])("rejects a report URL with a cross-linked %s", async (_part, url) => {
    const index = await fixture();
    index.reports[0].report_url = url;

    expect(() => validateReportIndex(index, registry)).toThrow(/URL/u);
  });

  test("rejects duplicate preferred report identities", async () => {
    const index = await fixture();
    index.reports.push({
      ...structuredClone(index.reports[0]),
      report_id: "d".repeat(64),
      mode: "deep",
      report_url:
        "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/deep/1/",
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
    index.reports[0].report_url =
      "https://mentallyquill.github.io/TavernKeeper/reports/github/99/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/1/standard/1/";
    index.reports[0].history_url =
      "https://mentallyquill.github.io/TavernKeeper/reports/github/99/history/";

    expect(validateReportIndex(index, registry).reports).toEqual([]);
  });

  test("excludes reports from inactive scanner policies", async () => {
    const index = await fixture();
    index.reports[0].scanner_policy_version = "0";
    index.reports[0].report_url =
      "https://mentallyquill.github.io/TavernKeeper/reports/github/42/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0/standard/1/";

    expect(validateReportIndex(index, registry).reports).toEqual([]);
  });

  test("rejects duplicate active source records for one repository ID", async () => {
    const index = await fixture();
    const duplicateRegistry = [
      ...registry,
      { ...registry[0], id: "github-42-duplicate" },
    ];

    expect(() => validateReportIndex(index, duplicateRegistry)).toThrow(
      /registry.*duplicate/u,
    );
  });

  test("rejects tracked summaries after a concurrent registry rename", async () => {
    const index = await fixture();
    const renamedRegistry = [{ ...registry[0], repository: "owner/renamed" }];

    expect(() =>
      reportValidation.validateStoredReportIndex(index, renamedRegistry),
    ).toThrow(/identity/u);
  });

  test("rejects tracked summaries dropped by a concurrent source deactivation", async () => {
    const index = await fixture();
    const deactivatedRegistry = [{ ...registry[0], status: "inactive" }];

    expect(() =>
      reportValidation.validateStoredReportIndex(index, deactivatedRegistry),
    ).toThrow(/dropped or changed/u);
  });

  test("reads and accepts canonical tracked summary bytes", async () => {
    const root = await storedSummaryRoot(await fixture(), registry);
    try {
      await expect(
        validateStoredTavernKeeperReports({ root }),
      ).resolves.toMatchObject({ reports: [{ repository_id: 42 }] });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test.each([
    ["rename", { ...registry[0], repository: "owner/renamed" }, /identity/u],
    [
      "deactivation",
      { ...registry[0], status: "inactive" },
      /dropped or changed/u,
    ],
  ])(
    "rejects tracked bytes after concurrent registry %s",
    async (_change, changedSource, expectedError) => {
      const root = await storedSummaryRoot(await fixture(), [changedSource]);
      try {
        await expect(
          validateStoredTavernKeeperReports({ root }),
        ).rejects.toThrow(expectedError);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

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
