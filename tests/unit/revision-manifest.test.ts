import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildRevisionManifest,
  validateRevisionManifest,
  writeRevisionManifest,
  verifyRevisionExport,
} from "../../scripts/automation/revision-manifest.mjs";
import { revisionFixture } from "../helpers/deployment-fixtures";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function exportFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "tavernary-revision-"));
  roots.push(root);
  const input = revisionFixture();
  const values: Record<string, unknown> = {
    "catalog/tavernary-catalog.json": { schemaVersion: 7, projects: [] },
    "catalog/tavernary-catalog-v8.json": input.catalog,
    "security/tavernkeeper-targets.json": input.targets,
  };
  for (const file of input.files) {
    const path = resolve(root, file.path);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(
      path,
      file.path in values
        ? JSON.stringify(values[file.path])
        : "<main>Catalog</main>",
    );
  }
  return { root, input };
}
test("source, current schemas and all assets are bound to one exact revision", () => {
  const input = revisionFixture();
  const result = buildRevisionManifest(input);
  expect(result).toMatchObject({
    schemaVersion: 1,
    sourceSha: input.sourceSha,
    catalogSchemaVersion: 8,
    targetSchemaVersion: 3,
    assets: expect.arrayContaining(input.files),
  });
  expect(validateRevisionManifest(result)).toEqual(result);
});
test("volatile build metadata does not change semantic catalog and target identities", () => {
  const input = revisionFixture();
  const before = buildRevisionManifest(input);
  const after = buildRevisionManifest({
    ...input,
    buildId: "run-43-attempt-1",
    catalog: { ...input.catalog, generatedAt: "2099-01-01" },
    targets: { ...input.targets, generated_at: "2099-01-01" },
  });
  expect(after.catalogDigest).toBe(before.catalogDigest);
  expect(after.targetDigest).toBe(before.targetDigest);
});
test.each(["../outside", "/absolute", "a\\b", "revision.json"])(
  "unsafe or self-referential asset %s is rejected",
  (path) => {
    const input = revisionFixture();
    expect(() =>
      buildRevisionManifest({
        ...input,
        files: [...input.files, { ...input.files[0], path }],
      }),
    ).toThrow();
  },
);
test("unsupported public schemas and forged integrity metadata are rejected", () => {
  const input = revisionFixture();
  expect(() =>
    buildRevisionManifest({
      ...input,
      catalog: { ...input.catalog, schemaVersion: 9 },
    }),
  ).toThrow();
  const manifest = buildRevisionManifest(input);
  expect(() =>
    validateRevisionManifest({ ...manifest, buildDigest: "0".repeat(64) }),
  ).toThrow();
});
test("native verification checks every exported byte and the expected source", async () => {
  const { root, input } = await exportFixture();
  const manifest = await writeRevisionManifest({
    outputDirectory: root,
    sourceSha: input.sourceSha,
    buildId: input.buildId,
  });
  expect(
    await verifyRevisionExport({
      outputDirectory: root,
      expectedSourceSha: input.sourceSha,
    }),
  ).toEqual(manifest);
  await writeFile(resolve(root, "index.html"), "corrupt");
  await expect(
    verifyRevisionExport({
      outputDirectory: root,
      expectedSourceSha: input.sourceSha,
    }),
  ).rejects.toThrow(/integrity/i);
});
test("a modified revision and unlisted asset cannot pass native verification", async () => {
  const { root, input } = await exportFixture();
  await writeRevisionManifest({
    outputDirectory: root,
    sourceSha: input.sourceSha,
    buildId: input.buildId,
  });
  await expect(
    verifyRevisionExport({
      outputDirectory: root,
      expectedSourceSha: "b".repeat(40),
    }),
  ).rejects.toThrow(/source/i);
  await writeFile(resolve(root, "injected.js"), "alert(1)");
  await expect(
    verifyRevisionExport({
      outputDirectory: root,
      expectedSourceSha: input.sourceSha,
    }),
  ).rejects.toThrow(/integrity/i);
  expect(
    JSON.parse(await readFile(resolve(root, "revision.json"), "utf8"))
      .sourceSha,
  ).toBe(input.sourceSha);
});
