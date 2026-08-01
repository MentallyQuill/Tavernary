import { lookup as defaultDnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

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

// IANA IPv6 Global Unicast Address Space registry, last updated 2025-10-10:
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/
// Checked 2026-08-01. These are the current ALLOCATED RIR prefixes only;
// the IANA special-purpose and 6to4 rows are deliberately omitted.
const allocatedGlobalUnicastPrefixes = [
  [[0x20, 0x01, 0x02], 23],
  [[0x20, 0x01, 0x04], 23],
  [[0x20, 0x01, 0x06], 23],
  [[0x20, 0x01, 0x08], 22],
  [[0x20, 0x01, 0x0c], 23],
  [[0x20, 0x01, 0x0e], 23],
  [[0x20, 0x01, 0x12], 23],
  [[0x20, 0x01, 0x14], 22],
  [[0x20, 0x01, 0x18], 23],
  [[0x20, 0x01, 0x1a], 23],
  [[0x20, 0x01, 0x1c], 22],
  [[0x20, 0x01, 0x20], 19],
  [[0x20, 0x01, 0x40], 23],
  [[0x20, 0x01, 0x42], 23],
  [[0x20, 0x01, 0x44], 23],
  [[0x20, 0x01, 0x46], 23],
  [[0x20, 0x01, 0x48], 23],
  [[0x20, 0x01, 0x4a], 23],
  [[0x20, 0x01, 0x4c], 23],
  [[0x20, 0x01, 0x50], 20],
  [[0x20, 0x01, 0x80], 19],
  [[0x20, 0x01, 0xa0], 20],
  [[0x20, 0x01, 0xb0], 20],
  [[0x20, 0x03, 0x00], 18],
  [[0x24, 0x00], 12],
  [[0x24, 0x10], 12],
  [[0x26, 0x00], 12],
  [[0x26, 0x10], 23],
  [[0x26, 0x20], 23],
  [[0x26, 0x30], 12],
  [[0x28, 0x00], 12],
  [[0x2a, 0x00], 12],
  [[0x2a, 0x10], 12],
  [[0x2c, 0x00], 12],
];

function isPublicIpv6Address(address) {
  const bytes = parseIpv6Address(address);
  if (!bytes) {
    return false;
  }

  return (
    allocatedGlobalUnicastPrefixes.some(([prefix, prefixLength]) =>
      hasIpv6Prefix(bytes, prefix, prefixLength),
    ) && !hasIpv6Prefix(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)
  );
}

function isPublicIpv4Address(address) {
  const octets = address.split(".").map(Number);
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

function isPublicAddress(address, family) {
  const actualFamily = isIP(address);
  if (actualFamily !== family) {
    return false;
  }
  if (actualFamily === 6) {
    return isPublicIpv6Address(address);
  }
  return actualFamily === 4 && isPublicIpv4Address(address);
}

function timeoutError(resourceLabel) {
  return new Error(`${resourceLabel} request timed out`);
}

function beforeDeadline(promise, signal, resourceLabel) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(timeoutError(resourceLabel));
    if (signal.aborted) {
      void Promise.resolve(promise).catch(() => {});
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

async function resolvePublicDns(url, dnsLookup, signal, resourceLabel) {
  const records = await beforeDeadline(
    dnsLookup(url.hostname, { all: true }),
    signal,
    resourceLabel,
  );
  const addresses = (Array.isArray(records) ? records : [records]).map(
    (record) => ({ address: record?.address, family: record?.family }),
  );
  if (
    addresses.length === 0 ||
    addresses.some(
      ({ address, family }) =>
        typeof address !== "string" ||
        (family !== 4 && family !== 6) ||
        !isPublicAddress(address, family),
    )
  ) {
    throw new Error(`${resourceLabel} host does not resolve publicly`);
  }
  return addresses;
}

function createBoundLookup(hostname, addresses, resourceLabel) {
  return (requestedHostname, options, callback) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      callback(
        new Error(`${resourceLabel} transport requested an unexpected host`),
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

function cancelWithoutWaiting(cancel, signal, resourceLabel) {
  try {
    void beforeDeadline(cancel(), signal, resourceLabel).catch(() => {});
  } catch {
    // Cancellation is best effort and must never mask the boundary failure.
  }
}

function cancelBody(response, signal, resourceLabel) {
  if (response.body) {
    cancelWithoutWaiting(() => response.body.cancel(), signal, resourceLabel);
  }
}

function assertContentLength(response, maxResponseBytes, resourceLabel) {
  const value = response.headers.get("content-length");
  if (value === null) {
    return;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${resourceLabel} response size is invalid`);
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > maxResponseBytes) {
    throw new Error(`${resourceLabel} response exceeds the size limit`);
  }
}

async function readBoundedResponse(
  response,
  signal,
  maxResponseBytes,
  resourceLabel,
) {
  assertContentLength(response, maxResponseBytes, resourceLabel);
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
      result = await beforeDeadline(reader.read(), signal, resourceLabel);
    } catch (error) {
      cancelWithoutWaiting(() => reader.cancel(), signal, resourceLabel);
      throw error;
    }
    const { done, value } = result;
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxResponseBytes) {
      cancelWithoutWaiting(() => reader.cancel(), signal, resourceLabel);
      throw new Error(`${resourceLabel} response exceeds the size limit`);
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

export async function fetchHardenedJson(options) {
  const { assertInitialUrl, assertRedirectUrl, resourceLabel } = options;
  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;
  const requestImpl =
    options.requestImpl ??
    (options.fetchImpl
      ? (url, requestOptions) =>
          requestInjectedFetch(options.fetchImpl, url, requestOptions)
      : requestBoundHttps);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error(`${resourceLabel} timeout is invalid`);
  }

  let current = new URL(options.url);
  assertInitialUrl(current);
  let redirects = 0;

  while (true) {
    const signal = AbortSignal.timeout(timeoutMs);
    const addresses = await resolvePublicDns(
      current,
      dnsLookup,
      signal,
      resourceLabel,
    );
    const response = await beforeDeadline(
      requestImpl(current.toString(), {
        headers: { accept: "application/json" },
        signal,
        lookup: createBoundLookup(current.hostname, addresses, resourceLabel),
      }),
      signal,
      resourceLabel,
    );

    if (redirectStatuses.has(response.status)) {
      cancelBody(response, signal, resourceLabel);
      if (redirects >= 2) {
        throw new Error(`${resourceLabel} redirect limit exceeded`);
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`${resourceLabel} redirect has no location`);
      }
      current = new URL(location, current);
      assertRedirectUrl(current);
      redirects += 1;
      continue;
    }
    if (response.status === 404 && options.notFoundError) {
      cancelBody(response, signal, resourceLabel);
      throw options.notFoundError();
    }
    if (response.status < 200 || response.status >= 300) {
      cancelBody(response, signal, resourceLabel);
      throw new Error(
        `${resourceLabel} request returned HTTP ${response.status}`,
      );
    }
    if (!isJsonResponse(response)) {
      cancelBody(response, signal, resourceLabel);
      throw new Error(`${resourceLabel} response is not JSON`);
    }

    try {
      return JSON.parse(
        await readBoundedResponse(
          response,
          signal,
          DEFAULT_MAX_RESPONSE_BYTES,
          resourceLabel,
        ),
      );
    } catch (error) {
      cancelBody(response, signal, resourceLabel);
      if (error instanceof SyntaxError) {
        throw new Error(`${resourceLabel} response is not valid JSON`);
      }
      throw error;
    }
  }
}
