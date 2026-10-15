import { createHash } from "node:crypto";
import type { ModelBudgetState } from "../../scripts/automation/model-budget.mjs";

export function maximumModelBudgetFixture(): ModelBudgetState {
  const start = Date.parse("2025-01-01T12:00:00Z");
  const operationKey = "a".repeat(64);
  const model = "m".repeat(128);
  const state: ModelBudgetState = {
    schema_version: 1,
    updatedAt: "2026-01-01T12:00:00.000Z",
    days: Array.from({ length: 366 }, (_, index) => ({
      day: new Date(start + index * 86400000).toISOString().slice(0, 10),
      requests: 200,
      tokens: 10000000,
    })),
    months: Array.from({ length: 24 }, (_, index) => ({
      month: new Date(Date.UTC(2024, index + 1, 1)).toISOString().slice(0, 7),
      reservedMicrousd: Number.MAX_SAFE_INTEGER,
      unpricedTokens: 310000000,
    })),
    tickets: [],
  };
  for (let index = 0; index < 20000; index++) {
    const created = start + Math.floor(index / 100) * 86400000;
    const createdAt = new Date(created).toISOString();
    const day = createdAt.slice(0, 10);
    const requestId = `request-${index}`.padEnd(128, "r");
    state.tickets.push({
      id: createHash("sha256")
        .update(JSON.stringify([day, operationKey, requestId]))
        .digest("hex"),
      operationKey,
      requestId,
      day,
      model,
      requestCount: 1,
      requestedTokens: 100000,
      price: {
        model,
        inputUsdPerMillion: 1.0000000000000003e-100,
        outputUsdPerMillion: 1.0000000000000003e-100,
      },
      reservedMicrousd: 1,
      createdAt,
      expiresAt: new Date(created + 45 * 60000).toISOString(),
      producer: {
        runId: Number.MAX_SAFE_INTEGER,
        workflow: ".github/workflows/generate-project-owner-request.yml",
      },
      settled: true,
      usage: { requests: 1, tokens: 100000 },
    });
  }
  return state;
}
