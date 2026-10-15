import { expect, test } from "vitest";
import { maximumModelBudgetFixture } from "../helpers/model-budget-fixtures";
import {
  createModelBudgetState,
  reserveModelBudget,
  settleModelBudget,
  validateModelBudgetState,
  estimateRequestedTokens,
  bindModelBudgetTicket,
  createModelBudgetGuard,
  validateModelUsageEvidence,
  parseModelDailyTokens,
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

test("twenty thousand bounded historical tickets remain readable within the canonical byte allowance", () => {
  const state = maximumModelBudgetFixture();
  expect(validateModelBudgetState(state).tickets).toHaveLength(20000);
  const bytes = Buffer.byteLength(`${JSON.stringify(state, null, 2)}\n`);
  expect(bytes + 20000 * 32).toBeLessThan(25_165_824);
});

test("ten million configured tokens admit bounded tickets exactly to the daily boundary", () => {
  const tokensPerDay = parseModelDailyTokens("10000000");
  expect(tokensPerDay).toBe(10000000);
  expect(() => parseModelDailyTokens("10000001")).toThrow(
    "Model daily token limit is invalid.",
  );
  expect(parseModelDailyTokens()).toBe(200000);
  expect(parseModelDailyTokens("")).toBe(200000);
  let state = createModelBudgetState(nowMs);
  for (let index = 0; index < 50; index++) {
    const decision = reserveModelBudget(
      state,
      { ...request, requestId: `request-${index}`, requestedTokens: 200000 },
      { nowMs, tokensPerDay },
    );
    if (!decision.allowed) throw new Error("Token reservation refused");
    state = decision.state;
  }
  expect(state.days[0]).toEqual({
    day: "2026-10-08",
    requests: 50,
    tokens: 10000000,
  });
  const charged = JSON.stringify(state);
  const refused = reserveModelBudget(
    state,
    { ...request, requestId: "one-token-over", requestedTokens: 1 },
    { nowMs, tokensPerDay },
  );
  expect(refused).toMatchObject({ allowed: false, reason: "daily-limit" });
  expect(refused.state).toBe(state);
  expect(JSON.stringify(state)).toBe(charged);
  expect(() =>
    reserveModelBudget(state, request, { ...options, requestsPerDay: 201 }),
  ).toThrow("Model budget limits are invalid.");
});

test("the default daily allowance preserves forty charged requests and admits up to two hundred", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 40 },
    { ...options, requestsPerDay: 40 },
  );
  if (!first.allowed) throw new Error("Existing reservation refused");
  const previous = JSON.stringify(first.state);
  let state = first.state;
  for (let index = 1; index < 5; index++) {
    const decision = reserveModelBudget(
      state,
      { ...request, requestId: `batch-${index}`, requestCount: 40 },
      options,
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("Daily reservation refused");
    state = decision.state;
  }
  expect(JSON.stringify(first.state)).toBe(previous);
  expect(state.tickets[0]).toEqual(first.ticket);
  expect(state.days[0]).toEqual({
    day: "2026-10-08",
    requests: 200,
    tokens: 5000,
  });
  expect(
    reserveModelBudget(
      state,
      { ...request, requestId: "batch-4", requestCount: 40 },
      { ...options, requestsPerDay: 200 },
    ).allowed,
  ).toBe(true);
  const charged = JSON.stringify(state);
  const refused = reserveModelBudget(
    state,
    { ...request, requestId: "request-201" },
    options,
  );
  expect(refused).toMatchObject({ allowed: false, reason: "daily-limit" });
  expect(refused.state).toBe(state);
  expect(JSON.stringify(state)).toBe(charged);
});

test("a configured daily allowance admits multiple bounded preparations", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestedTokens: 195000 },
    { nowMs, tokensPerDay: 2000000 },
  );
  if (!first.allowed) throw new Error("First preparation was refused");
  const second = reserveModelBudget(
    first.state,
    { ...request, operationKey: "b".repeat(64), requestedTokens: 195000 },
    { nowMs, tokensPerDay: 2000000 },
  );
  expect(second.allowed).toBe(true);
  expect(second.state.days[0]).toMatchObject({ requests: 2, tokens: 390000 });
  expect(second.state.months[0].unpricedTokens).toBe(390000);
});

