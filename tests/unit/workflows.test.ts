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
  "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
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

test("uses category-prefixed workflow display names", async () => {
  const expectedNames = {
    "admit-issue": "Submission intake: Check issue eligibility",
    "triage-submission": "Project submissions: Validate submission",
    "generate-project-submission": "Project submissions: Create review PR",
    "project-submission-lifecycle":
      "Project submissions: Process review result",
    "retry-frontend-dependencies":
      "Project submissions: Retry frontend dependencies",
    "triage-kit-submission": "Kit submissions: Validate submission",
    "apply-kit-submission": "Kit submissions: Publish approved Kit",
    "apply-kit-withdrawal": "Kit submissions: Withdraw published Kit",
    "refresh-catalog": "Catalog maintenance: Refresh source data",
    "enrich-catalog": "Catalog maintenance: Enrich project metadata",
    "backfill-repository-identities":
      "Catalog maintenance: Backfill repository IDs",
    ci: "Site: Validate changes",
    "deploy-pages": "Site: Deploy to GitHub Pages",
  } as const;

  for (const [file, expectedName] of Object.entries(expectedNames)) {
    expect((await workflow(file)).name).toBe(expectedName);
  }
});

test("identifies the object and action in every workflow run name", async () => {
  const expectedRunNameParts = {
    "admit-issue": ["Issue #", "Check submission eligibility"],
    "triage-submission": ["Project #", "Validate submission"],
    "generate-project-submission": ["Project #", "Create review PR"],
    "project-submission-lifecycle": ["Project review PR #", "Process result"],
    "retry-frontend-dependencies": [
      "Project submissions:",
      "Retry merged frontend dependencies",
    ],
    "triage-kit-submission": ["Kit #", "Validate submission"],
    "apply-kit-submission": ["Kit #", "Publish approved Kit"],
    "apply-kit-withdrawal": ["Kit #", "Withdraw published Kit"],
    "refresh-catalog": ["Catalog:", "Refresh"],
    "enrich-catalog": ["Catalog:", "Enrich", "project metadata"],
    "backfill-repository-identities": ["Catalog:", "Backfill repository IDs"],
    ci: ["Site:", "Validate"],
    "deploy-pages": ["Site:", "Deploy"],
  } as const;

  for (const [file, expectedParts] of Object.entries(expectedRunNameParts)) {
    const runName = String((await workflow(file))["run-name"] ?? "");
    for (const expectedPart of expectedParts) {
      expect(runName).toContain(expectedPart);
    }
  }
});

