import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";

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

test("the canonical writer serializes receipt mutations and mints its write token after setup", () => {
  const writer = readFileSync(
    ".github/workflows/automation-writer.yml",
    "utf8",
  );
  expect(writer).toContain("group: canonical-publication");
  expect(writer).toContain("cancel-in-progress: false");
  expect(writer).toContain("ref: main");
  expect(writer).toContain("permission-contents: write");
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
