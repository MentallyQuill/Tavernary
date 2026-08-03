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
  "actions/upload-artifact": "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "actions/create-github-app-token": "fee1f7d63c2ff003460e3d139729b119787bc349",
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
    "triage-project-owner-request":
      "Project owner requests: Validate authority",
    "generate-project-owner-request":
      "Project owner requests: Create review PR",
    "project-owner-request-lifecycle":
      "Project owner requests: Process review result",
    "retry-frontend-dependencies":
      "Project submissions: Retry frontend dependencies",
    "retry-project-submission-enrichment":
      "Project submissions: Retry Reddit enrichment",
    "triage-kit-submission": "Kit submissions: Validate submission",
    "triage-help-request": "Help requests: Triage report",
    "apply-kit-submission": "Kit submissions: Publish approved Kit",
    "apply-kit-withdrawal": "Kit submissions: Withdraw published Kit",
    "refresh-catalog": "Catalog maintenance: Refresh source data",
    "enrich-catalog": "Catalog maintenance: Enrich project metadata",
    "backfill-repository-identities":
      "Catalog maintenance: Backfill repository IDs",
    ci: "Site: Validate changes",
    "deploy-pages": "Site: Deploy to GitHub Pages",
    "targeted-tavernkeeper-scan": "Security: Run targeted TavernKeeper scan",
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
    "triage-project-owner-request": ["Owner request #", "Validate authority"],
    "generate-project-owner-request": ["Owner request #", "Create review PR"],
    "project-owner-request-lifecycle": ["Owner review PR #", "Process result"],
    "retry-frontend-dependencies": [
      "Project submissions:",
      "Retry merged frontend dependencies",
    ],
    "retry-project-submission-enrichment": [
      "Project submissions:",
      "Retry due Reddit enrichment",
    ],
    "triage-kit-submission": ["Kit #", "Validate submission"],
    "triage-help-request": ["Help request #", "Triage report"],
    "apply-kit-submission": ["Kit #", "Publish approved Kit"],
    "apply-kit-withdrawal": ["Kit #", "Withdraw published Kit"],
    "refresh-catalog": ["Catalog:", "Refresh"],
    "enrich-catalog": ["Catalog:", "Enrich", "project metadata"],
    "backfill-repository-identities": ["Catalog:", "Backfill repository IDs"],
    ci: ["Site:", "Validate"],
    "deploy-pages": ["Site:", "Deploy"],
    "targeted-tavernkeeper-scan": ["Security:", "Scan"],
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
    "import-tavernkeeper-reports",
    "refresh-catalog",
    "enrich-catalog",
    "backfill-repository-identities",
    "admit-issue",
    "triage-submission",
    "generate-project-submission",
    "project-submission-lifecycle",
    "triage-project-owner-request",
    "generate-project-owner-request",
    "project-owner-request-lifecycle",
    "retry-frontend-dependencies",
    "retry-project-submission-enrichment",
    "triage-kit-submission",
    "triage-help-request",
    "apply-kit-submission",
    "apply-kit-withdrawal",
    "targeted-tavernkeeper-scan",
  ]) {
    for (const step of allSteps(await workflow(name))) {
      if (!step.uses?.startsWith("actions/")) continue;
      const [action, sha] = step.uses.split("@");
      expect(sha).toBe(pinnedActions[action as keyof typeof pinnedActions]);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    }
  }
});

