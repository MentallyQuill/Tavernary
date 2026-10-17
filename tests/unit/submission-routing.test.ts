import { expect, test, vi } from "vitest";
import * as routing from "../../scripts/automation/submission-routing.mjs";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { projectInventoryFixture } from "../helpers/automation-fixtures";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { operationFixture } from "../helpers/automation-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { reconcileAutomation } from "../../scripts/automation/reconcile.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import {
  selectWriterAdmissionReservations,
  runModelWriterPreparation,
} from "../../scripts/automation/writer-runtime.mjs";
import { planPreparationRequest } from "../../scripts/automation/preparation-request.mjs";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { planProjectGenerationFailure } from "../../scripts/submissions/project-generation-failure.mjs";
import { inspectProjectRetries } from "../../scripts/automation/project-retries.mjs";
import { reconcileSubmissionHandoffs } from "../../scripts/submissions/reconcile-project-validations.mjs";

test.each(["project-submission", "project-owner-request"] as const)(
  "%s direct failure keeps its authenticated deadline without a legacy receipt",
  async (producer) => {
    const input = projectInventoryFixture({ producer });
    input.issues[0].labels.push("submission-retryable");
    const nowMs = Date.now();
    const failure = planProjectGenerationFailure({
      issue: input.issues[0],
      producer,
      ownedPull: null,
      reasonCode: "provider-authentication-failed",
      runUrl: "https://github.com/MentallyQuill/Tavernary/actions/runs/700",
      nowMs: nowMs - 60000,
    });
    if (failure.action !== "reconcile")
      throw new Error("Invalid failure fixture");
    const run = {
      id: 700,
      status: "completed",
      conclusion: "failure",
      event: "workflow_dispatch",
      path: `.github/workflows/generate-${producer}.yml`,
      head_branch: "main",
      head_repository: { full_name: "MentallyQuill/Tavernary" },
      actor: { id: input.publisherActorId, type: "Bot" },
      display_title: `${producer === "project-submission" ? "Project" : "Owner request"} #42: Create review PR`,
      updated_at: new Date(nowMs - 60000).toISOString(),
    };
    const comment = {
      id: 1,
      user: { id: 41898282, type: "Bot" },
      body: failure.commentBody,
    };
    const root = await mkdtemp(join(tmpdir(), "tavernary-direct-failure-"));
    try {
      for (const kind of ["projects", "sources"] as const) {
        await mkdir(join(root, `data/registry/${kind}`), { recursive: true });
        for (const [index, record] of input.catalog[kind].entries())
          await writeFile(
            join(root, `data/registry/${kind}/${index}.json`),
            JSON.stringify(record),
          );
      }
      const eventPath = join(root, "event.json");
      await writeFile(
        eventPath,
        JSON.stringify({ inputs: { issue_number: 42 } }),
      );
      const gh = vi.fn(async (args: string[]) => {
        const path = args[1];
        if (path.endsWith("/issues/42")) return JSON.stringify(input.issues[0]);
        if (path.includes("/issues/42/comments?"))
          return JSON.stringify([comment]);
        if (path.endsWith("/actions/runs/700")) return JSON.stringify(run);
        if (path.endsWith("/git/ref/heads/main"))
          return JSON.stringify({ object: { sha: "b".repeat(40) } });
        if (path.includes("/pulls?")) return "[]";
        if (path.includes("/runs?"))
          return JSON.stringify({ workflow_runs: [] });
        if (args[0] === "workflow")
          throw new Error("Cooldown must prevent dispatch");
        if (path.includes("/issues?")) return JSON.stringify(input.issues);
        throw new Error(`Unexpected query: ${args}`);
      });
      const retryState = {
        repository: "MentallyQuill/Tavernary",
        publisherActorId: input.publisherActorId,
        nowMs,
        remote: { issues: input.issues, runs: [] },
        local: {
          projects: input.catalog.projects,
          sources: input.catalog.sources,
        },
      };
      const retries = await inspectProjectRetries({ state: retryState, gh });
      expect(retries.deferredRetries.get(42)).toBe(failure.nextEligibleAt);
      const provider = vi.fn();
      const plan = await routing.runDirectGenerationGuard({
        root,
        gh,
        env: {
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: retryState.repository,
          GITHUB_RUN_ID: "999",
          TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
          GITHUB_WORKFLOW_REF: `MentallyQuill/Tavernary/.github/workflows/generate-${producer}.yml@refs/heads/main`,
        },
      });
      if (plan.action === "generate") await provider();
      expect(plan).toEqual({ action: "wait", reason: "retry-not-due" });
      expect(provider).not.toHaveBeenCalled();
      const f = await metadataMaintenanceFixture();
      const state = {
        ...f.state,
        nowMs,
        remote: { ...f.state.remote, issues: input.issues, pulls: [] },
        operations: discoverProjectOperations({
          ...input,
          nowMs,
          deferredRetries: retries.deferredRetries,
        }),
      };
      expect(
        (
          await reconcileSubmissionHandoffs({
            repository: state.repository,
            gh,
            load: async () => state,
            finalize: vi.fn(),
          })
        ).dispatched,
      ).toBe(0);
      const afterDeadline = Date.parse(failure.nextEligibleAt!) + 1;
      expect(
        (
          await inspectProjectRetries({
            state: { ...retryState, nowMs: afterDeadline },
            gh,
          })
        ).deferredRetries.has(42),
      ).toBe(false);
      run.actor.id = 99;
      expect(
        (
          await inspectProjectRetries({ state: retryState, gh })
        ).deferredRetries.has(42),
      ).toBe(false);
      comment.user = { id: 99, type: "User" };
      expect(
        (
          await inspectProjectRetries({ state: retryState, gh })
        ).deferredRetries.has(42),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("a stale review PR does not suppress the publisher's automatic regeneration request", () => {
  const input = projectInventoryFixture({ generatedPull: {} });
  expect(
    routing.planDirectGeneration({
      ...input,
      currentRunId: 999,
      currentMainSha: "c".repeat(40),
    }),
  ).toEqual({ action: "generate" });
});

test.each(["project-submission", "project-owner-request"] as const)(
  "%s retains its existing maintainer-divergence rule for explicit regeneration",
  (producer) => {
    const input = projectInventoryFixture({
      producer,
      generatedPull: {
        head: {
          sha: "e".repeat(40),
          ref: `automation/${producer}-42`,
          repo: { full_name: "MentallyQuill/Tavernary" },
        },
      },
    });
    expect(
      routing.planDirectGeneration({
        ...input,
        currentRunId: 999,
        forceRegeneration: true,
      }),
    ).toEqual(
      producer === "project-submission"
        ? { action: "generate" }
        : { action: "wait", reason: "maintainer-review" },
    );
  },
);

test.each(["project", "owner-request", "kit", "withdrawal"] as const)(
  "queued generic %s preparation cannot reserve or dispatch new direct-owned work",
  async (kind) => {
    const fixture = await metadataMaintenanceFixture();
    const operation = operationFixture({
      identity: { ...operationFixture().identity, kind },
    });
    fixture.state.operations = [operation];
    const effects = vi.fn();
    expect(
      selectWriterAdmissionReservations([operation], {
        nowMs: fixture.state.nowMs,
        limit: 20,
      }),
    ).toEqual([]);
    expect(
      planPreparationRequest({
        state: fixture.state,
        workflow: `${kind === "project" ? "generate-project-submission" : kind === "owner-request" ? "generate-project-owner-request" : kind === "kit" ? "apply-kit-submission" : "apply-kit-withdrawal"}.yml`,
        issueNumber: 42,
      }),
    ).toEqual({ action: "wait" });
    expect(
      await runModelWriterPreparation({
        operationKey: operation.key,
        env: {
          GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_WORKFLOW_REF:
            "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
          GITHUB_RUN_ID: "800",
          GITHUB_RUN_ATTEMPT: "1",
          GITHUB_ACTOR_ID: "2625904",
        },
        load: async () => fixture.state,
        commit: effects,
        dispatch: effects,
        persistFailure: effects,
      }),
    ).toEqual({ status: "direct-owned" });
    expect(effects).not.toHaveBeenCalled();
  },
);

test.each([
  "metadata",
  "advisory",
  "enrichment",
  "refresh",
  "report-import",
] as const)(
  "ordinary scheduled passes resume %s after its saved provider deadline without owner action",
  async (kind) => {
    const nowMs = Date.parse("2026-10-17T12:00:00Z");
    let current = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind,
        subject:
          kind === "report-import"
            ? `report:${"a".repeat(64)}`
            : "source:github-42",
      },
      nextEligibleAt: new Date(nowMs + 60000).toISOString(),
      retry: {
        failure: { kind: "transient", reasonCode: "provider-unavailable" },
        transientAttempts: 2,
        immediateAttempts: 0,
      },
    });
    const retry = structuredClone(current.retry);
    const dispatch = vi.fn(async (operation) => {
      expect(planAutomationWorker(operation).action).toBe("dispatch");
      return { workerRunId: 900 };
    });
    const pass = (clock: number) =>
      reconcileAutomation({
        inventory: async () => [current],
        nowMs: clock,
        dispatch,
        persist: async (receipt) => {
          current = receipt.operation;
        },
      });
    expect((await pass(nowMs)).dispatched).toBe(0);
    expect((await pass(nowMs + 60000)).dispatched).toBe(1);
    expect((await pass(nowMs + 60001)).dispatched).toBe(0);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(current.retry).toEqual(retry);
    expect(routing.isDirectSubmissionKind(kind)).toBe(false);
  },
);

test.each(["project", "owner-request", "kit", "withdrawal"])(
  "%s remains visible but cannot be leased, observed over, or dispatched by broad reconciliation",
  async (kind) => {
    const operation = operationFixture();
    operation.identity.kind = kind as typeof operation.identity.kind;
    operation.key = operationKey(operation.identity);
    const persist = vi.fn();
    const dispatch = vi.fn();
    const result = await reconcileAutomation({
      inventory: async () => [operation],
      persist,
      dispatch,
      nowMs: Date.parse(operation.createdAt) + 1,
    });
    expect(routing.isDirectSubmissionKind(kind)).toBe(true);
    expect(result).toMatchObject({ selectedKeys: [], waiting: 1 });
    expect(persist).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(planAutomationWorker(operation)).toEqual({ action: "wait" });
  },
);

test("the native direct guard retains the exact saved retry without loading broad history", async () => {
  const input = projectInventoryFixture();
  const [operation] = discoverProjectOperations(input);
  operation.nextEligibleAt = new Date(Date.now() + 3600000).toISOString();
  operation.retry = {
    failure: { kind: "transient", reasonCode: "provider-unavailable" },
    transientAttempts: 2,
    immediateAttempts: 0,
  };
  const root = await mkdtemp(join(tmpdir(), "tavernary-direct-guard-"));
  try {
    for (const path of [
      "data/registry/projects",
      "data/registry/sources",
      "data/maintenance/automation/operations",
    ])
      await mkdir(join(root, path), { recursive: true });
    for (const [path, values] of [
      ["projects", input.catalog.projects],
      ["sources", input.catalog.sources],
    ] as const)
      for (const [index, value] of values.entries())
        await writeFile(
          join(root, `data/registry/${path}/${index}.json`),
          JSON.stringify(value),
        );
    const eventPath = join(root, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({ inputs: { issue_number: 42 } }),
    );
    await writeFile(
      join(
        root,
        `data/maintenance/automation/operations/${operation.key}.json`,
      ),
      JSON.stringify({
        schema_version: 1,
        operation,
        updatedAt: new Date().toISOString(),
        completedAt: null,
      }),
    );
    const gh = vi.fn(async (args: string[]) => {
      if (args[1].endsWith("/issues/42"))
        return JSON.stringify(input.issues[0]);
      if (args[1].endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: "b".repeat(40) } });
      if (args[1].includes("/pulls?")) return "[]";
      if (args[1].includes("/runs?"))
        return JSON.stringify({ workflow_runs: [] });
      throw new Error(`Unexpected native query: ${args}`);
    });
    expect(
      await routing.runDirectGenerationGuard({
        root,
        gh,
        env: {
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
          GITHUB_RUN_ID: "999",
          GITHUB_WORKFLOW_REF:
            "MentallyQuill/Tavernary/.github/workflows/generate-project-submission.yml@refs/heads/main",
          TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
        },
      }),
    ).toEqual({ action: "wait", reason: "retry-not-due" });
    expect(gh).toHaveBeenCalledTimes(8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["project-submission", "project-owner-request"])(
  "%s workflow stops every generation effect when existing work retains custody",
  (producer) => {
    const workflow = parse(
      readFileSync(`.github/workflows/generate-${producer}.yml`, "utf8"),
    );
    const steps = workflow.jobs.generate.steps;
    const index = steps.findIndex(
      (step: { id?: string }) => step.id === "route",
    );
    expect(index).toBeGreaterThan(0);
    expect(steps[index].run).toContain(
      "node scripts/automation/submission-routing.mjs",
    );
    for (const step of steps.slice(index + 1))
      expect(step.if, step.name).toContain(
        "steps.route.outputs.generate == 'true'",
      );
  },
);

test.each(["project-submission", "project-owner-request"] as const)(
  "%s direct generation reuses a compatible review PR without provider work",
  async (producer) => {
    const input = projectInventoryFixture({ producer, generatedPull: {} });
    const generate = vi.fn();
    const plan = routing.planDirectGeneration({ ...input, currentRunId: 999 });
    if (plan.action === "generate") await generate();
    expect(plan).toEqual({ action: "wait", reason: "existing-review-pr" });
    expect(generate).not.toHaveBeenCalled();
  },
);

test.each(["queued", "pending", "requested", "waiting", "in_progress"])(
  "a %s compatible legacy producer retains custody over a fresh direct request",
  (status) => {
    const input = projectInventoryFixture({
      generatedPull: null,
      generationRun: null,
    });
    const [operation] = discoverProjectOperations(input);
    input.runs = [
      {
        id: 700,
        name: "Project submissions: Create review PR",
        event: "workflow_dispatch",
        path: ".github/workflows/generate-project-submission.yml",
        head_branch: "main",
        head_sha: "b".repeat(40),
        display_title: `Automation prepare ${operation.key}`,
        actor: { id: input.publisherActorId, type: "Bot" },
        status,
        conclusion: null,
      },
    ];
    expect(
      routing.planDirectGeneration({ ...input, currentRunId: 999 }),
    ).toEqual({ action: "wait", reason: "active-generation" });
    expect(
      routing.planDirectGeneration({ ...input, currentRunId: 700 }),
    ).toEqual({ action: "generate" });
  },
);
