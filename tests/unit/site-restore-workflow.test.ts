import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("every Pages build retains a complete independently verified restore archive", () => {
  const workflow = parse(
    readFileSync(".github/workflows/deploy-pages.yml", "utf8"),
  );
  const steps = workflow.jobs.build.steps;
  const creation = steps.findIndex((step: { run?: string }) =>
    step.run?.includes("site-bundle.mjs create"),
  );
  const verification = steps.findIndex(
    (step: { run?: string }) => step.run === "npm run verify:export",
  );
  expect(creation).toBeGreaterThan(verification);
  expect(
    steps.find((step: { with?: { name?: string } }) =>
      step.with?.name?.startsWith("site-bundle-"),
    ).with,
  ).toMatchObject({
    "retention-days": 90,
    "compression-level": 0,
    "if-no-files-found": "error",
  });
});

test("owner restore is dry by default, serializes Pages and the final data guard, and cannot execute archived scripts", () => {
  const workflow = parse(
    readFileSync(".github/workflows/restore-site.yml", "utf8"),
  );
  expect(workflow.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
  expect(workflow.concurrency).toEqual({
    group: "pages",
    "cancel-in-progress": false,
  });
  expect(workflow.jobs.verify.if).toContain("github.actor_id == 2625904");
  expect(workflow.jobs.deploy.concurrency).toEqual({
    group: "canonical-publication",
    "cancel-in-progress": false,
  });
  expect(workflow.jobs.deploy.if).toContain("!inputs.dry_run");
  for (const job of Object.values(workflow.jobs) as Array<{
    steps: Array<{
      uses?: string;
      run?: string;
      with?: Record<string, unknown>;
    }>;
  }>) {
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout?.with).toMatchObject({
      ref: "main",
      "persist-credentials": false,
      "fetch-depth": 0,
    });
    expect(
      job.steps.some(
        (step) =>
          step.run?.includes("git checkout") ||
          step.run?.includes("npm run build"),
      ),
    ).toBe(false);
  }
  const steps = workflow.jobs.deploy.steps;
  const guard = steps.findIndex((step: { id?: string }) => step.id === "guard");
  const deployment = steps.findIndex((step: { uses?: string }) =>
    step.uses?.startsWith("actions/deploy-pages@"),
  );
  expect(guard).toBeGreaterThan(0);
  expect(deployment).toBeGreaterThan(guard);
  expect(steps[deployment].if).toContain(
    "steps.guard.outputs.action == 'deploy'",
  );
  expect(
    steps.some((step: { run?: string }) =>
      step.run?.includes("confirm-deployment.mjs"),
    ),
  ).toBe(true);
  expect(
    steps.some(
      (step: { with?: { path?: string } }) =>
        step.with?.path === ".tmp/restore-source.json",
    ),
  ).toBe(true);
});
