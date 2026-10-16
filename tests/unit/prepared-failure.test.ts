import { expect, test, vi } from "vitest";
import {
  persistPreparedFailure,
  isPreparedDiagnosticObsolete,
} from "../../scripts/automation/prepared-failure.mjs";
import { loadPreparedGithubDiagnosticEvidence } from "../../scripts/automation/prepared-github.mjs";
import {
  preparedReplayFixture,
  auditedRefreshReplayFixtures,
} from "../helpers/prepared-replay-fixtures";
import {
  AUTOMATION_NOW,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import { GithubInventoryUnavailableError } from "../../scripts/automation/github-inventory.mjs";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";

test("an actual writer preflight outage cannot be laundered by a successful second inventory load", async () => {
  const operation = operationFixture();
  const state = {
    operations: [operation],
    nowMs: AUTOMATION_NOW,
  } as AutomationInventoryState;
  const before = JSON.stringify(state);
  const error = new GithubInventoryUnavailableError();
  const load = vi
    .fn<() => Promise<AutomationInventoryState>>()
    .mockRejectedValueOnce(error)
    .mockResolvedValue(state);
  const gh = vi.fn(async () => {
    throw new Error("Unexpected receipt or native effect");
  });
  const commit = vi.fn(async () => ({ sha: "c".repeat(40) }));
  const dispatch = vi.fn(async () => ({
    runId: 701,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const metadataCached = vi.fn(async () => false);
  await expect(
    runModelWriterPreparation({
      operationKey: operation.key,
      load,
      gh,
      commit,
      dispatch,
      dispatchCached: dispatch,
      metadataCached,
      env: {
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
        GITHUB_RUN_ID: "800",
        GITHUB_RUN_ATTEMPT: "1",
      },
    }),
  ).rejects.toBe(error);
  expect(load).toHaveBeenCalledOnce();
  expect(gh).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(metadataCached).not.toHaveBeenCalled();
  expect(JSON.stringify(state)).toBe(before);
});

test.each([undefined, "finalization"] as const)(
  "a branded inventory preflight failure skips reload and persistence (%s)",
  async (phase) => {
    const input = fixture();
    const load = vi.fn(input.load);
    const before = JSON.stringify(await input.load());
    expect(
      await persistPreparedFailure({
        ...input,
        load,
        phase,
        error: new GithubInventoryUnavailableError(),
      }),
    ).toEqual({ persisted: false, incident: false });
    expect(load).not.toHaveBeenCalled();
    expect(input.persist).not.toHaveBeenCalled();
    expect(JSON.stringify(await input.load())).toBe(before);
  },
);

test("only actual internally constructed inventory errors receive the preflight exemption", async () => {
  const genuine = new GithubInventoryUnavailableError();
  const hostile = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("Unexpected prototype read");
      },
    },
  );
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  expect(genuine).toBeInstanceOf(Error);
  expect(genuine instanceof GithubInventoryUnavailableError).toBe(true);
  for (const value of [
    { code: "github-inventory-unavailable" },
    Object.create(GithubInventoryUnavailableError.prototype),
    hostile,
    revoked.proxy,
    null,
    "github-inventory-unavailable",
  ])
    expect(value instanceof GithubInventoryUnavailableError).toBe(false);
});

test.each([
  { code: "github-inventory-unavailable" },
  {
    failure: { kind: "transient", reasonCode: "github-inventory-unavailable" },
  },
  Object.create(GithubInventoryUnavailableError.prototype),
])(
  "plain or prototype-forged inventory errors still follow ordinary failure persistence (%#)",
  async (error) => {
    const input = fixture();
    const load = vi.fn(input.load);
    const outcome = await persistPreparedFailure({ ...input, load, error });
    expect(outcome).toEqual({ persisted: true, incident: false });
    expect(load).toHaveBeenCalledOnce();
    expect(input.persist).toHaveBeenCalledOnce();
  },
);

test("a branded inventory failure does not bypass operation-key validation", async () => {
  const input = fixture();
  const load = vi.fn(input.load);
  await expect(
    persistPreparedFailure({
      ...input,
      load,
      operationKey: "invalid",
      error: new GithubInventoryUnavailableError(),
    }),
  ).rejects.toThrow("key is invalid");
  expect(load).not.toHaveBeenCalled();
  expect(input.persist).not.toHaveBeenCalled();
});

test("the verified old #900 failure is strictly obsolete at its saved daily probe deadline", async () => {
  const input = preparedReplayFixture();
  const evidence = await loadPreparedGithubDiagnosticEvidence(input.reader);
  const before = JSON.stringify(input.state);
  expect(isPreparedDiagnosticObsolete({ state: input.state, evidence })).toBe(
    true,
  );
  expect(JSON.stringify(input.state)).toBe(before);
});

test.each([
  "equal-clock",
  "newer-producer",
  "missing-archive",
  "missing-attempt",
  "rerun",
  "late-controlled",
  "different-reason",
  "foreign-kind",
  "foreign-actor",
  "foreign-head",
  "observed-native-origin",
  "changed-input",
  "changed-stage",
  "changed-counters",
  "changed-deadline",
  "current-worker",
  "receipt-worker",
  "active-preparation",
  "unresolved-worker",
  "missing-receipt",
  "corrupt-receipt",
  "duplicate-receipt",
  "future-receipt",
  "invalid-terminal",
])("unproven %s evidence cannot exclude a diagnostic", async (variant) => {
  const input =
    variant === "different-reason"
      ? auditedRefreshReplayFixtures()[0]
      : preparedReplayFixture();
  const evidence = await loadPreparedGithubDiagnosticEvidence(input.reader);
  const operation = input.state.operations[0];
  const receipt = input.state.receipts[0];
  if (variant === "equal-clock") receipt.updatedAt = input.run.updated_at;
  if (variant === "newer-producer")
    receipt.updatedAt = "2026-10-14T16:20:15.000Z";
  if (variant === "missing-archive") evidence.artifact = null;
  if (variant === "missing-attempt") delete evidence.run.run_attempt;
  if (variant === "rerun") evidence.run.run_attempt = 2;
  if (variant === "late-controlled")
    evidence.failure = {
      kind: "configuration",
      reasonCode: "provider-authentication-failed",
    };
  if (variant === "different-reason")
    evidence.failure = { kind: "transient", reasonCode: "provider-timeout" };
  if (variant === "foreign-kind") evidence.operation = operationFixture();
  if (variant === "foreign-actor") evidence.run.actor.id++;
  if (variant === "observed-native-origin") input.run.actor.id++;
  if (variant === "foreign-head")
    evidence.operation = { ...operation, expectedSha: "c".repeat(40) };
  if (variant === "changed-input")
    evidence.operation = operationFixture({
      identity: { ...operation.identity, inputDigest: "c".repeat(64) },
    });
  if (variant === "changed-stage")
    evidence.operation = { ...operation, stage: "generated" };
  if (variant === "changed-counters")
    receipt.operation.retry!.immediateAttempts++;
  if (variant === "changed-deadline")
    receipt.operation.nextEligibleAt = "2026-10-17T00:25:23.917Z";
  if (variant === "current-worker") operation.workerRunId = 777;
  if (variant === "receipt-worker") receipt.operation.workerRunId = 777;
  if (variant === "active-preparation")
    input.state.remote.runs.push({
      ...input.run,
      id: 777,
      status: "in_progress",
      conclusion: null,
    });
  if (variant === "unresolved-worker")
    input.state.remote.runs.push({
      ...input.run,
      id: 777,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${operation.key}`,
      conclusion: "success",
      updated_at: "2026-10-15T00:25:24.000Z",
    });
  if (variant === "missing-receipt") input.state.receipts = [];
  if (variant === "corrupt-receipt")
    Object.assign(receipt, { schema_version: 2 });
  if (variant === "duplicate-receipt")
    input.state.receipts.push(structuredClone(receipt));
  if (variant === "future-receipt")
    receipt.updatedAt = "2026-10-17T00:25:23.917Z";
  if (variant === "invalid-terminal") evidence.run.updated_at = "invalid";
  const before = JSON.stringify(input.state);
  expect(isPreparedDiagnosticObsolete({ state: input.state, evidence })).toBe(
    false,
  );
  expect(JSON.stringify(input.state)).toBe(before);
});
function fixture() {
  let operation = operationFixture();
  let nowMs = AUTOMATION_NOW;
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    operation = receipt.operation;
  });
  return {
    operationKey: operation.key,
    persist,
    load: async () =>
      ({ operations: [operation], nowMs }) as AutomationInventoryState,
    advance: () => {
      nowMs = Date.parse(operation.nextEligibleAt!);
    },
    replace: (value: typeof operation) => {
      operation = value;
    },
  };
}
test("finalization failures retain confirmed publication proof and durable notice backoff", async () => {
  const input = fixture();
  input.replace(operationFixture({ stage: "deployment-confirmed" }));
  expect(
    (
      await persistPreparedFailure({
        ...input,
        phase: "finalization",
        error: { code: "provider-unavailable" },
      })
    ).persisted,
  ).toBe(true);
  expect(input.persist.mock.calls[0][0].operation).toMatchObject({
    stage: "deployment-confirmed",
    retry: { failure: { kind: "transient" } },
  });
  expect(input.persist.mock.calls[0][0].operation.expectedSha).toBe(
    operationFixture().expectedSha,
  );
});
test("an unavailable prepared artifact persists bounded retry state without leaking error text", async () => {
  const input = fixture();
  const outcome = await persistPreparedFailure({
    ...input,
    error: new Error("secret-token raw provider output"),
  });
  expect(outcome).toEqual({ persisted: true, incident: false });
  const receipt = input.persist.mock.calls[0][0];
  expect(receipt.operation.retry?.failure).toEqual({
    kind: "unknown",
    reasonCode: "unclassified-failure",
  });
  expect(
    Date.parse(receipt.operation.nextEligibleAt!) - AUTOMATION_NOW,
  ).toBeGreaterThanOrEqual(300_000);
  expect(JSON.stringify(receipt)).not.toContain("secret-token");
});
test("an unavailable public deployment persists confirmation backoff while preserving its canonical publication", async () => {
  const input = fixture();
  const operation = operationFixture({
    stage: "deployment-requested",
    identity: {
      kind: "deployment",
      subject: `revision:${"b".repeat(40)}`,
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
  });
  input.replace(operation);
  const result = await persistPreparedFailure({
    ...input,
    operationKey: operation.key,
    error: { code: "provider-unavailable" },
  });
  expect(result.persisted).toBe(true);
  expect(input.persist.mock.calls[0][0].operation).toMatchObject({
    stage: "deployment-requested",
    expectedSha: operation.expectedSha,
    retry: {
      failure: { kind: "transient", reasonCode: "provider-unavailable" },
    },
  });
});

test("an intent-only dispatch delay cannot hide an authenticated budget refusal", async () => {
  const input = fixture();
  input.replace(
    operationFixture({
      retry: null,
      nextEligibleAt: new Date(AUTOMATION_NOW + 900000).toISOString(),
    }),
  );
  const result = await persistPreparedFailure({
    ...input,
    error: Object.assign(new Error("Budget refusal"), {
      code: "budget-exhausted",
    }),
  });
  expect(result.persisted).toBe(true);
  expect(
    input.persist.mock.calls[0][0].operation.retry?.failure.reasonCode,
  ).toBe("budget-exhausted");
  expect(
    Date.parse(input.persist.mock.calls[0][0].operation.nextEligibleAt!) -
      AUTOMATION_NOW,
  ).toBe(86400000);
});
test("three repeated unknown handoff failures move to daily probes and a visible incident", async () => {
  const input = fixture();
  for (let i = 0; i < 2; i++) {
    await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
    input.advance();
  }
  const before = (await input.load()).nowMs;
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Unavailable"),
      })
    ).incident,
  ).toBe(true);
  expect(
    Date.parse(input.persist.mock.calls[2][0].operation.nextEligibleAt!) -
      before,
  ).toBe(86_400_000);
});
test("an invalid prepared result permanently stops its unchanged input", async () => {
  const input = fixture();
  await persistPreparedFailure({
    ...input,
    error: Object.assign(new Error("Unsafe bytes"), {
      code: "prepared-content-invalid",
    }),
  });
  expect(input.persist.mock.calls[0][0].operation.retry?.failure.kind).toBe(
    "permanent",
  );
});

test("replayed completion failures cannot append heartbeats or reset their saved delay", async () => {
  const input = fixture();
  await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
  await persistPreparedFailure({ ...input, error: new Error("Unavailable") });
  expect(input.persist).toHaveBeenCalledTimes(1);
});

test("an authenticated provider diagnostic survives as configuration failure and a daily probe", async () => {
  const input = fixture();
  const result = await persistPreparedFailure({
    ...input,
    error: {
      failure: {
        kind: "configuration",
        reasonCode: "provider-authentication-failed",
      },
    },
  });
  expect(result.incident).toBe(true);
  expect(input.persist.mock.calls[0][0].operation.retry?.failure.kind).toBe(
    "configuration",
  );
  expect(
    Date.parse(input.persist.mock.calls[0][0].operation.nextEligibleAt!) -
      AUTOMATION_NOW,
  ).toBe(86_400_000);
});
test("a stale input or already published effect cannot acquire a failure receipt", async () => {
  const input = fixture();
  input.replace(
    operationFixture({
      identity: { ...operationFixture().identity, inputDigest: "c".repeat(64) },
    }),
  );
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Unavailable"),
      })
    ).persisted,
  ).toBe(false);
  input.replace(
    operationFixture({ stage: "published", expectedSha: "d".repeat(40) }),
  );
  expect(
    (
      await persistPreparedFailure({
        ...input,
        error: new Error("Receipt unavailable"),
      })
    ).persisted,
  ).toBe(false);
  expect(input.persist).not.toHaveBeenCalled();
});
