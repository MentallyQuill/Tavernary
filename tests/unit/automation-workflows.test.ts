import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { expect, test } from "vitest";

test("the controller runs every fifteen minutes using trusted main code and bounded execution", () => {
  const workflow = readFileSync(
    ".github/workflows/reconcile-automation.yml",
    "utf8",
  );
  expect(workflow).toContain('cron: "3,18,33,48 * * * *"');
  expect(workflow).toContain("ref: main");
  expect(workflow).toContain("timeout-minutes: 15");
  expect(workflow).toContain("cancel-in-progress: false");
  expect(workflow).toContain("npm run automation:reconcile -- --apply");
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
