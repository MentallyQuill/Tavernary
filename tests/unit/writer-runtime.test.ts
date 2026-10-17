import { mkdtemp, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
  runModelWriterPreparation,
  runReconciledFinalization,
  runAutomationWriterReconciliation,
  selectWriterAdmissionReservations,
} from "../../scripts/automation/writer-runtime.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
} from "../../scripts/automation/model-budget.mjs";
import { persistPreparedFailure } from "../../scripts/automation/prepared-failure.mjs";
import { operationFixture } from "../helpers/automation-fixtures";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  preparedReplayFixture,
  diagnosticReplayFixture,
} from "../helpers/prepared-replay-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { AUTOMATION_KINDS } from "../../scripts/automation/operation.mjs";
import {
  preparedResultFixture,
  catalogInventoryFixture,
  AUTOMATION_NOW,
} from "../helpers/automation-fixtures";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import * as runtimeMaintenance from "../../scripts/automation/runtime-maintenance.mjs";
import * as siteWriterRuntime from "../../scripts/automation/site-writer-runtime.mjs";
import * as retention from "../../scripts/automation/retention.mjs";
import * as dependencyUpdate from "../../scripts/automation/dependency-update.mjs";
import * as incidents from "../../scripts/automation/incidents.mjs";
import * as restoreDrill from "../../scripts/automation/restore-drill.mjs";
import * as preparedPublication from "../../scripts/automation/prepared-publication.mjs";
import * as inventory from "../../scripts/automation/inventory.mjs";
import * as githubInventory from "../../scripts/automation/github-inventory.mjs";
import * as preparedReconciliation from "../../scripts/automation/prepared-reconciliation.mjs";
import * as reconcileCli from "../../scripts/automation/reconcile-cli.mjs";
import * as automationController from "../../scripts/automation/reconcile.mjs";
import { recoverInventoryWorker } from "../../scripts/automation/inventory-worker.mjs";
import type { AutomationOperation } from "../../scripts/automation/operation.mjs";
import { isDirectSubmissionKind } from "../../scripts/automation/submission-routing.mjs";

function genericKeys(operations: AutomationOperation[]) {
  return operations
    .filter((operation) => !isDirectSubmissionKind(operation.identity.kind))
    .map((operation) => operation.key);
}

function writerAdmissionFixture() {
  const base = preparedReplayFixture();
  base.receipt.operation.retry = {
    failure: { kind: "transient", reasonCode: "provider-rate-limited" },
    transientAttempts: 1,
    immediateAttempts: 0,
  };
  const backgrounds = Array.from({ length: 14 }, (_, index) => {
    const identity = {
      ...base.receipt.operation.identity,
      subject: `source:background-${index + 1}`,
    };
    return diagnosticReplayFixture(
      {
        ...base.receipt,
        updatedAt: "2026-10-14T16:19:00.000Z",
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
        },
      },
      base.run.id + index * 2,
      base.run.updated_at,
    );
  });
  const protectedOperations = [
    "project",
    "owner-request",
    "kit",
    "withdrawal",
    "report-import",
    "report-import",
  ].map((kind, index) =>
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: kind as AutomationOperation["identity"]["kind"],
        subject:
          kind === "report-import"
            ? `report:${index === 5 ? "narrative:" : ""}${"a".repeat(64)}`
            : `issue:${200 + index}`,
      },
      createdAt: new Date(
        base.state.nowMs - (100 - index) * 60_000,
      ).toISOString(),
    }),
  );
  const earlyOperations = Array.from({ length: 5 }, (_, index) =>
    operationFixture({
      identity: {
        ...operationFixture().identity,
        subject: `issue:${100 + index}`,
      },
      createdAt: new Date(base.state.nowMs - 1000).toISOString(),
    }),
  );
  const state: AutomationInventoryState = {
    ...base.state,
    operations: [
      ...backgrounds.map((fixture) => fixture.state.operations[0]),
      ...protectedOperations,
      ...earlyOperations,
    ],
    receipts: backgrounds.map((fixture) => structuredClone(fixture.receipt)),
    remote: {
      ...base.state.remote,
      runs: backgrounds.map((fixture) => fixture.run),
    },
  };
  const writes: AutomationReceipt[] = [];
  const load = vi.fn(async () => structuredClone(state));
  const loadDiagnostic = vi.fn(async () => structuredClone(state));
  const gh = Object.assign(
    vi.fn(async (args: string[]) => {
      const runId = Number(
        /\/actions\/runs\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
      );
      const fixture = backgrounds.find((value) => value.run.id === runId);
      if (!fixture) throw new Error("Unexpected native effect");
      return fixture.reader.gh(args);
    }),
    {
      download: vi.fn(async (args: string[]) => {
        const artifactId = Number(
          /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
        );
        const fixture = backgrounds.find(
          (value) => value.artifact.id === artifactId,
        );
        if (!fixture) throw new Error("Unexpected artifact read");
        return fixture.reader.download();
      }),
    },
  );
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      writes.push(structuredClone(receipt));
      state.operations = state.operations.map((operation) =>
        operation.key === receipt.operation.key
          ? structuredClone(receipt.operation)
          : operation,
      );
      const previous = state.receipts.findIndex(
        (value) => value.operation.key === receipt.operation.key,
      );
      if (previous === -1) state.receipts.push(structuredClone(receipt));
      else state.receipts[previous] = structuredClone(receipt);
    });
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockImplementation(async ({ operation }) => structuredClone(operation));
  const dispatch = vi
    .spyOn(inventory, "dispatchAutomationOperation")
    .mockResolvedValue({ workerRunId: 900 });
  const prepared = vi.spyOn(
    preparedReconciliation,
    "reconcilePreparedOperations",
  );
  const cli = vi.spyOn(reconcileCli, "runReconcileAutomationCli");
  const controller = vi.spyOn(automationController, "reconcileAutomation");
  const options = {
    load,
    loadDiagnostic,
    gh,
    env: {
      GITHUB_REPOSITORY: state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
    },
    earlyPhases: {
      loadEnrichmentRequest: vi.fn(
        async (): Promise<{ id: number } | null> => ({ id: 1 }),
      ),
      admitEnrichment: vi.fn(async () => ({
        status: "admitted",
        runId: 1,
        sha: state.local.revision,
      })),
      settleGeneration: vi.fn(async () => ({
        slots: 4,
        consumedKeys: earlyOperations
          .slice(0, 4)
          .map((operation) => operation.key),
        failures: 0,
      })),
      reconcileOwnerRequests: vi.fn(async () => ({
        status: "prepared",
        slots: 1,
        consumedKeys: [earlyOperations[4].key],
      })),
    },
  };
  return {
    state,
    backgrounds,
    protectedOperations,
    earlyOperations,
    writes,
    load,
    loadDiagnostic,
    gh,
    persist,
    revalidate,
    dispatch,
    prepared,
    cli,
    controller,
    options,
    restore: () => vi.restoreAllMocks(),
  };
}

function useWriterOperations(
  fixture: ReturnType<typeof writerAdmissionFixture>,
  operations: AutomationOperation[],
) {
  fixture.state.operations = operations;
  fixture.state.remote.runs = [];
  fixture.state.receipts = [];
  fixture.options.earlyPhases.loadEnrichmentRequest.mockResolvedValue(null);
  fixture.options.earlyPhases.settleGeneration.mockResolvedValue({
    slots: 0,
    consumedKeys: [],
    failures: 0,
  });
  fixture.options.earlyPhases.reconcileOwnerRequests.mockResolvedValue({
    status: "idle",
    slots: 0,
    consumedKeys: [],
  });
}

function addProtectedPreparedFixture(
  fixture: ReturnType<typeof writerAdmissionFixture>,
  index: number,
  variant: "missing" | "obsolete" | "diagnostic" | "publication",
) {
  const base = preparedReplayFixture();
  const operation = {
    ...fixture.protectedOperations[index],
    createdAt: base.receipt.operation.createdAt,
    retry: {
      failure: {
        kind: "transient" as const,
        reasonCode: "provider-rate-limited" as const,
      },
      transientAttempts: 1,
      immediateAttempts: 0,
    },
  };
  const prepared = diagnosticReplayFixture(
    {
      ...base.receipt,
      operation,
      updatedAt: ["missing", "obsolete"].includes(variant)
        ? new Date(fixture.state.nowMs).toISOString()
        : "2026-10-14T16:19:00.000Z",
    },
    base.run.id + 100 + index * 2,
    base.run.updated_at,
  );
  prepared.run.path = `.github/workflows/${{ kit: "apply-kit-submission", withdrawal: "apply-kit-withdrawal", "report-import": "import-tavernkeeper-reports" }[operation.identity.kind as "kit" | "withdrawal" | "report-import"]}.yml`;
  if (["missing", "publication"].includes(variant))
    prepared.run.conclusion = "success";
  if (variant === "publication")
    prepared.artifact.name = `automation-prepared-${operation.key}`;
  fixture.backgrounds.push(prepared);
  fixture.state.operations = fixture.state.operations.map((value) =>
    value.key === operation.key ? operation : value,
  );
  fixture.state.remote.runs.push(prepared.run);
  fixture.state.receipts.push(structuredClone(prepared.receipt));
  return prepared;
}

