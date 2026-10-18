import { expect, test, vi } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { acquirePreparedAdvisoryData } from "../../scripts/automation/advisory-preparation.mjs";
import { createCatalogPolicyReviewProvider } from "../../scripts/moderation/catalog-policy-review-provider.mjs";
import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";
import type { observeMetadataSource } from "../../scripts/automation/metadata-preparation.mjs";
import {
  bindModelBudgetTicket,
  createModelBudgetGuard,
  createModelBudgetState,
  reserveModelBudget,
  type ModelBudgetGuard,
} from "../../scripts/automation/model-budget.mjs";

function verifiedAdvisoryBudget(requestCount = 1, expired = false) {
  const nowMs = Date.parse("2026-10-08T12:00:00.000Z");
  const operationKey = "a".repeat(64);
  const reservation = reserveModelBudget(
    createModelBudgetState(nowMs),
    {
      operationKey,
      requestCount,
      requestedTokens: 20000 * requestCount,
      model: "approved",
    },
    { nowMs },
  );
  if (!reservation.allowed) throw new Error("Fixture reservation refused.");
  const producer = {
    runId: 700,
    workflow: ".github/workflows/review-catalog-policy.yml",
  };
  const state = bindModelBudgetTicket(
    reservation.state,
    reservation.ticket.id,
    producer,
  );
  return {
    state,
    guard: createModelBudgetGuard({
      state,
      ticketIds: [reservation.ticket.id],
      operationKey,
      ...producer,
      runAttempt: 1,
      nowMs: () => nowMs + (expired ? 3600000 : 0),
    }),
  };
}

async function realAdvisoryPreparationFixture(
  options: {
    responseStatus?: number;
    output?: unknown;
    budgetGuard?: ModelBudgetGuard;
    jsonRepair?: boolean;
    onAcquisitionPhase?: (phase: string) => void;
  } = {},
) {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const calls = { requests: 0, delays: [] as number[] };
  const configuration = {
    apiUrl: "https://provider.example/v1/chat/completions",
    apiKey: "fixture-key",
    model: "approved",
    requireBudget: true,
    budgetGuard: options.budgetGuard,
    ...(options.jsonRepair
      ? {
          jsonRepair: {
            apiUrl: "https://repair.example/v1/chat/completions",
            apiKey: "repair-key",
            model: "repair-model",
          },
        }
      : {}),
    fetchImpl: async () => {
      calls.requests += 1;
      return new Response(
        JSON.stringify({
          model: "approved",
          choices: [
            {
              message: {
                content: JSON.stringify(
                  options.output ?? {
                    status: "clear",
                    category: null,
                    explanation: null,
                  },
                ),
              },
            },
          ],
          error: { message: "Untrusted provider error text." },
        }),
        { status: options.responseStatus ?? 200 },
      );
    },
  };
  return {
    calls,
    prepare: () =>
      acquirePreparedAdvisoryData({
        state: fixture.state,
        operation,
        options: {
          observe: fixture.observe,
          provider: createCatalogPolicyReviewProvider(configuration),
          onAcquisitionPhase: options.onAcquisitionPhase,
          sleep: async (delay) => {
            calls.delays.push(delay);
          },
        },
      }),
  };
}

test("rejected advisory review retains the original error, receiver, input and review boundary", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const failure = new Error("private provider failure");
  const phases: string[] = [];
  const budgetGuard = vi.fn();
  const review = vi.fn(async function (this: unknown, input: unknown) {
    expect(this).toBe(provider);
    expect(input).toMatchObject({
      project: { id: fixture.project.id },
      readme: expect.any(String),
    });
    throw failure;
  });
  const provider = { review };
  await expect(
    acquirePreparedAdvisoryData({
      state: fixture.state,
      operation,
      options: {
        observe: fixture.observe,
        provider,
        budgetGuard,
        onAcquisitionPhase: (phase) => phases.push(phase),
      },
    }),
  ).rejects.toBe(failure);
  expect(phases).toEqual([
    "operation-records",
    "observe-source",
    "provider-config",
    "provider-input",
    "provider-review",
  ]);
  expect(review).toHaveBeenCalledOnce();
  expect(budgetGuard).not.toHaveBeenCalled();
});

