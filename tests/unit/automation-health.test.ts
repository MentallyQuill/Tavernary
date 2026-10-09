import { expect, test, vi } from "vitest";

test("runtime incidents stay active at end of life and close only on a supported observation", () => {
  const nowMs = Date.parse("2028-05-01T00:00:00Z");
  const expired = assessAutomationHealth({
    nowMs,
    runtime: { reason: "runtime-eol" },
  });
  expect(expired).toEqual([
    expect.objectContaining({
      code: "runtime-maintenance",
      subject: "runtime:node",
      status: "active",
      reason: "runtime-eol",
    }),
  ]);
  expect(
    assessAutomationHealth({
      nowMs,
      runtime: { reason: "runtime-schedule-invalid" },
    })[0].status,
  ).toBe("active");
  expect(
    assessAutomationHealth({
      nowMs,
      runtime: { reason: "runtime-supported" },
    })[0].status,
  ).toBe("recovered");
  expect(
    assessAutomationHealth({
      nowMs,
      runtime: { reason: "runtime-verification-pending" },
    }),
  ).toEqual([]);
});
import {
  createEnrichmentRunState,
  applyAttemptResults,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import { planIncidentUpdates } from "../../scripts/automation/incidents.mjs";
import * as dependencyWriter from "../../scripts/automation/dependency-update.mjs";
import * as runtimeWriter from "../../scripts/automation/runtime-maintenance.mjs";
import * as enrichmentRequests from "../../scripts/automation/enrichment-owner-request.mjs";
import * as stateRetention from "../../scripts/automation/retention.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import {
  assessAutomationHealth,
  assessInventoryHealth,
} from "../../scripts/automation/health.mjs";
import { runAutomationWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";
import {
  operationFixture,
  AUTOMATION_NOW,
  metadataMaintenanceFixture,
  preparedResultFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";

const nowMs = AUTOMATION_NOW;
test.each([false, true])(
  "the scheduled writer keeps bundle and terminal retention inside twenty operations (terminal=%s)",
  async (retireState) => {
    const { state } = await metadataMaintenanceFixture();
    const originalNow = state.nowMs;
    if (retireState) state.nowMs += 120 * 86400000;
    state.operations = Array.from({ length: 20 }, (_, index) =>
      operationFixture({
        identity: {
          kind: "project",
          subject: `issue:${index + 100}`,
          inputDigest: "a".repeat(64),
          policyVersion: "1",
        },
        stage: "validated",
        createdAt: new Date(state.nowMs).toISOString(),
      }),
    );
    state.local = {
      revision: "d".repeat(40),
      deployments: [],
      sources: [],
      kits: [],
      publishableRevision: "c".repeat(40),
      publishableCommittedAt: new Date(state.nowMs).toISOString(),
      activeDeployment: {
        mode: "ordinary",
        deployment: { sourceSha: "c".repeat(40), workflowRunId: 42 },
      },
    };
    if (retireState) {
      const operation = preparedResultContextFixture().operation;
      const result = preparedResultFixture();
      const revision = "e".repeat(40);
      state.receipts = [
        {
          schema_version: 1,
          operation: {
            ...operation,
            stage: "finalized",
            expectedSha: revision,
            workerRunId: null,
            retry: null,
            nextEligibleAt: null,
          },
          updatedAt: new Date(originalNow).toISOString(),
          completedAt: new Date(originalNow).toISOString(),
        },
      ];
      state.local.publications = [
        {
          record: createCanonicalPublicationRecord({ operation, result }),
          revision,
        },
      ];
      state.local.publicationFileDigests = Object.fromEntries(
        result.files.map((file) => [`${revision}:${file.path}`, file.sha256]),
      );
      state.local.confirmedRevisions = [revision];
    }
    const retire = vi
      .spyOn(stateRetention, "runAutomationStateRetention")
      .mockResolvedValue({
        status: "retired",
        sha: "f".repeat(40),
        removed: 2,
      });
    try {
      const dispatches: string[][] = [];
      const result = await runAutomationWriterReconciliation({
        load: async () => state,
        gh: async (args) => {
          if (args[0] === "workflow") {
            dispatches.push(args);
            return "";
          }
          if (args[1].includes("/releases/tags/"))
            throw Object.assign(new Error("HTTP 404"), { status: 404 });
          if (args[1].includes("/actions/workflows/automation-writer.yml/runs"))
            return JSON.stringify({ total_count: 0, workflow_runs: [] });
          throw new Error(`Unexpected fixture endpoint ${args[1]}`);
        },
        env: {
          GITHUB_REF: "refs/heads/main",
          GITHUB_REPOSITORY: state.repository,
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
          TAVERNARY_IMMUTABLE_RELEASES_ENABLED: "true",
        },
      });
      expect(result.controller).toMatchObject({
        selectedKeys: expect.any(Array),
        dispatched: 0,
      });
      expect(
        (result.controller as { selectedKeys: string[] }).selectedKeys,
      ).toHaveLength(retireState ? 18 : 19);
      expect(dispatches).toHaveLength(1);
      expect(dispatches[0]).toContain("mode=retain");
      expect(result.retention).toMatchObject({ status: "requested" });
      expect(retire).toHaveBeenCalledTimes(retireState ? 1 : 0);
      if (retireState)
        expect(retire).toHaveBeenCalledWith(
          expect.objectContaining({ availableSlots: 1 }),
        );
    } finally {
      retire.mockRestore();
    }
  },
);
test("offline drill failures use a single recoverable operational incident", () => {
  const failed = assessAutomationHealth({
    nowMs,
    restoreDrill: { status: "active" },
  });
  expect(failed).toEqual([
    expect.objectContaining({
      code: "restore-drill-failed",
      subject: "deployment:restore-drill",
      status: "active",
      reason: "checks-failed",
    }),
  ]);
  expect(
    assessAutomationHealth({ nowMs, restoreDrill: { status: "recovered" } }),
  ).toEqual([
    expect.objectContaining({
      key: failed[0].key,
      status: "recovered",
      reason: "verified-recovery",
    }),
  ]);
});
test("the scheduled canonical lane reserves a bounded runtime maintenance slot", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [];
  state.local.runtimePolicy = {
    schemaVersion: 1,
    productionMajor: 24,
    warningDays: 90,
  };
  const run = vi.spyOn(runtimeWriter, "runRuntimeWriter").mockResolvedValue({
    status: "idle",
    reason: "runtime-supported",
    decision: {
      action: "keep",
      healthy: true,
      reason: "runtime-supported",
      currentMajor: 24,
      supportEnds: "2028-04-30T00:00:00.000Z",
    },
  });
  try {
    const result = await runAutomationWriterReconciliation({
      load: async () => state,
      gh: async () => {
        throw new Error("No mutation expected");
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
      expect.objectContaining({ availableSlots: 1 }),
    );
    expect(result.runtime).toMatchObject({
      status: "idle",
      reason: "runtime-supported",
    });
  } finally {
    run.mockRestore();
  }
});
const before = (hours: number) =>
  new Date(nowMs - hours * 3_600_000).toISOString();

test("terminal enrichment errors use one actionable native incident and unverified clean reports cannot close it", async () => {
  const { state } = await metadataMaintenanceFixture();
  const running = createEnrichmentRunState({
    mode: "full",
    runId: "health-enrichment",
    manifest: ["failed-project"],
    batchSize: 20,
    concurrency: 2,
    model: "fixture-model",
    now: new Date(nowMs).toISOString(),
  });
  state.local.enrichmentFull = createEnrichmentReport(
    applyAttemptResults(
      running,
      [
        {
          id: "failed-project",
          phase: "primary",
          outcome: "source-not-ready",
          reasonCode: "readme-missing",
        },
      ],
      new Date(nowMs).toISOString(),
    ),
  );
  const findings = assessInventoryHealth(state).filter(
    (value) => value.code === "enrichment-unresolved",
  );
  expect(findings).toMatchObject([
    { subject: "enrichment:catalog", status: "active", count: 1 },
  ]);
  const mutation = planIncidentUpdates({
    findings,
    existingIssues: [],
    publisherActorId: state.publisherActorId,
  })[0];
  expect(mutation.title).toBe(
    "[automation] Catalog enrichment has unresolved projects",
  );
  expect(mutation.body).toContain("data/reports/enrichment-report.json");
  state.local.enrichmentFull = createEnrichmentReport(
    applyAttemptResults(
      running,
      [{ id: "failed-project", phase: "primary", outcome: "enriched" }],
      new Date(nowMs).toISOString(),
    ),
  );
  expect(
    assessInventoryHealth(state).some(
      (value) => value.code === "enrichment-unresolved",
    ),
  ).toBe(false);
  state.local.enrichmentFull = createEnrichmentReport(running);
  expect(
    assessInventoryHealth(state).some(
      (value) => value.code === "enrichment-unresolved",
    ),
  ).toBe(false);
});

test("the scheduled writer recovers a missed owner request through authenticated admission", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [];
  const latest = vi
    .spyOn(enrichmentRequests, "loadLatestEnrichmentOwnerRequest")
    .mockResolvedValue({ id: 987 });
  const admission = vi
    .spyOn(enrichmentRequests, "admitEnrichmentOwnerRequest")
    .mockResolvedValue({ status: "admitted", runId: 987, sha: "c".repeat(40) });
  try {
    const result = await runAutomationWriterReconciliation({
      load: async () => state,
      gh: async () => JSON.stringify({ id: 987 }),
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: state.repository,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
        UTILITY_MODEL: "fixture-model",
      },
    });
    expect(result.enrichment).toMatchObject({ status: "admitted", runId: 987 });
    expect(latest).toHaveBeenCalledOnce();
    expect(admission).toHaveBeenCalledWith(
      expect.objectContaining({
        state,
        run: { id: 987 },
        model: "fixture-model",
      }),
    );
    expect(result.controller).toMatchObject({ dispatched: 0 });
  } finally {
    latest.mockRestore();
    admission.mockRestore();
  }
});

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
