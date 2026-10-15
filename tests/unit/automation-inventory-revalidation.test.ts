import { expect, test } from "vitest";
import {
  discoverAutomationState,
  dispatchAutomationOperation,
  revalidateAutomationOperation,
} from "../../scripts/automation/inventory.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import { createEnrichmentRunState } from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import {
  AUTOMATION_NOW,
  catalogInventoryFixture,
  kitInventoryFixture,
  operationFixture,
  preparedResultFixture,
  receiptFixture,
} from "../helpers/automation-fixtures";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import { finalizeAutomationOperation } from "../../scripts/automation/finalization.mjs";
import { projectAutomationLifecycle } from "../../scripts/automation/lifecycle-github.mjs";
import { assessInventoryHealth } from "../../scripts/automation/health.mjs";
import { planIncidentUpdates } from "../../scripts/automation/incidents.mjs";
import {
  operationKey,
  type AutomationOperation,
} from "../../scripts/automation/operation.mjs";

function publishedKitState(kind: "create" | "edit" | "withdrawal" = "create") {
  const input = kitInventoryFixture({
    operation: kind,
    canonicalPublished: true,
    confirmedDeployment: true,
    issueOpen: false,
  });
  if (kind === "withdrawal") input.kits[0].status = "withdrawn";
  input.issues[0].state_reason = "completed";
  input.issues[0].labels.push(
    kind === "withdrawal" ? "kit-withdrawn" : "kit-published",
  );
  input.issues[0].created_at = new Date(
    AUTOMATION_NOW - 72 * 3_600_000,
  ).toISOString();
  const state = inventoryState();
  state.remote.issues = input.issues.map((issue) => ({
    ...issue,
    user: { ...issue.user, type: "User" as const },
  }));
  state.local = {
    ...state.local,
    projects: input.projects,
    sources: Object.values(input.sourcesById),
    snapshots: [],
    kits: input.kits,
    canonicalKitRevisions: { "example-kit-42": "d".repeat(40) },
    confirmedRevisions: ["d".repeat(40)],
  };
  const operation = discoverKitOperations({
    ...input,
    issues: input.issues.map((issue) => ({ ...issue, state: "open" })),
  })[0];
  return { state, operation };
}

function addKitPublication(
  state: AutomationInventoryState,
  operation: AutomationOperation,
) {
  const result = preparedResultFixture({
    operationKey: operation.key,
    kind: operation.identity.kind,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    paths: ["data/registry/kits/example-kit-42.json"],
  });
  state.local.publications = [
    {
      record: createCanonicalPublicationRecord({ operation, result }),
      revision: "d".repeat(40),
    },
  ];
  state.local.publicationFileDigests = {
    [`${"d".repeat(40)}:data/registry/kits/example-kit-42.json`]:
      result.files[0].sha256,
  };
}

test.each(["create", "edit", "withdrawal"] as const)(
  "closed legacy %s with no receipt survives real guarded projection and persists terminal history once",
  async (kind) => {
    const { state, operation } = publishedKitState(kind);
    const writes = [] as typeof state.receipts;
    let loads = 0;
    const load = async () => {
      loads++;
      state.operations = discoverAutomationState(state);
      return state;
    };
    const input = {
      operationKey: operation.key,
      load,
      project: (
        current: AutomationOperation,
        fresh: AutomationInventoryState,
      ) =>
        projectAutomationLifecycle({
          operation: current,
          state: fresh,
          load,
          gh: async (args) => {
            const path = args.find((arg) => arg.startsWith("repos/"))!;
            if (
              path.endsWith("/issues/42/labels/kit-publication-ready") &&
              args.includes("DELETE")
            ) {
              state.remote.issues[0].labels =
                state.remote.issues[0].labels.filter(
                  (label) => label !== "kit-publication-ready",
                );
              return "";
            }
            if (args.includes("--method"))
              throw new Error("Unexpected issue mutation.");
            if (path.endsWith("/issues/42"))
              return JSON.stringify(state.remote.issues[0]);
            throw new Error(`Unexpected external read: ${path}`);
          },
          commit: async () => {
            throw new Error("No second publication.");
          },
        }),
      persist: async (receipt: (typeof state.receipts)[number]) => {
        writes.push(receipt);
        state.receipts = [receipt];
      },
    };
    expect(
      (await load()).operations.find((value) => value.key === operation.key)
        ?.stage,
    ).toBe("deployment-confirmed");
    expect(await finalizeAutomationOperation(input)).toEqual({
      status: "finalized",
    });
    expect(loads).toBeGreaterThanOrEqual(5);
    expect(writes).toMatchObject([
      {
        operation: { stage: "finalized", expectedSha: "d".repeat(40) },
        completedAt: "2026-10-07T12:00:00.000Z",
      },
    ]);
    expect(await finalizeAutomationOperation(input)).toEqual({
      status: "already-finalized",
    });
    expect(writes).toHaveLength(1);
    expect(state.remote.issues[0].labels).not.toContain(
      "kit-publication-ready",
    );
  },
);

