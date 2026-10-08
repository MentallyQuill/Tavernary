import { expect, test } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { validateMetadataCache } from "../../scripts/automation/metadata-refresh.mjs";
import { createPreparedPublicationContext } from "../../scripts/automation/publication-context.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
  bindModelBudgetTicket,
  createModelBudgetGuard,
} from "../../scripts/automation/model-budget.mjs";
import { createEnrichmentProvider } from "../../scripts/catalog/enrichment-provider.mjs";
import { acquirePreparedMetadataData } from "../../scripts/automation/metadata-preparation.mjs";

test("the writer reservation fits a bounded real metadata prompt before transport", async () => {
  const fixture = await metadataMaintenanceFixture();
  const observation = await fixture.observe();
  observation.source.text = "Verified source documentation. "
    .repeat(250)
    .slice(0, 8000);
  observation.source.readmeText = observation.source.text;
  const reservation = reserveModelBudget(
    createModelBudgetState(fixture.state.nowMs),
    {
      operationKey: fixture.operation.key,
      model: "approved",
      requestCount: 3,
      requestedTokens: 180000,
    },
    { nowMs: fixture.state.nowMs },
  );
  if (!reservation.allowed) throw new Error("Reservation failed");
  const workflow = ".github/workflows/enrich-catalog.yml";
  const budget = bindModelBudgetTicket(
    reservation.state,
    reservation.ticket.id,
    { runId: 700, workflow },
  );
  const guard = createModelBudgetGuard({
    state: budget,
    ticketIds: [reservation.ticket.id],
    operationKey: fixture.operation.key,
    runId: 700,
    workflow,
    runAttempt: 1,
    nowMs: () => fixture.state.nowMs,
  });
  let modelCalls = 0;
  const provider = createEnrichmentProvider({
    apiUrl: "https://provider.example/v1",
    apiKey: "fixture",
    model: "approved",
    requireBudget: true,
    budgetGuard: guard,
    fetchImpl: async () => {
      modelCalls++;
      if (modelCalls < 3) return Response.json({}, { status: 503 });
      return Response.json({
        model: "approved",
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: {
                  value: fixture.project.summary,
                  evidence: ["readme:1-2"],
                },
                result: "accepted-unchanged",
                change_reasons: [],
                policy_signal: "none",
                tags: [],
              }),
            },
          },
        ],
      });
    },
  });
  const outputs = await acquirePreparedMetadataData({
    state: fixture.state,
    operation: fixture.operation,
    options: {
      observe: async () => observation,
      provider,
      sleep: async () => undefined,
    },
  });
  expect(modelCalls).toBe(3);
  expect(
    outputs[`data/registry/projects/${fixture.project.id}.json`],
  ).toBeDefined();
});

test("the writer binds cache provenance to the actual proposed project and observed content", async () => {
  const fixture = await metadataMaintenanceFixture({ manualSummary: true });
  const outputs = await fixture.run();
  const context = await createPreparedPublicationContext({
    state: fixture.state,
    operation: fixture.operation,
    observeMetadata: fixture.observe,
  });
  const files = Object.entries(outputs).map(([path, content]) => ({
    path,
    content,
  }));
  expect(context.validateFiles?.(files)).toBe(true);
  const cacheFile = files.find((file) => file.path.includes("/metadata/"))!;
  const cache = JSON.parse(cacheFile.content);
  cache.outputDigest = "b".repeat(64);
  expect(
    context.validateFiles?.(
      files.map((file) =>
        file === cacheFile ? { ...file, content: JSON.stringify(cache) } : file,
      ),
    ),
  ).toBe(false);
  cache.outputDigest = JSON.parse(cacheFile.content).outputDigest;
  cache.fingerprint = "b".repeat(64);
  expect(
    context.validateFiles?.(
      files.map((file) =>
        file === cacheFile ? { ...file, content: JSON.stringify(cache) } : file,
      ),
    ),
  ).toBe(false);
  expect(
    context.validateFiles?.(files.filter((file) => file !== cacheFile)),
  ).toBe(false);
});

test("an unchanged normalized source emits a new cache binding without model calls", async () => {
  const fixture = await metadataMaintenanceFixture({ unchanged: true });
  const outputs = await fixture.run();
  expect(fixture.modelCalls()).toBe(0);
  expect(Object.keys(outputs)).toEqual([
    `data/maintenance/automation/metadata/${fixture.operation.key}.json`,
  ]);
  const cache = validateMetadataCache(JSON.parse(Object.values(outputs)[0]));
  expect(cache.headSha).toBe(fixture.snapshot.repository.head_sha);
  expect(cache.inputDigest).toBe(fixture.operation.identity.inputDigest);
});

test("automatic tags can refresh while a manual summary remains exact", async () => {
  const fixture = await metadataMaintenanceFixture({ manualSummary: true });
  const before = JSON.stringify(fixture.project);
  const outputs = await fixture.run();
  const updated = JSON.parse(
    outputs[`data/registry/projects/${fixture.project.id}.json`],
  );
  expect(updated.summary).toBe(fixture.project.summary);
  expect(updated.metadata_policy.summary.mode).toBe("manual");
  expect(updated.tags).toEqual([]);
  expect(fixture.modelCalls()).toBe(1);
  expect(JSON.stringify(fixture.project)).toBe(before);
});

test("missing mandatory allowance leaves canonical metadata unchanged with zero HTTP", async () => {
  const fixture = await metadataMaintenanceFixture({ budgetExhausted: true });
  const before = JSON.stringify(fixture.state.local);
  await expect(fixture.run()).rejects.toMatchObject({
    code: "budget-exhausted",
  });
  expect(fixture.modelCalls()).toBe(0);
  expect(JSON.stringify(fixture.state.local)).toBe(before);
});
