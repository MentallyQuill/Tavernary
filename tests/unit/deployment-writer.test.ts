import { expect, test, vi } from "vitest";
import { confirmCanonicalDeployment } from "../../scripts/automation/deployment-writer.mjs";
import type { CanonicalConfirmationInput } from "../../scripts/automation/deployment-writer.mjs";
import { confirmationFixture } from "../helpers/confirmation-fixtures";
import { confirmDeployment } from "../../scripts/automation/confirm-deployment.mjs";
import type { PreparedFile } from "../../scripts/automation/prepared-result.mjs";
import { createHash } from "node:crypto";
import { runDeploymentWriterConfirmation } from "../../scripts/automation/writer-runtime.mjs";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { zipSync, strToU8 } from "fflate";
import { operationFixture } from "../helpers/automation-fixtures";
import { revisionFixture } from "../helpers/deployment-fixtures";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";

function recoveryFixture(
  latest: "missing" | "expired" | "different-build" | "invalid",
  extraMissing = 0,
) {
  const artifact = deploymentArtifactFixture();
  const publicSite = confirmationFixture();
  const latestManifest = buildRevisionManifest(
    revisionFixture({ buildId: "run-43-attempt-1" }),
  );
  const archive = zipSync({
    "revision.json": strToU8(JSON.stringify(latestManifest)),
  });
  const runs = [
    {
      ...artifact.run,
      id: 43,
      conclusion: latest === "missing" ? "failure" : "success",
      created_at: "2026-10-08T11:00:00Z",
    },
    { ...artifact.run, created_at: "2026-10-08T10:00:00Z" },
  ];
  for (let index = 0; index < extraMissing; index++)
    runs.unshift({
      ...runs[0],
      id: 44 + index,
      created_at: new Date(
        Date.parse("2026-10-08T11:01:00Z") + index * 60000,
      ).toISOString(),
    });
  const operation = operationFixture({
    identity: {
      kind: "refresh",
      subject: "source:github-42",
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
    stage: "published",
    expectedSha: artifact.manifest.sourceSha,
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: artifact.input.repository,
    publisherActorId: artifact.input.publisherActorId,
    nowMs: publicSite.input.nowMs,
    operations: [operation],
    receipts: [],
    remote: {
      issues: [],
      pulls: [],
      runs,
      mainHeadSha: artifact.input.currentMainSha,
    },
    local: { revision: artifact.input.currentMainSha, deployments: [] },
  };
  const reads: number[] = [];
  const commits: Array<{ files: PreparedFile[] }> = [];
  const input: Parameters<typeof runDeploymentWriterConfirmation>[0] = {
    operationKey: operation.key,
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: artifact.input.repository,
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
      TAVERNARY_PUBLISHER_BOT_ID: String(artifact.input.publisherActorId),
    },
    gh: async (args) => {
      const endpoint = args.find((value) => value.startsWith("repos/"))!;
      const runId = Number(endpoint.match(/\/actions\/runs\/(\d+)/u)?.[1]);
      const run = runs.find((value) => value.id === runId);
      if (!run) throw new Error(`Unexpected fixture endpoint ${endpoint}`);
      if (!endpoint.includes("/artifacts")) {
        reads.push(runId);
        return JSON.stringify(run);
      }
      if (runId === 42) return artifact.input.gh(args);
      return JSON.stringify([
        {
          total_count: runId !== 43 || latest === "missing" ? 0 : 1,
          artifacts:
            runId !== 43 || latest === "missing"
              ? []
              : [
                  {
                    ...artifact.artifact,
                    id: 89,
                    expired: latest === "expired",
                    size_in_bytes: archive.length,
                    digest:
                      latest === "invalid"
                        ? `sha256:${"f".repeat(64)}`
                        : `sha256:${createHash("sha256").update(archive).digest("hex")}`,
                    workflow_run: {
                      ...artifact.artifact.workflow_run,
                      id: 43,
                    },
                  },
                ],
        },
      ]);
    },
    download: (args) =>
      args.some((arg) => arg.includes("/89/"))
        ? Promise.resolve(archive)
        : artifact.input.download(args),
    load: async () => state,
    isAncestor: (ancestor, descendant) =>
      ["c".repeat(40), "d".repeat(40)].includes(ancestor) &&
      descendant === "d".repeat(40),
    probe: ({ expected }) =>
      confirmDeployment({ ...publicSite.input, expected }),
    commit: async (value) => {
      commits.push(value);
      return { sha: "e".repeat(40) };
    },
  };
  return { input, state, reads, commits, publicSite };
}

test.each(["missing", "expired", "different-build"] as const)(
  "automatic confirmation recovers the actually served older build after newer %s metadata",
  async (latest) => {
    const data = recoveryFixture(latest);
    expect(await runDeploymentWriterConfirmation(data.input)).toMatchObject({
      status: "confirmed",
      sourceSha: "c".repeat(40),
    });
    expect(data.reads).toEqual([43, 42]);
    expect(data.commits).toHaveLength(1);
    expect(JSON.parse(data.commits[0].files[0].content)).toMatchObject({
      workflowRunId: 42,
      buildId: "run-42-attempt-1",
    });
    expect(data.publicSite.smokeCalls()).toBe(1);
  },
);

test("artifact integrity failure cannot be hidden by an older valid deployment", async () => {
  const data = recoveryFixture("invalid");
  await expect(runDeploymentWriterConfirmation(data.input)).rejects.toThrow(
    "integrity",
  );
  expect(data.reads).toEqual([43]);
  expect(data.commits).toEqual([]);
});

test("fallback never confirms an older build that the public site is not serving", async () => {
  const data = recoveryFixture("missing");
  data.publicSite.publicManifest.sourceSha = "b".repeat(40);
  await expect(
    runDeploymentWriterConfirmation(data.input),
  ).rejects.toMatchObject({
    code: "provider-unavailable",
  });
  expect(data.reads).toEqual([43, 42]);
  expect(data.commits).toEqual([]);
});

test("automatic fallback stops at eight native candidates instead of scanning deployment history", async () => {
  const data = recoveryFixture("missing", 7);
  await expect(
    runDeploymentWriterConfirmation(data.input),
  ).rejects.toMatchObject({
    code: "provider-unavailable",
  });
  expect(data.reads).toEqual([50, 49, 48, 47, 46, 45, 44, 43]);
  expect(data.commits).toEqual([]);
});

test("an explicitly selected run retains exact-run custody without automatic fallback", async () => {
  const data = recoveryFixture("missing");
  await expect(
    runDeploymentWriterConfirmation({ ...data.input, runId: 43 }),
  ).rejects.toMatchObject({ code: "provider-unavailable" });
  expect(data.reads).toEqual([43]);
  expect(data.commits).toEqual([]);
});

test("a completed deployment run confirms without unrelated issue or pull inventory", async () => {
  const data = recoveryFixture("missing");
  const loadSite = vi.fn(async () => ({
    revision: data.state.remote.mainHeadSha,
    nowMs: data.state.nowMs,
    deployments: [],
    activeDeployment: null,
  }));
  expect(
    await runDeploymentWriterConfirmation({
      ...data.input,
      operationKey: undefined,
      runId: 42,
      load: undefined,
      loadSite,
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(loadSite).toHaveBeenCalledTimes(2);
  expect(data.reads).toEqual([42]);
  expect(data.commits).toHaveLength(1);
  expect(data.publicSite.smokeCalls()).toBe(1);
});

test("operation-bound confirmation retains authoritative operation discovery", async () => {
  const data = recoveryFixture("missing");
  const loadSite = vi.fn(async () => {
    throw new Error("Operation custody requires the complete inventory.");
  });
  expect(
    await runDeploymentWriterConfirmation({
      ...data.input,
      runId: 42,
      loadSite,
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(loadSite).not.toHaveBeenCalled();
});

test("the production writer authenticates the actual Pages archive and commits only verified public proof", async () => {
  const artifact = deploymentArtifactFixture(),
    publicSite = confirmationFixture();
  const proof = await confirmDeployment(publicSite.input);
  const writes: unknown[] = [];
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: artifact.input.repository,
    publisherActorId: artifact.input.publisherActorId,
    nowMs: publicSite.input.nowMs,
    operations: [],
    receipts: [],
    remote: {
      issues: [],
      pulls: [],
      runs: [],
      mainHeadSha: artifact.input.currentMainSha,
    },
    local: { revision: artifact.input.currentMainSha, deployments: [] },
  };
  expect(
    await runDeploymentWriterConfirmation({
      runId: artifact.input.runId,
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: artifact.input.repository,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
        TAVERNARY_PUBLISHER_BOT_ID: String(artifact.input.publisherActorId),
      },
      gh: artifact.input.gh,
      download: artifact.input.download,
      load: async () => state,
      isAncestor: () => true,
      probe: async () => proof,
      commit: async (value) => {
        writes.push(value);
        return { sha: "e".repeat(40) };
      },
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(writes).toHaveLength(1);
});

async function fixture(
  options: { unconfirmed?: boolean; alreadyConfirmed?: boolean } = {},
) {
  const confirmation = confirmationFixture({
    wrongRevision: options.unconfirmed,
  });
  const proof = await confirmDeployment(confirmation.input);
  const commits: Array<{ expectedMainSha: string; files: PreparedFile[] }> = [];
  let loads = 0;
  const state = {
    revision: "d".repeat(40),
    nowMs: confirmation.input.nowMs,
    deployments:
      options.alreadyConfirmed && proof.status === "confirmed"
        ? [{ ...proof.deployment, workflowRunId: 42 }]
        : [],
  };
  const input: CanonicalConfirmationInput = {
    runId: 42,
    load: async () => ({
      ...state,
      revision: ++loads === 1 ? "b".repeat(40) : state.revision,
    }),
    loadManifest: async () => ({
      runId: 42,
      manifest: confirmation.input.expected,
    }),
    probe: async () => proof,
    isAncestor: () => true,
    commit: async (value) => {
      commits.push(value);
      return { sha: "e".repeat(40) };
    },
  };
  return { input, commits, proof };
}
test("only exact public and browser proof writes a durable confirmation through the current canonical lane", async () => {
  const data = await fixture();
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "confirmed",
    revision: "e".repeat(40),
  });
  expect(data.commits).toHaveLength(1);
  expect(data.commits[0].expectedMainSha).toBe("d".repeat(40));
  const file = data.commits[0].files[0];
  expect(file.path).toBe(
    `data/maintenance/automation/deployments/${"c".repeat(40)}.json`,
  );
  expect(file.sha256).toBe(
    createHash("sha256").update(file.content).digest("hex"),
  );
  expect(JSON.parse(file.content)).toMatchObject({
    workflowRunId: 42,
    confirmation: { essentialSmokePassed: true },
  });
  const active = data.commits[0].files.find(
    (file) =>
      file.path === "data/maintenance/automation/deployments/current.json",
  );
  expect(active).toBeDefined();
  expect(JSON.parse(active!.content)).toMatchObject({
    mode: "ordinary",
    deployment: { sourceSha: "c".repeat(40), workflowRunId: 42 },
    rollbackBaselineSha: null,
  });
});
test("unconfirmed output produces no canonical mutation", async () => {
  const data = await fixture({ unconfirmed: true });
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "waiting",
  });
  expect(data.commits).toEqual([]);
});
test("replayed confirmation keeps the existing proof without heartbeat writes", async () => {
  const data = await fixture({ alreadyConfirmed: true });
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "already-confirmed",
  });
  expect(data.commits).toEqual([]);
});

test.each([true, false])(
  "a same-revision rebuild requires its own exact public proof (served=%s)",
  async (served) => {
    const old = await fixture({ alreadyConfirmed: true });
    const publicSite = confirmationFixture();
    const manifest = buildRevisionManifest(
      revisionFixture({ buildId: "run-43-attempt-1" }),
    );
    if (served) Object.assign(publicSite.publicManifest, manifest);
    const input: CanonicalConfirmationInput = {
      ...old.input,
      runId: 43,
      loadManifest: async () => ({ runId: 43, manifest }),
      probe: ({ expected }) =>
        confirmDeployment({ ...publicSite.input, expected }),
    };
    const result = await confirmCanonicalDeployment(input);
    if (served) {
      expect(result).toMatchObject({ status: "confirmed" });
      expect(old.commits).toHaveLength(1);
      expect(JSON.parse(old.commits[0].files[0].content)).toMatchObject({
        buildId: "run-43-attempt-1",
        workflowRunId: 43,
      });
      expect(publicSite.smokeCalls()).toBe(1);
    } else {
      expect(result).toMatchObject({
        status: "waiting",
        reason: "different-build",
      });
      expect(old.commits).toEqual([]);
    }
  },
);
test("unknown ancestry and substituted probe output cannot write confirmation", async () => {
  const data = await fixture();
  data.input.isAncestor = () => null;
  await expect(confirmCanonicalDeployment(data.input)).rejects.toThrow();
  expect(data.commits).toEqual([]);
  const forged = await fixture();
  forged.input.probe = async () => ({
    status: "confirmed",
    deployment: {
      ...(forged.proof.status === "confirmed"
        ? forged.proof.deployment
        : (() => {
            throw new Error("Invalid fixture");
          })()),
      bundleDigest: "f".repeat(64),
    },
  });
  await expect(confirmCanonicalDeployment(forged.input)).rejects.toThrow();
  expect(forged.commits).toEqual([]);
});