test.each(
  (["legacy", "modern"] as const).flatMap((publication) =>
    (["create", "edit", "withdrawal"] as const).map((kind) => ({
      publication,
      kind,
    })),
  ),
)(
  "$publication $kind terminal history survives unrelated proof drift and closes its exact incident once",
  async ({ publication, kind }) => {
    const { state, operation } = publishedKitState(kind);
    if (publication === "modern") addKitPublication(state, operation);
    state.local.confirmedRevisions = [];
    state.operations = discoverAutomationState(state);
    const active = assessInventoryHealth(state).find(
      (finding) =>
        finding.code === "submission-stalled" &&
        finding.subject === `operation:${operation.key}`,
    )!;
    expect(active.status).toBe("active");
    const create = planIncidentUpdates({
      findings: [active],
      existingIssues: [],
      publisherActorId: state.publisherActorId,
    })[0];
    const incident = {
      number: 904,
      title: create.title,
      body: create.body,
      state: "open",
      user: { id: state.publisherActorId, type: "Bot" },
    };
    const terminal = receiptFixture({
      operation: {
        ...operation,
        stage: "finalized",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      completedAt: "2026-10-07T12:00:00.000Z",
    });
    state.receipts = [terminal];
    state.operations = discoverAutomationState(state);
    expect(
      state.operations.find((value) => value.key === operation.key),
    ).toEqual(terminal.operation);
    const recovered = assessInventoryHealth(state).find(
      (finding) => finding.key === active.key,
    )!;
    expect(recovered).toMatchObject({
      status: "recovered",
      reason: "verified-recovery",
      subject: `operation:${operation.key}`,
    });
    expect(
      planIncidentUpdates({
        findings: [recovered],
        existingIssues: [incident],
        publisherActorId: state.publisherActorId,
      }),
    ).toMatchObject([{ action: "close", number: 904 }]);
    incident.state = "closed";
    for (let pass = 0; pass < 2; pass++) {
      state.operations = discoverAutomationState(state);
      expect(
        planIncidentUpdates({
          findings: assessInventoryHealth(state),
          existingIssues: [incident],
          publisherActorId: state.publisherActorId,
        }),
      ).toEqual([]);
      expect(
        await reconcileAutomation({
          inventory: async () =>
            state.operations.filter((value) => value.key === operation.key),
          receipts: state.receipts,
          nowMs: state.nowMs,
          persist: async () => {
            throw new Error("Terminal history must not get heartbeat writes.");
          },
          dispatch: async () => {
            throw new Error("No replay.");
          },
        }),
      ).toMatchObject({ dispatched: 0, finished: 1, selectedKeys: [] });
    }
  },
);

test.each(["exact", "wrong-head", "missing-kit"] as const)(
  "modern Kit receipt requires current canonical authority when the issue is outside inventory: %s",
  (variant) => {
    const { state, operation } = publishedKitState();
    addKitPublication(state, operation);
    state.remote.issues = [];
    state.local.confirmedRevisions = [];
    state.receipts = [
      receiptFixture({
        operation: { ...operation, stage: "finalized" },
        completedAt: "2026-10-07T12:00:00.000Z",
      }),
    ];
    if (variant === "wrong-head")
      state.local.canonicalKitRevisions = { "example-kit-42": "e".repeat(40) };
    if (variant === "missing-kit") state.local.kits = [];
    expect(
      discoverAutomationState(state).find(
        (current) => current.key === operation.key,
      )?.stage,
    ).toBe(variant === "exact" ? "finalized" : "published");
  },
);

test.each(
  (["legacy", "modern"] as const).flatMap((publication) =>
    (
      [
        "pending",
        "wrong-head",
        "wrong-input",
        "wrong-owner",
        "wrong-policy",
        "missing-kit",
        "missing-revision",
        "retired-head",
        "retired-exact",
      ] as const
    ).map((variant) => ({ publication, variant })),
  ),
)(
  "$publication Kit denies mismatching terminal history: $variant",
  ({ publication, variant }) => {
    const { state, operation } = publishedKitState();
    if (publication === "modern") addKitPublication(state, operation);
    state.local.confirmedRevisions = [];
    const terminal = receiptFixture({
      operation: { ...operation, stage: "finalized" },
      completedAt: "2026-10-07T12:00:00.000Z",
    });
    state.receipts = [terminal];
    if (variant === "pending") state.receipts = [receiptFixture({ operation })];
    if (variant === "wrong-head" || variant === "retired-head")
      state.local.canonicalKitRevisions = { "example-kit-42": "e".repeat(40) };
    if (variant === "wrong-input")
      state.remote.issues[0].body = state.remote.issues[0].body!.replace(
        "A useful collection.",
        "Changed collection.",
      );
    if (variant === "wrong-owner") state.remote.issues[0].user!.id = 2;
    if (variant === "wrong-policy") {
      const identity = { ...operation.identity, policyVersion: "old-policy" };
      state.receipts = [
        receiptFixture({
          operation: {
            ...terminal.operation,
            identity,
            key: operationKey(identity),
          },
          completedAt: terminal.completedAt,
        }),
      ];
    }
    if (variant === "missing-kit") state.local.kits = [];
    if (variant === "missing-revision")
      state.local.canonicalKitRevisions = { "example-kit-42": null };
    if (variant.startsWith("retired-")) {
      state.local.retiredReceipts = [terminal];
      state.receipts = [terminal];
    }
    if (variant === "missing-revision") {
      expect(() => discoverAutomationState(state)).toThrow(
        "authoritative canonical revision",
      );
      return;
    }
    const current = discoverAutomationState(state).find(
      (value) => value.key === operation.key,
    );
    if (variant === "retired-exact")
      expect(current).toEqual(terminal.operation);
    else if (
      variant === "wrong-input" ||
      variant === "wrong-owner" ||
      variant === "missing-kit"
    )
      expect(current?.stage).not.toBe("finalized");
    else
      expect(current).toMatchObject({
        stage: "published",
        expectedSha: variant.endsWith("head") ? "e".repeat(40) : "d".repeat(40),
      });
  },
);

test.each(["project", "withdrawal", "owner-request"] as const)(
  "non-Kit %s publication still depends on current proof despite its terminal receipt",
  (kind) => {
    const state = inventoryState();
    const operation = operationFixture({
      identity: {
        kind,
        subject: "issue:43",
        inputDigest: "a".repeat(64),
        policyVersion: "1",
      },
      stage: "published",
      expectedSha: "d".repeat(40),
    });
    const result = preparedResultFixture({
      operationKey: operation.key,
      kind,
      inputDigest: operation.identity.inputDigest,
      policyVersion: "1",
      paths: ["data/registry/projects/example-project.json"],
    });
    state.local.publications = [
      {
        record: createCanonicalPublicationRecord({ operation, result }),
        revision: "d".repeat(40),
      },
    ];
    state.local.publicationFileDigests = {
      [`${"d".repeat(40)}:${result.files[0].path}`]: result.files[0].sha256,
    };
    state.receipts = [
      receiptFixture({
        operation: { ...operation, stage: "finalized" },
        completedAt: "2026-10-07T12:00:00.000Z",
      }),
    ];
    expect(
      discoverAutomationState(state).find(
        (value) => value.key === operation.key,
      )?.stage,
    ).toBe("published");
  },
);

test.each(["live", "retired"] as const)(
  "%s old Kit receipt cannot hide a newly published edit input",
  (custody) => {
    const { state, operation } = publishedKitState("edit");
    addKitPublication(state, operation);
    const terminal = receiptFixture({
      operation: { ...operation, stage: "finalized" },
      completedAt: "2026-10-07T12:00:00.000Z",
    });
    state.receipts = [terminal];
    if (custody === "retired") state.local.retiredReceipts = [terminal];
    state.local.confirmedRevisions = ["d".repeat(40)];
    state.local.canonicalKitRevisions = { "example-kit-42": "e".repeat(40) };
    state.remote.issues[0].body = state.remote.issues[0].body!.replace(
      "A useful collection.",
      "Changed collection.",
    );
    const kits = state.local.kits as Array<{ description: string }>;
    kits[0].description = "Changed collection.";
    const operations = discoverAutomationState(state).filter(
      (value) => value.identity.kind === "kit",
    );
    const current = operations.find((value) => value.key !== operation.key)!;
    expect(current).toMatchObject({
      stage: "published",
      expectedSha: "e".repeat(40),
    });
    expect(current.identity.inputDigest).not.toBe(
      operation.identity.inputDigest,
    );
    expect(
      operations.find((value) => value.key === operation.key)?.stage,
    ).not.toBe("finalized");
  },
);

test.each(["missing", "wrong-revision", "requested"] as const)(
  "closed legacy Kit with %s proof cannot finalize from labels or closure",
  async (proof) => {
    const { state, operation } = publishedKitState();
    state.local.confirmedRevisions =
      proof === "wrong-revision" ? ["e".repeat(40)] : [];
    if (proof === "requested")
      state.local.deployments = [
        { status: "requested", sourceSha: "d".repeat(40) },
      ];
    const load = async () => ({
      ...state,
      operations: discoverAutomationState(state),
    });
    expect(
      (await load()).operations.find((value) => value.key === operation.key)
        ?.stage,
    ).toBe(proof === "requested" ? "deployment-requested" : "published");
    expect(
      await finalizeAutomationOperation({
        operationKey: operation.key,
        load,
        project: async () => {
          throw new Error("No projection without proof.");
        },
        persist: async () => {
          throw new Error("No receipt without proof.");
        },
      }),
    ).toEqual({ status: "waiting" });
  },
);

test.each(["permanent", "future"] as const)(
  "a newer Kit canonical head retains its %s pending finalization guard",
  async (guard) => {
    const { state, operation } = publishedKitState();
    addKitPublication(state, operation);
    state.local.canonicalKitRevisions = { "example-kit-42": "e".repeat(40) };
    state.local.confirmedRevisions = ["e".repeat(40)];
    state.receipts = [
      receiptFixture({
        operation: {
          ...operation,
          expectedSha: "e".repeat(40),
          nextEligibleAt:
            guard === "future" ? "2026-10-07T12:05:00.000Z" : null,
          retry: {
            failure:
              guard === "permanent"
                ? { kind: "permanent", reasonCode: "authorization-lost" }
                : { kind: "transient", reasonCode: "provider-unavailable" },
            transientAttempts: 1,
            immediateAttempts: 0,
          },
        },
      }),
    ];
    const effects: string[] = [];
    const saved = [] as typeof state.receipts;
    const load = async () => ({
      ...state,
      operations: discoverAutomationState(state),
    });
    expect(
      await finalizeAutomationOperation({
        operationKey: operation.key,
        load,
        project: async () => {
          effects.push("project");
          return { status: "complete" };
        },
        persist: async (receipt) => {
          saved.push(receipt);
        },
      }),
    ).toEqual({ status: "waiting" });
    expect(effects).toEqual([]);
    expect(saved).toEqual([]);
    expect(
      (await load()).operations.find(
        (current) => current.key === operation.key,
      ),
    ).toMatchObject({
      expectedSha: "e".repeat(40),
      retry: {
        failure:
          guard === "permanent"
            ? { kind: "permanent", reasonCode: "authorization-lost" }
            : { kind: "transient", reasonCode: "provider-unavailable" },
      },
      nextEligibleAt: guard === "future" ? "2026-10-07T12:05:00.000Z" : null,
    });
  },
);

test("a newer Kit canonical head with an active trusted worker cannot enter inline finalization", async () => {
  const { state, operation } = publishedKitState();
  addKitPublication(state, operation);
  state.local.canonicalKitRevisions = { "example-kit-42": "e".repeat(40) };
  state.local.confirmedRevisions = ["e".repeat(40)];
  state.remote.runs = [
    { ...worker(operation.key), status: "in_progress", conclusion: null },
  ];
  const effects: string[] = [];
  const saved = [] as typeof state.receipts;
  const load = async () => ({
    ...state,
    operations: discoverAutomationState(state).filter(
      (current) => current.key === operation.key,
    ),
  });
  const result = await reconcileAutomation({
    inventory: async () => (await load()).operations,
    receipts: [],
    nowMs: state.nowMs,
    persist: async (receipt) => {
      saved.push(receipt);
    },
    dispatch: async () => {
      throw new Error("No dispatch while a trusted worker is active.");
    },
    finalize: async () => {
      await finalizeAutomationOperation({
        operationKey: operation.key,
        load,
        project: async () => {
          effects.push("project");
          return { status: "complete" };
        },
        persist: async (receipt) => {
          saved.push(receipt);
          state.receipts = [receipt];
        },
      });
      return { operation: (await load()).operations[0] };
    },
  });
  expect(result.selectedKeys).toEqual([]);
  expect(effects).toEqual([]);
  expect(saved).toMatchObject([
    {
      operation: {
        stage: "deployment-confirmed",
        expectedSha: "e".repeat(40),
        workerRunId: 700,
      },
    },
  ]);
  expect((await load()).operations[0].workerRunId).toBe(700);
});

test.each([0, 20])(
  "legacy Kit remains visible when limit %s leaves no observation slot",
  async (limit) => {
    const { state, operation } = publishedKitState();
    const occupied = Array.from({ length: 20 }, (_, index) =>
      operationFixture({
        identity: {
          kind: "project",
          subject: `issue:${100 + index}`,
          inputDigest: "a".repeat(64),
          policyVersion: "1",
        },
        createdAt: "2026-01-01T00:00:00.000Z",
        workerRunId: null,
      }),
    );
    const written = [] as typeof state.receipts;
    const result = await reconcileAutomation({
      inventory: async () => [
        ...occupied,
        ...discoverAutomationState(state).filter(
          (value) => value.key === operation.key,
        ),
      ],
      receipts: [],
      nowMs: state.nowMs,
      limit,
      persist: async (receipt) => {
        written.push(receipt);
      },
      dispatch: async () => ({ workerRunId: 700 }),
    });
    expect(result.selectedKeys).toHaveLength(limit);
    expect(
      written.some((receipt) => receipt.operation.key === operation.key),
    ).toBe(false);
    expect(
      discoverAutomationState(state).find(
        (value) => value.key === operation.key,
      )?.stage,
    ).toBe("deployment-confirmed");
  },
);

function inventoryState(): AutomationInventoryState {
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
  state.operations = discoverAutomationState(state);
  return state;
}

test("candidate revalidation reads only workers created since the shared inventory snapshot", async () => {
  const state = inventoryState();
  const candidates = state.operations.slice(0, 3);
  expect(candidates).toHaveLength(3);
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const page = Number(args.find((arg) => arg.startsWith("page="))!.slice(5));
    const lower = args.find((arg) => arg.startsWith("created=>="))!;
    if (lower === "created=>=2026-10-07T11:59:59.000Z")
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    return JSON.stringify([
      {
        total_count: 901,
        workflow_runs: Array.from(
          { length: page === 10 ? 1 : 100 },
          (_, index) => ({
            id: (page - 1) * 100 + index + 1,
            status: "completed",
            conclusion: "success",
          }),
        ),
      },
    ]);
  };
  for (const operation of candidates) {
    const current = await revalidateAutomationOperation({
      state,
      operation,
      gh,
      repository: state.repository,
      nowMs: AUTOMATION_NOW + 60_000,
    });
    expect(current?.key).toBe(operation.key);
  }
  expect(calls).toHaveLength(3);
  expect(
    calls.every((args) => args.includes("created=>=2026-10-07T11:59:59.000Z")),
  ).toBe(true);
});

