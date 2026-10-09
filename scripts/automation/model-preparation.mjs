import {
  reserveModelBudget,
  bindModelBudgetTicket,
  validateModelBudgetState,
} from "./model-budget.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";

const MODEL_KINDS = new Set([
  "project",
  "owner-request",
  "metadata",
  "enrichment",
  "advisory",
  "report-import",
]);
const PROBE_WINDOW_MS = 86_400_000;

// Receipts carry the existing shared model-provider circuit; reservations are its
// durable probe claim. Neither a new budget day nor an expired envelope clears it.
export function assessModelProviderCircuit({
  operations,
  receipts,
  budget,
  nowMs,
  models,
  operationKey,
  requestId,
}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    throw new Error("Model circuit clock is invalid.");
  if (budget) validateModelBudgetState(budget);
  const tickets = (budget?.tickets ?? []).filter(
    (ticket) => !models || models.includes(ticket.model),
  );
  const candidates = new Map();
  for (const receipt of receipts) {
    if (receipt.operation.retry?.failure.kind !== "configuration") continue;
    validateAutomationReceipt(receipt);
    candidates.set(receipt.operation.key, {
      operation: receipt.operation,
      observedAt: Date.parse(receipt.updatedAt),
    });
  }
  for (const operation of operations) {
    if (
      operation.retry?.failure.kind !== "configuration" ||
      candidates.has(operation.key)
    )
      continue;
    validateAutomationOperation(operation);
    candidates.set(operation.key, {
      operation,
      observedAt: Date.parse(operation.createdAt),
    });
  }
  const failures = [...candidates.values()].filter(({ operation }) => {
    if (
      !MODEL_KINDS.has(operation.identity.kind) ||
      ["budget-exhausted", "publisher-authentication-failed"].includes(
        operation.retry.failure.reasonCode,
      )
    )
      return false;
    const bound =
      budget?.tickets.filter(
        (ticket) => ticket.operationKey === operation.key,
      ) ?? [];
    return (
      !models ||
      !bound.length ||
      bound.some((ticket) => models.includes(ticket.model))
    );
  });
  if (!failures.length) return { open: false, blocked: false, reason: null };
  const latest = Math.max(...failures.map((value) => value.observedAt));
  const reason = failures.find((value) => value.observedAt === latest).operation
    .retry.failure.reasonCode;
  const recovered = failures.every(({ operation, observedAt }) => {
    const bound =
      budget?.tickets.filter(
        (ticket) => ticket.operationKey === operation.key,
      ) ?? [];
    return tickets.some(
      (ticket) =>
        ticket.settled &&
        ticket.usage?.requests > 0 &&
        Date.parse(ticket.createdAt) > observedAt &&
        Date.parse(ticket.createdAt) <= nowMs &&
        (!bound.length ||
          bound.some((previous) => previous.model === ticket.model)),
    );
  });
  if (recovered)
    return { open: false, blocked: false, reason: "verified-recovery" };
  const nextProbeAt = Math.max(
    ...failures.map(({ operation, observedAt }) =>
      Math.max(
        observedAt + PROBE_WINDOW_MS,
        Date.parse(operation.nextEligibleAt ?? "") || 0,
      ),
    ),
  );
  const claims = tickets.filter(
    (ticket) =>
      Date.parse(ticket.createdAt) > latest &&
      Date.parse(ticket.createdAt) + PROBE_WINDOW_MS > nowMs,
  );
  const ownClaim =
    operationKey &&
    requestId &&
    claims.length > 0 &&
    claims.every(
      (ticket) =>
        ticket.operationKey === operationKey &&
        [0, 1].some((index) => ticket.requestId === `${requestId}:${index}`),
    );
  return {
    open: true,
    blocked: nowMs < nextProbeAt || (claims.length > 0 && !ownClaim),
    reason,
  };
}

export async function reserveModelPreparation({
  operationKey,
  workflow,
  requestId,
  requests,
  load,
  persist,
  dispatch,
  nowMs,
  monthlyUsd,
}) {
  if (
    !/^[a-f0-9]{64}$/u.test(operationKey ?? "") ||
    ![
      ".github/workflows/generate-project-submission.yml",
      ".github/workflows/generate-project-owner-request.yml",
      ".github/workflows/enrich-catalog.yml",
      ".github/workflows/review-catalog-policy.yml",
      ".github/workflows/import-tavernkeeper-reports.yml",
    ].includes(workflow) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,110}$/u.test(requestId ?? "") ||
    !Array.isArray(requests) ||
    !requests.length ||
    requests.length > 2
  )
    throw new Error("Model preparation request is invalid.");
  let state = await load();
  if (!state.eligible) return { status: "superseded" };
  if (state.waitReason) return { status: "waiting", reason: state.waitReason };
  validateModelBudgetState(state.budget);
  let budget = state.budget;
  const tickets = [];
  for (const [index, request] of requests.entries()) {
    const decision = reserveModelBudget(
      budget,
      { ...request, operationKey, requestId: `${requestId}:${index}` },
      { nowMs, monthlyUsd },
    );
    if (!decision.allowed)
      return { status: "waiting", reason: decision.reason };
    budget = decision.state;
    tickets.push(decision.ticket);
  }
  const existing = state.budget.tickets.filter((ticket) =>
    tickets.some((current) => current.id === ticket.id),
  );
  if (existing.length) {
    if (existing.length !== tickets.length)
      throw new Error("Model preparation reservation is incomplete.");
    const producer = existing[0].producer;
    if (
      producer &&
      existing.every(
        (ticket) =>
          ticket.producer?.runId === producer.runId &&
          ticket.producer?.workflow === workflow,
      )
    )
      return {
        status: "dispatched",
        runId: producer.runId,
        ticketIds: tickets.map((ticket) => ticket.id),
      };
    // A lost dispatch or binding has an unknown outcome. Never spend the same envelope twice.
    return { status: "waiting", reason: "binding-unavailable" };
  }
  const reservation = await persist({ ...state, budget });
  if (!/^[a-f0-9]{40}$/u.test(reservation.sha ?? ""))
    throw new Error("Model reservation commit is unconfirmed.");
  const ticketIds = tickets.map((ticket) => ticket.id);
  const producer = await dispatch({ ticketIds, sourceSha: reservation.sha });
  if (
    !Number.isSafeInteger(producer?.runId) ||
    producer.runId < 1 ||
    producer.workflow !== workflow
  )
    throw new Error("Model preparation producer is unconfirmed.");
  state = await load();
  if (!state.eligible) return { status: "superseded" };
  budget = state.budget;
  for (const ticket of tickets) {
    const current = budget.tickets.find((value) => value.id === ticket.id);
    if (
      !current ||
      current.model !== ticket.model ||
      current.requestCount !== ticket.requestCount ||
      current.requestedTokens !== ticket.requestedTokens
    )
      throw new Error("Model preparation reservation changed.");
    budget = bindModelBudgetTicket(budget, ticket.id, producer);
  }
  await persist({ ...state, budget });
  return { status: "dispatched", runId: producer.runId, ticketIds };
}
