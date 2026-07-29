import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("runs advisory review after publication without blocking publication", async () => {
  const source = await readFile(
    ".github/workflows/review-catalog-policy.yml",
    "utf8",
  );
  const workflow = parse(source) as any;
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
  expect(source).toContain("reviewCatalogPolicy");
  expect(source).toContain("renderCatalogPolicyReviewIssue");
  expect(source).toContain("data/snapshots/policy-review/");
  expect(source).toContain("catalog-policy-advisory");
  expect(source).toContain("TAVERNARY_ENRICHMENT_API_URL");
  expect(source).toContain("review-unavailable");
  expect(source).not.toContain("gh pr merge");
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