test("unpriced reservations remain accounted across every UTC day of a full month", () => {
  const start = Date.parse("2026-10-01T12:00:00Z");
  let state = createModelBudgetState(start);
  for (let day = 0; day < 31; day++) {
    for (let index = 0; index < 10; index++) {
      const decision = reserveModelBudget(
        state,
        {
          ...request,
          requestId: `request-${day}-${index}`,
          requestedTokens: 200000,
        },
        { nowMs: start + day * 86400000, tokensPerDay: 2000000 },
      );
      if (!decision.allowed) throw new Error("Monthly reservation refused");
      state = decision.state;
    }
  }
  expect(validateModelBudgetState(state).months).toEqual([
    { month: "2026-10", reservedMicrousd: 0, unpricedTokens: 62000000 },
  ]);
});

test("a full month of ten-million-token days retains unpriced accounting", () => {
  const start = Date.parse("2026-10-01T12:00:00Z");
  let state = createModelBudgetState(start);
  for (let day = 0; day < 31; day++) {
    for (let index = 0; index < 50; index++) {
      const decision = reserveModelBudget(
        state,
        {
          ...request,
          requestId: `request-${day}-${index}`,
          requestedTokens: 200000,
        },
        { nowMs: start + day * 86400000, tokensPerDay: 10000000 },
      );
      if (!decision.allowed) throw new Error("Monthly reservation refused");
      state = decision.state;
    }
  }
  expect(validateModelBudgetState(state).months).toEqual([
    { month: "2026-10", reservedMicrousd: 0, unpricedTokens: 310000000 },
  ]);
}, 30000);

test("the higher daily cap retains the per-ticket and usage token ceilings", () => {
  expect(() =>
    reserveModelBudget(
      createModelBudgetState(nowMs),
      { ...request, requestCount: 41 },
      { nowMs, tokensPerDay: 10000000 },
    ),
  ).toThrow("Model budget schema is invalid.");
  expect(() =>
    reserveModelBudget(
      createModelBudgetState(nowMs),
      { ...request, requestedTokens: 200001 },
      { nowMs, tokensPerDay: 2000000 },
    ),
  ).toThrow("Model budget schema is invalid.");
  expect(() =>
    validateModelUsageEvidence([
      { ticketId: key, usage: { requests: 1, tokens: 200001 } },
    ]),
  ).toThrow("Model usage evidence is invalid.");
});

test("reservations cannot exceed the configured daily ceiling", () => {
  let state = createModelBudgetState(nowMs);
  for (let index = 0; index < 10; index++) {
    const decision = reserveModelBudget(
      state,
      { ...request, requestId: `request-${index}`, requestedTokens: 200000 },
      { nowMs, tokensPerDay: 2000000 },
    );
    if (!decision.allowed) throw new Error("Reservation refused");
    state = decision.state;
  }
  const charged = JSON.stringify(state);
  const refused = reserveModelBudget(
    state,
    { ...request, requestId: "request-10", requestedTokens: 1 },
    { nowMs, tokensPerDay: 2000000 },
  );
  expect(refused).toMatchObject({ allowed: false, reason: "daily-limit" });
  expect(refused.state).toBe(state);
  expect(JSON.stringify(state)).toBe(charged);
  expect(state.days[0]).toMatchObject({ requests: 10, tokens: 2000000 });
});

