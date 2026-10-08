import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "vitest";
import { parse } from "yaml";

const workflowDirectory = resolve(".github/workflows");
const pinnedActions = {
  "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node": "820762786026740c76f36085b0efc47a31fe5020",
  "actions/configure-pages": "45bfe0192ca1faeb007ade9deae92b16b8254a0d",
  "actions/upload-pages-artifact": "fc324d3547104276b827a68afc52ff2a11cc49c9",
  "actions/deploy-pages": "368f82528645a54fb793d4d04e342629a3f51346",
  "actions/upload-artifact": "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  "actions/create-github-app-token": "bcd2ba49218906704ab6c1aa796996da409d3eb1",
};

const modelProviderEnvironment = {
  UTILITY_API_ENDPOINT: "${{ secrets.UTILITY_API_ENDPOINT }}",
  UTILITY_API_KEY: "${{ secrets.UTILITY_API_KEY }}",
  UTILITY_MODEL: "${{ secrets.UTILITY_MODEL }}",
  UTILITY_REASONING_EFFORT: "${{ vars.UTILITY_REASONING_EFFORT }}",
  TAVERNARY_ENRICHMENT_API_URL: "${{ secrets.TAVERNARY_ENRICHMENT_API_URL }}",
  TAVERNARY_ENRICHMENT_API_KEY: "${{ secrets.TAVERNARY_ENRICHMENT_API_KEY }}",
  TAVERNARY_ENRICHMENT_MODEL: "${{ secrets.TAVERNARY_ENRICHMENT_MODEL }}",
} as const;

const modelProviderEnvironmentKeys = Object.keys(modelProviderEnvironment);

const protectedPublisherJobs = {
  "automation-writer": "write",
  "apply-kit-submission": "publish",
  "apply-kit-withdrawal": "withdraw",
  "backfill-repository-identities": "backfill",

  "import-tavernkeeper-reports": "import",
  "publisher-verification": "verify",
  "refresh-catalog": "refresh",
  "review-catalog-policy": "review",
} as const;

const publisherActorExpression =
  "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID";

const expectedPublisherConditions = {
  "automation-writer":
    "github.ref == 'refs/heads/main' && (github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,
  "refresh-catalog":
    "inputs.operation_key == '' && github.ref == 'refs/heads/main' && (github.event_name != 'workflow_dispatch' || github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,

  "apply-kit-submission":
    "inputs.operation_key == '' && github.ref == 'refs/heads/main' && (github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,
  "apply-kit-withdrawal":
    "inputs.operation_key == '' && github.ref == 'refs/heads/main' && (github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,
  "publisher-verification":
    "github.ref == 'refs/heads/main' && github.actor_id == 2625904",
  "review-catalog-policy":
    "inputs.operation_key == '' && github.ref == 'refs/heads/main' && (github.event_name == 'schedule' || github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,
  "import-tavernkeeper-reports":
    "inputs.operation_key == '' && github.ref == 'refs/heads/main' && " +
    "(github.event_name != 'workflow_dispatch' || " +
    "github.actor_id == 2625904 || " +
    `${publisherActorExpression} || ` +
    "github.actor_id == 311860138)",
  default:
    "github.ref == 'refs/heads/main' && " +
    "(github.event_name != 'workflow_dispatch' || " +
    "github.actor_id == 2625904 || " +
    `${publisherActorExpression})`,
} as const;

function exposesModelProviderEnvironment(step: {
  env?: Record<string, string>;
}) {
  return modelProviderEnvironmentKeys.some((key) =>
    Object.hasOwn(step.env ?? {}, key),
  );
}

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

type WorkflowStep = {
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};

function shellCommands(source = "") {
  return source
    .replace(/\\\r?\n\s*/gu, " ")
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}

