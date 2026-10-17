import { expect, test } from "vitest";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import type { AutomationOperation } from "../../scripts/automation/operation.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";

test("a lost inline finalization response cannot overwrite the remote terminal receipt with a stale retry", async () => {
  const effects = controllerFixture();
  const operation = operationFixture({ stage: "deployment-confirmed" });
  let remote: AutomationReceipt | undefined;
  effects.input.inventory = async () => [operation];
  const result = await reconcileAutomation({
    ...effects.input,
    persist: async (receipt) => {
      remote = receipt;
    },
    finalize: async () => {
      remote = {
        schema_version: 1,
        operation: {
          ...operation,
          stage: "finalized",
          workerRunId: null,
          retry: null,
          nextEligibleAt: null,
        },
        updatedAt: new Date(AUTOMATION_NOW).toISOString(),
        completedAt: new Date(AUTOMATION_NOW).toISOString(),
      };
      throw Object.assign(
        new Error("Response lost after durable terminal write."),
        { status: 503 },
      );
    },
  });
  expect(remote?.operation.stage).toBe("finalized");
  expect(remote?.operation.retry).toBeNull();
  expect(result.dispatched).toBe(0);
  expect(result.waiting).toBe(1);
});
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import {
  AUTOMATION_NOW,
  controllerFixture as baseControllerFixture,
  operationFixture as baseOperationFixture,
} from "../helpers/automation-fixtures";

function operationFixture(overrides: Partial<AutomationOperation> = {}) {
  return baseOperationFixture({
    ...overrides,
    identity: {
      ...baseOperationFixture().identity,
      kind: "metadata",
      ...overrides.identity,
    },
  });
}
function controllerFixture(
  options: Parameters<typeof baseControllerFixture>[0] = {},
) {
  const fixture = baseControllerFixture(options);
  const inventory = fixture.input.inventory;
  fixture.input.inventory = async () =>
    (await inventory()).map((operation) => {
      const identity = { ...operation.identity, kind: "metadata" as const };
      return { ...operation, identity, key: operationKey(identity) };
    });
  return fixture;
}

test("one oldest confirmed operation finishes in the canonical pass without a replaceable worker handoff or future intent", async () => {
  const effects = controllerFixture();
  const oldest = operationFixture({
    stage: "deployment-confirmed",
    retry: {
      failure: { kind: "transient", reasonCode: "provider-unavailable" },
      transientAttempts: 1,
      immediateAttempts: 0,
    },
    nextEligibleAt: new Date(AUTOMATION_NOW - 60_000).toISOString(),
  });
  const derived = operationFixture({
    identity: { ...oldest.identity, subject: "issue:43" },
    stage: "deployment-confirmed",
    createdAt: new Date(AUTOMATION_NOW - 1_800_000).toISOString(),
  });
  effects.input.inventory = async () => [oldest, derived];
  const finalized: string[] = [];
  const result = await reconcileAutomation({
    ...effects.input,
    finalize: async (operation) => {
      finalized.push(operation.key);
      expect(
        effects.receipts.some(
          (receipt) => receipt.operation.key === operation.key,
        ),
      ).toBe(false);
      return {
        operation: {
          ...operation,
          expectedSha: "e".repeat(40),
          stage: "finalized",
          workerRunId: null,
          retry: null,
          nextEligibleAt: null,
        },
      };
    },
  });
  expect(finalized).toEqual([oldest.key]);
  expect(result).toMatchObject({ finished: 1, dispatched: 1 });
  expect(effects.dispatches.map((operation) => operation.key)).toEqual([
    derived.key,
  ]);
  expect(
    effects.receipts.find((receipt) => receipt.operation.key === oldest.key)
      ?.operation,
  ).toMatchObject({ stage: "finalized", expectedSha: "e".repeat(40) });
});

