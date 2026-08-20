import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";
import { parse } from "yaml";

import { planGeneratedProjectBranchCleanup } from "../../scripts/security/generated-branch-custody.mjs";

const repository = "MentallyQuill/Tavernary";
const headSha = "a".repeat(40);
const workflowDirectory = resolve(".github/workflows");
const publisherTokenAction =
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1";
const publisherCallerCondition =
  "github.ref == 'refs/heads/main' && " +
  "(github.actor_id == 2625904 || " +
  "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID)";

type WorkflowStep = {
  id?: string;
  if?: string;
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};

async function workflow(name: string) {
  return parse(
    await readFile(resolve(workflowDirectory, `${name}.yml`), "utf8"),
  );
}

function normalizedExpression(value: string | undefined) {
  return value?.replace(/\s+/gu, " ").trim();
}

function pull(overrides: Record<string, unknown> = {}) {
  return {
    number: 72,
    state: "closed",
    head: {
      ref: "automation/project-submission-72",
      sha: headSha,
      repo: { full_name: repository },
    },
    base: {
      ref: "main",
      repo: { full_name: repository },
    },
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    repository,
    defaultBranch: "main",
    pullNumber: 72,
    expectedBranch: "automation/project-submission-72",
    expectedHeadSha: headSha,
    currentHeadSha: headSha,
    pull: pull(),
    ...overrides,
  };
}

describe("generated project branch cleanup", () => {
  test("deletes only the unchanged head of an exact closed submission PR", () => {
    expect(planGeneratedProjectBranchCleanup(input())).toEqual({
      action: "delete",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("accepts the numeric owner-request namespace", () => {
    const branch = "automation/project-owner-request-290";
    expect(
      planGeneratedProjectBranchCleanup(
        input({
          expectedBranch: branch,
          pull: pull({
            head: {
              ref: branch,
              sha: headSha,
              repo: { full_name: repository },
            },
          }),
        }),
      ),
    ).toEqual({ action: "delete", branch, expectedHeadSha: headSha });
  });

  test("normalizes hexadecimal SHA case", () => {
    expect(
      planGeneratedProjectBranchCleanup(
        input({
          expectedHeadSha: headSha.toUpperCase(),
          currentHeadSha: headSha.toUpperCase(),
        }),
      ),
    ).toEqual({
      action: "delete",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("treats an already absent branch as an idempotent no-op", () => {
    expect(
      planGeneratedProjectBranchCleanup(input({ currentHeadSha: null })),
    ).toEqual({
      action: "absent",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
    });
  });

  test("preserves a branch that moved after pull-request closure", () => {
    expect(
      planGeneratedProjectBranchCleanup(
        input({ currentHeadSha: "b".repeat(40) }),
      ),
    ).toEqual({
      action: "moved",
      branch: "automation/project-submission-72",
      expectedHeadSha: headSha,
      currentHeadSha: "b".repeat(40),
    });
  });

  test.each([
    ["an open pull request", { pull: pull({ state: "open" }) }, "closed"],
    [
      "a foreign head repository",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-72",
            sha: headSha,
            repo: { full_name: "attacker/Tavernary" },
          },
        }),
      },
      "head repository",
    ],
    [
      "a foreign base repository",
      {
        pull: pull({
          base: { ref: "main", repo: { full_name: "attacker/Tavernary" } },
        }),
      },
      "base repository",
    ],
    [
      "a non-default base branch",
      {
        pull: pull({
          base: { ref: "release", repo: { full_name: repository } },
        }),
      },
      "default branch",
    ],
    ["a different pull request", { pull: pull({ number: 73 }) }, "number"],
    [
      "a mismatched head branch",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-73",
            sha: headSha,
            repo: { full_name: repository },
          },
        }),
      },
      "head branch",
    ],
    [
      "a mismatched head SHA",
      {
        pull: pull({
          head: {
            ref: "automation/project-submission-72",
            sha: "c".repeat(40),
            repo: { full_name: repository },
          },
        }),
      },
      "head SHA",
    ],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() => planGeneratedProjectBranchCleanup(input(overrides))).toThrow(
      message,
    );
  });

  test.each([
    "automation/project-submission-0",
    "automation/project-submission-72/extra",
    "automation/project-owner-request-canary",
    "feat/project-submission-72",
    "automation/project-submission-72%2Fextra",
  ])("rejects non-production generated branch %s", (expectedBranch) => {
    expect(() =>
      planGeneratedProjectBranchCleanup(input({ expectedBranch })),
    ).toThrow("generated project branch");
  });

  test.each(["a".repeat(39), "g".repeat(40), `${headSha};echo unsafe`, ""])(
    "rejects malformed expected SHA %s",
    (expectedHeadSha) => {
      expect(() =>
        planGeneratedProjectBranchCleanup(input({ expectedHeadSha })),
      ).toThrow("expected head SHA");
    },
  );

  test("rejects a malformed current ref SHA", () => {
    expect(() =>
      planGeneratedProjectBranchCleanup(
        input({ currentHeadSha: `${headSha};echo unsafe` }),
      ),
    ).toThrow("current head SHA");
  });
});

