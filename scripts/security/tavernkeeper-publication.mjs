import { createHash } from "node:crypto";
import { lookup as defaultDnsLookup } from "node:dns/promises";
import { readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

export const TAVERNARY_ORIGIN = "https://mentallyquill.github.io";
export const TAVERNARY_TARGET_MANIFEST_URL =
  "https://mentallyquill.github.io/Tavernary/security/tavernkeeper-targets.json";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

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
    url.pathname !== "/Tavernary/security/tavernkeeper-targets.json" ||
    url.search ||
    url.hash
  ) {
    throw new Error("TavernKeeper public manifest URL is unsafe");
  }
}

function isPublicAddress(address) {
  if (typeof address !== "string") {
    return false;
  }
  if (isIP(address) === 6) {
    return isPublicIpv6Address(address);
  }

  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && octets[2] === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 203 && second === 0 && octets[2] === 113)
  );
}

function expandIpv4Group(group) {
  if (!group.includes(".")) {
    return [group];
  }
  const octets = group.split(".").map(Number);
  return [
    ((octets[0] << 8) | octets[1]).toString(16),
    ((octets[2] << 8) | octets[3]).toString(16),
  ];
}

function parseIpv6Address(address) {
  const [leftText, rightText] = address.toLowerCase().split("::");
  const left = leftText ? leftText.split(":").flatMap(expandIpv4Group) : [];
  const right = rightText ? rightText.split(":").flatMap(expandIpv4Group) : [];
  const hasCompression = address.includes("::");
  const missing = 8 - left.length - right.length;
  const groups = hasCompression
    ? [...left, ...Array(missing).fill("0"), ...right]
    : [...left, ...right];
  if (groups.length !== 8 || missing < 0) {
    return null;
  }
  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function hasIpv6Prefix(bytes, prefix, prefixLength) {
  const wholeBytes = Math.floor(prefixLength / 8);
  const remainingBits = prefixLength % 8;
  if (
    bytes.slice(0, wholeBytes).some((byte, index) => byte !== prefix[index])
  ) {
    return false;
  }
  if (remainingBits === 0) {
    return true;
  }
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (bytes[wholeBytes] & mask) === (prefix[wholeBytes] & mask);
}

function isPublicIpv6Address(address) {
  const bytes = parseIpv6Address(address);
  if (!bytes) {
    return false;
  }

  // IANA IPv6 Special-Purpose Address Registry, last updated 2025-10-09:
  // https://www.iana.org/assignments/iana-ipv6-special-registry/
  // Checked 2026-08-01. This fixed GitHub Pages fetcher allows only ordinary
  // global-unicast space and conservatively excludes every listed carve-out.
  if ((bytes[0] & 0xe0) !== 0x20) {
    return false;
  }
  return !(
    hasIpv6Prefix(bytes, [0x20, 0x01], 23) ||
    hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32) ||
    hasIpv6Prefix(bytes, [0x20, 0x02], 16) ||
    hasIpv6Prefix(bytes, [0x3f, 0xff, 0x00], 20)
  );
}

function requestTimeoutError() {
  return new Error("TavernKeeper public manifest request timed out");
}

function beforeDeadline(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(requestTimeoutError());
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

async function resolvePublicDns(url, dnsLookup) {
  const records = await dnsLookup(url.hostname, { all: true });
  const addresses = Array.isArray(records) ? records : [records];
  if (
    addresses.length === 0 ||
    addresses.some((record) => !record || !isPublicAddress(record.address))
  ) {
    throw new Error(
      "TavernKeeper public manifest host does not resolve publicly",
    );
  }
  return addresses;
}

function createBoundLookup(hostname, addresses) {
  return (requestedHostname, options, callback) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      callback(
        new Error("TavernKeeper transport requested an unexpected host"),
      );
      return;
    }
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    const [first] = addresses;
    callback(null, first.address, first.family);
  };
}

function responseHeaders(headers) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        result.append(name, entry);
      }
    } else if (value !== undefined) {
      result.set(name, value);
    }
  }
  return result;
}

function requestBoundHttps(url, options) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        agent: false,
        headers: options.headers,
        lookup: options.lookup,
        method: "GET",
        signal: options.signal,
      },
      (response) => {
        resolve({
          body: Readable.toWeb(response),
          headers: responseHeaders(response.headers),
          status: response.statusCode ?? 0,
        });
      },
    );
    request.once("error", reject);
    request.end();
  });
}

function requestInjectedFetch(fetchImpl, url, options) {
  return fetchImpl(url, {
    headers: options.headers,
    redirect: "manual",
    signal: options.signal,
  });
}

function contentLength(response) {
  const value = response.headers.get("content-length");
  if (value === null) {
    return;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error("TavernKeeper public manifest response size is invalid");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > MAX_RESPONSE_BYTES) {
    throw new Error(
      "TavernKeeper public manifest response exceeds the size limit",
    );
  }
}

async function readBoundedResponse(response, signal) {
  contentLength(response);
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    let result;
    try {
      result = await beforeDeadline(reader.read(), signal);
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    }
    const { done, value } = result;
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      void reader.cancel().catch(() => {});
      throw new Error(
        "TavernKeeper public manifest response exceeds the size limit",
      );
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function isJsonResponse(response) {
  return /^application\/json(?:\s*;|$)/iu.test(
    response.headers.get("content-type") ?? "",
  );
}

function missingManifestError() {
  const error = new Error("TavernKeeper public manifest is not published yet");
  error.code = "TAVERNKEEPER_MANIFEST_NOT_FOUND";
  return error;
}

export async function readPublicManifest(url, options = {}) {
  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;
  const requestImpl =
    options.requestImpl ??
    (options.fetchImpl
      ? (requestUrl, requestOptions) =>
          requestInjectedFetch(options.fetchImpl, requestUrl, requestOptions)
      : requestBoundHttps);
  let current = new URL(url);
  assertPublicManifestUrl(current);
  let redirects = 0;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("TavernKeeper public manifest timeout is invalid");
  }

  while (true) {
    const signal = AbortSignal.timeout(timeoutMs);
    const addresses = await beforeDeadline(
      resolvePublicDns(current, dnsLookup),
      signal,
    );
    const response = await beforeDeadline(
      requestImpl(current.toString(), {
        headers: { accept: "application/json" },
        signal,
        lookup: createBoundLookup(current.hostname, addresses),
      }),
      signal,
    );

    if (redirectStatuses.has(response.status)) {
      if (redirects >= 2) {
        throw new Error("TavernKeeper public manifest redirect limit exceeded");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          "TavernKeeper public manifest redirect has no location",
        );
      }
      current = new URL(location, current);
      assertPublicManifestUrl(current);
      redirects += 1;
      continue;
    }
    if (response.status === 404) {
      throw missingManifestError();
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `TavernKeeper public manifest request returned HTTP ${response.status}`,
      );
    }
    if (!isJsonResponse(response)) {
      throw new Error("TavernKeeper public manifest response is not JSON");
    }
    try {
      const manifest = JSON.parse(await readBoundedResponse(response, signal));
      manifestDigest(manifest);
      return manifest;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          "TavernKeeper public manifest response is not valid JSON",
        );
      }
      throw error;
    }
  }
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
