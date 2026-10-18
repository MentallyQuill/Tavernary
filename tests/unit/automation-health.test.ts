import { expect, test, vi } from "vitest";
import * as inventory from "../../scripts/automation/inventory.mjs";

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
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { validateAutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  AUTOMATION_STAGES,
  operationKey,
  validateAutomationOperation,
  type AutomationOperation,
} from "../../scripts/automation/operation.mjs";
import {
  createProjectPublicationTransaction,
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";
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
  projectInventoryFixture,
} from "../helpers/automation-fixtures";

const nowMs = AUTOMATION_NOW;
test.each([
  { requests: 200, tokens: 0, dailyTokenLimitKnown: false, expected: "active" },
  {
    requests: 0,
    tokens: 200_000,
    dailyTokenLimitKnown: true,
    expected: "active",
  },
  {
    requests: 0,
    tokens: 200_000,
    dailyTokenLimitKnown: false,
    expected: undefined,
  },
])(
  "invalid optional policy retains independently proven quota exhaustion: %j",
  async ({ requests, tokens, dailyTokenLimitKnown, expected }) => {
    const { state } = await metadataMaintenanceFixture();
    state.local.modelBudget = {
      schema_version: 1,
      updatedAt: new Date(state.nowMs).toISOString(),
      days: [{ day: "2026-10-08", requests, tokens }],
      months: [],
      tickets: [],
    };
    const budgetFinding = assessInventoryHealth(state, {
      reservation: null,
      dailyTokenLimitKnown,
    }).find((value) => value.code === "budget-exhausted");
    expect(budgetFinding?.status).toBe(expected);
  },
);

test("invalid optional reservation configuration cannot claim recovery of a saved budget incident", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations[0].retry = {
    failure: { kind: "configuration", reasonCode: "budget-exhausted" },
    transientAttempts: 0,
    immediateAttempts: 0,
  };
  state.local.modelBudget = {
    schema_version: 1,
    updatedAt: new Date(state.nowMs).toISOString(),
    days: [],
    months: [],
    tickets: [],
  };
  expect(
    assessInventoryHealth(state, { reservation: null }).filter(
      (value) => value.code === "budget-exhausted",
    ),
  ).toEqual([]);
});

test.each([
  {
    name: "remaining daily requests cannot fit the batch",
    requests: 199,
    monthlyUsd: undefined,
    price: true,
    repairPrice: true,
    status: "active",
  },
  {
    name: "monthly accounting requires primary pricing",
    requests: 0,
    monthlyUsd: 1,
    price: false,
    repairPrice: true,
    status: "active",
  },
  {
    name: "monthly accounting requires repair pricing",
    requests: 0,
    monthlyUsd: 1,
    price: true,
    repairPrice: false,
    status: "active",
  },
  {
    name: "the entire priced batch fits",
    requests: 0,
    monthlyUsd: 1,
    price: true,
    repairPrice: true,
    status: "recovered",
  },
])(
  "reservation health: $name",
  async ({ requests, monthlyUsd, price, repairPrice, status }) => {
    const { state } = await metadataMaintenanceFixture();
    state.local.modelBudget = {
      schema_version: 1,
      updatedAt: new Date(state.nowMs).toISOString(),
      days: [{ day: "2026-10-08", requests, tokens: 0 }],
      months: [],
      tickets: [],
    };
    const original = JSON.stringify(state);
    const policy = {
      monthlyUsd,
      requests: [
        {
          model: "primary",
          requestCount: 3,
          requestedTokens: 180_000,
          ...(price
            ? {
                price: {
                  model: "primary",
                  inputUsdPerMillion: 1,
                  outputUsdPerMillion: 1,
                },
              }
            : {}),
        },
        {
          model: "repair",
          requestCount: 1,
          requestedTokens: 15_000,
          ...(repairPrice
            ? {
                price: {
                  model: "repair",
                  inputUsdPerMillion: 1,
                  outputUsdPerMillion: 1,
                },
              }
            : {}),
        },
      ],
    };
    expect(
      assessInventoryHealth(state, {
        tokensPerDay: 10_000_000,
        reservation: policy,
      }),
    ).toContainEqual(
      expect.objectContaining({ code: "budget-exhausted", status }),
    );
    expect(JSON.stringify(state)).toBe(original);
  },
);

