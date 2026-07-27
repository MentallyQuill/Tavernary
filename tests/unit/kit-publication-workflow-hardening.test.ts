import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

async function publicationSteps() {
  const source = await readFile(
    resolve(".github/workflows/apply-kit-submission.yml"),
    "utf8",
  );
  const document = parse(source) as {
    jobs: {
      publish: {
        steps: Array<{
          name?: string;
          run?: string;
          "continue-on-error"?: boolean;
        }>;
      };
    };
  };
  return document.jobs.publish.steps;
}

test("dispatches the exact published Kit commit before issue bookkeeping", async () => {
  const steps = await publicationSteps();
  const deploy = steps.findIndex(
    (step) => step.name === "Deploy updated catalog",
  );
  const bookkeeping = steps.findIndex(
    (step) => step.name === "Finalize published issue",
  );

  expect(deploy).toBeGreaterThanOrEqual(0);
  expect(bookkeeping).toBeGreaterThan(deploy);
  expect(steps[deploy]?.run).toContain(
    'source_sha="${{ steps.commit.outputs.sha }}"',
  );
  expect(steps[deploy]?.["continue-on-error"]).not.toBe(true);
});

test("treats Kit issue labeling as warning-only bookkeeping", async () => {
  const steps = await publicationSteps();
  const bookkeeping = steps.find(
    (step) => step.name === "Finalize published issue",
  );

  expect(bookkeeping?.run).toContain("gh label view kit-published");
  expect(bookkeeping?.run).toContain("gh label create kit-published");
  expect(bookkeeping?.run).toMatch(
    /gh label create kit-published[\s\S]*\|\|\s+true/,
  );
  expect(bookkeeping?.run).toContain(
    'gh issue edit "${{ inputs.issue_number }}" --add-label kit-published',
  );
  expect(bookkeeping?.run).toContain(
    "::warning title=Kit publication bookkeeping::",
  );
  expect(bookkeeping?.run).toMatch(
    /if ! gh issue edit[\s\S]*then[\s\S]*::warning/,
  );
});

test("closes a published Kit issue only after exact-SHA deployment dispatch", async () => {
  const steps = await publicationSteps();
  const deploy = steps.findIndex(
    (step) => step.name === "Deploy updated catalog",
  );
  const finalize = steps.findIndex(
    (step) => step.name === "Finalize published issue",
  );

  expect(finalize).toBeGreaterThan(deploy);
  expect(steps[finalize]?.run).toContain(
    'gh issue close "${{ inputs.issue_number }}" --reason completed',
  );
  expect(steps[finalize]?.run).toContain(
    "::warning title=Kit publication bookkeeping::",
  );
});
