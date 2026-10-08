import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { automationDataDigests } from "./data-digests.mjs";

const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
export const REVISION_LIMITS = Object.freeze({
  files: 50000,
  fileBytes: 64 * 1024 * 1024,
  totalBytes: 1024 * 1024 * 1024,
  manifestBytes: 16 * 1024 * 1024,
});
export const REQUIRED_SITE_ASSETS = Object.freeze([
  "index.html",
  "menu/index.html",
  "catalog/tavernary-catalog.json",
  "catalog/tavernary-catalog-v8.json",
  "security/tavernkeeper-targets.json",
]);
function invalid(message = "Revision manifest is invalid.") {
  throw Object.assign(new Error(message), { code: "validation-failed" });
}
function exactKeys(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function validSiteAssetPath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length <= 512 &&
    path !== "revision.json" &&
    !/[\\:\u0000-\u0020\u007f?#%]/u.test(path) &&
    path
      .split("/")
      .every((segment) => segment && segment !== "." && segment !== "..")
  );
}
function validateAssets(files) {
  if (
    !Array.isArray(files) ||
    files.length < REQUIRED_SITE_ASSETS.length ||
    files.length > REVISION_LIMITS.files
  )
    invalid();
  let bytes = 0;
  const paths = new Set();
  for (const file of files) {
    if (
      !exactKeys(file, ["path", "bytes", "sha256"]) ||
      !validSiteAssetPath(file.path) ||
      paths.has(file.path) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > REVISION_LIMITS.fileBytes ||
      !digest.test(file.sha256 ?? "")
    )
      invalid();
    paths.add(file.path);
    bytes += file.bytes;
    if (bytes > REVISION_LIMITS.totalBytes) invalid();
  }
  if (REQUIRED_SITE_ASSETS.some((path) => !paths.has(path)))
    invalid("Revision manifest is missing a required site asset.");
  return files
    .map((file) => ({ ...file }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function assetDigest(files) {
  return createHash("sha256").update(JSON.stringify(files)).digest("hex");
}
export function buildRevisionManifest({
  sourceSha,
  catalog,
  targets,
  files,
  buildId,
}) {
  if (
    !sha.test(sourceSha ?? "") ||
    typeof buildId !== "string" ||
    !/^[A-Za-z0-9._-]{1,128}$/u.test(buildId) ||
    catalog?.schemaVersion !== 8 ||
    !Array.isArray(catalog.projects) ||
    !Array.isArray(catalog.kits) ||
    !catalog.tagVocabulary ||
    targets?.schema_version !== 3 ||
    !Array.isArray(targets.repositories)
  )
    invalid();
  const assets = validateAssets(files);
  return {
    schemaVersion: 1,
    sourceSha,
    buildId,
    catalogSchemaVersion: 8,
    targetSchemaVersion: 3,
    ...automationDataDigests({ catalog, targets }),
    buildDigest: assetDigest(assets),
    assets,
  };
}
export function validateRevisionManifest(manifest) {
  if (
    !exactKeys(manifest, [
      "schemaVersion",
      "sourceSha",
      "buildId",
      "catalogSchemaVersion",
      "targetSchemaVersion",
      "catalogDigest",
      "targetDigest",
      "buildDigest",
      "assets",
    ]) ||
    manifest.schemaVersion !== 1 ||
    manifest.catalogSchemaVersion !== 8 ||
    manifest.targetSchemaVersion !== 3 ||
    !sha.test(manifest.sourceSha ?? "") ||
    !/^[A-Za-z0-9._-]{1,128}$/u.test(manifest.buildId ?? "") ||
    ![
      manifest.catalogDigest,
      manifest.targetDigest,
      manifest.buildDigest,
    ].every((value) => digest.test(value ?? ""))
  )
    invalid();
  const assets = validateAssets(manifest.assets);
  if (
    JSON.stringify(assets) !== JSON.stringify(manifest.assets) ||
    assetDigest(assets) !== manifest.buildDigest
  )
    invalid("Revision asset integrity metadata is invalid.");
  return structuredClone(manifest);
}
async function boundedFile(path, maxBytes = REVISION_LIMITS.fileBytes) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes)
    invalid("Export assets must be bounded regular files.");
  const bytes = await readFile(path);
  if (bytes.length !== stat.size || bytes.length > maxBytes)
    invalid("Export asset changed during verification.");
  return bytes;
}
export async function readSiteAssets(outputDirectory) {
  const root = resolve(outputDirectory);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    invalid("Export must be a real directory.");
  const assets = [];
  let totalBytes = 0,
    visited = 0;
  async function walk(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > REVISION_LIMITS.files * 2) invalid();
      const path = `${prefix}${entry.name}`,
        absolute = resolve(directory, entry.name);
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) invalid("Export links are forbidden.");
      if (stat.isDirectory()) {
        if (!validSiteAssetPath(path)) invalid();
        await walk(absolute, `${path}/`);
      } else {
        if (!stat.isFile()) invalid();
        if (path === "revision.json") {
          await boundedFile(absolute, REVISION_LIMITS.manifestBytes);
          continue;
        }
        if (!validSiteAssetPath(path) || assets.length >= REVISION_LIMITS.files)
          invalid();
        const content = await boundedFile(absolute);
        totalBytes += content.length;
        if (totalBytes > REVISION_LIMITS.totalBytes) invalid();
        assets.push({
          path,
          bytes: content.length,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      }
    }
  }
  await walk(root);
  return validateAssets(assets);
}
async function manifestInput(outputDirectory, sourceSha, buildId) {
  const files = await readSiteAssets(outputDirectory);
  const [catalog, targets, legacy] = await Promise.all(
    [
      "catalog/tavernary-catalog-v8.json",
      "security/tavernkeeper-targets.json",
      "catalog/tavernary-catalog.json",
    ].map(async (path) =>
      JSON.parse(
        (await boundedFile(resolve(outputDirectory, path))).toString("utf8"),
      ),
    ),
  );
  if (legacy?.schemaVersion !== 7 || !Array.isArray(legacy.projects))
    invalid("Legacy public catalog schema is unsupported.");
  return { sourceSha, buildId, catalog, targets, files };
}
export async function writeRevisionManifest({
  outputDirectory = "out",
  sourceSha,
  buildId,
}) {
  const manifest = buildRevisionManifest(
    await manifestInput(outputDirectory, sourceSha, buildId),
  );
  await writeFile(
    resolve(outputDirectory, "revision.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: "w" },
  );
  return manifest;
}
export async function verifyRevisionExport({
  outputDirectory = "out",
  expectedSourceSha,
  expectedBuildId,
}) {
  const manifest = validateRevisionManifest(
    JSON.parse(
      (
        await boundedFile(
          resolve(outputDirectory, "revision.json"),
          REVISION_LIMITS.manifestBytes,
        )
      ).toString("utf8"),
    ),
  );
  if (
    manifest.sourceSha !== expectedSourceSha ||
    (expectedBuildId !== undefined && manifest.buildId !== expectedBuildId)
  )
    invalid(
      "Export revision source or build identity differs from the expected artifact.",
    );
  const actual = buildRevisionManifest(
    await manifestInput(outputDirectory, manifest.sourceSha, manifest.buildId),
  );
  if (JSON.stringify(actual) !== JSON.stringify(manifest))
    invalid("Export asset integrity verification failed.");
  return manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, sourceSha, buildId] = process.argv.slice(2);
  if (mode === "write") await writeRevisionManifest({ sourceSha, buildId });
  else if (mode === "verify")
    await verifyRevisionExport({
      expectedSourceSha: sourceSha,
      expectedBuildId: buildId,
    });
  else throw new Error("Expected revision-manifest write or verify.");
}