test("pins every first-party action to its resolved commit", async () => {
  for (const name of [
    "ci",
    "deploy-pages",
    "refresh-catalog",
    "enrich-catalog",
    "backfill-repository-identities",
    "admit-issue",
    "triage-submission",
    "generate-project-submission",
    "project-submission-lifecycle",
    "retry-frontend-dependencies",
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
  expect(withdrawal.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(withdrawal.on.issues).toBeUndefined();
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
  expect(withdrawalSource).toContain(
    "ISSUE_NUMBER: ${{ inputs.issue_number }}",
  );
  expect(withdrawalSource).toContain(
    "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
  );
  expect(withdrawalSource).not.toMatch(
    /github\.event\.issue\.user\.login\s*==/,
  );
});

test("initializes Kit support before publishing the new registry record", async () => {
  const publication = await workflow("apply-kit-submission");
  const steps = publication.jobs.publish.steps as Array<{
    name?: string;
    run?: string;
    env?: Record<string, string>;
  }>;
  const applyIndex = steps.findIndex(
    ({ name }) => name === "Re-fetch, revalidate, and apply approved issue",
  );
  const supportIndex = steps.findIndex(
    ({ name }) => name === "Initialize Kit community support",
  );
  const validationIndex = steps.findIndex(
    ({ name }) => name === "Validate publication",
  );
  const support = steps[supportIndex];
  const commit = steps.find(({ name }) => name === "Commit canonical Kit");

  expect(applyIndex).toBeGreaterThanOrEqual(0);
  expect(supportIndex).toBeGreaterThan(applyIndex);
  expect(validationIndex).toBeGreaterThan(supportIndex);
  expect(support.run).toBe("node scripts/kits/refresh-reactions.mjs");
  expect(support.env).toMatchObject({
    GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
    REQUIRED_KIT_ISSUE_NUMBER: "${{ inputs.issue_number }}",
  });
  expect(commit?.run).toContain(
    "git add data/registry/kits data/snapshots/github/kits",
  );
});

test("rebases and revalidates Kit registry commits before pushing", async () => {
  for (const name of ["apply-kit-submission", "apply-kit-withdrawal"]) {
    const source = await readFile(
      resolve(workflowDirectory, `${name}.yml`),
      "utf8",
    );
    const commitBlock = source.slice(source.indexOf("git commit -m"));
    const rebase = commitBlock.indexOf("git rebase origin/main");
    const validate = commitBlock.indexOf("npm run catalog:validate");
    const push = commitBlock.indexOf("git push origin HEAD:main");

    expect(commitBlock).toContain("for attempt in 1 2 3");
    expect(rebase).toBeGreaterThanOrEqual(0);
    expect(rebase).toBeLessThan(validate);
    expect(validate).toBeLessThan(push);
  }
});

test("rebases no-op Kit retries before selecting their deployment commit", async () => {
  for (const name of ["apply-kit-submission", "apply-kit-withdrawal"]) {
    const source = await readFile(
      resolve(workflowDirectory, `${name}.yml`),
      "utf8",
    );
    const stage = source.indexOf("git add data/registry/kits");
    const commitGuardEnd = source.indexOf("\n          fi", stage);
    const retryLoop = source.indexOf("for attempt in 1 2 3", stage);
    const publishedSha = source.indexOf(
      'echo "sha=$(git rev-parse HEAD)"',
      stage,
    );

    expect(commitGuardEnd).toBeGreaterThan(stage);
    expect(retryLoop).toBeGreaterThan(commitGuardEnd);
    expect(publishedSha).toBeGreaterThan(retryLoop);
  }
});

test("dispatches Kit deployments for the exact published commit", async () => {
  for (const name of ["apply-kit-submission", "apply-kit-withdrawal"]) {
    const source = await readFile(
      resolve(workflowDirectory, `${name}.yml`),
      "utf8",
    );

    expect(source).toContain("id: commit");
    expect(source).toContain(
      'echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"',
    );
    expect(source).toContain(
      'gh workflow run deploy-pages.yml --ref main -f source_sha="${{ steps.commit.outputs.sha }}"',
    );
  }
});

test("runs Kit registry writers from full main-branch history", async () => {
  for (const [name, jobName] of [
    ["apply-kit-submission", "publish"],
    ["apply-kit-withdrawal", "withdraw"],
  ]) {
    const document = (await workflow(name)) as {
      jobs: Record<
        string,
        {
          if?: string;
          steps: Array<{
            uses?: string;
            with?: { "fetch-depth"?: number };
          }>;
        }
      >;
    };
    const job = document.jobs[jobName];
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );

    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
  }
});

test("synchronizes current main before mutating the Kit registry", async () => {
  for (const [name, mutation] of [
    ["apply-kit-submission", "node scripts/kits/apply-submission.mjs"],
    ["apply-kit-withdrawal", "node scripts/kits/apply-withdrawal.mjs"],
  ]) {
    const source = await readFile(
      resolve(workflowDirectory, `${name}.yml`),
      "utf8",
    );
    const fetch = source.indexOf("git fetch origin main");
    const checkout = source.indexOf("git checkout -B main origin/main");
    const mutate = source.indexOf(mutation);

    expect(fetch).toBeGreaterThanOrEqual(0);
    expect(fetch).toBeLessThan(checkout);
    expect(checkout).toBeLessThan(mutate);
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
  expect(commands).toContain("npm run build:test-kits");
  expect(commands).toContain("npm run test:kits-e2e");
  expect(commands).toContain("npm run test:kits-visual");
});

test("keeps one read-only CI workflow with a stable verify job", async () => {
  const ci = await workflow("ci");

  expect(ci.permissions).toEqual({ contents: "read" });
  expect(ci.jobs.verify).toBeDefined();
  expect(ci.jobs.verify.outputs.route).toContain("steps.route.outputs.route");
});

test("classifies pull request and dispatched branch diffs fail closed", async () => {
  const source = await readFile(resolve(workflowDirectory, "ci.yml"), "utf8");

  expect(source).toContain("github.event.pull_request.base.sha");
  expect(source).toContain("github.event.pull_request.head.sha");
  expect(source).toContain("git merge-base origin/main HEAD");
  expect(source).toContain("git diff --no-renames --name-only -z");
  expect(source).toContain("classify-pr-paths.mjs --paths-file");
  expect(source).toContain('route="full"');
});

test("runs mutually selected content and full Linux stacks", async () => {
  const ci = await workflow("ci");
  const steps = ci.jobs.verify.steps as Array<{
    if?: string;
    run?: string;
  }>;

  expect(steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        if: "steps.route.outputs.route == 'content'",
        run: "npm run check:content",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'full'",
        run: "npm run check",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'content'",
        run: "npm run test:content-e2e",
      }),
      expect.objectContaining({
        if: "steps.route.outputs.route == 'full'",
        run: "npm run test:e2e",
      }),
    ]),
  );
});

