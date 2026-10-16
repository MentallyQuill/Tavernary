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
import { createActiveDeployment } from "../../scripts/automation/deployment-state.mjs";

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

function completedWakeFixture() {
  const data = recoveryFixture("missing");
  const original = deploymentArtifactFixture();
  const candidate = deploymentArtifactFixture();
  original.run.head_sha = original.manifest.sourceSha;
  original.artifact.workflow_run.head_sha = original.manifest.sourceSha;
  candidate.run.id = 43;
  candidate.manifest.sourceSha = "d".repeat(40);
  candidate.manifest.buildId = "run-43-attempt-1";
  candidate.run.display_title = `Site: Deploy ${candidate.manifest.sourceSha}`;
  candidate.artifact.id = 89;
  candidate.artifact.name = `site-revision-${candidate.manifest.sourceSha}`;
  candidate.artifact.workflow_run.id = 43;
  data.state.local.revision = "f".repeat(40);
  data.state.remote.mainHeadSha = "f".repeat(40);
  Object.assign(data.publicSite.publicManifest, candidate.manifest);
  const events: string[] = [];
  const assetReads: string[] = [];
  const fetchCatalog = data.publicSite.input.fetchCatalog;
  const fetchTargets = data.publicSite.input.fetchTargets;
  const fetchAsset = data.publicSite.input.fetchAsset;
  data.publicSite.input.fetchCatalog = async () => {
    assetReads.push("catalog/tavernary-catalog-v8.json");
    return fetchCatalog();
  };
  data.publicSite.input.fetchTargets = async () => {
    assetReads.push("security/tavernkeeper-targets.json");
    return fetchTargets();
  };
  data.publicSite.input.fetchAsset = async (path) => {
    assetReads.push(path);
    return fetchAsset(path);
  };
  const artifacts = new Map([
    [42, [original.artifact]],
    [43, [candidate.artifact]],
  ]);
  const probeAttempts: Array<number | undefined> = [];
  let hintReads = 0;
  const input = {
    ...data.input,
    operationKey: undefined,
    runId: 42,
    gh: async (args: string[]) => {
      const endpoint = args.find((value) => value.startsWith("repos/"))!;
      const runId = Number(endpoint.match(/\/actions\/runs\/(\d+)/u)?.[1]);
      const selected = runId === 42 ? original : candidate;
      if (![42, 43].includes(runId))
        throw new Error(`Unexpected fixture endpoint ${endpoint}`);
      if (!endpoint.includes("/artifacts")) {
        events.push(`native-${runId}`);
        return JSON.stringify(selected.run);
      }
      const archive = zipSync({
        "revision.json": strToU8(JSON.stringify(selected.manifest)),
      });
      return JSON.stringify([
        {
          total_count: artifacts.get(runId)!.length,
          artifacts: artifacts.get(runId)!.map((artifact) => ({
            ...artifact,
            size_in_bytes: archive.length,
            digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
          })),
        },
      ]);
    },
    download: async (args: string[]) =>
      zipSync({
        "revision.json": strToU8(
          JSON.stringify(
            args.some((arg) => arg.includes("/89/"))
              ? candidate.manifest
              : original.manifest,
          ),
        ),
      }),
    fetchImpl: vi.fn(async () => {
      events.push("hint");
      hintReads++;
      return new Response(JSON.stringify(data.publicSite.publicManifest));
    }) as unknown as typeof fetch,
    isAncestor: (ancestor: string, descendant: string) => {
      const chain = ["a", "b", "c", "d", "e", "f"].map((part) =>
        part.repeat(40),
      );
      return (
        chain.includes(ancestor) &&
        chain.includes(descendant) &&
        chain.indexOf(ancestor) <= chain.indexOf(descendant)
      );
    },
    probe: async ({
      expected,
      maxAttempts,
    }: Parameters<NonNullable<typeof data.input.probe>>[0]) => {
      events.push(`probe-${expected.buildId}`);
      probeAttempts.push(maxAttempts);
      return confirmDeployment({ ...data.publicSite.input, expected });
    },
  };
  return {
    ...data,
    input,
    original,
    candidate,
    events,
    assetReads,
    artifacts,
    probeAttempts,
    hintReads: () => hintReads,
  };
}