function writerPostEffectReloadFixture(
  phase: "enrichment" | "owner-request" | "runtime",
  failure: unknown,
) {
  const fixture = writerAdmissionFixture();
  const consumed = fixture.earlyOperations[0];
  const observation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:post-effect-observation",
    },
    createdAt: new Date(fixture.state.nowMs - 1000).toISOString(),
    workerRunId: 801,
  });
  fixture.state.operations = [consumed, observation];
  fixture.state.remote.runs = [];
  fixture.state.receipts = [];
  fixture.options.earlyPhases.loadEnrichmentRequest.mockResolvedValue(null);
  fixture.options.earlyPhases.settleGeneration.mockResolvedValue({
    slots: 0,
    consumedKeys: [],
    failures: 0,
  });
  fixture.options.earlyPhases.reconcileOwnerRequests.mockResolvedValue({
    status: "idle",
    slots: 0,
    consumedKeys: [],
  });
  if (phase === "enrichment")
    fixture.options.earlyPhases.loadEnrichmentRequest.mockResolvedValue({
      id: 1,
    });
  if (phase === "owner-request")
    fixture.options.earlyPhases.reconcileOwnerRequests.mockResolvedValue({
      status: "prepared",
      slots: 1,
      consumedKeys: [consumed.key],
    });
  const runtime = vi.spyOn(runtimeMaintenance, "runRuntimeWriter");
  if (phase === "runtime") {
    fixture.state.local.runtimePolicy = {};
    runtime.mockResolvedValue({
      status: "proposed",
      reason: "runtime-transition-available",
      decision: {
        action: "transition",
        healthy: true,
        reason: "runtime-transition-available",
        currentMajor: 24,
        candidateMajor: 26,
        supportEnds: "2028-04-30",
      },
    });
    vi.spyOn(restoreDrill, "loadRestoreDrillHealth").mockResolvedValue({
      status: "recovered",
    });
  }
  fixture.load
    .mockResolvedValueOnce(structuredClone(fixture.state))
    .mockRejectedValueOnce(failure);
  const before = JSON.stringify(fixture.state);
  const effect =
    phase === "enrichment"
      ? fixture.options.earlyPhases.admitEnrichment
      : phase === "owner-request"
        ? fixture.options.earlyPhases.reconcileOwnerRequests
        : runtime;
  return { ...fixture, phase, observation, before, effect };
}

test.each(["enrichment", "owner-request", "runtime"] as const)(
  "a genuine incomplete census after the %s effect stops all later writer work",
  async (phase) => {
    const failure = new githubInventory.GithubInventoryUnavailableError();
    const fixture = writerPostEffectReloadFixture(phase, failure);
    try {
      await expect(
        runAutomationWriterReconciliation(fixture.options),
      ).rejects.toBe(failure);
      expect(fixture.effect).toHaveBeenCalledOnce();
      expect(fixture.load).toHaveBeenCalledTimes(2);
      expect(fixture.controller).not.toHaveBeenCalled();
      expect(fixture.cli).not.toHaveBeenCalled();
      expect(fixture.persist).not.toHaveBeenCalled();
      expect(fixture.dispatch).not.toHaveBeenCalled();
      expect(fixture.revalidate).not.toHaveBeenCalled();
      expect(fixture.gh).not.toHaveBeenCalled();
      expect(JSON.stringify(fixture.state)).toBe(fixture.before);
      if (phase === "enrichment") {
        expect(
          fixture.options.earlyPhases.settleGeneration,
        ).not.toHaveBeenCalled();
        expect(
          fixture.options.earlyPhases.reconcileOwnerRequests,
        ).not.toHaveBeenCalled();
      }
      if (phase !== "runtime") expect(fixture.prepared).not.toHaveBeenCalled();
    } finally {
      fixture.restore();
    }
  },
);

test.each(["enrichment", "owner-request", "runtime"] as const)(
  "a genuine incomplete census after %s bypasses an unreadable error code",
  async (phase) => {
    const failure = new githubInventory.GithubInventoryUnavailableError();
    const code = vi.fn(() => {
      throw new Error("The branded error code must not be read");
    });
    Object.defineProperty(failure, "code", { get: code });
    const fixture = writerPostEffectReloadFixture(phase, failure);
    try {
      await expect(
        runAutomationWriterReconciliation(fixture.options),
      ).rejects.toBe(failure);
      expect(code).not.toHaveBeenCalled();
      expect(fixture.effect).toHaveBeenCalledOnce();
      expect(fixture.load).toHaveBeenCalledTimes(2);
      expect(fixture.controller).not.toHaveBeenCalled();
      expect(fixture.persist).not.toHaveBeenCalled();
      expect(fixture.dispatch).not.toHaveBeenCalled();
      expect(fixture.gh).not.toHaveBeenCalled();
      expect(JSON.stringify(fixture.state)).toBe(fixture.before);
    } finally {
      fixture.restore();
    }
  },
);

test.each([
  ["enrichment", "plain-code"],
  ["enrichment", "prototype-forgery"],
  ["owner-request", "plain-code"],
  ["owner-request", "prototype-forgery"],
  ["runtime", "plain-code"],
  ["runtime", "prototype-forgery"],
] as const)(
  "the %s catch retains ordinary degradation for a %s error",
  async (phase, variant) => {
    const failure = Object.assign(
      variant === "plain-code"
        ? new Error("Ordinary post-effect reload failure")
        : Object.create(
            githubInventory.GithubInventoryUnavailableError.prototype,
          ),
      {
        message: "Ordinary post-effect reload failure",
        code: "github-inventory-unavailable",
      },
    );
    expect(failure).not.toBeInstanceOf(
      githubInventory.GithubInventoryUnavailableError,
    );
    const fixture = writerPostEffectReloadFixture(phase, failure);
    try {
      const result = await runAutomationWriterReconciliation(fixture.options);
      expect(fixture.effect).toHaveBeenCalledOnce();
      expect(fixture.controller).toHaveBeenCalledOnce();
      expect(
        fixture.writes.some(
          (receipt) => receipt.operation.key === fixture.observation.key,
        ),
      ).toBe(true);
      const service = phase === "owner-request" ? "generationRequests" : phase;
      expect(result[service]).toMatchObject({ status: "unavailable" });
      if (phase === "owner-request")
        expect(result.generationRequests).toMatchObject({ slots: 0 });
    } finally {
      fixture.restore();
    }
  },
);

test("global reconciliation preserves report admissions while direct submissions release capacity for background results", async () => {
  const fixture = writerAdmissionFixture();
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      prepared: { consumedKeys: string[] };
      controller: { selectedKeys: string[] };
    };
    expect(result.prepared.consumedKeys).toHaveLength(12);
    expect(result.controller.selectedKeys).toEqual(
      genericKeys(fixture.protectedOperations),
    );
    expect(
      6 +
        result.prepared.consumedKeys.length +
        result.controller.selectedKeys.length,
    ).toBe(20);
    expect(fixture.prepared).toHaveBeenCalledOnce();
    expect(fixture.cli).toHaveBeenCalledOnce();
    expect(fixture.controller).toHaveBeenCalledOnce();
    expect(fixture.revalidate).toHaveBeenCalledTimes(2);
    expect(
      fixture.dispatch.mock.calls.map(([input]) => input.operation.key),
    ).toEqual(result.controller.selectedKeys);
    expect(
      fixture.gh.mock.calls.every(
        ([args]) =>
          args[0] === "api" &&
          args.some((value) => value.includes("/actions/runs/")),
      ),
    ).toBe(true);
  } finally {
    fixture.restore();
  }
});

test("writer reservations follow every zero-to-twenty prefix quota", () => {
  const operations = Array.from({ length: 30 }, (_, index) =>
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: index < 15 ? "project" : "report-import",
        subject: index < 15 ? `issue:${300 + index}` : `report:quota-${index}`,
      },
    }),
  );
  const reportCounts = [
    0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  ];
  for (let limit = 0; limit <= 20; limit++) {
    const selected = selectWriterAdmissionReservations(operations, {
      nowMs: Date.parse(operations[0].createdAt),
      limit,
    });
    expect(
      selected.filter((operation) => operation.identity.kind === "project"),
    ).toHaveLength(0);
    expect(
      selected.filter(
        (operation) => operation.identity.kind === "report-import",
      ),
    ).toHaveLength(reportCounts[limit]);
    expect(limit - selected.length).toBeGreaterThanOrEqual(limit ? 1 : 0);
  }
});

