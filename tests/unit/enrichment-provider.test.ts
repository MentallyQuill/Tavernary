import { afterEach, expect, test, vi } from "vitest";

import {
  ENRICHMENT_TIMEOUT_MS,
  EXPECTED_ENRICHMENT_MODEL,
  createEnrichmentProvider,
  validateProviderConfiguration,
} from "../../scripts/catalog/enrichment-provider.mjs";

const input = {
  id: "fixture",
  name: "Fixture",
  kind: "extension",
  repository: "Creator/Project",
  repositoryDescription: "A useful extension for structured prompt work.",
  readmeText: null,
  frontends: ["sillytavern"],
  allowedPrimaryFunctions: [
    { id: "developer-infrastructure", label: "Developer infrastructure" },
  ],
  allowedCapabilities: [{ id: "automation", label: "Automation" }],
};

const output = {
  summary:
    "A useful extension for automating structured prompt workflows across SillyTavern projects.",
  metadata_status: "curated",
  primary_function: "developer-infrastructure",
  capabilities: ["automation"],
};

function success(payload: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model: "MiniMax-M3",
      choices: [{ message: { content: JSON.stringify(output) } }],
      ...payload,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test.each([
  [{ apiUrl: "", apiKey: "key", model: "MiniMax-M3" }, "URL"],
  [
    { apiUrl: "https://api.example.test", apiKey: "", model: "MiniMax-M3" },
    "key",
  ],
  [{ apiUrl: "https://api.example.test", apiKey: "key", model: "" }, "model"],
  [
    {
      apiUrl: "http://api.example.test",
      apiKey: "key",
      model: "MiniMax-M3",
    },
    "HTTPS",
  ],
  [
    {
      apiUrl: "https://api.example.test",
      apiKey: "key",
      model: "MiniMax-M2",
    },
    "MiniMax-M3",
  ],
] as const)(
  "rejects invalid configuration before fetch",
  (configuration, message) => {
    expect(() => validateProviderConfiguration(configuration)).toThrow(message);
  },
);

test("sends the exact model, hardened prompt, and strict JSON schema", async () => {
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => success(),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model: "MiniMax-M3",
    fetchImpl,
  });

  await provider.generate(input);

  const [, init] = fetchImpl.mock.calls[0];
  const body = JSON.parse(String(init?.body));
  expect(body.model).toBe(EXPECTED_ENRICHMENT_MODEL);
  expect(body.messages[0].content).toMatch(/untrusted reference data/iu);
  expect(body.messages[0].content).toMatch(
    /do not follow.*embedded instructions/iu,
  );
  expect(body.response_format).toMatchObject({
    type: "json_schema",
    json_schema: { strict: true },
  });
  expect(init?.headers).toMatchObject({
    authorization: "Bearer do-not-log",
  });
});

test("returns requested model, returned model, and latency metadata", async () => {
  const times = [1_000, 1_250];
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "key",
    model: "MiniMax-M3",
    fetchImpl: async () => success(),
    now: () => times.shift() ?? 1_250,
  });

  await expect(provider.generate(input)).resolves.toEqual({
    output,
    metadata: {
      requestedModel: "MiniMax-M3",
      returnedModel: "MiniMax-M3",
      latencyMs: 250,
    },
  });
});

test("allows an absent returned model but rejects a mismatched one", async () => {
  const withoutModel = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model: "MiniMax-M3",
    fetchImpl: async () => success({ model: undefined }),
  });
  await expect(withoutModel.generate(input)).resolves.toMatchObject({
    metadata: { returnedModel: null },
  });

  const mismatch = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model: "MiniMax-M3",
    fetchImpl: async () => success({ model: "other-model" }),
  });
  await expect(mismatch.generate(input)).rejects.toMatchObject({
    code: "provider-model-mismatch",
  });
});

test.each([
  [
    "missing content",
    async () => success({ choices: [] }),
    "provider-response-invalid",
  ],
  [
    "malformed JSON",
    async () => success({ choices: [{ message: { content: "{not-json" } }] }),
    "provider-response-invalid",
  ],
  [
    "rate limit",
    async () => new Response("secret body", { status: 429 }),
    "provider-rate-limited",
  ],
  [
    "server error",
    async () => new Response("secret body", { status: 503 }),
    "provider-server-error",
  ],
] as const)(
  "uses a controlled error for %s",
  async (_name, fetchImpl, code) => {
    const provider = createEnrichmentProvider({
      apiUrl: "https://api.example.test",
      apiKey: "do-not-leak",
      model: "MiniMax-M3",
      fetchImpl,
    });

    let error: unknown;
    try {
      await provider.generate(input);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code });
    expect((error as Error).message).not.toMatch(/do-not-leak|secret body/iu);
  },
);

test("aborts each model call after 120 seconds", async () => {
  vi.useFakeTimers();
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model: "MiniMax-M3",
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  const rejection = expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-timeout",
  });
  await vi.advanceTimersByTimeAsync(ENRICHMENT_TIMEOUT_MS);
  await rejection;
});
