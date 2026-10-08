import { expect, test } from "vitest";
import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  retainGithubSiteBundle,
  loadRetainedGithubSiteBundle,
} from "../../scripts/automation/site-bundle-github.mjs";
import type { GhRunner } from "../../scripts/submissions/kit-submission-reconciliation.mjs";
import {
  decodeSiteBundle,
  encodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
function input() {
  const encoded = encodeSiteBundle(bundleFixture()),
    bundle = decodeSiteBundle(encoded),
    manifest = bundle.manifest;
  const proof = {
    schema_version: 1,
    sourceSha: manifest.sourceSha,
    status: "confirmed",
    buildId: manifest.buildId,
    bundleDigest: manifest.buildDigest,
    confirmedAt: "2026-10-08T12:00:00.000Z",
    workflowRunId: 42,
    confirmation: {
      sourceSha: manifest.sourceSha,
      catalogDigest: manifest.catalogDigest,
      targetDigest: manifest.targetDigest,
      buildDigest: manifest.buildDigest,
      essentialSmokePassed: true,
    },
  };
  const assets: Array<{
    id: number;
    name: string;
    state: string;
    size: number;
    digest: string;
    uploader: { id: number };
    download_count?: number;
  }> = [];
  const contents = new Map<number, Uint8Array>(),
    writes: string[][] = [];
  const olderReleases: Array<Record<string, unknown>> = [];
  let release: Record<string, unknown> | null = null,
    failUpload = false;
  const gh: GhRunner = async (args, body) => {
    if (args[0] === "release") {
      writes.push(args);
      for (const path of args.slice(3, args.indexOf("--repo"))) {
        const content = await readFile(path);
        const id = assets.length + 100;
        const asset = {
          id,
          name: basename(path),
          state: "uploaded",
          size: content.length,
          digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
          uploader: { id: 4624827 },
        };
        assets.push(asset);
        contents.set(id, new Uint8Array(content));
        if (failUpload) {
          failUpload = false;
          throw Object.assign(new Error("temporary upload failure"), {
            code: "provider-unavailable",
          });
        }
      }
      return "";
    }
    if (args.includes("POST")) {
      writes.push(args);
      const request = JSON.parse(body!);
      release = {
        ...request,
        id: 88,
        author: { id: 4624827 },
        immutable: false,
        assets,
      };
      return JSON.stringify(release);
    }
    if (args.includes("PATCH")) {
      writes.push(args);
      release = { ...release, draft: false, immutable: true };
      return JSON.stringify(release);
    }
    if (args.includes("DELETE")) {
      writes.push(args);
      const id = Number(args[args.length - 1].split("/").pop());
      const index = olderReleases.findIndex((value) => value.id === id);
      if (index < 0) throw new Error("Unexpected deletion");
      olderReleases.splice(index, 1);
      return "";
    }
    if (args.includes("--slurp"))
      return JSON.stringify([
        release ? [release, ...olderReleases] : olderReleases,
      ]);
    if (args[1].includes("/git/ref/tags/"))
      return JSON.stringify({
        object: { type: "commit", sha: manifest.sourceSha },
      });
    if (args[1].endsWith("/releases/88")) return JSON.stringify(release);
    const older = olderReleases.find((value) =>
      args[1].endsWith(`/releases/${value.id}`),
    );
    if (older) return JSON.stringify(older);
    if (!release) throw Object.assign(new Error("not found"), { status: 404 });
    return JSON.stringify(release);
  };
  return {
    encoded,
    bundle,
    proof,
    writes,
    assets,
    contents,
    olderReleases,
    setUploadFailure: () => {
      failUpload = true;
    },
    getRelease: () => release,
    options: {
      runId: 42,
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
        TAVERNARY_PUBLISHER_BOT_ID: "4624827",
        TAVERNARY_IMMUTABLE_RELEASES_ENABLED: "true",
      },
      gh,
      load: async () => ({
        revision: "d".repeat(40),
        nowMs: Date.parse("2026-10-08T12:00:00.000Z"),
        deployments: [proof],
      }),
      loadBundle: async () => ({ runId: 42, bundle, archive: encoded.archive }),
      download: async (args: string[]) => {
        const id = Number(args[1].split("/").pop());
        for (const value of olderReleases)
          for (const asset of value.assets as typeof assets)
            if (asset.id === id)
              asset.download_count = (asset.download_count ?? 0) + 1;
        return contents.get(id)!;
      },
      isAncestor: () => true,
    },
  };
}
test("a publicly confirmed export is attached to a draft before publishing its immutable GitHub release", async () => {
  const data = input();
  expect(await retainGithubSiteBundle(data.options)).toMatchObject({
    status: "retained",
  });
  expect(data.assets.map((asset) => asset.name).sort()).toEqual([
    "bundle-proof.json",
    "site-bundle.tsb.gz",
  ]);
  expect(data.getRelease()).toMatchObject({ draft: false, immutable: true });
  const writeCount = data.writes.length;
  expect(await retainGithubSiteBundle(data.options)).toMatchObject({
    status: "already-retained",
  });
  expect(data.writes).toHaveLength(writeCount);
});
test("restore reads only a source-bound immutable Publisher release and verifies the complete compressed export", async () => {
  const data = input();
  await retainGithubSiteBundle(data.options);
  const before = data.writes.length;
  const loaded = await loadRetainedGithubSiteBundle({
    repository: data.options.env.GITHUB_REPOSITORY,
    publisherActorId: 4624827,
    releaseId: 88,
    currentMainSha: "d".repeat(40),
    nowMs: Date.parse("2026-10-08T12:00:00.000Z"),
    gh: data.options.gh,
    download: data.options.download,
    isAncestor: data.options.isAncestor,
  });
  expect(loaded.bundle.manifest).toEqual(data.bundle.manifest);
  expect(loaded.deployment).toEqual(data.proof);
  expect(data.writes).toHaveLength(before);
  data.contents.set(
    data.assets.find((asset) => asset.name === "site-bundle.tsb.gz")!.id,
    new Uint8Array([1, 2]),
  );
  await expect(
    loadRetainedGithubSiteBundle({
      repository: data.options.env.GITHUB_REPOSITORY,
      publisherActorId: 4624827,
      releaseId: 88,
      currentMainSha: "d".repeat(40),
      nowMs: Date.parse("2026-10-08T12:00:00.000Z"),
      gh: data.options.gh,
      download: data.options.download,
      isAncestor: data.options.isAncestor,
    }),
  ).rejects.toThrow();
});
test("pruning verified older releases tolerates changing GitHub download counters while keeping twelve monthly exports", async () => {
  const data = input();
  for (let index = 0; index < 17; index++) {
    const proof = {
      ...data.proof,
      workflowRunId: 41 - index,
      buildId: `run-${41 - index}-attempt-1`,
      confirmedAt: new Date(Date.UTC(2026, 8 - index, 8)).toISOString(),
    };
    const fixture = bundleFixture();
    fixture.manifest.buildId = proof.buildId;
    fixture.entries.find((entry) => entry.path === "revision.json")!.content =
      new TextEncoder().encode(JSON.stringify(fixture.manifest));
    const encoded = encodeSiteBundle(fixture);
    const proofBytes = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        deployment: proof,
        archiveDigest: encoded.archiveDigest,
      }),
    );
    const assets = [
      {
        id: 20000 + index * 2,
        name: "bundle-proof.json",
        state: "uploaded",
        size: proofBytes.length,
        digest: `sha256:${createHash("sha256").update(proofBytes).digest("hex")}`,
        uploader: { id: 4624827 },
        download_count: 0,
      },
      {
        id: 20001 + index * 2,
        name: "site-bundle.tsb.gz",
        state: "uploaded",
        size: encoded.archive.length,
        digest: encoded.archiveDigest,
        uploader: { id: 4624827 },
        download_count: 0,
      },
    ];
    data.contents.set(assets[0].id, proofBytes);
    data.contents.set(assets[1].id, encoded.archive);
    data.olderReleases.push({
      id: 101 + index,
      tag_name: `site-bundle-${proof.sourceSha}-${proof.buildId}`,
      target_commitish: proof.sourceSha,
      draft: false,
      immutable: true,
      author: { id: 4624827 },
      assets,
    });
  }
  expect(await retainGithubSiteBundle(data.options)).toHaveProperty(
    "status",
    "retained",
  );
  expect(data.writes.filter((args) => args.includes("DELETE"))).toHaveLength(6);
  expect(data.olderReleases.map((value) => value.id)).toEqual(
    Array.from({ length: 11 }, (_, index) => 101 + index),
  );
});
test("lost upload completion resumes the same draft without overwriting a verified asset or canonical proof", async () => {
  const data = input();
  data.setUploadFailure();
  await expect(retainGithubSiteBundle(data.options)).rejects.toThrow();
  expect(data.getRelease()).toMatchObject({ draft: true });
  expect(data.proof.status).toBe("confirmed");
  expect(await retainGithubSiteBundle(data.options)).toMatchObject({
    status: "retained",
  });
  expect(
    data.assets
      .map((asset) => asset.name)
      .filter((name) => name === "site-bundle.tsb.gz"),
  ).toHaveLength(1);
});
test("missing immutable-release setup and absent public proof cannot publish a restore bundle", async () => {
  const data = input();
  data.options.env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED = "false";
  await expect(retainGithubSiteBundle(data.options)).rejects.toThrow();
  expect(data.writes).toEqual([]);
  const unconfirmed = input();
  unconfirmed.proof.confirmation.essentialSmokePassed = false;
  await expect(retainGithubSiteBundle(unconfirmed.options)).rejects.toThrow();
  expect(unconfirmed.writes).toEqual([]);
});