test("writer reservations preserve deterministic family ordering and all due gates", () => {
  const nowMs = preparedReplayFixture().state.nowMs;
  const initial = Array.from({ length: 7 }, (_, index) =>
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: index % 2 ? "kit" : "project",
        subject: `issue:${400 + index}`,
      },
      createdAt: new Date(nowMs - 1000).toISOString(),
    }),
  );
  const reports = Array.from({ length: 3 }, (_, index) =>
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "report-import",
        subject: `report:deterministic-${index}`,
      },
      createdAt: new Date(nowMs - 1000).toISOString(),
    }),
  );
  const sharedReport = operationFixture({
    identity: { ...reports[0].identity, subject: initial[0].identity.subject },
  });
  const operations = [...initial, ...reports, sharedReport];
  const options = { nowMs, limit: 20 };
  const selected = selectWriterAdmissionReservations(operations, options);
  expect(selected.map((operation) => operation.key)).toEqual(
    selectWriterAdmissionReservations([...operations].reverse(), options).map(
      (operation) => operation.key,
    ),
  );
  expect(
    selected.every((operation) => operation.identity.kind === "report-import"),
  ).toBe(true);
  expect(
    new Set(selected.map((operation) => operation.identity.subject)).size,
  ).toBe(selected.length);
  const blocked = { ...initial[0], workerRunId: 900 };
  const future = {
    ...initial[1],
    nextEligibleAt: new Date(nowMs + 1).toISOString(),
  };
  const boundary = {
    ...initial[2],
    nextEligibleAt: new Date(nowMs).toISOString(),
  };
  const eligible = selectWriterAdmissionReservations(
    [initial[0], blocked, future, boundary, ...initial.slice(3), ...reports],
    {
      ...options,
      consumedKeys: [initial[3].key],
      consumedSubjects: [reports[0].identity.subject],
    },
  );
  expect(eligible.map((operation) => operation.key)).not.toContain(
    initial[0].key,
  );
  expect(eligible.map((operation) => operation.key)).not.toContain(future.key);
  expect(eligible.map((operation) => operation.key)).not.toContain(
    boundary.key,
  );
  expect(eligible.map((operation) => operation.key)).not.toContain(
    initial[3].key,
  );
  expect(eligible.map((operation) => operation.key)).not.toContain(
    reports[0].key,
  );
  const invalid = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "advisory",
      subject: "source:invalid",
    },
    key: "0".repeat(64),
  });
  expect(() =>
    selectWriterAdmissionReservations([...operations, invalid], options),
  ).toThrow("invalid");
  expect(selectWriterAdmissionReservations([], options)).toEqual([]);
  expect(selectWriterAdmissionReservations([initial[0]], options)).toEqual([]);
  expect(selectWriterAdmissionReservations([reports[0]], options)).toEqual([
    reports[0],
  ]);
});

test("global admission retains truthful full inventory metrics for 1693 operations", async () => {
  const fixture = writerAdmissionFixture();
  fixture.state.operations.push(
    ...Array.from(
      { length: 1693 - fixture.state.operations.length },
      (_, index) =>
        operationFixture({
          identity: {
            ...operationFixture().identity,
            kind: "metadata",
            subject: `source:inventory-${index}`,
          },
          stage: index === 0 ? "finalized" : "admitted",
          nextEligibleAt: new Date(
            fixture.state.nowMs + 86400000,
          ).toISOString(),
          retry:
            index === 1
              ? {
                  failure: {
                    kind: "permanent",
                    reasonCode: "authorization-lost",
                  },
                  transientAttempts: 0,
                  immediateAttempts: 0,
                }
              : null,
        }),
    ),
  );
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      controller: {
        selectedKeys: string[];
        waiting: number;
        finished: number;
        permanentFailures: number;
        dispatched: number;
      };
    };
    expect(result.controller.selectedKeys).toEqual(
      genericKeys(fixture.protectedOperations),
    );
    expect(result.controller).toMatchObject({
      finished: 1,
      permanentFailures: 1,
      dispatched: 2,
    });
    expect(
      result.controller.waiting +
        result.controller.finished +
        result.controller.permanentFailures +
        result.controller.dispatched,
    ).toBe(1693);
    expect(await fixture.controller.mock.calls[0][0].inventory()).toHaveLength(
      1693,
    );
  } finally {
    fixture.restore();
  }
});

test("consumed subjects survive changed-key early reloads and spare observations remain bounded", async () => {
  const fixture = writerAdmissionFixture();
  fixture.state.operations = [
    ...fixture.earlyOperations,
    fixture.protectedOperations[4],
  ];
  fixture.state.remote.runs = [];
  fixture.state.receipts = [];
  for (const operation of fixture.earlyOperations)
    operation.createdAt = new Date(fixture.state.nowMs - 1000).toISOString();
  const unrelated = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:unrelated-observation",
    },
    workerRunId: 801,
    createdAt: new Date(fixture.state.nowMs - 1000).toISOString(),
  });
  fixture.state.operations.push(unrelated);
  let loads = 0;
  const replacements: AutomationOperation[] = [];
  fixture.load.mockImplementation(async () => {
    loads++;
    const state = structuredClone(fixture.state);
    state.operations = state.operations.map((operation) => {
      const index = fixture.earlyOperations.findIndex(
        (value) => value.key === operation.key,
      );
      if (index === -1 || loads < (index < 4 ? 3 : 4)) return operation;
      const identity = { ...operation.identity, inputDigest: "e".repeat(64) };
      const replacement = {
        ...operation,
        identity,
        key: operationKey(identity),
        workerRunId: 800 + index,
      };
      replacements.push(replacement);
      return replacement;
    });
    return state;
  });
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as { controller: { selectedKeys: string[] } };
    expect(result.controller.selectedKeys).toEqual([
      fixture.protectedOperations[4].key,
    ]);
    expect(
      fixture.controller.mock.calls[0][0].admissionPlan?.consumedSubjects,
    ).toEqual(
      fixture.earlyOperations.map((operation) => operation.identity.subject),
    );
    expect(
      fixture.writes.filter(
        (receipt) => receipt.operation.key === unrelated.key,
      ),
    ).toHaveLength(1);
    expect(
      fixture.writes.some((receipt) =>
        replacements.some(
          (operation) => operation.key === receipt.operation.key,
        ),
      ),
    ).toBe(false);
    expect(fixture.writes).toHaveLength(3);
    expect(fixture.load).toHaveBeenCalledTimes(4);
  } finally {
    fixture.restore();
  }
});

test.each(["missing", "obsolete", "diagnostic", "publication"] as const)(
  "protected prepared %s preserves its existing consumption and reload convention",
  async (variant) => {
    const fixture = writerAdmissionFixture();
    fixture.state.operations = [
      ...fixture.protectedOperations,
      ...fixture.earlyOperations,
    ];
    fixture.state.remote.runs = [];
    fixture.state.receipts = [];
    const prepared = addProtectedPreparedFixture(fixture, 2, variant);
    try {
      const result = (await runAutomationWriterReconciliation(
        fixture.options,
      )) as {
        prepared: {
          consumedKeys: string[];
          reloadRequired?: boolean;
          failures: number;
        };
        controller: { selectedKeys: string[] };
      };
      const consumed = ["diagnostic", "publication"].includes(variant);
      expect(result.prepared.consumedKeys).toEqual(
        consumed ? [prepared.receipt.operation.key] : [],
      );
      expect(result.prepared.failures).toBe(consumed ? 1 : 0);
      expect(result.prepared.reloadRequired).toBe(
        variant === "obsolete" ? true : undefined,
      );
      const remaining = fixture.protectedOperations
        .filter(
          (operation) =>
            operation.key !== prepared.receipt.operation.key &&
            !isDirectSubmissionKind(operation.identity.kind),
        )
        .map((operation) => operation.key);
      expect(result.controller.selectedKeys).toEqual(remaining);
      expect(fixture.load).toHaveBeenCalledTimes(
        { missing: 4, obsolete: 6, diagnostic: 7, publication: 6 }[variant],
      );
      expect(fixture.prepared).toHaveBeenCalledOnce();
      expect(fixture.controller).toHaveBeenCalledOnce();
      expect(
        fixture.writes.filter(
          (receipt) => receipt.operation.key === prepared.receipt.operation.key,
        ),
      ).toHaveLength(consumed ? 1 : 0);
      expect(
        fixture.gh.mock.calls.every(
          ([args]) =>
            args[0] === "api" &&
            args.some((value) => value.includes("/actions/runs/")),
        ),
      ).toBe(true);
    } finally {
      fixture.restore();
    }
  },
);

test("missing background artifacts leave generic backfill without an extra full reload", async () => {
  const fixture = writerAdmissionFixture();
  for (const prepared of fixture.backgrounds)
    prepared.run.conclusion = "success";
  for (const operation of fixture.state.operations) operation.retry = null;
  for (const receipt of fixture.state.receipts) receipt.operation.retry = null;
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      prepared: { consumedKeys: string[] };
      controller: { selectedKeys: string[] };
    };
    expect(result.prepared.consumedKeys).toEqual([]);
    expect(result.controller.selectedKeys.slice(0, 2)).toEqual(
      genericKeys(fixture.protectedOperations),
    );
    expect(result.controller.selectedKeys).toHaveLength(14);
    expect(fixture.load).toHaveBeenCalledTimes(4);
    expect(
      fixture.gh.mock.calls.filter(([args]) =>
        args.some((value) => value.includes("/artifacts")),
      ),
    ).toHaveLength(12);
  } finally {
    fixture.restore();
  }
});