function worker(operationKey: string, prepare = false) {
  return {
    id: 700,
    path: prepare
      ? ".github/workflows/refresh-catalog.yml"
      : ".github/workflows/automation-worker.yml",
    event: "workflow_dispatch",
    display_title: `Automation ${prepare ? "prepare " : ""}${operationKey}`,
    head_branch: "main",
    head_sha: "b".repeat(40),
    head_repository: { full_name: "MentallyQuill/Tavernary" },
    actor: { id: 41_982_982, type: "Bot" },
    status: "completed",
    conclusion: "failure",
    created_at: "2026-10-07T11:55:00.000Z",
    updated_at: "2026-10-07T11:56:00.000Z",
  };
}

test.each([false, true])(
  "revalidation refreshes a known worker that became active before its delta window (prepare: %s)",
  async (prepare) => {
    const state = inventoryState();
    const operation = state.operations.find(
      (value) => value.identity.subject === "source:github-42",
    )!;
    const previous = worker(operation.key, prepare);
    state.remote.runs = [previous];
    const current = await revalidateAutomationOperation({
      state,
      operation,
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/actions/runs/700"))
          return JSON.stringify({
            ...previous,
            status: "queued",
            conclusion: null,
          });
        if (path.endsWith("/actions/workflows/automation-worker.yml/runs"))
          return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
        throw new Error(`Unexpected route ${path}`);
      },
    });
    expect(current?.workerRunId).toBe(700);
  },
);

