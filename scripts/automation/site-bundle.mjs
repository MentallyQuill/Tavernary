import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import targetSchema from "../../data/schemas/tavernkeeper-targets.v3.schema.json" with { type: "json" };
import { lstat, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { catalogV7Schema } from "../../packages/catalog-core/src/catalog-v7-schema.ts";
import { createCatalogV8Schema } from "../../packages/catalog-core/src/catalog-v8-schema-factory.mjs";
import {
  buildRevisionManifest,
  validateRevisionManifest,
  validSiteAssetPath,
  verifyRevisionExport,
} from "./revision-manifest.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";

export const SITE_BUNDLE_LIMITS = Object.freeze({
  archiveBytes: 128 * 1024 * 1024,
  payloadBytes: 256 * 1024 * 1024,
  headerBytes: 32 * 1024 * 1024,
  files: 50001,
});
const magic = Buffer.from("TAVERNARY-SITE-BUNDLE-1\n", "ascii"),
  digest = /^sha256:[a-f0-9]{64}$/u;
function fail() {
  throw Object.assign(
    new Error("Site bundle integrity, schema or format is invalid."),
    { code: "validation-failed" },
  );
}
function bytes(value) {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]"
  );
}
const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
const same = (a, b) =>
  fingerprintProjectPublicationInput(a) ===
  fingerprintProjectPublicationInput(b);