describe("generated project branch workflow custody", () => {
  test.each(["generate-project-submission", "generate-project-owner-request"])(
    "uses the Publisher App as the Git writer and review PR author in %s",
    async (name) => {
      const document = await workflow(name);
      const job = document.jobs.generate as {
        if?: string;
        environment?: string;
        env?: Record<string, string>;
        steps: WorkflowStep[];
      };
      const token = job.steps.find((step) => step.id === "publisher-token");
      const checkout = job.steps.find((step) =>
        step.uses?.startsWith("actions/checkout@"),
      );
      const reviewPullRequest = job.steps.find((step) =>
        step.name?.startsWith("Create or update"),
      );
      const source = await readFile(
        resolve(workflowDirectory, `${name}.yml`),
        "utf8",
      );

      expect(document.permissions).toEqual({
        contents: "read",
        issues: "write",
        "pull-requests": "write",
        actions: "write",
      });
      expect(normalizedExpression(job.if)).toBe(publisherCallerCondition);
      expect(job.environment).toBe("publisher");
      expect(job.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
      expect(token).toMatchObject({
        uses: publisherTokenAction,
        with: {
          "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
          "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
          owner: "MentallyQuill",
          repositories: "Tavernary",
          "permission-contents": "write",
          "permission-pull-requests": "write",
        },
      });
      expect(checkout?.with?.token).toBe(
        "${{ steps.publisher-token.outputs.token }}",
      );
      expect(job.steps.indexOf(token as WorkflowStep)).toBeLessThan(
        job.steps.indexOf(checkout as WorkflowStep),
      );
      expect(reviewPullRequest?.env?.GH_TOKEN).toBe(
        "${{ steps.publisher-token.outputs.token }}",
      );
      expect(job.steps.indexOf(token as WorkflowStep)).toBeLessThan(
        job.steps.indexOf(reviewPullRequest as WorkflowStep),
      );
      expect(source).toContain('git config user.name "Tavernary Publisher"');
      expect(source).toContain(
        'git config user.email "tavernary-publisher[bot]@users.noreply.github.com"',
      );
      expect(source).not.toContain(
        'git config user.name "github-actions[bot]"',
      );
    },
  );

  test.each([
    "project-submission-lifecycle",
    "project-owner-request-lifecycle",
  ])(
    "leaves generated ref cleanup to trusted default-branch code in %s",
    async (name) => {
      const document = await workflow(name);
      const source = await readFile(
        resolve(workflowDirectory, `${name}.yml`),
        "utf8",
      );

      expect(document.permissions).toMatchObject({
        contents: "read",
        issues: "write",
        "pull-requests": "read",
      });
      expect(source).not.toContain(
        "gh workflow run generated-project-branch-cleanup.yml",
      );
      expect(source).not.toContain("git/refs/heads/${BRANCH}");
      expect(source).not.toContain("--method DELETE");
      expect(source).not.toContain("TAVERNARY_PUBLISHER_APP_PRIVATE_KEY");
    },
  );

  test("deletes a revalidated generated ref only with the Publisher token", async () => {
    const document = await workflow("generated-project-branch-cleanup");
    const job = document.jobs.cleanup as {
      if?: string;
      environment?: string;
      env?: Record<string, string>;
      steps: WorkflowStep[];
    };
    const plan = job.steps.find((step) => step.id === "plan");
    const token = job.steps.find((step) => step.id === "publisher-token");
    const publisherCheckout = job.steps.find(
      (step) => step.name === "Install Publisher branch credential",
    );
    const deletion = job.steps.find(
      (step) => step.name === "Delete exact generated branch",
    );
    const source = await readFile(
      resolve(workflowDirectory, "generated-project-branch-cleanup.yml"),
      "utf8",
    );

    expect(Object.keys(document.on)).toEqual([
      "pull_request_target",
      "workflow_dispatch",
    ]);
    expect(document.on.pull_request_target).toEqual({
      branches: ["main"],
      types: ["closed"],
    });
    expect(document.on.workflow_dispatch.inputs).toEqual({
      pull_number: {
        description: "Closed generated pull request number",
        required: true,
        type: "number",
      },
      expected_branch: {
        description: "Exact generated branch to clean up",
        required: true,
        type: "string",
      },
      expected_head_sha: {
        description: "Exact closed pull request head SHA",
        required: true,
        type: "string",
      },
    });
    expect(document.permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    expect(job.if).toContain("github.event_name == 'pull_request_target'");
    expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
    expect(job.if).toContain("github.actor_id == 2625904");
    expect(job.if).toContain(
      "startsWith(github.event.pull_request.head.ref, 'automation/project-submission-')",
    );
    expect(job.if).toContain(
      "startsWith(github.event.pull_request.head.ref, 'automation/project-owner-request-')",
    );
    expect(job.environment).toBe("publisher");
    expect(job.env?.GH_TOKEN).toBe("${{ secrets.GITHUB_TOKEN }}");
    expect(plan?.run).toContain("generated-branch-custody.mjs");
    expect(plan?.run).toContain("planGeneratedProjectBranchCleanup");
    expect(plan?.run).toContain("default_branch");
    expect(plan?.run).toContain("(HTTP 404)");
    expect(plan?.run).not.toContain("2>/dev/null || true");
    expect(plan?.run).not.toContain(
      "defaultBranch: process.env.GITHUB_REF_NAME",
    );
    const tokenIndex = job.steps.indexOf(token as WorkflowStep);
    const trustedCheckouts = job.steps
      .slice(0, tokenIndex)
      .filter((step) => step.uses?.startsWith("actions/checkout@"));
    expect(tokenIndex).toBeGreaterThan(job.steps.indexOf(plan as WorkflowStep));
    expect(trustedCheckouts).not.toHaveLength(0);
    for (const checkout of trustedCheckouts) {
      expect(checkout.with?.ref).toBe("main");
      expect(JSON.stringify(checkout.with)).not.toContain(
        "github.event.pull_request.head",
      );
    }
    expect(token).toMatchObject({
      uses: publisherTokenAction,
      with: {
        "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
        "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
        owner: "MentallyQuill",
        repositories: "Tavernary",
        "permission-contents": "write",
      },
    });
    expect(token?.if).toBe("steps.plan.outputs.action == 'delete'");
    expect(publisherCheckout).toMatchObject({
      if: "steps.plan.outputs.action == 'delete'",
      with: { token: "${{ steps.publisher-token.outputs.token }}" },
    });
    expect(deletion).toMatchObject({
      if: "steps.plan.outputs.action == 'delete'",
    });
    expect(deletion?.run).toContain(
      'git push --force-with-lease="refs/heads/$BRANCH:$EXPECTED_SHA"',
    );
    expect(deletion?.run).toContain('origin ":refs/heads/$BRANCH"');
    expect(deletion?.env).not.toHaveProperty("GH_TOKEN");
    expect(source.match(/TAVERNARY_PUBLISHER_APP_PRIVATE_KEY/gu)).toHaveLength(
      1,
    );
  });

  test("reserves an App-owned create-update-delete branch canary", async () => {
    const document = await workflow("publisher-automation-branch-verification");
    const job = document.jobs.verify as {
      if?: string;
      environment?: string;
      steps: WorkflowStep[];
    };
    const token = job.steps.find((step) => step.id === "publisher-token");
    const verify = job.steps.find(
      (step) => step.name === "Verify Publisher automation branch custody",
    );

    expect(document.on.workflow_dispatch).toBeNull();
    expect(document.permissions).toEqual({ contents: "read" });
    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' && github.actor_id == 2625904",
    );
    expect(job.environment).toBe("publisher");
    expect(token).toMatchObject({
      uses: publisherTokenAction,
      with: {
        "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
        "private-key": "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
        owner: "MentallyQuill",
        repositories: "Tavernary",
        "permission-contents": "write",
      },
    });
    expect(verify?.env).toEqual({
      GH_TOKEN: "${{ steps.publisher-token.outputs.token }}",
    });
    expect(verify?.run).toContain("branch=automation/project-submission-0");
    expect(verify?.run).toContain("trap cleanup EXIT");
    expect(verify?.run).toContain("/git/commits");
    expect(verify?.run).toContain("--method POST");
    expect(verify?.run).toContain("--method PATCH");
    expect(verify?.run).toContain("-F force=false");
    expect(verify?.run).toContain("published_sha");
    expect(verify?.run).toContain("--method DELETE");
  });

  test("never auto-publishes the reserved branch canary", async () => {
    const continuousIntegration = await workflow("ci");
    expect(
      continuousIntegration.jobs["dispatch-project-publication"].if,
    ).toContain("github.ref_name != 'automation/project-submission-0'");
  });

  test("dispatches every privileged generator with a Publisher token", async () => {
    const workflowNames = (await readdir(workflowDirectory))
      .filter((name) => /\.ya?ml$/u.test(name))
      .map((name) => name.replace(/\.ya?ml$/u, ""));
    const privilegedTargets = [
      "generate-project-submission.yml",
      "generate-project-owner-request.yml",
    ];
    const callers: string[] = [];

    for (const name of workflowNames) {
      const document = await workflow(name);
      for (const [jobName, rawJob] of Object.entries(document.jobs ?? {})) {
        const job = rawJob as {
          environment?: string;
          steps?: WorkflowStep[];
        };
        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          const targets = privilegedTargets.filter((candidate) =>
            step.run?.includes(`gh workflow run ${candidate}`),
          );
          if (targets.length === 0) continue;

          const tokenReference = step.env?.GH_TOKEN?.match(
            /^\$\{\{ steps\.([a-z0-9-]+)\.outputs\.token \}\}$/u,
          )?.[1];
          const tokenIndex = (job.steps ?? []).findIndex(
            (candidate) => candidate.id === tokenReference,
          );
          const token = job.steps?.[tokenIndex];

          expect(job.environment).toBe("publisher");
          expect(tokenReference).toBeTruthy();
          expect(tokenIndex).toBeGreaterThanOrEqual(0);
          expect(tokenIndex).toBeLessThan(stepIndex);
          expect(token).toMatchObject({
            uses: publisherTokenAction,
            with: {
              "client-id": "${{ vars.TAVERNARY_PUBLISHER_CLIENT_ID }}",
              "private-key":
                "${{ secrets.TAVERNARY_PUBLISHER_APP_PRIVATE_KEY }}",
              "permission-actions": "write",
            },
          });
          for (const target of targets) {
            callers.push(`${name}:${jobName}:${target}`);
          }
        }
      }
    }

    expect(callers.sort()).toEqual([
      "publish-project-transaction:publish:generate-project-owner-request.yml",
      "publish-project-transaction:publish:generate-project-submission.yml",
      "triage-project-owner-request:validate:generate-project-owner-request.yml",
      "triage-submission:validate:generate-project-submission.yml",
    ]);
  });

  test.each(["triage-submission", "triage-project-owner-request"])(
    "permits only owner or Publisher callers into %s",
    async (name) => {
      const document = await workflow(name);
      expect(normalizedExpression(document.jobs.validate.if)).toBe(
        publisherCallerCondition,
      );
    },
  );

  test("admits public issue events but reserves manual Publisher dispatch for the owner", async () => {
    const document = await workflow("admit-issue");
    const job = document.jobs.admit as {
      if?: string;
      steps: WorkflowStep[];
    };
    const token = job.steps.find(
      (step) => step.id === "publisher-dispatch-token",
    );

    expect(job.if).toBe(
      "github.ref == 'refs/heads/main' && " +
        "(github.event_name != 'workflow_dispatch' || github.actor_id == 2625904)",
    );
    expect(token?.if).toContain("steps.admission.outputs.route == 'project'");
    expect(token?.if).toContain(
      "steps.admission.outputs.route == 'project-owner'",
    );
    for (const target of [
      "triage-submission.yml",
      "triage-project-owner-request.yml",
    ]) {
      const dispatch = job.steps.find((step) => step.run?.includes(target));
      expect(dispatch?.env?.GH_TOKEN).toBe(
        "${{ steps.publisher-dispatch-token.outputs.token }}",
      );
    }
  });
});
