import { expect, test, vi } from "vitest";
import {
  planPreparedWake,
  selectPreparedWakes,
  runPreparedWakeCli,
} from "../../scripts/automation/prepared-wake.mjs";
import {
  AUTOMATION_NOW,
  operationFixture,
  preparedResultContextFixture,
} from "../helpers/automation-fixtures";
function generationWakeFixture(owner: boolean, project = false) {
  const repository = "MentallyQuill/Tavernary";
  return {
    id: 987,
    path: `.github/workflows/generate-${project ? "project-submission" : "project-owner-request"}.yml`,
    display_title: owner
      ? `${project ? "Project" : "Owner request"} #42: Request review PR force=true`
      : `Automation prepare ${"a".repeat(64)} request500`,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "b".repeat(40),
    actor: { id: owner ? 2625904 : 900, type: owner ? "User" : "Bot" },
    repository: { id: 1309605115, full_name: repository },
    head_repository: { id: 1309605115, full_name: repository },
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
  };
}
const generationWakeEnv = {
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_run",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-prepared.yml@refs/heads/main",
  TAVERNARY_PUBLISHER_BOT_ID: "900",
};
test("a generation result coalesces its accounting wake without losing a future pass", async () => {
  const run = generationWakeFixture(false);
  const gh = vi.fn(async (args: string[]) =>
    args[0] !== "api"
      ? ""
      : JSON.stringify(
          args[1].endsWith(`/runs/${run.id}`)
            ? run
            : {
                total_count: 1,
                workflow_runs: [{ display_title: "Automation reconcile" }],
              },
        ),
  );
  const write = vi.fn();
  expect(
    await runPreparedWakeCli({
      env: generationWakeEnv,
      runId: run.id,
      gh,
      write,
    }),
  ).toBe(0);
  expect(gh.mock.calls.some(([args]) => args[0] === "workflow")).toBe(false);
  expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
    status: "coalesced",
    mode: "reconcile",
    runId: run.id,
  });
});
test.each([true, false])(
  "a completed explicit generation request survives a lost direct handoff (project=%s)",
  async (project) => {
    const run = generationWakeFixture(true, project);
    const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
      JSON.stringify(run),
    );
    expect(
      await runPreparedWakeCli({
        env: generationWakeEnv,
        runId: run.id,
        gh,
        write: () => {},
      }),
    ).toBe(0);
    expect(gh.mock.calls[1][0]).toEqual(
      expect.arrayContaining(["mode=prepare", "result_run_id=987"]),
    );
    expect(
      gh.mock.calls[1][0].some((value: string) =>
        value.startsWith("operation_key="),
      ),
    ).toBe(false);
  },
);
test.each(["success", "failure", "cancelled"])(
  "a %s generation completion reconciles accounting without publishing an artifact",
  async (conclusion) => {
    const run = { ...generationWakeFixture(false), conclusion };
    const gh = vi.fn(async (args: string[]) =>
      args[0] !== "api"
        ? ""
        : JSON.stringify(
            args[1].endsWith(`/runs/${run.id}`)
              ? run
              : { total_count: 0, workflow_runs: [] },
          ),
    );
    expect(
      await runPreparedWakeCli({
        env: generationWakeEnv,
        runId: run.id,
        gh,
        write: () => {},
      }),
    ).toBe(0);
    expect(gh.mock.calls.at(-1)?.[0]).toContain("mode=reconcile");
    expect(gh.mock.calls.at(-1)?.[0]).not.toContain("mode=publish");
    expect(
      gh.mock.calls.filter(([args]) => args[0] === "workflow"),
    ).toHaveLength(1);
    expect(
      planPreparedWake({
        run,
        repository: generationWakeEnv.GITHUB_REPOSITORY,
        publisherActorId: 900,
      }),
    ).toBeNull();
  },
);
test.each([
  "actor",
  "origin",
  "attempt",
  "active",
  "title",
  "handler",
  "request-failed",
])("a forged or incomplete generation %s wake is ignored", async (variant) => {
  const run = generationWakeFixture(variant === "request-failed");
  const env = { ...generationWakeEnv };
  if (variant === "actor") run.actor.id++;
  if (variant === "origin") run.head_repository.id++;
  if (variant === "attempt") run.run_attempt++;
  if (variant === "active") run.status = "in_progress";
  if (variant === "title") run.display_title += " arbitrary";
  if (variant === "handler") env.GITHUB_WORKFLOW_REF = "other";
  if (variant === "request-failed") run.conclusion = "failure";
  const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
    JSON.stringify(run),
  );
  expect(
    await runPreparedWakeCli({ env, runId: run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh).toHaveBeenCalledOnce();
});
test("an authenticated completed owner request wakes only its shared writer admission", async () => {
  const repository = "MentallyQuill/Tavernary";
  const run = {
    id: 987,
    path: ".github/workflows/request-catalog-enrichment.yml",
    display_title: "Enrichment request all-automatic batch20 concurrency2",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
    actor: { id: 2625904, type: "User" },
    repository: { id: 1309605115, full_name: repository },
    head_repository: { id: 1309605115, full_name: repository },
    status: "completed",
    conclusion: "success",
  };
  const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
    JSON.stringify(run),
  );
  const write = vi.fn();
  expect(
    await runPreparedWakeCli({
      env: {
        GITHUB_REPOSITORY: repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_run",
        GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-prepared.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: "900",
      },
      runId: 987,
      gh,
      write,
    }),
  ).toBe(0);
  expect(gh).toHaveBeenCalledWith([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    "mode=enrichment-request",
    "-f",
    "result_run_id=987",
  ]);
  expect(write).toHaveBeenCalledWith(
    JSON.stringify({
      status: "dispatched",
      mode: "enrichment-request",
      runId: 987,
    }),
  );
});
function fixture() {
  const context = preparedResultContextFixture();
  return {
    repository: context.currentState.repository,
    publisherActorId: context.publisherActorId,
    run: {
      ...context.run,
      display_title: `Automation prepare ${context.operation.key}`,
      created_at: "2026-10-08T12:00:00Z",
    },
    operation: context.operation,
  };
}
function rankedWakeFixture() {
  const input = fixture();
  const olderBackground = operationFixture({
    identity: { ...input.operation.identity, subject: "source:github-101" },
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  const newerBackground = operationFixture({
    identity: { ...input.operation.identity, subject: "source:github-102" },
    createdAt: "2026-10-02T00:00:00.000Z",
  });
  const kit = operationFixture({
    identity: {
      ...input.operation.identity,
      kind: "kit",
      subject: "issue:103",
    },
    createdAt: "2026-10-03T00:00:00.000Z",
  });
  const report = operationFixture({
    identity: {
      ...input.operation.identity,
      kind: "report-import",
      subject: "report:104",
    },
    createdAt: "2026-10-04T00:00:00.000Z",
  });
  const operations = [report, newerBackground, kit, olderBackground];
  const runs = operations.map((operation, index) => ({
    ...structuredClone(input.run),
    id: input.run.id + index,
    path:
      operation.identity.kind === "kit"
        ? ".github/workflows/apply-kit-submission.yml"
        : operation.identity.kind === "report-import"
          ? ".github/workflows/import-tavernkeeper-reports.yml"
          : input.run.path,
    display_title: `Automation prepare ${operation.key}`,
  }));
  return {
    ...input,
    operations,
    runs,
    nowMs: AUTOMATION_NOW,
    olderBackground,
    newerBackground,
    kit,
    report,
  };
}

test("prepared wake rank reserves a smaller slice for younger authenticated Kit and report results", () => {
  const input = rankedWakeFixture();
  const selected = selectPreparedWakes({
    ...input,
    limit: 2,
    priorityKeys: [input.report.key, input.kit.key],
  });
  expect(selected.map((wake) => wake.operationKey)).toEqual([
    input.report.key,
    input.kit.key,
  ]);
});

test.each([
  { priorityKeys: undefined, label: "absent" },
  { priorityKeys: [], label: "empty" },
])(
  "$label prepared wake rank retains the original oldest ordering",
  ({ priorityKeys }) => {
    const input = rankedWakeFixture();
    expect(
      selectPreparedWakes({ ...input, limit: 2, priorityKeys }).map(
        (wake) => wake.operationKey,
      ),
    ).toEqual([input.olderBackground.key, input.newerBackground.key]);
  },
);

test("unknown rank keys grant no wakes and unranked wakes keep their oldest ordering", () => {
  const input = rankedWakeFixture();
  expect(
    selectPreparedWakes({
      ...input,
      limit: 3,
      priorityKeys: ["f".repeat(64), input.kit.key],
    }).map((wake) => wake.operationKey),
  ).toEqual([
    input.kit.key,
    input.olderBackground.key,
    input.newerBackground.key,
  ]);
});

test.each([
  "active-worker",
  "future-deadline",
  "foreign-producer",
  "wrong-kind-producer",
  "blocked-peer",
  "absent-operation",
])("prepared rank cannot authorize a %s wake", (variant) => {
  const input = rankedWakeFixture();
  const run = input.runs.find(
    (candidate) =>
      candidate.display_title === `Automation prepare ${input.kit.key}`,
  )!;
  if (variant === "active-worker") input.kit.workerRunId = 701;
  if (variant === "future-deadline")
    input.kit.nextEligibleAt = new Date(AUTOMATION_NOW + 1).toISOString();
  if (variant === "foreign-producer") run.actor.id++;
  if (variant === "wrong-kind-producer")
    run.path = ".github/workflows/refresh-catalog.yml";
  if (variant === "blocked-peer")
    input.operations.push({ ...input.kit, workerRunId: 701 });
  if (variant === "absent-operation")
    input.operations = input.operations.filter(
      (operation) => operation.key !== input.kit.key,
    );
  expect(
    selectPreparedWakes({
      ...input,
      limit: 1,
      priorityKeys: [input.kit.key],
    }).map((wake) => wake.operationKey),
  ).toEqual([input.olderBackground.key]);
});

test("prepared rank preserves the latest trusted producer for its exact key", () => {
  const input = rankedWakeFixture();
  const run = input.runs.find(
    (candidate) =>
      candidate.display_title === `Automation prepare ${input.kit.key}`,
  )!;
  input.runs.push(
    { ...structuredClone(run), id: 800 },
    { ...structuredClone(run), id: 801, actor: { ...run.actor, id: 1 } },
  );
  expect(
    selectPreparedWakes({
      ...input,
      limit: 1,
      priorityKeys: [input.kit.key],
    }),
  ).toEqual([{ operationKey: input.kit.key, runId: 800 }]);
});

test.each([
  { priorityKeys: ["a".repeat(63)], label: "short key" },
  { priorityKeys: ["A".repeat(64)], label: "uppercase key" },
  { priorityKeys: ["g".repeat(64)], label: "nonhex key" },
  { priorityKeys: ["a".repeat(64), "a".repeat(64)], label: "duplicate key" },
  {
    priorityKeys: Array.from({ length: 21 }, (_, index) =>
      index.toString(16).padStart(64, "0"),
    ),
    label: "twenty-one keys",
  },
  { priorityKeys: null, label: "null rank" },
  { priorityKeys: "a".repeat(64), label: "string rank" },
  { priorityKeys: [null], label: "null key" },
  { priorityKeys: Array(1), label: "sparse rank" },
])(
  "invalid prepared rank with $label is rejected before selecting a wake",
  ({ priorityKeys }) => {
    const input = rankedWakeFixture();
    expect(() =>
      selectPreparedWakes({ ...input, priorityKeys: priorityKeys as never }),
    ).toThrow("Prepared wake priority keys are invalid.");
  },
);

test("a twenty-key prepared rank remains bounded to authenticated current wakes", () => {
  const input = rankedWakeFixture();
  const priorityKeys = [
    ...Array.from({ length: 19 }, (_, index) =>
      index.toString(16).padStart(64, "0"),
    ),
    input.kit.key,
  ];
  expect(
    selectPreparedWakes({ ...input, limit: 1, priorityKeys }).map(
      (wake) => wake.operationKey,
    ),
  ).toEqual([input.kit.key]);
});
test("a completed trusted producer wakes the serialized writer with only its bound operation and run", () => {
  const input = fixture();
  expect(planPreparedWake(input)).toEqual({
    operationKey: input.operation.key,
    runId: input.run.id,
  });
});
test.each([
  "actor",
  "fork",
  "workflow",
  "branch",
  "title",
  "active",
  "failure",
])(
  "a foreign or incomplete %s wake cannot dispatch privileged work",
  (variant) => {
    const input = fixture();
    if (variant === "actor") input.run.actor.id++;
    if (variant === "fork")
      input.run.head_repository.full_name = "Foreign/Repo";
    if (variant === "workflow") input.run.path = ".github/workflows/ci.yml";
    if (variant === "branch") input.run.head_branch = "foreign";
    if (variant === "title")
      input.run.display_title = "Automation prepare command-injection";
    if (variant === "active") input.run.status = "in_progress";
    if (variant === "failure") input.run.conclusion = "failure";
    expect(planPreparedWake(input)).toBeNull();
  },
);
test("missed preparation wakes can be reconstructed from current operations and completed runs", () => {
  const input = fixture();
  const selected = selectPreparedWakes({
    ...input,
    operations: [input.operation],
    runs: [input.run, { ...input.run, id: input.run.id + 1 }],
    limit: 20,
  });
  expect(selected).toEqual([
    { operationKey: input.operation.key, runId: input.run.id + 1 },
  ]);
  expect(
    selectPreparedWakes({
      ...input,
      operations: [],
      runs: [input.run],
      limit: 20,
    }),
  ).toEqual([]);
});

test("completed handoffs cannot bypass persisted backoff or an active worker", () => {
  const input = fixture();
  const nowMs = Date.now();
  for (const operation of [
    {
      ...input.operation,
      nextEligibleAt: new Date(nowMs + 86_400_000).toISOString(),
    },
    { ...input.operation, workerRunId: 701 },
  ])
    expect(
      selectPreparedWakes({
        ...input,
        operations: [operation],
        runs: [input.run],
        nowMs,
      }),
    ).toEqual([]);
});
test("the completion CLI fetches authoritative run metadata and dispatches only the shared writer", async () => {
  const input = fixture();
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "api" ? JSON.stringify(input.run) : "",
  );
  const env = {
    GITHUB_REPOSITORY: input.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_run",
    TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
  };
  expect(
    await runPreparedWakeCli({ env, runId: input.run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh).toHaveBeenLastCalledWith([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    input.repository,
    "--ref",
    "main",
    "-f",
    "mode=publish",
    "-f",
    `operation_key=${input.operation.key}`,
    "-f",
    `result_run_id=${input.run.id}`,
  ]);
});

test("a trusted failed completion wakes reconciliation for diagnostics without dispatching publication", async () => {
  const input = fixture();
  input.run.conclusion = "failure";
  const gh = vi.fn(async (args: string[]) =>
    args[0] !== "api"
      ? ""
      : JSON.stringify(
          args[1].endsWith(`/runs/${input.run.id}`)
            ? input.run
            : { total_count: 0, workflow_runs: [] },
        ),
  );
  const env = {
    GITHUB_REPOSITORY: input.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_run",
    TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
  };
  expect(
    await runPreparedWakeCli({ env, runId: input.run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh.mock.calls.at(-1)?.[0]).toContain("mode=reconcile");
  expect(gh.mock.calls.at(-1)?.[0]).not.toContain("mode=publish");
  expect(gh.mock.calls.filter(([args]) => args[0] === "workflow")).toHaveLength(
    1,
  );
});

test("a failed preparation preserves an existing future reconciliation without another dispatch", async () => {
  const input = fixture();
  input.run.conclusion = "failure";
  const gh = vi.fn(async (args: string[]) =>
    args[0] !== "api"
      ? ""
      : JSON.stringify(
          args[1].endsWith(`/runs/${input.run.id}`)
            ? input.run
            : {
                total_count: 1,
                workflow_runs: [{ display_title: "Automation reconcile" }],
              },
        ),
  );
  const write = vi.fn();
  expect(
    await runPreparedWakeCli({
      env: {
        ...generationWakeEnv,
        GITHUB_REPOSITORY: input.repository,
        TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
      },
      runId: input.run.id,
      gh,
      write,
    }),
  ).toBe(0);
  expect(gh.mock.calls.some(([args]) => args[0] === "workflow")).toBe(false);
  expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
    status: "coalesced",
  });
});

test.each(["generation", "diagnostic"])(
  "an incomplete future-wake inventory refuses a %s completion dispatch",
  async (kind) => {
    const input = fixture();
    input.run.conclusion = "failure";
    const run =
      kind === "generation" ? generationWakeFixture(false) : input.run;
    const gh = vi.fn(async (args: string[]) =>
      args[0] !== "api"
        ? ""
        : JSON.stringify(
            args[1].endsWith(`/runs/${run.id}`)
              ? run
              : { total_count: 101, workflow_runs: [] },
          ),
    );
    const write = vi.fn();
    expect(
      await runPreparedWakeCli({
        env: {
          ...generationWakeEnv,
          TAVERNARY_PUBLISHER_BOT_ID:
            kind === "generation" ? "900" : String(input.publisherActorId),
        },
        runId: run.id,
        gh,
        write,
      }),
    ).toBe(1);
    expect(gh.mock.calls.some(([args]) => args[0] === "workflow")).toBe(false);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      status: "unavailable",
    });
  },
);
