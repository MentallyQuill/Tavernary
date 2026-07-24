import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const workflowDirectory = resolve(".github/workflows");
const pinnedActions = {
  "actions/checkout": "d23441a48e516b6c34aea4fa41551a30e30af803",
  "actions/setup-node": "249970729cb0ef3589644e2896645e5dc5ba9c38",
  "actions/configure-pages": "45bfe0192ca1faeb007ade9deae92b16b8254a0d",
  "actions/upload-pages-artifact": "fc324d3547104276b827a68afc52ff2a11cc49c9",
  "actions/deploy-pages": "cd2ce8fcbc39b97be8ca5fce6e763baed58fa128",
};

async function workflow(name: string) {
  return parse(
    await readFile(resolve(workflowDirectory, `${name}.yml`), "utf8"),
  );
}

function allSteps(document: Record<string, unknown>) {
  const jobs = document.jobs as Record<
    string,
    { steps?: Array<{ uses?: string; run?: string }> }
  >;
  return Object.values(jobs).flatMap((job) => job.steps ?? []);
}

test("pins every first-party action to its resolved commit", async () => {
  for (const name of [
    "ci",
    "deploy-pages",
    "refresh-catalog",
    "triage-submission",
  ]) {
    for (const step of allSteps(await workflow(name))) {
      if (!step.uses?.startsWith("actions/")) continue;
      const [action, sha] = step.uses.split("@");
      expect(sha).toBe(pinnedActions[action as keyof typeof pinnedActions]);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    }
  }
});

test("keeps CI read-only and runs every local gate", async () => {
  const ci = await workflow("ci");
  const commands = allSteps(ci)
    .map((step) => step.run)
    .filter(Boolean)
    .join("\n");

  expect(ci.permissions).toEqual({ contents: "read" });
  expect(ci.concurrency.group).toBe("ci-${{ github.ref }}");
  expect(ci.concurrency["cancel-in-progress"]).toBe(true);
  expect(commands).toContain("npm ci");
  expect(commands).toContain("npm run check");
  expect(commands).toContain("playwright install --with-deps chromium");
  expect(commands).toContain("npm run test:e2e");
  expect(commands).toContain("npm run test:visual");
});

test("deploys only a verified static export to the Pages environment", async () => {
  const deploy = await workflow("deploy-pages");
  const build = deploy.jobs.build as {
    env?: Record<string, string>;
  };
  const steps = allSteps(deploy);
  const commands = steps
    .map((step) => step.run)
    .filter(Boolean)
    .join("\n");

  expect(deploy.permissions).toEqual({
    contents: "read",
    pages: "write",
    "id-token": "write",
  });
  expect(deploy.concurrency).toEqual({
    group: "pages",
    "cancel-in-progress": false,
  });
  expect(build.env?.TAVERNARY_BASE_PATH).toBe("");
  expect(commands).toContain("npm run check");
  expect(commands).toContain("npm run verify:export");
  expect(JSON.stringify(deploy.jobs)).toContain("github-pages");
});

test("refreshes snapshots daily without granting production-record writes", async () => {
  const refresh = await workflow("refresh-catalog");
  const source = await readFile(
    resolve(workflowDirectory, "refresh-catalog.yml"),
    "utf8",
  );

  expect(refresh.permissions).toEqual({
    contents: "write",
    actions: "write",
  });
  expect(refresh.concurrency).toEqual({
    group: "catalog-refresh",
    "cancel-in-progress": false,
  });
  const inputs = (
    refresh.on as {
      workflow_dispatch: {
        inputs: Record<string, { options?: string[]; default?: unknown }>;
      };
    }
  ).workflow_dispatch.inputs;
  expect(inputs.mode.options).toEqual([
    "incremental",
    "baseline",
    "project",
    "forensic",
  ]);
  expect(inputs.batch_size.default).toBe(12);
  expect(inputs).not.toHaveProperty("start_index");
  expect(source).toContain("data/snapshots/github/*.json");
  expect(source).toContain("data/snapshots/github-refresh.json");
  expect(source).not.toMatch(/git add (?:data\/registry|data\/catalog)/);
  expect(source).toContain("workflow run deploy-pages.yml");
});

test("triage can label issues but cannot write repository content", async () => {
  const triage = await workflow("triage-submission");
  expect(triage.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
});
