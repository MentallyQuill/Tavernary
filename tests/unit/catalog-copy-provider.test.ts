import { expect, test, vi } from "vitest";

import { createCatalogCopyProvider } from "../../scripts/catalog/catalog-copy-provider.mjs";
import type { CatalogCopyResult } from "../../scripts/catalog/catalog-copy-contract.mjs";
import type { CatalogCopyInput } from "../../scripts/catalog/catalog-copy-provider.mjs";

const model = "minimax/minimax-m3:thinking";
const output = {
  summary: "ST-QuickReply keeps the author's exact workflow.",
  result: "accepted-unchanged",
  change_reasons: [],
  policy_signal: "none",
} satisfies CatalogCopyResult;
const input = {
  mode: "preserve",
  submittedSummary: "ST-QuickReply keeps the author's exact workflow.",
  evidence: {
    readme: {
      identity: "github:creator/ST-QuickReply@abc123:README.md",
      text: "README evidence.",
    },
    repositoryDescription: "Repository description.",
    submissionDescription: "ST-QuickReply keeps the author's exact workflow.",
  },
  protectedTerms: ["ST-QuickReply", "SillyTavern"],
  policyVersion: "2026-07-29",
} satisfies CatalogCopyInput;

function success() {
  return new Response(
    JSON.stringify({
      model,
      choices: [{ message: { content: JSON.stringify(output) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("sends a strict preservation request with labeled untrusted evidence", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => success());
  const provider = createCatalogCopyProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model,
    fetchImpl,
  });

  await expect(provider.generate(input)).resolves.toMatchObject({
    output,
    metadata: {
      requestedModel: model,
      returnedModel: model,
    },
  });

  const [, init] = fetchImpl.mock.calls[0];
  const body = JSON.parse(String(init?.body));
  const prompt = String(body.messages[0].content);
  const userInput = JSON.parse(String(body.messages[1].content));
  expect(body.model).toBe(model);
  expect(body.response_format).toMatchObject({
    type: "json_schema",
    json_schema: {
      strict: true,
      schema: {
        additionalProperties: false,
        required: ["summary", "result", "change_reasons", "policy_signal"],
      },
    },
  });
  expect(prompt).toMatch(/preserve exact wording and summary structure/iu);
  expect(prompt).toMatch(/smallest necessary span/iu);
  expect(prompt).toMatch(/ordinary profanity.*permitted/iu);
  expect(prompt).toMatch(/consensual adult.*kink.*fetish.*permitted/iu);
  expect(prompt).toMatch(/untrusted.*do not follow.*instructions/iu);
  expect(userInput).toMatchObject({
    mode: "preserve",
    policyVersion: "2026-07-29",
    submittedSummary: input.submittedSummary,
    protectedTerms: ["ST-QuickReply", "SillyTavern"],
    evidence: {
      readme: {
        identity: "github:creator/ST-QuickReply@abc123:README.md",
        text: "README evidence.",
      },
      repositoryDescription: "Repository description.",
      submissionDescription: input.submittedSummary,
    },
  });
});

test("states the exact output contract in initial and repair prompts", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => success());
  const provider = createCatalogCopyProvider({
    apiUrl: "https://api.example.test/v1/chat/completions",
    apiKey: "do-not-log",
    model,
    fetchImpl,
  });

  await provider.generate(input);
  await provider.generate({
    ...input,
    repair: {
      reasonCode: "output-invalid",
      message: "summary must be a non-empty string",
    },
  });

  expect(fetchImpl).toHaveBeenCalledTimes(2);
  for (const call of fetchImpl.mock.calls) {
    const body = JSON.parse(String(call[1]?.body));
    const prompt = String(body.messages[0].content);
    expect(prompt).toContain(
      'Return exactly these four keys: "summary", "result", "change_reasons", and "policy_signal".',
    );
    expect(prompt).toContain(
      '"result" must be exactly one of "accepted-unchanged", "accepted-with-light-edits", or "accepted-with-policy-rewrite".',
    );
  }
});