test("semantic advisory rejection exposes a fixed diagnostic without response text", async () => {
  const budget = verifiedAdvisoryBudget();
  const charged = JSON.stringify(budget.state);
  const phases: string[] = [];
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
    output: {
      status: "clear",
      category: "potential-other-catalog-policy-conflict",
      explanation: "private semantic inconsistency",
    },
    onAcquisitionPhase: (phase) => phases.push(phase),
  });
  const failure = await fixture.prepare().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(EnrichmentProviderError);
  expect(failure).toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "policy-review-output-invalid",
  });
  expect(phases.at(-1)).toBe("provider-output");
  expect(phases).not.toContain("acquisition-output");
  expect(fixture.calls).toEqual({ requests: 1, delays: [] });
  expect(budget.guard.usage()[0].usage.requests).toBe(1);
  expect(JSON.stringify(budget.state)).toBe(charged);
});

test("successful advisory review enters acquisition-output before existing serialization failure", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const phases: string[] = [];
  const failure = new Error("private serialization failure");
  const stringify = JSON.stringify;
  const serializer = vi
    .spyOn(JSON, "stringify")
    .mockImplementation((value, replacer, space) => {
      if (
        value?.schema_version === 1 &&
        value.project_id === fixture.project.id
      )
        throw failure;
      return stringify(value, replacer, space);
    });
  try {
    await expect(
      acquirePreparedAdvisoryData({
        state: fixture.state,
        operation,
        options: {
          observe: fixture.observe,
          provider: {
            review: async () => ({
              status: "clear",
              category: null,
              explanation: null,
            }),
          },
          onAcquisitionPhase: (phase) => phases.push(phase),
        },
      }),
    ).rejects.toBe(failure);
    expect(phases.slice(-3)).toEqual([
      "provider-review",
      "provider-output",
      "acquisition-output",
    ]);
  } finally {
    serializer.mockRestore();
  }
});

test.each(["budget-guard", "provider-config", "provider-input"] as const)(
  "advisory local failure retains %s without a provider request",
  async (phase) => {
    const fixture = await metadataMaintenanceFixture();
    const operation = fixture.state.operations.find(
      (value) => value.identity.kind === "advisory",
    )!;
    const failure = new Error("private local failure");
    const phases: string[] = [];
    const review = vi.fn();
    const options = {
      observe: fixture.observe,
      onAcquisitionPhase: (value: string) => phases.push(value),
      ...(phase === "provider-input" ? { provider: { review } } : {}),
      budgetGuard: vi.fn(async () => {
        throw failure;
      }),
    };
    if (phase === "provider-config")
      Object.defineProperty(options, "provider", {
        get() {
          throw failure;
        },
      });
    if (phase === "provider-input")
      Object.defineProperty(fixture.state.local, "advisoryState", {
        get() {
          throw failure;
        },
      });
    await expect(
      acquirePreparedAdvisoryData({ state: fixture.state, operation, options }),
    ).rejects.toBe(failure);
    expect(phases.at(-1)).toBe(phase);
    expect(review).not.toHaveBeenCalled();
    expect(options.budgetGuard).toHaveBeenCalledTimes(
      phase === "budget-guard" ? 1 : 0,
    );
  },
);

