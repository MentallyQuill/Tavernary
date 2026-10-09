import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { discoverReportOperations } from "../../scripts/automation/report-operations.mjs";
import { reportInventoryFixture } from "../helpers/automation-fixtures";
import { parse } from "yaml";

test("expired-archive retention has the browsers required by its public-proof fallback", () => {
  const workflow = parse(
    readFileSync(".github/workflows/automation-writer.yml", "utf8"),
  );
  const browsers = workflow.jobs.write.steps.find(
    (step: { name?: string }) =>
      step.name === "Install public verification browsers",
  );
  expect(browsers.run).toContain(
    "playwright install --with-deps chromium webkit",
  );
  expect(browsers.if).toContain("inputs.mode == 'retain'");
});

test("owner rollouts use read-only native requests and enrichment has no privileged legacy writer", () => {
  const enrichment = parse(
    readFileSync(".github/workflows/enrich-catalog.yml", "utf8"),
  );
  const request = parse(
    readFileSync(".github/workflows/request-catalog-enrichment.yml", "utf8"),
  );
  expect(Object.keys(enrichment.jobs)).toEqual(["prepare"]);
  expect(enrichment.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  expect(
    enrichment.on.workflow_dispatch.inputs.enrichment_scope,
  ).toBeUndefined();
  expect(enrichment.on.workflow_dispatch.inputs.operation_key.required).toBe(
    true,
  );
  expect(request.jobs.request["timeout-minutes"]).toBe(5);
  expect(request.permissions).toEqual({ contents: "read" });
  expect(request.jobs.request.if).toContain("github.actor_id == 2625904");
  expect(JSON.stringify(request)).not.toMatch(
    /PRIVATE_KEY|UTILITY_API_KEY|permission-contents/,
  );
});

test.each(["enrich-catalog.yml", "review-catalog-policy.yml"])(
  "reconciled %s provides a pinned read-only budgeted preparation endpoint",
  (workflowName) => {
    const workflow = parse(
      readFileSync(`.github/workflows/${workflowName}`, "utf8"),
    );
    expect(workflow.on.workflow_dispatch.inputs.operation_key).toBeDefined();
    expect(workflow.on.workflow_dispatch.inputs.budget_ticket).toBeDefined();
    const job = workflow.jobs.prepare;
    expect(job["timeout-minutes"]).toBe(45);
    expect(job.permissions).toEqual({
      contents: "read",
      actions: "read",
      issues: "read",
      "pull-requests": "read",
    });
    expect(job.if).toContain(
      "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
    );
    const checkout = job.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout.with.ref).toBe("${{ github.sha }}");
    expect(checkout.with["persist-credentials"]).toBe(false);
    const prepare = job.steps.find(
      (step: { run?: string }) =>
        step.run === "node scripts/automation/catalog-preparation-cli.mjs",
    );
    expect(prepare.env.TAVERNARY_REQUIRE_MODEL_BUDGET).toBe("true");
    expect(
      job.steps.some(
        (step: { with?: Record<string, unknown> }) =>
          step.with?.["permission-contents"] === "write",
      ),
    ).toBe(false);
    for (const [name, legacy] of Object.entries(workflow.jobs) as Array<
      [string, { if?: string }]
    >) {
      if (name !== "prepare" && legacy.if && !legacy.if.includes("needs."))
        expect(legacy.if).toContain("inputs.operation_key == ''");
    }
  },
);

test("the controller runs every fifteen minutes using trusted main code and bounded execution", () => {
  const workflow = readFileSync(
    ".github/workflows/reconcile-automation.yml",
    "utf8",
  );
  expect(workflow).toContain('cron: "3,18,33,48 * * * *"');
  expect(workflow).toContain("--ref main");
  expect(workflow).toContain("timeout-minutes: 15");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("gh workflow run automation-writer.yml");
  expect(workflow).not.toContain("permission-contents: write");
});