test("the scheduled writer uses monthly prices when deciding whether allowance recovered", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations = [];
  state.local.kits = [];
  state.local.publishableRevision = "a".repeat(40);
  state.local.publishableCommittedAt = new Date(state.nowMs).toISOString();
  state.local.activeDeployment = {
    mode: "ordinary",
    deployment: { sourceSha: "a".repeat(40) },
  };
  state.local.modelBudget = {
    schema_version: 1,
    updatedAt: new Date(state.nowMs).toISOString(),
    days: [],
    months: [
      { month: "2026-10", reservedMicrousd: 1_000_000, unpricedTokens: 0 },
    ],
    tickets: [],
  };
  const bodies: string[] = [];
  const result = await runAutomationWriterReconciliation({
    load: async () => state,
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: state.repository,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      TAVERNARY_MODEL_DAILY_TOKENS: "10000000",
      TAVERNARY_MODEL_MONTHLY_USD: "1",
      UTILITY_MODEL: "approved",
      TAVERNARY_MODEL_PRICES:
        '{"approved":{"inputUsdPerMillion":1,"outputUsdPerMillion":1}}',
    },
    gh: async (args, payload) => {
      if (!args.includes("POST") || !payload)
        throw new Error("Unexpected GitHub request");
      bodies.push(payload);
      return JSON.stringify({
        ...JSON.parse(payload),
        number: 7,
        state: "open",
        user: { id: state.publisherActorId, type: "Bot" },
      });
    },
  });
  expect(result.health).toMatchObject({ status: "updated", number: 7 });
  expect(bodies).toHaveLength(1);
  expect(JSON.parse(bodies[0]).body).toContain('"subject":"dependency:budget"');
});

test("monthly spending exhaustion cannot be cleared by available daily counters", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations[0].retry = {
    failure: { kind: "configuration", reasonCode: "budget-exhausted" },
    transientAttempts: 0,
    immediateAttempts: 0,
  };
  state.local.modelBudget = {
    schema_version: 1,
    updatedAt: new Date(state.nowMs).toISOString(),
    days: [],
    months: [
      { month: "2026-10", reservedMicrousd: 1_000_000, unpricedTokens: 0 },
    ],
    tickets: [],
  };
  const original = JSON.stringify(state);
  expect(
    assessInventoryHealth(state, {
      tokensPerDay: 10_000_000,
      reservation: {
        monthlyUsd: 1,
        requests: [
          {
            model: "approved",
            requestCount: 3,
            requestedTokens: 180_000,
            price: {
              model: "approved",
              inputUsdPerMillion: 1,
              outputUsdPerMillion: 1,
            },
          },
        ],
      },
    }),
  ).toContainEqual(
    expect.objectContaining({ code: "budget-exhausted", status: "active" }),
  );
  expect(JSON.stringify(state)).toBe(original);
});

test("persistent classified metadata failures still escalate after bounded retries", () => {
  const operation = operationFixture({
    identity: {
      kind: "metadata",
      subject: "source:invalid-output",
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
    retry: {
      failure: { kind: "transient", reasonCode: "provider-response-invalid" },
      transientAttempts: 3,
      immediateAttempts: 0,
    },
  });
  const findings = assessAutomationHealth({
    nowMs,
    operations: [{ ...operation, automatic: true }],
  });
  expect(
    findings.filter((value) => value.subject === `operation:${operation.key}`),
  ).toEqual([
    expect.objectContaining({
      status: "active",
      reason: "provider-response-invalid",
    }),
  ]);
});

test("classified advisory output failures remain visible in the shared investigation", async () => {
  const { state } = await metadataMaintenanceFixture();
  const advisory = state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  advisory.retry = {
    failure: { kind: "transient", reasonCode: "provider-response-invalid" },
    transientAttempts: 3,
    immediateAttempts: 0,
  };
  expect(assessInventoryHealth(state)).toContainEqual(
    expect.objectContaining({
      subject: "automation:advisory",
      status: "active",
      reason: "provider-response-invalid",
      count: 1,
    }),
  );
});

test("repeated advisory failures share one investigation while legacy incidents are superseded", async () => {
  const { state } = await metadataMaintenanceFixture();
  const advisory = state.operations.find(
    (value) => value.identity.kind === "advisory",
  )!;
  advisory.retry = {
    failure: { kind: "unknown", reasonCode: "unclassified-failure" },
    transientAttempts: 3,
    immediateAttempts: 3,
  };
  const second = operationFixture({
    identity: { ...advisory.identity, subject: "source:second-advisory" },
    retry: structuredClone(advisory.retry),
  });
  state.operations.push(second);
  const findings = assessInventoryHealth(state).filter(
    (value) => value.code === "unknown-failure",
  );

  expect(findings.filter((value) => value.status === "active")).toEqual([
    expect.objectContaining({ subject: "automation:advisory", count: 2 }),
  ]);
  for (const operation of [advisory, second])
    expect(findings).toContainEqual(
      expect.objectContaining({
        subject: `operation:${operation.key}`,
        status: "recovered",
        reason: "incident-grouped",
      }),
    );
  advisory.retry = null;
  second.retry = null;
  expect(assessInventoryHealth(state)).toContainEqual(
    expect.objectContaining({
      code: "unknown-failure",
      subject: "automation:advisory",
      status: "recovered",
      count: 0,
    }),
  );
});

test("a saved budget refusal cannot keep a recovered daily allowance incident active", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.operations[0].retry = {
    failure: { kind: "configuration", reasonCode: "budget-exhausted" },
    transientAttempts: 0,
    immediateAttempts: 0,
  };
  state.local.modelBudget = {
    schema_version: 1,
    updatedAt: new Date(state.nowMs).toISOString(),
    days: [{ day: "2026-10-08", requests: 116, tokens: 5_655_000 }],
    months: [],
    tickets: [],
  };
  const before = JSON.stringify(state);

  expect(
    assessInventoryHealth(state, { tokensPerDay: 10_000_000 }).find(
      (value) => value.code === "budget-exhausted",
    ),
  ).toMatchObject({ status: "recovered", reason: "verified-recovery" });
  expect(JSON.stringify(state)).toBe(before);
});