test.each(["null", "changed-key", "future", "worker"] as const)(
  "global %s revalidation refuses one selected member without refill",
  async (variant) => {
    const fixture = writerAdmissionFixture();
    fixture.revalidate.mockImplementation(async ({ operation }) => {
      if (operation.key !== fixture.protectedOperations[4].key)
        return structuredClone(operation);
      if (variant === "null") return null;
      if (variant === "future")
        return {
          ...operation,
          nextEligibleAt: new Date(fixture.state.nowMs + 1).toISOString(),
        };
      if (variant === "worker") return { ...operation, workerRunId: 999 };
      const identity = { ...operation.identity, inputDigest: "f".repeat(64) };
      return { ...operation, identity, key: operationKey(identity) };
    });
    try {
      const result = (await runAutomationWriterReconciliation(
        fixture.options,
      )) as { controller: { selectedKeys: string[]; dispatched: number } };
      expect(result.controller.selectedKeys).toEqual(
        genericKeys(fixture.protectedOperations),
      );
      expect(result.controller.dispatched).toBe(1);
      expect(fixture.revalidate).toHaveBeenCalledTimes(2);
      expect(fixture.dispatch).toHaveBeenCalledTimes(1);
      expect(fixture.controller).toHaveBeenCalledOnce();
      expect(
        fixture.writes.some(
          (receipt) =>
            receipt.operation.key === fixture.protectedOperations[4].key,
        ),
      ).toBe(false);
    } finally {
      fixture.restore();
    }
  },
);

test.each(["success", "waiting", "throw"] as const)(
  "one global controller attempts one inline finalizer across protected and ordinary confirmations: %s",
  async (variant) => {
    const fixture = writerAdmissionFixture();
    const confirmed = [
      ...fixture.protectedOperations,
      ...Array.from({ length: 2 }, (_, index) =>
        operationFixture({
          identity: {
            ...operationFixture().identity,
            kind: "metadata",
            subject: `source:ordinary-confirmed-${index}`,
          },
          createdAt: new Date(fixture.state.nowMs - 1000).toISOString(),
        }),
      ),
    ].map((operation) => ({
      ...operation,
      stage: "deployment-confirmed" as const,
    }));
    useWriterOperations(fixture, confirmed);
    const finalize = vi.fn(async (operation: AutomationOperation) => {
      if (variant === "throw") throw new Error("Lost finalizer response");
      return {
        operation: {
          ...operation,
          stage:
            variant === "success"
              ? ("finalized" as const)
              : ("deployment-confirmed" as const),
        },
        waiting: variant === "waiting",
      };
    });
    try {
      const result = (await runAutomationWriterReconciliation({
        ...fixture.options,
        finalize,
      })) as { controller: { selectedKeys: string[]; dispatched: number } };
      expect(result.controller.selectedKeys).toHaveLength(4);
      expect(finalize).toHaveBeenCalledOnce();
      expect(fixture.dispatch).toHaveBeenCalledTimes(3);
      expect(fixture.controller).toHaveBeenCalledOnce();
      const finalizedKey = finalize.mock.calls[0][0].key;
      const writes = fixture.writes.filter(
        (receipt) => receipt.operation.key === finalizedKey,
      );
      expect(writes).toHaveLength(variant === "throw" ? 0 : 1);
      if (writes.length) expect(writes[0].operation.nextEligibleAt).toBeNull();
    } finally {
      fixture.restore();
    }
  },
);

test.each(AUTOMATION_KINDS)(
  "one due %s operation retains default global admission",
  async (kind) => {
    const fixture = writerAdmissionFixture();
    const operation = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind,
        subject: `maintenance:single-${kind}`,
      },
      createdAt: new Date(fixture.state.nowMs - 1000).toISOString(),
    });
    useWriterOperations(fixture, [operation]);
    try {
      const result = (await runAutomationWriterReconciliation(
        fixture.options,
      )) as { controller: { selectedKeys: string[]; dispatched: number } };
      expect(result.controller).toMatchObject({
        selectedKeys: isDirectSubmissionKind(kind) ? [] : [operation.key],
        dispatched: isDirectSubmissionKind(kind) ? 0 : 1,
      });
      expect(fixture.load).toHaveBeenCalledOnce();
      expect(fixture.dispatch).toHaveBeenCalledTimes(
        isDirectSubmissionKind(kind) ? 0 : 1,
      );
    } finally {
      fixture.restore();
    }
  },
);

test("reserved incident updates complete before an interrupted generic controller", async () => {
  const fixture = writerAdmissionFixture();
  useWriterOperations(fixture, [
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "metadata",
        subject: "source:health-check",
      },
    }),
  ]);
  fixture.state.local.runtimePolicy = {};
  vi.spyOn(restoreDrill, "loadRestoreDrillHealth").mockResolvedValue({
    status: "active",
  });
  const events: string[] = [];
  const health = vi
    .spyOn(incidents, "reconcileIncidentUpdates")
    .mockImplementation(async () => {
      events.push("health");
      return { status: "updated", number: 935 };
    });
  fixture.cli.mockImplementation(async () => {
    events.push("controller");
    throw new Error("simulated controller interruption");
  });
  try {
    await expect(
      runAutomationWriterReconciliation(fixture.options),
    ).rejects.toThrow("simulated controller interruption");
    expect(health).toHaveBeenCalledOnce();
    expect(health.mock.calls[0][0].availableSlots).toBe(1);
    expect(events).toEqual(["health", "controller"]);
    expect(fixture.cli.mock.calls[0][0]?.args).toEqual([
      "--apply",
      "--limit",
      "18",
    ]);
  } finally {
    fixture.restore();
  }
});

test("an unavailable reserved incident update does not block generic dispatch", async () => {
  const fixture = writerAdmissionFixture();
  useWriterOperations(fixture, [
    operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "metadata",
        subject: "source:health-check",
      },
    }),
  ]);
  fixture.state.local.runtimePolicy = {};
  vi.spyOn(restoreDrill, "loadRestoreDrillHealth").mockResolvedValue({
    status: "active",
  });
  const events: string[] = [];
  vi.spyOn(incidents, "reconcileIncidentUpdates").mockImplementation(
    async () => {
      events.push("health");
      throw new Error("incident API unavailable");
    },
  );
  fixture.dispatch.mockImplementation(async () => {
    events.push("dispatch");
    return { workerRunId: 900 };
  });
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      health: { status: string };
      controller: { dispatched: number };
    };
    expect(result.health.status).toBe("unavailable");
    expect(result.controller.dispatched).toBe(1);
    expect(events).toEqual(["health", "dispatch"]);
    expect(fixture.cli.mock.calls[0][0]?.args).toEqual([
      "--apply",
      "--limit",
      "18",
    ]);
  } finally {
    fixture.restore();
  }
});

test("all late services defer while six protected holds occupy the final seats", async () => {
  const fixture = writerAdmissionFixture();
  fixture.state.local.runtimePolicy = {};
  Object.assign(fixture.options.env, {
    TAVERNARY_IMMUTABLE_RELEASES_ENABLED: "true",
  });
  fixture.state.remote.pulls.push({
    number: 501,
    state: "open",
    user: { id: 49699333, type: "Bot" },
  } as AutomationInventoryState["remote"]["pulls"][number]);
  const terminal = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "refresh",
      subject: "source:retirement-demand",
    },
    stage: "finalized",
    expectedSha: "d".repeat(40),
    createdAt: new Date(fixture.state.nowMs - 120 * 86400000).toISOString(),
  });
  const completedAt = new Date(
    fixture.state.nowMs - 100 * 86400000,
  ).toISOString();
  fixture.state.operations.push(terminal);
  fixture.state.receipts.push({
    schema_version: 1,
    operation: terminal,
    updatedAt: completedAt,
    completedAt,
  });
  const resultFile = preparedResultFixture({
    operationKey: terminal.key,
    inputDigest: terminal.identity.inputDigest,
    policyVersion: terminal.identity.policyVersion,
  });
  fixture.state.local.publications = [
    {
      record: createCanonicalPublicationRecord({
        operation: terminal,
        result: resultFile,
      }),
      revision: terminal.expectedSha!,
    },
  ];
  fixture.state.local.confirmedRevisions = [terminal.expectedSha!];
  fixture.state.local.publicationFileDigests = Object.fromEntries(
    resultFile.files.map((file) => [
      `${terminal.expectedSha}:${file.path}`,
      file.sha256,
    ]),
  );
  const runtime = vi.spyOn(runtimeMaintenance, "runRuntimeWriter");
  const handoffs = vi.spyOn(siteWriterRuntime, "recoverSiteWriterHandoffs");
  const retirement = vi.spyOn(retention, "runAutomationStateRetention");
  const dependencies = vi.spyOn(dependencyUpdate, "runDependencyWriter");
  const health = vi.spyOn(incidents, "reconcileIncidentUpdates");
  vi.spyOn(restoreDrill, "loadRestoreDrillHealth").mockResolvedValue({
    status: "active",
  });
  try {
    expect(
      retention.planAutomationRetention({ state: fixture.state }).files,
    ).toHaveLength(1);
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      prepared: { consumedKeys: string[] };
      controller: { selectedKeys: string[] };
      runtime: unknown;
      retention: unknown;
      stateRetention: unknown;
      dependencies: unknown;
      health: unknown;
    };
    for (const service of [
      result.runtime,
      result.retention,
      result.stateRetention,
      result.dependencies,
      result.health,
    ])
      expect(service).toMatchObject({
        status: "waiting",
        reason: "operation-limit",
      });
    for (const service of [runtime, handoffs, retirement, dependencies, health])
      expect(service).not.toHaveBeenCalled();
    expect(
      6 +
        result.prepared.consumedKeys.length +
        result.controller.selectedKeys.length,
    ).toBe(20);
    expect(fixture.load).toHaveBeenCalledTimes(5);
    expect(result.controller.selectedKeys).toEqual(
      genericKeys(fixture.protectedOperations),
    );
  } finally {
    fixture.restore();
  }
});