test("runs Windows visual and Kit checks only for full CI", async () => {
  const ci = await workflow("ci");

  expect(ci.jobs.visual.needs).toBe("verify");
  expect(ci.jobs.visual.if).toBe("needs.verify.outputs.route == 'full'");
});

test("does not install a path-filter action", async () => {
  const ci = await workflow("ci");

  expect(allSteps(ci).some((step) => step.uses?.includes("paths-filter"))).toBe(
    false,
  );
});

test("owns the focused content checks in package scripts", async () => {
  const packageDocument = JSON.parse(
    await readFile(resolve("package.json"), "utf8"),
  );

  expect(packageDocument.scripts["test:content"]).toContain(
    "tests/unit/validate-catalog.test.ts",
  );
  expect(packageDocument.scripts["test:content"]).toContain(
    "tests/unit/validate-kits.test.ts",
  );
  expect(packageDocument.scripts["test:content-e2e"]).toBe(
    "node scripts/run-playwright.mjs tests/e2e/static-export.spec.ts",
  );
  expect(packageDocument.scripts["check:content"]).toContain(
    "npm run catalog:validate",
  );
  expect(packageDocument.scripts["check:content"]).toContain("npm run build");
  expect(packageDocument.scripts["check:content"]).not.toContain("npm test");
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
  expect(refresh["run-name"]).toContain("Catalog: Refresh baseline queue");
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

  const supportRefresh = refreshSteps.find(
    ({ name }) => name === "Refresh Kit community support",
  );
  const validation = refreshSteps.find(
    ({ name }) => name === "Validate refreshed catalog",
  );
  const commit = refreshSteps.find(
    ({ name }) => name === "Commit snapshot changes",
  );
  const redeploy = refreshSteps.find(
    ({ name }) => name === "Redeploy refreshed catalog",
  );
  expect(supportRefresh?.run).toBe("node scripts/kits/refresh-reactions.mjs");
  expect(validation?.run).toBe("npm run check");
  expect(commit?.run).toContain("data/snapshots/github/kits/*.json");
  expect(redeploy?.run).toBe("gh workflow run deploy-pages.yml --ref main");
  expect(source).not.toMatch(
    /data\/snapshots\/github\/kits\/(?!\*\.json)[a-z0-9-]+\.json/,
  );
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
    issues: "write",
  });
  expect(enrich.concurrency).toEqual({
    group: "catalog-refresh",
    "cancel-in-progress": false,
  });
  expect(source).toContain("npm run catalog:enrichment-rollout");
  expect(source).toContain(
    "ENRICHMENT_SELECTION_MODE: ${{ inputs.enrichment_scope || 'pending' }}",
  );
  expect(inputs.model_timeout_seconds).toEqual({
    description: "Per-model-request timeout in seconds.",
    type: "number",
    default: 120,
  });
  expect(source).toContain(
    "MODEL_TIMEOUT_SECONDS: ${{ inputs.model_timeout_seconds || 120 }}",
  );
  expect(source).toContain("npm run catalog:report-enrichment-errors");
  expect(source).toContain("enrichment-rollout-result.json");
  expect(source).toContain("Manual exclusions:");
  expect(source).toContain("manual_exclusions");
  expect(source).toContain("data/reports/enrichment-canary.json");
  expect(source).toContain("| Project | Outcome | Reason | Detail |");
  expect(source).toContain(
    "['source-not-ready','final-failure','skipped'].includes(entry.outcome)",
  );
  expect(source).not.toContain("publish_changes()");
});

