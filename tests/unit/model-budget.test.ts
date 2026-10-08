import { expect, test } from "vitest";
import {
  createModelBudgetState,
  reserveModelBudget,
  settleModelBudget,
  validateModelBudgetState,
  estimateRequestedTokens,
  bindModelBudgetTicket,
  createModelBudgetGuard,
} from "../../scripts/automation/model-budget.mjs";

const nowMs = Date.parse("2026-10-08T12:00:00Z");
const key = "a".repeat(64);
const request = {
  operationKey: key,
  requestCount: 1,
  requestedTokens: 1000,
  model: "approved/model",
};
const options = { nowMs };

test("forty reserved requests exhaust the shared allowance without releasing unknown outcomes", () => {
  const filled = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 40 },
    options,
  );
  expect(filled.allowed).toBe(true);
  if (!filled.allowed) throw new Error("Fixture reservation failed");
  const state = settleModelBudget(filled.state, filled.ticket, null);
  expect(
    reserveModelBudget(
      state,
      { ...request, operationKey: "b".repeat(64) },
      options,
    ).allowed,
  ).toBe(false);
  expect(state.days[0].requests).toBe(40);
});

test("identical reservation replay is idempotent and changed requests cannot reuse a ticket", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    request,
    options,
  );
  if (!first.allowed) throw new Error("Fixture reservation failed");
  const replay = reserveModelBudget(first.state, request, options);
  expect(replay).toEqual(first);
  expect(() =>
    reserveModelBudget(
      first.state,
      { ...request, requestedTokens: 2000 },
      options,
    ),
  ).toThrow();
});

test("two serialized workers compete for the final request, and cancelled work remains spent", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 39 },
    options,
  );
  if (!first.allowed) throw new Error("Fixture reservation failed");
  const last = reserveModelBudget(
    first.state,
    { ...request, operationKey: "b".repeat(64) },
    options,
  );
  if (!last.allowed) throw new Error("Final reservation failed");
  expect(
    reserveModelBudget(
      last.state,
      { ...request, operationKey: "c".repeat(64) },
      options,
    ).allowed,
  ).toBe(false);
});

test("repairs and requested token caps share the daily allowance", () => {
  const primary = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 3, requestedTokens: 190000 },
    options,
  );
  if (!primary.allowed) throw new Error("Fixture reservation failed");
  expect(
    reserveModelBudget(
      primary.state,
      {
        ...request,
        requestId: "repair",
        model: "repair/model",
        requestCount: 3,
        requestedTokens: 10001,
      },
      options,
    ).allowed,
  ).toBe(false);
  expect(
    estimateRequestedTokens({
      body: { messages: [{ role: "user", content: "é🙂" }] },
      maxOutputTokens: 4096,
    }),
  ).toBeGreaterThan(4100);
});

test("known usage is validated and recorded without refunding requested allowance", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    request,
    options,
  );
  if (!first.allowed) throw new Error("Fixture reservation failed");
  const usage = { requests: 1, tokens: 500 };
  const settled = settleModelBudget(first.state, first.ticket, usage);
  expect(settled.days[0].tokens).toBe(1000);
  expect(settleModelBudget(settled, first.ticket, usage)).toEqual(settled);
  expect(() =>
    settleModelBudget(first.state, first.ticket, { requests: 2, tokens: 500 }),
  ).toThrow();
  expect(() =>
    settleModelBudget(first.state, first.ticket, { requests: 1, tokens: NaN }),
  ).toThrow();
  expect(() => settleModelBudget(settled, first.ticket, null)).toThrow();
});

test("new UTC days reopen daily limits, month accounting persists, and backward clocks refuse", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 40 },
    options,
  );
  if (!first.allowed) throw new Error("Fixture reservation failed");
  expect(
    reserveModelBudget(first.state, request, { nowMs: nowMs + 86400000 })
      .allowed,
  ).toBe(true);
  expect(
    reserveModelBudget(first.state, request, { nowMs: nowMs - 1 }).allowed,
  ).toBe(false);
  expect(
    reserveModelBudget(first.state, request, {
      nowMs: Date.parse("2026-11-01T00:00:00Z"),
    }).allowed,
  ).toBe(true);
  const late = reserveModelBudget(createModelBudgetState(nowMs), request, {
    nowMs: Date.parse("2026-10-08T23:59:00Z"),
  });
  if (!late.allowed) throw new Error("Late reservation failed");
  expect(late.ticket.expiresAt).toBe("2026-10-09T00:00:00.000Z");
});

test("a required USD ceiling fails closed on missing or mismatched prices", () => {
  const state = createModelBudgetState(nowMs);
  expect(
    reserveModelBudget(state, request, { nowMs, monthlyUsd: 1 }).allowed,
  ).toBe(false);
  expect(() =>
    reserveModelBudget(
      state,
      {
        ...request,
        price: {
          model: "other",
          inputUsdPerMillion: 1,
          outputUsdPerMillion: 2,
        },
      },
      { nowMs, monthlyUsd: 1 },
    ),
  ).toThrow();
  const priced = {
    ...request,
    price: {
      model: request.model,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
  };
  const result = reserveModelBudget(state, priced, {
    nowMs,
    monthlyUsd: 0.002,
  });
  if (!result.allowed) throw new Error("Priced reservation failed");
  expect(
    reserveModelBudget(
      result.state,
      { ...priced, operationKey: "b".repeat(64) },
      { nowMs, monthlyUsd: 0.002 },
    ).allowed,
  ).toBe(false);
});

test("strict state validation rejects understated counters, unknown fields and malformed model identity", () => {
  const result = reserveModelBudget(
    createModelBudgetState(nowMs),
    request,
    options,
  );
  if (!result.allowed) throw new Error("Fixture reservation failed");
  expect(() =>
    validateModelBudgetState({ ...result.state, extra: true }),
  ).toThrow();
  expect(() =>
    validateModelBudgetState({
      ...result.state,
      days: [{ ...result.state.days[0], requests: 0 }],
    }),
  ).toThrow();
  expect(() =>
    reserveModelBudget(
      result.state,
      { ...request, model: "invalid model" },
      options,
    ),
  ).toThrow();
});

test("verified tickets bind one producer run and guard every primary, retry and repair request", () => {
  const result = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 3, requestedTokens: 20000 },
    options,
  );
  if (!result.allowed) throw new Error("Fixture reservation failed");
  const producer = {
    runId: 700,
    workflow: ".github/workflows/enrich-catalog.yml",
  };
  const state = bindModelBudgetTicket(result.state, result.ticket.id, producer);
  const context = {
    state,
    ticketIds: [result.ticket.id],
    operationKey: key,
    ...producer,
    runAttempt: 1,
    nowMs: () => nowMs,
  };
  const guard = createModelBudgetGuard(context);
  const call = {
    model: request.model,
    body: { messages: [] },
    maxOutputTokens: 1000,
  };
  for (let index = 0; index < 3; index++) guard.beforeRequest(call);
  expect(() => guard.beforeRequest(call)).toThrow();
  expect(() => createModelBudgetGuard({ ...context, runId: 701 })).toThrow();
  expect(() => createModelBudgetGuard({ ...context, runAttempt: 2 })).toThrow();
  expect(() =>
    bindModelBudgetTicket(state, result.ticket.id, { ...producer, runId: 701 }),
  ).toThrow();
  expect(() => guard.beforeRequest({ ...call, model: "unreserved" })).toThrow();
  const expired = createModelBudgetGuard({
    ...context,
    nowMs: () => nowMs + 45 * 60000,
  });
  expect(() => expired.beforeRequest(call)).toThrow();
});
