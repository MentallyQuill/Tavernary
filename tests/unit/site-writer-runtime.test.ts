import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { expect, test, vi } from "vitest";
import {
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
import {
  runSiteWriterRestoreConfirmation,
  protectedRestoreBundleIds,
  recoverSiteBundleRetention,
  recoverSiteWriterHandoffs,
} from "../../scripts/automation/site-writer-runtime.mjs";
import { runPreparedWakeCli } from "../../scripts/automation/prepared-wake.mjs";
const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_ACTOR_ID: "4624827",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
  TAVERNARY_PUBLISHER_BOT_ID: "4624827",
  TAVERNARY_IMMUTABLE_RELEASES_ENABLED: "true",
};
function fixture() {
  const encoded = encodeSiteBundle(bundleFixture()),
    bundle = decodeSiteBundle(encoded),
    m = bundle.manifest;
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  const deployment = {
    schema_version: 1 as const,
    sourceSha: m.sourceSha,
    status: "confirmed" as const,
    buildId: m.buildId,
    bundleDigest: m.buildDigest,
    confirmedAt: new Date(nowMs).toISOString(),
    workflowRunId: 42,
    confirmation: {
      sourceSha: m.sourceSha,
      catalogDigest: m.catalogDigest,
      targetDigest: m.targetDigest,
      buildDigest: m.buildDigest,
      essentialSmokePassed: true,
    },
  };
  const source = {
    schema_version: 1,
    runId: 88,
    runAttempt: 1,
    headSha: "d".repeat(40),
    ownerActorId: 2625904,
    releaseId: 77,
    sourceSha: m.sourceSha,
    buildId: m.buildId,
    buildDigest: m.buildDigest,
    archiveDigest: encoded.archiveDigest,
    catalogDigest: m.catalogDigest,
    targetDigest: m.targetDigest,
    baselineSha: "d".repeat(40),
    reason: "Restore working presentation",
    dryRun: false,
  };
  const run = {
    id: 88,
    path: ".github/workflows/restore-site.yml",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: source.headSha,
    run_attempt: 1,
    status: "completed",
    conclusion: "failure",
    display_title: "Site restore 77",
    actor: { id: 2625904 },
    repository: { id: 100, full_name: env.GITHUB_REPOSITORY },
    head_repository: { id: 100, full_name: env.GITHUB_REPOSITORY },
  };
  const zip = zipSync({
    "restore-source.json": strToU8(JSON.stringify(source)),
  });
  const artifact = {
    id: 99,
    name: "site-restore-source-88-1",
    expired: false,
    size_in_bytes: zip.length,
    digest: `sha256:${createHash("sha256").update(zip).digest("hex")}`,
    workflow_run: {
      id: 88,
      head_branch: "main",
      head_sha: source.headSha,
      repository_id: 100,
      head_repository_id: 100,
    },
  };
  const proof = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      deployment,
      archiveDigest: encoded.archiveDigest,
    }),
  );
  const asset = (id: number, name: string, bytes: Uint8Array) => ({
    id,
    name,
    state: "uploaded",
    size: bytes.length,
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    uploader: { id: 4624827 },
  });
  const release = {
    id: 77,
    tag_name: `site-bundle-${m.sourceSha}-${m.buildId}`,
    target_commitish: m.sourceSha,
    author: { id: 4624827 },
    draft: false,
    immutable: true,
    assets: [
      asset(101, "bundle-proof.json", proof),
      asset(102, "site-bundle.tsb.gz", encoded.archive),
    ],
  };
  const gh = vi.fn(async (args: string[]) => {
    if (args[0] !== "api") return "";
    const route = args.find((arg) => arg.startsWith("repos/"))!;
    if (route.endsWith("/actions/runs/88")) return JSON.stringify(run);
    if (route.includes("/artifacts?"))
      return JSON.stringify({ total_count: 1, artifacts: [artifact] });
    if (route.includes("git/ref/tags/"))
      return JSON.stringify({ object: { type: "commit", sha: m.sourceSha } });
    if (route.includes("/actions/workflows/restore-site.yml/runs")) {
      const rows = args.includes(`status=${run.status}`) ? [run] : [];
      return JSON.stringify([
        { total_count: rows.length, workflow_runs: rows },
      ]);
    }
    if (route.includes("/releases/")) return JSON.stringify(release);
    throw new Error(`Unexpected route ${route}`);
  });
  const download = vi.fn(async (args: string[]) =>
    args[1].includes("/artifacts/")
      ? zip
      : args[1].endsWith("/101")
        ? proof
        : encoded.archive,
  );
  return {
    source,
    run,
    release,
    gh,
    download,
    deployment,
    state: {
      revision: source.headSha,
      nowMs,
      deployments: [deployment],
      activeDeployment: null,
    },
    isAncestor: () => true,
  };
}
test("the production restore writer authenticates both immutable archives before observing the fixed public site", async () => {
  const data = fixture(),
    commit = vi.fn(async () => ({ sha: "e".repeat(40) })),
    probe = vi.fn(async () => ({
      status: "confirmed" as const,
      deployment: data.deployment,
    }));
  expect(
    await runSiteWriterRestoreConfirmation({
      env,
      runId: 88,
      gh: data.gh,
      download: data.download,
      bundleDownload: data.download,
      load: async () => data.state,
      isAncestor: data.isAncestor,
      probe,
      readCurrent: async () => ({
        catalogDigest: data.source.catalogDigest,
        targetDigest: data.source.targetDigest,
        ownerTombstones: [],
      }),
      commit,
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(data.download).toHaveBeenCalledTimes(3);
  expect(probe).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledTimes(1);
  data.release.immutable = false;
  commit.mockClear();
  probe.mockClear();
  await expect(
    runSiteWriterRestoreConfirmation({
      env,
      runId: 88,
      gh: data.gh,
      download: data.download,
      bundleDownload: data.download,
      load: async () => data.state,
      isAncestor: data.isAncestor,
      probe,
      readCurrent: async () => ({
        catalogDigest: data.source.catalogDigest,
        targetDigest: data.source.targetDigest,
        ownerTombstones: [],
      }),
      commit,
    }),
  ).rejects.toThrow();
  expect(probe).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
test("pending owner restores protect their numeric release IDs and foreign restore actors cannot claim protection", async () => {
  const data = fixture();
  data.run.status = "queued";
  expect(
    await protectedRestoreBundleIds({
      env,
      gh: data.gh,
      state: data.state,
      isAncestor: data.isAncestor,
    }),
  ).toEqual([77]);
  data.run.actor.id = 4624827;
  expect(
    await protectedRestoreBundleIds({
      env,
      gh: data.gh,
      state: data.state,
      isAncestor: data.isAncestor,
    }),
  ).toEqual([]);
});
test("a completed owner restore with a dropped confirmation still protects its immutable bundle", async () => {
  const data = fixture();
  const gh = async (args: string[]) => {
    const route = args.find((arg) => arg.startsWith("repos/"))!;
    if (route.includes("/restore-site.yml/runs")) {
      const completed = args.includes("status=completed");
      const page = {
        total_count: completed ? 1 : 0,
        workflow_runs: completed ? [data.run] : [],
      };
      return JSON.stringify(args.includes("--jq") ? [page] : page);
    }
    return data.gh(args);
  };
  expect(
    await protectedRestoreBundleIds({
      env,
      gh,
      state: data.state,
      isAncestor: data.isAncestor,
    }),
  ).toEqual([77]);
});
test("trusted failed restore completion wakes exact-source confirmation while a foreign completion is ignored", async () => {
  const data = fixture();
  const wakeEnv = {
    ...env,
    GITHUB_EVENT_NAME: "workflow_run",
    GITHUB_WORKFLOW_REF:
      "MentallyQuill/Tavernary/.github/workflows/automation-prepared.yml@refs/heads/main",
  };
  expect(
    await runPreparedWakeCli({
      env: wakeEnv,
      gh: data.gh,
      runId: 88,
      write: () => {},
    }),
  ).toBe(0);
  expect(data.gh.mock.calls.at(-1)?.[0]).toContain("mode=confirm-restore");
  data.gh.mockClear();
  data.run.actor.id = 4624827;
  expect(
    await runPreparedWakeCli({
      env: wakeEnv,
      gh: data.gh,
      runId: 88,
      write: () => {},
    }),
  ).toBe(0);
  expect(data.gh.mock.calls).toHaveLength(1);
});
test("retained-site recovery verifies immutable proof rather than using a receipt as release evidence", async () => {
  const data = fixture();
  const state = {
    ...data.state,
    activeDeployment: {
      schema_version: 1 as const,
      mode: "ordinary" as const,
      deployment: data.deployment,
      observedAt: data.deployment.confirmedAt,
      confirmingRunId: 42,
      rollbackBaselineSha: null,
      rollbackReason: null,
      ownerActorId: null,
    },
  };
  const input = {
    env,
    gh: data.gh,
    state,
    isAncestor: data.isAncestor,
    download: data.download,
  };
  expect(await recoverSiteBundleRetention(input)).toMatchObject({
    status: "retained",
  });
  expect(data.download).toHaveBeenCalledTimes(1);
  expect(data.download.mock.calls[0][0][1]).toContain("/assets/101");
  expect(data.gh.mock.calls.every(([args]) => args[0] === "api")).toBe(true);
  state.activeDeployment.deployment = {
    ...data.deployment,
    bundleDigest: "f".repeat(64),
  };
  await expect(recoverSiteBundleRetention(input)).rejects.toThrow();
  expect(data.gh.mock.calls.every(([args]) => args[0] === "api")).toBe(true);
});

function retentionRecoveryFixture(failures = 0) {
  const data = fixture();
  const state = {
    ...data.state,
    activeDeployment: {
      schema_version: 1 as const,
      mode: "ordinary" as const,
      deployment: data.deployment,
      observedAt: data.deployment.confirmedAt,
      confirmingRunId: 42,
      rollbackBaselineSha: null,
      rollbackReason: null,
      ownerActorId: null,
    },
  };
  const runs = Array.from({ length: failures }, (_, index) => ({
    ...data.run,
    id: 900 - index,
    path: ".github/workflows/automation-writer.yml",
    display_title: "Site bundle retain 42",
    actor: { id: 4624827 },
    created_at: new Date(state.nowMs - (index + 1) * 60000).toISOString(),
    updated_at: new Date(state.nowMs - index * 60000).toISOString(),
  }));
  const dispatches: string[][] = [];
  const gh = vi.fn(async (args: string[]) => {
    if (args[0] === "workflow") {
      dispatches.push(args);
      return "";
    }
    if (args[1].includes("/releases/tags/"))
      throw Object.assign(new Error("HTTP 404"), { status: 404 });
    if (
      args
        .find((arg) => arg.startsWith("repos/"))
        ?.includes("/actions/workflows/automation-writer.yml/runs")
    ) {
      const status = args.find((arg) => arg.startsWith("status="))?.slice(7);
      const rows = runs.filter((run) => run.status === status);
      return JSON.stringify([
        { total_count: rows.length, workflow_runs: rows },
      ]);
    }
    throw new Error(`Unexpected retention endpoint ${args[1]}`);
  });
  return {
    input: { env, gh, state, isAncestor: data.isAncestor },
    runs,
    state,
    gh,
    dispatches,
  };
}

test("retention recovery cannot dispatch after the canonical allowance is exhausted", async () => {
  const data = retentionRecoveryFixture();
  expect(
    await recoverSiteBundleRetention({ ...data.input, availableSlots: 0 }),
  ).toMatchObject({ status: "waiting", reason: "operation-limit" });
  expect(data.dispatches).toEqual([]);
  expect(data.gh).not.toHaveBeenCalled();
});

test("repeated native retention failures enter backoff and resume after their due time", async () => {
  const data = retentionRecoveryFixture(3);
  expect(await recoverSiteBundleRetention(data.input)).toMatchObject({
    status: "waiting",
    reason: "retention-backoff",
    nextEligibleAt: "2026-10-09T12:00:00.000Z",
  });
  expect(data.dispatches).toEqual([]);
  data.state.nowMs += 86400000;
  expect(await recoverSiteBundleRetention(data.input)).toMatchObject({
    status: "requested",
  });
  expect(data.dispatches).toHaveLength(1);
  expect(data.dispatches[0]).toContain("result_run_id=42");
});

test("foreign retention history cannot defer canonical recovery", async () => {
  const data = retentionRecoveryFixture(3);
  for (const run of data.runs) run.actor.id = 2625904;
  expect(await recoverSiteBundleRetention(data.input)).toMatchObject({
    status: "requested",
  });
  expect(data.dispatches).toHaveLength(1);
});

test("malformed native completion clocks cannot trigger repeated retention dispatches", async () => {
  const data = retentionRecoveryFixture(1);
  data.runs[0].updated_at = "invalid";
  await expect(recoverSiteBundleRetention(data.input)).rejects.toThrow();
  expect(data.dispatches).toEqual([]);
});

test("scheduled native recovery finds a cancelled owner restore after a 72-hour dropped wake and coalesces its queued confirmation", async () => {
  const data = fixture();
  data.state.nowMs += 72 * 3600000;
  const completedRestore = {
    ...data.run,
    conclusion: "cancelled",
    created_at: "2026-10-08T11:00:00Z",
    updated_at: "2026-10-08T11:10:00Z",
  };
  const confirmations: Record<string, unknown>[] = [];
  const dispatches: string[][] = [];
  const gh = vi.fn(async (args: string[]) => {
    if (args[0] === "workflow") {
      dispatches.push(args);
      confirmations.push({
        ...completedRestore,
        id: 1000 + dispatches.length,
        status: "queued",
        path: ".github/workflows/automation-writer.yml",
        display_title: "Site restore confirm 88",
        actor: { id: 4624827 },
      });
      return "";
    }
    const route = args.find((arg) => arg.startsWith("repos/"))!;
    if (route.includes("/actions/workflows/")) {
      const status = args.find((arg) => arg.startsWith("status="))?.slice(7);
      const rows = route.includes("/restore-site.yml/")
        ? [completedRestore]
        : confirmations;
      const matching = rows.filter((run) => run.status === status);
      return JSON.stringify([
        { total_count: matching.length, workflow_runs: matching },
      ]);
    }
    return data.gh(args);
  });
  const input = {
    env,
    gh,
    state: data.state,
    download: data.download,
    isAncestor: data.isAncestor,
  };
  expect(await recoverSiteWriterHandoffs(input)).toMatchObject({
    status: "requested",
    mode: "confirm-restore",
    runId: 88,
  });
  expect(dispatches).toHaveLength(1);
  expect(dispatches[0]).toContain("result_run_id=88");
  expect(await recoverSiteWriterHandoffs(input)).toMatchObject({
    status: "already-requested",
  });
  expect(dispatches).toHaveLength(1);
  const request = confirmations[0];
  confirmations.splice(
    0,
    1,
    ...Array.from({ length: 3 }, (_, index) => ({
      ...request,
      id: 900 - index,
      status: "completed",
      conclusion: "failure",
      created_at: new Date(
        data.state.nowMs - (index + 1) * 60000,
      ).toISOString(),
      updated_at: new Date(data.state.nowMs - index * 60000).toISOString(),
    })),
  );
  expect(await recoverSiteWriterHandoffs(input)).toMatchObject({
    restore: {
      status: "waiting",
      reason: "restore-backoff",
      nextEligibleAt: new Date(data.state.nowMs + 86400000).toISOString(),
    },
  });
  expect(dispatches).toHaveLength(1);
  data.state.nowMs += 86400000;
  expect(await recoverSiteWriterHandoffs(input)).toMatchObject({
    status: "requested",
    runId: 88,
  });
  expect(dispatches).toHaveLength(2);
  gh.mockClear();
  expect(
    await recoverSiteWriterHandoffs({ ...input, availableSlots: 0 }),
  ).toMatchObject({
    status: "waiting",
    reason: "operation-limit",
  });
  expect(gh).not.toHaveBeenCalled();
});

test("restore defaults use the guarded downloader for both source ZIP and retained assets", async () => {
  const data = fixture();
  const gh = Object.assign(data.gh, { download: data.download });
  expect(
    await runSiteWriterRestoreConfirmation({
      env,
      runId: 88,
      gh,
      load: async () => data.state,
      isAncestor: data.isAncestor,
      probe: async () => ({
        status: "confirmed" as const,
        deployment: data.deployment,
      }),
      readCurrent: async () => ({
        catalogDigest: data.source.catalogDigest,
        targetDigest: data.source.targetDigest,
        ownerTombstones: [],
      }),
      commit: async () => ({ sha: "e".repeat(40) }),
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(data.download).toHaveBeenCalledTimes(3);
});
