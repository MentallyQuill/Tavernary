import { afterEach, expect, test, vi } from "vitest";

import {
  ENRICHMENT_TIMEOUT_MS,
  MAX_PROVIDER_RESPONSE_BYTES,
  createEnrichmentProvider,
  parseProviderMessage,
  validateProviderConfiguration,
} from "../../scripts/catalog/enrichment-provider.mjs";
import { generateValidatedEnrichment } from "../../scripts/catalog/enrichment-attempts.mjs";

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
  expect(body).not.toHaveProperty("temperature");
  expect(body).not.toHaveProperty("reasoning_effort");
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

test("uses the no-reasoning latency baseline for GPT-5.6 enrichment", async () => {
  const lunaModel = "gpt-5.6-luna";
  const fetchImpl = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      success({ model: lunaModel }),
  );
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: "do-not-log",
    model: lunaModel,
    fetchImpl,
  });

  await provider.generate(input);

  const [, init] = fetchImpl.mock.calls[0];
  const body = JSON.parse(String(init?.body));
  expect(body.reasoning_effort).toBe("none");
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
  expect(body).not.toHaveProperty("temperature");
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

test("reports allowlisted upstream request diagnostics without leaking the message", async () => {
  const provider = createEnrichmentProvider({
    apiUrl: "https://api.example.test",
    apiKey: "do-not-leak",
    model,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "unsupported_value",
            param: "temperature",
            message: "secret upstream explanation",
          },
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-request-failed",
    diagnosticCode: "unsupported_value:temperature",
    message:
      "The enrichment provider rejected the request (unsupported_value:temperature).",
  });
});

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

const utilityModel = "deepseek/deepseek-v4-flash-0731:thinking";
const repairModel = "gpt-5.6-luna";
const utilityUrl = "https://nano.example/v1/chat/completions";
const repairUrl = "https://openai.example/v1/chat/completions";

function modelResponse(responseModel: string, content: unknown) {
  return new Response(
    JSON.stringify({
      model: responseModel,
      choices: [{ message: content }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function utilityProviderOptions(fetchImpl: typeof fetch) {
  return {
    apiUrl: utilityUrl,
    apiKey: "utility-key",
    model: utilityModel,
    jsonRepair: {
      apiUrl: repairUrl,
      apiKey: "repair-key",
      model: repairModel,
    },
    fetchImpl,
  };
}

test("returns schema-valid utility JSON without calling Luna", async () => {
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      return modelResponse(utilityModel, {
        content: JSON.stringify(output),
      });
    }),
  );

  await expect(provider.generate(input)).resolves.toMatchObject({
    output,
    metadata: { requestedModel: utilityModel },
  });
  expect(urls).toEqual([utilityUrl]);
});

test("repairs malformed utility JSON once without sending original source context", async () => {
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  const markedInput = {
    ...input,
    evidence: {
      ...input.evidence,
      readme: {
        ...input.evidence.readme,
        text: "PRIVATE README MARKER",
      },
    },
    source: {
      ...input.source,
      text: "PRIVATE README MARKER",
    },
  };
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(url), body });
      return String(url) === utilityUrl
        ? modelResponse(utilityModel, {
            content: `Here is the result: ${JSON.stringify(output)}`,
          })
        : modelResponse(repairModel, {
            content: JSON.stringify(output),
          });
    }),
  );

  const result = await provider.generate(markedInput);

  expect(result.output).toEqual(output);
  expect(requests.map(({ url }) => url)).toEqual([utilityUrl, repairUrl]);
  const [primaryRequest, repairRequest] = requests;
  expect(repairRequest.body.model).toBe(repairModel);
  expect(repairRequest.body.reasoning_effort).toBe("none");
  expect(repairRequest.body.max_completion_tokens).toBeLessThanOrEqual(4_096);
  expect(repairRequest.body.response_format).toEqual(
    primaryRequest.body.response_format,
  );
  expect(JSON.stringify(repairRequest.body)).not.toContain(
    "PRIVATE README MARKER",
  );
  expect(result.metadata).toMatchObject({
    requestedModel: utilityModel,
    returnedModel: utilityModel,
    jsonRepair: {
      diagnosticCode: "json-invalid",
      requestedModel: repairModel,
      returnedModel: repairModel,
      succeeded: true,
    },
  });
});

test("repairs schema-invalid utility JSON before returning it", async () => {
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      return String(url) === utilityUrl
        ? modelResponse(utilityModel, {
            content: JSON.stringify({
              summary: output.summary,
              result: output.result,
              change_reasons: output.change_reasons,
              policy_signal: output.policy_signal,
            }),
          })
        : modelResponse(repairModel, {
            content: JSON.stringify(output),
          });
    }),
  );

  await expect(provider.generate(input)).resolves.toMatchObject({
    output,
    metadata: {
      requestedModel: utilityModel,
      jsonRepair: {
        diagnosticCode: "json-schema-invalid",
        succeeded: true,
      },
    },
  });
  expect(urls).toEqual([utilityUrl, repairUrl]);
});

