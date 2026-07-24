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
    "triage-kit-submission",
    "apply-kit-submission",
    "apply-kit-withdrawal",
  ]) {
    for (const step of allSteps(await workflow(name))) {
      if (!step.uses?.startsWith("actions/")) continue;
      const [action, sha] = step.uses.split("@");
      expect(sha).toBe(pinnedActions[action as keyof typeof pinnedActions]);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    }
  }
});

test("publishes Kits only by manual dispatch and serializes registry writes", async () => {
  const publication = await workflow("apply-kit-submission");
  const withdrawal = await workflow("apply-kit-withdrawal");
  const publicationSource = await readFile(
    resolve(workflowDirectory, "apply-kit-submission.yml"),
    "utf8",
  );
  const withdrawalSource = await readFile(
    resolve(workflowDirectory, "apply-kit-withdrawal.yml"),
    "utf8",
  );
  expect(publication.on.workflow_dispatch.inputs.issue_number.required).toBe(
    true,
  );
  expect(publication.on.issues).toBeUndefined();
  expect(withdrawal.on.issues.types).toEqual(["opened", "edited"]);
  for (const document of [publication, withdrawal]) {
    expect(document.permissions).toEqual({
      contents: "write",
      issues: "write",
      actions: "write",
    });
    expect(document.concurrency).toEqual({
      group: "kit-registry",
      "cancel-in-progress": false,
    });
  }
  expect(publicationSource.indexOf("catalog:validate")).toBeLessThan(
    publicationSource.indexOf("git add"),
  );
  expect(withdrawalSource.indexOf("catalog:validate")).toBeLessThan(
    withdrawalSource.indexOf("git add"),
  );
  expect(publicationSource).toContain("kit-published");
  expect(publicationSource).toContain("workflow run deploy-pages.yml");
  expect(withdrawalSource).toContain("github.event.issue.user.id");
  expect(withdrawalSource).not.toMatch(
    /github\.event\.issue\.user\.login\s*==/,
  );
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
  expect(commands).toContain("npm run build:test-kits");
  expect(commands).toContain("npm run test:kits-e2e");
  expect(commands).toContain("npm run test:kits-visual");
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
    issues: "read",
  });
  expect(refresh.concurrency).toEqual({
    group: "catalog-refresh",
    "cancel-in-progress": false,
  });
  expect(source).toContain("data/snapshots/github/*.json");
  expect(source).toContain("data/snapshots/github/kits/*.json");
  expect(source).toContain("refresh-reactions.mjs");
  expect(source).not.toMatch(/git add (?:data\/registry|data\/catalog)/);
  expect(source).not.toContain("git add src/generated/catalog.json");
  expect(source).toContain("workflow run deploy-pages.yml");
});

test("triage can label issues but cannot write repository content", async () => {
  const triage = await workflow("triage-submission");
  expect(triage.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
  const kitTriage = await workflow("triage-kit-submission");
  expect(kitTriage.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
  const source = await readFile(
    resolve(workflowDirectory, "triage-kit-submission.yml"),
    "utf8",
  );
  expect(source).toContain("opened");
  expect(source).toContain("edited");
  expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
});
