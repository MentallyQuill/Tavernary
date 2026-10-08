import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
  readLatestPublishableRevision,
  readAuthoritativeDeployedSha,
  gateDeployment,
} from "../../scripts/automation/deployment-gate.mjs";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { revisionFixture } from "../helpers/deployment-fixtures";

test("native Git inventory ignores bookkeeping, catches public changes and rejects stale queued builds", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tavernary-deploy-gate-"));
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
    await mkdir(resolve(root, "data/maintenance/automation/model-budgets"), {
      recursive: true,
    });
    await writeFile(
      resolve(root, "data/maintenance/automation/model-budgets/global.json"),
      "{}",
    );
    const bookkeeping = commit();
    expect(readLatestPublishableRevision({ root, revision: bookkeeping })).toBe(
      first,
    );
    const manifest = buildRevisionManifest(
      revisionFixture({ sourceSha: first }),
    );
    expect(
      await gateDeployment({
        root,
        manifest,
        requestedSha: first,
        currentMainSha: bookkeeping,
        deployedSha: null,
      }),
    ).toMatchObject({ action: "deploy" });
    const proof = {
      sourceSha: first,
      status: "confirmed",
      bundleDigest: manifest.buildDigest,
      confirmation: {
        sourceSha: first,
        buildDigest: manifest.buildDigest,
        essentialSmokePassed: true,
      },
    };
    await mkdir(resolve(root, "data/maintenance/automation/deployments"), {
      recursive: true,
    });
    const proofPath = resolve(
      root,
      `data/maintenance/automation/deployments/${first}.json`,
    );
    await writeFile(proofPath, JSON.stringify(proof));
    const incomplete = commit();
    expect(readAuthoritativeDeployedSha({ root, revision: incomplete })).toBe(
      null,
    );
    await writeFile(
      proofPath,
      JSON.stringify({
        ...proof,
        confirmation: {
          ...proof.confirmation,
          catalogDigest: manifest.catalogDigest,
          targetDigest: manifest.targetDigest,
        },
      }),
    );
    const confirmed = commit();
    expect(
      await gateDeployment({
        root,
        manifest,
        requestedSha: first,
        currentMainSha: confirmed,
        deployedSha: readAuthoritativeDeployedSha({
          root,
          revision: confirmed,
        }),
      }),
    ).toMatchObject({ action: "coalesced" });
    await writeFile(resolve(root, "index.html"), "newer");
    const newer = commit();
    expect(
      await gateDeployment({
        root,
        manifest,
        requestedSha: first,
        currentMainSha: newer,
        deployedSha: null,
      }),
    ).toEqual({ action: "superseded", targetSha: newer });
    expect(
      await gateDeployment({
        root,
        manifest,
        requestedSha: first,
        currentMainSha: newer,
        deployedSha: newer,
      }),
    ).toMatchObject({ action: "superseded" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