test("repairs a non-object utility JSON value", async () => {
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      return String(url) === utilityUrl
        ? modelResponse(utilityModel, { content: "[]" })
        : modelResponse(repairModel, {
            content: JSON.stringify(output),
          });
    }),
  );

  await expect(provider.generate(input)).resolves.toMatchObject({
    output,
    metadata: {
      jsonRepair: {
        diagnosticCode: "json-not-object",
        succeeded: true,
      },
    },
  });
  expect(urls).toEqual([utilityUrl, repairUrl]);
});

test("preserves the primary invalid-response diagnostic when Luna repair fails", async () => {
  const urls: string[] = [];
  const times = [1_000, 1_250, 2_000, 2_250];
  const provider = createEnrichmentProvider({
    ...utilityProviderOptions(async (url) => {
      urls.push(String(url));
      return String(url) === utilityUrl
        ? modelResponse(utilityModel, { content: "{not-json" })
        : modelResponse(repairModel, { content: "still not JSON" });
    }),
    now: () => times.shift() ?? 2_250,
  });

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "json-invalid",
    latencyMs: 250,
  });
  expect(urls).toEqual([utilityUrl, repairUrl]);
});

test("does not attach damaged schema-invalid output to a thrown error", async () => {
  const damagedOutput = {
    summary: {
      value: "PRIVATE DAMAGED OUTPUT MARKER",
      evidence: ["readme:1"],
    },
    result: output.result,
    change_reasons: output.change_reasons,
    policy_signal: output.policy_signal,
  };
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) =>
      String(url) === utilityUrl
        ? modelResponse(utilityModel, {
            content: JSON.stringify(damagedOutput),
          })
        : modelResponse(repairModel, { content: "still not JSON" }),
    ),
  );

  let error: unknown;
  try {
    await provider.generate(input);
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "json-schema-invalid",
  });
  expect(error).not.toHaveProperty("damagedText");
  expect(JSON.stringify(error)).not.toContain("PRIVATE DAMAGED OUTPUT MARKER");
});

test.each([
  [401, "http-401"],
  [403, "http-403"],
] as const)(
  "records HTTP %i without reading the authentication response body",
  async (status, diagnosticCode) => {
    const privateMarker = `PRIVATE AUTHENTICATION BODY ${status}`;
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(privateMarker));
      },
      cancel() {
        canceled = true;
      },
    });
    const getReader = vi.spyOn(body, "getReader");
    const response = new Response(body, { status });
    const readText = vi.spyOn(response, "text");
    const provider = createEnrichmentProvider(
      utilityProviderOptions(async () => response),
    );

    let error: unknown;
    try {
      await provider.generate(input);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "provider-authentication-failed",
      diagnosticCode,
    });
    expect(canceled).toBe(true);
    expect(getReader).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
    expect(String(error)).not.toContain(privateMarker);
    expect(JSON.stringify(error)).not.toContain(privateMarker);
  },
);

test.each([
  [
    "HTTP failure",
    () => new Response("private repair failure", { status: 500 }),
  ],
  [
    "model mismatch",
    () =>
      modelResponse("unexpected-repair-model", {
        content: JSON.stringify(output),
      }),
  ],
  [
    "schema-invalid JSON",
    () =>
      modelResponse(repairModel, {
        content: JSON.stringify({ summary: output.summary }),
      }),
  ],
] as const)(
  "preserves the primary error and stops after one repair on %s",
  async (_name, repairResponse) => {
    const urls: string[] = [];
    const provider = createEnrichmentProvider(
      utilityProviderOptions(async (url) => {
        urls.push(String(url));
        return String(url) === utilityUrl
          ? modelResponse(utilityModel, { content: "{not-json" })
          : repairResponse();
      }),
    );

    await expect(provider.generate(input)).rejects.toMatchObject({
      code: "provider-response-invalid",
      diagnosticCode: "json-invalid",
    });
    expect(urls).toEqual([utilityUrl, repairUrl]);
  },
);

test("rejects invalid repair configuration before calling either provider", () => {
  expect(() =>
    createEnrichmentProvider({
      apiUrl: utilityUrl,
      apiKey: "utility-key",
      model: utilityModel,
      jsonRepair: {
        apiUrl: "",
        apiKey: "repair-key",
        model: repairModel,
      },
    }),
  ).toThrow("URL");
});