test("a waiting inline finalizer preserves freshly reconstructed backoff instead of stale dispatch intent", async () => {
  const effects = controllerFixture();
  const operation = operationFixture({ stage: "deployment-confirmed" });
  const nextEligibleAt = new Date(AUTOMATION_NOW + 86_400_000).toISOString();
  effects.input.inventory = async () => [operation];
  const result = await reconcileAutomation({
    ...effects.input,
    finalize: async () => ({
      waiting: true,
      operation: {
        ...operation,
        nextEligibleAt,
        retry: {
          failure: { kind: "transient", reasonCode: "provider-unavailable" },
          transientAttempts: 4,
          immediateAttempts: 0,
        },
      },
    }),
  });
  expect(result).toMatchObject({ waiting: 1, dispatched: 0, finished: 0 });
  expect(effects.dispatches).toHaveLength(0);
  expect(effects.receipts.at(-1)?.operation.nextEligibleAt).toBe(
    nextEligibleAt,
  );
  expect(effects.receipts.at(-1)?.operation.retry?.transientAttempts).toBe(4);
});

test("a missed webhook is recovered by the scheduled pass", async () => {
  const effects = controllerFixture({ missedWebhook: true });
  const result = await reconcileAutomation(effects.input);
  expect(result.dispatched).toBe(1);
  expect(result.permanentFailures).toBe(0);
  expect(effects.dispatches).toHaveLength(1);
  expect(effects.receipts.at(-1)?.operation.workerRunId).toBe(700);
});

test("a pass selects at most twenty oldest subjects with no duplicate dispatch", async () => {
  const effects = controllerFixture();
  const operations = Array.from({ length: 30 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "metadata",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - (30 - index) * 60_000).toISOString(),
    }),
  );
  effects.input.inventory = async () => [...operations, operations[0]];
  const result = await reconcileAutomation(effects.input);
  expect(result.dispatched).toBe(20);
  expect(
    effects.dispatches.map((operation) => operation.identity.subject),
  ).toEqual(
    operations.slice(0, 20).map((operation) => operation.identity.subject),
  );
});

test("dry-run performs no dispatch or persistence", async () => {
  const effects = controllerFixture();
  effects.input.dryRun = true;
  const result = await reconcileAutomation(effects.input);
  expect(result.selectedKeys).toHaveLength(1);
  expect(effects.dispatches).toHaveLength(0);
  expect(effects.receipts).toHaveLength(0);
});

test("active, future, finalized and permanently rejected work is counted without dispatch", async () => {
  const effects = controllerFixture();
  const base = operationFixture();
  effects.input.inventory = async () => [
    { ...base, workerRunId: 700 },
    {
      ...base,
      nextEligibleAt: new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
    },
    { ...base, stage: "finalized" },
    {
      ...base,
      retry: {
        failure: { kind: "permanent", reasonCode: "authorization-lost" },
        transientAttempts: 0,
        immediateAttempts: 0,
      },
    },
  ];
  const result = await reconcileAutomation(effects.input);
  expect(result).toMatchObject({
    dispatched: 0,
    waiting: 2,
    finished: 1,
    permanentFailures: 1,
  });
  expect(effects.dispatches).toHaveLength(0);
});

test("future retry and active-worker observations are persisted once without heartbeat writes", async () => {
  const effects = controllerFixture();
  const operation = operationFixture({
    nextEligibleAt: new Date(AUTOMATION_NOW + 300_000).toISOString(),
    retry: {
      failure: { kind: "transient", reasonCode: "workflow-cancelled" },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
  });
  effects.input.inventory = async () => [operation];
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(1);
  effects.input.receipts = effects.receipts;
  effects.input.nowMs += 60_000;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(1);
});

test("a failed intent write prevents dispatch", async () => {
  const effects = controllerFixture();
  effects.input.persist = async () => {
    throw new Error("Write unavailable");
  };
  await expect(reconcileAutomation(effects.input)).rejects.toThrow(
    "Write unavailable",
  );
  expect(effects.dispatches).toHaveLength(0);
});

test("a receipt failure after successful dispatch does not clear the live handle or issue another dispatch", async () => {
  const effects = controllerFixture();
  let writes = 0;
  effects.input.persist = async () => {
    writes++;
    if (writes === 2) throw new Error("Write unavailable");
  };
  await expect(reconcileAutomation(effects.input)).rejects.toThrow(
    "Write unavailable",
  );
  expect(writes).toBe(2);
  expect(effects.dispatches).toHaveLength(1);
});

test("a current-input change at the final boundary suppresses stale work", async () => {
  const effects = controllerFixture();
  effects.input.revalidate = async () => null;
  expect((await reconcileAutomation(effects.input)).dispatched).toBe(0);
  expect(effects.dispatches).toHaveLength(0);
});

test("configuration failures schedule daily incident probes and preserve sanitized diagnostics", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw Object.assign(new Error("secret response"), {
      code: "provider-authentication-failed",
    });
  };
  const result = await reconcileAutomation(effects.input);
  expect(result).toMatchObject({
    dispatched: 0,
    incidents: 1,
    permanentFailures: 0,
  });
  expect(effects.receipts.at(-1)?.operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
  );
  expect(JSON.stringify(effects.receipts)).not.toContain("secret response");
});

