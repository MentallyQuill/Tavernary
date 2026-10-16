import { expect, test, vi } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { productionInventoryRoot } from "../helpers/production-inventory-root.mjs";
import * as inventory from "../../scripts/automation/inventory.mjs";
import type { ProjectInventoryRun } from "../../scripts/automation/project-operations.mjs";
import {
  validateAutomationReceipt,
  type AutomationReceipt,
} from "../../scripts/automation/receipts.mjs";
import {
  isPreparedDiagnosticObsolete,
  persistPreparedFailure,
} from "../../scripts/automation/prepared-failure.mjs";
import {
  loadPreparedDiagnosticRuns,
  loadGithubAutomationInventory,
  retainedAutomationRunIds,
} from "../../scripts/automation/github-inventory.mjs";
import type { GithubAutomationInventory } from "../../scripts/automation/github-inventory.mjs";
import {
  preparedReplayFixture,
  diagnosticReplayFixture,
} from "../helpers/prepared-replay-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { preparedResultFixture } from "../helpers/automation-fixtures";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import { createMetadataCache } from "../../scripts/automation/metadata-refresh.mjs";
import { runAutomationWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";
import * as health from "../../scripts/automation/health.mjs";
import { runGithubWriterPass } from "../../scripts/automation/github-backoff.mjs";
import { createPolicyEvidenceFingerprint } from "../../scripts/moderation/catalog-policy-review-contract.mjs";

const repository = "MentallyQuill/Tavernary";
const publisherActorId = 41_982_982;
const nowMs = Date.parse("2026-10-16T12:00:00Z");
const workflows = {
  refresh: "refresh-catalog.yml",
  metadata: "enrich-catalog.yml",
  advisory: "review-catalog-policy.yml",
};

async function diagnosticFixture(kind: keyof typeof workflows = "metadata") {
  const canonical = await productionInventoryRoot();
  const calls: string[][] = [];
  const runs: ProjectInventoryRun[] = [];
  const read = async (args: string[]) => {
    calls.push(args);
    const route = args.find((value) => value.startsWith("repos/"))!;
    if (route.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: canonical.revision } });
    if (route.endsWith("/issues") || route.endsWith("/pulls")) return "[[]]";
    const directId = Number(/\/actions\/runs\/([1-9]\d*)$/u.exec(route)?.[1]);
    if (directId) {
      const run = runs.find((value) => value.id === directId);
      if (!run) throw Object.assign(new Error("HTTP 404"), { status: 404 });
      return JSON.stringify(run);
    }
    if (route.endsWith("/runs")) {
      const workflow = /\/workflows\/([^/]+)\/runs$/u.exec(route)?.[1];
      const status = args
        .find((value) => value.startsWith("status="))
        ?.slice(7);
      const created = args
        .find((value) => value.startsWith("created="))
        ?.slice(8)
        .split("..");
      const selected = runs.filter(
        (run) =>
          (!workflow || run.path === `.github/workflows/${workflow}`) &&
          (!status || run.status === status) &&
          (!created ||
            (Date.parse(run.created_at!) >= Date.parse(created[0]) &&
              Date.parse(run.created_at!) <= Date.parse(created[1]))),
      );
      const page = Number(
        args.find((value) => value.startsWith("page="))?.slice(5) ?? 1,
      );
      return JSON.stringify([
        {
          total_count: selected.length,
          workflow_runs: selected.slice((page - 1) * 100, page * 100),
        },
      ]);
    }
    throw new Error(`Unexpected fixture route ${route}`);
  };
  let override: typeof read | undefined;
  const gh = (args: string[]) => (override ?? read)(args);
  const input = {
    root: canonical.root,
    gh,
    repository,
    publisherActorId,
    nowMs,
    history: undefined as GithubAutomationInventory | undefined,
    reportIndex: {
      schema_version: 5 as const,
      generated_at: new Date(nowMs).toISOString(),
      reports: [],
    },
  };
  const initial = await inventory.loadAutomationInventory(input);
  const operation = initial.operations.find(
    (value) => value.identity.kind === kind,
  )!;
  expect(operation).toBeDefined();
  const run = {
    id: 701,
    run_attempt: 1,
    path: `.github/workflows/${workflows[kind]}`,
    head_sha: canonical.revision,
    head_branch: "main",
    head_repository: { full_name: repository },
    event: "workflow_dispatch",
    display_title: `Automation prepare ${operation.key}`,
    actor: { id: publisherActorId, type: "Bot" },
    created_at: new Date(
      Math.max(Date.parse(operation.createdAt), nowMs - 3 * 3_600_000),
    ).toISOString(),
    updated_at: new Date(nowMs - 2 * 3_600_000).toISOString(),
    status: "completed",
    conclusion: "failure",
  } satisfies ProjectInventoryRun;
  runs.push(run);
  const receipt: AutomationReceipt = {
    schema_version: 1,
    operation: {
      ...operation,
      workerRunId: null,
      nextEligibleAt: new Date(nowMs - 60_000).toISOString(),
      retry: {
        failure: { kind: "unknown", reasonCode: "unclassified-failure" },
        transientAttempts: 1,
        immediateAttempts: 2,
      },
    },
    updatedAt: new Date(nowMs - 3_600_000).toISOString(),
    completedAt: null,
  };
  const saveReceipt = async () => {
    const directory = join(
      canonical.root,
      "data/maintenance/automation/operations",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${operation.key}.json`),
      JSON.stringify(receipt),
    );
  };
  await saveReceipt();
  input.history = (await inventory.loadAutomationInventory(input)).remote;
  const evidence = {
    operation: receipt.operation,
    run,
    artifact: { id: 801, digest: `sha256:${"a".repeat(64)}` },
    failure: receipt.operation.retry!.failure,
  };
  return {
    ...canonical,
    input,
    calls,
    runs,
    operation,
    run,
    receipt,
    evidence,
    saveReceipt,
    read,
    setRead: (value: typeof read) => {
      override = value;
    },
  };
}

async function nativeFixture() {
  const fixture = preparedReplayFixture();
  const calls: string[][] = [];
  const read = async (args: string[]) => {
    calls.push(args);
    const route = args.find((value) => value.startsWith("repos/"))!;
    if (route.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: fixture.state.local.revision } });
    if (route.endsWith("/issues") || route.endsWith("/pulls")) return "[[]]";
    const directId = Number(/\/actions\/runs\/([1-9]\d*)$/u.exec(route)?.[1]);
    if (directId) {
      const run = fixture.state.remote.runs.find(
        (value) => value.id === directId,
      );
      if (!run) throw Object.assign(new Error("HTTP 404"), { status: 404 });
      return JSON.stringify(run);
    }
    const status = args.find((value) => value.startsWith("status="))?.slice(7);
    const range = args
      .find((value) => value.startsWith("created="))
      ?.slice(8)
      .split("..");
    const rows = fixture.state.remote.runs.filter(
      (run) =>
        (!status || status === run.status) &&
        (!range ||
          (Date.parse(run.created_at ?? "") >= Date.parse(range[0]) &&
            Date.parse(run.created_at ?? "") <= Date.parse(range[1]))),
    );
    const page = Number(
      args.find((value) => value.startsWith("page="))?.slice(5) ?? 1,
    );
    return JSON.stringify([
      {
        total_count: rows.length,
        workflow_runs: rows.slice((page - 1) * 100, page * 100),
      },
    ]);
  };
  let override: typeof read | undefined;
  const gh = (args: string[]) => (override ?? read)(args);
  const history = await loadGithubAutomationInventory({
    gh,
    repository: fixture.state.repository,
    publisherActorId: fixture.state.publisherActorId,
    receipts: fixture.state.receipts,
    nowMs: fixture.state.nowMs,
  });
  calls.length = 0;
  return {
    ...fixture,
    calls,
    read,
    setRead: (value: typeof read) => {
      override = value;
    },
    input: {
      gh,
      repository: fixture.state.repository,
      publisherActorId: fixture.state.publisherActorId,
      nowMs: fixture.state.nowMs,
      operation: fixture.receipt.operation,
      evidenceRun: fixture.run,
      history,
    },
  };
}

test("a malformed full native row cannot mint scoped history authority", async () => {
  const fixture = await nativeFixture();
  fixture.setRead(async (args) =>
    args.some((value) => value.startsWith("created="))
      ? JSON.stringify([
          {
            total_count: 2,
            workflow_runs: [fixture.run, { id: -1, status: "completed" }],
          },
        ])
      : fixture.read(args),
  );
  const history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  fixture.setRead(fixture.read);
  expect(
    await loadPreparedDiagnosticRuns({ ...fixture.input, history }),
  ).toBeNull();
});

test("only the original full handle with exact adapter, repository, actor and monotonic clock supplies history", async () => {
  const fixture = await nativeFixture();
  const scoped = await loadPreparedDiagnosticRuns(fixture.input);
  expect(scoped).not.toBeNull();
  fixture.calls.length = 0;
  for (const change of [
    { history: undefined },
    { history: structuredClone(fixture.input.history) },
    { history: { ...fixture.input.history } },
    { history: { ...scoped!, issues: [], pulls: [] } },
    { gh: (args: string[]) => fixture.input.gh(args) },
    { repository: "Lookalike/Tavernary" },
    { publisherActorId: 7 },
    { nowMs: fixture.input.nowMs - 1 },
  ])
    expect(
      await loadPreparedDiagnosticRuns({ ...fixture.input, ...change }),
    ).toBeNull();
  expect(fixture.calls).toEqual([]);
});

test("a later scoped observation cannot move backwards behind a prior observation on the same seed", async () => {
  const fixture = await nativeFixture();
  expect(
    await loadPreparedDiagnosticRuns({
      ...fixture.input,
      nowMs: fixture.input.nowMs + 1000,
    }),
  ).not.toBeNull();
  expect(
    await loadPreparedDiagnosticRuns({
      ...fixture.input,
      nowMs: fixture.input.nowMs + 999,
    }),
  ).toBeNull();
});

test.each(["prefix", "new-reference"])(
  "a cross-key saved old matching peer in %s retains full authority until its global reference is cleared",
  async (variant) => {
    const fixture = await nativeFixture();
    const peer = {
      ...fixture.run,
      id: 702,
      created_at: "2026-10-08T15:00:00.000Z",
      updated_at: new Date(
        Date.parse(fixture.receipt.updatedAt) + 1000,
      ).toISOString(),
    };
    const identity = {
      ...fixture.receipt.operation.identity,
      subject: "source:github-7:other-project",
    };
    const other = {
      ...fixture.receipt,
      operation: {
        ...fixture.receipt.operation,
        identity,
        key: operationKey(identity),
        workerRunId: peer.id,
      },
    };
    const history = fixture.input.history;
    fixture.state.remote.runs.push(peer);
    const full = await loadGithubAutomationInventory({
      ...fixture.input,
      receipts: [fixture.receipt, other],
    });
    const expected = isPreparedDiagnosticObsolete({
      state: { ...fixture.state, remote: full },
      evidence: {
        operation: fixture.receipt.operation,
        run: fixture.run,
        artifact: fixture.artifact,
        failure: fixture.diagnostic.failure,
      },
    });
    expect(expected).toBe(false);
    const native = await loadPreparedDiagnosticRuns({
      ...fixture.input,
      history: variant === "prefix" ? full : history,
      retainedRunIds: [peer.id],
    } as Parameters<typeof loadPreparedDiagnosticRuns>[0]);
    if (native)
      expect(
        isPreparedDiagnosticObsolete({
          state: {
            ...fixture.state,
            remote: { ...fixture.state.remote, runs: native.runs },
          },
          evidence: {
            operation: fixture.receipt.operation,
            run: fixture.run,
            artifact: fixture.artifact,
            failure: fixture.diagnostic.failure,
          },
        }),
      ).toBe(expected);
    const cleared = await loadPreparedDiagnosticRuns({
      ...fixture.input,
      history: variant === "prefix" ? full : history,
      retainedRunIds: [],
    } as Parameters<typeof loadPreparedDiagnosticRuns>[0]);
    expect(cleared?.runs.some((run) => run.id === peer.id)).toBe(false);
  },
);

test("the shared retained-handle rule preserves report narrative references and excludes finalized receipts", async () => {
  const fixture = await nativeFixture();
  const identity = {
    ...fixture.receipt.operation.identity,
    kind: "report-import" as const,
    policyVersion: "2026-07-29.narrative-702",
  };
  const receipt: AutomationReceipt = {
    ...fixture.receipt,
    operation: {
      ...fixture.receipt.operation,
      identity,
      key: operationKey(identity),
      workerRunId: 703,
    },
  };
  expect(retainedAutomationRunIds([receipt])).toEqual([703, 702]);
  receipt.operation.workerRunId = null;
  expect(retainedAutomationRunIds([receipt])).toEqual([702]);
  expect(
    retainedAutomationRunIds([
      {
        ...receipt,
        operation: {
          ...receipt.operation,
          stage: "finalized",
          expectedSha: "b".repeat(40),
        },
        completedAt: receipt.updatedAt,
      },
    ]),
  ).toEqual([]);
});

test("fresh global receipt additions, changed handles and cleared references preserve exact full diagnostic decisions", async () => {
  const fixture = await diagnosticFixture();
  try {
    const load = () =>
      inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      });
    expect(
      isPreparedDiagnosticObsolete({
        state: (await load())!,
        evidence: fixture.evidence,
      }),
    ).toBe(true);
    const identity = {
      ...fixture.receipt.operation.identity,
      subject: "source:github-999:other-project",
    };
    const other: AutomationReceipt = {
      ...fixture.receipt,
      operation: {
        ...fixture.receipt.operation,
        identity,
        key: operationKey(identity),
        workerRunId: 702,
      },
    };
    const path = join(
      fixture.root,
      `data/maintenance/automation/operations/${other.operation.key}.json`,
    );
    for (const id of [702, 703])
      fixture.runs.push({
        ...fixture.run,
        id,
        created_at: new Date(nowMs - 8 * 86_400_000).toISOString(),
        updated_at: new Date(nowMs - 30 * 60_000).toISOString(),
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${fixture.operation.key}`,
      });
    for (const workerRunId of [702, 703, null]) {
      other.operation.workerRunId = workerRunId;
      await writeFile(path, JSON.stringify(other));
      const full = await inventory.loadAutomationInventory(fixture.input);
      const scoped = await load();
      expect(scoped?.operations).toEqual(
        full.operations.filter(
          (operation) => operation.key === fixture.operation.key,
        ),
      );
      expect(
        isPreparedDiagnosticObsolete({
          state: scoped!,
          evidence: fixture.evidence,
        }),
      ).toBe(
        isPreparedDiagnosticObsolete({
          state: full,
          evidence: fixture.evidence,
        }),
      );
      expect(
        isPreparedDiagnosticObsolete({
          state: scoped!,
          evidence: fixture.evidence,
        }),
      ).toBe(workerRunId === null);
    }
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("nested exposed full rows cannot poison the independent native membership seed", async () => {
  const fixture = await nativeFixture();
  fixture.input.history.runs[0].actor!.id = 7;
  fixture.input.history.runs[0].head_repository!.full_name =
    "Lookalike/Tavernary";
  fixture.input.history.runs[0].display_title = "Forged title";
  fixture.input.history.runs.push({
    ...fixture.run,
    id: 702,
    status: "in_progress",
    conclusion: null,
  });
  const state = await loadPreparedDiagnosticRuns(fixture.input);
  expect(state?.runs).toEqual([fixture.run]);
  expect(
    fixture.calls.some((args) =>
      args.some((value) => value.endsWith("/actions/runs/702")),
    ),
  ).toBe(false);
});

