import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("the existing scheduled submission workflow performs guarded completion and direct recovery independently", async () => {
  const workflow = parse(
    await readFile(
      ".github/workflows/reconcile-project-validations.yml",
      "utf8",
    ),
  );
  expect(workflow.on.schedule).toEqual([{ cron: "7,22,37,52 * * * *" }]);
  expect(workflow.concurrency).toEqual({
    group: "submission-reconciliation",
    "cancel-in-progress": false,
  });
  for (const name of [
    "submission_issue_number",
    "submission_operation_key",
    "site_run_id",
  ])
    expect(workflow.on.workflow_dispatch.inputs[name].required).toBe(false);
  const source = JSON.stringify(workflow.jobs.reconcile);
  expect(source).toContain("reconcile-submission-finalization.mjs");
  expect(source).toContain("reconcile-project-validations.mjs");
  expect(source).not.toContain("controller-wake.mjs");
  const courier = await readFile(
    ".github/workflows/automation-prepared.yml",
    "utf8",
  );
  expect(courier).toContain(
    "gh workflow run reconcile-project-validations.yml",
  );
  expect(courier).toContain('site_run_id="$SITE_RUN_ID"');
});

test.each(["apply-kit-submission", "apply-kit-withdrawal"])(
  "%s publishes directly while its legacy immutable producer emits only data",
  async (name) => {
    const source = await readFile(`.github/workflows/${name}.yml`, "utf8");
    const workflow = parse(source);
    expect(workflow.on.workflow_dispatch.inputs.operation_key.default).toBe("");
    const existing =
      workflow.jobs[name === "apply-kit-submission" ? "publish" : "withdraw"];
    expect(existing.if).toContain("inputs.operation_key == ''");
    expect(existing.if).toContain("github.actor_id == 2625904");
    expect(JSON.stringify(existing)).not.toMatch(
      /git push|git rebase|gh issue close/,
    );
    expect(
      existing.steps.some((step: { run?: string }) =>
        step.run?.includes("preparation-request.mjs"),
      ),
    ).toBe(true);
    const token = existing.steps.find(
      (step: { id?: string }) => step.id === "publisher-token",
    );
    expect(token.with["permission-actions"]).toBe("write");
    expect(token.with["permission-contents"]).toBe("write");
    expect(token.if).toBeUndefined();
    expect(JSON.stringify(existing)).toContain("runDirectKitPublication");
    expect(JSON.stringify(existing)).toContain("deploy-pages.yml");
    expect(workflow.concurrency).toEqual({
      group: "kit-registry",
      "cancel-in-progress": false,
    });
    const job = workflow.jobs.prepare;
    expect(job.if).toContain(
      "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
    );
    expect(job["timeout-minutes"]).toBe(45);
    expect(Object.values(job.permissions)).not.toContain("write");
    expect(job.steps[0].with.ref).toBe("${{ github.sha }}");
    expect(job.steps[0].with["persist-credentials"]).toBe(false);
    expect(
      job.steps.some((step: { run?: string }) =>
        step.run?.includes("catalog-preparation-cli.mjs"),
      ),
    ).toBe(true);
    const artifact = job.steps.find((step: { with?: { name?: string } }) =>
      step.with?.name?.startsWith("automation-prepared-"),
    );
    expect(artifact.with["retention-days"]).toBe(90);
    expect(artifact.with.path).toBe(
      "${{ runner.temp }}/automation-prepared/result.json",
    );
    expect(JSON.stringify(job)).not.toMatch(
      /permission-contents.*write|git push|git rebase|gh issue close|gh workflow run deploy-pages/,
    );
  },
);
