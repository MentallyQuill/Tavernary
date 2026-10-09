import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import { runCatalogPreparationCli } from "../../scripts/automation/catalog-preparation-cli.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import * as catalogPreparation from "../../scripts/automation/catalog-preparation.mjs";
import * as modelBudgetGithub from "../../scripts/automation/model-budget-github.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
  bindModelBudgetTicket,
  createModelBudgetGuard,
} from "../../scripts/automation/model-budget.mjs";
import { operationFixture } from "../helpers/automation-fixtures";
function fixture() {
  const result = preparedResultFixture();
  const context = preparedResultContextFixture();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: result.repository,
    publisherActorId: context.publisherActorId,
    nowMs: Date.now(),
    operations: [context.operation],
    receipts: [],
    local: { revision: result.baseSha },
    remote: { mainHeadSha: result.baseSha, issues: [], pulls: [], runs: [] },
  };
  const env = {
    GITHUB_REPOSITORY: result.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: String(context.publisherActorId),
    GITHUB_SHA: result.baseSha,
    GITHUB_RUN_ID: String(context.run.id),
    GITHUB_WORKFLOW_REF: `${result.repository}/${context.run.path}@refs/heads/main`,
    TAVERNARY_PUBLISHER_BOT_ID: String(context.publisherActorId),
  };
  return {
    state,
    env,
    event: {
      inputs: { operation_key: context.operation.key, mode: "project" },
    },
    load: vi.fn(async () => state),
    prepare: vi.fn<typeof catalogPreparation.prepareCatalogOperation>(
      async () => result,
    ),
    write: vi.fn(),
  };
}
test("the production preparation CLI saves a single validated result with its operation identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-prepared-cli-"));
  const input = fixture();
  try {
    expect(
      await runCatalogPreparationCli({ ...input, outputDirectory: root }),
    ).toBe(0);
    expect(
      JSON.parse(await readFile(join(root, "result.json"), "utf8")),
    ).toEqual(preparedResultFixture());
    expect(input.write).toHaveBeenCalledWith(
      expect.stringContaining('"status":"prepared"'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("a removed or superseded operation exits without consuming acquisition resources", async () => {
  const input = fixture();
  input.state.operations = [];
  expect(await runCatalogPreparationCli(input)).toBe(0);
  expect(input.prepare).not.toHaveBeenCalled();
  expect(input.write).toHaveBeenCalledWith(
    expect.stringContaining('"status":"superseded"'),
  );
});
test("an owner dispatch must use the request path before becoming a trusted producer", async () => {
  const input = fixture();
  input.env.GITHUB_ACTOR_ID = "2625904";
  expect(await runCatalogPreparationCli(input)).toBe(1);
  expect(input.prepare).not.toHaveBeenCalled();
});
test("provider failures produce safe diagnostics without persisting response text", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-prepared-cli-"));
  const input = fixture();
  input.prepare.mockRejectedValue(
    Object.assign(new Error("secret provider payload"), { status: 429 }),
  );
  try {
    expect(
      await runCatalogPreparationCli({ ...input, outputDirectory: root }),
    ).toBe(1);
    const diagnostic = await readFile(join(root, "diagnostic.json"), "utf8");
    expect(diagnostic).not.toContain("secret provider payload");
    expect(JSON.parse(diagnostic).failure.kind).toBe("transient");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the production CLI reuses one verified guard and includes its safe usage in the result", async () => {
  const input = fixture();
  const operation = operationFixture({
    identity: {
      kind: "metadata",
      subject: "source:github-42:example-project",
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
  });
  input.state.operations = [operation];
  input.event.inputs.operation_key = operation.key;
  const workflow = ".github/workflows/enrich-catalog.yml";
  input.env.GITHUB_WORKFLOW_REF = `${input.state.repository}/${workflow}@refs/heads/main`;
  const reservation = reserveModelBudget(
    createModelBudgetState(input.state.nowMs),
    {
      operationKey: operation.key,
      model: "approved",
      requestCount: 2,
      requestedTokens: 20000,
    },
    { nowMs: input.state.nowMs },
  );
  if (!reservation.allowed) throw new Error("Reservation failed");
  const producer = { runId: 700, workflow };
  const guard = createModelBudgetGuard({
    state: bindModelBudgetTicket(
      reservation.state,
      reservation.ticket.id,
      producer,
    ),
    operationKey: operation.key,
    ticketIds: [reservation.ticket.id],
    ...producer,
    runAttempt: 1,
    nowMs: () => input.state.nowMs,
  });
  const budgetLoader = vi
    .spyOn(modelBudgetGithub, "loadProducerBudgetGuard")
    .mockResolvedValue(guard);
  const acquire = vi
    .spyOn(catalogPreparation, "acquireCatalogData")
    .mockImplementation(async (options) => {
      const first = await options.options?.budgetGuard?.();
      const second = await options.options?.budgetGuard?.();
      expect(second).toBe(first);
      const receipt = first!.beforeRequest({
        model: "approved",
        body: { messages: [] },
        maxOutputTokens: 1000,
      });
      if (typeof receipt === "string") first!.completeRequest!(receipt);
      return {};
    });
  const result = preparedResultFixture({
    kind: "metadata",
    operationKey: operation.key,
    producer: { ...producer, sourceSha: input.env.GITHUB_SHA },
  });
  input.prepare.mockImplementation(async (options) => {
    await options.acquire?.({ state: input.state, operation });
    return result;
  });
  const directory = await mkdtemp(join(tmpdir(), "tavernary-prepared-cli-"));
  try {
    expect(
      await runCatalogPreparationCli({ ...input, outputDirectory: directory }),
    ).toBe(0);
    expect(budgetLoader).toHaveBeenCalledOnce();
    const saved = JSON.parse(
      await readFile(join(directory, "result.json"), "utf8"),
    );
    expect(saved.modelUsage).toEqual(guard.usage());
    expect(JSON.stringify(saved.modelUsage)).not.toContain("messages");
  } finally {
    acquire.mockRestore();
    budgetLoader.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