test("inventory health keeps the model allowance available below the configured daily token limit", async () => {
  const { state } = await metadataMaintenanceFixture();
  state.local.modelBudget = {
    schema_version: 1,
    updatedAt: new Date(state.nowMs).toISOString(),
    days: [{ day: "2026-10-08", requests: 1, tokens: 200_000 }],
    months: [],
    tickets: [],
  };

  expect(
    assessInventoryHealth(state, { tokensPerDay: 2_000_000 }).find(
      (finding) => finding.code === "budget-exhausted",
    ),
  ).toMatchObject({ status: "recovered", reason: "verified-recovery" });
});

test("inventory health rejects a daily token limit above the supported allowance", async () => {
  const { state } = await metadataMaintenanceFixture();

  expect(() =>
    assessInventoryHealth(state, { tokensPerDay: 10_000_001 }),
  ).toThrow("Model daily token limit is invalid.");
});

test.each([
  {
    tokensPerDay: undefined,
    requests: 1,
    tokens: 200_000,
    status: "active",
  },
  {
    tokensPerDay: 2_000_000,
    requests: 1,
    tokens: 1_999_999,
    status: "recovered",
  },
  {
    tokensPerDay: 2_000_000,
    requests: 1,
    tokens: 2_000_000,
    status: "active",
  },
  {
    tokensPerDay: 2_000_000,
    requests: 40,
    tokens: 1,
    status: "recovered",
  },
  {
    tokensPerDay: 10_000_000,
    requests: 200,
    tokens: 1,
    status: "active",
  },
])(
  "inventory health reports $status at daily use $requests requests and $tokens tokens (limit=$tokensPerDay)",
  async ({ tokensPerDay, requests, tokens, status }) => {
    const { state } = await metadataMaintenanceFixture();
    state.local.modelBudget = {
      schema_version: 1,
      updatedAt: new Date(state.nowMs).toISOString(),
      days: [{ day: "2026-10-08", requests, tokens }],
      months: [],
      tickets: [],
    };

    expect(
      assessInventoryHealth(state, { tokensPerDay }).find(
        (finding) => finding.code === "budget-exhausted",
      ),
    ).toMatchObject({ status });
  },
);

