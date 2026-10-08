import { createHash } from "node:crypto";
import { automationSchemaValidator } from "./operation.mjs";
import schema from "../../data/schemas/automation-model-budget.schema.json" with { type: "json" };
const validateSchema = automationSchemaValidator(schema);
export const MODEL_USAGE_SCHEMA = {
  type: "array",
  minItems: 1,
  maxItems: 2,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["ticketId", "usage"],
    properties: {
      ticketId: { type: "string", pattern: "^[a-f0-9]{64}$" },
      usage: {
        type: "object",
        additionalProperties: false,
        required: ["requests", "tokens"],
        properties: {
          requests: { type: "integer", minimum: 0, maximum: 40 },
          tokens: { type: "integer", minimum: 0, maximum: 200000 },
        },
      },
    },
  },
};
const validateUsage = automationSchemaValidator(MODEL_USAGE_SCHEMA);
export function validateModelUsageEvidence(value) {
  if (
    !validateUsage(value) ||
    new Set(value.map((row) => row.ticketId)).size !== value.length
  )
    throw new Error("Model usage evidence is invalid.");
  return value;
}
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function refuse(message = "Verified model allowance is unavailable.") {
  return Object.assign(new Error(message), { code: "budget-exhausted" });
}
function timestamp(nowMs) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 253402300799999)
    throw new Error("Budget clock is invalid.");
  return new Date(nowMs).toISOString();
}
function ticketId(day, operationKey, requestId) {
  return hash([day, operationKey, requestId]);
}
function worstCost(price, tokens) {
  return price
    ? Math.ceil(
        Math.max(price.inputUsdPerMillion, price.outputUsdPerMillion) * tokens,
      )
    : 0;
}
export function createModelBudgetState(nowMs) {
  return {
    schema_version: 1,
    updatedAt: timestamp(nowMs),
    days: [],
    months: [],
    tickets: [],
  };
}
export function validateModelBudgetState(value) {
  if (!validateSchema(value))
    throw new Error("Model budget schema is invalid.");
  const days = new Map(value.days.map((row) => [row.day, row]));
  const months = new Map(value.months.map((row) => [row.month, row]));
  if (
    days.size !== value.days.length ||
    months.size !== value.months.length ||
    new Set(value.tickets.map((ticket) => ticket.id)).size !==
      value.tickets.length
  )
    throw new Error("Model budget contains duplicate records.");
  const totals = new Map();
  const costs = new Map();
  for (const row of value.days) {
    if (
      new Date(`${row.day}T00:00:00Z`).toISOString().slice(0, 10) !== row.day ||
      row.day > value.updatedAt.slice(0, 10)
    )
      throw new Error("Model budget day is invalid.");
  }
  for (const row of value.months) {
    if (
      new Date(`${row.month}-01T00:00:00Z`).toISOString().slice(0, 7) !==
        row.month ||
      row.month > value.updatedAt.slice(0, 7)
    )
      throw new Error("Model budget month is invalid.");
  }
  for (const ticket of value.tickets) {
    const created = Date.parse(ticket.createdAt);
    const expires = Date.parse(ticket.expiresAt);
    if (
      ticket.id !==
        ticketId(ticket.day, ticket.operationKey, ticket.requestId) ||
      ticket.day !== ticket.createdAt.slice(0, 10) ||
      created > Date.parse(value.updatedAt) ||
      expires <= created ||
      expires >
        Math.min(
          created + 45 * 60000,
          Date.parse(`${ticket.day}T00:00:00Z`) + 86400000,
        ) ||
      (ticket.price && ticket.price.model !== ticket.model) ||
      ticket.reservedMicrousd !==
        worstCost(ticket.price, ticket.requestedTokens) ||
      (!ticket.settled && ticket.usage !== null) ||
      (ticket.usage &&
        (ticket.usage.requests > ticket.requestCount ||
          ticket.usage.tokens > ticket.requestedTokens))
    )
      throw new Error("Model ticket binding is invalid.");
    const total = totals.get(ticket.day) ?? { requests: 0, tokens: 0 };
    total.requests += ticket.requestCount;
    total.tokens += ticket.requestedTokens;
    totals.set(ticket.day, total);
    const month = ticket.day.slice(0, 7);
    const cost = costs.get(month) ?? { reservedMicrousd: 0, unpricedTokens: 0 };
    cost.reservedMicrousd += ticket.reservedMicrousd;
    if (!ticket.price) cost.unpricedTokens += ticket.requestedTokens;
    costs.set(month, cost);
  }
  for (const [day, total] of totals) {
    if (
      !days.has(day) ||
      days.get(day).requests < total.requests ||
      days.get(day).tokens < total.tokens
    )
      throw new Error("Model budget understates reserved daily allowance.");
  }
  for (const [month, cost] of costs) {
    if (
      !months.has(month) ||
      months.get(month).reservedMicrousd < cost.reservedMicrousd ||
      months.get(month).unpricedTokens < cost.unpricedTokens
    )
      throw new Error("Model budget understates reserved monthly allowance.");
  }
  return value;
}
export function reserveModelBudget(state, request, options) {
  validateModelBudgetState(state);
  const {
    nowMs,
    requestsPerDay = 40,
    tokensPerDay = 200000,
    monthlyUsd,
  } = options;
  const now = timestamp(nowMs);
  if (
    !Number.isInteger(requestsPerDay) ||
    requestsPerDay < 1 ||
    requestsPerDay > 40 ||
    !Number.isInteger(tokensPerDay) ||
    tokensPerDay < 1 ||
    tokensPerDay > 200000 ||
    (monthlyUsd !== undefined &&
      (!Number.isFinite(monthlyUsd) || monthlyUsd < 0 || monthlyUsd > 1000000))
  )
    throw new Error("Model budget limits are invalid.");
  const requestId = request.requestId ?? "primary";
  const day = now.slice(0, 10);
  const month = day.slice(0, 7);
  const candidate = {
    id: ticketId(day, request.operationKey, requestId),
    operationKey: request.operationKey,
    requestId,
    day,
    model: request.model,
    requestCount: request.requestCount,
    requestedTokens: request.requestedTokens,
    price: request.price ?? null,
    reservedMicrousd: worstCost(request.price, request.requestedTokens),
    createdAt: now,
    expiresAt: timestamp(
      Math.min(nowMs + 45 * 60000, Date.parse(`${day}T00:00:00Z`) + 86400000),
    ),
    producer: null,
    settled: false,
    usage: null,
  };
  const testState = createModelBudgetState(nowMs);
  testState.days = [
    {
      day,
      requests: candidate.requestCount,
      tokens: candidate.requestedTokens,
    },
  ];
  testState.months = [
    {
      month,
      reservedMicrousd: candidate.reservedMicrousd,
      unpricedTokens: candidate.price ? 0 : candidate.requestedTokens,
    },
  ];
  testState.tickets = [candidate];
  validateModelBudgetState(testState);
  if (nowMs < Date.parse(state.updatedAt))
    return { allowed: false, reason: "clock-skew", state };
  const existing = state.tickets.find((ticket) => ticket.id === candidate.id);
  if (existing) {
    for (const field of [
      "operationKey",
      "requestId",
      "day",
      "model",
      "requestCount",
      "requestedTokens",
      "price",
      "reservedMicrousd",
    ]) {
      if (!same(existing[field], candidate[field]))
        throw new Error("Model reservation replay changed its request.");
    }
    return nowMs >= Date.parse(existing.expiresAt) || existing.settled
      ? { allowed: false, reason: "ticket-expired", state }
      : { allowed: true, ticket: existing, state };
  }
  const previousDay = state.days.find((row) => row.day === day) ?? {
    day,
    requests: 0,
    tokens: 0,
  };
  const previousMonth = state.months.find((row) => row.month === month) ?? {
    month,
    reservedMicrousd: 0,
    unpricedTokens: 0,
  };
  if (
    previousDay.requests + candidate.requestCount > requestsPerDay ||
    previousDay.tokens + candidate.requestedTokens > tokensPerDay
  )
    return { allowed: false, reason: "daily-limit", state };
  if (
    monthlyUsd !== undefined &&
    (!candidate.price || previousMonth.unpricedTokens > 0)
  )
    return { allowed: false, reason: "price-unavailable", state };
  if (
    monthlyUsd !== undefined &&
    previousMonth.reservedMicrousd + candidate.reservedMicrousd >
      Math.floor(monthlyUsd * 1000000)
  )
    return { allowed: false, reason: "monthly-limit", state };
  const updated = structuredClone(state);
  updated.updatedAt = now;
  updated.days = [
    ...updated.days.filter((row) => row.day !== day),
    {
      day,
      requests: previousDay.requests + candidate.requestCount,
      tokens: previousDay.tokens + candidate.requestedTokens,
    },
  ].sort((a, b) => a.day.localeCompare(b.day));
  updated.months = [
    ...updated.months.filter((row) => row.month !== month),
    {
      month,
      reservedMicrousd:
        previousMonth.reservedMicrousd + candidate.reservedMicrousd,
      unpricedTokens:
        previousMonth.unpricedTokens +
        (candidate.price ? 0 : candidate.requestedTokens),
    },
  ].sort((a, b) => a.month.localeCompare(b.month));
  updated.tickets.push(candidate);
  // Expired reservations remain charged; only their old verification envelopes can age out.
  updated.tickets = updated.tickets.filter(
    (ticket) => Date.parse(ticket.expiresAt) >= nowMs - 90 * 86400000,
  );
  updated.days = updated.days.filter(
    (row) => Date.parse(`${row.day}T00:00:00Z`) >= nowMs - 91 * 86400000,
  );
  updated.months = updated.months.filter(
    (row) =>
      row.month >= new Date(nowMs - 400 * 86400000).toISOString().slice(0, 7),
  );
  validateModelBudgetState(updated);
  return { allowed: true, ticket: candidate, state: updated };
}
export function settleModelBudget(state, ticket, usage) {
  validateModelBudgetState(state);
  const current = state.tickets.find((value) => value.id === ticket.id);
  if (
    !current ||
    current.operationKey !== ticket.operationKey ||
    current.model !== ticket.model ||
    current.requestCount !== ticket.requestCount ||
    current.requestedTokens !== ticket.requestedTokens
  )
    throw new Error("Model settlement ticket is invalid.");
  if (
    usage !== null &&
    (!usage ||
      Object.keys(usage).sort().join(",") !== "requests,tokens" ||
      !Number.isInteger(usage.requests) ||
      usage.requests < 0 ||
      usage.requests > current.requestCount ||
      !Number.isInteger(usage.tokens) ||
      usage.tokens < 0 ||
      usage.tokens > current.requestedTokens)
  )
    throw new Error("Model usage is invalid.");
  if (current.settled) {
    if (!same(current.usage, usage))
      throw new Error("Model settlement replay changed usage.");
    return state;
  }
  const updated = structuredClone(state);
  Object.assign(
    updated.tickets.find((value) => value.id === current.id),
    { settled: true, usage },
  );
  return validateModelBudgetState(updated);
}
export function bindModelBudgetTicket(state, id, producer) {
  validateModelBudgetState(state);
  const ticket = state.tickets.find((value) => value.id === id);
  if (
    !ticket ||
    ticket.settled ||
    (ticket.producer && !same(ticket.producer, producer))
  )
    throw refuse("Model ticket producer is invalid.");
  if (ticket.producer) return state;
  const updated = structuredClone(state);
  updated.tickets.find((value) => value.id === id).producer = producer;
  return validateModelBudgetState(updated);
}
export function settlePreparedModelUsage(state, settlements) {
  validateModelBudgetState(state);
  if (
    !Array.isArray(settlements) ||
    !settlements.length ||
    settlements.length > 20
  )
    throw new Error("Model settlement batch is invalid.");
  let updated = state;
  const seen = new Set();
  for (const row of settlements) {
    validateModelUsageEvidence(row.modelUsage);
    if (
      !/^[a-f0-9]{64}$/u.test(row.operationKey ?? "") ||
      !Number.isSafeInteger(row.producer?.runId) ||
      row.producer.runId < 1 ||
      !/^\.github\/workflows\/[a-z0-9-]+\.yml$/u.test(
        row.producer.workflow ?? "",
      )
    )
      throw new Error("Model settlement producer is invalid.");
    const tickets = updated.tickets.filter(
      (ticket) =>
        ticket.operationKey === row.operationKey &&
        ticket.producer?.runId === row.producer.runId &&
        ticket.producer?.workflow === row.producer.workflow,
    );
    if (tickets.length !== row.modelUsage.length)
      throw new Error("Model settlement reservation changed.");
    for (const evidence of row.modelUsage) {
      const ticket = tickets.find((value) => value.id === evidence.ticketId);
      if (!ticket || seen.has(ticket.id))
        throw new Error("Model settlement ticket is invalid.");
      seen.add(ticket.id);
      updated = settleModelBudget(updated, ticket, evidence.usage);
    }
  }
  return updated;
}
export function estimateRequestedTokens({ body, maxOutputTokens }) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 16384
  )
    throw new Error("Model request token bound is invalid.");
  const bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
  if (bytes > 1048576) throw refuse("Model request exceeds its content bound.");
  // UTF-8 bytes conservatively bound input tokens, including schema and message framing.
  return bytes + 1024 + maxOutputTokens;
}
export function createModelBudgetGuard({
  state,
  ticketIds,
  operationKey,
  runId,
  workflow,
  runAttempt,
  nowMs = Date.now,
}) {
  validateModelBudgetState(state);
  if (
    !Array.isArray(ticketIds) ||
    !ticketIds.length ||
    new Set(ticketIds).size !== ticketIds.length ||
    runAttempt !== 1
  )
    throw refuse("Model ticket context is invalid.");
  const tickets = ticketIds.map((id) =>
    state.tickets.find((value) => value.id === id),
  );
  if (
    tickets.some(
      (ticket) =>
        !ticket ||
        ticket.operationKey !== operationKey ||
        ticket.settled ||
        ticket.producer?.runId !== runId ||
        ticket.producer?.workflow !== workflow,
    )
  )
    throw refuse("Model ticket is not bound to this producer.");
  const spent = new Map();
  const requests = new Map();
  const successful = new Map();
  return {
    beforeRequest({ model, body, maxOutputTokens }) {
      const clock = nowMs();
      const needed = estimateRequestedTokens({ body, maxOutputTokens });
      const ticket = tickets.find((ticket) => {
        const use = spent.get(ticket.id) ?? { requests: 0, tokens: 0 };
        return (
          ticket.model === model &&
          clock >= Date.parse(ticket.createdAt) &&
          clock < Date.parse(ticket.expiresAt) &&
          use.requests < ticket.requestCount &&
          use.tokens + needed <= ticket.requestedTokens
        );
      });
      if (!ticket) throw refuse();
      const use = spent.get(ticket.id) ?? { requests: 0, tokens: 0 };
      spent.set(ticket.id, {
        requests: use.requests + 1,
        tokens: use.tokens + needed,
      });
      const receipt = `${ticket.id}:${use.requests + 1}`;
      requests.set(receipt, {
        ticketId: ticket.id,
        tokens: needed,
        complete: false,
      });
      return receipt;
    },
    completeRequest(receipt) {
      const request = requests.get(receipt);
      if (!request) throw refuse("Model response receipt is invalid.");
      if (request.complete) return;
      request.complete = true;
      const previous = successful.get(request.ticketId) ?? {
        requests: 0,
        tokens: 0,
      };
      successful.set(request.ticketId, {
        requests: previous.requests + 1,
        tokens: previous.tokens + request.tokens,
      });
    },
    usage() {
      // Successful transport evidence uses conservative requested token bounds;
      // billing and failed/interrupted requests remain charged by the reservation.
      return tickets.map((ticket) => ({
        ticketId: ticket.id,
        usage: { ...(successful.get(ticket.id) ?? { requests: 0, tokens: 0 }) },
      }));
    },
  };
}