test("a matching handle with malformed fresh creation metadata cannot become absent through retention", async () => {
  const fixture = await nativeFixture();
  const peer = {
    ...fixture.run,
    id: 702,
    created_at: "2026-10-12T12:00:00.000Z",
    updated_at: new Date(
      Date.parse(fixture.receipt.updatedAt) + 1000,
    ).toISOString(),
  };
  fixture.state.remote.runs.push(peer);
  fixture.input.history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  fixture.setRead(async (args) =>
    args.some((value) => value.endsWith("/actions/runs/702"))
      ? JSON.stringify({ ...peer, created_at: "malformed native clock" })
      : fixture.read(args),
  );
  await expect(loadPreparedDiagnosticRuns(fixture.input)).rejects.toThrow(
    /invalid/u,
  );
});

test("a later page's larger total prevents an incomplete full inventory from minting a scoped seed", async () => {
  const fixture = await nativeFixture();
  fixture.setRead(async (args) => {
    if (!args.some((value) => value.startsWith("created=")))
      return fixture.read(args);
    const second = args.includes("page=2");
    return JSON.stringify([
      {
        total_count: second ? 200 : 101,
        workflow_runs: Array.from({ length: second ? 1 : 100 }, (_, index) => ({
          ...fixture.run,
          id: 1000 + (second ? 100 : index),
          display_title: "Unrelated completed producer",
        })),
      },
    ]);
  });
  const history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  expect(history.runs).toHaveLength(101);
  fixture.setRead(fixture.read);
  fixture.calls.length = 0;
  expect(
    await loadPreparedDiagnosticRuns({ ...fixture.input, history }),
  ).toBeNull();
  expect(fixture.calls).toEqual([]);
});