test("a completed run confirms one currently public strict descendant through its own native artifact and fresh proof", async () => {
  const data = completedWakeFixture();
  expect(await runDeploymentWriterConfirmation(data.input)).toMatchObject({
    status: "confirmed",
    sourceSha: "d".repeat(40),
  });
  expect(data.events).toEqual([
    "native-42",
    "probe-run-42-attempt-1",
    "hint",
    "native-43",
    "probe-run-43-attempt-1",
  ]);
  expect(data.hintReads()).toBe(1);
  expect(data.probeAttempts).toEqual([undefined, 1]);
  expect(data.commits).toHaveLength(1);
  expect(JSON.parse(data.commits[0].files[0].content)).toMatchObject({
    sourceSha: "d".repeat(40),
    workflowRunId: 43,
    buildId: "run-43-attempt-1",
  });
  expect(JSON.parse(data.commits[0].files[1].content)).toMatchObject({
    confirmingRunId: 43,
    deployment: { sourceSha: "d".repeat(40), workflowRunId: 43 },
  });
  expect(data.publicSite.smokeCalls()).toBe(1);
  expect(data.assetReads).toEqual([
    "catalog/tavernary-catalog-v8.json",
    "security/tavernkeeper-targets.json",
    "catalog/tavernary-catalog.json",
    "index.html",
    "menu/index.html",
  ]);
  const [hintUrl, hintOptions] = vi.mocked(data.input.fetchImpl).mock.calls[0];
  expect(new URL(String(hintUrl)).origin).toBe("https://tavernary.org");
  expect(new URL(String(hintUrl)).pathname).toBe("/revision.json");
  expect(hintOptions).toMatchObject({
    redirect: "error",
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
});

test.each(["exact", "keyed", "automatic", "same-source-build"])(
  "%s confirmation retains its existing selection without public discovery",
  async (variant) => {
    const data = completedWakeFixture();
    if (variant !== "automatic")
      Object.assign(data.publicSite.publicManifest, data.original.manifest);
    if (variant === "same-source-build")
      data.publicSite.publicManifest.buildId = "run-43-attempt-1";
    const action = runDeploymentWriterConfirmation({
      ...data.input,
      operationKey: ["keyed", "automatic"].includes(variant)
        ? data.state.operations[0].key
        : undefined,
      runId: variant === "automatic" ? 0 : 42,
    });
    if (variant === "same-source-build")
      await expect(action).rejects.toMatchObject({
        code: "provider-unavailable",
      });
    else await expect(action).resolves.toMatchObject({ status: "confirmed" });
    expect(data.hintReads()).toBe(0);
    expect(data.events.filter((event) => event.startsWith("native-"))).toEqual([
      variant === "automatic" ? "native-43" : "native-42",
    ]);
  },
);

test.each(["missing", "expired", "provenance", "archive"])(
  "rejected original %s custody never authorizes public discovery",
  async (variant) => {
    const data = completedWakeFixture();
    if (variant === "missing") data.artifacts.set(42, []);
    if (variant === "expired") data.original.artifact.expired = true;
    if (variant === "provenance") data.original.run.actor.id++;
    if (variant === "archive")
      data.input.download = async () => new Uint8Array([1, 2, 3]);
    await expect(runDeploymentWriterConfirmation(data.input)).rejects.toThrow();
    expect(data.hintReads()).toBe(0);
    expect(data.events).toEqual(["native-42"]);
    expect(data.commits).toEqual([]);
  },
);

test.each(["unavailable", "incident", "invalid-public"])(
  "original %s public result does not enter descendant discovery",
  async (variant) => {
    const data = completedWakeFixture();
    if (variant === "unavailable")
      data.publicSite.input.fetchManifest = async () => {
        throw new Error("Offline fixture");
      };
    else {
      Object.assign(data.publicSite.publicManifest, data.original.manifest);
      if (variant === "incident")
        data.publicSite.content["index.html"] = Buffer.from("corrupt");
      else
        (
          data.publicSite.publicManifest as { schemaVersion: number }
        ).schemaVersion = 2;
    }
    await expect(
      runDeploymentWriterConfirmation(data.input),
    ).rejects.toMatchObject({
      code:
        variant === "unavailable"
          ? "provider-unavailable"
          : "validation-failed",
    });
    expect(data.hintReads()).toBe(0);
    expect(data.commits).toEqual([]);
  },
);

test.each([
  "utf8",
  "json",
  "schema",
  "oversized-header",
  "oversized-stream",
  "redirect",
  "unavailable",
  "zero-run",
  "zero-attempt",
  "overflow-run",
  "overflow-attempt",
  "leading-zero",
  "signed",
  "decimal",
  "suffix",
])(
  "invalid %s public hint cannot authorize a native candidate",
  async (variant) => {
    const data = completedWakeFixture();
    const hint = structuredClone(data.candidate.manifest);
    const identities: Record<string, string> = {
      "zero-run": "run-0-attempt-1",
      "zero-attempt": "run-43-attempt-0",
      "overflow-run": "run-9007199254740992-attempt-1",
      "overflow-attempt": "run-43-attempt-9007199254740992",
      "leading-zero": "run-043-attempt-1",
      signed: "run--43-attempt-1",
      decimal: "run-43.5-attempt-1",
      suffix: "run-43-attempt-1-extra",
    };
    if (identities[variant]) hint.buildId = identities[variant];
    if (variant === "schema")
      (hint as { catalogSchemaVersion: number }).catalogSchemaVersion = 9;
    let requests = 0;
    data.input.fetchImpl = async () => {
      requests++;
      if (["redirect", "unavailable"].includes(variant))
        throw new TypeError("Public fetch rejected");
      if (variant === "utf8") return new Response(new Uint8Array([0xc3, 0x28]));
      if (variant === "json") return new Response("{");
      if (variant === "oversized-header")
        return new Response("{}", {
          headers: { "content-length": "16777217" },
        });
      if (variant === "oversized-stream")
        return new Response(new Uint8Array(16777217));
      return new Response(JSON.stringify(hint));
    };
    await expect(
      runDeploymentWriterConfirmation(data.input),
    ).rejects.toMatchObject({
      code: ["redirect", "unavailable"].includes(variant)
        ? "provider-unavailable"
        : "validation-failed",
    });
    expect(requests).toBe(1);
    expect(data.events.filter((event) => event.startsWith("native-"))).toEqual([
      "native-42",
    ]);
    expect(data.commits).toEqual([]);
  },
);

test.each([
  "workflow",
  "repository",
  "head-repository",
  "actor",
  "branch",
  "status",
  "title",
  "attempt",
  "missing",
  "expired",
  "ambiguous",
  "archive",
  "crc",
  "schema",
  "identity",
])(
  "hinted native %s failure cannot borrow public authority",
  async (variant) => {
    const data = completedWakeFixture();
    if (variant === "workflow") data.candidate.run.path = "foreign.yml";
    if (variant === "repository")
      data.candidate.run.repository.full_name = "foreign/repo";
    if (variant === "head-repository") data.candidate.run.head_repository.id++;
    if (variant === "actor") data.candidate.run.actor.id++;
    if (variant === "branch") data.candidate.run.head_branch = "foreign";
    if (variant === "status") data.candidate.run.status = "in_progress";
    if (variant === "title")
      data.candidate.run.display_title = "Site: Deploy foreign";
    if (variant === "attempt") data.candidate.run.run_attempt = 2;
    if (variant === "missing") data.artifacts.set(43, []);
    if (variant === "expired") data.candidate.artifact.expired = true;
    if (variant === "ambiguous")
      data.artifacts.set(43, [
        data.candidate.artifact,
        { ...data.candidate.artifact, id: 90 },
      ]);
    if (variant === "archive") {
      const download = data.input.download;
      data.input.download = async (args) =>
        args.some((arg) => arg.includes("/89/"))
          ? new Uint8Array([1, 2, 3])
          : download(args);
    }
    if (variant === "crc") {
      const archive = zipSync(
        {
          "revision.json": strToU8(JSON.stringify(data.candidate.manifest)),
        },
        { level: 0 },
      );
      archive[43] ^= 1;
      const gh = data.input.gh;
      data.input.gh = async (args) => {
        const result = await gh(args);
        if (!args.some((arg) => arg.endsWith("/43/artifacts"))) return result;
        const pages = JSON.parse(result);
        pages[0].artifacts[0].size_in_bytes = archive.length;
        pages[0].artifacts[0].digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
        return JSON.stringify(pages);
      };
      const download = data.input.download;
      data.input.download = async (args) =>
        args.some((arg) => arg.includes("/89/")) ? archive : download(args);
    }
    if (["schema", "identity"].includes(variant)) {
      const hint = JSON.stringify(data.candidate.manifest);
      data.input.fetchImpl = async () => {
        if (variant === "schema")
          (data.candidate.manifest as { schemaVersion: number }).schemaVersion =
            2;
        else data.candidate.manifest.catalogDigest = "f".repeat(64);
        return new Response(hint);
      };
    }
    await expect(runDeploymentWriterConfirmation(data.input)).rejects.toThrow();
    expect(data.events.filter((event) => event.startsWith("native-"))).toEqual([
      "native-42",
      "native-43",
    ]);
    expect(data.probeAttempts).toEqual([undefined]);
    expect(data.commits).toEqual([]);
  },
);

test("the public source hint cannot select an unrelated native revision artifact", async () => {
  const data = completedWakeFixture();
  data.input.fetchImpl = async () =>
    new Response(
      JSON.stringify({
        ...data.candidate.manifest,
        sourceSha: "e".repeat(40),
      }),
    );
  await expect(
    runDeploymentWriterConfirmation(data.input),
  ).rejects.toMatchObject({
    code: "provider-unavailable",
  });
  expect(data.probeAttempts).toEqual([undefined]);
  expect(data.commits).toEqual([]);
});

test.each(["same", "older", "divergent", "unknown"])(
  "a %s source cannot satisfy strict original-to-candidate ancestry",
  async (variant) => {
    const data = completedWakeFixture();
    if (variant !== "unknown") {
      const source = variant === "same" ? "c" : variant === "older" ? "b" : "9";
      data.candidate.manifest.sourceSha = source.repeat(40);
      data.candidate.run.display_title = `Site: Deploy ${source.repeat(40)}`;
      data.candidate.artifact.name = `site-revision-${source.repeat(40)}`;
    }
    const hint = JSON.stringify(data.candidate.manifest);
    data.input.fetchImpl = async () => new Response(hint);
    const ancestry = data.input.isAncestor;
    await expect(
      runDeploymentWriterConfirmation({
        ...data.input,
        isAncestor: (ancestor, descendant) => {
          if (
            variant === "unknown" &&
            ancestor === "c".repeat(40) &&
            descendant === "d".repeat(40)
          )
            return null;
          if (variant === "divergent" && ancestor === "9".repeat(40))
            return true;
          return ancestry(ancestor, descendant);
        },
      }),
    ).rejects.toMatchObject({ code: "input-superseded" });
    expect(data.probeAttempts).toEqual([undefined]);
    expect(data.commits).toEqual([]);
  },
);

async function completedWakeActive(
  mode: "ordinary" | "rollback",
  source = "b",
) {
  const site = confirmationFixture();
  const expected = {
    ...site.input.expected,
    sourceSha: source.repeat(40),
    buildId: "run-41-attempt-1",
  };
  const proof = await confirmDeployment({
    ...site.input,
    expected,
    fetchManifest: async () => expected,
  });
  if (proof.status !== "confirmed") throw new Error("Invalid active fixture");
  return createActiveDeployment({
    deployment: { ...proof.deployment, workflowRunId: 41 },
    confirmingRunId: mode === "ordinary" ? 41 : 99,
    nowMs: site.input.nowMs,
    mode,
    ...(mode === "rollback"
      ? {
          rollbackBaselineSha: "f".repeat(40),
          rollbackReason: "Owner rollback fixture",
          ownerActorId: 2625904,
        }
      : {}),
  });
}

test.each([1, 2, 3, 4])(
  "authoritative rollback at load %s prevents descendant commit",
  async (rollbackLoad) => {
    const data = completedWakeFixture();
    const rollback = await completedWakeActive("rollback");
    let loads = 0;
    await expect(
      runDeploymentWriterConfirmation({
        ...data.input,
        load: async () => ({
          ...data.state,
          local: {
            ...data.state.local,
            activeDeployment: ++loads >= rollbackLoad ? rollback : null,
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "input-superseded" });
    expect(data.hintReads()).toBe(rollbackLoad <= 2 ? 0 : 1);
    expect(data.probeAttempts).toEqual(
      rollbackLoad === 4 ? [undefined, 1] : [undefined],
    );
    expect(data.commits).toEqual([]);
  },
);

test("malformed fresh active proof cannot be hidden by descendant discovery", async () => {
  const data = completedWakeFixture();
  let loads = 0;
  await expect(
    runDeploymentWriterConfirmation({
      ...data.input,
      load: async () => ({
        ...data.state,
        local: {
          ...data.state.local,
          activeDeployment: ++loads === 1 ? null : { mode: "ordinary" },
        },
      }),
    }),
  ).rejects.toMatchObject({ code: "validation-failed" });
  expect(data.hintReads()).toBe(0);
  expect(data.commits).toEqual([]);
});

test.each(["active-advance", "main-initial", "main-fresh", "cas"])(
  "fresh %s race cannot rebase or retry descendant proof",
  async (variant) => {
    const data = completedWakeFixture();
    const advanced = await completedWakeActive("ordinary", "e");
    let loads = 0;
    let commits = 0;
    await expect(
      runDeploymentWriterConfirmation({
        ...data.input,
        load: async () => {
          loads++;
          return {
            ...data.state,
            local: {
              ...data.state.local,
              revision:
                (variant === "main-initial" && loads === 3) ||
                (variant === "main-fresh" && loads === 4)
                  ? "b".repeat(40)
                  : data.state.local.revision,
              activeDeployment:
                variant === "active-advance" && loads === 4 ? advanced : null,
            },
          };
        },
        commit: async () => {
          commits++;
          throw Object.assign(new Error("Main advanced"), {
            code: "input-superseded",
          });
        },
      }),
    ).rejects.toMatchObject({ code: "input-superseded" });
    expect(commits).toBe(variant === "cas" ? 1 : 0);
    expect(data.hintReads()).toBe(1);
    expect(data.events.filter((event) => event.startsWith("native-"))).toEqual([
      "native-42",
      "native-43",
    ]);
    expect(data.commits).toEqual([]);
  },
);

test.each([
  "catalog",
  "targets",
  "asset",
  "browser",
  "changed-after-hint",
  "changed-after-browser",
])(
  "fresh descendant %s failure rejects retained proof and stops without chasing",
  async (variant) => {
    const data = completedWakeFixture();
    data.artifacts.get(43)!.push({
      ...data.candidate.artifact,
      id: 90,
      name: `site-confirmation-${data.candidate.manifest.sourceSha}`,
    });
    if (["catalog", "targets", "asset"].includes(variant)) {
      const path =
        variant === "catalog"
          ? "catalog/tavernary-catalog-v8.json"
          : variant === "targets"
            ? "security/tavernkeeper-targets.json"
            : "index.html";
      data.publicSite.content[path] = Buffer.from("corrupt");
    }
    if (variant === "browser")
      data.publicSite.input.browserSmoke = async () => false;
    if (variant === "changed-after-hint") {
      const hint = JSON.stringify(data.candidate.manifest);
      data.input.fetchImpl = async () => {
        Object.assign(data.publicSite.publicManifest, {
          sourceSha: "e".repeat(40),
          buildId: "run-44-attempt-1",
        });
        return new Response(hint);
      };
    }
    if (variant === "changed-after-browser") {
      const smoke = data.publicSite.input.browserSmoke;
      data.publicSite.input.browserSmoke = async (input) => {
        const result = await smoke(input);
        data.publicSite.publicManifest.buildId = "run-44-attempt-1";
        return result;
      };
    }
    const downloaded: string[] = [];
    const download = data.input.download;
    data.input.download = async (args) => {
      downloaded.push(args[1]);
      return download(args);
    };
    await expect(
      runDeploymentWriterConfirmation(data.input),
    ).rejects.toMatchObject({
      code: variant.startsWith("changed-")
        ? "provider-unavailable"
        : "validation-failed",
    });
    expect(data.probeAttempts).toEqual([undefined, 1]);
    expect(data.events.filter((event) => event.startsWith("native-"))).toEqual([
      "native-42",
      "native-43",
    ]);
    expect(downloaded).toEqual([
      "repos/MentallyQuill/Tavernary/actions/artifacts/88/zip",
      "repos/MentallyQuill/Tavernary/actions/artifacts/89/zip",
    ]);
    expect(data.commits).toEqual([]);
  },
);

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
