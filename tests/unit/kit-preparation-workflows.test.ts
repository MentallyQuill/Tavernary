import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { parse } from "yaml";

test.each(["apply-kit-submission", "apply-kit-withdrawal"])(
  "%s preserves existing entrypoints while its immutable producer emits only data",
  async (name) => {
    const source = await readFile(`.github/workflows/${name}.yml`, "utf8");
    const workflow = parse(source);
    expect(workflow.on.workflow_dispatch.inputs.operation_key.default).toBe("");
    const existing =
      workflow.jobs[name === "apply-kit-submission" ? "publish" : "withdraw"];
    expect(existing.if).toContain("inputs.operation_key == ''");
    expect(existing.if).toContain("github.actor_id == 2625904");
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
