import { expect, test, vi } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { productionInventoryRoot } from "../helpers/production-inventory-root.mjs";
import * as inventory from "../../scripts/automation/inventory.mjs";
import type { ProjectInventoryRun } from "../../scripts/automation/project-operations.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  isPreparedDiagnosticObsolete,
  persistPreparedFailure,
} from "../../scripts/automation/prepared-failure.mjs";
import { loadPreparedDiagnosticRuns } from "../../scripts/automation/github-inventory.mjs";
import type { PreparedDiagnosticRunsInput } from "../../scripts/automation/github-inventory.mjs";
import {
  preparedReplayFixture,
  diagnosticReplayFixture,
} from "../helpers/prepared-replay-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { preparedResultFixture } from "../helpers/automation-fixtures";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import { createMetadataCache } from "../../scripts/automation/metadata-refresh.mjs";
import { runAutomationWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";
import * as githubInventory from "../../scripts/automation/github-inventory.mjs";
import * as health from "../../scripts/automation/health.mjs";

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
  const gh = async (args: string[]) => {
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
  const input = {
    root: canonical.root,
    gh,
    repository,
    publisherActorId,
    nowMs,
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
  };
}

function nativeFixture() {
  const fixture = preparedReplayFixture();
  const calls: string[][] = [];
  const gh = async (args: string[]) => {
    calls.push(args);
    const route = args.find((value) => value.startsWith("repos/"))!;
    if (route.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: fixture.state.local.revision } });
    if (/\/actions\/runs\/[1-9]\d*$/u.test(route))
      return JSON.stringify(fixture.run);
    return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
  };
  return {
    ...fixture,
    calls,
    input: {
      gh,
      repository: fixture.state.repository,
      publisherActorId: fixture.state.publisherActorId,
      nowMs: fixture.state.nowMs,
      operation: fixture.receipt.operation,
      evidenceRun: fixture.run,
    },
  };
}

