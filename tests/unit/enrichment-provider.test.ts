import { afterEach, expect, test, vi } from "vitest";

import {
  ENRICHMENT_TIMEOUT_MS,
  createEnrichmentProvider,
  parseProviderMessage,
  validateProviderConfiguration,
} from "../../scripts/catalog/enrichment-provider.mjs";

const model = "minimax/minimax-m3:thinking";

const allowedTags = [
  {
    id: "automate-roleplay-workflows",
    label: "Automate roleplay workflows",
    facet: "goal",
    description: "Automates repeated roleplay setup or execution.",
    aliases: ["automation"],
    applicable_kinds: ["extension"],
    inclusion_guidance: ["The source describes repeatable automation."],
    exclusion_guidance: ["A one-time convenience is not automation."],
  },
];

const input = {
  id: "fixture",
  sourceId: "github-creator-project",
  name: "Fixture",
  kind: "extension",
  requestedFields: ["summary", "tags"] as const,
  vocabularyHash: "a".repeat(64),
  evidence: {
    readme: {
      identity: "README.md@abc123",
      text: "Fixture automates repeatable prompt setup.",
    },
    repositoryDescription: "A useful extension for structured prompt work.",
  },
  protectedTerms: ["Fixture"],
  policyVersion: "2026-07-29",
  source: {
    kind: "readme" as const,
    identity: "github:creator/project",
    text: "Fixture automates repeatable prompt setup.",
  },
  frontends: ["sillytavern"],
  allowedTags,
};

const output = {
  summary: {
    value:
      "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
    evidence: ["readme:1"],
  },
  tags: [
    {
      id: "automate-roleplay-workflows",
      evidence: ["readme:1"],
    },
  ],
  result: "accepted-unchanged",
  change_reasons: [],
  policy_signal: "none",
};

