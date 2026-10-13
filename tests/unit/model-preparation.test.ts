import { expect, test, vi } from "vitest";
import { createModelBudgetState } from "../../scripts/automation/model-budget.mjs";
import type { ModelBudgetTicket } from "../../scripts/automation/model-budget.mjs";
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
    now: () => nowMs,
    sleep: vi.fn(async () => {}),
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
test("configured daily allowance carries through atomic primary and repair reservations", async () => {
  const effects = fixture();
  effects.input.requests[0].requestedTokens = 180000;
  effects.input.requests[1].requestedTokens = 15000;
  const input = { ...effects.input, tokensPerDay: 2000000 };
  expect((await reserveModelPreparation(input)).status).toBe("dispatched");
  expect(
    (await reserveModelPreparation({ ...input, requestId: "writer-801" }))
      .status,
  ).toBe("dispatched");
  expect(effects.getState().budget.days[0]).toMatchObject({
    requests: 8,
    tokens: 390000,
  });
});
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
  binding.persist.mockRejectedValue(new Error("Binding unavailable"));
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

test("a transient post-dispatch read outage binds the original tickets without another reservation or dispatch", async () => {
  const effects = fixture();
  const outage = new Error("Inventory read unavailable");
  let reads = 0;
  const sleep = vi.fn(async () => {});
  const result = await reserveModelPreparation({
    ...effects.input,
    now: () => nowMs,
    sleep,
    load: async () => {
      if (++reads === 2) throw outage;
      return effects.getState();
    },
  });
  expect(result).toMatchObject({ status: "dispatched", runId: 700 });
  expect(reads).toBe(3);
  expect(sleep).toHaveBeenCalledOnce();
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(effects.persist).toHaveBeenCalledTimes(2);
  expect(effects.getState().budget.days).toEqual([
    { day: "2026-10-08", requests: 4, tokens: 40000 },
  ]);
  expect(effects.getState().budget.tickets).toHaveLength(2);
  expect(
    effects
      .getState()
      .budget.tickets.every((ticket) => ticket.producer?.runId === 700),
  ).toBe(true);
});