test("twenty obsolete writer diagnostics page complete large workflow histories without per-row global census", async () => {
  const fixture = await diagnosticFixture("advisory");
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const assess = vi.spyOn(health, "assessInventoryHealth").mockReturnValue([]);
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockResolvedValue(undefined);
  try {
    const initial = await inventory.loadAutomationInventory(fixture.input);
    const selected = initial.operations
      .filter((operation) => operation.identity.kind === "advisory")
      .slice(0, 20);
    const fixtures = selected.map((operation, index) =>
      diagnosticReplayFixture(
        {
          ...fixture.receipt,
          operation: {
            ...operation,
            workerRunId: null,
            nextEligibleAt: new Date(nowMs - 60_000).toISOString(),
            retry: {
              failure: {
                kind: "transient",
                reasonCode: "provider-rate-limited",
              },
              transientAttempts: 1,
              immediateAttempts: 0,
            },
          },
        },
        10_000 + index * 2,
        new Date(nowMs - 2 * 3_600_000).toISOString(),
      ),
    );
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
            nowMs -
              7 * 86_400_000 +
              1000 +
              Math.floor((index * (7 * 86_400_000 - 2000)) / count),
          ).toISOString(),
        });
    }
    const gh = Object.assign(
      async (args: string[]) => {
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
          const artifactId = Number(
            /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
          );
          return fixtures
            .find((value) => value.artifact.id === artifactId)!
            .reader.download();
        },
      },
    );
    const input = {
      ...fixture.input,
      gh,
      publisherActorId: fixtures[0].state.publisherActorId,
    };
    const keys = new Set(selected.map((operation) => operation.key));
    const load = vi.fn(async () => {
      const state = await inventory.loadAutomationInventory(input);
      state.operations = state.operations.filter((operation) =>
        keys.has(operation.key),
      );
      delete state.local.runtimePolicy;
      return state;
    });
    const scopedCalls: string[][] = [];
    const loadDiagnostic = vi.fn(
      async (
        context: Pick<
          PreparedDiagnosticRunsInput,
          "operation" | "knownRuns" | "evidenceRun"
        >,
      ) => {
        const start = fixture.calls.length;
        const state = await inventory.loadPreparedDiagnosticInventory({
          ...input,
          ...context,
        });
        scopedCalls.push(...fixture.calls.slice(start));
        return state;
      },
    );
    const result = await runAutomationWriterReconciliation({
      load,
      loadDiagnostic,
      gh,
      env: {
        GITHUB_REPOSITORY: repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
      },
    });
    expect(result.prepared).toMatchObject({
      failures: 0,
      published: 0,
      consumedKeys: [],
      reloadRequired: true,
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(loadDiagnostic).toHaveBeenCalledTimes(20);
    expect(persist).not.toHaveBeenCalled();
    const routes = scopedCalls.map((args) =>
      args.find((value) => value.startsWith("repos/"))!,
    );
    expect(
      routes.filter((route) =>
        /\/(?:issues|pulls|actions\/runs)$/u.test(route),
      ),
    ).toEqual([]);
    expect(
      routes.filter((route) =>
        route.includes("/actions/workflows/automation-writer.yml/"),
      ),
    ).toHaveLength(520);
    expect(
      routes.filter((route) =>
        route.includes("/actions/workflows/automation-worker.yml/"),
      ),
    ).toHaveLength(280);
    expect(
      routes.filter((route) =>
        route.includes("/actions/workflows/review-catalog-policy.yml/"),
      ),
    ).toHaveLength(120);
    expect(
      routes.filter((route) => route.endsWith("/git/ref/heads/main")),
    ).toHaveLength(60);
    expect(
      routes.filter((route) => /\/actions\/runs\/[1-9]\d*$/u.test(route)),
    ).toHaveLength(20);
    expect(
      scopedCalls.some(
        (args) =>
          args.includes("page=10") &&
          args.some((value) => value.includes("automation-writer.yml")),
      ),
    ).toBe(true);
  } finally {
    revalidate.mockRestore();
    assess.mockRestore();
    persist.mockRestore();
    await fixture.cleanup();
  }
}, 120_000);

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
    const fixture = nativeFixture();
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
      updated_at: new Date(nowMs - 30_000).toISOString(),
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
        return fixture.input.gh(args);
      };
      expect(
        await inventory.loadPreparedDiagnosticInventory({
          ...fixture.input,
          gh,
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
    const fixture = nativeFixture();
    const gh = async (args: string[]) => {
      if (!args.some((value) => value.includes("/actions/workflows/")))
        return fixture.input.gh(args);
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
    await expect(
      loadPreparedDiagnosticRuns({ ...fixture.input, gh }),
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
  const fixture = nativeFixture();
  const created_at = "2026-10-08T15:00:00.000Z";
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
  const gh = async (args: string[]) => {
    const id = Number(
      /\/actions\/runs\/([1-9]\d*)$/u.exec(
        args.find((value) => value.startsWith("repos/"))!,
      )?.[1],
    );
    return latest.some((run) => run.id === id)
      ? JSON.stringify(latest.find((run) => run.id === id))
      : fixture.input.gh(args);
  };
  const native = await loadPreparedDiagnosticRuns({
    ...fixture.input,
    gh,
    knownRuns,
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

test("scoped native histories preserve every active producer, worker and writer handoff decision", async () => {
  const fixture = await diagnosticFixture();
  try {
    const baseline = await inventory.loadAutomationInventory(fixture.input);
    const modes = [
      "producer",
      "worker",
      "prepare",
      "publish",
      "reconcile-project",
      "confirm",
      "finalize",
      "advisory-notice",
    ];
    for (const mode of modes) {
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
    }
  } finally {
    await fixture.cleanup();
  }
}, 30_000);

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
        args.some((value) => /\/(?:issues|pulls|actions\/runs)$/u.test(value)),
      ),
    ).toEqual([]);
    expect(
      fixture.calls.filter((args) =>
        args.some((value) => value.includes("/actions/workflows/")),
      ),
    ).toHaveLength(18);
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
      args.some((value) => value.includes("/actions/workflows/"))
        ? JSON.stringify([{ total_count: 0, workflow_runs: [fixture.run] }])
        : fixture.input.gh(args);
    await expect(
      loadPreparedDiagnosticRuns({
        ...fixture.input,
        gh,
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
      args.some((value) => value.includes("/actions/workflows/"))
        ? JSON.stringify([
            {
              total_count: 101,
              workflow_runs: Array.from(
                { length: args.includes("page=1") ? 100 : 1 },
                () => fixture.run,
              ),
            },
          ])
        : fixture.input.gh(args);
    await expect(
      loadPreparedDiagnosticRuns({
        ...fixture.input,
        gh,
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
