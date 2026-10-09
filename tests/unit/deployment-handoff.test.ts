import { expect, test } from "vitest";
import { runPreparedWakeCli } from "../../scripts/automation/prepared-wake.mjs";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_run",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-prepared.yml@refs/heads/main",
  TAVERNARY_PUBLISHER_BOT_ID: "4624827",
};
test.each(["success", "failure"])(
  "an authenticated completed Pages %s wakes confirmation independently of publication",
  async (conclusion) => {
    const fixture = deploymentArtifactFixture();
    fixture.run.conclusion = conclusion;
    const dispatches: string[][] = [];
    expect(
      await runPreparedWakeCli({
        env,
        runId: 42,
        gh: async (args) => {
          if (args[0] === "api") return JSON.stringify(fixture.run);
          dispatches.push(args);
          return "";
        },
        write: () => {},
      }),
    ).toBe(0);
    expect(dispatches).toMatchObject([
      [
        "workflow",
        "run",
        "automation-writer.yml",
        "--repo",
        env.GITHUB_REPOSITORY,
        "--ref",
        "main",
        "-f",
        "mode=confirm",
        "-f",
        "result_run_id=42",
      ],
    ]);
  },
);
test("deployment verification stays read-only and privileged confirmation starts only after browser setup", () => {
  const pages = parse(
    readFileSync(".github/workflows/deploy-pages.yml", "utf8"),
  );
  const verification = pages.jobs["confirm-public"];
  expect(verification.needs).toEqual(["build", "deploy"]);
  expect(verification.if).toBe("needs.deploy.outputs.action == 'deploy'");
  expect(verification.permissions).toEqual({
    contents: "read",
    actions: "read",
  });
  expect(
    verification.steps.some((step: { run?: string }) =>
      step.run?.includes("confirm-deployment.mjs"),
    ),
  ).toBe(true);
  expect(
    verification.steps.some(
      (step: { with?: Record<string, unknown> }) =>
        step.with?.["permission-contents"] === "write",
    ),
  ).toBe(false);
  const writer = parse(
    readFileSync(".github/workflows/automation-writer.yml", "utf8"),
  );
  const browsers = writer.jobs.write.steps.findIndex((step: { run?: string }) =>
    step.run?.includes("playwright install"),
  );
  const token = writer.jobs.write.steps.findIndex(
    (step: { with?: Record<string, unknown> }) =>
      step.with?.["permission-contents"] === "write",
  );
  expect(browsers).toBeGreaterThan(-1);
  expect(token).toBeGreaterThan(browsers);
  const handoff = parse(
    readFileSync(".github/workflows/automation-prepared.yml", "utf8"),
  );
  expect(handoff.on.workflow_run.workflows).toContain(
    "Site: Deploy to GitHub Pages",
  );
});
test.each(["actor", "fork", "pending", "workflow"])(
  "untrusted %s Pages completion cannot dispatch the writer",
  async (variant) => {
    const fixture = deploymentArtifactFixture();
    if (variant === "actor") fixture.run.actor.id++;
    if (variant === "fork") fixture.run.head_repository.id++;
    if (variant === "pending") fixture.run.status = "in_progress";
    if (variant === "workflow")
      fixture.run.path = ".github/workflows/foreign.yml";
    const dispatches: string[][] = [];
    await runPreparedWakeCli({
      env,
      runId: 42,
      gh: async (args) => {
        if (args[0] === "api") return JSON.stringify(fixture.run);
        dispatches.push(args);
        return "";
      },
      write: () => {},
    });
    expect(dispatches).toEqual([]);
  },
);
