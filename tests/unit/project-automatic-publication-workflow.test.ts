import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("publishes successful generated project transactions by exact SHA", async () => {
  const source = await readFile(
    ".github/workflows/publish-project-transaction.yml",
    "utf8",
  );
  const workflow = parse(source) as any;

  expect(workflow.on.workflow_dispatch.inputs.validation_run_id).toMatchObject({
    required: true,
    type: "number",
  });
  expect(workflow.on).not.toHaveProperty("workflow_run");
  expect(workflow.permissions).toEqual({
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
  expect(source).toContain("steps.validation.outputs.head_sha");
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

test("explicitly hands successful generated CI to the publisher", async () => {
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8")) as any;
  const dispatch = ci.jobs["dispatch-project-publication"];

  expect(dispatch.needs).toEqual(["verify", "visual"]);
  expect(dispatch.permissions).toEqual({
    actions: "write",
    contents: "read",
  });
  expect(dispatch.if).toContain("always()");
  expect(dispatch.if).toContain("github.event_name == 'workflow_dispatch'");
  expect(dispatch.if).toContain(
    "startsWith(github.ref_name, 'automation/project-submission-')",
  );
  expect(dispatch.if).toContain(
    "startsWith(github.ref_name, 'automation/project-owner-request-')",
  );
  expect(dispatch.if).toContain("needs.verify.result == 'success'");
  expect(dispatch.if).toContain("needs.visual.result == 'success'");
  expect(dispatch.if).toContain("needs.visual.result == 'skipped'");
  expect(dispatch.steps[0].run).toContain(
    "gh workflow run publish-project-transaction.yml",
  );
  expect(dispatch.steps[0].run).toContain('--repo "$GITHUB_REPOSITORY"');
  expect(dispatch.steps[0].run).toContain(
    '-f validation_run_id="$GITHUB_RUN_ID"',
  );

  const publisherSource = await readFile(
    ".github/workflows/publish-project-transaction.yml",
    "utf8",
  );
  const publisher = parse(publisherSource) as any;
  expect(publisher.on.workflow_dispatch.inputs.validation_run_id).toMatchObject(
    {
      required: true,
      type: "number",
    },
  );
  expect(publisherSource).toContain("actions/runs/${VALIDATION_RUN_ID}");
  expect(publisherSource).toContain('validation.event !== "workflow_dispatch"');
  expect(publisherSource).toContain(
    'validation.path !== ".github/workflows/ci.yml"',
  );
  expect(publisherSource).toContain('validation.status !== "completed"');
  expect(publisherSource).toContain('validation.conclusion !== "success"');
  expect(publisherSource).toContain(
    'validation.head_branch?.startsWith("automation/project-submission-")',
  );
  expect(publisherSource).toContain(
    'validation.head_branch?.startsWith("automation/project-owner-request-")',
  );
  expect(publisherSource).toContain(
    '/^[0-9a-f]{40}$/u.test(validation.head_sha ?? "")',
  );
  expect(publisherSource).toContain(
    "issue.user?.type === transaction.actor.type",
  );
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
