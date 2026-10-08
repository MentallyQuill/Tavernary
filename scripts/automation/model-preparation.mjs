import {
  reserveModelBudget,
  bindModelBudgetTicket,
  validateModelBudgetState,
} from "./model-budget.mjs";

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