test("dispatch leaves a durable lease while the new worker is not yet visible", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  let dispatches = 0;
  let visible = false;
  const gh = async (args: string[]) => {
    if (args[0] === "workflow") {
      dispatches++;
      return "";
    }
    if (!visible)
      throw new Error(
        "Worker visibility is delayed; dispatch must not scan history.",
      );
    return JSON.stringify([
      {
        total_count: 1,
        workflow_runs: [
          {
            ...worker(operation.key),
            status: "queued",
            conclusion: null,
            created_at: "2026-10-07T12:00:10.000Z",
          },
        ],
      },
    ]);
  };
  const input = {
    inventory: async () =>
      discoverAutomationState(state).filter(
        (value) => value.key === operation.key,
      ),
    persist: async (receipt: AutomationInventoryState["receipts"][number]) => {
      state.receipts = [structuredClone(receipt)];
    },
    dispatch: (candidate: typeof operation) =>
      dispatchAutomationOperation({
        operation: candidate,
        gh,
        repository: state.repository,
        env: { TAVERNARY_PUBLISHER_BOT_ID: "41982982" },
      }),
    nowMs: AUTOMATION_NOW,
  };
  expect((await reconcileAutomation(input)).dispatched).toBe(1);
  expect(state.receipts[0].operation.workerRunId).toBeNull();
  expect(state.receipts[0].operation.nextEligibleAt).toBe(
    "2026-10-07T12:15:00.000Z",
  );
  expect((await reconcileAutomation(input)).dispatched).toBe(0);
  expect(dispatches).toBe(1);
  visible = true;
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW + 20_000,
      })
    )?.workerRunId,
  ).toBe(700);
});

