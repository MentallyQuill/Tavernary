import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("advisory requests preserve their entrypoints while only reserved preparation receives model credentials", async () => {
  const source = await readFile(
    ".github/workflows/review-catalog-policy.yml",
    "utf8",
  );
  const workflow = parse(source);
  expect(workflow.on.workflow_dispatch.inputs).toMatchObject({
    project_id: { required: true, type: "string" },
    transaction_issue_number: { required: true, type: "number" },
    transaction_pull_number: { required: true, type: "number" },
    merge_sha: { required: true, type: "string" },
  });
  expect(workflow.on.schedule).toBeDefined();
  expect(workflow.concurrency).toEqual({
    group: "catalog-policy-review",
    "cancel-in-progress": false,
  });
  expect(JSON.stringify(workflow.jobs.review)).not.toMatch(
    /UTILITY_API_KEY|TAVERNARY_ENRICHMENT_API_KEY|permission-contents.*write|git push/,
  );
  const steps = workflow.jobs.prepare.steps as Array<{
    name?: string;
    env?: Record<string, string>;
  }>;
  const credentialSteps = steps.filter((step) => step.env?.UTILITY_API_KEY);
  expect(credentialSteps).toHaveLength(1);
  expect(credentialSteps[0].name).toBe(
    "Prepare one operation with reserved model allowance",
  );
  expect(credentialSteps[0].env).toMatchObject({
    TAVERNARY_REQUIRE_MODEL_BUDGET: "true",
    UTILITY_API_KEY: "${{ secrets.UTILITY_API_KEY }}",
    TAVERNARY_ENRICHMENT_API_KEY: "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
  });
  expect(source).not.toMatch(/gh pr merge|git push/);
});

test("publisher dispatches advisory review only after a confirmed merge", async () => {
  const source = await readFile(
    ".github/workflows/publish-project-transaction.yml",
    "utf8",
  );
  expect(source).toContain("gh workflow run review-catalog-policy.yml");
  expect(source).toContain('-f project_id="$PROJECT_ID"');
  expect(source).toContain('-f transaction_issue_number="$ISSUE_NUMBER"');
  expect(source).toContain('-f transaction_pull_number="$PULL_NUMBER"');
  expect(source).toContain('-f merge_sha="$MERGE_SHA"');
});
