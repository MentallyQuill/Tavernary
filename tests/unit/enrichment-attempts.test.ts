import { expect, test, vi } from "vitest";

import {
  generateValidatedEnrichment,
  generateWithTransientProviderRetries,
} from "../../scripts/catalog/enrichment-attempts.mjs";
import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";

test("returns the first valid response within the attempt budget", async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({
      output: { value: "bad-1" },
      metadata: { call: 1 },
    })
    .mockResolvedValueOnce({
      output: { value: "bad-2" },
      metadata: { call: 2 },
    })
    .mockResolvedValueOnce({
      output: { value: "good" },
      metadata: { call: 3 },
    });

  const result = await generateValidatedEnrichment({
    initialInput: { repair: 0 },
    maxAttempts: 5,
    generate,
    validate: (output: { value: string }) =>
      output.value === "good"
        ? { valid: true as const }
        : { valid: false as const, errors: [output.value] },
    repair: (input) => ({ repair: input.repair + 1 }),
  });

  expect(result).toMatchObject({
    output: { value: "good" },
    metadata: { call: 3 },
    validation: { valid: true },
  });
  expect(generate).toHaveBeenCalledTimes(3);
});

test("returns the fifth invalid response without making a sixth call", async () => {
  const generate = vi.fn(async () => ({
    output: { value: `bad-${generate.mock.calls.length}` },
    metadata: {},
  }));

  const result = await generateValidatedEnrichment({
    initialInput: { repair: null as null | string },
    maxAttempts: 5,
    generate,
    validate: (output: { value: string }) => ({
      valid: false as const,
      errors: [output.value],
    }),
    repair: (_input, _validation, output) => ({
      repair: output.value,
    }),
  });

  expect(result.validation).toMatchObject({
    valid: false,
    errors: ["bad-5"],
  });
  expect(generate).toHaveBeenCalledTimes(5);
});

test.each([0, -1, 1.5, Number.NaN])(
  "rejects invalid maximum attempt budget %s",
  async (maxAttempts) => {
    await expect(
      generateValidatedEnrichment({
        initialInput: {},
        maxAttempts,
        generate: vi.fn(),
        validate: vi.fn(),
        repair: vi.fn(),
      }),
    ).rejects.toThrow("maximum enrichment attempts must be a positive integer");
  },
);

test("does not retry a thrown provider failure", async () => {
  const generate = vi.fn(async () => {
    throw Object.assign(new Error("provider failed"), {
      code: "provider-timeout",
    });
  });

  await expect(
    generateValidatedEnrichment({
      initialInput: {},
      maxAttempts: 5,
      generate,
      validate: () => ({ valid: true as const }),
      repair: (input) => input,
    }),
  ).rejects.toMatchObject({ code: "provider-timeout" });
  expect(generate).toHaveBeenCalledOnce();
});

test.each([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
] as const)("retries transient %s failures", async (code) => {
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  const generate = vi
    .fn()
    .mockRejectedValueOnce(new EnrichmentProviderError(code))
    .mockResolvedValue({ output: { value: "good" }, metadata: {} });

  await expect(
    generateWithTransientProviderRetries({
      input: { value: "request" },
      generate,
      sleep,
    }),
  ).resolves.toMatchObject({ output: { value: "good" } });

  expect(generate).toHaveBeenCalledTimes(2);
  expect(sleep).toHaveBeenCalledWith(5_000);
});

test("exhausts four transient attempts with bounded backoff", async () => {
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  const generate = vi.fn(async () => {
    throw new EnrichmentProviderError("provider-timeout");
  });

  await expect(
    generateWithTransientProviderRetries({
      input: { value: "request" },
      generate,
      sleep,
    }),
  ).rejects.toMatchObject({ code: "provider-timeout" });

  expect(generate).toHaveBeenCalledTimes(4);
  expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([
    5_000, 15_000, 30_000,
  ]);
});

test("does not retry definitive provider failures", async () => {
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  const generate = vi.fn(async () => {
    throw new EnrichmentProviderError("provider-authentication-failed");
  });

  await expect(
    generateWithTransientProviderRetries({
      input: { value: "request" },
      generate,
      sleep,
    }),
  ).rejects.toMatchObject({ code: "provider-authentication-failed" });

  expect(generate).toHaveBeenCalledOnce();
  expect(sleep).not.toHaveBeenCalled();
});