test("exact worker refresh retains diagnostics only for the same attempt and source", async () => {
  for (const changed of ["none", "attempt", "source"]) {
    const state = inventoryState();
    const operation = state.operations.find(
      (value) => value.identity.subject === "source:github-42",
    )!;
    const previous = {
      ...worker(operation.key),
      run_attempt: 1,
      automationDiagnostic: {
        schema_version: 1 as const,
        operation_key: operation.key,
        failure: {
          kind: "transient" as const,
          reasonCode: "provider-rate-limited" as const,
        },
        runId: 700,
        runAttempt: 1,
        sourceSha: "b".repeat(40),
      },
    };
    state.remote.runs = [previous];
    await revalidateAutomationOperation({
      state,
      operation,
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async (args) => {
        const path = args.find((arg) => arg.startsWith("repos/"))!;
        if (path.endsWith("/actions/runs/700")) {
          const { automationDiagnostic: _diagnostic, ...native } = previous;
          return JSON.stringify({
            ...native,
            run_attempt: changed === "attempt" ? 2 : 1,
            head_sha: (changed === "source" ? "c" : "b").repeat(40),
          });
        }
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      },
    });
    const refreshed = state.remote.runs[0] as typeof previous;
    expect(refreshed.automationDiagnostic).toEqual(
      changed === "none" ? previous.automationDiagnostic : undefined,
    );
  }
});