test("targeted TavernKeeper scans are actor-gated and accept only an exact repository URL", async () => {
  const targeted = await workflow("targeted-tavernkeeper-scan");
  const source = await readFile(
    resolve(workflowDirectory, "targeted-tavernkeeper-scan.yml"),
    "utf8",
  );

  expect(Object.keys(targeted.on)).toEqual(["workflow_dispatch"]);
  expect(Object.keys(targeted.on.workflow_dispatch.inputs)).toEqual([
    "repository_url",
  ]);
  expect(targeted.permissions).toEqual({
    contents: "read",
    actions: "write",
  });
  expect(targeted.jobs.request.if).toBe("${{ github.run_attempt == 1 }}");
  expect(source).toContain("github.actor_id");
  expect(source).toContain("tavernkeeper-scan-operators.json");
  expect(source).toContain("mode=project");
  expect(source).toContain("tavernkeeper-targets.json");
  expect(source).toContain("TAVERNKEEPER_WAKE_APP_ID");
  expect(source).toContain("targeted-scan.yml");
  expect(source).toMatch(/inputs.+repository_id/isu);
  expect(source).not.toMatch(
    /inputs\.(?:repository_id|source_id|target_sha|branch|mode|model|priority|token_budget|clone_url)/u,
  );
  expect(source).not.toMatch(
    /pull_request|issues:|issue_comment|repository_dispatch/u,
  );
  expect(source).not.toMatch(/X-GitHub-Stateless-S2S-Token|\bghs_/iu);
  const dispatch = targeted.jobs.request.steps.find(
    (step: { name?: string }) =>
      step.name ===
      "Dispatch TavernKeeper targeted scan with repository ID only",
  );
  expect(dispatch.env).toEqual({
    GH_TOKEN: "${{ steps.tavernkeeper-token.outputs.token }}",
    REPOSITORY_ID: "${{ steps.resolve.outputs.repository_id }}",
  });
  expect(dispatch.run).toContain("inputs:{repository_id:$repository_id}");
  expect(dispatch.run).toContain(
    'run_title="Tavernary targeted scan #$REPOSITORY_ID"',
  );
  expect(dispatch.run).toContain("for dispatch_attempt in 1 2 3");
  expect(dispatch.run).toContain('"$status" == "in_progress"');
  expect(dispatch.run).toContain('"$conclusion" == "cancelled"');
  expect(dispatch.run).toContain("actions/workflows/targeted-scan.yml/runs");
  expect(dispatch.run).not.toMatch(
    /repository_url|source_id|target_sha|branch|mode|model|priority|token_budget|clone_url/iu,
  );
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

test("gates Kit withdrawal writes behind manifest validation and synchronizes correction state", async () => {
  const withdrawal = await workflow("apply-kit-withdrawal");
  const source = await readFile(
    resolve(workflowDirectory, "apply-kit-withdrawal.yml"),
    "utf8",
  );
  const steps = withdrawal.jobs.withdraw.steps as Array<{
    id?: string;
    name?: string;
    if?: string;
  }>;
  const apply = steps.find(
    ({ name }) => name === "Verify numeric author and write tombstone",
  );
  expect(apply?.id).toBe("withdraw");
  for (const name of [
    "Validate withdrawal",
    "Commit Kit tombstone",
    "Close withdrawal request",
    "Deploy updated catalog",
  ]) {
    expect(steps.find((step) => step.name === name)?.if).toBe(
      "steps.withdraw.outputs.status == 'applied'",
    );
  }
  expect(source).toContain("tavernary-kit-withdrawal-correction");
  expect(source).toContain("needs-information");
  expect(source).toContain("https://tavernary.org/help/withdraw-kit/");
  expect(source).toContain("STATUS: ${{ steps.withdraw.outputs.status }}");
  expect(source).toContain('status === "needs-information"');
  expect(source).toContain("steps.withdraw.outputs.status == 'applied'");
});

test("initializes Kit support before publishing the new registry record", async () => {
  const publication = await workflow("apply-kit-submission");
  const steps = publication.jobs.publish.steps as Array<{
    id?: string;
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
  const apply = steps[applyIndex];
  const support = steps[supportIndex];
  const commit = steps.find(({ name }) => name === "Commit canonical Kit");

  expect(applyIndex).toBeGreaterThanOrEqual(0);
  expect(supportIndex).toBeGreaterThan(applyIndex);
  expect(validationIndex).toBeGreaterThan(supportIndex);
  expect(apply?.id).toBe("apply");
  expect(support.run).toBe("node scripts/kits/refresh-reactions.mjs");
  expect(support.env).toMatchObject({
    GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
    REQUIRED_KIT_ID: "${{ steps.apply.outputs.kit_id }}",
  });
  expect(support.env).not.toHaveProperty("REQUIRED_KIT_ISSUE_NUMBER");
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
  const classifier = await readFile(
    resolve("scripts", "ci", "classify-pr-paths.mjs"),
    "utf8",
  );
  expect(classifier).toContain("^data\\/registry\\/sources\\/[^/]+\\.json$");
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
  expect(verifyCommands).toContain("npm run test:scan-e2e");
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

test("reconciles reports on a bounded schedule and wakes TavernKeeper only after a changed public deployment", async () => {
  const reportImport = await workflow("import-tavernkeeper-reports");
  const deploy = await workflow("deploy-pages");
  const deploySource = await readFile(
    resolve(workflowDirectory, "deploy-pages.yml"),
    "utf8",
  );
  const importSource = await readFile(
    resolve(workflowDirectory, "import-tavernkeeper-reports.yml"),
    "utf8",
  );
  const wakeSteps = deploy.jobs["wake-tavernkeeper"].steps as Array<{
    name?: string;
    if?: string;
    run?: string;
  }>;
  const wake = wakeSteps.find(
    (step) => step.name === "Wake TavernKeeper reconciliation (best effort)",
  );
  const token = wakeSteps.find(
    (step) => step.name === "Create destination-only TavernKeeper token",
  ) as { "continue-on-error"?: boolean } | undefined;
  const reportImportSteps = reportImport.jobs.import.steps as Array<{
    name?: string;
    env?: Record<string, string>;
  }>;
  const synthesisStep = reportImportSteps.find(
    (step) =>
      step.name === "Import and synthesize validated TavernKeeper reports",
  );

  expect(reportImport.on.schedule).toEqual([{ cron: "41 */6 * * *" }]);
  expect(reportImport.on.workflow_dispatch).toBeNull();
  expect(reportImport.permissions).toEqual({
    actions: "write",
    contents: "write",
  });
  expect(deploy.jobs["wake-tavernkeeper"].needs).toEqual(["build", "deploy"]);
  expect(deploy.jobs["wake-tavernkeeper"].permissions).toEqual({
    contents: "read",
  });
  expect(importSource).toContain("npm run security:import-reports");
  expect(synthesisStep?.env).toEqual({
    TAVERNARY_ENRICHMENT_API_URL: "${{ secrets.TAVERNARY_ENRICHMENT_API_URL }}",
    TAVERNARY_ENRICHMENT_API_KEY: "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
    TAVERNARY_ENRICHMENT_MODEL: "${{ secrets.TAVERNARY_ENRICHMENT_MODEL }}",
  });
  expect(
    reportImportSteps
      .filter((step) => step !== synthesisStep)
      .some((step) =>
        Object.keys(step.env ?? {}).some((key) =>
          key.startsWith("TAVERNARY_ENRICHMENT_"),
        ),
      ),
  ).toBe(false);
  expect(importSource).toContain("for attempt in 1 2 3");
  expect(importSource).toContain("-f source_sha=");
  expect(importSource).not.toContain("reconcile.yml");
  expect(deploySource).toContain(
    "repos/MentallyQuill/TavernKeeper/actions/workflows/reconcile.yml/dispatches",
  );
  expect(wake?.run).toContain("-f ref=main");
  expect(wake?.run).not.toContain("inputs");
  expect(wake?.run).not.toMatch(/-f (?:project|sha|mode|budget|report)/u);
  expect(token?.["continue-on-error"]).toBe(true);
  expect(wake?.if).toContain("steps.tavernkeeper-token.outcome == 'success'");
  expect(JSON.stringify(deploy)).not.toContain("contents: write");
  expect(JSON.stringify(deploy)).not.toContain("actions: write");
});

test("recovers a failed report Pages dispatch by redispatching and verifying the next no-diff run", async () => {
  const reportImport = await workflow("import-tavernkeeper-reports");
  const steps = reportImport.jobs.import.steps as Array<{
    name?: string;
    id?: string;
    if?: string;
    run?: string;
    env?: Record<string, string>;
    "continue-on-error"?: boolean;
  }>;
  const commit = steps.find(
    (step) => step.name === "Commit and publish changed summaries",
  );
  const deploy = steps.find(
    (step) => step.name === "Deploy the exact reconciled summary commit",
  );
  const commitSource = commit?.run ?? "";
  const noDiffStart = commitSource.indexOf(
    "if git diff --cached --quiet -- data/security/tavernkeeper-report-summaries.json",
  );
  const noDiffEnd = commitSource.indexOf("\nfi", noDiffStart);
  const noDiffSource = commitSource.slice(noDiffStart, noDiffEnd);
  const rebase = commitSource.indexOf("git rebase origin/main");
  const validate = commitSource.indexOf("npm run check", rebase);
  const push = commitSource.indexOf("git push origin HEAD:main", validate);

  expect(noDiffStart).toBeGreaterThanOrEqual(0);
  expect(noDiffSource).toContain("git fetch --no-tags origin main");
  expect(noDiffSource).toContain("git merge --ff-only origin/main");
  expect(noDiffSource).toContain("npm run check");
  expect(noDiffSource).toContain('echo "sha=$(git rev-parse HEAD)"');
  expect(commitSource).toContain("for attempt in 1 2 3");
  expect(rebase).toBeGreaterThanOrEqual(0);
  expect(rebase).toBeLessThan(validate);
  expect(validate).toBeLessThan(push);

  expect(deploy?.if).toBeUndefined();
  expect(deploy?.env?.SOURCE_SHA).toBe("${{ steps.commit.outputs.sha }}");
  expect(deploy?.run).toContain(
    'gh workflow run deploy-pages.yml --repo "$GITHUB_REPOSITORY" --ref main',
  );
  expect(deploy?.run).toContain('-f source_sha="$SOURCE_SHA"');
  expect(deploy?.run).toContain(
    '.displayTitle == \\"Site: Deploy $SOURCE_SHA\\"',
  );
  expect(deploy?.run).toContain("gh run watch");
  expect(deploy?.run).toContain("--exit-status");
  expect(deploy?.["continue-on-error"]).not.toBe(true);
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
  expect(inputs).toHaveProperty("source_id");
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
  expect(source).toContain("data/snapshots/codeberg/*.json");
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
  expect(inputs.model_concurrency).toEqual({
    description: "Concurrent model calls, from 1 through 8.",
    type: "number",
    default: 6,
  });
  expect(source).toContain(
    "MODEL_CONCURRENCY: ${{ inputs.model_concurrency || 6 }}",
  );
  expect(source).toContain(
    "MODEL_TIMEOUT_SECONDS: ${{ inputs.model_timeout_seconds || 120 }}",
  );
  expect(source).toContain("npm run catalog:report-enrichment-errors");
  expect(source).toContain("enrichment-rollout-result.json");
  expect(source).toContain("Manual exclusions:");
  expect(source).toContain("Model calls:");
  expect(source).toContain("Repair calls:");
  expect(source).toContain("Rate-limit events:");
  expect(source).toContain("Total model latency:");
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

test("retries fork dependencies after registry or upstream review changes", async () => {
  const retry = await workflow("retry-fork-dependencies");
  const source = await readFile(
    resolve(workflowDirectory, "retry-fork-dependencies.yml"),
    "utf8",
  );

  expect(retry.on.push).toEqual({
    branches: ["main"],
    paths: ["data/registry/projects/**"],
  });
  expect(retry.on.workflow_dispatch.inputs.upstream_issue_number).toMatchObject(
    {
      required: false,
      type: "number",
    },
  );
  expect(retry.permissions).toEqual({
    contents: "read",
    issues: "read",
    actions: "write",
  });
  expect(retry.concurrency).toEqual({
    group: "retry-fork-dependencies",
    "cancel-in-progress": false,
  });
  expect(source).toContain(
    "node scripts/submissions/retry-fork-dependencies.mjs",
  );
  expect(source).toContain(
    "UPSTREAM_ISSUE_NUMBER: ${{ inputs.upstream_issue_number }}",
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
  expect(source).toContain("planClassificationReviewNotice");
  expect(source).toContain(
    "scripts/submissions/classification-review-notice.mjs",
  );
  expect(source).toContain("gh label create classification-review");
  expect(source).toContain("issues/${ISSUE_NUMBER}/comments?per_page=100");
  expect(source).toContain("classificationReview: report.classificationReview");
  expect(
    source.indexOf("Synchronize classification review notice"),
  ).toBeLessThan(source.indexOf("Create or update maintainer review PR"));
  expect(source).toContain(
    "steps.commit.outputs.changed == 'true' || steps.state.outputs.pr_number != ''",
  );
  expect(source).toContain("gh api --paginate --slurp");
  expect(source).toContain("generated-paths.txt");
  expect(source).toContain("project_ids: [report.project_id]");
  expect(source).toContain("source_id: report.source_id");
  expect(source).toContain("publication_mode: report.publication_mode");
  expect(source).toContain(
    "input_fingerprints: { projects: {}, source: null }",
  );
  expect(source).not.toContain("record_fingerprint: null");
  expect(
    source.indexOf("Reject conflicting open submission paths"),
  ).toBeLessThan(source.indexOf("git commit -m"));
  expect(
    source.indexOf("Reject conflicting open submission paths"),
  ).toBeLessThan(source.indexOf("git push origin"));
  expect(source).toContain("labels.includes('issue-admitted')");
  expect(
    source.match(/labels\.includes\('submission-retryable'\)/gu)?.length,
  ).toBeGreaterThanOrEqual(4);
  expect(source).toContain("Refresh and revalidate issue before PR mutation");
  expect(source).toContain("Refresh and revalidate issue before labeling");
  expect(source).toContain(
    '--retry-state-path "${RUNNER_TEMP}/project-submission-retry-state.json"',
  );
  expect(source).toContain(
    "REDDIT_RETRY_STATE_PATH: ${{ runner.temp }}/project-submission-retry-state.json",
  );
  expect(source).toContain("Reconcile Reddit retry success");
  expect(source).toContain("renderCopyReviewDiagnosticSummary");
  expect(source).toContain("report.copy_review_diagnostic");
  expect(source).toContain("GITHUB_STEP_SUMMARY");
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

test("checks for due Reddit submissions once daily", async () => {
  const retry = await workflow("retry-project-submission-enrichment");

  expect(retry.on.schedule).toEqual([{ cron: "37 7 * * *" }]);
  expect(retry.on.workflow_dispatch).toBeNull();
  expect(retry.permissions).toEqual({
    contents: "read",
    issues: "read",
    actions: "write",
  });
  expect(retry.concurrency).toEqual({
    group: "retry-project-submission-enrichment",
    "cancel-in-progress": false,
  });
  expect(
    allSteps(retry).some((step) =>
      step.run?.includes(
        "node scripts/submissions/retry-project-submission-enrichment.mjs",
      ),
    ),
  ).toBe(true);
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
  const synchronize = (
    lifecycle.jobs.close.steps as Array<{
      name?: string;
      env?: Record<string, string>;
      run?: string;
    }>
  ).find(({ name }) => name === "Synchronize issue lifecycle");

  expect(lifecycle.on.pull_request.types).toEqual(["closed"]);
  expect(lifecycle.permissions).toEqual({
    contents: "write",
    issues: "write",
    "pull-requests": "read",
    actions: "write",
  });
  expect(lifecycle.jobs.close.if).toContain(
    "startsWith(github.event.pull_request.head.ref, 'automation/project-submission-')",
  );
  expect(lifecycle.jobs.close.if).toContain(
    "github.event_name == 'workflow_dispatch'",
  );
  expect(checkout?.with?.ref).toBe(
    "${{ github.event.repository.default_branch || 'main' }}",
  );
  expect(source).toContain("github.event.pull_request.head.sha");
  expect(source).toContain("submission-declined");
  expect(source).toContain("state_reason");
  expect(synchronize?.env?.CLOSE_REASON).toBe(
    "${{ steps.plan.outputs.close_reason }}",
  );
  expect(synchronize?.run).toContain('if [[ -n "$CLOSE_REASON" ]]');
  expect(source).toContain("gh api --method PUT");
  expect(source).not.toMatch(
    /gh api --method POST\s+\\\s+"repos\/\$\{GITHUB_REPOSITORY\}\/issues\/\$\{ISSUE_NUMBER\}\/labels"/,
  );
  expect(source).not.toContain("github.event.pull_request.head.ref }}");
  expect(source).toContain("gh workflow run retry-fork-dependencies.yml");
  expect(source).toContain('-f upstream_issue_number="$UPSTREAM_ISSUE_NUMBER"');
  expect(source.indexOf("Synchronize issue lifecycle")).toBeLessThan(
    source.indexOf("Retry fork dependents"),
  );
});

test("triages owner requests through a read-only repository gate", async () => {
  const triage = await workflow("triage-project-owner-request");
  const source = await readFile(
    resolve(workflowDirectory, "triage-project-owner-request.yml"),
    "utf8",
  );
  const checkout = allSteps(triage).find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  ) as { with?: { ref?: string } } | undefined;

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
  expect(triage.concurrency).toEqual({
    group: "project-owner-triage-${{ inputs.issue_number }}",
    "cancel-in-progress": true,
  });
  expect(checkout?.with?.ref).toBe(
    "${{ github.event.repository.default_branch }}",
  );
  expect(source).toContain("processProjectOwnerTriage");
  expect(source).toContain("tagVocabularyHash");
  expect(source).toContain('tags: ["tags.json", "tags"]');
  expect(source).not.toContain(
    'capabilities: ["capabilities.json", "capabilities"]',
  );
  expect(source).toContain(
    "issues?state=open&labels=project-owner-request&per_page=100",
  );
  expect(source).toContain("pulls?state=open&per_page=100");
  expect(source).toContain("issues: openIssues");
  expect(source).toContain("pulls: openPulls");
  expect(source).toContain("steps.triage.outputs.admitted == 'true'");
  expect(source).toContain(
    "gh workflow run generate-project-owner-request.yml",
  );
  expect(source).toContain('-f issue_number="$ISSUE_NUMBER"');
  expect(source).toContain("-f force_regeneration=false");
  expect(source).toContain("<!-- tavernary-owner-request-correction -->");
  expect(source).toContain("/help/manage-project/");
  expect(source).toContain("Readable GitHub fields are review-only");
  expect(source).toContain("decision.message");
  expect(source).toContain("/comments?per_page=100");
  expect(source).toContain('method: "PATCH"');
  expect(source).toContain('method: "DELETE"');
  for (const label of [
    "needs-information",
    "needs-maintainer-review",
    "submission-retryable",
  ]) {
    expect(source).toContain(label);
  }
  expect(source).not.toContain("submission-pr-open");
  expect(source).not.toContain("npm ci");
  expect(source).not.toMatch(/\bgit (?:add|commit|push)\b/);
});

test("generates owner review PRs with operation-scoped guarded writes", async () => {
  const generation = await workflow("generate-project-owner-request");
  const source = await readFile(
    resolve(workflowDirectory, "generate-project-owner-request.yml"),
    "utf8",
  );
  const checkout = allSteps(generation).find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  ) as { with?: { "fetch-depth"?: number; ref?: string } } | undefined;

  expect(generation.permissions).toEqual({
    contents: "write",
    issues: "write",
    "pull-requests": "write",
    actions: "write",
  });
  expect(generation.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(
    generation.on.workflow_dispatch.inputs.force_regeneration,
  ).toMatchObject({ required: false, type: "boolean", default: false });
  expect(generation.concurrency).toEqual({
    group: "project-owner-generation",
    "cancel-in-progress": false,
  });
  expect(checkout?.with).toMatchObject({ "fetch-depth": 0, ref: "main" });
  expect(generation.jobs.generate.env).toMatchObject({
    TAVERNARY_ENRICHMENT_API_URL: "${{ secrets.TAVERNARY_ENRICHMENT_API_URL }}",
    TAVERNARY_ENRICHMENT_API_KEY: "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
    TAVERNARY_ENRICHMENT_MODEL: "${{ secrets.TAVERNARY_ENRICHMENT_MODEL }}",
  });
  expect(source).toContain("npm ci");
  expect(source).toContain("generate-project-owner-request.mjs");
  expect(
    source.match(/node scripts\/help\/generate-project-owner-request\.mjs/gu),
  ).toHaveLength(2);
  expect(source.match(/--validated-report-path/gu)).toHaveLength(1);
  expect(source).toContain(
    '--validated-report-path "${RUNNER_TEMP}/validated-project-owner-report.json"',
  );
  expect(source.indexOf("--validated-report-path")).toBeGreaterThan(
    source.indexOf("Regenerate final owner state before branch mutation"),
  );
  expect(source.match(/validated-project-owner-report\.sha256/gu)).toHaveLength(
    2,
  );
  expect(source).toContain(
    "Validated owner report changed after content validation.",
  );
  expect(source).toContain("sameProjectOwnerGenerationReport");
  expect(source).toContain(
    "Owner request changed after validation; refusing stale generation.",
  );
  expect(source).toContain("planOwnerPrUpdate");
  expect(source).toContain("findOwnerRequestPathCollision");
  expect(source).toContain("parseOwnerRequestPullRequestMarker");
  expect(source).toContain("renderOwnerRequestPullRequest");
  expect(source).toContain('-f head="${GITHUB_REPOSITORY_OWNER}:${branch}"');
  expect(source).toContain("-f base=main");
  expect(source).not.toContain('gh pr list --state open --head "$branch"');
  expect(source).toContain("git push --force-with-lease=");
  expect(source).not.toMatch(/git push (?:--force|-f)(?!-with-lease)/);
  expect(source).toContain("feat(catalog): apply owner request #");
  expect(source).toContain("npm run catalog:validate");
  expect(source).toContain("npm run catalog:build");
  expect(source).toContain("tests/unit/project-owner-");
  expect(source).toContain("tests/unit/trusted-editor-authority.test.ts");
  expect(source).toContain("tests/unit/catalog-copy-provider.test.ts");
  expect(source).toContain("tests/unit/catalog-copy-contract.test.ts");
  expect(source).toContain("report,");
  expect(source).toContain("authority_type: report.authority_type");
  expect(source).toContain("mode: report.copy_mode");
  expect(source).toContain("login: report.actor_login");
  expect(source).not.toContain("verifiedOwnerLogin");
  expect(source).toContain("npm run check:content");
  expect(source).toContain("git clean -fX -- src/generated/catalog.json");
  expect(source).not.toContain("git checkout -- src/generated/catalog.json");
  expect(source).toContain("submission-pr-open");
  expect(source).toMatch(/labels\.includes\(["']submission-retryable["']\)/u);
  expect(source).toContain("gh label create submission-pr-open");
  expect(source).toContain("Owner generation changed unsafe paths");
  expect(source.indexOf("Owner generation changed unsafe paths")).toBeLessThan(
    source.indexOf("git commit -m"),
  );
  expect(source).toContain("actions/upload-artifact@");
  expect(source).toContain("gh workflow run ci.yml");
  expect(source).toContain("data/registry/projects/");
  expect(source).toContain("data/registry/sources/");
  expect(source).toContain("data/snapshots/github/");
  expect(source).toContain("project_ids: report.project_ids");
  expect(source).toContain("source_id: report.source_id");
  expect(source).toContain("publication_mode: report.publication_mode");
  expect(source).toContain("input_fingerprints: report.input_fingerprints");
  expect(source).toContain("report,");
  expect(source).not.toContain("record_fingerprint: report.record_fingerprint");
  expect(source).not.toContain("git add src/generated/catalog.json");
  expect(source).not.toMatch(/git add[^;\n]*(?:\.github\/workflows|scripts\/)/);
  expect(source).not.toContain("gh pr merge");
  expect(source).toContain("renderCopyReviewDiagnosticSummary");
  expect(source).toContain('entry.review_status === "unavailable"');
  expect(source).toContain("entry.diagnostic");
});

test.each([
  ["generate-project-submission", "project-submission"],
  ["generate-project-owner-request", "project-owner-request"],
])("reconciles non-cancelled %s failures", async (name, producer) => {
  const generation = await workflow(name);
  const steps = generation.jobs.generate.steps as Array<{
    name?: string;
    if?: string;
    run?: string;
    env?: Record<string, string>;
  }>;
  const reconcile = steps.find(
    (step) => step.name === "Reconcile failed generation",
  );

  expect(reconcile).toMatchObject({
    if: "failure() && !cancelled()",
    run: "node scripts/submissions/project-generation-failure.mjs",
    env: {
      ISSUE_NUMBER: "${{ inputs.issue_number }}",
      GENERATION_PRODUCER: producer,
      GENERATION_REASON_CODE: "generation-failed",
      GENERATION_RUN_URL:
        "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}",
      GITHUB_TOKEN: "${{ secrets.GITHUB_TOKEN }}",
    },
  });
});

test("handles owner closure from default-branch code and exact head state", async () => {
  const lifecycle = await workflow("project-owner-request-lifecycle");
  const source = await readFile(
    resolve(workflowDirectory, "project-owner-request-lifecycle.yml"),
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
  expect(lifecycle.concurrency).toEqual({
    group:
      "project-owner-lifecycle-${{ inputs.pull_number || github.event.pull_request.number }}",
    "cancel-in-progress": false,
  });
  expect(lifecycle.jobs.close.if).toContain(
    "startsWith(github.event.pull_request.head.ref, 'automation/project-owner-request-')",
  );
  expect(lifecycle.jobs.close.if).toContain(
    "github.event_name == 'workflow_dispatch'",
  );
  expect(checkout?.with?.ref).toBe(
    "${{ github.event.repository.default_branch || 'main' }}",
  );
  expect(source).toContain("planProjectOwnerClosure");
  expect(source).toContain("github.event.pull_request.head.sha");
  expect(source).toContain("pull.base.ref");
  expect(source).toContain("event.repository.default_branch");
  expect(source).toContain("state_reason");
  expect(source).toContain("gh api --method PUT");
  expect(source).toContain("tavernary-project-owner-declined-pr:");
  expect(source).toContain("gh label create submission-declined");
  expect(source).not.toContain("github.event.pull_request.head.ref }}");
  expect(source).not.toContain("gh pr checkout");
  expect(source).not.toContain("gh pr merge");
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
  expect(source).toContain("gh workflow run triage-project-owner-request.yml");
  expect(source).not.toContain(
    "gh workflow run generate-project-owner-request.yml",
  );
  expect(
    source.match(/gh workflow run triage-help-request\.yml/g),
  ).toHaveLength(1);
  expect(source).toContain("steps.admission.outputs.route == 'project'");
  expect(source).toContain("steps.admission.outputs.route == 'kit'");
  expect(source).toContain("steps.admission.outputs.route == 'kit-withdrawal'");
  expect(source).toContain("steps.admission.outputs.route == 'project-owner'");
  for (const route of [
    "project-report",
    "website-bug",
    "kit-report",
    "other-help",
  ]) {
    expect(source).toContain(`steps.admission.outputs.route == '${route}'`);
  }
  expect(source).toContain(
    '-f issue_number="${{ steps.admission.outputs.issue_number }}"',
  );
  expect(source).toContain("steps.admission.outputs.route == 'conflict'");
  expect(source).not.toContain("startsWith(github.event.issue.title");
  expect(source).not.toContain("npm ci");
});

test("triages Help reports from latest issue state with a read-only repository boundary", async () => {
  const triage = await workflow("triage-help-request");
  const source = await readFile(
    resolve(workflowDirectory, "triage-help-request.yml"),
    "utf8",
  );
  const steps = allSteps(triage);
  const checkout = steps.find((step) =>
    step.uses?.startsWith("actions/checkout@"),
  ) as { with?: { ref?: string } } | undefined;
  const setupNode = steps.find((step) =>
    step.uses?.startsWith("actions/setup-node@"),
  ) as { with?: { "node-version"?: number } } | undefined;

  expect(Object.keys(triage.on)).toEqual(["workflow_dispatch"]);
  expect(triage.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    required: true,
    type: "number",
  });
  expect(triage.permissions).toEqual({
    contents: "read",
    issues: "write",
  });
  expect(triage.concurrency).toEqual({
    group: "help-triage-${{ inputs.issue_number }}",
    "cancel-in-progress": true,
  });
  expect(checkout?.with?.ref).toBe(
    "${{ github.event.repository.default_branch }}",
  );
  expect(setupNode?.with?.["node-version"]).toBe(24);
  expect(source).toContain("node scripts/help/triage-help-issue.mjs");
  expect(source).toContain("ISSUE_NUMBER: ${{ inputs.issue_number }}");
  expect(source.indexOf("actions/checkout@")).toBeLessThan(
    source.indexOf("node scripts/help/triage-help-issue.mjs"),
  );
  expect(source).not.toContain("gh workflow run");
  expect(source).not.toContain("pull-requests:");
  expect(source).not.toContain("actions: write");
  expect(source).not.toContain("data/registry");
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
