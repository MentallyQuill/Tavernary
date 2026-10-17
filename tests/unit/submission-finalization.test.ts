import { expect, test, vi } from "vitest";
import { loadGithubAutomationInventory } from "../../scripts/automation/github-inventory.mjs";
import {
  projectInventoryFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import * as finalization from "../../scripts/submissions/reconcile-submission-finalization.mjs";
import { kitInventoryFixture } from "../helpers/automation-fixtures";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { confirmationFixture } from "../helpers/confirmation-fixtures";
import { confirmDeployment } from "../../scripts/automation/confirm-deployment.mjs";
import { createActiveDeployment } from "../../scripts/automation/deployment-state.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

test("a successful automated closure followed by a failed receipt write can finish without closing twice", async () => {
  const f = await finalizationFixture();
  f.persist.mockRejectedValueOnce(new Error("Receipt parent advanced"));
  await expect(finalization.finalizeSubmissionTarget(f)).rejects.toThrow(
    "Receipt parent advanced",
  );
  expect(f.issue.state).toBe("closed");
  expect(await finalization.finalizeSubmissionTarget(f)).toEqual({
    status: "finalized",
  });
  expect(
    f.gh.mock.calls.filter(
      ([, body]) => body && JSON.parse(body).state === "closed",
    ),
  ).toHaveLength(1);
});

test.each(["publisher", "owner", "open", "foreign-route"])(
  "the %s closure event is restricted to the exact published submission",
  async (variant) => {
    const f = await finalizationFixture();
    const env = {
      GITHUB_REPOSITORY: f.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "issues",
      GITHUB_ACTOR_ID: String(f.state.publisherActorId),
      TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
      GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/reconcile-project-validations.yml@refs/heads/main`,
    };
    const issue = { ...f.issue, state: "closed" };
    if (variant === "owner") env.GITHUB_ACTOR_ID = "2625904";
    if (variant === "open") issue.state = "open";
    if (variant === "foreign-route") issue.labels = ["issue-admitted"];
    const load = vi.fn(async () => ({ ...f.state, operations: [] }));
    const gh = vi.fn();
    expect(
      await finalization.runSubmissionFinalizationCli({
        env,
        gh,
        load,
        event: { action: "closed", issue },
        confirmSite: async () => ({ status: "confirmed" }),
        write: vi.fn(),
      }),
    ).toBe(variant === "publisher" ? 0 : 1);
    expect(gh).not.toHaveBeenCalled();
    if (variant === "publisher")
      expect(load).toHaveBeenCalledWith({
        issueNumber: 42,
        operationKey: undefined,
      });
    else expect(load).not.toHaveBeenCalled();
  },
);

test("the existing completion workflow automatically wakes for Publisher-owned issue closure", () => {
  const workflow = parse(
    readFileSync(".github/workflows/reconcile-project-validations.yml", "utf8"),
  );
  expect(workflow.on.issues).toEqual({ types: ["closed"] });
  // A later issue closure must not replace another issue's pending receipt retry.
  expect(workflow.concurrency).toEqual({
    group:
      "${{ github.event_name == 'issues' && format('submission-finalization-{0}', github.event.issue.number) || 'submission-reconciliation' }}",
    "cancel-in-progress": false,
  });
  expect(workflow.jobs.reconcile.if).toContain("github.event_name == 'issues'");
  expect(workflow.jobs.reconcile.if).toContain(
    "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
  );
  const validation = workflow.jobs.reconcile.steps.find(
    (step: { run?: string }) =>
      step.run === "node scripts/submissions/reconcile-project-validations.mjs",
  );
  expect(validation.if).toBe("github.event_name != 'issues'");
});

async function finalizationFixture() {
  const site = confirmationFixture();
  const confirmed = await confirmDeployment(site.input);
  if (confirmed.status !== "confirmed")
    throw new Error("Invalid public proof fixture");
  const input = kitInventoryFixture({ canonicalPublished: true });
  const sourceSha = confirmed.deployment.sourceSha;
  const [operation] = discoverKitOperations({
    ...input,
    canonicalRevision: sourceSha,
    confirmedRevisions: [sourceSha],
  });
  const issue = {
    ...input.issues[0],
    labels: [...input.issues[0].labels, "human-label"],
    state_reason: null as string | null,
  };
  const deployment = { ...confirmed.deployment, workflowRunId: 42 };
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: site.input.nowMs,
    operations: [operation],
    receipts: [],
    remote: { issues: [issue], pulls: [], runs: [], mainHeadSha: sourceSha },
    local: {
      kits: input.kits,
      projects: input.projects,
      sources: Object.values(input.sourcesById),
      snapshots: [],
      blockedUsers: input.blockedUsers,
      revision: sourceSha,
      deployments: [deployment],
      activeDeployment: createActiveDeployment({
        deployment,
        confirmingRunId: 42,
        mode: "ordinary",
        nowMs: site.input.nowMs,
      }),
      catalogDigest: site.input.expected.catalogDigest,
      targetDigest: site.input.expected.targetDigest,
    },
  } as unknown as AutomationInventoryState;
  const persist = vi.fn(async (receipt) => {
    state.operations = [receipt.operation];
  });
  const gh = vi.fn(async (args: string[], stdin?: string) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    const method = args.includes("--method")
      ? args[args.indexOf("--method") + 1]
      : "GET";
    if (method === "GET") return JSON.stringify(issue);
    if (method === "DELETE")
      issue.labels = issue.labels.filter(
        (label) => label !== decodeURIComponent(path.split("/").at(-1)!),
      );
    else if (path.endsWith("/labels"))
      issue.labels.push(...JSON.parse(stdin!).labels);
    else Object.assign(issue, JSON.parse(stdin!));
    return JSON.stringify(issue);
  });
  return {
    state,
    operation,
    issue,
    gh,
    persist,
    load: async () => state,
    issueNumber: 42,
    isAncestor: (a: string, b: string) => a === b,
  };
}

test("a published Kit with no old receipt finalizes only with compatible accepted public proof and fresh lifecycle checks", async () => {
  const f = await finalizationFixture();
  expect(await finalization.finalizeSubmissionTarget(f)).toEqual({
    status: "finalized",
  });
  expect(f.issue.state).toBe("closed");
  expect(f.issue.labels).toContain("human-label");
  expect(f.issue.labels).toContain("kit-published");
  expect(f.issue.labels).not.toContain("kit-publication-ready");
  expect(f.persist).toHaveBeenCalledOnce();
  expect(f.persist.mock.calls[0][0].operation).toMatchObject({
    key: f.operation.key,
    stage: "finalized",
    expectedSha: f.operation.expectedSha,
  });
});

test.each([
  "requested",
  "catalog",
  "targets",
  "withdrawal",
  "retry",
  "owner",
  "manifest",
])(
  "%s cannot turn a published submission into a false terminal receipt",
  async (variant) => {
    const f = await finalizationFixture();
    if (variant === "requested") {
      f.state.local.activeDeployment = null;
      f.state.local.deployments = [
        { sourceSha: f.operation.expectedSha, status: "requested" },
      ];
    }
    if (variant === "catalog") f.state.local.catalogDigest = "f".repeat(64);
    if (variant === "targets") f.state.local.targetDigest = "f".repeat(64);
    if (variant === "withdrawal")
      (f.state.local.kits as Array<{ status: string }>)[0].status = "withdrawn";
    if (variant === "retry") {
      f.operation.retry = {
        failure: { kind: "transient", reasonCode: "provider-unavailable" },
        transientAttempts: 2,
        immediateAttempts: 0,
      };
      f.operation.nextEligibleAt = new Date(
        f.state.nowMs + 60000,
      ).toISOString();
    }
    if (variant === "owner") f.issue.user.id = 99;
    if (variant === "manifest")
      f.issue.body = f.issue.body.replace("Example Kit", "Changed Kit");
    const result = await finalization.finalizeSubmissionTarget(f);
    expect(["waiting", "superseded"]).toContain(result.status);
    expect(f.issue.state).toBe("open");
    expect(f.persist).not.toHaveBeenCalled();
  },
);

test("an unready scoped submission never falls back to broad background inventory", async () => {
  const input = projectInventoryFixture();
  const calls: string[] = [];
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find((value) => value.startsWith("repos/")) ?? "";
    calls.push(path);
    if (path.endsWith("/issues/42")) return JSON.stringify(input.issues[0]);
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "b".repeat(40) } });
    if (path.endsWith("/pulls")) return "[[]]";
    if (
      path.includes("/actions/workflows/generate-project-submission.yml/runs")
    )
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    throw new Error(`Broad inventory forbidden: ${path}`);
  });
  const remote = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [],
    nowMs: input.nowMs,
    submissionIssueNumber: 42,
  });
  expect(remote.issues).toEqual(input.issues);
  expect(remote.pulls).toEqual([]);
  expect(remote.runs).toEqual([]);
  expect(calls).not.toContain("repos/MentallyQuill/Tavernary/issues");
});

test("targeted native inventory retains an exact legacy worker handle without scanning background history", async () => {
  const input = projectInventoryFixture();
  const receipt = receiptFixture();
  receipt.operation.workerRunId = 700;
  const worker = {
    id: 700,
    path: ".github/workflows/automation-worker.yml",
    status: "pending",
    conclusion: null,
  };
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    if (path.endsWith("/issues/42")) return JSON.stringify(input.issues[0]);
    if (path.endsWith("/actions/runs/700")) return JSON.stringify(worker);
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "b".repeat(40) } });
    if (path.endsWith("/pulls")) return "[[]]";
    if (
      path.includes("/actions/workflows/generate-project-submission.yml/runs")
    )
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    throw new Error(`Broad native read forbidden: ${path}`);
  });
  const remote = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [receipt],
    nowMs: input.nowMs,
    submissionIssueNumber: 42,
  });
  expect(remote.runs).toEqual([worker]);
});

test("resolved-dependency inventory retains active triage and its recent retry clock", async () => {
  const input = projectInventoryFixture();
  input.issues[0].labels.push("waiting-on-fork-parent");
  const active = { id: 701, status: "pending", conclusion: null };
  const completed = { id: 700, status: "completed", conclusion: "failure" };
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find((value) => value.startsWith("repos/"))!;
    if (path.endsWith("/issues/42")) return JSON.stringify(input.issues[0]);
    if (path.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: "b".repeat(40) } });
    if (path.endsWith("/pulls")) return "[[]]";
    if (path.includes("/actions/workflows/"))
      return JSON.stringify([
        {
          workflow_runs: path.includes("/triage-submission.yml/")
            ? args.includes("status=pending")
              ? [active]
              : args.includes("status=completed")
                ? [completed]
                : []
            : [],
        },
      ]);
    throw new Error(`Unexpected query ${args}`);
  });
  const remote = await loadGithubAutomationInventory({
    gh,
    repository: "MentallyQuill/Tavernary",
    receipts: [],
    nowMs: input.nowMs,
    submissionIssueNumber: 42,
  });
  expect(remote.runs).toEqual([active, completed]);
  expect(
    gh.mock.calls.find(([args]) => args.includes("status=completed"))?.[0],
  ).toContain(`created=>=${new Date(input.nowMs - 86400000).toISOString()}`);
});

test.each(["proof", "actor", "workflow", "partial"])(
  "the native completion CLI preserves the %s boundary before lifecycle effects",
  async (variant) => {
    const load = vi.fn();
    const gh = vi.fn();
    const confirmSite = vi.fn(async () => ({ status: "waiting" }));
    const env = {
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      TAVERNARY_PUBLISHER_BOT_ID: "418982982",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/reconcile-project-validations.yml@refs/heads/main",
    };
    if (variant === "actor") env.GITHUB_ACTOR_ID = "99";
    if (variant === "workflow")
      env.GITHUB_WORKFLOW_REF = env.GITHUB_WORKFLOW_REF.replace(
        "reconcile-project-validations",
        "automation-writer",
      );
    const inputs =
      variant === "partial"
        ? { submission_operation_key: "a".repeat(64) }
        : { submission_issue_number: "42" };
    expect(
      await finalization.runSubmissionFinalizationCli({
        env,
        gh,
        load,
        event: { inputs },
        confirmSite,
        write: vi.fn(),
      }),
    ).toBe(variant === "proof" ? 0 : 1);
    expect(load).not.toHaveBeenCalled();
    expect(gh).not.toHaveBeenCalled();
    expect(confirmSite).toHaveBeenCalledTimes(variant === "proof" ? 1 : 0);
  },
);