test.each([false, true])(
  "the scheduled writer keeps bundle and terminal retention inside twenty operations (terminal=%s)",
  async (retireState) => {
    const { state } = await metadataMaintenanceFixture();
    const originalNow = state.nowMs;
    if (retireState) state.nowMs += 120 * 86400000;
    state.operations = Array.from({ length: 20 }, (_, index) =>
      operationFixture({
        identity: {
          kind: "metadata",
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
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
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
          const route = args.find((arg) => arg.startsWith("repos/"))!;
          if (
            route.includes("/actions/workflows/automation-writer.yml/runs") ||
            route.includes("/actions/workflows/restore-site.yml/runs")
          )
            return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
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
      revalidate.mockRestore();
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

async function finalizedProjectHealthFixture(
  issueNumber = 606,
  expectedSha = "cdc37a8114a0d9366832eec7675f2c5861249c9b",
) {
  const input = projectInventoryFixture({
    merged: true,
    confirmedDeployment: true,
  });
  const issue = Object.assign(input.issues[0], {
    number: issueNumber,
    state: "closed",
    state_reason: "completed",
  });
  const pull = input.pulls[0];
  const transaction = parseProjectPublicationTransaction(pull.body);
  if (!transaction) throw new Error("Merged project transaction is missing");
  pull.head.ref = `automation/project-submission-${issueNumber}`;
  pull.merge_commit_sha = expectedSha;
  pull.body = `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(
    createProjectPublicationTransaction({
      ...transaction,
      issue_number: issueNumber,
    }),
  )}\n-->`;
  input.catalog.confirmedRevisions = [expectedSha];
  const confirmed = discoverProjectOperations(input)[0];
  expect(confirmed.stage).toBe("deployment-confirmed");
  const completedAt = new Date(input.nowMs).toISOString();
  const receipt = validateAutomationReceipt({
    schema_version: 1,
    operation: { ...confirmed, stage: "finalized" },
    updatedAt: completedAt,
    completedAt,
  });
  input.receipts = [receipt];
  expect(discoverProjectOperations(input)[0].stage).toBe("finalized");
  input.catalog.confirmedRevisions = [];
  const operation = discoverProjectOperations(input)[0];
  expect(operation.stage).toBe("published");
  const { state } = await metadataMaintenanceFixture();
  state.operations = [operation];
  state.receipts = [receipt];
  state.remote.issues = [issue];
  state.remote.pulls = input.pulls;
  state.remote.runs = [];
  return { state, input, operation, receipt, issue };
}

test.each([
  [606, "cdc37a8114a0d9366832eec7675f2c5861249c9b", 905],
  [761, "5140aaad9b5a1f20b2d817ced38ace18aa523049", 907],
] as const)(
  "exact finalized project history recovers submission %i while rediscovery stays published",
  async (issueNumber, expectedSha, incidentNumber) => {
    const { state, operation } = await finalizedProjectHealthFixture(
      issueNumber,
      expectedSha,
    );
    const subject = `operation:${operation.key}`;
    const baseline = assessInventoryHealth({ ...state, receipts: [] });
    const active = baseline.find(
      (value) =>
        value.code === "submission-stalled" && value.subject === subject,
    )!;
    expect(active).toMatchObject({ status: "active", count: 1 });
    const created = planIncidentUpdates({
      findings: [active],
      existingIssues: [],
      publisherActorId: state.publisherActorId,
    })[0];
    const existingIssue = {
      number: incidentNumber,
      title: created.title,
      body: created.body,
      state: "open",
      user: { id: state.publisherActorId, type: "Bot" },
    };
    const original = JSON.stringify(state);
    const findings = assessInventoryHealth(state);
    const recovered = findings.find((value) => value.key === active.key)!;
    expect(recovered).toEqual({
      ...active,
      status: "recovered",
      reason: "verified-recovery",
      count: 0,
    });
    expect(findings.filter((value) => value.key !== active.key)).toEqual(
      baseline.filter((value) => value.key !== active.key),
    );
    expect(
      planIncidentUpdates({
        findings: [recovered],
        existingIssues: [existingIssue],
        publisherActorId: state.publisherActorId,
      }),
    ).toMatchObject([{ action: "close", number: incidentNumber }]);
    expect(operation.stage).toBe("published");
    expect(JSON.stringify(state)).toBe(original);
  },
);

test.each<Partial<AutomationOperation>>([
  ...(
    [
      ["transient", "provider-rate-limited"],
      ["configuration", "authentication-unavailable"],
      ["unknown", "unclassified-failure"],
      ["permanent", "authorization-lost"],
      ["superseded", "input-superseded"],
    ] as const
  ).map(([kind, reasonCode]) => ({
    retry: {
      failure: { kind, reasonCode },
      transientAttempts: 1,
      immediateAttempts: 3,
    },
  })),
  { workerRunId: 700 },
  { nextEligibleAt: before(1) },
  { nextEligibleAt: new Date(nowMs + 48 * 3_600_000).toISOString() },
])(
  "terminal history preserves current failure or intent markers: %j",
  async (patch) => {
    const { state, operation } = await finalizedProjectHealthFixture();
    Object.assign(operation, patch);
    const baseline = assessInventoryHealth({ ...state, receipts: [] });
    expect(assessInventoryHealth(state)).toEqual(baseline);
    expect(
      assessInventoryHealth(state).filter(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${operation.key}` &&
          value.status === "recovered",
      ),
    ).toEqual([]);
  },
);

type FinalizedProjectHealthFixture = Awaited<
  ReturnType<typeof finalizedProjectHealthFixture>
>;

test.each(
  (["worker", "unknown failure", "different revision"] as const).flatMap(
    (peerKind) => [false, true].map((peerFirst) => ({ peerKind, peerFirst })),
  ),
)(
  "terminal history refuses ambiguous current $peerKind peers (peerFirst=$peerFirst)",
  async ({ peerKind, peerFirst }) => {
    const { state, operation } = await finalizedProjectHealthFixture();
    const peer = structuredClone(operation);
    if (peerKind === "worker") peer.workerRunId = 700;
    else if (peerKind === "different revision")
      peer.expectedSha = "e".repeat(40);
    else
      peer.retry = {
        failure: { kind: "unknown", reasonCode: "unclassified-failure" },
        transientAttempts: 0,
        immediateAttempts: 3,
      };
    validateAutomationOperation(peer);
    state.operations = peerFirst ? [peer, operation] : [operation, peer];
    const findings = assessInventoryHealth(state);
    expect(findings).toEqual(assessInventoryHealth({ ...state, receipts: [] }));
    expect(
      findings.find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${operation.key}`,
      ),
    ).toMatchObject({
      status: "active",
      reason: "operation-stalled",
      count: 1,
    });
  },
);

test("same-key published health cannot use a marked retired terminal candidate", async () => {
  const { state, operation, receipt } = await finalizedProjectHealthFixture();
  state.local.retiredReceipts = [structuredClone(receipt)];
  const original = JSON.stringify(state);
  expect(assessInventoryHealth(state)).toEqual(
    assessInventoryHealth({ ...state, receipts: [] }),
  );
  expect(
    assessInventoryHealth(state).find(
      (value) =>
        value.code === "submission-stalled" &&
        value.subject === `operation:${operation.key}`,
    ),
  ).toMatchObject({ status: "active", reason: "operation-stalled", count: 1 });
  expect(JSON.stringify(state)).toBe(original);
});

test.each<{
  name: string;
  change: (fixture: FinalizedProjectHealthFixture) => void;
}>([
  { name: "missing receipt", change: ({ state }) => (state.receipts = []) },
  {
    name: "duplicate terminal candidates",
    change: ({ state, receipt }) =>
      state.receipts.push(structuredClone(receipt)),
  },
  {
    name: "malformed duplicate candidate",
    change: ({ state, receipt }) =>
      state.receipts.push({ ...receipt, completedAt: "invalid" }),
  },
  {
    name: "nonterminal receipt",
    change: ({ receipt }) => {
      receipt.operation.stage = "published";
      receipt.completedAt = null;
    },
  },
  {
    name: "malformed completion",
    change: ({ receipt }) => (receipt.completedAt = "invalid"),
  },
  {
    name: "mismatched completion progress",
    change: ({ receipt }) => (receipt.completedAt = before(1)),
  },
  {
    name: "future completion",
    change: ({ state, receipt }) => {
      receipt.completedAt = new Date(state.nowMs + 3_600_000).toISOString();
      receipt.updatedAt = receipt.completedAt;
    },
  },
  {
    name: "terminal retry",
    change: ({ receipt }) => {
      receipt.operation.retry = {
        failure: { kind: "transient", reasonCode: "provider-rate-limited" },
        transientAttempts: 1,
        immediateAttempts: 0,
      };
      expect(() => validateAutomationReceipt(receipt)).not.toThrow();
    },
  },
  {
    name: "terminal worker",
    change: ({ receipt }) => (receipt.operation.workerRunId = 700),
  },
  {
    name: "terminal eligibility",
    change: ({ receipt }) => {
      receipt.operation.nextEligibleAt = before(1);
      expect(() => validateAutomationReceipt(receipt)).not.toThrow();
    },
  },
  {
    name: "different publication revision",
    change: ({ receipt }) => (receipt.operation.expectedSha = "e".repeat(40)),
  },
  {
    name: "missing terminal publication revision",
    change: ({ receipt }) => (receipt.operation.expectedSha = null),
  },
  {
    name: "missing terminal completion",
    change: ({ receipt }) => (receipt.completedAt = null),
  },
  {
    name: "forged terminal key",
    change: ({ receipt }) => (receipt.operation.key = "f".repeat(64)),
  },
  {
    name: "invalid receipt schema",
    change: ({ receipt }) => Object.assign(receipt, { schema_version: 2 }),
  },
  {
    name: "missing current publication revision",
    change: ({ operation }) => (operation.expectedSha = null),
  },
  {
    name: "invalid current publication revision",
    change: ({ operation, receipt }) => {
      operation.expectedSha = "not-a-revision";
      receipt.operation.expectedSha = operation.expectedSha;
    },
  },
  {
    name: "different creation time",
    change: ({ operation }) => (operation.createdAt = before(2)),
  },
  ...(["kind", "subject", "inputDigest", "policyVersion"] as const).map(
    (field) => ({
      name: `inconsistent current identity ${field}`,
      change: ({ operation }: FinalizedProjectHealthFixture) =>
        Object.assign(operation.identity, {
          [field]:
            field === "kind"
              ? "kit"
              : field === "inputDigest"
                ? "e".repeat(64)
                : "different",
        }),
    }),
  ),
])(
  "terminal history refuses insufficient evidence: $name",
  async ({ change }) => {
    const fixture = await finalizedProjectHealthFixture();
    change(fixture);
    expect(
      assessInventoryHealth(fixture.state).find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${fixture.operation.key}`,
      ),
    ).toMatchObject({
      status: "active",
      reason: "operation-stalled",
      count: 1,
    });
  },
);

test.each<{
  name: string;
  change: (fixture: FinalizedProjectHealthFixture) => void;
}>([
  {
    name: "missing original issue",
    change: ({ state }) => (state.remote.issues = []),
  },
  {
    name: "duplicate original issues",
    change: ({ state, issue }) =>
      state.remote.issues.push(structuredClone(issue)),
  },
  {
    name: "reopened original issue",
    change: ({ issue }) => (issue.state = "open"),
  },
  {
    name: "unknown original state",
    change: ({ issue }) => (issue.state = "unknown"),
  },
  ...(["not_planned", "unknown", null, undefined] as const).map(
    (stateReason) => ({
      name: `unproven completion ${stateReason}`,
      change: ({ issue }: FinalizedProjectHealthFixture) =>
        Object.assign(issue, { state_reason: stateReason }),
    }),
  ),
  {
    name: "pull request posing as original issue",
    change: ({ issue }) => Object.assign(issue, { pull_request: {} }),
  },
  {
    name: "invalid original issue number",
    change: ({ issue }) =>
      Object.assign(issue, { number: String(issue.number) }),
  },
  ...[
    "needs-information",
    "submission-declined",
    "issue-limit-reached",
    "waiting-on-fork-parent",
  ].flatMap((label) =>
    [label, { name: label }].map((value) => ({
      name: `protected label ${JSON.stringify(value)}`,
      change: ({ issue }: FinalizedProjectHealthFixture) =>
        issue.labels.push(value),
    })),
  ),
  ...[
    undefined,
    null,
    "project-submission",
    {},
    [null],
    [{}],
    [{ name: 7 }],
    [7],
    [""],
  ].map((labels) => ({
    name: `malformed labels ${JSON.stringify(labels)}`,
    change: ({ issue }: FinalizedProjectHealthFixture) =>
      Object.assign(issue, { labels }),
  })),
])(
  "terminal history respects original human evidence: $name",
  async ({ change }) => {
    const fixture = await finalizedProjectHealthFixture();
    change(fixture);
    expect(
      assessInventoryHealth(fixture.state).find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${fixture.operation.key}`,
      ),
    ).toMatchObject({
      status: "active",
      reason: "operation-stalled",
      count: 1,
    });
  },
);

test.each(["key", "kind", "subject", "inputDigest", "policyVersion"] as const)(
  "a new current %s cannot inherit another operation's terminal history",
  async (field) => {
    const { state, operation, receipt } = await finalizedProjectHealthFixture();
    if (field === "key") operation.key = "f".repeat(64);
    else {
      Object.assign(operation.identity, {
        [field]:
          field === "kind"
            ? "owner-request"
            : field === "subject"
              ? "issue:762"
              : field === "inputDigest"
                ? "f".repeat(64)
                : "next-policy",
      });
      operation.key = operationKey(operation.identity);
    }
    const findings = assessInventoryHealth(state);
    expect(
      findings.find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${operation.key}`,
      ),
    ).toMatchObject({
      status: "active",
      reason: "operation-stalled",
      count: 1,
    });
    expect(
      findings.find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${receipt.operation.key}`,
      ),
    ).toMatchObject({
      status: "recovered",
      reason: "verified-recovery",
      count: 0,
    });
  },
);

test.each(AUTOMATION_STAGES.filter((stage) => stage !== "published"))(
  "terminal history preserves existing health behavior at current stage %s",
  async (stage) => {
    const { state, operation } = await finalizedProjectHealthFixture();
    operation.stage = stage;
    expect(assessInventoryHealth(state)).toEqual(
      assessInventoryHealth({ ...state, receipts: [] }),
    );
  },
);

test.each(["owner-request", "kit", "withdrawal"] as const)(
  "exact finalized history does not expand recovery to %s",
  async (kind) => {
    const { state, operation, receipt } = await finalizedProjectHealthFixture();
    for (const value of [operation, receipt.operation]) {
      value.identity.kind = kind;
      value.key = operationKey(value.identity);
    }
    validateAutomationReceipt(receipt);
    expect(assessInventoryHealth(state)).toEqual(
      assessInventoryHealth({ ...state, receipts: [] }),
    );
    expect(
      assessInventoryHealth(state).find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${operation.key}`,
      ),
    ).toMatchObject({ status: "active", count: 1 });
  },
);

test.each([716, 31])(
  "published Kit %i without terminal history retains its active submission finding",
  async (issueNumber) => {
    const { state } = await metadataMaintenanceFixture();
    const operation = operationFixture({
      identity: {
        kind: "kit",
        subject: `issue:${issueNumber}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      stage: "published",
    });
    state.operations = [operation];
    state.receipts = [];
    expect(
      assessInventoryHealth(state).find(
        (value) =>
          value.code === "submission-stalled" &&
          value.subject === `operation:${operation.key}`,
      ),
    ).toMatchObject({
      status: "active",
      reason: "operation-stalled",
      count: 1,
    });
  },
);

test("terminal history keeps absent-current recovery without adding a native issue requirement", async () => {
  const { state, receipt } = await finalizedProjectHealthFixture();
  state.operations = [];
  state.remote.issues = [];
  state.local.retiredReceipts = [structuredClone(receipt)];
  expect(
    assessInventoryHealth(state).find(
      (value) =>
        value.code === "submission-stalled" &&
        value.subject === `operation:${receipt.operation.key}`,
    ),
  ).toMatchObject({
    status: "recovered",
    reason: "verified-recovery",
    count: 0,
  });
});

test("completed original issues accept native object labels including needs-maintainer-review", async () => {
  const { state, operation, issue } = await finalizedProjectHealthFixture();
  issue.labels = issue.labels.map((label) =>
    typeof label === "string" ? { name: label } : label,
  );
  expect(
    assessInventoryHealth(state).find(
      (value) =>
        value.code === "submission-stalled" &&
        value.subject === `operation:${operation.key}`,
    ),
  ).toMatchObject({
    status: "recovered",
    reason: "verified-recovery",
    count: 0,
  });
});

test("historical submission recovery preserves unrelated active health findings and input bytes", async () => {
  const { state, operation } = await finalizedProjectHealthFixture();
  const unknown = operationFixture({
    identity: { ...operation.identity, subject: "issue:43" },
    retry: {
      failure: { kind: "unknown", reasonCode: "unclassified-failure" },
      transientAttempts: 0,
      immediateAttempts: 3,
    },
  });
  state.operations.push(unknown);
  for (const [subject, reasonCode] of [
    ["source:publisher", "publisher-authentication-failed"],
    ["source:budget", "budget-exhausted"],
  ])
    state.operations.push(
      operationFixture({
        identity: { ...operation.identity, kind: "metadata", subject },
        retry: {
          failure: { kind: "configuration", reasonCode },
          transientAttempts: 0,
          immediateAttempts: 1,
        },
      }),
    );
  state.local.publishableRevision = "e".repeat(40);
  state.local.publishableCommittedAt = before(72);
  state.local.activeDeployment = {
    mode: "ordinary",
    deployment: { sourceSha: "f".repeat(40) },
  };
  state.local.invalidReceiptKeys = ["f".repeat(64)];
  state.local.receiptInspectionComplete = true;
  const original = JSON.stringify(state);
  const baseline = assessInventoryHealth({ ...state, receipts: [] });
  const findings = assessInventoryHealth(state);
  const unrelated = (values: typeof findings) =>
    values.filter(
      (value) =>
        value.code !== "submission-stalled" ||
        value.subject !== `operation:${operation.key}`,
    );
  expect(unrelated(findings)).toEqual(unrelated(baseline));
  expect(findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: "unknown-failure", status: "active" }),
      expect.objectContaining({ code: "provider-circuit", status: "active" }),
      expect.objectContaining({ code: "budget-exhausted", status: "active" }),
      expect.objectContaining({ code: "deployment-stalled", status: "active" }),
      expect.objectContaining({ code: "receipt-invalid", status: "active" }),
    ]),
  );
  expect(JSON.stringify(state)).toBe(original);
});