test("revalidation refreshes a trusted writer handoff rerun outside the worker delta", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  const previous = {
    ...worker(operation.key),
    path: ".github/workflows/automation-writer.yml",
    display_title: `Automation write prepare ${operation.key}`,
  };
  state.remote.runs = [previous];
  const current = await revalidateAutomationOperation({
    state,
    operation,
    repository: state.repository,
    nowMs: AUTOMATION_NOW,
    gh: async (args) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/actions/runs/700"))
        return JSON.stringify({
          ...previous,
          status: "queued",
          conclusion: null,
        });
      if (path.endsWith("/actions/workflows/automation-worker.yml/runs"))
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      throw new Error(`Unexpected route ${path}`);
    },
  });
  expect(current?.workerRunId).toBe(700);
});

test("a worker appearing between candidates is discovered before a second dispatch", async () => {
  const state = inventoryState();
  const first = state.operations.find(
    (value) => value.identity.subject === "source:catalog-maintenance",
  )!;
  const second = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  let reads = 0;
  const gh = async () =>
    JSON.stringify([
      {
        total_count: ++reads === 1 ? 0 : 1,
        workflow_runs:
          reads === 1
            ? []
            : [
                {
                  ...worker(second.key),
                  status: "queued",
                  conclusion: null,
                  created_at: "2026-10-07T12:00:10.000Z",
                },
              ],
      },
    ]);
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation: first,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW,
      })
    )?.workerRunId,
  ).toBeNull();
  expect(
    (
      await revalidateAutomationOperation({
        state,
        operation: second,
        gh,
        repository: state.repository,
        nowMs: AUTOMATION_NOW + 20_000,
      })
    )?.workerRunId,
  ).toBe(700);
});