test.each(["delta", "active"])(
  "a later page's larger total refuses incomplete scoped %s authority",
  async (source) => {
    const fixture = await nativeFixture();
    fixture.setRead(async (args) => {
      const selected =
        source === "delta"
          ? args.some((value) => value.startsWith("created="))
          : args.includes("status=in_progress");
      if (!selected) return fixture.read(args);
      const second = args.includes("page=2");
      return JSON.stringify([
        {
          total_count: second ? 200 : 101,
          workflow_runs: Array.from(
            { length: second ? 1 : 100 },
            (_, index) => ({
              ...fixture.run,
              id: 1000 + (second ? 100 : index),
              display_title: "Unrelated producer",
            }),
          ),
        },
      ]);
    });
    await expect(loadPreparedDiagnosticRuns(fixture.input)).rejects.toThrow(
      /incomplete|truncated/u,
    );
  },
);

test("a post-invocation peer observed active then completed remains present and non-obsolete", async () => {
  const fixture = await nativeFixture();
  const peer = {
    ...fixture.run,
    id: 702,
    created_at: new Date(fixture.input.nowMs + 1).toISOString(),
    updated_at: new Date(fixture.input.nowMs + 2).toISOString(),
  };
  fixture.state.remote.runs.push(peer);
  fixture.setRead(async (args) =>
    args.includes("status=in_progress")
      ? JSON.stringify([
          {
            total_count: 1,
            workflow_runs: [
              { ...peer, status: "in_progress", conclusion: null },
            ],
          },
        ])
      : fixture.read(args),
  );
  const full = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  const scoped = await loadPreparedDiagnosticRuns(fixture.input);
  expect(scoped?.runs.find((run) => run.id === peer.id)).toEqual(peer);
  const evidence = {
    operation: fixture.receipt.operation,
    run: fixture.run,
    artifact: fixture.artifact,
    failure: fixture.diagnostic.failure,
  };
  const obsolete = (runs: ProjectInventoryRun[]) =>
    isPreparedDiagnosticObsolete({
      state: {
        ...fixture.state,
        remote: { ...fixture.state.remote, runs },
      },
      evidence,
    });
  expect(obsolete(full.runs)).toBe(false);
  expect(obsolete(scoped!.runs)).toBe(obsolete(full.runs));
});

test("incomplete full and finalization-only results never mint scoped seeds", async () => {
  const fixture = await nativeFixture();
  fixture.setRead(async (args) =>
    args.some((value) => value.startsWith("created="))
      ? JSON.stringify([{ total_count: 101, workflow_runs: [] }])
      : fixture.read(args),
  );
  const incomplete = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  fixture.setRead(fixture.read);
  expect(
    await loadPreparedDiagnosticRuns({ ...fixture.input, history: incomplete }),
  ).toBeNull();
  const identity = {
    ...fixture.input.operation.identity,
    kind: "metadata" as const,
  };
  const finalizationOperation = {
    ...fixture.input.operation,
    identity,
    key: operationKey(identity),
    stage: "deployment-confirmed" as const,
    expectedSha: "b".repeat(40),
  };
  const finalization = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: [],
    finalizationOperation,
  });
  expect(finalization.finalizationOperationKey).toBe(finalizationOperation.key);
  expect(
    await loadPreparedDiagnosticRuns({
      ...fixture.input,
      history: finalization,
    }),
  ).toBeNull();
});

test("fixed original coverage overlaps its boundary second and splits new creations without advancing after a read", async () => {
  const fixture = await nativeFixture();
  const boundary = Math.floor(fixture.input.nowMs / 1000) * 1000;
  const current = fixture.input.nowMs + 60_000;
  const peer = {
    ...fixture.run,
    id: 702,
    created_at: new Date(boundary + 500).toISOString(),
    updated_at: new Date(current).toISOString(),
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${fixture.input.operation.key}`,
    status: "in_progress",
    conclusion: null,
  };
  fixture.state.remote.runs.push(peer);
  for (let index = 0; index < 1002; index++)
    fixture.state.remote.runs.push({
      ...fixture.run,
      id: 1000 + index,
      display_title: "Unrelated new work",
      created_at: new Date(boundary + 1000 + index * 50).toISOString(),
    });
  const native = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    nowMs: current,
  });
  expect(native?.runs).toHaveLength(1004);
  expect(native?.runs.find((run) => run.id === peer.id)).toEqual(peer);
  expect(fixture.calls.some((args) => args.includes("page=6"))).toBe(true);
  const firstRange = fixture.calls
    .find((args) => args.some((value) => value.startsWith("created=")))!
    .find((value) => value.startsWith("created="));
  fixture.calls.length = 0;
  await loadPreparedDiagnosticRuns({ ...fixture.input, nowMs: current + 1000 });
  expect(
    fixture.calls
      .find((args) => args.some((value) => value.startsWith("created=")))!
      .find((value) => value.startsWith("created="))
      ?.split("..")[0],
  ).toBe(firstRange?.split("..")[0]);
});

test("a peer added while the short delta paginates is retained with its latest direct state", async () => {
  const fixture = await nativeFixture();
  const current = fixture.input.nowMs + 60_000;
  for (let index = 0; index < 101; index++)
    fixture.state.remote.runs.push({
      ...fixture.run,
      id: 1000 + index,
      display_title: "Unrelated new work",
      created_at: new Date(fixture.input.nowMs + index * 100 + 1).toISOString(),
    });
  const peer = {
    ...fixture.run,
    id: 702,
    created_at: new Date(current - 1000).toISOString(),
    updated_at: new Date(current).toISOString(),
    status: "waiting",
    conclusion: null,
    path: ".github/workflows/automation-writer.yml",
    display_title: `Automation write publish ${fixture.input.operation.key}`,
  };
  let added = false;
  fixture.setRead(async (args) => {
    const value = await fixture.read(args);
    if (
      !added &&
      args.includes("page=1") &&
      args.some((part) => part.startsWith("created="))
    ) {
      added = true;
      fixture.state.remote.runs.push(peer);
    }
    return value;
  });
  const native = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    nowMs: current,
  });
  expect(native?.runs).toHaveLength(103);
  expect(native?.runs.find((run) => run.id === peer.id)).toEqual(peer);
});

test("a fresh peer between comparison and failure persistence produces the exact full failure receipt", async () => {
  const fixture = await diagnosticFixture();
  try {
    let observed: Awaited<
      ReturnType<typeof inventory.loadPreparedDiagnosticInventory>
    >;
    const load = async () => {
      observed = await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      });
      return (
        observed ?? (await inventory.loadAutomationInventory(fixture.input))
      );
    };
    await load();
    const peer = {
      ...fixture.run,
      id: 702,
      created_at: new Date(nowMs + 1000).toISOString(),
      updated_at: new Date(nowMs + 1000).toISOString(),
      status: "pending",
      conclusion: null,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${fixture.operation.key}`,
    };
    fixture.runs.push(peer);
    fixture.input.nowMs += 2000;
    const full = await inventory.loadAutomationInventory(fixture.input);
    const expected: AutomationReceipt[] = [];
    const actual: AutomationReceipt[] = [];
    await persistPreparedFailure({
      operationKey: fixture.operation.key,
      error: { failure: fixture.evidence.failure },
      load: async () => full,
      persist: async (receipt) => {
        expected.push(receipt);
      },
    });
    await persistPreparedFailure({
      operationKey: fixture.operation.key,
      error: { failure: fixture.evidence.failure },
      load,
      persist: async (receipt) => {
        actual.push(receipt);
      },
    });
    expect(observed!.remote.runs.find((run) => run.id === peer.id)).toEqual(
      peer,
    );
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
}, 25_000);