test.each(["operation-records", "observe-source"] as const)(
  "advisory failure before provider setup retains %s",
  async (phase) => {
    const fixture = await metadataMaintenanceFixture();
    const operation = fixture.state.operations.find(
      (value) => value.identity.kind === "advisory",
    )!;
    const failure = new Error("private early failure");
    const phases: string[] = [];
    const budgetGuard = vi.fn();
    if (phase === "operation-records")
      Object.defineProperty(fixture.state.local, "sources", {
        get() {
          throw failure;
        },
      });
    await expect(
      acquirePreparedAdvisoryData({
        state: fixture.state,
        operation,
        options: {
          observe: async () => {
            throw failure;
          },
          budgetGuard,
          onAcquisitionPhase: (value) => phases.push(value),
        },
      }),
    ).rejects.toBe(failure);
    expect(phases.at(-1)).toBe(phase);
    expect(budgetGuard).not.toHaveBeenCalled();
  },
);

test.each(["getter", "callback"] as const)(
  "hostile advisory marker %s preserves source rejection and avoids budget loading",
  async (kind) => {
    const fixture = await metadataMaintenanceFixture();
    const operation = fixture.state.operations.find(
      (value) => value.identity.kind === "advisory",
    )!;
    const failure = new Error("private source failure");
    let markerReads = 0;
    const options = {
      observe: async (input: Parameters<typeof observeMetadataSource>[0]) => {
        input.onAcquisitionPhase?.("source-readme-request");
        throw failure;
      },
      budgetGuard: vi.fn(),
    };
    Object.defineProperty(options, "onAcquisitionPhase", {
      get() {
        markerReads++;
        if (kind === "getter") throw new Error("private marker getter");
        return () => {
          throw new Error("private marker callback");
        };
      },
    });
    await expect(
      acquirePreparedAdvisoryData({ state: fixture.state, operation, options }),
    ).rejects.toBe(failure);
    expect(markerReads).toBe(3);
    expect(options.budgetGuard).not.toHaveBeenCalled();
  },
);

test("throwing advisory telemetry preserves exact successful output and provider calls", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const review = vi.fn(async () => ({
    status: "clear" as const,
    category: null,
    explanation: null,
  }));
  const options = { observe: fixture.observe, provider: { review } };
  const baseline = await acquirePreparedAdvisoryData({
    state: fixture.state,
    operation,
    options,
  });
  for (const kind of ["getter", "callback"] as const) {
    const hostile = Object.create(options);
    Object.defineProperty(hostile, "onAcquisitionPhase", {
      get() {
        if (kind === "getter") throw new Error("private marker getter");
        return () => {
          throw new Error("private marker callback");
        };
      },
    });
    expect(
      await acquirePreparedAdvisoryData({
        state: fixture.state,
        operation,
        options: hostile,
      }),
    ).toEqual(baseline);
  }
  expect(review).toHaveBeenCalledTimes(3);
});