function stepWritesMain(step: WorkflowStep) {
  if (step.run?.includes("catalog:enrichment-rollout")) return true;
  if (step.run?.includes("node scripts/automation/writer-cli.mjs")) return true;

  return shellCommands(step.run).some((command) => {
    const pushesMain =
      /\bgit\s+push\b/u.test(command) &&
      /(?:^|\s|["'])(?:\+)?(?:[^:\s"']*:)?(?:refs\/heads\/)?main(?:\s|$|["';])/u.test(
        command,
      );
    const updatesMainRef =
      /\/git\/refs\/heads\/main\b/u.test(command) ||
      /\/git\/refs\b.*\bref=(?:["'])?refs\/heads\/main\b/u.test(command) ||
      /\bupdateRef\b.*refs\/heads\/main\b/u.test(command);
    const writesMainContents =
      /\/contents\/\S+/u.test(command) &&
      /\bbranch=(?:["'])?main\b/u.test(command);
    return pushesMain || updatesMainRef || writesMainContents;
  });
}

function workflowDispatchTargets(step: WorkflowStep) {
  const candidates: string[] = [];
  if (step.run?.includes("node scripts/automation/prepared-wake.mjs"))
    candidates.push("automation-writer.yml");
  const command = shellCommands(step.run).join(" ");
  for (const match of command.matchAll(
    /\bgh\s+workflow\s+run\s+(?:"([^"]+)"|'([^']+)'|([^\s\\]+))/gu,
  )) {
    candidates.push(match[1] ?? match[2] ?? match[3]);
  }
  for (const match of command.matchAll(
    /\/actions\/workflows\/([^/\s"'?]+)\/dispatches\b/gu,
  )) {
    candidates.push(match[1]);
  }
  if (step.uses && /workflow[-_]dispatch/iu.test(step.uses)) {
    candidates.push(
      ...Object.values(step.with ?? {}).filter((value) =>
        /\.ya?ml$/u.test(value),
      ),
    );
  }
  return [...new Set(candidates)];
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
    "generated-project-branch-cleanup":
      "Security: Clean generated project branch",
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
    "publisher-verification": "Security: Verify Tavernary Publisher",
    "publisher-automation-branch-verification":
      "Security: Verify Publisher automation branches",
  } as const;

  for (const [file, expectedName] of Object.entries(expectedNames)) {
    expect((await workflow(file)).name).toBe(expectedName);
  }
});

test("passes the configured Publisher bot ID to validation reconciliation", async () => {
  const document = await workflow("reconcile-project-validations");

  expect(document.jobs.reconcile.env).toMatchObject({
    TAVERNARY_PUBLISHER_BOT_ID: "${{ vars.TAVERNARY_PUBLISHER_BOT_ID }}",
  });
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
    "generated-project-branch-cleanup": ["Generated branch cleanup for PR #"],
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
    "enrich-catalog": ["Automation prepare", "inputs.operation_key"],
    "backfill-repository-identities": ["Catalog:", "Backfill repository IDs"],
    ci: ["Site:", "Validate"],
    "deploy-pages": ["Site:", "Deploy"],
    "targeted-tavernkeeper-scan": ["Security:", "Scan"],
    "publisher-verification": ["Security:", "Verify Publisher write lane"],
    "publisher-automation-branch-verification": [
      "Security:",
      "Verify Publisher branch custody",
    ],
  } as const;

  for (const [file, expectedParts] of Object.entries(expectedRunNameParts)) {
    const runName = String((await workflow(file))["run-name"] ?? "");
    for (const expectedPart of expectedParts) {
      expect(runName).toContain(expectedPart);
    }
  }
});

test("pins every first-party action to its resolved commit", async () => {
  const names = (await readdir(workflowDirectory))
    .filter((name) => /\.ya?ml$/u.test(name))
    .map((name) => name.replace(/\.ya?ml$/u, ""));
  for (const name of names) {
    for (const step of allSteps(await workflow(name))) {
      if (!step.uses?.startsWith("actions/")) continue;
      const [action, sha] = step.uses.split("@");
      expect(sha).toBe(pinnedActions[action as keyof typeof pinnedActions]);
      expect(sha).toMatch(/^[a-f0-9]{40}$/);
    }
  }
});

test("limits every main publisher to the protected Publisher App", async () => {
  const discoveredPublishers: string[] = [];
  for (const file of await readdir(workflowDirectory)) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const document = parse(
      await readFile(resolve(workflowDirectory, file), "utf8"),
    ) as Record<string, unknown>;
    if (allSteps(document).some((step) => stepWritesMain(step))) {
      discoveredPublishers.push(file.replace(/\.ya?ml$/u, ""));
    }
  }

  expect(discoveredPublishers.sort()).toEqual(
    Object.keys(protectedPublisherJobs)
      .filter(
        (name) =>
          !(
            name.startsWith("apply-kit-") ||
            name === "review-catalog-policy" ||
            name === "refresh-catalog" ||
            name === "import-tavernkeeper-reports" ||
            name === "backfill-repository-identities" ||
            name === "publisher-verification"
          ),
      )
      .sort(),
  );

  for (const [name, jobName] of Object.entries(protectedPublisherJobs)) {
    const document = (await workflow(name)) as {
      permissions: Record<string, string>;
      jobs: Record<
        string,
        {
          environment?: string;
          if?: string;
          permissions?: Record<string, string>;
          steps: Array<{
            id?: string;
            uses?: string;
            with?: Record<string, string>;
          }>;
        }
      >;
    };
    const job = document.jobs[jobName];
    const publisherToken = job.steps.find((step) =>
      step.uses?.startsWith("actions/create-github-app-token@"),
    );
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );

    expect(document.permissions.contents, name).toBe("read");
    expect(job.environment, name).toBe("publisher");
    expect(job.if?.replace(/\s+/gu, " ").trim(), name).toBe(
      expectedPublisherConditions[
        name as keyof typeof expectedPublisherConditions
      ] ?? expectedPublisherConditions.default,
    );
    expect(job.permissions?.contents, name).not.toBe("write");
    expect(publisherToken?.uses, name).toBe(
      `actions/create-github-app-token@${pinnedActions["actions/create-github-app-token"]}`,
    );
    expect(publisherToken, name).toMatchObject({
      id: name === "automation-writer" ? "writer-token" : "publisher-token",
      with: {
        "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
        "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
        ...(name.startsWith("apply-kit-") ||
        name === "review-catalog-policy" ||
        name === "refresh-catalog" ||
        name === "import-tavernkeeper-reports" ||
        name === "backfill-repository-identities" ||
        name === "publisher-verification"
          ? { "permission-actions": "write" }
          : { "permission-contents": "write" }),
      },
    });
    if (
      name.startsWith("apply-kit-") ||
      name === "review-catalog-policy" ||
      name === "refresh-catalog" ||
      name === "import-tavernkeeper-reports" ||
      name === "backfill-repository-identities" ||
      name === "publisher-verification"
    )
      expect(publisherToken?.with?.["permission-contents"]).toBeUndefined();
    if (
      name === "automation-writer" ||
      name.startsWith("apply-kit-") ||
      name === "review-catalog-policy" ||
      name === "refresh-catalog" ||
      name === "import-tavernkeeper-reports" ||
      name === "backfill-repository-identities" ||
      name === "publisher-verification"
    ) {
      expect(checkout?.with).toMatchObject({
        ref: "main",
        "persist-credentials": false,
      });
      expect(checkout?.with?.token).toBeUndefined();
      expect(job.steps.indexOf(publisherToken!)).toBeGreaterThan(
        job.steps.indexOf(checkout!),
      );
    } else {
      expect(checkout?.with?.token, name).toBe(
        "${{ steps.publisher-token.outputs.token }}",
      );
    }
  }
});