test("an initially untrusted older matching peer is refreshed before custody filtering even when a newer peer exists", async () => {
  const fixture = await nativeFixture();
  const older = {
    ...fixture.run,
    id: 702,
    actor: { id: 7, type: "Bot" },
    created_at: "2026-10-12T12:00:00.000Z",
  };
  const newer = {
    ...fixture.run,
    id: 703,
    created_at: "2026-10-13T12:00:00.000Z",
  };
  fixture.state.remote.runs.push(older, newer);
  fixture.input.history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  Object.assign(older, {
    actor: { id: fixture.input.publisherActorId, type: "Bot" },
    status: "in_progress",
    conclusion: null,
    run_attempt: 2,
  });
  fixture.calls.length = 0;
  const native = await loadPreparedDiagnosticRuns(fixture.input);
  expect(native?.runs.find((run) => run.id === older.id)).toEqual(older);
  for (const id of [fixture.run.id, older.id, newer.id])
    expect(
      fixture.calls.filter((args) =>
        args.some((value) => value.endsWith(`/actions/runs/${id}`)),
      ),
    ).toHaveLength(1);
  expect(
    isPreparedDiagnosticObsolete({
      state: {
        ...fixture.state,
        remote: { ...fixture.state.remote, runs: native!.runs },
      },
      evidence: {
        operation: fixture.receipt.operation,
        run: fixture.run,
        artifact: fixture.artifact,
        failure: fixture.diagnostic.failure,
      },
    }),
  ).toBe(false);
});

test("current retention drops completed old active handles and a cleared saved handle without resurrecting expired evidence", async () => {
  const fixture = await nativeFixture();
  const old = {
    ...fixture.run,
    id: 702,
    created_at: "2026-10-01T12:00:00.000Z",
    status: "in_progress",
    conclusion: null,
    path: ".github/workflows/automation-worker.yml",
    display_title: `Automation ${fixture.input.operation.key}`,
  };
  fixture.state.remote.runs.push(old);
  fixture.input.history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  Object.assign(old, { status: "completed", conclusion: "failure" });
  const recent = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    nowMs: fixture.input.nowMs + 1000,
  });
  expect(recent?.runs.some((run) => run.id === old.id)).toBe(false);
  const saved = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    operation: { ...fixture.input.operation, workerRunId: old.id },
    nowMs: fixture.input.nowMs + 2000,
  });
  expect(saved?.runs.find((run) => run.id === old.id)).toEqual(old);
  const cleared = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    nowMs: fixture.input.nowMs + 3000,
  });
  expect(cleared?.runs.some((run) => run.id === old.id)).toBe(false);
  const expired = fixture.input.nowMs + 7 * 86_400_000;
  expect(
    await loadPreparedDiagnosticRuns({ ...fixture.input, nowMs: expired }),
  ).toBeNull();
  expect(
    (
      await loadGithubAutomationInventory({
        ...fixture.input,
        receipts: fixture.state.receipts,
        nowMs: expired,
      })
    ).runs,
  ).toEqual([]);
});

test("failure persistence reloads canonical receipt changes between comparison and persistence and after an earlier write", async () => {
  const fixture = await diagnosticFixture();
  try {
    const load = async () =>
      (await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      })) ?? (await inventory.loadAutomationInventory(fixture.input));
    const compared = await load();
    expect(compared.operations[0].nextEligibleAt).toBe(
      fixture.receipt.operation.nextEligibleAt,
    );
    const writes: AutomationReceipt[] = [];
    const persist = async (receipt: AutomationReceipt) => {
      writes.push(receipt);
      Object.assign(fixture.receipt, receipt);
      await fixture.saveReceipt();
    };
    fixture.receipt.operation.nextEligibleAt = new Date(
      nowMs + 86_400_000,
    ).toISOString();
    fixture.receipt.updatedAt = new Date(nowMs).toISOString();
    await fixture.saveReceipt();
    expect(
      await persistPreparedFailure({
        operationKey: fixture.operation.key,
        error: { failure: fixture.evidence.failure },
        load,
        persist,
      }),
    ).toMatchObject({ persisted: false });
    expect(writes).toEqual([]);
    fixture.receipt.operation.nextEligibleAt = new Date(
      nowMs - 60_000,
    ).toISOString();
    fixture.receipt.operation.retry!.transientAttempts = 3;
    fixture.receipt.operation.retry!.immediateAttempts = 1;
    await fixture.saveReceipt();
    await persistPreparedFailure({
      operationKey: fixture.operation.key,
      error: { failure: fixture.evidence.failure },
      load,
      persist,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].operation.retry).toMatchObject({
      transientAttempts: 4,
      immediateAttempts: 2,
    });
    const afterWrite = await load();
    expect(afterWrite.operations[0]).toEqual(writes[0].operation);
    fixture.receipt.operation.retry!.failure = {
      kind: "permanent",
      reasonCode: "authorization-lost",
    };
    fixture.receipt.operation.nextEligibleAt = null;
    await fixture.saveReceipt();
    const later = await load();
    expect(later.operations[0].retry?.failure.kind).toBe("permanent");
    expect(
      await persistPreparedFailure({
        operationKey: fixture.operation.key,
        error: { failure: fixture.evidence.failure },
        load,
        persist,
      }),
    ).toMatchObject({ persisted: false });
    expect(writes).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("advisory review-state changes are freshly classified before the exact key can be used", async () => {
  const fixture = await diagnosticFixture("advisory");
  try {
    const [, sourceId, projectId] =
      fixture.operation.identity.subject.split(":");
    const source = JSON.parse(
      await readFile(
        join(fixture.root, `data/registry/sources/${sourceId}.json`),
        "utf8",
      ),
    );
    const snapshot = JSON.parse(
      await readFile(
        join(fixture.root, `data/snapshots/${source.type}/${sourceId}.json`),
        "utf8",
      ),
    );
    const path = join(
      fixture.root,
      `data/snapshots/policy-review/${projectId}.json`,
    );
    for (const status of ["review-suggested", "clear"]) {
      await writeFile(
        path,
        JSON.stringify({
          schema_version: 1,
          project_id: projectId,
          source_id: sourceId,
          source_identity: `${source.type}:${source.repository.toLowerCase()}`,
          policy_version: fixture.operation.identity.policyVersion,
          evidence_fingerprint: createPolicyEvidenceFingerprint({
            projectId,
            sourceId,
            headSha: snapshot.repository.head_sha,
            policyVersion: fixture.operation.identity.policyVersion,
          }),
          status,
          maintenance_issue_number: null,
          category: null,
          reviewed_at: new Date(nowMs).toISOString(),
        }),
      );
      const full = await inventory.loadAutomationInventory(fixture.input);
      const scoped = await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      });
      if (status === "clear") {
        expect(
          full.operations.some(
            (operation) => operation.key === fixture.operation.key,
          ),
        ).toBe(false);
        expect(scoped).toBeNull();
      } else {
        expect(scoped?.operations).toEqual(
          full.operations.filter(
            (operation) => operation.key === fixture.operation.key,
          ),
        );
        expect(scoped?.operations[0].stage).toBe("validated");
        expect(
          isPreparedDiagnosticObsolete({
            state: scoped!,
            evidence: fixture.evidence,
          }),
        ).toBe(false);
      }
    }
  } finally {
    await fixture.cleanup();
  }
}, 25_000);