test("a truncated worker delta still refuses revalidation", async () => {
  const state = inventoryState();
  await expect(
    revalidateAutomationOperation({
      state,
      operation: state.operations[0],
      repository: state.repository,
      nowMs: AUTOMATION_NOW,
      gh: async () =>
        JSON.stringify([{ total_count: 1001, workflow_runs: [] }]),
    }),
  ).rejects.toThrow(/cap/u);
});

test("a foreign preparation title cannot hide the trusted worker refresh", async () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  const trusted = worker(operation.key, true);
  const foreign = { ...trusted, id: 701, actor: { id: 1, type: "User" } };
  state.remote.runs = [trusted, foreign];
  const current = await revalidateAutomationOperation({
    state,
    operation,
    repository: state.repository,
    nowMs: AUTOMATION_NOW,
    gh: async (args) => {
      const path = args.find((arg) => arg.startsWith("repos/"))!;
      if (path.endsWith("/actions/runs/700"))
        return JSON.stringify({
          ...trusted,
          status: "queued",
          conclusion: null,
        });
      if (path.endsWith("/actions/runs/701")) return JSON.stringify(foreign);
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    },
  });
  expect(current?.workerRunId).toBe(700);
});

test("inventory carries the authenticated executing writer exclusion without hiding another writer", () => {
  const state = inventoryState();
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:github-42",
  )!;
  state.remote.runs = [
    {
      ...worker(operation.key),
      path: ".github/workflows/automation-writer.yml",
      display_title: `Automation write prepare ${operation.key}`,
      status: "in_progress",
      conclusion: null,
    },
  ];
  state.executingWriterRunId = 700;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBeNull();
  state.executingWriterRunId = 701;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBe(700);
});

test("enrichment discovery carries the current writer exclusion", () => {
  const state = inventoryState();
  state.local.enrichmentCanary = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "canary",
      runId: "inventory-canary",
      manifest: [
        "example-project",
        "fixture-b",
        "fixture-c",
        "fixture-d",
        "fixture-e",
      ],
      batchSize: 1,
      concurrency: 1,
      model: "fixture-model",
      now: "2026-10-07T12:00:00.000Z",
      selectionMode: "all-automatic",
    }),
  );
  const operation = discoverAutomationState(state).find(
    (value) => value.identity.kind === "enrichment",
  )!;
  expect(operation).toBeDefined();
  state.remote.runs = [
    {
      ...worker(operation.key),
      path: ".github/workflows/automation-writer.yml",
      display_title: `Automation write prepare ${operation.key}`,
      status: "in_progress",
      conclusion: null,
      created_at: "2026-10-07T12:00:00.000Z",
    },
  ];
  state.executingWriterRunId = 700;
  expect(
    discoverAutomationState(state).find((value) => value.key === operation.key)
      ?.workerRunId,
  ).toBeNull();
});