test("keeps Publisher verification owner-only and delegates content-neutral proof", async () => {
  const document = await workflow("publisher-verification");
  const job = document.jobs.verify;
  const token = job.steps.find(
    (step: WorkflowStep) => step.id === "publisher-token",
  );
  const dispatch = job.steps.find((step: WorkflowStep) =>
    step.run?.includes("gh workflow run"),
  );
  expect(document.on).toEqual({ workflow_dispatch: null });
  expect(document.permissions).toEqual({ contents: "read", actions: "read" });
  expect(document.concurrency).toEqual({
    group: "tavernary-publisher-verification",
    "cancel-in-progress": false,
  });
  expect(job.environment).toBe("publisher");
  expect(job.permissions).toEqual({ contents: "read", actions: "read" });
  expect(job.if).toBe(
    "github.ref == 'refs/heads/main' && github.actor_id == 2625904",
  );
  expect(token).toMatchObject({
    id: "publisher-token",
    uses: `actions/create-github-app-token@${pinnedActions["actions/create-github-app-token"]}`,
    with: {
      "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
      "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
      "permission-actions": "write",
    },
  });
  expect(token?.with?.["permission-contents"]).toBeUndefined();
  expect(dispatch?.run).toContain("automation-writer.yml --ref main");
  expect(dispatch?.run).toContain("mode=verify-publisher");
  expect(dispatch?.env?.REQUEST_RUN_ID).toBe("${{ github.run_id }}");
  expect(JSON.stringify(job)).not.toMatch(/git (?:push|commit|rebase)/u);
});