test("rate limits retain Retry-After without a self-wake loop", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw { status: 429, retryAfterMs: 3_600_000 };
  };
  const result = await reconcileAutomation(effects.input);
  const operation = effects.receipts.at(-1)!.operation;
  expect(operation.retry?.failure.kind).toBe("transient");
  expect(Date.parse(operation.nextEligibleAt!)).toBeGreaterThanOrEqual(
    AUTOMATION_NOW + 3_600_000,
  );
  expect(result.permanentFailures).toBe(0);
  effects.input.inventory = async () => [operation];
  effects.input.receipts = effects.receipts;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(2);
});

test("GitHub CLI authorization failures open a configuration incident", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => {
    throw new Error("GitHub API failed (HTTP 403)");
  };
  const result = await reconcileAutomation(effects.input);
  expect(result.incidents).toBe(1);
  expect(effects.receipts.at(-1)!.operation.retry?.failure.kind).toBe(
    "configuration",
  );
});

test("an invalid dispatch effect cannot persist an unrelated operation", async () => {
  const effects = controllerFixture();
  effects.input.dispatch = async () => ({
    operation: operationFixture({
      identity: {
        kind: "metadata",
        subject: "issue:999",
        inputDigest: "e".repeat(64),
        policyVersion: "1",
      },
    }),
  });
  await reconcileAutomation(effects.input);
  expect(
    effects.receipts.some(
      (receipt) => receipt.operation.identity.subject === "issue:999",
    ),
  ).toBe(false);
});

