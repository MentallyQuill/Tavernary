const codebergApi = "https://codeberg.org/api/v1";
const defaultMaximumBodyBytes = 5 * 1024 * 1024;
const defaultTimeoutMs = 15_000;

export class CodebergRequestError extends Error {
  constructor(message, details = {}) {
    super(message, details.cause ? { cause: details.cause } : undefined);
    this.name = "CodebergRequestError";
    this.status = details.status ?? null;
    this.retryable = details.retryable ?? false;
    this.code = details.code ?? "request-failed";
  }
}

function numericParameter(value, parameter) {
  const match = value?.match(new RegExp(`(?:^|;)${parameter}=(\\d+)`, "u"));
  return match ? Number(match[1]) : null;
}

export function parseCodebergRateLimit(headers) {
  const policy = headers.get("ratelimit-policy");
  const current = headers.get("ratelimit");
  const limit = numericParameter(policy, "q");
  const remaining = numericParameter(current, "r");
  const resetSeconds =
    numericParameter(current, "t") ?? numericParameter(policy, "w");
  if (limit === null && remaining === null && resetSeconds === null)
    return null;
  return { limit, remaining, resetSeconds };
}

function validatePath(path) {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.includes("://")
  ) {
    throw new CodebergRequestError("Codeberg API path must be relative", {
      code: "unsafe-path",
    });
  }
  if (
    path.includes("\r") ||
    path.includes("\n") ||
    /(?:^|\/)\.\.(?:\/|$|\?)/u.test(path)
  ) {
    throw new CodebergRequestError("Codeberg API path is unsafe", {
      code: "unsafe-path",
    });
  }
}

function statusDetails(status) {
  if (status === 404) return { retryable: false, code: "not-found" };
  if (status === 429) return { retryable: true, code: "rate-limited" };
  if (status >= 500) return { retryable: true, code: "server-error" };
  if (status === 401 || status === 403) {
    return { retryable: false, code: "authentication-failed" };
  }
  return { retryable: false, code: "request-failed" };
}

export async function codebergRequest(path, options = {}) {
  validatePath(path);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? defaultTimeoutMs,
  );
  const token = options.token ?? process.env.CODEBERG_TOKEN;
  let response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${codebergApi}${path}`, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `token ${token}` } : {}),
        "User-Agent": "Tavernary-Codeberg-provider",
      },
      signal: controller.signal,
    });
  } catch (cause) {
    throw new CodebergRequestError("Codeberg API request failed", {
      cause,
      retryable: true,
      code: cause?.name === "AbortError" ? "timeout" : "network-error",
    });
  } finally {
    clearTimeout(timeout);
  }

  const rateLimit = parseCodebergRateLimit(response.headers);
  if (!response.ok) {
    throw new CodebergRequestError(
      `Codeberg API request failed with status ${response.status}`,
      { status: response.status, ...statusDetails(response.status) },
    );
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/(?:application\/json|\+json)(?:;|$)/iu.test(contentType)) {
    throw new CodebergRequestError("Codeberg API returned non-JSON content", {
      status: response.status,
      retryable: true,
      code: "invalid-content-type",
    });
  }
  const maximumBodyBytes = options.maximumBodyBytes ?? defaultMaximumBodyBytes;
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    throw new CodebergRequestError("Codeberg API response is too large", {
      status: response.status,
      retryable: false,
      code: "response-too-large",
    });
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maximumBodyBytes) {
    throw new CodebergRequestError("Codeberg API response is too large", {
      status: response.status,
      retryable: false,
      code: "response-too-large",
    });
  }
  let data;
  try {
    data = JSON.parse(body);
  } catch (cause) {
    throw new CodebergRequestError("Codeberg API returned invalid JSON", {
      status: response.status,
      retryable: true,
      code: "invalid-json",
      cause,
    });
  }
  return { data, status: response.status, rateLimit };
}

export async function listReleases(repository, options = {}) {
  try {
    const response = await codebergRequest(
      `/repos/${repository}/releases?limit=1`,
      options,
    );
    return { data: response.data, requestCount: 1 };
  } catch (error) {
    if (error?.status === 404) return { data: [], requestCount: 1 };
    throw error;
  }
}