test("uses the Publisher App identity for every protected workflow dispatch", async () => {
  const protectedTargets = new Set(
    Object.keys(protectedPublisherJobs).map((name) => `${name}.yml`),
  );
  const dispatches: string[] = [];

  for (const file of await readdir(workflowDirectory)) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const document = parse(
      await readFile(resolve(workflowDirectory, file), "utf8"),
    ) as {
      jobs: Record<
        string,
        {
          environment?: string;
          steps?: Array<{
            id?: string;
            uses?: string;
            run?: string;
            env?: Record<string, string>;
            with?: Record<string, string>;
          }>;
        }
      >;
    };

    for (const [jobName, job] of Object.entries(document.jobs)) {
      for (const step of job.steps ?? []) {
        const targets = workflowDispatchTargets(step);
        for (const target of targets) {
          expect(target, `${file}:${jobName}`).toMatch(
            /^[A-Za-z0-9._-]+\.ya?ml$/u,
          );
          if (!protectedTargets.has(target)) continue;
          dispatches.push(`${file}:${jobName}->${target}`);
          expect(job.environment, `${file}:${jobName}`).toBe("publisher");
          const tokenExpression = step.env?.GH_TOKEN;
          const tokenId = tokenExpression?.match(
            /^\$\{\{ steps\.([a-z0-9-]+)\.outputs\.token \}\}$/u,
          )?.[1];
          expect(tokenId, `${file}:${jobName}->${target}`).toBeTruthy();
          const tokenStep = job.steps?.find(({ id }) => id === tokenId);
          expect(tokenStep?.uses, `${file}:${jobName}->${target}`).toBe(
            `actions/create-github-app-token@${pinnedActions["actions/create-github-app-token"]}`,
          );
          expect(
            tokenStep?.with?.["permission-actions"],
            `${file}:${jobName}->${target}`,
          ).toBe("write");
        }
      }
    }
  }

  expect(dispatches.sort()).toEqual(
    [
      "admit-issue.yml:admit->apply-kit-withdrawal.yml",
      "apply-kit-submission.yml:publish->apply-kit-submission.yml",
      "apply-kit-withdrawal.yml:withdraw->apply-kit-withdrawal.yml",
      "automation-prepared.yml:wake->automation-writer.yml",
      "backfill-repository-identities.yml:backfill->automation-writer.yml",
      "publisher-verification.yml:verify->automation-writer.yml",
      "publisher-automation-branch-verification.yml:verify->automation-writer.yml",
      "import-tavernkeeper-reports.yml:import->import-tavernkeeper-reports.yml",
      "import-tavernkeeper-reports.yml:import->automation-writer.yml",
      "publish-project-transaction.yml:publish->review-catalog-policy.yml",
      "reconcile-automation.yml:reconcile->automation-writer.yml",
      "refresh-catalog.yml:refresh->refresh-catalog.yml",
      "review-catalog-policy.yml:review->automation-writer.yml",
      "targeted-tavernkeeper-scan.yml:request->refresh-catalog.yml",
      "triage-kit-submission.yml:validate->apply-kit-submission.yml",
    ].sort(),
  );
});

test.each([
  "git push origin main",
  "git push origin main:main",
  "git push origin feature:main",
  "git push origin +HEAD:main",
  "git push origin :main",
  "git push origin HEAD:refs/heads/main",
  "git push origin \\" + "\n    HEAD:main",
  "gh api --method PATCH repos/example/project/git/refs/heads/main",
  "gh api --method POST repos/example/project/git/refs -f ref=refs/heads/main",
  "gh api --method PUT repos/example/project/contents/file -f branch=main",
  'gh api graphql -f query="mutation { updateRef(ref: \\"refs/heads/main\\") }"',
])("detects direct main writer escape form: %s", (run) => {
  expect(stepWritesMain({ run })).toBe(true);
});

test.each([
  {
    run: "gh api --method POST repos/example/project/actions/workflows/refresh-catalog.yml/dispatches -f ref=main",
  },
  {
    run: 'curl -X POST "https://api.github.com/repos/example/project/actions/workflows/refresh-catalog.yml/dispatches"',
  },
  {
    uses: "example/workflow-dispatch@0123456789012345678901234567890123456789",
    with: { workflow: "refresh-catalog.yml" },
  },
])("detects protected dispatch escape form: %#", (step) => {
  expect(
    workflowDispatchTargets(step).filter(
      (target) => target === "refresh-catalog.yml",
    ),
  ).toEqual(["refresh-catalog.yml"]);
});

test.each([
  'gh workflow run "$WORKFLOW"',
  "gh api --method POST repos/example/project/actions/workflows/12345/dispatches -f ref=main",
])("rejects nonliteral workflow dispatch target: %s", (run) => {
  for (const target of workflowDispatchTargets({ run })) {
    expect(target).not.toMatch(/^[A-Za-z0-9._-]+\.ya?ml$/u);
  }
});

test("verifies advisory checkout SHAs against main before minting a Publisher token", async () => {
  const document = await workflow("review-catalog-policy");
  const steps = document.jobs.review.steps as Array<{
    name?: string;
    run?: string;
  }>;
  const verifyIndex = steps.findIndex(
    ({ name }) => name === "Verify exact published state",
  );
  const tokenIndex = steps.findIndex(
    ({ name }) => name === "Create fresh Publisher dispatch token",
  );
  const checkoutIndex = steps.findIndex(
    ({ name }) => name === "Check out trusted current request code",
  );
  const verification = steps[verifyIndex]?.run ?? "";

  expect(verifyIndex).toBeGreaterThanOrEqual(0);
  expect(verifyIndex).toBeLessThan(tokenIndex);
  expect(checkoutIndex).toBeLessThan(verifyIndex);
  expect(verification).toContain("pulls/$PULL_NUMBER");
  expect(verification).toContain("compare/${MERGE_SHA}...main");
  expect(verification).toContain('"ahead"');
  expect(verification).toContain('"identical"');
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
  expect(source).toContain("(.schema_version == 2 or .schema_version == 3)");
  expect(source).toContain("public V2 or V3 target manifest");
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
      contents: "read",
      issues: "write",
      actions: "write",
    });
    expect(document.concurrency).toEqual({
      group: "kit-registry",
      "cancel-in-progress": false,
    });
  }
  for (const source of [publicationSource, withdrawalSource]) {
    expect(source).toContain("node scripts/automation/preparation-request.mjs");
    expect(source).toContain(
      "node scripts/automation/catalog-preparation-cli.mjs",
    );
    expect(source).not.toMatch(
      /git push|git rebase|gh issue close|workflow run deploy-pages/,
    );
  }
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