test("a failed runtime service keeps its existing charge without spending protected holds", async () => {
  const fixture = writerAdmissionFixture();
  const removedKeys = new Set(
    fixture.backgrounds
      .slice(7)
      .map((prepared) => prepared.receipt.operation.key),
  );
  const removedRuns = new Set(
    fixture.backgrounds.slice(7).map((prepared) => prepared.run.id),
  );
  fixture.state.operations = fixture.state.operations.filter(
    (operation) => !removedKeys.has(operation.key),
  );
  fixture.state.remote.runs = fixture.state.remote.runs.filter(
    (run) => !removedRuns.has(run.id ?? 0),
  );
  fixture.state.receipts = fixture.state.receipts.filter(
    (receipt) => !removedKeys.has(receipt.operation.key),
  );
  fixture.state.local.runtimePolicy = {};
  vi.spyOn(restoreDrill, "loadRestoreDrillHealth").mockResolvedValue({
    status: "active",
  });
  const runtime = vi.spyOn(runtimeMaintenance, "runRuntimeWriter");
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      prepared: { consumedKeys: string[] };
      controller: { selectedKeys: string[] };
      runtime: { status: string };
      health: { status: string };
    };
    expect(result.runtime.status).toBe("unavailable");
    expect(runtime).toHaveBeenCalledOnce();
    expect(result.health.status).toBe("unavailable");
    expect(result.prepared.consumedKeys).toHaveLength(7);
    expect(result.controller.selectedKeys).toHaveLength(2);
    expect(
      6 +
        1 +
        result.prepared.consumedKeys.length +
        result.controller.selectedKeys.length,
    ).toBeLessThanOrEqual(20);
  } finally {
    fixture.restore();
  }
});

test.each([
  "absent",
  "changed-key",
  "future",
  "worker",
  "blocked-peer",
  "permanent",
  "finalized",
] as const)(
  "refreshed %s evidence releases only the exact protected hold",
  async (variant) => {
    const fixture = writerAdmissionFixture();
    const target = fixture.protectedOperations[4];
    fixture.load.mockImplementation(async () => {
      const state = structuredClone(fixture.state);
      if (fixture.load.mock.calls.length < 5) return state;
      state.operations = state.operations.flatMap((operation) => {
        if (operation.key !== target.key) return [operation];
        if (variant === "absent") return [];
        if (variant === "future")
          return [
            {
              ...operation,
              nextEligibleAt: new Date(state.nowMs + 1).toISOString(),
            },
          ];
        if (variant === "worker") return [{ ...operation, workerRunId: 800 }];
        if (variant === "blocked-peer")
          return [operation, { ...operation, workerRunId: 801 }];
        if (variant === "permanent")
          return [
            {
              ...operation,
              retry: {
                failure: {
                  kind: "permanent" as const,
                  reasonCode: "authorization-lost" as const,
                },
                transientAttempts: 0,
                immediateAttempts: 0,
              },
            },
          ];
        if (variant === "finalized")
          return [{ ...operation, stage: "finalized" as const }];
        const identity = { ...operation.identity, inputDigest: "f".repeat(64) };
        return [{ ...operation, identity, key: operationKey(identity) }];
      });
      return state;
    });
    try {
      const result = (await runAutomationWriterReconciliation(
        fixture.options,
      )) as { controller: { selectedKeys: string[] } };
      expect(result.controller.selectedKeys).not.toContain(target.key);
      expect(result.controller.selectedKeys.slice(0, 1)).toEqual(
        fixture.protectedOperations.slice(5).map((operation) => operation.key),
      );
      expect(result.controller.selectedKeys).toHaveLength(2);
      expect(fixture.controller).toHaveBeenCalledOnce();
      expect(fixture.load).toHaveBeenCalledTimes(5);
    } finally {
      fixture.restore();
    }
  },
);

test("prepared consumed subject identity survives the effect reload and excludes replacement observations", async () => {
  const fixture = writerAdmissionFixture();
  const background = fixture.backgrounds[0];
  const unrelated = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:spare-observation",
    },
    createdAt: new Date(fixture.state.nowMs - 1000).toISOString(),
    workerRunId: 801,
  });
  fixture.state.operations = [
    background.state.operations[0],
    fixture.protectedOperations[4],
    ...fixture.earlyOperations,
    unrelated,
  ];
  fixture.state.remote.runs = [background.run];
  fixture.state.receipts = [structuredClone(background.receipt)];
  const identity = {
    ...background.receipt.operation.identity,
    inputDigest: "f".repeat(64),
  };
  const replacementKey = operationKey(identity);
  fixture.load.mockImplementation(async () => {
    const state = structuredClone(fixture.state);
    if (fixture.load.mock.calls.length >= 5)
      state.operations = state.operations.map((operation) =>
        operation.key === background.receipt.operation.key
          ? { ...operation, identity, key: replacementKey, workerRunId: 802 }
          : operation,
      );
    return state;
  });
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as { controller: { selectedKeys: string[] } };
    expect(result.controller.selectedKeys).toEqual([
      fixture.protectedOperations[4].key,
    ]);
    expect(
      fixture.writes.filter(
        (receipt) => receipt.operation.key === background.receipt.operation.key,
      ),
    ).toHaveLength(1);
    expect(
      fixture.writes.some(
        (receipt) => receipt.operation.key === replacementKey,
      ),
    ).toBe(false);
    expect(
      fixture.writes.filter(
        (receipt) => receipt.operation.key === unrelated.key,
      ),
    ).toHaveLength(1);
    expect(fixture.writes).toHaveLength(4);
    expect(fixture.load).toHaveBeenCalledTimes(5);
  } finally {
    fixture.restore();
  }
});

test.each(["none", "initial", "report", "sparse"] as const)(
  "unused %s family reservations backfill the final ordinary plan",
  async (variant) => {
    const fixture = writerAdmissionFixture();
    const families =
      variant === "none"
        ? []
        : variant === "initial"
          ? fixture.protectedOperations.slice(0, 4)
          : variant === "report"
            ? fixture.protectedOperations.slice(4)
            : [fixture.protectedOperations[2], fixture.protectedOperations[4]];
    const ordinary = Array.from({ length: 24 }, (_, index) =>
      operationFixture({
        identity: {
          ...operationFixture().identity,
          kind: "metadata",
          subject: `source:backfill-${index}`,
        },
        createdAt: new Date(fixture.state.nowMs - 10_000).toISOString(),
      }),
    );
    useWriterOperations(fixture, [...ordinary, ...families]);
    try {
      const result = (await runAutomationWriterReconciliation(
        fixture.options,
      )) as { controller: { selectedKeys: string[] } };
      expect(
        result.controller.selectedKeys.slice(0, genericKeys(families).length),
      ).toEqual(genericKeys(families));
      expect(result.controller.selectedKeys).toHaveLength(20);
      expect(fixture.dispatch).toHaveBeenCalledTimes(20);
      expect(fixture.load).toHaveBeenCalledOnce();
    } finally {
      fixture.restore();
    }
  },
);

test("real native revalidation refreshes an active worker before the planner can grant authority", async () => {
  const input = catalogInventoryFixture();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: AUTOMATION_NOW,
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "d".repeat(40) },
    receipts: [],
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: input.evidence,
      metadataState: [],
      advisoryState: [],
      deployments: [],
      kits: [],
      blockedUsers: { blocked: [] },
      revision: "d".repeat(40),
    },
    operations: [],
  };
  state.operations = inventory.discoverAutomationState(state);
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  const previous = {
    id: 700,
    path: ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    display_title: `Automation ${operation.key}`,
    head_branch: "main",
    head_sha: "b".repeat(40),
    head_repository: { full_name: state.repository },
    actor: { id: state.publisherActorId, type: "Bot" },
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-07T11:55:00.000Z",
    updated_at: "2026-10-07T11:56:00.000Z",
  };
  state.remote.runs = [previous];
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find((argument) => argument.startsWith("repos/"))!;
    if (path.endsWith("/actions/runs/700"))
      return JSON.stringify({
        ...previous,
        status: "queued",
        conclusion: null,
      });
    if (path.endsWith("/actions/workflows/automation-worker.yml/runs"))
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    throw new Error(`Unexpected native route ${path}`);
  });
  const current = await inventory.revalidateAutomationOperation({
    state,
    operation,
    repository: state.repository,
    nowMs: state.nowMs,
    gh,
  });
  expect(current?.workerRunId).toBe(700);
  expect(gh).toHaveBeenCalledTimes(2);
});

