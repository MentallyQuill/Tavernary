import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";
import { parse } from "yaml";

test("reconciles generated validation runs from trusted main code", async () => {
  const source = await readFile(
    ".github/workflows/reconcile-project-validations.yml",
    "utf8",
  );
  const workflow = parse(source) as any;
  const reconcile = workflow.jobs.reconcile;
  const steps = reconcile.steps as Array<{
    env?: Record<string, string>;
    uses?: string;
    run?: string;
    with?: Record<string, string | number>;
  }>;
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  const setupNode = steps.find((step) =>
    step.uses?.startsWith("actions/setup-node@"),
  );

  expect(workflow.name).toBe("Submissions: Reconcile project validations");
  expect(workflow.on).toEqual({
    workflow_run: {
      workflows: ["Site: Validate changes"],
      types: ["completed"],
    },
    schedule: [{ cron: "7,22,37,52 * * * *" }],
    workflow_dispatch: null,
  });
  expect(workflow.permissions).toEqual({
    actions: "write",
    issues: "write",
    "pull-requests": "read",
    statuses: "write",
    contents: "read",
  });
  expect(workflow.concurrency).toEqual({
    group: "project-validation-reconciliation",
    "cancel-in-progress": false,
  });
  expect(reconcile.if).toContain("github.event_name == 'schedule'");
  expect(reconcile.if).toContain("github.event_name == 'workflow_run'");
  expect(reconcile.if).toContain(
    "github.event.workflow_run.head_repository.full_name == github.repository",
  );
  expect(reconcile.if).toContain(
    "startsWith(github.event.workflow_run.head_branch, 'automation/project-submission-')",
  );
  expect(reconcile.if).toContain(
    "startsWith(github.event.workflow_run.head_branch, 'automation/project-owner-request-')",
  );
  expect(reconcile.if).toContain("github.event_name == 'workflow_dispatch'");
  expect(reconcile.if).toContain("github.actor_id == 2625904");
  expect(reconcile.if).toContain(
    "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
  );
  expect(reconcile.if).not.toContain("243524590");
  expect(checkout?.with?.ref).toBe("main");
  expect(setupNode?.with?.["node-version"]).toBe(24);
  expect(steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        env: { GITHUB_TOKEN: "${{ github.token }}" },
        run: "npm run submissions:reconcile-validations",
      }),
    ]),
  );
  expect(source).not.toMatch(/\bnpm (?:ci|install)\b/u);
  expect(source).not.toContain("secrets.");
});

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

test("rejects generated pull requests outside Publisher custody before planning", async () => {
  const workflow = parse(
    await readFile(".github/workflows/publish-project-transaction.yml", "utf8"),
  ) as any;
  const steps = workflow.jobs.publish.steps as Array<{
    env?: Record<string, string>;
    id?: string;
    name?: string;
    run?: string;
  }>;
  const state = steps.find((step) => step.id === "state");
  const plan = steps.find((step) => step.id === "plan");
  const regenerationToken = steps.find(
    (step) => step.id === "publisher-regeneration-token",
  );
  const mergeToken = steps.find((step) => step.id === "publisher-merge-token");

  expect(state?.env).toMatchObject({
    PUBLISHER_BOT_ID: "${{ vars.TAVERNARY_PUBLISHER_BOT_ID }}",
  });
  expect(state?.run).toContain(
    'const configuredPublisherBotId = process.env.PUBLISHER_BOT_ID ?? "";',
  );
  expect(state?.run).toContain(
    "if (!/^[1-9]\\d*$/u.test(configuredPublisherBotId))",
  );
  expect(state?.run).toContain("!Number.isSafeInteger(publisherBotId)");
  expect(state?.run).toContain("pulls[0].user?.id !== publisherBotId");
  expect(state?.run).toContain('pulls[0].user?.type !== "Bot"');
  expect(steps.indexOf(state as (typeof steps)[number])).toBeLessThan(
    steps.indexOf(plan as (typeof steps)[number]),
  );
  expect(steps.indexOf(state as (typeof steps)[number])).toBeLessThan(
    steps.indexOf(regenerationToken as (typeof steps)[number]),
  );
  expect(steps.indexOf(state as (typeof steps)[number])).toBeLessThan(
    steps.indexOf(mergeToken as (typeof steps)[number]),
  );
});

test("regenerates stale transactions with Publisher identity", async () => {
  const workflow = parse(
    await readFile(".github/workflows/publish-project-transaction.yml", "utf8"),
  ) as any;
  const steps = workflow.jobs.publish.steps as Array<{
    env?: Record<string, string>;
    id?: string;
    if?: string;
    name?: string;
    uses?: string;
    with?: Record<string, string>;
  }>;
  const token = steps.find(
    (step) => step.id === "publisher-regeneration-token",
  );
  const regenerate = steps.find(
    (step) => step.name === "Regenerate stale transaction",
  );

  expect(token).toMatchObject({
    if: "steps.plan.outputs.action == 'regenerate'",
    uses: "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1",
    with: {
      "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
      "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
      "permission-actions": "write",
    },
  });
  expect(regenerate).toMatchObject({
    if: "steps.plan.outputs.action == 'regenerate'",
    env: {
      GH_TOKEN: "${{ steps.publisher-regeneration-token.outputs.token }}",
      PRODUCER: "${{ steps.state.outputs.producer }}",
      ISSUE_NUMBER: "${{ steps.state.outputs.issue_number }}",
    },
  });
  expect(steps.indexOf(token as (typeof steps)[number])).toBeLessThan(
    steps.indexOf(regenerate as (typeof steps)[number]),
  );

  for (const generator of [
    "generate-project-submission",
    "generate-project-owner-request",
  ]) {
    const generated = parse(
      await readFile(`.github/workflows/${generator}.yml`, "utf8"),
    ) as any;
    expect(generated.jobs.generate.if).toContain("github.actor_id == 2625904");
    expect(generated.jobs.generate.if).toContain(
      "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
    );
  }
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