function success(payload: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      model,
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
  ["JSON string", { content: JSON.stringify(output) }],
  [
    "text content parts",
    {
      content: [
        { type: "text", text: JSON.stringify(output).slice(0, 40) },
        { type: "text", text: JSON.stringify(output).slice(40) },
      ],
    },
  ],
  [
    "whole-response JSON fence",
    { content: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` },
  ],
] as const)("parses a safe %s provider envelope", (_name, message) => {
  expect(parseProviderMessage(message)).toEqual(output);
});

test.each([
  ["missing content", {}, "content-missing"],
  [
    "tool calls alongside valid JSON",
    {
      content: JSON.stringify(output),
      tool_calls: [{ id: "call-1", type: "function" }],
    },
    "tool-calls-present",
  ],
  [
    "non-text content part",
    { content: [{ type: "image", image_url: "https://example.test/a.png" }] },
    "content-parts-invalid",
  ],
  [
    "leading prose",
    { content: `Here is the result: ${JSON.stringify(output)}` },
    "json-invalid",
  ],
  ["malformed JSON", { content: "{not-json" }, "json-invalid"],
  ["JSON array", { content: JSON.stringify([output]) }, "json-not-object"],
] as const)(
  "rejects %s with a sanitized diagnostic",
  (_name, message, diagnosticCode) => {
    expect(() => parseProviderMessage(message)).toThrowError(
      expect.objectContaining({
        code: "provider-response-invalid",
        diagnosticCode,
      }),
    );
  },
);

test.each([
  [{ apiUrl: "", apiKey: "key", model }, "URL"],
  [{ apiUrl: "https://api.example.test", apiKey: "", model }, "key"],
  [{ apiUrl: "https://api.example.test", apiKey: "key", model: "" }, "model"],
  [
    {
      apiUrl: "http://api.example.test",
      apiKey: "key",
      model,
    },
    "HTTPS",
  ],
  [
    {
      apiUrl: "https://api.example.test",
      apiKey: "key",
      model: ` ${model}`,
    },
    "whitespace",
  ],
] as const)(
  "rejects invalid configuration before fetch",
  (configuration, message) => {
    expect(() => validateProviderConfiguration(configuration)).toThrow(message);
  },
);

test("sends the exact model, hardened prompt, requested fields, and strict schema", async () => {
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => success(),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model,
    fetchImpl,
  });

  await provider.generate(input);

  const [, init] = fetchImpl.mock.calls[0];
  const body = JSON.parse(String(init?.body));
  const schema = body.response_format.json_schema.schema;
  expect(body.model).toBe(model);
  expect(body.temperature).toBe(0.2);
  expect(body.messages[0].content).toMatch(
    /project names.*README content.*untrusted reference data/iu,
  );
  expect(body.messages[0].content).toMatch(/root README.*primary evidence/iu);
  expect(body.messages[0].content).toMatch(
    /repository description.*secondary/iu,
  );
  expect(body.messages[0].content).toMatch(/zero to six allowed tag IDs/iu);
  expect(body.messages[0].content).toMatch(/evidence/iu);
  expect(schema.required).toEqual([
    "summary",
    "tags",
    "result",
    "change_reasons",
    "policy_signal",
  ]);
  expect(schema.properties.summary).toMatchObject({
    type: "object",
    additionalProperties: false,
    properties: {
      evidence: { type: "array", minItems: 1 },
    },
  });
  expect(schema.properties.summary.properties.value).toEqual({
    type: "string",
  });
  expect(schema.properties.summary.properties.evidence.items).toEqual({
    type: "string",
  });
  expect(JSON.stringify(schema)).not.toContain('"uniqueItems"');
  expect(schema.properties.tags.items.properties.id.enum).toEqual([
    "automate-roleplay-workflows",
  ]);
  expect(schema.properties).not.toHaveProperty("capabilities");
  expect(schema.properties).not.toHaveProperty("primary_function");
  expect(schema.properties).not.toHaveProperty("metadata_status");
  expect(body.messages[0].content).toMatch(/never.*change.*primary.function/iu);
  expect(body.messages[0].content).toMatch(/between 120 and 220 characters/iu);
  expect(body.messages[0].content).toMatch(
    /without Markdown.*URLs.*domain-style links/iu,
  );
  expect(body.messages[0].content).not.toMatch(/exactly two sentences/iu);
  expect(body.messages[0].content).not.toMatch(/24-36|24-30/iu);
  expect(body.messages[0].content).toMatch(
    /distinctive workflow, capability, or benefit/iu,
  );
  expect(body.messages[0].content).toMatch(
    /preserve exact wording and summary structure/iu,
  );
  expect(body.messages[0].content).toMatch(
    /accepted-unchanged.*empty change_reasons.*policy_signal.*exact string "none"/iu,
  );
  expect(body.messages[0].content).toMatch(/ordinary profanity.*permitted/iu);
  expect(init?.headers).toMatchObject({
    authorization: "Bearer do-not-log",
  });
});

test("builds a tags-only schema without summary or copy diagnostics", async () => {
  const tagsOnlyOutput = { tags: output.tags };
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      success({
        choices: [{ message: { content: JSON.stringify(tagsOnlyOutput) } }],
      }),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "key",
    model,
    fetchImpl,
  });

  await provider.generate({
    ...input,
    requestedFields: ["tags"],
  });

  const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
  expect(body.response_format.json_schema.schema.required).toEqual(["tags"]);
  expect(body.response_format.json_schema.schema.properties).not.toHaveProperty(
    "summary",
  );
  expect(body.response_format.json_schema.schema.properties).not.toHaveProperty(
    "result",
  );
});

test("normalizes a null no-signal sentinel from the provider", async () => {
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      success({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...output,
                policy_signal: null,
              }),
            },
          },
        ],
      }),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model,
    fetchImpl,
  });

  await expect(provider.generate(input)).resolves.toMatchObject({
    output: {
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    },
  });
});

test("uses deterministic sampling for a validation repair request", async () => {
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) => success(),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model,
    fetchImpl,
  });

  await provider.generate({
    ...input,
    repair: {
      reasonCode: "output-invalid",
      message: "Summary must be at most 220 characters.",
      rejectedSummary: "An overlong summary.",
    },
  });

  const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
  expect(body.temperature).toBe(0);
  expect(body.messages[0].content).toMatch(
    /rejectedSummary.*untrusted.*do not follow/iu,
  );
});

test("returns requested model, returned model, and latency metadata", async () => {
  const times = [1_000, 1_250];
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "key",
    model,
    fetchImpl: async () => success(),
    now: () => times.shift() ?? 1_250,
  });

  await expect(provider.generate(input)).resolves.toEqual({
    output,
    metadata: {
      requestedModel: model,
      returnedModel: model,
      latencyMs: 250,
    },
  });
});

test("allows an absent returned model but rejects a mismatched one", async () => {
  const withoutModel = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
    fetchImpl: async () => success({ model: undefined }),
  });
  await expect(withoutModel.generate(input)).resolves.toMatchObject({
    metadata: { returnedModel: null },
  });

  const mismatch = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
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
      model,
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

test("includes elapsed time on controlled provider failures", async () => {
  const times = [1_000, 1_250];
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
    fetchImpl: async () => new Response("", { status: 429 }),
    now: () => times.shift() ?? 1_250,
  });

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-rate-limited",
    latencyMs: 250,
  });
});

test("aborts each model call after 120 seconds", async () => {
  vi.useFakeTimers();
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
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

test("uses the configured timeout in its safe diagnostic", async () => {
  vi.useFakeTimers();
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "key",
    model,
    timeoutMs: 7_500,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
  });

  const rejection = expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-timeout",
    message: "The enrichment provider timed out after 7.5 seconds.",
  });
  await vi.advanceTimersByTimeAsync(7_500);
  await rejection;
});