test("operation preparation is bound to a key and limited to forty-five minutes", () => {
  const workflow = readFileSync(
    ".github/workflows/automation-worker.yml",
    "utf8",
  );
  expect(workflow).toContain(
    'run-name: "Automation ${{ inputs.operation_key }}"',
  );
  expect(workflow).toContain("timeout-minutes: 45");
  expect(workflow).toContain("ref: main");
  expect(workflow).toContain("permission-actions: write");
  expect(workflow).not.toContain("permission-contents: write");
  expect(workflow).toContain("vars.TAVERNARY_PUBLISHER_BOT_ID");
});

test("every successful workflow wake names an actual workflow and failures rely on scheduled recovery", () => {
  const controller = readFileSync(
    ".github/workflows/reconcile-automation.yml",
    "utf8",
  );
  const actualNames = new Set(
    readdirSync(".github/workflows")
      .filter((file) => file.endsWith(".yml"))
      .map(
        (file) =>
          readFileSync(`.github/workflows/${file}`, "utf8").match(
            /^name: "([^"]+)"/mu,
          )?.[1],
      ),
  );
  const watched = controller.match(/    workflows:\n([\s\S]*?)    types:/u)![1];
  for (const [, name] of watched.matchAll(/- "([^"]+)"/gu))
    expect(actualNames.has(name)).toBe(true);
  expect(controller).toContain(
    "github.event.workflow_run.conclusion == 'success'",
  );
});

test("the canonical writer queues receipt mutations and mints its write token after setup", () => {
  const writer = readFileSync(
    ".github/workflows/automation-writer.yml",
    "utf8",
  );
  expect(writer).toContain("group: canonical-publication");
  expect(writer).toContain("queue: max");
  expect(writer).toContain("cancel-in-progress: false");
  expect(writer).toContain("ref: main");
  expect(writer).toContain("permission-contents: write");
  expect(writer).toContain("permission-checks: read");
  expect(writer).toContain(
    "permission-workflows: ${{ inputs.mode == 'retain' && 'write' || '' }}",
  );
  expect(writer.indexOf("Create fresh scoped writer token")).toBeGreaterThan(
    writer.indexOf("npm ci"),
  );
  expect(writer).toContain("node scripts/automation/writer-cli.mjs");
});
test("reconciled refreshes prepare one pinned data artifact and cannot use the legacy direct publisher", () => {
  const workflow = readFileSync(
    ".github/workflows/refresh-catalog.yml",
    "utf8",
  );
  expect(workflow).toContain("operation_key:");
  expect(workflow).toContain("inputs.operation_key == ''");
  const preparation = workflow.slice(workflow.indexOf("  prepare:"));
  expect(preparation).toContain("timeout-minutes: 45");
  expect(preparation).toContain("ref: ${{ github.sha }}");
  expect(preparation).toContain(
    "node scripts/automation/catalog-preparation-cli.mjs",
  );
  expect(preparation).toContain(
    "automation-prepared-${{ inputs.operation_key }}",
  );
  expect(preparation).toContain("retention-days: 90");
  expect(preparation).not.toContain("permission-contents: write");
  expect(preparation).not.toContain("git push");
  expect(preparation).not.toContain("gh workflow run");
  expect(preparation).toContain("/result.json");
});

test("reconciled report imports prepare pinned data with read-only credentials and preserve deterministic fallback without a ticket", () => {
  const operation = discoverReportOperations(reportInventoryFixture())[0];
  expect(planAutomationWorker(operation)).toEqual({
    action: "dispatch",
    workflow: "import-tavernkeeper-reports.yml",
    inputs: { operation_key: operation.key },
  });
  const workflow = readFileSync(
    ".github/workflows/import-tavernkeeper-reports.yml",
    "utf8",
  );
  expect(workflow).toContain("inputs.operation_key == ''");
  const prepared = workflow.slice(workflow.indexOf("  prepare:"));
  expect(prepared).toContain("ref: ${{ github.sha }}");
  expect(prepared).toContain("timeout-minutes: 45");
  expect(prepared).toContain("catalog-preparation-cli.mjs");
  expect(prepared).not.toContain("permission-contents: write");
  expect(prepared).not.toContain("git push");
  expect(prepared).toContain(
    "inputs.budget_ticket != '' && secrets.UTILITY_API_KEY || ''",
  );
  expect(prepared).toContain('TAVERNARY_REQUIRE_MODEL_BUDGET: "true"');
});