test("waiting generation settlements retain attempted slot charges without consumed keys", async () => {
  const fixture = writerAdmissionFixture();
  fixture.options.earlyPhases.settleGeneration.mockResolvedValue({
    slots: 4,
    consumedKeys: [],
    failures: 0,
  });
  for (const operation of fixture.earlyOperations.slice(0, 4))
    operation.nextEligibleAt = new Date(fixture.state.nowMs + 1).toISOString();
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      generation: { slots: number; consumedKeys: string[] };
      prepared: { consumedKeys: string[] };
      controller: { selectedKeys: string[] };
    };
    expect(result.generation).toMatchObject({ slots: 4, consumedKeys: [] });
    expect(result.prepared.consumedKeys).toHaveLength(12);
    expect(result.controller.selectedKeys).toEqual(
      genericKeys(fixture.protectedOperations),
    );
    expect(
      1 +
        result.generation.slots +
        1 +
        result.prepared.consumedKeys.length +
        result.controller.selectedKeys.length,
    ).toBe(20);
    expect(fixture.load).toHaveBeenCalledTimes(4);
  } finally {
    fixture.restore();
  }
});

test("consumed identity falls back to an authenticated receipt when the current operation is absent", async () => {
  const fixture = writerAdmissionFixture();
  const consumed = fixture.earlyOperations[0];
  fixture.state.operations = [
    ...fixture.earlyOperations.slice(1),
    fixture.protectedOperations[4],
  ];
  fixture.state.remote.runs = [];
  fixture.state.receipts = [
    {
      schema_version: 1,
      operation: consumed,
      updatedAt: new Date(fixture.state.nowMs).toISOString(),
      completedAt: null,
    },
  ];
  const identity = { ...consumed.identity, inputDigest: "f".repeat(64) };
  const replacement = {
    ...consumed,
    identity,
    key: operationKey(identity),
    workerRunId: 800,
  };
  fixture.load.mockImplementation(async () => {
    const state = structuredClone(fixture.state);
    if (fixture.load.mock.calls.length >= 3) {
      state.operations.push(replacement);
      state.receipts = [];
    }
    return state;
  });
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as { controller: { selectedKeys: string[] } };
    expect(result.controller.selectedKeys).toEqual([
      fixture.protectedOperations[4].key,
    ]);
    expect(
      fixture.controller.mock.calls[0][0].admissionPlan?.consumedSubjects,
    ).toContain(consumed.identity.subject);
    expect(
      fixture.writes.some(
        (receipt) => receipt.operation.key === replacement.key,
      ),
    ).toBe(false);
  } finally {
    fixture.restore();
  }
});

test("ready Kit and factual and narrative report recipients consume exact seats even when real publication throws", async () => {
  const fixture = writerAdmissionFixture();
  fixture.state.operations = [
    ...fixture.protectedOperations,
    ...fixture.earlyOperations,
  ];
  fixture.state.remote.runs = [];
  fixture.state.receipts = [];
  const prepared = [2, 4, 5].map((index) =>
    addProtectedPreparedFixture(fixture, index, "publication"),
  );
  const publish = vi.spyOn(preparedPublication, "publishPreparedOperations");
  try {
    const result = (await runAutomationWriterReconciliation(
      fixture.options,
    )) as {
      prepared: { consumedKeys: string[]; published: number; failures: number };
      controller: { selectedKeys: string[] };
    };
    const requestedKeys = [
      ...prepared
        .slice(1)
        .sort((left, right) =>
          left.receipt.operation.key.localeCompare(right.receipt.operation.key),
        ),
      prepared[0],
    ].map((value) => value.receipt.operation.key);
    expect(result.prepared).toMatchObject({
      consumedKeys: requestedKeys,
      published: 0,
      failures: 3,
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(
      publish.mock.calls[0][0].wakes.map((wake) => wake.operationKey),
    ).toEqual(requestedKeys);
    expect(result.controller.selectedKeys).toEqual(
      fixture.protectedOperations
        .filter(
          (operation) =>
            !requestedKeys.includes(operation.key) &&
            !isDirectSubmissionKind(operation.identity.kind),
        )
        .map((operation) => operation.key),
    );
    expect(
      fixture.gh.mock.calls.every(
        ([args]) =>
          args[0] === "api" &&
          args.some((value) => value.includes("/actions/runs/")),
      ),
    ).toBe(true);
    expect(
      fixture.writes.filter((receipt) =>
        requestedKeys.includes(receipt.operation.key),
      ),
    ).toHaveLength(3);
  } finally {
    fixture.restore();
  }
});

test("a protected diagnostic persistence outage remains visible before controller admission", async () => {
  const fixture = writerAdmissionFixture();
  fixture.state.operations = [
    ...fixture.protectedOperations,
    ...fixture.earlyOperations,
  ];
  fixture.state.remote.runs = [];
  fixture.state.receipts = [];
  addProtectedPreparedFixture(fixture, 2, "diagnostic");
  fixture.persist.mockRejectedValue(
    new Error("Receipt persistence unavailable"),
  );
  try {
    await expect(
      runAutomationWriterReconciliation(fixture.options),
    ).rejects.toThrow("Receipt persistence unavailable");
    expect(fixture.persist).toHaveBeenCalledOnce();
    expect(fixture.prepared).toHaveBeenCalledOnce();
    expect(fixture.controller).not.toHaveBeenCalled();
    expect(fixture.dispatch).not.toHaveBeenCalled();
  } finally {
    fixture.restore();
  }
});

test("twenty obsolete diagnostics use independent scoped reads and retain the parent full reload", async () => {
  const base = preparedReplayFixture();
  base.receipt.operation.retry = {
    failure: { kind: "transient", reasonCode: "provider-rate-limited" },
    transientAttempts: 1,
    immediateAttempts: 0,
  };
  const fixtures = Array.from({ length: 20 }, (_, index) => {
    const identity = {
      ...base.receipt.operation.identity,
      subject: `source:github-${index + 1}:project-${index + 1}`,
    };
    return diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
        },
      },
      base.run.id + index * 2,
      base.run.updated_at,
    );
  });
  const state = {
    ...base.state,
    operations: fixtures.map((value) => value.state.operations[0]),
    receipts: fixtures.map((value) => value.receipt),
    remote: { ...base.state.remote, runs: fixtures.map((value) => value.run) },
  };
  const load = vi.fn(async () => structuredClone(state));
  const loadDiagnostic = vi.fn(async () => structuredClone(state));
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockResolvedValue(undefined);
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    async (args: string[]) => {
      const runId = Number(
        /\/actions\/runs\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
      );
      const fixture = fixtures.find((value) => value.run.id === runId);
      if (!fixture) throw new Error("No other remote effects expected");
      return fixture.reader.gh(args);
    },
    {
      download: async (args: string[]) => {
        const artifactId = Number(
          /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
        );
        return fixtures
          .find((value) => value.artifact.id === artifactId)!
          .reader.download();
      },
    },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load,
      loadDiagnostic,
      gh,
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      },
    } as Parameters<typeof runAutomationWriterReconciliation>[0]);
    expect(result.prepared).toMatchObject({
      failures: 0,
      consumedKeys: [],
      reloadRequired: true,
    });
    expect(loadDiagnostic).toHaveBeenCalledTimes(20);
    expect(load).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test("twenty equal-clock diagnostics each reread failure authority and retain exact new counters and deadlines", async () => {
  const base = preparedReplayFixture();
  base.receipt.updatedAt = base.run.updated_at;
  base.receipt.operation.retry!.transientAttempts = 1;
  base.receipt.operation.retry!.immediateAttempts = 2;
  const fixtures = Array.from({ length: 20 }, (_, index) => {
    const identity = {
      ...base.receipt.operation.identity,
      subject: `source:github-${index + 1}:project-${index + 1}`,
    };
    return diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
        },
      },
      base.run.id + index * 2,
      base.run.updated_at,
    );
  });
  const state = {
    ...base.state,
    operations: fixtures.map((value) => value.state.operations[0]),
    receipts: fixtures.map((value) => value.receipt),
    remote: { ...base.state.remote, runs: fixtures.map((value) => value.run) },
  };
  const load = vi.fn(async () => structuredClone(state));
  const loadDiagnostic = vi.fn(async () => structuredClone(state));
  const writes: AutomationReceipt[] = [];
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      writes.push(receipt);
      state.receipts = state.receipts.map((value) =>
        value.operation.key === receipt.operation.key ? receipt : value,
      );
      state.operations = state.operations.map((value) =>
        value.key === receipt.operation.key ? receipt.operation : value,
      );
    });
  const gh = Object.assign(
    async (args: string[]) => {
      const runId = Number(
        /\/actions\/runs\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
      );
      const fixture = fixtures.find((value) => value.run.id === runId);
      if (!fixture) throw new Error("No other remote effects expected");
      return fixture.reader.gh(args);
    },
    {
      download: async (args: string[]) => {
        const artifactId = Number(
          /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
        );
        return fixtures
          .find((value) => value.artifact.id === artifactId)!
          .reader.download();
      },
    },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load,
      loadDiagnostic,
      gh,
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      },
    });
    expect(result.prepared).toMatchObject({
      failures: 20,
      consumedKeys: fixtures.map((value) => value.receipt.operation.key).sort(),
    });
    expect(loadDiagnostic).toHaveBeenCalledTimes(40);
    expect(writes).toHaveLength(20);
    for (const receipt of writes)
      expect(receipt).toMatchObject({
        updatedAt: new Date(state.nowMs).toISOString(),
        operation: {
          retry: {
            failure: { kind: "unknown", reasonCode: "unclassified-failure" },
            transientAttempts: 2,
            immediateAttempts: 3,
          },
          nextEligibleAt: "2026-10-17T00:25:23.917Z",
        },
      });
  } finally {
    persist.mockRestore();
  }
});

