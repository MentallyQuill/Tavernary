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
  expect(source).toContain(
    "Schema version 2 is required; regenerate this request.",
  );
  expect(source).toContain("fingerprintSourceRecord");
  expect(source).toContain("projectFingerprints");
  expect(source).toContain("sourceFingerprint");
  expect(source).toContain('import tags from "./data/vocabularies/tags.json"');
  expect(source).toContain(
    'import { tagVocabularyHash } from "./scripts/catalog/tag-vocabulary.mjs"',
  );
  expect(source).toContain("tagVocabularyHash: tagVocabularyHash(tags)");
  expect(source).not.toContain(
    'import capabilities from "./data/vocabularies/capabilities.json"',
  );
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
  const steps = workflow.jobs.publish.steps as Array<{
    name?: string;
    if?: string;
    run?: string;
  }>;
  expect(steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Await maintainer merge",
        if: "steps.plan.outputs.action == 'await-maintainer'",
      }),
      expect.objectContaining({
        name: "Merge exact validated head",
        if: "steps.plan.outputs.action == 'merge'",
      }),
    ]),
  );
  expect(source).toContain("source,");
  expect(source).toContain("projects,");
});

test("merges validated project transactions with the Publisher App", async () => {
  const workflow = parse(
    await readFile(".github/workflows/publish-project-transaction.yml", "utf8"),
  ) as any;
  const steps = workflow.jobs.publish.steps as Array<{
    id?: string;
    if?: string;
    name?: string;
    uses?: string;
    env?: Record<string, string>;
    with?: Record<string, string>;
  }>;
  const token = steps.find((step) => step.id === "publisher-merge-token");
  const merge = steps.find(
    (step) => step.name === "Merge exact validated head",
  );

  expect(token).toMatchObject({
    if: "steps.plan.outputs.action == 'merge'",
    uses: "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
    with: {
      "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
      "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
      "permission-contents": "write",
    },
  });
  expect(steps.indexOf(token as (typeof steps)[number])).toBeLessThan(
    steps.indexOf(merge as (typeof steps)[number]),
  );
  expect(merge?.env?.GH_TOKEN).toBe(
    "${{ steps.publisher-merge-token.outputs.token }}",
  );
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
