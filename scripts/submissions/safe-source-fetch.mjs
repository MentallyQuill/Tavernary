import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

function unsafeSource() {
  return new Error("Project URL must be a safe public HTTPS source.");
}

function literalHostname(url) {
  return url.hostname.replace(/^\[|\]$/gu, "");
}

function assertSafeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw unsafeSource();
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(literalHostname(url)) !== 0
  ) {
    throw unsafeSource();
  }
  return url;
}

function publicIpv4(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function publicIpv6(address) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    return publicIpv4(normalized.slice("::ffff:".length));
  }
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    /^f[cd]/u.test(normalized) ||
    /^fe[89ab]/u.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8:")
  );
}

function publicAddress(address) {
  const family = isIP(address);
  return family === 4
    ? publicIpv4(address)
    : family === 6 && publicIpv6(address);
}

async function assertPublicResolution(url, lookup) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  const results = Array.isArray(addresses) ? addresses : [addresses];
  if (
    results.length === 0 ||
    results.some(({ address }) => !publicAddress(address))
  ) {
    throw unsafeSource();
  }
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Project source response exceeds the safe size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function safeRequest(value, options, readBody) {
  const maxBytes = options.maxBytes ?? 262_144;
  const maxRedirects = options.maxRedirects ?? 3;
  const lookup = options.lookup ?? dnsLookup;
  const fetchImpl = options.fetchImpl ?? fetch;
  const redirects = [];
  let current = assertSafeUrl(value);

  for (
    let redirectCount = 0;
    redirectCount <= maxRedirects;
    redirectCount += 1
  ) {
    await assertPublicResolution(current, lookup);
    const response = await fetchImpl(current.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        Range: `bytes=0-${maxBytes - 1}`,
        ...(options.headers ?? {}),
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirectCount === maxRedirects) {
        throw new Error("Project source exceeded the safe redirect limit.");
      }
      const location = response.headers.get("location");
      if (!location)
        throw new Error("Project source redirect is missing a location.");
      const next = assertSafeUrl(new URL(location, current).toString());
      if (
        options.allowedRedirectHosts &&
        !options.allowedRedirectHosts.has(next.hostname.toLowerCase())
      ) {
        throw unsafeSource();
      }
      redirects.push(next.toString());
      current = next;
      continue;
    }

    const lengthHeader = response.headers.get("content-length");
    const contentLength =
      lengthHeader === null ? null : Number.parseInt(lengthHeader, 10);
    if (contentLength !== null && contentLength > maxBytes) {
      throw new Error("Project source response exceeds the safe size limit.");
    }
    const result = {
      finalUrl: current.toString(),
      status: response.status,
      contentType: response.headers.get("content-type"),
      contentLength,
      redirects,
    };
    return readBody
      ? { ...result, body: await readBoundedBody(response, maxBytes) }
      : result;
  }
  throw new Error("Project source exceeded the safe redirect limit.");
}

export async function safeProbe(value, options = {}) {
  return safeRequest(value, options, false);
}

export async function safeReadSource(value, options = {}) {
  return safeRequest(value, options, true);
}
