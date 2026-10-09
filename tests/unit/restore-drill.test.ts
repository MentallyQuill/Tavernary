import { expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import {
  prepareGithubRestoreDrill,
  loadRestoreDrillHealth,
} from "../../scripts/automation/restore-drill.mjs";

test("native drill recovery requires a completed current-main job and both restore and offline-browser steps", async () => {
  const repository = "MentallyQuill/Tavernary",
    revision = "f".repeat(40);
  const run = {
    id: 42,
    path: ".github/workflows/restore-drill.yml",
    event: "schedule",
    head_branch: "main",
    head_sha: revision,
    head_repository: { id: 1309605115, full_name: repository },
    status: "completed",
    conclusion: "success",
    updated_at: "2026-10-08T00:00:00Z",
  };
  const job = {
    name: "verify",
    status: "completed",
    conclusion: "success",
    steps: [
      "Restore the authenticated retained export into a clean workspace",
      "Verify restored behavior with all outbound browser requests blocked",
    ].map((name) => ({ name, conclusion: "success" })),
  };
  const input = {
    repository,
    revision,
    isAncestor: () => true,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    gh: async (args: string[]) => {
      if (args[1].includes("/workflows/"))
        return JSON.stringify({ workflow_runs: [run] });
      return JSON.stringify({ total_count: 1, jobs: [job] });
    },
  };
  expect(await loadRestoreDrillHealth(input)).toMatchObject({
    status: "recovered",
  });
  run.updated_at = "2026-09-01T00:00:00Z";
  expect(await loadRestoreDrillHealth(input)).toMatchObject({
    status: "active",
  });
  run.updated_at = "2026-10-08T00:00:00Z";
  job.steps[1].conclusion = "skipped";
  expect(await loadRestoreDrillHealth(input)).toMatchObject({
    status: "active",
  });
  run.head_repository.id++;
  await expect(loadRestoreDrillHealth(input)).rejects.toThrow(/custody/);
});
import {
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";

test("the weekly drill restores the exact retained export into a clean separate workspace", async () => {
  const encoded = encodeSiteBundle(bundleFixture());
  const bundle = decodeSiteBundle({
    archive: encoded.archive,
    archiveDigest: encoded.archiveDigest,
  });
  const deployment = {
    sourceSha: bundle.manifest.sourceSha,
    buildId: bundle.manifest.buildId,
    bundleDigest: bundle.manifest.buildDigest,
  };
  const root = await mkdtemp(join(tmpdir(), "tavernary-drill-test-"));
  let restoredDirectory: string | undefined;
  const repository = "MentallyQuill/Tavernary",
    revision = "f".repeat(40);
  const input = {
    root,
    env: {
      GITHUB_REPOSITORY: repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "schedule",
      GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/restore-drill.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: "123",
    },
    git: () => revision,
    readActive: () => ({ mode: "ordinary", deployment }),
    gh: async (args: string[]) => {
      expect(args).toEqual([
        "api",
        `repos/${repository}/releases/tags/site-bundle-${deployment.sourceSha}-${deployment.buildId}`,
      ]);
      return JSON.stringify({
        id: 88,
        author: { id: 123, type: "Bot" },
        draft: false,
        immutable: true,
      });
    },
    loadBundle: async () => ({ releaseId: 88, bundle, deployment }),
  };
  try {
    const result = await prepareGithubRestoreDrill(input);
    restoredDirectory = dirname(result.outputDirectory);
    expect(result).toMatchObject({
      releaseId: 88,
      sourceSha: bundle.manifest.sourceSha,
      archiveDigest: encoded.archiveDigest,
    });
    expect(await readFile(join(result.outputDirectory, "index.html"))).toEqual(
      Buffer.from(
        bundle.entries.find((entry) => entry.path === "index.html")!.content,
      ),
    );
    expect(
      await readFile(join(result.outputDirectory, "revision.json"), "utf8"),
    ).toContain(bundle.manifest.sourceSha);
    await expect(
      prepareGithubRestoreDrill({
        ...input,
        loadBundle: async () => ({
          releaseId: 88,
          bundle,
          deployment: { ...deployment, buildId: "run-999-attempt-1" },
        }),
      }),
    ).rejects.toThrow();
  } finally {
    if (restoredDirectory) {
      expect(
        restoredDirectory.startsWith(
          resolve(tmpdir(), "tavernary-restore-drill-"),
        ),
      ).toBe(true);
      await rm(restoredDirectory, { recursive: true, force: true });
    }
    await rm(root, { recursive: true, force: true });
  }
});
