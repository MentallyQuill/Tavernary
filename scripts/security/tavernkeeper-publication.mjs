import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fetchHardenedJson } from "./hardened-json-fetch.mjs";

export const TAVERNARY_ORIGIN = "https://tavernary.org";
export const TAVERNARY_TARGET_MANIFEST_URL =
  "https://tavernary.org/security/tavernkeeper-targets.json";

function canonicalize(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(
        "TavernKeeper target manifest contains a non-finite number",
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error("TavernKeeper target manifest is not canonical JSON");
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function parseManifest(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(readFileSync(value, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("TavernKeeper target manifest is not valid JSON");
      }
      throw error;
    }
  }
  return value;
}

export function manifestDigest(manifestOrPath) {
  const manifest = parseManifest(manifestOrPath);
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    Array.isArray(manifest)
  ) {
    throw new Error("TavernKeeper target manifest must be a JSON object");
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(manifest)), "utf8")
    .digest("hex");
}

function assertPublicManifestUrl(url) {
  if (
    url.protocol !== "https:" ||
    url.origin !== TAVERNARY_ORIGIN ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/security/tavernkeeper-targets.json" ||
    url.search ||
    url.hash
  ) {
    throw new Error("TavernKeeper public manifest URL is unsafe");
  }
}

function missingManifestError() {
  const error = new Error("TavernKeeper public manifest is not published yet");
  error.code = "TAVERNKEEPER_MANIFEST_NOT_FOUND";
  return error;
}

export async function readPublicManifest(url, options = {}) {
  const manifest = await fetchHardenedJson({
    url,
    resourceLabel: "TavernKeeper public manifest",
    assertInitialUrl: assertPublicManifestUrl,
    assertRedirectUrl: assertPublicManifestUrl,
    notFoundError: missingManifestError,
    timeoutMs: options.timeoutMs,
    dnsLookup: options.dnsLookup,
    requestImpl: options.requestImpl,
    fetchImpl: options.fetchImpl,
  });
  manifestDigest(manifest);
  return manifest;
}

export async function verifyPublicManifest(url, expectedDigest, options = {}) {
  if (!/^[0-9a-f]{64}$/u.test(expectedDigest)) {
    throw new Error("TavernKeeper expected public manifest digest is invalid");
  }
  const manifest = await readPublicManifest(url, options);
  const actualDigest = manifestDigest(manifest);
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `TavernKeeper public manifest digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
    );
  }
  return manifest;
}

async function main() {
  const [command, value, expectedDigest] = process.argv.slice(2);
  if (command === "digest" && value) {
    console.log(manifestDigest(value));
    return;
  }
  if (command === "read" && value) {
    console.log(manifestDigest(await readPublicManifest(value)));
    return;
  }
  if (command === "verify" && value && expectedDigest) {
    console.log(
      manifestDigest(await verifyPublicManifest(value, expectedDigest)),
    );
    return;
  }
  throw new Error(
    "Usage: tavernkeeper-publication.mjs <digest path|read url|verify url digest>",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await main();
  } catch (error) {
    if (error?.code === "TAVERNKEEPER_MANIFEST_NOT_FOUND") {
      process.exitCode = 2;
    } else {
      throw error;
    }
  }
}