test("observation writes share the twenty-operation quota and a zero limit produces no effects", async () => {
  const effects = controllerFixture();
  const operations = Array.from({ length: 30 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "metadata",
        subject: `issue:${index + 1}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      workerRunId: 700 + index,
    }),
  );
  effects.input.inventory = async () => operations;
  effects.input.limit = 0;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(0);
  effects.input.limit = 20;
  await reconcileAutomation(effects.input);
  expect(effects.receipts).toHaveLength(20);
});

function admissionPlanFixture(keys: readonly string[]) {
  return {
    admissionKeys: keys,
    orderedKeys: keys,
    consumedKeys: [] as string[],
    consumedSubjects: [] as string[],
  };
}

test("an internal admission plan cannot reclaim four direct submissions while counting the full 1693-operation inventory", async () => {
  const effects = controllerFixture();
  const backgrounds = Array.from({ length: 1685 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "metadata",
        subject: `source:background-${index}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - 7_200_000 - index).toISOString(),
    }),
  );
  const members = (
    [
      "project",
      "owner-request",
      "kit",
      "withdrawal",
      "report-import",
      "report-import",
    ] as const
  ).map((kind, index) =>
    operationFixture({
      identity: {
        kind,
        subject: `issue:member-${index}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      createdAt: new Date(AUTOMATION_NOW - 60_000 + index).toISOString(),
    }),
  );
  const finalized = operationFixture({
    identity: { ...members[0].identity, subject: "issue:finished" },
    stage: "finalized",
  });
  const permanent = operationFixture({
    identity: { ...members[0].identity, subject: "issue:permanent" },
    retry: {
      failure: { kind: "permanent", reasonCode: "authorization-lost" },
      transientAttempts: 0,
      immediateAttempts: 0,
    },
  });
  const operations = [...backgrounds, ...members, finalized, permanent];
  const orderedKeys = [...members].reverse().map((operation) => operation.key);
  const backgroundKeys = orderedKeys.filter(
    (key) =>
      members.find((operation) => operation.key === key)?.identity.kind ===
      "report-import",
  );
  effects.input.inventory = async () => operations;
  const result = await reconcileAutomation({
    ...effects.input,
    limit: 6,
    admissionPlan: {
      ...admissionPlanFixture(members.map((operation) => operation.key)),
      orderedKeys,
    },
  });
  expect(result).toMatchObject({
    selectedKeys: backgroundKeys,
    dispatched: 2,
    waiting: 1689,
    finished: 1,
    permanentFailures: 1,
  });
  expect(effects.dispatches.map((operation) => operation.key)).toEqual(
    backgroundKeys,
  );
  expect(
    result.waiting +
      result.finished +
      result.permanentFailures +
      result.dispatched,
  ).toBe(1693);
});

test("a ranked member with an active duplicate peer stays blocked without admitting outside work", async () => {
  const effects = controllerFixture();
  const blocked = operationFixture();
  const eligible = operationFixture({
    identity: { ...blocked.identity, subject: "issue:eligible-member" },
  });
  const outside = operationFixture({
    identity: { ...blocked.identity, subject: "issue:outside" },
    createdAt: new Date(AUTOMATION_NOW - 7_200_000).toISOString(),
  });
  effects.input.inventory = async () => [
    outside,
    blocked,
    { ...blocked, workerRunId: 900 },
    eligible,
  ];
  const result = await reconcileAutomation({
    ...effects.input,
    limit: 2,
    admissionPlan: admissionPlanFixture([blocked.key, eligible.key]),
  });
  expect(result.selectedKeys).toEqual([eligible.key]);
  expect(effects.dispatches.map((operation) => operation.key)).toEqual([
    eligible.key,
  ]);
});

test("an invalid operation outside admission membership fails before any controller effect", async () => {
  const effects = controllerFixture();
  const member = operationFixture();
  const invalid = operationFixture({ key: "0".repeat(64) });
  effects.input.inventory = async () => [member, invalid];
  await expect(
    reconcileAutomation({
      ...effects.input,
      limit: 1,
      admissionPlan: admissionPlanFixture([member.key]),
    }),
  ).rejects.toThrow("Automation operation is invalid.");
  expect(effects.dispatches).toHaveLength(0);
  expect(effects.receipts).toHaveLength(0);
});

test.each([
  "duplicate admission keys",
  "noncanonical admission key",
  "unknown member",
  "too many members",
  "duplicate ordered keys",
  "missing ordered member",
  "foreign ordered member",
  "noncanonical consumed key",
  "duplicate consumed keys",
  "sparse consumed keys",
  "malformed consumed subject",
  "sparse consumed subjects",
] as const)(
  "an admission plan rejects %s before effects",
  async (invalidCase) => {
    const effects = controllerFixture();
    const member = operationFixture();
    const other = operationFixture({
      identity: { ...member.identity, subject: "issue:other" },
    });
    effects.input.inventory = async () => [member, other];
    const admissionPlan = {
      ...admissionPlanFixture([member.key]),
      admissionKeys: [member.key],
      orderedKeys: [member.key],
    };
    if (invalidCase === "duplicate admission keys")
      admissionPlan.admissionKeys = [member.key, member.key];
    if (invalidCase === "noncanonical admission key")
      admissionPlan.admissionKeys = [member.key.toUpperCase()];
    if (invalidCase === "unknown member")
      admissionPlan.admissionKeys = admissionPlan.orderedKeys = [
        "f".repeat(64),
      ];
    if (invalidCase === "too many members")
      admissionPlan.admissionKeys = admissionPlan.orderedKeys = [
        member.key,
        other.key,
      ];
    if (invalidCase === "duplicate ordered keys")
      admissionPlan.orderedKeys = [member.key, member.key];
    if (invalidCase === "missing ordered member")
      admissionPlan.orderedKeys = [];
    if (invalidCase === "foreign ordered member")
      admissionPlan.orderedKeys = [other.key];
    if (invalidCase === "noncanonical consumed key")
      admissionPlan.consumedKeys = ["invalid"];
    if (invalidCase === "duplicate consumed keys")
      admissionPlan.consumedKeys = [member.key, member.key];
    if (invalidCase === "sparse consumed keys")
      admissionPlan.consumedKeys = new Array<string>(1);
    if (invalidCase === "malformed consumed subject")
      admissionPlan.consumedSubjects = [" issue:42"];
    if (invalidCase === "sparse consumed subjects")
      admissionPlan.consumedSubjects = new Array<string>(1);
    await expect(
      reconcileAutomation({ ...effects.input, limit: 1, admissionPlan }),
    ).rejects.toThrow();
    expect(effects.dispatches).toHaveLength(0);
    expect(effects.receipts).toHaveLength(0);
  },
);

test("admission membership remains bounded at twenty when the controller limit is larger", async () => {
  const effects = controllerFixture();
  const operations = Array.from({ length: 21 }, (_, index) =>
    operationFixture({
      identity: {
        kind: "metadata",
        subject: `issue:member-${index}`,
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
    }),
  );
  effects.input.inventory = async () => operations;
  await expect(
    reconcileAutomation({
      ...effects.input,
      limit: 30,
      admissionPlan: admissionPlanFixture(
        operations.map((operation) => operation.key),
      ),
    }),
  ).rejects.toThrow();
  expect(effects.dispatches).toHaveLength(0);
  expect(effects.receipts).toHaveLength(0);
});

test("consumed keys and replaced subjects are excluded from admission and bounded full-inventory observations", async () => {
  const effects = controllerFixture();
  const diagnostic = operationFixture({
    retry: {
      failure: { kind: "transient", reasonCode: "provider-unavailable" },
      transientAttempts: 2,
      immediateAttempts: 0,
    },
  });
  const replacement = operationFixture({
    identity: {
      ...diagnostic.identity,
      subject: "issue:consumed-subject",
      inputDigest: "c".repeat(64),
    },
    stage: "deployment-confirmed",
  });
  const member = operationFixture({
    identity: { ...diagnostic.identity, subject: "issue:member" },
  });
  const observations = Array.from({ length: 5 }, (_, index) =>
    operationFixture({
      identity: {
        ...diagnostic.identity,
        subject: `issue:observation-${index}`,
      },
      workerRunId: 900 + index,
    }),
  );
  effects.input.inventory = async () => [
    diagnostic,
    replacement,
    member,
    ...observations,
  ];
  const result = await reconcileAutomation({
    ...effects.input,
    limit: 3,
    admissionPlan: {
      ...admissionPlanFixture([diagnostic.key, replacement.key, member.key]),
      consumedKeys: [diagnostic.key],
      consumedSubjects: [replacement.identity.subject],
    },
  });
  expect(result.selectedKeys).toEqual([member.key]);
  expect(effects.dispatches.map((operation) => operation.key)).toEqual([
    member.key,
  ]);
  expect(
    effects.receipts.some(
      (receipt) =>
        receipt.operation.key === diagnostic.key ||
        receipt.operation.identity.subject === replacement.identity.subject,
    ),
  ).toBe(false);
  const observedKeys = new Set(
    effects.receipts
      .filter((receipt) => receipt.operation.key !== member.key)
      .map((receipt) => receipt.operation.key),
  );
  expect(observedKeys.size).toBe(2);
  expect(
    [...observedKeys].every((key) =>
      observations.some((item) => item.key === key),
    ),
  ).toBe(true);
  expect(result.selectedKeys.length + observedKeys.size).toBe(3);
});

test("empty admission membership at zero limit produces no effects", async () => {
  const effects = controllerFixture();
  const operation = operationFixture();
  effects.input.inventory = async () => [
    operation,
    { ...operation, workerRunId: 900 },
  ];
  const result = await reconcileAutomation({
    ...effects.input,
    limit: 0,
    admissionPlan: admissionPlanFixture([]),
  });
  expect(result.selectedKeys).toEqual([]);
  expect(effects.receipts).toHaveLength(0);
  expect(effects.dispatches).toHaveLength(0);
});

test.each(["null", "changed key", "future deadline", "active worker"] as const)(
  "planned selection waits without refill after revalidation returns %s",
  async (revalidationCase) => {
    const effects = controllerFixture();
    const member = operationFixture();
    const outside = operationFixture({
      identity: { ...member.identity, subject: "issue:outside" },
      createdAt: new Date(AUTOMATION_NOW - 1_800_000).toISOString(),
    });
    let current: AutomationOperation | null = member;
    if (revalidationCase === "null") current = null;
    if (revalidationCase === "changed key") current = outside;
    if (revalidationCase === "future deadline")
      current = {
        ...member,
        nextEligibleAt: new Date(AUTOMATION_NOW + 1).toISOString(),
      };
    if (revalidationCase === "active worker")
      current = { ...member, workerRunId: 900 };
    const revalidated: string[] = [];
    effects.input.inventory = async () => [member, outside];
    const result = await reconcileAutomation({
      ...effects.input,
      limit: 1,
      admissionPlan: admissionPlanFixture([member.key]),
      revalidate: async (candidate) => {
        revalidated.push(candidate.key);
        return current;
      },
    });
    expect(result).toMatchObject({
      selectedKeys: [member.key],
      dispatched: 0,
      waiting: 2,
    });
    expect(revalidated).toEqual([member.key]);
    expect(effects.dispatches).toHaveLength(0);
    expect(effects.receipts).toHaveLength(0);
  },
);

test.each(["throws", "waits"] as const)(
  "ranked confirmed members attempt one inline finalizer when it %s",
  async (finalizationCase) => {
    const effects = controllerFixture();
    const members = Array.from({ length: 3 }, (_, index) =>
      operationFixture({
        identity: {
          kind: "metadata",
          subject: `issue:confirmed-${index}`,
          inputDigest: "a".repeat(64),
          policyVersion: "1",
        },
        stage: "deployment-confirmed",
        createdAt: new Date(AUTOMATION_NOW - 60_000 + index).toISOString(),
      }),
    );
    const orderedKeys = [...members]
      .reverse()
      .map((operation) => operation.key);
    const finalized: string[] = [];
    const nextEligibleAt = new Date(AUTOMATION_NOW + 86_400_000).toISOString();
    effects.input.inventory = async () => members;
    const result = await reconcileAutomation({
      ...effects.input,
      limit: 3,
      admissionPlan: {
        ...admissionPlanFixture(members.map((operation) => operation.key)),
        orderedKeys,
      },
      finalize: async (operation) => {
        finalized.push(operation.key);
        if (finalizationCase === "throws")
          throw new Error("Finalizer response lost.");
        return { waiting: true, operation: { ...operation, nextEligibleAt } };
      },
    });
    expect(result).toMatchObject({
      selectedKeys: orderedKeys,
      waiting: 1,
      dispatched: 2,
      incidents: finalizationCase === "throws" ? 1 : 0,
    });
    expect(finalized).toEqual([members[2].key]);
    expect(effects.dispatches.map((operation) => operation.key)).toEqual([
      members[1].key,
      members[0].key,
    ]);
    const firstReceipts = effects.receipts.filter(
      (receipt) => receipt.operation.key === members[2].key,
    );
    if (finalizationCase === "throws") expect(firstReceipts).toHaveLength(0);
    else {
      expect(firstReceipts).toHaveLength(1);
      expect(firstReceipts[0].operation.nextEligibleAt).toBe(nextEligibleAt);
    }
  },
);
