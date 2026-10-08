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
    prepare: vi.fn(async () => result),
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
