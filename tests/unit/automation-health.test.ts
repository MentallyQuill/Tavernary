import { expect, test, vi } from "vitest";
import * as dependencyWriter from "../../scripts/automation/dependency-update.mjs";
import {
  assessAutomationHealth,
  assessInventoryHealth,
} from "../../scripts/automation/health.mjs";
import { runAutomationWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";
import {
  operationFixture,
  AUTOMATION_NOW,
  metadataMaintenanceFixture,
} from "../helpers/automation-fixtures";

const nowMs = AUTOMATION_NOW;
const before = (hours: number) =>
  new Date(nowMs - hours * 3_600_000).toISOString();

test("manual waits are not stalled automatic submissions", () => {
  const operation = {
    ...operationFixture({ createdAt: before(72) }),
    automatic: false,
  };
  expect(
    assessAutomationHealth({ operations: [operation], nowMs }).some(
      (finding) =>
        finding.code === "submission-stalled" && finding.status === "active",
    ),
  ).toBe(false);
  operation.automatic = true;
  expect(
    assessAutomationHealth({ operations: [operation], nowMs }).some(
      (finding) =>
        finding.code === "submission-stalled" && finding.status === "active",
    ),
  ).toBe(true);
  expect(
    assessAutomationHealth({
      nowMs,
      operations: [
        {
          ...operation,
          workerRunId: 700,
          progressAt: new Date(nowMs).toISOString(),
        },
      ],
    }).some(
      (finding) =>
        finding.code === "submission-stalled" && finding.status === "recovered",
    ),
  ).toBe(false);
});

test("a fresh companion clock cannot hide stale individual repository observations", () => {
  const findings = assessAutomationHealth({
    nowMs,
    refreshState: [
      { provider: "github", required: true, refreshedAt: before(49) },
      { provider: "codeberg", required: true, refreshedAt: before(1) },
      { provider: "github", required: false, refreshedAt: before(72) },
    ],
  });
  expect(
    findings.find((finding) => finding.subject === "refresh:github"),
  ).toMatchObject({ status: "active", count: 1 });
  expect(
    findings.find((finding) => finding.subject === "refresh:codeberg"),
  ).toMatchObject({ status: "recovered", count: 0 });
});

test("only due factual imports exceed the twenty-four-hour threshold", () => {
  const findings = assessAutomationHealth({
    nowMs,
    importState: [
      { key: "a".repeat(64), dueAt: before(25), completed: false },
      { key: "b".repeat(64), dueAt: before(1), completed: false },
      { key: "c".repeat(64), dueAt: before(72), completed: true },
    ],
  });
  expect(
    findings.filter((finding) => finding.status === "active"),
  ).toHaveLength(1);
  expect(findings[0]).toMatchObject({
    code: "import-stale",
    subject: `operation:${"a".repeat(64)}`,
  });
});

test("confirmed revision recovery is distinct from missing proof and owner rollback", () => {
  const base = {
    nowMs,
    deploymentState: {
      latestRevision: "a".repeat(40),
      activeRevision: "b".repeat(40),
      pendingSince: before(3),
      ordinary: true,
    },
  };
  expect(assessAutomationHealth(base)[0]).toMatchObject({
    code: "deployment-stalled",
    status: "active",
  });
  expect(
    assessAutomationHealth({
      ...base,
      deploymentState: {
        ...base.deploymentState,
        activeRevision: "a".repeat(40),
      },
    })[0].status,
  ).toBe("recovered");
  expect(
    assessAutomationHealth({
      ...base,
      deploymentState: { ...base.deploymentState, ordinary: false },
    }),
  ).toHaveLength(0);
});

test("provider and unknown failures use bounded reason codes, never raw diagnostics", () => {
  const operation = {
    ...operationFixture({
      retry: {
        failure: { kind: "unknown", reasonCode: "unclassified-failure" },
        transientAttempts: 4,
        immediateAttempts: 3,
      },
    }),
    automatic: true,
  };
  const findings = assessAutomationHealth({
    nowMs,
    operations: [operation],
    circuits: [
      {
        subject: "dependency:publisher",
        reason: "publisher-authentication-failed",
        recovered: false,
      },
    ],
    budget: { exhausted: true },
  });
  expect(findings.map((finding) => finding.code)).toEqual(
    expect.arrayContaining([
      "unknown-failure",
      "provider-circuit",
      "budget-exhausted",
    ]),
  );
  expect(() =>
    assessAutomationHealth({
      nowMs,
      circuits: [
        {
          subject: "dependency:publisher",
          reason: "private-token-secret",
          recovered: false,
        },
      ],
    }),
  ).toThrow();
});

test("unchanged findings keep a stable fingerprint and dependency recovery needs observed proof", () => {
  const options = {
    nowMs,
    dependencies: [
      { number: 42, failed: true, recovered: false, headSha: "a".repeat(40) },
    ],
  };
  const first = assessAutomationHealth(options)[0];
  expect(
    assessAutomationHealth({ ...options, nowMs: nowMs + 60_000 })[0],
  ).toEqual(first);
  expect(
    assessAutomationHealth({
      nowMs,
      dependencies: [
        { ...options.dependencies[0], failed: false, recovered: false },
      ],
    }),
  ).toHaveLength(0);
  expect(
    assessAutomationHealth({
      nowMs,
      dependencies: [
        { ...options.dependencies[0], failed: false, recovered: true },
      ],
    })[0],
  ).toMatchObject({ key: first.key, status: "recovered" });
});

test("the scheduled writer projects actual source facts and retains controller results when incident writes fail", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [];
  state.local.kits = [];
  state.local.snapshots = (
    state.local.snapshots as Array<Record<string, unknown>>
  ).map((snapshot) => ({ ...snapshot, refreshed_at: before(72) }));
  state.local.publishableRevision = "a".repeat(40);
  state.local.publishableCommittedAt = new Date(state.nowMs).toISOString();
  state.local.activeDeployment = {
    mode: "ordinary",
    deployment: { sourceSha: "a".repeat(40) },
  };
  const env = {
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: state.repository,
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
  };
  const calls: string[][] = [];
  const failed = await runAutomationWriterReconciliation({
    env,
    load: async () => state,
    gh: async (args) => {
      calls.push(args);
      throw new Error("Incident service temporarily unavailable");
    },
  });
  expect(failed.health).toMatchObject({ status: "unavailable" });
  expect(failed.controller).toMatchObject({ selectedKeys: [], dispatched: 0 });
  expect(calls.filter((args) => args.includes("POST"))).toHaveLength(1);
  const result = await runAutomationWriterReconciliation({
    env,
    load: async () => state,
    gh: async (_args, payload) => {
      const issue = {
        ...JSON.parse(payload!),
        number: 7,
        state: "open",
        user: { id: state.publisherActorId, type: "Bot" },
      };
      expect(issue.body).toContain("refresh:github");
      return JSON.stringify(issue);
    },
  });
  expect(result.health).toMatchObject({ status: "updated", number: 7 });
});

