import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import { expect, test } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { decodePreparedArtifact } from "../../scripts/automation/prepared-artifact.mjs";
import { preparedResultFixture } from "../helpers/automation-fixtures";

const archiveDigest = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
test.each(["revision.json", "confirmation.json"] as const)(
  "trusted single-file %s metadata uses the same bounded archive integrity checks",
  (filename) => {
    const value = { schema_version: 1, sourceSha: "a".repeat(40) };
    const archive = zipSync({ [filename]: strToU8(JSON.stringify(value)) });
    expect(
      decodePreparedArtifact({
        archive,
        digest: archiveDigest(archive),
        filename,
      }),
    ).toEqual(value);
    const substituted = zipSync({
      "../revision.json": strToU8(JSON.stringify(value)),
    });
    expect(() =>
      decodePreparedArtifact({
        archive: substituted,
        digest: archiveDigest(substituted),
        filename,
      }),
    ).toThrow();
  },
);
test("a prepared artifact is verified and decoded entirely in memory", () => {
  const result = preparedResultFixture();
  const archive = zipSync({ "result.json": strToU8(JSON.stringify(result)) });
  expect(
    decodePreparedArtifact({ archive, digest: archiveDigest(archive) }),
  ).toEqual(result);
});
test.each([
  "../result.json",
  "nested/result.json",
  "/result.json",
  "result.json:stream",
  "script.mjs",
])("unknown or unsafe archive path %s is rejected", (path) => {
  const archive = zipSync({ [path]: strToU8("{}") });
  expect(() =>
    decodePreparedArtifact({ archive, digest: archiveDigest(archive) }),
  ).toThrow();
});
test("duplicate files, Unix symlinks, digest mismatch and corrupt compressed data fail closed", () => {
  const extra = zipSync({
    "result.json": strToU8("{}"),
    "extra.json": strToU8("{}"),
  });
  const link = zipSync({
    "result.json": [
      strToU8("target.json"),
      { os: 3, attrs: (0o120777 << 16) >>> 0 },
    ],
  });
  expect(() =>
    decodePreparedArtifact({ archive: extra, digest: archiveDigest(extra) }),
  ).toThrow();
  expect(() =>
    decodePreparedArtifact({ archive: link, digest: archiveDigest(link) }),
  ).toThrow();
  const good = zipSync({
    "result.json": strToU8(JSON.stringify(preparedResultFixture())),
  });
  expect(() =>
    decodePreparedArtifact({
      archive: good,
      digest: `sha256:${"f".repeat(64)}`,
    }),
  ).toThrow();
  good[45] ^= 127;
  expect(() =>
    decodePreparedArtifact({ archive: good, digest: archiveDigest(good) }),
  ).toThrow();
});

test("a forged small uncompressed size cannot hide a decompression bomb", () => {
  const archive = zipSync({
    "result.json": strToU8(`{}${" ".repeat(1_048_576)}`),
  });
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const central = view.getUint32(archive.byteLength - 6, true);
  view.setUint32(central + 24, 2, true);
  view.setUint32(central + 16, crc32(strToU8("{}")), true);
  view.setUint32(22, 2, true);
  view.setUint32(14, crc32(strToU8("{}")), true);
  expect(() =>
    decodePreparedArtifact({ archive, digest: archiveDigest(archive) }),
  ).toThrow();
});