test("advisory provider failures retain the typed circuit diagnostic", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  await expect(
    acquirePreparedAdvisoryData({
      state: fixture.state,
      operation,
      options: {
        observe: fixture.observe,
        provider: {
          review: async () => {
            throw Object.assign(new Error("untrusted response text"), {
              code: "provider-authentication-failed",
            });
          },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "provider-authentication-failed" });
});

test("a successful advisory emits only non-blocking policy state", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  const outputs = await acquirePreparedAdvisoryData({
    state: fixture.state,
    operation,
    options: {
      observe: fixture.observe,
      provider: {
        review: async () => ({
          status: "clear",
          category: null,
          explanation: null,
        }),
      },
    },
  });
  expect(Object.keys(outputs)).toEqual([
    `data/snapshots/policy-review/${fixture.project.id}.json`,
  ]);
  expect(JSON.parse(Object.values(outputs)[0]).status).toBe("clear");
  expect(fixture.project.listing_status).toBe("active");
});

test("a real advisory provider preserves clear output through preparation", async () => {
  const fixture = await metadataMaintenanceFixture();
  const operation = fixture.state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  let requests = 0;
  const configuration = {
    apiUrl: "https://provider.example/v1/chat/completions",
    apiKey: "fixture-key",
    model: "approved",
    fetchImpl: async () => {
      requests += 1;
      return new Response(
        JSON.stringify({
          model: "approved",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  status: "clear",
                  category: null,
                  explanation: null,
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  };
  const outputs = await acquirePreparedAdvisoryData({
    state: fixture.state,
    operation,
    options: {
      observe: fixture.observe,
      provider: createCatalogPolicyReviewProvider(configuration),
    },
  });
  expect(Object.keys(outputs)).toEqual([
    `data/snapshots/policy-review/${fixture.project.id}.json`,
  ]);
  expect(JSON.parse(Object.values(outputs)[0])).toMatchObject({
    project_id: fixture.project.id,
    status: "clear",
    category: null,
    retry: { attempts: 0, last_failure_at: null },
  });
  expect(fixture.project.listing_status).toBe("active");
  expect(requests).toBe(1);
});

test("missing verified advisory allowance refuses without HTTP or retries", async () => {
  const fixture = await realAdvisoryPreparationFixture();
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "budget-exhausted",
  });
  expect(fixture.calls).toEqual({ requests: 0, delays: [] });
});

test("expired verified advisory allowance refuses without HTTP or retries", async () => {
  const budget = verifiedAdvisoryBudget(1, true);
  const charged = JSON.stringify(budget.state);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
  });
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "budget-exhausted",
  });
  expect(fixture.calls).toEqual({ requests: 0, delays: [] });
  expect(budget.guard.usage()[0].usage.requests).toBe(0);
  expect(JSON.stringify(budget.state)).toBe(charged);
});

test("a budgeted advisory records exactly one successful model response", async () => {
  const budget = verifiedAdvisoryBudget();
  const charged = JSON.stringify(budget.state);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
  });
  const outputs = await fixture.prepare();
  expect(
    Object.values(outputs).map((value) => JSON.parse(value).status),
  ).toEqual(["clear"]);
  expect(fixture.calls).toEqual({ requests: 1, delays: [] });
  expect(budget.guard.usage()[0].usage.requests).toBe(1);
  expect(JSON.stringify(budget.state)).toBe(charged);
});

test("real advisory authentication failures preserve their code without retries", async () => {
  const budget = verifiedAdvisoryBudget(3);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
    responseStatus: 401,
  });
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "provider-authentication-failed",
    diagnosticCode: "http-401",
  });
  expect(fixture.calls).toEqual({ requests: 1, delays: [] });
  expect(budget.guard.usage()[0].usage.requests).toBe(0);
});

test("real transient advisory failures retain exactly two bounded retries", async () => {
  const budget = verifiedAdvisoryBudget(3);
  const charged = JSON.stringify(budget.state);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
    responseStatus: 503,
  });
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "provider-server-error",
  });
  expect(fixture.calls).toEqual({ requests: 3, delays: [5000, 15000] });
  expect(budget.guard.usage()[0].usage.requests).toBe(0);
  expect(JSON.stringify(budget.state)).toBe(charged);
});

test("JSON repair without its own verified allowance stops after the primary request", async () => {
  const budget = verifiedAdvisoryBudget();
  const charged = JSON.stringify(budget.state);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
    output: { status: "clear", category: null },
    jsonRepair: true,
  });
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "budget-exhausted",
  });
  expect(fixture.calls).toEqual({ requests: 1, delays: [] });
  expect(budget.guard.usage()[0].usage.requests).toBe(1);
  expect(JSON.stringify(budget.state)).toBe(charged);
});

test("schema-invalid real advisory output stays unavailable without retries", async () => {
  const budget = verifiedAdvisoryBudget(3);
  const fixture = await realAdvisoryPreparationFixture({
    budgetGuard: budget.guard,
    output: { status: "clear", category: null },
  });
  await expect(fixture.prepare()).rejects.toMatchObject({
    code: "provider-response-invalid",
    diagnosticCode: "json-schema-invalid",
  });
  expect(fixture.calls).toEqual({ requests: 1, delays: [] });
});