test("a failed binding write reloads the current main revision before its only retry", async () => {
  const effects = fixture();
  const persist = effects.persist.getMockImplementation()!;
  effects.persist
    .mockImplementationOnce(persist)
    .mockRejectedValueOnce(new Error("Binding write unavailable"));
  let reads = 0;
  const result = await reserveModelPreparation({
    ...effects.input,
    load: async () => {
      if (++reads === 3) effects.getState().mainSha = "c".repeat(40);
      return effects.getState();
    },
  });
  expect(result).toMatchObject({ status: "dispatched", runId: 700 });
  expect(reads).toBe(3);
  expect(effects.persist).toHaveBeenCalledTimes(3);
  expect(effects.persist.mock.calls[2][0].mainSha).toBe("c".repeat(40));
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
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

test("an accepted binding with a lost response is recovered without another commit", async () => {
  const effects = fixture();
  const persist = effects.persist.getMockImplementation()!;
  effects.persist
    .mockImplementationOnce(persist)
    .mockImplementationOnce(async (state) => {
      await persist(state);
      throw new Error("Binding response lost");
    });
  let reads = 0;
  const result = await reserveModelPreparation({
    ...effects.input,
    load: async () => {
      reads++;
      return effects.getState();
    },
  });
  expect(result).toMatchObject({ status: "dispatched", runId: 700 });
  expect(reads).toBe(3);
  expect(effects.persist).toHaveBeenCalledTimes(2);
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(effects.getState().budget.tickets).toHaveLength(2);
  expect(effects.getState().budget.days[0]).toMatchObject({
    requests: 4,
    tokens: 40000,
  });
});

test("persistent post-dispatch read failures stop after three binding attempts", async () => {
  const effects = fixture();
  const outage = new Error("Inventory remains unavailable");
  let reads = 0;
  await expect(
    reserveModelPreparation({
      ...effects.input,
      load: async () => {
        if (++reads > 1) throw outage;
        return effects.getState();
      },
    }),
  ).rejects.toBe(outage);
  expect(reads).toBe(4);
  expect(effects.input.sleep).toHaveBeenCalledTimes(2);
  expect(effects.persist).toHaveBeenCalledOnce();
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(
    effects
      .getState()
      .budget.tickets.every((ticket) => ticket.producer === null),
  ).toBe(true);
});

test.each([false, true])(
  "a slow post-dispatch read cannot bind after the elapsed deadline (throws=%s)",
  async (throws) => {
    const effects = fixture();
    let clock = nowMs;
    let reads = 0;
    await expect(
      reserveModelPreparation({
        ...effects.input,
        now: () => clock,
        load: async () => {
          if (++reads === 2) {
            clock += 240000;
            if (throws) throw new Error("Slow inventory read failed");
          }
          return effects.getState();
        },
      }),
    ).rejects.toMatchObject({ code: "workflow-result-unavailable" });
    expect(reads).toBe(2);
    expect(effects.persist).toHaveBeenCalledOnce();
    expect(effects.input.dispatch).toHaveBeenCalledOnce();
    expect(effects.input.sleep).not.toHaveBeenCalled();
  },
);

test("the binding deadline is checked again after authority validation before a write", async () => {
  const effects = fixture();
  let clock = nowMs;
  let reads = 0;
  await expect(
    reserveModelPreparation({
      ...effects.input,
      now: () => clock,
      load: async () => {
        if (++reads === 1) return effects.getState();
        return {
          ...effects.getState(),
          get eligible() {
            clock += 240000;
            return true;
          },
        };
      },
    }),
  ).rejects.toMatchObject({ code: "workflow-result-unavailable" });
  expect(effects.persist).toHaveBeenCalledOnce();
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
});

test("lost authority after a read outage stops binding without redispatch", async () => {
  const effects = fixture();
  let reads = 0;
  const result = await reserveModelPreparation({
    ...effects.input,
    load: async () => {
      reads++;
      if (reads === 2) throw new Error("Temporary inventory outage");
      if (reads === 3) return { ...effects.getState(), eligible: false };
      return effects.getState();
    },
  });
  expect(result).toEqual({ status: "superseded" });
  expect(reads).toBe(3);
  expect(effects.persist).toHaveBeenCalledOnce();
  expect(effects.input.dispatch).toHaveBeenCalledOnce();
  expect(
    effects
      .getState()
      .budget.tickets.every((ticket) => ticket.producer === null),
  ).toBe(true);
});

test.each([
  {
    name: "operation identity",
    change: (ticket: ModelBudgetTicket) => {
      ticket.operationKey = "c".repeat(64);
    },
  },
  {
    name: "request identity",
    change: (ticket: ModelBudgetTicket) => {
      ticket.requestId = "another-owner-request:0";
    },
  },
  {
    name: "model",
    change: (ticket: ModelBudgetTicket) => {
      ticket.model = "another-model";
    },
  },
  {
    name: "settled ticket",
    change: (ticket: ModelBudgetTicket) => {
      ticket.settled = true;
    },
  },
  {
    name: "foreign producer",
    change: (ticket: ModelBudgetTicket) => {
      ticket.producer = { runId: 999, workflow };
    },
  },
])(
  "fresh changed $name ends binding recovery immediately",
  async ({ change }) => {
    const effects = fixture();
    let reads = 0;
    await expect(
      reserveModelPreparation({
        ...effects.input,
        load: async () => {
          if (++reads === 2) throw new Error("Temporary inventory outage");
          const state = structuredClone(effects.getState());
          if (reads === 3) change(state.budget.tickets[0]);
          return state;
        },
      }),
    ).rejects.toThrow();
    expect(reads).toBe(3);
    expect(effects.input.sleep).toHaveBeenCalledOnce();
    expect(effects.persist).toHaveBeenCalledOnce();
    expect(effects.input.dispatch).toHaveBeenCalledOnce();
  },
);