test("missing or invalid exact receipts and retired keys with no live receipt have no scoped authority", async () => {
  const fixture = await diagnosticFixture();
  try {
    const path = join(
      fixture.root,
      `data/maintenance/automation/operations/${fixture.operation.key}.json`,
    );
    await rm(path);
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).toBeNull();
    await writeFile(path, "invalid receipt JSON");
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).toBeNull();
    await rm(path);
    const directory = join(
      fixture.root,
      "data/maintenance/automation/terminal",
      fixture.operation.key.slice(0, 2),
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${fixture.operation.key}.json`),
      JSON.stringify({
        schema_version: 1,
        operationKey: fixture.operation.key,
        expectedSha: fixture.revision,
        completedAt: new Date(nowMs).toISOString(),
        retiredFromSha: fixture.revision,
        receiptBlobSha: "a".repeat(40),
        publicationBlobSha: "b".repeat(40),
      }),
    );
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test("a target beyond the global twenty worker diagnostics falls back when its completed-producer guard is invalidated", async () => {
  const fixture = await diagnosticFixture();
  try {
    const otherReceipts: AutomationReceipt[] = [];
    for (let index = 1; otherReceipts.length < 20; index++) {
      const identity = {
        ...fixture.operation.identity,
        subject: `source:github-${index}:prefix-${index}`,
      };
      const key = operationKey(identity);
      if (key < fixture.operation.key)
        otherReceipts.push({
          ...fixture.receipt,
          operation: {
            ...fixture.receipt.operation,
            identity,
            key,
            workerRunId: 1000 + otherReceipts.length,
          },
        });
    }
    fixture.receipt.operation.workerRunId = 2000;
    await fixture.saveReceipt();
    const receipts = [...otherReceipts, fixture.receipt];
    for (const receipt of otherReceipts)
      await writeFile(
        join(
          fixture.root,
          `data/maintenance/automation/operations/${receipt.operation.key}.json`,
        ),
        JSON.stringify(receipt),
      );
    for (const receipt of receipts)
      fixture.runs.push({
        ...fixture.run,
        id: receipt.operation.workerRunId!,
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${receipt.operation.key}`,
        updated_at: new Date(nowMs - 30 * 60_000).toISOString(),
        repository: { id: 42, full_name: repository },
        head_repository: { id: 42, full_name: repository },
      });
    fixture.run.actor = { id: 7, type: "Bot" };
    const reads: number[] = [];
    fixture.setRead(async (args) => {
      const id = Number(
        /\/actions\/runs\/([1-9]\d*)\/artifacts$/u.exec(
          args.find((value) => value.startsWith("repos/")) ?? "",
        )?.[1],
      );
      if (id) {
        reads.push(id);
        return JSON.stringify([{ total_count: 0, artifacts: [] }]);
      }
      return fixture.read(args);
    });
    const full = await inventory.loadAutomationInventory(fixture.input);
    expect(reads).toHaveLength(20);
    expect(reads).not.toContain(2000);
    expect(
      full.operations.find(
        (operation) => operation.key === fixture.operation.key,
      )?.retry?.failure.kind,
    ).toBe("unknown");
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        history: full.remote,
        operation: fixture.operation,
        evidenceRun: fixture.evidence.run,
      }),
    ).toBeNull();
    expect(reads).toHaveLength(20);
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test.each(["obsolete", "equal-clock"])(
  "twenty %s writer diagnostics complete real controller effects within the whole-pass request budget",
  async (variant) => {
    const fixture = await diagnosticFixture("advisory");
    const assess = vi
      .spyOn(health, "assessInventoryHealth")
      .mockReturnValue([]);
    const clock = vi.spyOn(Date, "now");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("No external report-index fetch expected"));
    try {
      const initial = await inventory.loadAutomationInventory(fixture.input);
      const selected = initial.operations
        .filter((operation) => operation.identity.kind === "advisory")
        .slice(0, 20);
      expect(selected).toHaveLength(20);
      const scenarioNowMs = Math.max(
        nowMs,
        Math.max(
          ...selected.map((operation) => Date.parse(operation.createdAt)),
        ) +
          3 * 3_600_000,
      );
      clock.mockReturnValue(scenarioNowMs);
      const fixtures = selected.map((operation, index) =>
        diagnosticReplayFixture(
          {
            ...fixture.receipt,
            updatedAt:
              variant === "equal-clock"
                ? new Date(scenarioNowMs - 2 * 3_600_000).toISOString()
                : new Date(scenarioNowMs - 3_600_000).toISOString(),
            operation: {
              ...operation,
              workerRunId: null,
              nextEligibleAt: new Date(scenarioNowMs - 60_000).toISOString(),
              retry: {
                failure: {
                  kind: variant === "equal-clock" ? "unknown" : "transient",
                  reasonCode:
                    variant === "equal-clock"
                      ? "unclassified-failure"
                      : "provider-rate-limited",
                },
                transientAttempts: 1,
                immediateAttempts: variant === "equal-clock" ? 2 : 0,
              },
            },
          },
          10_000 + index * 2,
          new Date(scenarioNowMs - 2 * 3_600_000).toISOString(),
        ),
      );
      expect(fixtures).toHaveLength(20);
      for (const value of fixtures) {
        expect(Date.parse(value.run.created_at!)).toBeGreaterThanOrEqual(
          Date.parse(value.receipt.operation.createdAt),
        );
        expect(validateAutomationReceipt(value.receipt)).toEqual(value.receipt);
      }
      await rm(
        join(
          fixture.root,
          `data/maintenance/automation/operations/${fixture.operation.key}.json`,
        ),
      );
      for (const value of fixtures)
        await writeFile(
          join(
            fixture.root,
            `data/maintenance/automation/operations/${value.receipt.operation.key}.json`,
          ),
          JSON.stringify(value.receipt),
        );
      fixture.runs.splice(
        0,
        fixture.runs.length,
        ...fixtures.map((value) => value.run),
      );
      for (const [workflow, count] of [
        ["automation-writer.yml", 1980],
        ["automation-worker.yml", 808],
        ["refresh-catalog.yml", 240],
        ["review-catalog-policy.yml", 6],
      ] as const) {
        for (let index = 0; index < count; index++)
          fixture.runs.push({
            ...fixtures[0].run,
            id: 100_000 + fixture.runs.length,
            path: `.github/workflows/${workflow}`,
            display_title: "Unrelated native work",
            created_at: new Date(
              scenarioNowMs -
                7 * 86_400_000 +
                1000 +
                Math.floor((index * (7 * 86_400_000 - 2000)) / count),
            ).toISOString(),
          });
      }
      const receipts = new Map(
        fixtures.map((value) => [value.receipt.operation.key, value.receipt]),
      );
      const requests: string[][] = [];
      let writes = 0;
      let dispatches = 0;
      const gh = Object.assign(
        async (args: string[], body?: string) => {
          requests.push(args);
          if (args[0] === "workflow") {
            dispatches++;
            return "";
          }
          const listPath =
            args.find((value) => value.startsWith("repos/")) ?? "";
          if (listPath.endsWith("/issues") || listPath.endsWith("/pulls")) {
            const rows = Array.from({ length: 240 }, (_, index) => ({
              number: 100_000 + index,
              state: args.includes("state=closed") ? "closed" : "open",
              title: "Unrelated canonical work",
              body: "Unrelated canonical work",
              labels: [],
              user: { id: 9, type: "User", login: "fixture" },
              created_at: new Date(scenarioNowMs - 86_400_000).toISOString(),
              updated_at: new Date(scenarioNowMs - 3_600_000).toISOString(),
              head: {
                sha: "b".repeat(40),
                ref: `unrelated-${index}`,
                repo: { full_name: "Lookalike/Tavernary" },
              },
              base: { ref: "main", repo: { full_name: repository } },
            }));
            const page = Number(
              args.find((value) => value.startsWith("page="))?.slice(5) ?? 1,
            );
            return JSON.stringify([rows.slice((page - 1) * 100, page * 100)]);
          }
          const receiptKey =
            /\/contents\/data\/maintenance\/automation\/operations\/([a-f0-9]{64})\.json(?:\?ref=main)?$/u.exec(
              args.find((value) => value.startsWith("repos/")) ?? "",
            )?.[1];
          if (receiptKey) {
            if (args.includes("PUT")) {
              const request = JSON.parse(body!);
              expect(request.sha).toBe("d".repeat(40));
              const receipt = JSON.parse(
                Buffer.from(request.content, "base64").toString("utf8"),
              );
              receipts.set(receiptKey, receipt);
              await writeFile(
                join(
                  fixture.root,
                  `data/maintenance/automation/operations/${receiptKey}.json`,
                ),
                JSON.stringify(receipt),
              );
              writes++;
              return "{}";
            }
            return JSON.stringify({
              sha: "d".repeat(40),
              encoding: "base64",
              content: Buffer.from(
                JSON.stringify(receipts.get(receiptKey)),
              ).toString("base64"),
            });
          }
          const runId = Number(
            /\/actions\/runs\/([1-9]\d*)\/artifacts$/u.exec(
              args.find((value) => value.startsWith("repos/")) ?? "",
            )?.[1],
          );
          if (runId)
            return fixtures
              .find((value) => value.run.id === runId)!
              .reader.gh(args);
          return fixture.input.gh(args);
        },
        {
          download: async (args: string[]) => {
            requests.push(["download", ...args]);
            const artifactId = Number(
              /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
            );
            return fixtures
              .find((value) => value.artifact.id === artifactId)!
              .reader.download();
          },
        },
      );
      const keys = new Set(selected.map((operation) => operation.key));
      const scopedCalls: string[][] = [];
      let fullLoads = 0;
      let scopedLoads = 0;
      const result = await runGithubWriterPass({
        gh,
        download: gh.download,
        nowMs: scenarioNowMs,
        loadCooldown: async () => null,
        persistCooldown: async () => {
          throw new Error("No cooldown expected");
        },
        run: async (guardedGh) => {
          const input = {
            ...fixture.input,
            nowMs: scenarioNowMs,
            gh: guardedGh,
            publisherActorId: fixtures[0].state.publisherActorId,
          };
          return runAutomationWriterReconciliation({
            gh: guardedGh,
            load: async () => {
              fullLoads++;
              const state = await inventory.loadAutomationInventory(input);
              state.operations = state.operations.filter((operation) =>
                keys.has(operation.key),
              );
              delete state.local.runtimePolicy;
              return state;
            },
            loadDiagnostic: async (context) => {
              scopedLoads++;
              const start = requests.length;
              const state = await inventory.loadPreparedDiagnosticInventory({
                root: input.root,
                gh: guardedGh,
                repository,
                publisherActorId: input.publisherActorId,
                nowMs: scenarioNowMs,
                ...context,
              });
              scopedCalls.push(...requests.slice(start));
              return state;
            },
            env: {
              GITHUB_REPOSITORY: repository,
              GITHUB_REF: "refs/heads/main",
              GITHUB_EVENT_NAME: "workflow_dispatch",
              GITHUB_ACTOR_ID: "2625904",
              GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
              TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
            },
          });
        },
      });
      expect(result).not.toMatchObject({ reason: "github-request-budget" });
      if (!("prepared" in result && "controller" in result))
        throw new Error("Whole-pass controller was not reached.");
      expect(result.prepared).toMatchObject(
        variant === "obsolete"
          ? {
              failures: 0,
              published: 0,
              consumedKeys: [],
              reloadRequired: true,
            }
          : {
              failures: 20,
              published: 0,
              consumedKeys: expect.arrayContaining([...keys]),
            },
      );
      expect(fullLoads).toBe(2);
      expect(scopedLoads).toBe(variant === "obsolete" ? 20 : 40);
      expect(dispatches).toBe(variant === "obsolete" ? 20 : 0);
      expect(writes).toBe(20);
      expect(fetch).not.toHaveBeenCalled();
      expect(result.controller).toMatchObject(
        variant === "obsolete"
          ? { dispatched: 20, selectedKeys: expect.arrayContaining([...keys]) }
          : { dispatched: 0, selectedKeys: [] },
      );
      for (const receipt of receipts.values()) {
        expect(validateAutomationReceipt(receipt)).toEqual(receipt);
        expect(receipt.operation).toMatchObject(
          variant === "obsolete"
            ? {
                workerRunId: null,
                nextEligibleAt: new Date(
                  scenarioNowMs + 15 * 60_000,
                ).toISOString(),
                retry: { transientAttempts: 1, immediateAttempts: 0 },
              }
            : {
                workerRunId: null,
                nextEligibleAt: new Date(
                  scenarioNowMs + 86_400_000,
                ).toISOString(),
                retry: {
                  transientAttempts: 2,
                  immediateAttempts: 3,
                  failure: {
                    kind: "unknown",
                    reasonCode: "unclassified-failure",
                  },
                },
              },
        );
      }
      expect(requests.length).toBeLessThan(1000);
      const routes = scopedCalls.map((args) =>
        args.find((value) => value.startsWith("repos/"))!,
      );
      expect(
        routes.filter((route) => /\/(?:issues|pulls)$/u.test(route)),
      ).toEqual([]);
      expect(
        routes.filter((route) => route.includes("/actions/workflows/")),
      ).toHaveLength(0);
      expect(
        routes.filter((route) => route.endsWith("/actions/runs")),
      ).toHaveLength(variant === "obsolete" ? 120 : 240);
      expect(
        routes.filter((route) => route.endsWith("/git/ref/heads/main")),
      ).toHaveLength(variant === "obsolete" ? 60 : 120);
      expect(
        routes.filter((route) => /\/actions\/runs\/[1-9]\d*$/u.test(route)),
      ).toHaveLength(variant === "obsolete" ? 20 : 40);
      const allRoutes = requests.map(
        (args) => args.find((value) => value.startsWith("repos/")) ?? "",
      );
      const counts = {
        total: requests.length,
        issues: allRoutes.filter((route) => route.endsWith("/issues")).length,
        pulls: allRoutes.filter((route) => route.endsWith("/pulls")).length,
        main: allRoutes.filter((route) => route.endsWith("/git/ref/heads/main"))
          .length,
        repositoryRuns: allRoutes.filter((route) =>
          route.endsWith("/actions/runs"),
        ).length,
        workflowRuns: allRoutes.filter((route) =>
          route.includes("/actions/workflows/"),
        ).length,
        directRuns: allRoutes.filter((route) =>
          /\/actions\/runs\/[1-9]\d*$/u.test(route),
        ).length,
        artifactLists: allRoutes.filter((route) =>
          /\/actions\/runs\/[1-9]\d*\/artifacts$/u.test(route),
        ).length,
        downloads: requests.filter((args) => args[0] === "download").length,
        receiptReads: allRoutes.filter((route) =>
          route.endsWith(".json?ref=main"),
        ).length,
        writes,
        dispatches,
        scoped: scopedCalls.length,
      };
      expect(counts).toEqual({
        total: variant === "obsolete" ? 467 : 607,
        issues: 12,
        pulls: 12,
        main: variant === "obsolete" ? 62 : 122,
        repositoryRuns: variant === "obsolete" ? 200 : 320,
        workflowRuns: variant === "obsolete" ? 21 : 1,
        directRuns: 60,
        artifactLists: 20,
        downloads: 20,
        receiptReads: 20,
        writes: 20,
        dispatches: variant === "obsolete" ? 20 : 0,
        scoped: variant === "obsolete" ? 200 : 400,
      });
      console.info(
        `Whole-pass ${variant} endpoint counts`,
        JSON.stringify(counts),
      );
    } finally {
      assess.mockRestore();
      clock.mockRestore();
      fetch.mockRestore();
      await fixture.cleanup();
    }
  },
  120_000,
);