const ajv = new Ajv({ allErrors: false, strict: false });
addFormats(ajv);
const controls = (value) => /[\u0000-\u001f\u007f-\u009f]/u.test(value);
function safeHttp(value) {
  try {
    const url = new URL(value);
    return (
      !controls(value) &&
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !!url.hostname
    );
  } catch {
    return false;
  }
}
ajv.addFormat("safe-http-url", { type: "string", validate: safeHttp });
ajv.addFormat("safe-navigation-url", {
  type: "string",
  validate: (value) =>
    safeHttp(value) ||
    (value.startsWith("/") &&
      !value.startsWith("//") &&
      !value.includes("\\") &&
      !controls(value) &&
      new URL(value, "https://tavernary.invalid/").origin ===
        "https://tavernary.invalid"),
});
const schemas = [
  ajv.compile(catalogV7Schema),
  ajv.compile(createCatalogV8Schema(catalogV7Schema)),
  ajv.compile(targetSchema),
];
function validateCatalogSemantics(catalog) {
  for (const records of [catalog.projects, catalog.kits, catalog.tagVocabulary])
    if (new Set(records.map((record) => record.id)).size !== records.length)
      fail();
  for (const project of catalog.projects) {
    const install = project.install;
    if (
      install &&
      (!safeHttp(install.repositoryUrl) ||
        new URL(install.repositoryUrl).protocol !== "https:" ||
        /[\\/:\u0000-\u0020]/u.test(install.folderName))
    )
      fail();
  }
}
export function validateSiteBundle({ manifest, entries, archiveDigest }) {
  manifest = validateRevisionManifest(manifest);
  if (
    !digest.test(archiveDigest ?? "") ||
    !Array.isArray(entries) ||
    entries.length !== manifest.assets.length + 1 ||
    entries.length > SITE_BUNDLE_LIMITS.files
  )
    fail();
  let total = 0;
  const assets = new Map(manifest.assets.map((asset) => [asset.path, asset])),
    files = new Map();
  for (const entry of entries) {
    if (
      !entry ||
      Object.keys(entry).length !== 3 ||
      !["path", "type", "content"].every((key) => Object.hasOwn(entry, key)) ||
      entry.type !== "file" ||
      (entry.path !== "revision.json" && !validSiteAssetPath(entry.path)) ||
      files.has(entry.path) ||
      !bytes(entry.content) ||
      entry.content.byteLength >
        (entry.path === "revision.json" ? 16 * 1024 * 1024 : 64 * 1024 * 1024)
    )
      fail();
    total += entry.content.byteLength;
    if (total > SITE_BUNDLE_LIMITS.payloadBytes) fail();
    if (entry.path !== "revision.json") {
      const asset = assets.get(entry.path);
      if (
        !asset ||
        asset.bytes !== entry.content.byteLength ||
        asset.sha256 !== hash(entry.content)
      )
        fail();
    }
    files.set(entry.path, entry);
  }
  if (
    !files.has("revision.json") ||
    manifest.assets.some((asset) => !files.has(asset.path)) ||
    !same(
      validateRevisionManifest(json(files.get("revision.json").content)),
      manifest,
    )
  )
    fail();
  const [legacy, catalog, targets] = [
    "catalog/tavernary-catalog.json",
    "catalog/tavernary-catalog-v8.json",
    "security/tavernkeeper-targets.json",
  ].map((path) => json(files.get(path).content));
  if (!schemas[0](legacy) || !schemas[1](catalog) || !schemas[2](targets))
    fail();
  validateCatalogSemantics(legacy);
  validateCatalogSemantics(catalog);
  const ranks = targets.repositories.map(
    (repository) => repository.catalog_priority.popularity_rank,
  );
  if (new Set(ranks).size !== ranks.length) fail();
  const actual = buildRevisionManifest({
    sourceSha: manifest.sourceSha,
    buildId: manifest.buildId,
    catalog,
    targets,
    files: manifest.assets,
  });
  if (!same(actual, manifest)) fail();
  const projects = [
    ...catalog.projects,
    ...catalog.kits.flatMap((kit) =>
      kit.components.flatMap((component) =>
        component.project ? [component.project] : [],
      ),
    ),
  ];
  return {
    manifest,
    entries: [...entries].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
    archiveDigest,
    listedSourceIds: [
      ...new Set([
        ...targets.repositories.map((repository) => repository.source_id),
        ...projects.flatMap((project) =>
          project.search.source.filter((value) =>
            /^(?:github|codeberg)-[1-9]\d*$/u.test(value),
          ),
        ),
      ]),
    ].sort(),
    listedProjectIds: [
      ...new Set(projects.map((project) => project.id)),
    ].sort(),
    listedKitIds: catalog.kits.map((kit) => kit.id).sort(),
  };
}
export function encodeSiteBundle({ manifest, entries }) {
  const verified = validateSiteBundle({
    manifest,
    entries,
    archiveDigest: `sha256:${"0".repeat(64)}`,
  });
  const header = Buffer.from(
    JSON.stringify({
      format: "tavernary-site-bundle",
      version: 1,
      manifest: verified.manifest,
      entries: verified.entries.map((entry) => ({
        path: entry.path,
        type: entry.type,
        bytes: entry.content.byteLength,
      })),
    }),
  );
  if (header.byteLength > SITE_BUNDLE_LIMITS.headerBytes) fail();
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.byteLength);
  const archive = gzipSync(
    Buffer.concat([
      magic,
      length,
      header,
      ...verified.entries.map((entry) => Buffer.from(entry.content)),
    ]),
    { level: 9 },
  );
  if (archive.length > SITE_BUNDLE_LIMITS.archiveBytes) fail();
  return { archive, archiveDigest: `sha256:${hash(archive)}` };
}
export function decodeSiteBundle({ archive, archiveDigest }) {
  if (
    !bytes(archive) ||
    archive.byteLength < 20 ||
    archive.byteLength > SITE_BUNDLE_LIMITS.archiveBytes ||
    !digest.test(archiveDigest ?? "") ||
    `sha256:${hash(archive)}` !== archiveDigest
  )
    fail();
  const payload = gunzipSync(archive, {
    maxOutputLength:
      SITE_BUNDLE_LIMITS.payloadBytes +
      SITE_BUNDLE_LIMITS.headerBytes +
      magic.length +
      4,
  });
  if (
    payload.length < magic.length + 4 ||
    !payload.subarray(0, magic.length).equals(magic)
  )
    fail();
  const size = payload.readUInt32BE(magic.length);
  let offset = magic.length + 4;
  if (
    size < 2 ||
    size > SITE_BUNDLE_LIMITS.headerBytes ||
    size > payload.length - offset
  )
    fail();
  const header = json(payload.subarray(offset, offset + size));
  offset += size;
  if (
    !header ||
    Object.keys(header).length !== 4 ||
    header.format !== "tavernary-site-bundle" ||
    header.version !== 1 ||
    !Array.isArray(header.entries) ||
    header.entries.length > SITE_BUNDLE_LIMITS.files
  )
    fail();
  const entries = [];
  let total = 0;
  for (const entry of header.entries) {
    if (
      !entry ||
      Object.keys(entry).length !== 3 ||
      !["path", "type", "bytes"].every((key) => Object.hasOwn(entry, key)) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.bytes > 64 * 1024 * 1024 ||
      entry.bytes > payload.length - offset
    )
      fail();
    total += entry.bytes;
    if (total > SITE_BUNDLE_LIMITS.payloadBytes) fail();
    entries.push({
      path: entry.path,
      type: entry.type,
      content: new Uint8Array(payload.subarray(offset, offset + entry.bytes)),
    });
    offset += entry.bytes;
  }
  if (offset !== payload.length) fail();
  return validateSiteBundle({
    manifest: header.manifest,
    entries,
    archiveDigest,
  });
}
export async function createSiteBundle({
  outputDirectory = "out",
  sourceSha,
  buildId,
}) {
  const manifest = await verifyRevisionExport({
    outputDirectory,
    expectedSourceSha: sourceSha,
    expectedBuildId: buildId,
  });
  const entries = [];
  let total = 0;
  for (const path of [
    ...manifest.assets.map((asset) => asset.path),
    "revision.json",
  ]) {
    const absolute = resolve(outputDirectory, path),
      stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024)
      fail();
    total += stat.size;
    if (total > SITE_BUNDLE_LIMITS.payloadBytes) fail();
    entries.push({
      path,
      type: "file",
      content: new Uint8Array(await readFile(absolute)),
    });
  }
  return encodeSiteBundle({ manifest, entries });
}
export async function restoreSiteBundle({ verified, outputDirectory }) {
  const bundle = validateSiteBundle(verified),
    root = resolve(outputDirectory);
  // Create a new tree; reject any existing parent link before writing data.
  let ancestor = dirname(root);
  for (;;) {
    const stat = await lstat(ancestor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail();
    const next = dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }
  await mkdir(root, { recursive: false });
  for (const entry of bundle.entries) {
    const path = resolve(root, entry.path);
    if (!path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) fail();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, entry.content, { flag: "wx" });
  }
  await verifyRevisionExport({
    outputDirectory: root,
    expectedSourceSha: bundle.manifest.sourceSha,
    expectedBuildId: bundle.manifest.buildId,
  });
  return bundle.manifest;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, inputPath, digestOrSource, outputOrBuild] =
    process.argv.slice(2);
  if (mode === "create") {
    const result = await createSiteBundle({
      sourceSha: digestOrSource,
      buildId: outputOrBuild,
    });
    await mkdir(dirname(resolve(inputPath)), { recursive: true });
    await writeFile(inputPath, result.archive, { flag: "wx" });
    console.log(JSON.stringify({ archiveDigest: result.archiveDigest }));
  } else if (mode === "verify" || mode === "restore") {
    const stat = await lstat(inputPath);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > SITE_BUNDLE_LIMITS.archiveBytes
    )
      fail();
    const verified = decodeSiteBundle({
      archive: new Uint8Array(await readFile(inputPath)),
      archiveDigest: digestOrSource,
    });
    if (mode === "restore") {
      if (!outputOrBuild) fail();
      await restoreSiteBundle({ verified, outputDirectory: outputOrBuild });
    }
    console.log(
      JSON.stringify({
        status: "verified",
        sourceSha: verified.manifest.sourceSha,
        buildDigest: verified.manifest.buildDigest,
        archiveDigest: verified.archiveDigest,
      }),
    );
  } else fail();
}
