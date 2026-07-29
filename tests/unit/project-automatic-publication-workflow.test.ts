import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("publishes successful generated project transactions by exact SHA", async () => {
  const source = await readFile(
    ".github/workflows/publish-project-transaction.yml",
    "utf8",
  );
  const workflow = parse(source) as any;

  expect(workflow.on.workflow_run).toEqual({
    workflows: ["Site: Validate changes"],
    types: ["completed"],
  });
  expect(workflow.permissions).toMatchObject({
    contents: "write",
    issues: "write",
    "pull-requests": "write",
    actions: "write",
  });
  expect(workflow.concurrency).toEqual({
    group: "project-publication",
    "cancel-in-progress": false,
  });
  expect(source).toContain("PROJECT_AUTO_PUBLICATION_ENABLED");
  expect(source).toContain("parseProjectPublicationTransaction");
  expect(source).toContain("planProjectPublication");
  expect(source).toContain("github.event.workflow_run.head_sha");
  expect(source).toContain("sha: process.env.EXPECTED_HEAD_SHA");
  expect(source).toContain("/pulls/${PULL_NUMBER}/merge");
  expect(source).not.toContain("gh pr merge");
  expect(source).toContain("project-submission-lifecycle.yml");
  expect(source).toContain("project-owner-request-lifecycle.yml");
  expect(source).toContain("deploy-pages.yml");
  expect(source).toContain('-f source_sha="$MERGE_SHA"');
  expect(source).toContain("force_regeneration=false");
  expect(source).toContain("planCopyAdjustmentNotice");
  expect(source).toContain("planOwnerDelistNotice");
  expect(source).toContain("continue-on-error: true");
  expect(source).toContain("owner-delist-notice");
  expect(source).toContain("idempotent retry");
});

test.each(["project-submission-lifecycle", "project-owner-request-lifecycle"])(
  "supports explicit %s dispatch after bot merges",
  async (name) => {
    const workflow = parse(
      await readFile(`.github/workflows/${name}.yml`, "utf8"),
    ) as any;
    expect(workflow.on.workflow_dispatch.inputs.pull_number).toMatchObject({
      required: true,
      type: "number",
    });
  },
);