test("metadata cache, visibility, source, repository and vocabulary changes are freshly reconstructed", async () => {
  const fixture = await diagnosticFixture();
  try {
    const full = await inventory.loadAutomationInventory(fixture.input);
    const [, sourceId, projectId] =
      fixture.operation.identity.subject.split(":");
    const projectPath = join(
      fixture.root,
      `data/registry/projects/${projectId}.json`,
    );
    const sourcePath = join(
      fixture.root,
      `data/registry/sources/${sourceId}.json`,
    );
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    const source = JSON.parse(await readFile(sourcePath, "utf8"));
    const snapshotPath = join(
      fixture.root,
      `data/snapshots/${source.type}/${sourceId}.json`,
    );
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    const tagsPath = join(fixture.root, "data/vocabularies/tags.json");
    const tags = JSON.parse(await readFile(tagsPath, "utf8"));
    const metadataDirectory = join(
      fixture.root,
      "data/maintenance/automation/metadata",
    );
    await mkdir(metadataDirectory, { recursive: true });
    const cachePath = join(metadataDirectory, `${fixture.operation.key}.json`);
    const cache = createMetadataCache({
      operation: fixture.operation,
      record: project,
      sourceIdentity: `${source.type}:${source.repository_id}`,
      headSha: snapshot.repository.head_sha,
      normalizedContent: "Fresh canonical source",
      vocabularyHash: full.local.vocabularyHash as string,
      nowMs,
    });
    for (const variant of [
      "cache",
      "cache-removed",
      "visibility",
      "source",
      "repository",
      "vocabulary",
    ]) {
      await writeFile(
        projectPath,
        JSON.stringify({
          ...project,
          ...(variant === "visibility" ? { visibility: "hidden" } : {}),
        }),
      );
      await writeFile(
        sourcePath,
        JSON.stringify({
          ...source,
          ...(variant === "source" ? { refresh_policy: "manual" } : {}),
        }),
      );
      await writeFile(
        snapshotPath,
        JSON.stringify({
          ...snapshot,
          repository: {
            ...snapshot.repository,
            ...(variant === "repository"
              ? { description: "Fresh native repository description" }
              : {}),
          },
        }),
      );
      await writeFile(
        tagsPath,
        JSON.stringify(
          variant === "vocabulary"
            ? {
                ...tags,
                tags: tags.tags.map((tag: { label: string }, index: number) =>
                  index === 0 ? { ...tag, label: `${tag.label} updated` } : tag,
                ),
              }
            : tags,
        ),
      );
      if (variant === "cache")
        await writeFile(cachePath, JSON.stringify(cache));
      else await rm(cachePath, { force: true });
      const fresh = await inventory.loadAutomationInventory(fixture.input);
      const expected = fresh.operations.filter(
        (value) => value.key === fixture.operation.key,
      );
      const scoped = await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      });
      if (expected.length) expect(scoped?.operations).toEqual(expected);
      else expect(scoped).toBeNull();
      if (["cache", "visibility", "repository", "vocabulary"].includes(variant))
        expect(expected).toEqual([]);
    }
  } finally {
    await fixture.cleanup();
  }
}, 60_000);