test("the higher daily cap preserves configured monthly USD and price checks", () => {
  const options = { nowMs, tokensPerDay: 2000000, monthlyUsd: 0.4 };
  const unpriced = { ...request, requestedTokens: 200000 };
  expect(
    reserveModelBudget(createModelBudgetState(nowMs), unpriced, options),
  ).toMatchObject({ allowed: false, reason: "price-unavailable" });
  const priced = {
    ...unpriced,
    price: {
      model: request.model,
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
    },
  };
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    priced,
    options,
  );
  if (!first.allowed) throw new Error("Priced reservation refused");
  expect(
    reserveModelBudget(
      first.state,
      { ...priced, operationKey: "b".repeat(64) },
      options,
    ),
  ).toMatchObject({ allowed: false, reason: "monthly-limit" });
});

test("forty reserved requests exhaust the shared allowance without releasing unknown outcomes", () => {
  const limits = { ...options, requestsPerDay: 40, tokensPerDay: 2000000 };
  const filled = reserveModelBudget(
    createModelBudgetState(nowMs),
    { ...request, requestCount: 40 },
    limits,
  );
  expect(filled.allowed).toBe(true);
  if (!filled.allowed) throw new Error("Fixture reservation failed");
  const state = settleModelBudget(filled.state, filled.ticket, null);
  expect(
    reserveModelBudget(
      state,
      { ...request, operationKey: "b".repeat(64) },
      limits,
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
  const options = { nowMs, requestsPerDay: 40 };
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

test("expired reservations preserve their charges and retain verification envelopes for ninety days", () => {
  const first = reserveModelBudget(
    createModelBudgetState(nowMs),
    request,
    options,
  );
  if (!first.allowed) throw new Error("Initial reservation refused");
  const expires = Date.parse(first.ticket.expiresAt);
  const charged = JSON.stringify(first.state);
  expect(
    reserveModelBudget(first.state, request, { nowMs: expires }),
  ).toMatchObject({ allowed: false, reason: "ticket-expired" });
  expect(JSON.stringify(first.state)).toBe(charged);
  const boundary = expires + 90 * 86400000;
  const retained = reserveModelBudget(first.state, request, {
    nowMs: boundary,
    tokensPerDay: 10000000,
  });
  if (!retained.allowed) throw new Error("Retention reservation refused");
  expect(retained.state.tickets).toContainEqual(first.ticket);
  const aged = reserveModelBudget(
    retained.state,
    { ...request, requestId: "after-retention" },
    { nowMs: boundary + 1, tokensPerDay: 10000000 },
  );
  if (!aged.allowed) throw new Error("Aged reservation refused");
  expect(aged.state.tickets).not.toContainEqual(first.ticket);
  expect(aged.state.days).toContainEqual(first.state.days[0]);
  expect(aged.state.months).toContainEqual(first.state.months[0]);
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

test("usage evidence records successful responses once while failed attempts remain reserved", () => {
  const reservation = reserveModelBudget(
    createModelBudgetState(nowMs),
    {
      ...request,
      requestCount: 3,
      requestedTokens: 20000,
    },
    options,
  );
  if (!reservation.allowed) throw new Error("Reservation failed");
  const producer = {
    runId: 700,
    workflow: ".github/workflows/enrich-catalog.yml",
  };
  const guard = createModelBudgetGuard({
    state: bindModelBudgetTicket(
      reservation.state,
      reservation.ticket.id,
      producer,
    ),
    ticketIds: [reservation.ticket.id],
    operationKey: key,
    ...producer,
    runAttempt: 1,
    nowMs: () => nowMs,
  });
  const call = {
    model: request.model,
    body: { messages: [] },
    maxOutputTokens: 1000,
  };
  const successful = guard.beforeRequest(call);
  guard.beforeRequest(call);
  guard.completeRequest(successful);
  guard.completeRequest(successful);
  const evidence = guard.usage();
  expect(evidence).toEqual([
    {
      ticketId: reservation.ticket.id,
      usage: { requests: 1, tokens: estimateRequestedTokens(call) },
    },
  ]);
  evidence[0].usage.requests = 0;
  expect(guard.usage()[0].usage.requests).toBe(1);
  expect(() => guard.completeRequest("foreign")).toThrow();
  expect(reservation.state.days[0]).toMatchObject({
    requests: 3,
    tokens: 20000,
  });
});
