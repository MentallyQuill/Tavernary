import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const workflowDirectory = resolve(".github/workflows");
const pinnedActions = {
  "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020",
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
    "enrich-catalog",
    "backfill-repository-identities",
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

test("runs Windows-specific visual baselines on a Windows runner", async () => {
  const ci = await workflow("ci");
  const jobs = ci.jobs as Record<
    string,
    {
      "runs-on"?: string;
      steps?: Array<{ run?: string }>;
    }
  >;
  const verifyCommands = (jobs.verify.steps ?? [])
    .map((step) => step.run)
    .filter(Boolean);
  const visualCommands = (jobs.visual?.steps ?? [])
    .map((step) => step.run)
    .filter(Boolean);

  expect(jobs.verify["runs-on"]).toBe("ubuntu-latest");
  expect(verifyCommands).not.toContain("npm run test:visual");
  expect(jobs.visual?.["runs-on"]).toBe("windows-latest");
  expect(visualCommands).toContain("npm run test:visual");
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
  expect(deploy.on.push["paths-ignore"]).toContain("data/reports/**");
  expect(deploy.on.workflow_dispatch.inputs.source_sha).toMatchObject({
    required: false,
    type: "string",
  });
  expect(deploy["run-name"]).toContain("inputs.source_sha");
  const deploySource = await readFile(
    resolve(workflowDirectory, "deploy-pages.yml"),
    "utf8",
  );
  expect(deploySource).toContain("^[0-9a-f]{40}$");
  expect(deploySource).toContain(
    'git merge-base --is-ancestor "$SOURCE_SHA" origin/main',
  );
  expect(deploySource).toContain('git checkout --detach "$SOURCE_SHA"');
  expect(deploySource).not.toContain(
    "ref: ${{ inputs.source_sha || github.sha }}",
  );
});

test("refreshes snapshots daily without granting production-record writes", async () => {
  const refresh = (await workflow("refresh-catalog")) as {
    "run-name": string;
    permissions: Record<string, string>;
    concurrency: Record<string, unknown>;
    on: {
      workflow_dispatch: {
        inputs: Record<string, { options?: string[]; default?: unknown }>;
      };
    };
    jobs: Record<
      string,
      {
        steps: Array<{
          id?: string;
          name?: string;
          if?: string;
          run?: string;
        }>;
      }
    >;
  };
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
  expect(refresh["run-name"]).toContain("Baseline queue");
  const refreshSteps = refresh.jobs.refresh.steps;
  expect(refreshSteps.map(({ name }) => name)).toEqual(
    expect.arrayContaining([
      "Advance baseline queue or refresh selected sources",
    ]),
  );
  const advance = refreshSteps.find(
    ({ name }) => name === "Advance baseline queue or refresh selected sources",
  )?.run;
  expect(advance).toContain("refresh_batch");
  expect(advance).not.toContain("baseline-queue.mjs evaluate");
  expect(advance).not.toContain("while (( remaining > 0 )); do");
  expect(source).not.toContain("workflow run refresh-catalog.yml");
  expect(source).toContain("data/snapshots/github/*.json");
  expect(source).toContain("data/snapshots/github-refresh.json");
  expect(source).toContain("data/snapshots/github/kits/*.json");
  expect(source).toContain("refresh-reactions.mjs");
  expect(source).not.toMatch(/git add (?:data\/registry|data\/catalog)/);
  expect(source).not.toContain("git add src/generated/catalog.json");
  expect(source).toContain("workflow run deploy-pages.yml");
});

test("runs enrichment through one tested durable orchestrator", async () => {
  const enrich = (await workflow("enrich-catalog")) as {
    permissions: Record<string, string>;
    concurrency: Record<string, unknown>;
    on: {
      workflow_dispatch: {
        inputs: Record<string, unknown>;
      };
    };
  };
  const source = await readFile(
    resolve(workflowDirectory, "enrich-catalog.yml"),
    "utf8",
  );
  const inputs = enrich.on.workflow_dispatch.inputs;

  expect(inputs).not.toHaveProperty("mode");
  expect(inputs).not.toHaveProperty("project_ids");
  expect(inputs.enrichment_scope).toEqual({
    description: "Choose pending records or re-enrich every automatic record.",
    type: "choice",
    options: ["pending", "all-automatic"],
    default: "pending",
  });
  expect(enrich.permissions).toEqual({
    contents: "write",
    actions: "write",
  });
  expect(enrich.concurrency).toEqual({
    group: "catalog-refresh",
    "cancel-in-progress": false,
  });
  expect(source).toContain("npm run catalog:enrichment-rollout");
  expect(source).toContain(
    "ENRICHMENT_SELECTION_MODE: ${{ inputs.enrichment_scope || 'pending' }}",
  );
  expect(source).toContain("Manual exclusions:");
  expect(source).toContain("manual_exclusions");
  expect(source).toContain("data/reports/enrichment-canary.json");
  expect(source).toContain("| Project | Outcome | Reason | Detail |");
  expect(source).toContain(
    "['source-not-ready','final-failure','skipped'].includes(entry.outcome)",
  );
  expect(source).not.toContain("publish_changes()");
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

test("groups coupled dependency updates into coherent pull requests", async () => {
  const dependabot = parse(
    await readFile(resolve(".github/dependabot.yml"), "utf8"),
  ) as {
    updates: Array<{
      "package-ecosystem": string;
      groups?: Record<string, { patterns: string[] }>;
    }>;
  };
  const npm = dependabot.updates.find(
    (update) => update["package-ecosystem"] === "npm",
  );
  const actions = dependabot.updates.find(
    (update) => update["package-ecosystem"] === "github-actions",
  );

  expect(npm?.groups?.react.patterns).toEqual(["react", "react-dom"]);
  expect(actions?.groups?.actions.patterns).toEqual(["*"]);
});