test.each(["missing", "corrupt"])(
  "an unverifiable %s diagnostic artifact keeps both comparison and ordinary failure on full authority",
  async (variant) => {
    const input = preparedReplayFixture();
    input.state.operations[0].retry!.immediateAttempts = 1;
    input.state.receipts[0].operation.retry!.immediateAttempts = 1;
    const load = vi.fn(async () => structuredClone(input.state));
    const loadDiagnostic = vi.fn(async () => structuredClone(input.state));
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) =>
            value.includes(`/actions/runs/${input.run.id}/artifacts`),
          )
        )
          return variant === "missing"
            ? JSON.stringify([{ total_count: 0, artifacts: [] }])
            : input.reader.gh(args);
        if (
          args.some((value) => value.endsWith(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      {
        download:
          variant === "corrupt"
            ? async () => new Uint8Array([0, 1])
            : input.reader.download,
      },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        loadDiagnostic,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toMatchObject({
        failures: 1,
        consumedKeys: [input.receipt.operation.key],
      });
      expect(loadDiagnostic).not.toHaveBeenCalled();
      expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(persist).toHaveBeenCalledOnce();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test.each(["comparison", "persistence"])(
  "a scoped %s outage stays visible without fabricating a producer failure",
  async (phase) => {
    const input = preparedReplayFixture();
    input.state.receipts[0].updatedAt = input.run.updated_at;
    let observations = 0;
    const loadDiagnostic = vi.fn(async () => {
      observations++;
      if (phase === "comparison" || observations === 2)
        throw new Error("Fresh scoped inspection unavailable");
      return structuredClone(input.state);
    });
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) => value.includes(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      { download: input.reader.download },
    );
    try {
      await expect(
        runAutomationWriterReconciliation({
          load: async () => structuredClone(input.state),
          loadDiagnostic,
          gh,
          env: {
            GITHUB_REPOSITORY: input.state.repository,
            GITHUB_REF: "refs/heads/main",
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_ACTOR_ID: "2625904",
            GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
            TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
          },
        }),
      ).rejects.toThrow("Fresh scoped inspection unavailable");
      expect(observations).toBe(phase === "comparison" ? 1 : 2);
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
    }
  },
);

test.each(["kit", "withdrawal", "enrichment", "report-import"] as const)(
  "the unsupported %s collector family keeps full runtime comparison authority",
  async (kind) => {
    const base = preparedReplayFixture();
    const identity = { ...base.receipt.operation.identity, kind };
    const input = diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
          retry: {
            failure: { kind: "transient", reasonCode: "provider-rate-limited" },
            transientAttempts: 1,
            immediateAttempts: 0,
          },
        },
      },
      base.run.id,
      base.run.updated_at,
    );
    input.run.path = `.github/workflows/${{ kit: "apply-kit-submission", withdrawal: "apply-kit-withdrawal", enrichment: "enrich-catalog", "report-import": "import-tavernkeeper-reports" }[kind]}.yml`;
    const load = vi.fn(async () => structuredClone(input.state));
    const loadDiagnostic = vi.fn(async () => structuredClone(input.state));
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) => value.includes(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      { download: input.reader.download },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        loadDiagnostic,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toMatchObject({
        failures: 0,
        consumedKeys: [],
        reloadRequired: true,
      });
      expect(loadDiagnostic).not.toHaveBeenCalled();
      expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test("a lost successful failure-write response can later be superseded by its newer canonical decision", async () => {
  const input = preparedReplayFixture();
  input.receipt.updatedAt = "2026-10-14T16:19:00.000Z";
  input.receipt.operation.retry!.immediateAttempts = 2;
  input.receipt.operation.retry!.transientAttempts = 1;
  input.state.receipts = [structuredClone(input.receipt)];
  input.state.operations = [structuredClone(input.receipt.operation)];
  recoverInventoryWorker(
    input.state.operations[0],
    { ...input.state, runs: [input.run] },
    [],
  );
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      input.state.receipts = [structuredClone(receipt)];
      input.state.operations = [structuredClone(receipt.operation)];
      throw new Error("Successful write response lost");
    });
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    vi.fn(async (args: string[]) => {
      if (
        args.some((argument) =>
          argument.includes(`/actions/runs/${input.run.id}`),
        )
      )
        return input.reader.gh(args);
      throw new Error("No dispatch expected");
    }),
    { download: input.reader.download },
  );
  const options = {
    load: async () => structuredClone(input.state),
    gh,
    env: {
      GITHUB_REPOSITORY: input.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
    },
  };
  try {
    await expect(runAutomationWriterReconciliation(options)).rejects.toThrow(
      "Successful write response lost",
    );
    expect(input.state.receipts[0].operation.retry).toMatchObject({
      immediateAttempts: 3,
      transientAttempts: 2,
    });
    input.state.nowMs = Date.parse(input.state.operations[0].nextEligibleAt!);
    recoverInventoryWorker(
      input.state.operations[0],
      { ...input.state, runs: [input.run] },
      [],
    );
    const before = JSON.stringify(input.state.receipts);
    const result = await runAutomationWriterReconciliation(options);
    expect(result.prepared).toMatchObject({
      failures: 0,
      consumedKeys: [],
      reloadRequired: true,
    });
    expect(result.controller).toMatchObject({
      selectedKeys: [input.receipt.operation.key],
      dispatched: 0,
    });
    expect(JSON.stringify(input.state.receipts)).toBe(before);
    expect(persist).toHaveBeenCalledOnce();
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test("a new unknown producer after its prior receipt still reaches the daily incident threshold in the actual writer", async () => {
  const input = preparedReplayFixture();
  input.receipt.operation.retry!.immediateAttempts = 2;
  input.receipt.operation.retry!.transientAttempts = 1;
  input.state.receipts = [structuredClone(input.receipt)];
  input.state.operations = [structuredClone(input.receipt.operation)];
  input.state.receipts[0].updatedAt = "2026-10-16T09:45:00.000Z";
  input.state.receipts[0].operation.nextEligibleAt = "2026-10-16T10:00:26.370Z";
  input.state.operations = [structuredClone(input.state.receipts[0].operation)];
  input.run.updated_at = "2026-10-16T10:06:00.000Z";
  input.run.created_at = "2026-10-16T10:05:00.000Z";
  input.state.nowMs = Date.parse("2026-10-16T12:00:00.000Z");
  recoverInventoryWorker(
    input.state.operations[0],
    { ...input.state, runs: [input.run] },
    [],
  );
  expect(input.state.operations[0].nextEligibleAt).toBeNull();
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      input.state.receipts = [structuredClone(receipt)];
      input.state.operations = [structuredClone(receipt.operation)];
    });
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    vi.fn(async (args: string[]) => {
      if (
        args.some((argument) =>
          argument.includes(`/actions/runs/${input.run.id}`),
        )
      )
        return input.reader.gh(args);
      throw new Error("No dispatch expected");
    }),
    { download: input.reader.download },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load: async () => structuredClone(input.state),
      gh,
      env: {
        GITHUB_REPOSITORY: input.state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
      },
    });
    expect(result.prepared).toMatchObject({
      failures: 1,
      consumedKeys: [input.receipt.operation.key],
    });
    expect(input.state.receipts[0]).toMatchObject({
      operation: {
        retry: {
          failure: { kind: "unknown", reasonCode: "unclassified-failure" },
          immediateAttempts: 3,
          transientAttempts: 2,
        },
        nextEligibleAt: "2026-10-17T12:00:00.000Z",
      },
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(revalidate).not.toHaveBeenCalled();
    expect(result.controller).toMatchObject({
      dispatched: 0,
      selectedKeys: [],
    });
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test.each(["due", "future", "permanent", "head"])(
  "the actual writer reloads an obsolete no-effect result before guarded %s selection",
  async (freshDecision) => {
    const input = preparedReplayFixture();
    let loads = 0;
    const load = vi.fn(async () => {
      const state = structuredClone(input.state);
      loads++;
      if (loads >= 3) {
        if (freshDecision === "future")
          state.operations[0].nextEligibleAt = "2026-10-17T00:25:23.917Z";
        if (freshDecision === "permanent") {
          state.operations[0].retry!.failure = {
            kind: "permanent",
            reasonCode: "authorization-lost",
          };
          state.operations[0].nextEligibleAt = null;
        }
        if (freshDecision === "head")
          state.operations[0].expectedSha = "c".repeat(40);
        state.receipts[0].operation = structuredClone(state.operations[0]);
      }
      state.local.observedLoad = loads;
      return state;
    });
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      vi.fn(async (args: string[]) => {
        if (
          args.some((argument) =>
            argument.includes(`/actions/runs/${input.run.id}`),
          )
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      }),
      { download: input.reader.download },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toEqual({
        published: 0,
        recovered: 0,
        failures: 0,
        consumedKeys: [],
        reloadRequired: true,
      });
      expect(result.controller).toMatchObject({
        selectedKeys: ["due", "head"].includes(freshDecision)
          ? [input.receipt.operation.key]
          : [],
        dispatched: 0,
      });
      if (["due", "head"].includes(freshDecision))
        expect(revalidate).toHaveBeenCalledWith(
          expect.objectContaining({
            state: expect.objectContaining({
              local: expect.objectContaining({ observedLoad: 3 }),
            }),
            operation: expect.objectContaining({
              expectedSha: freshDecision === "head" ? "c".repeat(40) : null,
            }),
          }),
        );
      else expect(revalidate).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test("inline finalization recovers the actual terminal receipt after its successful write loses the response", async () => {
  const operation = operationFixture({
    identity: { ...operationFixture().identity, kind: "metadata" },
    stage: "deployment-confirmed",
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 317929880,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    receipts: [],
    operations: [operation],
    local: { revision: "b".repeat(40) },
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
  };
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    state.operations = [receipt.operation];
    state.receipts = [receipt];
    throw Object.assign(new Error("Terminal write response lost."), {
      status: 503,
    });
  });
  const gh = vi.fn(async () => {
    throw new Error("No external metadata lifecycle mutation required.");
  });
  const result = await runReconciledFinalization({
    operationKey: operation.key,
    load: async () => structuredClone(state),
    persist,
    gh,
    env: {
      GITHUB_REPOSITORY: state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    },
  });
  expect(result).toMatchObject({
    operation: { key: operation.key, stage: "finalized", retry: null },
    waiting: false,
  });
  expect(persist).toHaveBeenCalledOnce();
  expect(gh).not.toHaveBeenCalled();
});

test("the writer checks normalized cache before reserving any allowance", async () => {
  const fixture = await metadataMaintenanceFixture({ unchanged: true });
  const commit = vi.fn(async () => ({ sha: "c".repeat(40) }));
  const dispatchCached = vi.fn(async () => ({
    runId: 701,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const result = await runModelWriterPreparation({
    operationKey: fixture.operation.key,
    load: async () => fixture.state,
    commit,
    dispatchCached,
    metadataCached: async (input) => {
      const { metadataObservationIsCached } =
        await import("../../scripts/automation/metadata-preparation.mjs");
      return metadataObservationIsCached({
        ...input,
        observation: await fixture.observe(),
      });
    },
    env: {
      GITHUB_REPOSITORY: fixture.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${fixture.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(fixture.state.publisherActorId),
    },
  });
  expect(result.status).toBe("cache-dispatched");
  expect(commit).not.toHaveBeenCalled();
  expect(dispatchCached).toHaveBeenCalledOnce();
});

test("writer budget refusal records a durable daily retry without dispatch or budget mutation", async () => {
  const fixture = await metadataMaintenanceFixture();
  const reservation = reserveModelBudget(
    createModelBudgetState(fixture.state.nowMs),
    {
      operationKey: "c".repeat(64),
      model: "primary",
      requestCount: 40,
      requestedTokens: 200000,
    },
    { nowMs: fixture.state.nowMs },
  );
  if (!reservation.allowed) throw new Error("Fixture reservation failed");
  fixture.state.local.modelBudget = reservation.state;
  const commit = vi.fn(async () => ({ sha: "c".repeat(40) }));
  const dispatch = vi.fn(async () => ({
    runId: 701,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const receipt = vi.fn(
    async (value: { operation: typeof fixture.operation }) => {
      fixture.state.operations = [value.operation];
    },
  );
  const outcome = await runModelWriterPreparation({
    operationKey: fixture.operation.key,
    load: async () => fixture.state,
    commit,
    dispatch,
    metadataCached: async () => false,
    persistFailure: async (error) => {
      await persistPreparedFailure({
        operationKey: fixture.operation.key,
        load: async () => fixture.state,
        persist: receipt,
        error,
      });
    },
    env: {
      GITHUB_REPOSITORY: fixture.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${fixture.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(fixture.state.publisherActorId),
      UTILITY_MODEL: "primary",
    },
  });
  expect(outcome.status).toBe("waiting");
  expect(commit).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(receipt).toHaveBeenCalledOnce();
  expect(fixture.state.operations[0].retry?.failure.reasonCode).toBe(
    "budget-exhausted",
  );
  expect(
    Date.parse(fixture.state.operations[0].nextEligibleAt!) -
      fixture.state.nowMs,
  ).toBe(86400000);
});

test("the actual writer mode commits primary and repair reservations before authenticated dispatch", async () => {
  const operation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:github-42:example-project",
    },
    stage: "admitted",
    expectedSha: null,
  });
  const env = {
    GITHUB_REPOSITORY: "Owner/Repo",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF:
      "Owner/Repo/.github/workflows/automation-writer.yml@refs/heads/main",
    GITHUB_RUN_ID: "800",
    GITHUB_RUN_ATTEMPT: "1",
    TAVERNARY_PUBLISHER_BOT_ID: "41",
    UTILITY_MODEL: "primary",
    TAVERNARY_ENRICHMENT_MODEL: "repair",
  };
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  let budget = createModelBudgetState(nowMs);
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    budget = JSON.parse(input.files[0].content);
    return { sha: "c".repeat(40) };
  });
  const dispatch = vi.fn(async () => ({
    runId: 700,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const load = async () => ({
    root: process.cwd(),
    repository: "Owner/Repo",
    publisherActorId: 41,
    nowMs,
    remote: { mainHeadSha: "b".repeat(40), issues: [], pulls: [], runs: [] },
    local: { revision: "b".repeat(40), modelBudget: budget },
    receipts: [],
    operations: [operation],
  });
  expect(
    (
      await runModelWriterPreparation({
        operationKey: operation.key,
        env,
        load,
        commit,
        dispatch,
        metadataCached: async () => false,
      })
    ).status,
  ).toBe("dispatched");
  expect(commit).toHaveBeenCalledTimes(2);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(budget.days[0]).toMatchObject({ requests: 4, tokens: 195000 });
  expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
    dispatch.mock.invocationCallOrder[0],
  );
});
test("writer synchronization fetches trusted main without exposing or persisting its scoped token", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-writer-"));
  const calls: Array<{ args: string[]; askpass?: string }> = [];
  const run = vi.fn(
    async (
      _command: string,
      args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      calls.push({ args, askpass: options.env.GIT_ASKPASS });
      if (args[0] === "fetch") await access(options.env.GIT_ASKPASS!);
      return "";
    },
  );
  try {
    await synchronizeWriterCheckout({
      root,
      env: {
        GITHUB_REPOSITORY: "Owner/Repo",
        GH_TOKEN: "private-scoped-token",
        RUNNER_TEMP: root,
      },
      run,
    });
    expect(calls.map((call) => call.args)).toContainEqual([
      "fetch",
      "--no-tags",
      "https://github.com/Owner/Repo.git",
      "main",
    ]);
    expect(JSON.stringify(calls)).not.toContain("private-scoped-token");
    await expect(
      access(calls.find((call) => call.askpass)?.askpass!),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("writer synchronization refuses to replace a checkout with tracked local changes", async () => {
  const run = vi.fn(async () => " M data/registry/projects/example.json\n");
  await expect(
    synchronizeWriterCheckout({
      root: process.cwd(),
      env: { GITHUB_REPOSITORY: "Owner/Repo", GH_TOKEN: "secret" },
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

test("writer defers when trusted code, schemas or policy changed after its process started", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-writer-policy-"));
  const run = vi.fn(async (_command: string, args: string[]) =>
    args[0] === "diff"
      ? "data/vocabularies/tags.json\nscripts/catalog/enrichment-provider.mjs\n"
      : "",
  );
  try {
    await expect(
      synchronizeWriterCheckout({
        root,
        env: {
          GITHUB_REPOSITORY: "Owner/Repo",
          GH_TOKEN: "secret",
          RUNNER_TEMP: root,
        },
        run,
      }),
    ).rejects.toMatchObject({ code: "input-superseded" });
    expect(run.mock.calls.some((call) => call[1][0] === "checkout")).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("artifact download is bounded, binary, and restricted to the known GitHub artifact API", async () => {
  const run = vi.fn(async () => Buffer.from([1, 2, 3]));
  const args = ["api", "repos/Owner/Repo/actions/artifacts/42/zip"];
  expect(await downloadPreparedArtifact(args, { run })).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(run).toHaveBeenCalledWith(
    "gh",
    args,
    expect.objectContaining({
      encoding: "buffer",
      maxBuffer: 33_554_432,
      timeout: 120_000,
    }),
  );
  await expect(
    downloadPreparedArtifact(["api", "https://foreign.invalid/artifact"], {
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});