test("rejects an oversized primary envelope without invoking Luna", async () => {
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      return modelResponse(utilityModel, {
        content: "x".repeat(300 * 1_024),
      });
    }),
  );

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "response-too-large",
  });
  expect(urls).toEqual([utilityUrl]);
});

test("stops reading a chunked primary response at the byte limit", async () => {
  let canceled = false;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES));
        } else if (pulls === 2) {
          controller.enqueue(new Uint8Array(1));
        } else {
          controller.error(new Error("reader continued beyond byte limit"));
        }
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async () => new Response(body, { status: 200 })),
  );

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "response-too-large",
  });
  expect(canceled).toBe(true);
  expect(pulls).toBe(2);
});

test("stops reading a chunked provider error body at the byte limit", async () => {
  let canceled = false;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES));
        } else if (pulls === 2) {
          controller.enqueue(new Uint8Array(1));
        } else {
          controller.error(new Error("reader continued beyond byte limit"));
        }
      },
      cancel() {
        canceled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async () => new Response(body, { status: 400 })),
  );

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-request-failed",
  });
  expect(canceled).toBe(true);
  expect(pulls).toBe(2);
});

test("normalizes a response body that stalls until timeout", async () => {
  vi.useFakeTimers();
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (_url, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"model":'));
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          });
        },
      });
      return new Response(body, { status: 200 });
    }),
  );

  const rejection = expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-timeout",
  });
  await vi.advanceTimersByTimeAsync(ENRICHMENT_TIMEOUT_MS);
  await rejection;
});

test.each([
  [
    "missing content",
    () => modelResponse(utilityModel, {}),
    "provider-response-invalid",
  ],
  [
    "tool calls",
    () =>
      modelResponse(utilityModel, {
        content: JSON.stringify(output),
        tool_calls: [{ id: "call-1", type: "function" }],
      }),
    "provider-response-invalid",
  ],
  [
    "unsafe content parts",
    () =>
      modelResponse(utilityModel, {
        content: [{ type: "image", image_url: "private" }],
      }),
    "provider-response-invalid",
  ],
  [
    "model mismatch",
    () =>
      modelResponse("unexpected-model", { content: JSON.stringify(output) }),
    "provider-model-mismatch",
  ],
  [
    "rate limit",
    () => new Response("private provider body", { status: 429 }),
    "provider-rate-limited",
  ],
  [
    "authentication failure",
    () => new Response("private provider body", { status: 401 }),
    "provider-authentication-failed",
  ],
  [
    "server failure",
    () => new Response("private provider body", { status: 500 }),
    "provider-server-error",
  ],
] as const)(
  "does not invoke Luna for an ineligible %s failure",
  async (_name, primaryResponse, code) => {
    const urls: string[] = [];
    const provider = createEnrichmentProvider(
      utilityProviderOptions(async (url) => {
        urls.push(String(url));
        return primaryResponse();
      }),
    );

    await expect(provider.generate(input)).rejects.toMatchObject({ code });
    expect(urls).toEqual([utilityUrl]);
  },
);

test("does not invoke Luna after a utility network failure", async () => {
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      throw new Error("network unavailable");
    }),
  );

  await expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-network-error",
  });
  expect(urls).toEqual([utilityUrl]);
});

test("does not invoke Luna after a utility timeout", async () => {
  vi.useFakeTimers();
  const urls: string[] = [];
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url, init) => {
      urls.push(String(url));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }),
  );

  const rejection = expect(provider.generate(input)).rejects.toMatchObject({
    code: "provider-timeout",
  });
  await vi.advanceTimersByTimeAsync(ENRICHMENT_TIMEOUT_MS);
  await rejection;
  expect(urls).toEqual([utilityUrl]);
});

test("keeps schema-valid semantic repairs on the utility provider", async () => {
  const urls: string[] = [];
  let utilityCalls = 0;
  const semanticFailure = {
    ...output,
    summary: { ...output.summary, value: "" },
  };
  const provider = createEnrichmentProvider(
    utilityProviderOptions(async (url) => {
      urls.push(String(url));
      utilityCalls += 1;
      return modelResponse(utilityModel, {
        content: JSON.stringify(utilityCalls === 1 ? semanticFailure : output),
      });
    }),
  );

  const result = await generateValidatedEnrichment({
    initialInput: input,
    maxAttempts: 2,
    generate: (candidate) => provider.generate(candidate),
    validate: (candidate) => ({
      valid: (candidate.summary?.value.length ?? 0) > 0,
    }),
    repair: (candidate) => ({
      ...candidate,
      repair: { reasonCode: "summary-empty" },
    }),
  });

  expect(result.validation.valid).toBe(true);
  expect(urls).toEqual([utilityUrl, utilityUrl]);
});
