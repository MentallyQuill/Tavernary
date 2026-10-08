import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  readAuthoritativeDeployedSha,
  gateDeployment,
} from "../../scripts/automation/deployment-gate.mjs";
import { createActiveDeployment } from "../../scripts/automation/deployment-state.mjs";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { revisionFixture } from "../helpers/deployment-fixtures";
test("the native serialized guard uses the actual authorized restored revision and permits a subsequent verified forward deploy", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tavernary-active-gate-"));
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = () => {
    git(["add", "."]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "fixture",
    ]);
    return git(["rev-parse", "HEAD"]);
  };
  try {
    git(["init", "--initial-branch=main"]);
    await writeFile(resolve(root, "index.html"), "first");
    const first = commit();
    await writeFile(resolve(root, "index.html"), "second");
    const second = commit();
    const manifest = buildRevisionManifest(
        revisionFixture({ sourceSha: second }),
      ),
      nowMs = Date.now();
    const proof = (sourceSha: string, runId: number) => ({
      schema_version: 1 as const,
      sourceSha,
      status: "confirmed" as const,
      buildId: `run-${runId}-attempt-1`,
      bundleDigest: manifest.buildDigest,
      confirmedAt: new Date(nowMs).toISOString(),
      workflowRunId: runId,
      confirmation: {
        sourceSha,
        catalogDigest: manifest.catalogDigest,
        targetDigest: manifest.targetDigest,
        buildDigest: manifest.buildDigest,
        essentialSmokePassed: true,
      },
    });
    const directory = resolve(root, "data/maintenance/automation/deployments");
    await mkdir(directory, { recursive: true });
    await writeFile(
      resolve(directory, `${second}.json`),
      JSON.stringify(proof(second, 42)),
    );
    await writeFile(
      resolve(directory, "current.json"),
      JSON.stringify(
        createActiveDeployment({
          deployment: proof(first, 41),
          confirmingRunId: 88,
          mode: "rollback",
          ownerActorId: 2625904,
          rollbackBaselineSha: second,
          rollbackReason: "Restore working site",
          nowMs,
        }),
      ),
    );
    const current = commit();
    const deployedSha = readAuthoritativeDeployedSha({
      root,
      revision: current,
    });
    expect(deployedSha).toBe(first);
    expect(
      await gateDeployment({
        root,
        manifest,
        requestedSha: second,
        currentMainSha: current,
        deployedSha,
        expectedBuildId: manifest.buildId,
      }),
    ).toMatchObject({ action: "deploy" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