test("Kit entrypoints bind data preparation to one immutable operation and leave publication to the shared writer", async () => {
  for (const [name, requestJob] of [
    ["apply-kit-submission", "publish"],
    ["apply-kit-withdrawal", "withdraw"],
  ]) {
    const document = await workflow(name);
    const request = document.jobs[requestJob];
    expect(request.permissions.contents).toBe("read");
    expect(
      request.steps.find((step: WorkflowStep) => step.id === "request").run,
    ).toBe("node scripts/automation/preparation-request.mjs");
    const producer = document.jobs.prepare;
    expect(producer["timeout-minutes"]).toBe(45);
    expect(Object.values(producer.permissions)).not.toContain("write");
    expect(producer.steps[0].with.ref).toBe("${{ github.sha }}");
    expect(producer.steps[0].with["persist-credentials"]).toBe(false);
    const artifact = producer.steps.find((step: WorkflowStep) =>
      step.with?.name?.startsWith("automation-prepared-"),
    );
    expect(artifact.with.path).toBe(
      "${{ runner.temp }}/automation-prepared/result.json",
    );
    expect(artifact.with["retention-days"]).toBe(90);
  }
});

test("runs Kit preparation requests from full main-branch history", async () => {
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
  const ci = await workflow("ci");
  const source = await readFile(resolve(workflowDirectory, "ci.yml"), "utf8");
  const route = ci.jobs.verify.steps.find(
    (step: WorkflowStep) => step.id === "route",
  ) as WorkflowStep;

  expect(route.env?.PR_HEAD_REF).toBe(
    "${{ github.event.pull_request.head.ref }}",
  );
  expect(route.run).toMatch(
    /if \[\[ "\$EVENT_NAME" == "pull_request" &&\s+"\$PR_HEAD_REPOSITORY" == "\$GITHUB_REPOSITORY" &&\s+"\$PR_HEAD_REF" == automation\/project-submission-\* \]\]; then\s+route="content"/u,
  );
  expect(route.run).toMatch(
    /elif \[\[ "\$EVENT_NAME" == "workflow_dispatch" &&\s+\("\$GITHUB_REF_NAME" == automation\/project-submission-\* \|\|\s+"\$GITHUB_REF_NAME" == automation\/project-owner-request-\*\) \]\]; then\s+:/u,
  );
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

test("keeps fork-spoofed generated pull requests on the full route", async () => {
  const ci = await workflow("ci");
  const route = ci.jobs.verify.steps.find(
    (step: WorkflowStep) => step.id === "route",
  ) as WorkflowStep;

  expect(route.env?.PR_HEAD_REPOSITORY).toBe(
    "${{ github.event.pull_request.head.repo.full_name }}",
  );
  expect(route.run).toContain('route="full"');
  expect(route.run).toMatch(
    /"\$PR_HEAD_REPOSITORY" == "\$GITHUB_REPOSITORY" &&\s+"\$PR_HEAD_REF" == automation\/project-submission-\*/u,
  );
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

test("the final serialized Pages guard uses this run's exact manifest and fresh authoritative main", async () => {
  const deploy = await workflow("deploy-pages");
  const build = deploy.jobs.build.steps as Array<{
    name?: string;
    run?: string;
    uses?: string;
    with?: Record<string, unknown>;
    env?: Record<string, string>;
  }>;
  const steps = deploy.jobs.deploy.steps as Array<{
    name?: string;
    run?: string;
    uses?: string;
    if?: string;
  }>;
  const guard = steps.findIndex(
    (step) =>
      step.name === "Recheck fresh main and confirmed deployment ancestry",
  );
  const publication = steps.findIndex(
    (step) => step.name === "Deploy GitHub Pages",
  );
  expect(guard).toBeGreaterThan(-1);
  expect(publication).toBe(guard + 1);
  expect(steps[guard].run).toContain("git fetch --no-tags origin main");
  expect(steps[guard].run).toContain("deployment-gate.mjs");
  expect(steps[publication].if).toBe("steps.guard.outputs.action == 'deploy'");
  expect(deploy.jobs.deploy.permissions).toEqual({
    contents: "read",
    actions: "read",
    pages: "write",
    "id-token": "write",
  });
  expect(
    build.find((step) => step.name === "Retain revision integrity metadata")
      ?.with,
  ).toMatchObject({ path: "out/revision.json", "retention-days": 90 });
  expect(
    build.find((step) => step.name === "Verify static export")?.env,
  ).toHaveProperty("TAVERNARY_EXPECTED_SOURCE_SHA");
  const comparison = build.find(
    (step) => step.name === "Compare public and built TavernKeeper targets",
  )?.run;
  expect(comparison).not.toContain('exit "$read_status"');
  expect(comparison).toContain("if (( read_status != 0 )); then");
});

test("content deployment uses focused checks while implementation changes retain the full gate", async () => {
  const deploy = await workflow("deploy-pages");
  const steps = deploy.jobs.build.steps as Array<{
    id?: string;
    run?: string;
    if?: string;
  }>;
  expect(steps.find((step) => step.id === "route")?.run).toContain(
    "scripts/ci/classify-deployment.mjs",
  );
  expect(steps.find((step) => step.run === "npm run check:content")?.if).toBe(
    "steps.route.outputs.route == 'content'",
  );
  expect(steps.find((step) => step.run === "npm run check")?.if).toBe(
    "steps.route.outputs.route != 'content'",
  );
  expect(deploy.jobs["confirm-public"]).toBeDefined();
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

test("report preparation remains independent while TavernKeeper wakes after a changed public deployment", async () => {
  const reportImport = await workflow("import-tavernkeeper-reports");
  const deploy = await workflow("deploy-pages");
  const deploySource = await readFile(
    resolve(workflowDirectory, "deploy-pages.yml"),
    "utf8",
  );
  const wakeSteps = deploy.jobs["wake-tavernkeeper"].steps as Array<{
    name?: string;
    if?: string;
    run?: string;
    "continue-on-error"?: boolean;
  }>;
  const wake = wakeSteps.find(
    (step) => step.name === "Wake TavernKeeper reconciliation (best effort)",
  );
  const token = wakeSteps.find(
    (step) => step.name === "Create destination-only TavernKeeper token",
  );
  expect(reportImport.on.schedule).toEqual([{ cron: "41 */6 * * *" }]);
  expect(
    reportImport.on.workflow_dispatch.inputs.retry_report_digest,
  ).toMatchObject({ required: false, type: "string" });
  expect(reportImport.on.workflow_dispatch.inputs.budget_ticket).toMatchObject({
    required: false,
    type: "string",
  });
  expect(reportImport.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
  });
  expect(
    reportImport.jobs.import.steps.some(exposesModelProviderEnvironment),
  ).toBe(false);
  expect(reportImport.jobs.prepare["timeout-minutes"]).toBe(45);
  const producer = reportImport.jobs.prepare.steps.find(
    (step: WorkflowStep) => step.id === "prepare",
  );
  expect(producer.env.TAVERNARY_REQUIRE_MODEL_BUDGET).toBe("true");
  for (const key of modelProviderEnvironmentKeys.filter(
    (key) => key !== "UTILITY_REASONING_EFFORT",
  )) {
    expect(producer.env[key]).toBe(
      "${{ inputs.budget_ticket != '' && secrets." + key + " || '' }}",
    );
  }
  expect(deploy.jobs["wake-tavernkeeper"].needs).toEqual(["build", "deploy"]);
  expect(deploy.jobs["wake-tavernkeeper"].permissions).toEqual({
    contents: "read",
  });
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

test("report import uses immutable preparation and shared publication instead of a second main writer or deploy chain", async () => {
  const reportImport = await workflow("import-tavernkeeper-reports");
  const source = await readFile(
    resolve(workflowDirectory, "import-tavernkeeper-reports.yml"),
    "utf8",
  );
  expect(reportImport.jobs.deploy).toBeUndefined();
  expect(reportImport.jobs.continue).toBeUndefined();
  expect(source).not.toMatch(/git (?:add|commit|rebase|push)\b/u);
  expect(source).not.toContain("gh workflow run deploy-pages.yml");
  expect(source).toContain("node scripts/automation/preparation-request.mjs");
  expect(source).toContain(
    "node scripts/automation/catalog-preparation-cli.mjs",
  );
  expect(source).toContain("automation-prepared-${{ inputs.operation_key }}");
  expect(reportImport.concurrency).toEqual({
    group:
      "tavernkeeper-report-import-${{ inputs.operation_key || 'request' }}",
    "cancel-in-progress": false,
  });
});

test("daily refresh preserves the existing manual modes and bounded baseline input", async () => {
  const refresh = await workflow("refresh-catalog");
  expect(refresh.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
  });
  expect(refresh.concurrency).toEqual({
    group: "catalog-refresh-${{ inputs.operation_key || 'request' }}",
    "cancel-in-progress": false,
  });
  const inputs = refresh.on.workflow_dispatch.inputs;
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
  expect(
    refresh.jobs.prepare.steps.some((step: WorkflowStep) =>
      step.run?.includes("catalog-preparation-cli.mjs"),
    ),
  ).toBe(true);
  expect(
    refresh.jobs.refresh.steps.some((step: WorkflowStep) =>
      step.run?.includes("preparation-request.mjs"),
    ),
  ).toBe(true);
});

test("enrichment prepares one read-only checkpoint after a separate owner request", async () => {
  const enrich = await workflow("enrich-catalog");
  const request = await workflow("request-catalog-enrichment");
  const source = await readFile(
    resolve(workflowDirectory, "enrich-catalog.yml"),
    "utf8",
  );
  expect(Object.keys(enrich.jobs)).toEqual(["prepare"]);
  expect(Object.keys(enrich.on.workflow_dispatch.inputs)).toEqual([
    "operation_key",
    "budget_ticket",
  ]);
  expect(enrich.on.workflow_dispatch.inputs.operation_key.required).toBe(true);
  expect(enrich.permissions).toEqual({
    contents: "read",
    actions: "read",
    issues: "read",
    "pull-requests": "read",
  });
  expect(enrich.concurrency).toEqual({
    group: "catalog-enrichment-preparation",
    "cancel-in-progress": false,
  });
  expect(enrich.jobs.prepare["timeout-minutes"]).toBe(45);
  expect(enrich.jobs.prepare.if.replace(/\s+/gu, " ").trim()).toBe(
    "inputs.operation_key != '' && github.ref == 'refs/heads/main' && github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
  );
  expect(source).toContain(
    "node scripts/automation/catalog-preparation-cli.mjs",
  );
  expect(source).toContain('TAVERNARY_REQUIRE_MODEL_BUDGET: "true"');
  expect(source).not.toMatch(
    /catalog:enrichment-rollout|create-github-app-token|git push|permission-contents/u,
  );
  expect(request.jobs.request["timeout-minutes"]).toBe(5);
  expect(request.jobs.request.if).toBe(
    "github.ref == 'refs/heads/main' && github.actor_id == 2625904",
  );
  expect(request.on.workflow_dispatch.inputs.enrichment_scope.options).toEqual([
    "pending",
    "all-automatic",
  ]);
  expect(request.on.workflow_dispatch.inputs.model_concurrency.default).toBe(2);
  expect(JSON.stringify(request)).not.toContain("secrets.");
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
  const generationJob = generation.jobs.generate as {
    env?: Record<string, string>;
    steps: Array<{ name?: string; env?: Record<string, string>; run?: string }>;
  };
  const modelStep = generationJob.steps.find(
    (step) => step.name === "Regenerate declared project files",
  );
  const installEvidenceStep = generationJob.steps.find(
    (step) => step.name === "Generate install evidence",
  );

  expect(generation.permissions).toEqual({
    contents: "read",
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
  expect(exposesModelProviderEnvironment(generationJob)).toBe(false);
  expect(modelStep?.env).toMatchObject(modelProviderEnvironment);
  expect(
    generationJob.steps
      .filter((step) => step !== modelStep)
      .some(exposesModelProviderEnvironment),
  ).toBe(false);
  expect(source.match(/secrets\.UTILITY_API_KEY/gu)).toHaveLength(1);
  expect(source.match(/secrets\.TAVERNARY_ENRICHMENT_API_KEY/gu)).toHaveLength(
    1,
  );
  expect(source).toContain("git push --force-with-lease=");
  expect(source).not.toContain("git rebase origin/main");
  expect(source).toContain(
    'node scripts/submissions/reset-project-submission-branch.mjs --branch "$BRANCH"',
  );
  expect(source).toContain('git config user.name "Tavernary Publisher"');
  expect(source).toContain(
    'git config user.email "tavernary-publisher[bot]@users.noreply.github.com"',
  );
  expect(
    source.indexOf('git config user.name "Tavernary Publisher"'),
  ).toBeLessThan(
    source.indexOf(
      "node scripts/submissions/reset-project-submission-branch.mjs",
    ),
  );
  expect(source).toContain("previous-generated-paths.txt");
  const existingPrRegeneration = source.indexOf(
    'if [[ -n "$PR_NUMBER" && -n "$REMOTE_SHA" && -n "$MARKER_SHA" ]]; then',
  );
  const branchReset = source.indexOf(
    "node scripts/submissions/reset-project-submission-branch.mjs",
    existingPrRegeneration,
  );
  const markerCleanup = source.indexOf(
    "while IFS= read -r generated_path; do",
    existingPrRegeneration,
  );
  expect(existingPrRegeneration).toBeGreaterThanOrEqual(0);
  expect(branchReset).toBeGreaterThan(existingPrRegeneration);
  expect(branchReset).toBeLessThan(markerCleanup);
  expect(source).toContain("Refusing unsafe generated path");
  expect(source).toContain("Prepare generated path set");
  expect(installEvidenceStep?.run).toContain(
    "npm run catalog:install-evidence:backfill",
  );
  expect(installEvidenceStep?.run).toContain('--source-id "$source_id"');
  expect(source).toContain(
    'generated_paths+=("data/snapshots/install/${source_id}.json")',
  );
  expect(
    generationJob.steps.findIndex(
      (step) => step.name === "Generate install evidence",
    ),
  ).toBeLessThan(
    generationJob.steps.findIndex(
      (step) => step.name === "Validate proposed catalog and card",
    ),
  );
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
    '--failure-diagnostic-path "${RUNNER_TEMP}/project-submission-generation-failure.json"',
  );
  expect(source).toContain(
    "REDDIT_RETRY_STATE_PATH: ${{ runner.temp }}/project-submission-retry-state.json",
  );
  expect(source).toContain(
    "GENERATION_DIAGNOSTIC_PATH: ${{ runner.temp }}/project-submission-generation-failure.json",
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
    contents: "read",
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
  expect(source).toContain("/menu/manage-project/");
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
  const generationJob = generation.jobs.generate as {
    env?: Record<string, string>;
    steps: Array<{
      name?: string;
      env?: Record<string, string>;
      run?: string;
    }>;
  };
  const modelStep = generationJob.steps.find(
    (step) => step.name === "Generate from latest main and issue state",
  );
  const replayStep = generationJob.steps.find(
    (step) =>
      step.name === "Regenerate final owner state before branch mutation",
  );

  expect(generation.permissions).toEqual({
    contents: "read",
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
  expect(exposesModelProviderEnvironment(generationJob)).toBe(false);
  expect(modelStep?.env).toMatchObject(modelProviderEnvironment);
  expect(exposesModelProviderEnvironment(replayStep ?? {})).toBe(false);
  expect(
    generationJob.steps
      .filter((step) => step !== modelStep)
      .some(exposesModelProviderEnvironment),
  ).toBe(false);
  expect(source.match(/secrets\.UTILITY_API_KEY/gu)).toHaveLength(1);
  expect(source.match(/secrets\.TAVERNARY_ENRICHMENT_API_KEY/gu)).toHaveLength(
    1,
  );
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
  expect(modelStep?.run).not.toContain("git rebase origin/main");
  expect(modelStep?.run).toContain('git checkout -B "$BRANCH" origin/main');
  expect(source).toContain(
    "Reclaiming issue-owned orphan branch at exact remote SHA",
  );
  expect(source).toContain("allowOrphanRecovery: !existingPull");
  expect(source).not.toContain(
    "Owner request branch exists without an open marked PR.",
  );
  expect(source).toMatch(
    /if \[\[ -n "\$PR_NUMBER" &&[\s\S]*"\$REMOTE_SHA" != "\$MARKER_SHA"/u,
  );
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
  expect(source).toContain(
    "git restore -- public/catalog/tavernary-catalog.json public/catalog/tavernary-catalog-v8.json",
  );
  expect(source).not.toContain("git clean -fX -- src/generated/catalog.json");
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
    contents: "read",
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
  expect(source).toContain('`close_reason=${plan.closeReason ?? ""}`');
  expect(source).toContain('if [[ -n "$CLOSE_REASON" ]]');
  expect(source).toContain('-f state_reason="$CLOSE_REASON"');
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
  expect(admission.on.workflow_dispatch.inputs.issue_number).toMatchObject({
    description: "Issue number to re-run admission for",
    required: true,
    type: "number",
  });
  expect(admission.permissions).toEqual({
    contents: "read",
    issues: "write",
    actions: "write",
  });
  expect(admission.concurrency).toEqual({
    group:
      "issue-admission-${{ inputs.issue_number || github.event.issue.number }}",
    "cancel-in-progress": false,
  });
  expect(admission["run-name"]).toBe(
    "Issue #${{ inputs.issue_number || github.event.issue.number }}: Check submission eligibility",
  );
  expect(source).toContain("node scripts/submissions/admit-issue.mjs");
  expect(source).toContain(
    "ISSUE_NUMBER: ${{ inputs.issue_number || github.event.issue.number }}",
  );
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
      ignore?: Array<{
        "dependency-name": string;
        "update-types"?: string[];
      }>;
    }>;
  };
  const npm = dependabot.updates.find(
    (update) => update["package-ecosystem"] === "npm",
  );
  const actions = dependabot.updates.find(
    (update) => update["package-ecosystem"] === "github-actions",
  );

  expect(npm?.groups?.react.patterns).toEqual([
    "react",
    "react-dom",
    "@types/react",
    "@types/react-dom",
  ]);
  expect(npm?.ignore).toContainEqual({
    "dependency-name": "eslint",
    "update-types": ["version-update:semver-major"],
  });
  expect(actions?.groups?.actions.patterns).toEqual(["*"]);
});

test("does not schedule the retired support usage publication", async () => {
  expect(await readdir(workflowDirectory)).not.toContain(
    "publish-openai-usage.yml",
  );
});
