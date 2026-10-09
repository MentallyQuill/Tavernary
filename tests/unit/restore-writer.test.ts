import { expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import {
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
import { confirmRestoredDeployment } from "../../scripts/automation/restore-writer.mjs";
import type { RestoreSource } from "../../scripts/automation/restore-source.mjs";
import type { ActiveDeployment } from "../../scripts/automation/deployment-state.mjs";
function fixture() {
  const exported = bundleFixture();
  // Listed identities come from the actual retained catalog, not confirmation metadata.
  const project = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "public/catalog/tavernary-catalog-v8.json"),
      "utf8",
    ),
  ).projects[0];
  exported.catalog.projects = [{ ...project, id: "project-one" }] as never[];
  const catalogEntry = exported.entries.find(
    (entry) => entry.path === "catalog/tavernary-catalog-v8.json",
  )!;
  catalogEntry.content = new TextEncoder().encode(
    JSON.stringify(exported.catalog),
  );
  // The fixture manifest must cover the changed catalog bytes.
  exported.manifest = buildRevisionManifest({
    sourceSha: exported.manifest.sourceSha,
    buildId: exported.manifest.buildId,
    catalog: exported.catalog,
    targets: exported.targets,
    files: exported.entries
      .filter((entry) => entry.path !== "revision.json")
      .map((entry) => ({
        path: entry.path,
        bytes: entry.content.length,
        sha256: createHash("sha256").update(entry.content).digest("hex"),
      })),
  });
  exported.entries.find((entry) => entry.path === "revision.json")!.content =
    new TextEncoder().encode(JSON.stringify(exported.manifest));
  const bundle = decodeSiteBundle(encodeSiteBundle(exported));
  const manifest = bundle.manifest;
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  const source: RestoreSource = {
    schema_version: 1,
    runId: 88,
    runAttempt: 1,
    headSha: "d".repeat(40),
    ownerActorId: 2625904,
    releaseId: 77,
    sourceSha: manifest.sourceSha,
    buildId: manifest.buildId,
    buildDigest: manifest.buildDigest,
    archiveDigest: bundle.archiveDigest,
    catalogDigest: manifest.catalogDigest,
    targetDigest: manifest.targetDigest,
    baselineSha: "d".repeat(40),
    reason: "Restore working presentation",
    dryRun: false,
  };
  const deployment = {
    schema_version: 1 as const,
    sourceSha: manifest.sourceSha,
    status: "confirmed" as const,
    buildId: manifest.buildId,
    bundleDigest: manifest.buildDigest,
    confirmedAt: new Date(nowMs).toISOString(),
    workflowRunId: 42,
    confirmation: {
      sourceSha: manifest.sourceSha,
      catalogDigest: manifest.catalogDigest,
      targetDigest: manifest.targetDigest,
      buildDigest: manifest.buildDigest,
      essentialSmokePassed: true,
    },
  };
  const state = {
    revision: "d".repeat(40),
    nowMs,
    activeDeployment: null as ActiveDeployment | null,
  };
  const input = {
    runId: 88,
    load: vi.fn(async () => structuredClone(state)),
    loadSource: vi.fn(async () => source),
    loadBundle: vi.fn(async () => ({ releaseId: 77, bundle, deployment })),
    readCurrent: vi.fn(async () => ({
      catalogDigest: manifest.catalogDigest,
      targetDigest: manifest.targetDigest,
      ownerTombstones: [] as string[],
    })),
    probe: vi.fn(async () => ({ status: "confirmed" as const, deployment })),
    commit: vi.fn(
      async (_value: {
        expectedMainSha: string;
        files: Array<{ content: string }>;
      }) => ({ sha: "e".repeat(40) }),
    ),
    isAncestor: () => true,
  };
  return { input, state, source, deployment };
}
test("only exact public proof of an authenticated owner restore writes the active rollback override", async () => {
  const data = fixture();
  expect(await confirmRestoredDeployment(data.input)).toMatchObject({
    status: "confirmed",
    sourceSha: data.source.sourceSha,
  });
  expect(data.input.commit).toHaveBeenCalledTimes(1);
  const commit = data.input.commit.mock.calls[0][0];
  expect(commit.expectedMainSha).toBe(data.state.revision);
  expect(commit.files).toHaveLength(1);
  expect(JSON.parse(commit.files[0].content)).toMatchObject({
    mode: "rollback",
    rollbackBaselineSha: data.source.baselineSha,
    confirmingRunId: 88,
    ownerActorId: 2625904,
    deployment: { workflowRunId: 42, sourceSha: data.source.sourceSha },
  });
  data.state.activeDeployment = JSON.parse(commit.files[0].content);
  data.input.commit.mockClear();
  data.input.probe.mockClear();
  expect(await confirmRestoredDeployment(data.input)).toMatchObject({
    status: "already-confirmed",
  });
  expect(data.input.commit).not.toHaveBeenCalled();
  expect(data.input.probe).not.toHaveBeenCalled();
});
test.each(["catalog", "targets", "owner-removal", "changed-during-probe"])(
  "delayed owner restore confirmation rejects %s before recording an override",
  async (variant) => {
    const data = fixture();
    const current = await data.input.readCurrent();
    const changed = {
      ...current,
      ...(variant === "catalog" || variant === "changed-during-probe"
        ? { catalogDigest: "f".repeat(64) }
        : variant === "targets"
          ? { targetDigest: "f".repeat(64) }
          : { ownerTombstones: ["project-one"] }),
    };
    if (variant === "changed-during-probe")
      data.input.readCurrent
        .mockResolvedValueOnce(current)
        .mockResolvedValueOnce(changed);
    else data.input.readCurrent.mockResolvedValue(changed);
    await expect(confirmRestoredDeployment(data.input)).rejects.toMatchObject({
      code: "input-superseded",
    });
    expect(data.input.commit).not.toHaveBeenCalled();
    if (variant !== "changed-during-probe")
      expect(data.input.probe).not.toHaveBeenCalled();
  },
);
test.each(["source", "bundle", "probe", "changed-main"])(
  "a substituted restore %s cannot write an active rollback",
  async (variant) => {
    const data = fixture();
    if (variant === "source") data.source.ownerActorId = 4624827 as 2625904;
    if (variant === "bundle")
      data.input.loadBundle.mockResolvedValue({
        releaseId: 76,
        bundle: (await data.input.loadBundle()).bundle,
        deployment: data.deployment,
      });
    if (variant === "probe")
      data.input.probe.mockResolvedValue({
        status: "confirmed",
        deployment: { ...data.deployment, bundleDigest: "f".repeat(64) },
      });
    if (variant === "changed-main")
      data.input.load
        .mockResolvedValueOnce(data.state)
        .mockResolvedValueOnce({ ...data.state, revision: "f".repeat(40) });
    await expect(confirmRestoredDeployment(data.input)).rejects.toThrow();
    expect(data.input.commit).not.toHaveBeenCalled();
  },
);