test("triage dispatches admitted projects without repository write access", async () => {
  const triage = await workflow("triage-submission");
  const source = await readFile(
    resolve(workflowDirectory, "triage-submission.yml"),
    "utf8",
  );

  expect(Object.keys(triage.on)).toEqual(["workflow_dispatch"]);
  expect(triage.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(triage.permissions).toEqual({
    contents: "read",
    issues: "write",
    actions: "write",
  });
  expect(triage.concurrency["cancel-in-progress"]).toBe(true);
  expect(triage.concurrency.group).toContain("${{ inputs.issue_number }}");
  expect(source).toContain("ISSUE_NUMBER: ${{ inputs.issue_number }}");
  expect(source).toContain("steps.triage.outputs.admitted == 'true'");
  expect(source).toContain("gh workflow run generate-project-submission.yml");
  expect(source).not.toContain("npm ci");
  expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
});

test("retries frontend dependencies from read-only catalog changes", async () => {
  const retry = await workflow("retry-frontend-dependencies");
  const source = await readFile(
    resolve(workflowDirectory, "retry-frontend-dependencies.yml"),
    "utf8",
  );

  expect(retry.name).toBe("Project submissions: Retry frontend dependencies");
  expect(retry["run-name"]).toContain("Retry merged frontend dependencies");
  expect(retry.on.push.branches).toEqual(["main"]);
  expect(retry.on.push.paths).toEqual(
    expect.arrayContaining([
      "data/registry/projects/**",
      "data/vocabularies/frontends.json",
    ]),
  );
  expect(retry.on.workflow_dispatch).toBeDefined();
  expect(retry.permissions).toEqual({
    contents: "read",
    issues: "read",
    actions: "write",
  });
  expect(retry.concurrency).toEqual({
    group: "retry-frontend-dependencies",
    "cancel-in-progress": false,
  });
  expect(source).toContain(
    "node scripts/submissions/retry-frontend-dependencies.mjs",
  );
  expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
});

test("keeps Kit triage registry-read-only and dependency-free", async () => {
  const document = await workflow("triage-kit-submission");
  const source = await readFile(
    resolve(workflowDirectory, "triage-kit-submission.yml"),
    "utf8",
  );

  expect(Object.keys(document.on)).toEqual(["workflow_dispatch"]);
  expect(document.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(document.permissions).toEqual({
    contents: "read",
    issues: "write",
    actions: "write",
  });
  expect(document.concurrency["cancel-in-progress"]).toBe(true);
  expect(source).toContain("ISSUE_NUMBER: ${{ inputs.issue_number }}");
  expect(source).not.toContain("npm ci");
  expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
});

test("generates submission PRs with scoped permissions and manual recovery", async () => {
  const generation = await workflow("generate-project-submission");
  const source = await readFile(
    resolve(workflowDirectory, "generate-project-submission.yml"),
    "utf8",
  );

  expect(generation.permissions).toEqual({
    contents: "write",
    issues: "write",
    "pull-requests": "write",
    actions: "write",
  });
  expect(generation.on.workflow_dispatch.inputs.issue_number.required).toBe(
    true,
  );
  expect(
    generation.on.workflow_dispatch.inputs.force_regeneration.default,
  ).toBe(false);
  expect(generation.concurrency.group).toContain(
    "project-submission-${{ inputs.issue_number }}",
  );
  expect(source).toContain("git push --force-with-lease=");
  expect(source).toContain("git rebase origin/main");
  expect(source).toContain('git config user.name "github-actions[bot]"');
  expect(source).toContain(
    'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
  );
  expect(
    source.indexOf('git config user.name "github-actions[bot]"'),
  ).toBeLessThan(source.indexOf("git rebase origin/main"));
  expect(source).toContain("previous-generated-paths.txt");
  expect(source).toContain("Refusing unsafe generated path");
  expect(source).toContain("Prepare generated path set");
  expect(source).toContain("Reject conflicting open submission paths");
  expect(source).toContain("findSubmissionPathCollision");
  expect(source).toContain("gh api --paginate --slurp");
  expect(source).toContain("generated-paths.txt");
  expect(
    source.indexOf("Reject conflicting open submission paths"),
  ).toBeLessThan(source.indexOf("git commit -m"));
  expect(
    source.indexOf("Reject conflicting open submission paths"),
  ).toBeLessThan(source.indexOf("git push origin"));
  expect(source).toContain("labels.includes('issue-admitted')");
  expect(source).toContain("Refresh and revalidate issue before PR mutation");
  expect(source).toContain("Refresh and revalidate issue before labeling");
  expect(
    source.match(/issue is no longer admitted/g)?.length,
  ).toBeGreaterThanOrEqual(3);
  expect(source).toContain("gh api --method DELETE");
  expect(source).toContain("(HTTP 404)");
  expect(source).not.toContain("gh api --method PUT");
  expect(source).not.toMatch(/git push (?:--force|-f)(?!-with-lease)/);
  expect(source).not.toMatch(
    /(?:npm|pnpm|yarn|bun|node)\s+(?:--prefix\s+)?(?:https?:\/\/|\.\/submitted)/,
  );
});

test("handles submission closure from default-branch code only", async () => {
  const lifecycle = await workflow("project-submission-lifecycle");
  const source = await readFile(
    resolve(workflowDirectory, "project-submission-lifecycle.yml"),
    "utf8",
  );
  const checkout = allSteps(lifecycle).find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  ) as { with?: { ref?: string } } | undefined;

  expect(lifecycle.on.pull_request.types).toEqual(["closed"]);
  expect(lifecycle.permissions).toEqual({
    contents: "write",
    issues: "write",
    "pull-requests": "read",
  });
  expect(checkout?.with?.ref).toBe(
    "${{ github.event.repository.default_branch }}",
  );
  expect(source).toContain("github.event.pull_request.head.sha");
  expect(source).toContain("submission-declined");
  expect(source).toContain("state_reason");
  expect(source).toContain("gh api --method PUT");
  expect(source).not.toMatch(
    /gh api --method POST\s+\\\s+"repos\/\$\{GITHUB_REPOSITORY\}\/issues\/\$\{ISSUE_NUMBER\}\/labels"/,
  );
  expect(source).not.toContain("github.event.pull_request.head.ref }}");
});

test("continues admitted submissions in the admission run", async () => {
  const admission = await workflow("admit-issue");
  const source = await readFile(
    resolve(workflowDirectory, "admit-issue.yml"),
    "utf8",
  );

  expect(admission.on.issues.types).toEqual(["opened", "reopened", "edited"]);
  expect(admission.permissions).toEqual({
    contents: "read",
    issues: "write",
    actions: "write",
  });
  expect(admission.concurrency).toEqual({
    group: "issue-admission-${{ github.event.issue.number }}",
    "cancel-in-progress": false,
  });
  expect(source).toContain("node scripts/submissions/admit-issue.mjs");
  expect(source).toContain("steps.admission.outputs.admitted == 'true'");
  expect(source).toContain("gh workflow run triage-submission.yml");
  expect(source).toContain("gh workflow run triage-kit-submission.yml");
  expect(source).toContain("gh workflow run apply-kit-withdrawal.yml");
  expect(source).toContain("steps.admission.outputs.route == 'project'");
  expect(source).toContain("steps.admission.outputs.route == 'kit'");
  expect(source).toContain("steps.admission.outputs.route == 'kit-withdrawal'");
  expect(source).toContain("steps.admission.outputs.route == 'conflict'");
  expect(source).not.toContain("startsWith(github.event.issue.title");
  expect(source).not.toContain("npm ci");
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
