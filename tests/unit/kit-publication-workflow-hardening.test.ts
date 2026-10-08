import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { parse } from "yaml";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { finalizeAutomationOperation } from "../../scripts/automation/finalization.mjs";
import {
  AUTOMATION_NOW,
  kitInventoryFixture,
} from "../helpers/automation-fixtures";

test("published Kits await the global deployment before the writer can close their issues", async () => {
  const operation = discoverKitOperations(
    kitInventoryFixture({ canonicalPublished: true }),
  )[0];
  expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
  const project = vi.fn();
  const persist = vi.fn();
  expect(
    await finalizeAutomationOperation({
      operationKey: operation.key,
      load: async () => ({ operations: [operation], nowMs: AUTOMATION_NOW }),
      project,
      persist,
    }),
  ).toEqual({ status: "waiting" });
  expect(project).not.toHaveBeenCalled();
  expect(persist).not.toHaveBeenCalled();
  const confirmed = discoverKitOperations(
    kitInventoryFixture({
      canonicalPublished: true,
      confirmedDeployment: true,
    }),
  )[0];
  expect(planAutomationWorker(confirmed)).toEqual({
    action: "dispatch",
    workflow: "automation-writer.yml",
    inputs: { mode: "finalize", operation_key: confirmed.key },
  });
});

test.each([
  ["apply-kit-submission", "publish"],
  ["apply-kit-withdrawal", "withdraw"],
])(
  "%s mints only a fresh dispatch token after current validation",
  async (name, jobName) => {
    const document = parse(
      await readFile(`.github/workflows/${name}.yml`, "utf8"),
    );
    const job = document.jobs[jobName];
    const tokenIndex = job.steps.findIndex(
      (step: { id?: string }) => step.id === "publisher-token",
    );
    const requestIndex = job.steps.findIndex(
      (step: { id?: string }) => step.id === "request",
    );
    expect(requestIndex).toBeGreaterThan(0);
    expect(tokenIndex).toBeGreaterThan(requestIndex);
    expect(job.steps[tokenIndex].with["permission-actions"]).toBe("write");
    expect(job.steps[tokenIndex].with["permission-contents"]).toBeUndefined();
    expect(job.steps[tokenIndex].if).toBe(
      "steps.request.outputs.prepare == 'true'",
    );
    expect(JSON.stringify(job)).not.toMatch(
      /git push|gh issue close|deploy-pages|--force/,
    );
  },
);
