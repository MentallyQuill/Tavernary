import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  createCanonicalPublicationRecord,
  discoverCanonicalPublications,
  validateCanonicalPublicationRecord,
} from "../../scripts/automation/publication-record.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
function fixture() {
  const result = preparedResultFixture();
  const operation = preparedResultContextFixture().operation;
  return {
    result,
    operation,
    record: createCanonicalPublicationRecord({ result, operation }),
    revision: "d".repeat(40),
  };
}
test("publication proof is co-committed with exact canonical file hashes and operation identity", () => {
  const input = fixture();
  expect(validateCanonicalPublicationRecord(input.record)).toEqual(
    input.record,
  );
  const operations = discoverCanonicalPublications({
    records: [{ record: input.record, revision: input.revision }],
    fileDigests: Object.fromEntries(
      input.result.files.map((file) => [
        `${input.revision}:${file.path}`,
        file.sha256,
      ]),
    ),
    nowMs: Date.now(),
  });
  expect(operations).toEqual([
    expect.objectContaining({
      key: input.operation.key,
      stage: "published",
      expectedSha: input.revision,
      workerRunId: null,
    }),
  ]);
});
test.each(["advisory", "metadata"] as const)(
  "a private %s publication does not wait for a public deployment",
  (kind) => {
    const operation = operationFixture({
      identity: {
        kind,
        subject: "source:github-42:example",
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
    });
    const result = preparedResultFixture({
      kind,
      operationKey: operation.key,
      paths: [
        kind === "advisory"
          ? "data/snapshots/policy-review/example.json"
          : "data/maintenance/automation/metadata/example.json",
      ],
    });
    const revision = "d".repeat(40),
      record = createCanonicalPublicationRecord({ result, operation });
    expect(
      discoverCanonicalPublications({
        records: [{ record, revision }],
        fileDigests: {
          [`${revision}:${result.files[0].path}`]: result.files[0].sha256,
        },
        nowMs: Date.now(),
      })[0].stage,
    ).toBe(kind === "advisory" ? "deployment-confirmed" : "finalized");
  },
);
test("a receipt, altered identity, wrong file hash, or unverified revision cannot serve as publication proof", () => {
  const input = fixture();
  expect(() =>
    validateCanonicalPublicationRecord({
      schema_version: 1,
      operation: input.operation,
      updatedAt: new Date().toISOString(),
      completedAt: null,
    }),
  ).toThrow();
  expect(() =>
    validateCanonicalPublicationRecord({
      ...input.record,
      operation: { ...input.operation, key: "f".repeat(64) },
    }),
  ).toThrow();
  expect(
    discoverCanonicalPublications({
      records: [{ record: input.record, revision: input.revision }],
      fileDigests: {
        [`${input.revision}:${input.result.files[0].path}`]: createHash(
          "sha256",
        )
          .update("{}")
          .digest("hex"),
      },
      nowMs: Date.now(),
    }),
  ).toEqual([]);
  expect(() =>
    discoverCanonicalPublications({
      records: [{ record: input.record, revision: "not-a-commit" }],
      fileDigests: {},
      nowMs: Date.now(),
    }),
  ).toThrow();
});
test("publication confirmation preserves finalized bookkeeping without interpreting receipts as proof", () => {
  const input = fixture();
  const finalized = {
    ...input.operation,
    stage: "finalized" as const,
    expectedSha: input.revision,
    workerRunId: null,
  };
  const receipts = [
    {
      schema_version: 1 as const,
      operation: finalized,
      updatedAt: "2026-10-08T12:00:00.000Z",
      completedAt: "2026-10-08T12:00:00.000Z",
    },
  ];
  const common = {
    records: [{ record: input.record, revision: input.revision }],
    fileDigests: {
      [`${input.revision}:${input.result.files[0].path}`]:
        input.result.files[0].sha256,
    },
    nowMs: Date.now(),
    receipts,
    confirmedRevisions: [input.revision],
  };
  expect(discoverCanonicalPublications(common)[0].stage).toBe("finalized");
  expect(discoverCanonicalPublications({ ...common, records: [] })).toEqual([]);
});
