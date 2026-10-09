import { expect, test, vi } from "vitest";
import { createModelBudgetState } from "../../scripts/automation/model-budget.mjs";
import { reserveModelPreparation } from "../../scripts/automation/model-preparation.mjs";
const nowMs = Date.parse("2026-10-08T12:00:00Z");
const operationKey = "a".repeat(64);
const workflow = ".github/workflows/enrich-catalog.yml";
function fixture() {
  let state = {
    mainSha: "b".repeat(40),
    budget: createModelBudgetState(nowMs),
    eligible: true,
  };
  const persist = vi.fn(async (input: typeof state) => {
    state = input;
    return { sha: input.mainSha };
  });
  const input = {
    operationKey,
    workflow,
    requestId: "writer-800",
    nowMs,
    requests: [
      { model: "primary", requestCount: 3, requestedTokens: 30000 },
      { model: "repair", requestCount: 1, requestedTokens: 10000 },
    ],
    load: async () => state,
    persist,
    dispatch: vi.fn(async () => ({ runId: 700, workflow })),
  };
  return { input, persist, getState: () => state };
}
test("primary, retries and repairs are atomically reserved before dispatch and bound to the resulting run", async () => {
  const effects = fixture();
  const result = await reserveModelPreparation(effects.input);
  expect(result.status).toBe("dispatched");
  expect(effects.persist).toHaveBeenCalledTimes(2);
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(effects.persist.mock.invocationCallOrder[0]).toBeLessThan(
    effects.input.dispatch.mock.invocationCallOrder[0],
  );
  expect(effects.getState().budget.days[0]).toMatchObject({
    requests: 4,
    tokens: 40000,
  });
  expect(
    effects
      .getState()
      .budget.tickets.every((ticket) => ticket.producer?.runId === 700),
  ).toBe(true);
});
test("reservation replay recovers binding without dispatching or spending twice", async () => {
  const effects = fixture();
  await reserveModelPreparation(effects.input);
  await reserveModelPreparation(effects.input);
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(effects.getState().budget.days[0].requests).toBe(4);
});
test("an unavailable repair allowance refuses the entire preparation without commits or calls", async () => {
  const effects = fixture();
  effects.input.requests[1].requestedTokens = 200000;
  expect((await reserveModelPreparation(effects.input)).status).toBe("waiting");
  expect(effects.persist).not.toHaveBeenCalled();
  expect(effects.input.dispatch).not.toHaveBeenCalled();
});
test("a raced reservation commit prevents dispatch, and a binding outage leaves all calls unverified", async () => {
  const effects = fixture();
  effects.persist.mockRejectedValueOnce(new Error("Main advanced"));
  await expect(reserveModelPreparation(effects.input)).rejects.toThrow();
  expect(effects.input.dispatch).not.toHaveBeenCalled();
  const binding = fixture();
  binding.persist.mockImplementationOnce(async (input) => {
    Object.assign(binding.getState(), input);
    return { sha: input.mainSha };
  });
  binding.persist.mockRejectedValueOnce(new Error("Binding unavailable"));
  await expect(reserveModelPreparation(binding.input)).rejects.toThrow();
  expect(
    binding
      .getState()
      .budget.tickets.every((ticket) => ticket.producer === null),
  ).toBe(true);
});
test("superseded authority refuses before reserving or dispatching", async () => {
  const effects = fixture();
  effects.getState().eligible = false;
  expect((await reserveModelPreparation(effects.input)).status).toBe(
    "superseded",
  );
  expect(effects.persist).not.toHaveBeenCalled();
});
