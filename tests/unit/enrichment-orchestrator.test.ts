import { expect, test } from "vitest";
import { join } from "node:path";

import {
  createGitPublisher,
  createProductionOperations,
  executeCommand,
  requiresFullCheck,
  runEnrichmentRollout,
} from "../../scripts/catalog/enrichment-orchestrator.mjs";

type BatchResult = {
  status: string;
  progress: string;
  checkpointCommit: string | null;
};

function commandQueue(
  responses: Array<{ stdout?: string; exitCode?: number }>,
) {
  const calls: Array<{ command: string; args: string[] }> = [];
  return {
    calls,
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      const response = responses.shift();
      if (!response) throw new Error(`Unexpected command: ${command} ${args}`);
      return {
        stdout: response.stdout ?? "",
        exitCode: response.exitCode ?? 0,
      };
    },
  };
}

test("captures stderr from silent child commands", async () => {
  const result = await executeCommand(
    process.execPath,
    [
      "-e",
      "process.stderr.write('planner ledger invalid\\n'); process.exit(2)",
    ],
    { silent: true },
  );

  expect(result).toEqual({
    stdout: "",
    stderr: "planner ledger invalid\n",
    exitCode: 2,
  });
});

test("surfaces sanitized stderr when a silent planner command fails", async () => {
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand() {
      return {
        stdout: "",
        stderr:
          "Error: terminal full report accounting is invalid\nAuthorization: Bearer top-secret\n",
        exitCode: 1,
      };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  const error = await operations.plan().catch((reason) => reason);

  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain(
    "Error: terminal full report accounting is invalid",
  );
  expect(error.message).toContain("Authorization: Bearer [REDACTED]");
  expect(error.message).not.toContain("top-secret");
});

test("runs the repository gate for source or registry publications only", () => {
  expect(
    requiresFullCheck([
      "data/reports/enrichment-report.json",
      "data/reports/enrichment-canary.json",
    ]),
  ).toBe(false);
  expect(requiresFullCheck(["data/snapshots/github/a.json"])).toBe(true);
  expect(requiresFullCheck(["data/registry/projects/a.json"])).toBe(true);
});

test("publishes a registry checkpoint only after the rebased repository gate", async () => {
  const commit = "f".repeat(40);
  const fixture = commandQueue([
    { stdout: " M data/registry/projects/a.json\n" },
    {},
    {
      stdout:
        "data/registry/projects/a.json\ndata/reports/enrichment-report.json\n",
    },
    {},
    {},
    {},
    {},
    {},
    { stdout: `${commit}\n` },
  ]);
  const publish = createGitPublisher({
    runCommand: fixture.runCommand,
    npmCommand: "npm",
  });

  await expect(
    publish({
      paths: ["data/registry/projects", "data/reports/enrichment-report.json"],
      message: "checkpoint",
    }),
  ).resolves.toEqual({
    changed: true,
    publishedCommit: commit,
    registryCommit: commit,
  });

  const rebase = fixture.calls.findIndex(({ args }) => args[0] === "rebase");
  const check = fixture.calls.findIndex(
    ({ command, args }) => command === "npm" && args.join(" ") === "run check",
  );
  const push = fixture.calls.findIndex(({ args }) => args[0] === "push");
  expect(rebase).toBeLessThan(check);
  expect(check).toBeLessThan(push);
});

test("publishes report-only checkpoints without rebuilding or waiting for Pages", async () => {
  const commit = "1".repeat(40);
  const fixture = commandQueue([
    { stdout: "" },
    {},
    { stdout: "data/reports/enrichment-report.json\n" },
    {},
    {},
    {},
    {},
    { stdout: `${commit}\n` },
  ]);
  const publish = createGitPublisher({
    runCommand: fixture.runCommand,
    npmCommand: "npm",
  });

  await expect(
    publish({
      paths: ["data/reports/enrichment-report.json"],
      message: "checkpoint",
    }),
  ).resolves.toEqual({
    changed: true,
    publishedCommit: commit,
    registryCommit: null,
  });
  expect(fixture.calls).not.toContainEqual({
    command: "npm",
    args: ["run", "check"],
  });
});

test("aborts a conflicting checkpoint instead of replaying the same rebase", async () => {
  const fixture = commandQueue([
    { stdout: " M data/registry/projects/a.json\n" },
    {},
    { stdout: "data/registry/projects/a.json\n" },
    {},
    {},
    { exitCode: 1 },
    { stdout: "data/registry/projects/a.json\n" },
    {},
  ]);
  const publish = createGitPublisher({
    runCommand: fixture.runCommand,
    npmCommand: "npm",
  });

  await expect(
    publish({
      paths: ["data/registry/projects"],
      message: "checkpoint",
    }),
  ).rejects.toThrow("publication conflict");
  expect(fixture.calls.filter(({ args }) => args[0] === "rebase")).toHaveLength(
    2,
  );
  expect(
    fixture.calls.filter(
      ({ args }) => args[0] === "rebase" && args[1] === "origin/main",
    ),
  ).toHaveLength(1);
});

function recordingOperations(options: {
  plans: string[];
  canary?: BatchResult[];
  full?: BatchResult[];
  canaryCheckpointCommit?: string;
  fullCheckpointCommit?: string;
}) {
  const calls: string[] = [];
  const plans = [...options.plans];
  const canary = [...(options.canary ?? [])];
  const full = [...(options.full ?? [])];
  return {
    calls,
    operations: {
      async syncMain() {
        calls.push("sync");
      },
      async preflight() {
        calls.push("preflight");
      },
      async plan() {
        const action = plans.shift();
        if (!action) throw new Error("missing test plan");
        calls.push(`plan:${action}`);
        return { action };
      },
      async startCanary() {
        calls.push("start-canary");
      },
      async publishCanaryBatch() {
        calls.push("canary-batch");
        const result = canary.shift();
        if (!result) throw new Error("missing canary batch");
        return result;
      },
      async canaryCheckpointCommit() {
        calls.push("canary-checkpoint-commit");
        return options.canaryCheckpointCommit ?? "c".repeat(40);
      },
      async fullCheckpointCommit() {
        calls.push("full-checkpoint-commit");
        return options.fullCheckpointCommit ?? "d".repeat(40);
      },
      async waitForDeployment(commit: string) {
        calls.push(`wait:${commit}`);
        return 12345;
      },
      async approveCanary(commit: string, runId: number) {
        calls.push(`approve:${commit}:${runId}`);
      },
      async recordFullDeployment(commit: string, runId: number) {
        calls.push(`record-full-deployment:${commit}:${runId}`);
      },
      async authorizeFull() {
        calls.push("authorize-full");
      },
      async prepareFull() {
        calls.push("prepare-full");
      },
      async startFull() {
        calls.push("start-full");
        const result = full.shift();
        if (!result) throw new Error("missing full batch");
        return result;
      },
      async resumeFull() {
        calls.push("resume-full");
        const result = full.shift();
        if (!result) throw new Error("missing full batch");
        return result;
      },
    },
  };
}

test("runs a fresh canary and full rollout with one exact deployment wait per phase", async () => {
  const canaryCommit = "a".repeat(40);
  const fullCommit = "b".repeat(40);
  const fixture = recordingOperations({
    plans: ["start-canary", "start-full"],
    canary: [
      {
        status: "running",
        progress: "primary:7",
        checkpointCommit: canaryCommit,
      },
      {
        status: "awaiting-deployment",
        progress: "complete:7",
        checkpointCommit: null,
      },
    ],
    full: [
      {
        status: "running",
        progress: "primary:20",
        checkpointCommit: fullCommit,
      },
      {
        status: "complete-with-errors",
        progress: "complete:21",
        checkpointCommit: null,
      },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete-with-errors",
  });
  expect(fixture.calls).toEqual([
    "sync",
    "preflight",
    "plan:start-canary",
    "start-canary",
    "canary-batch",
    "canary-batch",
    `wait:${canaryCommit}`,
    `approve:${canaryCommit}:12345`,
    "plan:start-full",
    "authorize-full",
    "prepare-full",
    "start-full",
    "resume-full",
    `wait:${fullCommit}`,
    `record-full-deployment:${fullCommit}:12345`,
  ]);
});

test("continues a durable canary without selecting or preparing another pool", async () => {
  const registryCommit = "d".repeat(40);
  const fixture = recordingOperations({
    plans: ["continue-canary", "complete"],
    canary: [
      {
        status: "awaiting-deployment",
        progress: "complete:7",
        checkpointCommit: registryCommit,
      },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete",
  });
  expect(fixture.calls).not.toContain("start-canary");
  expect(fixture.calls).toContain(`wait:${registryCommit}`);
});

test("recovers deployment from the checkpoint stored in the canary report", async () => {
  const checkpoint = "8".repeat(40);
  const fixture = recordingOperations({
    plans: ["deploy-canary", "complete"],
    canaryCheckpointCommit: checkpoint,
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete",
  });
  expect(fixture.calls).toContain("canary-checkpoint-commit");
  expect(fixture.calls).toContain(`wait:${checkpoint}`);
});

test("resumes full work without repeating canary work", async () => {
  const registryCommit = "c".repeat(40);
  const fixture = recordingOperations({
    plans: ["resume-full"],
    fullCheckpointCommit: registryCommit,
    full: [
      { status: "running", progress: "retry:1", checkpointCommit: null },
      { status: "complete", progress: "complete:2", checkpointCommit: null },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete",
  });
  expect(fixture.calls).toEqual([
    "sync",
    "preflight",
    "plan:resume-full",
    "resume-full",
    "resume-full",
    "full-checkpoint-commit",
    `wait:${registryCommit}`,
    `record-full-deployment:${registryCommit}:12345`,
  ]);
});

test("recovers a terminal full deployment without repeating paid work", async () => {
  const checkpoint = "7".repeat(40);
  const fixture = recordingOperations({
    plans: ["deploy-full", "complete"],
    fullCheckpointCommit: checkpoint,
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete",
  });
  expect(fixture.calls).toEqual([
    "sync",
    "preflight",
    "plan:deploy-full",
    "full-checkpoint-commit",
    `wait:${checkpoint}`,
    `record-full-deployment:${checkpoint}:12345`,
    "plan:complete",
  ]);
});

test("runs an explicit failed-full restart through the normal full boundary", async () => {
  const checkpoint = "3".repeat(40);
  const fixture = recordingOperations({
    plans: ["restart-full"],
    full: [
      {
        status: "complete",
        progress: "complete:1",
        checkpointCommit: checkpoint,
      },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).resolves.toEqual({
    status: "complete",
  });
  expect(fixture.calls).toContain("authorize-full");
  expect(fixture.calls).toContain("prepare-full");
  expect(fixture.calls).toContain("start-full");
  expect(fixture.calls).toContain(`record-full-deployment:${checkpoint}:12345`);
});

test("fails closed on a terminal systemic batch failure", async () => {
  const fixture = recordingOperations({
    plans: ["resume-full"],
    full: [
      { status: "failed", progress: "complete:1", checkpointCommit: null },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).rejects.toThrow(
    "systemic failure",
  );
});

test("fails closed when a completed full report has no exact checkpoint", async () => {
  const fixture = recordingOperations({
    plans: ["resume-full"],
    fullCheckpointCommit: "",
    full: [
      { status: "complete", progress: "complete:1", checkpointCommit: null },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).rejects.toThrow(
    "no valid checkpoint commit",
  );
  expect(fixture.calls).not.toContainEqual(expect.stringMatching(/^wait:/u));
});

test("rejects a running rollout that does not advance", async () => {
  const fixture = recordingOperations({
    plans: ["resume-full"],
    full: [
      { status: "running", progress: "primary:20", checkpointCommit: null },
      { status: "running", progress: "primary:20", checkpointCommit: null },
    ],
  });

  await expect(runEnrichmentRollout(fixture.operations)).rejects.toThrow(
    "without advancing",
  );
});

test("prepares the representative canary pool with one multi-project refresh", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      if (args.includes("catalog:select-canary")) {
        return { stdout: `${ids.join("\n")}\n`, exitCode: 0 };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await operations.startCanary();

  const refreshes = calls.filter(({ args }) =>
    args.includes("catalog:refresh"),
  );
  expect(refreshes).toHaveLength(1);
  expect(refreshes[0].args).toEqual([
    "run",
    "catalog:refresh",
    "--",
    "--mode",
    "project",
    ...ids.flatMap((id) => ["--project-id", id]),
    "--deployment-requested",
  ]);
});

test("reuses an existing exact deployment without dispatching a duplicate", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const commit = "e".repeat(40);
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      if (args[0] === "run" && args[1] === "list") {
        return {
          stdout: JSON.stringify([
            {
              databaseId: 98765,
              displayTitle: `Deploy Pages - ${commit}`,
              status: "completed",
              conclusion: "success",
            },
          ]),
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
    async sleep() {},
  });

  await expect(operations.waitForDeployment(commit)).resolves.toBe(98765);
  expect(calls[0]).toEqual({
    command: "gh",
    args: [
      "run",
      "list",
      "--workflow",
      "deploy-pages.yml",
      "--branch",
      "main",
      "--event",
      "workflow_dispatch",
      "--limit",
      "50",
      "--json",
      "databaseId,displayTitle,status,conclusion",
    ],
  });
  expect(calls).not.toContainEqual(
    expect.objectContaining({
      args: ["workflow", "run", "deploy-pages.yml", "--ref", "main"],
    }),
  );
  expect(calls.at(-1)).toEqual({
    command: "gh",
    args: ["run", "watch", "98765", "--exit-status"],
  });
});

test("dispatches Pages once when the exact deployment does not exist", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const commit = "9".repeat(40);
  let lookups = 0;
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      if (args[0] === "run" && args[1] === "list") {
        lookups += 1;
        return {
          stdout:
            lookups === 1
              ? "[]"
              : JSON.stringify([
                  {
                    databaseId: 24680,
                    displayTitle: `Deploy Pages - ${commit}`,
                    status: "in_progress",
                    conclusion: null,
                  },
                ]),
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
    async sleep() {},
  });

  await expect(operations.waitForDeployment(commit)).resolves.toBe(24680);
  expect(
    calls.filter(
      ({ args }) =>
        args.join(" ") ===
        `workflow run deploy-pages.yml --ref main -f source_sha=${commit}`,
    ),
  ).toHaveLength(1);
});

test("passes the dispatch batch size and concurrency into enrichment batches", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const ids = ["a", "b", "c", "d", "e"];
  const operations = createProductionOperations({
    npmCommand: "npm",
    batchSize: 7,
    concurrency: 2,
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      if (args.includes("catalog:select-canary")) {
        return { stdout: `${ids.join("\n")}\n`, exitCode: 0 };
      }
      return { stdout: "", exitCode: 0 };
    },
    async readJson() {
      return {
        status: "awaiting-deployment",
        phase: "complete",
        primary_cursor: 5,
        retry_cursor: 0,
        retry_queue: [],
      };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await operations.startCanary();
  await operations.publishCanaryBatch();

  const enrichment = calls.find(({ args }) => args.includes("catalog:enrich"));
  expect(enrichment?.args).toEqual(
    expect.arrayContaining(["--batch-size", "7", "--concurrency", "2"]),
  );
});

test("propagates one enrichment selection mode through planner, canary, and execution commands", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    options?: { env?: NodeJS.ProcessEnv };
  }> = [];
  const ids = ["a", "b", "c", "d", "e"];
  const operations = createProductionOperations({
    npmCommand: "npm",
    selectionMode: "all-automatic",
    async runCommand(command: string, args: string[], options) {
      calls.push({ command, args, options });
      if (args.includes("catalog:enrichment-plan")) {
        return { stdout: '{"action":"complete"}', exitCode: 0 };
      }
      if (args.includes("catalog:select-canary")) {
        return { stdout: `${ids.join("\n")}\n`, exitCode: 0 };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await operations.plan();
  await operations.startCanary();
  await operations.authorizeFull();

  expect(
    calls.find(({ args }) => args.includes("catalog:enrichment-plan"))?.options
      ?.env,
  ).toMatchObject({ ENRICHMENT_SELECTION_MODE: "all-automatic" });
  expect(
    calls.find(({ args }) => args.includes("catalog:select-canary"))?.options
      ?.env,
  ).toMatchObject({ ENRICHMENT_SELECTION_MODE: "all-automatic" });
  expect(
    calls.find(({ args }) => args.includes("authorize-full"))?.args,
  ).toEqual(expect.arrayContaining(["--selection-mode", "all-automatic"]));
});

test("persists the exact canary checkpoint before returning batch progress", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const publications: Array<{
    changed: boolean;
    publishedCommit: string | null;
    registryCommit: string | null;
  }> = [
    {
      changed: true,
      publishedCommit: "4".repeat(40),
      registryCommit: "4".repeat(40),
    },
    {
      changed: true,
      publishedCommit: "5".repeat(40),
      registryCommit: null,
    },
  ];
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      return { stdout: "", exitCode: 0 };
    },
    async readJson() {
      return {
        manifest: ["a", "b", "c", "d", "e"],
        status: "running",
        phase: "primary",
        primary_cursor: 5,
        retry_cursor: 0,
        retry_queue: [],
      };
    },
    async publishChanges() {
      const publication = publications.shift();
      if (!publication) throw new Error("unexpected publication");
      return publication;
    },
  });

  await expect(operations.publishCanaryBatch()).resolves.toMatchObject({
    status: "running",
    checkpointCommit: "4".repeat(40),
  });
  expect(
    calls.some(
      ({ args }) =>
        args.includes("record-canary-publication") &&
        args.includes("4".repeat(40)),
    ),
  ).toBe(true);
  expect(publications).toHaveLength(0);
});

test("keeps systemic failure checkpoints out of the registry publication", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const publicationPaths: string[][] = [];
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      return { stdout: "", exitCode: 0 };
    },
    async readJson() {
      return {
        manifest: ["a", "b", "c", "d", "e"],
        status: "failed",
        phase: "complete",
        primary_cursor: 5,
        retry_cursor: 0,
        retry_queue: [],
      };
    },
    async publishChanges({ paths }: { paths: string[] }) {
      publicationPaths.push(paths);
      return {
        changed: false,
        publishedCommit: null,
        registryCommit: null,
      };
    },
  });

  await expect(operations.publishCanaryBatch()).resolves.toMatchObject({
    status: "failed",
  });
  expect(calls).toContainEqual({
    command: "git",
    args: ["restore", "--", "data/registry/projects"],
  });
  expect(publicationPaths[0]).toEqual(["data/reports/enrichment-canary.json"]);
});

test("recovers a checkpoint publication interrupted before SHA recording", async () => {
  const interrupted = "6".repeat(40);
  const recorded = "5".repeat(40);
  const baseOptions = {
    npmCommand: "npm",
    async readJson() {
      return {
        publication: {
          checkpoint_commit_sha: recorded,
          recorded_at: "2026-07-25T00:00:00.000Z",
        },
      };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  };
  const interruptedOperations = createProductionOperations({
    ...baseOptions,
    async runCommand(_command: string, args: string[]) {
      if (args[0] === "log") {
        return {
          stdout: `${interrupted}\tchore(catalog): checkpoint project enrichment\n`,
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
  });
  await expect(interruptedOperations.fullCheckpointCommit()).resolves.toBe(
    interrupted,
  );

  const recordedOperations = createProductionOperations({
    ...baseOptions,
    async runCommand(_command: string, args: string[]) {
      if (args[0] === "log") {
        return {
          stdout: `${"9".repeat(40)}\tchore(catalog): record full checkpoint\n`,
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
  });
  await expect(recordedOperations.fullCheckpointCommit()).resolves.toBe(
    recorded,
  );
});

test("migrates a legacy terminal report to current main without rollback", async () => {
  const currentMain = "a".repeat(40);
  const legacyOperations = createProductionOperations({
    npmCommand: "npm",
    async readJson() {
      return { status: "complete" };
    },
    async runCommand(_command: string, args: string[]) {
      if (args[0] === "log") {
        return {
          stdout: `${"0".repeat(40)}\tlegacy enrichment publication\n`,
          exitCode: 0,
        };
      }
      if (args[0] === "rev-parse") {
        return { stdout: `${currentMain}\n`, exitCode: 0 };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await expect(legacyOperations.fullCheckpointCommit()).resolves.toBe(
    currentMain,
  );
});

test("rejects unrecognized checkpoint history for a current-format report", async () => {
  const operations = createProductionOperations({
    npmCommand: "npm",
    async readJson() {
      return { publication: null };
    },
    async runCommand(_command: string, args: string[]) {
      if (args[0] === "log") {
        return {
          stdout: `${"0".repeat(40)}\tunrecognized report edit\n`,
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await expect(operations.fullCheckpointCommit()).resolves.toBeNull();
});

test("writes only the sanitized preflight result into the workflow summary input", async () => {
  const writes: Array<{ path: string; content: string }> = [];
  const runnerTemp = join("temporary", "runner");
  const operations = createProductionOperations({
    npmCommand: "npm",
    runnerTemp,
    async runCommand() {
      return {
        stdout: '> command noise\n{"mode":"preflight","status":"passed"}\n',
        exitCode: 0,
      };
    },
    async writeText(path: string, content: string) {
      writes.push({ path, content });
    },
    async publishChanges() {
      return { changed: false, publishedCommit: null, registryCommit: null };
    },
  });

  await operations.preflight();

  expect(writes).toEqual([
    {
      path: join(runnerTemp, "enrichment-preflight.log"),
      content: '{"mode":"preflight","status":"passed"}\n',
    },
  ]);
});

test("publishes one full preparation checkpoint despite refresh timestamp churn", async () => {
  const publications = [
    {
      changed: true,
      publishedCommit: "a".repeat(40),
      registryCommit: "a".repeat(40),
    },
  ];
  const calls: Array<{ command: string; args: string[] }> = [];
  const operations = createProductionOperations({
    npmCommand: "npm",
    async runCommand(command: string, args: string[]) {
      calls.push({ command, args });
      if (
        command === "git" &&
        args[0] === "status" &&
        args.includes("data/snapshots/github")
      ) {
        return {
          stdout: " M data/snapshots/github/project.json\n",
          exitCode: 0,
        };
      }
      return { stdout: "", exitCode: 0 };
    },
    async publishChanges() {
      const publication = publications.shift();
      if (!publication) throw new Error("unexpected publication");
      return publication;
    },
  });

  await operations.prepareFull();

  expect(
    calls.filter(({ args }) => args.includes("catalog:refresh")),
  ).toHaveLength(1);
  expect(publications).toHaveLength(0);
});
