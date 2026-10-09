import { expect, test, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runGithubSiteRestore } from "../../scripts/automation/restore-site-runtime.mjs";
import {
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";
const env = {
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR_ID: "2625904",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/restore-site.yml@refs/heads/main",
  TAVERNARY_PUBLISHER_BOT_ID: "4624827",
};
async function input() {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-restore-native-")),
    bundle = decodeSiteBundle(encodeSiteBundle(bundleFixture()));
  return {
    directory,
    bundle,
    options: {
      env,
      inputs: {
        release_id: "88",
        reason: "Restore verified site behavior",
        dry_run: "true",
      },
      outputDirectory: join(directory, "out"),
      git: () => "d".repeat(40),
      latestPublishable: () => "d".repeat(40),
      loadBundle: vi.fn(async () => ({ releaseId: 88, bundle })),
      readCurrent: vi.fn(async () => ({
        catalogDigest: bundle.manifest.catalogDigest,
        targetDigest: bundle.manifest.targetDigest,
        ownerTombstones: [] as string[],
      })),
    },
  };
}
test("the owner-only dry run verifies and restores exact data locally without authorizing a Pages mutation", async () => {
  const data = await input();
  try {
    expect(await runGithubSiteRestore(data.options)).toMatchObject({
      status: "verified",
      action: "verified",
      sourceSha: data.bundle.manifest.sourceSha,
    });
    expect(
      JSON.parse(
        await readFile(join(data.directory, "out/revision.json"), "utf8"),
      ),
    ).toEqual(data.bundle.manifest);
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});
test("an explicit restore still rechecks fresh canonical data and records an incompatible owner decision", async () => {
  const data = await input();
  try {
    data.options.inputs.dry_run = "false";
    data.options.readCurrent.mockResolvedValue({
      catalogDigest: "f".repeat(64),
      targetDigest: data.bundle.manifest.targetDigest,
      ownerTombstones: [],
    });
    expect(await runGithubSiteRestore(data.options)).toMatchObject({
      status: "rejected",
      decision: {
        action: "reject",
        reason: "canonical-data-changed",
        ownerDecisionRequired: true,
      },
    });
    await expect(
      readFile(join(data.directory, "out/index.html")),
    ).rejects.toThrow();
  } finally {
    await rm(data.directory, { recursive: true, force: true });
  }
});
test("foreign actor or changed main is rejected before reading any retained bundle", async () => {
  for (const variant of ["actor", "main"]) {
    const data = await input();
    try {
      const options = {
        ...data.options,
        env: {
          ...env,
          GITHUB_ACTOR_ID:
            variant === "actor" ? "4624827" : env.GITHUB_ACTOR_ID,
        },
        git: (args: string[]) =>
          variant === "main" && args.includes("origin/main")
            ? "e".repeat(40)
            : "d".repeat(40),
      };
      await expect(runGithubSiteRestore(options)).rejects.toThrow();
      expect(options.loadBundle).not.toHaveBeenCalled();
    } finally {
      await rm(data.directory, { recursive: true, force: true });
    }
  }
});