test("the actual scheduled writer selects open dependency work after closed history", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [];
  const pull = {
    number: 242,
    state: "open",
    body: "",
    user: { id: 49699333, type: "Bot" },
    head: {
      sha: "b".repeat(40),
      ref: "dependabot/npm/update",
      repo: { full_name: state.repository },
    },
    base: { ref: "main", repo: { full_name: state.repository } },
  };
  state.remote.pulls = [
    ...Array.from({ length: 200 }, (_, index) => ({
      ...pull,
      number: index + 1,
      state: "closed",
    })),
    pull,
  ];
  const run = vi
    .spyOn(dependencyWriter, "runDependencyWriter")
    .mockResolvedValue({ status: "idle", decisions: [] });
  try {
    await runAutomationWriterReconciliation({
      load: async () => state,
      gh: async () => {
        throw new Error("No API expected");
      },
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: state.repository,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      },
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ pullNumbers: [242] }),
    );
  } finally {
    run.mockRestore();
  }
});

test("native health identifies source credentials and excludes rejected dependency history", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "refresh",
        subject: "source:github-42",
      },
      retry: {
        failure: {
          kind: "configuration",
          reasonCode: "authentication-unavailable",
        },
        transientAttempts: 0,
        immediateAttempts: 1,
      },
    }),
  ];
  state.remote.pulls = [
    {
      number: 242,
      state: "closed",
      body: "",
      user: { id: 49699333, type: "Bot" },
      head: {
        sha: "b".repeat(40),
        ref: "dependabot/npm/update",
        repo: { full_name: state.repository },
      },
      base: { ref: "main", repo: { full_name: state.repository } },
    },
  ];
  state.remote.runs = [
    {
      id: 500,
      head_sha: "b".repeat(40),
      status: "completed",
      conclusion: "failure",
      path: ".github/workflows/ci.yml",
      event: "pull_request",
      head_repository: { full_name: state.repository },
    },
  ];
  const findings = assessInventoryHealth(state);
  expect(
    findings.find((finding) => finding.code === "provider-circuit"),
  ).toMatchObject({ subject: "refresh:github" });
  expect(
    findings.some((finding) => finding.code === "dependency-checks-failed"),
  ).toBe(false);
  state.operations = [];
  state.remote.issues = [
    {
      number: 7,
      state: "open",
      body: '{"subject":"refresh:github"}',
      user: { id: state.publisherActorId, login: "publisher", type: "Bot" },
      labels: [],
      updated_at: new Date(state.nowMs - 3_600_000).toISOString(),
    },
  ];
  expect(
    assessInventoryHealth(state).find(
      (finding) => finding.code === "provider-circuit",
    ),
  ).toMatchObject({ subject: "refresh:github", status: "recovered" });
});