test.each([
  { state_reason: "not_planned" },
  { body: "human-edited incident body" },
  { title: "Human incident title" },
  { user: { id: 1, type: "User" } },
  { pull_request: {} },
])(
  "historical recovery retains ordinary native incident protections: %j",
  async (patch) => {
    const { state, operation } = await finalizedProjectHealthFixture();
    const active = assessInventoryHealth({ ...state, receipts: [] }).find(
      (value) =>
        value.code === "submission-stalled" &&
        value.subject === `operation:${operation.key}`,
    )!;
    const created = planIncidentUpdates({
      findings: [active],
      existingIssues: [],
      publisherActorId: state.publisherActorId,
    })[0];
    const incident = {
      number: 905,
      state: "open",
      title: created.title,
      body: created.body,
      user: { id: state.publisherActorId, type: "Bot" },
    };
    Object.assign(incident, patch);
    const recovered = assessInventoryHealth(state).find(
      (value) => value.key === active.key,
    )!;
    expect(recovered.status).toBe("recovered");
    expect(
      planIncidentUpdates({
        findings: [recovered],
        existingIssues: [incident],
        publisherActorId: state.publisherActorId,
      }),
    ).toEqual([]);
  },
);

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

test("a classified retry closes its intact unknown-failure investigation", () => {
  const unknown = {
    ...operationFixture({
      retry: {
        failure: {
          kind: "unknown" as const,
          reasonCode: "unclassified-failure",
        },
        transientAttempts: 0,
        immediateAttempts: 3,
      },
    }),
    automatic: true,
  };
  const active = assessAutomationHealth({
    nowMs,
    operations: [unknown],
  }).find((finding) => finding.code === "unknown-failure")!;
  const created = planIncidentUpdates({
    findings: [active],
    existingIssues: [],
    publisherActorId: 41,
  })[0];
  const issue = {
    number: 860,
    title: created.title,
    body: created.body,
    state: "open",
    user: { id: 41, type: "Bot" },
  };
  const classified = {
    ...unknown,
    retry: {
      failure: {
        kind: "transient" as const,
        reasonCode: "provider-rate-limited",
      },
      transientAttempts: 1,
      immediateAttempts: 0,
    },
  };
  const unrelated = {
    ...operationFixture({
      identity: { ...unknown.identity, subject: "issue:43" },
      retry: unknown.retry,
    }),
    automatic: true,
  };
  const findings = assessAutomationHealth({
    nowMs,
    operations: [classified, unrelated],
  });
  expect(
    findings.find((finding) => finding.subject === active.subject),
  ).toMatchObject({
    key: active.key,
    status: "recovered",
    reason: "failure-classified",
  });
  expect(
    findings.find((finding) => finding.subject.endsWith(unrelated.key)),
  ).toMatchObject({
    code: "unknown-failure",
    status: "active",
    reason: "unclassified-failure",
  });
  expect(
    planIncidentUpdates({
      findings,
      existingIssues: [issue],
      publisherActorId: 41,
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ action: "close", number: 860 }),
      expect.objectContaining({ action: "create" }),
    ]),
  );
  expect(
    planIncidentUpdates({
      findings: [],
      existingIssues: [issue],
      publisherActorId: 41,
    }),
  ).toEqual([]);
});
test("known failure kinds resolve investigation without hiding active faults", () => {
  const operation = {
    ...operationFixture({ createdAt: before(72) }),
    automatic: true,
  };
  for (const [kind, reasonCode] of [
    ["transient", "provider-rate-limited"],
    ["configuration", "authentication-unavailable"],
    ["permanent", "authorization-lost"],
    ["superseded", "input-superseded"],
  ] as const) {
    const findings = assessAutomationHealth({
      nowMs,
      operations: [
        {
          ...operation,
          retry: {
            failure: { kind, reasonCode },
            transientAttempts: 1,
            immediateAttempts: 0,
          },
        },
      ],
      ...(kind === "configuration"
        ? {
            circuits: [
              {
                subject: "dependency:model-provider",
                reason: "authentication-unavailable",
                recovered: false,
              },
            ],
          }
        : {}),
    });
    expect(
      findings.find((finding) => finding.code === "unknown-failure"),
    ).toMatchObject({
      status: "recovered",
      reason: "failure-classified",
    });
    if (kind === "permanent")
      expect(
        findings.some((finding) => finding.code === "submission-stalled"),
      ).toBe(false);
    if (kind === "configuration")
      expect(
        findings.find((finding) => finding.code === "provider-circuit"),
      ).toMatchObject({
        status: "active",
        reason: "authentication-unavailable",
      });
  }
  const unknown = {
    ...operation,
    retry: {
      failure: { kind: "unknown" as const, reasonCode: "unclassified-failure" },
      transientAttempts: 0,
      immediateAttempts: 3,
    },
  };
  expect(
    assessAutomationHealth({ nowMs, operations: [unknown] }).find(
      (finding) => finding.code === "unknown-failure",
    ),
  ).toMatchObject({ status: "active", reason: "unclassified-failure" });
  expect(
    assessAutomationHealth({ nowMs, operations: [operation] }).some(
      (finding) => finding.code === "unknown-failure",
    ),
  ).toBe(false);
  expect(
    assessAutomationHealth({
      nowMs,
      operations: [{ ...operation, stage: "validated" }],
    }).find((finding) => finding.code === "unknown-failure"),
  ).toMatchObject({ status: "recovered", reason: "verified-recovery" });
  expect(
    assessAutomationHealth({ nowMs, operations: [] }).some(
      (finding) => finding.code === "unknown-failure",
    ),
  ).toBe(false);
});
test("provider and unknown failures use bounded reason codes, never raw diagnostics", () => {
  const operation = {
    ...operationFixture({
      retry: {
        failure: {
          kind: "unknown" as const,
          reasonCode: "unclassified-failure",
        },
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