test.each(["kit", "withdrawal", "enrichment", "report-import"] as const)(
  "the unsupported %s prepared family has no scoped authority",
  async (kind) => {
    const fixture = await nativeFixture();
    const identity = { ...fixture.input.operation.identity, kind };
    const operation = {
      ...fixture.input.operation,
      identity,
      key: operationKey(identity),
    };
    expect(
      await loadPreparedDiagnosticRuns({ ...fixture.input, operation }),
    ).toBeNull();
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation,
        root: process.cwd(),
      }),
    ).toBeNull();
    expect(fixture.calls).toEqual([]);
  },
);

test("a matching canonical publication always requires the full precedence overlay", async () => {
  const fixture = await diagnosticFixture();
  try {
    const result = preparedResultFixture({
      operationKey: fixture.operation.key,
      kind: "metadata",
      inputDigest: fixture.operation.identity.inputDigest,
      policyVersion: fixture.operation.identity.policyVersion,
    });
    const record = createCanonicalPublicationRecord({
      operation: fixture.operation,
      result,
    });
    const directory = join(
      fixture.root,
      "data/maintenance/automation/publications",
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${fixture.operation.key}.json`),
      JSON.stringify(record),
    );
    for (const stage of [
      "admitted",
      "published",
      "deployment-confirmed",
      "finalized",
    ] as const) {
      Object.assign(fixture.receipt.operation, {
        stage,
        expectedSha: stage === "admitted" ? null : fixture.revision,
      });
      if (stage === "finalized")
        fixture.receipt.completedAt = fixture.receipt.updatedAt;
      await fixture.saveReceipt();
      fixture.calls.length = 0;
      expect(
        await inventory.loadPreparedDiagnosticInventory({
          ...fixture.input,
          operation: fixture.operation,
          evidenceRun: fixture.run,
        }),
      ).toBeNull();
      expect(fixture.calls).toEqual([]);
    }
    const projectId = fixture.operation.identity.subject.split(":")[2];
    const path = join(fixture.root, `data/registry/projects/${projectId}.json`);
    const project = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...project, visibility: "hidden" }));
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test("lost completed producer custody falls back before worker diagnostic reconstruction", async () => {
  const fixture = await diagnosticFixture();
  const original = structuredClone(fixture.run);
  try {
    const variants = [
      null,
      { ...original, status: "in_progress", conclusion: null, run_attempt: 2 },
      { ...original, actor: { id: 7, type: "Bot" } },
      { ...original, path: ".github/workflows/refresh-catalog.yml" },
      { ...original, head_repository: { full_name: "Lookalike/Tavernary" } },
    ];
    for (const run of variants) {
      fixture.runs.splice(0, fixture.runs.length, ...(run ? [run] : []));
      expect(
        await inventory.loadPreparedDiagnosticInventory({
          ...fixture.input,
          operation: fixture.operation,
          knownRuns: [original],
          evidenceRun: original,
        }),
      ).toBeNull();
    }
    const newer = {
      ...original,
      id: 702,
      created_at: new Date(nowMs).toISOString(),
      updated_at: new Date(nowMs).toISOString(),
    };
    fixture.runs.splice(
      0,
      fixture.runs.length,
      { ...original, run_attempt: 2, status: "in_progress", conclusion: null },
      newer,
    );
    const guarded = await inventory.loadPreparedDiagnosticInventory({
      ...fixture.input,
      operation: fixture.operation,
      knownRuns: [original],
      evidenceRun: original,
    });
    expect(guarded?.operations[0].workerRunId).toBe(original.id);
    expect(
      isPreparedDiagnosticObsolete({
        state: guarded!,
        evidence: { ...fixture.evidence, run: original },
      }),
    ).toBe(false);
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

test("main drift never joins fresh workflow authority to a different canonical revision", async () => {
  const fixture = await diagnosticFixture();
  try {
    for (const changedRead of [1, 2, 3]) {
      let reads = 0;
      const gh = async (args: string[]) => {
        if (args.some((value) => value.endsWith("/git/ref/heads/main"))) {
          reads++;
          return JSON.stringify({
            object: {
              sha: reads >= changedRead ? "c".repeat(40) : fixture.revision,
            },
          });
        }
        return fixture.read(args);
      };
      fixture.setRead(gh);
      expect(
        await inventory.loadPreparedDiagnosticInventory({
          ...fixture.input,
          operation: fixture.operation,
          evidenceRun: fixture.run,
        }),
      ).toBeNull();
    }
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test.each([
  "malformed",
  "oversized",
  "negative-total",
  "incomplete",
  "active-overcap",
  "unsplittable",
  "search-budget",
  "workflow-unavailable",
])(
  "scoped %s history remains a visible inspection failure",
  async (variant) => {
    const fixture = await nativeFixture();
    const gh = async (args: string[]) => {
      if (!args.some((value) => value.endsWith("/actions/runs")))
        return fixture.read(args);
      if (variant === "malformed")
        return JSON.stringify([{ total_count: 1, workflow_runs: {} }]);
      if (variant === "oversized") return " ".repeat(4 * 1024 * 1024 + 1);
      if (variant === "negative-total")
        return JSON.stringify([{ total_count: -1, workflow_runs: [] }]);
      if (variant === "workflow-unavailable")
        throw Object.assign(new Error("HTTP 404 workflow unavailable"), {
          status: 404,
        });
      if (variant === "incomplete")
        return JSON.stringify([{ total_count: 101, workflow_runs: [] }]);
      if (variant === "unsplittable")
        return JSON.stringify([{ total_count: 1001, workflow_runs: [] }]);
      if (variant === "active-overcap")
        return JSON.stringify([
          {
            total_count: args.includes("status=waiting") ? 1001 : 0,
            workflow_runs: [],
          },
        ]);
      const range = args
        .find((value) => value.startsWith("created="))
        ?.slice(8)
        .split("..");
      const overcap =
        range && Date.parse(range[1]) - Date.parse(range[0]) > 6 * 3_600_000;
      return JSON.stringify([
        { total_count: overcap ? 1001 : 0, workflow_runs: [] },
      ]);
    };
    fixture.setRead(gh);
    await expect(
      loadPreparedDiagnosticRuns({
        ...fixture.input,
        nowMs: fixture.input.nowMs + 7 * 86_400_000,
      }),
    ).rejects.toThrow(
      variant === "search-budget"
        ? /search budget/u
        : variant === "unsplittable"
          ? /one second/u
          : /invalid|bound|truncated|cap|404/u,
    );
  },
);

test("known older handles are directly reread and fresh attempts discard decoded worker evidence", async () => {
  const fixture = await nativeFixture();
  const created_at = "2026-10-10T15:00:00.000Z";
  const knownRuns = [
    { ...fixture.run, id: 702, created_at },
    {
      ...fixture.run,
      id: 703,
      created_at,
      path: ".github/workflows/automation-worker.yml",
      display_title: `Automation ${fixture.input.operation.key}`,
    },
    {
      ...fixture.run,
      id: 704,
      created_at,
      path: ".github/workflows/automation-writer.yml",
      display_title: `Automation write publish ${fixture.input.operation.key}`,
    },
  ];
  const latest = knownRuns.map((run) => ({
    ...run,
    status: "in_progress",
    conclusion: null,
    run_attempt: 2,
    automationDiagnostic: { stale: true },
  }));
  fixture.state.remote.runs.push(...knownRuns);
  fixture.input.history = await loadGithubAutomationInventory({
    ...fixture.input,
    receipts: fixture.state.receipts,
  });
  const gh = async (args: string[]) => {
    const id = Number(
      /\/actions\/runs\/([1-9]\d*)$/u.exec(
        args.find((value) => value.startsWith("repos/"))!,
      )?.[1],
    );
    return latest.some((run) => run.id === id)
      ? JSON.stringify(latest.find((run) => run.id === id))
      : fixture.read(args);
  };
  fixture.setRead(gh);
  const native = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    knownRuns,
    nowMs: fixture.input.nowMs + 2 * 86_400_000,
  });
  for (const run of latest)
    expect(native?.runs.find((value) => value.id === run.id)).toEqual({
      ...run,
      automationDiagnostic: undefined,
    });
  expect(
    isPreparedDiagnosticObsolete({
      state: {
        ...fixture.state,
        remote: { ...fixture.state.remote, runs: native!.runs },
      },
      evidence: {
        operation: fixture.receipt.operation,
        run: fixture.run,
        artifact: fixture.artifact,
        failure: fixture.diagnostic.failure,
      },
    }),
  ).toBe(false);
});

test.each([
  "producer",
  "worker",
  "prepare",
  "publish",
  "reconcile-project",
  "confirm",
  "finalize",
  "advisory-notice",
])(
  "scoped native histories preserve every active %s handoff decision",
  async (mode) => {
    const fixture = await diagnosticFixture();
    try {
      const baseline = await inventory.loadAutomationInventory(fixture.input);
      for (const status of [
        "queued",
        "in_progress",
        "waiting",
        "requested",
        "pending",
      ]) {
        const peer = {
          ...fixture.run,
          id: 702,
          status,
          conclusion: null,
          path:
            mode === "producer"
              ? fixture.run.path
              : `.github/workflows/automation-${mode === "worker" ? "worker" : "writer"}.yml`,
          display_title:
            mode === "producer"
              ? fixture.run.display_title
              : mode === "worker"
                ? `Automation ${fixture.operation.key}`
                : `Automation write ${mode} ${fixture.operation.key}`,
        };
        fixture.runs.splice(1, fixture.runs.length, peer);
        const native = await loadPreparedDiagnosticRuns({
          ...fixture.input,
          operation: fixture.operation,
          knownRuns: [],
          evidenceRun: fixture.run,
        });
        expect(native?.runs.find((run) => run.id === peer.id)).toEqual(peer);
        for (const executingWriterRunId of [undefined, peer.id]) {
          const expectedState = {
            ...baseline,
            executingWriterRunId,
            remote: { ...baseline.remote, runs: fixture.runs },
          };
          expectedState.operations =
            inventory.discoverAutomationState(expectedState);
          const actualState = {
            ...baseline,
            executingWriterRunId,
            remote: { ...baseline.remote, runs: native!.runs },
          };
          actualState.operations =
            inventory.discoverAutomationState(actualState);
          const expected = expectedState.operations.find(
            (value) => value.key === fixture.operation.key,
          );
          expect(
            actualState.operations.find(
              (value) => value.key === fixture.operation.key,
            ),
          ).toEqual(expected);
          expect(
            isPreparedDiagnosticObsolete({
              state: actualState,
              evidence: fixture.evidence,
            }),
          ).toBe(
            isPreparedDiagnosticObsolete({
              state: expectedState,
              evidence: fixture.evidence,
            }),
          );
          if (executingWriterRunId === undefined)
            expect(
              isPreparedDiagnosticObsolete({
                state: actualState,
                evidence: fixture.evidence,
              }),
            ).toBe(false);
        }
      }
    } finally {
      await fixture.cleanup();
    }
  },
  30_000,
);

test("a fresh metadata diagnostic reconstructs exactly its full inventory decision without unrelated remote census", async () => {
  const fixture = await diagnosticFixture();
  try {
    const full = await inventory.loadAutomationInventory(fixture.input);
    fixture.calls.length = 0;
    const scoped = await inventory.loadPreparedDiagnosticInventory({
      ...fixture.input,
      operation: fixture.operation,
      knownRuns: fixture.runs,
      evidenceRun: fixture.run,
    });
    expect(scoped?.operations).toEqual(
      full.operations.filter((value) => value.key === fixture.operation.key),
    );
    expect(scoped?.receipts).toEqual(full.receipts);
    expect(
      isPreparedDiagnosticObsolete({
        state: scoped!,
        evidence: fixture.evidence,
      }),
    ).toBe(
      isPreparedDiagnosticObsolete({ state: full, evidence: fixture.evidence }),
    );
    expect(
      fixture.calls.filter((args) =>
        args.some((value) => /\/(?:issues|pulls)$/u.test(value)),
      ),
    ).toEqual([]);
    expect(
      fixture.calls.filter((args) =>
        args.some((value) => value.includes("/actions/workflows/")),
      ),
    ).toHaveLength(0);
    expect(
      fixture.calls.filter((args) =>
        args.some((value) => value.endsWith("/actions/runs")),
      ),
    ).toHaveLength(6);
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test.each(["refresh", "advisory"] as const)(
  "fresh %s diagnostics retain exact canonical full-discovery and failure decisions",
  async (kind) => {
    const fixture = await diagnosticFixture(kind);
    try {
      const full = await inventory.loadAutomationInventory(fixture.input);
      const scoped = await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      });
      expect(scoped?.operations).toHaveLength(1);
      expect(scoped?.operations[0]).toEqual(
        full.operations.find((value) => value.key === fixture.operation.key),
      );
      expect(scoped?.receipts).toEqual(full.receipts);
      expect(
        isPreparedDiagnosticObsolete({
          state: scoped!,
          evidence: fixture.evidence,
        }),
      ).toBe(true);
      const persisted: AutomationReceipt[][] = [[], []];
      for (const [index, state] of [full, scoped!].entries())
        await persistPreparedFailure({
          operationKey: fixture.operation.key,
          error: { failure: fixture.evidence.failure },
          load: async () => state,
          persist: async (receipt) => {
            persisted[index].push(receipt);
          },
        });
      expect(persisted[1]).toEqual(persisted[0]);
      expect(persisted[0]).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  },
  20_000,
);

test("a run page cannot contain more rows than its declared inventory total", async () => {
  const fixture = await diagnosticFixture();
  try {
    const gh = async (args: string[]) =>
      args.some((value) => value.endsWith("/actions/runs"))
        ? JSON.stringify([{ total_count: 0, workflow_runs: [fixture.run] }])
        : fixture.read(args);
    fixture.setRead(gh);
    await expect(
      loadPreparedDiagnosticRuns({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).rejects.toThrow(/invalid/u);
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test("a repeated run page cannot establish complete scoped history", async () => {
  const fixture = await diagnosticFixture();
  try {
    const gh = async (args: string[]) =>
      args.some((value) => value.endsWith("/actions/runs"))
        ? JSON.stringify([
            {
              total_count: 101,
              workflow_runs: Array.from(
                { length: args.includes("page=1") ? 100 : 1 },
                () => fixture.run,
              ),
            },
          ])
        : fixture.read(args);
    fixture.setRead(gh);
    await expect(
      loadPreparedDiagnosticRuns({
        ...fixture.input,
        operation: fixture.operation,
        evidenceRun: fixture.run,
      }),
    ).rejects.toThrow(/incomplete|truncated|duplicate/u);
  } finally {
    await fixture.cleanup();
  }
}, 20_000);

test("a canonical terminal marker requires full overlay reconstruction even with a live receipt", async () => {
  const fixture = await diagnosticFixture();
  try {
    const directory = join(
      fixture.root,
      "data/maintenance/automation/terminal",
      fixture.operation.key.slice(0, 2),
    );
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, `${fixture.operation.key}.json`),
      "malformed retirement marker",
    );
    expect(
      await inventory.loadPreparedDiagnosticInventory({
        ...fixture.input,
        operation: fixture.operation,
        knownRuns: fixture.runs,
        evidenceRun: fixture.run,
      }),
    ).toBeNull();
  } finally {
    await fixture.cleanup();
  }
}, 20_000);
