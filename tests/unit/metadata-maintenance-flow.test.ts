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
import { prepareCatalogOperation } from "../../scripts/automation/catalog-preparation.mjs";
import { planCanonicalPublication } from "../../scripts/automation/write-lane.mjs";
import { buildPreparedCatalogPublication } from "../../scripts/automation/publication-build.mjs";

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
  expect(guard.usage()[0].usage.requests).toBe(1);
  fixture.state.local.modelBudget = budget;
  const context = await createPreparedPublicationContext({
    state: fixture.state,
    operation: fixture.operation,
    preparation: true,
    observeMetadata: async () => observation,
  });
  const prepared = await prepareCatalogOperation({
    state: fixture.state,
    operation: fixture.operation,
    producer: {
      runId: 700,
      workflow,
      sourceSha: context.mainSha,
    },
    context: async () => context,
    acquire: async () => outputs,
  });
  if (!prepared) throw new Error("No prepared result");
  prepared.modelUsage = guard.usage();
  const plan = planCanonicalPublication({
    operations: fixture.state.operations,
    currentMainSha: context.mainSha,
    expectedPublisherId: fixture.state.publisherActorId,
    candidates: [
      {
        result: prepared,
        currentState: context,
        run: {
          id: 700,
          path: workflow,
          event: "workflow_dispatch",
          head_branch: "main",
          head_sha: prepared.baseSha,
          actor: { id: fixture.state.publisherActorId, type: "Bot" },
          head_repository: { full_name: fixture.state.repository },
          status: "completed",
          conclusion: "success",
        },
      },
    ],
  });
  expect(plan.rejected).toEqual([]);
  const action = plan.actions[0];
  if (action?.action !== "commit") throw new Error("No canonical commit");
  const publication = await buildPreparedCatalogPublication({
    action,
    state: fixture.state,
  });
  const budgetFile = publication.find(
    (file) =>
      file.path === "data/maintenance/automation/model-budgets/global.json",
  );
  expect(budgetFile).toBeDefined();
  const settled = JSON.parse(budgetFile!.content);
  expect(settled.tickets[0]).toMatchObject({
    settled: true,
    usage: { requests: 1 },
  });
  expect(settled.days).toEqual(budget.days);
  expect(budget.tickets[0].settled).toBe(false);
  const replay = await buildPreparedCatalogPublication({
    action,
    state: {
      ...fixture.state,
      local: { ...fixture.state.local, modelBudget: settled },
    },
  });
  expect(replay.some((file) => file.path === budgetFile!.path)).toBe(false);
  const changed = structuredClone(budget);
  changed.tickets[0].producer!.runId = 701;
  await expect(
    buildPreparedCatalogPublication({
      action,
      state: {
        ...fixture.state,
        local: { ...fixture.state.local, modelBudget: changed },
      },
    }),
  ).rejects.toThrow();
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
